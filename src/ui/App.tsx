import { useEffect } from 'react'
import { dayDeparture } from '../engine/index.ts'
import { StoreProvider, useStore, type Surface } from '../state/store.tsx'
import { ClockReadout } from './components/DayTimeline.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { EvidenceDrawer } from './components/EvidenceDrawer.tsx'
import { FlipFeed } from './components/FlipFeed.tsx'
import { AlexaPlus } from './surfaces/AlexaPlus.tsx'
import { Console } from './surfaces/Console.tsx'
import { FireTV } from './surfaces/FireTV.tsx'
import { RingSim } from './surfaces/RingSim.tsx'

const NAV: { id: Surface; label: string; hint: string }[] = [
  { id: 'console', label: 'Console', hint: 'Phone and web' },
  { id: 'firetv', label: 'Fire TV', hint: 'Ten-foot UI' },
  { id: 'alexa', label: 'Alexa+', hint: 'Voice over MCP' },
  { id: 'ring', label: 'Ring', hint: 'Devices and stream' },
]

const TITLE: Record<Surface, string> = {
  console: 'Console',
  firetv: 'Fire TV',
  alexa: 'Alexa+',
  ring: 'Ring',
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { surface, setSurface, world, ghostLayer, setGhostLayer, playing, play, pause, theme, setTheme } =
    useStore()
  const departure = dayDeparture(world)

  // Two keys worth having under a thumb during a demo. G is the product's whole
  // thesis: hide the afterimages and you are left with exactly what every other
  // system in this category can show you. Space runs the day.
  //
  // Space is left alone on Fire TV, where it is the remote's select button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      if (e.key === 'g' || e.key === 'G') {
        setGhostLayer(!ghostLayer)
      } else if (e.key === ' ' && (surface === 'console' || surface === 'ring')) {
        e.preventDefault()
        playing ? pause() : play()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ghostLayer, setGhostLayer, surface, playing, play, pause])

  return (
    <div className="app">
      {/*
        Primary navigation on the left, global state across the top. The four
        entries are device surfaces rather than app sections, and a rail makes
        that legible in a way a row of tabs does not: they sit side by side as
        four views of one household, with the household's own details under
        them as permanent context.
      */}
      <nav className="rail" aria-label="Surfaces">
        <div className="rail-brand">
          <svg className="brand-glyph" width="18" height="18" viewBox="0 0 16 16" aria-hidden>
            <circle cx="5.4" cy="8" r="2.1" fill="var(--ink)" />
            <circle
              cx="11"
              cy="8"
              r="2.8"
              fill="none"
              stroke="var(--expected)"
              strokeWidth="1.1"
              strokeDasharray="2.4 2.4"
            />
          </svg>
          <span>
            <span className="brand-mark">AFTERIMAGE</span>
            <span className="brand-sub">absence intelligence</span>
          </span>
        </div>

        <ul className="rail-list">
          {NAV.map((t) => (
            <li key={t.id}>
              <button
                className="rail-item"
                aria-current={surface === t.id ? 'page' : undefined}
                onClick={() => setSurface(t.id)}
              >
                <span className="rail-label">{t.label}</span>
                <span className="rail-hint">{t.hint}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="rail-foot">
          <p className="rail-house">
            {world.household.residentName}, {world.household.residentAge}
          </p>
          <p className="rail-meta">
            {world.household.devices.length} Ring devices · {world.routines.length} learned routines
          </p>
          <p className="rail-meta">
            {world.observations.length.toLocaleString()} events over twenty-one days
          </p>
        </div>
      </nav>

      <header className="topbar">
        <h1 className="topbar-title">{TITLE[surface]}</h1>

        <div className="topbar-right">
          <button
            className={`icon-btn${ghostLayer ? ' icon-btn--on' : ''}`}
            onClick={() => setGhostLayer(!ghostLayer)}
            title="Show or hide what should have happened"
          >
            <span className="legend-swatch legend-swatch--expected" style={{ marginTop: 0 }} />
            Afterimages <kbd>G</kbd>
          </button>

          <span className="departure">
            <span>departure</span>
            <span className="departure-bar">
              <span
                style={{
                  width: `${departure}%`,
                  background:
                    departure >= 65
                      ? 'var(--critical)'
                      : departure >= 35
                        ? 'var(--expected)'
                        : 'var(--ok)',
                }}
              />
            </span>
            <span className="num">{departure}</span>
          </span>

          <ClockReadout world={world} />

          <button
            className="icon-btn"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          >
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
        </div>
      </header>

      <main className="stage">
        {surface === 'console' && <Console />}
        {surface === 'firetv' && <FireTV />}
        {surface === 'alexa' && <AlexaPlus />}
        {surface === 'ring' && <RingSim />}
      </main>

      <FlipFeed />
      <EvidenceDrawer />
      <CommandPalette />
    </div>
  )
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M12 8.4A5.4 5.4 0 0 1 5.6 2 5.6 5.6 0 1 0 12 8.4z" strokeLinejoin="round" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <circle cx="7" cy="7" r="2.9" />
      <path d="M7 .9v1.6M7 11.5v1.6M1.4 7H3M11 7h1.6M3 3l1.1 1.1M9.9 9.9 11 11M11 3 9.9 4.1M4.1 9.9 3 11" strokeLinecap="round" />
    </svg>
  )
}
