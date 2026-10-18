import type { ObservationKind, Zone, Epistemic, CorrelationKind, NoveltyReason } from './types.ts'

export const ZONE_NAME: Record<Zone, string> = {
  front_door: 'Front door',
  driveway: 'Driveway',
  back_patio: 'Back patio',
  kitchen: 'Kitchen',
  hallway: 'Hallway',
  medicine_cabinet: 'Medicine cabinet',
}

export const KIND_NAME: Record<ObservationKind, string> = {
  motion: 'Motion',
  doorbell: 'Doorbell press',
  person: 'Person',
  vehicle: 'Vehicle',
  package: 'Package',
  pet: 'Animal',
  door_open: 'Door opened',
  cabinet_open: 'Cabinet opened',
  lock: 'Deadbolt locked',
}

/** Verb phrases used to turn a learned signature into an English sentence. */
export const KIND_PHRASE: Record<ObservationKind, string> = {
  motion: 'moves through',
  doorbell: 'rings the doorbell at',
  person: 'is seen at',
  vehicle: 'parks in',
  package: 'is delivered to',
  pet: 'appears on',
  door_open: 'opens the door at',
  cabinet_open: 'opens',
  lock: 'locks',
}

export const EPISTEMIC_NAME: Record<Epistemic, string> = {
  observed: 'Observed',
  expected: 'Expected',
  unknown: 'Unknown',
}

export const EPISTEMIC_BLURB: Record<Epistemic, string> = {
  observed: 'A device recorded this. There is evidence.',
  expected: 'A learned routine says this should have happened. No device recorded it.',
  unknown: 'No device could see. AFTERIMAGE will not guess.',
}

export const CORRELATION_NAME: Record<CorrelationKind, string> = {
  precondition: 'Precondition',
  cascade: 'Cascade',
  coincidence: 'Coincidence',
  substitution: 'Substitution',
}

export const NOVELTY_NAME: Record<NoveltyReason, string> = {
  unseen_signature: 'never seen before',
  unusual_hour: 'unusual hour',
  unusual_hour_for_actor: 'unusual hour for this person',
  unusual_dwell: 'unusually long',
  unusual_frequency: 'unusually frequent',
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayMaskLabel(days: number[]): string {
  const set = new Set(days)
  if (set.size === 7) return 'Every day'
  const weekdays = [1, 2, 3, 4, 5]
  if (weekdays.every((d) => set.has(d)) && set.size === 5) return 'Weekdays'
  if (set.size === 6 && !set.has(0)) return 'Mon to Sat'
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends'
  return [...set]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ')
}
