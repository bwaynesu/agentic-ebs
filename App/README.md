# Agentic EBS — Web App

[繁體中文](README.zh-Hant.md)

A static page that runs locally and keeps its data in a folder on the machine. No backend, nothing to install.

The project overview and the reasoning behind the design are in the [README](../README.md) one level up; this document covers operation.

## Requirements

- Chrome or Edge (the File System Access API is used, and **Firefox and Safari are not supported**).
- Any static HTTP server. Opening `index.html` directly through `file://` will **not** work — the File System Access API needs localhost or https.

```
cd App
python -m http.server 8765
```

Then open <http://localhost:8765>. Any static server does the job when Python is unavailable, `npx http-server -p 8765` for example.

## First-time setup

1. Click **Pick task data folder** at the top right and point it at a new, empty folder inside your project. The tool creates `settings.json`, `calendar.json`, `prompts/` and `tasks/` inside it.
2. The tool opens the settings page by itself on a first link. Two fields there carry a badge — **Relative path from your project root** and **Git user name** — because both shape the quality of the agent's analysis and neither raises an error when left wrong; how to fill them is described under [Settings page](#settings-page).
3. Later reloads remember the folder on their own. When the browser asks for permission again, one click on **Relink task data folder** restores it — authorisation needs a user gesture and cannot happen automatically.

The folder can live inside or outside the development project, since the path used in prompts is relative to the project. Inside is the easier choice: most CLI agents refuse by default to touch anything outside their working directory. The price is remembering to add the folder to that project's `.gitignore`.

## Walking one card end to end

1. A title typed on the home page creates the card. The tool jumps straight to the task page and asks whether to start the clock right away; answering yes counts time from that moment. The ✎ on **Requirement** then opens the editor — the more detail there is, the better the analysis that follows.

   > Pinning the requirement down is part of the card's work, which is why the clock starts here instead of at the first line of code. Declining costs nothing: **Start** on the left rail is available at any time.

2. **Copy Prompt** produces text to paste to an agent running in the development project directory. The prompt carries the relative path from the settings page, and the agent reads and writes the task data through it.

3. The agent writes `understanding.md` first — the assumptions it adopted and the questions still open — then stops and waits for confirmation. Only once the requirement lines up does it go on to `approaches.md` and `estimate.json`. Refreshing the page brings up the approaches and the corrected distribution.

4. Discussion settles which approach to take. Nothing stops the agent from revising until one of them is right.

5. Ticking an approach releases **Copy step-card prompt**, at the head of the same section as the approaches. Pasting that to the agent produces `steps.md`, and **Copy implementation prompt**, on the step-card section, then hands the execution rules together with the step cards to whichever agent does the work, one card at a time. A clean agent is the better choice here, for the reason in the next section.

6. When the implementation has stopped changing, the prompt under **Wrap up** goes to the agent, which writes `final-spec.md`, `spec-diff.md` and `logic.md` from the final code. Doing this while the card is still counting matters — wrapping up is work too.

7. **Complete** after delivery.

An urgent interruption needs nothing special. Starting another card moves the first one aside, and it comes back once the urgent card is done. Meetings and small interruptions are not a reason to stop the clock.

## Different agents for analysis and implementation

The three stages have separate rule books (`analyze-task.md`, `steps-guide.md`, `implement.md`); they were designed apart from the start.

By the time the analysing agent reaches the step-card stage it is carrying a long requirements discussion, and letting it implement squeezes whatever context is left. A clean agent reading nothing but the step cards stays closer to the work. There is a second benefit: if the implementation drifts, the analysing agent is still there to talk to, and its judgement has not been coloured by implementation detail.

The step cards are built for this — each one can be picked up on its own, and the implementing agent never has to read the discussion behind them.

## Settings page

### Folder & paths

| Field | Meaning |
|---|---|
| Task data folder | The name of the linked folder, changeable at any time. Switching folders means switching to a different history; the velocity pool does not follow |
| Relative path from your project root | Where that same folder sits from the **development project**'s point of view |

Both rows describe the **same folder**, but they answer different questions:
- the first is "which folder does the browser read and write"
- the second is "how does the agent reach it from a terminal"

One cannot be derived from the other, because the browser, for security reasons, **never sees a folder's absolute path**. The page knows neither where the folder sits on disk nor where the development project is, so this path has to be supplied by hand.

The folder name is filled in on first link, which is already correct when the folder sits directly in the project root. Every other arrangement needs a correction:

| Project directory the agent runs in | Where the folder actually is | Path to enter |
|---|---|---|
| `~/code/MyGame` | `~/code/MyGame/ebs-data` | `./ebs-data` (the default is already right) |
| `~/code/MyGame` | `~/code/MyGame/docs/ebs-data` | `docs/ebs-data` |
| `~/code/MyGame` | `~/code/ebs-data` | `../ebs-data` (the agent needs access to the parent directory) |

A wrong path produces no error message at all. The agent simply reports that it cannot find the files.

### Working hours

These settings decide how much of a timed interval counts as work. Time falling outside the window — nights, days off — counts as zero by default.

| Field | Meaning |
|---|---|
| Time zone | IANA name, taken from the browser by default. Every date key is converted through it |
| Work starts / Work ends | The daily working window |
| Workdays | Which weekdays count as working days; the rest are days off |
| Breaks | Stretches excluded from working hours, several allowed, lunch included by default |
| Work calendar | A collapsed editor that overrides the start and end of the working day, one date at a time (hours follow from the window rather than being typed in). Edits save immediately and apply **retroactively** to the hours already counted for that day, and to velocity |

**Does work during lunch or after hours count?**

Not by default. But when **Start** or **Complete** lands inside such a stretch, the tool lists it and asks — pressing the button at that moment is evidence that someone really was there. Taking 09:00–18:00 with a 12:00–13:00 lunch break as the example:

| Situation | Hours counted for the card that day | What the tool does |
|---|---|---|
| Start at 12:30, complete at 18:00 | 5 hours (13:00–18:00) | Asks whether the half hour from 12:30 to 13:00 should be added |
| Start at 11:00, complete at 14:00, clock left running over lunch | 2 hours (11–12, 13–14) | Does not ask. 12:00–13:00 sits in the middle, with no evidence of presence |
| Start at 21:00, complete at 23:00 | 0 hours | Asks whether the whole 2 hours should count |
| Start Friday 17:00, complete forgotten, clock stopped Monday 10:00 | 2 hours (Fri 17–18, Mon 9–10) | Does not ask. The weekend sits in the middle |

When the tool asks, and in which order the confirmations happen, is covered in [The work calendar and confirming hours](#the-work-calendar-and-confirming-hours).

### Git

| Field | Meaning |
|---|---|
| Git user name | A name or an email. The agent filters with `git log --author=<this value>` to find one person's commits, which show the habits and the usual size of a change. **An empty value raises no error, but the filter stops working** and the agent reads the whole team's history |

### Prompt customisation

| Field | Meaning |
|---|---|
| Output language | The language the agent writes task documents and talks in. A language name is enough, and empty means English. See [Interface language and output language](#interface-language-and-output-language) |
| Prompt editors | One editing box per prompt file in the folder, each saved or reset to the default on its own |

## The work calendar and confirming hours

`calendar.json` records only the days that have been confirmed or modified. **Every other day is stored nowhere**: its hours come straight from the working window on the settings page, days off count zero, and the state is always unconfirmed. The home page lists **past days that overlap a timed interval and are still unconfirmed** — days with no task running never interrupt.

Confirmation happens in two stages, and the order matters:

1. **The actual start and end of work that day.**
2. **The stretch outside the working window that sits right against the start or end of a timed interval.** Whether it counts is a judgement call. Out-of-window time in the middle is neither asked about nor counted; the rule and worked examples are under [Working hours](#working-hours).

The order cannot be reversed. Judging out-of-window time before the window itself is settled means redoing every one of those judgements as soon as the window changes.

Unconfirmed days block nothing, but **a completed card spanning them stays out of the velocity pool**, and the card says why.

The task page also shows a total elapsed figure. That is the raw length of the intervals, with nothing deducted and no effect on velocity, kept there for comparison.

## Editing intervals by hand

The **Time log** section of the task page lists every **finished** interval on the card. Each row can have its start or end changed, or be deleted whole.

**Add interval manually**, below the list, appends a stretch running from one hour ago to now, ready to be corrected. An end earlier than the start is rejected.

**The interval currently running cannot be edited there.** Correct interrupt-stack behaviour rests on at most one clock running system-wide, so the live interval answers only to **Start** and **Complete**. Fixing it means pressing **Complete** to close it, making the correction, then pressing **Restart**.

### When to edit

| Situation | What to do |
|---|---|
| **Start** forgotten, remembered an hour into the work | Press **Start**, then use **Add interval manually** for the hour already spent |
| **Complete** forgotten, clock left running overnight or over a weekend | Press **Complete**, then move that interval's end back to when the work actually stopped |
| **Start** pressed by mistake, no work done | Press **Complete**, then delete the interval |
| Work done somewhere without the page open (another machine, offline) | Add it with **Add interval manually** |

### When not to edit (real inflation)

Meetings, a colleague stopping by, some errand that came up — that time belongs in the record. Capturing exactly this inflation is why velocity exists. Editing it away one stretch at a time deletes the tool's only source of signal, and the estimates drift optimistic with nothing left to show how it happened.

The test is **whether the person was there**:
- absent (asleep, off work, the clock simply left running) is a recording error and should be fixed
- present but occupied by something else stays in.

When that something else is big enough to be worth tracking on its own, the right move is a new card for it. The original card steps aside automatically, the hours land where they belong, and no interval needs touching.

## Task tags

The agent tags each card. Tags exist so that the next analysis reaches first for older tasks of a similar kind; they have no effect on the hours estimated.

The ones shipped are only **defaults**. Settings → **Prompt customisation** → **② Analysis rules** holds the list, and swapping it for the vocabulary of another field takes a moment (a game project might use `gameplay`, `shader`, `level-design`). The code never inspects the contents. What does matter is keeping **one fixed set of words** rather than letting the agent invent them each time: write the same idea as `frontend` once and `front-end` the next, and the similarity matching quietly stops working.

When an update to this tool ships newer prompts, a prompt that has been edited by hand is **not** overwritten. Upgrades compare content hashes file by file, and only untouched files update automatically. The settings page points out that a new version exists and leaves the decision open.

## Interface language and output language

The dropdown at the top right of the header switches the interface language. The first visit follows the browser's language, and the choice is remembered in that browser rather than written into the folder.

### The language of instructions, and the language of output

1. The prompts handed to the agent (`prompts/`) are English and exist as a single copy. That is the language of the **instructions**.
2. The language the agent writes task documents and talks in is the **Output language** field on the settings page. A language name is enough (`繁體中文`, `日本語`, `Traditional Chinese` all work, and empty means English); copying a prompt appends one line of instruction automatically.

Where each setting is stored is deliberate as well. Interface language and theme live in the browser and stay behind when the machine changes. Output language lives in the folder's `settings.json`, because it decides what gets written into the folder, and a second machine should still produce the same language — otherwise one folder ends up holding a history in two of them. The interface language at that moment is copied in when a folder is first linked; the two run independently from then on.
