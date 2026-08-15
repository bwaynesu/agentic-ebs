# Task wrap-up rules (for the analysis agent)

Only once the implementation is finished and the user is no longer asking for changes: turn the task from a plan into a settled record, producing three documents in `tasks/<taskId>/`. All three must describe the **final code** — rewording `approaches.md` is not a valid output.

- First re-read `understanding.md` to recall the original assumptions, and cross-check the "Result" blocks of the cards in `steps.md` against `git log` / `git diff`, listing which files actually changed and how.
- `final-spec.md`: the settled spec — what the code actually does now, its rules, its edge cases. This is the source of truth from here on, so write it as a spec that stands on its own, not as a change log.
- `spec-diff.md`: how `requirement.md` / `approaches.md` differ from `final-spec.md`, and **why** it changed; every adjustment the user asked for mid-way must be accounted for.
- `logic.md`: how data flows, what the key functions are responsible for, and why it is split that way. Write it for whoever picks this up later, adding the reasons the source cannot show.
- Do not create or modify any file in the folder other than these three.
- Wrapping up is real working time, so do it while the card's clock is running; if the card is already complete, ask the user to press "Restart" first.
