/**
 * The timeline viewport gate's verdict, kept apart from the script that drives Chrome so it can be tested.
 */

/** Nearest-rank percentile: `ratio` 0.95 of 315 values is the 16th-worst. */
export function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

/** The p95 pair a tier is held to; the CI virtualized arm has its own, tighter one. */
export function responsivenessLimits(budgets, tier, rowVirtualization) {
  if (tier === "primary")
    return {
      interactionLimitMs: budgets.interactionP95Ms,
      frameIntervalLimitMs: budgets.frameIntervalP95Ms,
    };
  if (tier === "ci" && rowVirtualization === "on")
    return {
      interactionLimitMs: budgets.ciVirtualizedInteractionP95Ms,
      frameIntervalLimitMs: budgets.ciVirtualizedFrameIntervalP95Ms,
    };
  return {
    interactionLimitMs: budgets.constrainedInteractionP95Ms,
    frameIntervalLimitMs: budgets.constrainedFrameIntervalP95Ms,
  };
}

function assertSampleCount(expected, interactions, frameIntervals) {
  if (expected > 0 && interactions.length === expected && frameIntervals.length === expected)
    return;
  throw new Error(
    `Expected ${expected} scroll samples, measured ${interactions.length} interactions ` +
      `and ${frameIntervals.length} frame intervals`,
  );
}

/**
 * p95 over every measured step pooled: one run's p95 is only its 4th-worst step, so a brief runner stall failed it.
 * Throws when any run is short of samples, so a missing measurement cannot read as a fast one.
 */
export function judgeResponsiveness(
  runs,
  { samplesPerRun, interactionLimitMs, frameIntervalLimitMs },
) {
  const interactions = runs.flatMap((run) => run.interactions);
  const frameIntervals = runs.flatMap((run) => run.frameIntervals);
  assertSampleCount(runs.length * samplesPerRun, interactions, frameIntervals);
  const interactionP95Ms = percentile(interactions, 0.95);
  const frameIntervalP95Ms = percentile(frameIntervals, 0.95);
  return {
    interactionP95Ms,
    frameIntervalP95Ms,
    passed: interactionP95Ms <= interactionLimitMs && frameIntervalP95Ms <= frameIntervalLimitMs,
  };
}

/** Excess over-budget steps beyond this many standard deviations of the difference of two counts is not chance. */
const SLOWER_THAN_BASE_SIGMAS = 3;

const ONE_FRAME_MS = 1000 / 60;

/** A slow stretch of a shared runner makes a run of steps late together, so an excess must also be 1% of steps. */
const MIN_EXCESS_SHARE = 0.01;

function countExcess(head, base, steps) {
  const allowedExcess = SLOWER_THAN_BASE_SIGMAS * Math.sqrt(head + base) + MIN_EXCESS_SHARE * steps;
  return { head, base, allowedExcess, slower: head - base > allowedExcess };
}

/** Counted at the budget and a frame past it, so making already-late steps later also counts as slower. */
function overBudgetExcess(headValues, baseValues, limitMs) {
  const over = (values, ms) => values.filter((value) => value > ms).length;
  const steps = headValues.length;
  const atBudget = countExcess(over(headValues, limitMs), over(baseValues, limitMs), steps);
  const frameLater = countExcess(
    over(headValues, limitMs + ONE_FRAME_MS),
    over(baseValues, limitMs + ONE_FRAME_MS),
    steps,
  );
  return { atBudget, frameLater, slower: atBudget.slower || frameLater.slower };
}

/**
 * For a head that missed the budget twice: measured against its base in alternating blocks on the same machine,
 * it fails if it misses the budget on more steps than the base does, beyond chance.
 */
export function judgeAgainstBase(headRuns, baseRuns, limits) {
  const head = judgeResponsiveness(headRuns, limits);
  const base = judgeResponsiveness(baseRuns, limits);
  const values = (runs, key) => runs.flatMap((run) => run[key]);
  const interactions = overBudgetExcess(
    values(headRuns, "interactions"),
    values(baseRuns, "interactions"),
    limits.interactionLimitMs,
  );
  const frameIntervals = overBudgetExcess(
    values(headRuns, "frameIntervals"),
    values(baseRuns, "frameIntervals"),
    limits.frameIntervalLimitMs,
  );
  return {
    head,
    base,
    interactions,
    frameIntervals,
    passed: !interactions.slower && !frameIntervals.slower,
  };
}

/** One line for the log and the CI step summary: head vs base, the counts behind the verdict, and the verdict. */
export function describeAgainstBase({ head, base, interactions, frameIntervals, passed }) {
  const pair = (count, name) =>
    `${name} ${count.head} vs ${count.base} (allowed excess ${count.allowedExcess.toFixed(1)})`;
  return [
    `interaction p95 ${head.interactionP95Ms.toFixed(1)} vs ${base.interactionP95Ms.toFixed(1)} ms`,
    pair(interactions.atBudget, "steps over budget"),
    pair(interactions.frameLater, "a frame later"),
    pair(frameIntervals.atBudget, "frame gaps over budget"),
    pair(frameIntervals.frameLater, "a frame past that"),
    passed ? "pass" : "fail",
  ].join(", ");
}

/** A failed timing attempt is measured once more, so one bad stretch of a shared runner cannot fail the gate alone. */
export const TIMING_ATTEMPTS = 2;

export function attemptPassed({ responsivenessPassed, passingRuns, requiredPassingRuns }) {
  return responsivenessPassed && passingRuns >= requiredPassingRuns;
}

/** Only timing may be settled against the base: every attempt's runs must have passed their other checks. */
const runChecksHeld = (attempts) =>
  attempts.length > 0 && attempts.every((attempt) => attempt.runChecksPassed);

export function shouldCompareWithBase(attempts) {
  return !attempts.some((attempt) => attempt.passed) && runChecksHeld(attempts);
}

/** Timing holds when an attempt passes or, once both fail, the same-machine base comparison does. */
export function timingPassed(attempts, againstBase) {
  return (
    attempts.slice(0, TIMING_ATTEMPTS).some((attempt) => attempt.passed) ||
    (againstBase?.passed === true && runChecksHeld(attempts))
  );
}

export function gatePassed({ directScrollApproved, attempts, againstBase, memoryReturned }) {
  return directScrollApproved && timingPassed(attempts, againstBase) && memoryReturned;
}
