// store.js — access layer for the data folder: the File System Access API, with IndexedDB
// remembering the directory handle between visits.

import { migrateTags } from "./tasks.js";
import { defaultOutputLang } from "./i18n.js";

const DB_NAME = "ebs";
const STORE = "kv";
const KEY = "dataDir";

let dirHandle = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pickDataDir() {
  dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(KEY, dirHandle);
  return dirHandle;
}

// Forget the remembered folder. THIS IS THE ONLY WAY OUT. Once the folder has been deleted,
// renamed or moved, the handle is still sitting in IndexedDB and queryPermission still answers
// granted, but the first read throws NotFoundError. Without clearing it, getDataDir() keeps
// handing back that dead handle forever and "reconnect" never reaches the folder picker, which
// leaves the user stuck.
export async function forgetDataDir() {
  dirHandle = null;
  await idbSet(KEY, null);
}

export async function getDataDir() {
  if (dirHandle) return dirHandle;
  const handle = await idbGet(KEY);
  if (!handle) return null;
  let perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    try {
      // This only succeeds inside a user gesture. On failure the UI walks the user through
      // clicking and trying again.
      perm = await handle.requestPermission({ mode: "readwrite" });
    } catch {
      return null;
    }
  }
  if (perm !== "granted") return null;
  dirHandle = handle;
  return dirHandle;
}

async function getDir(parts, create) {
  let dir = await getDataDir();
  if (!dir) throw new Error("no data folder is connected");
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create });
  }
  return dir;
}

async function getFile(path, create) {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop();
  const dir = await getDir(parts, create);
  return dir.getFileHandle(name, { create });
}

export async function readText(path) {
  try {
    const fh = await getFile(path, false);
    return await (await fh.getFile()).text();
  } catch (e) {
    if (e.name === "NotFoundError" || e.name === "TypeMismatchError") return null;
    throw e;
  }
}

export async function writeText(path, text) {
  const fh = await getFile(path, true);
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

export async function readJSON(path) {
  const text = await readText(path);
  const parsed = parseJSON(text);
  if (parsed === undefined) {
    console.warn(`failed to parse JSON, treating the file as missing: ${path}`);
    return null;
  }
  return parsed;
}

// A missing file, an empty file and broken JSON all come back as null. Do not change that; it is
// what keeps a bad file from whiting out the whole page. Broken JSON additionally returns
// undefined so the caller can log it.
// The BOM has to be stripped first. JSON.parse throws on it, and these files are written by THE
// USER'S AGENT, using tools like PowerShell's Out-File that emit a BOM by default. Read as "there
// is no estimate.json", the task quietly vanishes from the velocity pool and its detail page sits
// on "waiting for the agent" with no error anywhere. This has happened.
export function parseJSON(text) {
  if (text === null || text.trim() === "") return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

export async function writeJSON(path, obj) {
  await writeText(path, JSON.stringify(obj, null, 2));
}

export async function listTaskIds() {
  try {
    const dir = await getDir(["tasks"], false);
    const ids = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === "directory") ids.push(name);
    }
    return ids;
  } catch (e) {
    if (e.name === "NotFoundError") return [];
    throw e;
  }
}

export async function removeTask(taskId) {
  const dir = await getDir(["tasks"], false);
  await dir.removeEntry(taskId, { recursive: true });
}

export async function ensureInit() {
  if ((await readText("settings.json")) === null) {
    await writeJSON("settings.json", {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workStart: "09:00",
      workEnd: "18:00",
      breaks: [{ start: "12:00", end: "13:00" }],
      workdays: [1, 2, 3, 4, 5],
      gitAuthor: "",
      // An initial value only. A new folder starts from the current UI language, and after that
      // the two are independent (the settings page can change it).
      // An existing folder without the field gets empty, which means English, so nobody's output
      // language is silently swapped out from under them.
      outputLang: defaultOutputLang(),
      velocityMaxAgeMonths: 6,
      coldStartVelocities: [0.3, 0.5, 0.7, 1.0, 1.3],
      minVelocitySamples: 6,
      promptTemplateVersion: BUNDLED_PROMPT_VERSION,
    });
  } else {
    const s = await readJSON("settings.json");
    let migrated = false;
    // Migrating an older folder: daily hours -> the working window model
    if (s && s.workStart === undefined) {
      s.workStart = "09:00";
      s.workEnd = "18:00";
      s.breaks = [{ start: "12:00", end: "13:00" }];
      s.workdays = [1, 2, 3, 4, 5];
      delete s.weekdayHours;
      delete s.weekendHours;
      migrated = true;
    }
    // Output language: folders created before the field existed get the current UI language
    // written in as a fixed value. It is deliberately not left empty and interpreted at read
    // time as "follow the UI language" — that would make one folder produce documents in
    // different languages depending on the browser. A user who wants English clears the field,
    // and that is a choice they stated.
    if (s && s.outputLang === undefined) {
      s.outputLang = defaultOutputLang();
      migrated = true;
    }
    if (migrated) await writeJSON("settings.json", s);
  }
  if ((await readText("calendar.json")) === null) {
    await writeJSON("calendar.json", {});
  }
  await getDir(["prompts"], true);
  await getDir(["tasks"], true);

  const s = await readJSON("settings.json");
  if (!s) return [];
  const pending = await syncPrompts(s);
  if (s.promptTemplateVersion !== BUNDLED_PROMPT_VERSION) {
    // A one-off data migration riding along with the version number. Turning tags from free text
    // into stable codes happened alongside the rewrite of the category list in analyze-task.md,
    // so the two share a version. Adding a separate settings flag for a migration that runs once
    // would mean a permanent field for a one-time event. The mapping itself lives in tasks.js,
    // where it is a pure function and testable.
    await migrateTaskTags();
    s.promptTemplateVersion = BUNDLED_PROMPT_VERSION;
  }
  await writeJSON("settings.json", s);
  return pending;
}

// Did we write this content? Only a file we are certain nobody touched may be overwritten.
// The hash answers "has this been modified"; the version answers "is there anything new to
// offer". They are separate questions and must not be collapsed into one. DO NOT GO BACK TO
// DECIDING BY VERSION ALONE: that silently overwrites whatever the user customized on the
// settings page, and the loss is unrecoverable.
// This is a pure function holding the entire decision; the IO lives in syncPrompts. store.test.mjs
// tests this function directly.
//
// record  = the { hash, version } we left behind on our last write. `observed` marks a file that
//           already existed before we started keeping records: its content is of unknown origin
//           and must not be treated as ours.
// bundled = the { hash, version } currently shipped with the app
export function promptDecision(record, currentHash, bundled) {
  if (currentHash === null) return "write"; // The folder does not have this file
  if (currentHash === bundled.hash) return "insync"; // The content already is the latest default
  // Unknown origin, so ASK EXACTLY ONCE. The whole point of `observed` is that we do not know who
  // wrote this. Staying silent because the version numbers happen to agree would leave the record
  // stuck as unresolved forever, and the user would never learn that their folder holds a file we
  // do not recognize. Hit in practice on a test folder.
  if (!record || record.observed) return "notify";
  if (currentHash === record.hash) return "write"; // Ours, and untouched since
  // The user edited it themselves. Leave it alone, and only speak up when there is genuinely a
  // new version. Telling someone who has just bent a prompt into the shape they wanted that their
  // file differs from the default is pure noise.
  return record.version !== bundled.version ? "notify" : "keep";
}

// prompt-changelog.md -> [{ version, file, text }]. The format is `## <version>` with each entry
// beneath it starting with `` `file name` ``. This is a file we ship ourselves, so dictating its
// format is fair; but anything unparseable returns an empty array. A changelog that fails to
// appear is a shame. Throwing out of the whole connect flow over one would be a disaster.
export function parseChangelog(md) {
  const out = [];
  let version = null;
  for (const line of (md ?? "").split("\n")) {
    const head = line.match(/^##\s+(\S+)/);
    if (head) { version = head[1]; continue; }
    const item = version && line.match(/^[-*]\s+`([^`]+)`\s*[—-]\s*(.+)$/);
    if (item) out.push({ version, file: item[1].trim(), text: item[2].trim() });
  }
  return out;
}

// What has changed in one prompt file since the user's baseline version.
// Computed per file rather than per folder: when the user has only edited one file, the rest were
// upgraded automatically long ago, so each file legitimately starts from a different point.
// A null baseVersion means the origin is unknown, and everything is listed.
export function changelogFor(entries, file, baseVersion) {
  const name = file.replace(/^prompts\//, "");
  const base = Number(baseVersion);
  return entries.filter(
    (e) => e.file === name && (baseVersion == null || !Number.isFinite(base) || Number(e.version) > base)
  );
}

export async function loadChangelog() {
  try {
    const res = await fetch("prompt-changelog.md", { cache: "no-cache" });
    return res.ok ? parseChangelog(await res.text()) : [];
  } catch {
    return [];
  }
}

export const bundledPromptVersion = () => BUNDLED_PROMPT_VERSION;

// The settings page shows the bundled version side by side, which is the only way the user can
// decide whether to take it
export const bundledPromptText = (path) => bundledPrompt(path);

// "Keep my version": stamp the record with the current bundled version so the file lands in
// promptDecision's `keep` branch and stays quiet, which is also what lets the dot on the settings
// button go out. Without this path, anyone who decides they want to keep their own version is
// left with a dot that can never be dismissed, and an indicator that cannot be resolved ends up
// being ignored.
//
// The hash recorded is THE BUNDLED CONTENT THAT WAS REJECTED. It must never be the user's current
// content: that would declare "we wrote this", and the next upgrade would have promptDecision
// return `write` and overwrite their customization outright.
export async function keepMyPrompt(path) {
  const text = await bundledPrompt(path);
  const s = (await readJSON("settings.json")) ?? {};
  (s.prompts ??= {})[path] = { hash: await sha256(text), version: BUNDLED_PROMPT_VERSION };
  await writeJSON("settings.json", s);
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// THE CACHE MUST BE BYPASSED. `python -m http.server` sends no cache headers, so a plain fetch
// hands back whatever old prompt the browser kept. We would then write that stale content into
// the user's folder as "the bundled default" and record its hash, leaving every future upgrade
// decision built on the wrong baseline. This has happened, and it happened silently.
async function bundledPrompt(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`could not load the bundled file ${path}`);
  return res.text();
}

// Compare and update file by file. Returns the list of files that have a new version we do not
// dare overwrite on our own, for the UI to raise with the user.
async function syncPrompts(s) {
  const records = (s.prompts ??= {});
  const bundledVersion = BUNDLED_PROMPT_VERSION;
  const pending = [];
  for (const path of PROMPT_FILES) {
    const text = await bundledPrompt(path);
    const bundled = { hash: await sha256(text), version: bundledVersion };
    const current = await readText(path);
    const currentHash = current === null ? null : await sha256(current);
    // A file that predates our records: register the current state as the baseline, taking the
    // version the folder claims for itself. That is a guess, which is what `observed` marks.
    // Without this step there is no way to tell whether a file was modified, and everything would
    // have to be treated as modified.
    if (currentHash !== null && !records[path]) {
      records[path] = { hash: currentHash, version: s.promptTemplateVersion ?? null, observed: true };
    }
    switch (promptDecision(records[path], currentHash, bundled)) {
      case "write":
        await writeText(path, text);
        records[path] = { hash: bundled.hash, version: bundledVersion };
        break;
      case "insync":
        records[path] = { hash: bundled.hash, version: bundledVersion }; // Clears `observed` while we are here
        break;
      case "notify":
        // `observed` has to travel outward. For those files baseVersion is only the version the
        // folder claims, a guess rather than a fact, and the UI has to change its wording
        // accordingly: "cannot tell" instead of "changes since vX".
        pending.push({ path, baseVersion: records[path]?.version ?? null, observed: !!records[path]?.observed });
        break;
      // "keep": the user edited it and there is nothing new to offer, so skip it silently
    }
  }
  return pending;
}

// Read and write in parallel, and only write back what actually changed, so the migration does
// not touch the file timestamp of every task.
async function migrateTaskTags() {
  const ids = await listTaskIds();
  await Promise.all(
    ids.map(async (id) => {
      const path = `tasks/${id}/task.json`;
      const t = await readJSON(path);
      if (!t) return;
      const before = t.tags ?? [];
      const tags = migrateTags(before);
      // migrateTags maps one to one and keeps the length, so identical items mean nothing to do
      if (tags.every((tag, i) => tag === before[i])) return;
      t.tags = tags;
      await writeJSON(path, t);
    })
  );
}

const BUNDLED_PROMPT_VERSION = "14";
// The order matches the task page from top to bottom, and the prompt editors on the settings page
// follow the same order. Copying and overwriting themselves do not care about it.
// Templates — the line pasted to the agent — come paired with guides, the file the agent is told
// to go read. Splitting them by stage saves context in the user's agent: one guide covering the
// whole flow would make the wrap-up stage read the analysis and steps rules for nothing.
const PROMPT_FILES = [
  "prompts/template.md",
  "prompts/analyze-task.md",
  "prompts/steps-template.md",
  "prompts/steps-guide.md",
  "prompts/implement.md",
  "prompts/wrap-up-template.md",
  "prompts/wrap-up-guide.md",
];

// Restore one prompt file in the data folder to the app's bundled default and return what was
// written. This backs "restore default" on the settings page.
// THE RECORD MUST BE UPDATED ALONG WITH IT. Otherwise the restored file reads as "the user edited
// this", the next upgrade still will not touch it, and the notice hangs around indefinitely.
// When the user hits Save, the record must NOT be updated: that would register their
// customization as ours and the next upgrade would silently overwrite it, which is the exact
// thing this whole mechanism exists to prevent.
export async function resetPrompt(path) {
  const text = await bundledPrompt(path);
  await writeText(path, text);
  const s = (await readJSON("settings.json")) ?? {};
  (s.prompts ??= {})[path] = { hash: await sha256(text), version: BUNDLED_PROMPT_VERSION };
  await writeJSON("settings.json", s);
  return text;
}
