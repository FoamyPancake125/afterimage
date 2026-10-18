import type { ReactNode } from 'react'
import type { Epistemic, Expectation } from '../../engine/index.ts'

export type Tone = 'observed' | 'expected' | 'unknown' | 'ok' | 'critical' | 'quiet'

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`pill pill--${tone}`}>{children}</span>
}

export function statusTone(status: Expectation['status']): Tone {
  switch (status) {
    case 'missing':
      return 'expected'
    case 'late':
      return 'expected'
    case 'uncertain':
      return 'unknown'
    case 'satisfied':
      return 'ok'
    default:
      return 'quiet'
  }
}

export function statusWord(status: Expectation['status']): string {
  return {
    missing: 'Did not happen',
    late: 'Off schedule',
    satisfied: 'On time',
    pending: 'Still open',
    uncertain: 'Cannot tell',
  }[status]
}

export function epistemicTone(e: Epistemic): Tone {
  return e === 'observed' ? 'observed' : e === 'expected' ? 'expected' : 'unknown'
}

/** Small donut for a support or confidence percentage. */
export function SupportRing({
  value,
  size = 34,
  tone = 'observed',
}: {
  value: number
  size?: number
  tone?: Tone
}) {
  const r = size / 2 - 3
  const c = 2 * Math.PI * r
  const stroke = `var(--${tone === 'quiet' ? 'text-3' : tone})`
  return (
    <svg className="support-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="2.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={`${c * Math.max(0, Math.min(1, value))} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 + 3.4}
        textAnchor="middle"
        fontSize={size * 0.3}
        fill="var(--ink-2)"
        fontFamily="var(--mono)"
      >
        {Math.round(value * 100)}
      </text>
    </svg>
  )
}

export function Metric({ label, value, bar }: { label: string; value: string; bar?: { pct: number; color: string } }) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {bar && (
        <span className="severity-track">
          <span style={{ width: `${Math.min(100, bar.pct)}%`, background: bar.color }} />
        </span>
      )}
    </div>
  )
}

/** The three-state key. Shown wherever the timeline is, on every surface. */
export function Legend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="legend">
      <span className="legend-item">
        <span className="legend-swatch legend-swatch--observed" />
        Observed{!compact && ': a device recorded it'}
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-swatch--expected" />
        Expected{!compact && ': should have happened, did not'}
      </span>
      <span className="legend-item">
        <span className="legend-swatch legend-swatch--unknown" />
        Unknown{!compact && ': nothing could see'}
      </span>
    </div>
  )
}

export function severityColor(severity: number): string {
  if (severity >= 65) return 'var(--critical)'
  if (severity >= 35) return 'var(--expected)'
  if (severity >= 10) return 'var(--unknown)'
  return 'var(--ink-3)'
}
