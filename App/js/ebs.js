// ebs.js — the EBS statistics. Pure functions; no DOM, no file system.

export function dayKey(date, timezone) {
  return date.toLocaleDateString("en-CA", { timeZone: timezone });
}

// "HH:MM" -> minutes since local midnight
function hm(s) {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

// Minutes since local midnight for an instant in the given time zone, seconds included as a fraction
function localMinutes(date, timezone) {
  const t = date.toLocaleTimeString("en-GB", { timeZone: timezone, hour12: false });
  const [h, m, s] = t.split(":").map(Number);
  return h * 60 + m + (s || 0) / 60;
}

function nextKey(key) {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function toWindow(o) {
  return {
    start: hm(o.workStart ?? o.start),
    end: hm(o.workEnd ?? o.end),
    breaks: (o.breaks ?? []).map((b) => ({ start: hm(b.start), end: hm(b.end) })),
  };
}

// The working window for one day, in minutes. Days off and non-working days return null.
export function dayWindow(key, calendar, settings) {
  const o = calendar[key];
  if (o) {
    if (o.off || o.hours === 0) return null; // hours===0 is how the old format marked a day off
    if (o.start && o.end) return toWindow({ ...o, breaks: o.breaks ?? settings.breaks }); // A custom window without its own breaks inherits the defaults: shifting the start or end of a day does not mean there was no lunch break.
    // The remaining old-format entries only carry hours, which cannot reconstruct a window, so fall through to the default rules.
  }
  const dow = new Date(key + "T00:00:00Z").getUTCDay();
  if (!settings.workdays.includes(dow)) return null;
  return toWindow(settings);
}

// The default override for a day: the default window on a working day, a day off otherwise.
// Shared by the calendar reminder and the settings page.
export function defaultDayOverride(key, settings) {
  const dow = new Date(key + "T00:00:00Z").getUTCDay();
  return settings.workdays.includes(dow)
    ? { start: settings.workStart, end: settings.workEnd, confirmed: true }
    : { off: true, confirmed: true };
}

// Every day key an interval touches. Sampled every 6 hours so that day boundaries and DST
// shifts cannot drop a day.
export function intervalDayKeys(startISO, endISO, timezone) {
  const keys = new Set();
  const end = new Date(endISO).getTime();
  for (let t = new Date(startISO).getTime(); t < end; t += 6 * 3600 * 1000) {
    keys.add(dayKey(new Date(t), timezone));
  }
  keys.add(dayKey(new Date(end), timezone));
  return keys;
}

// If any day these intervals touch is still unconfirmed, its window can still change, so the
// off-window hours computed right now are provisional.
export function hasUnconfirmedDay(intervals, calendar, settings, nowISO) {
  for (const iv of intervals) {
    for (const k of intervalDayKeys(iv.start, iv.end ?? nowISO, settings.timezone)) {
      if (!calendar[k]?.confirmed) return true;
    }
  }
  return false;
}

// Past days that had work on them and are not yet confirmed in the calendar, ascending.
// This is what the "hours to confirm" reminder on the home page is built from.
export function pendingConfirmDays(tasks, calendar, settings, nowISO) {
  const today = dayKey(new Date(nowISO), settings.timezone);
  const days = new Set();
  for (const t of tasks) {
    for (const iv of t.intervals) {
      for (const k of intervalDayKeys(iv.start, iv.end ?? nowISO, settings.timezone)) days.add(k);
    }
  }
  return [...days].filter((d) => d < today && !calendar[d]?.confirmed).sort();
}

function overlap(a, b, s, e) {
  return Math.max(0, Math.min(b, e) - Math.max(a, s));
}

// Minutes where the window (breaks removed) intersects the minute range [a,b] of that day
function windowMinutes(win, a, b) {
  let m = overlap(a, b, win.start, win.end);
  for (const br of win.breaks) m -= overlap(a, b, br.start, br.end);
  return Math.max(0, m);
}

// Working hours in a default working day, used to convert hours into "about X days"
export function defaultDayHours(settings) {
  return windowMinutes(toWindow(settings), 0, 1440) / 60;
}

// Hours of an active interval that fall inside the working window. Anything outside it — nights,
// days off, breaks — counts as zero. The intersection is computed in minutes, local day by local
// day, so where the interval happens to start makes no difference.
export function intervalWorkHours(startISO, endISO, calendar, settings) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (end <= start) return 0;
  const tz = settings.timezone;
  const firstKey = dayKey(start, tz);
  const lastKey = dayKey(end, tz);
  let minutes = 0;
  for (let key = firstKey; ; key = nextKey(key)) {
    const win = dayWindow(key, calendar, settings);
    if (win) {
      const a = key === firstKey ? localMinutes(start, tz) : 0;
      const b = key === lastKey ? localMinutes(end, tz) : 1440;
      minutes += windowMinutes(win, a, b);
    }
    if (key === lastKey) break;
  }
  return minutes / 60;
}

// The parts of an active interval that fall outside the window — nights, days off, breaks —
// returned as [{start, end}] in ISO. The UI uses this to name the exact stretches of time the
// user is being asked to rule on. Total length = intervalElapsedHours − intervalWorkHours.
// ponytail: each day's start is extrapolated linearly from local midnight of the first day, so a
// DST transition day is off by an hour (same ceiling as intervalWorkHours)
export function offHourSegments(startISO, endISO, calendar, settings) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (end <= start) return [];
  const tz = settings.timezone;
  const firstKey = dayKey(start, tz);
  const lastKey = dayKey(end, tz);
  const dayZeroMs = start.getTime() - localMinutes(start, tz) * 60000;
  const segs = [];
  let dayIdx = 0;
  for (let key = firstKey; ; key = nextKey(key), dayIdx++) {
    const a = key === firstKey ? localMinutes(start, tz) : 0;
    const b = key === lastKey ? localMinutes(end, tz) : 1440;
    const base = dayZeroMs + dayIdx * 1440 * 60000;
    // The minute ranges that count as work today = window ∩ [a,b], with the breaks cut out
    let inRanges = [];
    const win = dayWindow(key, calendar, settings);
    if (win) {
      const s0 = Math.max(a, win.start);
      const e0 = Math.min(b, win.end);
      inRanges = e0 > s0 ? [[s0, e0]] : [];
      for (const br of win.breaks) {
        inRanges = inRanges.flatMap(([s, e]) =>
          br.end <= s || br.start >= e
            ? [[s, e]]
            : [s < br.start ? [s, br.start] : null, e > br.end ? [br.end, e] : null].filter(Boolean)
        );
      }
    }
    // The complement: [a,b] minus inRanges
    let cursor = a;
    for (const [s, e] of inRanges) {
      if (s > cursor) segs.push([base + cursor * 60000, base + s * 60000]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < b) segs.push([base + cursor * 60000, base + b * 60000]);
    if (key === lastKey) break;
  }
  // Rejoin the segments that midnight split apart
  const merged = [];
  for (const [s, e] of segs) {
    const last = merged[merged.length - 1];
    if (last && last[1] === s) last[1] = e;
    else merged.push([s, e]);
  }
  return merged.map(([s, e]) => ({ start: new Date(s).toISOString(), end: new Date(e).toISOString() }));
}

// Wall-clock hours an active interval lasted, ignoring the window entirely
export function intervalElapsedHours(startISO, endISO) {
  return Math.max(0, (new Date(endISO) - new Date(startISO)) / 3600000);
}

// Counts only the part that falls inside the working window
export function taskWindowHours(task, calendar, settings, now) {
  return windowHoursOf(task.intervals, calendar, settings, now);
}

// Off-window segments that touch the start or the end of the interval. Someone was demonstrably
// at the keyboard at the moment they pressed start or finish, so off-window time at those edges —
// working through lunch, staying late, a push on a day off — is worth asking about. Off-window
// time stranded in the middle (going home for the night, a weekend) has no such evidence behind
// it, so the window model keeps excluding it.
export function edgeOffSegments(startISO, endISO, calendar, settings) {
  const near = (a, b) => Math.abs(new Date(a) - new Date(b)) < 1000; // ISO strings rebuilt from minutes are off by milliseconds
  return offHourSegments(startISO, endISO, calendar, settings).filter(
    (g) => near(g.start, startISO) || near(g.end, endISO)
  );
}

// The next two take any array of intervals, so the implementation track (intervals) and the
// older discussion track (planningIntervals) share one window mechanism.
export function windowHoursOf(intervals, calendar, settings, now) {
  let sum = 0;
  for (const iv of intervals) sum += intervalWorkHours(iv.start, iv.end ?? now, calendar, settings);
  return sum;
}

export function edgeOffHoursOf(intervals, calendar, settings, now) {
  let sum = 0;
  for (const iv of intervals) {
    for (const g of edgeOffSegments(iv.start, iv.end ?? now, calendar, settings)) {
      sum += intervalElapsedHours(g.start, g.end);
    }
  }
  return sum;
}

// Off-window hours the user can rule on = the edge segments of every interval, summed.
// The ruling itself is stored in task.countOffHours.
export function taskOffHours(task, calendar, settings, now) {
  return edgeOffHoursOf(task.intervals, calendar, settings, now);
}

export function taskActualHours(task, calendar, settings, now) {
  const win = taskWindowHours(task, calendar, settings, now);
  return task.countOffHours ? win + taskOffHours(task, calendar, settings, now) : win;
}

// Total wall-clock time across any array of intervals
export function elapsedHoursOf(intervals, now) {
  let sum = 0;
  for (const iv of intervals ?? []) sum += intervalElapsedHours(iv.start, iv.end ?? now);
  return sum;
}

export function taskElapsedHours(task, now) {
  return elapsedHoursOf(task.intervals, now);
}

// estimate.json is written by an agent, so nothing about its types is guaranteed. The same agent
// has also written a status into task.json that does not exist. Feed `hours: "12"` into an
// addition and you get string concatenation: `1.5 + "12"` is `"1.512"`. The chart still draws,
// velocity still accepts it, there is no symptom at all — and what gets corrupted is the estimate
// of EVERY LATER TASK. So every path that reads hours has to come through here. Numeric strings
// are recovered, since that is the common JSON slip; everything else means "no estimate". The
// genuinely dangerous recovery is Number() quietly turning null / "" / true into 0 or 1.
export function numHours(x) {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Ideal hours for the whole case. If the estimate carries planningHours (prompt v4 and later),
// that is the discussion estimate plus the estimate of the chosen approach; otherwise it falls
// back to the implementation estimate alone. null means it cannot be assessed: no approach
// picked, the estimate is missing, or the hours are not a usable number.
export function caseIdealHours(task, estimate) {
  const a = estimate?.approaches?.find((x) => x.id === task.selectedApproach);
  const h = numHours(a?.hours);
  if (h == null) return null;
  return h + (numHours(estimate.planningHours) ?? 0);
}

// Velocity for the whole case, with the scale matched per task: the denominator includes the old
// discussion actuals (planningIntervals) only when the numerator includes the discussion estimate.
// Samples of either scale are internally consistent, so both can live in one pool, and the old
// scale ages out on its own through velocityMaxAgeMonths.
export function caseVelocity(task, estimate, calendar, settings, now) {
  const ideal = caseIdealHours(task, estimate);
  if (ideal == null) return null;
  let actual = taskActualHours(task, calendar, settings, now);
  // Test with numHours rather than `!= null`: when planningHours is broken the numerator already
  // excludes it, so the denominator must exclude it too. Otherwise this one task's velocity gets
  // computed across two scales, which is exactly what the note above forbids.
  if (numHours(estimate.planningHours) != null) {
    actual += windowHoursOf(task.planningIntervals ?? [], calendar, settings, now);
  }
  return actual === 0 ? null : ideal / actual;
}

// A finished task with off-window hours nobody has ruled on stays out of velocity until they do
export const OFF_HOURS_MIN = 0.1;

// Finished, has edge off-window hours, and nobody has ruled on them yet — regardless of whether
// this is a good moment to ask.
export function hasPendingOffHours(task, calendar, settings, nowISO) {
  return (
    task.status === "done" &&
    task.countOffHours == null && // null and absent both mean "not ruled on"
    taskOffHours(task, calendar, settings, nowISO) >= OFF_HOURS_MIN
  );
}

// Whether to ask now: the off-window hours are only a settled question once every day involved
// has a confirmed window. Asking earlier asks a question whose answer can still move — the user
// rules on it, the window changes, and the ruling is void.
export function needsOffHoursDecision(task, calendar, settings, nowISO) {
  return (
    hasPendingOffHours(task, calendar, settings, nowISO) &&
    !hasUnconfirmedDay(task.intervals, calendar, settings, nowISO)
  );
}

// Completed longer ago than the pool's max age, so it ages out normally. This reads task.json
// only, never estimate.json, so callers can filter old tasks out first: however many tasks pile
// up, the number of files read stays proportional to how many were finished recently.
export function tooOld(task, settings, nowISO) {
  const cutoff = new Date(nowISO);
  cutoff.setMonth(cutoff.getMonth() - settings.velocityMaxAgeMonths);
  return new Date(task.completedAt) < cutoff;
}

// Why is this finished task not in the velocity pool? Returns a reason code, or null if it is in.
// This is the only place the pool's filter is written down. The reason shown in the UI and the
// filter that actually runs have to be the same code, or the two drift apart and the user ends up
// fixing a task according to a reason that was never the real one.
export function velocityExclusion(task, estimate, calendar, settings, nowISO) {
  if (task.status !== "done") return "notDone";
  if (!task.completedAt) return "noCompletedAt";
  // Finished but still holding an open interval is bad data; completeTask before 2026-07-20 only
  // closed the first open interval. An open interval always counts up to "now", so this task's
  // hours grow every second and its velocity falls every second. Letting it into the pool means
  // poisoning every future estimate with a drifting denominator, and nothing about it looks
  // wrong. Keep it out and make the user repair it.
  if ((task.intervals ?? []).some((iv) => iv.end == null)) return "openInterval";
  if (!estimate) return "noEstimate";
  if (!task.selectedApproach) return "noApproach";
  if (caseIdealHours(task, estimate) == null) return "approachMissing";
  if (tooOld(task, settings, nowISO)) return "tooOld";
  // Any unresolved off-window hours keep the task out of the pool. The only difference is which
  // step the user is told to take first. Turning this into "if we are not asking, let it through"
  // would sneak the task into the pool carrying provisional hours computed from a default window,
  // which is worse than asking at the wrong time.
  if (hasPendingOffHours(task, calendar, settings, nowISO)) {
    return hasUnconfirmedDay(task.intervals, calendar, settings, nowISO)
      ? "dayUnconfirmed"
      : "offHoursPending";
  }
  if (caseVelocity(task, estimate, calendar, settings, nowISO) == null) return "noActualHours";
  return null;
}

// The velocity distribution is right-skewed — one task blowing up drags the mean along with it —
// so the median is what represents a typical task.
export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function effectivePool(velocities, settings) {
  if (velocities.length >= settings.minVelocitySamples) {
    return { pool: velocities, coldStart: false };
  }
  return { pool: velocities.concat(settings.coldStartVelocities), coldStart: true };
}

// Distribution for a single task: the estimate divided by each velocity in the pool is the
// complete set of possible outcomes, each with probability 1/k. Take the empirical quantiles
// (the inverse CDF) directly, no sampling. A single task is not a sum of several, so simulation
// would only add sampling noise on top of the closed form, and the same task would show different
// P5/P95 on every refresh — and that right-hand number is the one people commit to.
// The index is ceil(q*k)-1, not floor(q*(k-1)). At k=6, q=0.95 the latter picks the 5th value
// rather than the 6th: 83% coverage labelled P95, understating exactly the end that most needs
// to be honest.
export function distribution(estimateHours, pool) {
  if (!pool.length) return null;
  const s = pool.map((v) => estimateHours / v).sort((a, b) => a - b);
  const pick = (q) => s[Math.max(0, Math.ceil(q * s.length) - 1)];
  return { p5: pick(0.05), p50: pick(0.5), p95: pick(0.95) };
}

// The buffer you need before committing to a date: how many times P50 the P95 is. The
// distribution scales purely proportionally, so this ratio does not depend on the size of the
// estimate. It is a health check on the velocity pool itself — trending down means estimates are
// converging, trending up means the work on hand has become more varied.
export function bufferRatio(pool) {
  const d = distribution(1, pool);
  return d && d.p50 ? d.p95 / d.p50 : null;
}

// Simulation is only needed when tasks are summed: draw once per task and add, and the risks
// cancel each other out with no closed form available (k velocities across n tasks is k^n
// combinations). For a single task use distribution above.
// ponytail: nothing in the UI calls this yet. It stays because project-level estimation is
// precisely what it is for, and deleting it would mean writing it back unchanged.
export function monteCarlo(estimateHours, pool, rounds, rng = Math.random) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    samples.push(estimateHours / pool[Math.floor(rng() * pool.length)]);
  }
  samples.sort((a, b) => a - b);
  const pick = (q) => samples[Math.floor(q * (samples.length - 1))];
  return { p5: pick(0.05), p50: pick(0.5), p95: pick(0.95) };
}
