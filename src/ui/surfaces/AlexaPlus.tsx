import { useCallback, useEffect, useRef, useState } from 'react'
import { SUGGESTED_QUESTIONS, ask, type Answer } from '../../engine/index.ts'
import { useStore } from '../../state/store.tsx'
import { DayDial } from '../components/DayDial.tsx'
import { Legend, Pill } from '../components/Primitives.tsx'

interface Turn {
  id: number
  question: string
  answer: Answer
  /** Characters of the answer revealed so far, for the speaking effect. */
  revealed: number
}

/** The MCP tool each intent maps to, for the trace panel. */
const TOOL_FOR_INTENT: Record<string, string> = {
  day_summary: 'afterimage.summarise_day',
  absences: 'afterimage.list_absences',
  why: 'afterimage.explain_finding',
  changes: 'afterimage.list_novelties',
  did_it_happen: 'afterimage.check_expectation',
  resident_status: 'afterimage.resident_status',
  routine_detail: 'afterimage.describe_routine',
  blind_spots: 'afterimage.list_coverage_gaps',
  next_step: 'afterimage.recommend_actions',
  capability: 'afterimage.describe_capabilities',
  unknown: 'afterimage.summarise_day',
}

/**
 * The Alexa+ surface.
 *
 * Alexa+ reaches AFTERIMAGE over MCP: each question resolves to one tool call
 * against the same engine the other surfaces read, and the spoken answer is
 * rendered from the structure that call returns. That is why the evidence card
 * under each reply matches the sentence exactly. There is no separate, looser
 * description of the world for the voice layer to drift towards.
 */
export function AlexaPlus() {
  const { world, highlight, setHighlight } = useStore()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const opened = useRef(false)

  const send = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q || busy) return
      const answer = ask(world, q)
      const id = nextId.current++
      setTurns((t) => [...t, { id, question: q, answer, revealed: 0 }])
      setHighlight(answer.highlight)
      setDraft('')
      setBusy(true)
    },
    [world, busy, setHighlight],
  )

  // Reveal the spoken answer at reading speed, so the evidence lands with it.
  useEffect(() => {
    if (!busy) return
    const i = turns.length - 1
    if (i < 0) return
    const total = turns[i].answer.speech.length
    const timer = setInterval(() => {
      setTurns((t) => {
        const copy = [...t]
        const cur = copy[i]
        if (!cur) return t
        const next = Math.min(total, cur.revealed + 4)
        copy[i] = { ...cur, revealed: next }
        if (next >= total) {
          clearInterval(timer)
          setBusy(false)
        }
        return copy
      })
    }, 12)
    return () => clearInterval(timer)
  }, [busy, turns.length])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns])

  // Open with the question a family member actually asks first. The ref guard
  // is what keeps StrictMode's deliberate double-mount from asking it twice.
  useEffect(() => {
    if (opened.current) return
    opened.current = true
    send('What happened while I was gone?')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const last = turns[turns.length - 1]

  return (
    <div className="alexa">
      <div className="chat">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {turns.map((t) => {
              const shown = t.answer.speech.slice(0, t.revealed)
              const speaking = t.revealed < t.answer.speech.length
              return (
                <div className="turn" key={t.id}>
                  <div className="turn-q">{t.question}</div>
                  <div className="turn-a">
                    <span className={`mark${speaking ? ' mark--speaking' : ''}`}>
                      <AfterimageMark />
                    </span>
                    <div>
                      <p className="speech">
                        {shown}
                        {speaking && <span className="speech-caret" />}
                      </p>
                      {!speaking && (
                        <>
                          {t.answer.cards.length > 0 && (
                            <div className="answer-cards">
                              {t.answer.cards.map((c, i) => (
                                <div className="acard" key={i}>
                                  <div className="acard-top">
                                    {c.tag && <Pill tone={tagTone(c.tag)}>{c.tag}</Pill>}
                                    <h4 className="acard-title">{c.title}</h4>
                                  </div>
                                  {c.lines.filter(Boolean).map((l, j) => (
                                    <p className="acard-line" key={j}>
                                      {l}
                                    </p>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="followups">
                            {t.answer.followUps.map((f) => (
                              <button className="chip" key={f} onClick={() => send(f)}>
                                {f}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
        >
          <div className="composer-inner">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about the house: what happened, what did not, or why"
              aria-label="Ask Alexa+"
            />
            <button type="submit" disabled={busy || !draft.trim()}>
              Ask
            </button>
          </div>
        </form>
      </div>

      <aside className="alexa-side">
        <div className="panel" style={{ marginBottom: 14 }}>
          <div className="panel-head">
            <span className="panel-title">What Alexa+ is looking at</span>
          </div>
          <div style={{ padding: '14px 12px 10px' }}>
            <DayDial world={world} highlight={highlight} />
          </div>
          <div style={{ padding: '0 14px 12px', fontSize: 11 }}>
            <Legend compact />
          </div>
        </div>

        {last && (
          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-head">
              <span className="panel-title">MCP call</span>
              <span className="panel-note">streamable http</span>
            </div>
            <div style={{ padding: '12px 14px 14px' }}>
              <pre
                className="mono"
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: 'var(--ink-2)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.65,
                }}
              >
{`request  tools/call
  name: ${TOOL_FOR_INTENT[last.answer.intent]}
  arguments: { "utterance": ${JSON.stringify(last.question)} }

response
  intent:    ${last.answer.intent}
  evidence:  ${last.answer.cards.length} card(s)
  expects:   ${last.answer.highlight.expectationIds.length} highlighted
  observed:  ${last.answer.highlight.observationIds.length} highlighted`}
              </pre>
              <p className="link-basis" style={{ marginTop: 11 }}>
                One utterance, one tool call, one structured result. The sentence you heard is
                rendered from the fields above, not written separately.
              </p>
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Try asking</span>
          </div>
          <div style={{ padding: '12px 14px 14px', display: 'grid', gap: 6 }}>
            {SUGGESTED_QUESTIONS.map((q) => (
              <button className="chip" style={{ textAlign: 'left' }} key={q} onClick={() => send(q)}>
                {q}
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}

/** The product's own glyph: a recorded mark, and the trace of one that is not. */
function AfterimageMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <circle cx="5.4" cy="8" r="2.1" fill="currentColor" />
      <circle
        cx="11"
        cy="8"
        r="2.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeDasharray="2.4 2.4"
      />
    </svg>
  )
}

function tagTone(tag: string) {
  const t = tag.toLowerCase()
  if (t.includes('did not') || t.includes('late') || t.includes('unlike')) return 'expected' as const
  if (t.includes('cannot') || t.includes('unknown') || t.includes('coverage') || t.includes('link'))
    return 'unknown' as const
  if (t.includes('on time') || t.includes('observed')) return 'ok' as const
  if (t.includes('expected')) return 'expected' as const
  return 'quiet' as const
}
