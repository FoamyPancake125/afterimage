import {
  EPISTEMIC_NAME,
  clockLabel,
  minuteLabel,
  routineBasis,
  type Expectation,
  type Routine,
  type WorldState,
} from '../../engine/index.ts'
import { Metric, Pill, epistemicTone, severityColor, statusTone, statusWord } from './Primitives.tsx'

export function EvidenceList({ expectation }: { expectation: Expectation }) {
  return (
    <div className="evidence">
      {expectation.evidence.map((ev, i) => (
        <div key={i} className={`evidence-row evidence-row--${ev.epistemic}`}>
          <span className="evidence-kind">{EPISTEMIC_NAME[ev.epistemic]}</span>
          <span className="evidence-text">{ev.text}</span>
        </div>
      ))}
    </div>
  )
}

interface Props {
  world: WorldState
  expectation: Expectation
  routine: Routine
  expanded?: boolean
  selected?: boolean
  onToggle?: () => void
}

/**
 * One verdict about one expected event. The card leads with the state, whether
 * it did not happen, ran late, or cannot be told, because that is the only
 * thing the reader needs in the first half second. Everything underneath exists so they can
 * disagree with it.
 */
export function FindingCard({ world, expectation: e, routine: r, expanded, selected, onToggle }: Props) {
  const satisfier = world.observations.find((o) => o.id === e.satisfiedById)
  const links = world.correlations.filter((c) => c.expectationIds.includes(e.id))

  return (
    <button
      className={`finding finding--${e.status}`}
      aria-pressed={selected ? 'true' : 'false'}
      onClick={onToggle}
    >
      <div className="finding-top">
        <Pill tone={statusTone(e.status)}>{statusWord(e.status)}</Pill>
        <Pill tone={epistemicTone(e.epistemic)}>{EPISTEMIC_NAME[e.epistemic]}</Pill>
        {e.status === 'missing' && e.streak > 0 && (
          <Pill tone="quiet">Breaks a {e.streak}-day run</Pill>
        )}
        {links.length > 0 && <Pill tone="quiet">{links.length} link{links.length === 1 ? '' : 's'}</Pill>}
      </div>

      <h3 className="finding-title">{r.label}</h3>
      <p className="finding-sub">
        {e.status === 'satisfied' && satisfier
          ? `Recorded at ${clockLabel(satisfier.ts)}, inside the expected window.`
          : e.status === 'late' && satisfier
            ? `Recorded at ${clockLabel(satisfier.ts)}, ${e.latenessMin} minutes later than the learned time.`
            : e.status === 'pending'
              ? `Normally around ${minuteLabel(r.expectedMinute)}. The window is still open, so there is nothing to report.`
              : e.status === 'uncertain'
                ? `${e.witnesses.join(' and ')} saw only ${Math.round(
                    e.coverageFraction * 100,
                  )}% of the window. No claim is possible either way.`
                : `Expected around ${minuteLabel(r.expectedMinute)}. The window closed with nothing recorded.`}
      </p>

      <div className="finding-meta">
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
        <Metric label="Learned from" value={`${r.observedDays}/${r.eligibleDays} days`} />
        <Metric label="Window" value={`${minuteLabel(r.expectedMinute)} ±${Math.round(r.toleranceMin)}m`} />
      </div>

      {expanded && (
        <>
          <EvidenceList expectation={e} />
          {links.map((c) => (
            <div key={c.id} className="link-card" style={{ marginTop: 10 }}>
              <div className="finding-top" style={{ marginBottom: 7 }}>
                <Pill tone="unknown">{c.kind}</Pill>
                <Pill tone="quiet">{Math.round(c.strength * 100)}% link</Pill>
              </div>
              <p className="link-hypo">{c.hypothesis}</p>
              <p className="link-basis">{c.basis}</p>
            </div>
          ))}
          <p className="link-basis" style={{ marginTop: 10 }}>
            Learned, not configured: {routineBasis(r)}.
          </p>
        </>
      )}
    </button>
  )
}
