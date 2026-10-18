import {
  KIND_NAME,
  ZONE_NAME,
  clockLabel,
  durationLabel,
  startOfLocalDay,
  type Device,
} from '../../engine/index.ts'
import { INJECTABLE, useStore } from '../../state/store.tsx'
import { DayTimeline } from '../components/DayTimeline.tsx'
import { DeviceIcon } from '../components/DeviceIcon.tsx'
import { Transport } from '../components/Transport.tsx'
import { Legend, Pill } from '../components/Primitives.tsx'

/**
 * The Ring side.
 *
 * Everything the engine knows comes from this stream, so the simulator is the
 * honest way to prove the intelligence is live. Push an event, move the clock,
 * or take a camera offline, and the pipeline genuinely re-runs: routines,
 * verdicts, unexplained events and links are all recomputed from scratch. The
 * strip at the top of the right-hand column reports exactly which verdicts
 * flipped, which is the claim a scripted demo cannot make.
 */
export function RingSim() {
  const {
    world,
    highlight,
    setHighlight,
    inject,
    injected,
    resetSim,
    outageOn,
    setOutageOn,
    lastChange,
  } = useStore()

  const dayStart = startOfLocalDay(world.now)
  const todays = world.observations
    .filter((o) => o.ts >= dayStart && o.ts <= world.now)
    .sort((a, b) => b.ts - a.ts)
  const novelByObs = new Map(world.novelties.map((n) => [n.observationId, n]))

  const blind = (d: Device) =>
    world.outages.some((o) => o.deviceId === d.id && o.from <= world.now && o.to >= world.now)

  return (
    <div className="sim">
      <div className="sim-left">
        <div className="panel-head" style={{ padding: '0 0 12px' }}>
          <span className="panel-title">Ring devices</span>
          <span className="panel-note">{world.household.devices.length} online</span>
        </div>
        {world.household.devices.map((d) => (
          <div key={d.id} className={`device${blind(d) ? ' device--blind' : ''}`}>
            <span className="device-icon">
              <DeviceIcon deviceClass={d.deviceClass} />
            </span>
            <span>
              <span className="device-name">{d.name}</span>
              <span className="device-model">{d.model}</span>
            </span>
            {blind(d) ? <Pill tone="unknown">Blind</Pill> : <Pill tone="quiet">{ZONE_NAME[d.zone]}</Pill>}
          </div>
        ))}

        <div className="panel-head" style={{ padding: '18px 0 12px' }}>
          <span className="panel-title">Push an event</span>
          <span className="panel-note">at {clockLabel(world.now)}</span>
        </div>
        <div className="inject-grid">
          {INJECTABLE.map((e) => (
            <button key={e.id} className="inject" onClick={() => inject(e)}>
              <span className="inject-title">{e.label}</span>
              <span className="inject-sub">{e.blurb}</span>
            </button>
          ))}
        </div>

        <div className="panel-head" style={{ padding: '18px 0 12px' }}>
          <span className="panel-title">Move the clock</span>
        </div>
        <Transport />
        <p className="inject-sub" style={{ marginTop: 9 }}>
          Press play and the inference re-runs at every minute of the day. Expectations that sat
          open all morning turn into absences the moment their windows close, and each change is
          announced as it happens.
        </p>

        <div className="panel-head" style={{ padding: '18px 0 12px' }}>
          <span className="panel-title">Coverage</span>
        </div>
        <button className="btn" onClick={() => setOutageOn(!outageOn)}>
          {outageOn ? 'Remove the 3:12 PM charging window' : 'Restore the 3:12 PM charging window'}
        </button>
        <p className="inject-sub" style={{ marginTop: 9 }}>
          With the doorbell blind, the afternoon walk is reported as unknown. Give the doorbell its
          sight back and the same silence becomes a genuine absence. The difference between those
          two outputs is the whole trust argument.
        </p>

        <div style={{ marginTop: 20, display: 'flex', gap: 7 }}>
          <button className="btn" onClick={resetSim}>
            Reset simulator
          </button>
          {injected.length > 0 && <Pill tone="observed">{injected.length} pushed</Pill>}
        </div>
      </div>

      <div className="sim-right">
        {lastChange ? (
          <div className="diffbar">
            <Pill tone="observed">Recomputed</Pill>
            <span>{lastChange}</span>
          </div>
        ) : (
          <div className="diffbar" style={{ borderColor: 'var(--rule)', background: 'var(--surface)' }}>
            <Pill tone="quiet">Idle</Pill>
            <span style={{ color: 'var(--ink-2)' }}>
              Push an event, move the clock, or blind a camera. Every verdict on every surface is
              recomputed from the stream.
            </span>
          </div>
        )}

        <div className="panel" style={{ marginBottom: 18 }}>
          <div className="panel-head">
            <span className="panel-title">Today, as the engine sees it</span>
            <span className="panel-note">
              {world.routines.length} routines · {world.novelties.length} unexplained
            </span>
          </div>
          <div style={{ padding: '6px 10px 10px' }}>
            <DayTimeline
              world={world}
              highlight={highlight}
              onPick={(p) =>
                setHighlight(
                  p.kind === 'observation'
                    ? { observationIds: [p.id], expectationIds: [], noveltyIds: [] }
                    : { observationIds: [], expectationIds: [p.id], noveltyIds: [] },
                )
              }
            />
          </div>
          <div style={{ padding: '0 16px 14px' }}>
            <Legend />
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Event stream</span>
            <span className="panel-note">{todays.length} events today, newest first</span>
          </div>
          <div style={{ padding: 1 }}>
            <div className="feed">
              {todays.map((o) => {
                const novel = novelByObs.get(o.id)
                const device = world.household.devices.find((d) => d.id === o.deviceId)
                return (
                  <div
                    key={o.id}
                    className={`feed-row${o.injected ? ' feed-row--new' : novel ? ' feed-row--novel' : ''}`}
                  >
                    <span className="feed-time">{clockLabel(o.ts)}</span>
                    <span className="feed-zone">{device?.name ?? ZONE_NAME[o.zone]}</span>
                    <span className="feed-what">
                      {KIND_NAME[o.kind]}
                      {o.actor ? ` · ${o.actor}` : ''}
                      {o.durationS ? ` · ${durationLabel(o.durationS)}` : ''}
                      {novel && (
                        <span style={{ marginLeft: 8 }}>
                          <Pill tone="expected">no precedent</Pill>
                        </span>
                      )}
                      {o.injected && (
                        <span style={{ marginLeft: 8 }}>
                          <Pill tone="observed">pushed</Pill>
                        </span>
                      )}
                    </span>
                    <span className="feed-conf">{(o.confidence * 100).toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
