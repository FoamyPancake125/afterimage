# AFTERIMAGE

**An AI that understands both what happened and what never did.**

Every monitoring product ever built detects things that happen. A camera sees motion, a
sensor closes a circuit, an alert fires. The entire category is organised around presence.

But the thing that actually goes wrong in a home where someone is being cared for is almost
never an event. It is a *non-event*. The caregiver who didn't arrive. The pills that weren't
taken. The walk that wasn't walked. These produce no footage, trigger no sensor, and generate
no alert, which is precisely why they are the failures that get missed.

AFTERIMAGE is built the other way round. It learns what a household normally does, then checks
every day against that, and reports the silences that matter.

---

## The hard part isn't detection. It's earning the right to make a claim.

A system that reports absences is a system that wakes people up at night. If it is wrong often,
it gets switched off within a week, and then it protects nobody. So nearly all of the
engineering here is spent on *not* making claims:

**1. It refuses to learn weak patterns.** The neighbour's cat crosses the patio most evenings.
A naive learner turns that into an expectation and starts asking a family about a cat. The
learner rejects any pattern whose timing spread exceeds 30 minutes, on the grounds that an
event you can only place inside a two-hour window is not something a household can act on.
*(`routines.ts`, and a negative-control assertion in `selftest.ts`.)*

**2. It distinguishes silence from blindness.** If the doorbell was on its charger during the
window, AFTERIMAGE reports **"cannot tell"**, not "did not happen". Coverage is computed per
device per window, and `unknown` is a first-class verdict that propagates all the way through
to the voice answer. In the demo, the afternoon walk is genuinely unknowable, and the system
says so. You can toggle the outage off in the Ring simulator and watch the same silence
legitimately become an absence.

**3. It only claims causality when the data supports causality.** It would be easy, and
wrong, to say the missed dose was caused by the missed care visit just because both happen
daily and one follows the other. Any two daily routines look causal under that test. So the
engine measures *coupling*: the standard deviation of the gap between the two events across
history. The dose follows the caregiver within ±4 minutes, far tighter than its ±13-minute
spread against the clock. That is evidence of dependence. The garden door, which also happens
every morning, fails the same test and produces no link. *(`correlate.ts`.)*

**4. It separates what it learns from what it is told.** The engine works out *what* recurs.
It cannot know what a missed dose costs, so it does not pretend to. Consequence weights come
from the household's care plan, and findings are ranked by consequence rather than confidence.
A near-certain missed delivery sits below a less certain missed dose. Drag the "matters"
slider on any learned routine in the Console and the whole list re-ranks live.

**5. Every statement is tagged `observed` / `expected` / `unknown`,** visually as well as in
the data model: solid, dashed, hatched. You can see what the system knows without reading a
word.

---

## Three Amazon surfaces, one engine

The same `WorldState` drives all three. There is no second, looser description of the world
for the voice layer to drift towards, which is why the spoken sentence and the evidence card
underneath it can never disagree.

| Surface | Role | Idiom |
|---|---|---|
| **Ring** | Observation. Devices, event stream, coverage gaps. | A log, read up close |
| **Fire TV** | Reconstruction. The day as a dial, findings ranked, evidence on select. | Ten-foot, D-pad |
| **Alexa+** | Reasoning. Ask why, ask what's missing, ask what it can't tell you. | Conversation |

**Fire TV.** Launches as a web app on Fire OS or Vega OS. Entirely keyboard and D-pad driven:
Up and Down move focus, Select opens the evidence pane, Back closes it. Type is sized in container
units so it scales correctly from a 1080p set to a 4K one, and nothing sits below roughly
20 px of apparent text.

**Alexa+.** Each utterance resolves to one MCP tool call against the engine
(`afterimage.explain_finding`, `afterimage.list_coverage_gaps`, and so on). The live trace is
shown in the right-hand rail so you can see the call and its structured result as the answer
is spoken. `reason.ts` returns structure, not strings, specifically so the same function can
back both the simulated conversation and a Streamable-HTTP MCP server.

**Ring.** Eight devices across six zones (Battery Doorbell Pro, Stick Up Cam Pro, Spotlight
Cam Plus, Indoor Cam, Alarm contact sensors, Alarm motion detector, smart lock). The simulator
pushes events into the stream, moves the clock, and takes cameras offline. The engine is a
pure function of the observation set, so every verdict on every surface is genuinely
recomputed, and the strip at the top of the simulator reports exactly which verdicts flipped.

---

## The demo

Eleanor, 78, lives alone. Her daughter Dana is forty minutes away. Marcus is the weekday
caregiver. Twenty-one days of Ring history, deterministically generated, from which the
system learns eleven routines on its own. Nobody enters a schedule.

Then: Tuesday.

- **03:12** The patio door opens. In twenty-one days that has never once happened at night.
- **07:58** The garden door, 38 minutes later than it has ever been.
- **08:41 / 08:44** Marcus's car, then Marcus. Neither arrives.
- **09:08** The medicine cabinet does not open. It has opened on **21 of 21** days.
- **14:34** The mail arrives, exactly as normal. *The system says nothing, on purpose.*
- **15:12 to 16:04** The doorbell is charging.
- **15:36** The afternoon walk. **Cannot tell.** No claim is permitted.
- **16:10** A face the house has never matched. 22 seconds. No doorbell press.
- **18:55** A vehicle that has never been in this driveway, parked for 41 minutes.
- **21:39** The deadbolt is still *pending*. The window has not closed, so nothing is wrong yet.

And the link it draws: *"No care visit today. Most likely why there was no morning dose.
On 15 of 15 days where both applied, it followed within 22 min of it, varying by only ±4.1 min
, far tighter than its ±13 min spread against the clock."*

### Things worth trying

- **Press play, or hit space.** The hand sweeps the dial and the inference re-runs at every
  minute of the day. Expectations sit harmlessly open all morning and then turn into absences
  the moment their windows close, and each change is announced as it happens. This is the one
  thing a recorded demo cannot fake, and it is the clearest thing to put in a video.
- **Drag the hand around the dial.** Same mechanism, under manual control. At 9:00 AM the dose
  is an open window and nothing is wrong. At 10:30 PM the deadbolt becomes the fifth absence.
- **Switch the stage from When to Where.** The dial answers when; the floor plan answers where,
  which is the question a family member actually asks first. Rooms with an unmet expectation are
  drawn in the same dashed outline the rest of the product uses for absence, and hatching marks
  a room nothing could see. Click a room to narrow every panel on the page to it.
- **Click any finding.** The evidence drawer opens with twenty-one days of that routine drawn as
  twenty-one marks, each offset by how early or late it ran. "It has happened on 21 of 21 days"
  is a sentence you have to trust; a row of marks ending in one hollow one is the same claim,
  checkable at a glance.
- **Press `G`.** Hides the afterimages, leaving only what Ring recorded, which is everything
  any other system in this category can show you. That gap is the product.
- **On the Ring surface, press "Remove the 3:12 PM charging window."** The afternoon walk turns from
  *cannot tell* into *did not happen*. The difference between those two outputs is the entire
  trust argument.
- **Ask Alexa+ "What can you not tell me?"** Most assistants cannot answer this question.

---

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. For Fire TV, `npm run build` produces a static bundle in
`dist/` that loads directly in the Fire TV / Vega simulator or a Silk browser on-device.

Verify the engine's claims:

```bash
npm run engine:test
```

37 assertions covering the learner's negative controls, every verdict in the demo day, the
causal-coupling test, the coverage logic, off-schedule handling, and the promise printed on
every simulator button.

That off-schedule group is there because the history strip caught a real bug: the window is two
standard deviations wide, so about five percent of perfectly normal occurrences fall outside it,
and an event eleven minutes early was being reported as "did not happen". An absence detector
that cries wolf at ordinary drift is worse than no absence detector, so the case is now a test.

---

## Layout

```
src/engine/          No React, no DOM. Runs under plain Node.
  types.ts           Observed / expected / unknown as a type, not a convention
  scenario.ts        Devices, care plan, 21 days of deterministic Ring history
  routines.ts        Learns recurring expectations; rejects formless ones
  absence.ts         Verdicts: satisfied, late, pending, uncertain, missing
  novelty.ts         Events with no precedent, scored against this house only
  correlate.ts       Causal links, with the coupling statistic that justifies them
  reason.ts          Q&A over the world state; backs Alexa+ and the MCP tools
  selftest.ts        The claims above, as assertions
src/ui/surfaces/     Console · FireTV · AlexaPlus · RingSim
src/ui/components/   DayDial       the signature visual, draggable and playable
                     FloorPlan     the same day, answered spatially
                     EvidenceDrawer the full argument behind one verdict
                     HistoryStrip  21 days of a routine as 21 marks
                     Transport     play, pause, speed, jump
                     FlipFeed      verdict changes, announced as they happen
```

The engine is deliberately free of UI imports. It is the piece that would ship as an MCP
server, a Lambda behind a Ring Edge rule, or an Alexa Agent Skill.

---

## What is not built

Honest list, since the demo is reproducible and reviewers will look:

- Ring history is generated, not pulled from a live account. The generator produces genuinely
  dependent events (the dose is timed off the caregiver's actual arrival, not off the clock)
  so the statistics the engine discovers are real statistics, not hard-coded conclusions.
- The Alexa+ integration takes the simulated-experience path. `reason.ts` already returns the
  structured results an MCP server would serve; what is missing is the HTTP transport.
- Fire TV is verified in a browser at TV dimensions, not yet on-device.

---

## On the way it looks

Three decisions, and the reasoning behind each, since they are all departures
from what a monitoring product normally looks like.

**Light by default.** Dark is the house style of the entire category, and a
default is exactly what makes interfaces interchangeable. This one is meant to
read like a printed record rather than a control room. Dark is one click away
in the top right, and it is tuned separately rather than inverted: a warm
near-black so white text does not halate, signal colours lifted because the
same hue reads darker against dark, and surfaces carrying depth instead of
drop shadows.

**Rules instead of cards.** Grouping is done with space and a single hairline.
A border you notice before the content is too strong, and boxing every element
is a way of avoiding layout rather than doing it.

**One filled control per view.** Everything else is text. Colour is reserved
for the only thing colour should carry here, which is whether something was
observed, expected, or unknowable. Status is a word with a small mark beside
it, not a coloured chip.

The type is IBM Plex Sans with IBM Plex Mono for every figure, and Source Serif
4 for the two headlines that carry the argument.

---

## License

MIT. See [LICENSE](LICENSE).

This repository is public and carries an open-source license, which is the
route the hackathon rules allow in place of a private repository shared with
named reviewers.
