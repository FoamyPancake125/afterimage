import type { Acknowledgement, Contact, Expectation, WorldState } from './types.ts'
import { MIN, clockLabel, minuteLabel, startOfLocalDay } from './time.ts'

/** Grace after a window closes before anyone is told. Matches absence.ts. */
const GRACE_MIN = 10

export interface Notification {
  id: string
  contact: Contact
  expectationId: string
  /** When this would be sent. */
  at: number
  /** Whether it has already been sent, as of the current clock. */
  sent: boolean
  /** Suppressed because somebody already explained the finding. */
  suppressed: boolean
  severity: number
  /** Exactly what the person would hear or read. */
  message: string
  /** Why this person and not someone else. */
  rationale: string
}

/**
 * What the system would actually do about what it found.
 *
 * Detecting an absence is only half a product. The half that decides who is
 * told, how quickly, and how bad it has to be before a neighbour is knocked up
 * at nine in the evening is the half that determines whether the thing is still
 * installed a month later.
 *
 * Two rules do the work. A finding only reaches a person whose threshold it
 * meets, so a missed parcel never wakes anybody. And a finding that somebody
 * has explained stops escalating immediately, because the most common cause of
 * an absence is a perfectly good reason the house could not see.
 */
export function escalations(
  world: WorldState,
  acknowledgements: Acknowledgement[] = [],
): Notification[] {
  const dayStart = startOfLocalDay(world.now)
  const acked = new Map(acknowledgements.map((a) => [a.expectationId, a]))
  const out: Notification[] = []

  const findings = world.expectations
    .filter((e) => e.dayStart === dayStart && (e.status === 'missing' || e.status === 'uncertain'))
    .sort((a, b) => b.severity - a.severity)

  for (const e of findings) {
    const r = world.routines.find((x) => x.id === e.routineId)
    if (!r) continue
    // The moment the verdict could first have been reached.
    const decidedAt = e.windowEnd + GRACE_MIN * MIN
    const ack = acked.get(e.id)

    for (const contact of world.household.circle) {
      if (e.severity < contact.notifyAt) continue
      // Each further contact waits out the previous one's window, so the
      // household is escalated through rather than all woken at once.
      const tier = world.household.circle.indexOf(contact)
      const delay = world.household.circle
        .slice(0, tier)
        .reduce((sum, c) => sum + c.escalateAfterMin, 0)
      const at = decidedAt + delay * MIN
      const suppressed = Boolean(ack && ack.at <= at)

      out.push({
        id: `n_${e.id}_${contact.name}`,
        contact,
        expectationId: e.id,
        at,
        sent: world.now >= at && !suppressed,
        suppressed,
        severity: e.severity,
        message: messageFor(world, e, contact),
        rationale:
          tier === 0
            ? `Severity ${e.severity} is at or above ${contact.notifyAt}, and ${contact.name} can settle this in one sentence.`
            : `Severity ${e.severity} is at or above ${contact.notifyAt}. Reached only after ${delay} minutes with no acknowledgement.`,
      })
    }
  }

  return out.sort((a, b) => a.at - b.at)
}

function messageFor(world: WorldState, e: Expectation, contact: Contact): string {
  const r = world.routines.find((x) => x.id === e.routineId)!
  const resident = world.household.residentName
  const link = world.correlations.find((c) => c.expectationIds.includes(e.id))

  if (contact.name === resident) {
    return `${resident}, I have not seen the ${r.shortLabel} today. It is normally around ${minuteLabel(
      r.expectedMinute,
    )}. Would you like me to let ${world.household.circle[1]?.name ?? 'your family'} know, or is everything fine?`
  }

  if (e.status === 'uncertain') {
    return `${resident}'s ${r.shortLabel} could not be checked today. ${e.witnesses.join(
      ' and ',
    )} saw only ${Math.round(
      e.coverageFraction * 100,
    )} percent of the window, so this is a gap in coverage rather than a missed event.`
  }

  return (
    `${resident}'s ${r.shortLabel} did not happen today. It was expected around ${minuteLabel(
      r.expectedMinute,
    )} and has happened on ${r.observedDays} of the last ${r.eligibleDays} days.` +
    (link ? ` ${link.hypothesis}` : '') +
    ` She has been seen at home since.`
  )
}

/** The reasons a household can give, which are the ones that actually recur. */
export const ACK_REASONS = [
  'I was with her, it is fine',
  'The visit was rescheduled',
  'She told me she skipped it',
  'The device was moved or covered',
  'Already handled, no action needed',
] as const

export function describeEscalation(n: Notification, now: number): string {
  if (n.suppressed) return `Suppressed, acknowledged before ${clockLabel(n.at)}`
  if (n.sent) return `Sent ${clockLabel(n.at)}`
  return `Queued for ${clockLabel(n.at)}, ${Math.max(
    1,
    Math.round((n.at - now) / MIN),
  )} min away`
}
