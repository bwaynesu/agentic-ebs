# AI-assisted scheduling — requirements and design

> Built on Joel Spolsky's Evidence Based Scheduling (EBS), with an AI agent taking over the part that costs a developer the most effort: breaking the work down and estimating it.
>
> **This file records why things are the way they are.** Data structures and calculation rules live in `data-format.md`, which is the single source of truth for them.

---

## 1. Purpose

- Developers estimate new work badly: estimating is a skill of its own, the domain is often unfamiliar, and interruptions are impossible to predict.
- EBS asks the user to keep breaking work down, estimating it, and logging hours — all of the effort falls on the person. **This project hands those tasks to an agent and looks at what comes out. It is an experiment with EBS, not an endorsement of it.**
- The agent takes on understanding the requirement, breaking it down and estimating it. The user describes the requirement and presses Start and Complete.
- Following the EBS velocity mechanism, the app corrects the agent's estimate into a probability distribution of "how long this particular user actually takes".

## 2. What EBS provides

| Mechanism | In EBS | What it means here |
|---|---|---|
| Small tasks | Every task ≤ 16 hours, which forces detailed design | No formal subtask breakdown. The agent writes execution steps in fine detail instead, which forces the same design work |
| Velocity | Estimate ÷ actual, accumulated per estimator | The estimator here is the "agent + user" pair |
| The clock never stops | Interruptions do not pause the clock; the inflation is the signal | The user logs no interruptions, only Start and Complete |
| Probability distribution | Estimate ÷ historical velocities → a distribution | Computed by the app, **never by the agent**. A single card uses the closed-form empirical quantiles (`ebs.distribution`), no sampling; the Monte Carlo in Joel's article is for **summing several tasks**, and `ebs.monteCarlo` is written but has no caller yet |
| Expiring old data | Velocities older than 6 months are dropped | Filtered automatically at calculation time |
| Cold start | A new estimator gets a set of wide, made-up velocities | Distributions are wide until the first few tasks finish, which is normal |

## 3. Who does what

| Role | Responsibility |
|---|---|
| User | Creates cards and describes requirements; picks an approach once the agent has delivered; presses Start and Complete; confirms the working window on days the calendar still lists as unconfirmed; sets their own git author info |
| AI agent (external, any agent will do) | Reads the project source and git log, and this system's past task data; produces the requirement understanding, one or more approaches, detailed execution steps and an **ideal-hours** estimate per approach, and the task tags |
| The app | Card CRUD, reading and writing the data, supplying the prompt templates, computing the probability distribution from historical velocity, and displaying the results |

The principle behind the split: **the agent understands and estimates, the app records and does the maths.** LLM arithmetic is neither reliable nor reproducible, so every EBS calculation lives in the app's code.

## 4. Design decisions

### 4.1 The agent estimates ideal hours and never corrects itself
The agent can read the history. If it decides that "past tasks ran 1.5× over" and inflates its estimate, and the app then divides by velocity as well, the estimate is **corrected twice**. The analysis rulebook therefore states plainly: estimate pure development hours, uninterrupted and with nothing going wrong, and leave correction to the velocity mechanism. History is there for a different purpose — to show the approaches and the real complexity of similar past tasks, not to adjust a number.

### 4.2 Velocity belongs to an estimator identity
The estimator is the agent's model, plus the prompt template version, plus the user. Every estimate records the model name and the template version. Swapping the model or rewriting the templates means the estimator changed and older velocities are worth less. The app records this rather than enforcing it — separating the pools comes later, once there is enough data to see whether it matters.

### 4.3 The interruption stack: time only ever belongs to the top card
A clock that never stops only works if time is not counted twice, and in practice an urgent task does come along and cut the line. Hence an **interruption stack**:

- A card records a series of **active intervals** `[start, end]`, not a single start and finish. Actual hours are the parts of those intervals that fall inside the work calendar.
- Starting an urgent card B while A is running: A becomes "interrupted" automatically (its current interval closes) and time starts going to B.
- When B completes, A returns to "in progress" automatically (a new interval opens). The stack can be several layers deep.
- The user presses nothing extra — starting and finishing the urgent card were going to be pressed anyway.
- Small interruptions not worth a card of their own (meetings, errands, helping a colleague) are **neither paused nor recorded**; that inflation is precisely the signal velocity exists to catch. The test is whether the interruption deserves a historical estimate of its own: if it does, open a card; if not, let the clock run.

### 4.4 No subtasks, detailed execution steps instead
For each approach the agent writes **very detailed execution steps** in approaches.md — which files, which functions, which settings. That achieves what the 16-hour rule was really after: being forced to think the steps through. The estimate stays one total per approach, and velocity is the card's total estimate (analysis and discussion plus the chosen approach) divided by its actual hours. How detailed the steps are is where the credibility of the estimate comes from, so the rulebook requires the agent to mark anything it cannot turn into concrete steps as an uncertainty.

### 4.5 The work calendar: default window, confirmed afterwards
- The user sets a time zone, working hours and break periods on the settings page (stored in `settings.json`).
- Any day not listed in `calendar.json` uses those defaults: the working window on a weekday listed in `workdays`, a day off otherwise. Such a day is "unconfirmed".
- On load, the app lists past days that **overlap a task's active intervals** and are still unconfirmed, and asks the user to confirm or correct them (a day off, a late night, a shorter day). Days with no task activity change no number, so the user is not bothered about them.
- What gets written into `calendar.json` is that day's window (`start` / `end`, or `off`) together with `confirmed: true`.

### 4.6 Tying git log to a task
The user sets their git author info on the settings page (name or email, stored as `gitAuthor` in `settings.json`), the agent filters with `git log --author=<gitAuthor>`, and commits by that author falling inside the card's active intervals count as that task's output. That is enough for personal use; commit messages are not required to carry a task id, though the templates can suggest it.

### 4.7 Task tags
During analysis the agent picks tags from a small fixed list and writes them into task.json; any number may apply. The seven defaults are `frontend-ui`, `backend-logic`, `data-processing`, `refactor`, `debugging`, `infrastructure` and `unfamiliar-domain`, stored as those codes and translated only for display. There are two uses, on different timescales:

- **Already in effect**: when analysing a new task, the agent looks first at past tasks with similar tags — what approach was chosen and how complex it turned out — which makes its own approaches and estimates better.
- **Later**: velocity probably varies by type of work (0.8 in a familiar area, 0.4 in an unfamiliar one). Once a single tag has around six finished tasks behind it, the distribution could draw from a same-tag pool first and fit that kind of work more closely. Until then the global pool is used, so a small sample cannot distort the distribution.

The list is kept small and stable on purpose: split it too finely and no single pool ever collects enough samples.

### 4.8 Before the first folder is linked

The page opens with no data of its own, and three things have to be true before anything works: a Chromium browser, an agent that runs inside the development project, and a folder to write into. Only the first is detectable. So the pre-connection screen states all three, and the browser check renders there as well rather than in the header — an unsupported browser is the one state the visitor cannot act on, and it used to be reported in the smallest text on the page.

Two rules follow from that screen:

- **Controls that cannot act are disabled or hidden.** Settings, refresh and collapse-all all did nothing before a folder was connected, while looking exactly as usable as they do afterwards. A visitor with no folder linked presses Settings first.
- **The picker is answered before it is committed.** The folder is adopted only after its contents have been looked at, so declining leaves whatever was linked before untouched.

### 4.9 Guarding the folder choice

Pointing the picker at the development project itself is the expensive mistake: the app would then create `settings.json`, `calendar.json`, `prompts/` and `tasks/` in the project root, usually under version control. Wording carries most of the load — everything naming the folder calls it the task data folder, and both places that open a picker say to create an empty folder inside the project. The check behind it reads the top-level entries: empty and "ours" (a `settings.json` or a `tasks/` is present) pass, and anything else asks once.

There is deliberately no list of project markers to match against (`.git`, `package.json`, `Assets`, …). A project directory is never empty, so "holds something, and none of it is ours" already covers the case, and there is no list to keep current for the next language or build tool.

### 4.10 The two settings nobody is forced to fill

A brand-new folder opens on the settings page rather than an empty task list, because two fields there shape every analysis and neither reports an error when wrong: the relative path to the folder, and the git author.

Neither can be validated. The browser never learns a folder's absolute path, so the app cannot tell where the project is; any non-empty string passes. A gate would therefore give false assurance while trapping the user, so instead:

- The path is seeded as `./<folder name>`, which at least reads as a path rather than a name, and it is badged "check this" — not "required", since it is never empty.
- The git user name is badged "worth filling in", first visit only. Left up whenever the field was empty, it would nag forever at anyone not using git.
- The path is printed where it is used, in the section that copies the analysis prompt. Until then it existed only inside the copied text, so a wrong value surfaced as the agent reporting a missing file, minutes later, with nothing pointing back at the setting.

Save and Cancel both lead to the task list. Nothing here blocks navigation; the only thing in the app that may is unsaved edited content, which is about losing work rather than being incomplete.

### 4.11 The task page shows the whole flow, always

Every stage of a card gets a section, built whether or not it holds anything yet. The wrap-up section used to be skipped until `steps.md` existed, the argument being that listing it in the flow navigation would offer a button with nowhere to jump. That argument is circular — keep the section and the button lands somewhere — and the cost was real: a card created a minute ago displayed four stages of a five-stage process, which reads as a tool that has four stages.

Each section's action sits at the right end of its heading instead of inside the body. The step-card prompt and the implementation prompt used to take turns in one spot: the moment `steps.md` appeared, the first was replaced by the second. Nobody noticed, because the swap happens when the user presses refresh, and they press refresh to look at something else. Fixed positions have a second benefit — a collapsed section can still be acted on, and copying a prompt never required reading the section anyway.

Every one of those buttons is named for the text it copies, never for what the agent will then do. **Generate step cards** and **To implementing agent** both read as promises the app cannot keep: nothing here runs an agent, and people pressed them expecting step cards to appear. They are **Copy step-card prompt** and **Copy implementation prompt**.

The step-card prompt sits with the approaches rather than with the step cards. Choosing an approach and handing it over is one move, and splitting it across two sections created a stage whose only content was "press the button the previous stage just unlocked". The flow navigation follows: choosing an approach and generating the step cards are one stop, and the step-card section is never the current stage — it displays `steps.md` and carries the implementation prompt. Every section is still listed; not every section has to be a stage.

An action that cannot run yet is disabled, not removed, and its reason rides on the `title` of a wrapping span. A disabled button fires no hover of its own, and the explanation otherwise sits inside the section the user would have to expand to read.

The action belonging to the current stage is filled rather than outlined. Which stage that is comes from a single computation shared with the flow navigation, so the coloured button and the ● can never point at different places. A fill still reads under red-green colour blindness, where a change of hue alone collapses. One exception is deliberate: at the wrap-up stage the implementing-agent button is lit as well. Implementation produces no file the app can see, so the phase advances the instant `steps.md` lands, while the work itself has not started. Lighting only the wrap-up button there reads as "you are finished" and walks the user straight past the implementation.

Finished cards carry no actions. They are velocity evidence, and re-running the analysis of finished work would overwrite what the estimate was judged against.

### 4.12 The task page refreshes itself when the window comes back

The agent writes into the task folder while the user is somewhere else — a terminal, an editor, another window. Returning to a page that still shows the files from ten minutes ago made the refresh button part of the routine, pressed on arrival every single time.

So the page re-reads itself when the window regains focus. Both `focus` and `visibilitychange` are listened for, since one covers another window and the other another tab, and they share one timer, so a flurry of alt-tabbing redraws once. The timer runs for about a second and a half after the last of them. That delay is not politeness: agents tend to write several files in a burst, and waiting out the quiet makes it unlikely that a file is read mid-write.

Before anything is redrawn, the modification times of the card's own files are compared against a snapshot taken when the page was last drawn. Nothing changed means nothing is rebuilt. This is not about saving reads — `getFile()` costs almost nothing next to reading the contents — it is that a page which rearranges itself for no reason is worse than a stale one, and the window regains focus dozens of times a day.

The redraw is the same in-place update the refresh button performs, so a section being edited is left alone. But when anything is unsaved, the whole round is skipped, snapshot included. Refreshing around the edit box would work; stamping a new snapshot over files that were deliberately not redrawn would not, because that change would then never surface. Saving already triggers the same in-place update, so waiting costs nothing. It also keeps this path away from the full re-render fallback, which asks about unsaved changes — a dialog nobody should meet for the crime of coming back to the window.

Only the card on screen is watched, and only its own files. Failures are swallowed here without touching the stored folder handle: a read failing while the agent holds a file open says nothing about the folder still existing, and this code runs every time the user looks at the window.

## 5. Cold start

With fewer than six finished tasks in the pool, a set of deliberately wide made-up velocities is mixed in, as EBS suggests (e.g. {0.3, 0.5, 0.7, 1.0, 1.3}), and the app marks the distribution as indicative only.
