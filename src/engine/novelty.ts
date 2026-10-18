import type { Novelty, NoveltyReason, Observation, Routine } from './types.ts'
import { signatureOf } from './routines.ts'
import { ZONE_NAME } from './labels.ts'
import {
  DAY,
  clamp,
  clockLabel,
  durationLabel,
  median,
  minuteOfDay,
  startOfLocalDay,
} from './time.ts'

/**
 * Memory intelligence's other half: things that happened which the last three
 * weeks do not account for.
 *
 * Novelty is scored against the household's own history, never against a global
 * notion of suspicious. A 3 AM back door is remarkable in a home where it has
 * never once happened and unremarkable in a home with a night-shift worker.
 */
export function findNovelties(
  observations: Observation[],
  routines: Routine[],
  satisfiedObservationIds: Set<string>,
  now: number,
  lookbackDays = 21,
): Novelty[] {
  const today = startOfLocalDay(now)
  const histStart = today - lookbackDays * DAY

  const history = observations.filter((o) => o.ts < today && o.ts >= histStart)
  const todays = observations.filter((o) => o.ts >= today && o.ts <= now)

  const sigCounts = new Map<string, number>()
  const sigMinutes = new Map<string, number[]>()
  const sigDurations = new Map<string, number[]>()
  const sigDailyMax = new Map<string, number>()
  const zoneMinutes = new Map<string, number[]>()

  const perDay = new Map<string, Set<number>>()
  for (const o of history) {
    const sig = signatureOf(o)
    sigCounts.set(sig, (sigCounts.get(sig) ?? 0) + 1)
    sigMinutes.set(sig, [...(sigMinutes.get(sig) ?? []), minuteOfDay(o.ts)])
    if (o.durationS !== undefined) {
      sigDurations.set(sig, [...(sigDurations.get(sig) ?? []), o.durationS])
    }
    zoneMinutes.set(o.zone, [...(zoneMinutes.get(o.zone) ?? []), minuteOfDay(o.ts)])
    const key = `${sig}@${startOfLocalDay(o.ts)}`
    const s = perDay.get(sig) ?? new Set<number>()
    s.add(startOfLocalDay(o.ts))
    perDay.set(sig, s)
    void key
  }
  // Highest number of same-signature events seen on any single historical day.
  for (const [sig] of sigCounts) {
    const days = perDay.get(sig)?.size ?? 1
    sigDailyMax.set(sig, Math.max(1, Math.ceil((sigCounts.get(sig) ?? 1) / days) + 1))
  }

  const routineSignatures = new Set(routines.map((r) => r.signature))
  const todayCount = new Map<string, number>()
  const out: Novelty[] = []

  for (const o of todays) {
    const sig = signatureOf(o)
    todayCount.set(sig, (todayCount.get(sig) ?? 0) + 1)

    // Anything that satisfied an expectation is, by definition, not novel.
    if (satisfiedObservationIds.has(o.id)) continue

    const reasons: NoveltyReason[] = []
    let rarity = 0
    const priorCount = sigCounts.get(sig) ?? 0

    if (priorCount === 0) {
      reasons.push('unseen_signature')
      rarity = Math.max(rarity, 0.8)
    }

    const minute = minuteOfDay(o.ts)
    const zoneHours = zoneMinutes.get(o.zone) ?? []
    const nearby = zoneHours.filter((m) => Math.abs(m - minute) <= 90).length
    if (zoneHours.length >= 8 && nearby === 0) {
      reasons.push('unusual_hour')
      rarity = Math.max(rarity, 0.75)
    }

    // A zone can be busy at an hour while the particular person doing the thing
    // has never once done it then. The caregiver at the front door is ordinary;
    // the caregiver at the front door at a quarter to eight in the evening,
    // eleven hours after his window, is not, and a purely zone-based test
    // would miss it entirely because the front door sees traffic all day.
    const sigMins = sigMinutes.get(sig) ?? []
    if (o.actor && priorCount >= 5 && sigMins.every((m) => Math.abs(m - minute) > 120)) {
      reasons.push('unusual_hour_for_actor')
      rarity = Math.max(rarity, 0.72)
    }

    if (o.durationS !== undefined) {
      const durs = sigDurations.get(sig) ?? []
      const zoneDurs = durs.length
        ? durs
        : history.filter((h) => h.zone === o.zone && h.durationS !== undefined).map((h) => h.durationS!)
      if (zoneDurs.length >= 5) {
        const med = median(zoneDurs)
        if (med > 0 && o.durationS > med * 3) {
          reasons.push('unusual_dwell')
          rarity = Math.max(rarity, clamp(0.4 + o.durationS / (med * 20), 0.4, 0.9))
        }
      }
    }

    const cap = sigDailyMax.get(sig) ?? 2
    if (priorCount > 0 && (todayCount.get(sig) ?? 0) > cap) {
      reasons.push('unusual_frequency')
      rarity = Math.max(rarity, 0.55)
    }

    if (reasons.length === 0) continue
    // Known routine traffic at a normal hour is background, not news, but an
    // off-hours instance of a routine signature is precisely the news.
    const offHours =
      reasons.includes('unusual_hour') || reasons.includes('unusual_hour_for_actor')
    if (routineSignatures.has(sig) && !offHours) continue

    out.push({
      id: `n_${o.id}`,
      observationId: o.id,
      reasons,
      rarity: clamp(rarity, 0, 1),
      text: noveltyText(o, reasons, priorCount),
    })
  }

  return collapseNearby(
    out.sort((a, b) => b.rarity - a.rarity || a.observationId.localeCompare(b.observationId)),
    observations,
  )
}

/**
 * One event trips several sensors. A patio door opening also wakes the patio
 * camera, and reporting both as separate discoveries makes the system look like
 * it cannot count. Keep the strongest novelty per zone per twelve minutes.
 */
function collapseNearby(novelties: Novelty[], observations: Observation[]): Novelty[] {
  const byId = new Map(observations.map((o) => [o.id, o]))
  const kept: Novelty[] = []
  for (const n of novelties) {
    const o = byId.get(n.observationId)
    if (!o) continue
    const shadowed = kept.some((k) => {
      const ko = byId.get(k.observationId)
      return !!ko && ko.zone === o.zone && Math.abs(ko.ts - o.ts) <= 12 * 60_000
    })
    if (!shadowed) kept.push(n)
  }
  return kept
}

function noveltyText(o: Observation, reasons: NoveltyReason[], priorCount: number): string {
  const where = ZONE_NAME[o.zone].toLowerCase()
  const who = o.actor && o.actor !== 'unknown' ? o.actor : 'Someone unrecognised'
  const parts: string[] = []
  if (reasons.includes('unseen_signature')) {
    parts.push(`${who} at the ${where}, nothing like this in the last three weeks`)
  } else {
    parts.push(`${who} at the ${where} at ${clockLabel(o.ts)}`)
  }
  if (reasons.includes('unusual_hour')) {
    parts.push(`the ${where} has never recorded activity at this hour`)
  }
  if (reasons.includes('unusual_hour_for_actor') && o.actor) {
    parts.push(
      `${o.actor} has been seen here on most days, but never once at ${clockLabel(o.ts)}`,
    )
  }
  if (reasons.includes('unusual_dwell') && o.durationS) {
    parts.push(`stayed ${durationLabel(o.durationS)}`)
  }
  if (reasons.includes('unusual_frequency')) {
    parts.push(`more often today than on any day on record (${priorCount} prior in three weeks)`)
  }
  return parts.join('; ') + '.'
}
