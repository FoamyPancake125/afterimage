#!/usr/bin/env node
/*
 * demo/film.mjs — records the submission video.
 *
 * The footage is the real product. This script drives a real Chrome against
 * the dev server, clicks the real controls, and records what happens, so
 * nothing in the video is a mock-up or a slide of a screenshot. Titles and
 * captions are drawn as an overlay inside the page, which means the whole
 * film comes out of one pass with no editing step and no imported media:
 * no third-party footage, no music, nothing the hackathon rules would
 * disallow and nothing anybody else owns.
 *
 * A synthetic pointer is drawn over the page before every click. Headless
 * Chrome does not render a cursor, and an interface that changes with no
 * visible cause reads as a video edit rather than as a product working.
 *
 *   npm run dev                       # in another shell, on :5173
 *   npm i -D playwright-core          # or set PW_DIR to a checkout of it
 *   node demo/film.mjs
 *
 * Output: demo/out/afterimage-demo.webm, plus one still per scene in
 * demo/out/stills for checking legibility frame by frame.
 *
 * PACE=0.9 node demo/film.mjs   tightens every hold by 10% if the cut runs
 *                               long. The script prints its own running time
 *                               per scene and refuses to pretend a 3:05 take
 *                               came in under three minutes.
 */

import { mkdir, rename, rm, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const STILLS = path.join(OUT, 'stills')

const URL_BASE = process.env.APP_URL ?? 'http://localhost:5173'
const PACE = Number(process.env.PACE ?? 1)
const W = 1600
const H = 900

/* playwright-core is not a dependency of the product. The film is tooling. */
const pwSpec = process.env.PW_DIR
  ? path.join(process.env.PW_DIR, 'playwright-core', 'index.js')
  : 'playwright-core'
const pwMod = await import(pwSpec)
const chromium = pwMod.chromium ?? pwMod.default?.chromium
if (!chromium) {
  console.error('Could not load playwright-core. npm i -D playwright-core, or set PW_DIR.')
  process.exit(1)
}

/* ------------------------------------------------------------------ overlay */

/*
 * The overlay borrows the product's own tokens, so a title card is set in the
 * same Franklin and the same warm near-black as the dark theme. A film that
 * looks like it came from a different design than the thing it is about
 * undersells the thing it is about.
 */
const FILM_CSS = `
#film { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
  font-family: 'Libre Franklin', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

#film-card { position: absolute; inset: 0; display: grid; align-content: center;
  justify-items: start; gap: 18px; padding: 0 150px;
  background: #121112; color: #ece8e1;
  opacity: 0; transition: opacity 620ms cubic-bezier(.4,0,.2,1); }
#film-card.on { opacity: 1; }
#film-card.wipe { transition: opacity 760ms cubic-bezier(.4,0,.2,1); }

.fc-line { font-family: 'Newsreader', Georgia, serif; font-weight: 400;
  font-size: 44px; line-height: 1.18; letter-spacing: -0.014em; margin: 0;
  max-width: 19em; opacity: 0; transform: translateY(14px);
  animation: fcUp 820ms cubic-bezier(.22,1,.36,1) forwards; }
.fc-line.sm { font-size: 30px; color: #a39e95; }
.fc-line.alt { font-family: 'Libre Franklin', sans-serif; font-size: 19px;
  letter-spacing: 0.1em; text-transform: uppercase; color: #807b73; }
.fc-line.strike { color: #807b73; }
.fc-line em { font-style: normal; color: #d79a3c; }
@keyframes fcUp { to { opacity: 1; transform: none; } }

/* The mark is the argument in miniature: one thing seen, one thing inferred. */
.fc-mark { width: 132px; height: 72px; overflow: visible; }
.fc-mark .solid { animation: fcPop 700ms cubic-bezier(.22,1,.36,1) forwards; transform-origin: 24px 36px; transform: scale(.2); opacity: 0; }
.fc-mark .ghost { stroke-dasharray: 5 5; stroke-dashoffset: 120;
  animation: fcDraw 1500ms 420ms cubic-bezier(.4,0,.2,1) forwards; }
@keyframes fcPop { to { transform: none; opacity: 1; } }
@keyframes fcDraw { to { stroke-dashoffset: 0; } }

.fc-wordmark { font-size: 54px; letter-spacing: 0.26em; font-weight: 500;
  font-family: 'Libre Franklin', sans-serif; opacity: 0;
  animation: fcUp 900ms 300ms cubic-bezier(.22,1,.36,1) forwards; }
.fc-rule { width: 0; height: 1px; background: #302e2d; margin: 4px 0 0;
  animation: fcRule 900ms 200ms cubic-bezier(.4,0,.2,1) forwards; }
@keyframes fcRule { to { width: 560px; } }

.fc-end { display: grid; gap: 7px; }
.fc-end b { font-weight: 500; font-size: 17px; letter-spacing: 0.02em; }
.fc-end span { font-size: 16px; color: #a39e95; }
.fc-end code { font-family: 'DM Mono', ui-monospace, Menlo, monospace; font-size: 15px; color: #79b2c7; }

/* Lower third. Two lines at most, because a third is a line nobody reads. */
#film-cap { position: absolute; right: 44px; width: 820px; bottom: 34px;
  display: grid; gap: 7px; padding: 15px 22px 17px; border-radius: 3px;
  background: rgba(18,17,18,0.93); color: #ece8e1;
  box-shadow: 0 1px 0 rgba(255,255,255,0.07) inset, 0 10px 34px rgba(0,0,0,0.28);
  opacity: 0; transform: translateY(10px);
  transition: opacity 360ms ease, transform 360ms cubic-bezier(.22,1,.36,1); }
#film-cap.on { opacity: 1; transform: none; }
#film-cap .kick { font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: #d79a3c; }
#film-cap .txt { font-size: 20px; line-height: 1.34; letter-spacing: -0.004em; }
#film-cap .txt em { font-style: normal; color: #d79a3c; }

/* Which track the thing on screen is answering to. */
#film-badge { position: absolute; right: 44px; bottom: 140px;
  font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase;
  padding: 7px 12px; border-radius: 2px; background: rgba(18,17,18,0.92);
  color: #ece8e1; opacity: 0; transition: opacity 320ms ease; }
#film-badge.on { opacity: 1; }

/* Keypresses, shown, because a demo driven by invisible input looks faked. */
#film-key { position: absolute; left: 50%; top: 104px; transform: translateX(-50%) scale(.94);
  font-size: 15px; letter-spacing: 0.06em; padding: 9px 15px; border-radius: 3px;
  background: rgba(18,17,18,0.92); color: #ece8e1; opacity: 0;
  transition: opacity 200ms ease, transform 200ms ease; }
#film-key.on { opacity: 1; transform: translateX(-50%) scale(1); }
#film-key b { color: #d79a3c; font-weight: 500; }

/* The product puts its live feed bottom-right, so the lower third moves out
   of its way rather than sitting on top of the thing it is pointing at. */
#film.left #film-cap, #film.left #film-badge { left: 44px; right: auto; }
#film:not(.left) #film-cap, #film:not(.left) #film-badge { right: 44px; left: auto; }

#film-ptr { position: absolute; left: 0; top: 0; width: 13px; height: 13px;
  margin: -6px 0 0 -6px; border-radius: 50%; background: #1a1917;
  box-shadow: 0 0 0 2px rgba(246,244,239,0.9), 0 2px 7px rgba(0,0,0,0.3);
  opacity: 0; transition: opacity 240ms ease,
    transform 440ms cubic-bezier(.33,1,.42,1); }
#film-ptr.on { opacity: 1; }
#film-ring { position: absolute; left: 0; top: 0; width: 13px; height: 13px;
  margin: -6px 0 0 -6px; border-radius: 50%; border: 2px solid #a8352c; opacity: 0; }
#film-ring.go { animation: fcTap 520ms cubic-bezier(.2,.8,.3,1); }
@keyframes fcTap { 0% { opacity: .9; transform: scale(1); }
  100% { opacity: 0; transform: scale(3.4); } }
`

/* Installed fresh after any full page load; the SPA never reloads mid-film. */
function installFilm() {
  if (document.getElementById('film')) return
  const root = document.createElement('div')
  root.id = 'film'
  root.innerHTML = `
    <div id="film-card"></div>
    <div id="film-badge"></div>
    <div id="film-cap"><span class="kick"></span><span class="txt"></span></div>
    <div id="film-key"></div>
    <div id="film-ring"></div>
    <div id="film-ptr"></div>`
  document.body.appendChild(root)

  const card = root.querySelector('#film-card')
  const cap = root.querySelector('#film-cap')
  const badge = root.querySelector('#film-badge')
  const key = root.querySelector('#film-key')
  const ptr = root.querySelector('#film-ptr')
  const ring = root.querySelector('#film-ring')

  window.__film = {
    card(html, wipe) {
      card.innerHTML = html
      card.classList.toggle('wipe', !!wipe)
      card.classList.add('on')
    },
    uncard() {
      card.classList.remove('on')
    },
    cap(kick, txt, side) {
      cap.querySelector('.kick').textContent = kick
      cap.querySelector('.txt').innerHTML = txt
      if (side) root.classList.toggle('left', side === 'left')
      cap.classList.add('on')
    },
    uncap() {
      cap.classList.remove('on')
    },
    badge(t) {
      badge.textContent = t
      badge.classList.toggle('on', !!t)
    },
    key(t) {
      key.innerHTML = t
      key.classList.add('on')
      clearTimeout(window.__keyT)
      window.__keyT = setTimeout(() => key.classList.remove('on'), 1150)
    },
    ptr(x, y) {
      ptr.style.transform = `translate(${x}px, ${y}px)`
      ptr.classList.add('on')
    },
    tap(x, y) {
      ring.style.transform = `translate(${x}px, ${y}px)`
      ring.classList.remove('go')
      void ring.offsetWidth
      ring.classList.add('go')
    },
    hidePtr() {
      ptr.classList.remove('on')
    },
  }
}

/* -------------------------------------------------------------------- driver */

const t0 = Date.now()
const marks = []
const el = () => (Date.now() - t0) / 1000
const stamp = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`

await rm(OUT, { recursive: true, force: true })
await mkdir(STILLS, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--hide-scrollbars', '--force-color-profile=srgb', '--font-render-hinting=none'],
})
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  colorScheme: 'light',
  reducedMotion: 'no-preference',
})
/* The recording starts with the context, so timecodes are measured from here
   and land on the same second in the finished file. */
const vt0 = (Date.now() - t0) / 1000
const page = await ctx.newPage()

const wait = (ms) => page.waitForTimeout(Math.round(ms * PACE))

async function scene(name, fn) {
  const at = el()
  await fn()
  marks.push({ name, at: at - vt0, dur: el() - at })
  await page
    .screenshot({ path: path.join(STILLS, `${String(marks.length).padStart(2, '0')}-${name}.png`) })
    .catch(() => {})
  console.log(`  ${stamp(at - vt0)}  ${name.padEnd(22)} ${(el() - at).toFixed(1)}s`)
}

const film = (fn, ...args) => page.evaluate(fn, ...args)
let shots = 0
const shot = (name) =>
  page
    .screenshot({ path: path.join(STILLS, `x${String(++shots).padStart(2, '0')}-${name}.png`) })
    .catch(() => {})
let side = 'left'
const cap = (kick, txt, s = side) => {
  side = s
  return film(([k, t, sd]) => window.__film.cap(k, t, sd), [kick, txt, s])
}
const uncap = () => film(() => window.__film.uncap())
const badge = (t) => film((t) => window.__film.badge(t), t)
const keycue = (t) => film((t) => window.__film.key(t), t)
const card = (html, wipe = false) => film(([h, w]) => window.__film.card(h, w), [html, wipe])
const uncard = () => film(() => window.__film.uncard())

/* A click the viewer can see coming, and see land. */
async function click(target, hold = 520) {
  const loc = typeof target === 'string' ? page.locator(target).first() : target
  await loc.scrollIntoViewIfNeeded().catch(() => {})
  const box = await loc.boundingBox()
  if (!box) throw new Error(`no box for ${target}`)
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 2)
  await film(([x, y]) => window.__film.ptr(x, y), [x, y])
  await wait(430)
  await film(([x, y]) => window.__film.tap(x, y), [x, y])
  await loc.click({ force: true })
  await wait(hold)
}

async function press(label, key, hold = 700) {
  await keycue(label)
  await wait(260)
  await page.keyboard.press(key)
  await wait(hold)
}

/*
 * The console scrolls. The dial and the floor plan are each taller than a
 * 900px frame once the page intro is above them, so the shot is framed on the
 * visual rather than on the top of the document.
 */
async function frame(top) {
  await page.evaluate((t) => {
    document.querySelector('.page-body')?.scrollTo({ top: t, behavior: 'smooth' })
  }, top)
  await wait(620)
}

const MARK_SVG = `
<svg class="fc-mark" viewBox="0 0 132 72" aria-hidden>
  <circle class="solid" cx="24" cy="36" r="14" fill="#ece8e1" />
  <circle class="ghost" cx="62" cy="36" r="19" fill="none" stroke="#d79a3c" stroke-width="2.2" />
</svg>`

const lines = (...ls) => ls.join('')
const L = (t, cls = '') => `<p class="fc-line ${cls}">${t}</p>`

console.log(`\nAFTERIMAGE — recording at ${W}x${H}, pace ${PACE}\n`)

await page.goto(`${URL_BASE}/#/console`, { waitUntil: 'networkidle' })
await page.addStyleTag({ content: FILM_CSS })
await page.evaluate(installFilm)
await page.evaluate(() => document.fonts.ready)
await card(`${MARK_SVG}<div class="fc-wordmark">AFTERIMAGE</div><div class="fc-rule"></div>`)
await wait(400)

/* ------------------------------------------------------------- 1. cold open */

await scene('cold-open', async () => {
  await wait(2600)
  await card(
    lines(
      L('Eleanor is 78.'),
      L('She lives alone. Her daughter Dana is forty minutes away.', 'sm'),
    ),
  )
  await wait(2790)
  await card(
    lines(L('Marcus comes every weekday at 8:44.'), L('On Tuesday, Marcus did not come.', 'sm')),
  )
  await wait(2880)
  await card(
    lines(
      L('No camera saw that.'),
      L('No sensor fired. No alert was sent. There was nothing to see.', 'sm'),
    ),
  )
  await wait(3060)
  await card(
    lines(
      L('Every monitoring product ever built detects what <em>happened</em>.', 'strike'),
      L('What goes wrong in a cared-for home is what <em>didn’t</em>.'),
    ),
  )
  await wait(3420)
  await card(
    lines(
      L('Absence intelligence', 'alt'),
      L('AFTERIMAGE learns what a household does, then reports the silences that matter.'),
    ),
  )
  await wait(2700)
})

/* ------------------------------------------------------- 2. what it learned */

await scene('patterns', async () => {
  await click('.subnav-item:has-text("Patterns")', 300)
  await card('', true)
  await uncard()
  await badge('Ring · 21 days of history')
  await cap(
    'Learned, not configured',
    'Twenty-one days of Ring events in. <em>Eleven routines</em> out, with their own spread in minutes. Nobody ever enters a schedule.',
  )
  await wait(3780)
  await cap(
    'It refuses weak patterns',
    'A pattern it can only place inside a two-hour window is not something a household can act on, so the learner throws it away.',
  )
  await wait(3600)
})

/* ------------------------------------------------- 3. the day, re-inferred */

await scene('today-play', async () => {
  await click('.subnav-item:has-text("Today")', 300)
  await badge('')
  await frame(115)
  await cap(
    'Tuesday',
    'The day as a dial. Solid is observed, dashed is expected, hatched is <em>nothing could see it</em>.',
    'left',
  )
  await wait(3240)
  await cap(
    'Replay the day from midnight',
    'The inference re-runs at every minute. Expectations sit open all morning, harmlessly.',
  )
  await click('button[aria-label="Replay from midnight"]', 300)
  await frame(115)
  await wait(5400)
  await cap(
    'Windows closing',
    'An expectation turns into an absence the moment its window closes, and every verdict change is announced as it happens.',
  )
  await wait(8100)
  await press('<b>Space</b> — pause', ' ', 500)
  await cap(
    '9:08 AM, no dose',
    'The medicine cabinet has opened on <em>21 of 21 days</em>. Today it did not. That is a finding no camera could have produced.',
  )
  await wait(3780)
})

/* ------------------------------------------------------ 4. the evidence pane */

await scene('findings', async () => {
  await click('.subnav-item:has-text("Findings")', 400)
  await frame(0)
  await cap(
    'Ranked by consequence',
    'Six facts per row, so the question “which of these matters” is a comparison and not a reading exercise. Weights come from the care plan, not from the model.',
  )
  await wait(4140)
  await click('tr.dt-row:has-text("Medicine")', 700)
  await cap(
    'Twenty-one days, twenty-one marks',
    '“It has happened on 21 of 21 days” is a sentence you have to trust. A row of marks ending in one hollow one is the same claim, checkable at a glance.',
  )
  await wait(4680)
  await page.evaluate(() =>
    document.querySelector('.drawer-body')?.scrollTo({ top: 520, behavior: 'smooth' }),
  )
  await cap(
    'A cause, only where the statistics allow one',
    'The dose follows the caregiver within <em>±4.1 min</em> — far tighter than its ±13 min spread against the clock. The garden door, equally daily, produces no link.',
  )
  await wait(4860)
  await shot('evidence-drawer')
  await page.evaluate(() =>
    document.querySelector('.drawer-body')?.scrollTo({ top: 1500, behavior: 'smooth' }),
  )
  await cap(
    'And it can be told it is wrong',
    'The most common cause of an absence is a perfectly good reason the house could not see.',
  )
  await wait(1400)
  await click('button:has-text("I know why this happened")', 450)
  await click('button:has-text("I was with her, it is fine")', 800)
  await shot('acknowledged')
  await cap(
    'Explained',
    'The finding greys out, stops escalating, and nobody else is told about it. The system can be corrected by the people it is for.',
  )
  await wait(3780)
  await press('<b>Esc</b> — close evidence', 'Escape', 500)
})

/* ------------------------------------------------------- 5. where, and ghosts */

await scene('where-and-ghosts', async () => {
  await click('.subnav-item:has-text("Today")', 300)
  await frame(115)
  await cap('The whole thesis, in one keypress', 'G hides the afterimages.')
  await press('<b>G</b> — hide the afterimages', 'g', 900)
  await cap(
    'This is every other system in the category',
    'What is left is exactly what Ring recorded. Everything that just vanished from the dial is what <em>didn’t</em> happen. That gap is the product.',
  )
  await wait(3960)
  await shot('ghosts-off')
  await press('<b>G</b> — bring them back', 'g', 700)
  await click('button:has-text("Where")', 400)
  await frame(270)
  await cap(
    'The other question',
    'The dial answers <em>when</em>. The plan answers <em>where</em>, which is what a family member asks first. Dashed walls are a room with an expectation nothing met; hatching is a room nothing could see.',
  )
  await wait(3780)
})

/* --------------------------------------------------------------- 6. the Ring */

await scene('ring', async () => {
  await click('.surface-tab:has-text("Ring")', 500)
  await badge('Ring track')
  await cap(
    'Eight devices, six zones',
    'Doorbell, cams, contact sensors, motion, lock. The engine is a pure function of the observation set, so nothing here is pre-baked.',
  )
  await wait(3420)
  await click('button:has-text("Medicine cabinet opened")', 900)
  await cap(
    'Push an event, every surface re-decides',
    'The strip reports exactly what changed, and it changed on all four surfaces at once.',
  )
  await wait(3600)
  await cap(
    'Now blind a camera',
    'The doorbell was on its charger from 3:12. With no coverage, the afternoon walk is reported <em>unknown</em> — not missed.',
  )
  await wait(3240)
  await click('button:has-text("Remove the 3:12 PM charging window")', 900)
  await cap(
    'Silence, or blindness',
    'Give the doorbell its sight back and the same silence becomes a genuine absence. The difference between those two outputs is the entire trust argument.',
  )
  await wait(4140)
  await shot('ring-recomputed')
  await click('button:has-text("Restore the 3:12 PM charging window")', 700)
})

/* --------------------------------------------------------------- 7. Alexa+ */

await scene('alexa', async () => {
  await click('.surface-tab:has-text("Alexa+")', 700)
  await badge('Alexa+ track')
  await cap(
    'Asked on the way home',
    'One engine behind all three surfaces, so the spoken sentence and the evidence under it cannot disagree.',
  )
  await wait(4500)
  const ask = page.locator('input[aria-label="Ask Alexa+"]')
  await uncap()
  await ask.click()
  await ask.type('Why was there no morning dose?', { delay: 34 })
  await page.keyboard.press('Enter')
  await cap(
    'Each utterance is one tool call',
    'afterimage.explain_finding — the call and its structured result are shown in the rail as the answer is spoken.',
  )
  await wait(5040)
  await uncap()
  await ask.click()
  await ask.type('What can you not tell me?', { delay: 34 })
  await page.keyboard.press('Enter')
  await cap(
    'The question that earns the rest',
    'Most assistants cannot answer this one. <em>Unknown</em> is a first-class verdict here, and it propagates all the way to the voice.',
  )
  await wait(5400)
  await shot('alexa-blindspots')
})

/* -------------------------------------------------------------- 8. Fire TV */

await scene('firetv', async () => {
  await click('.surface-tab:has-text("Fire TV")', 600)
  await badge('Fire TV track')
  await cap(
    'Ten-foot, D-pad only',
    'A web app on Fire OS or Vega. Up and Down move focus, Select opens the evidence, Back closes it. Type is sized in container units, so it holds from 1080p to 4K.',
  )
  await wait(3960)
  await press('<b>▼</b>', 'ArrowDown', 520)
  await press('<b>▼</b>', 'ArrowDown', 520)
  await press('<b>Select</b>', 'Enter', 900)
  await cap(
    'The same evidence, at four metres',
    'No hover, no pointer, nothing below roughly 20px of apparent text. The dial is the signature visual on the biggest screen in the house.',
  )
  await wait(3600)
  await press('<b>Back</b>', 'Escape', 500)
})

/* ---------------------------------------------------------- 9. closing loop */

await scene('escalation', async () => {
  await click('.surface-tab:has-text("Console")', 400)
  await click('.subnav-item:has-text("Who gets told")', 400)
  await frame(0)
  await badge('')
  await cap(
    'Detecting an absence is half a product',
    'Eleanor is asked on her own Echo at 55. Dana at 70. The agency at 80. <em>Ruth, the neighbour, at 92</em> — which today does not reach, so she is not called.',
  )
  await wait(4680)
  await cap(
    'Escalation, not broadcast',
    'Each contact waits out the previous one’s window, so the household is escalated through rather than all woken at once — and every message shows the exact words that would be said.',
  )
  await wait(4140)
  await uncap()
})

await scene('end-card', async () => {
  await film(() => window.__film.hidePtr())
  await card(
    lines(
      `${MARK_SVG}<div class="fc-wordmark" style="font-size:40px">AFTERIMAGE</div>`,
      L('An AI that understands both what happened and what never did.', 'sm'),
      `<div class="fc-end">
         <b>Ring · Alexa+ · Fire TV</b>
         <span>Ring observes · Fire TV reconstructs · Alexa+ reasons · one engine, no second description of the world</span>
         <code>github.com/FoamyPancake125/afterimage</code>
         <code>npm install &amp;&amp; npm run dev · npm run engine:test → 47 assertions</code>
         <span>MIT licensed. No third-party footage, music or imagery in this film.</span>
       </div>`,
    ),
    true,
  )
  await wait(5760)
})

/* ------------------------------------------------------------------ wrap up */

const total = el()
await page.waitForTimeout(250)
const video = page.video()
await ctx.close()
await browser.close()

if (video) {
  const raw = await video.path()
  await rename(raw, path.join(OUT, 'afterimage-demo.webm'))
}
for (const f of await readdir(OUT)) {
  if (f.endsWith('.webm') && f !== 'afterimage-demo.webm') await rm(path.join(OUT, f))
}

/*
 * YouTube takes the webm, but H.264 with a silent audio track is what every
 * uploader, player and phone handles without thinking about it, so the mp4 is
 * the one to hand in. Playwright keeps an ffmpeg of its own; FFMPEG overrides.
 */
const FFMPEG =
  process.env.FFMPEG ??
  path.join(
    process.env.HOME ?? '',
    'Library/Caches/ms-playwright/ffmpeg-1010/ffmpeg-mac',
  )
const webm = path.join(OUT, 'afterimage-demo.webm')
const mp4 = path.join(OUT, 'afterimage-demo.mp4')
const { execFile } = await import('node:child_process')
const { promisify } = await import('node:util')
const run = promisify(execFile)

/* ffmpeg -i prints what it knows to stderr and then exits non-zero. */
async function duration(file) {
  try {
    await run(FFMPEG, ['-i', file])
  } catch (err) {
    const m = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(err.stderr ?? '')
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  return null
}

/*
 * Chrome's screencast hands over fewer frames than the 25 it is nominally
 * writing, so the recording comes out several percent longer than the take
 * actually was: everything plays slightly slowed down, and the cut eats into
 * the three-minute cap for no reason. The mp4 is retimed back to the wall
 * clock that the scene log measured.
 */
let raw = await duration(webm)
const stretch = raw && total ? raw / (total - vt0) : 1
const retime = stretch > 1.02 ? ['-filter:v', `setpts=PTS/${stretch.toFixed(4)}`] : []

try {
  await run(FFMPEG, [
    '-y',
    '-i', webm,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    ...retime,
    '-shortest',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-r', '25',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    mp4,
  ])
} catch (err) {
  console.log(`  (no mp4: ${String(err.message).split('\n')[0]}. Set FFMPEG to a binary and re-run.)`)
}

console.log('\n  ——')
for (const m of marks) console.log(`  ${stamp(m.at)}  ${m.name.padEnd(22)} ${m.dur.toFixed(1)}s`)
const shipped = (await duration(mp4)) ?? total
console.log(`\n  take  ${stamp(total - vt0)}`)
console.log(`  cut   ${stamp(shipped)}  →  demo/out/afterimage-demo.mp4 (and .webm)`)
if (shipped > 175) {
  console.log(`  OVER BUDGET by ${(shipped - 175).toFixed(1)}s. Re-run with PACE=${(175 / shipped).toFixed(2)}.`)
} else {
  console.log(`  Inside the three-minute cap with ${(180 - shipped).toFixed(0)}s of headroom.`)
}
