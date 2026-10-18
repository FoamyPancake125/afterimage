import {
  dayLabel,
  minuteOfDay,
  routineHistory,
  type Routine,
  type WorldState,
} from '../../engine/index.ts'

/**
 * Twenty-one days of one routine, as twenty-one marks.
 *
 * "It has happened on 21 of the last 21 days" is a sentence a reader has to
 * take on trust. A row of twenty solid marks ending in one hollow one is the
 * same claim, checkable at a glance, and it also shows the shape of the habit:
 * whether the thing is punctual, whether it drifts, whether it has been
 * wobbling for a week before today.
 */
export function HistoryStrip({ world, routine }: { world: WorldState; routine: Routine }) {
  const history = routineHistory(
    routine,
    world.observations,
    world.outages,
    world.household.devices,
    world.now,
    21,
  )
  if (!history.length) return null

  const satisfied = history.filter((e) => e.status === 'satisfied').length
  const off = history.filter((e) => e.status === 'late').length
  const broken = history.filter((e) => e.status === 'missing').length

  return (
    <div className="strip">
      <div className="strip-head">
        <span className="strip-title">Every applicable day, oldest first</span>
        <span className="strip-stat mono">
          {satisfied} on time{off ? ` · ${off} off schedule` : ''}
          {broken ? ` · ${broken} missed` : ''}
        </span>
      </div>

      <div className="strip-cells">
        {history.map((e) => {
          const hit = world.observations.find((o) => o.id === e.satisfiedById)
          const delta = hit ? Math.round(minuteOfDay(hit.ts) - routine.expectedMinute) : null
          return (
            <span
              key={e.id}
              className={`cell cell--${e.status}`}
              title={`${dayLabel(e.dayStart, world.now)}: ${e.status}${
                delta !== null ? ` (${delta > 0 ? '+' : ''}${delta} min)` : ''
              }`}
            >
              {/* The bar's offset shows how early or late it ran that day. */}
              <span
                className="cell-mark"
                style={
                  delta !== null
                    ? { transform: `translateY(${Math.max(-9, Math.min(9, delta / 4))}px)` }
                    : undefined
                }
              />
            </span>
          )
        })}
      </div>

      <div className="strip-foot">
        <span className="strip-key">
          <i className="cell cell--satisfied" />
          on time
        </span>
        <span className="strip-key">
          <i className="cell cell--late" />
          off schedule
        </span>
        <span className="strip-key">
          <i className="cell cell--missing" />
          did not happen
        </span>
        <span className="strip-key">
          <i className="cell cell--uncertain" />
          no coverage
        </span>
        <span className="strip-note">vertical offset is how early or late it ran</span>
      </div>
    </div>
  )
}
