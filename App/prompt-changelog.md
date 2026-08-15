# Prompt changelog

Add a section at the top whenever you bump `BUNDLED_PROMPT_VERSION`. `version.test.mjs` checks that the current version has one.

Format (the app parses it to show each file's relevant changes — do not improvise): `## <version>`, then one bullet per file starting with `` `filename` ``. After the dash, write **why** it changed — the user decides whether to take the new version from that sentence, so "updated wording" says nothing.

This file lives in the App only and is never copied into a user's data folder: it grows forever, and it would have the same upgrade problem the prompts have. It also deliberately sits outside `prompts/`, whose invariant is that every file in it gets copied to the user (pinned by `prompts.test.mjs`).

## 14

- `analyze-task.md` — spells out that only the three named fields of `task.json` may be written. An agent wrote `status: "completed"` (not a value the app has), which left the card with no buttons at all and kept it out of the velocity pool, with nothing on screen saying why. Take this version if you let agents rewrite `task.json`.

## 13

English is now the single source of truth for prompts; there is no Chinese version any more. The rules did not change in this version, only the language. One bullet per file below because the app attributes each line to the file it names.

- `analyze-task.md` — translated to English. The rules are unchanged, but note the knock-on effect: a prompt's language decides what language the agent writes `understanding.md`, `approaches.md` and the rest in, so new task documents will be in English from now on.
- `template.md` — translated to English.
- `steps-template.md` — translated to English.
- `steps-guide.md` — translated to English.
- `implement.md` — translated to English.
- `wrap-up-template.md` — translated to English.
- `wrap-up-guide.md` — translated to English.

## 12

- `analyze-task.md` — tags changed from Chinese strings to stable codes (`frontend-ui` and friends), and the agent is told to write them verbatim. The Chinese strings doubled as both display text and the key for "find similar past tasks", so a prompt in another language would have written a second vocabulary into the same folder and the matching would have silently stopped working.

> Nothing before 12 was recorded.
