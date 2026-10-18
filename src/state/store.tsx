import {
  createContext,
  useCallback,
  useContext,
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
  learnRoutines,
  startOfLocalDay,
  buildHistory,
  buildOutages,
  buildWorld,
  type Observation,
  type InjectableEvent,
  type WorldState,
} from '../engine/index.ts'

export type Surface = 'console' | 'firetv' | 'alexa' | 'ring'

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

interface Store {
  world: WorldState
  surface: Surface
  setSurface: (s: Surface) => void
  highlight: Highlight
  setHighlight: (h: Highlight) => void
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  /** Minutes added to the pinned demo clock. */
  clockOffsetMin: number
  setClockOffsetMin: (m: number) => void
  /** Whether the doorbell's charging window is in play. */
  outageOn: boolean
  setOutageOn: (v: boolean) => void
  injected: Observation[]
  inject: (e: InjectableEvent) => void
  resetSim: () => void
  /** Short description of what the last simulator action changed. */
  lastChange: string | null

  /** Whether the expected-but-absent layer is drawn. The product's thesis, as a switch. */
  ghostLayer: boolean
  setGhostLayer: (v: boolean) => void
  /** Drag the clock through the day; verdicts recompute as it moves. */
  scrubTo: (minuteOfDay: number) => void
  commitScrub: () => void
  scrubbing: boolean
  /** Household-set weights for how much each routine matters. */
  consequenceOverrides: Record<string, number>
  setConsequence: (routineId: string, value: number) => void
}

const Ctx = createContext<Store | null>(null)

/** The 21-day history is deterministic, so it is built once and never rebuilt. */
const BASE_HISTORY = buildHistory(DEMO_NOW)
const BASE_OUTAGES = buildOutages(DEMO_NOW)
/** Minute-of-day of the pinned demo clock, 7:45 PM. */
export const DEMO_MINUTE_OF_DAY = 19 * 60 + 45

export function StoreProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>('console')
  const [highlight, setHighlight] = useState<Highlight>(NO_HIGHLIGHT)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [clockOffsetMin, setClockOffsetMinRaw] = useState(0)
  const [outageOn, setOutageOnRaw] = useState(true)
  const [injected, setInjected] = useState<Observation[]>([])
  const [lastChange, setLastChange] = useState<string | null>(null)
  const [ghostLayer, setGhostLayer] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [consequenceOverrides, setOverrides] = useState<Record<string, number>>({})
  const scrubStart = useRef<number | null>(null)

  const now = DEMO_NOW + clockOffsetMin * MIN
  const outages = useMemo(
    () => (outageOn ? BASE_OUTAGES : BASE_OUTAGES.filter((o) => o.id !== 'g1')),
    [outageOn],
  )

  const observations = useMemo(() => [...BASE_HISTORY, ...injected], [injected])

  // Learning depends only on the observations and the calendar day, so it is
  // kept out of the clock-scrub path. Dragging the hand round the dial then
  // costs one evaluation pass, not one re-learn per frame.
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

  /** Describe the consequence of a change by diffing the verdicts either side. */
  const describeChange = useCallback(
    (before: WorldState, after: WorldState, prefix: string) => {
      const beforeById = new Map(before.expectations.map((e) => [e.id, e]))
      const flips: string[] = []
      for (const e of after.expectations) {
        const was = beforeById.get(e.id)
        if (was && was.status !== e.status) {
          const r = after.routines.find((x) => x.id === e.routineId)
          flips.push(`${r?.shortLabel ?? 'an expectation'}: ${was.status} to ${e.status}`)
        }
      }
      const newNovelties = after.novelties.length - before.novelties.length
      const newLinks = after.correlations.length - before.correlations.length
      const bits = [...flips]
      if (newNovelties > 0) bits.push(`${newNovelties} new unexplained event`)
      if (newLinks > 0) bits.push(`${newLinks} new link`)
      setLastChange(bits.length ? `${prefix}: ${bits.join(' · ')}` : `${prefix}: no verdict changed`)
    },
    [],
  )

  const inject = useCallback(
    (e: InjectableEvent) => {
      const ts = e.atMinute === undefined ? now : startOfLocalDay(now) + e.atMinute * MIN
      const nextNow = Math.max(now, ts)
      const next: Observation[] = [
        ...injected,
        {
          id: `inj_${e.id}_${injected.length}`,
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
      ]
      const before = buildWorld({ now, household: HOUSEHOLD, observations, outages, consequenceOverrides })
      const after = buildWorld({
        now: nextNow,
        household: HOUSEHOLD,
        observations: [...BASE_HISTORY, ...next],
        outages,
        consequenceOverrides,
      })
      describeChange(before, after, e.label)
      setInjected(next)
      if (nextNow !== now) setClockOffsetMinRaw(Math.round((nextNow - DEMO_NOW) / MIN))
    },
    [now, injected, observations, outages, consequenceOverrides, describeChange],
  )

  const setClockOffsetMin = useCallback(
    (m: number) => {
      const before = buildWorld({
        now: DEMO_NOW + clockOffsetMin * MIN,
        household: HOUSEHOLD,
        observations,
        outages,
        consequenceOverrides,
      })
      const after = buildWorld({
        now: DEMO_NOW + m * MIN,
        household: HOUSEHOLD,
        observations,
        outages,
        consequenceOverrides,
      })
      describeChange(before, after, m > clockOffsetMin ? 'Clock advanced' : 'Clock reset')
      setClockOffsetMinRaw(m)
    },
    [clockOffsetMin, observations, outages, consequenceOverrides, describeChange],
  )

  const setOutageOn = useCallback(
    (v: boolean) => {
      const nextOutages = v ? BASE_OUTAGES : BASE_OUTAGES.filter((o) => o.id !== 'g1')
      const before = buildWorld({ now, household: HOUSEHOLD, observations, outages, consequenceOverrides })
      const after = buildWorld({ now, household: HOUSEHOLD, observations, outages: nextOutages, consequenceOverrides })
      describeChange(before, after, v ? 'Charging window restored' : 'Charging window removed')
      setOutageOnRaw(v)
    },
    [now, observations, outages, consequenceOverrides, describeChange],
  )

  const scrubTo = useCallback(
    (minuteOfDay: number) => {
      if (scrubStart.current === null) {
        scrubStart.current = clockOffsetMin
        setScrubbing(true)
      }
      setClockOffsetMinRaw(Math.round(minuteOfDay) - DEMO_MINUTE_OF_DAY)
    },
    [clockOffsetMin],
  )

  const commitScrub = useCallback(() => {
    const from = scrubStart.current
    scrubStart.current = null
    setScrubbing(false)
    if (from === null || from === clockOffsetMin) return
    const before = buildWorld({
      now: DEMO_NOW + from * MIN,
      household: HOUSEHOLD,
      observations,
      outages,
      routines,
      consequenceOverrides,
    })
    describeChange(before, world, 'Clock moved')
  }, [clockOffsetMin, observations, outages, routines, consequenceOverrides, world, describeChange])

  const setConsequence = useCallback((routineId: string, value: number) => {
    setOverrides((prev) => ({ ...prev, [routineId]: value }))
  }, [])

  const resetSim = useCallback(() => {
    setInjected([])
    setClockOffsetMinRaw(0)
    setOutageOnRaw(true)
    setLastChange(null)
    setHighlight(NO_HIGHLIGHT)
    setSelectedId(null)
    setOverrides({})
    setGhostLayer(true)
  }, [])

  const value: Store = {
    world,
    surface,
    setSurface,
    highlight,
    setHighlight,
    selectedId,
    setSelectedId,
    clockOffsetMin,
    setClockOffsetMin,
    outageOn,
    setOutageOn,
    injected,
    inject,
    resetSim,
    lastChange,
    ghostLayer,
    setGhostLayer,
    scrubTo,
    commitScrub,
    scrubbing,
    consequenceOverrides,
    setConsequence,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('useStore must be used inside StoreProvider')
  return v
}
