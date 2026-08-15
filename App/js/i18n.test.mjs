// i18n.test.mjs — static contract checks between the dictionaries and their callers.
//
// Localisation only ever breaks quietly. A missing translation falls back to the default
// locale (a stray Chinese line inside the English UI, no error); a mistyped key prints
// something like `sec.reqq` straight onto the screen; a mistyped placeholder (`{hour}` vs
// `{hours}`) shows up verbatim as `{hour}`. None of the three throws, and only a human eye
// notices. This file turns them into checks that run, the same tactic style.test.mjs uses.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOCALES, DEFAULT_LOCALE, t, setLocale, getLocale, has, pickLocale, defaultOutputLang } from "./i18n.js";

const src = (name) => readFileSync(new URL(name, import.meta.url), "utf8");

// Read the keys of each dictionary straight from the source: i18n.js does not export DICT
// (callers have no business touching a whole dictionary), and this test needs to compare them
// entry by entry. The dictionaries are flat object literals, so text parsing is good enough.
function dictOf(code) {
  const text = src("./i18n.js");
  const varName = code === "zh-Hant" ? "zhHant" : code;
  const start = text.indexOf(`const ${varName} = {`);
  assert.ok(start >= 0, `dictionary not found in i18n.js: ${varName}`);
  // Append a newline so the last entry still has the `,\n` the lookahead below needs to close
  // on (without it the final entry is silently dropped)
  const body = text.slice(start, text.indexOf("\n};", start)) + "\n";
  const entries = new Map();
  for (const m of body.matchAll(/^\s{2}"([\w.]+)":\s*([\s\S]*?)(?=,\n\s{2}(?:"|\/\/)|,\n$)/gm)) {
    entries.set(m[1], m[2]);
  }
  return entries;
}

const base = dictOf(DEFAULT_LOCALE);
assert.ok(base.size > 100, `only ${base.size} entries parsed out of the zh-Hant dictionary, so the parser is probably broken`);

// 1. Every locale must have exactly the same key set as zh-Hant.
//    A missing key falls back to the default locale without a word; an extra one is a
//    translated string nobody ever shows.
for (const { code } of LOCALES) {
  if (code === DEFAULT_LOCALE) continue;
  const d = dictOf(code);
  const missing = [...base.keys()].filter((k) => !d.has(k));
  const extra = [...d.keys()].filter((k) => !base.has(k));
  assert.deepEqual(missing, [], `${code} is missing: ${missing}`);
  assert.deepEqual(extra, [], `${code} has keys ${DEFAULT_LOCALE} does not: ${extra}`);
}

// 2. Placeholders have to line up. Translating `{hours}` as `{hour}` raises no error, it just
//    prints `{hour}` on the screen.
const placeholders = (raw) => new Set([...raw.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
for (const { code } of LOCALES) {
  if (code === DEFAULT_LOCALE) continue;
  const d = dictOf(code);
  for (const [key, raw] of base) {
    const want = [...placeholders(raw)].sort();
    const got = [...placeholders(d.get(key))].sort();
    assert.deepEqual(got, want, `placeholders of ${key} in ${code} do not match: expected ${want}, got ${got}`);
  }
}

// 3. Value types must agree (a key holding an array has to be an array in every locale, with
//    the same length). If date.weekdays became a string in one locale, the workday checkboxes
//    in settings would disappear altogether.
for (const { code } of LOCALES) {
  for (const key of base.keys()) {
    setLocale(code);
    const v = t(key);
    const isArray = Array.isArray(v);
    setLocale(DEFAULT_LOCALE);
    const ref = t(key);
    assert.equal(isArray, Array.isArray(ref), `${key} has a different type in ${code} than in ${DEFAULT_LOCALE}`);
    if (isArray) assert.equal(v.length, ref.length, `the ${key} array has a different length in ${code} than in ${DEFAULT_LOCALE}`);
  }
}
setLocale(DEFAULT_LOCALE);

// 4. Every key the code calls must exist. Literal calls (tr("sec.req") / t("act.save")) are
//    found here; keys built from template strings (`excl.${code}.why`) are not, and rule 5
//    below covers those with a prefix list.
const CALLERS = ["./app.js", "./tasks.js"];
const usedKeys = new Set();
for (const file of CALLERS) {
  for (const m of src(file).matchAll(/\b(?:tr|t)\(\s*"([\w.]+)"/g)) usedKeys.add(m[1]);
}
assert.ok(usedKeys.size > 100, `only ${usedKeys.size} literal keys found, so the regex has probably stopped matching`);
const unknown = [...usedKeys].filter((k) => !base.has(k));
assert.deepEqual(unknown, [], `the code uses keys the dictionary lacks (the key name gets printed on screen): ${unknown}`);

// 5. Every key in the dictionary must be used by someone. Translation is pure cost, and an
//    unused entry gets copied into every new locale forever.
//    Dynamically assembled key families are exempted by prefix — their completeness depends on
//    the caller's source (the exclusion codes from ebs, the prompt file list, the status enum),
//    which no static scan can see.
const DYNAMIC_PREFIXES = ["excl.", "status.", "tag.", "prompt.", "hint.note", "app."];
const dead = [...base.keys()].filter(
  (k) => !usedKeys.has(k) && !DYNAMIC_PREFIXES.some((p) => k.startsWith(p))
);
assert.deepEqual(dead, [], `unused dictionary keys, delete them: ${dead}`);

// 6. How t() resolves: substitution, leaving the placeholder alone when the argument is
//    missing, and returning the key itself for an unknown one (ugly, but never broken).
//    The expected strings here are the zh-Hant dictionary values themselves, so they stay in
//    Chinese — replacing them with English would compare the dictionary against nothing.
assert.equal(t("toast.savedFile", { path: "a.md" }), "已儲存 a.md");
assert.equal(t("toast.savedFile"), "已儲存 {path}");
assert.equal(t("no.such.key"), "no.such.key");
assert.equal(has("no.such.key"), false);
assert.equal(has("act.save"), true);

setLocale("en");
assert.equal(getLocale(), "en");
assert.equal(t("act.save"), "Save");
setLocale("klingon"); // an unknown locale falls back to the default rather than turning the UI into key names
assert.equal(getLocale(), DEFAULT_LOCALE);

// 7. pickLocale: a stored preference wins, then the browser languages (primary subtag only),
//    then the default.
assert.equal(pickLocale("en", ["zh-TW"]), "en");
assert.equal(pickLocale(null, ["en-US", "zh-TW"]), "en");
assert.equal(pickLocale(null, ["zh-Hant-TW"]), "zh-Hant");
assert.equal(pickLocale("klingon", ["fr-FR"]), DEFAULT_LOCALE);
assert.equal(pickLocale(null, []), DEFAULT_LOCALE);

// 8. The default output language for a new folder. Every locale needs an English name; miss
//    one and new folders quietly default to English instead.
for (const l of LOCALES) {
  assert.equal(typeof l.en, "string", `${l.code} has no English name (en)`);
  assert.ok(l.en.trim() !== "", `the en field of ${l.code} is an empty string`);
}
assert.equal(defaultOutputLang("zh-Hant"), "Traditional Chinese");
assert.equal(defaultOutputLang("en"), "", "an English UI does not need an extra 'reply in English' line");
assert.equal(defaultOutputLang("klingon"), "", "an unknown locale must not invent a language name for the agent");
setLocale("zh-Hant");
assert.equal(defaultOutputLang(), "Traditional Chinese", "with no argument it follows the current UI locale");

console.log("ALL PASS");
