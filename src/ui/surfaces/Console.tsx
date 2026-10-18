import { useMemo, useState } from 'react'
import {
  ZONE_NAME,
  clockLabel,
  dayDeparture,
  durationLabel,
  relativeLabel,
  routineBasis,
  startOfLocalDay,
  reportHeadline,
  type Expectation,
  type ExpectationStatus,
} from '../../engine/index.ts'
import { useStore } from '../../state/store.tsx'
import { DayDial } from '../components/DayDial.tsx'
import { FindingsTable } from '../components/FindingsTable.tsx'
import { FindingsToolbar } from '../components/FindingsToolbar.tsx'
import { FloorPlan } from '../components/FloorPlan.tsx'
import { Transport } from '../components/Transport.tsx'
import { Pill } from '../components/Primitives.tsx'

const ORDER: Record<Expectation['status'], number> = {
  missing: 0,
  uncertain: 1,
  late: 2,
  pending: 3,
  satisfied: 4,
}

/**
 * The surface a family opens on a phone or a laptop. One question, one screen:
 * is today unusual, and if so, what do I look at first.
 */
export function Console() {
  const {
    world,
    highlight,
    setHighlight,
    selectedId,
    setSelectedId,
    setSurface,
    ghostLayer,
    setGhostLayer,
    consequenceOverrides,
    setConsequence,
    consoleView,
    setConsoleView,
    focusZone,
    setFocusZone,
    setInspectId,
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
  const toggleStatus = (st: ExpectationStatus) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(st)) next.delete(st)
      else next.add(st)
      return next
    })

  const counts = today.reduce(
    (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
    {} as Record<ExpectationStatus, number>,
  )
  const outstanding = today.filter((e) => e.status !== 'satisfied' && e.status !== 'pending')
  const missing = today.filter((e) => e.status === 'missing')
  const uncertain = today.filter((e) => e.status === 'uncertain')
  const normal = today.filter((e) => e.status === 'satisfied' || e.status === 'pending')
  const departure = dayDeparture(world)
  const links = world.correlations.filter((c) => c.strength >= 0.35).slice(0, 4)
  const novelties = world.novelties.filter((n) => {
    if (!focusZone) return true
    return world.observations.find((o) => o.id === n.observationId)?.zone === focusZone
  })

  const toggle = (e: Expectation) => {
    setSelectedId(e.id)
    setInspectId(e.id)
    const related = world.correlations.filter((c) => c.expectationIds.includes(e.id))
    setHighlight({
      observationIds: [
        ...e.evidence.flatMap((x) => x.observationIds ?? []),
        ...(e.satisfiedById ? [e.satisfiedById] : []),
        ...related.flatMap((c) =>
          c.noveltyIds.map((n) => world.novelties.find((x) => x.id === n)?.observationId ?? ''),
        ),
      ].filter(Boolean),
      expectationIds: [e.id, ...related.flatMap((c) => c.expectationIds)],
      noveltyIds: related.flatMap((c) => c.noveltyIds),
    })
  }

  return (
    <div className="console">
      <div className="console-main">
        <header className="pagehead">
          <div>
            <span className="pagehead-kicker">
              {world.household.residentName}'s house ·{' '}
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
                    if (e) toggle(e)
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
                  if (e) toggle(e)
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

            <div className="figures">
              <Figure value={String(missing.length)} label="did not happen" tone="expected" />
              <Figure value={String(uncertain.length)} label="cannot judge" tone="unknown" />
              <Figure value={String(world.novelties.length)} label="no precedent" tone="expected" />
              <Figure
                value={String(departure)}
                label="departure from normal"
                tone={departure > 60 ? 'critical' : 'ok'}
              />
            </div>

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
                  Off, the dial shows only what Ring recorded, which is everything any other system
                  has. On, it draws the afterimages.
                </span>
              </span>
            </div>

            <Transport />

            <div className="legend-stack">
              <span className="legend-item">
                <span className="legend-swatch legend-swatch--observed" />
                <span>
                  Observed
                  <small>A device recorded it. There is footage.</small>
                </span>
              </span>
              <span className="legend-item">
                <span className="legend-swatch legend-swatch--expected" />
                <span>
                  Expected
                  <small>This household's own history insisted on it. Nothing satisfied it.</small>
                </span>
              </span>
              <span className="legend-item">
                <span className="legend-swatch legend-swatch--unknown" />
                <span>
                  Unknown
                  <small>Nothing could see. No claim is permitted here.</small>
                </span>
              </span>
            </div>
          </div>
        </div>

        {focusZone && (
          <button className="focusbar" onClick={() => setFocusZone(null)}>
            <Pill tone="observed">Filtered</Pill>
            <span>
              Showing the {ZONE_NAME[focusZone].toLowerCase()} only. Click to show the whole house.
            </span>
          </button>
        )}

        <Section
          title="Findings"
          note="Ranked by consequence, not confidence. Click a row for the evidence, or sort by any column."
        >
          <FindingsToolbar
            world={world}
            query={query}
            setQuery={setQuery}
            active={new Set(
              (Object.keys(counts) as ExpectationStatus[]).filter((st) => !hidden.has(st)),
            )}
            toggleStatus={toggleStatus}
            shown={outstanding.filter(visible).length}
            total={outstanding.length}
            counts={counts}
          />
          <FindingsTable
            world={world}
            rows={outstanding.filter(visible)}
            selectedId={selectedId}
            onPick={toggle}
            keyboard
          />
        </Section>

        {links.length > 0 && (
          <Section
            title="How the findings relate"
            note="Each link states the statistic that produced it, so it can be argued with."
          >
            <div className="cards">
              {links.map((c) => (
                <button
                  key={c.id}
                  className="link-card link-card--button"
                  onClick={() =>
                    setHighlight({
                      observationIds: c.noveltyIds
                        .map((n) => world.novelties.find((x) => x.id === n)?.observationId ?? '')
                        .filter(Boolean),
                      expectationIds: c.expectationIds,
                      noveltyIds: c.noveltyIds,
                    })
                  }
                >
                  <div className="finding-top" style={{ marginBottom: 7 }}>
                    <Pill tone="unknown">{c.kind}</Pill>
                    <Pill tone="quiet">{Math.round(c.strength * 100)}% link</Pill>
                  </div>
                  <p className="link-hypo">{c.hypothesis}</p>
                  <p className="link-basis">{c.basis}</p>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section
          title="Events with no precedent"
          note="Scored against this household's own history, not a global idea of suspicious."
        >
          <div className="cards">
            {novelties.map((n) => {
              const o = world.observations.find((x) => x.id === n.observationId)!
              return (
                <button
                  key={n.id}
                  className="link-card link-card--button"
                  style={{ borderLeftColor: 'var(--expected)' }}
                  onClick={() => {
                    setSelectedId(null)
                    setHighlight({
                      observationIds: [o.id],
                      expectationIds: world.correlations
                        .filter((c) => c.noveltyIds.includes(n.id))
                        .flatMap((c) => c.expectationIds),
                      noveltyIds: [n.id],
                    })
                  }}
                >
                  <div className="finding-top" style={{ marginBottom: 7 }}>
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
        </Section>

        <Section
          title="Normal today"
          note="Shown on purpose. A system that only ever reports problems gives you no way to calibrate it."
        >
          <FindingsTable
            world={world}
            rows={normal.filter(visible)}
            selectedId={selectedId}
            onPick={toggle}
          />
        </Section>
            </div>

      <aside className="console-side">
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <span className="panel-title">Household</span>
          </div>
          <div style={{ padding: '12px 16px 14px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>
              {world.household.residentName}, {world.household.residentAge}
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
              Lives alone · {world.household.devices.length} Ring devices ·{' '}
              {world.routines.length} learned routines
            </p>
            <div style={{ marginTop: 12, borderTop: '1px solid var(--rule-soft)', paddingTop: 6 }}>
              {world.household.circle.map((p) => (
                <div key={p.name} className="circle-row">
                  <span className="avatar">{p.name[0]}</span>
                  <span>
                    <span style={{ fontSize: 13.5 }}>{p.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-3)' }}>
                      {p.relation} · {p.channel}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <span className="panel-title">Ask Alexa+</span>
          </div>
          <div style={{ padding: '12px 16px 15px' }}>
            <p style={{ margin: '0 0 11px', fontSize: 13, color: 'var(--ink-2)' }}>
              The same findings, by voice. Every answer is assembled from the structures on this
              page, so the two can never disagree.
            </p>
            <button className="chip" onClick={() => setSurface('alexa')}>
              Ask: “Why did you flag the morning dose?”
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">What it learned</span>
            <span className="panel-note">drag to re-weight</span>
          </div>
          <div style={{ padding: '6px 16px 12px' }}>
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
            <p className="link-basis" style={{ marginTop: 12 }}>
              AFTERIMAGE learns what recurs. It cannot learn what a missed dose costs, so it does not
              pretend to. Drag a slider and the findings above re-rank immediately.
            </p>
            <p className="link-basis" style={{ marginTop: 8 }}>
              Ring also sees the neighbour's cat most evenings and a car on the road most
              afternoons. Neither became a routine: their timing is too formless to make a claim
              about, so nobody is ever asked about them.
            </p>
          </div>
        </div>

        <div className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <span className="panel-title">Coverage</span>
          </div>
          <div style={{ padding: '10px 16px 14px' }}>
            {world.outages
              .filter((o) => o.to > startOfLocalDay(world.now))
              .map((o) => {
                const d = world.household.devices.find((x) => x.id === o.deviceId)
                return (
                  <p key={o.id} style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ink-2)' }}>
                    <span className="num" style={{ color: 'var(--unknown)' }}>
                      {clockLabel(o.from)} to {clockLabel(o.to)}
                    </span>{' '}
                    {d?.name} {o.cause.replace('_', ' ')} · {relativeLabel(o.to, world.now)}
                  </p>
                )
              })}
            <p className="link-basis" style={{ margin: 0 }}>
              Everything inside a coverage gap is reported as unknown. It is the one case where the
              correct output is an admission.
            </p>
          </div>
        </div>
      </aside>
    </div>
  )
}

const COUNT: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {note && <span className="section-note">{note}</span>}
      </div>
      {children}
    </section>
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
