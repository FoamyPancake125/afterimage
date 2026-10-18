/**
 * AFTERIMAGE core domain types.
 *
 * The whole system turns on one distinction that most monitoring software does
 * not make: every statement it produces is tagged with how it is known.
 *
 *   observed: a sensor recorded it. We have evidence.
 *   expected: a learned routine says it should have happened.
 *   unknown:  we had no coverage. We are not allowed to guess.
 *
 * Keeping `unknown` a first-class value is what separates an absence detector
 * from an alarm generator. A camera that was offline produces silence, and
 * silence must never be reported as an absence.
 */
export type Epistemic = 'observed' | 'expected' | 'unknown'

export type ObservationKind =
  | 'motion'
  | 'doorbell'
  | 'person'
  | 'vehicle'
  | 'package'
  | 'pet'
  | 'door_open'
  | 'cabinet_open'
  | 'lock'

export type Zone =
  | 'front_door'
  | 'driveway'
  | 'back_patio'
  | 'kitchen'
  | 'hallway'
  | 'medicine_cabinet'

export type DeviceClass = 'doorbell' | 'camera' | 'indoor_camera' | 'contact' | 'motion' | 'lock'

export interface Device {
  id: string
  name: string
  /** Real Ring hardware the simulator stands in for. */
  model: string
  deviceClass: DeviceClass
  zone: Zone
  /** Event kinds this device is physically able to report. */
  emits: ObservationKind[]
}

/**
 * A single thing a Ring device reported. Observations are immutable facts and
 * the only input the engine trusts.
 */
export interface Observation {
  id: string
  ts: number
  deviceId: string
  zone: Zone
  kind: ObservationKind
  /** Identity from Ring person detection / familiar faces, when resolved. */
  actor?: string
  /** How long the activity lasted, in seconds. */
  durationS?: number
  /** Detector confidence reported by the device, 0..1. */
  confidence: number
  note?: string
  /** True when injected live through the simulator during this session. */
  injected?: boolean
}

/**
 * A window in which a device could not see. Produced by battery swaps, Wi-Fi
 * drops, privacy shutters, or the homeowner disarming a zone.
 */
export interface Outage {
  id: string
  deviceId: string
  from: number
  to: number
  cause: 'offline' | 'charging' | 'privacy_mode' | 'disarmed'
}

/**
 * A recurring pattern the engine inferred from history. Nobody programs these;
 * they are learned, and they carry their own support statistics so the UI can
 * show the user exactly how confident the belief is and why.
 */
export interface Routine {
  id: string
  /** kind|zone|actor. The identity of the thing that recurs. */
  signature: string
  label: string
  /** A bare noun phrase, for use inside generated sentences. */
  shortLabel: string
  kind: ObservationKind
  zone: Zone
  actor?: string
  /** Minutes after local midnight, median of observed occurrences. */
  expectedMinute: number
  /** Half-width of the expected window, derived from observed spread. */
  toleranceMin: number
  /** Local weekdays (0=Sun) on which this routine applies. */
  weekdays: number[]
  observedDays: number
  eligibleDays: number
  /** observedDays / eligibleDays. */
  support: number
  /** Standard deviation of occurrence time, in minutes. */
  driftMin: number
  /** 0..1, combines support and timing tightness. */
  confidence: number
  /**
   * 0..1. How much it matters if this does not happen. Comes from the care
   * plan the household configured, not from the data. A missed dose and a
   * missed cat visit are statistically identical and humanly not.
   */
  consequence: number
  consequenceReason?: string
  /** Observation ids that taught us this routine. */
  sampleIds: string[]
}

export type EvidenceType =
  | 'prior'
  | 'window'
  | 'streak'
  | 'corroborating'
  | 'contradicting'
  | 'coverage'
  | 'consequence'

export interface Evidence {
  type: EvidenceType
  epistemic: Epistemic
  text: string
  observationIds?: string[]
}

export type ExpectationStatus = 'missing' | 'late' | 'satisfied' | 'pending' | 'uncertain'

/**
 * The engine's central output: a verdict on one expected event on one day.
 * `uncertain` is returned instead of `missing` whenever coverage was lost.
 */
export interface Expectation {
  id: string
  routineId: string
  dayStart: number
  expectedAt: number
  windowStart: number
  windowEnd: number
  status: ExpectationStatus
  satisfiedById?: string
  latenessMin?: number
  /** Consecutive prior applicable days where this was satisfied. */
  streak: number
  /** 0..100, ranks what a human should look at first. */
  severity: number
  /** 0..1 confidence in the verdict itself. */
  confidence: number
  /** 0..1. How much of the window the covering devices could actually see. */
  coverageFraction: number
  /** Devices that were able to witness this expectation. */
  witnesses: string[]
  evidence: Evidence[]
  epistemic: Epistemic
}

export type NoveltyReason =
  | 'unseen_signature'
  | 'unusual_hour'
  /** This person does this, but never at this hour. */
  | 'unusual_hour_for_actor'
  | 'unusual_dwell'
  | 'unusual_frequency'

/** Something that happened which history does not account for. */
export interface Novelty {
  id: string
  observationId: string
  reasons: NoveltyReason[]
  /** 0..1. How unlike the previous two weeks this is. */
  rarity: number
  text: string
}

export type CorrelationKind = 'precondition' | 'cascade' | 'coincidence' | 'substitution'

/**
 * Relationship intelligence. Links findings to each other with a hypothesis and,
 * critically, the statistical basis for it, so a person can disagree.
 */
export interface Correlation {
  id: string
  kind: CorrelationKind
  expectationIds: string[]
  noveltyIds: string[]
  /** 0..1 */
  strength: number
  hypothesis: string
  basis: string
}

export interface CareProfileEntry {
  /** Signature prefix to match, e.g. "cabinet_open|medicine_cabinet". */
  match: string
  consequence: number
  reason: string
  /**
   * Disambiguates two clusters of the same signature. The caregiver arriving
   * and the caregiver leaving are one signature and two expectations.
   */
  nearMinute?: number
  /** Human wording, in place of the sentence the engine would generate. */
  label?: string
  shortLabel?: string
}

export interface Household {
  id: string
  residentName: string
  residentAge: number
  /** Who gets told, in order. */
  circle: { name: string; relation: string; channel: string }[]
  timezoneLabel: string
  devices: Device[]
  careProfile: CareProfileEntry[]
}

/** Everything the engine knows, recomputed from observations on every change. */
export interface WorldState {
  household: Household
  now: number
  observations: Observation[]
  outages: Outage[]
  routines: Routine[]
  expectations: Expectation[]
  novelties: Novelty[]
  correlations: Correlation[]
}
