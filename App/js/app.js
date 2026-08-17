// app.js — UI entry point and views

import * as store from "./store.js";
import * as ebs from "./ebs.js";
import * as timer from "./timer.js";
// i18n's t() is renamed tr() here. This file uses `t` everywhere as the variable name for
// "one task card", so keeping the name t would silently shadow it inside every
// tasks.map((t) => …), and lookups in those scopes would blow up.
import { t as tr, setLocale, pickLocale, intlLocale, has, LOCALES } from "./i18n.js";
import {
  statusLabel,
  statusColor,
  tagLabel,
  sortTasks,
  nextTaskId,
  newTask,
  formatClock,
  hasOpenInterval,
  axisTicks,
  axisMax,
  formatHours,
  hasRequirement,
  splitSections,
  matchApproach,
  pagesToShow,
  sameView,
  promptLangLine,
  currentPhase,
  repairStatus,
} from "./tasks.js";

window.store = store; // exposed for manual checks from DevTools

// ---------- Language ----------
//
// The language lives in localStorage, not settings.json. The header already shows text before
// any folder is connected ("no folder linked", the unsupported-browser notice); storing it in
// the folder would pin those strings to the default language forever. Same reason for the theme.
const LANG_KEY = "ebs.lang";
const locale = setLocale(pickLocale(localStorage.getItem(LANG_KEY), navigator.languages ?? [navigator.language]));
document.documentElement.lang = locale;
document.title = tr("app.title");
for (const node of document.querySelectorAll("[data-i18n]")) node.textContent = tr(node.dataset.i18n);
for (const node of document.querySelectorAll("[data-i18n-title]")) node.title = tr(node.dataset.i18nTitle);

const statusEl = document.getElementById("dir-status");
const pickBtn = document.getElementById("pick-dir");
const main = document.getElementById("main");

let connected = false;
let settings = null;
// Prompt files that have a newer bundled default but were edited by the user (or came from an
// unknown source), so we do not dare overwrite them automatically — plus the changelog.
// Both are fetched once, in connect().
let promptUpdates = [];
let promptChangelog = [];
// { version, date } from version.json, or null when it cannot be read. Fetched once in connect().
let appVersion = null;

// ---------- Feedback and transitions ----------

// Non-blocking notice, replacing alert(): alert freezes the whole page, and it steals focus
// right after a clipboard operation.
const toastBox = document.getElementById("toasts");
function toast(message, kind = "") {
  const node = textEl("div", message, { class: `toast ${kind}` });
  toastBox.append(node);
  setTimeout(() => {
    node.classList.add("leaving");
    node.addEventListener("animationend", () => node.remove());
  }, 2600);
}

// Cross-fade when swapping views (list ⇄ detail ⇄ settings), handed to the browser's native
// View Transitions. Browsers without support just run fn with no transition.
function withTransition(fn) {
  if (!document.startViewTransition) return fn();
  return document.startViewTransition(fn).updateCallbackDone;
}

// Browser back button. Swapping views here only swaps DOM, which the browser knows nothing
// about, so before wiring up history, pressing back on a detail page left the site entirely.
// Each of the three render functions declares which view it is at the top, and we only push
// an entry when the view actually changed.
//
// **"never push the same view twice" is the heart of this**, and that one rule solves two
// problems at once:
// 1. Deleting a card, hitting refresh, and resolving a calendar prompt all re-run renderList.
//    Pushing every time would pile up a stack of identical entries.
// 2. On popstate the browser has already swapped history.state; we redraw to match, and the
//    state computed during that redraw equals the current one → no push. So we need no
//    "currently handling popstate" flag, and there is no infinite loop.
//
// The URL never changes (the 2nd and 3rd pushState arguments stay empty). A purely local tool
// has no URLs worth sharing, and hash routing would drag in the whole "restore the view but
// the folder is not authorized yet" state tangle on every refresh.
function syncHistory(state) {
  rememberView(state);
  if (sameView(history.state, state)) return;
  history.pushState(state, "");
}

// Which view we are on, kept in sessionStorage. Changing the language reloads the whole page
// (nearly every string on screen has to change), and after the reload we must land back on the
// same view rather than the home list — switching language from the settings page and getting
// kicked to the home list means walking there again after every change. sessionStorage rather
// than localStorage: "the page I was just on" belongs to this browsing session. Closing the tab
// and reopening it tomorrow onto some card's detail page would only be confusing (same
// reasoning as cameFrom).
const VIEW_KEY = "ebs.view";
function rememberView(state) {
  sessionStorage.setItem(VIEW_KEY, JSON.stringify(state));
}
function lastView() {
  try {
    return JSON.parse(sessionStorage.getItem(VIEW_KEY) ?? "null");
  } catch {
    return null; // a corrupt value must not break startup; falling back to the list is fine
  }
}

// ---------- Unsaved in-place edits ----------

// Text being edited only exists in the DOM (the section is rebuilt with editing=true), so any
// redraw wipes it. Every in-place edit goes through editBox(), which registers "this section
// has unsaved text" once; three gates then read it:
//   changing view → await confirmDiscard() at the top of the three render functions
//   leaving the page (refresh, closing the tab, switching language) → beforeunload
//   partial update → refreshDetail skips that one section and swaps the rest
// We store the section id, not a boolean: refreshDetail has to replace the other four sections
// and keep only the one being edited. The edit box's save action is recorded alongside it, so
// the prompt on the way out can offer "save and leave".
let unsavedIn = null;
let unsavedSave = null;

function markUnsaved(id, save) {
  unsavedIn = id;
  unsavedSave = save;
}
function clearUnsaved(id) {
  if (unsavedIn === id) { unsavedIn = null; unsavedSave = null; }
}

// Three choices: save and leave / discard and leave / cancel. A native <dialog> rather than
// confirm(), because confirm only has two buttons and the missing one is exactly what people
// want most often — it forces you to cancel, hit save yourself, then leave a second time.
// No library needed: showModal() already handles focus trapping, Esc, and ::backdrop.
function askUnsaved() {
  return new Promise((resolve) => {
    const dlg = el("dialog", { class: "ask" });
    // All exits go through pick(). resolve only honours the first call and remove() is a no-op
    // on an already-removed node, so calling it more than once is harmless.
    const pick = (v) => { resolve(v); dlg.close(); dlg.remove(); };
    // Esc = cancel. `cancel` is the spec's hook for Esc; preventDefault blocks the browser's own
    // close so pick() can do the teardown. `close` is wired up as a backstop: without a resolve
    // this Promise stays pending forever, and it sits across the navigation path — the symptom
    // is that nothing responds to any click, with nothing on screen pointing at the cause.
    // The overlap is deliberate; do not "simplify" it away.
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); pick("cancel"); });
    dlg.addEventListener("close", () => pick("cancel"));
    dlg.append(
      textEl("p", tr("unsaved.body")),
      el(
        "div",
        { class: "toolbar" },
        textEl("button", tr("unsaved.save"), { class: "primary", onclick: () => pick("save") }),
        textEl("button", tr("unsaved.discard"), { class: "danger", onclick: () => pick("discard") }),
        textEl("button", tr("act.cancel"), { onclick: () => pick("cancel") })
      )
    );
    document.body.append(dlg);
    dlg.showModal();
  });
}

// Ask once before clobbering text that is being edited. With nothing unsaved we let it through
// immediately, which is the path almost every action takes.
async function confirmDiscard() {
  if (!unsavedIn) return true;
  const choice = await askUnsaved();
  if (choice === "cancel") return false;
  const save = unsavedSave;
  // Clear the flags before saving: saving itself goes through refreshDetail, and carrying the
  // stale flag in there would make it skip the very section we just saved.
  unsavedIn = null;
  unsavedSave = null;
  if (choice === "save") await save();
  return true;
}

// Refresh, closing the tab, switching language (location.reload). The wording is the browser's
// call — modern browsers ignore custom strings — so all we do here is signal "something is
// unsaved". No point spending an i18n key on a sentence nobody will ever see.
window.addEventListener("beforeunload", (e) => {
  if (unsavedIn) e.preventDefault();
});

window.addEventListener("popstate", (e) => {
  // With no folder connected (or permission lost after a refresh), do not redraw from the old
  // state — those render functions go and read files.
  if (!connected) return;
  // popstate is navigation that has already happened, so it cannot be intercepted: backing out
  // after asking would mean pushState-ing our way back, which tangles with the "never push the
  // same view twice" rule above. So browser-back simply discards unsaved text. Clear the flag
  // first, or the render that follows pops a dialog whose "cancel" cannot undo anything.
  // ponytail: rescuing browser-back too means writing drafts to localStorage, and this line
  // disappears when that happens.
  unsavedIn = null;
  const s = e.state ?? { view: "list" };
  if (s.view === "detail") renderDetail(s.id);
  else if (s.view === "settings") renderSettings();
  else renderList();
});

// Swap the whole view: wrap the clearing of main in a transition, then scroll back to the top
// (a new view should start from the top).
async function swapView(build) {
  await withTransition(async () => {
    main.style.viewTransitionName = "main-view";
    main.textContent = "";
    await build();
  });
  window.scrollTo(0, 0);
}

// Replace a single <details> section in place. The rest of the DOM is untouched, so the scroll
// position, other sections' open state, and focus in other inputs all survive. This is the core
// of "an action never redraws the whole page".
function swapSection(node) {
  const old = node.id && document.getElementById(node.id);
  if (!old) return false;
  node.open = old.open;
  old.replaceWith(node);
  return true;
}

// ---------- Small helpers ----------

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function textEl(tag, text, attrs = {}) {
  const node = el(tag, attrs);
  node.textContent = text;
  return node;
}

// Dropdown at five-minute granularity. A native <input type="time"> only applies step to the
// arrow keys, not to Chrome's time picker, hence a select.
const TIME_OPTS = (() => {
  const opts = [];
  for (let m = 0; m <= 24 * 60; m += 5) {
    opts.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return opts;
})();

function timeSelect(value) {
  const sel = el("select");
  for (const t of TIME_OPTS) sel.append(textEl("option", t, { value: t }));
  sel.value = value;
  return sel;
}

// ISO ⇄ <input type="datetime-local">, using the browser's local time zone.
// ponytail: assumes the browser time zone == settings.timezone; only if they differ do we need
// a real tz conversion here.
function isoToLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToISO(v) {
  return new Date(v).toISOString();
}

// Folder path used in prompts, relative to the dev project (defaults to the current folder).
function dataDirPath() {
  return settings.dataDirPath || ".";
}

// Every prompt pasted to an agent carries the output language (see promptLangLine in tasks.js).
// Read from settings, not from the UI language: the output language decides what gets written
// into the data folder, and that should be the same language on another machine or another
// browser. Otherwise one folder ends up with history documents in two languages.
function langLine() {
  return promptLangLine(settings?.outputLang);
}

// Read-modify-write task.json, then redraw. Always re-read the latest content before mutating,
// so we do not clobber fields written after the screen was rendered.
async function updateTask(id, mutate) {
  const t = await store.readJSON(`tasks/${id}/task.json`);
  await mutate(t);
  await store.writeJSON(`tasks/${id}/task.json`, t);
  await refreshDetail(id);
}

function patchTask(id, fields) {
  return updateTask(id, (t) => Object.assign(t, fields));
}

// Manual editor for finished intervals (change times / delete / add by hand). It only touches
// closed intervals; the one in progress belongs to the start/complete buttons, which preserves
// the interruption-stack invariant of "at most one end:null in the whole system".
// key: "intervals" | "planningIntervals"
function intervalEditor(task, key) {
  const box = el("div");
  (task[key] ?? []).forEach((iv, i) => {
    if (iv.end == null) return; // in progress, not editable here
    const s = el("input", { type: "datetime-local" });
    s.value = isoToLocalInput(iv.start);
    const e = el("input", { type: "datetime-local" });
    e.value = isoToLocalInput(iv.end);
    box.append(
      el(
        "div",
        { class: "reminder-row" },
        s,
        textEl("span", "→"),
        e,
        textEl("button", tr("act.save"), {
          onclick: async () => {
            const ns = localInputToISO(s.value);
            const ne = localInputToISO(e.value);
            if (new Date(ne) <= new Date(ns)) { toast(tr("err.endAfterStart"), "err"); return; }
            await updateTask(task.id, (t) => { t[key][i].start = ns; t[key][i].end = ne; });
          },
        }),
        textEl("button", tr("act.delete"), {
          class: "danger",
          onclick: () => updateTask(task.id, (t) => { t[key].splice(i, 1); }),
        })
      )
    );
  });
  return box;
}

function addIntervalButton(task, key) {
  return textEl("button", tr("time.addInterval"), {
    onclick: () =>
      updateTask(task.id, (t) => {
        (t[key] ??= []).push({
          start: new Date(Date.now() - 3600000).toISOString(), // default span: an hour ago to now, then edited
          end: new Date().toISOString(),
        });
      }),
  });
}

// Collapsed state lives in localStorage, shared across cards. The memo key prefers the section
// id and only falls back to the title, because titles change with the UI language — keying on
// the title means switching language throws away every collapse preference the user had.
const collapsed = new Set(JSON.parse(localStorage.getItem("ebs.collapsed") ?? "[]"));

function section(title, bodyNode, open = true, id = null) {
  const memo = id ?? title;
  const details = el("details", { class: "block" });
  if (id) details.id = id;
  if (open && !collapsed.has(memo)) details.setAttribute("open", "");
  details.addEventListener("toggle", () => {
    details.open ? collapsed.delete(memo) : collapsed.add(memo);
    localStorage.setItem("ebs.collapsed", JSON.stringify([...collapsed]));
  });
  details.append(textEl("summary", title, { class: "section-title" }), bodyNode);
  return details;
}

// Agent-produced md files (locally trusted content) are rendered with marked; user input always
// goes through textContent.
function mdBlock(mdText) {
  const wrap = el("div", { class: "md" });
  if (mdText === null) {
    wrap.textContent = tr("detail.waitingAgent");
    wrap.className = "md muted";
  } else if (window.marked) {
    wrap.innerHTML = window.marked.parse(mdText);
  } else {
    wrap.append(textEl("pre", mdText));
  }
  return wrap;
}

// The ✎ that starts an in-place edit. A button inside a <summary> also toggles the whole
// section shut, so the event has to be blocked (readingHint's hint-icon hits the same trap).
function editIcon(label, onclick) {
  const btn = textEl("button", "✎", { class: "icon-btn", type: "button", "aria-label": label });
  btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onclick(); });
  return btn;
}

// In-place edit box: the input plus save/cancel. No save-on-blur — clicking the scrollbar inside
// a textarea counts as a blur. ownerId is the id of the container this box sits in (a section or
// the title row); once the content changes it is registered in unsavedIn so the gates know which
// part must not be overwritten. Every in-place edit comes through here, so registering once
// is enough.
function editBox(value, multiline, onSave, onCancel, ownerId) {
  const input = multiline ? el("textarea", { rows: "12" }) : el("input", { type: "text" });
  input.value = value; // textarea has no value attribute, so el()'s setAttribute would do nothing
  // Only a real edit counts as "unsaved": opening ✎ for a look and leaving must not be blocked.
  input.addEventListener("input", () => markUnsaved(ownerId, () => onSave(input.value)));
  const box = el(
    "div",
    { class: "inline-edit" },
    input,
    el(
      "div",
      { class: "toolbar" },
      textEl("button", tr("act.save"), { class: "primary", onclick: () => { clearUnsaved(ownerId); onSave(input.value); } }),
      textEl("button", tr("act.cancel"), { onclick: () => { clearUnsaved(ownerId); onCancel(); } })
    )
  );
  queueMicrotask(() => input.focus()); // the node is not in the DOM yet on return, so focus waits a tick
  return box;
}

function fmtTime(iso) {
  if (!iso) return tr("date.inProgress");
  return new Date(iso).toLocaleString(intlLocale(), { timeZone: settings.timezone, hour12: false });
}

// Status pill: the colour comes from statusColor in tasks.js, and the dot pulses while the timer
// runs. Shared by the list and the detail view.
function statusPill(task) {
  const pill = textEl("span", statusLabel(task.status), {
    class: hasOpenInterval(task) ? "status-badge live" : "status-badge",
  });
  pill.style.setProperty("--status-color", statusColor(task.status));
  return pill;
}

// Read in parallel rather than one card at a time. This runs on every card open and every
// return to the list, and once a few hundred cards pile up, sequential await chains n file IOs
// into one long line and opening a card gets visibly slower.
async function loadAllTasks() {
  const ids = await store.listTaskIds();
  const tasks = await Promise.all(ids.map((id) => store.readJSON(`tasks/${id}/task.json`)));
  return tasks.filter(Boolean);
}

// ---------- Work calendar reminders ----------

function dayLabel(key) {
  const w = new Date(key + "T00:00:00Z").toLocaleDateString(intlLocale(), { weekday: "short", timeZone: "UTC" });
  return tr("date.dayLabel", { date: key, weekday: w });
}

// One row of a single-day window override (day-off checkbox + start/end + caller-supplied
// buttons). The home page's "days awaiting confirmation" reminder and the settings page's
// calendar editor share this row, so the shape written into calendar.json cannot drift apart.
// When entry is omitted, the defaults derived from settings are filled in.
function dayOverrideRow(key, entry, buttons) {
  const src = entry ?? ebs.defaultDayOverride(key, settings);
  const offCheck = el("input", { type: "checkbox" });
  offCheck.checked = !!src.off || src.hours === 0; // hours===0 is the legacy way of marking a day off
  const startSel = timeSelect(src.start ?? settings.workStart);
  const endSel = timeSelect(src.end ?? settings.workEnd);
  const syncOff = () => { startSel.disabled = endSel.disabled = offCheck.checked; };
  offCheck.addEventListener("change", syncOff);
  syncOff();
  const value = () =>
    offCheck.checked
      ? { off: true, confirmed: true }
      : { start: startSel.value, end: endSel.value, confirmed: true };
  const row = el(
    "div",
    { class: "reminder-row" },
    textEl("span", dayLabel(key)),
    el("label", { class: "weekday" }, offCheck, textEl("span", tr("cal.dayOff"))),
    startSel,
    textEl("span", "–"),
    endSel,
    ...buttons(value)
  );
  return row;
}

// Read-modify-write calendar.json. Always re-read the latest content before mutating, so we do
// not clobber a day just saved somewhere else.
async function updateCalendar(mutate) {
  const cal = (await store.readJSON("calendar.json")) ?? {};
  await mutate(cal);
  await store.writeJSON("calendar.json", cal);
}

async function buildCalendarReminder(tasks) {
  const calendar = (await store.readJSON("calendar.json")) ?? {};
  const pending = ebs.pendingConfirmDays(tasks, calendar, settings, new Date().toISOString());
  if (!pending.length) return null;

  const panel = el("details", { class: "block reminder", open: "" });
  panel.append(textEl("summary", tr("reminder.confirmDays"), { class: "section-title" }));
  for (const key of pending) {
    panel.append(
      dayOverrideRow(key, null, (value) => [
        textEl("button", tr("act.confirm"), {
          onclick: async () => {
            await updateCalendar((cal) => { cal[key] = value(); });
            renderList();
          },
        }),
      ])
    );
  }
  panel.append(
    textEl("button", tr("reminder.confirmAllDefault"), {
      onclick: async () => {
        await updateCalendar((cal) => {
          for (const key of pending) cal[key] = ebs.defaultDayOverride(key, settings);
        });
        renderList();
      },
    })
  );
  return panel;
}

// ---------- Prompt update notices ----------
//
// The notice has two layers, because the two things have different lifetimes:
// - **The home page banner** is a one-off announcement and can be dismissed
//   (`promptNoticeDismissed` remembers it up to that version). People using the app normally
//   rarely open the settings page, so announcing it only there is the same as not announcing it.
// - **The dot on the settings button** is state. It stays lit as long as any file is still
//   unhandled, and dismissing the banner does not clear it. Without the dot, dismissing the
//   banner leaves no way back.
//
// The banner deliberately sits **after** the two data-quality reminders and uses a plain border
// rather than a warning colour: ignoring those two silently keeps cards out of the velocity
// pool, while this one only says "a newer version is available". Giving them equal weight
// trains the user to skip the whole area.
function noticeDismissed() {
  return settings?.promptNoticeDismissed === store.bundledPromptVersion();
}

function syncSettingsDot() {
  const btn = document.getElementById("settings-btn");
  btn.classList.toggle("has-update", promptUpdates.length > 0);
  btn.title = promptUpdates.length ? tr("app.settingsUpdate") : "";
}

// What changed in this file since the user's base version. **With no entries, the whole block
// is hidden**: a line saying "(no changelog for this file)" is pure noise, and for a file of
// unknown origin the range of changes cannot be computed anyway (the base version is only a
// guess). What the user actually needs is the two versions below, side by side.
function changelogLines(path, baseVersion) {
  const entries = store.changelogFor(promptChangelog, path, baseVersion);
  if (!entries.length) return null;
  const box = el("div", { class: "notice-log" });
  box.append(textEl("div", tr("notice.changesSince", { version: baseVersion }), { class: "muted small" }));
  for (const e of entries) {
    box.append(textEl("div", tr("notice.entry", { version: e.version, text: e.text }), { class: "small" }));
  }
  return box;
}

// The home page only says "this happened" and points the way. **The decision is not made here**:
// deciding means seeing both versions, and only the settings page has room for that. An
// adopt button on the home page would force a blind choice.
function buildPromptNotice() {
  if (!promptUpdates.length || noticeDismissed()) return null;
  const panel = el("details", { class: "block notice", open: "" });
  panel.append(
    textEl("summary", tr("notice.title", { n: promptUpdates.length }), { class: "section-title" }),
    textEl("div", tr("notice.body"), { class: "small" }),
    el("ul", { class: "notice-files" }, ...promptUpdates.map(({ path }) => textEl("li", promptLabel(path), { class: "small" }))),
    textEl("div", tr("notice.hint"), { class: "muted small" }),
    el(
      "div",
      { class: "toolbar" },
      textEl("button", tr("notice.goSettings"), { class: "primary", onclick: renderSettings }),
      textEl("button", tr("notice.dismiss"), {
        onclick: async () => {
          const fresh = await store.readJSON("settings.json");
          fresh.promptNoticeDismissed = store.bundledPromptVersion();
          await store.writeJSON("settings.json", fresh);
          settings = fresh;
          renderList();
        },
      })
    )
  );
  return panel;
}

async function setCountOffHours(taskId, value) {
  const t = await store.readJSON(`tasks/${taskId}/task.json`);
  t.countOffHours = value;
  await store.writeJSON(`tasks/${taskId}/task.json`, t);
}

function buildOffHoursReminder(tasks, calendar) {
  const nowISO = new Date().toISOString();
  const pending = tasks.filter((t) => ebs.needsOffHoursDecision(t, calendar, settings, nowISO));
  if (!pending.length) return null;

  const panel = el("details", { class: "block reminder", open: "" });
  panel.append(
    textEl("summary", tr("reminder.offHours"), { class: "section-title" })
  );
  for (const t of pending) {
    const off = ebs.taskOffHours(t, calendar, settings, nowISO);
    const win = ebs.taskWindowHours(t, calendar, settings, nowISO);
    const decide = async (v) => { await setCountOffHours(t.id, v); renderList(); };
    panel.append(
      el(
        "div",
        { class: "reminder-row" },
        textEl("button", t.title, { class: "link-btn", onclick: () => renderDetail(t.id) }),
        textEl("span", tr("reminder.inOutHours", { win: win.toFixed(1), off: off.toFixed(1) }), { class: "muted small" }),
        textEl("button", tr("reminder.countIn"), { onclick: () => decide(true) }),
        textEl("button", tr("reminder.countOut"), { onclick: () => decide(false) })
      )
    );
    // List the off-window time awaiting a decision, segment by segment. Only segments adjacent to
    // the start/complete moments are listed; off-window time in the middle is never asked about
    // and stays excluded.
    for (const iv of t.intervals) {
      for (const seg of ebs.edgeOffSegments(iv.start, iv.end ?? nowISO, calendar, settings)) {
        const h = ebs.intervalElapsedHours(seg.start, seg.end);
        if (h < ebs.OFF_HOURS_MIN) continue;
        panel.append(
          textEl("div", tr("reminder.offSegment", { start: fmtTime(seg.start), end: fmtTime(seg.end), hours: h.toFixed(1) }), { class: "muted small" })
        );
      }
    }
  }
  return panel;
}

// ---------- Settings view ----------

function renderBreaksInto(container, breaks) {
  container.textContent = "";
  breaks.forEach((br, i) => {
    const startSel = timeSelect(br.start);
    const endSel = timeSelect(br.end);
    startSel.addEventListener("change", () => (breaks[i].start = startSel.value));
    endSel.addEventListener("change", () => (breaks[i].end = endSel.value));
    container.append(
      el(
        "div",
        { class: "reminder-row" },
        textEl("span", tr("break.label")),
        startSel,
        textEl("span", "–"),
        endSel,
        textEl("button", tr("act.remove"), {
          class: "danger",
          onclick: () => { breaks.splice(i, 1); renderBreaksInto(container, breaks); },
        })
      )
    );
  });
}

// Editor for single-day work calendar overrides (settings page). Paged by month so the list
// cannot grow without bound; each row saves straight into calendar.json. Removing a day drops
// it back to the default rule, and if that day has task intervals and is unconfirmed, the home
// page's pending-hours reminder pops up again on its own (existing mechanism).
async function renderCalendarEditor(box) {
  const cal = (await store.readJSON("calendar.json")) ?? {};
  const month = box.dataset.month || ebs.dayKey(new Date(), settings.timezone).slice(0, 7);
  box.dataset.month = month;
  box.textContent = "";

  const monthInput = el("input", { type: "month" });
  monthInput.value = month;
  monthInput.addEventListener("change", () => {
    if (!monthInput.value) return;
    box.dataset.month = monthInput.value;
    renderCalendarEditor(box);
  });
  const dateInput = el("input", { type: "date" });
  box.append(
    el(
      "div",
      { class: "reminder-row" },
      monthInput,
      dateInput,
      textEl("button", tr("cal.addOrJump"), {
        onclick: async () => {
          if (!dateInput.value) { toast(tr("err.pickDateFirst"), "err"); return; }
          await updateCalendar((cal) => { cal[dateInput.value] ??= ebs.defaultDayOverride(dateInput.value, settings); });
          box.dataset.month = dateInput.value.slice(0, 7); // jump to that month so the new row is visible
          renderCalendarEditor(box);
        },
      })
    )
  );

  const keys = Object.keys(cal).filter((k) => k.startsWith(month)).sort();
  const others = Object.keys(cal).length - keys.length;
  if (!keys.length) box.append(textEl("div", tr("cal.emptyMonth"), { class: "muted small" }));
  for (const key of keys) {
    box.append(
      dayOverrideRow(key, cal[key], (value) => [
        textEl("button", tr("act.save"), {
          onclick: async () => {
            await updateCalendar((c) => { c[key] = value(); });
            renderCalendarEditor(box);
          },
        }),
        textEl("button", tr("act.remove"), {
          class: "danger",
          onclick: async () => {
            await updateCalendar((c) => { delete c[key]; });
            renderCalendarEditor(box);
          },
        }),
      ])
    );
  }
  if (others > 0) box.append(textEl("div", tr("cal.otherMonths", { n: others }), { class: "muted small" }));
}

// Prompt customization on the settings page: one collapsible textarea per prompt file, each with
// its own save / restore-default. The file list mirrors PROMPT_FILES in store.js, and edits are
// written only into the current data folder.
// The order matches the task page's flow from top to bottom: hand to the agent for analysis →
// implementation step card (produce / deliver) → wrap-up. analyze-task.md sits right after the
// template.md that triggers it (it is the rule book for the analysis phase, and the other two
// templates reference it as well).
const PROMPT_EDITORS = [
  { path: "prompts/template.md", key: "template" },
  { path: "prompts/analyze-task.md", key: "analyze" },
  { path: "prompts/steps-template.md", key: "steps" },
  { path: "prompts/steps-guide.md", key: "stepsGuide" },
  { path: "prompts/implement.md", key: "implement" },
  { path: "prompts/wrap-up-template.md", key: "wrap" },
  { path: "prompts/wrap-up-guide.md", key: "wrapGuide" },
];

// File path → the human label used on the settings page. An unrecognized path is shown as-is,
// which is the only way to notice a new prompt file that was never registered here.
function promptLabel(path) {
  const f = PROMPT_EDITORS.find((x) => x.path === path);
  return f ? tr(`prompt.${f.key}.label`) : path;
}

async function buildPromptEditors() {
  const box = el("div", { class: "form" });
  for (const f of PROMPT_EDITORS) {
    const label = tr(`prompt.${f.key}.label`);
    const ta = el("textarea", { rows: 14, spellcheck: "false" });
    ta.value = (await store.readText(f.path)) ?? "";
    const update = promptUpdates.find((p) => p.path === f.path);
    const summary = textEl("summary", label);
    // Once the home banner is dismissed, the dot on the settings button leads here — this badge
    // is the answer to "which file was it, then".
    if (update) summary.append(textEl("span", tr("settings.updateBadge"), { class: "count-badge update" }));
    const body = el("details", { class: "field" }, summary);

    // Only show the extra material when the file differs from the bundled one: both versions have
    // to be visible, and clearly labelled as to which is which. Without that, the user faces a
    // single text box with no way to tell whether it holds their copy or the new one, and so no
    // basis for a decision.
    if (update) {
      // With an unknown origin, do not claim "changes since vX" — that version number is the
      // folder's own self-reported guess, and stating it flatly misleads. The only honest thing
      // to say here is "compare the two below yourself".
      const unknown = update.observed || update.baseVersion == null;
      if (unknown) body.append(textEl("div", tr("notice.originUnknown"), { class: "muted small" }));
      else body.append(changelogLines(f.path, update.baseVersion) ?? "");
      body.append(textEl("div", tr("prompts.yourVersion"), { class: "sub-title small" }));
    }
    body.append(ta);
    if (update) {
      const theirs = el("textarea", { rows: 14, spellcheck: "false", readonly: "" });
      theirs.value = await store.bundledPromptText(f.path);
      body.append(
        el(
          "details",
          { class: "compare", open: "" },
          textEl("summary", tr("prompts.newVersion"), { class: "sub-title small" }),
          theirs
        )
      );
    }

    body.append(
      el(
        "div",
        { class: "toolbar" },
        textEl("button", tr("act.save"), {
          onclick: async () => { await store.writeText(f.path, ta.value); toast(tr("toast.savedFile", { path: f.path })); },
        }),
        textEl("button", update ? tr("notice.take") : tr("prompts.reset"), {
          class: update ? "primary" : "",
          onclick: async () => {
            if (!confirm(tr("prompts.confirmReset", { label }))) return;
            ta.value = await store.resetPrompt(f.path);
            promptUpdates = promptUpdates.filter((p) => p.path !== f.path);
            syncSettingsDot();
            toast(tr("toast.resetDone"));
            renderSettings(); // the compare pane and the badge both have to go; redrawing is simplest
          },
        }),
        // "I am keeping my own version" needs an exit too, or the dot can never be turned off.
        ...(update
          ? [
              textEl("button", tr("prompts.keepMine"), {
                onclick: async () => {
                  await store.keepMyPrompt(f.path);
                  promptUpdates = promptUpdates.filter((p) => p.path !== f.path);
                  syncSettingsDot();
                  toast(tr("toast.keptMine"));
                  renderSettings();
                },
              }),
            ]
          : [])
      )
    );
    box.append(body);
  }
  return box;
}

// Whether this folder has just been linked for the first time. Kept in a module variable rather
// than passed as an argument, so ⟳ (which calls rerender() with no arguments) does not silently
// drop the badges. renderList clears it: any route to the list means setup is over.
let firstRun = false;

async function renderSettings() {
  if (!(await confirmDiscard())) return;
  rerender = renderSettings; // without this line, ⟳ on the settings page redraws the home list
  syncHistory({ view: "settings" });
  const cur = await store.readJSON("settings.json");
  const tzInput = el("input", { type: "text", value: cur.timezone });
  const startSel = timeSelect(cur.workStart);
  const endSel = timeSelect(cur.workEnd);
  const workdays = new Set(cur.workdays);
  const dayChecks = tr("date.weekdays").map((label, dow) => {
    const cb = el("input", { type: "checkbox" });
    if (workdays.has(dow)) cb.checked = true;
    return { dow, cb, label };
  });
  const breaks = (cur.breaks ?? []).map((b) => ({ ...b }));
  const breaksBox = el("div");
  renderBreaksInto(breaksBox, breaks);
  const gitInput = el("input", { type: "text", value: cur.gitAuthor, placeholder: tr("ph.gitAuthor") });
  const pathInput = el("input", { type: "text", value: cur.dataDirPath ?? "", placeholder: tr("ph.dataDirPath") });
  // Free text rather than a dropdown: the value only gets dropped into an English instruction for
  // the agent, and there is no dictionary to maintain. Binding it to LOCALES would lock the output
  // language to the two languages the UI happens to be translated into. The datalist is a hint
  // only and does not restrict input.
  const langList = el("datalist", { id: "output-langs" }, ...LOCALES.filter((l) => l.en).map((l) => el("option", { value: l.en })));
  const langInput = el("input", { type: "text", list: "output-langs", value: cur.outputLang ?? "", placeholder: tr("ph.outputLang") });
  const folderName = (await store.getDataDir())?.name ?? tr("settings.unknown");
  const calBox = el("div");
  await renderCalendarEditor(calBox);

  // The badge carries the whole instruction, which is why there is no banner at the top of the
  // page telling the user which fields to look at. A banner long enough to be useful is a banner
  // nobody reads, and it repeats what the labels already say.
  // It is a word, not just a colour: --accent against --border collapses under red-green colour
  // blindness, the same reason the chosen approach carries a "✔" as well as its green.
  const field = (label, node, badge = null) => {
    const caption = textEl("span", label);
    if (badge) {
      caption.append(textEl("em", badge, { class: "field-badge" }));
      node.classList?.add("needs-attention");
    }
    return el("label", { class: "field" }, caption, node);
  };
  // One settings category: a heading plus a divider (drawn in CSS), wrapping a few fields.
  const group = (title, ...children) => el("section", { class: "settings-group" }, textEl("h3", title), ...children);
  const promptBox = await buildPromptEditors();

  const body = el(
    "div",
    {},
    textEl("h2", tr("settings.title")),
    el(
      "div",
      { class: "form" },
      group(
        tr("group.folder"),
        field(
          tr("field.dataDir"),
          el(
            "div",
            {},
            el(
              "div",
              { class: "toolbar" },
              textEl("span", tr("settings.current", { name: folderName }), { class: "muted" }),
              textEl("button", tr("settings.changeFolder"), { onclick: changeFolder })
            ),
            // Same sentence as the welcome screen, from the same key: this is the other place a
            // picker opens, and it is just as easy to answer with the project folder itself.
            textEl("p", tr("folder.note"), { class: "muted small" })
          )
        ),
        // "Confirm", not "required": the field is never empty. A first link seeds it with the
        // folder name, and saving falls back to that name — so no emptiness check could ever
        // catch a wrong value, and a badge that says "required" about a condition already met is
        // a badge the user learns to skip. It only appears on the first visit to a new folder;
        // after that, silence.
        field(tr("field.dataDirPath"), pathInput, firstRun ? tr("badge.confirm") : null)
      ),
      group(
        tr("group.workTime"),
        field(tr("field.timezone"), tzInput),
        field(tr("field.workStart"), startSel),
        field(tr("field.workEnd"), endSel),
        field(
          tr("field.workdays"),
          el("div", { class: "weekday-row" }, ...dayChecks.map((d) => el("label", { class: "weekday" }, d.cb, textEl("span", d.label))))
        ),
        field(
          tr("field.breaks"),
          el(
            "div",
            {},
            breaksBox,
            textEl("button", tr("break.add"), {
              onclick: () => { breaks.push({ start: "12:00", end: "13:00" }); renderBreaksInto(breaksBox, breaks); },
            })
          )
        ),
        el(
          "details",
          { class: "field" },
          textEl("summary", tr("field.calendar")),
          calBox
        )
      ),
      // First visit only, like the path. Leaving it up whenever the field is empty would nag
      // forever at anyone not using git for version control, with no way to clear it.
      group(tr("group.git"), field(tr("field.gitAuthor"), gitInput, firstRun ? tr("badge.suggested") : null)),
      group(
        tr("group.prompts"),
        // The note sits under the input as part of the same .field (smaller gap). Do not give it
        // its own <p> — that lands in .settings-group's wide spacing and reads like a stray
        // paragraph belonging to nothing.
        el(
          "label",
          { class: "field" },
          textEl("span", tr("field.outputLang")),
          langInput,
          langList,
          textEl("span", tr("outputLang.note"), { class: "muted small" })
        ),
        textEl("p", tr("prompts.note"), { class: "muted small" }),
        promptBox
      ),
      el(
        "div",
        { class: "toolbar settings-actions" },
        textEl("button", tr("act.save"), {
          onclick: async () => {
            const fresh = await store.readJSON("settings.json");
            fresh.timezone = tzInput.value.trim() || cur.timezone;
            fresh.workStart = startSel.value;
            fresh.workEnd = endSel.value;
            fresh.workdays = dayChecks.filter((d) => d.cb.checked).map((d) => d.dow);
            fresh.breaks = breaks.map((b) => ({ start: b.start, end: b.end }));
            fresh.gitAuthor = gitInput.value.trim();
            fresh.dataDirPath = pathInput.value.trim() || folderName;
            fresh.outputLang = langInput.value.trim();
            await store.writeJSON("settings.json", fresh);
            settings = fresh;
            toast(tr("toast.settingsSaved"));
            renderList();
          },
        }),
        textEl("button", tr("act.cancel"), { onclick: renderList })
      ),
      // The manual, reachable again. Its only other link is on the welcome screen, which
      // disappears the moment a folder connects — after that there was no way back to it from
      // inside the app at all. Below the action bar on purpose: this is the page footer, and the
      // bar comes to rest just above it.
      el(
        "div",
        { class: "settings-foot" },
        textEl("a", tr("welcome.docs"), { href: tr("welcome.docsUrl"), target: "_blank", rel: "noopener" }),
        // Version and build date, needed only when something is being reported, which is what the
        // settings page is already the destination for. No words around them, so nothing to
        // translate. The date is absent when running from a checkout — it is stamped at deploy.
        textEl("span", appVersion ? [`v${appVersion.version}`, appVersion.date].filter(Boolean).join(" · ") : "", { class: "muted small" })
      )
    )
  );
  await swapView(() => main.append(body));
}

// ---------- List view ----------

let rerender = renderList; // for the refresh button in the corner: re-run whichever view is current

// How many cards the done section shows at a time. Completed cards are velocity evidence, not
// reading material, so only the most recent few are listed by default and more take a click.
// Otherwise, once a few hundred pile up, the home page becomes one long ledger.
const DONE_PAGE = 20;
let doneShown = DONE_PAGE;
let doneOpen = false; // whether the done section is open during this session (see buildDoneSection)

// "Which card did I come back to the list from". Memory only, never localStorage — "just now"
// belongs to this browsing session, and opening the app tomorrow to find one card mysteriously
// highlighted is only confusing. renderList reads it and clears it, so no separate rule is needed
// for when to expire it: going in and out repeatedly works every time (entering a detail view
// rewrites it), while refreshing / deleting / adding after the return stops highlighting — by
// then the user is doing something else.
let cameFrom = null;

async function renderList() {
  if (!(await confirmDiscard())) return;
  firstRun = false; // reaching the list at all means the first-run setup is behind us
  rerender = renderList;
  syncHistory({ view: "list" });
  const back = cameFrom;
  cameFrom = null;
  doneShown = DONE_PAGE; // every return to the list starts at page one (the card to scroll back to is topped up below)
  const tasks = sortTasks(await loadAllTasks());
  const calendar = (await store.readJSON("calendar.json")) ?? {};
  const reminder = await buildCalendarReminder(tasks);
  const offReminder = buildOffHoursReminder(tasks, calendar);
  const nowISO = new Date().toISOString();

  // Load velocity and exclusion reasons for the completed cards in one go before the transition,
  // so nothing sprouts halfway through the redraw.
  const rows = await velocityReport(tasks, calendar, nowISO);
  const byId = new Map(rows.map((r) => [r.task.id, r]));
  const pool = poolOf(rows);

  const open = tasks.filter((t) => t.status !== "done");
  // Completed cards sort by completion time, newest first — not creation time. Looking for the
  // one you finished most recently is only intuitive that way.
  const done = tasks
    .filter((t) => t.status === "done")
    .sort((a, b) => ((a.completedAt ?? a.createdAt) < (b.completedAt ?? b.createdAt) ? 1 : -1));

  // If the card we are returning to sits in the done section, the paging has to be topped up far
  // enough to include it and the section has to open this time round, or it fails silently: a
  // collapsed <details> generates no boxes for its children, so scrollIntoView does nothing, and
  // card 21 onwards was never built in the first place. Deciding up front beats DOM archaeology
  // after the fact ("if the scroll did not land, try opening it and see").
  const backInDone = back ? done.findIndex((t) => t.id === back) : -1;
  if (backInDone >= 0) doneShown = Math.max(doneShown, pagesToShow(backInDone, DONE_PAGE));

  const notice = buildPromptNotice();

  await swapView(() => {
    if (reminder) main.append(reminder);
    if (offReminder) main.append(offReminder);
    // After the two data-quality reminders: ignoring those two silently keeps cards out of the
    // velocity pool, while this one only says a newer version is available.
    if (notice) main.append(notice);
    main.append(buildNewTaskBar());
    if (!tasks.length) {
      main.append(textEl("p", tr("list.empty"), { class: "empty" }));
      return;
    }
    for (const t of open) main.append(taskCard(t, byId.get(t.id), nowISO, tasks));
    if (!open.length) main.append(textEl("p", tr("list.emptyOpen"), { class: "empty" }));
    if (done.length) main.append(buildDoneSection(done, byId, rows, nowISO, tasks, backInDone >= 0));
  });

  // swapView scrolls back to the top at the end, so the positioning has to come after it. When
  // the card has been deleted, getElementById simply misses, so a stale memory needs no extra
  // handling.
  const card = back && document.getElementById(`card-${back}`);
  if (card) {
    card.classList.add("just-viewed");
    card.scrollIntoView({ block: "center" });
  }
}

// The done section: one heading line when collapsed; opening it leads with the statistics summary
// (that is what completed cards are for) before the cards themselves. Redrawing swaps only this
// section (swapSection) and leaves the rest of the page alone.
function buildDoneSection(done, byId, rows, nowISO, allTasks, forceOpen = false) {
  const node = el("div");
  const pool = poolOf(rows);
  const mid = ebs.median(pool);
  const stats = el("div", { class: "done-stats" });
  if (mid) {
    stats.append(
      el(
        "div",
        {},
        textEl("span", tr("done.velocityMedian")),
        textEl("b", mid.toFixed(2)),
        textEl("span", tr("done.actualTimes", { n: (1 / mid).toFixed(2) }), { class: "muted" })
      )
    );
  }
  // Buffer ratio: how wide the distribution is. It is a check-up on the velocity pool, not a
  // property of any single card, so it belongs here rather than on a detail page.
  const ratio = ebs.bufferRatio(ebs.effectivePool(pool, settings).pool);
  if (ratio) {
    stats.append(
      el(
        "div",
        {},
        textEl("span", tr("done.bufferRatio")),
        textEl("b", `${ratio.toFixed(1)}×`),
        textEl("span", tr("done.bufferHint"), { class: "muted" })
      )
    );
  }
  stats.append(
    textEl(
      "div",
      tr("done.counts", { done: done.length, pool: pool.length }),
      { class: "muted small" }
    )
  );
  if (pool.length < settings.minVelocitySamples) {
    stats.append(textEl("div", tr("done.lowSamples"), { class: "warn small" }));
  }
  // Excluded cards grouped by reason: one glance shows where the main problem is and whether it
  // is worth going back to fix.
  const byReason = new Map();
  for (const r of rows) {
    if (!r.exclusion) continue;
    byReason.set(r.exclusion, (byReason.get(r.exclusion) ?? 0) + 1);
  }
  if (byReason.size) {
    const parts = [...byReason].map(([code, n]) => tr("done.excludedItem", { why: exclusionText(code)[0], n }));
    stats.append(textEl("div", tr("done.excludedSummary", { list: parts.join(tr("sep.tags")) }), { class: "muted small" }));
  }
  node.append(stats);

  for (const t of done.slice(0, doneShown)) node.append(taskCard(t, byId.get(t.id), nowISO, allTasks));

  const rest = done.length - doneShown;
  if (rest > 0) {
    node.append(
      el(
        "div",
        { class: "toolbar" },
        textEl("button", tr("done.showMore", { n: rest }), {
          onclick: () => {
            doneShown += DONE_PAGE;
            swapSection(buildDoneSection(done, byId, rows, nowISO, allTasks));
          },
        })
      )
    );
  }

  const sec = section(tr("sec.done"), node, false, "sec-done");
  // Set open directly rather than going through section()'s collapsed memory. That memory only
  // records "the user collapsed a section that defaults to open" and does nothing at all for a
  // section that defaults to collapsed (the test is `open && !collapsed.has(title)`, which
  // short-circuits when open is false). This is also a one-off navigation action — I am on my way
  // back to a particular completed card — and should never become a persistent preference.
  //
  // doneOpen records "the user opened it during this session". Without it, every rebuild of this
  // section folds it shut again: "show more" swaps the whole <details> via swapSection, while
  // deleting a card or pressing ⟳ redraws everything, and all three paths turn an open section
  // back into a single heading line. Not in localStorage — opening the home page tomorrow to two
  // hundred completed cards spread out is not what anyone expects.
  if (forceOpen || doneOpen) sec.open = true;
  sec.addEventListener("toggle", () => { doneOpen = sec.open; });
  sec.querySelector("summary").append(textEl("span", tr("done.countBadge", { n: done.length }), { class: "count-badge" }));
  return sec;
}

// After a card is deleted, which card on screen inherits "you were just here": the one below
// first, else the one above. Taken from the DOM siblings rather than by recomputing the sort —
// the order the user sees is the DOM order, and computing it twice drifts apart sooner or later
// (open cards go through sortTasks, completed ones through completedAt, with the "show more"
// button wedged in between).
function neighbourCardId(card) {
  for (const sib of [card.nextElementSibling, card.previousElementSibling]) {
    if (sib?.id?.startsWith("card-")) return sib.id.slice("card-".length);
  }
  return null;
}

function taskCard(task, { velocity, exclusion } = {}, nowISO, allTasks) {
  // The id exists so that returning from a detail view can scroll back to this card. task.id has
  // no whitespace (sanitizeTitle removes it), and getElementById is an exact string match, so
  // neither non-ASCII characters nor [] need escaping.
  const card = el("div", { class: "card clickable", id: `card-${task.id}`, onclick: () => renderDetail(task.id) });
  card.style.setProperty("--status-color", statusColor(task.status));

  const meta = el("div", { class: "card-meta" }, statusPill(task));
  for (const tag of task.tags ?? []) meta.append(textEl("span", tagLabel(tag), { class: "tag" }));
  if (hasOpenInterval(task)) meta.append(liveText(() => formatClock(openIntervalHours(task))));

  const spent = ebs.elapsedHoursOf(task.planningIntervals, nowISO) + ebs.taskElapsedHours(task, nowISO);
  let sub = tr("card.created", { time: fmtTime(task.createdAt) });
  if (task.status === "done") {
    sub += tr("card.totalSpent", { hours: spent.toFixed(1) });
    if (velocity) sub += tr("card.velocity", { velocity: velocity.toFixed(2) });
  }

  const main_ = el("div", { class: "card-main" }, textEl("div", task.title, { class: "card-title" }), meta, textEl("div", sub, { class: "card-meta small" }));
  // A completed card that never made it into the velocity statistics has to say why and how to
  // fix it, or the user never learns that a card needs fixing at all.
  if (exclusion) {
    const [why, fix] = exclusionText(exclusion);
    main_.append(
      el(
        "div",
        { class: "excluded" },
        textEl("b", tr("card.excluded", { why })),
        textEl("span", `　${fix}`)
      )
    );
  }

  card.append(
    main_,
    textEl("button", tr("act.delete"), {
      class: "danger",
      onclick: async (e) => {
        e.stopPropagation();
        if (!confirm(tr("confirm.deleteTask", { title: task.title }))) return;
        await persistTasks(timer.removeTask(allTasks, task.id, new Date().toISOString())); // repair the interruption stack so the card it interrupted can resume
        await store.removeTask(task.id);
        toast(tr("toast.deleted", { title: task.title }));
        // Hand "you were just here" to the neighbouring card, reusing the existing return-to-list
        // path (open the done section, top up the paging, scroll to it, mark it). Without this
        // line, deleting several cards in a row collapses the section and bounces to the top on
        // every single delete.
        cameFrom = neighbourCardId(card);
        // Redraw directly (other cards' status may have been changed by the stack repair). The
        // transition is renderList's View Transition; do not wait on transitionend for a fade —
        // that event never fires when animations are disabled, leaving the list showing the
        // deleted card.
        await renderList();
      },
    })
  );
  return card;
}

// ---------- New task ----------

// Creating a card only needs a title, which does not justify a whole separate view: the top of
// the list holds a title input plus a "new task" button. The requirement description is edited
// in place once you are on the detail page.
function buildNewTaskBar() {
  const titleInput = el("input", { type: "text", placeholder: tr("ph.taskTitle"), class: "new-task-title" });
  const submit = textEl("button", tr("list.newTask"), {
    class: "primary",
    onclick: async () => {
      const id = await createTask(titleInput.value.trim());
      await renderDetail(id);
      await offerStart(id);
    },
  });
  // Disabled outright with no title, rather than scolding with a toast after the click. Use the
  // .disabled property: el() goes through setAttribute.
  submit.disabled = true;
  titleInput.addEventListener("input", () => { submit.disabled = !titleInput.value.trim(); });
  // **This bar deliberately binds no Enter key** — that is the spec, not an oversight. Creating a
  // card jumps straight to the detail page and asks whether to start the clock, so a misfire
  // costs more than in an ordinary form. Guarding on isComposing only fixes IME candidate
  // selection; it does nothing about "submitted before I finished typing". This bar is not a
  // `<form>`, so there is no implicit submission and leaving Enter unbound really does mean
  // nothing fires. The button itself stays keyboard-operable (Enter/Space once focused is native
  // behaviour) — that is accessibility, do not remove it along with the rest.
  return el("div", { class: "toolbar" }, titleInput, submit);
}

// Ask once, right after the card lands, whether to start the clock. Hours lost to a forgotten
// start can only be recovered by adding intervals by hand, and card creation is the one moment
// where we know the user is about to begin. When another card is already active, the
// interruption consequence goes into the question — saying yes touches a different card.
async function offerStart(id) {
  const tasks = await loadAllTasks();
  const active = tasks.find((t) => t.status === "active");
  const ask = active
    ? tr("confirm.startNowInterrupt", { title: active.title })
    : tr("confirm.startNow");
  if (!confirm(ask)) return;
  await persistTasks(timer.startTask(tasks, id, null, new Date().toISOString()));
  await refreshDetail(id);
}

async function createTask(title, requirement = "") {
  const today = ebs.dayKey(new Date(), settings.timezone);
  const id = nextTaskId(title, today, await store.listTaskIds());
  await store.writeJSON(`tasks/${id}/task.json`, newTask(id, title, new Date().toISOString()));
  await store.writeText(`tasks/${id}/requirement.md`, requirement);
  return id;
}

// ---------- Velocity pool and distribution display ----------

// For each completed card, compute its velocity and, if it is out of the statistics, why. The
// file reads happen once here, and every condition comes from ebs.velocityExclusion, so the
// reason shown in the list and the filter actually applied are guaranteed to be the same code.
async function velocityReport(allTasks, calendar, nowISO) {
  const done = allTasks.filter((t) => t.status === "done");
  return Promise.all(
    done.map(async (t) => {
      // Cards past their shelf life are dropped outright, decided from completedAt alone with no
      // need to read estimate.json. The pool only looks back six months, so however many
      // completed cards accumulate, the amount actually read does not grow with them.
      if (t.completedAt && ebs.tooOld(t, settings, nowISO)) {
        return { task: t, exclusion: "tooOld", velocity: null };
      }
      const estimate = await store.readJSON(`tasks/${t.id}/estimate.json`);
      const exclusion = ebs.velocityExclusion(t, estimate, calendar, settings, nowISO);
      return {
        task: t,
        exclusion,
        velocity: exclusion ? null : ebs.caseVelocity(t, estimate, calendar, settings, nowISO),
      };
    })
  );
}

const poolOf = (rows) => rows.filter((r) => r.velocity != null).map((r) => r.velocity);

async function velocityPool(allTasks, calendar) {
  return poolOf(await velocityReport(allTasks, calendar, new Date().toISOString()));
}

// Why a card is out of the velocity statistics, and what the user can do about it (wording lives
// under excl.* in i18n). The unfixable cases (too old, never estimated) have to say so plainly,
// or people waste effort trying to rescue a card that cannot be rescued.
// When ebs adds an exclusion code and the dictionary was not updated, show the code itself
// rather than leaking an i18n key onto the screen.
function exclusionText(code) {
  return has(`excl.${code}.why`) ? [tr(`excl.${code}.why`), tr(`excl.${code}.fix`)] : [code, ""];
}

function fmtHours(h) {
  return formatHours(h, ebs.defaultDayHours(settings));
}

// The distribution chart for one approach: the P5–P95 range and the P50 marker drawn on an axis
// from 0 to maxH, with all three numbers labelled directly on the chart. maxH is shared by every
// approach on the card, so the bar lengths compare directly (the shared axis is drawn once, at
// the bottom).
function distChart(mc, maxH, ideal) {
  const pct = (v) => Math.min(100, Math.max(0, (v / maxH) * 100));
  const at = (node, v) => { node.style.left = `${pct(v)}%`; return node; };

  // P50 goes above the bar, P5/P95 below. Two layers means they cannot collide, so no
  // label-avoidance maths is needed.
  const top = el("div", { class: "dist-row" }, at(textEl("span", tr("dist.p50", { hours: mc.p50.toFixed(1) }), { class: "lbl-p50" }), mc.p50));

  const bar = el("div", { class: "range-bar" });
  for (const t of axisTicks(maxH)) bar.append(at(el("div", { class: "range-tick" }), t));
  const band = el("div", { class: "range-band" });
  band.style.left = `${pct(mc.p5)}%`;
  band.style.width = `${Math.max(2, pct(mc.p95) - pct(mc.p5))}%`;
  bar.append(band, at(el("div", { class: "range-p50" }), mc.p50));
  // The agent's ideal hours are drawn on the same axis: the gap between the dashed line and the
  // solid one is exactly the correction velocity applied. Without this line, the "ideal 4.5h" in
  // the heading has nothing to do with the numbers on the axis.
  if (ideal != null) bar.append(at(el("div", { class: "range-ideal", title: tr("dist.idealTitle", { hours: ideal }) }), ideal));

  // The numbers at each end of the range hug the outside of it: p5 to the left, p95 to the right,
  // so however narrow the range gets they never collide. Too close to the edge, they flip back
  // inside, or the card would clip the label.
  const p5 = at(textEl("span", `${mc.p5.toFixed(1)}h`, { class: pct(mc.p5) < 8 ? "lbl-edge inside" : "lbl-edge" }), mc.p5);
  const p95 = at(textEl("span", `${mc.p95.toFixed(1)}h`, { class: pct(mc.p95) > 92 ? "lbl-edge end inside" : "lbl-edge end" }), mc.p95);
  const bottom = el("div", { class: "dist-row" }, p5, p95);

  return el("div", { class: "dist" }, top, bar, bottom);
}

// Shared X axis: every approach's bar lines up against this ruler, drawn once at the bottom of
// the list. The tick numbers are what turn a bar length into a number of hours, and that is what
// lets the chart explain itself.
function distAxis(maxH) {
  const axis = el("div", { class: "dist-axis" });
  const marks = [0, ...axisTicks(maxH), maxH];
  marks.forEach((v, i) => {
    const cls = i === 0 ? "axis-mark start" : i === marks.length - 1 ? "axis-mark end" : "axis-mark";
    const label = textEl("span", i === marks.length - 1 ? `${+v.toFixed(1)} h` : `${+v.toFixed(1)}`, { class: cls });
    label.style.left = `${(v / maxH) * 100}%`;
    axis.append(label);
  });
  return axis;
}

// Legend: what each of the three marks means. Explained by the marks themselves, not in prose.
function distLegend() {
  return el(
    "div",
    { class: "dist-legend" },
    el("span", {}, el("i", { class: "key-ideal" }), textEl("span", tr("legend.ideal"))),
    el("span", {}, el("i", { class: "key-band" }), textEl("span", tr("legend.band"))),
    el("span", {}, el("i", { class: "key-p50" }), textEl("span", tr("legend.p50")))
  );
}

// ---------- Live timers ----------

// Once a second, only the text of these nodes changes; no section is redrawn. A node that has
// been replaced (isConnected=false) unsubscribes itself.
const tickers = new Set();
setInterval(() => { for (const update of tickers) update(); }, 1000);

function liveText(compute) {
  const node = textEl("span", compute(), { class: "live-timer" });
  const update = () => {
    if (node.isConnected) node.textContent = compute();
    else tickers.delete(update);
  };
  tickers.add(update);
  return node;
}

// How long the currently open interval has been running, in hours.
function openIntervalHours(task) {
  const open = (task.intervals ?? []).find((iv) => iv.end == null);
  return open ? ebs.intervalElapsedHours(open.start, new Date().toISOString()) : 0;
}

// ---------- Detail view ----------

async function persistTasks(changedTasks) {
  for (const t of changedTasks) {
    await store.writeJSON(`tasks/${t.id}/task.json`, t);
  }
}

// Left rail: back, collapse, status, the primary button (start / complete / restart), the time
// summary, and the flow navigation. The content column is ordered by workflow and the actions
// stay in view, so the user walks the flow top to bottom without jumping around.
function buildRail(task, allTasks, estimate, calendar, nowISO, wrap, requirement) {
  const doAction = async (changed) => {
    await persistTasks(changed);
    await refreshDetail(task.id);
  };

  // Collapse/expand swaps only the rail itself. Going through refreshDetail would re-read a dozen
  // files and rebuild five sections just to turn the rail into a single arrow — and it would wipe
  // a requirement description being edited along the way (this happened).
  // The arguments are passed straight through to the next buildRail: this button changes no data,
  // so the redrawn content is necessarily identical.
  const args = [task, allTasks, estimate, calendar, nowISO, wrap, requirement];
  const setCollapsed = (v) => {
    localStorage.setItem("ebs.railCollapsed", v);
    document.getElementById("side-rail")?.replaceWith(buildRail(...args));
  };

  const rail = el("aside", { class: "side-rail", id: "side-rail" });
  if (localStorage.getItem("ebs.railCollapsed") === "1") {
    rail.classList.add("collapsed");
    rail.append(textEl("button", "⟩", { title: tr("rail.expand"), onclick: () => setCollapsed("0") }));
    return rail;
  }
  rail.append(
    el(
      "div",
      { class: "toolbar" },
      textEl("button", tr("rail.back"), { onclick: renderList }),
      el("span", { class: "spacer" }),
      textEl("button", "⟨", { title: tr("rail.collapse"), onclick: () => setCollapsed("1") })
    )
  );

  rail.append(el("div", {}, statusPill(task)));

  const approaches = estimate?.approaches ?? [];
  if (task.status === "draft" || task.status === "estimated") {
    rail.append(
      textEl("button", tr("rail.start"), {
        class: "primary",
        onclick: async () => doAction(timer.startTask(allTasks, task.id, task.selectedApproach ?? null, new Date().toISOString())),
      })
    );
  } else if (task.status === "active") {
    if (!task.selectedApproach && approaches.length > 1) {
      rail.append(textEl("div", tr("rail.noApproachWarn"), { class: "warn small" }));
    }
    // Warn while the clock is still running. Miss it and the only way to record the time is to
    // hit restart and open the clock again — wrap-up counts as work hours too.
    if (wrap.needs) {
      rail.append(textEl("div", tr("rail.noWrapWarn"), { class: "warn small" }));
    }
    rail.append(
      textEl("button", tr("rail.complete"), {
        class: "primary complete",
        onclick: async () => doAction(timer.completeTask(allTasks, task.id, new Date().toISOString())),
      })
    );
  } else if (task.status === "interrupted") {
    const by = allTasks.find((t) => t.id === task.interruptedBy);
    rail.append(textEl("div", tr("rail.interruptedBy", { title: by ? by.title : task.interruptedBy }), { class: "muted small" }));
  } else if (task.status === "done") {
    rail.append(
      textEl("button", tr("rail.restart"), {
        class: "primary",
        onclick: async () => doAction(timer.startTask(allTasks, task.id, null, new Date().toISOString())),
      })
    );
  } else {
    // The four branches above cover every legal status, so landing here means task.json was
    // written with a value we do not recognize (see repairStatus). Without this branch an unknown
    // status slips silently through the whole chain: the rail grows no buttons at all, which
    // looks like the card itself is broken.
    const fixed = repairStatus(task, !!estimate);
    rail.append(textEl("div", tr("rail.badStatus", { status: task.status }), { class: "warn small" }));
    rail.append(
      textEl("button", tr("rail.fixStatus", { status: statusLabel(fixed) }), {
        class: "primary",
        onclick: () => patchTask(task.id, { status: fixed }),
      })
    );
  }

  // Time summary: elapsed / counted / velocity, visible without scrolling to the bottom.
  const stats = el("div", { class: "rail-stats" });
  if (hasOpenInterval(task)) {
    // While timing, tick every second so you can see the clock running.
    stats.append(el("div", {}, textEl("span", tr("rail.currentRun")), liveText(() => formatClock(openIntervalHours(task)))));
  }
  stats.append(textEl("div", tr("rail.elapsed", { hours: ebs.taskElapsedHours(task, nowISO).toFixed(1) })));
  stats.append(textEl("div", tr("rail.counted", { hours: ebs.taskActualHours(task, calendar, settings, nowISO).toFixed(1) })));
  if (task.status === "done" && estimate) {
    const v = ebs.caseVelocity(task, estimate, calendar, settings, nowISO);
    if (v) stats.append(textEl("div", tr("rail.velocity", { velocity: v.toFixed(2) }), { class: "strong" }));
  }
  rail.append(stats);

  // Flow navigation: anchors that jump to sections, with the current phase marked.
  const phase = currentPhase({
    status: task.status,
    hasReq: hasRequirement(requirement), // same condition as the "hand to agent for analysis" button
    hasEstimate: !!estimate,
    selectedApproach: task.selectedApproach,
    hasSteps: wrap.hasSteps,
    wrapNeeded: wrap.needs,
  });
  // Every section of the detail page is listed, always, in page order. Sections that cannot be
  // acted on yet stay in place with their button disabled rather than disappearing, so the flow
  // is visible from the first day of a card — the nav is a map of the process, not a list of what
  // happens to be ready.
  const navItems = [
    ["sec-req", tr("sec.req")],
    ["sec-analyze", tr("sec.analyze")],
    ["sec-estimate", tr("sec.estimate")],
    ["sec-steps", tr("sec.steps")],
    ["sec-wrap", tr("sec.wrap")],
    ["sec-time", tr("sec.time")],
  ];
  const nav = el("nav", { class: "rail-nav" });
  for (const [secId, label] of navItems) {
    nav.append(
      textEl("button", (secId === phase ? "● " : "○ ") + label, {
        class: secId === phase ? "link-btn current" : "link-btn",
        onclick: () => {
          const target = document.getElementById(secId);
          if (target) { target.open = true; target.scrollIntoView({ behavior: "smooth", block: "start" }); }
        },
      })
    );
  }
  rail.append(nav);
  return rail;
}

// Each build*Section below owns one section of the detail page: it takes data and returns a node,
// never inserting itself into the DOM. renderDetail does the file reads, the layout, and the
// calls into them.

// User requirement (user input → textContent + pre-wrap). Editing toggles in place: entering and
// leaving edit mode swaps only this section and reads no files, while saving goes through
// refreshDetail — the requirement text decides whether the "hand to agent for analysis" button is
// disabled, so swapping only this section would leave that button stuck in its old state.
function buildRequirementSection(task, requirement, editing = false) {
  const node = el("div");
  const swap = (next) => {
    if (swapSection(buildRequirementSection(task, requirement, next)) && next) {
      // With the section collapsed, clicking ✎ would show no input box: the icon's click already
      // blocks the details toggle, so entering edit mode has to open it explicitly.
      document.getElementById("sec-req").open = true;
    }
  };
  if (editing) {
    node.append(
      editBox(
        requirement ?? "",
        true,
        async (v) => {
          await store.writeText(`tasks/${task.id}/requirement.md`, v);
          toast(tr("toast.saved"));
          await refreshDetail(task.id);
        },
        () => swap(false),
        "sec-req"
      )
    );
  } else if (hasRequirement(requirement)) {
    node.append(textEl("div", requirement, { class: "pre-wrap" }));
  } else {
    node.append(textEl("div", tr("req.empty"), { class: "muted" }));
  }
  const sec = section(tr("sec.req"), node, true, "sec-req");
  // Done cards are not editable (consistent with buildAnalyzeSection / buildWrapSection).
  if (!editing && task.status !== "done") {
    sec.querySelector("summary").append(editIcon(tr("req.editAria"), () => swap(true)));
  }
  return sec;
}

// Copy text to the clipboard and confirm; shared by the three "copy prompt" buttons.
async function copyToClipboard(text, message) {
  await navigator.clipboard.writeText(text);
  toast(message);
}

function buildAnalyzeSection(task, understanding, approaches, requirement, estimate) {
  const node = el("div");
  if (task.status !== "done") {
    // No copying until the requirement is written: an agent handed an empty requirement can only
    // come back and ask what you want, which wastes the round trip. (buildStepsSection does the
    // same thing when no approach has been chosen.)
    const ready = hasRequirement(requirement);
    const btn = textEl("button", tr("analyze.copyPrompt"), {
      onclick: async () => {
        const tpl = await store.readText("prompts/template.md");
        if (!tpl) { toast(tr("err.fileMissing", { path: "prompts/template.md" }), "err"); return; }
        const filled = tpl.replaceAll("<taskId>", task.id).replaceAll("<dataDir>", dataDirPath()) + langLine();
        await copyToClipboard(filled, tr("toast.copiedForAgent"));
      },
    });
    // Use the .disabled property: el() goes through setAttribute, where even false disables it.
    btn.disabled = !ready;
    node.append(
      el("div", { class: "toolbar" }, btn),
      textEl(
        "div",
        // The path is spelled out because it is otherwise invisible: dataDirPath only ever
        // appears inside the copied text, so a wrong value shows up as the agent reporting a
        // missing file, minutes later, with nothing pointing back at the setting. Printing it
        // needs no accompanying explanation — someone who knows where their folder is can see at
        // a glance that this is not it.
        ready ? tr("analyze.hint", { path: `${dataDirPath()}/tasks/${task.id}/` }) : tr("analyze.needReq"),
        { class: ready ? "muted small" : "warn small" }
      )
    );
  }
  node.append(
    section(tr("sec.understanding"), mdBlock(understanding)),
    section(tr("sec.approaches"), approachBlocks(approaches, task.selectedApproach, (estimate?.approaches ?? []).map((a) => a.id)))
  );
  return section(tr("sec.analyze"), node, true, "sec-analyze");
}

// The approach analysis is split into one block per approach, all collapsed by default. What you
// compare is the name and the hours (which live in the estimate section); the detailed steps are
// what you read after choosing, and should not all be spread open at once. If nothing can be
// split out, the whole document is rendered as before.
// The selected block reuses the estimate section's existing "selected" vocabulary (the --ok bar
// plus ✔ adopted) rather than inventing a second colour scheme. The text marker is required:
// colour alone is indistinguishable to a red-green colourblind reader.
function approachBlocks(md, selectedId, allIds) {
  const parts = splitSections(md, allIds);
  // Fall back to rendering the whole document only when not a single heading was found. **Do not
  // go back to counting segments**: an approaches.md with one approach and no preamble yields
  // exactly one segment, and a count-based threshold would judge it "cannot be split", losing the
  // ✔ adopted marker along with it.
  if (!parts.some((p) => p.title !== null)) return mdBlock(md);
  const picked = matchApproach(parts, selectedId, allIds);
  const wrap = el("div");
  parts.forEach((p, i) => {
    if (p.title === null) { wrap.append(mdBlock(p.body)); return; }
    const box = el("details", { class: i === picked ? "approach-block picked" : "approach-block" });
    const sum = textEl("summary", p.title);
    if (i === picked) sum.append(textEl("span", tr("approach.pickedTag"), { class: "picked-tag" }));
    box.append(sum, mdBlock(p.body));
    wrap.append(box);
  });
  return wrap;
}

// Schedule estimate: one row per approach. The ideal hours (analysis estimate + approach
// estimate) are converted into a distribution through the velocity pool, and on an unfinished
// card the approach can be selected right here.
async function buildEstimateSection(task, estimate, allTasks, calendar) {
  const node = el("div");
  if (!estimate) {
    node.textContent = tr("detail.waitingAgent");
    node.className = "muted";
    return section(tr("sec.estimate"), node, true, "sec-estimate");
  }
  const pool = await velocityPool(allTasks, calendar);
  const eff = ebs.effectivePool(pool, settings);
  if (eff.coldStart) {
    node.append(textEl("div", tr("est.coldStart", { n: pool.length }), { class: "warn small" }));
  }
  // An older estimate without planningHours has only the implementation estimate.
  // ideal is the whole-case ideal hours actually fed into the distribution. A heading that says
  // only "implementation 3h" would not line up with the numbers on the axis.
  // Hours always pass through ebs.numHours: JSON written by an agent guarantees no types, and a
  // string entering an addition silently concatenates into a "number" like "1.512" (see the
  // comment on numHours). Bad values collapse to null here, and downstream that reads as "this
  // approach has no estimate".
  const ph = ebs.numHours(estimate.planningHours);
  const results = (estimate.approaches ?? []).map((a) => {
    const impl = ebs.numHours(a.hours);
    const ideal = impl == null ? null : impl + (ph ?? 0);
    return { a, impl, ideal, dist: ideal == null ? null : ebs.distribution(ideal, eff.pool) };
  });
  // One shared scale per card, so approaches compare directly. The upper bound rounds up to a
  // clean tick so the number at the end of the axis stays readable. The ideal hours have to be
  // included in that bound as well, or with velocity > 1 (estimates above actuals) the dashed
  // line gets pushed off the axis.
  const maxH = axisMax(Math.max(...results.flatMap((r) => [r.dist?.p95 ?? 0, r.ideal ?? 0]), 0));
  for (const { a, impl, dist, ideal } of results) {
    const picked = a.id === task.selectedApproach;
    // Colour follows the selection. The estimated phase originally left it uncoloured on purpose,
    // to encourage comparing "without bias" — but the radio is already checked, so hiding the
    // colour only makes it harder to see at a glance which one you picked, and forces the
    // approach analysis to follow a second set of rules too.
    const box = el("div", { class: picked ? "approach picked" : "approach" });
    const breakdown = ph != null ? tr("est.breakdown", { impl, plan: ph }) : "";
    // Say so outright when the hours are not a usable number. Skipping quietly is not an option:
    // no distribution can be computed for this approach, and picking it keeps the whole card out
    // of the velocity pool (approachMissing in velocityExclusion). The user needs to know to ask
    // the agent to rewrite it.
    const hours =
      ideal == null
        ? textEl("span", tr("est.badHours", { value: String(a.hours) }), { class: "warn small" })
        : textEl("span", tr("est.idealHours", { hours: +ideal.toFixed(2), breakdown }), { class: "approach-hours" });
    const name = tr("est.approachName", { name: a.name, id: a.id });
    if (task.status === "done") {
      box.append(el("div", { class: "approach-title" }, textEl("span", `${picked ? tr("approach.pickedPrefix") : ""}${name}`), hours));
    } else {
      // Select the approach in place: decide while looking at the distribution, saved on pick.
      const r = el("input", { type: "radio", name: "approach", value: a.id });
      if (picked) r.checked = true;
      r.addEventListener("change", () => patchTask(task.id, { selectedApproach: a.id }));
      box.append(el("label", { class: "radio-row approach-title" }, r, textEl("span", name), hours));
    }
    if (maxH > 0 && dist) box.append(distChart(dist, maxH, ideal));
    for (const u of a.uncertainties ?? []) box.append(textEl("div", `⚠ ${u}`, { class: "muted small" }));
    node.append(box);
  }
  if (maxH > 0) node.append(distAxis(maxH), distLegend());
  const sec = section(tr("sec.estimate"), node, true, "sec-estimate");
  sec.querySelector("summary").append(readingHint());
  return sec;
}

// The on-demand "how to read this" note next to the heading. The chart still has to explain
// itself; what this adds is what a chart cannot draw — which number to use for which decision,
// and what this chart does *not* say. It takes up no space until hover or focus.
function readingHint() {
  const rows = [
    ["key-p50", tr("legend.p50"), tr("hint.p50")],
    ["key-band", tr("legend.band"), tr("hint.band")],
    ["key-ideal", tr("legend.ideal"), tr("hint.ideal")],
  ];
  const bubble = el("div", { class: "hint-bubble", role: "tooltip" });
  bubble.append(textEl("div", tr("hint.title"), { class: "hint-title" }));
  for (const [key, term, desc] of rows) {
    bubble.append(
      el(
        "div",
        { class: "hint-row" },
        el("i", { class: key }),
        el("div", {}, textEl("b", term), textEl("span", desc))
      )
    );
  }
  bubble.append(textEl("div", tr("hint.compare"), { class: "hint-note" }));

  const notes = el("div", { class: "hint-note" });
  notes.append(textEl("div", tr("hint.notes"), { class: "hint-subtitle" }));
  const list = el("ul");
  for (const key of ["hint.note1", "hint.note2", "hint.note3"]) list.append(textEl("li", tr(key)));
  notes.append(list);
  bubble.append(notes);

  const icon = textEl("button", "?", { class: "hint-icon", type: "button", "aria-label": tr("hint.title") });
  // A button inside a summary also toggles the whole section shut, so block it.
  icon.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
  return el("span", { class: "hint" }, icon, bubble);
}

// Implementation step card: the agent produces steps.md once the user confirms an approach.
// Until then, this offers the prompt that asks the agent to generate it.
function buildStepsSection(task, steps, stepsTemplate) {
  const dataDir = dataDirPath();
  const node = el("div");
  if (steps === null) {
    // No copying until an approach is chosen: the agent could only come back and ask which one,
    // wasting the round trip.
    const picked = task.selectedApproach;
    const genPrompt = (stepsTemplate ?? "")
      .replaceAll("<taskId>", task.id)
      .replaceAll("<dataDir>", dataDir)
      .replaceAll("<approachId>", picked ?? "") + langLine();
    const btn = textEl("button", tr("steps.copyGen"), {
      onclick: () => copyToClipboard(genPrompt, tr("toast.copiedToAnalyzer")),
    });
    // Use the .disabled property: el() goes through setAttribute, where even false disables it.
    btn.disabled = !picked || !stepsTemplate;
    node.append(
      textEl(
        "div",
        picked ? tr("steps.hintPicked") : tr("steps.hintNoPick"),
        { class: picked ? "muted small" : "warn small" }
      ),
      el("div", { class: "toolbar" }, btn)
    );
    if (!stepsTemplate) node.append(textEl("div", tr("err.fileMissing", { path: "prompts/steps-template.md" }), { class: "warn small" }));
    else if (picked) node.append(textEl("div", genPrompt, { class: "pre-wrap small muted" }));
  } else {
    // This sentence is a prompt to paste to an agent, not UI text: the instruction language
    // follows `prompts/` (English, the language of the source of truth) and does not change with
    // the UI language. The output language is specified separately by langLine() (outputLang on
    // the settings page).
    const implPrompt = `Read the execution rules in ${dataDir}/prompts/implement.md and implement the step cards in ${dataDir}/tasks/${task.id}/steps.md one at a time.` + langLine();
    node.append(
      el(
        "div",
        { class: "toolbar" },
        textEl("button", tr("steps.copyImpl"), {
          onclick: () => copyToClipboard(implPrompt, tr("toast.copiedToImpl")),
        })
      ),
      mdBlock(steps)
    );
  }
  return section(tr("sec.steps"), node, true, "sec-steps");
}

// Wrap-up: once the implementation is settled, ask the agent to fill in the three documents from
// the final code. Done cards are read-only here — wrap-up is real working time, so filling it in
// means hitting restart first to get the clock running again. Otherwise that discussion falls
// into no interval at all and velocity comes out overstated, making the work look faster than
// it was.
function buildWrapSection(task, steps, docs, wrapTemplate) {
  const dataDir = dataDirPath();
  const node = el("div");
  const any = docs.finalSpec !== null || docs.specDiff !== null || docs.logic !== null;
  // There is nothing to wrap up before the step card exists, but the section stays and says so,
  // the same way the step card section stands there greyed out until an approach is picked.
  const ready = steps !== null;
  const prompt = (wrapTemplate ?? "")
    .replaceAll("<taskId>", task.id)
    .replaceAll("<dataDir>", dataDir) + langLine();
  if (task.status === "done") {
    node.append(
      textEl(
        "div",
        any ? tr("wrap.doneAny") : tr("wrap.doneNone"),
        { class: any ? "muted small" : "warn small" }
      )
    );
  } else {
    const btn = textEl("button", any ? tr("wrap.copyAgain") : tr("wrap.copy"), {
      onclick: () => copyToClipboard(prompt, tr("toast.copiedForAgent")),
    });
    // Use the .disabled property: el() goes through setAttribute, where even false disables it.
    btn.disabled = !wrapTemplate || !ready;
    node.append(
      textEl(
        "div",
        !ready ? tr("wrap.hintNoSteps") : any ? tr("wrap.hintAny") : tr("wrap.hintNone"),
        { class: ready ? "muted small" : "warn small" }
      ),
      el("div", { class: "toolbar" }, btn)
    );
    if (!wrapTemplate) node.append(textEl("div", tr("err.fileMissing", { path: "prompts/wrap-up-template.md" }), { class: "warn small" }));
    else if (!any && ready) node.append(textEl("div", prompt, { class: "pre-wrap small muted" }));
  }
  node.append(
    section(tr("sec.finalSpec"), mdBlock(docs.finalSpec)),
    section(tr("sec.specDiff"), mdBlock(docs.specDiff)),
    section(tr("sec.logic"), mdBlock(docs.logic))
  );
  return section(tr("sec.wrap"), node, true, "sec-wrap");
}

// Off-window hours (lunch break / overtime / holidays) are counted or not at the user's
// discretion, and the choice can be changed back at any time.
function buildOffHoursBox(task, off, unconfirmed) {
  const cb = el("input", { type: "checkbox" });
  cb.checked = task.countOffHours === true;
  cb.addEventListener("change", () => patchTask(task.id, { countOffHours: cb.checked }));
  const box = el("div", { class: "divided" });
  box.append(
    el("label", { class: "weekday" }, cb, textEl("span", tr("off.checkbox", { hours: off.toFixed(1) }))),
    textEl("div", tr("off.explain", { hours: off.toFixed(1) }), { class: "muted small" })
  );
  if (task.countOffHours == null) {
    box.append(
      textEl(
        "div",
        unconfirmed ? tr("off.unconfirmed") : tr("off.undecided"),
        { class: "warn small" }
      )
    );
  }
  return box;
}

// Time records. Two-button model: intervals cover the whole case, discussion and implementation
// alike, on one track.
function buildTimeSection(task, estimate, calendar, nowISO) {
  const planning = task.planningIntervals ?? [];
  const node = el("div");
  const open = task.intervals.find((iv) => iv.end == null);
  if (open) node.append(textEl("div", tr("time.running", { start: fmtTime(open.start) }), { class: "small muted" }));
  node.append(intervalEditor(task, "intervals"), el("div", { class: "toolbar" }, addIntervalButton(task, "intervals")));

  const actual = ebs.taskActualHours(task, calendar, settings, nowISO);
  const statBox = el("div", { class: "divided" });
  statBox.append(
    textEl("div", tr("time.elapsed", { hours: ebs.taskElapsedHours(task, nowISO).toFixed(1) }), { class: "small strong" }),
    textEl("div", tr("time.counted", { hours: actual.toFixed(1) }), { class: "small strong" })
  );
  // This card's velocity sits right next to its two inputs: estimated hours and actual hours.
  const ideal = task.status === "done" && estimate ? ebs.caseIdealHours(task, estimate) : null;
  if (ideal != null) {
    const v = ebs.caseVelocity(task, estimate, calendar, settings, nowISO);
    statBox.append(
      textEl(
        "div",
        tr("time.taskVelocity", {
          velocity: v ? v.toFixed(2) : "—",
          ideal,
          actual: actual.toFixed(1),
          legacy: planning.length ? tr("time.legacySuffix") : "",
        }),
        { class: "velocity" }
      )
    );
  }
  node.append(statBox);

  if (task.status === "done") {
    const off = ebs.taskOffHours(task, calendar, settings, nowISO);
    if (off >= ebs.OFF_HOURS_MIN) {
      node.append(buildOffHoursBox(task, off, ebs.hasUnconfirmedDay(task.intervals, calendar, settings, nowISO)));
    }
  }

  // Legacy discussion records, present only on cards from before the two-button model: a
  // read-only total plus manual correction. Their in-window hours fold into this card's velocity
  // denominator.
  if (planning.length) {
    const legacyBox = el("div", { class: "divided" });
    legacyBox.append(
      textEl("div", tr("time.legacyTitle"), { class: "sub-title" }),
      textEl("div", tr("time.elapsed", { hours: ebs.elapsedHoursOf(planning, nowISO).toFixed(1) }), { class: "small strong" }),
      intervalEditor(task, "planningIntervals")
    );
    node.append(legacyBox);
  }
  return section(tr("sec.time"), node, true, "sec-time");
}

// Read every file the detail page needs in one go. Shared by renderDetail (view swap) and
// refreshDetail (in-place update).
async function loadDetail(id) {
  const allTasks = await loadAllTasks();
  const task = allTasks.find((t) => t.id === id);
  if (!task) return null;
  const [requirement, understanding, approaches, estimate, steps, stepsTemplate, finalSpec, specDiff, logic, wrapTemplate, calendar] = await Promise.all([
    store.readText(`tasks/${id}/requirement.md`),
    store.readText(`tasks/${id}/understanding.md`),
    store.readText(`tasks/${id}/approaches.md`),
    store.readJSON(`tasks/${id}/estimate.json`),
    store.readText(`tasks/${id}/steps.md`),
    store.readText("prompts/steps-template.md"),
    store.readText(`tasks/${id}/final-spec.md`),
    store.readText(`tasks/${id}/spec-diff.md`),
    store.readText(`tasks/${id}/logic.md`),
    store.readText("prompts/wrap-up-template.md"),
    store.readJSON("calendar.json").then((c) => c ?? {}),
  ]);
  // Once the agent has written an estimate, promote the card out of draft automatically.
  if (estimate && task.status === "draft") {
    task.status = "estimated";
    await store.writeJSON(`tasks/${id}/task.json`, task);
  }
  return { task, allTasks, requirement, understanding, approaches, estimate, steps, stepsTemplate, finalSpec, specDiff, logic, wrapTemplate, calendar, nowISO: new Date().toISOString() };
}

// The rail needs two things about the wrap-up stage: whether the step card exists (decides the
// phase the flow nav points at) and whether to nag about it (decides the warning). Both call
// sites share one computation so they cannot drift apart later.
const wrapStateOf = (d) => ({
  hasSteps: d.steps !== null,
  needs: d.steps !== null && d.finalSpec === null && d.specDiff === null && d.logic === null,
});

async function buildDetailSections(d) {
  return [
    buildRequirementSection(d.task, d.requirement),
    buildAnalyzeSection(d.task, d.understanding, d.approaches, d.requirement, d.estimate),
    await buildEstimateSection(d.task, d.estimate, d.allTasks, d.calendar),
    buildStepsSection(d.task, d.steps, d.stepsTemplate),
    buildWrapSection(d.task, d.steps, { finalSpec: d.finalSpec, specDiff: d.specDiff, logic: d.logic }, d.wrapTemplate),
    buildTimeSection(d.task, d.estimate, d.calendar, d.nowISO),
  ];
}

// In-place update: main is never cleared; the rail and each section are individually replaceWith'd.
// Scroll position, other sections' open state, and focus elsewhere on the page all stay put —
// this is what "no more whole-page redraws" means.
// If we are not currently on this card's detail page (the sections are not in the DOM), fall back
// to a full render.
async function refreshDetail(id) {
  const d = await loadDetail(id);
  if (!d) return renderList();
  const sections = await buildDetailSections(d);
  if (!sections.every((s) => document.getElementById(s.id))) return renderDetail(id);
  document.getElementById("side-rail")?.replaceWith(buildRail(d.task, d.allTasks, d.estimate, d.calendar, d.nowISO, wrapStateOf(d), d.requirement));
  // Do not swap a section that is being edited and not yet saved. Start/complete and interval
  // editing both land here, and neither should swallow half-typed text.
  for (const s of sections) {
    if (s.id !== unsavedIn) swapSection(s);
  }
}

// The title row at the top of the detail page (title + ✎). This row is not inside any sec-*
// section, so refreshDetail cannot reach it; it carries its own id and replaces itself. Changing
// the title affects no section, and there is no need to make refreshDetail re-read every file.
function buildTitleRow(task, editing = false) {
  const row = el("div", { class: "detail-title", id: "detail-title" });
  const swap = (node) => document.getElementById("detail-title").replaceWith(node);
  if (editing) {
    row.append(
      editBox(
        task.title,
        false,
        async (v) => {
          const title = v.trim();
          if (!title) { toast(tr("err.needTitle"), "err"); return; }
          // Always re-read the latest content before mutating: another action may have written
          // the same file since the page was rendered (timing, approach selection), and
          // overwriting wholesale with the copy in hand would wipe those fields.
          const fresh = await store.readJSON(`tasks/${task.id}/task.json`);
          fresh.title = title; // the title is display only; the folder id does not change
          await store.writeJSON(`tasks/${task.id}/task.json`, fresh);
          toast(tr("toast.saved"));
          swap(buildTitleRow(fresh));
        },
        () => swap(buildTitleRow(task)),
        "detail-title"
      )
    );
  } else {
    row.append(textEl("h2", task.title));
    // Done cards are not editable: a completed card is velocity evidence, and editing it makes it
    // no longer match what was originally estimated.
    if (task.status !== "done") row.append(editIcon(tr("title.editAria"), () => swap(buildTitleRow(task, true))));
  }
  return row;
}

async function renderDetail(id) {
  if (!(await confirmDiscard())) return;
  rerender = () => refreshDetail(id);
  syncHistory({ view: "detail", id });
  cameFrom = id; // on return to the list, scroll back to this card and highlight it (browser back too)
  const d = await loadDetail(id);
  await swapView(async () => {
    if (!d) {
      main.append(textEl("p", tr("detail.notFound"), { class: "empty" }), textEl("button", tr("act.backToList"), { onclick: renderList }));
      return;
    }
    const content = el("article", { class: "content-col" });
    main.append(el("div", { class: "layout" }, buildRail(d.task, d.allTasks, d.estimate, d.calendar, d.nowISO, wrapStateOf(d), d.requirement), content));
    content.append(
      buildTitleRow(d.task),
      el("div", { class: "card-meta" }, statusPill(d.task), textEl("span", tr("detail.createdAt", { time: fmtTime(d.task.createdAt) }))),
      ...(await buildDetailSections(d))
    );
  });
}

// ---------- Welcome (shown while no folder is linked) ----------
//
// Without this the first visitor gets a header and an empty page: nothing says what the tool is,
// what it needs, or that the hardest prerequisite (an agent that runs in the project directory)
// is not part of the App at all. The unsupported-browser case was worse still — the one state the
// visitor cannot act on was reported in the smallest text on the page, in a header span that
// ellipsises as soon as the window narrows.
//
// main is never cleared here. Every caller reaches this with an empty main, and the moment a
// folder connects, renderList goes through swapView, which owns the clearing.
function buildWelcome(supported) {
  const box = el("section", { class: "welcome" });
  box.append(textEl("p", tr("welcome.lead"), { class: "welcome-lead" }));

  if (!supported) {
    box.append(textEl("p", tr("err.unsupported"), { class: "welcome-blocked" }));
  } else {
    // Spelled out rather than looped over a key array, so i18n.test.mjs's scan for literal tr("…")
    // calls can see all three and keep reporting them if one loses its translation.
    const needs = el(
      "ul",
      { class: "welcome-needs" },
      textEl("li", tr("welcome.needBrowser")),
      textEl("li", tr("welcome.needAgent")),
      textEl("li", tr("welcome.needFolder"))
    );
    box.append(textEl("h2", tr("welcome.needTitle")), needs);
    // Delegating to the header button keeps one copy of the "reauthorize the remembered handle,
    // otherwise open the picker" logic. A click dispatched from inside a real click handler still
    // carries user activation, so showDirectoryPicker is not blocked.
    box.append(
      el(
        "div",
        { class: "welcome-cta" },
        textEl("button", tr("app.pickDir"), { class: "primary", type: "button", onclick: () => pickBtn.click() }),
        textEl("p", tr("folder.note"), { class: "muted small" })
      )
    );
  }

  box.append(
    el(
      "div",
      { class: "welcome-foot" },
      textEl("a", tr("welcome.docs"), { href: tr("welcome.docsUrl"), target: "_blank", rel: "noopener" }),
      textEl("span", tr("welcome.local"), { class: "muted small" })
    )
  );
  return box;
}

// ---------- Connection ----------

async function connect(handle) {
  promptUpdates = await store.ensureInit();
  promptChangelog = await store.loadChangelog();
  appVersion = await store.loadVersion();
  settings = await store.readJSON("settings.json");
  syncSettingsDot();
  // First connection: default the relative path used in prompts to the folder's name; it can be
  // edited later on the settings page. That missing field is also the signal for "brand-new
  // folder", so no extra setting is needed to remember whether setup has happened.
  firstRun = !settings.dataDirPath;
  if (firstRun) {
    // "./" so the field reads as a path rather than a name — it is the one setting nobody can
    // validate, and a bare "ebs-data" gives no hint that it is meant to be relative to the
    // project. Typed values are left exactly as entered; normalising free text behind the user's
    // back is not something this app does anywhere.
    settings.dataDirPath = `./${handle.name}`;
    await store.writeJSON("settings.json", settings);
  }
  connected = true;
  statusEl.textContent = tr("app.dirConnected", { name: handle.name });
  pickBtn.hidden = true; // changing folders moved to the settings page
  setConnectedChrome(true);
  // Make the list the base of the history. Without this line the entry we arrived on has a null
  // state, renderList judges it "different" and pushes a new one — so pressing back on the list
  // returns to that null entry, redraws the list again, and looks like nothing happened.
  history.replaceState({ view: "list" }, "");
  // A brand-new folder opens on the settings page. Two of its fields decide the quality of every
  // analysis and neither raises an error when wrong, so the one moment the user is guaranteed to
  // be looking is the moment to show them. It is not a gate: Save and Cancel both leave for the
  // list, and nothing here blocks navigation.
  if (firstRun) return renderSettings();
  await restoreView();
}

// After a reload, return to the page we were on before it (switching language and pressing F5
// both come through here). The list is always the base of the history, so replaceState to list
// first and then draw the target view — that way, pressing back on the restored page returns to
// the list instead of leaving the site. A missing card is handled by renderDetail showing its own
// "task not found"; there is no need to check for it here as well.
async function restoreView() {
  const last = lastView();
  if (last?.view === "settings") return renderSettings();
  if (last?.view === "detail" && last.id) return renderDetail(last.id);
  return renderList();
}

// Connect without letting exceptions escape. The remembered folder may have been deleted,
// renamed, or moved: the handle is still there and queryPermission still says granted, but the
// first read throws NotFoundError. When that happens the handle **must** be forgotten, or the
// next getDataDir() returns the same dead handle and "relink" can never open the picker again
// (this happened).
// Returns whether the connection succeeded, so the caller can decide whether to open the picker.
// Only a genuinely missing folder counts. **Do not treat every exception as "the folder is
// gone"** — any unrelated bug in the render path would then wipe the folder the user had
// remembered, which makes things worse. Revoked permission takes the same path (re-picking is
// the only cure).
const FOLDER_GONE = new Set(["NotFoundError", "NotAllowedError", "SecurityError"]);

async function tryConnect(handle) {
  try {
    await connect(handle);
    return true;
  } catch (e) {
    console.error("failed to connect to the data folder", e); // swallowing the exception without a trace leaves nothing to debug next time
    connected = false;
    main.textContent = "";
    if (FOLDER_GONE.has(e.name)) {
      await store.forgetDataDir();
      statusEl.textContent = tr("err.folderGone");
      pickBtn.textContent = tr("app.pickDirRelink");
    } else {
      statusEl.textContent = tr("err.connectFailed", { message: e.message });
    }
    pickBtn.hidden = false;
    pickBtn.disabled = false;
    setConnectedChrome(false);
    main.append(buildWelcome(true)); // the page would otherwise go blank with only the header line to explain it
    return false;
  }
}

// The only way to the picker, shared by the header button and "change folder" in settings.
// Returns null when the user backs out, and adopts the folder only once it has passed the check —
// so declining leaves the previous folder exactly as it was, with nothing to restore.
// Do NOT reopen the picker after a decline: several awaits have gone by, the transient user
// activation is most likely spent, and showDirectoryPicker would be blocked. Let them press again.
async function pickFolder() {
  const handle = await store.pickDataDir();
  if (store.folderVerdict(await store.topLevelNames(handle)) === "foreign") {
    if (!confirm(tr("pick.confirmForeign", { name: handle.name }))) return null;
  }
  await store.useDataDir(handle);
  return handle;
}

// Used by "change folder" on the settings page. Everything past the picker belongs to connect():
// ensureInit creates what a brand-new folder is missing, and connect's own "no dataDirPath yet"
// branch seeds the relative path.
// Do NOT read settings.json here to reset dataDirPath. A brand-new folder has no settings.json,
// readJSON answers null for a missing file, and assigning to it throws — which used to strand the
// store on a folder it had already adopted but never connected to. It was also wrong on its own
// terms: switching to a folder that already holds data would overwrite the relative path its
// owner had corrected by hand.
// tryConnect rather than connect, so a folder that cannot be read leaves a coherent
// "not connected" screen instead of a half-switched one.
async function changeFolder() {
  let handle;
  try {
    handle = await pickFolder();
  } catch (e) {
    if (e.name !== "AbortError") toast(tr("err.connectFailed", { message: e.message }), "err");
    return;
  }
  if (handle) await tryConnect(handle);
}

const toTop = document.getElementById("to-top");
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
window.addEventListener("scroll", () => {
  toTop.hidden = window.scrollY < 300;
});

const collapseBtn = document.getElementById("collapse-all");
collapseBtn.addEventListener("click", () => {
  document.querySelectorAll("main details[open]").forEach((d) => d.removeAttribute("open"));
});

const refreshBtn = document.getElementById("refresh-btn");
refreshBtn.addEventListener("click", async () => {
  if (!connected) return;
  refreshBtn.classList.add("spinning");
  refreshBtn.addEventListener("animationend", () => refreshBtn.classList.remove("spinning"), { once: true });
  await rerender();
});

// Three themes in a cycle, the choice kept in localStorage. index.html's inline script applies it
// before the first paint.
const THEMES = ["light", "gray", "dark"];
const THEME_ICON = { light: "☀", gray: "◐", dark: "☾" };
const themeBtn = document.getElementById("theme-btn");
function applyTheme(name) {
  document.documentElement.dataset.theme = name;
  localStorage.setItem("ebs.theme", name);
  themeBtn.textContent = THEME_ICON[name];
}
themeBtn.addEventListener("click", () => {
  applyTheme(THEMES[(THEMES.indexOf(document.documentElement.dataset.theme) + 1) % THEMES.length]);
});
applyTheme(document.documentElement.dataset.theme || "light");

// Language switch: save the preference, then reload the page. Nearly every string on screen has
// to change, and re-rendering each view would still miss the header, toasts already created, and
// sections mid-edit. The folder handle lives in IndexedDB, so a reload reconnects on its own.
const langSelect = document.getElementById("lang-select");
for (const l of LOCALES) langSelect.append(textEl("option", l.label, { value: l.code }));
langSelect.value = locale;
langSelect.addEventListener("change", () => {
  localStorage.setItem(LANG_KEY, langSelect.value);
  location.reload();
});

const settingsBtn = document.getElementById("settings-btn");
settingsBtn.addEventListener("click", () => {
  if (connected) renderSettings();
});

// Controls that can do nothing until a folder is connected. Leaving them clickable but inert is
// the worst option available: they are the first things a confused visitor presses, and pressing
// them produces no reaction at all — not even an error.
function setConnectedChrome(on) {
  settingsBtn.disabled = !on;
  refreshBtn.hidden = !on;
  collapseBtn.hidden = !on;
}
setConnectedChrome(false);

pickBtn.addEventListener("click", async () => {
  try {
    // Inside a user gesture: when not connected, first try to re-authorize the remembered handle,
    // and only open the picker if there is none (or tryConnect already cleared it).
    // When the old handle fails to connect, do not fall through to the picker here — several
    // awaits have passed by then, the browser's transient user activation has most likely
    // expired, and showDirectoryPicker gets blocked. Clean up and let the user press again.
    const remembered = connected ? null : await store.getDataDir();
    if (remembered) {
      await tryConnect(remembered);
      return;
    }
    const handle = await pickFolder();
    if (handle) await tryConnect(handle);
  } catch (e) {
    if (e.name !== "AbortError") {
      statusEl.textContent = tr("err.connectFailed", { message: e.message });
    }
  }
});

(async () => {
  if (!window.showDirectoryPicker) {
    statusEl.textContent = tr("err.unsupported");
    pickBtn.disabled = true;
    main.append(buildWelcome(false));
    return;
  }
  const handle = await store.getDataDir();
  if (handle) {
    // No exception may escape here: if the folder has been deleted, startup breaks off halfway,
    // the page sits blank, and nothing on screen says what happened (this happened).
    await tryConnect(handle);
  } else {
    // No "relink" wording here: nothing is remembered, so this really is a first pick. Relink
    // belongs to tryConnect's failure path, where a folder did exist and no longer answers.
    statusEl.textContent = tr("app.dirNoneHint");
    main.append(buildWelcome(true));
  }
})();
