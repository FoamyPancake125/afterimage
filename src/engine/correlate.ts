import type { Correlation, Expectation, Novelty, Observation, Routine } from './types.ts'
import { signatureOf } from './routines.ts'
import { ZONE_NAME } from './labels.ts'
import { DAY, HOUR, MIN, atMinute, clamp, clockLabel, startOfLocalDay, stddev, weekday } from './time.ts'

const ADJACENT: Record<string, string[]> = {
  front_door: ['driveway', 'hallway'],
  driveway: ['front_door'],
  back_patio: ['kitchen'],
  kitchen: ['back_patio', 'hallway', 'medicine_cabinet'],
  hallway: ['kitchen', 'front_door', 'medicine_cabinet'],
  medicine_cabinet: ['kitchen', 'hallway'],
}

/**
 * Relationship intelligence.
 *
 * A list of independent findings makes a person read. Findings linked to each
 * other make a person understand a morning. Every link carries the statistical
 * `basis` that produced it, so a human can disagree with the machine on the
 * evidence rather than on vibes.
 */
export function correlate(
  expectations: Expectation[],
  novelties: Novelty[],
  routines: Routine[],
  observations: Observation[],
  now: number,
): Correlation[] {
  const byId = new Map(observations.map((o) => [o.id, o]))
  const routineById = new Map(routines.map((r) => [r.id, r]))
  const today = startOfLocalDay(now)
  const out: Correlation[] = []

  const todays = expectations.filter((e) => e.dayStart === today)
  const absent = todays.filter((e) => e.status === 'missing')
  const offPattern = todays.filter((e) => e.status === 'missing' || e.status === 'late')

  // 1. Preconditions. One absence genuinely explains another.
  for (const cause of absent) {
    for (const effect of absent) {
      if (cause.id === effect.id) continue
      const rc = routineById.get(cause.routineId)
      const re = routineById.get(effect.routineId)
      if (!rc || !re) continue
      const gap = re.expectedMinute - rc.expectedMinute
      if (gap <= 0 || gap > 180) continue

      const link = coupling(rc, re, observations, now)
      if (link.days < 4 || link.rate < 0.7) continue
      // The decisive test. If the effect's timing tracks the cause more tightly
      // than it tracks the clock, the two are coupled rather than merely both
      // being daily habits. Without this check every pair of daily routines
      // looks causal, which is how absence detection turns into superstition.
      if (link.couplingSd > Math.max(4, 0.7 * re.driftMin)) continue

      out.push({
        id: `c_pre_${cause.id}_${effect.id}`,
        kind: 'precondition',
        expectationIds: [cause.id, effect.id],
        noveltyIds: [],
        strength: clamp(link.rate * Math.min(cause.confidence, effect.confidence) + 0.08, 0, 0.97),
        hypothesis: `No ${rc.shortLabel} today. Most likely why there was no ${re.shortLabel}.`,
        basis:
          `On ${link.hits} of ${link.days} days where both applied, it followed within ` +
          `${Math.round(link.medianGapMin)} min of it, varying by only ±${link.couplingSd.toFixed(
            1,
          )} min, far tighter than its ±${Math.round(re.driftMin)} min spread against the clock. ` +
          `Today neither was recorded.`,
      })
    }
  }

  // 2. Substitution. The usual person is missing, but somebody did the thing.
  for (const e of absent) {
    const r = routineById.get(e.routineId)
    if (!r?.actor) continue
    const stand = observations.find(
      (o) =>
        o.ts >= e.windowStart - 2 * r.toleranceMin * MIN &&
        o.ts <= e.windowEnd + 2 * r.toleranceMin * MIN &&
        o.zone === r.zone &&
        o.kind === r.kind &&
        o.actor !== r.actor,
    )
    if (!stand) continue
    out.push({
      id: `c_sub_${e.id}`,
      kind: 'substitution',
      expectationIds: [e.id],
      noveltyIds: novelties.filter((n) => n.observationId === stand.id).map((n) => n.id),
      strength: 0.55,
      hypothesis: `Someone other than ${r.actor} may have covered the ${r.shortLabel} at ${clockLabel(stand.ts)}.`,
      basis: `${ZONE_NAME[r.zone]} recorded a matching event inside the extended window, but the identity did not resolve to ${r.actor}.`,
    })
  }

  // 3. Coincidence. An unexplained event sits near a broken expectation.
  //    Capped at the single strongest pairing per unexplained event, because a
  //    novelty paired against every finding of the day is noise wearing a suit.
  for (const n of novelties) {
    const o = byId.get(n.observationId)
    if (!o || n.rarity < 0.7) continue
    let best: Correlation | undefined
    for (const e of offPattern) {
      const r = routineById.get(e.routineId)
      if (!r) continue
      if (o.zone !== r.zone && !(ADJACENT[o.zone] ?? []).includes(r.zone)) continue
      const dt = Math.abs(o.ts - e.expectedAt)
      if (dt > 6 * HOUR) continue
      const strength = clamp(0.3 * (1 - dt / (6 * HOUR)) + 0.35 * n.rarity, 0, 0.8)
      if (best && best.strength >= strength) continue
      const before = o.ts < e.windowStart
      best = {
        id: `c_co_${n.id}_${e.id}`,
        kind: 'coincidence',
        expectationIds: [e.id],
        noveltyIds: [n.id],
        strength,
        hypothesis: before
          ? `The ${clockLabel(o.ts)} event came ${hoursApart(e.expectedAt - o.ts)} before the ${r.shortLabel} went off pattern.`
          : `The ${clockLabel(o.ts)} event and the off-pattern ${r.shortLabel} fell on the same day.`,
        basis:
          `Both touch the ${ZONE_NAME[o.zone].toLowerCase()}, ${hoursApart(dt)} apart. ` +
          `This pairing has no precedent in the learned history, so it is offered as a question, not a conclusion.`,
      }
    }
    if (best) out.push(best)
  }

  // 4. Unexplained events that cluster with each other across zones.
  const rare = novelties.filter((n) => n.reasons.includes('unseen_signature'))
  for (let i = 0; i < rare.length; i++) {
    for (let j = i + 1; j < rare.length; j++) {
      const a = byId.get(rare[i].observationId)
      const b = byId.get(rare[j].observationId)
      if (!a || !b || a.zone === b.zone) continue
      const dt = Math.abs(a.ts - b.ts)
      if (dt > 6 * HOUR) continue
      if (!(ADJACENT[a.zone] ?? []).includes(b.zone)) continue
      out.push({
        id: `c_cl_${rare[i].id}_${rare[j].id}`,
        kind: 'cascade',
        expectationIds: [],
        noveltyIds: [rare[i].id, rare[j].id],
        strength: clamp(0.3 + 0.4 * (1 - dt / (6 * HOUR)), 0, 0.75),
        hypothesis: `Two unfamiliar presences ${hoursApart(dt)} apart, at the ${ZONE_NAME[
          a.zone
        ].toLowerCase()} and the ${ZONE_NAME[b.zone].toLowerCase()}.`,
        basis:
          'Neither signature appears anywhere in the last twenty-one days, and the two zones overlap. ' +
          'They may well be unrelated; they are grouped because they are the only unexplained presences of the day.',
      })
    }
  }

  return dedupe(out).sort((a, b) => b.strength - a.strength)
}

/**
 * How tightly did routine `b` historically follow routine `a`?
 *
 * `rate` is how often it followed at all. `couplingSd` is the spread of the gap
 * between them, and is the number that matters: a small spread means `b` is
 * timed off `a`, a large one means both merely happen daily.
 */
function coupling(
  a: Routine,
  b: Routine,
  observations: Observation[],
  now: number,
): { rate: number; hits: number; days: number; couplingSd: number; medianGapMin: number } {
  const today = startOfLocalDay(now)
  const pool = new Map<string, Observation[]>()
  for (const o of observations) {
    const sig = signatureOf(o)
    pool.set(sig, [...(pool.get(sig) ?? []), o])
  }
  const aObs = pool.get(a.signature) ?? []
  const bObs = pool.get(b.signature) ?? []
  const gapMs = (b.expectedMinute - a.expectedMinute + 45) * MIN

  let days = 0
  let hits = 0
  const gaps: number[] = []

  for (let i = 1; i <= 21; i++) {
    const d = today - i * DAY
    const w = weekday(d)
    if (!a.weekdays.includes(w) || !b.weekdays.includes(w)) continue
    const centre = atMinute(d, a.expectedMinute)
    const aHit = aObs.find(
      (o) => o.ts >= centre - a.toleranceMin * MIN && o.ts <= centre + a.toleranceMin * MIN,
    )
    if (!aHit) continue
    days++
    const bHit = bObs.find((o) => o.ts > aHit.ts && o.ts <= aHit.ts + gapMs)
    if (bHit) {
      hits++
      gaps.push((bHit.ts - aHit.ts) / MIN)
    }
  }

  const medianGapMin = gaps.length
    ? [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)]
    : 0
  return {
    rate: days ? hits / days : 0,
    hits,
    days,
    couplingSd: gaps.length >= 2 ? stddev(gaps) : Number.POSITIVE_INFINITY,
    medianGapMin,
  }
}

function hoursApart(dt: number): string {
  if (dt < 90 * MIN) return `${Math.max(1, Math.round(dt / MIN))} minutes`
  return `${Math.round(dt / HOUR)} hours`
}

function dedupe(cs: Correlation[]): Correlation[] {
  const seen = new Set<string>()
  const out: Correlation[] = []
  for (const c of cs) {
    const key = [c.kind, ...[...c.expectationIds].sort(), ...[...c.noveltyIds].sort()].join('~')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
}

