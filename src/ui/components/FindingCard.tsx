import {
  EPISTEMIC_NAME,
  clockLabel,
  minuteLabel,
  type Expectation,
  type Routine,
  type WorldState,
} from '../../engine/index.ts'
import { Metric, Pill, epistemicTone, severityColor, statusTone, statusWord } from './Primitives.tsx'

interface Props {
  world: WorldState
  expectation: Expectation
  routine: Routine
  selected?: boolean
  onToggle?: () => void
}

/**
 * One verdict about one expected event. The card leads with the state, whether
 * it did not happen, ran late, or cannot be told, because that is the only
 * thing the reader needs in the first half second. Everything underneath exists so they can
 * disagree with it.
 */
export function FindingCard({ world, expectation: e, routine: r, selected, onToggle }: Props) {
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
            ? `Recorded at ${clockLabel(satisfier.ts)}, ${Math.abs(e.latenessMin ?? 0)} minutes ${
                (e.latenessMin ?? 0) >= 0 ? 'later' : 'earlier'
              } than the learned time. It happened, just off schedule.`
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

      <span className="finding-more">
        {links.length > 0 ? `Evidence and ${links.length} link${links.length === 1 ? '' : 's'}` : 'Evidence'}
      </span>
    </button>
  )
}
