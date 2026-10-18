import { useEffect } from 'react'
import {
  EPISTEMIC_NAME,
  ZONE_NAME,
  clockLabel,
  dayLabel,
  minuteLabel,
  routineBasis,
  weekdayMaskLabel,
} from '../../engine/index.ts'
import { useStore } from '../../state/store.tsx'
import { HistoryStrip } from './HistoryStrip.tsx'
import { Metric, Pill, epistemicTone, severityColor, statusTone, statusWord } from './Primitives.tsx'

/**
 * Everything behind one verdict, in one place.
 *
 * The finding cards in the list deliberately say very little, because a list
 * that argues with you is a list nobody finishes reading. The argument lives
 * here instead, and it is ordered the way a sceptical person would ask for it:
 * what was expected and why, what the history looks like, what could see, and
 * only then what it might be connected to.
 */
export function EvidenceDrawer() {
  const { world, inspectId, setInspectId, setHighlight } = useStore()
  const e = world.expectations.find((x) => x.id === inspectId)
  const r = world.routines.find((x) => x.id === e?.routineId)

  useEffect(() => {
    if (!inspectId) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setInspectId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [inspectId, setInspectId])

  if (!e || !r) return null

  const links = world.correlations.filter((c) => c.expectationIds.includes(e.id))
  const satisfier = world.observations.find((o) => o.id === e.satisfiedById)
  const priors = (e.evidence.flatMap((x) => x.observationIds ?? []) ?? [])
    .map((id) => world.observations.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)

  return (
    <>
      <div className="scrim" onClick={() => setInspectId(null)} />
      <aside className="drawer" role="dialog" aria-label={`Evidence for ${r.label}`}>
        <header className="drawer-head">
          <div className="finding-top" style={{ margin: 0 }}>
            <Pill tone={statusTone(e.status)}>{statusWord(e.status)}</Pill>
            <Pill tone={epistemicTone(e.epistemic)}>{EPISTEMIC_NAME[e.epistemic]}</Pill>
            {e.streak > 0 && <Pill tone="quiet">{e.streak}-day run</Pill>}
          </div>
          <button className="drawer-close" onClick={() => setInspectId(null)} aria-label="Close">
            <svg width="13" height="13" viewBox="0 0 13 13" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <path d="M2 2l9 9M11 2l-9 9" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="drawer-body">
          <h2 className="drawer-title">{r.label}</h2>
          <p className="drawer-sub">
            {ZONE_NAME[r.zone]} · {weekdayMaskLabel(r.weekdays).toLowerCase()} · normally around{' '}
            {minuteLabel(r.expectedMinute)} · {dayLabel(e.dayStart, world.now).toLowerCase()}
          </p>

          <div className="finding-meta" style={{ marginTop: 14 }}>
            {e.status !== 'uncertain' ? (
              <Metric
                label="Severity"
                value={`${e.severity} / 100`}
                bar={{ pct: e.severity, color: severityColor(e.severity) }}
              />
            ) : (
              <Metric
                label="Coverage"
                value={`${Math.round(e.coverageFraction * 100)}%`}
                bar={{ pct: e.coverageFraction * 100, color: 'var(--unknown)' }}
              />
            )}
            <Metric label="Confidence" value={`${Math.round(e.confidence * 100)}%`} />
            <Metric label="Support" value={`${r.observedDays}/${r.eligibleDays} days`} />
            <Metric label="Window" value={`±${Math.round(r.toleranceMin)} min`} />
          </div>

          <HistoryStrip world={world} routine={r} />

          <Block title="Why it was expected">
            <p className="drawer-text">
              Nobody entered this time. It was learned: {routineBasis(r)}. The window is two
              standard deviations wide, which is why a normal early arrival does not trip it.
            </p>
          </Block>

          <Block title="What the evidence says">
            <div className="evidence">
              {e.evidence.map((ev, i) => (
                <div key={i} className={`evidence-row evidence-row--${ev.epistemic}`}>
                  <span className="evidence-kind">{EPISTEMIC_NAME[ev.epistemic]}</span>
                  <span className="evidence-text">{ev.text}</span>
                </div>
              ))}
            </div>
          </Block>

          {satisfier && (
            <Block title="What satisfied it">
              <p className="drawer-text">
                {clockLabel(satisfier.ts)}, {ZONE_NAME[satisfier.zone].toLowerCase()},{' '}
                {satisfier.kind.replace('_', ' ')}
                {satisfier.actor ? `, ${satisfier.actor}` : ''}. Detector confidence{' '}
                {Math.round(satisfier.confidence * 100)}%.
              </p>
            </Block>
          )}

          {priors.length > 0 && (
            <Block title="Recent occurrences it was learned from">
              <div className="prior-list">
                {priors.map((o) => (
                  <button
                    key={o.id}
                    className="prior"
                    onClick={() =>
                      setHighlight({ observationIds: [o.id], expectationIds: [], noveltyIds: [] })
                    }
                  >
                    <span className="num">{dayLabel(o.ts, world.now)}</span>
                    <span className="num prior-time">{clockLabel(o.ts)}</span>
                  </button>
                ))}
              </div>
            </Block>
          )}

          {links.length > 0 && (
            <Block title="What it may be connected to">
              {links.map((c) => (
                <div key={c.id} className="link-card" style={{ marginBottom: 8 }}>
                  <div className="finding-top" style={{ marginBottom: 7 }}>
                    <Pill tone="unknown">{c.kind}</Pill>
                    <Pill tone="quiet">{Math.round(c.strength * 100)}% link</Pill>
                  </div>
                  <p className="link-hypo">{c.hypothesis}</p>
                  <p className="link-basis">{c.basis}</p>
                </div>
              ))}
            </Block>
          )}

          <Block title="If you disagree">
            <p className="drawer-text">
              The weighting for this routine is yours to set, not the system's. Lower it in
              “What it learned” and this finding drops down the list immediately. AFTERIMAGE works
              out what recurs; it cannot work out what it costs you when it does not.
            </p>
          </Block>
        </div>
      </aside>
    </>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="drawer-block">
      <h3 className="drawer-block-title">{title}</h3>
      {children}
    </section>
  )
}
