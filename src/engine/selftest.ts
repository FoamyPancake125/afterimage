/**
 * Engine self-test. Run with `npm run engine:test`.
 *
 * These are the claims the product makes. If any of them stops holding, the
 * demo is lying and the assertions below should fail loudly.
 */
import { buildWorld, INJECTABLE, buildHistory, buildOutages, HOUSEHOLD } from './index.ts'
import { DAY, DEMO_NOW, minuteLabel, MIN, routineHistory, startOfLocalDay } from './index.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? `: ${detail}` : ''}`)
  }
}

const w = buildWorld()

console.log(`\nAFTERIMAGE engine self-test`)
console.log(`${w.observations.length} observations, ${w.routines.length} routines learned\n`)

console.log('Learned routines')
for (const r of w.routines) {
  console.log(
    `  ${minuteLabel(r.expectedMinute).padStart(8)} ±${String(Math.round(r.toleranceMin)).padStart(3)}m  ` +
      `sup ${(r.support * 100).toFixed(0).padStart(3)}%  conf ${r.confidence.toFixed(2)}  ` +
      `cons ${r.consequence.toFixed(2)}  ${r.label}`,
  )
}

console.log('\nToday')
const today = w.expectations.filter((e) => e.dayStart === new Date(2026, 9, 20).getTime())
for (const e of today.sort((a, b) => b.severity - a.severity)) {
  const r = w.routines.find((x) => x.id === e.routineId)!
  console.log(
    `  ${e.status.padEnd(9)} sev ${String(e.severity).padStart(3)}  conf ${e.confidence.toFixed(2)}  ${r.label}`,
  )
}

console.log('\nNovelties')
for (const n of w.novelties) console.log(`  ${n.rarity.toFixed(2)}  ${n.text}`)

console.log('\nCorrelations')
for (const c of w.correlations) console.log(`  ${c.strength.toFixed(2)} ${c.kind.padEnd(13)} ${c.hypothesis}`)

console.log('\nAssertions')

const sig = (s: string) => w.routines.find((r) => r.signature.startsWith(s))
const statusOf = (s: string) => {
  const r = sig(s)
  return r ? today.find((e) => e.routineId === r.id)?.status : undefined
}

check('learns the medicine cabinet routine', !!sig('cabinet_open|medicine_cabinet'))
check('learns the caregiver arrival routine', !!sig('person|front_door|Marcus'))
check('learns the evening deadbolt routine', !!sig('lock|front_door'))
check(
  'rejects the neighbour cat as a routine (negative control)',
  !w.routines.some((r) => r.signature.startsWith('pet|')),
  w.routines.filter((r) => r.signature.startsWith('pet|')).map((r) => r.label).join(', '),
)
check(
  'rejects unstructured background motion as a routine',
  !w.routines.some((r) => r.signature.startsWith('motion|driveway') || r.signature.startsWith('motion|hallway')),
)
check(
  'splits the caregiver signature into arrival and departure',
  w.routines.filter((r) => r.signature === 'person|front_door|Marcus').length === 2,
)

check('missed dose is reported missing', statusOf('cabinet_open|medicine_cabinet') === 'missing')
check(
  'caregiver arrival is reported missing',
  today.some((e) => {
    const r = w.routines.find((x) => x.id === e.routineId)
    return r?.signature === 'person|front_door|Marcus' && e.status === 'missing'
  }),
)
check('mail delivery is satisfied, not flagged', statusOf('package|front_door') === 'satisfied')
check('the late garden door is late, not missing', statusOf('door_open|back_patio') === 'late')
check(
  'the evening deadbolt is pending, not missing',
  statusOf('lock|front_door') === 'pending',
)
check(
  'the walk is uncertain because the doorbell was charging',
  statusOf('person|front_door|Eleanor') === 'uncertain',
)
check(
  'the uncertain finding carries unknown epistemics',
  today.find((e) => e.status === 'uncertain')?.epistemic === 'unknown',
)
check(
  'the missed dose outranks the missed mail on severity',
  (today.find((e) => w.routines.find((x) => x.id === e.routineId)?.signature.startsWith('cabinet_open'))
    ?.severity ?? 0) >
    (today.find((e) => w.routines.find((x) => x.id === e.routineId)?.signature.startsWith('package'))
      ?.severity ?? 0),
)

check('flags the 3 AM patio door as novel', w.novelties.some((n) => n.reasons.includes('unusual_hour')))
check(
  'flags the unfamiliar vehicle as never seen before',
  w.novelties.some((n) => n.reasons.includes('unseen_signature') && n.text.includes('driveway')),
)
check('does not flag the on-time breakfast as novel', !w.novelties.some((n) => n.text.includes('kitchen')))

check(
  'links the missed dose to the absent caregiver',
  w.correlations.some((c) => c.kind === 'precondition' && c.hypothesis.includes('morning dose')),
)
check(
  'the causal link is justified by timing coupling, not by co-occurrence',
  w.correlations
    .filter((c) => c.kind === 'precondition')
    .every((c) => /varying by only ±/.test(c.basis)),
)
check(
  'the uncertain finding reports its coverage',
  (today.find((e) => e.status === 'uncertain')?.coverageFraction ?? 1) < 0.4,
)
check(
  'findings that were fully witnessed report full coverage',
  today
    .filter((e) => e.status === 'missing')
    .every((e) => e.coverageFraction > 0.99 && e.witnesses.length > 0),
)
check(
  'no generated sentence lower-cases a person\'s name',
  !w.correlations.some((c) => /\b(marcus|eleanor|ruth)\b/.test(c.hypothesis + c.basis)),
)
check('every correlation states its basis', w.correlations.every((c) => c.basis.length > 20))
check('every finding carries at least two pieces of evidence',
  today.filter((e) => e.status !== 'satisfied' && e.status !== 'pending').every((e) => e.evidence.length >= 2))

// Every control in the Ring simulator claims a specific consequence on its
// face. These assertions hold the UI to that claim, so a demo button can never
// quietly become a button that does nothing.
// An occurrence that happened, just outside the learned window, must never be
// reported as an absence. The window is two standard deviations wide, so a
// normal five percent of real occurrences fall outside it, and calling those
// "did not happen" is the single fastest way to make the product untrustworthy.
console.log('\nOff-schedule handling')
{
  const dose = w.routines.find((r) => r.signature.startsWith('cabinet_open'))!
  const hist = routineHistory(dose, w.observations, w.outages, w.household.devices, w.now, 21)
  const todayStart = new Date(2026, 9, 20).getTime()
  const wronglyMissing = hist.filter(
    (e) =>
      e.dayStart !== todayStart &&
      e.status === 'missing' &&
      w.observations.some(
        (o) => o.kind === 'cabinet_open' && o.ts >= e.dayStart && o.ts < e.dayStart + DAY,
      ),
  )
  check(
    'a day when the dose was taken is never reported as missing',
    wronglyMissing.length === 0,
    `${wronglyMissing.length} day(s) marked missing despite a recorded dose`,
  )
  check(
    'only today is missing across the dose history',
    hist.filter((e) => e.status === 'missing').length === 1,
    `${hist.filter((e) => e.status === 'missing').length} missing days`,
  )
  check(
    'an early occurrence is reported as off schedule with a negative offset',
    hist.filter((e) => e.status === 'late').every((e) => e.latenessMin !== undefined),
  )
}

console.log('\nSimulator controls')
{
  const base = buildHistory(DEMO_NOW)
  const outages = buildOutages(DEMO_NOW)
  const before = buildWorld({ now: DEMO_NOW, household: HOUSEHOLD, observations: base, outages })
  const beforeById = new Map(before.expectations.map((x) => [x.id, x]))

  const effectOf = (e: (typeof INJECTABLE)[number]) => {
    const ts = e.atMinute === undefined ? DEMO_NOW : startOfLocalDay(DEMO_NOW) + e.atMinute * MIN
    const after = buildWorld({
      now: Math.max(DEMO_NOW, ts),
      household: HOUSEHOLD,
      observations: [
        ...base,
        {
          id: 'probe',
          ts,
          deviceId: e.deviceId,
          zone: e.zone,
          kind: e.kind,
          actor: e.actor,
          durationS: e.durationS,
          confidence: 0.88,
        },
      ],
      outages,
    })
    return {
      flips: after.expectations.filter(
        (x) => beforeById.get(x.id) && beforeById.get(x.id)!.status !== x.status,
      ).length,
      novelties: after.novelties.length - before.novelties.length,
      links: after.correlations.length - before.correlations.length,
    }
  }

  for (const e of INJECTABLE) {
    const r = effectOf(e)
    const quiet = e.id === 'kitchen_now'
    const did = r.flips > 0 || r.novelties > 0 || r.links > 0
    check(
      `“${e.label}” ${quiet ? 'correctly changes nothing' : 'changes something'}`,
      quiet ? !did : did,
      `flips ${r.flips}, novelties +${r.novelties}, links +${r.links}`,
    )
  }

  check(
    'the deadbolt control satisfies the open expectation',
    effectOf(INJECTABLE.find((e) => e.id === 'lock_now')!).flips === 1,
  )
  check(
    'an off-hours visit by a known person is flagged even though the zone is busy',
    effectOf(INJECTABLE.find((e) => e.id === 'marcus_now')!).novelties === 1,
  )
}

// Removing the doorbell's charging window must turn the one unknowable finding
// into a real absence. This is the trust argument, so it is a test.
{
  const base = buildHistory(DEMO_NOW)
  const all = buildOutages(DEMO_NOW)
  const blind = buildWorld({ now: DEMO_NOW, household: HOUSEHOLD, observations: base, outages: all })
  const seeing = buildWorld({
    now: DEMO_NOW,
    household: HOUSEHOLD,
    observations: base,
    outages: all.filter((o) => o.id !== 'g1'),
  })
  const walk = seeing.routines.find((r) => r.signature === 'person|front_door|Eleanor')!
  const a = blind.expectations.find((e) => e.routineId === walk.id && e.dayStart === new Date(2026, 9, 20).getTime())
  const b = seeing.expectations.find((e) => e.routineId === walk.id && e.dayStart === new Date(2026, 9, 20).getTime())
  check(
    'restoring coverage turns “cannot tell” into a real absence',
    a?.status === 'uncertain' && b?.status === 'missing',
    `${a?.status} to ${b?.status}`,
  )
}

console.log(failures === 0 ? '\nAll assertions passed.\n' : `\n${failures} assertion(s) failed.\n`)
process.exit(failures === 0 ? 0 : 1)
