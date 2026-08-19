# Agentic EBS — Web App

[繁體中文](README.zh-Hant.md)

A single static page; the data lives in a local folder you choose.

## How to run

1. Hosted: <https://bwaynesu.github.io/agentic-ebs/> — open it in Chrome or Edge, that is all.

2. Local: clone the repo, or download the `App/` folder on its own

```
cd App
python -m http.server 8765
```

Open <http://localhost:8765>. The File System Access API needs a secure context. Without Python any static server does, e.g. `npx http-server -p 8765`.

Notes:
- Chrome or Edge only (nothing else supports the File System Access API)
- The tool calls no API of its own; you supply an AI agent that runs in your project directory
- Until twenty or so cards have accumulated, expect the distribution to come out wide

## First run

- **Create the task data folder**: make a new folder inside your development project and hand it to "Pick task data folder" in the header; its contents are initialised for you.
- **Where to put it**: inside the development project is the easier choice, since most CLI agents will not reach outside their working directory; the price is remembering to add the folder to `.gitignore`.
- **Set the relative path**: "Relative path from your project root" on the settings page tells the agent how to reach the folder. Get it wrong and the agent will go looking for the folder inside the project by itself.
- **Set the Git user name**: also on the settings page, used by the agent to look up the developer's past commits.

### Task data folder examples
| Agent's working directory | Folder location | Relative path |
|---|---|---|
| `~/code/MyGame` | `~/code/MyGame/ebs-data` | `./ebs-data` |
| `~/code/MyGame` | `~/code/MyGame/docs/ebs-data` | `docs/ebs-data` |
| `~/code/MyGame` | `~/code/ebs-data` | `../ebs-data` (the agent needs access to the parent directory) |

## The task page

The left rail shows where the card stands, the middle holds the content, and the prompt button for the current stage is filled in.

- **The clock starts when the requirement is being written**: clarifying what is wanted is part of the card's work.
- **The more detailed the requirement, the better everything downstream**
- **The agent stops once on the way**: having worked through the requirement, it lists its assumptions and open questions, and only continues to approaches and estimates once those are confirmed.
- **Wrap-up is still working time**: leave it outside the timed intervals and velocity comes out optimistic.
- **Interrupted? Start another card**: the old card steps aside on its own and resumes once the urgent one is finished. A meeting or an errand is not a reason to stop the clock.

## Analysis and implementation can be separate agents

Each stage has its own rule book (`analyze-task.md`, `steps-guide.md`, `implement.md`), so a different agent can pick up the stages that follow.

- **Mind the context**: by the step-card stage the analysing agent is carrying the whole requirement discussion, and there is not much room left for implementing.
- **A clean agent stays focused**: step cards are independent and can be taken one at a time, so the implementing agent need not read the discussion, or the cards before it.
- **Judgement stays uncontaminated**: if the implementation drifts, the analysing agent is still there to talk to, with a view the implementation details have not shaped.

## How work hours are counted

Only the part of an interval falling inside the working window counts; nights and days off count zero. The window comes from the working hours, workdays and breaks on the settings page.

- **The work calendar overrides single days**: and it applies retroactively to the hours and velocity already counted for that day.
- **The one exception outside the window**: press "Start" or "Complete" outside it and the tool asks whether to include that stretch.

With 09:00–18:00 and a 12:00–13:00 lunch break:

| Situation | Hours counted | Confirmation |
|---|---|---|
| Start 12:30, complete 18:00 | 5 (13:00–18:00) | Asks about 12:30–13:00 |
| Start 11:00, complete 14:00, clock left running over lunch | 2 (11–12, 13–14) | No, the break sits in the middle |
| Start 21:00, complete 23:00 | 0 | Asks about the whole two hours |
| Start Friday 17:00, stopped Monday 10:00 | 2 (Fri 17–18, Mon 9–10) | No, the weekend sits in the middle |

- **Only the days worth asking about**: the home page lists past days that overlap a timed interval and are not yet confirmed.
- **Confirmation has an order**: settle the day's real working hours first, then rule on the time outside the window. Change the window afterwards and those rulings have to be made again.
- **The cost of leaving days unconfirmed**: nothing is blocked, but a finished card spanning them stays out of the velocity pool, and the card says why.

## When to correct a timed interval

"Time log" lets you edit or delete any finished interval, and add new ones by hand. The running one cannot be edited: press "Complete" first, then "Restart" once the edit is done.

- **Do correct a recording error**: forgetting to press start, leaving the clock on overnight or over a weekend, pressing start without actually beginning.
- **Do not correct real inflation**: meetings, a colleague stopping by, an errand that came up. Catching that inflation is exactly what velocity is for.
- **The test is whether you were there**: away (asleep, off work, forgot to stop the clock) is a recording error; present but occupied by something else stays.
- **Something big enough to track on its own**: give it a card. The old one steps aside and the hours land where they belong.

## Task tags

- **What tags are for**: they let the next analysis lean on similar past tasks, and have no effect on the estimate.
- **Use your own vocabulary**: the list lives in "② Analysis rules (analyze-task.md)" on the settings page — a game project might use `gameplay`, `shader`, `level-design`.
- **Keep the set fixed**: do not let the agent invent tags each time. Write one concept as both `frontend` and `front-end` and similarity matching quietly stops working.

## Prompts

- **Customise them**: every prompt file can be edited on the settings page.
- **Upgrades leave your edits alone**: each file is compared by content hash and only untouched files update themselves; a file you have edited is flagged on the settings page as having a new version available.

## Languages

- **The language of the instructions**: the prompts in `prompts/` are English and there is only one copy, though you are free to rewrite them on the settings page.
- **The language of the output**: "Output language" on the settings page takes a language name (`繁體中文`, `日本語`, whichever; empty means English), and copying a prompt appends that instruction for the agent.
- **Why it lives in the folder**: interface language and theme stay in the browser and do not follow you to another machine; the output language decides what gets written into the folder, and that should be the same everywhere, or one folder ends up holding a history in two languages.
