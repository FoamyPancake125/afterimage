import { useId } from 'react'
import {
  MIN,
  ZONE_NAME,
  clockLabel,
  minuteOfDay,
  startOfLocalDay,
  type Expectation,
  type Observation,
  type WorldState,
  type Zone,
} from '../../engine/index.ts'
import type { Highlight } from '../../state/store.tsx'

const ZONE_ORDER: Zone[] = [
  'front_door',
  'driveway',
  'back_patio',
  'kitchen',
  'medicine_cabinet',
  'hallway',
]

export interface Pick {
  kind: 'observation' | 'expectation'
  id: string
}

interface Props {
  world: WorldState
  highlight: Highlight
  selectedId?: string | null
  onPick?: (p: Pick) => void
  /** Vertical room per zone. The Fire TV surface passes a larger value. */
  laneH?: number
  labelW?: number
  fontScale?: number
}

/**
 * The day, drawn as evidence.
 *
 * Solid dots are observations, things a Ring device actually recorded. The
 * hollow dashed rings are the afterimages: expectations the household's own
 * history insisted on, which nothing satisfied. Hatched bands are windows where
 * no device could see, and therefore where no claim is permitted at all.
 *
 * Drawing all three on one axis is the argument of the whole product. Absence
 * only becomes legible next to presence.
 */
export function DayTimeline({
  world,
  highlight,
  selectedId,
  onPick,
  laneH = 34,
  labelW = 112,
  fontScale = 1,
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const W = 1200
  const padRight = 26
  const padTop = 26 * fontScale
  const padBottom = 10

  const dayStart = startOfLocalDay(world.now)
  const dayEnd = dayStart + 1440 * MIN

  const zones = ZONE_ORDER.filter((z) => world.household.devices.some((d) => d.zone === z))
  const H = padTop + zones.length * laneH + padBottom
  const x = (ts: number) => labelW + ((ts - dayStart) / (dayEnd - dayStart)) * (W - labelW - padRight)
  const laneY = (z: Zone) => padTop + zones.indexOf(z) * laneH + laneH / 2

  const todays = world.expectations.filter((e) => e.dayStart === dayStart)
  const todaysObs = world.observations.filter((o) => o.ts >= dayStart && o.ts <= world.now)
  const novelByObs = new Map(world.novelties.map((n) => [n.observationId, n]))
  const satisfiers = new Set(todays.map((e) => e.satisfiedById).filter(Boolean) as string[])

  const anyHighlight =
    highlight.observationIds.length + highlight.expectationIds.length > 0
  const dimObs = (o: Observation) =>
    anyHighlight && !highlight.observationIds.includes(o.id) ? ' tl-dim' : ''
  const dimExp = (e: Expectation) =>
    anyHighlight && !highlight.expectationIds.includes(e.id) ? ' tl-dim' : ''

  return (
    <div className="timeline-wrap">
      <svg
        className="timeline-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Today, drawn as observed, expected and unknown"
      >
        <defs>
          <pattern
            id={`hatch${uid}`}
            width="7"
            height="7"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--unknown)" strokeWidth="2" opacity="0.5" />
          </pattern>
        </defs>

        {/* Hour axis */}
        {Array.from({ length: 9 }, (_, i) => i * 3).map((h) => {
          const ts = dayStart + h * 60 * MIN
          return (
            <g key={h}>
              <line className="tl-grid" x1={x(ts)} y1={padTop - 6} x2={x(ts)} y2={H - padBottom} />
              <text className="tl-hour" x={x(ts)} y={padTop - 11} textAnchor="middle" fontSize={10 * fontScale}>
                {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
              </text>
            </g>
          )
        })}

        {/* Lanes */}
        {zones.map((z) => (
          <g key={z}>
            <text
              className="tl-lane-label"
              x={labelW - 12}
              y={laneY(z) + 3.5 * fontScale}
              textAnchor="end"
              fontSize={10.5 * fontScale}
            >
              {ZONE_NAME[z]}
            </text>
            <line className="tl-lane-rule" x1={labelW} y1={laneY(z)} x2={W - padRight} y2={laneY(z)} />
          </g>
        ))}

        {/* Coverage gaps, hatched, because nothing may be claimed inside them */}
        {world.outages
          .filter((o) => o.to > dayStart && o.from < dayEnd)
          .map((o) => {
            const d = world.household.devices.find((dev) => dev.id === o.deviceId)
            if (!d || !zones.includes(d.zone)) return null
            const x0 = x(Math.max(o.from, dayStart))
            const x1 = x(Math.min(o.to, dayEnd))
            return (
              <rect
                key={o.id}
                x={x0}
                y={laneY(d.zone) - laneH / 2 + 3}
                width={Math.max(2, x1 - x0)}
                height={laneH - 6}
                fill={`url(#hatch${uid})`}
                stroke="rgba(135,147,160,0.6)"
                strokeWidth="1"
                rx="3"
              />
            )
          })}

        {/* Expected windows, drawn faintly behind everything else */}
        {todays
          .filter((e) => e.status === 'missing' || e.status === 'late')
          .map((e) => (
            <rect
              key={`w${e.id}`}
              className={`tl-window${dimExp(e)}`}
              x={x(e.windowStart)}
              y={laneY(routineZone(world, e)) - laneH / 2 + 4}
              width={Math.max(3, x(e.windowEnd) - x(e.windowStart))}
              height={laneH - 8}
              rx="3"
            />
          ))}

        {/* Observations */}
        {todaysObs.map((o) => {
          const novel = novelByObs.get(o.id)
          const isSatisfier = satisfiers.has(o.id)
          const r = (novel ? 4.6 : 3.4) * fontScale
          return (
            <g key={o.id} className={dimObs(o)}>
              {novel && (
                <circle className="tl-pulse" cx={x(o.ts)} cy={laneY(o.zone)} r={r * 1.9} fill="var(--expected)" />
              )}
              <circle
                cx={x(o.ts)}
                cy={laneY(o.zone)}
                r={r}
                fill={novel ? 'var(--expected)' : isSatisfier ? 'var(--ok)' : 'var(--observed)'}
                opacity={novel || isSatisfier ? 1 : 0.8}
              />
              {o.injected && (
                <circle
                  cx={x(o.ts)}
                  cy={laneY(o.zone)}
                  r={r + 3.5}
                  fill="none"
                  stroke="var(--observed)"
                  strokeWidth="1"
                  opacity="0.6"
                />
              )}
              <circle
                className="tl-hit"
                cx={x(o.ts)}
                cy={laneY(o.zone)}
                r={Math.max(9, r * 2.6)}
                onClick={() => onPick?.({ kind: 'observation', id: o.id })}
              >
                <title>{`${clockLabel(o.ts)} · ${ZONE_NAME[o.zone]} · ${o.kind.replace('_', ' ')}${
                  o.actor ? ` · ${o.actor}` : ''
                }`}</title>
              </circle>
            </g>
          )
        })}

        {/* Afterimages: expectations nothing satisfied */}
        {todays
          .filter((e) => e.status === 'missing' || e.status === 'uncertain' || e.status === 'pending')
          .map((e) => {
            const z = routineZone(world, e)
            const cx = x(e.expectedAt)
            const cy = laneY(z)
            const tone =
              e.status === 'missing' ? 'var(--expected)' : e.status === 'uncertain' ? 'var(--unknown)' : 'var(--ink-3)'
            const active = selectedId === e.id
            return (
              <g key={e.id} className={dimExp(e)}>
                <line
                  x1={cx}
                  y1={cy - laneH / 2 + 4}
                  x2={cx}
                  y2={cy + laneH / 2 - 4}
                  stroke={tone}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity={e.status === 'pending' ? 0.3 : 0.55}
                />
                {e.status === 'missing' && (
                  <circle className="tl-pulse" cx={cx} cy={cy} r={10 * fontScale} fill="var(--expected)" />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={(active ? 7.5 : 5.8) * fontScale}
                  fill="none"
                  stroke={tone}
                  strokeWidth={(active ? 2.2 : 1.6) * fontScale}
                  strokeDasharray="3 3"
                />
                <circle
                  className="tl-hit"
                  cx={cx}
                  cy={cy}
                  r={13 * fontScale}
                  onClick={() => onPick?.({ kind: 'expectation', id: e.id })}
                >
                  <title>{`Expected ${clockLabel(e.expectedAt)} · ${e.status}`}</title>
                </circle>
              </g>
            )
          })}

        {/* Now */}
        <line className="tl-now" x1={x(world.now)} y1={padTop - 6} x2={x(world.now)} y2={H - padBottom} />
        <polygon
          className="tl-now-cap"
          points={`${x(world.now) - 4},${padTop - 6} ${x(world.now) + 4},${padTop - 6} ${x(world.now)},${padTop - 1}`}
        />
      </svg>
    </div>
  )
}

function routineZone(world: WorldState, e: Expectation): Zone {
  return world.routines.find((r) => r.id === e.routineId)?.zone ?? 'front_door'
}

/** Compact “what time is it in the household” readout used in headers. */
export function ClockReadout({ world }: { world: WorldState }) {
  const m = minuteOfDay(world.now)
  return (
    <span className="clock">
      <b className="mono">{clockLabel(world.now)}</b>
      <span>
        {new Date(world.now).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
        {m > 1080 ? ' · evening' : m > 720 ? ' · afternoon' : ' · morning'}
      </span>
    </span>
  )
}
