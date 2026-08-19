// tasks.js — pure functions pulled out of app.js: the data logic of a task card (status, sorting,
// ids) and the formatting it needs for display (clocks, axis ticks). No DOM and no file system, so
// Node can import it directly for tests. i18n.js is a pure module for the same reason.

import { t } from "./i18n.js";

// Sort priority for the list: whatever still needs attention first, finished tasks at the bottom
const STATUS_ORDER = { active: 0, interrupted: 1, estimated: 2, draft: 3, done: 4 };

// Status colors, as CSS variable names; the values live in the three themes in style.css.
// Shared by the left edge stripe in the list and the status pill.
const STATUS_COLOR = {
  active: "--accent",
  interrupted: "--warn",
  estimated: "--ok",
  draft: "--text-faint",
  done: "--text-faint",
};

export function statusColor(status) {
  return `var(${STATUS_COLOR[status] ?? "--border-strong"})`;
}

export function statusLabel(status) {
  const label = t(`status.${status}`);
  return label === `status.${status}` ? status : label; // An unknown status shows the code itself, never the i18n key
}

// Tags are DATA, not display text. The agent writes them into task.json, the UI shows them, and
// the next analysis uses them to find similar past tasks (analyze-task.md step 4). So a stable
// code is stored and only the display is translated. Otherwise prompts in different languages
// would write two vocabularies into the same folder and "similar tags" would quietly stop
// matching.
export const TAG_CODES = [
  "frontend-ui",
  "backend-logic",
  "data-processing",
  "refactor",
  "debugging",
  "infrastructure",
  "unfamiliar-domain",
];

// Field ownership in task.json: the agent may write these three, the app owns everything else.
// `analyze-task.md` carries the same list, and `prompts.test.mjs` pins the two together — change
// the code and forget the prompt and there is no symptom whatsoever.
// Nothing can force an agent to respect this. What the list is really for is to make "which side
// does this new field belong to" a decision that CANNOT BE SKIPPED (see case 21 in
// `tasks.test.mjs`): a new field owned by the agent has to tolerate garbage values.
export const AGENT_FIELDS = ["tags", "model", "templateVersion"];

// Values the agent wrote before tags became codes. Only these seven known values are mapped and
// anything else is kept as it is: the user may have added tags outside the category list, and a
// migration has no business eating them.
const LEGACY_TAGS = {
  前端UI: "frontend-ui",
  後端邏輯: "backend-logic",
  資料處理: "data-processing",
  重構: "refactor",
  除錯: "debugging",
  基礎建設: "infrastructure",
  不熟悉領域: "unfamiliar-domain",
};

export function migrateTags(tags) {
  return (tags ?? []).map((tag) => LEGACY_TAGS[tag] ?? tag);
}

// Display text. Unrecognized values are shown as they are: a custom tag in an older folder, or a
// new category added to the prompt before the dictionary caught up, should both surface the
// original string rather than a key like `tag.xxx`.
export function tagLabel(tag) {
  const label = t(`tag.${tag}`);
  return label === `tag.${tag}` ? tag : label;
}

// Sorts in place and returns the same array: by status first, then newest created first
export function sortTasks(tasks) {
  return tasks.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (a.createdAt < b.createdAt ? 1 : -1)
  );
}

// Turns a title into something usable as a folder name: drop the characters file names cannot
// hold, collapse whitespace into hyphens, and refuse to end on a dot.
// The trailing dot is not cosmetic. Windows strips it from every path it resolves, so a folder
// named "2026-08-19-0." exists on disk yet neither cmd nor PowerShell can cd into it: they look
// for a name without the dot and find nothing. The agent works in that folder from a shell, so
// such a card would be unreachable to the one tool it exists to brief. Chrome refuses to create
// it at all, which is how this surfaced — typing "0." as a title did nothing whatsoever.
// Trailing hyphens go with it, or "fix ." would collapse to "fix-." and be left as "fix-".
export function sanitizeTitle(title) {
  const s = title
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[.\-]+$/, "");
  return s || "task";
}

// Task folder id = date-title, with -2, -3 and so on appended when names collide
export function nextTaskId(title, dayKey, existingIds) {
  const base = `${dayKey}-${sanitizeTitle(title)}`;
  const existing = new Set(existingIds);
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// Hours -> "H:MM:SS" for the live clock on a running task. Displayed in tabular figures so the
// layout does not twitch every second.
export function formatClock(hours) {
  const total = Math.max(0, Math.floor(hours * 3600));
  const pad = (n) => String(n).padStart(2, "0");
  return `${Math.floor(total / 3600)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

// A running task is one with an interval that has not ended. Decides whether to attach the
// per-second timer.
export function hasOpenInterval(task) {
  return (task.intervals ?? []).some((iv) => iv.end == null);
}

// Showing hours: below one working day, say hours only. The parenthesis in "0.2h (about 0.0
// days)" is noise, not information.
export function formatHours(hours, dayCapacity) {
  const h = `${hours.toFixed(1)}h`;
  return dayCapacity > 0 && hours >= dayCapacity
    ? t("fmt.hoursDays", { h, days: (hours / dayCapacity).toFixed(1) })
    : h;
}

// Round the axis maximum up to a whole number of ticks. Using P95 directly ends the axis on a
// number like 1.7, crowded against the tick before it. Rounded, the axis reads 0 / 0.5 / 1 /
// 1.5 / 2 and finishes cleanly.
export function axisMax(maxH) {
  if (!(maxH > 0)) return 0;
  const step = axisTicks(maxH)[0] ?? maxH;
  return Number((Math.ceil(maxH / step) * step).toFixed(10));
}

// Where the ticks fall on the distribution chart. Pick the step from 1/2/5×10ⁿ that keeps the
// count at 5 or fewer, which is what makes the numbers round enough to read. The color band is
// only 26px tall, so anything denser reads as noise. Neither 0 nor maxH is returned: those are
// the edges of the chart and need no line.
export function axisTicks(maxH) {
  if (!(maxH > 0)) return [];
  const mag = 10 ** Math.floor(Math.log10(maxH / 5));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => maxH / s <= 5) ?? mag * 10;
  const ticks = [];
  for (let v = step; v < maxH; v += step) ticks.push(Number(v.toFixed(10))); // Accumulating floats grows values like 0.30000000000000004
  return ticks;
}

// Does the requirement count as written? requirement.md is created as an empty string when the
// task is created, and store.readText returns null only when the file is missing. Testing for
// `=== null` would therefore never be true and the reminder would never appear.
export function hasRequirement(text) {
  return (text ?? "").trim() !== "";
}

// The tail appended to a prompt before it is handed to the agent: which language to produce.
// Everything under `prompts/` is English and exists in one copy only — that is the language of
// the instructions. The output language is a setting (`settings.outputLang`, a language name
// written in English), and keeping the two apart is what saves us from maintaining a second
// authoritative copy of every prompt.
// The second sentence cannot be dropped. Without it the agent may translate file names or tag
// codes along with everything else, and tags are what analyze-task.md step 4 compares when
// looking for similar past tasks — translated, they quietly stop matching.
export function promptLangLine(lang) {
  const name = (lang ?? "").trim();
  if (name === "") return ""; // Empty means English. The rules the agent reads are English already, so the sentence would add nothing.
  return `\n\nWrite all task documents and reply to me in ${name}. Keep file names, JSON field names and code values (status, tags, approach ids) exactly as specified.`;
}

// approaches.md stacks several approaches into one file, each with very detailed steps, and it is
// too much to read at once. Cutting it on headings lets the UI collapse one approach per block.
// DO NOT TRUST the agent to follow the format: try `## `, drop to `# ` if that yields fewer than
// two sections, and fall back to treating the whole file as one section. The worst case is simply
// no split, which puts the screen back the way it was — which is why this feature needs no rule
// in the prompt (a new rule means a version bump, and a version bump can overwrite prompts the
// user customized).
// A section with a null title is the preamble before the first heading. The UI shows it flat;
// do not swallow it.
// A split is accepted when it produced a recognized approach id OR two or more sections. NEVER
// judge on section count alone: a task with a single approach, which is common, can never produce
// two sections and would lose its "adopted" marker as a result (already shipped once).
// Keep the count half of the rule too. When the agent leaves the id out of the heading
// ("## Approach one: ..."), one block per approach is still right; the selected one just cannot
// be marked. ids is optional, and omitting it falls back to counting sections.
export function splitSections(md, ids = []) {
  if (md == null) return [];
  const known = new Set(ids.map((s) => String(s).toLowerCase()));
  for (const prefix of ["## ", "# "]) {
    const parts = cutAt(md, prefix);
    const titled = parts.filter((p) => p.title !== null);
    if (titled.length >= 2 || titled.some((p) => sectionApproachId(p.title, known))) return parts;
  }
  return [{ title: null, body: md }];
}

function cutAt(md, prefix) {
  const parts = [];
  const push = (p) => { if (p.title !== null || p.lines.join("").trim()) parts.push(p); };
  let fence = false; // A `## ` inside a ``` block is code or a comment, not a heading
  let cur = { title: null, lines: [] };
  for (const line of md.split("\n")) {
    if (line.startsWith("```")) fence = !fence;
    if (!fence && line.startsWith(prefix)) {
      push(cur);
      cur = { title: line.slice(prefix.length).trim(), lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  push(cur);
  return parts.map(({ title, lines }) => ({ title, body: lines.join("\n").trim() }));
}

// Which approach a heading declares: the FIRST token in it that belongs to the id list from
// estimate.json. The direction matters. Searching headings for a given id does not work, because
// agents love headings of the form "a3 = a1 plus a cross-task index", so looking for a1 would hit
// both the a1 and the a3 section (hit in practice). A section belongs to exactly one approach, and
// taking the first token naturally assigns that one to a3.
// The comparison uses the real id list rather than a pattern like /[A-Za-z]+\d+/, or a heading
// such as "a1: upgrade to Vue3" would be read as Vue3.
// Case is ignored: agents often write `a1` as "Approach A1" in a heading, and matching case
// exactly leaves the whole task unmarked (also hit in practice).
function sectionApproachId(title, known) {
  return (title ?? "").toLowerCase().split(/[^a-z0-9]+/).find((tok) => known.has(tok)) ?? null;
}

// Which section holds the approach the user picked. EXACTLY ONE match counts; zero matches or
// several both return -1 and mark nothing. Better to withhold the marker than to stamp "adopted"
// onto the wrong approach.
export function matchApproach(sections, selectedId, allIds) {
  if (!selectedId) return -1;
  const known = new Set((allIds?.length ? allIds : [selectedId]).map((s) => String(s).toLowerCase()));
  const want = selectedId.toLowerCase();
  const hits = [];
  sections.forEach((s, i) => { if (sectionApproachId(s.title, known) === want) hits.push(i); });
  return hits.length === 1 ? hits[0] : -1;
}

// How many items a paged list must show to reach item `index` (0-based). Used when returning to
// the list, to extend the done section by just enough pages to include the target task. It is not
// an unlimited expansion: after paging once, the normal view still shows a single page.
export function pagesToShow(index, pageSize) {
  return index < 0 ? 0 : Math.ceil((index + 1) / pageSize) * pageSize;
}

// Do two history states point at the same screen? This decides whether to push a history entry.
// Deleting a task, hitting refresh and resolving a calendar reminder all re-run renderList, and
// pushing every time would pile up a stack of identical entries: ten presses of Back with nothing
// moving on screen, which is worse than not wiring up history at all.
export function sameView(a, b) {
  return !!a && !!b && a.view === b.view && (a.id ?? null) === (b.id ?? null);
}

// Which phase the side rail's flow navigation should point at. It looks at WHICH ARTIFACTS EXIST,
// not at task.status. Status has only four values — draft, estimated, active, done — and a brand
// new task that was just started is already active, so judging by status jumps straight to the
// implementation steps for a task whose requirement has not even been written (already shipped
// once). The order matches the task page from top to bottom, and it stops at the first stage that
// is not finished. Each stage's condition matches the disabled condition of the section it points
// at: the button that copies the steps prompt is disabled until an approach is picked, no matter
// how many approaches there are.
// Picking an approach and asking for the step cards are one stop, not two: both buttons live in
// the estimate section, and a stage whose work happens somewhere else is a nav mark that lies.
// selectedApproach is still taken, since a picked-but-not-generated card sits in the same stage
// with the button merely enabled.
export function currentPhase({ status, hasReq, hasEstimate, selectedApproach, hasSteps, wrapNeeded }) {
  if (status === "done") return "sec-time";
  if (!hasReq) return "sec-req";
  if (!hasEstimate) return "sec-analyze";
  if (!selectedApproach || !hasSteps) return "sec-estimate";
  if (wrapNeeded) return "sec-wrap";
  return "sec-time";
}

// Only the app writes status, but task.json is a file the agent rewrites wholesale — one run came
// back with `completed`, a value that does not exist, most likely borrowed from completedAt next
// to it. A status the side rail does not recognize grows no buttons at all: the task can no
// longer be finished and can never enter the velocity pool, with no error message anywhere.
// Repair can only read the data itself, since the broken string tells us nothing. An open
// interval means it is running; an interruptedBy means it is interrupted; a completedAt means it
// is done; none of those, and it comes down to whether an estimate exists.
export function repairStatus(task, hasEstimate) {
  if ((task.intervals ?? []).some((iv) => iv.end == null)) return "active";
  if (task.interruptedBy) return "interrupted";
  if (task.completedAt) return "done";
  return hasEstimate ? "estimated" : "draft";
}

// Has any watched file changed since the snapshot? Both sides map path -> lastModified, with
// null for a file that does not exist, so a file appearing or disappearing counts like any other
// change — the first landing of estimate.json is the single most important one to catch.
// With nothing to compare against, nothing has changed: the alternative is redrawing the page
// the first time the window is focused after opening a card, every single time.
export function filesChanged(prev, next) {
  if (!prev || !next) return false;
  for (const p of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    if ((prev[p] ?? null) !== (next[p] ?? null)) return true;
  }
  return false;
}

export function newTask(id, title, nowISO) {
  return {
    id,
    title,
    tags: [],
    status: "draft",
    intervals: [],
    planningIntervals: [],
    selectedApproach: null,
    interruptedBy: null,
    model: null,
    templateVersion: null,
    createdAt: nowISO,
    completedAt: null,
  };
}
