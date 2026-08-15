// version.test.mjs — the sync contract for the prompt template version.
// Bumping BUNDLED_PROMPT_VERSION means editing several files at once, and memory always
// misses one. Plain text checks pin them down, so a forgotten edit turns the test red.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// Source of truth: BUNDLED_PROMPT_VERSION in store.js
const m = read("./store.js").match(/BUNDLED_PROMPT_VERSION\s*=\s*"([^"]+)"/);
assert.ok(m, "BUNDLED_PROMPT_VERSION not found in store.js");
const version = m[1];

// 1. The default settings for a new folder must not hardcode the version (a literal drifts
//    away from BUNDLED the moment someone bumps one and not the other)
assert.match(
  read("./store.js"),
  /promptTemplateVersion:\s*BUNDLED_PROMPT_VERSION/,
  "the default settings in store.js must reference BUNDLED_PROMPT_VERSION instead of a literal"
);

// 2. The sample JSON and the field description in the data format doc.
//    These search strings have to track the wording of that document: if it is reworded or
//    translated, the check stops matching and has to be updated here as well.
const schemaDoc = read("../../Docs/data-format.md");
assert.ok(
  schemaDoc.includes(`"promptTemplateVersion": "${version}"`),
  `the settings.json sample in Docs/data-format.md must be updated to ${version}`
);
assert.ok(
  schemaDoc.includes(`the bundled value is \`${version}\``),
  `the promptTemplateVersion field description in Docs/data-format.md must be updated to ${version}`
);

// 3. Changelog: the current version needs its own section, naming the files it touched.
//    Users decide whether to take the new version from this text; a changelog nothing
//    enforces will rot (same reasoning as the prompt size budgets).
const changelog = read("../prompt-changelog.md");
assert.ok(
  new RegExp(`^##\\s+${version}\\s*$`, "m").test(changelog),
  `App/prompt-changelog.md has no "## ${version}" section — bumping the version means writing the changelog entry too`
);
const section = changelog.split(new RegExp(`^##\\s+${version}\\s*$`, "m"))[1]?.split(/^##\s+/m)[0] ?? "";
assert.match(
  section,
  /^[-*]\s+`[^`]+`\s*[—-]\s+\S/m,
  `## ${version} needs "\`file name\` — why it changed" entries; the app relies on that shape to pull out the notes for each file`
);

console.log("ALL PASS");
