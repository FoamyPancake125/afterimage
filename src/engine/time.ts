/** Local-time helpers. Everything in the engine reasons in the household's own day. */

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

/** Minutes after local midnight. */
export function minuteOfDay(ts: number): number {
  const d = new Date(ts)
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function weekday(ts: number): number {
  return new Date(ts).getDay()
}

export function atMinute(dayStart: number, minute: number): number {
  return dayStart + Math.round(minute * MIN)
}

export function clockLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export function minuteLabel(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  const suffix = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`
}

export function dayLabel(ts: number, now: number): string {
  const a = startOfLocalDay(ts)
  const b = startOfLocalDay(now)
  const diff = Math.round((b - a) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return new Date(ts).toLocaleDateString([], { weekday: 'long' })
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function relativeLabel(ts: number, now: number): string {
  const delta = now - ts
  const abs = Math.abs(delta)
  const unit =
    abs < HOUR
      ? `${Math.max(1, Math.round(abs / MIN))} min`
      : abs < DAY
        ? `${Math.round(abs / HOUR)} hr`
        : `${Math.round(abs / DAY)} day${Math.round(abs / DAY) === 1 ? '' : 's'}`
  return delta >= 0 ? `${unit} ago` : `in ${unit}`
}

/** Deterministic PRNG so every demo run produces the identical scenario. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
