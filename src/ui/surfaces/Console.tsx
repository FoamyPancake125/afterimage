import { useMemo, useState } from 'react'
import {
  ZONE_NAME,
  clockLabel,
  dayDeparture,
  durationLabel,
  relativeLabel,
  reportHeadline,
  routineBasis,
  startOfLocalDay,
  type Expectation,
  type ExpectationStatus,
} from '../../engine/index.ts'
import { useStore, type ConsolePage } from '../../state/store.tsx'
import { DayDial } from '../components/DayDial.tsx'
import { Escalation } from '../components/Escalation.tsx'
import { FindingsTable } from '../components/FindingsTable.tsx'
import { FindingsToolbar } from '../components/FindingsToolbar.tsx'
import { FloorPlan } from '../components/FloorPlan.tsx'
import { Transport } from '../components/Transport.tsx'
import { WeekStrip } from '../components/WeekStrip.tsx'
import { Pill } from '../components/Primitives.tsx'

const ORDER: Record<ExpectationStatus, number> = {
  missing: 0,
  uncertain: 1,
  late: 2,
  pending: 3,
  satisfied: 4,
}

const COUNT: Record<number, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six' }

/**
 * The console, as five pages rather than one.
 *
 * Everything here used to be stacked on a single scroll with a sidebar beside
 * it, which meant the screen was always answering five questions at once and
 * none of them clearly. Each page now answers one: what the day looked like,
 * what is outstanding, who gets told, what the house has learned, and what has
 * no precedent. Navigating costs a click, which is cheaper than reading past
 * four sections to reach the one you wanted.
 */
export function Console() {
  const {
    world,
    highlight,
    setHighlight,
    selectedId,
    setSelectedId,
    ghostLayer,
    setGhostLayer,
    consoleView,
    setConsoleView,
    consolePage,
    setConsolePage,
    focusZone,
    setFocusZone,
    setInspectId,
    consequenceOverrides,
    setConsequence,
    ackedIds,
    notifications,
  } = useStore()

  const [query, setQuery] = useState('')
  const [hidden, setHidden] = useState<Set<ExpectationStatus>>(new Set())

  const today = useMemo(() => {
    const dayStart = startOfLocalDay(world.now)
    return world.expectations
      .filter((e) => e.dayStart === dayStart)
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.severity - a.severity)
  }, [world])

  const routine = (id: string) => world.routines.find((r) => r.id === id)!
  const inFocus = (e: Expectation) => !focusZone || routine(e.routineId).zone === focusZone
  const matchesQuery = (e: Expectation) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    const r = routine(e.routineId)
    return `${r.label} ${r.shortLabel} ${r.actor ?? ''} ${ZONE_NAME[r.zone]}`.toLowerCase().includes(q)
  }
  const visible = (e: Expectation) => inFocus(e) && matchesQuery(e) && !hidden.has(e.status)

  const missing = today.filter((e) => e.status === 'missing' && !ackedIds.has(e.id))
  const uncertain = today.filter((e) => e.status === 'uncertain')
  const normal = today.filter((e) => e.status === 'satisfied' || e.status === 'pending')
  const outstanding = today.filter((e) => e.status !== 'satisfied' && e.status !== 'pending')
  const counts = today.reduce(
    (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
    {} as Record<ExpectationStatus, number>,
  )
  const novelties = world.novelties.filter((n) => {
    if (!focusZone) return true
    return world.observations.find((o) => o.id === n.observationId)?.zone === focusZone
  })
  const links = world.correlations.filter((c) => c.strength >= 0.35)
  const departure = dayDeparture(world)
  const pending = notifications.filter((n) => !n.suppressed).length

  const open = (e: Expectation) => {
    setSelectedId(e.id)
    setInspectId(e.id)
    const related = world.correlations.filter((c) => c.expectationIds.includes(e.id))
    setHighlight({
      observationIds: [
        ...e.evidence.flatMap((x) => x.observationIds ?? []),
        ...(e.satisfiedById ? [e.satisfiedById] : []),
      ].filter(Boolean),
      expectationIds: [e.id, ...related.flatMap((c) => c.expectationIds)],
      noveltyIds: related.flatMap((c) => c.noveltyIds),
    })
  }

  const PAGES: { id: ConsolePage; label: string; count?: number }[] = [
    { id: 'today', label: 'Today' },
    { id: 'findings', label: 'Findings', count: outstanding.length },
    { id: 'escalation', label: 'Who gets told', count: pending },
    { id: 'patterns', label: 'Patterns', count: world.routines.length },
    { id: 'unexplained', label: 'Unexplained', count: world.novelties.length },
  ]

  return (
    <div className="page">
      <nav className="subnav" aria-label="Console sections">
        {PAGES.map((p) => (
          <button
            key={p.id}
            className="subnav-item"
            aria-current={consolePage === p.id ? 'page' : undefined}
            onClick={() => setConsolePage(p.id)}
          >
            {p.label}
            {p.count !== undefined && <span className="subnav-count num">{p.count}</span>}
          </button>
        ))}

        {focusZone && (
          <button className="subnav-focus" onClick={() => setFocusZone(null)}>
            {ZONE_NAME[focusZone]} only, clear
          </button>
        )}
      </nav>

      <div className="page-body">
        {consolePage === 'today' && (
          <>
            <header className="pagehead">
              <div>
                <span className="pagehead-kicker">
                  {world.household.residentName}, {world.household.residentAge} ·{' '}
                  {new Date(world.now).toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
                <h1 className="pagehead-title">
                  {missing.length === 0 ? (
                    <>Today looks like every other day here.</>
                  ) : (
                    <>
                      {COUNT[missing.length] ?? String(missing.length)}{' '}
                      {missing.length === 1
                        ? 'thing that normally happens'
                        : 'things that normally happen'}{' '}
                      <em>did not happen</em> today.
                    </>
                  )}
                </h1>
                <p className="pagehead-sub">{reportHeadline(world)}</p>
              </div>
            </header>

            <div className="figures">
              <Figure value={String(missing.length)} label="did not happen" tone="expected" />
              <Figure value={String(uncertain.length)} label="cannot judge" tone="unknown" />
              <Figure value={String(world.novelties.length)} label="no precedent" tone="expected" />
              <Figure value={String(normal.length)} label="ran normally" tone="ok" />
              <Figure
                value={String(departure)}
                label="departure from normal"
                tone={departure > 60 ? 'critical' : 'ok'}
              />
            </div>

            <div className="stage-grid">
              <div className="stage-view">
                {consoleView === 'dial' ? (
                  <DayDial
                    world={world}
                    highlight={highlight}
                    selectedId={selectedId}
                    onPick={(p) => {
                      if (p.kind === 'expectation') {
                        const e = today.find((x) => x.id === p.id)
                        if (e) open(e)
                      } else {
                        setHighlight({ observationIds: [p.id], expectationIds: [], noveltyIds: [] })
                        setSelectedId(null)
                      }
                    }}
                  />
                ) : (
                  <FloorPlan
                    world={world}
                    highlight={highlight}
                    onPick={(p) => {
                      const e = today.find((x) => x.id === p.id)
                      if (e) open(e)
                    }}
                  />
                )}
              </div>

              <div className="readout">
                <div className="viewswitch" role="group" aria-label="View">
                  <button aria-pressed={consoleView === 'dial'} onClick={() => setConsoleView('dial')}>
                    When
                  </button>
                  <button aria-pressed={consoleView === 'plan'} onClick={() => setConsoleView('plan')}>
                    Where
                  </button>
                </div>

                <Transport />

                <div className="switch-row">
                  <button
                    className="switch"
                    role="switch"
                    aria-checked={ghostLayer}
                    aria-label="Show what should have happened"
                    onClick={() => setGhostLayer(!ghostLayer)}
                  />
                  <span>
                    <span className="switch-label">Show what should have happened</span>
                    <span className="switch-note">
                      Off, the dial shows only what Ring recorded, which is everything any other
                      system has.
                    </span>
                  </span>
                </div>

                <div className="legend-stack">
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch--observed" />
                    <span>
                      Observed<small>A device recorded it.</small>
                    </span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch--expected" />
                    <span>
                      Expected<small>This house's own history insisted on it. Nothing satisfied it.</small>
                    </span>
                  </span>
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch--unknown" />
                    <span>
                      Unknown<small>Nothing could see. No claim is permitted.</small>
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </>
        )}

        {consolePage === 'findings' && (
          <>
            <PageIntro
              title="Findings"
              note="Ranked by consequence, not confidence. Click a row for the evidence, sort by any column, or move with j and k."
            />
            <FindingsToolbar
              world={world}
              query={query}
              setQuery={setQuery}
              active={new Set((Object.keys(counts) as ExpectationStatus[]).filter((st) => !hidden.has(st)))}
              toggleStatus={(st) =>
                setHidden((prev) => {
                  const next = new Set(prev)
                  if (next.has(st)) next.delete(st)
                  else next.add(st)
                  return next
                })
              }
              shown={outstanding.filter(visible).length}
              total={outstanding.length}
              counts={counts}
            />
            <FindingsTable
              world={world}
              rows={outstanding.filter(visible)}
              selectedId={selectedId}
              onPick={open}
              keyboard
            />

            <section className="section">
              <div className="section-head">
                <h2 className="section-title">Ran normally</h2>
                <span className="section-note">
                  Shown on purpose. A system that only ever reports problems gives you no way to
                  calibrate it.
                </span>
              </div>
              <FindingsTable world={world} rows={normal.filter(visible)} selectedId={selectedId} onPick={open} />
            </section>
          </>
        )}

        {consolePage === 'escalation' && (
          <>
            <PageIntro
              title="Who gets told"
              note="Detecting an absence is half of it. This is the half that decides whose evening is interrupted."
            />
            <Escalation world={world} />
          </>
        )}

        {consolePage === 'patterns' && (
          <>
            <PageIntro
              title="What the house has learned"
              note="Nobody entered a schedule. Drag a weight and the findings re-rank immediately."
            />

            <div className="panel-head" style={{ marginTop: 'var(--s6)' }}>
              <span className="panel-title">The week behind today</span>
              <span className="panel-note">departure per day</span>
            </div>
            <WeekStrip world={world} />

            <div className="panel-head" style={{ marginTop: 'var(--s8)' }}>
              <span className="panel-title">{world.routines.length} learned routines</span>
              <span className="panel-note">how much each one matters is yours to set</span>
            </div>
            <div className="routine-list">
              {world.routines.map((r) => (
                <div key={r.id} className="routine-row">
                  <span>
                    <span className="routine-name">{r.label}</span>
                    <span className="routine-basis">{routineBasis(r)}</span>
                  </span>
                  <span className="routine-weight">
                    <span>matters</span>
                    <input
                      className="weight"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round((consequenceOverrides[r.id] ?? r.consequence) * 100)}
                      onChange={(e) => setConsequence(r.id, Number(e.target.value) / 100)}
                      aria-label={`How much ${r.shortLabel} matters`}
                    />
                  </span>
                </div>
              ))}
            </div>

            <p className="pagenote">
              Ring also sees the neighbour's cat on the patio most evenings and a car on the road
              most afternoons. Neither became a routine: their timing is too formless to make a
              claim about, so nobody is ever asked about them.
            </p>

            <div className="panel-head" style={{ marginTop: 'var(--s8)' }}>
              <span className="panel-title">Coverage</span>
            </div>
            {world.outages
              .filter((o) => o.to > startOfLocalDay(world.now))
              .map((o) => {
                const d = world.household.devices.find((x) => x.id === o.deviceId)
                return (
                  <p key={o.id} className="pagenote" style={{ marginTop: 'var(--s2)' }}>
                    <span className="num">
                      {clockLabel(o.from)} to {clockLabel(o.to)}
                    </span>{' '}
                    · {d?.name} {o.cause.replace('_', ' ')} · {relativeLabel(o.to, world.now)}.
                    Everything inside a coverage gap is reported as unknown.
                  </p>
                )
              })}
          </>
        )}

        {consolePage === 'unexplained' && (
          <>
            <PageIntro
              title="Events with no precedent"
              note="Scored against this household's own history, not a global idea of suspicious."
            />
            <div className="notes">
              {novelties.map((n) => {
                const o = world.observations.find((x) => x.id === n.observationId)!
                return (
                  <button
                    key={n.id}
                    className="link-card link-card--button"
                    style={{ borderLeftColor: 'var(--expected)' }}
                    onClick={() => {
                      setSelectedId(null)
                      setHighlight({ observationIds: [o.id], expectationIds: [], noveltyIds: [n.id] })
                      setConsolePage('today')
                    }}
                  >
                    <div className="finding-top" style={{ marginBottom: 'var(--s2)' }}>
                      <Pill tone="expected">{Math.round(n.rarity * 100)}% unlike normal</Pill>
                      <Pill tone="quiet">
                        {clockLabel(o.ts)} · {ZONE_NAME[o.zone]}
                      </Pill>
                      {o.durationS ? <Pill tone="quiet">{durationLabel(o.durationS)}</Pill> : null}
                    </div>
                    <p className="link-hypo">{n.text}</p>
                    {o.note && <p className="link-basis">{o.note}</p>}
                  </button>
                )
              })}
              {novelties.length === 0 && (
                <p className="empty">Nothing today is unlike the last three weeks.</p>
              )}
            </div>

            <section className="section">
              <div className="section-head">
                <h2 className="section-title">How the findings relate</h2>
                <span className="section-note">
                  Each link states the statistic that produced it, so it can be argued with.
                </span>
              </div>
              <div className="notes">
                {links.map((c) => (
                  <button
                    key={c.id}
                    className="link-card link-card--button"
                    onClick={() => {
                      setHighlight({
                        observationIds: c.noveltyIds
                          .map((n) => world.novelties.find((x) => x.id === n)?.observationId ?? '')
                          .filter(Boolean),
                        expectationIds: c.expectationIds,
                        noveltyIds: c.noveltyIds,
                      })
                      setConsolePage('today')
                    }}
                  >
                    <div className="finding-top" style={{ marginBottom: 'var(--s2)' }}>
                      <Pill tone="unknown">{c.kind}</Pill>
                      <Pill tone="quiet">{Math.round(c.strength * 100)}% link</Pill>
                    </div>
                    <p className="link-hypo">{c.hypothesis}</p>
                    <p className="link-basis">{c.basis}</p>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function PageIntro({ title, note }: { title: string; note: string }) {
  return (
    <header className="pageintro">
      <h1 className="pageintro-title">{title}</h1>
      <p className="pageintro-note">{note}</p>
    </header>
  )
}

function Figure({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="figure">
      <div className="figure-value" style={{ color: value === '0' ? 'var(--ink-3)' : `var(--${tone})` }}>
        {value}
      </div>
      <div className="figure-label">{label}</div>
    </div>
  )
}
