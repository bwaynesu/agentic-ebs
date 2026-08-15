// Translated documents must keep the same section structure as their base file.
//
// `<base>.md` is the original; every `<base>.<locale>.md` beside it is a
// translation. Heading text differs by definition, so what gets compared is the
// sequence of heading levels: how many `##` and `###`, and in what order.
//
// This catches the drift that actually happens — a section added to one language
// and forgotten in the others — without pretending to check meaning. Adding a
// new locale needs no change here: the file name is the registration.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const DIRS = [ROOT, join(ROOT, "App")];

// "README.zh-Hant.md" -> { base: "README", locale: "zh-Hant" }; plain "README.md" -> null
function splitLocale(name) {
  const m = /^(.+?)\.([A-Za-z]{2,3}(?:-[A-Za-z]{2,8})*)\.md$/.exec(name);
  return m ? { base: m[1], locale: m[2] } : null;
}

// The levels only: "# ## ### ##" — heading text is expected to differ between languages.
function structure(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^#{1,6} \S/.test(line))
    .map((line) => line.match(/^#+/)[0])
    .join(" ");
}

let pairs = 0;
for (const dir of DIRS) {
  for (const name of readdirSync(dir)) {
    const parsed = splitLocale(name);
    if (!parsed) continue;
    const basePath = join(dir, `${parsed.base}.md`);
    const baseStruct = structure(basePath);
    const translated = structure(join(dir, name));
    assert.equal(
      translated,
      baseStruct,
      `${name} does not match the section structure of ${parsed.base}.md.\n` +
        `  ${parsed.base}.md: ${baseStruct}\n  ${name}: ${translated}\n` +
        `  A section was probably added to one language and not the others.`
    );
    pairs++;
  }
}

// Zero pairs would mean the glob stopped matching and the check silently passed.
assert.ok(pairs >= 2, `expected at least 2 translated documents, found ${pairs}`);

console.log(`ALL PASS (${pairs} translated documents)`);
