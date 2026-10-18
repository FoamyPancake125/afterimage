import { useEffect, useMemo, useRef, useState } from 'react'
import { ZONE_NAME, minuteLabel, type Zone } from '../../engine/index.ts'
import { DEMO_MINUTE_OF_DAY, INJECTABLE, useStore, type Surface } from '../../state/store.tsx'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  run: () => void
}

/**
 * The keyboard fast path.
 *
 * It sits on top of the visible navigation rather than replacing it: every
 * command here is reachable by clicking something, and the palette exists so
 * that somebody who uses this daily, or who is driving a demo, never has to
 * cross the screen to move the clock or blind a camera. Grouped results, live
 * filter, arrows to move, enter to run, escape to close.
 */
export function CommandPalette() {
  const store = useStore()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = []
    const surfaces: { id: Surface; label: string }[] = [
      { id: 'console', label: 'Console' },
      { id: 'firetv', label: 'Fire TV' },
      { id: 'alexa', label: 'Alexa+' },
      { id: 'ring', label: 'Ring' },
    ]
    for (const s of surfaces) {
      out.push({
        id: `go_${s.id}`,
        group: 'Go to',
        label: s.label,
        run: () => store.setSurface(s.id),
      })
    }

    out.push({
      id: 'play',
      group: 'Clock',
      label: store.playing ? 'Pause the day' : 'Play the day',
      hint: 'Space',
      run: () => (store.playing ? store.pause() : store.play()),
    })
    out.push({ id: 'restart', group: 'Clock', label: 'Replay from midnight', run: store.restart })
    for (const m of [360, 524, 936, DEMO_MINUTE_OF_DAY, 1299]) {
      out.push({
        id: `jump_${m}`,
        group: 'Clock',
        label: `Jump to ${minuteLabel(m)}`,
        run: () => store.setClockOffsetMin(m - DEMO_MINUTE_OF_DAY, `Jumped to ${minuteLabel(m)}`),
      })
    }

    out.push({
      id: 'ghost',
      group: 'View',
      label: store.ghostLayer ? 'Hide the afterimages' : 'Show the afterimages',
      hint: 'G',
      run: () => store.setGhostLayer(!store.ghostLayer),
    })
    out.push({
      id: 'theme',
      group: 'View',
      label: store.theme === 'light' ? 'Switch to dark' : 'Switch to light',
      run: () => store.setTheme(store.theme === 'light' ? 'dark' : 'light'),
    })
    out.push({
      id: 'view_dial',
      group: 'View',
      label: 'Show the day as a dial',
      run: () => {
        store.setSurface('console')
        store.setConsoleView('dial')
      },
    })
    out.push({
      id: 'view_plan',
      group: 'View',
      label: 'Show the house as a plan',
      run: () => {
        store.setSurface('console')
        store.setConsoleView('plan')
      },
    })

    const zones: Zone[] = ['front_door', 'driveway', 'back_patio', 'kitchen', 'medicine_cabinet', 'hallway']
    for (const z of zones) {
      out.push({
        id: `zone_${z}`,
        group: 'Focus a room',
        label: ZONE_NAME[z],
        run: () => {
          store.setSurface('console')
          store.setFocusZone(z)
        },
      })
    }
    if (store.focusZone) {
      out.push({
        id: 'zone_clear',
        group: 'Focus a room',
        label: 'Show the whole house',
        run: () => store.setFocusZone(null),
      })
    }

    for (const e of INJECTABLE) {
      out.push({
        id: `inj_${e.id}`,
        group: 'Push a Ring event',
        label: e.label,
        hint: ZONE_NAME[e.zone],
        run: () => {
          store.setSurface('ring')
          store.inject(e)
        },
      })
    }

    out.push({
      id: 'coverage',
      group: 'Push a Ring event',
      label: store.outageOn ? 'Remove the charging window' : 'Restore the charging window',
      run: () => {
        store.setSurface('ring')
        store.setOutageOn(!store.outageOn)
      },
    })
    out.push({ id: 'reset', group: 'Push a Ring event', label: 'Reset the simulator', run: store.resetSim })

    return out
  }, [store])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => (c.group + ' ' + c.label).toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQuery('')
        setIndex(0)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    listRef.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  if (!open) return null

  const run = (c: Command) => {
    c.run()
    setOpen(false)
  }

  let lastGroup = ''

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="palette" role="dialog" aria-label="Commands">
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          placeholder="Search commands"
          aria-label="Search commands"
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIndex((i) => Math.min(matches.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIndex((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter' && matches[index]) {
              e.preventDefault()
              run(matches[index])
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {matches.length === 0 && <p className="palette-empty">No command matches that.</p>}
          {matches.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null
            lastGroup = c.group
            return (
              <div key={c.id}>
                {header && <div className="palette-group">{header}</div>}
                <button
                  className="palette-item"
                  data-on={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <span>{c.label}</span>
                  {c.hint && <span className="palette-hint">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>up</kbd> <kbd>down</kbd> move
          </span>
          <span>
            <kbd>enter</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
          <span className="palette-count">{matches.length} commands</span>
        </div>
      </div>
    </>
  )
}
