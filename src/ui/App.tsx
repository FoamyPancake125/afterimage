import { useEffect } from 'react'
import { dayDeparture } from '../engine/index.ts'
import { StoreProvider, useStore, type Surface } from '../state/store.tsx'
import { ClockReadout } from './components/DayTimeline.tsx'
import { EvidenceDrawer } from './components/EvidenceDrawer.tsx'
import { FlipFeed } from './components/FlipFeed.tsx'
import { AlexaPlus } from './surfaces/AlexaPlus.tsx'
import { Console } from './surfaces/Console.tsx'
import { FireTV } from './surfaces/FireTV.tsx'
import { RingSim } from './surfaces/RingSim.tsx'

const TABS: { id: Surface; label: string; hint: string }[] = [
  { id: 'console', label: 'Console', hint: 'Phone and web' },
  { id: 'firetv', label: 'Fire TV', hint: 'Ten-foot UI' },
  { id: 'alexa', label: 'Alexa+', hint: 'Voice over MCP' },
  { id: 'ring', label: 'Ring', hint: 'Device simulator' },
]

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}

function Shell() {
  const { surface, setSurface, world, ghostLayer, setGhostLayer, playing, play, pause } = useStore()
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
      <header className="topbar">
        <div className="brand">
          <svg className="brand-glyph" width="18" height="18" viewBox="0 0 16 16" aria-hidden>
            <circle cx="5.4" cy="8" r="2.1" fill="var(--text)" />
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
          <span className="brand-mark">AFTERIMAGE</span>
          <span className="brand-sub">absence intelligence</span>
        </div>

        <div className="surface-tabs" role="tablist" aria-label="Surface">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={surface === t.id}
              className="surface-tab"
              onClick={() => setSurface(t.id)}
              title={t.hint}
            >
              <span className="dot" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="topbar-right">
          <button
            className={`ghost-toggle${ghostLayer ? ' ghost-toggle--on' : ''}`}
            onClick={() => setGhostLayer(!ghostLayer)}
            title="Show or hide what should have happened (G)"
          >
            <span className="legend-swatch legend-swatch--expected" />
            afterimages <kbd>G</kbd>
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
            <span className="mono">{departure}</span>
          </span>
          <ClockReadout world={world} />
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
    </div>
  )
}
