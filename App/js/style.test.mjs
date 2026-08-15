// style.test.mjs — static contract checks against style.css.
// Every rule here is a mistake that has already been made: a theme missing one variable,
// a forgotten color-scheme, a hardcoded color. The symptom is always "some block goes
// transparent or stays light under some theme", and only a human eye catches it.
// Pure text checks, no browser needed, and they run as part of node --test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");

const THEMES = ["light", "gray", "dark"];

// Pull out one theme block (light shares its rule with :root)
function themeBlock(name) {
  const selector = name === "light" ? ":root, :root\\[data-theme=\"light\"\\]" : `:root\\[data-theme="${name}"\\]`;
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `theme block not found: ${name}`);
  return m[1];
}

const varsOf = (block) => new Set([...block.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));

// 1. All three themes must define exactly the same set of variables.
//    Miss one and everything using it falls back to transparent or an inherited color under
//    that theme — usually reported as "the background isn't filled in".
const [light, gray, dark] = THEMES.map((t) => varsOf(themeBlock(t)));
for (const [name, set] of [["gray", gray], ["dark", dark]]) {
  const missing = [...light].filter((v) => !set.has(v));
  const extra = [...set].filter((v) => !light.has(v));
  assert.deepEqual(missing, [], `theme ${name} is missing variables: ${missing}`);
  assert.deepEqual(extra, [], `theme ${name} defines variables light does not have: ${extra}`);
}
assert.ok(light.size >= 15, `the light theme has only ${light.size} variables, which looks like an accidental deletion`);

// 2. Every theme has to declare color-scheme so the browser's own controls — scrollbars,
//    dropdowns, date pickers — switch color with it.
//    Symptom when it is missing: a white scrollbar in dark mode, which reads as an unpainted background.
for (const t of THEMES) {
  assert.match(themeBlock(t), /color-scheme:\s*(light|dark)/, `theme ${t} does not declare color-scheme`);
}
assert.match(themeBlock("light"), /color-scheme:\s*light/);
for (const t of ["gray", "dark"]) assert.match(themeBlock(t), /color-scheme:\s*dark/, `${t} should use the dark color scheme`);

// 3. The page background belongs on html, not on body alone. Relying on body's background
//    propagating to the canvas leaves a white strip below short content.
const htmlRule = css.match(/^html\s*\{([^}]*)\}/m);
assert.ok(htmlRule, "html rule not found");
assert.match(htmlRule[1], /background:\s*var\(--bg\)/, "html must set background: var(--bg)");

// 4. No hardcoded colors outside the theme blocks — a literal color never follows the theme.
const outside = css.replace(/:root[^{]*\{[^}]*\}/g, "");
const hardcoded = [...outside.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
assert.deepEqual(hardcoded, [], `hardcoded colors outside the theme blocks: ${hardcoded} (use var(--…) instead)`);

// 5. Absolutely positioned labels must not hang outside their container with top: 100% —
//    they cover whatever comes next (the distribution axis ticks did exactly that to the approach cards).
//    Overlays (tooltips, dropdowns) are exempt: they carry a z-index and are meant to sit
//    above the content rather than push the layout around.
const absOutside = [...css.matchAll(/\.[\w-]+\s*\{[^}]*position:\s*absolute[^}]*\}/g)]
  .map((m) => m[0])
  .filter((rule) => /top:\s*100%/.test(rule) && !/z-index:/.test(rule));
assert.deepEqual(absOutside, [], "an absolutely positioned element uses top: 100% without a z-index, so it covers the content below");

// 6. Every variable used must be defined (a typo like var(--acent) silently turns transparent)
const defined = new Set([...css.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
const undef = [...used].filter((v) => !defined.has(v) && v !== "--status-color");
assert.deepEqual(undef, [], `undefined CSS variables are used: ${undef}`);

// 7. `--*-soft` is a fill color, not a line color: under the dark theme its value sits close
//    to the background on purpose (--accent-soft is #1e2c42 against a #14161a page), so
//    drawing a solid 0-blur ring with it draws nothing at all. The "just viewed" highlight
//    ring was almost invisible in dark mode for exactly this reason, leaving only a 1px
//    border — the same border hover uses, so it read as a hovered card instead.
//    Strokes always use the base color (var(--accent), var(--ok), …); soft is for background.
const softRings = [...css.matchAll(/box-shadow:\s*0\s+0\s+0\s+[\d.]+\w*\s+var\((--[\w-]*-soft)\)/g)].map((m) => m[1]);
assert.deepEqual(softRings, [], `${softRings} draws a solid ring: soft is a fill color and disappears in dark mode, use the base color for strokes`);

console.log("ALL PASS");
