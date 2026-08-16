// store.test.mjs — the prompt upgrade decision.
//
// The rest of store.js touches File System Access and cannot run under Node. But the call of
// **whether to overwrite the user's prompt** is a pure function, and it is the one place in
// this project where getting it wrong destroys user data irreversibly (an older version
// overwrote the whole set as soon as the version fell behind, silently wiping customised
// prompts). So it gets tested on its own.
import assert from "node:assert/strict";
import { promptDecision, parseChangelog, changelogFor, parseJSON, folderVerdict } from "./store.js";

const OURS = (hash, version) => ({ hash, version });
const OBSERVED = (hash, version) => ({ hash, version, observed: true });
const bundled = { hash: "NEW", version: "13" };

// 1. The file is not in the folder yet → just write it (new folder, or we added a prompt file)
assert.equal(promptDecision(undefined, null, bundled), "write");
assert.equal(promptDecision(OURS("OLD", "12"), null, bundled), "write");

// 2. The content already matches the latest default → nothing to do (only fix up the record)
assert.equal(promptDecision(undefined, "NEW", bundled), "insync");
assert.equal(promptDecision(OBSERVED("NEW", "12"), "NEW", bundled), "insync");

// 3. We wrote it and the user never touched it → follow the new version
assert.equal(promptDecision(OURS("OLD", "12"), "OLD", bundled), "write");

// 4. **Never overwrite something the user edited** (getting this wrong is data loss, not a rough edge)
assert.equal(promptDecision(OURS("OLD", "12"), "MINE", bundled), "notify");
assert.notEqual(promptDecision(OURS("OLD", "12"), "MINE", bundled), "write");

// 5. User edited it, but there is no new version to offer → stay quiet (telling someone who just
//    finished editing their prompt that it "differs from the default" is noise)
assert.equal(promptDecision(OURS("OLD", "13"), "MINE", { hash: "NEW", version: "13" }), "keep");

// 6. Files that existed before we started keeping records: origin unknown, so never overwrite,
//    and **always ask once**. Rule 5's "no new version, no comment" cannot apply here — observed
//    means precisely "we do not know who wrote this", and staying silent because the versions
//    happen to match leaves that record unresolved forever (hit for real in a test folder).
assert.equal(promptDecision(OBSERVED("X", "12"), "X", bundled), "notify");
assert.equal(promptDecision(OBSERVED("X", "13"), "X", { hash: "NEW", version: "13" }), "notify");
// An observed hash matching the current file still does not make it ours to overwrite
assert.notEqual(promptDecision(OBSERVED("X", "12"), "X", bundled), "write");
// But if the observed content already equals the bundled default, there is nothing to ask about
assert.equal(promptDecision(OBSERVED("NEW", "12"), "NEW", bundled), "insync");

// 7. No record at all but a file exists (syncPrompts should have added one first; this guards
//    the case anyway) → do not overwrite
assert.equal(promptDecision(undefined, "X", bundled), "notify");
assert.notEqual(promptDecision(undefined, "X", bundled), "write");

// 8. Only those two outcomes may touch the user's files; everything else leaves them alone
for (const [record, cur] of [
  [OURS("OLD", "12"), "MINE"],
  [OBSERVED("X", "12"), "X"],
  [undefined, "X"],
  [OURS("OLD", "13"), "MINE"],
]) {
  assert.notEqual(promptDecision(record, cur, bundled), "write", `${JSON.stringify(record)} / ${cur} must not be overwritten`);
}

// 12. State after "keep my version": the record stores **the bundled content that was declined**,
//     with the version stamped to the current one. The result has to be keep (quiet, so the
//     notification can go away) and **never write** — had we recorded the user's current content
//     instead, that would declare it as ours and the next upgrade would overwrite their edits.
const declined = OURS("NEW", "13"); // hash = the bundled content they turned down
assert.equal(promptDecision(declined, "MINE", { hash: "NEW", version: "13" }), "keep");
assert.notEqual(promptDecision(declined, "MINE", { hash: "NEW", version: "13" }), "write");
// A newer version means asking again — they declined that one release, not every future change
assert.equal(promptDecision(declined, "MINE", { hash: "NEWER", version: "14" }), "notify");

// ---------- changelog ----------

const CHANGELOG = `# Prompt changelog

The preamble is not an entry and must not be swallowed.

## 13
- \`analyze-task.md\` — added a principle
- \`implement.md\` — changed the reporting format

## 12
- \`analyze-task.md\` — tags became codes

> Nothing was recorded before 12.
`;

// 9. Parsing: only entries under a `## version` heading that start with a backticked file name
//    count; the preamble and the block quote do not
const parsed = parseChangelog(CHANGELOG);
assert.deepEqual(
  parsed.map((e) => `${e.version}:${e.file}`),
  ["13:analyze-task.md", "13:implement.md", "12:analyze-task.md"]
);
assert.equal(parsed[0].text, "added a principle");

// 10. Failing to parse must not throw — missing changelog notes are a shame, an exception
//     during the connect flow is a disaster
assert.deepEqual(parseChangelog(""), []);
assert.deepEqual(parseChangelog(null), []);
assert.deepEqual(parseChangelog("a paragraph in nothing like this format"), []);

// 11. Pick out the changes after a baseline version, **per file**: when the user has edited only
//     one file the others were upgraded automatically long ago, so each file starts from a
//     different point.
assert.deepEqual(changelogFor(parsed, "prompts/analyze-task.md", "12").map((e) => e.version), ["13"]);
assert.deepEqual(changelogFor(parsed, "prompts/analyze-task.md", "11").map((e) => e.version), ["13", "12"]);
assert.deepEqual(changelogFor(parsed, "prompts/implement.md", "12").map((e) => e.version), ["13"]);
assert.deepEqual(changelogFor(parsed, "prompts/steps-guide.md", "11"), [], "an untouched file must not be annotated with someone else's notes");
// Unknown origin (baseVersion null) → list everything, since we cannot tell where they fell behind
assert.deepEqual(changelogFor(parsed, "prompts/analyze-task.md", null).map((e) => e.version), ["13", "12"]);
// A non-numeric version must not throw either
assert.deepEqual(changelogFor(parsed, "prompts/analyze-task.md", "beta").map((e) => e.version), ["13", "12"]);

// 12. Tolerance when reading JSON. These files are written by **the user's agent** with all
//     kinds of tooling: an estimate.json carrying a BOM makes JSON.parse throw, and reading
//     that as "no estimate" makes the card vanish from the velocity pool while the detail page
//     sits on "waiting for the agent" — no symptom at all (this has happened).
//     Two fixtures below start with a real, invisible BOM (U+FEFF). That is the point of the
//     test, so do not "clean up" those string literals.
assert.deepEqual(parseJSON('﻿{"a":1}'), { a: 1 }, "the BOM has to be stripped");
assert.deepEqual(parseJSON('{"a":1}'), { a: 1 });
assert.equal(parseJSON(null), null, "missing file");
assert.equal(parseJSON(""), null, "empty file");
assert.equal(parseJSON("   \n"), null, "whitespace only");
assert.equal(parseJSON("{broken"), undefined, "broken JSON must stay distinguishable from a missing file so it can be logged");
assert.equal(parseJSON("﻿"), null, "a lone BOM is an empty file, not a broken one");

// 13. What kind of folder was picked. Answering the picker with the development project itself is
//     the expensive first-run mistake: ensureInit then writes settings.json, calendar.json,
//     prompts/ and tasks/ into the project root, usually under version control.
assert.equal(folderVerdict([]), "empty");
assert.equal(folderVerdict(["settings.json", "calendar.json", "prompts", "tasks"]), "ours");
assert.equal(folderVerdict(["tasks"]), "ours", "a folder mid-init still belongs to us");
assert.equal(folderVerdict([".git", "package.json", "src", "node_modules"]), "foreign");
assert.equal(folderVerdict([".git", "Assets", "ProjectSettings"]), "foreign", "no marker list: any non-empty folder without our files is foreign");
// A data folder living inside a project keeps its own markers, so it is still ours
assert.equal(folderVerdict(["settings.json", ".git"]), "ours");

console.log("ALL PASS");
