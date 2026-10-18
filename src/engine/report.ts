import type { WorldState } from './types.ts'
import { ZONE_NAME } from './labels.ts'
import { clockLabel, minuteLabel, startOfLocalDay } from './time.ts'

/**
 * The day, as data somebody else can use.
 *
 * A care agency's own systems, a clinician's notes, a spreadsheet a family
 * keeps: none of them are going to read this interface. Everything on screen
 * is derived from the world state, so it can all be written out, and a finding
 * that cannot be exported is a finding that stays trapped in a demo.
 */
export function buildDayReport(world: WorldState) {
  const dayStart = startOfLocalDay(world.now)
  const todays = world.expectations.filter((e) => e.dayStart === dayStart)
  const routine = (id: string) => world.routines.find((r) => r.id === id)

  return {
    generatedAt: new Date(world.now).toISOString(),
    household: {
      resident: world.household.residentName,
      devices: world.household.devices.length,
      learnedRoutines: world.routines.length,
      observationsConsidered: world.observations.length,
    },
    expectations: todays.map((e) => {
      const r = routine(e.routineId)
      return {
        id: e.id,
        label: r?.label,
        zone: r ? ZONE_NAME[r.zone] : undefined,
        status: e.status,
        epistemic: e.epistemic,
        expectedAt: new Date(e.expectedAt).toISOString(),
        windowMinutes: r ? Math.round(r.toleranceMin) : undefined,
        severity: e.severity,
        confidence: Number(e.confidence.toFixed(3)),
        coverage: Number(e.coverageFraction.toFixed(3)),
        witnesses: e.witnesses,
        streakBroken: e.status === 'missing' ? e.streak : undefined,
        learnedFrom: r ? `${r.observedDays}/${r.eligibleDays} days` : undefined,
        evidence: e.evidence.map((x) => ({ epistemic: x.epistemic, text: x.text })),
      }
    }),
    unexplained: world.novelties.map((n) => {
      const o = world.observations.find((x) => x.id === n.observationId)
      return {
        at: o ? new Date(o.ts).toISOString() : undefined,
        zone: o ? ZONE_NAME[o.zone] : undefined,
        rarity: Number(n.rarity.toFixed(2)),
        reasons: n.reasons,
        text: n.text,
      }
    }),
    links: world.correlations.map((c) => ({
      kind: c.kind,
      strength: Number(c.strength.toFixed(2)),
      hypothesis: c.hypothesis,
      basis: c.basis,
    })),
  }
}

const CSV_COLUMNS = [
  'Verdict',
  'Expectation',
  'Zone',
  'Expected',
  'Window (min)',
  'Severity',
  'Confidence',
  'Coverage',
  'Support',
] as const

/** RFC 4180 quoting, because labels contain commas and apostrophes. */
function csvCell(v: string | number | undefined): string {
  const s = v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildFindingsCsv(world: WorldState): string {
  const dayStart = startOfLocalDay(world.now)
  const rows = world.expectations.filter((e) => e.dayStart === dayStart)
  const lines = [CSV_COLUMNS.join(',')]

  for (const e of rows) {
    const r = world.routines.find((x) => x.id === e.routineId)
    lines.push(
      [
        e.status,
        r?.label,
        r ? ZONE_NAME[r.zone] : '',
        clockLabel(e.expectedAt),
        r ? Math.round(r.toleranceMin) : '',
        e.severity,
        Math.round(e.confidence * 100) + '%',
        Math.round(e.coverageFraction * 100) + '%',
        r ? `${r.observedDays}/${r.eligibleDays}` : '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\n')
}

export function reportFilename(world: WorldState, ext: string): string {
  const d = new Date(world.now)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  return `afterimage-${world.household.residentName.toLowerCase()}-${stamp}.${ext}`
}

/** Human summary used as the export's first line and in the share dialog. */
export function reportHeadline(world: WorldState): string {
  const dayStart = startOfLocalDay(world.now)
  const todays = world.expectations.filter((e) => e.dayStart === dayStart)
  const missing = todays.filter((e) => e.status === 'missing')
  if (!missing.length) return `Nothing unusual as of ${clockLabel(world.now)}.`
  const worst = [...missing].sort((a, b) => b.severity - a.severity)[0]
  const r = world.routines.find((x) => x.id === worst.routineId)
  return `${missing.length} expected ${
    missing.length === 1 ? 'event' : 'events'
  } did not happen, the most important being the ${r?.shortLabel ?? 'first'} at ${minuteLabel(
    r?.expectedMinute ?? 0,
  )}.`
}
