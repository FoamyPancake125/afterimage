import type { CareProfileEntry, Observation, Routine } from './types.ts'
import { KIND_PHRASE, ZONE_NAME, weekdayMaskLabel } from './labels.ts'
import {
  DAY,
  clamp,
  median,
  minuteOfDay,
  startOfLocalDay,
  stddev,
  weekday,
  minuteLabel,
} from './time.ts'

export interface LearnOptions {
  /** How many whole days of history to learn from. */
  lookbackDays: number
  /** Minimum fraction of eligible days on which the event must appear. */
  minSupport: number
  /** Minimum absolute number of days observed. */
  minDays: number
  /** Gap, in minutes, that splits one signature into separate time-of-day routines. */
  clusterGapMin: number
  /**
   * Largest spread, in minutes, that still counts as a routine.
   *
   * This is a product decision expressed as a threshold. An event you can only
   * place inside a two-hour window is not something a household can act on, and
   * flagging its absence would generate noise rather than information. Raising
   * this number is the fastest way to make AFTERIMAGE untrustworthy.
   */
  maxDriftMin: number
}

export const DEFAULT_LEARN: LearnOptions = {
  lookbackDays: 21,
  minSupport: 0.6,
  minDays: 4,
  clusterGapMin: 100,
  maxDriftMin: 30,
}

export function signatureOf(o: Pick<Observation, 'kind' | 'zone' | 'actor'>): string {
  return `${o.kind}|${o.zone}|${o.actor ?? '*'}`
}

interface Occurrence {
  id: string
  dayStart: number
  minute: number
  weekday: number
}

/**
 * Learn recurring expectations from raw observations.
 *
 * The learner is deliberately conservative. It would rather miss a routine than
 * invent one, because every routine it emits becomes something the household
 * can be woken up about. Three guards do that work:
 *
 *   1. Time-of-day clustering, so "the caregiver arrives" and "the caregiver
 *      leaves" are learned as two separate expectations rather than one blur.
 *   2. A per-weekday eligibility test, so a weekday-only routine is never
 *      marked missing on a Sunday.
 *   3. A support floor, so the neighbour's cat wandering past at loosely
 *      similar times never becomes something anyone is notified about.
 *
 * `excludeDayStart` keeps the day under evaluation out of its own training set.
 */
export function learnRoutines(
  observations: Observation[],
  now: number,
  careProfile: CareProfileEntry[],
  opts: LearnOptions = DEFAULT_LEARN,
): Routine[] {
  const today = startOfLocalDay(now)
  const windowStart = today - opts.lookbackDays * DAY

  // Days available for learning: full days before today, inside the lookback.
  const eligibleDayStarts: number[] = []
  for (let d = windowStart; d < today; d += DAY) eligibleDayStarts.push(d)
  const eligibleByWeekday = new Map<number, number>()
  for (const d of eligibleDayStarts) {
    const w = weekday(d)
    eligibleByWeekday.set(w, (eligibleByWeekday.get(w) ?? 0) + 1)
  }

  const bySignature = new Map<string, Occurrence[]>()
  for (const o of observations) {
    if (o.ts >= today || o.ts < windowStart) continue
    const sig = signatureOf(o)
    const arr = bySignature.get(sig) ?? []
    arr.push({
      id: o.id,
      dayStart: startOfLocalDay(o.ts),
      minute: minuteOfDay(o.ts),
      weekday: weekday(o.ts),
    })
    bySignature.set(sig, arr)
  }

  const routines: Routine[] = []

  for (const [sig, occs] of bySignature) {
    const [kind, zone, actorRaw] = sig.split('|')
    const actor = actorRaw === '*' ? undefined : actorRaw

    for (const cluster of clusterByTimeOfDay(occs, opts.clusterGapMin)) {
      // Which weekdays does this cluster actually belong to?
      const seenByWeekday = new Map<number, Set<number>>()
      for (const o of cluster) {
        const set = seenByWeekday.get(o.weekday) ?? new Set<number>()
        set.add(o.dayStart)
        seenByWeekday.set(o.weekday, set)
      }
      const weekdays: number[] = []
      for (const [w, elig] of eligibleByWeekday) {
        const seen = seenByWeekday.get(w)?.size ?? 0
        if (elig > 0 && seen / elig >= 0.5) weekdays.push(w)
      }
      if (weekdays.length === 0) continue
      weekdays.sort((a, b) => a - b)

      const mask = new Set(weekdays)
      const inMask = cluster.filter((o) => mask.has(o.weekday))
      const observedDays = new Set(inMask.map((o) => o.dayStart)).size
      const eligibleDays = eligibleDayStarts.filter((d) => mask.has(weekday(d))).length
      if (eligibleDays === 0) continue

      const support = observedDays / eligibleDays
      if (support < opts.minSupport || observedDays < opts.minDays) continue

      const minutes = inMask.map((o) => o.minute)
      const expectedMinute = median(minutes)
      const driftMin = stddev(minutes)
      if (driftMin > opts.maxDriftMin) continue
      const toleranceMin = clamp(2 * driftMin, 15, 60)
      const tightness = clamp(1 - driftMin / 60, 0.25, 1)
      const confidence = clamp(support * (0.6 + 0.4 * tightness), 0, 0.99)

      const care = matchCare(careProfile, sig, expectedMinute)
      const label =
        care?.label ??
        defaultLabel(kind as Routine['kind'], zone as Routine['zone'], actor, expectedMinute)
      const routine: Routine = {
        id: `r_${sig.replace(/[^a-z0-9]+/gi, '_')}_${Math.round(expectedMinute)}`,
        signature: sig,
        label,
        shortLabel: care?.shortLabel ?? label.toLowerCase(),
        kind: kind as Routine['kind'],
        zone: zone as Routine['zone'],
        actor,
        expectedMinute,
        toleranceMin,
        weekdays,
        observedDays,
        eligibleDays,
        support,
        driftMin,
        confidence,
        consequence: care?.consequence ?? 0.35,
        consequenceReason: care?.reason,
        sampleIds: inMask.map((o) => o.id),
      }
      routines.push(routine)
    }
  }

  return routines.sort((a, b) => a.expectedMinute - b.expectedMinute)
}

/**
 * Split a signature's occurrences into time-of-day clusters. One pass over the
 * sorted minutes, cutting wherever the gap exceeds `gapMin`.
 */
function clusterByTimeOfDay(occs: Occurrence[], gapMin: number): Occurrence[][] {
  const sorted = [...occs].sort((a, b) => a.minute - b.minute)
  const clusters: Occurrence[][] = []
  let current: Occurrence[] = []
  let prev: number | null = null
  for (const o of sorted) {
    if (prev !== null && o.minute - prev > gapMin) {
      clusters.push(current)
      current = []
    }
    current.push(o)
    prev = o.minute
  }
  if (current.length) clusters.push(current)
  return clusters
}

function matchCare(
  profile: CareProfileEntry[],
  signature: string,
  expectedMinute: number,
): CareProfileEntry | undefined {
  return profile.find((entry) => {
    if (!signature.startsWith(entry.match)) return false
    if (entry.nearMinute === undefined) return true
    return Math.abs(expectedMinute - entry.nearMinute) <= 75
  })
}

function defaultLabel(
  kind: Routine['kind'],
  zone: Routine['zone'],
  actor: string | undefined,
  expectedMinute: number,
): string {
  const who = actor ?? 'Someone'
  const phrase = KIND_PHRASE[kind]
  const where = ZONE_NAME[zone].toLowerCase()
  return `${who} ${phrase} the ${where}, around ${minuteLabel(expectedMinute)}`
}

/** One-line description of the statistical belief behind a routine. */
export function routineBasis(r: Routine): string {
  return `${weekdayMaskLabel(r.weekdays).toLowerCase()}, ${r.observedDays} of ${r.eligibleDays} days, ${minuteLabel(
    r.expectedMinute,
  )} ±${Math.round(r.toleranceMin)} min`
}
