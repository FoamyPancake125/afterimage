import { dayLabel, recentDays, type WorldState } from '../../engine/index.ts'
import { DEMO_MINUTE_OF_DAY, useStore } from '../../state/store.tsx'

/**
 * A week of context behind today.
 *
 * One bad day means very little on its own. The thing a family actually wants
 * to know is whether this is the first time or the fourth, and the only honest
 * way to answer that is to show the days either side of it rather than assert
 * a trend.
 */
export function WeekStrip({ world }: { world: WorldState }) {
  const { setClockOffsetMin } = useStore()
  const days = recentDays(world, 7)
  if (days.length < 2) return null

  const today = days[days.length - 1]?.dayStart

  return (
    <div className="week">
      {days.map((d) => {
        const isToday = d.dayStart === today
        return (
          <button
            key={d.dayStart}
            className={`week-day${isToday ? ' week-day--on' : ''}`}
            title={`${dayLabel(d.dayStart, world.now)}: ${d.missing} missed, ${d.uncertain} unknown`}
            onClick={() => {
              const delta = Math.round((d.dayStart - world.now) / 60000) + DEMO_MINUTE_OF_DAY
              setClockOffsetMin(delta, `Looked at ${dayLabel(d.dayStart, world.now)}`)
            }}
          >
            <span className="week-bar">
              <span
                style={{
                  height: `${Math.max(4, d.departure)}%`,
                  background:
                    d.departure >= 65
                      ? 'var(--critical)'
                      : d.departure >= 35
                        ? 'var(--expected)'
                        : 'var(--ok)',
                }}
              />
            </span>
            <span className="week-label">
              {isToday
                ? 'Today'
                : new Date(d.dayStart).toLocaleDateString([], { weekday: 'short' })}
            </span>
            <span className="week-value num">{d.departure}</span>
          </button>
        )
      })}
    </div>
  )
}
