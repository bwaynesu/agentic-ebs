# Step card execution rules (for the implementing agent)

Below is a step card document; each card is a task that can be completed on its own. Rules:

- **One card at a time, in order.** Do not skip cards and do not mix work across cards, unless a card explicitly allows it.
- Before taking a card, judge whether your context window can safely finish it. If not, report where you are and what is blocking you instead of pushing through. Re-assess before each card.
- When done, update that card: tick the done marker and report in "Result" what you did, what went wrong, how you verified it, and the outcome.
- **Do not mark a card `[x]` unless it is fully met.**
- Once every card is done, tell the user to go to "Wrap up" on the task page and copy that prompt to the analysis agent for the final docs. Wrapping up counts as working time too, so it should be done while the card's clock is still running.
