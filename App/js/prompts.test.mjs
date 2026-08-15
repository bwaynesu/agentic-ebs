// prompts.test.mjs — the contract for the prompt files: size budgets, list sync, cross references.
//
// Why there are size budgets at all: these prompts are read by **the user's** agent, so every
// word eats into its context, and that model may have a very small window. A prompt file is
// also the easiest place to casually append one more line — two lines per session and it has
// tripled in half a year, with nothing along the way to warn you (the agent never complains,
// it just gets dumber).
// Reminders do not hold that line, so this follows the same approach the project uses against
// CSS regressions: turn the rule into a test that goes red.
//
// **When a file goes over budget, the fix is to cut before you add, not to raise the cap.**
// The caps already leave room, so hitting one means that file is growing. If something really
// must be added (a new phase, say), raising the cap is a decision **you have to justify**,
// not a routine test repair.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { TAG_CODES, AGENT_FIELDS } from "./tasks.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bytes = (p) => Buffer.byteLength(read(`../prompts/${p}`), "utf8");

// Caps sit about 15–20% above current size: adding a rule or two never misfires, pasting in a
// whole section always goes red.
const BUDGET = {
  "template.md": 400,
  "analyze-task.md": 4000,
  "steps-template.md": 400,
  "steps-guide.md": 900,
  "implement.md": 1000,
  "wrap-up-template.md": 400,
  "wrap-up-guide.md": 1400,
};
// 7500 → 8000: the source language moved from Chinese to English, and the same set of rules
// grew from 6649 to 7495 bytes (+13%). Nothing was added — the language changed, since a
// Chinese character costs 3 bytes but carries more meaning. **This is the kind of adjustment
// that comes with a reason**, not one made to turn the test green. No per-file cap moved, and
// all of them still have room; leaving the total at 7500 would give 5 bytes of headroom, where
// a one-word edit goes red. That is noise, not signal.
const TOTAL_BUDGET = 8000;

// 1. Per-file budget
let total = 0;
for (const [name, cap] of Object.entries(BUDGET)) {
  const size = bytes(name);
  total += size;
  assert.ok(
    size <= cap,
    `prompts/${name} is ${size} bytes, over its budget of ${cap}. Delete a repeated sentence before adding a new rule — ` +
      `the user's agent has to read this, so raising the cap eats their context directly.`
  );
}
assert.ok(total <= TOTAL_BUDGET, `prompts total ${total} bytes, over ${TOTAL_BUDGET}`);

// 2. List sync: the files under prompts/ and PROMPT_FILES in store.js must match one to one.
//    A missing registration means the new file never gets copied into the user's folder (the
//    agent cannot read it, and there is no error message at all).
const listed = [...read("./store.js").matchAll(/"prompts\/([^"]+)"/g)].map((m) => m[1]);
const onDisk = readdirSync(new URL("../prompts/", import.meta.url)).filter((f) => f.endsWith(".md"));
assert.deepEqual(
  [...listed].sort(),
  [...onDisk].sort(),
  "PROMPT_FILES in store.js does not match the files under App/prompts/ (a new prompt file has to be registered too)"
);
assert.deepEqual([...new Set(Object.keys(BUDGET))].sort(), [...onDisk].sort(), "every prompt file needs a budget");

// 3. Cross references: the guide a template tells the agent to read has to exist.
//    Templates never restate the rules, they only give the file name (a restatement is
//    guaranteed to drift from the original), so a wrong name deletes that whole rule set.
for (const name of onDisk) {
  for (const [, ref] of read(`../prompts/${name}`).matchAll(/prompts\/([\w-]+\.md)/g)) {
    assert.ok(onDisk.includes(ref), `prompts/${name} points at prompts/${ref}, which does not exist`);
  }
}

// 4. The tag list: the codes in analyze-task.md must be exactly TAG_CODES.
//    These are two ends of one thing — the prompt decides what the agent writes into task.json,
//    TAG_CODES decides whether the UI can translate it. Change one and forget the other and the
//    symptom is an untranslated code appearing on screen, which you only see after the next
//    analysis run.
//    The punctuation of the list is deliberately not parsed: whether the separator is a comma
//    or something else changes with the source language, so relying on it would be brittle.
//    Instead the check runs in both directions, neither of which depends on language:
const analyze = read("../prompts/analyze-task.md");
// (a) Every code has to appear in the prompt. A missing one means the agent will never use that category.
for (const code of TAG_CODES) {
  assert.ok(analyze.includes(`\`${code}\``), `analyze-task.md does not list the tag code ${code}`);
}
// (b) The prompt must not contain hyphenated codes outside TAG_CODES. This catches "added a new
//     category without registering it" — such a tag reaches task.json and the UI can only show
//     the raw code.
//     File names (`steps-guide.md`) end in .md and fall outside this pattern, so they are not flagged.
const hyphenated = [...analyze.matchAll(/`([a-z]+(?:-[a-z]+)+)`/g)].map((m) => m[1]);
const strayTags = hyphenated.filter((x) => !TAG_CODES.includes(x));
assert.deepEqual(strayTags, [], `analyze-task.md contains unregistered tag codes: ${strayTags}`);
// 5. The "prompts/ is English only" check lives in source-language.test.mjs, together with the
//    same rule for the rest of the source. It used to sit here and only looked for Chinese, which
//    would have let a Japanese or Korean sentence through.

// 6. Writable fields of task.json: `AGENT_FIELDS` and analyze-task.md have to be the same list.
//    Two ends of one thing again — the prompt decides what the agent will write, the code
//    decides what we tolerate. Changing one and forgetting the other has no symptom at all: the
//    agent keeps following the old rules, and you find out when some field arrives corrupted
//    (this has happened: status was written as a value that does not exist, and the card grew no
//    buttons from then on) — by which point the data is already dirty.
for (const f of AGENT_FIELDS) {
  assert.ok(analyze.includes(`\`${f}\``), `analyze-task.md does not list the agent-writable field ${f}`);
}

console.log("ALL PASS");
