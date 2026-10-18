import { clockLabel, minuteOfDay } from '../../engine/index.ts'
import { DEMO_MINUTE_OF_DAY, SPEEDS, useStore } from '../../state/store.tsx'

const JUMPS = [
  { label: '6:00a', m: 360 },
  { label: '8:44a', m: 524 },
  { label: '3:36p', m: 936 },
  { label: '7:45p', m: DEMO_MINUTE_OF_DAY },
  { label: '9:39p', m: 1299 },
]

/**
 * Transport for the household day.
 *
 * Pressing play is the clearest demonstration the product has. The hand sweeps
 * the dial, and expectations that sat harmlessly open all morning turn into
 * absences the moment their windows close. Nothing is scripted: each tick moves
 * the clock and the entire inference re-runs at that moment, which is why the
 * verdict notices appear when they do rather than on a timeline somebody wrote.
 */
export function Transport() {
  const {
    world,
    playing,
    play,
    pause,
    restart,
    speedMin,
    setSpeedMin,
    setClockOffsetMin,
  } = useStore()

  const nowMin = minuteOfDay(world.now)
  const progress = (nowMin / 1439) * 100

  return (
    <div className="transport">
      <div className="transport-row">
        <button
          className="transport-btn transport-btn--primary"
          onClick={playing ? pause : play}
          aria-label={playing ? 'Pause the day' : 'Play the day'}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
          <span>{playing ? 'Pause' : 'Play the day'}</span>
        </button>

        <button className="transport-btn" onClick={restart} aria-label="Replay from midnight">
          <RestartIcon />
          <span>Midnight</span>
        </button>

        <div className="speeds" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s.label}
              className="speed"
              aria-pressed={speedMin === s.min}
              onClick={() => setSpeedMin(s.min)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <span className="transport-clock mono">{clockLabel(world.now)}</span>
      </div>

      <div className="transport-track" aria-hidden>
        <span className="transport-fill" style={{ width: `${progress}%` }} />
        {JUMPS.map((j) => (
          <span key={j.label} className="transport-tick" style={{ left: `${(j.m / 1439) * 100}%` }} />
        ))}
      </div>

      <div className="jump-row">
        {JUMPS.map((j) => (
          <button
            key={j.label}
            className="jump"
            aria-pressed={Math.abs(nowMin - j.m) < 8}
            onClick={() => setClockOffsetMin(j.m - DEMO_MINUTE_OF_DAY, `Jumped to ${j.label}`)}
          >
            {j.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function PlayIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden>
      <path d="M1 1.2 10 6 1 10.8z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg width="11" height="12" viewBox="0 0 11 12" aria-hidden>
      <rect x="1" y="1" width="3.2" height="10" fill="currentColor" />
      <rect x="6.8" y="1" width="3.2" height="10" fill="currentColor" />
    </svg>
  )
}

function RestartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <path d="M1.6 6a4.4 4.4 0 1 0 1.5-3.3" strokeLinecap="round" />
      <path d="M1.2 1.4v2.6h2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
