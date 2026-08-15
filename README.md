# Agentic EBS

[繁體中文](README.zh-Hant.md)

**The developer writes the requirement. An AI agent does the breakdown and the estimate. The tool records the hours actually spent, and once enough of them accumulate, the historical bias turns the agent's ideal estimate into a probability distribution.**

A task-card tool for developers. It is a static page that runs locally and keeps its data in a folder on the machine: no backend, no framework, no build step, and nothing sent anywhere.

The full life of one card:
```
1. Create the card and start the clock
2. Write the requirement
3. Agent analysis (understanding / approaches / ideal hours)
4. Pick an approach
5. Agent splits it into implementation step cards
6. Implementation
7. Agent writes the wrap-up documents
8. Complete
```

One timer track covers all of it. The interface has two buttons: Start and Complete.

## What the tool does

Once a card exists and its requirement is written, the task page offers a prompt ready to copy. Handed to any AI agent that can run inside the project directory — Claude Code, or another CLI agent — it reads the source, the git log, and the task history this tool has accumulated, then produces three things:

- `understanding.md` — the requirement as the agent read it, listing the assumptions it adopted and the questions still open
- `approaches.md` — several approaches, each written down to the level of which file changes, which function gets added, which setting moves
- `estimate.json` — ideal hours for each approach

After the developer settles on one approach, the agent splits it into implementation step cards that can be picked up individually. When the implementation stops moving, the agent writes the wrap-up documents from the **final code**: the spec as it ended up, the differences from the original spec and the reasons behind them, and how the code actually works.

The clock starts with Start and stops with Complete. Writing the requirement, discussion, waiting on the agent, implementation, wrap-up — all of it lands on the same track.

Once cards accumulate, the page converts the agent's ideal estimate into a P5 / P50 / P95 distribution using historical velocity (estimated ÷ actual).

Three kinds of output come out of this:
1. A process that forces the questions open before any code gets written
2. The complete trail behind every card, kept with the card
3. An estimate that moves closer to reality the more the tool gets used

## Where the approach comes from

The method follows [Evidence Based Scheduling](https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/), proposed by Joel Spolsky in 2007: rather than trusting a subjective estimate, record how far off the estimator has been before and scale new estimates by that ratio. What makes EBS expensive is the discipline it demands — constant breakdown, estimation, and time tracking. Those three jobs are what this tool hands to an agent.

What changes once the estimator is an agent instead of the developer is still being observed.

Three decisions here were deliberate:

1. The agent estimates uninterrupted ideal hours and performs no self-correction. Correction belongs to velocity; an agent that adjusts on its own applies the correction twice.

2. Meetings and small interruptions **do not pause the clock**. That inflation is the exact signal velocity exists to capture.

3. Urgent work goes onto an interrupt stack. Hours always belong to the card on top, and no extra operation is needed — Start and Complete on the urgent card were going to be pressed anyway.

## Research direction

Whether the assumptions behind EBS still hold when the estimator becomes "an agent plus one human reviewer" is what this project is trying to find out.

The data the tool leaves behind is enough to support a few concrete questions:

- How widely velocity scatters. Scatter alone does not break the mechanism, but it can widen the output past the point where a decision can rest on it. Where that line falls is an empirical matter.
- `estimate.json` records `model` and `templateVersion`. Whether swapping the model or heavily rewriting the prompt amounts to swapping the estimator.
- The relationship between how finely a task is broken down and how accurate the estimate turns out. The step count in `steps.md` is a ready-made variable.
- Whether the accumulated history pays off in practice. Every card keeps its own trail, and the agent reads them when analysing a new card — that may be making estimates more accurate, or only raising subjective confidence.
- Whether splitting the pool by task tag brings each distribution closer to its own kind of task. Every category needs enough cards for that.

Most of these have no answer yet, and I'm not sure several of them are phrased precisely enough. Discussion through issues is welcome.

## What has shown up so far

Data is still accumulating, so the numbers stay unpublished for now. Two effects that were never design goals started from the very first card.

### Working the problem from the top down

Requirement → analysis → chosen approach → step cards → wrap-up. Walking the task page top to bottom forces the problem to be articulated before any work begins. That happens to be the real point of Joel's 16-hour rule; the statistics come along as a side effect.

### The trail each card keeps

Understanding, approaches, steps and the wrap-up documents all stay on the card, so months later the reason a particular approach was chosen is still there to look up. A new card's analysis reads them too, which means each analysis begins from slightly more than the last one did.

### What hasn't paid off yet

Velocity and the distribution have not found a real occasion to be used — on the development team I work with, nobody has ever asked me how long a task would take…

The current boundary of the tool: it computes **the time a single card takes, not a delivery date for a batch of cards**. The latter needs Monte Carlo to sum several cards together (risks cancel one another out); `ebs.monteCarlo()` is implemented and tested, but nothing calls it yet. Output is in hours.

## Requirements

- An AI agent that can run inside the development project's directory. This tool calls no API of its own — analysis and implementation both rely entirely on the external agent.
- Chrome or Edge. The File System Access API is required, and **Firefox and Safari do not support it**.

> **The distribution takes time to sharpen, but no data needs to be prepared in advance.** Everything works from the first card onward. Until somewhere past twenty completed cards, the distribution comes out wide; that width is expected at that stage, and nothing is misconfigured.

## Getting it running

### Hosted

**<https://bwaynesu.github.io/agentic-ebs/>** — served from GitHub Pages, so opening the link is all it takes.

The code lives on the web, the data stays on the machine. The page uploads nothing, and there is nowhere for it to upload to.

### Locally

Clone the repository, or download just the `App/` folder, then:

```
cd App
python -m http.server 8765
```

Open <http://localhost:8765>. Opening `index.html` through `file://` will not work, because the File System Access API needs a secure context. Any static server does the job when Python is unavailable — `npx http-server -p 8765`, for example.

## First-time setup

The first time the tool is pointed at a development project, choosing a folder for the task data is not the whole job: a few fields on the settings page need filling in as well. Two of them raise no error when skipped; they simply throw the agent's analysis off, which is why the walkthrough is worth following in full.

**The setup steps, what each field means, and a complete walkthrough of one card from creation to completion are in [App/README.md](App/README.md).**

## Languages

The interface language switches from the top right of the header.

The prompts given to the agent (`prompts/`) are English and exist as a single copy. That is the language of the **instructions**, unrelated to the language the agent writes in; output language is set separately on the settings page by typing a language name. The prompts themselves can also be rewritten there to carry whatever rules the project needs.

## Project layout

```
App/            the app itself (vanilla JS)
├── js/ebs.js       EBS statistics and work-calendar derivation (pure functions)
├── js/timer.js     timing and the interrupt-stack state machine (pure functions)
├── js/tasks.js     card data logic: sorting, id generation, status text (pure functions)
├── js/i18n.js      UI string dictionaries (Traditional Chinese / English) and t() (pure functions)
├── js/store.js     File System Access layer and prompt upgrade decisions
├── js/app.js       UI (sections refresh in place, no full-page redraw)
├── style.css       three themes (light / gray / dark) and layout
├── prompts/        rule books and templates for the agent (copied into the data folder on init)
└── prompt-changelog.md
Docs/
├── data-format.md  every JSON schema and rule (single source of truth)
└── design.md       design decisions as they stand, and the reasoning
```

## Tests

```
node --test "App/js/*.test.mjs"
```

Every pure function is covered. `style.css` has a set of static contract checks (the three themes must declare identical variable sets, each theme must declare `color-scheme`, no hard-coded colour literals), and `prompts/` has size budgets along with a file-list sync check. `app.js` only assembles DOM, so it gets a syntax check through `node --check App/js/app.js`.

No test framework is used, only Node's built-in `assert`.

## License

There is no LICENSE file, which means all rights are reserved. Republishing, redistribution, modification, and commercial use are not permitted without consent.

Reading, starring, and discussion through issues are all welcome.
