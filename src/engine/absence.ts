import type {
  Device,
  Evidence,
  Expectation,
  Observation,
  Outage,
  Routine,
} from './types.ts'
import { signatureOf } from './routines.ts'
import {
  DAY,
  MIN,
  atMinute,
  clamp,
  clockLabel,
  dayLabel,
  minuteLabel,
  startOfLocalDay,
  weekday,
} from './time.ts'

/** Grace added past the learned window before anything is called missing. */
const GRACE_MIN = 10
/**
 * How far outside the window an occurrence still counts as off schedule rather
 * than missing, as a multiple of the learned tolerance.
 *
 * This applies on both sides. An event eleven minutes early is drift, not an
 * absence, and reporting it as "did not happen" would be exactly the kind of
 * false alarm that gets a system like this switched off. The window is two
 * standard deviations wide, so by construction about five percent of perfectly
 * normal occurrences fall outside it.
 */
const OFF_SCHEDULE_FACTOR = 3

export interface EvaluateOptions {
  /** Days back to evaluate, including today. */
  days: number
}

/**
 * Decide, for each learned routine on each recent day, whether the expected
 * event happened.
 *
 * The ordering of the checks is the whole argument of this project:
 *
 *   satisfied: the event is in the window, nothing to say
 *   late:      it happened, outside the window, and drift is information too
 *   pending:   the window has not closed, so saying nothing is correct
 *   uncertain: the covering devices were blind, so we report that we cannot tell
 *   missing:   the window closed, coverage was good, and nothing happened
 *
 * `missing` is last for a reason. Every cheaper explanation for silence is
 * eliminated before silence is treated as a finding.
 */
export function evaluateExpectations(
  routines: Routine[],
  observations: Observation[],
  outages: Outage[],
  devices: Device[],
  now: number,
  opts: EvaluateOptions = { days: 3 },
): Expectation[] {
  const today = startOfLocalDay(now)
  const out: Expectation[] = []

  const bySignature = new Map<string, Observation[]>()
  for (const o of observations) {
    const sig = signatureOf(o)
    const arr = bySignature.get(sig) ?? []
    arr.push(o)
    bySignature.set(sig, arr)
  }
  // An actorless view, so an unidentified person can still satisfy a routine
  // that was learned with a named actor, since Ring does not always resolve a face.
  const byKindZone = new Map<string, Observation[]>()
  for (const o of observations) {
    const key = `${o.kind}|${o.zone}`
    const arr = byKindZone.get(key) ?? []
    arr.push(o)
    byKindZone.set(key, arr)
  }

  for (let i = 0; i < opts.days; i++) {
    const dayStart = today - i * DAY
    const w = weekday(dayStart)

    for (const r of routines) {
      if (!r.weekdays.includes(w)) continue

      const expectedAt = atMinute(dayStart, r.expectedMinute)
      const windowStart = expectedAt - r.toleranceMin * MIN
      const windowEnd = expectedAt + r.toleranceMin * MIN
      const missingAfter = windowEnd + GRACE_MIN * MIN
      const lateHorizon = windowEnd + OFF_SCHEDULE_FACTOR * r.toleranceMin * MIN
      const earlyHorizon = windowStart - OFF_SCHEDULE_FACTOR * r.toleranceMin * MIN

      const exact = bySignature.get(r.signature) ?? []
      const loose = (byKindZone.get(`${r.kind}|${r.zone}`) ?? []).filter(
        (o) => !r.actor || !o.actor || o.actor === r.actor,
      )
      const candidates = exact.length ? exact : loose

      const inWindow = candidates.find((o) => o.ts >= windowStart && o.ts <= windowEnd)
      const offHit = candidates.find(
        (o) =>
          (o.ts > windowEnd && o.ts <= lateHorizon) ||
          (o.ts < windowStart && o.ts >= earlyHorizon && o.ts >= dayStart),
      )

      const coverage = coverageFor(r, devices, outages, windowStart, missingAfter)
      const streak = streakFor(r, bySignature, byKindZone, dayStart, devices, outages)

      const evidence: Evidence[] = []
      let status: Expectation['status']
      let satisfiedById: string | undefined
      let latenessMin: number | undefined

      if (inWindow) {
        status = 'satisfied'
        satisfiedById = inWindow.id
        evidence.push({
          type: 'window',
          epistemic: 'observed',
          text: `Recorded at ${clockLabel(inWindow.ts)}, inside the expected window.`,
          observationIds: [inWindow.id],
        })
      } else if (offHit) {
        status = 'late'
        satisfiedById = offHit.id
        latenessMin = Math.round((offHit.ts - expectedAt) / MIN)
        evidence.push({
          type: 'window',
          epistemic: 'observed',
          text: `Recorded at ${clockLabel(offHit.ts)}, ${Math.abs(latenessMin)} minutes ${
            latenessMin >= 0 ? 'later' : 'earlier'
          } than the learned time of ${minuteLabel(r.expectedMinute)}. It happened, just off schedule.`,
          observationIds: [offHit.id],
        })
      } else if (now < missingAfter) {
        status = 'pending'
        evidence.push({
          type: 'window',
          epistemic: 'expected',
          text: `The window runs to ${clockLabel(windowEnd)}. It has not closed, so nothing is wrong yet.`,
        })
      } else if (coverage.blindFraction > 0.4) {
        status = 'uncertain'
        evidence.push({
          type: 'coverage',
          epistemic: 'unknown',
          text: `${coverage.blindDevices.join(', ')} could not see for ${Math.round(
            coverage.blindFraction * 100,
          )}% of the window (${coverage.causes.join(', ')}). Absence cannot be established.`,
        })
      } else {
        status = 'missing'
        evidence.push({
          type: 'window',
          epistemic: 'expected',
          text: `Expected around ${minuteLabel(r.expectedMinute)}. Window ${clockLabel(
            windowStart,
          )} to ${clockLabel(windowEnd)} closed with no matching event.`,
        })
        evidence.push({
          type: 'coverage',
          epistemic: 'observed',
          text: `${coverage.coveringDevices.join(', ')} ${
            coverage.coveringDevices.length === 1 ? 'was' : 'were'
          } online for the whole window, so the silence is real rather than a gap in coverage.`,
        })
      }

      if (status === 'missing' || status === 'late' || status === 'uncertain') {
        evidence.push({
          type: 'prior',
          epistemic: 'observed',
          text: `Seen on ${r.observedDays} of the last ${r.eligibleDays} applicable days, median ${minuteLabel(
            r.expectedMinute,
          )}, spread ±${Math.round(r.driftMin)} min.`,
          observationIds: r.sampleIds.slice(-6),
        })
        if (streak > 0) {
          evidence.push({
            type: 'streak',
            epistemic: 'observed',
            text:
              status === 'missing'
                ? `This ends an unbroken run of ${streak} day${streak === 1 ? '' : 's'}.`
                : `The previous ${streak} day${streak === 1 ? '' : 's'} were on time.`,
          })
        }
        if (r.consequenceReason) {
          evidence.push({
            type: 'consequence',
            epistemic: 'expected',
            text: r.consequenceReason,
          })
        }
      }

      const severity = severityScore(r, status, streak, latenessMin)
      const confidence =
        status === 'uncertain'
          ? clamp(0.35 * (1 - coverage.blindFraction), 0.05, 0.4)
          : clamp(r.confidence * (0.75 + 0.25 * clamp(streak / 10, 0, 1)), 0, 0.99)

      out.push({
        id: `e_${r.id}_${dayStart}`,
        routineId: r.id,
        dayStart,
        expectedAt,
        windowStart,
        windowEnd,
        status,
        satisfiedById,
        latenessMin,
        streak,
        severity,
        confidence,
        coverageFraction: clamp(1 - coverage.blindFraction, 0, 1),
        witnesses: coverage.coveringDevices,
        evidence,
        epistemic:
          status === 'satisfied' || status === 'late'
            ? 'observed'
            : status === 'uncertain'
              ? 'unknown'
              : 'expected',
      })
    }
  }

  return out.sort((a, b) => b.severity - a.severity || a.expectedAt - b.expectedAt)
}

/** Devices that could have witnessed a routine, and how blind they were. */
function coverageFor(
  r: Routine,
  devices: Device[],
  outages: Outage[],
  from: number,
  to: number,
) {
  const covering = devices.filter((d) => d.zone === r.zone && d.emits.includes(r.kind))
  const span = Math.max(1, to - from)
  const blindDevices: string[] = []
  const causes = new Set<string>()
  let blindTotal = 0

  for (const d of covering) {
    let blind = 0
    for (const o of outages) {
      if (o.deviceId !== d.id) continue
      const overlap = Math.min(to, o.to) - Math.max(from, o.from)
      if (overlap > 0) {
        blind += overlap
        causes.add(o.cause.replace('_', ' '))
      }
    }
    if (blind > 0) blindDevices.push(d.name)
    blindTotal += blind / span
  }

  // If every covering device was blind for the window, the fraction approaches 1.
  const blindFraction = covering.length ? clamp(blindTotal / covering.length, 0, 1) : 1
  return {
    coveringDevices: covering.map((d) => d.name),
    blindDevices,
    causes: [...causes],
    blindFraction: covering.length === 0 ? 1 : blindFraction,
  }
}

/**
 * Consecutive applicable days before `dayStart` on which the routine held.
 *
 * Deliberately looser than the alerting window. "Was it on time today?" and
 * "how many days running has this happened?" are different questions: the
 * first is about punctuality and uses the learned ±2σ window, the second is
 * about whether the thing happened at all. Judging the run by the tight window
 * would score a normal five-percent tail of early arrivals as broken habits
 * and quietly understate how unusual today really is.
 */
const STREAK_TOLERANCE_FACTOR = 2.5


function streakFor(
  r: Routine,
  bySignature: Map<string, Observation[]>,
  byKindZone: Map<string, Observation[]>,
  dayStart: number,
  devices: Device[],
  outages: Outage[],
): number {
  const exact = bySignature.get(r.signature) ?? []
  const loose = byKindZone.get(`${r.kind}|${r.zone}`) ?? []
  const pool = exact.length ? exact : loose
  let streak = 0
  for (let i = 1; i <= 30; i++) {
    const d = dayStart - i * DAY
    if (!r.weekdays.includes(weekday(d))) continue
    const expectedAt = atMinute(d, r.expectedMinute)
    const span = r.toleranceMin * STREAK_TOLERANCE_FACTOR * MIN
    const lo = expectedAt - span
    const hi = expectedAt + span
    const hit = pool.some((o) => o.ts >= lo && o.ts <= hi)
    if (hit) {
      streak++
      continue
    }
    // A blind day neither extends nor breaks the run.
    const cov = coverageFor(r, devices, outages, lo, hi)
    if (cov.blindFraction > 0.4) continue
    break
  }
  return streak
}

/**
 * Rank what a person should look at first.
 *
 * Severity is not confidence. A near-certain missed cat visit should sit below
 * a less certain missed medication dose, so the care plan's `consequence`
 * dominates, modulated by how strong the statistical belief was.
 */
function severityScore(
  r: Routine,
  status: Expectation['status'],
  streak: number,
  latenessMin?: number,
): number {
  if (status === 'satisfied') return 0
  if (status === 'pending') return 2
  const belief = 0.55 + 0.45 * r.confidence
  const habit = 0.8 + 0.2 * clamp(streak / 14, 0, 1)
  if (status === 'late') {
    const drift = clamp(Math.abs(latenessMin ?? 0) / Math.max(30, r.toleranceMin * 3), 0, 1)
    return Math.round(clamp(100 * r.consequence * belief * drift * 0.5, 1, 45))
  }
  if (status === 'uncertain') {
    return Math.round(clamp(100 * r.consequence * 0.45, 1, 55))
  }
  return Math.round(clamp(100 * r.consequence * belief * habit, 1, 100))
}

export function expectationHeadline(e: Expectation, r: Routine, now: number): string {
  const when = dayLabel(e.dayStart, now)
  switch (e.status) {
    case 'missing':
      return `${r.label}: did not happen ${when.toLowerCase()}`
    case 'late':
      return `${r.label}: ${Math.abs(e.latenessMin ?? 0)} min ${
        (e.latenessMin ?? 0) >= 0 ? 'late' : 'early'
      }`
    case 'uncertain':
      return `${r.label}: no coverage, cannot tell`
    case 'pending':
      return `${r.label}: window still open`
    default:
      return `${r.label}: on time`
  }
}

/**
 * How one routine has fared across recent days.
 *
 * The single most convincing thing about an absence is the row of days it
 * breaks. Rather than describe that in a sentence, this returns the per-day
 * verdicts so a caller can draw them, and it does so by running the same
 * evaluator the live verdict comes from. There is deliberately no second,
 * looser history calculation that could disagree with the finding above it.
 */
export function routineHistory(
  routine: Routine,
  observations: Observation[],
  outages: Outage[],
  devices: Device[],
  now: number,
  days = 21,
): Expectation[] {
  return evaluateExpectations([routine], observations, outages, devices, now, { days }).sort(
    (a, b) => a.dayStart - b.dayStart,
  )
}
