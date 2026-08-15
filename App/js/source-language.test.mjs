// The source language is English. One language, everywhere.
//
// The rule is written as "no letters outside the Latin script", not "no Chinese". Blocking one
// language leaves the door open for the next one: a Japanese or Korean comment would sail through
// a Chinese-only check and the codebase quietly becomes bilingual again. Symbols are unaffected —
// arrows, dashes, box drawing and the ✎ / ⟳ glyphs in the UI are not letters — and so are accented
// Latin characters, so a name like Ångström needs no exception.
//
// Everything non-Latin that survives is pinned below, one list per file. A new one turns this red,
// which is the point: it forces a decision about whether the text is product content, test data, or
// a comment somebody forgot to translate. Removing a pinned string also turns it red, so the list
// cannot rot into a set of stale permissions.
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const list = (dir, ext) => readdirSync(new URL(dir, import.meta.url)).filter((f) => f.endsWith(ext));

// A letter that is not Latin. Runs are grouped so the failure message reads as words, not characters.
const NON_LATIN = /(?:(?!\p{Script=Latin})\p{L})+/gu;

// Non-Latin text that is allowed to stay, and why. Anything absent from this table must be zero.
const ALLOWED = {
  // The seven Chinese tag values written by agents before tags became stable codes. They are the
  // keys of the migration table, i.e. data — translating them would break the migration.
  "tasks.js": ["前端", "後端邏輯", "資料處理", "重構", "除錯", "基礎建設", "不熟悉領域"],

  // "繁體中文" is the language's own name in the locale row; "日本語" is the comment's example of a
  // user typing an output language in their own script.
  "i18n.js": ["繁體中文", "日本語"],

  // Expected values from the zh-Hant dictionary, plus a user-defined tag that has to survive
  // verbatim in every locale, plus CJK titles proving a task id keeps them, plus a language name
  // written in its own script. Each of these only tests anything while it stays non-ASCII.
  "tasks.test.mjs": ["已完成", "前端", "我自己加的", "基礎建設", "修", "測試", "重構", "其他", "約", "天", "日本語"],

  // A zh-Hant dictionary value being compared against the dictionary itself.
  "i18n.test.mjs": ["已儲存"],

  // A non-numeric planningHours value, standing in for whatever an agent might write there.
  "ebs.test.mjs": ["兩小時"],
};

// The zh-Hant dictionary is product content, not source language: translating it would delete the
// Traditional Chinese interface. Skipped by region rather than by file, so the comments and code
// around it are still checked.
function withoutZhHantDict(text) {
  const from = text.indexOf("const zhHant = {");
  const to = text.indexOf("\n};", from);
  assert.ok(from !== -1 && to !== -1, "cannot find the zhHant dictionary in i18n.js; the skip below is now checking the wrong thing");
  return text.slice(0, from) + text.slice(to);
}

function check(name, text) {
  const found = [...new Set(text.match(NON_LATIN) ?? [])].sort();
  const allowed = [...(ALLOWED[name] ?? [])].sort();
  assert.deepEqual(
    found,
    allowed,
    `${name}: the non-Latin text in this file does not match what is pinned in source-language.test.mjs.\n` +
      `  found:   ${JSON.stringify(found)}\n  pinned:  ${JSON.stringify(allowed)}\n` +
      `  A new entry usually means a comment was written in the wrong language. If it is genuinely ` +
      `product content or test data, pin it above with the reason.`
  );
}

// This file is skipped: the table above necessarily contains every string the table permits, so
// scanning it would only ever report itself.
const SELF = "source-language.test.mjs";

for (const name of list("./", ".js")) check(name, name === "i18n.js" ? withoutZhHantDict(read(`./${name}`)) : read(`./${name}`));
for (const name of list("./", ".mjs")) if (name !== SELF) check(name, read(`./${name}`));
check("style.css", read("../style.css"));
check("index.html", read("../index.html"));

// prompts/ is the strictest case: those files are read by the user's own agent, and there is exactly
// one copy of them. A second translated copy would be a second source of truth, and editing one
// while forgetting the other has no symptom at all.
for (const name of list("../prompts/", ".md")) check(`prompts/${name}`, read(`../prompts/${name}`));

console.log("ALL PASS");
