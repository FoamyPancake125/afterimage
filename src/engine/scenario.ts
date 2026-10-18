import type {
  CareProfileEntry,
  Device,
  Household,
  Observation,
  ObservationKind,
  Outage,
  Zone,
} from './types.ts'
import { DAY, MIN, mulberry32, startOfLocalDay, weekday } from './time.ts'

/**
 * The demo clock is pinned so that every run, every reviewer and every frame of
 * the demo video sees the identical household. Tuesday 20 October 2026, 7:45 PM
 * local, late enough that the morning has fully played out, early enough that
 * the evening deadbolt is still legitimately pending.
 */
export const DEMO_NOW = new Date(2026, 9, 20, 19, 45, 0).getTime()

export const HISTORY_DAYS = 21

export const DEVICES: Device[] = [
  {
    id: 'cam_front',
    name: 'Front Door',
    model: 'Ring Battery Doorbell Pro',
    deviceClass: 'doorbell',
    zone: 'front_door',
    emits: ['motion', 'doorbell', 'person', 'package'],
  },
  {
    id: 'cam_drive',
    name: 'Driveway',
    model: 'Ring Stick Up Cam Pro',
    deviceClass: 'camera',
    zone: 'driveway',
    emits: ['motion', 'vehicle', 'person'],
  },
  {
    id: 'cam_back',
    name: 'Back Patio',
    model: 'Ring Spotlight Cam Plus',
    deviceClass: 'camera',
    zone: 'back_patio',
    emits: ['motion', 'person', 'pet'],
  },
  {
    id: 'sensor_back',
    name: 'Patio Door',
    model: 'Ring Alarm Contact Sensor (2nd Gen)',
    deviceClass: 'contact',
    zone: 'back_patio',
    emits: ['door_open'],
  },
  {
    id: 'cam_kitchen',
    name: 'Kitchen',
    model: 'Ring Indoor Cam (2nd Gen)',
    deviceClass: 'indoor_camera',
    zone: 'kitchen',
    emits: ['motion', 'person', 'pet'],
  },
  {
    id: 'sensor_med',
    name: 'Medicine Cabinet',
    model: 'Ring Alarm Contact Sensor (2nd Gen)',
    deviceClass: 'contact',
    zone: 'medicine_cabinet',
    emits: ['cabinet_open'],
  },
  {
    id: 'lock_front',
    name: 'Front Deadbolt',
    model: 'Ring Alarm Pro + smart lock',
    deviceClass: 'lock',
    zone: 'front_door',
    emits: ['lock'],
  },
  {
    id: 'motion_hall',
    name: 'Hallway',
    model: 'Ring Alarm Motion Detector',
    deviceClass: 'motion',
    zone: 'hallway',
    emits: ['motion'],
  },
]

/**
 * The care plan. This is the one place a human tells AFTERIMAGE what matters.
 * The engine learns *what* recurs on its own; it cannot learn what a missed
 * dose costs, and it should not pretend to.
 */
export const CARE_PROFILE: CareProfileEntry[] = [
  {
    match: 'cabinet_open|medicine_cabinet',
    consequence: 0.95,
    label: 'The medicine cabinet is opened for the morning dose',
    shortLabel: 'morning dose',
    reason:
      "Eleanor's morning blood-pressure dose. Her cardiologist asked to be told if two consecutive days are missed.",
  },
  {
    match: 'person|front_door|Marcus',
    nearMinute: 522,
    consequence: 0.9,
    label: 'Marcus arrives for the morning care visit',
    shortLabel: 'care visit',
    reason:
      'Marcus is the paid caregiver. On a weekday his visit is the only scheduled in-person contact of the day.',
  },
  {
    match: 'person|front_door|Marcus',
    nearMinute: 785,
    consequence: 0.5,
    label: 'Marcus leaves at the end of the care visit',
    shortLabel: 'end-of-visit departure',
    reason: 'Confirms how long Eleanor had company, and that the visit was not cut short.',
  },
  {
    match: 'vehicle|driveway|Marcus',
    nearMinute: 519,
    consequence: 0.3,
    label: "Marcus's car pulls into the driveway",
    shortLabel: 'car in the driveway',
    reason: "The earliest signal that the care visit is going ahead, usually three minutes before the door.",
  },
  {
    match: 'door_open|back_patio|Eleanor',
    consequence: 0.45,
    label: 'Eleanor opens the patio door for the garden',
    shortLabel: 'garden door',
    reason:
      'Her family reads the garden door as the clearest daily sign that she is up, mobile and feeling well.',
  },
  {
    match: 'motion|kitchen|Eleanor',
    nearMinute: 464,
    consequence: 0.4,
    label: 'Eleanor is in the kitchen for breakfast',
    shortLabel: 'breakfast',
    reason: 'Breakfast is when the morning dose is normally taken.',
  },
  {
    match: 'motion|kitchen|Eleanor',
    nearMinute: 750,
    consequence: 0.35,
    label: 'Eleanor is in the kitchen at midday',
    shortLabel: 'midday meal',
    reason: 'Midday meal.',
  },
  {
    match: 'motion|kitchen|Eleanor',
    nearMinute: 1090,
    consequence: 0.35,
    label: 'Eleanor is in the kitchen for the evening meal',
    shortLabel: 'evening meal',
    reason: 'Evening meal.',
  },
  {
    match: 'person|front_door|Eleanor',
    nearMinute: 934,
    consequence: 0.55,
    label: 'Eleanor leaves for her afternoon walk',
    shortLabel: 'afternoon walk',
    reason: 'Her physiotherapist set a daily walk; skipped walks are the first thing to come up at review.',
  },
  {
    match: 'lock|front_door',
    consequence: 0.6,
    label: 'The front door is locked for the night',
    shortLabel: 'night deadbolt',
    reason: 'An unlocked door overnight is the one thing Eleanor has asked to be reminded about herself.',
  },
  {
    match: 'package|front_door',
    consequence: 0.15,
    label: 'Mail is delivered to the front door',
    shortLabel: 'mail delivery',
    reason: 'Low stakes, included so the household can see the system is not simply flagging everything.',
  },
]

export const HOUSEHOLD: Household = {
  id: 'hh_eleanor',
  residentName: 'Eleanor',
  residentAge: 78,
  timezoneLabel: 'Household local time',
  /*
   * Ordered by how much it costs to interrupt them. Eleanor is asked first
   * because she can settle most of these in one sentence and it is her house.
   * Ruth is last because knocking on a neighbour's door at nine in the evening
   * is a real imposition, and a system that does it for a missed parcel will
   * not be running by the end of the month.
   */
  circle: [
    {
      name: 'Eleanor',
      relation: 'Asked on her own Echo first',
      channel: 'Alexa+ announcement',
      notifyAt: 55,
      escalateAfterMin: 45,
    },
    {
      name: 'Dana',
      relation: 'Daughter, 40 min away',
      channel: 'Alexa+ and phone',
      notifyAt: 70,
      escalateAfterMin: 60,
    },
    {
      name: 'Marcus',
      relation: 'Weekday caregiver',
      channel: 'Care agency app',
      notifyAt: 80,
      escalateAfterMin: 90,
    },
    {
      name: 'Ruth',
      relation: 'Neighbour, two doors down',
      channel: 'Phone only',
      notifyAt: 92,
      escalateAfterMin: 0,
    },
  ],
  devices: DEVICES,
  careProfile: CARE_PROFILE,
}

interface RoutineSpec {
  id: string
  kind: ObservationKind
  zone: Zone
  deviceId: string
  actor?: string
  /** Minutes after local midnight, for specs anchored to the clock. */
  minute?: number
  /**
   * Specs anchored to another spec instead of to the clock. This is what makes
   * the precondition test in correlate.ts meaningful rather than decorative:
   * the morning dose really is a consequence of the caregiver arriving, so the
   * gap between them is tight even though both wander against the clock.
   */
  after?: { id: string; gapMin: number; gapJitter: number }
  /** Standard deviation, in minutes, of when it actually happens. */
  jitter: number
  days: 'all' | 'weekdays' | 'mon-sat' | 'weekends'
  /** Probability it happens at all on an applicable day. */
  prob: number
  /** Typical duration in seconds, and its spread. */
  dwell?: [number, number]
  confidence: [number, number]
}

const SPECS: RoutineSpec[] = [
  { id: 'garden', kind: 'door_open', zone: 'back_patio', deviceId: 'sensor_back', actor: 'Eleanor', minute: 442, jitter: 10, days: 'all', prob: 0.97, dwell: [58, 18], confidence: [0.97, 0.01] },
  { id: 'breakfast', kind: 'motion', zone: 'kitchen', deviceId: 'cam_kitchen', actor: 'Eleanor', minute: 464, jitter: 14, days: 'all', prob: 0.97, dwell: [420, 120], confidence: [0.9, 0.05] },
  { id: 'marcus_car', kind: 'vehicle', zone: 'driveway', deviceId: 'cam_drive', actor: 'Marcus', minute: 519, jitter: 8, days: 'weekdays', prob: 0.97, dwell: [240, 60], confidence: [0.88, 0.05] },
  { id: 'marcus_in', kind: 'person', zone: 'front_door', deviceId: 'cam_front', actor: 'Marcus', after: { id: 'marcus_car', gapMin: 3, gapJitter: 1.2 }, jitter: 0, days: 'weekdays', prob: 0.99, dwell: [38, 12], confidence: [0.93, 0.03] },
  // The dose follows the caregiver on weekdays and the clock at weekends.
  { id: 'dose_wd', kind: 'cabinet_open', zone: 'medicine_cabinet', deviceId: 'sensor_med', actor: 'Eleanor', after: { id: 'marcus_in', gapMin: 22, gapJitter: 5 }, jitter: 0, days: 'weekdays', prob: 0.98, dwell: [22, 8], confidence: [0.98, 0.01] },
  { id: 'dose_we', kind: 'cabinet_open', zone: 'medicine_cabinet', deviceId: 'sensor_med', actor: 'Eleanor', minute: 548, jitter: 14, days: 'weekends', prob: 0.92, dwell: [22, 8], confidence: [0.98, 0.01] },
  { id: 'midday', kind: 'motion', zone: 'kitchen', deviceId: 'cam_kitchen', actor: 'Eleanor', minute: 750, jitter: 16, days: 'all', prob: 0.94, dwell: [600, 180], confidence: [0.9, 0.05] },
  { id: 'marcus_out', kind: 'person', zone: 'front_door', deviceId: 'cam_front', actor: 'Marcus', after: { id: 'marcus_in', gapMin: 263, gapJitter: 13 }, jitter: 0, days: 'weekdays', prob: 0.97, dwell: [30, 10], confidence: [0.91, 0.04] },
  { id: 'mail', kind: 'package', zone: 'front_door', deviceId: 'cam_front', actor: 'Delivery', minute: 868, jitter: 16, days: 'mon-sat', prob: 0.88, dwell: [26, 9], confidence: [0.85, 0.06] },
  { id: 'walk', kind: 'person', zone: 'front_door', deviceId: 'cam_front', actor: 'Eleanor', minute: 934, jitter: 13, days: 'all', prob: 0.95, dwell: [44, 14], confidence: [0.92, 0.04] },
  { id: 'dinner', kind: 'motion', zone: 'kitchen', deviceId: 'cam_kitchen', actor: 'Eleanor', minute: 1090, jitter: 15, days: 'all', prob: 0.95, dwell: [900, 240], confidence: [0.9, 0.05] },
  { id: 'lock', kind: 'lock', zone: 'front_door', deviceId: 'lock_front', actor: 'Eleanor', minute: 1302, jitter: 11, days: 'all', prob: 0.98, confidence: [0.99, 0.005] },
  // Deliberate negative control: the neighbour's cat is frequent but formless.
  // A system that turned this into an expectation the family gets woken for
  // would be unusable, so the learner has to reject it. See selftest.ts.
  { id: 'cat', kind: 'pet', zone: 'back_patio', deviceId: 'cam_back', actor: "Ruth's cat", minute: 1100, jitter: 95, days: 'all', prob: 0.46, dwell: [70, 40], confidence: [0.6, 0.12] },
]

function applies(spec: RoutineSpec, w: number): boolean {
  switch (spec.days) {
    case 'all':
      return true
    case 'weekdays':
      return w >= 1 && w <= 5
    case 'mon-sat':
      return w >= 1 && w <= 6
    case 'weekends':
      return w === 0 || w === 6
  }
}

function gauss(rand: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rand())
  const v = rand()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Builds the 21 days of history that the routine learner is given. */
export function buildHistory(now = DEMO_NOW, seed = 20261030): Observation[] {
  const rand = mulberry32(seed)
  const today = startOfLocalDay(now)
  const obs: Observation[] = []
  let n = 0
  const push = (o: Omit<Observation, 'id'>) => {
    obs.push({ ...o, id: `o${String(++n).padStart(4, '0')}` })
  }

  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const dayStart = today - d * DAY
    const w = weekday(dayStart)
    /** Minute-of-day at which each spec actually fired today, for anchoring. */
    const fired = new Map<string, number>()

    for (const spec of SPECS) {
      if (!applies(spec, w)) continue
      if (rand() > spec.prob) continue

      let minute: number
      if (spec.after) {
        const anchor = fired.get(spec.after.id)
        // No caregiver, no dose. The dependency is real, not cosmetic.
        if (anchor === undefined) continue
        minute = anchor + gauss(rand, spec.after.gapMin, spec.after.gapJitter)
      } else {
        minute = gauss(rand, spec.minute!, spec.jitter)
      }
      minute = Math.max(1, Math.min(1438, minute))
      fired.set(spec.id, minute)

      push({
        ts: dayStart + Math.round(minute * MIN),
        deviceId: spec.deviceId,
        zone: spec.zone,
        kind: spec.kind,
        actor: spec.actor,
        durationS: spec.dwell
          ? Math.max(4, Math.round(gauss(rand, spec.dwell[0], spec.dwell[1])))
          : undefined,
        confidence: Math.min(0.995, Math.max(0.5, gauss(rand, spec.confidence[0], spec.confidence[1]))),
      })
    }

    // Unstructured background traffic: cars on the road, wind in the hedge,
    // Eleanor crossing the hallway. None of this should become an expectation.
    const noise = 1 + Math.floor(rand() * 2)
    for (let i = 0; i < noise; i++) {
      const minute = 360 + rand() * 960
      const which = rand()
      const [deviceId, zone] = which < 0.45
        ? (['cam_drive', 'driveway'] as const)
        : which < 0.75
          ? (['motion_hall', 'hallway'] as const)
          : (['cam_front', 'front_door'] as const)
      push({
        ts: dayStart + Math.round(minute * MIN),
        deviceId,
        zone,
        kind: 'motion',
        durationS: Math.round(8 + rand() * 30),
        confidence: 0.55 + rand() * 0.3,
      })
    }
  }

  return obs.concat(buildToday(now, obs.length))
}

/**
 * Tuesday. Four learned expectations go unmet, one drifts badly late, one
 * cannot be judged at all because the doorbell was charging, and three things
 * happen that twenty-one days of history has no precedent for.
 */
function buildToday(now: number, offset: number): Observation[] {
  const today = startOfLocalDay(now)
  const obs: Observation[] = []
  let n = offset
  const at = (
    minute: number,
    deviceId: string,
    zone: Zone,
    kind: ObservationKind,
    extra: Partial<Observation> = {},
  ) => {
    obs.push({
      id: `t${String(++n).padStart(4, '0')}`,
      ts: today + Math.round(minute * MIN),
      deviceId,
      zone,
      kind,
      confidence: 0.9,
      ...extra,
    })
  }

  // 03:12, the patio door opens in the middle of the night. Never happened before.
  at(192, 'sensor_back', 'back_patio', 'door_open', {
    durationS: 262,
    confidence: 0.99,
    note: 'Contact sensor held open 4 min 22 s. No interior motion followed for nine minutes.',
  })

  // 07:46, breakfast, on time.
  at(466, 'cam_kitchen', 'kitchen', 'motion', { actor: 'Eleanor', durationS: 398, confidence: 0.91 })

  // 07:58, the garden door, far later than it has been in three weeks.
  at(478, 'sensor_back', 'back_patio', 'door_open', { actor: 'Eleanor', durationS: 51, confidence: 0.97 })

  // 08:38, 08:41 and 09:03: the car, the caregiver and the dose. None happen today.

  at(605, 'motion_hall', 'hallway', 'motion', { durationS: 26, confidence: 0.69 })
  at(758, 'cam_kitchen', 'kitchen', 'motion', { actor: 'Eleanor', durationS: 640, confidence: 0.9 })

  // 14:34, the mail arrives as usual. Evidence that the system is not simply
  // flagging everything that moves.
  at(874, 'cam_front', 'front_door', 'package', { actor: 'Delivery', durationS: 24, confidence: 0.86 })

  // 15:34, the afternoon walk. The doorbell was on its charger, so this is
  // genuinely unknowable and is reported as such.

  // 16:10, somebody unrecognised, 22 seconds, no doorbell press.
  at(970, 'cam_front', 'front_door', 'person', {
    actor: 'unknown',
    durationS: 22,
    confidence: 0.79,
    note: 'Face did not match any familiar face. The doorbell was not pressed.',
  })

  // 18:22, evening meal, on time.
  at(1102, 'cam_kitchen', 'kitchen', 'motion', { actor: 'Eleanor', durationS: 880, confidence: 0.9 })

  // 18:55, a vehicle that has never been in this driveway, parked 41 minutes.
  at(1135, 'cam_drive', 'driveway', 'vehicle', {
    actor: 'unknown',
    durationS: 2460,
    confidence: 0.83,
    note: 'Does not match any vehicle recorded in the last twenty-one days.',
  })

  // 21:42, the deadbolt, still ahead of the demo clock and correctly pending.
  return obs
}

export function buildOutages(now = DEMO_NOW): Outage[] {
  const today = startOfLocalDay(now)
  return [
    {
      id: 'g1',
      deviceId: 'cam_front',
      from: today + 912 * MIN, // 15:12
      to: today + 964 * MIN, // 16:04
      cause: 'charging',
    },
    {
      id: 'g2',
      deviceId: 'cam_drive',
      from: today - 4 * DAY + 600 * MIN,
      to: today - 4 * DAY + 735 * MIN,
      cause: 'offline',
    },
  ]
}

export interface InjectableEvent {
  id: string
  label: string
  blurb: string
  deviceId: string
  zone: Zone
  kind: ObservationKind
  actor?: string
  durationS?: number
  note?: string
  /**
   * Minute of day to place the event at, when "right now" would be dishonest.
   * The deadbolt is the clearest case: locking the door at 7:45 PM does not
   * satisfy a 9:39 PM routine, and pretending it did would be exactly the kind
   * of approximate reasoning this project exists to avoid. So the clock moves
   * with the event, and the evening genuinely plays out.
   */
  atMinute?: number
}

/**
 * The events the Ring simulator can push into the stream. Each one was chosen
 * because it forces a visible change of verdict somewhere downstream. The
 * point of the simulator is to prove the inference is live, not scripted.
 */
export const INJECTABLE: InjectableEvent[] = [
  {
    id: 'lock_now',
    label: 'Deadbolt locked at 9:41 PM',
    blurb: 'Plays the evening forward to the one window still open. Pending becomes on time.',
    deviceId: 'lock_front',
    zone: 'front_door',
    kind: 'lock',
    actor: 'Eleanor',
    atMinute: 1301,
  },
  {
    id: 'dose_now',
    label: 'Medicine cabinet opened',
    blurb: 'Hours after the window closed. Stays missing, and becomes an off-hours event.',
    deviceId: 'sensor_med',
    zone: 'medicine_cabinet',
    kind: 'cabinet_open',
    actor: 'Eleanor',
    durationS: 19,
  },
  {
    id: 'marcus_now',
    label: 'Marcus at the front door',
    blurb: 'A familiar face at an hour he has never been here. New unexplained event.',
    deviceId: 'cam_front',
    zone: 'front_door',
    kind: 'person',
    actor: 'Marcus',
    durationS: 44,
    note: 'Familiar face matched. Arrival is eleven hours after his learned window.',
  },
  {
    id: 'stranger_back',
    label: 'Unknown person, back patio',
    blurb: 'A face the house has never matched, in a zone with no precedent for strangers.',
    deviceId: 'cam_back',
    zone: 'back_patio',
    kind: 'person',
    actor: 'unknown',
    durationS: 96,
    note: 'Face did not match any familiar face.',
  },
  {
    id: 'vehicle_again',
    label: 'Unfamiliar vehicle returns',
    blurb: 'A second driveway event with no precedent, an hour after the first.',
    deviceId: 'cam_drive',
    zone: 'driveway',
    kind: 'vehicle',
    actor: 'unknown',
    durationS: 300,
    note: 'Second appearance of a plate first seen at 6:55 PM.',
  },
  {
    id: 'kitchen_now',
    label: 'Eleanor in the kitchen',
    blurb: 'Ordinary, expected traffic. Correctly produces nothing at all.',
    deviceId: 'cam_kitchen',
    zone: 'kitchen',
    kind: 'motion',
    actor: 'Eleanor',
    durationS: 140,
  },
]
