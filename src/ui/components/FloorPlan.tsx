import {
  MIN,
  ZONE_NAME,
  clockLabel,
  minuteLabel,
  startOfLocalDay,
  type Expectation,
  type WorldState,
  type Zone,
} from '../../engine/index.ts'
import { useStore, type Highlight } from '../../state/store.tsx'

interface Room {
  zone: Zone
  x: number
  y: number
  w: number
  h: number
  /** Outside the walls, so it is drawn without a floor fill. */
  exterior?: boolean
}

/** Shorter names, because a plan label has to fit the room it names. */
const PLAN_NAME: Partial<Record<Zone, string>> = {
  medicine_cabinet: 'Medicine',
  back_patio: 'Patio',
}

/*
 * A schematic, not a drawing. The point is relative position: that the medicine
 * cabinet sits off the hallway, that the driveway is beyond the front door. It
 * is laid out on a 100 by 74 grid so the proportions survive any size.
 */
const ROOMS: Room[] = [
  { zone: 'driveway', x: 1, y: 1, w: 30, h: 20, exterior: true },
  { zone: 'front_door', x: 1, y: 23, w: 30, h: 18 },
  { zone: 'hallway', x: 33, y: 23, w: 30, h: 18 },
  { zone: 'medicine_cabinet', x: 65, y: 23, w: 34, h: 18 },
  { zone: 'kitchen', x: 1, y: 43, w: 62, h: 30 },
  { zone: 'back_patio', x: 65, y: 43, w: 34, h: 30, exterior: true },
]

/**
 * The house, seen from above.
 *
 * The dial answers "when". This answers "where", which is the question a family
 * member actually asks first when something is wrong. Rooms carry their own
 * verdict: a room with an unmet expectation is drawn in the dashed outline the
 * rest of the product uses for absence, so the floor plan reads at a glance as
 * a map of what did not happen.
 */
export function FloorPlan({
  world,
  highlight,
  onPick,
}: {
  world: WorldState
  highlight: Highlight
  onPick?: (p: { kind: 'expectation'; id: string }) => void
}) {
  const { focusZone, setFocusZone } = useStore()
  const dayStart = startOfLocalDay(world.now)
  const todays = world.expectations.filter((e) => e.dayStart === dayStart)
  const zoneOf = (e: Expectation) =>
    world.routines.find((r) => r.id === e.routineId)?.zone ?? 'front_door'

  const byZone = (z: Zone) => todays.filter((e) => zoneOf(e) === z)
  const eventsIn = (z: Zone) =>
    world.observations.filter((o) => o.zone === z && o.ts >= dayStart && o.ts <= world.now)
  const noveltyIn = (z: Zone) =>
    world.novelties.some((n) => {
      const o = world.observations.find((x) => x.id === n.observationId)
      return o?.zone === z
    })
  const blindIn = (z: Zone) =>
    world.outages.some((o) => {
      const d = world.household.devices.find((x) => x.id === o.deviceId)
      return d?.zone === z && o.from <= world.now && o.to >= world.now
    })

  return (
    <div className="plan">
      <svg className="plan-svg" viewBox="0 0 100 74" role="img" aria-label="The house from above">
        <defs>
          <pattern id="planhatch" width="4" height="4" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--unknown)" strokeWidth="1.4" opacity="0.5" />
          </pattern>
        </defs>

        {ROOMS.map((room) => {
          const exps = byZone(room.zone)
          const missing = exps.filter((e) => e.status === 'missing')
          const uncertain = exps.filter((e) => e.status === 'uncertain')
          const worst = missing.sort((a, b) => b.severity - a.severity)[0]
          const events = eventsIn(room.zone)
          const novel = noveltyIn(room.zone)
          const blind = blindIn(room.zone)
          const dimmed = focusZone !== null && focusZone !== room.zone
          const selected = focusZone === room.zone

          return (
            <g
              key={room.zone}
              className={`plan-room${dimmed ? ' plan-room--dim' : ''}${selected ? ' plan-room--on' : ''}`}
              onClick={() => setFocusZone(selected ? null : room.zone)}
            >
              <rect
                x={room.x}
                y={room.y}
                width={room.w}
                height={room.h}
                rx="1"
                fill={room.exterior ? 'transparent' : 'var(--surface)'}
                stroke={
                  missing.length ? 'var(--expected)' : uncertain.length ? 'var(--unknown)' : 'var(--rule)'
                }
                strokeWidth={missing.length || uncertain.length ? 0.7 : 0.45}
                strokeDasharray={room.exterior ? '2 1.6' : missing.length ? '2.4 1.6' : undefined}
              />

              {blind && (
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  rx="1"
                  fill="url(#planhatch)"
                />
              )}

              <text className="plan-name" x={room.x + 2.4} y={room.y + 5}>
                {PLAN_NAME[room.zone] ?? ZONE_NAME[room.zone]}
              </text>

              {/* Observed activity, one mark per event along the room's floor */}
              {events.slice(-14).map((o, i) => (
                <circle
                  key={o.id}
                  cx={room.x + 3 + (i % 12) * 2.3}
                  cy={room.y + room.h - 3.2}
                  r={highlight.observationIds.includes(o.id) ? 1.05 : 0.72}
                  fill={
                    world.novelties.some((n) => n.observationId === o.id)
                      ? 'var(--expected)'
                      : 'var(--observed)'
                  }
                  opacity={highlight.observationIds.length && !highlight.observationIds.includes(o.id) ? 0.3 : 0.9}
                />
              ))}

              {worst && (
                <g
                  className="plan-ghost"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onPick?.({ kind: 'expectation', id: worst.id })
                  }}
                >
                  <circle
                    className="tl-pulse"
                    cx={room.x + room.w - 6}
                    cy={room.y + 7}
                    r={4.6}
                    fill="var(--expected)"
                  />
                  <circle
                    cx={room.x + room.w - 6}
                    cy={room.y + 7}
                    r="2.9"
                    fill="var(--paper)"
                    stroke="var(--expected)"
                    strokeWidth="0.75"
                    strokeDasharray="1.5 1.5"
                  />
                  <text className="plan-ghost-time" x={room.x + room.w - 6} y={room.y + 13.4} textAnchor="middle">
                    {minuteLabel((worst.expectedAt - dayStart) / MIN).replace(' ', '')}
                    {missing.length > 1 ? ` +${missing.length - 1}` : ''}
                  </text>
                </g>
              )}

              {novel && !worst && (
                <circle cx={room.x + room.w - 5} cy={room.y + 6} r="1.5" fill="var(--expected)" />
              )}

              <text className="plan-count" x={room.x + room.w - 2.4} y={room.y + 5} textAnchor="end">
                {events.length ? `${events.length}` : ''}
              </text>
            </g>
          )
        })}
      </svg>

      <div className="plan-foot">
        {focusZone ? (
          <>
            <span>
              Showing <b>{ZONE_NAME[focusZone]}</b> only.
            </span>
            <button className="btn" onClick={() => setFocusZone(null)}>
              Show the whole house
            </button>
          </>
        ) : (
          <span>
            Click a room to narrow every panel to it. Dashed walls mark a room with an expectation
            nothing met; hatching marks a room nothing could see. Last event{' '}
            {clockLabel(
              Math.max(
                ...world.observations.filter((o) => o.ts <= world.now).map((o) => o.ts),
              ),
            )}
            .
          </span>
        )}
      </div>
    </div>
  )
}
