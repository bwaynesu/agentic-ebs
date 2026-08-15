// timer.js — state transitions for the clock and the interruption stack.
// Pure functions: they mutate the task objects in place and return the ones they changed.
// The state flow and the interruption rules are specified in the data format doc under Docs/.

export function startTask(tasks, id, approachId, now) {
  const changed = [];
  const target = tasks.find((t) => t.id === id);

  const active = tasks.find((t) => t.status === "active" && t.id !== id);
  if (active) {
    const iv = active.intervals.find((x) => x.end === null);
    if (iv) iv.end = now;
    active.status = "interrupted";
    active.interruptedBy = id;
    changed.push(active);
  }

  target.intervals.push({ start: now, end: null });
  target.status = "active";
  target.interruptedBy = null; // Restarting by hand leaves the interruption relationship. Otherwise, completing the interrupting task would push a second open interval onto this one.
  if (approachId != null) target.selectedApproach = approachId; // A restart passes null and keeps the approach already chosen
  changed.push(target);
  return changed;
}

// Repair the stack before a task is deleted: the tasks it interrupted must not go down with it.
// Deleting a task in the middle re-points its waiters at the task above it. Deleting the one on
// top counts as completing it, so the most recent waiter resumes.
export function removeTask(tasks, id, now) {
  const target = tasks.find((t) => t.id === id);
  const waiting = tasks.filter((t) => t.interruptedBy === id);
  if (!waiting.length) return [];

  const heir = target?.interruptedBy ?? tasks.find((t) => t.status === "active" && t.id !== id)?.id ?? null;
  if (heir) {
    for (const w of waiting) w.interruptedBy = heir;
    return waiting;
  }
  waiting.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const resume = waiting[0];
  resume.intervals.push({ start: now, end: null });
  resume.status = "active";
  resume.interruptedBy = null;
  for (const other of waiting.slice(1)) other.interruptedBy = resume.id;
  return waiting;
}

export function completeTask(tasks, id, now) {
  const changed = [];
  const target = tasks.find((t) => t.id === id);
  // Close every open interval. Bad data can leave more than one behind, and a leftover open
  // interval makes a finished task keep accumulating hours, which poisons velocity.
  for (const x of target.intervals) if (x.end === null) x.end = now;
  target.status = "done";
  target.completedAt = now;
  changed.push(target);

  const waiting = tasks.filter(
    (t) => t.interruptedBy === id && t.status === "interrupted" && !t.intervals.some((x) => x.end === null)
  );
  if (waiting.length) {
    // There should only ever be one. If bad data produces several, resume the newest by
    // createdAt and leave the rest interrupted.
    waiting.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const resume = waiting[0];
    resume.intervals.push({ start: now, end: null });
    resume.status = "active";
    resume.interruptedBy = null;
    changed.push(resume);
    if (waiting.length > 1) {
      console.warn("several cards point interruptedBy at the same card; only the newest one resumes:", waiting.map((t) => t.id));
    }
  }
  return changed;
}
