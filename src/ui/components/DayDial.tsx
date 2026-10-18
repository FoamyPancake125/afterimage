import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  MIN,
  ZONE_NAME,
  clockLabel,
  dayDeparture,
  durationLabel,
  minuteLabel,
  minuteOfDay,
  startOfLocalDay,
  type Expectation,
  type WorldState,
  type Zone,
} from '../../engine/index.ts'
import { useStore, type Highlight } from '../../state/store.tsx'

const ZONE_ORDER: Zone[] = [
  'front_door',
  'driveway',
  'back_patio',
  'kitchen',
  'medicine_cabinet',
  'hallway',
]

const VB = 616
const C = VB / 2
const R_TRACK = 268
const R_FIRST = 246
const R_STEP = 28
const RING_W = 22
const R_HUB = 88

const TAU = Math.PI * 2
const ang = (m: number) => (m / 1440) * TAU - Math.PI / 2
const px = (r: number, m: number) => C + r * Math.cos(ang(m))
const py = (r: number, m: number) => C + r * Math.sin(ang(m))

interface Hovered {
  label: string
  detail: string
  tone: 'observed' | 'expected' | 'unknown'
}

/**
 * The day as a dial.
 *
 * A household's day is a cycle, not a line, and the thing this product is
 * about, something that normally happens at a time not happening, is far
 * easier to see as a gap in a ring than as a gap in a bar chart. Each ring is
 * one zone of the house. Solid marks are what Ring recorded. The dashed rings
 * with a spoke running through them are the afterimages: expectations the
 * household's own history insisted on, which nothing satisfied.
 *
 * The hand is draggable. Moving it re-runs the whole inference at that moment,
 * so you can watch an expectation sit harmlessly open all evening and then
 * turn into an absence the moment its window closes, which is the one thing a
 * recorded demo cannot show you.
 */
export function DayDial({
  world,
  highlight,
  selectedId,
  onPick,
}: {
  world: WorldState
  highlight: Highlight
  selectedId?: string | null
  onPick?: (p: { kind: 'observation' | 'expectation'; id: string }) => void
}) {
  const { ghostLayer, scrubTo, commitScrub, scrubbing } = useStore()
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<Hovered | null>(null)
  const dragging = useRef(false)

  const dayStart = startOfLocalDay(world.now)
  const nowMin = minuteOfDay(world.now)
  const zones = ZONE_ORDER.filter((z) => world.household.devices.some((d) => d.zone === z))
  const radiusOf = (z: Zone) => R_FIRST - zones.indexOf(z) * R_STEP

  const todays = world.expectations.filter((e) => e.dayStart === dayStart)
  const todaysObs = world.observations.filter((o) => o.ts >= dayStart && o.ts <= world.now)
  const novelByObs = new Map(world.novelties.map((n) => [n.observationId, n]))
  const satisfiers = new Set(todays.map((e) => e.satisfiedById).filter(Boolean) as string[])
  const routineZone = (e: Expectation) =>
    world.routines.find((r) => r.id === e.routineId)?.zone ?? 'front_door'
  const routineOf = (e: Expectation) => world.routines.find((r) => r.id === e.routineId)

  const anyHighlight = highlight.observationIds.length + highlight.expectationIds.length > 0

  // ---- scrubbing ----------------------------------------------------------
  const minuteFromEvent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * VB - C
    const y = ((clientY - rect.top) / rect.height) * VB - C
    let a = Math.atan2(y, x) + Math.PI / 2
    if (a < 0) a += TAU
    return (a / TAU) * 1440
  }, [])

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true
      ;(e.target as Element).setPointerCapture?.(e.pointerId)
      scrubTo(minuteFromEvent(e.clientX, e.clientY))
    },
    [minuteFromEvent, scrubTo],
  )

  useEffect(() => {
    if (!scrubbing) return
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      scrubTo(minuteFromEvent(e.clientX, e.clientY))
    }
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      commitScrub()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [scrubbing, scrubTo, commitScrub, minuteFromEvent])

  const nudge = (delta: number) => {
    scrubTo(Math.max(1, Math.min(1439, nowMin + delta)))
    commitScrub()
  }

  const departure = dayDeparture(world)
  const circ = (r: number) => TAU * r
  /** Draw an arc on a ring by dashing its circle, so no path maths is needed. */
  const arc = (r: number, from: number, to: number) => {
    const len = ((to - from) / 1440) * circ(r)
    return {
      strokeDasharray: `${Math.max(0.5, len)} ${circ(r)}`,
      strokeDashoffset: -((from / 1440) * circ(r)),
    }
  }

  return (
    <div className="dial">
      <svg
        ref={svgRef}
        className="dial-svg"
        viewBox={`0 0 ${VB} ${VB}`}
        role="img"
        aria-label="The household day, drawn as observed, expected and unknown"
      >
        <defs>
          <pattern
            id={`dh${uid}`}
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--unknown)" strokeWidth="2.4" opacity="0.55" />
          </pattern>
        </defs>

        <g transform={`rotate(-90 ${C} ${C})`}>
          {/* Night, 9 PM to 6 AM, so the 3 AM patio door reads as night at a glance */}
          <circle
            cx={C}
            cy={C}
            r={(R_FIRST + R_HUB) / 2}
            fill="none"
            stroke="rgba(135,147,160,0.05)"
            strokeWidth={R_FIRST - R_HUB + RING_W}
            {...arc((R_FIRST + R_HUB) / 2, 1260, 1800)}
          />

          {/* Zone rings */}
          {zones.map((z) => (
            <circle
              key={z}
              cx={C}
              cy={C}
              r={radiusOf(z)}
              fill="none"
              stroke="rgba(255,255,255,0.028)"
              strokeWidth={RING_W}
            />
          ))}

          {/* Elapsed day */}
          <circle
            cx={C}
            cy={C}
            r={R_TRACK}
            fill="none"
            stroke="var(--line)"
            strokeWidth="3"
          />
          <circle
            cx={C}
            cy={C}
            r={R_TRACK}
            fill="none"
            stroke="var(--observed)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.75"
            {...arc(R_TRACK, 0, nowMin)}
          />

          {/* Coverage gaps: nothing may be claimed inside them */}
          {world.outages
            .filter((o) => o.to > dayStart && o.from < dayStart + 1440 * MIN)
            .map((o) => {
              const d = world.household.devices.find((x) => x.id === o.deviceId)
              if (!d || !zones.includes(d.zone)) return null
              const r = radiusOf(d.zone)
              return (
                <circle
                  key={o.id}
                  cx={C}
                  cy={C}
                  r={r}
                  fill="none"
                  stroke={`url(#dh${uid})`}
                  strokeWidth={RING_W}
                  {...arc(r, minuteOfDay(o.from), minuteOfDay(o.to))}
                />
              )
            })}

          {/* Expected windows */}
          {ghostLayer &&
            todays
              .filter((e) => e.status === 'missing' || e.status === 'late')
              .map((e) => {
                const r = radiusOf(routineZone(e))
                return (
                  <circle
                    key={`w${e.id}`}
                    cx={C}
                    cy={C}
                    r={r}
                    fill="none"
                    stroke="var(--expected)"
                    strokeWidth={RING_W}
                    opacity={anyHighlight && !highlight.expectationIds.includes(e.id) ? 0.05 : 0.13}
                    {...arc(r, minuteOfDay(e.windowStart), minuteOfDay(e.windowEnd))}
                  />
                )
              })}
        </g>

        {/* Hour ticks and labels */}
        {Array.from({ length: 24 }, (_, h) => h).map((h) => {
          const major = h % 3 === 0
          const m = h * 60
          return (
            <g key={h}>
              <line
                x1={px(R_TRACK + 6, m)}
                y1={py(R_TRACK + 6, m)}
                x2={px(R_TRACK + (major ? 14 : 10), m)}
                y2={py(R_TRACK + (major ? 14 : 10), m)}
                stroke="var(--line)"
                strokeWidth={major ? 1.6 : 1}
              />
              {major && (
                <text
                  className="dial-hour"
                  x={px(R_TRACK + 28, m)}
                  y={py(R_TRACK + 28, m) + 4}
                  textAnchor="middle"
                >
                  {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
                </text>
              )}
            </g>
          )
        })}

        {/* Zone labels, tucked along the 9 o'clock radius */}
        {zones.map((z) => (
          <text
            key={z}
            className="dial-zone"
            x={C}
            y={C - radiusOf(z) + 3.5}
            textAnchor="middle"
            paintOrder="stroke"
            stroke="var(--bg)"
            strokeWidth="4"
            strokeLinejoin="round"
          >
            {ZONE_NAME[z]}
          </text>
        ))}

        {/* Observations */}
        {todaysObs.map((o) => {
          const novel = novelByObs.get(o.id)
          const r = radiusOf(o.zone)
          const m = minuteOfDay(o.ts)
          const dim = anyHighlight && !highlight.observationIds.includes(o.id)
          const rad = novel ? 4.6 : 3.3
          return (
            <g key={o.id} opacity={dim ? 0.32 : 1}>
              {novel && (
                <circle className="tl-pulse" cx={px(r, m)} cy={py(r, m)} r={rad * 2.2} fill="var(--expected)" />
              )}
              <circle
                cx={px(r, m)}
                cy={py(r, m)}
                r={rad}
                fill={novel ? 'var(--expected)' : satisfiers.has(o.id) ? 'var(--ok)' : 'var(--observed)'}
                opacity={novel || satisfiers.has(o.id) ? 1 : 0.78}
              />
              {o.injected && (
                <circle cx={px(r, m)} cy={py(r, m)} r={rad + 4} fill="none" stroke="var(--observed)" strokeWidth="1" />
              )}
              <circle
                className="tl-hit"
                cx={px(r, m)}
                cy={py(r, m)}
                r={10}
                onClick={() => onPick?.({ kind: 'observation', id: o.id })}
                onMouseEnter={() =>
                  setHover({
                    label: `${clockLabel(o.ts)} · ${ZONE_NAME[o.zone]}`,
                    detail: `${o.kind.replace('_', ' ')}${o.actor ? ` · ${o.actor}` : ''}${
                      o.durationS ? ` · ${durationLabel(o.durationS)}` : ''
                    }`,
                    tone: novel ? 'expected' : 'observed',
                  })
                }
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}

        {/* Afterimages */}
        {ghostLayer &&
          todays
            .filter((e) => e.status === 'missing' || e.status === 'uncertain' || e.status === 'pending')
            .map((e) => {
              const r = radiusOf(routineZone(e))
              const m = minuteOfDay(e.expectedAt)
              const dim = anyHighlight && !highlight.expectationIds.includes(e.id)
              const tone =
                e.status === 'missing'
                  ? 'var(--expected)'
                  : e.status === 'uncertain'
                    ? 'var(--unknown)'
                    : 'var(--text-3)'
              const active = selectedId === e.id
              const r0 = R_HUB + 4
              const r1 = R_TRACK - 8
              return (
                <g key={e.id} opacity={dim ? 0.26 : 1}>
                  <line
                    x1={px(r0, m)}
                    y1={py(r0, m)}
                    x2={px(r1, m)}
                    y2={py(r1, m)}
                    stroke={tone}
                    strokeWidth={active ? 1.6 : 1}
                    strokeDasharray="3 6"
                    opacity={e.status === 'pending' ? 0.3 : active ? 0.85 : 0.5}
                  />
                  {e.status === 'missing' && (
                    <circle className="tl-pulse" cx={px(r, m)} cy={py(r, m)} r={13} fill="var(--expected)" />
                  )}
                  <circle
                    cx={px(r, m)}
                    cy={py(r, m)}
                    r={active ? 8.5 : 6.6}
                    fill="var(--bg)"
                    stroke={tone}
                    strokeWidth={active ? 2.3 : 1.7}
                    strokeDasharray="3 3"
                  />
                  <circle
                    className="tl-hit"
                    cx={px(r, m)}
                    cy={py(r, m)}
                    r={14}
                    onClick={() => onPick?.({ kind: 'expectation', id: e.id })}
                    onMouseEnter={() =>
                      setHover({
                        label: `${minuteLabel(m)} · expected`,
                        detail: routineOf(e)?.label ?? '',
                        tone: e.status === 'uncertain' ? 'unknown' : 'expected',
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                  />
                </g>
              )
            })}

        {/* Hub */}
        <circle cx={C} cy={C} r={R_HUB} fill="var(--bg)" stroke="var(--line)" strokeWidth="1" />

        {/* The hand */}
        <line
          x1={C}
          y1={C}
          x2={px(R_TRACK - 2, nowMin)}
          y2={py(R_TRACK - 2, nowMin)}
          stroke="var(--text)"
          strokeWidth="1.4"
          opacity="0.75"
        />
        <circle
          className={`dial-knob${scrubbing ? ' dial-knob--active' : ''}`}
          cx={px(R_TRACK, nowMin)}
          cy={py(R_TRACK, nowMin)}
          r="11"
          onPointerDown={startDrag}
          tabIndex={0}
          role="slider"
          aria-label="Time of day"
          aria-valuemin={0}
          aria-valuemax={1439}
          aria-valuenow={Math.round(nowMin)}
          aria-valuetext={clockLabel(world.now)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') nudge(15)
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') nudge(-15)
            else return
            e.preventDefault()
          }}
        />
      </svg>

      <div className="dial-hub">
        {hover ? (
          <>
            <span className={`dial-hub-kicker dial-hub-kicker--${hover.tone}`}>{hover.label}</span>
            <span className="dial-hub-detail">{hover.detail}</span>
          </>
        ) : (
          <>
            <span className="dial-hub-time mono">{clockLabel(world.now)}</span>
            <span className="dial-hub-kicker">
              {scrubbing ? 'scrubbing the day' : 'drag the hand'}
            </span>
            <span className="dial-hub-detail">
              departure <b className="mono">{departure}</b> / 100
            </span>
          </>
        )}
      </div>
    </div>
  )
}
