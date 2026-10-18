import { useMemo } from 'react'
import {
  ZONE_NAME,
  clockLabel,
  dayDeparture,
  durationLabel,
  minuteOfDay,
  relativeLabel,
  routineBasis,
  startOfLocalDay,
  type Expectation,
} from '../../engine/index.ts'
import { DEMO_MINUTE_OF_DAY, useStore } from '../../state/store.tsx'
import { DayDial } from '../components/DayDial.tsx'
import { FindingCard } from '../components/FindingCard.tsx'
import { Pill, SupportRing } from '../components/Primitives.tsx'

const ORDER: Record<Expectation['status'], number> = {
  missing: 0,
  uncertain: 1,
  late: 2,
  pending: 3,
  satisfied: 4,
}

const JUMPS = [
  { label: '6:00a', m: 360 },
  { label: '9:00a', m: 540 },
  { label: '3:30p', m: 930 },
  { label: '7:45p', m: DEMO_MINUTE_OF_DAY },
  { label: '10:30p', m: 1350 },
]

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
    scrubTo,
    commitScrub,
    consequenceOverrides,
    setConsequence,
  } = useStore()

  const today = useMemo(() => {
    const dayStart = startOfLocalDay(world.now)
    return world.expectations
      .filter((e) => e.dayStart === dayStart)
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.severity - a.severity)
  }, [world])

  const routine = (id: string) => world.routines.find((r) => r.id === id)!
  const missing = today.filter((e) => e.status === 'missing')
  const uncertain = today.filter((e) => e.status === 'uncertain')
  const normal = today.filter((e) => e.status === 'satisfied' || e.status === 'pending')
  const departure = dayDeparture(world)
  const links = world.correlations.filter((c) => c.strength >= 0.35).slice(0, 4)
  const nowMin = minuteOfDay(world.now)

  const toggle = (e: Expectation) => {
    if (selectedId === e.id) {
      setSelectedId(null)
      setHighlight({ observationIds: [], expectationIds: [], noveltyIds: [] })
      return
    }
    setSelectedId(e.id)
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

  const jump = (m: number) => {
    scrubTo(m)
    commitScrub()
  }

  return (
    <div className="console">
      <div className="console-main">
        <header className="hero">
          <span className="hero-kicker">{world.household.residentName}'s house · Tuesday</span>
          <h1 className="hero-title">
            {missing.length === 0 ? (
              <>Today looks like every other day here.</>
            ) : (
              <>
                {COUNT[missing.length] ?? String(missing.length)}{' '}
                {missing.length === 1 ? 'thing that normally happens' : 'things that normally happen'}{' '}
                <em>did not happen</em> today.
              </>
            )}
          </h1>
        </header>
        <p className="hero-sub">
          AFTERIMAGE learned {world.routines.length} routines from{' '}
          {world.observations.length.toLocaleString()} Ring events over twenty-one days. Nobody
          entered a schedule. Every verdict below is checkable, and the ones it cannot support, it
          refuses to make.
        </p>

        <div className="stage-grid">
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

          <div className="readout">
            <div className="stat-row" style={{ margin: 0 }}>
              <Stat value={String(missing.length)} label="Did not happen" tone="expected" />
              <Stat value={String(uncertain.length)} label="Cannot judge" tone="unknown" />
              <Stat value={String(world.novelties.length)} label="No precedent" tone="expected" />
              <Stat value={String(departure)} label="Departure" tone={departure > 60 ? 'critical' : 'ok'} />
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

            <div>
              <div className="section-head" style={{ marginBottom: 9 }}>
                <h2 className="section-title">Move the clock</h2>
                <span className="section-note">drag the hand, or jump</span>
              </div>
              <div className="jump-row">
                {JUMPS.map((j) => (
                  <button
                    key={j.label}
                    className="jump"
                    aria-pressed={Math.abs(nowMin - j.m) < 8}
                    onClick={() => jump(j.m)}
                  >
                    {j.label}
                  </button>
                ))}
              </div>
              <p className="switch-note" style={{ marginTop: 9 }}>
                At 9:00a the dose is still an open window and nothing is wrong. At 10:30p the
                deadbolt becomes the fifth absence. The verdicts are recomputed at whatever moment
                the hand is on.
              </p>
            </div>

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

        <Section
          title="Findings"
          note="Ranked by consequence, not confidence. Click any card for the evidence."
        >
          <div className="cards">
            {today
              .filter((e) => e.status !== 'satisfied' && e.status !== 'pending')
              .map((e) => (
                <FindingCard
                  key={e.id}
                  world={world}
                  expectation={e}
                  routine={routine(e.routineId)}
                  expanded={selectedId === e.id}
                  selected={selectedId === e.id}
                  onToggle={() => toggle(e)}
                />
              ))}
          </div>
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
            {world.novelties.map((n) => {
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
            {world.novelties.length === 0 && (
              <p className="empty">Nothing today is unlike the last three weeks.</p>
            )}
          </div>
        </Section>

        <Section
          title="Normal today"
          note="Shown on purpose. A system that only ever reports problems gives you no way to calibrate it."
        >
          <div className="cards">
            {normal.map((e) => (
              <FindingCard
                key={e.id}
                world={world}
                expectation={e}
                routine={routine(e.routineId)}
                expanded={selectedId === e.id}
                selected={selectedId === e.id}
                onToggle={() => toggle(e)}
              />
            ))}
          </div>
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
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-3)' }}>
              Lives alone · {world.household.devices.length} Ring devices ·{' '}
              {world.routines.length} learned routines
            </p>
            <div style={{ marginTop: 12, borderTop: '1px solid var(--line-soft)', paddingTop: 6 }}>
              {world.household.circle.map((p) => (
                <div key={p.name} className="circle-row">
                  <span className="avatar">{p.name[0]}</span>
                  <span>
                    <span style={{ fontSize: 13.5 }}>{p.name}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-3)' }}>
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
            <p style={{ margin: '0 0 11px', fontSize: 13, color: 'var(--text-2)' }}>
              The same findings, by voice. Every answer is assembled from the structures on this
              page, so the two can never disagree.
            </p>
            <button className="btn btn--primary" onClick={() => setSurface('alexa')}>
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
                <SupportRing
                  value={r.support}
                  tone={r.consequence > 0.7 ? 'critical' : r.consequence > 0.45 ? 'expected' : 'observed'}
                />
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
                  <p key={o.id} style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--text-2)' }}>
                    <span className="mono" style={{ color: 'var(--unknown)' }}>
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

function Stat({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="stat">
      <div className="stat-value" style={{ color: `var(--${tone})` }}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
