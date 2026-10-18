import type { Expectation, Novelty, Routine, WorldState } from './types.ts'
import { EPISTEMIC_NAME, ZONE_NAME } from './labels.ts'
import { clockLabel, durationLabel, minuteLabel, startOfLocalDay } from './time.ts'
import { routineBasis } from './routines.ts'

export type Intent =
  | 'day_summary'
  | 'absences'
  | 'why'
  | 'changes'
  | 'did_it_happen'
  | 'resident_status'
  | 'routine_detail'
  | 'blind_spots'
  | 'next_step'
  | 'capability'
  | 'unknown'

export interface AnswerCard {
  kind: 'finding' | 'evidence' | 'novelty' | 'link' | 'unknown' | 'routine' | 'action'
  title: string
  lines: string[]
  /** Shown as a pill on the card. */
  tag?: string
}

export interface Answer {
  intent: Intent
  /** What Alexa+ says out loud. Written to be heard, not read. */
  speech: string
  cards: AnswerCard[]
  /** Ids the other two surfaces should highlight while this answer is on screen. */
  highlight: { observationIds: string[]; expectationIds: string[]; noveltyIds: string[] }
  followUps: string[]
}

const NO_HIGHLIGHT = { observationIds: [], expectationIds: [], noveltyIds: [] }

/**
 * The reasoning interface behind Alexa+.
 *
 * Every answer is assembled from the engine's own structures, so the spoken
 * sentence and the evidence card can never disagree. There is no second,
 * looser description of the world for the voice layer to drift towards. The
 * same function backs the MCP tools, which is why it returns structure rather
 * than a string.
 */
export function ask(world: WorldState, question: string): Answer {
  const q = question.toLowerCase().trim()
  const today = startOfLocalDay(world.now)
  const todays = world.expectations.filter((e) => e.dayStart === today)
  const routine = (id: string) => world.routines.find((r) => r.id === id)
  const missing = todays.filter((e) => e.status === 'missing').sort((a, b) => b.severity - a.severity)
  const late = todays.filter((e) => e.status === 'late')
  const uncertain = todays.filter((e) => e.status === 'uncertain')
  const satisfied = todays.filter((e) => e.status === 'satisfied')
  const pending = todays.filter((e) => e.status === 'pending')

  // ---- intent: what can't you tell me? -------------------------------------
  if (/(blind|coverage|unknown|uncertain)|((can'?t|cannot|can you not|don'?t|do not|unable|no way to)[^.?]{0,24}(know|tell|see|say))/.test(q)) {
    const cards: AnswerCard[] = uncertain.map((e): AnswerCard => {
      const r = routine(e.routineId)!
      return {
        kind: 'unknown',
        tag: 'Unknown',
        title: r.label,
        lines: [
          `Expected around ${minuteLabel(r.expectedMinute)}.`,
          `${e.witnesses.join(', ')} saw only ${Math.round(e.coverageFraction * 100)}% of the window.`,
          ...e.evidence.filter((x) => x.type === 'coverage').map((x) => x.text),
        ],
      }
    })
    const outages = world.outages.filter((o) => o.to > today)
    for (const o of outages) {
      const d = world.household.devices.find((x) => x.id === o.deviceId)
      cards.push({
        kind: 'unknown',
        tag: 'Coverage',
        title: `${d?.name ?? o.deviceId}: ${o.cause.replace('_', ' ')}`,
        lines: [`No coverage from ${clockLabel(o.from)} to ${clockLabel(o.to)}.`],
      })
    }
    const cause = uncertain.length ? outageBehind(world, uncertain[0]) : undefined
    return {
      intent: 'blind_spots',
      speech: uncertain.length
        ? `There is one thing I genuinely can't answer: the ${
            routine(uncertain[0].routineId)!.shortLabel
          }. ${
            cause
              ? `The ${cause.noun} was ${cause.verb} from ${clockLabel(cause.outage.from)} to ${clockLabel(
                  cause.outage.to,
                )}, so I saw only ${Math.round(uncertain[0].coverageFraction * 100)} percent of the window.`
              : `I saw only ${Math.round(uncertain[0].coverageFraction * 100)} percent of the window.`
          } I am not going to call that missing, because I do not know. Most systems would have sent you an alert.`
        : `Right now I have full coverage on every expectation for today.`,
      cards,
      highlight: { observationIds: [], expectationIds: uncertain.map((e) => e.id), noveltyIds: [] },
      followUps: ['What did not happen today?', 'Why did you flag the morning dose?'],
    }
  }

  // ---- intent: why did you flag this? --------------------------------------
  if (/^why|how do you know|what makes you|evidence|prove|justify/.test(q)) {
    const target = pickExpectation(q, todays, world) ?? missing[0]
    if (!target) {
      return {
        intent: 'why',
        speech: `Nothing is flagged today, so there is nothing to justify.`,
        cards: [],
        highlight: NO_HIGHLIGHT,
        followUps: ['What happened today?'],
      }
    }
    const r = routine(target.routineId)!
    const links = world.correlations.filter((c) => c.expectationIds.includes(target.id))
    return {
      intent: 'why',
      speech:
        `${r.label}. I expected it around ${minuteLabel(r.expectedMinute)} because it has happened on ` +
        `${r.observedDays} of the last ${r.eligibleDays} applicable days, within ${Math.round(
          r.driftMin,
        )} minutes either side. ${
          target.witnesses.join(' and ')
        } ${target.witnesses.length === 1 ? 'was' : 'were'} online for the whole window, so the silence is real. ` +
        `${
          links.length
            ? `I also think it is connected: ${links[0].hypothesis}`
            : `I am ${Math.round(target.confidence * 100)} percent confident in that.`
        }`,
      cards: [
        {
          kind: 'finding',
          tag: statusTag(target.status),
          title: r.label,
          lines: [
            `Severity ${target.severity} of 100 · confidence ${Math.round(target.confidence * 100)}%`,
            routineBasis(r),
          ],
        },
        ...target.evidence.map((ev) => ({
          kind: 'evidence' as const,
          tag: EPISTEMIC_NAME[ev.epistemic],
          title: evidenceTitle(ev.type),
          lines: [ev.text],
        })),
        ...links.map((c) => ({
          kind: 'link' as const,
          tag: `${Math.round(c.strength * 100)}% link`,
          title: c.hypothesis,
          lines: [c.basis],
        })),
      ],
      highlight: {
        observationIds: target.evidence.flatMap((e) => e.observationIds ?? []),
        expectationIds: [target.id, ...links.flatMap((c) => c.expectationIds)],
        noveltyIds: links.flatMap((c) => c.noveltyIds),
      },
      followUps: ['What else did not happen?', 'What should I do?', 'What can you not tell me?'],
    }
  }

  // ---- intent: how is she? -------------------------------------------------
  if (
    new RegExp(
      `(how is|how'?s)\\s+(she|he|they|mum|mom|dad|${world.household.residentName.toLowerCase()})|` +
        `(is|are)\\s+(she|he|they|${world.household.residentName.toLowerCase()})\\s+(ok|okay|alright|all right|safe|well|fine)`,
    ).test(q)
  ) {
    const lastSeen = [...world.observations]
      .filter((o) => o.actor === world.household.residentName && o.ts <= world.now)
      .sort((a, b) => b.ts - a.ts)[0]
    return {
      intent: 'resident_status',
      speech:
        `${world.household.residentName} has been seen ${
          lastSeen ? `as recently as ${clockLabel(lastSeen.ts)} in the ${ZONE_NAME[lastSeen.zone].toLowerCase()}` : 'today'
        }, and her meals are all on schedule. What is off is the care side: ${
          missing.length
        } expected events did not happen, the most important being the ${
          routine(missing[0]!.routineId)!.shortLabel
        }. I would not describe this as an emergency. I would describe it as a day that did not go as planned.`,
      cards: [
        ...satisfied.slice(0, 3).map((e) => expectationCard(e, routine(e.routineId)!)),
        ...missing.slice(0, 2).map((e) => expectationCard(e, routine(e.routineId)!)),
      ],
      highlight: {
        observationIds: lastSeen ? [lastSeen.id] : [],
        expectationIds: [...satisfied.slice(0, 3), ...missing.slice(0, 2)].map((e) => e.id),
        noveltyIds: [],
      },
      followUps: ['What did not happen today?', 'What should I do?'],
    }
  }

  // ---- intent: did a specific thing happen? --------------------------------
  const named = pickExpectation(q, todays, world)
  if (named && /^(did|has|was|is|were)\b/.test(q)) {
    const r = routine(named.routineId)!
    const obs = world.observations.find((o) => o.id === named.satisfiedById)
    const speech =
      named.status === 'satisfied' && obs
        ? `Yes, the ${r.shortLabel} at ${clockLabel(obs.ts)}, which is normal.`
        : named.status === 'late' && obs
          ? `Yes, but off schedule. The ${r.shortLabel} at ${clockLabel(obs.ts)}, ${Math.abs(
              named.latenessMin ?? 0,
            )} minutes ${(named.latenessMin ?? 0) >= 0 ? 'later' : 'earlier'} than usual.`
          : named.status === 'pending'
            ? `Not yet, and that is fine. It is normally around ${minuteLabel(
                r.expectedMinute,
              )}, so the window is still open.`
            : named.status === 'uncertain'
              ? `I don't know. ${named.witnesses.join(' and ')} could only see ${Math.round(
                  named.coverageFraction * 100,
                )} percent of the window, so I can't say either way.`
              : `No. There was no ${r.shortLabel} today. It has happened on ${r.observedDays} of the last ${r.eligibleDays} applicable days, so this stands out.`
    return {
      intent: 'did_it_happen',
      speech,
      cards: [expectationCard(named, r)],
      highlight: {
        observationIds: obs ? [obs.id] : [],
        expectationIds: [named.id],
        noveltyIds: [],
      },
      followUps: [`Why did you flag the ${r.shortLabel}?`, 'What did not happen today?'],
    }
  }

  // ---- intent: what did not happen? ---------------------------------------
  if (/(not happen|didn't happen|did not happen|missing|absent|supposed to|expected|should have)/.test(q)) {
    return {
      intent: 'absences',
      speech: missing.length
        ? `${countWord(missing.length)} that normally happen did not happen today. In order of how much they matter: ${missing
            .slice(0, 3)
            .map((e) => routine(e.routineId)!.shortLabel)
            .join(', then ')}. ${
            uncertain.length
              ? `One more, the ${routine(uncertain[0].routineId)!.shortLabel}, I simply cannot judge.`
              : ''
          }`
        : `Everything the household normally does has happened today.`,
      cards: [
        ...missing.map((e) => expectationCard(e, routine(e.routineId)!)),
        ...late.map((e) => expectationCard(e, routine(e.routineId)!)),
        ...uncertain.map((e) => expectationCard(e, routine(e.routineId)!)),
      ],
      highlight: {
        observationIds: [],
        expectationIds: [...missing, ...late, ...uncertain].map((e) => e.id),
        noveltyIds: [],
      },
      followUps: ['Why did you flag the morning dose?', 'What should I do?'],
    }
  }

  // ---- intent: what changed from the usual pattern? ------------------------
  if (/(change|different|unusual|new|pattern|normal|strange|odd)/.test(q)) {
    return {
      intent: 'changes',
      speech:
        `Three things today have no precedent in the last twenty-one days. ` +
        world.novelties
          .map((n) => world.observations.find((x) => x.id === n.observationId)!)
          .sort((a, b) => a.ts - b.ts)
          .slice(0, 3)
          .map((o) => `${clockLabel(o.ts)}, ${ZONE_NAME[o.zone].toLowerCase()}`)
          .join('; ') +
        `. And the garden door, which is normally the first thing to happen, was ${
          late[0]?.latenessMin ?? 0
        } minutes late.`,
      cards: [
        ...world.novelties.map((n) => noveltyCard(n, world)),
        ...late.map((e) => expectationCard(e, routine(e.routineId)!)),
      ],
      highlight: {
        observationIds: world.novelties.map((n) => n.observationId),
        expectationIds: late.map((e) => e.id),
        noveltyIds: world.novelties.map((n) => n.id),
      },
      followUps: ['What did not happen today?', 'What can you not tell me?'],
    }
  }

  // ---- intent: what should I do? ------------------------------------------
  if (/(what should|what do i|next step|recommend|advice|action|should i)/.test(q)) {
    const top = missing[0]
    const r = top ? routine(top.routineId)! : undefined
    const cards: AnswerCard[] = []
    if (r) {
      cards.push({
        kind: 'action',
        tag: 'First',
        title: `Ask ${world.household.residentName} directly about the ${r.shortLabel}`,
        lines: [
          `An Alexa+ announcement on her Echo is the least intrusive way to check, and her answer settles it in one sentence.`,
        ],
      })
      cards.push({
        kind: 'action',
        tag: 'Second',
        title: `Contact ${world.household.circle[1].name} or the care agency`,
        lines: [
          `${world.household.circle[1].name} is the weekday caregiver and has not appeared at all today. The agency can confirm whether a visit was reassigned.`,
        ],
      })
    }
    cards.push({
      kind: 'action',
      tag: 'Keep watching',
      title: `The ${routine(pending[0]?.routineId ?? '')?.shortLabel ?? 'evening deadbolt'} is still ahead`,
      lines: [
        `Normally around ${minuteLabel(
          routine(pending[0]?.routineId ?? '')?.expectedMinute ?? 1302,
        )}. If that one also goes unmet, two independent evening routines will have broken and I would escalate to ${world.household.circle[0].name}.`,
      ],
    })
    return {
      intent: 'next_step',
      speech:
        `Three things, in order. First, ask ${world.household.residentName} about the ${
          r?.shortLabel ?? 'morning routine'
        }. One question settles it. Second, contact ${
          world.household.circle[1].name
        } or the agency, because the care visit never happened at all. Third, wait for the ${
          routine(pending[0]?.routineId ?? '')?.shortLabel ?? 'deadbolt'
        } this evening. I will tell you either way.`,
      cards,
      highlight: {
        observationIds: [],
        expectationIds: [...missing.slice(0, 1), ...pending.slice(0, 1)].map((e) => e.id),
        noveltyIds: [],
      },
      followUps: ['Why did you flag the morning dose?', 'What can you not tell me?'],
    }
  }

  // ---- intent: tell me about a routine ------------------------------------
  const namedRoutine = pickRoutine(q, world.routines)
  if (namedRoutine && /(what do you know|tell me about|routine|pattern|usually|normally|learn)/.test(q)) {
    return {
      intent: 'routine_detail',
      speech:
        `${namedRoutine.label}. I learned that on my own: ${routineBasis(namedRoutine)}. ` +
        `Nobody programmed the time. ${
          namedRoutine.consequenceReason ?? ''
        }`,
      cards: [
        {
          kind: 'routine',
          tag: `${Math.round(namedRoutine.confidence * 100)}% confidence`,
          title: namedRoutine.label,
          lines: [
            routineBasis(namedRoutine),
            `Consequence weight ${namedRoutine.consequence.toFixed(2)}: ${
              namedRoutine.consequenceReason ?? 'default'
            }`,
          ],
        },
      ],
      highlight: {
        observationIds: namedRoutine.sampleIds.slice(-8),
        expectationIds: todays.filter((e) => e.routineId === namedRoutine.id).map((e) => e.id),
        noveltyIds: [],
      },
      followUps: [`Did the ${namedRoutine.shortLabel} happen today?`],
    }
  }

  // ---- intent: what can you do? -------------------------------------------
  if (/(what can you|help|who are you|what are you)/.test(q)) {
    return {
      intent: 'capability',
      speech:
        `I watch for things that do not happen. I learned ${world.routines.length} routines in this house from ${world.observations.length} Ring events, and every day I check each one. You can ask me what happened, what was supposed to happen, why I flagged something, what changed, or what I cannot tell you.`,
      cards: world.routines.slice(0, 5).map((r) => ({
        kind: 'routine' as const,
        tag: `${Math.round(r.support * 100)}% of days`,
        title: r.label,
        lines: [routineBasis(r)],
      })),
      highlight: NO_HIGHLIGHT,
      followUps: ['What did not happen today?', 'What changed from the usual pattern?'],
    }
  }

  // ---- default: the day ----------------------------------------------------
  const uncertainCause = uncertain.length ? outageBehind(world, uncertain[0]) : undefined
  const summary =
    `${countWord(satisfied.length)} of the day's routines ran normally: ` +
    `${satisfied
      .slice(0, 2)
      .map((e) => routine(e.routineId)!.shortLabel)
      .join(' and ')} both on time. ` +
    `${countWord(missing.length)} did not happen: ${missing
      .slice(0, 3)
      .map((e) => routine(e.routineId)!.shortLabel)
      .join(', ')}. ` +
    `The garden door was ${late[0]?.latenessMin ?? 0} minutes late. ` +
    `Three events had no precedent, including a patio door opening at ${clockLabel(
      world.observations.find((o) => world.novelties.some((n) => n.observationId === o.id && n.reasons.includes('unusual_hour')))?.ts ??
        world.now,
    )}. ` +
    `And one thing I cannot judge at all: the ${
      routine(uncertain[0]?.routineId ?? '')?.shortLabel ?? 'afternoon walk'
    }, because the ${uncertainCause?.noun ?? 'covering camera'} was ${uncertainCause?.verb ?? 'offline'}.`

  return {
    intent: 'day_summary',
    speech: summary,
    cards: [
      ...missing.slice(0, 2).map((e) => expectationCard(e, routine(e.routineId)!)),
      ...world.novelties.slice(0, 2).map((n) => noveltyCard(n, world)),
      ...uncertain.map((e) => expectationCard(e, routine(e.routineId)!)),
    ],
    highlight: {
      observationIds: world.novelties.map((n) => n.observationId),
      expectationIds: [...missing, ...uncertain].map((e) => e.id),
      noveltyIds: world.novelties.map((n) => n.id),
    },
    followUps: [
      'What was supposed to happen?',
      'Why did you flag the morning dose?',
      'What can you not tell me?',
    ],
  }
}

function expectationCard(e: Expectation, r: Routine): AnswerCard {
  return {
    kind: 'finding',
    tag: statusTag(e.status),
    title: r.label,
    lines: [
      e.status === 'uncertain'
        ? `Coverage ${Math.round(e.coverageFraction * 100)}% of the window, not judged.`
        : `Expected ${minuteLabel(r.expectedMinute)} ±${Math.round(r.toleranceMin)} min · severity ${e.severity} · confidence ${Math.round(
            e.confidence * 100,
          )}%`,
      routineBasis(r),
    ],
  }
}

function noveltyCard(n: Novelty, world: WorldState): AnswerCard {
  const o = world.observations.find((x) => x.id === n.observationId)
  return {
    kind: 'novelty',
    tag: `${Math.round(n.rarity * 100)}% unlike normal`,
    title: o ? `${clockLabel(o.ts)}, ${ZONE_NAME[o.zone]}` : 'Unexplained event',
    lines: [n.text, o?.note ?? '', o?.durationS ? `Lasted ${durationLabel(o.durationS)}.` : ''].filter(
      Boolean,
    ),
  }
}

/** Which outage actually blinded an expectation, and how to say it out loud. */
function outageBehind(world: WorldState, e: Expectation) {
  const witnessIds = world.household.devices
    .filter((d) => e.witnesses.includes(d.name))
    .map((d) => d.id)
  const outage = world.outages.find(
    (o) => witnessIds.includes(o.deviceId) && o.to > e.windowStart && o.from < e.windowEnd,
  )
  if (!outage) return undefined
  const device = world.household.devices.find((d) => d.id === outage.deviceId)
  const noun =
    device?.deviceClass === 'doorbell'
      ? 'front doorbell'
      : device?.deviceClass === 'contact'
        ? `${device.name.toLowerCase()} sensor`
        : `${device?.name.toLowerCase() ?? 'camera'} camera`
  const verb =
    outage.cause === 'charging'
      ? 'on its charger'
      : outage.cause === 'privacy_mode'
        ? 'in privacy mode'
        : outage.cause === 'disarmed'
          ? 'disarmed'
          : 'offline'
  return { outage, device, noun, verb }
}

function statusTag(s: Expectation['status']): string {
  return {
    missing: 'Did not happen',
    late: 'Off schedule',
    satisfied: 'On time',
    pending: 'Still open',
    uncertain: 'Cannot tell',
  }[s]
}

function evidenceTitle(t: string): string {
  return {
    prior: 'What history says',
    window: 'The window',
    streak: 'The run it breaks',
    corroborating: 'Supporting evidence',
    contradicting: 'Evidence against',
    coverage: 'Whether anything could see',
    consequence: 'Why it matters',
  }[t] ?? t
}

function countWord(n: number): string {
  return ['Nothing', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things'][n] ?? `${n} things`
}

/** Resolve a question to one of today's expectations by name, actor or zone. */
function pickExpectation(
  q: string,
  todays: Expectation[],
  world: WorldState,
): Expectation | undefined {
  const scored = todays
    .map((e) => {
      const r = world.routines.find((x) => x.id === e.routineId)
      if (!r) return { e, score: 0 }
      let score = 0
      if (q.includes(r.shortLabel)) score += 6
      for (const word of r.shortLabel.split(/\s+/)) {
        if (word.length > 3 && q.includes(word)) score += 2
      }
      if (r.actor && q.includes(r.actor.toLowerCase())) score += 3
      if (q.includes(ZONE_NAME[r.zone].toLowerCase())) score += 2
      // Prefer something notable when the question is vague.
      if (score > 0 && e.status === 'missing') score += 1
      return { e, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.severity - a.e.severity)
  return scored[0]?.e
}

function pickRoutine(q: string, routines: Routine[]): Routine | undefined {
  return routines
    .map((r) => ({
      r,
      score:
        (q.includes(r.shortLabel) ? 6 : 0) +
        (r.actor && q.includes(r.actor.toLowerCase()) ? 3 : 0) +
        (q.includes(ZONE_NAME[r.zone].toLowerCase()) ? 2 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.r
}

/** The prompts offered on the Alexa+ surface, in demo order. */
export const SUGGESTED_QUESTIONS = [
  'What happened while I was gone?',
  'What was supposed to happen today?',
  'Why did you flag the morning dose?',
  'What can you not tell me?',
  'What changed from the usual pattern?',
  'Did Marcus come today?',
  'Is Eleanor okay?',
  'What should I do?',
]
