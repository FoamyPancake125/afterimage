import { useStore } from '../../state/store.tsx'
import { statusTone, statusWord } from './Primitives.tsx'

/**
 * Verdict changes, announced as they happen.
 *
 * This exists because the interesting moment in absence detection is not the
 * steady state, it is the transition: the instant a window closes and silence
 * stops being innocent. During playback that moment goes past in a second, so
 * it gets said out loud rather than left for the reader to spot.
 */
export function FlipFeed() {
  const { flips } = useStore()
  if (!flips.length) return null

  return (
    <div className="flipfeed" role="status" aria-live="polite">
      {flips.slice(0, 4).map((f) => (
        <div key={f.key} className={`flip flip--${f.to}`}>
          <span className="flip-when mono">{f.when}</span>
          <span className="flip-body">
            <span className="flip-label">{f.label}</span>
            <span className="flip-change">
              {statusWord(f.from).toLowerCase()} to{' '}
              <b className={`flip-to flip-to--${statusTone(f.to)}`}>{statusWord(f.to).toLowerCase()}</b>
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
