import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DEMO_NOW,
  HOUSEHOLD,
  INJECTABLE,
  MIN,
  clockLabel,
  learnRoutines,
  startOfLocalDay,
  buildHistory,
  buildOutages,
  buildWorld,
  type ExpectationStatus,
  type Observation,
  type InjectableEvent,
  type WorldState,
  type Zone,
} from '../engine/index.ts'
import { readPrefs, readUrl, writePrefs, writeUrl } from './url.ts'

export type Surface = 'console' | 'firetv' | 'alexa' | 'ring'
export type ConsoleView = 'dial' | 'plan'
export type Theme = 'light' | 'dark'

export type { InjectableEvent }
export { INJECTABLE }

export interface Highlight {
  observationIds: string[]
  expectationIds: string[]
  noveltyIds: string[]
}

export const NO_HIGHLIGHT: Highlight = {
  observationIds: [],
  expectationIds: [],
  noveltyIds: [],
}

/** A verdict that changed, surfaced the moment it changes. */
export interface Flip {
  key: string
  label: string
  from: ExpectationStatus
  to: ExpectationStatus
  /** Household clock reading at the moment the verdict moved. */
  when: string
  at: number
}

/** Playback speeds, in household minutes advanced per tick. */
export const SPEEDS = [
  { label: '1x', min: 1 },
  { label: '6x', min: 6 },
  { label: '20x', min: 20 },
] as const

const TICK_MS = 90

interface Store {
  world: WorldState
  surface: Surface
  setSurface: (s: Surface) => void
  consoleView: ConsoleView
  setConsoleView: (v: ConsoleView) => void

  highlight: Highlight
  setHighlight: (h: Highlight) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  /** Expectation opened in the evidence drawer, if any. */
  inspectId: string | null
  setInspectId: (id: string | null) => void
  /** When set, every surface narrows to this one part of the house. */
  focusZone: Zone | null
  setFocusZone: (z: Zone | null) => void

  /** Minutes added to the pinned demo clock. */
  clockOffsetMin: number
  setClockOffsetMin: (m: number, label?: string) => void
  scrubTo: (minuteOfDay: number) => void
  commitScrub: () => void
  scrubbing: boolean

  playing: boolean
  play: () => void
  pause: () => void
  restart: () => void
  speedMin: number
  setSpeedMin: (m: number) => void

  outageOn: boolean
  setOutageOn: (v: boolean) => void
  ghostLayer: boolean
  setGhostLayer: (v: boolean) => void
  consequenceOverrides: Record<string, number>
  setConsequence: (routineId: string, value: number) => void

  injected: Observation[]
  inject: (e: InjectableEvent) => void
  resetSim: () => void

  theme: Theme
  setTheme: (t: Theme) => void
  shareLink: () => string

  /** Short description of what the last action changed. */
  lastChange: string | null
  /** Recent verdict changes, newest first, for the live feed. */
  flips: Flip[]
}

const Ctx = createContext<Store | null>(null)

/** The 21-day history is deterministic, so it is built once and never rebuilt. */
const BASE_HISTORY = buildHistory(DEMO_NOW)
const BASE_OUTAGES = buildOutages(DEMO_NOW)
/** Minute-of-day of the pinned demo clock, 7:45 PM. */
export const DEMO_MINUTE_OF_DAY = 19 * 60 + 45

export function StoreProvider({ children }: { children: ReactNode }) {
  // The first read of the address bar and of saved preferences happens once,
  // as lazy initial state, so a deep link lands on the right view rather than
  // flashing the default and then correcting itself.
  const initialUrl = useRef(readUrl()).current
  const initialPrefs = useRef(readPrefs()).current

  const [surface, setSurface] = useState<Surface>(initialUrl.surface ?? 'console')
  const [consoleView, setConsoleView] = useState<ConsoleView>(initialUrl.view ?? 'dial')
  const [highlight, setHighlight] = useState<Highlight>(NO_HIGHLIGHT)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [inspectId, setInspectId] = useState<string | null>(initialUrl.inspect ?? null)
  const [focusZone, setFocusZone] = useState<Zone | null>(initialUrl.zone ?? null)
  const [clockOffsetMin, setClockOffsetMinRaw] = useState(
    initialUrl.minute !== undefined && initialUrl.minute !== null
      ? initialUrl.minute - DEMO_MINUTE_OF_DAY
      : 0,
  )
  const [outageOn, setOutageOnRaw] = useState(true)
  const [injected, setInjected] = useState<Observation[]>([])
  const [ghostLayer, setGhostLayer] = useState(initialUrl.ghost ?? true)
  const [scrubbing, setScrubbing] = useState(false)
  const [consequenceOverrides, setOverrides] = useState<Record<string, number>>(
    initialPrefs.weights ?? {},
  )
  const [playing, setPlaying] = useState(false)
  const [speedMin, setSpeedMin] = useState<number>(6)
  const [lastChange, setLastChange] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(initialPrefs.theme ?? 'light')
  const [flips, setFlips] = useState<Flip[]>([])
  const scrubStart = useRef<number | null>(null)

  // Light is the default on purpose. A dark dashboard is the house style of
  // every monitoring product there is, and this one is meant to read like a
  // printed record rather than a control room.
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // View state belongs in the link; preferences belong to the person.
  useEffect(() => {
    writeUrl(
      {
        surface,
        view: consoleView,
        zone: focusZone,
        minute: DEMO_MINUTE_OF_DAY + clockOffsetMin,
        ghost: ghostLayer,
        inspect: inspectId,
      },
      DEMO_MINUTE_OF_DAY,
    )
  }, [surface, consoleView, focusZone, clockOffsetMin, ghostLayer, inspectId])

  useEffect(() => {
    writePrefs({ theme, weights: consequenceOverrides })
  }, [theme, consequenceOverrides])

  const now = DEMO_NOW + clockOffsetMin * MIN
  const outages = useMemo(
    () => (outageOn ? BASE_OUTAGES : BASE_OUTAGES.filter((o) => o.id !== 'g1')),
    [outageOn],
  )
  const observations = useMemo(() => [...BASE_HISTORY, ...injected], [injected])

  // Learning depends only on the observations and the calendar day, so it is
  // kept out of the clock path. Playing the day back then costs one evaluation
  // pass per tick rather than one re-learn per tick.
  const dayStart = startOfLocalDay(now)
  const routines = useMemo(
    () => learnRoutines(observations, dayStart + 1, HOUSEHOLD.careProfile),
    [observations, dayStart],
  )

  const world = useMemo(
    () =>
      buildWorld({
        now,
        household: HOUSEHOLD,
        observations,
        outages,
        routines,
        consequenceOverrides,
      }),
    [now, observations, outages, routines, consequenceOverrides],
  )

  /*
   * One place watches the world and reports what moved.
   *
   * Earlier this was done by rebuilding the world twice per action and diffing
   * the two, which meant every new control had to remember to do it. Deriving
   * the change from the world itself means a verdict that flips during playback
   * is reported the same way as one that flips because a camera was blinded,
   * and nothing can forget to say so.
   */
  const actionLabel = useRef<string | null>(null)
  const prevSnapshot = useRef<{
    statuses: Map<string, ExpectationStatus>
    novelties: number
    links: number
  } | null>(null)

  useEffect(() => {
    const statuses = new Map(world.expectations.map((e) => [e.id, e.status]))
    const snapshot = {
      statuses,
      novelties: world.novelties.length,
      links: world.correlations.length,
    }
    const prev = prevSnapshot.current
    prevSnapshot.current = snapshot
    if (!prev) return

    const changed: Flip[] = []
    for (const [id, status] of statuses) {
      const was = prev.statuses.get(id)
      if (!was || was === status) continue
      const e = world.expectations.find((x) => x.id === id)
      const r = world.routines.find((x) => x.id === e?.routineId)
      changed.push({
        key: `${id}_${status}_${world.now}`,
        label: r?.shortLabel ?? 'an expectation',
        from: was,
        to: status,
        when: clockLabel(world.now),
        at: Date.now(),
      })
    }

    const bits = changed.map((c) => `${c.label} ${c.from} to ${c.to}`)
    if (snapshot.novelties > prev.novelties) {
      bits.push(`${snapshot.novelties - prev.novelties} new unexplained event`)
    }
    if (snapshot.links > prev.links) bits.push(`${snapshot.links - prev.links} new link`)

    if (changed.length) setFlips((f) => [...changed, ...f].slice(0, 6))
    if (bits.length) {
      setLastChange(`${actionLabel.current ?? 'Recomputed'}: ${bits.join(' · ')}`)
    } else if (actionLabel.current) {
      setLastChange(`${actionLabel.current}: no verdict changed`)
    }
    actionLabel.current = null
  }, [world])

  // Verdict notices are news for a moment and clutter after that.
  useEffect(() => {
    if (!flips.length) return
    const id = setTimeout(() => {
      setFlips((f) => f.filter((x) => Date.now() - x.at < 6000))
    }, 1200)
    return () => clearTimeout(id)
  }, [flips])

  // Playback. The hand sweeps the day and the inference re-runs under it.
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setClockOffsetMinRaw((prev) => {
        const next = prev + speedMin
        if (DEMO_MINUTE_OF_DAY + next >= 1439) {
          setPlaying(false)
          return 1439 - DEMO_MINUTE_OF_DAY
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [playing, speedMin])

  const setClockOffsetMin = useCallback((m: number, label = 'Clock moved') => {
    actionLabel.current = label
    setClockOffsetMinRaw(m)
  }, [])

  const play = useCallback(() => {
    actionLabel.current = 'Playing the day'
    setPlaying(true)
  }, [])
  const pause = useCallback(() => setPlaying(false), [])
  const restart = useCallback(() => {
    actionLabel.current = 'Replaying from midnight'
    setClockOffsetMinRaw(-DEMO_MINUTE_OF_DAY + 1)
    setPlaying(true)
  }, [])

  const scrubTo = useCallback(
    (minuteOfDay: number) => {
      if (scrubStart.current === null) {
        scrubStart.current = clockOffsetMin
        setScrubbing(true)
        setPlaying(false)
      }
      actionLabel.current = 'Clock moved'
      setClockOffsetMinRaw(Math.round(minuteOfDay) - DEMO_MINUTE_OF_DAY)
    },
    [clockOffsetMin],
  )

  const commitScrub = useCallback(() => {
    scrubStart.current = null
    setScrubbing(false)
  }, [])

  const inject = useCallback(
    (e: InjectableEvent) => {
      const ts = e.atMinute === undefined ? now : startOfLocalDay(now) + e.atMinute * MIN
      actionLabel.current = e.label
      setInjected((prev) => [
        ...prev,
        {
          id: `inj_${e.id}_${prev.length}`,
          ts,
          deviceId: e.deviceId,
          zone: e.zone,
          kind: e.kind,
          actor: e.actor,
          durationS: e.durationS,
          confidence: 0.88,
          note: e.note,
          injected: true,
        },
      ])
      if (ts > now) setClockOffsetMinRaw(Math.round((ts - DEMO_NOW) / MIN))
    },
    [now],
  )

  const setOutageOn = useCallback((v: boolean) => {
    actionLabel.current = v ? 'Charging window restored' : 'Charging window removed'
    setOutageOnRaw(v)
  }, [])

  const setConsequence = useCallback((routineId: string, value: number) => {
    actionLabel.current = 'Weighting changed'
    setOverrides((prev) => ({ ...prev, [routineId]: value }))
  }, [])

  /** A link to exactly what is on screen, for pasting to somebody else. */
  const shareLink = useCallback(() => window.location.href, [])

  const resetSim = useCallback(() => {
    actionLabel.current = 'Simulator reset'
    setInjected([])
    setClockOffsetMinRaw(0)
    setOutageOnRaw(true)
    setPlaying(false)
    setLastChange(null)
    setFlips([])
    setHighlight(NO_HIGHLIGHT)
    setSelectedId(null)
    setInspectId(null)
    setFocusZone(null)
    setOverrides({})
    setGhostLayer(true)
  }, [])

  const value: Store = {
    world,
    surface,
    setSurface,
    consoleView,
    setConsoleView,
    highlight,
    setHighlight,
    selectedId,
    setSelectedId,
    inspectId,
    setInspectId,
    focusZone,
    setFocusZone,
    clockOffsetMin,
    setClockOffsetMin,
    scrubTo,
    commitScrub,
    scrubbing,
    playing,
    play,
    pause,
    restart,
    speedMin,
    setSpeedMin,
    outageOn,
    setOutageOn,
    ghostLayer,
    setGhostLayer,
    consequenceOverrides,
    setConsequence,
    injected,
    inject,
    resetSim,
    theme,
    setTheme,
    shareLink,
    lastChange,
    flips,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}
