import type { Zone } from '../engine/index.ts'
import type { ConsolePage, ConsoleView, Surface, Theme } from './store.tsx'

/**
 * View state in the address bar.
 *
 * A product people use has URLs. Being able to send somebody a link to the
 * medicine cabinet at 9:08 on the morning it was missed is the difference
 * between a demo and a tool, and it costs a serialiser and a listener.
 *
 * Only view state goes here. Preferences that belong to a person rather than a
 * link, which is to say the theme and the care weightings, are kept in local
 * storage so that a shared link does not quietly restyle somebody's screen or
 * overwrite their judgement about what matters.
 */
export interface UrlState {
  surface: Surface
  /** Sub-page within the console, which is where most of the depth lives. */
  page: ConsolePage
  view: ConsoleView
  zone: Zone | null
  /** Minute of day, when the clock has been moved off its default. */
  minute: number | null
  ghost: boolean
  inspect: string | null
}

const SURFACES: Surface[] = ['console', 'firetv', 'alexa', 'ring']
const PAGES: ConsolePage[] = ['today', 'findings', 'escalation', 'patterns', 'unexplained']

export function readUrl(): Partial<UrlState> {
  if (typeof window === 'undefined') return {}
  const hash = window.location.hash.replace(/^#\/?/, '')
  const [path, q] = hash.split('?')
  const params = new URLSearchParams(q ?? '')
  const out: Partial<UrlState> = {}

  const [seg, sub] = path.split('/')
  if (SURFACES.includes(seg as Surface)) out.surface = seg as Surface
  if (PAGES.includes(sub as ConsolePage)) out.page = sub as ConsolePage
  const view = params.get('view')
  if (view === 'dial' || view === 'plan') out.view = view
  const zone = params.get('zone')
  if (zone) out.zone = zone as Zone
  const t = params.get('t')
  if (t !== null && /^\d+$/.test(t)) out.minute = Math.min(1439, Math.max(0, Number(t)))
  if (params.get('ghost') === '0') out.ghost = false
  const inspect = params.get('finding')
  if (inspect) out.inspect = inspect
  return out
}

export function writeUrl(s: UrlState, defaultMinute: number) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  if (s.surface === 'console' && s.view !== 'dial') params.set('view', s.view)
  if (s.zone) params.set('zone', s.zone)
  if (s.minute !== null && s.minute !== defaultMinute) params.set('t', String(Math.round(s.minute)))
  if (!s.ghost) params.set('ghost', '0')
  if (s.inspect) params.set('finding', s.inspect)
  const q = params.toString()
  const path = s.surface === 'console' && s.page !== 'today' ? `${s.surface}/${s.page}` : s.surface
  const next = `#/${path}${q ? `?${q}` : ''}`
  if (next !== window.location.hash) {
    window.history.replaceState(null, '', next)
  }
}

const PREFS_KEY = 'afterimage.prefs.v1'

export interface Prefs {
  theme: Theme
  weights: Record<string, number>
  /** Findings somebody has explained. Kept so an answer survives a reload. */
  acks: { expectationId: string; reason: string; at: number }[]
}

export function readPrefs(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return {
      theme: parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : undefined,
      weights: typeof parsed.weights === 'object' && parsed.weights ? parsed.weights : undefined,
      acks: Array.isArray(parsed.acks) ? parsed.acks : undefined,
    }
  } catch {
    // A corrupt or unavailable store is not a reason to fail to start.
    return {}
  }
}

export function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // Private browsing, quota, disabled storage. None of it matters here.
  }
}
