# Data format

Everything lives in the folder the user picks (called `data/` below). Timestamps are always ISO 8601 UTC strings (what `new Date().toISOString()` produces in JS). Date keys (`YYYY-MM-DD`) are always the local date derived from `timezone` in `settings.json`.

## Folder layout

```
data/
├── settings.json
├── calendar.json
├── prompts/
│   ├── template.md          # ① the analysis prompt the user copies and pastes
│   ├── analyze-task.md      # ② the rulebook ① points at: analysis and estimation (steps 1-8)
│   ├── steps-template.md    # ③ the prompt behind "Copy step-card prompt" (holds an <approachId> placeholder)
│   ├── steps-guide.md       # ④ the rulebook ③ points at: how to break work into step cards
│   ├── implement.md         # ⑤ rules for the agent that works through the step cards
│   ├── wrap-up-template.md  # ⑥ the prompt behind "Copy wrap-up prompt"
│   └── wrap-up-guide.md     # ⑦ the rulebook ⑥ points at: how to write the three wrap-up docs
└── tasks/
    └── <taskId>/
        ├── task.json
        ├── requirement.md   # the user's requirement (written empty at creation, edited in place on the task page)
        ├── understanding.md # agent output: its understanding of the requirement (absent before analysis)
        ├── approaches.md    # agent output: the approaches (absent before analysis)
        ├── estimate.json    # agent output: the hour estimates (absent before analysis)
        ├── steps.md         # agent output: implementation step cards (only after the user picks an approach)
        ├── final-spec.md    # agent output: the spec as finally built (wrap-up stage)
        ├── spec-diff.md     # agent output: how it differs from the original spec (wrap-up stage)
        └── logic.md         # agent output: how the code works (wrap-up stage)
```

## taskId

Format: `YYYY-MM-DD-<title>`, the date being the creation date in the configured time zone. The title has the characters a Windows folder name cannot hold removed (`\ / : * ? " < > |`), is trimmed, and has runs of whitespace collapsed into `-`. Trailing dots and hyphens are then removed: Windows drops a trailing dot from every path it resolves, so a folder named `2026-08-19-0.` sits on disk unreachable to the shell the agent runs in, and Chrome declines to create it at all. A title that survives this as an empty string becomes `task`. If a folder of that name already exists, a counter is appended: `-2`, `-3`, and so on.

## settings.json

```json
{
  "timezone": "Asia/Taipei",
  "dataDirPath": "ebs-data",
  "workStart": "09:00",
  "workEnd": "18:00",
  "breaks": [{ "start": "12:00", "end": "13:00" }],
  "workdays": [1, 2, 3, 4, 5],
  "gitAuthor": "",
  "outputLang": "Traditional Chinese",
  "velocityMaxAgeMonths": 6,
  "coldStartVelocities": [0.3, 0.5, 0.7, 1.0, 1.3],
  "minVelocitySamples": 6,
  "promptTemplateVersion": "14",
  "prompts": {
    "prompts/analyze-task.md": { "hash": "9f86d081…", "version": "12" }
  }
}
```

| Field | Meaning |
|---|---|
| timezone | IANA time zone name; defaults to the browser's |
| dataDirPath | Path of the data folder as seen from the development project, which is where the agent runs. Defaults to the folder's own name on first link and is editable on the settings page. It replaces the `<dataDir>` placeholder in `template.md` when a prompt is copied. Written when the folder is linked, not by `ensureInit` |
| workStart / workEnd | Start and end of the working day (`HH:MM`, local time) |
| breaks | Break periods `[{start,end}]` (`HH:MM`), excluded from working hours, any number of them; a lunch break is there by default |
| workdays | Working days of the week, `0`=Sunday … `6`=Saturday; anything not listed is a day off |
| gitAuthor | The user's git author name or email, which the agent passes to `git log --author=` |
| outputLang | The language the agent writes task documents and talks in. A language name is enough (`Traditional Chinese`, `繁體中文` and `日本語` all work); an empty string means English. Copying a prompt appends one English instruction line (`promptLangLine` in `tasks.js`), so `prompts/` never needs a translated copy of itself. The value is neither validated nor limited to a list — same reasoning as tags, a whitelist would hardcode which languages this tool supports. File names, JSON field names and codes (status, tags) are unaffected. New folders, and existing folders missing the field (a one-time migration), get the interface language in use at that moment; the two are independent from then on. **An empty string simply means English and is never interpreted as "follow the interface language"** — interpreting it dynamically would make one folder produce documents in different languages on different browsers |
| velocityMaxAgeMonths | How long a velocity sample stays valid, in months; older ones are dropped |
| coldStartVelocities | Fake velocities mixed in while history is thin |
| minVelocitySamples | A pool below this many samples counts as insufficient history |
| promptTemplateVersion | The prompt version this folder last saw (the bundled value is `14`); the agent copies it into task.json as a provenance marker. It **does not decide whether prompts get updated** — the hashes under `prompts` do that. It only triggers one-time data migrations and indexes the changelog. Once the user has edited a prompt, the marker is an approximation |
| prompts | The update baseline for each prompt file: `{ "prompts/xxx.md": { hash, version, observed? } }`. `hash` is the SHA-256 of **the content we last wrote**, `version` the bundled version at that time. `observed: true` marks a file that already existed before we started keeping records, so its origin is unknown |
| promptNoticeDismissed | The version the user dismissed with "Not this time". The home page banner stays hidden while this equals the bundled version, and a newer bundled version brings it back. It **only affects the banner**; the dot on the settings button and the markers on the settings page are unchanged |

### Prompt update rules

`ensureInit` decides file by file (`promptDecision` in `store.js`, a pure function with tests), in this order:

| Case | Action |
|---|---|
| The folder has no such file | Write the bundled default and record it |
| Content hash = bundled default | Already current; just repair the record |
| No record, or the record is `observed` | **Do not overwrite.** Origin unknown, so ask once, whatever the version says |
| Record exists, not `observed`, content hash = recorded hash | Ours and untouched → overwrite with the new version |
| Anything else (the user edited it) | **Do not overwrite.** Flag it for notification only when `version` differs from the bundled one, otherwise pass over it silently |

Why: the user can customise prompts on the settings page, and silently overwriting a customisation is irreversible data loss. The hash answers "has this been touched", the version answers "is there anything new to offer", and the two are decided separately. An older design tied both to one version number, which made "edit one line of a prompt" and "wipe the user's customisations" the same action.

A file of unknown origin is asked about even when the version matches, because the whole point of `observed` is that we do not know who wrote it. Staying silent on a version match would leave that record stuck forever, and the user would never learn there is a file in their folder we do not recognise.

`resetPrompt` (used by "Restore default" and "Take the new version" on the settings page) **must update the record** after writing, or the restored file is judged as user-edited on the next pass. Pressing "Save" **does not** update the record — that would register the customisation as ours and let the next upgrade overwrite it.

`keepMyPrompt` ("Keep mine") only rewrites the record to `{ hash: the bundled content that was rejected, version: the current bundled version }` and leaves the file alone. The file then falls into the silent branch in the last row above, which is what finally turns the dot off; a later version asks again, since what the user rejected was that version's changes, not every change to come. The **hash must not record the user's current content** — that would declare it ours, and the next upgrade would overwrite the customisation outright.

Bundled defaults are always fetched with `fetch(path, { cache: "no-cache" })`. A bare fetch can return a cached older prompt, which then gets written into the user's folder as "the bundled default" and hashed as such — every later upgrade decision would rest on a wrong baseline. This has happened.

Files awaiting a decision are listed in a notice panel on the home page, but **the home page only points the way and offers no action**: deciding means seeing both texts, and only the settings page has room for that (the file as it stands now, editable, beside the bundled version, read-only). The change notes come from `App/prompt-changelog.md` (**kept in the App and never copied into the user's folder**: it only grows, and it would need an upgrade mechanism of its own), filtered per file — only entries newer than that file's baseline version and naming that file. An `observed` file gets no change notes at all, because its baseline version is a guess.

## calendar.json

Only days the user confirmed or modified are stored; every other day falls back to the default rules.

```json
{
  "2026-07-07": { "start": "09:00", "end": "13:00", "confirmed": true },
  "2026-07-08": { "off": true, "confirmed": true }
}
```

**The working window for a day**, decided in this order:

1. `calendar[date]` exists with `off: true` (or the old format's `hours: 0`) → day off, zero hours.
2. `calendar[date]` exists with `start`/`end` → use that window; if the entry carries no `breaks` of its own it inherits `settings.breaks` (shifting the hours of a day does not mean there was no lunch break).
3. Otherwise, if the weekday (in the configured time zone) is in `settings.workdays` → use `workStart`/`workEnd` minus `breaks`.
4. Nothing matched → day off, zero hours.

Every entry the app writes carries `confirmed: true`, from all three places that write one: the per-day row in the home page reminder, "Confirm all with defaults", and the calendar editor on the settings page. Whether a day counts as confirmed is always read as `calendar[date]?.confirmed === true`.

## task.json

```json
{
  "id": "2026-07-07-sample-task",
  "title": "Sample task",
  "tags": [],
  "status": "draft",
  "intervals": [],
  "planningIntervals": [],
  "selectedApproach": null,
  "interruptedBy": null,
  "model": null,
  "templateVersion": null,
  "createdAt": "2026-07-07T01:00:00.000Z",
  "completedAt": null
}
```

| Field | Meaning |
|---|---|
| status | `draft` → `estimated` (the agent has delivered) → `active` ⇄ `interrupted` → `done`. **Only the app writes it; the agent must not touch it** (analyze-task.md states this). Any other value is treated as bad data: the side rail on the task page shows the anomaly and offers a one-click repair (derived by `repairStatus` in `tasks.js`: an open interval → active, interruptedBy → interrupted, completedAt → done, otherwise it depends on whether an estimate exists) |
| intervals | The active intervals of the whole case (two-button model: "Start" starts the clock, "Complete" stops it, covering discussion, waiting for the agent and implementation alike), as `[{ "start": ISO, "end": ISO or null }]`; `end: null` means the clock is running. **At most one card in the whole system is active at any moment — that is, at most one interval anywhere has `end: null`.** Intervals may be many and non-contiguous; closed ones can be edited, deleted or added by hand in the UI (the running one belongs to the Start/Complete buttons) |
| planningIntervals | **Deprecated.** Before the two-button model these held the discussion intervals recorded by "start/stop discussion". `newTask` still creates the field as an empty array but nothing is ever appended to it. Old cards keep it: the UI shows the total and allows editing or deleting the intervals (there is no "add" button for this track), and when the estimate carries `planningHours` those window hours join the denominator of that card's velocity (see EBS definitions) |
| selectedApproach | The chosen approach id, matching estimate.json. Decoupled from the clock: picking the radio button saves it immediately and it can be changed at any time. A card still holding `null` when it completes stays out of velocity |
| interruptedBy | The taskId of the card that interrupted this one; this card resumes when that one completes |
| tags / model / templateVersion | Written by the agent during analysis; **these three are the only fields of task.json the agent may modify** (the same list is `AGENT_FIELDS` in `tasks.js`) |
| createdAt | When the card was created (ISO UTC, written at creation); shown on the task page |
| completedAt | When "Complete" was pressed |
| countOffHours | Whether **edge off-window hours** (see EBS definitions) count toward actual hours. `null` or absent = the user has not ruled yet, and the card **stays out of the velocity pool** meanwhile; `true` = window hours plus edge off-window hours; `false` = window hours only. `newTask` does not create the field — it appears the moment the user rules. Only `status: done` cards need a ruling |

The default tag list (any number may apply): `frontend-ui`, `backend-logic`, `data-processing`, `refactor`, `debugging`, `infrastructure`, `unfamiliar-domain`.

**These are defaults, not a schema constraint.** The list lives in step 8 of the user's own `analyze-task.md` and can be swapped wholesale for the vocabulary of another field; the app validates nothing and stores and displays unknown values as they are. That is safe because tags play no part in the EBS maths (the velocity pool is global and tag-blind) — they are card labels and a retrieval hint for step 4. A bad tag list only makes the hint weaker. **The instructions to the agent still need a closed list**, though: let it invent tags freely and the folder grows `frontend` / `front-end` / `ui` as synonyms, and step 4 stops finding anything.

**What is stored is a code, not display text**, translated for display through `tag.*` in `i18n.js` (`tagLabel` in `tasks.js`; unrecognised values are shown verbatim, so a custom tag never breaks). Tags are both a UI label and the basis for "find similar past tasks" (step 4 of `analyze-task.md`); store display text instead and prompts in different languages would write two vocabularies into one folder, and the matching would quietly stop working. Folders written before v11 hold Chinese strings, which `ensureInit` maps once when the version number is behind (`migrateTags` in `tasks.js`).

## estimate.json (written by the agent)

```json
{
  "planningHours": 1.5,
  "approaches": [
    {
      "id": "a1",
      "name": "Approach name",
      "hours": 12,
      "uncertainties": ["A source of uncertainty"]
    }
  ]
}
```

`planningHours` is the estimated ideal time for analysis and discussion (the agent's own analysis plus confirming the approach with the user), one value for the whole task, ideal like everything else and not to be inflated. **It takes part in case-level velocity**: see the per-task scale matching under EBS definitions.

`hours` is **ideal hours**: pure development time, uninterrupted, nothing going wrong. The agent must not consult past overruns and inflate the number itself — correction is the velocity mechanism's job.

**Both hour fields have to be numbers greater than zero**, and every read goes through `ebs.numHours()` (the one implementation). Numeric strings (`"12"`) are recovered; everything else (`"12h"`, `null`, `""`, booleans, negatives, zero) counts as "no value". A broken `hours` means that approach has no distribution: the task page says so and asks for a rewrite, and a card that selected it is held out of the pool as `approachMissing`. A broken `planningHours` falls back to the old implementation-only scale, numerator and denominator together, since the scale has to match per card. Without this layer `1.5 + "12"` concatenates into `"1.512"`: the chart still draws, velocity still accepts it, and what gets corrupted is the estimate of every later card.

## Status flow and interruption rules

Two buttons: **"Start"** (starts the case clock, available in both draft and estimated) and **"Complete"** (stops it). Discussion, waiting for the agent, implementation and wrap-up all land on the same `intervals` track, which the interruption stack protects uniformly — nothing has to know which phase the card is in. The button labels deliberately carry no phase (they were once "start discussion" / "finish implementation"), so nobody assumes implementation and wrap-up need buttons of their own.

- **Pressing "Start" (card B)**: if a card A has status `active`, close A's current interval (`end=now`), set A.status=`interrupted` and A.interruptedBy=B.id. Then B opens a new interval (`{start: now, end: null}`), B.status=`active`, and B.interruptedBy is cleared. Picking an approach is decoupled from the clock: the radio button saves `selectedApproach` on the spot, and starting does not require one.
- **Pressing "Complete" (card B)**: close B's intervals (every open one, not just the first), B.status=`done`, B.completedAt=now. Then look for a card A with interruptedBy=B.id → A opens a new interval, A.status=`active`, A.interruptedBy=null.
- **A done card can be restarted**: "Restart" behaves exactly like "Start" (the same `timer.startTask`, so it interrupts whatever is active) and the status returns to `active`. Completing it again updates completedAt, and the hours simply accumulate — roughly equivalent to EBS charging bug-fixing time back to the original task.
- **Deleting a card (X)**: repair the stack before removing the folder. Cards with interruptedBy=X.id are re-pointed at X's own parent (X.interruptedBy); when X is the top of the stack (active), deleting it counts as completing it and the most recent waiter resumes.
- **Editing times by hand**: **closed** intervals in `intervals` (and in old cards' `planningIntervals`) can have their start and end changed, or be deleted, directly in the UI; a closed interval can also be added by hand to `intervals`. The running interval (`end: null`) belongs to the Start/Complete buttons alone, which is what keeps the single-active invariant true.

## EBS definitions

- **Window hours** `ebs.taskWindowHours(task)` = the hours of the card's intervals that fall inside the working window, breaks removed; the intersection is computed in minutes, local day by local day. Anything outside — nights, days off, breaks — counts as zero. An interval with `end=null` is measured up to "now".
- **Edge off-window hours** `ebs.taskOffHours(task)` = the off-window stretches that touch the start or the end of an interval. The design expects the user to press only Start and Complete, so intervals can span days; someone was demonstrably at the keyboard at the moment they pressed a button, which makes off-window time at those edges (working through lunch, staying late, a push on a day off) credible evidence worth asking about. Off-window time stranded in the middle of an interval (going home for the night, a weekend) has no such evidence and stays excluded without a question. Which stretches are off-window is decided day by day against that day's actual window (a calendar override first, the settings default otherwise).
- **Actual hours** `ebs.taskActualHours(task)` = window hours, plus edge off-window hours when `countOffHours === true`. A **finished** card with at least 0.1 h of unruled edge off-window hours raises a reminder on the home page listing each stretch, and stays out of the velocity pool until the ruling is made — real work is not silently zeroed, and an interval left running overnight does not swallow the whole night either. But if any day the card touches is still unconfirmed in `calendar` (`confirmed !== true`), **no reminder is raised**: with the window unsettled, the off-window hours are provisional figures computed from the default window, and asking now asks a question whose answer can still move (the ruling is void as soon as the window changes). The card still stays out of the pool, under the reason `dayUnconfirmed` — not asking is not the same as letting it through, or it would slip into the pool carrying provisional hours.
- **Elapsed time** `ebs.taskElapsedHours(task)` = wall-clock hours across all intervals, ignoring the window. Shown for comparison only; it never reaches velocity.
- **Velocity, with the scale matched per card** (`ebs.caseVelocity`): numerator and denominator must be on the same scale, decided per card by whether the estimate carries `planningHours`.
  - It does (a card from prompt v4 onwards): **case scale** = (`planningHours` + the approach's `hours`) ÷ (actual hours + the window hours of the legacy `planningIntervals`, if any).
  - It does not (an old card): **implementation scale** = the approach's `hours` ÷ actual hours, the old definition, with no discussion time in the denominator.
  - Samples of either scale are internally consistent, so both can share one pool; old-scale samples age out through velocityMaxAgeMonths, and within six months the pool is pure case scale. Backfilling `planningHours` onto old cards is forbidden — the estimate would be polluted by the outcome.
- **The velocity pool** = the velocities of finished cards with no exclusion reason. Reasons come from `ebs.velocityExclusion()` (**the only implementation**, shared by the filter that runs and the reason the UI shows), in this order:

  | Code | Condition | Can the user fix it |
  |---|---|---|
  | `notDone` | status ≠ done | — |
  | `noCompletedAt` | completedAt missing | Yes (press Start then Complete again) |
  | `openInterval` | status = done yet an interval still has `end: null` | Yes (press "Restart" then "Complete"; `completeTask` closes every open interval) |
  | `noEstimate` | no estimate.json | **No** (estimating after the fact is polluted by the outcome) |
  | `noApproach` | selectedApproach is null | Yes (pick an approach) |
  | `approachMissing` | selectedApproach is not in the estimate, or its `hours` is not a usable number | Yes (pick again, or ask the agent to write hours as a number) |
  | `tooOld` | completedAt is older than velocityMaxAgeMonths | No (normal expiry) |
  | `dayUnconfirmed` | ≥ 0.1 h of edge off-window hours, unruled, and some day involved has `confirmed !== true` | Yes (confirm those days on the home page first) |
  | `offHoursPending` | ≥ 0.1 h of edge off-window hours and countOffHours unruled (all days confirmed) | Yes (rule on it) |
  | `noActualHours` | actual hours = 0 (all the time fell outside the window) | Yes (fix the calendar or the intervals, or count the off-window hours) |

  The "Done" section on the home page prints the reason and the fix on every excluded card, and counts the reasons in its summary — a card left out without a visible reason is a card the user never learns to repair.
- When the pool holds fewer than minVelocitySamples samples, coldStartVelocities are mixed in and the UI has to say the distribution is indicative only.
- **Single-card distribution** (`ebs.distribution`, what the UI uses): the ideal hours for the whole case (`ebs.caseIdealHours` = planningHours + the approach's hours; an old estimate falls back to the approach's hours alone) divided by **every** velocity in the pool gives k possible outcomes, each with probability 1/k. Sort them and report the empirical quantiles P5 / P50 / P95. The index is `ceil(q*k)-1` (the inverse CDF): at k=6, q=0.95 that picks the 6th value rather than the 5th, which would cover 83% under a P95 label. **No randomness is involved** — the same pool and estimate always give the same three numbers, and they move only when the pool does.
- **Monte Carlo** (`ebs.monteCarlo`, rounds supplied by the caller): nothing calls it today. For a single card it is only a sampling approximation of the closed form above, at the price of a different answer on every refresh. Simulation earns its place when **cards are summed** (draw once per card and add; the risks cancel and k^n combinations have no closed form). It is kept for project-level estimation later.
- **Buffer ratio** (`ebs.bufferRatio`): P95 ÷ P50, the multiple to use when committing a date to someone else. The distribution scales purely proportionally, so this value is independent of the size of the estimate — it is a dispersion measure of the velocity pool itself, and a downward trend means estimates are converging.
  - One thing to watch when reading it: the pool currently mixes the two velocity scales above, and until the old-scale samples have aged out the dispersion is inflated, so part of any drop comes from samples expiring rather than from better estimates.
- **Architectural rule**: task data stores raw events only (intervals, ruling flags, estimates). Every derived value — hours, velocity, distributions — is computed at render time and never persisted. Change a definition or the calendar and the effect applies retroactively, with no data migration.
