import type { Household, Observation, Outage, Routine, WorldState } from './types.ts'
import { learnRoutines } from './routines.ts'
import { evaluateExpectations } from './absence.ts'
import { findNovelties } from './novelty.ts'
import { correlate } from './correlate.ts'
import { DEMO_NOW, HOUSEHOLD, buildHistory, buildOutages } from './scenario.ts'

export * from './types.ts'
export * from './time.ts'
export * from './labels.ts'
export { learnRoutines, routineBasis, signatureOf, DEFAULT_LEARN } from './routines.ts'
export { evaluateExpectations, expectationHeadline, routineHistory } from './absence.ts'
export { findNovelties } from './novelty.ts'
export { correlate } from './correlate.ts'
export { ask, SUGGESTED_QUESTIONS } from './reason.ts'
export { buildDayReport, buildFindingsCsv, reportFilename, reportHeadline } from './report.ts'
export { escalations, describeEscalation, ACK_REASONS } from './escalate.ts'
export type { Notification } from './escalate.ts'
export type { Answer, AnswerCard, Intent } from './reason.ts'
export {
  DEMO_NOW,
  DEVICES,
  HOUSEHOLD,
  CARE_PROFILE,
  HISTORY_DAYS,
  buildHistory,
  buildOutages,
  INJECTABLE,
} from './scenario.ts'
export type { InjectableEvent } from './scenario.ts'

export interface WorldInput {
  now?: number
  household?: Household
  observations?: Observation[]
  outages?: Outage[]
  /**
   * Per-routine overrides of how much a household says an event matters,
   * keyed by routine id. The engine learns *what* recurs; only a person can
   * say what it costs when it does not. Changing one of these re-ranks every
   * finding immediately, which is the point.
   */
  consequenceOverrides?: Record<string, number>
  /**
   * Routines learned on a previous pass. Learning depends only on the
   * observation set and the calendar day, so while the user drags the clock
   * through a single day there is nothing to re-learn and this lets the
   * scrub stay at frame rate.
   */
  routines?: Routine[]
}

/**
 * The whole pipeline, in dependency order.
 *
 *   observations  ->  routines      (what normally happens here)
 *                 ->  expectations  (did today's instances happen?)
 *                 ->  novelties     (what happened that history cannot explain?)
 *                 ->  correlations  (how do those findings relate?)
 *
 * It is a pure function of the observation set, which is what makes the Ring
 * simulator useful rather than decorative: inject an event, recompute, and
 * every downstream verdict moves because the inference genuinely re-ran.
 */
export function buildWorld(input: WorldInput = {}): WorldState {
  const now = input.now ?? DEMO_NOW
  const household = input.household ?? HOUSEHOLD
  const observations = [...(input.observations ?? buildHistory(now))].sort((a, b) => a.ts - b.ts)
  const outages = input.outages ?? buildOutages(now)

  const learned = input.routines ?? learnRoutines(observations, now, household.careProfile)
  const overrides = input.consequenceOverrides
  const routines = overrides
    ? learned.map((r) =>
        overrides[r.id] !== undefined ? { ...r, consequence: overrides[r.id] } : r,
      )
    : learned
  const expectations = evaluateExpectations(
    routines,
    observations,
    outages,
    household.devices,
    now,
    { days: 8 },
  )

  const satisfiedIds = new Set(
    expectations.filter((e) => e.satisfiedById).map((e) => e.satisfiedById!),
  )
  const novelties = findNovelties(observations, routines, satisfiedIds, now)
  const correlations = correlate(expectations, novelties, routines, observations, now)

  return { household, now, observations, outages, routines, expectations, novelties, correlations }
}

/** Convenience selectors used across all three surfaces. */
export function todaysExpectations(w: WorldState) {
  const today = new Date(w.now)
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return w.expectations.filter((e) => e.dayStart === dayStart)
}

export function openFindings(w: WorldState) {
  return todaysExpectations(w).filter(
    (e) => e.status === 'missing' || e.status === 'late' || e.status === 'uncertain',
  )
}

export function routineOf(w: WorldState, routineId: string) {
  return w.routines.find((r) => r.id === routineId)
}

export function observationOf(w: WorldState, id: string | undefined) {
  return id ? w.observations.find((o) => o.id === id) : undefined
}

/**
 * A day's departure from normal, for any of the recent days the evaluator
 * covers. Today also folds in unexplained events; earlier days are scored on
 * their expectations alone, because novelty is only computed for today.
 */
export function departureFor(w: WorldState, dayStart: number): number {
  const day = w.expectations.filter((e) => e.dayStart === dayStart)
  if (!day.length) return 0
  return Math.round(Math.min(100, Math.max(0, ...day.map((e) => e.severity))))
}

/** The last `days` days, oldest first, for the context strip. */
export function recentDays(w: WorldState, days = 7) {
  const today = new Date(w.now)
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const out: { dayStart: number; departure: number; missing: number; uncertain: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = todayStart - i * 86_400_000
    const day = w.expectations.filter((e) => e.dayStart === dayStart)
    if (!day.length) continue
    out.push({
      dayStart,
      departure: departureFor(w, dayStart),
      missing: day.filter((e) => e.status === 'missing').length,
      uncertain: day.filter((e) => e.status === 'uncertain').length,
    })
  }
  return out
}

/** 0..100. How much of today departs from the household's own normal. */
export function dayDeparture(w: WorldState): number {
  const today = todaysExpectations(w)
  if (!today.length) return 0
  const worst = Math.max(0, ...today.map((e) => e.severity))
  const noveltyPush = Math.max(0, ...w.novelties.map((n) => n.rarity * 55), 0)
  return Math.round(Math.min(100, Math.max(worst, noveltyPush)))
}
