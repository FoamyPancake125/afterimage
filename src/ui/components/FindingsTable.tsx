import { useMemo, useState } from 'react'
import {
  ZONE_NAME,
  clockLabel,
  minuteLabel,
  type Expectation,
  type WorldState,
} from '../../engine/index.ts'
import { Pill, severityColor, statusTone, statusWord } from './Primitives.tsx'

type SortKey = 'rank' | 'time' | 'severity' | 'confidence' | 'support'

const ORDER: Record<Expectation['status'], number> = {
  missing: 0,
  uncertain: 1,
  late: 2,
  pending: 3,
  satisfied: 4,
}

/**
 * The day's verdicts as a table.
 *
 * Cards were the wrong container. Every finding carries the same six facts, and
 * the only question a reader has is which one to look at first, which is a
 * comparison. Laid out in columns the scores can be read down the page instead
 * of hunted for inside paragraphs, and sorting turns "what is worst" and "what
 * happened first" into one click each.
 *
 * Default order is by consequence rather than by time or by confidence, which
 * is the one editorial judgement the table makes on the reader's behalf.
 */
export function FindingsTable({
  world,
  rows,
  selectedId,
  onPick,
  caption,
}: {
  world: WorldState
  rows: Expectation[]
  selectedId?: string | null
  onPick: (e: Expectation) => void
  caption?: string
}) {
  const [sort, setSort] = useState<SortKey>('rank')
  const [desc, setDesc] = useState(true)

  const routine = (id: string) => world.routines.find((r) => r.id === id)!

  const sorted = useMemo(() => {
    const dir = desc ? 1 : -1
    const copy = [...rows]
    copy.sort((a, b) => {
      switch (sort) {
        case 'time':
          return (a.expectedAt - b.expectedAt) * (desc ? -1 : 1)
        case 'severity':
          return (b.severity - a.severity) * dir
        case 'confidence':
          return (b.confidence - a.confidence) * dir
        case 'support':
          return (routine(b.routineId).support - routine(a.routineId).support) * dir
        default:
          return (ORDER[a.status] - ORDER[b.status] || b.severity - a.severity) * (desc ? 1 : -1)
      }
    })
    return copy
  }, [rows, sort, desc, world])

  const head = (key: SortKey, label: string, numeric = false) => (
    <th className={numeric ? 'dt-num' : undefined} aria-sort={sort === key ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button
        className="dt-sort"
        onClick={() => {
          if (sort === key) setDesc(!desc)
          else {
            setSort(key)
            setDesc(true)
          }
        }}
      >
        {label}
        <span className={`dt-caret${sort === key ? ' dt-caret--on' : ''}${desc ? '' : ' dt-caret--up'}`} />
      </button>
    </th>
  )

  if (!rows.length) return <p className="empty">Nothing outstanding here.</p>

  return (
    <table className="dt">
      {caption && <caption className="dt-caption">{caption}</caption>}
      <thead>
        <tr>
          {head('rank', 'Verdict')}
          <th>Expectation</th>
          {head('time', 'Expected', true)}
          {head('severity', 'Severity', true)}
          {head('confidence', 'Confidence', true)}
          {head('support', 'Support', true)}
        </tr>
      </thead>
      <tbody>
        {sorted.map((e) => {
          const r = routine(e.routineId)
          const hit = world.observations.find((o) => o.id === e.satisfiedById)
          return (
            <tr
              key={e.id}
              className={`dt-row dt-row--${e.status}${selectedId === e.id ? ' dt-row--on' : ''}`}
              onClick={() => onPick(e)}
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault()
                  onPick(e)
                }
              }}
            >
              <td>
                <Pill tone={statusTone(e.status)}>{statusWord(e.status)}</Pill>
              </td>
              <td>
                <span className="dt-title">{r.label}</span>
                <span className="dt-sub">
                  {ZONE_NAME[r.zone]}
                  {e.status === 'satisfied' && hit
                    ? ` · recorded ${clockLabel(hit.ts)}`
                    : e.status === 'late' && hit
                      ? ` · recorded ${clockLabel(hit.ts)}, ${Math.abs(e.latenessMin ?? 0)} min ${
                          (e.latenessMin ?? 0) >= 0 ? 'late' : 'early'
                        }`
                      : e.status === 'uncertain'
                        ? ` · ${Math.round(e.coverageFraction * 100)}% of the window seen`
                        : e.status === 'pending'
                          ? ' · window still open'
                          : e.streak > 0
                            ? ` · breaks a ${e.streak}-day run`
                            : ''}
                </span>
              </td>
              <td className="dt-num">{minuteLabel(r.expectedMinute)}</td>
              <td className="dt-num">
                {e.status === 'satisfied' ? (
                  <span className="dt-muted">0</span>
                ) : (
                  <span className="dt-sev">
                    {e.severity}
                    <span className="dt-bar">
                      <span style={{ width: `${e.severity}%`, background: severityColor(e.severity) }} />
                    </span>
                  </span>
                )}
              </td>
              <td className="dt-num">{Math.round(e.confidence * 100)}%</td>
              <td className="dt-num">
                {r.observedDays}/{r.eligibleDays}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
