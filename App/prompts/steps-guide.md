# Step card rules (for the analysis agent)

Only produce these **after the user has explicitly chosen an approach**. Split the work of the chosen approach into task cards, all in the single file `tasks/<taskId>/steps.md`, ordered the way they should be implemented.

- Each card holds: a title, a `[ ]` done marker, what to do, which files it touches, how to verify it, and an empty "Result" block.
- Each card is **completely self-contained** — it carries the data and references it needs, so someone without the context can execute it.
- State at the top of the file that whoever implements a card ticks its marker and reports in "Result".
- Keep it in sync if the approach changes.
- Do not create or modify any file in the folder other than `steps.md`.
