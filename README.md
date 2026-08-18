# Agentic EBS

[繁體中文](README.zh-Hant.md)

> Use the hours past work actually took as evidence for how long new work will take, instead of going by feel.

[Evidence Based Scheduling](https://www.joelonsoftware.com/2007/10/26/evidence-based-scheduling/) was proposed by Joel Spolsky in 2007. Agentic EBS hands its biggest friction — breaking the work down and estimating it — to an AI agent, records the hours itself, and feeds the accumulated history back to correct the agent's estimates.

**Try it: <https://bwaynesu.github.io/agentic-ebs/>**  
- A static page that runs locally, with its data in a folder on your machine
- No backend, no framework, no build step, nothing sent anywhere
- Chrome or Edge only
- The tool calls no API of its own; bring an AI agent that can run inside your project directory

## How it works

```
1. Create a card, start the timer
2. Write the requirement
3. Hand it to the agent (understanding / approaches / estimated hours)
4. Pick an approach
5. The agent breaks it into implementation step cards
6. Implement
7. The agent writes the wrap-up documents
8. Stop the timer, mark it complete
```

Write the requirement on the task page and it hands you a prompt to copy. Paste it into any agent that can run inside your project directory; the agent reads your source, your git log, and your past task cards, then produces:

- `understanding.md` — its reading of the requirement, the assumptions it made, the questions still open
- `approaches.md` — several approaches, each detailed down to which file changes, which function is added, which setting moves
- `estimate.json` — ideal hours for each approach

Once you pick an approach, the agent breaks it into step cards that can be picked up independently. When the implementation settles, it writes the wrap-up documents from the **final code**: the final spec, how it differs from the original and why, and how the code works.

On completion, historical velocity (estimated ÷ actual) turns the ideal hours into P5 / P50 / P95.

## Design

EBS asks the developer to keep breaking work down, estimating it, and logging hours — which is exactly why it is hard to sustain. Here the first two go to the agent and the third to the tool.

Three deliberate decisions:

1. Correction is velocity's job, so the agent only estimates uninterrupted ideal hours and never corrects itself.
2. Meetings and other interruptions **do not pause the timer**. That inflation is the signal velocity exists to capture.
3. Urgent work uses an interruption stack: the hours always go to the card on top, with no manual bookkeeping on the timer of the card underneath.

## Open questions

Does the EBS assumption still hold once the estimator is no longer the developer but an agent plus a person reviewing it?

- `estimate.json` records `model` and `templateVersion`. Does switching models or rewriting the prompts amount to switching estimators?
- The step count in `steps.md` is an independent variable that is already there. Does a finer breakdown estimate better?
- Analysing a new card, the agent can read the history behind the old ones. Does that make the estimates more accurate, or only more confident?
- Once the pool is split by tag, does each distribution fit its own kind of work better?

## What I see so far

The data is still accumulating. Two effects that were never design goals:

1. Walking the task page top to bottom forces the problem to be stated before any code is written. That is what Joel's 16-hour rule is really for; the statistics are almost a side effect.

2. understanding, approaches, steps and the wrap-up documents all stay on the card, so months later you can still find out why that approach was chosen. A new card's analysis reads them too, which gives the agent a better picture of the project.

What has not paid off yet is the probability distribution: the tool computes **how long one card takes, not the delivery date of a batch of them**. That needs Monte Carlo to sum several cards (their risks cancel out); `ebs.monteCarlo()` is implemented and tested, but nothing calls it yet.

## Running it

1. Hosted: open <https://bwaynesu.github.io/agentic-ebs/> in Chrome or Edge.

2. Locally: clone the repo or just download the `App/` folder

```
cd App
python -m http.server 8765
```

Open <http://localhost:8765>. The File System Access API needs a secure context. Without Python, any static server works, for example `npx http-server -p 8765`.

Notes:
- Chrome or Edge only (Firefox and Safari have no File System Access API)
- The tool calls no API of its own; bring an AI agent that can run inside your project directory
- Below roughly twenty finished cards the distribution is wide, which is expected — it needs data before it means anything

## First-time setup

The first time you use it you pick the folder for the task cards and fill in a few fields on the settings page. See [App/README.md](App/README.md).

## Development

```
App/
├── js/ebs.js       EBS statistics and work-calendar derivation (pure functions)
├── js/timer.js     Timing and the interruption-stack state machine (pure functions)
├── js/tasks.js     Task-card data logic: sorting, ids, status text (pure functions)
├── js/i18n.js      UI string dictionaries (zh-Hant / en)
├── js/store.js     File System Access layer and prompt-upgrade decisions
├── js/app.js       UI (sections update in place; the page is never rebuilt)
├── style.css       Three themes (light / gray / dark) and layout
└── prompts/        Rulebooks and templates for the agent (copied into the folder on init)
Docs/data-format.md  Every JSON schema and rule (single source of truth)
Docs/design.md       The design decisions as they stand, and why
```

```
node --test "App/js/*.test.mjs"
```

Every pure function has tests, with no test framework — just Node's built-in `assert`. `style.css` (matching variable sets across the three themes, `color-scheme`, no hard-coded colors) and `prompts/` (size budgets, list sync) have static contract checks of their own. `app.js` only assembles DOM, so it is checked with `node --check App/js/app.js`.

## License

There is no LICENSE file yet, which means all rights reserved. Please do not redistribute, modify, or use it commercially without permission. Reading, starring, and discussion through issues are welcome.
