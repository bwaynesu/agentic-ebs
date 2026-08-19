// tasks.test.mjs — pure data logic for task cards (sorting / id generation / status wording)
import assert from "node:assert/strict";
import { setLocale, DEFAULT_LOCALE } from "./i18n.js";
import {
  statusLabel,
  statusColor,
  tagLabel,
  migrateTags,
  TAG_CODES,
  AGENT_FIELDS,
  sortTasks,
  sanitizeTitle,
  nextTaskId,
  newTask,
  formatClock,
  hasOpenInterval,
  axisTicks,
  axisMax,
  formatHours,
  hasRequirement,
  promptLangLine,
  currentPhase,
  filesChanged,
  repairStatus,
  splitSections,
  matchApproach,
  pagesToShow,
  sameView,
} from "./tasks.js";

// 1. Status wording: a known status gets translated, an unknown one is shown as-is (never swallowed).
//    The expected string is the zh-Hant dictionary value under the default locale, so it stays
//    in Chinese — translating it here would stop checking the dictionary.
assert.equal(statusLabel("done"), "已完成");
assert.equal(statusLabel("weird"), "weird");

// 1b. Tags are codes; translation happens only on display. An unrecognised value is shown
//     verbatim — a user's own tag must not be swallowed, and we must not print an i18n key
//     like `tag.xxx` either.
//     Both expected strings have to be Chinese: "前端UI" is the zh-Hant dictionary value, and
//     "我自己加的" ("one I added myself") is a user-defined tag, which is exactly the case where
//     a non-ASCII value must survive untouched in every locale.
assert.equal(tagLabel("frontend-ui"), "前端UI");
assert.equal(tagLabel("我自己加的"), "我自己加的");
setLocale("en");
assert.equal(tagLabel("frontend-ui"), "Frontend UI");
assert.equal(tagLabel("我自己加的"), "我自己加的", "a custom tag is shown as-is in every locale");
setLocale(DEFAULT_LOCALE);
// Every code in the list must have display wording (a missing one leaks the raw code onto the screen)
for (const code of TAG_CODES) assert.notEqual(tagLabel(code), code, `${code} has no display wording`);

// 1c. One-off mapping for the Chinese tags in older folders; anything outside the table is kept
//     as-is, and re-running changes nothing (the migration is re-entrant).
//     These inputs are the actual keys of the legacy mapping table, so they must stay in Chinese.
assert.deepEqual(migrateTags(["前端UI", "基礎建設"]), ["frontend-ui", "infrastructure"]);
assert.deepEqual(migrateTags(["我自己加的"]), ["我自己加的"]);
assert.deepEqual(migrateTags(migrateTags(["前端UI"])), ["frontend-ui"], "migration must be re-entrant");
assert.deepEqual(migrateTags(undefined), [], "a missing tags field must not throw");

// 2. Sorting: active → interrupted → estimated → draft → done; newest first within a status
const order = sortTasks([
  { id: "done", status: "done", createdAt: "2026-01-01" },
  { id: "draft", status: "draft", createdAt: "2026-01-01" },
  { id: "old-active", status: "active", createdAt: "2026-01-01" },
  { id: "new-active", status: "active", createdAt: "2026-02-01" },
  { id: "interrupted", status: "interrupted", createdAt: "2026-01-01" },
  { id: "estimated", status: "estimated", createdAt: "2026-01-01" },
]).map((t) => t.id);
assert.deepEqual(order, ["new-active", "old-active", "interrupted", "estimated", "draft", "done"]);

// 3. Title to folder name: drop characters illegal in file names, spaces become hyphens, and
//    fall back to something when everything gets stripped.
//    The first case keeps its Chinese on purpose: it is what proves non-ASCII titles survive
//    instead of being stripped along with the illegal characters.
assert.equal(sanitizeTitle("修 A/B 測試"), "修-AB-測試");
assert.equal(sanitizeTitle('  a:b*c?d"e<f>g|h  '), "abcdefgh");
assert.equal(sanitizeTitle("///"), "task", "there has to be a fallback, an empty folder name is not acceptable");
// A trailing dot makes the folder unreachable: Windows strips it from every path it resolves, so
// cmd and PowerShell look for a name that is not there, and Chrome refuses to create it at all.
assert.equal(sanitizeTitle("0."), "0", "case 3: a trailing dot has to go, the folder would be unreachable from a shell");
assert.equal(sanitizeTitle("fix ."), "fix", "case 3: the hyphen left by the collapsed space goes with it");
assert.equal(sanitizeTitle("..."), "task", "case 3: a title of nothing but dots still needs a folder name");
// Dots elsewhere are untouched: version numbers and file names in a title are ordinary and work
assert.equal(sanitizeTitle("v1.2 fix"), "v1.2-fix");
assert.equal(sanitizeTitle("update README.md"), "update-README.md");

// 4. Id generation: date-title, walking forward past collisions (including runs of them).
//    Chinese title again on purpose — task ids become real folder names, so a CJK title has to
//    survive into the id intact.
assert.equal(nextTaskId("重構", "2026-07-21", []), "2026-07-21-重構");
assert.equal(nextTaskId("重構", "2026-07-21", ["2026-07-21-重構"]), "2026-07-21-重構-2");
assert.equal(
  nextTaskId("重構", "2026-07-21", ["2026-07-21-重構", "2026-07-21-重構-2", "2026-07-21-重構-3"]),
  "2026-07-21-重構-4"
);
assert.equal(nextTaskId("重構", "2026-07-21", ["2026-07-21-其他"]), "2026-07-21-重構", "unrelated ids have no effect");

// 5. Fields of a new card: starts as draft, empty time track, agent fields left blank
//    (schema lives in Docs/data-format.md)
const t = newTask("2026-07-21-x", "x", "2026-07-21T00:00:00.000Z");
assert.equal(t.status, "draft");
assert.deepEqual(t.intervals, []);
assert.equal(t.selectedApproach, null);
assert.equal(t.interruptedBy, null);
assert.equal(t.completedAt, null);
assert.equal(t.createdAt, "2026-07-21T00:00:00.000Z");

// 6. Status colors are always CSS variables (values live in the three themes in style.css),
//    with a fallback for unknown statuses
assert.equal(statusColor("active"), "var(--accent)");
assert.equal(statusColor("done"), "var(--text-faint)");
assert.equal(statusColor("weird"), "var(--border-strong)", "an unknown status must not produce var(undefined)");

// 7. formatClock: H:MM:SS, zero-padded minutes and seconds, safe for 0 and negatives
assert.equal(formatClock(0), "0:00:00");
assert.equal(formatClock(1.5), "1:30:00");
assert.equal(formatClock(0.0025), "0:00:09");
assert.equal(formatClock(25.75), "25:45:00", "past a day it keeps counting hours instead of rolling into days");
assert.equal(formatClock(-1), "0:00:00", "the clock never runs backwards");

// 8. hasOpenInterval: only an interval whose end is null counts as running
assert.equal(hasOpenInterval({ intervals: [{ start: "T1", end: null }] }), true);
assert.equal(hasOpenInterval({ intervals: [{ start: "T1", end: "T2" }] }), false);
assert.equal(hasOpenInterval({ intervals: [] }), false);
assert.equal(hasOpenInterval({}), false, "a missing intervals field must not throw");

// 9. axisTicks: round numbers, at most 5 of them, never touching 0 or the upper bound
assert.deepEqual(axisTicks(10), [2, 4, 6, 8]);
assert.deepEqual(axisTicks(40), [10, 20, 30]);
assert.deepEqual(axisTicks(100), [20, 40, 60, 80]);
assert.deepEqual(axisTicks(1), [0.2, 0.4, 0.6, 0.8], "small magnitudes need tidy ticks too");
assert.deepEqual(axisTicks(0), [], "no upper bound means no ticks");
assert.deepEqual(axisTicks(-5), [], "a negative bound counts as no ticks");
for (const max of [3, 7, 13, 27, 64, 150, 999, 1234]) {
  const ticks = axisTicks(max);
  assert.ok(ticks.length <= 5, `axisTicks(${max}) returned ${ticks.length} ticks, more than 5`);
  assert.ok(ticks.every((t) => t > 0 && t < max), `axisTicks(${max}) has ticks outside the bounds: ${ticks}`);
  assert.ok(
    ticks.every((t) => String(t).replace("-", "").replace(".", "").replace(/0+$/, "").length <= 3),
    `axisTicks(${max}) produced floating point noise: ${ticks}`
  );
}

// 10. formatHours: below one working day, skip the "about 0.0 days" parenthetical that says nothing.
//     The expected strings are zh-Hant dictionary output (full-width brackets included), so they
//     stay in Chinese.
assert.equal(formatHours(0.2, 8), "0.2h", "0.2h should not be shown as about 0.0 days");
assert.equal(formatHours(7.9, 8), "7.9h", "under a day, no day count");
assert.equal(formatHours(8, 8), "8.0h（約 1.0 天）", "exactly one day is where it starts showing");
assert.equal(formatHours(20, 8), "20.0h（約 2.5 天）");
assert.equal(formatHours(5, 0), "5.0h", "a capacity of 0 (no workdays configured) must not divide by zero");

// 11. axisMax: round the axis bound up to a whole multiple of the tick step, so the axis does
//     not end on a number like 1.7
assert.equal(axisMax(1.7), 2, "step 0.5 → rounds up to 2");
assert.equal(axisMax(45), 50, "step 10 → rounds up to 50");
assert.equal(axisMax(10), 10, "already a multiple, leave it alone");
assert.equal(axisMax(0), 0, "no data means 0");
for (const max of [0.3, 1.7, 3, 7, 13, 27, 64, 150, 999]) {
  const top = axisMax(max);
  assert.ok(top >= max, `axisMax(${max})=${top} must not be below the original bound`);
  const ticks = axisTicks(top);
  assert.ok(ticks.every((t) => t < top), `the ticks of axisMax(${max}) must not touch the bound`);
  const step = ticks[0];
  if (step) assert.ok(Math.abs(top / step - Math.round(top / step)) < 1e-9, `axisMax(${max})=${top} is not a whole multiple of the tick step ${step}`);
}

// 12. Whether a requirement has been written: empty string, whitespace only and null all count as
//     empty. requirement.md starts out as an empty string, so writing the check as === null would
//     mean the reminder never appears — silent and error-free, hence pinned by a test.
assert.equal(hasRequirement(null), false);
assert.equal(hasRequirement(undefined), false);
assert.equal(hasRequirement(""), false);
assert.equal(hasRequirement("  \n\t "), false);
assert.equal(hasRequirement("we need to build a thing"), true);
assert.equal(hasRequirement("  content padded with spaces  "), true);

// 13. Splitting the approach analysis: the agent is not guaranteed to follow the format, so every
//     fallback gets pinned down. When it cannot cut two sections it has to return the whole thing
//     as one, so the UI falls back to a single block instead of showing broken fragments.
const twoApproaches = `# Approach analysis

one line of preamble

## Approach a1: client-side filtering only (recommended)

step one
step two

## Approach a2: persist into settings

step one`;
const secs = splitSections(twoApproaches);
assert.equal(secs.length, 3, "preamble plus two approaches");
assert.equal(secs[0].title, null, "the preamble before the first heading must be kept, not swallowed");
assert.match(secs[0].body, /one line of preamble/);
assert.equal(secs[1].title, "Approach a1: client-side filtering only (recommended)");
assert.match(secs[1].body, /step two/);
assert.equal(secs[2].title, "Approach a2: persist into settings");

assert.deepEqual(splitSections(null), [], "no file means no sections");
assert.deepEqual(splitSections("just one paragraph"), [{ title: null, body: "just one paragraph" }]);
assert.equal(splitSections("## only one approach\ncontent").length, 1, "a single ## is not a split, keep it as one piece");

// Headings written with a single # have to work too (fall back one level)
const oneHash = splitSections("# Approach a1\nalpha\n\n# Approach a2\nbravo");
assert.equal(oneHash.length, 2, "with no ## present, fall back to #");
assert.equal(oneHash[0].title, "Approach a1");

// A ## inside ``` is a code comment, not a heading — cutting there would slice the code block in half
const fenced = splitSections("## Approach a1\n```bash\n## this is a comment\necho hi\n```\n\n## Approach a2\nbravo");
assert.equal(fenced.length, 2, "a ## inside a code block is not a heading");
assert.match(fenced[0].body, /echo hi/);

// 14. Which section the selected approach belongs to: each section first works out which approach
//     it is (the first token in its title that belongs to the id list), then that is compared
//     against the selection; and it has to hit exactly one section.
const IDS = ["a1", "a2", "a3"];
const titles = [{ title: null }, { title: "Approach a1: alpha" }, { title: "Approach a2: bravo" }];
assert.equal(matchApproach(titles, "a2", IDS), 2);
assert.equal(matchApproach(titles, null, IDS), -1, "nothing selected means nothing marked");
assert.equal(matchApproach(titles, "a9", IDS), -1, "no match means no mark, never a guess");
assert.equal(
  matchApproach([{ title: "Approach a1" }, { title: "a variant of approach a1" }], "a1", IDS),
  -1,
  "if two sections both claim a1, mark neither — marking the wrong approach is worse than marking none"
);
assert.equal(
  matchApproach([{ title: "Approach a1" }, { title: "Approach a10" }], "a1", ["a1", "a10"]),
  0,
  "a1 must not also match a10 (substring comparison gets this wrong)"
);
// Agents love writing the a1 from estimate.json as an uppercase A1 in the heading; a
// case-sensitive check would leave the whole card unmarked
assert.equal(matchApproach([{ title: "Approach A1: alpha" }, { title: "Approach A2: bravo" }], "a1", IDS), 0);
assert.equal(matchApproach([{ title: "Approach A1" }, { title: "Approach A10" }], "a1", ["a1", "a10"]), 0);

// Hit for real: a3's heading read "a3 = a1 plus something". Searching the headings for an id makes
// a1 match two sections and nothing gets marked at all; taking the first id in each section
// assigns it to a3 correctly.
const cross = [
  { title: "a1 (recommended) three separate documents + a wrap-up prompt + a new detail-page section" },
  { title: "a2 folded into a single `summary.md` (three chapters)" },
  { title: "a3 a1 plus a cross-task index file" },
];
assert.equal(matchApproach(cross, "a1", IDS), 0, "a3 mentioning a1 in its heading must not stop a1 from being marked");
assert.equal(matchApproach(cross, "a3", IDS), 2);

// Match against the real id list rather than "things that look like numbering": Vue3 and H2 in a
// heading are not approach ids and must not be read as one
assert.equal(
  matchApproach([{ title: "Approach a1: upgrade to Vue3" }, { title: "Approach a2: switch to the H2 database" }], "a1", IDS),
  0
);
assert.equal(
  matchApproach([{ title: "replacing SQLite with H2, approach a1" }, { title: "Approach a2" }], "a1", IDS),
  0,
  "it still has to be found when the id is not at the start of the heading"
);

// 15. The user's agent ignoring the format must never break the page: the worst outcome is that
//     nothing splits and nothing is marked as selected. Throwing is not allowed (an exception
//     whites out the entire detail page). Pin down a range of malformed inputs in one go.
for (const bad of [
  "",
  "   ",
  "#noSpaceAfterTheHash",
  "###### a level six heading\ncontent",
  "```\n## a fence that is never closed\ncontent",
  "## \nthe title is empty",
  "one big blob with no heading at all\nsecond line",
  "## a1\n## a1\nduplicate headings",
]) {
  const parts = splitSections(bad);
  assert.ok(Array.isArray(parts), `splitSections(${JSON.stringify(bad)}) must return an array`);
  assert.ok(parts.every((p) => typeof p.body === "string"), "every body must be a string for the UI to render it");
  // Ids come from the agent, so they may contain regex metacharacters or not be strings at all;
  // the comparison must not blow up on any of that
  for (const id of ["a1", "a(", "*", "", null, undefined]) {
    for (const ids of [undefined, [], ["a1", "a2"], [1, null]]) {
      const hit = matchApproach(parts, id, ids);
      assert.ok(hit === -1 || (hit >= 0 && hit < parts.length), "the returned index must be -1 or a valid index");
    }
  }
}

// 15b. A card with only one approach still has to show which one was adopted. Hit for real:
//      `# Feasible options` plus a single `## a1: …` cuts into one titled section, and the old
//      "at least two sections" rule read that as unsplittable, leaving the whole card uncoloured.
{
  const one = "# Feasible options\n## a1: add a field to BombItem\n### Concept\ncontent";
  const parts = splitSections(one, ["a1"]);
  assert.equal(parts.length, 2, "preamble plus one approach");
  assert.equal(parts[0].title, null, "the preamble section has to be kept, not swallowed");
  assert.equal(matchApproach(parts, "a1", ["a1"]), 1);
  // The version without even a preamble: one section, and that section is the approach itself
  const bare = splitSections("## a1: the only approach\ncontent", ["a1"]);
  assert.equal(bare.length, 1);
  assert.equal(matchApproach(bare, "a1", ["a1"]), 0);
  // A lone section with no id must not be split: splitting tucks the content into a collapsed
  // block, which amounts to hiding it
  const note = splitSections("preamble\n## extra notes\ncontent", ["a1"]);
  assert.equal(note.length, 1);
  assert.equal(note[0].title, null);
  // Two or more still split as before (when the agent leaves ids out of the headings there is
  // still one block per approach, it just cannot be marked as adopted)
  const noIds = splitSections("## Plan one: change A\ncontent\n## Plan two: change B\ncontent", ["a1", "a2"]);
  assert.equal(noIds.filter((p) => p.title !== null).length, 2);
  assert.equal(matchApproach(noIds, "a1", ["a1", "a2"]), -1);
  // Calling without ids has to keep working (older call sites, cards with no estimate.json)
  assert.equal(splitSections(one).length, 1, "with no ids to compare, fall back to counting sections");
}

// 16. Coming back to the list has to extend the done-card paging far enough to include the target.
//     Being one card short means it never scrolls there, with no error message at all, so the
//     boundaries (last card of a page, first card of the next) are each pinned down.
assert.equal(pagesToShow(0, 20), 20, "card 1: one page is enough");
assert.equal(pagesToShow(19, 20), 20, "card 20 is the last of page one, still one page");
assert.equal(pagesToShow(20, 20), 40, "card 21 needs the second page");
assert.equal(pagesToShow(39, 20), 40);
assert.equal(pagesToShow(40, 20), 60);
assert.equal(pagesToShow(-1, 20), 0, "a target that was not found (-1) must not go negative or expand everything");
// It only counts if slice(0, n) really contains the index
for (const i of [0, 1, 19, 20, 21, 57]) {
  const n = pagesToShow(i, 20);
  assert.ok(i < n, `pagesToShow(${i}) = ${n} does not include card ${i}`);
}

// 17. Only push history when the view actually changes. Getting this wrong is hard to diagnose:
//     too loose and identical entries pile up (the back button appears to do nothing), too strict
//     and a popstate repaint pushes another entry (back turns into forward).
assert.ok(sameView({ view: "list" }, { view: "list" }), "same list view: a repaint pushes nothing");
assert.ok(sameView({ view: "detail", id: "a" }, { view: "detail", id: "a" }));
assert.ok(!sameView({ view: "detail", id: "a" }, { view: "detail", id: "b" }), "a different card is a different view");
assert.ok(!sameView({ view: "list" }, { view: "detail", id: "a" }));
assert.ok(!sameView(null, { view: "list" }), "with no state yet, the first entry must always be pushed");
assert.ok(!sameView({ view: "list" }, null));
// history.state without an id field and an explicit id: null mean the same screen
assert.ok(sameView({ view: "list" }, { view: "list", id: null }));

// 18. The output-language instruction. An empty value must not produce a sentence (English users
//     should not pay for a line of context in every prompt), and a real value must keep both the
//     file names and the codes — without that half of the sentence the agent may translate the tag
//     codes, and tags are the key step 4 of analyze-task.md uses to find similar past tasks.
assert.equal(promptLangLine(""), "");
assert.equal(promptLangLine(null), "");
assert.equal(promptLangLine(undefined), "");
assert.equal(promptLangLine("   "), "", "whitespace only counts as unset");
const line = promptLangLine("  Japanese  ");
assert.ok(line.startsWith("\n\n"), "it has to be separated from the prompt above, not glued to the same paragraph");
assert.ok(line.includes("in Japanese."), `surrounding whitespace has to be trimmed: ${line}`);
assert.ok(/file names/i.test(line) && /tags/.test(line), "the 'do not translate file names or codes' half is missing");
// The language name is not restricted to English: a local name (even in a non-Latin script) has to
// pass through untouched, which is what this Japanese input checks
assert.ok(promptLangLine("日本語").includes("in 日本語."), "a language name in its own script must not be mangled");

// 19. Where the sidebar flow guide stops. It is decided by which artifacts exist, not by
//     task.status — a card just created and started right away is active with nothing in it, and
//     going by status would jump straight to the step card (this has happened).
const phase = (o) => currentPhase({ status: "active", hasReq: true, hasEstimate: false, selectedApproach: null, hasSteps: false, wrapNeeded: false, ...o });
// The first stop is the requirement: a brand new card has only a title, and pointing at "hand to
// the agent for analysis" there means pointing at a disabled button
assert.equal(phase({ status: "draft", hasReq: false }), "sec-req");
assert.equal(phase({ hasReq: false }), "sec-req", "case 19: a newly started card stops at the requirement, not the step card");
assert.equal(phase({}), "sec-analyze", "case 19: once the requirement is written it moves to analysis");
assert.equal(phase({ hasEstimate: true }), "sec-estimate", "case 19: an estimate moves it to choosing an approach");
// A card with only one approach still has to have it selected: the copy-step-card button is
// conditioned on selectedApproach regardless of how many approaches there are
// Picking and asking for the step cards are the same stop — both buttons are in the estimate
// section, so the card stays there until steps.md lands
assert.equal(phase({ hasEstimate: true, selectedApproach: "a1" }), "sec-estimate", "case 19: a picked approach with no step cards is still the estimate section, where the button lives");
assert.equal(phase({ hasEstimate: true, selectedApproach: "a1", hasSteps: true, wrapNeeded: true }), "sec-wrap");
assert.equal(phase({ hasEstimate: true, selectedApproach: "a1", hasSteps: true }), "sec-time", "case 19: with the wrap-up written, only timing is left");
// A done card always stops at timing: even missing a step card, it should not nag about earlier stages
assert.equal(phase({ status: "done" }), "sec-time");

// 20. What a broken status gets repaired to. The only evidence is the card's own data — the
//     original string is what the agent corrupted, so it cannot be trusted.
const bad = (o) => repairStatus({ intervals: [], interruptedBy: null, completedAt: null, ...o }, false);
assert.equal(bad({}), "draft");
assert.equal(repairStatus({ intervals: [] }, true), "estimated", "case 20: having an estimate means estimated");
assert.equal(bad({ completedAt: "T1" }), "done");
// An open interval outranks completedAt: a restarted card has both, but it really is running now
assert.equal(bad({ intervals: [{ start: "T1", end: null }], completedAt: "T0" }), "active");
assert.equal(bad({ intervals: [{ start: "T1", end: "T2" }], interruptedBy: "t2" }), "interrupted");
// Missing fields must not throw — any task.json that reaches this point is already corrupted
assert.equal(repairStatus({}, false), "draft", "case 20: missing intervals must not throw");

// 21. The task.json field list, pinned. **Adding a field will always turn this red, and that is
//     the point**: it forces you to decide first whether the new field is app-only or something
//     the agent can write (the writable list is AGENT_FIELDS in tasks.js). Agents writing junk
//     into fields has already happened (status was written as "completed"), and the symptom is
//     "something is missing from the screen" rather than an error, which is expensive to track down.
//     countOffHours is not here: it is written only when the user rules on off-hours work, and
//     newTask does not create it.
const FIELDS = [
  "id", "title", "tags", "status", "intervals", "planningIntervals",
  "selectedApproach", "interruptedBy", "model", "templateVersion", "createdAt", "completedAt",
];
assert.deepEqual(
  Object.keys(newTask("t1", "x", "T0")).sort(),
  [...FIELDS].sort(),
  "case 21: the task.json fields changed — decide whether the new field is app-only or agent-writable before updating this list"
);
assert.deepEqual(AGENT_FIELDS.filter((f) => !FIELDS.includes(f)), [], "case 21: AGENT_FIELDS lists a field task.json does not have");

// 22. The focus refresh's change detection. It compares two path -> lastModified snapshots; the
//     stakes are that a false negative means the page silently keeps showing stale files, and a
//     false positive redraws the card under someone who only alt-tabbed back.
const snap = { "tasks/t1/estimate.json": 100, "tasks/t1/steps.md": null };
assert.equal(filesChanged(snap, { ...snap }), false, "case 22: identical snapshots are not a change");
assert.equal(filesChanged(snap, { ...snap, "tasks/t1/estimate.json": 101 }), true);
// A file appearing is the change that matters most — estimate.json landing is the whole point
assert.equal(filesChanged(snap, { ...snap, "tasks/t1/steps.md": 500 }), true, "case 22: null -> a time is a file appearing");
// And disappearing counts too: the user may have deleted steps.md by hand to re-run the agent
assert.equal(filesChanged({ ...snap, "tasks/t1/steps.md": 500 }, snap), true);
// No baseline is not a change. Reporting one would redraw the page the first time the window is
// focused after opening any card, every time.
assert.equal(filesChanged(null, snap), false, "case 22: with no snapshot to compare against, nothing has changed");
assert.equal(filesChanged(snap, null), false, "case 22: a failed read must not be reported as a change");
// undefined and null are the same "not there": the two sides are built by different code paths
assert.equal(filesChanged({ a: null }, {}), false, "case 22: a missing key and a null must not differ");
assert.equal(filesChanged({}, { a: 100 }), true);

console.log("ALL PASS");
