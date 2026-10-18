import { useState } from 'react'
import { describeEscalation, type WorldState } from '../../engine/index.ts'
import { useStore } from '../../state/store.tsx'

/**
 * What the system would actually do about what it found.
 *
 * Every other panel in this product answers "what happened". This one answers
 * "and then what", which is the question a family asks second and the one most
 * monitoring tools never answer at all: they raise an alert and leave the
 * household to work out who should care.
 *
 * Thresholds are shown as numbers next to names on purpose. "Ruth is told at
 * 92" is a sentence somebody can disagree with; "smart notifications" is not.
 */
export function Escalation({ world }: { world: WorldState }) {
  const { notifications, setInspectId, ackedIds } = useStore()
  const [open, setOpen] = useState<string | null>(null)

  const routineFor = (expectationId: string) => {
    const e = world.expectations.find((x) => x.id === expectationId)
    return world.routines.find((r) => r.id === e?.routineId)
  }

  return (
    <div className="esc">
      <div className="esc-rules">
        {world.household.circle.map((c) => (
          <div className="esc-rule" key={c.name}>
            <span className="esc-rule-name">{c.name}</span>
            <span className="esc-rule-chan">{c.channel}</span>
            <span className="esc-rule-at num">at {c.notifyAt}</span>
          </div>
        ))}
      </div>

      {notifications.length === 0 ? (
        <p className="empty">
          Nothing today is severe enough to tell anybody about. The lowest threshold is{' '}
          {Math.min(...world.household.circle.map((c) => c.notifyAt))}.
        </p>
      ) : (
        <ol className="esc-list">
          {notifications.map((n) => {
            const r = routineFor(n.expectationId)
            const isOpen = open === n.id
            return (
              <li
                key={n.id}
                className={`esc-item${n.suppressed ? ' esc-item--off' : ''}${
                  n.sent ? ' esc-item--sent' : ''
                }`}
              >
                <button className="esc-head" onClick={() => setOpen(isOpen ? null : n.id)}>
                  <span className="esc-to">{n.contact.name}</span>
                  <span className="esc-what">{r?.shortLabel ?? 'finding'}</span>
                  <span className="esc-when">{describeEscalation(n, world.now)}</span>
                  <span className="esc-sev num">{n.severity}</span>
                </button>

                {isOpen && (
                  <div className="esc-body">
                    <p className="esc-rationale">{n.rationale}</p>
                    <blockquote className="esc-message">{n.message}</blockquote>
                    <div className="esc-actions">
                      <button className="chip" onClick={() => setInspectId(n.expectationId)}>
                        Open the evidence
                      </button>
                      {ackedIds.has(n.expectationId) && (
                        <span className="esc-note">Acknowledged, so this is not sent.</span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
