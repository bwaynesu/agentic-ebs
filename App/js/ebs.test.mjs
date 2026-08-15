// ebs.test.mjs — run: node App/js/ebs.test.mjs
import assert from "node:assert/strict";
import {
  intervalWorkHours,
  intervalElapsedHours,
  taskOffHours,
  offHourSegments,
  edgeOffSegments,
  taskActualHours,
  caseVelocity,
  caseIdealHours,
  numHours,
  effectivePool,
  monteCarlo,
  distribution,
  bufferRatio,
  tooOld,
  defaultDayHours,
  dayKey,
  dayWindow,
  elapsedHoursOf,
  defaultDayOverride,
  intervalDayKeys,
  pendingConfirmDays,
  median,
  velocityExclusion,
  needsOffHoursDecision,
  hasPendingOffHours,
  hasUnconfirmedDay,
} from "./ebs.js";

// Taipei, UTC+8. Working hours 09:00–17:00, no lunch break, Monday to Friday.
// A full working day therefore has a capacity of 8h.
const s = {
  timezone: "Asia/Taipei",
  workStart: "09:00",
  workEnd: "17:00",
  breaks: [],
  workdays: [1, 2, 3, 4, 5],
  velocityMaxAgeMonths: 6,
  coldStartVelocities: [0.3, 0.5, 0.7, 1.0, 1.3],
  minVelocitySamples: 6,
  promptTemplateVersion: "3",
};
// With a 12:00–13:00 lunch break the capacity drops to 7h
const sLunch = { ...s, breaks: [{ start: "12:00", end: "13:00" }] };

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) <= 0.01, `${label}: got ${actual}, expected ${expected} ±0.01`);
}

// 1. A whole weekday (Taipei Monday 00:00–24:00) falls inside the window → 8
close(intervalWorkHours("2026-07-05T16:00:00Z", "2026-07-06T16:00:00Z", {}, s), 8, "case 1 a whole weekday");

// 2. Taipei Monday 12:00–24:00: the overlap with the 09–17 window is only 12–17 → 5
close(intervalWorkHours("2026-07-06T04:00:00Z", "2026-07-06T16:00:00Z", {}, s), 5, "case 2 half a weekday");

// 3. A whole Saturday (not a workday) → 0
close(intervalWorkHours("2026-07-03T16:00:00Z", "2026-07-04T16:00:00Z", {}, s), 0, "case 3 a whole Saturday");

// 4. A short same-day session (Taipei Monday 10:19:21–11:14:53) entirely inside the window →
//    elapsed time ≈0.926, no longer discounted
close(intervalWorkHours("2026-07-06T02:19:21Z", "2026-07-06T03:14:53Z", {}, s), 0.9256, "case 4 short same-day session");
close(intervalElapsedHours("2026-07-06T02:19:21Z", "2026-07-06T03:14:53Z"), 0.9256, "case 4b elapsed time");

// 5. Overnight (Taipei Monday 16:00 → Tuesday 10:00): only 16–17 plus 09–10 = 2h, the night is excluded
close(intervalWorkHours("2026-07-06T08:00:00Z", "2026-07-07T02:00:00Z", {}, s), 2, "case 5 overnight counts only what is inside the window");

// 6. Lunch break deduction: a whole weekday → 7; 11–14 across the break → 2 (3h minus the 1h break)
close(intervalWorkHours("2026-07-05T16:00:00Z", "2026-07-06T16:00:00Z", {}, sLunch), 7, "case 6 whole day minus lunch");
close(intervalWorkHours("2026-07-06T03:00:00Z", "2026-07-06T06:00:00Z", {}, sLunch), 2, "case 6b spanning lunch");

// 7. Calendar overrides: off → 0; a custom 09–13 window → 4
close(intervalWorkHours("2026-07-05T16:00:00Z", "2026-07-06T16:00:00Z", { "2026-07-06": { off: true } }, s), 0, "case 7 day-off override");
close(
  intervalWorkHours("2026-07-05T16:00:00Z", "2026-07-06T16:00:00Z", { "2026-07-06": { start: "09:00", end: "13:00", confirmed: true } }, s),
  4,
  "case 7b custom window override"
);

// 8. Capacity conversion
close(defaultDayHours(sLunch), 7, "case 8c defaultDayHours minus lunch");

// 9. Two working days spanning everything except the weekend → only those two windows count = 16h
const task = { intervals: [{ start: "2026-07-05T16:00:00Z", end: "2026-07-07T16:00:00Z" }] };
close(taskActualHours(task, {}, s, "2026-07-08T00:00:00Z"), 16, "case 9 two whole working days");

// 10. monteCarlo with a single velocity → all three percentiles are 16
const mc = monteCarlo(8, [0.5], 100);
close(mc.p5, 16, "case 10 p5");
close(mc.p50, 16, "case 10 p50");
close(mc.p95, 16, "case 10 p95");

// 10b. distribution: no sampling, so the same input always gives the same output
const d1 = distribution(6, [0.4, 0.5, 0.6, 0.8, 1.0, 1.2]); // → 15, 12, 10, 7.5, 6, 5
close(d1.p5, 5, "case 10b p5 = most optimistic");
close(d1.p50, 7.5, "case 10b p50 = the 3rd value (ceil(0.5*6)-1=2)");
// The first 5 cover only 5/6 = 83%, so P95 has to include the worst one; floor(q*(k-1)) would wrongly give 12
close(d1.p95, 15, "case 10b p95 = most pessimistic");
assert.deepEqual(distribution(6, [0.4, 0.5, 0.6, 0.8, 1.0, 1.2]), d1, "case 10b recomputing gives the same result");
assert.equal(distribution(6, []), null, "case 10b an empty pool returns null");
// The output must be one of the k values the pool implies; sampling never invents a new number
const possible = [0.4, 0.5, 0.6, 0.8, 1.0, 1.2].map((v) => 6 / v);
for (const [k, v] of Object.entries(d1)) {
  assert.ok(possible.some((p) => Math.abs(p - v) < 1e-9), `case 10b ${k} must be one of the possible pool outcomes`);
}

// 10d. bufferRatio: a pool with one value collapses the distribution to a point → ratio 1;
//      spreading the pool out raises the ratio
close(bufferRatio([0.5]), 1, "case 10d a single velocity means no buffer");
close(bufferRatio([0.4, 0.5, 0.6, 0.8, 1.0, 1.2]), 2, "case 10d P95(15)÷P50(7.5)");
assert.equal(bufferRatio([]), null, "case 10d an empty pool returns null");

// 10c. tooOld: only completedAt matters, no estimate needed (callers rely on that to skip a file read)
const NOW_OLD = "2026-07-08T00:00:00Z";
assert.equal(tooOld({ completedAt: "2026-06-01T00:00:00Z" }, s, NOW_OLD), false, "case 10c within six months");
assert.equal(tooOld({ completedAt: "2025-01-01T00:00:00Z" }, s, NOW_OLD), true, "case 10c older than six months");

// 11. effectivePool cold start
const cold = effectivePool([1, 1], s);
assert.equal(cold.coldStart, true, "case 11 coldStart=true");
assert.equal(cold.pool.length, 7, "case 11 pool length");
const warm = effectivePool([1, 1, 1, 1, 1, 1], s);
assert.equal(warm.coldStart, false, "case 11 coldStart=false");

// 12. Off-window hours: Taipei Monday 18:00–19:00 (1h after hours) → 0 inside, 1 outside
const offTask = { intervals: [{ start: "2026-07-06T10:00:00Z", end: "2026-07-06T11:00:00Z" }] };
const T = "2026-07-08T00:00:00Z";
close(taskActualHours(offTask, {}, s, T), 0, "case 12 off-window time is not counted by default");
close(taskOffHours(offTask, {}, s, T), 1, "case 12 1h outside the window");
close(taskActualHours({ ...offTask, countOffHours: true }, {}, s, T), 1, "case 12 the user chose to count it");

// 13. offHourSegments: Taipei Monday 16:00–19:00 (crossing the 17:00 end of day) → only the
//     17:00–19:00 stretch is outside the window
const segs = offHourSegments("2026-07-06T08:00:00Z", "2026-07-06T11:00:00Z", {}, s);
assert.equal(segs.length, 1, "case 13 one segment");
assert.equal(segs[0].start, "2026-07-06T09:00:00.000Z", "case 13 it starts at the end of the working day, not when the task started");
assert.equal(segs[0].end, "2026-07-06T11:00:00.000Z", "case 13 end");

// 13b. A stretch falling entirely inside the lunch break: Taipei 12:22–12:37 (= UTC 04:22–04:37)
const lunch = offHourSegments("2026-07-06T04:22:00Z", "2026-07-06T04:37:00Z", {}, sLunch);
assert.equal(lunch.length, 1, "case 13b one segment");
assert.equal(lunch[0].start, "2026-07-06T04:22:00.000Z", "case 13b the whole stretch is inside the lunch break");

// 13c. The total length has to equal elapsed − work
const a13 = "2026-07-06T02:00:00Z", b13 = "2026-07-07T02:00:00Z"; // 24h overnight
const total = offHourSegments(a13, b13, {}, sLunch).reduce((x, g) => x + intervalElapsedHours(g.start, g.end), 0);
close(total, intervalElapsedHours(a13, b13) - intervalWorkHours(a13, b13, {}, sLunch), "case 13c the totals add up");

// 14. The edge rule: a timer left running overnight (Taipei Monday 16:00 → Tuesday 10:00) has its
//     off-window stretch in the middle, touching neither edge → do not ask, do not count
const overnight = { intervals: [{ start: "2026-07-06T08:00:00Z", end: "2026-07-07T02:00:00Z" }] };
close(taskOffHours(overnight, {}, s, T), 0, "case 14 a middle overnight stretch is not up for a ruling");
assert.equal(edgeOffSegments("2026-07-06T08:00:00Z", "2026-07-07T02:00:00Z", {}, s).length, 0, "case 14 no edge segments");

// 14b. Working on until 20:00 (Taipei Monday 16:00–20:00): 17:00–20:00 touches the end → 3h to rule on
const evening = { intervals: [{ start: "2026-07-06T08:00:00Z", end: "2026-07-06T12:00:00Z" }] };
close(taskOffHours(evening, {}, s, T), 3, "case 14b the overtime stretch touching the end");
close(taskActualHours({ ...evening, countOffHours: true }, {}, s, T), 4, "case 14b counted in = 1 inside plus 3 at the edge");

// 15. A custom calendar window still inherits the default breaks: on a day overridden to
//     08:30–18:30, the 12:22–12:37 lunch is still outside the window and touches an edge, so it
//     still has to be asked about
const cal15 = { "2026-07-06": { start: "08:30", end: "18:30", confirmed: true } };
close(intervalWorkHours("2026-07-06T04:22:00Z", "2026-07-06T04:37:00Z", cal15, sLunch), 0, "case 15 lunch is still excluded on an overridden day");
assert.equal(edgeOffSegments("2026-07-06T04:22:00Z", "2026-07-06T04:37:00Z", cal15, sLunch).length, 1, "case 15 the edge segment is still there");

// 16. caseVelocity pairs the scale per card (Taipei Monday 09:00–17:00 = 8h inside the window)
const day = [{ start: "2026-07-06T01:00:00Z", end: "2026-07-06T09:00:00Z" }];
const estOld = { approaches: [{ id: "a1", hours: 4 }] };
const estNew = { planningHours: 2, approaches: [{ id: "a1", hours: 4 }] };
const caseTask = { selectedApproach: "a1", intervals: day };
close(caseVelocity(caseTask, estOld, {}, s, T), 0.5, "case 16 old scale = implementation estimate ÷ implementation actual");
close(caseVelocity(caseTask, estNew, {}, s, T), 0.75, "case 16b new scale = (planning + implementation estimate) ÷ whole-case actual");
// With planningHours present and legacy planning records kept, the denominator absorbs the
// planning window hours as well (Tuesday 09:00–11:00 = 2h)
const mixed = { ...caseTask, planningIntervals: [{ start: "2026-07-07T01:00:00Z", end: "2026-07-07T03:00:00Z" }] };
close(caseVelocity(mixed, estNew, {}, s, T), 0.6, "case 16c mixed card = 6÷(8+2)");
assert.equal(caseVelocity({ selectedApproach: null, intervals: day }, estNew, {}, s, T), null, "case 16d no approach selected → null");
assert.equal(caseIdealHours(caseTask, estNew), 6, "case 16e whole-case ideal hours");

// 16f. Type guards for estimate.json. JSON written by an agent has no guaranteed types, and a
//      mistake like `1.5 + "4"` = `"1.54"` has no symptom at all — the chart still draws, the
//      velocity is still collected, and what gets dirty is the estimate of every later card.
assert.equal(numHours(4), 4);
assert.equal(numHours(2.5), 2.5);
assert.equal(numHours("4"), 4, "case 16f a numeric string is recovered (a common JSON slip)");
assert.equal(numHours(" 4.5 "), 4.5);
assert.equal(numHours("4h"), null, "case 16f a value with a unit cannot be recovered, so treat it as no estimate");
// These are the values Number() would quietly turn into 0 or 1, which is far more dangerous than
// a value with a unit: a fake number would go straight into the pool
for (const bad of [null, undefined, "", "  ", true, false, [], {}, NaN, Infinity, -3, 0]) {
  assert.equal(numHours(bad), null, `case 16f ${JSON.stringify(bad) ?? String(bad)} must not be turned into a number`);
}
// A broken hours value reaching caseIdealHours has to collapse to null (taking the existing
// approachMissing path rather than computing NaN)
assert.equal(caseIdealHours(caseTask, { planningHours: 2, approaches: [{ id: "a1", hours: "4h" }] }), null, "case 16g broken hours → null");
assert.equal(caseIdealHours(caseTask, { planningHours: 2, approaches: [{ id: "a1", hours: "4" }] }), 6, "case 16g a recovered string is still added up");
// A broken planningHours must not sink the whole card: the numerator falls back to the pure
// implementation estimate, and the denominator has to fall back with it (the scale must stay
// paired per card).
// The Chinese string here is deliberate test data: it stands for a non-numeric planningHours
// written by an agent, and any non-numeric value would do.
assert.equal(caseIdealHours(caseTask, { planningHours: "兩小時", approaches: [{ id: "a1", hours: 4 }] }), 4, "case 16h broken planningHours → fall back to the implementation estimate alone");
close(caseVelocity(mixed, { planningHours: "兩小時", approaches: [{ id: "a1", hours: 4 }] }, {}, s, T), 0.5, "case 16h the denominator falls back too, excluding legacy planning hours");

// 17. dayKey converts using settings.timezone: Sunday 16:00 UTC is already Monday in Taipei
assert.equal(dayKey(new Date("2026-07-05T16:00:00Z"), "Asia/Taipei"), "2026-07-06", "case 17 day key across time zones");
assert.equal(dayKey(new Date("2026-07-05T16:00:00Z"), "UTC"), "2026-07-05", "case 17b UTC day key");

// 18. dayWindow: default rule / day-off override / legacy hours:0 / legacy hours only
//     (no window can be reconstructed → fall back to the default)
assert.equal(dayWindow("2026-07-04", {}, s), null, "case 18 no window on Saturday");
assert.deepEqual(dayWindow("2026-07-06", {}, s), { start: 540, end: 1020, breaks: [] }, "case 18b default weekday window");
assert.equal(dayWindow("2026-07-06", { "2026-07-06": { off: true } }, s), null, "case 18c off override");
assert.equal(dayWindow("2026-07-06", { "2026-07-06": { hours: 0 } }, s), null, "case 18d legacy day off");
assert.deepEqual(dayWindow("2026-07-06", { "2026-07-06": { hours: 4 } }, s), { start: 540, end: 1020, breaks: [] }, "case 18e legacy hours only → fall back to the default");

// 19. elapsedHoursOf: takes any array of intervals, filling in now for unfinished ones;
//     undefined counts as empty
close(elapsedHoursOf([{ start: "2026-07-06T00:00:00Z", end: "2026-07-06T02:00:00Z" }], T), 2, "case 19 a finished interval");
close(elapsedHoursOf([{ start: "2026-07-06T00:00:00Z", end: null }], "2026-07-06T03:00:00Z"), 3, "case 19b a running one uses now");
close(elapsedHoursOf(undefined, T), 0, "case 19c no field → 0");

// 20. defaultDayOverride: a workday carries the default window, a non-workday is marked off
//     directly (two places in the UI share this one default)
assert.deepEqual(defaultDayOverride("2026-07-06", s), { start: "09:00", end: "17:00", confirmed: true }, "case 20 weekday");
assert.deepEqual(defaultDayOverride("2026-07-04", s), { off: true, confirmed: true }, "case 20b Saturday");

// 21. intervalDayKeys: an interval spanning several days has to collect every one of them
//     (including across the 6-hour sampling boundary)
assert.deepEqual(
  [...intervalDayKeys("2026-07-06T01:00:00Z", "2026-07-08T01:00:00Z", "Asia/Taipei")].sort(),
  ["2026-07-06", "2026-07-07", "2026-07-08"],
  "case 21 three days"
);
assert.deepEqual([...intervalDayKeys("2026-07-06T01:00:00Z", "2026-07-06T02:00:00Z", "Asia/Taipei")], ["2026-07-06"], "case 21b one key for a same-day interval");
// Taipei 23:00 → 01:00 the next day: only 2 hours, but it spans two days and both have to be asked about
assert.deepEqual(
  [...intervalDayKeys("2026-07-06T15:00:00Z", "2026-07-06T17:00:00Z", "Asia/Taipei")].sort(),
  ["2026-07-06", "2026-07-07"],
  "case 21c a short interval crossing midnight"
);

// 22. pendingConfirmDays: only days that had work on them, are in the past, and are not yet
//     confirmed need asking about
const nowFor22 = "2026-07-08T04:00:00Z"; // Taipei 2026-07-08 12:00
const tasks22 = [
  { intervals: [{ start: "2026-07-06T01:00:00Z", end: "2026-07-06T09:00:00Z" }] }, // 07-06
  { intervals: [{ start: "2026-07-07T01:00:00Z", end: null }] }, // 07-07 → still running at now (07-08)
];
assert.deepEqual(pendingConfirmDays(tasks22, {}, s, nowFor22), ["2026-07-06", "2026-07-07"], "case 22 today is not asked about, past days are");
assert.deepEqual(
  pendingConfirmDays(tasks22, { "2026-07-06": { off: true, confirmed: true } }, s, nowFor22),
  ["2026-07-07"],
  "case 22b an already confirmed day is not asked again"
);
assert.deepEqual(
  pendingConfirmDays(tasks22, { "2026-07-06": { start: "09:00", end: "17:00" } }, s, nowFor22),
  ["2026-07-06", "2026-07-07"],
  "case 22c an override without confirmed still has to be asked about"
);
assert.deepEqual(pendingConfirmDays([], {}, s, nowFor22), [], "case 22d no tasks, nothing to ask");

// 23. median: odd and even lengths, unsorted input, empty array
assert.equal(median([1]), 1, "case 23 a single element");
assert.equal(median([3, 1, 2]), 2, "case 23b unsorted input still works");
assert.equal(median([4, 1, 3, 2]), 2.5, "case 23c an even count averages the middle two");
assert.equal(median([]), null, "case 23d an empty array returns null, never NaN");
const src23 = [5, 1, 3];
median(src23);
assert.deepEqual(src23, [5, 1, 3], "case 23e it must not sort the caller's array in place");

// 24. velocityExclusion: every exclusion branch has to be reachable, and the ordering must not let
//     an earlier branch swallow a later one.
// This decision is the single source for both the velocity pool filter and the reason shown in the
// UI; get it wrong and users go fixing their cards for the wrong reason.
const NOW = "2026-07-08T00:00:00Z";
const est24 = { approaches: [{ id: "a1", hours: 4 }] };
// Baseline: Taipei Monday 09:00–17:00 = 8h inside the window, an approach selected and a
// completion time set → it counts
const ok24 = {
  status: "done",
  completedAt: "2026-07-07T00:00:00Z",
  selectedApproach: "a1",
  countOffHours: false,
  intervals: [{ start: "2026-07-06T01:00:00Z", end: "2026-07-06T09:00:00Z" }],
};
assert.equal(velocityExclusion(ok24, est24, {}, s, NOW), null, "case 24 a normal card counts");
assert.equal(velocityExclusion({ ...ok24, status: "active" }, est24, {}, s, NOW), "notDone", "case 24b not finished");
assert.equal(velocityExclusion({ ...ok24, completedAt: null }, est24, {}, s, NOW), "noCompletedAt", "case 24c no completion time");
assert.equal(velocityExclusion(ok24, null, {}, s, NOW), "noEstimate", "case 24d no estimate.json");
// Finished but still holding an open interval: the hours keep counting up to "now", growing every
// second. Bad data left behind by an older completeTask — unblocked, it quietly drags the whole
// velocity pool down (a real one was found in the user's folder).
const openIv24 = { ...ok24, intervals: [...ok24.intervals, { start: "2026-07-07T00:00:00Z", end: null }] };
assert.equal(velocityExclusion(openIv24, est24, {}, s, NOW), "openInterval", "case 24c2 finished but still ticking");
assert.equal(
  velocityExclusion({ ...openIv24, completedAt: null }, est24, {}, s, NOW),
  "noCompletedAt",
  "case 24c3 the missing completion time has to be reported first, it is the more basic problem"
);
assert.equal(velocityExclusion({ ...ok24, selectedApproach: null }, est24, {}, s, NOW), "noApproach", "case 24e no approach selected");
assert.equal(velocityExclusion({ ...ok24, selectedApproach: "zzz" }, est24, {}, s, NOW), "approachMissing", "case 24f the selected approach is not in the estimate file");
// Hours that are not a usable number means no ideal hours can be derived, which is the same kind of
// exclusion as "approach not found" (the i18n why/fix wording covers both cases)
assert.equal(
  velocityExclusion(ok24, { approaches: [{ id: "a1", hours: "4h" }] }, {}, s, NOW),
  "approachMissing",
  "case 24f2 a card with broken hours must not enter the velocity pool"
);
assert.equal(
  velocityExclusion({ ...ok24, completedAt: "2025-01-01T00:00:00Z" }, est24, {}, s, NOW),
  "tooOld",
  "case 24g past velocityMaxAgeMonths"
);
// Off-window hours at an edge with no ruling yet (countOffHours absent) → wait for the user to decide
const pending24 = { ...ok24, intervals: [{ start: "2026-07-06T08:00:00Z", end: "2026-07-06T12:00:00Z" }] };
delete pending24.countOffHours;
// The interval of pending24 lands on Taipei 2026-07-06 16:00–20:00; the window matches the default
// in s, and confirmed only states that the day is settled without changing any hour figure.
const cal24 = { "2026-07-06": { start: "09:00", end: "17:00", confirmed: true } };
assert.equal(velocityExclusion(pending24, est24, cal24, s, NOW), "offHoursPending", "case 24h off-window hours awaiting a ruling");
// All the time falls outside the window and was ruled out → 0 actual hours, so no velocity
const zero24 = { ...ok24, intervals: [{ start: "2026-07-04T02:00:00Z", end: "2026-07-04T06:00:00Z" }] };
assert.equal(velocityExclusion(zero24, est24, {}, s, NOW), "noActualHours", "case 24i counted hours are 0");

// 25. needsOffHoursDecision: only ask for finished cards, with no ruling yet, whose off-window
//     hours reach the threshold
assert.equal(needsOffHoursDecision(pending24, cal24, s, NOW), true, "case 25 awaiting a ruling");
assert.equal(needsOffHoursDecision({ ...pending24, countOffHours: false }, {}, s, NOW), false, "case 25b already ruled on, do not ask again");
assert.equal(needsOffHoursDecision({ ...pending24, status: "active" }, {}, s, NOW), false, "case 25c unfinished cards are not asked about");
assert.equal(needsOffHoursDecision(ok24, {}, s, NOW), false, "case 25d no off-window hours, nothing to ask");

// 26. While the working window of a covered day is unconfirmed, do not ask about off-window hours,
// and do not let the card slip into the velocity pool either.
// An unsettled window means the off-window hours are only provisional figures from the default
// window, so asking now means asking a question whose answer will still change.
assert.equal(needsOffHoursDecision(pending24, {}, s, NOW), false, "case 26 an unconfirmed day is not asked about");
assert.equal(velocityExclusion(pending24, est24, {}, s, NOW), "dayUnconfirmed", "case 26b an unconfirmed card is still kept out of the pool, just for a different reason");
assert.equal(hasPendingOffHours(pending24, {}, s, NOW), true, "case 26c the off-window hours are still computed, they are just not asked about yet");

// Half confirmed: a card spanning two days with only one of them confirmed → still not asked
// (one unconfirmed day is enough to block it)
const twoDay26 = { ...pending24, intervals: [{ start: "2026-07-06T08:00:00Z", end: "2026-07-07T12:00:00Z" }] };
const halfCal26 = { "2026-07-06": { start: "09:00", end: "17:00", confirmed: true } };
assert.equal(needsOffHoursDecision(twoDay26, halfCal26, s, NOW), false, "case 26d confirming one day is not enough");
assert.equal(
  needsOffHoursDecision(twoDay26, { ...halfCal26, "2026-07-07": { start: "09:00", end: "17:00", confirmed: true } }, s, NOW),
  true,
  "case 26e ask only once every covered day is confirmed"
);

// The boundaries of hasUnconfirmedDay itself
assert.equal(hasUnconfirmedDay([], {}, s, NOW), false, "case 26f no intervals means no unconfirmed days");
assert.equal(
  hasUnconfirmedDay(pending24.intervals, { "2026-07-06": { start: "09:00", end: "17:00" } }, s, NOW),
  true,
  "case 26g an override without confirmed still counts as unconfirmed"
);
assert.equal(
  hasUnconfirmedDay([{ start: "2026-07-07T01:00:00Z", end: null }], {}, s, NOW),
  true,
  "case 26h a running interval uses now as its provisional end"
);

console.log("ALL PASS");
