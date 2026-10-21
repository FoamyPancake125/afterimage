# The submission video

`demo/out/afterimage-demo.mp4` — 2:36, 1600×900, H.264, silent.
Rebuild it any time with `npm run dev` in one shell and `node demo/film.mjs` in another.

Nothing in it is a slide or a mock-up. A real Chrome drives the real app against the
dev server and records what happens; the titles and the lower third are drawn into the
page, which is why the whole thing comes out of a single pass with no edit and no
imported media. There is no third-party footage, no music and no imagery anybody else
owns, which is both a rules requirement and the reason it can be re-cut in three
minutes when something in the product changes.

The captions carry the argument on their own, so the film works silently. If you record
a voice-over, the script below is timed to the finished file.

---

## Voice-over, timed to the cut

**0:00 — cold open** *(title cards; no product on screen yet)*

> Eleanor is seventy-eight, and lives alone. Her daughter Dana is forty minutes away.
> On Tuesday her carer didn't arrive, and her morning pills stayed in the cupboard.
> No camera saw either of those things. Every monitoring product ever built detects
> what happened. What goes wrong in a house like this is what didn't.

**0:19 — what it learned** *(Patterns)*

> AFTERIMAGE takes twenty-one days of Ring history and learns eleven routines on its
> own, with their own spread in minutes. Nobody ever enters a schedule.

**0:27 — the day, re-inferred** *(Today; replay from midnight)*

> Then it replays the day a minute at a time. Expectations sit open all morning,
> harmlessly, and turn into absences the moment their windows close. At nine-oh-eight
> the medicine cabinet doesn't open — it has opened on twenty-one days out of
> twenty-one. There is no footage behind that finding, which is exactly why no camera
> could have produced it.

**0:51 — the evidence, and being told you're wrong** *(Findings, evidence drawer)*

> Findings are ranked by what the care plan says they cost, not by how confident the
> model is. Open one and you get the whole argument: twenty-one days drawn as
> twenty-one marks, and a cause only where the statistics allow one — the dose follows
> the carer to within four minutes, far tighter than it follows the clock. And if you
> already know why, you say so, and it stops.

**1:17 — the gap** *(G, then Where)*

> Press G and the afterimages go. What's left is exactly what Ring recorded, which is
> everything any other system in this category can show you. That gap is the product.
> The same day, answered spatially.

**1:30 — Ring** *(simulator)*

> Eight Ring devices across six zones drive all of it. Push an event and every verdict
> on every surface is recomputed. And when the doorbell was on its charger, the
> afternoon walk is reported as "cannot tell" — not "did not happen". Give the doorbell
> its sight back and the same silence becomes a real absence.

**1:49 — Alexa+**

> On Alexa+, each question is one MCP tool call against that same engine, and the call
> and its structured result are shown as the answer is spoken. Including the question
> most assistants can't answer at all: what can you not tell me?

**2:07 — Fire TV**

> On the television it's the same day at four metres. D-pad only, select for the
> evidence, nothing that needs a pointer.

**2:20 — who gets told**

> And it closes the loop. Eleanor at fifty-five, Dana at seventy, the agency at eighty,
> Ruth the neighbour at ninety-two — which today does not reach, so Ruth is not called.

**2:31 — end card**

> AFTERIMAGE. An AI that understands both what happened, and what never did.

---

## What the cut shows, against the submission requirements

| Requirement | Where it is |
|---|---|
| Under three minutes | 2:36, with 23 seconds spare |
| Project shown functioning | Every frame after 0:19 is the running app, driven live |
| Ring track: working through a simulator or device | 1:30–1:49 — devices, event injection, the recompute strip, the coverage toggle |
| Alexa+ track: the simulated-experience path | 1:49–2:07 — two questions, with the MCP call and its structured response in the rail |
| Fire TV track: running on Fire OS / Vega or the simulator | **Not yet — see below** |
| English | Throughout |
| No third-party trademarks, music or copyrighted material | Nothing imported; every pixel is the product or type set in its own fonts |
| Repo, licence and run instructions | End card, and `README.md` |

### The one gap: Fire TV

The rules are specific — the demo video must show the project running on an actual Fire
TV device or the Fire TV / Vega simulator. What is at 2:07 is the Fire TV surface in a
desktop browser at TV dimensions, which is what the README already admits to. To close
it:

```bash
npm run build          # static bundle in dist/, loads directly on Fire OS or Vega
```

Record 12–20 seconds of `dist/` running in the Fire TV / Vega simulator or on a device
in Silk — the dial, two D-pad moves, Select for the evidence — and drop that clip in
place of the browser-shot Fire TV section:

```bash
ffmpeg -i demo/out/afterimage-demo.mp4 -t 127 -c copy /tmp/a.mp4 && \
ffmpeg -i demo/out/afterimage-demo.mp4 -ss 139.6 -c copy /tmp/c.mp4 && \
printf "file '/tmp/a.mp4'\nfile '/path/to/firetv-clip.mp4'\nfile '/tmp/c.mp4'\n" > /tmp/l.txt && \
ffmpeg -f concat -safe 0 -i /tmp/l.txt -c copy demo/out/afterimage-demo-firetv.mp4
```

(The clip has to be 1600×900 H.264 25 fps for a stream copy; otherwise re-encode the
concat instead of `-c copy`.)

---

## Re-cutting it

```bash
npm run dev                       # :5173
npm i -D playwright-core          # or PW_DIR=/path/to/a/checkout
node demo/film.mjs
```

`PACE=0.9 node demo/film.mjs` tightens every hold by a tenth. The script prints each
scene's timecode in the finished file and refuses to claim a cut is under three minutes
when it isn't. Stills land in `demo/out/stills`, one per scene plus the four moments
that carry the argument, which is the fastest way to check legibility without scrubbing
the video.
