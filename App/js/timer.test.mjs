// timer.test.mjs — run: node App/js/timer.test.mjs
// Scenarios: starting and stopping a single card, auto-resume after an interruption,
// multi-level stacks, several cards interrupted by the same target.
import assert from "node:assert/strict";
import { startTask, completeTask, removeTask } from "./timer.js";

function makeTask(id, createdAt) {
  return {
    id, title: id, tags: [], status: "estimated", intervals: [],
    selectedApproach: null, interruptedBy: null, model: null,
    templateVersion: null, createdAt, completedAt: null,
  };
}

const A = makeTask("A", "2026-07-07T01:00:00.000Z");
const B = makeTask("B", "2026-07-07T02:00:00.000Z");
const tasks = [A, B];
const openIntervals = () => tasks.flatMap((t) => t.intervals).filter((iv) => iv.end === null).length;

// 1. A starts
startTask(tasks, "A", "a1", "T1");
assert.equal(A.status, "active");
assert.equal(A.selectedApproach, "a1");
assert.deepEqual(A.intervals, [{ start: "T1", end: null }]);

// 2. B starts, so A gets interrupted
startTask(tasks, "B", "a1", "T2");
assert.equal(A.status, "interrupted");
assert.equal(A.interruptedBy, "B");
assert.deepEqual(A.intervals, [{ start: "T1", end: "T2" }]);
assert.equal(B.status, "active");

// 3. B completes, so A resumes on its own
completeTask(tasks, "B", "T3");
assert.equal(B.status, "done");
assert.equal(B.completedAt, "T3");
assert.equal(A.status, "active");
assert.equal(A.interruptedBy, null);
assert.deepEqual(A.intervals, [{ start: "T1", end: "T2" }, { start: "T3", end: null }]);

// 4. A completes: no open interval (end = null) left anywhere in the system
completeTask(tasks, "A", "T4");
assert.equal(A.status, "done");
assert.equal(openIntervals(), 0);

// 5. A restarts (keeping the approach it already had); completing again moves completedAt
startTask(tasks, "A", null, "T5");
assert.equal(A.status, "active");
assert.equal(A.selectedApproach, "a1");
assert.equal(A.intervals.length, 3);
completeTask(tasks, "A", "T6");
assert.equal(A.completedAt, "T6");
assert.equal(openIntervals(), 0);

// Edge case: two cards name the same interrupter; only the newest one (by createdAt) resumes
const C = makeTask("C", "2026-07-07T03:00:00.000Z");
const D = makeTask("D", "2026-07-07T04:00:00.000Z");
const E = makeTask("E", "2026-07-07T05:00:00.000Z");
C.status = "interrupted"; C.interruptedBy = "E";
D.status = "interrupted"; D.interruptedBy = "E";
E.status = "active"; E.intervals = [{ start: "T7", end: null }];
completeTask([C, D, E], "E", "T8");
assert.equal(D.status, "active");
assert.equal(C.status, "interrupted");

// Edge case: a card that is already running must not get a second open interval from the
// resume path (the old "done and still ticking" bug)
const F = makeTask("F", "2026-07-07T06:00:00.000Z");
const G = makeTask("G", "2026-07-07T07:00:00.000Z");
F.status = "active"; F.interruptedBy = "G"; F.intervals = [{ start: "T9", end: null }];
G.status = "active"; G.intervals = [{ start: "T9", end: null }];
completeTask([F, G], "G", "T10");
assert.equal(F.intervals.length, 1);
completeTask([F, G], "F", "T11");
assert.equal(F.intervals.filter((x) => x.end === null).length, 0);

// Edge case: restarting a card by hand clears interruptedBy
const H = makeTask("H", "2026-07-07T08:00:00.000Z");
H.status = "interrupted"; H.interruptedBy = "X"; H.intervals = [{ start: "T9", end: "T10" }];
startTask([H], "H", null, "T11");
assert.equal(H.interruptedBy, null);

// Edge case: deleting an interrupter repairs the stack.
// Deleting the top (active) card puts the card it interrupted back on the clock.
const P = makeTask("P", "2026-07-07T09:00:00.000Z");
const Q = makeTask("Q", "2026-07-07T10:00:00.000Z");
P.status = "interrupted"; P.interruptedBy = "Q"; P.intervals = [{ start: "T1", end: "T2" }];
Q.status = "active"; Q.intervals = [{ start: "T2", end: null }];
removeTask([P, Q], "Q", "T3");
assert.equal(P.status, "active");
assert.equal(P.interruptedBy, null);
assert.deepEqual(P.intervals[1], { start: "T3", end: null });

// Deleting a card in the middle: whoever was waiting on it re-points to the card above
// and stays interrupted
const R = makeTask("R", "2026-07-07T11:00:00.000Z");
const S = makeTask("S", "2026-07-07T12:00:00.000Z");
const U = makeTask("U", "2026-07-07T13:00:00.000Z");
R.status = "interrupted"; R.interruptedBy = "S"; R.intervals = [{ start: "T1", end: "T2" }];
S.status = "interrupted"; S.interruptedBy = "U"; S.intervals = [{ start: "T2", end: "T3" }];
U.status = "active"; U.intervals = [{ start: "T3", end: null }];
removeTask([R, S, U], "S", "T4");
assert.equal(R.status, "interrupted");
assert.equal(R.interruptedBy, "U");
completeTask([R, U], "U", "T5");
assert.equal(R.status, "active");

console.log("ALL PASS");
