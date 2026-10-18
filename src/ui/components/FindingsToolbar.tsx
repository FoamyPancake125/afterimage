import { useState } from 'react'
import {
  buildDayReport,
  buildFindingsCsv,
  reportFilename,
  type ExpectationStatus,
  type WorldState,
} from '../../engine/index.ts'
import { useStore } from '../../state/store.tsx'
import { statusTone, statusWord } from './Primitives.tsx'

const STATUSES: ExpectationStatus[] = ['missing', 'uncertain', 'late', 'pending', 'satisfied']

function download(name: string, mime: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next frame so the navigation has definitely started.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

/**
 * Filter, search and export over the day's verdicts.
 *
 * Eleven routines is a list you can read. A household with thirty devices and
 * a month of history is not, and the controls that make that tractable have to
 * exist before the data outgrows the screen rather than after. The export is
 * here for the same reason: a finding that cannot leave the interface is a
 * finding that stays trapped in a demo.
 */
export function FindingsToolbar({
  world,
  query,
  setQuery,
  active,
  toggleStatus,
  shown,
  total,
  counts,
}: {
  world: WorldState
  query: string
  setQuery: (q: string) => void
  active: Set<ExpectationStatus>
  toggleStatus: (s: ExpectationStatus) => void
  shown: number
  total: number
  counts: Record<ExpectationStatus, number>
}) {
  const { shareLink } = useStore()
  const [copied, setCopied] = useState(false)

  return (
    <div className="toolbar">
      <div className="toolbar-search">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by routine, person or room"
          aria-label="Filter findings"
        />
        {query && (
          <button className="toolbar-clear" onClick={() => setQuery('')} aria-label="Clear filter">
            clear
          </button>
        )}
      </div>

      <div className="toolbar-filters" role="group" aria-label="Filter by verdict">
        {STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            className={`fchip fchip--${statusTone(s)}`}
            aria-pressed={active.has(s)}
            onClick={() => toggleStatus(s)}
          >
            {statusWord(s)}
            <span className="fchip-count">{counts[s]}</span>
          </button>
        ))}
      </div>

      <span className="toolbar-count">
        {shown === total ? `${total} shown` : `${shown} of ${total} shown`}
      </span>

      <div className="toolbar-actions">
        <button
          className="toolbar-action"
          onClick={() => {
            navigator.clipboard?.writeText(shareLink())
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button
          className="toolbar-action"
          onClick={() =>
            download(reportFilename(world, 'csv'), 'text/csv;charset=utf-8', buildFindingsCsv(world))
          }
        >
          CSV
        </button>
        <button
          className="toolbar-action"
          onClick={() =>
            download(
              reportFilename(world, 'json'),
              'application/json',
              JSON.stringify(buildDayReport(world), null, 2),
            )
          }
        >
          JSON
        </button>
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <circle cx="5.6" cy="5.6" r="4" />
      <path d="M8.6 8.6 12 12" strokeLinecap="round" />
    </svg>
  )
}
