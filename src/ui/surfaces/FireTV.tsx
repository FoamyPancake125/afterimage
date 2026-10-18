import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EPISTEMIC_NAME,
  ZONE_NAME,
  clockLabel,
  dayDeparture,
  minuteLabel,
  routineBasis,
  startOfLocalDay,
  type Expectation,
} from '../../engine/index.ts'
import { useStore } from '../../state/store.tsx'
import { DayDial } from '../components/DayDial.tsx'
import { Pill, statusTone, statusWord } from '../components/Primitives.tsx'

const ORDER: Record<Expectation['status'], number> = {
  missing: 0,
  uncertain: 1,
  late: 2,
  pending: 3,
  satisfied: 4,
}

/**
 * The ten-foot surface.
 *
 * A television is read from a sofa by somebody who is not holding a mouse. So:
 * one dial, one list, one focused item, nothing below roughly 20 px of apparent
 * text, and the whole thing driven by up, down and select, exactly the Fire TV
 * remote. Keyboard arrows stand in for the remote here; the focus model is the
 * one a Fire OS app ships with.
 */
export function FireTV() {
  const { world, highlight, setHighlight } = useStore()
  const [focus, setFocus] = useState(0)
  const [open, setOpen] = useState(false)

  const cards = useMemo(() => {
    const dayStart = startOfLocalDay(world.now)
    return world.expectations
      .filter((e) => e.dayStart === dayStart && e.status !== 'satisfied')
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.severity - a.severity)
      .slice(0, 5)
  }, [world])

  const routine = (id: string) => world.routines.find((r) => r.id === id)!
  const current = cards[Math.min(focus, cards.length - 1)]
  const links = current
    ? world.correlations.filter((c) => c.expectationIds.includes(current.id)).slice(0, 2)
    : []

  const syncHighlight = useCallback(
    (e: Expectation | undefined) => {
      if (!e) return
      const related = world.correlations.filter((c) => c.expectationIds.includes(e.id))
      setHighlight({
        observationIds: [
          ...e.evidence.flatMap((x) => x.observationIds ?? []),
          ...(e.satisfiedById ? [e.satisfiedById] : []),
        ],
        expectationIds: [e.id, ...related.flatMap((c) => c.expectationIds)],
        noveltyIds: related.flatMap((c) => c.noveltyIds),
      })
    },
    [world, setHighlight],
  )

  useEffect(() => {
    syncHighlight(current)
  }, [current, syncHighlight])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
        setFocus((f) => Math.min(cards.length - 1, f + 1))
      } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
        setFocus((f) => Math.max(0, f - 1))
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        setOpen((o) => !o)
      } else if (ev.key === 'Escape' || ev.key === 'Backspace') {
        setOpen(false)
      } else {
        return
      }
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cards.length])

  const departure = dayDeparture(world)

  return (
    <div className="tv-frame">
      <div className="tv-bezel">
        <div className="tv tv--split">
          <div className="tv-head">
            <div>
              <h1 className="tv-title">What did not happen today</h1>
              <p className="tv-sub">
                {world.household.residentName}'s house ·{' '}
                {new Date(world.now).toLocaleDateString([], {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}{' '}
                · reconstructed from {world.observations.length.toLocaleString()} Ring events
              </p>
            </div>
            <div className="tv-head-right">
              <div className="mono" style={{ fontSize: '3.6cqh' }}>
                {clockLabel(world.now)}
              </div>
              <div style={{ fontSize: '1.8cqh', color: 'var(--text-3)' }}>
                departure from normal {departure}/100
              </div>
            </div>
          </div>

          <div className="tv-dial">
            <DayDial world={world} highlight={highlight} selectedId={current?.id} />
          </div>

          <div className="tv-list">
            {cards.map((e, i) => {
              const r = routine(e.routineId)
              const focused = i === focus
              return (
                <div key={e.id} className={`tv-row${focused ? ' tv-row--focus' : ''}`}>
                  <div className="tv-row-top">
                    <Pill tone={statusTone(e.status)}>{statusWord(e.status)}</Pill>
                    <span className="tv-row-when mono">{minuteLabel(r.expectedMinute)}</span>
                    <span className="tv-row-zone">{ZONE_NAME[r.zone]}</span>
                  </div>
                  <h2 className="tv-row-title">{r.label}</h2>
                  {focused && (
                    <div className="tv-row-body">
                      <p className="tv-row-line">
                        {e.status === 'uncertain'
                          ? `${e.witnesses.join(' and ')} saw only ${Math.round(
                              e.coverageFraction * 100,
                            )}% of the window. AFTERIMAGE will not call this missing.`
                          : e.status === 'late'
                            ? `${e.latenessMin} minutes later than the learned time.`
                            : e.status === 'pending'
                              ? `The window has not closed. Nothing is wrong yet.`
                              : `Expected ${minuteLabel(r.expectedMinute)}. ${
                                  e.witnesses.join(' and ')
                                } saw the whole window. Nothing happened.`}
                      </p>
                      <p className="tv-row-basis">{routineBasis(r)}</p>
                      {links[0] && <p className="tv-row-link">{links[0].hypothesis}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="tv-hint">
            <span>
              <span className="key">Up</span> <span className="key">Down</span> move
            </span>
            <span>
              <span className="key">Select</span> evidence
            </span>
            <span style={{ marginLeft: 'auto' }}>
              “Alexa, why did you flag the morning dose?”
            </span>
          </div>
        </div>

        {open && current && (
          <div className="tv-detail">
            <div>
              <Pill tone={statusTone(current.status)}>{statusWord(current.status)}</Pill>
              <h2 className="tv-title" style={{ marginTop: '1.4cqh' }}>
                {routine(current.routineId).label}
              </h2>
              <p className="tv-sub">{routineBasis(routine(current.routineId))}</p>
            </div>
            <div style={{ overflow: 'hidden' }}>
              {current.evidence.map((ev, i) => (
                <div key={i} className="tv-ev">
                  <span>
                    <Pill
                      tone={
                        ev.epistemic === 'observed'
                          ? 'observed'
                          : ev.epistemic === 'expected'
                            ? 'expected'
                            : 'unknown'
                      }
                    >
                      {EPISTEMIC_NAME[ev.epistemic]}
                    </Pill>
                  </span>
                  <span className="tv-ev-text">{ev.text}</span>
                </div>
              ))}
              {links.map((c) => (
                <div key={c.id} className="tv-ev-link">
                  <p style={{ margin: 0, fontSize: '2.2cqh', fontWeight: 550 }}>{c.hypothesis}</p>
                  <p style={{ margin: '0.6cqh 0 0', fontSize: '1.85cqh', color: 'var(--text-3)' }}>
                    {c.basis}
                  </p>
                </div>
              ))}
            </div>
            <div className="tv-hint">
              <span>
                <span className="key">Back</span> return to the day
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
