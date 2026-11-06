#!/usr/bin/env node
/**
 * Reproducible timeline viewport gate against a running Studio preview of the
 * adjacent fixture. The script prints machine-readable evidence; it never
 * substitutes synthetic timings for a browser run.
 *
 * STUDIO_URL=http://127.0.0.1:5190/#project/timeline-virtualization \
 *   node packages/studio/tests/e2e/timeline-virtualization.mjs
 *
 * TIMELINE_TIER selects the budget set and the emulation applied. "primary" is
 * a developer machine and holds the strict budgets. "low-resource" and
 * "high-dpr" add CPU throttling and a 2x scale factor respectively. "ci" is a
 * shared runner with no emulation: its virtualized arm holds its own limits
 * (responsivenessLimits), its unvirtualized arm the constrained ones. Throttling
 * it further would measure the throttle, not the build.
 * CI also requires production React and reports the observed runtime so Vite's
 * development-only checks can never contaminate the shipped-code measurement.
 *
 * TIMELINE_ROW_VIRTUALIZATION selects which build is under test and defaults to
 * "on", the product default. The script asserts the configuration it observes
 * rather than trusting the caller: the server is configured by whoever started
 * it, and a mismatch would otherwise pass silently against the wrong build.
 *
 * BASE_STUDIO_URL serves the fixture from the base commit. If every timing attempt misses the
 * budget, head and base alternate on this machine; the head fails only if slower (judgeAgainstBase).
 */
import { platform, arch } from "node:os";
import { launchStudioChrome } from "./chrome-executable.mjs";
import {
  attemptPassed,
  describeAgainstBase,
  gatePassed,
  judgeAgainstBase,
  judgeResponsiveness,
  responsivenessLimits,
  shouldCompareWithBase,
  TIMING_ATTEMPTS,
  timingPassed,
} from "./timeline-viewport-verdict.mjs";

const STUDIO_URL = process.env.STUDIO_URL;
const BASE_STUDIO_URL = process.env.BASE_STUDIO_URL || null;
const BASE_COMPARISON_ROUNDS = 2;
const PROFILE = process.env.TIMELINE_PROFILE || "dense-short";
const ELEMENT_COUNT = Number(process.env.TIMELINE_ELEMENT_COUNT || 50_000);
const TIER = process.env.TIMELINE_TIER || "primary";
const ROW_VIRTUALIZATION = process.env.TIMELINE_ROW_VIRTUALIZATION || "on";
const EXPECTED_CHROME_MAJOR = process.env.TIMELINE_CHROME_MAJOR
  ? Number(process.env.TIMELINE_CHROME_MAJOR)
  : null;

if (!STUDIO_URL) {
  console.error("STUDIO_URL is required and must point at the timeline-virtualization fixture");
  process.exit(2);
}
if (
  ![1_000, 50_000].includes(ELEMENT_COUNT) ||
  !["primary", "low-resource", "high-dpr", "ci"].includes(TIER) ||
  !["off", "on"].includes(ROW_VIRTUALIZATION)
) {
  console.error(
    "TIMELINE_ELEMENT_COUNT must be 1000 or 50000; " +
      "TIMELINE_TIER must be primary, low-resource, high-dpr, or ci; " +
      "TIMELINE_ROW_VIRTUALIZATION must be off or on",
  );
  process.exit(2);
}
if (ROW_VIRTUALIZATION === "off" && ELEMENT_COUNT === 50_000) {
  // An unvirtualized build mounts a DOM node per clip. 50,000 of them does not
  // reach a steady state in any useful time, so the run would time out rather
  // than report a verdict. Refuse the combination instead of hanging on it.
  console.error(
    "TIMELINE_ROW_VIRTUALIZATION=off requires TIMELINE_ELEMENT_COUNT=1000; " +
      "the unvirtualized build mounts every clip and cannot settle at 50000",
  );
  process.exit(2);
}

async function collectHeapBytes(client) {
  const usage = await client.send("Runtime.getHeapUsage");
  return usage.usedSize;
}

async function collectRun(page, injectedLongTaskMs = 0) {
  return page.evaluate(async (longTaskProbeMs) => {
    const longTasks = [];
    const scroller = findTimelineScroller();
    const observer = observeLongTasks();
    let interactions;
    let frameIntervals;
    try {
      ({ interactions, frameIntervals } = await measureScrollInteractions(scroller));
      if (longTaskProbeMs > 0) await runLongTaskProbe(longTaskProbeMs);
    } finally {
      recordLongTasks(observer.takeRecords());
      observer.disconnect();
    }
    return {
      interactionP95Ms: percentileInPage(interactions, 0.95),
      frameIntervalP95Ms: percentileInPage(frameIntervals, 0.95),
      scrollSampleCount: interactions.length,
      interactions,
      frameIntervals,
      longestTaskMs: Math.max(0, ...longTasks),
      scrollWidth: scroller.scrollWidth,
      scrollHeight: scroller.scrollHeight,
      diagnostics: window.__studioTest.readTimelinePerformanceDiagnostics(),
    };

    function percentileInPage(values, ratio) {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
    }

    function findTimelineScroller() {
      const root = document.querySelector('[aria-label="Timeline track view"]');
      if (!(root instanceof HTMLElement)) throw new Error("Timeline root not mounted");
      const scroller = root.querySelector("[data-timeline-scroll-viewport]");
      if (!(scroller instanceof HTMLElement)) throw new Error("Timeline scroller not mounted");
      return scroller;
    }

    function recordLongTasks(entries) {
      for (const entry of entries) longTasks.push(entry.duration);
    }

    function observeLongTasks() {
      if (
        typeof PerformanceObserver !== "function" ||
        !PerformanceObserver.supportedEntryTypes.includes("longtask")
      ) {
        throw new Error(
          "The Long Tasks API is required to enforce the timeline responsiveness gate",
        );
      }
      const performanceObserver = new PerformanceObserver((list) => {
        recordLongTasks(list.getEntries());
      });
      performanceObserver.observe({ entryTypes: ["longtask"] });
      return performanceObserver;
    }

    function runLongTaskProbe(durationMs) {
      return new Promise((resolve) => {
        setTimeout(() => {
          const started = performance.now();
          while (performance.now() - started < durationMs) {
            // Deliberately block the browser task to prove the gate observes it.
          }
          setTimeout(resolve, 0);
        }, 0);
      });
    }

    async function measureScrollInteractions(timelineScroller) {
      const interactions = [];
      const frameIntervals = [];
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const ratios = [0, 0.25, 0.5, 0.75, 1, 0.5, 0];
      const sampleCount = window.__studioTest.timelineViewportBudgets.scrollSamplesPerRun;
      // Timed from the frame the jump is made in, so a step is a whole number of frames and
      // never lands at the budget by where in that frame the callback ran.
      let started = await nextFrame();
      for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const ratio = ratios[sampleIndex % ratios.length];
        timelineScroller.scrollLeft = Math.round(
          (timelineScroller.scrollWidth - timelineScroller.clientWidth) * ratio,
        );
        timelineScroller.scrollTop = Math.round(
          (timelineScroller.scrollHeight - timelineScroller.clientHeight) * ratio,
        );
        const firstFrame = await nextFrame();
        const secondFrame = await nextFrame();
        interactions.push(secondFrame - started);
        frameIntervals.push(secondFrame - firstFrame);
        started = secondFrame;
      }
      return { interactions, frameIntervals };
    }
  }, injectedLongTaskMs);
}

async function assertLongTaskCapture(browser, longTaskLimitMs, scrollSamplesPerRun) {
  const page = await browser.newPage();
  const injectedDurationMs = longTaskLimitMs + 25;
  try {
    await page.setContent(`
      <div aria-label="Timeline track view">
        <div data-timeline-scroll-viewport style="width:100px;height:100px;overflow:auto">
          <div style="width:1000px;height:1000px"></div>
        </div>
      </div>
    `);
    await page.evaluate((sampleCount) => {
      window.__studioTest = {
        timelineViewportBudgets: { scrollSamplesPerRun: sampleCount },
        readTimelinePerformanceDiagnostics: () => ({}),
      };
    }, scrollSamplesPerRun);
    const probe = await collectRun(page, injectedDurationMs);
    if (probe.longestTaskMs <= longTaskLimitMs) {
      throw new Error(
        `Long Tasks observer missed an injected ${injectedDurationMs}ms browser task: ` +
          `observed ${probe.longestTaskMs}ms against a ${longTaskLimitMs}ms limit`,
      );
    }
    return {
      injectedDurationMs,
      observedLongestTaskMs: probe.longestTaskMs,
    };
  } finally {
    await page.close();
  }
}

async function measureMaximumReliableScrollWidth(page) {
  return page.evaluate(() => {
    const viewportWidth = 320;
    const container = document.createElement("div");
    const content = document.createElement("div");
    container.style.cssText = `position:fixed;left:-10000px;top:0;width:${viewportWidth}px;height:1px;overflow:auto`;
    content.style.height = "1px";
    container.append(content);
    document.body.append(container);
    const reliable = (width) => {
      content.style.width = `${width}px`;
      container.scrollLeft = width;
      const expected = width - viewportWidth;
      return container.scrollWidth >= width - 1 && container.scrollLeft >= expected - 1;
    };
    let low = 0;
    let high = 64_000_000;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (reliable(middle)) low = middle;
      else high = middle;
    }
    container.remove();
    return low;
  });
}

const { browser, executablePath } = await launchStudioChrome();
let exitCode = 1;
try {
  const version = await browser.version();
  const chromeMajor = Number(/(?:Chrome|Chromium)\/(\d+)/.exec(version)?.[1]);
  if (EXPECTED_CHROME_MAJOR !== null && chromeMajor !== EXPECTED_CHROME_MAJOR) {
    throw new Error(
      `Pinned Chrome ${EXPECTED_CHROME_MAJOR} required, received ${version}. ` +
        "Override TIMELINE_CHROME_MAJOR only when intentionally recording a new baseline.",
    );
  }
  const { page, client, runtimeMode } = await openStudio(browser, STUDIO_URL);

  await loadFixtureAndWait(page, 1_000, PROFILE);
  await client.send("HeapProfiler.collectGarbage");
  const baselineHeapBytes = await collectHeapBytes(client);

  const budgets = await page.evaluate(() => window.__studioTest.timelineViewportBudgets);
  const longTaskLimitMs =
    TIER === "primary" ? budgets.longTaskLimitMs : budgets.constrainedLongTaskLimitMs;
  const longTaskObserverProbe = await assertLongTaskCapture(
    browser,
    longTaskLimitMs,
    budgets.scrollSamplesPerRun,
  );
  const summary = await loadFixtureAndWait(page, ELEMENT_COUNT, PROFILE);
  const measuredMaxReliableScrollWidth = await measureMaximumReliableScrollWidth(page);

  const observedClipRoots = await assertRowVirtualization(page, budgets);

  const { interactionLimitMs, frameIntervalLimitMs } = responsivenessLimits(
    budgets,
    TIER,
    ROW_VIRTUALIZATION,
  );
  const limits = {
    samplesPerRun: budgets.scrollSamplesPerRun,
    interactionLimitMs,
    frameIntervalLimitMs,
  };
  // Latency, long tasks and memory are product promises and hold for both
  // builds. The DOM-size budgets describe what windowing achieves, so they only
  // apply when windowing is on. They are skipped explicitly rather than relaxed,
  // so a skipped budget never reads as a passed one.
  const domBudgetsApply = ROW_VIRTUALIZATION === "on";
  const attempts = [];
  while (attempts.length < TIMING_ATTEMPTS && !attempts.some((attempt) => attempt.passed)) {
    const runs = await collectMeasuredRuns(page, budgets.warmupRuns, budgets.measuredRuns);
    for (const run of runs) {
      run.longTaskPassed = run.longestTaskMs <= longTaskLimitMs;
      run.timelineMounted = run.diagnostics.timelineRoots === 1;
      run.domSizePassed = domBudgetsApply
        ? run.diagnostics.mountedRows <= budgets.maxMountedRows &&
          run.diagnostics.mountedClipRoots <= budgets.maxMountedClipRoots &&
          run.diagnostics.maxMountedClipRootsInOneRow <= budgets.maxMountedClipRootsPerRow &&
          run.diagnostics.mountedTimelineDescendants <= budgets.maxMountedTimelineDescendants
        : null;
      run.passed = run.longTaskPassed && run.timelineMounted && run.domSizePassed !== false;
    }
    const responsiveness = judgeResponsiveness(runs, limits);
    const passingRuns = runs.filter((run) => run.passed).length;
    const attempt = {
      attempt: attempts.length + 1,
      interactionP95Ms: responsiveness.interactionP95Ms,
      frameIntervalP95Ms: responsiveness.frameIntervalP95Ms,
      responsivenessPassed: responsiveness.passed,
      passingRuns,
      runChecksPassed: passingRuns >= budgets.requiredPassingRuns,
      passed: attemptPassed({
        responsivenessPassed: responsiveness.passed,
        passingRuns,
        requiredPassingRuns: budgets.requiredPassingRuns,
      }),
      runs,
    };
    attempts.push(attempt);
    console.error(
      `timeline gate ${ROW_VIRTUALIZATION} attempt ${attempt.attempt}: ` +
        `interaction p95 ${attempt.interactionP95Ms.toFixed(1)}/${interactionLimitMs} ms, ` +
        `frame p95 ${attempt.frameIntervalP95Ms.toFixed(1)}/${frameIntervalLimitMs} ms, ` +
        `${passingRuns}/${runs.length} runs passed, ${attempt.passed ? "PASS" : "FAIL"}`,
    );
  }

  await page.evaluate(() => window.__studioTest.resetTimelinePerformanceFixture());
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Timeline track view"]') === null,
  );
  await waitForStudioTestHookSettle(page);
  await loadFixtureAndWait(page, 1_000, PROFILE);
  await client.send("HeapProfiler.collectGarbage");
  const returnedHeapBytes = await collectHeapBytes(client);
  const memoryReturned =
    returnedHeapBytes <= baselineHeapBytes * (1 + budgets.memoryReturnToleranceRatio);
  // Closed first, so the comparison's pages are the only ones the runner renders.
  await page.close();
  const againstBase =
    BASE_STUDIO_URL && shouldCompareWithBase(attempts)
      ? await measureAgainstBase(budgets, limits)
      : null;

  const maxTimelineContentWidthPx = Math.max(
    0,
    ...attempts.flatMap((attempt) => attempt.runs.map((run) => run.scrollWidth)),
  );
  const directScrollGate = {
    safetyEnvelopePx: budgets.directScrollSafetyPx,
    maxTimelineContentWidthPx,
    measuredMaxReliableScrollWidth,
    decision:
      maxTimelineContentWidthPx <= budgets.directScrollSafetyPx &&
      measuredMaxReliableScrollWidth >= maxTimelineContentWidthPx
        ? "approved"
        : "rejected",
  };
  const evidence = {
    environment: {
      browser: version,
      executablePath,
      os: platform(),
      architecture: arch(),
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: TIER === "high-dpr" ? 2 : 1,
      cpuThrottleRate: TIER === "low-resource" ? 4 : 1,
      tier: TIER,
      runtimeMode,
      longTaskObserverProbe,
      rowVirtualization: ROW_VIRTUALIZATION,
      observedClipRootsAtLoad: observedClipRoots,
      appliedBudgets: {
        interactionP95Ms: interactionLimitMs,
        frameIntervalP95Ms: frameIntervalLimitMs,
        longTaskLimitMs,
        domSizeBudgets: domBudgetsApply ? "applied" : "skipped (unvirtualized build)",
      },
      fixture: summary,
      runProtocol: {
        scrollSamplesPerRun: budgets.scrollSamplesPerRun,
        warmups: budgets.warmupRuns,
        measured: budgets.measuredRuns,
        requiredPassing: budgets.requiredPassingRuns,
        timingAttempts: TIMING_ATTEMPTS,
      },
    },
    directScrollGate,
    attempts,
    againstBase,
    aggregate: {
      timingPassed: timingPassed(attempts, againstBase),
      baselineHeapBytes,
      returnedHeapBytes,
      memoryReturned,
    },
  };
  console.log(JSON.stringify(evidence, null, 2));
  exitCode = gatePassed({
    directScrollApproved: directScrollGate.decision === "approved",
    attempts,
    againstBase,
    memoryReturned,
  })
    ? 0
    : 1;
} finally {
  await browser.close();
}
process.exit(exitCode);

async function collectMeasuredRuns(page, warmupRuns, measuredRuns) {
  const runs = [];
  for (let index = 0; index < warmupRuns + measuredRuns; index += 1) {
    const run = await collectRun(page);
    if (index >= warmupRuns) runs.push(run);
  }
  return runs;
}

/** Head and base in alternating blocks on this machine, each block alone in a freshly opened Chrome. */
async function measureAgainstBase(budgets, limits) {
  const urls = { head: STUDIO_URL, base: BASE_STUDIO_URL };
  const runs = { head: [], base: [] };
  for (let round = 0; round < BASE_COMPARISON_ROUNDS; round += 1) {
    for (const side of round % 2 === 0 ? ["head", "base"] : ["base", "head"]) {
      runs[side].push(...(await measureFreshStudio(urls[side], budgets)));
    }
  }
  const verdict = judgeAgainstBase(runs.head, runs.base, limits);
  const summary = describeAgainstBase(verdict);
  console.error(`timeline gate ${ROW_VIRTUALIZATION} against base: ${summary}`);
  return { rounds: BASE_COMPARISON_ROUNDS, ...verdict, summary, runs };
}

async function measureFreshStudio(url, budgets) {
  const { browser } = await launchStudioChrome();
  try {
    const { page } = await openStudio(browser, url);
    await loadFixtureAndWait(page, ELEMENT_COUNT, PROFILE);
    await assertRowVirtualization(page, budgets);
    return await collectMeasuredRuns(page, budgets.warmupRuns, budgets.measuredRuns);
  } finally {
    await browser.close();
  }
}

async function openStudio(browser, url) {
  const page = await browser.newPage();
  await page.setViewport({
    width: 1440,
    height: 900,
    deviceScaleFactor: TIER === "high-dpr" ? 2 : 1,
  });
  const client = await page.createCDPSession();
  if (TIER === "low-resource") {
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForFunction(
    () => typeof window.__studioTest?.loadTimelinePerformanceFixture === "function",
    { timeout: 30_000 },
  );
  await waitForStudioTestHookSettle(page);
  return { page, client, runtimeMode: await assertProductionRuntime(page) };
}

async function assertProductionRuntime(page) {
  const runtimeMode = await page.evaluate(() => window.__studioTest.runtimeMode);
  if (TIER === "ci" && runtimeMode !== "production") {
    throw new Error(
      `Timeline CI must measure the production React runtime, received ${runtimeMode}. ` +
        "Start the Studio development server with NODE_ENV=production.",
    );
  }
  return runtimeMode;
}

async function assertRowVirtualization(page, budgets) {
  // Trust the DOM, not the caller. A virtualized build cannot mount every clip
  // and an unvirtualized one cannot avoid it, so the mounted count says which
  // build is really being measured.
  const observedClipRoots = await page.evaluate(
    () => window.__studioTest.readTimelinePerformanceDiagnostics().mountedClipRoots,
  );
  const observedRowVirtualization = observedClipRoots <= budgets.maxMountedClipRoots ? "on" : "off";
  if (observedRowVirtualization !== ROW_VIRTUALIZATION) {
    throw new Error(
      `Requested TIMELINE_ROW_VIRTUALIZATION=${ROW_VIRTUALIZATION} but the server under test ` +
        `behaves as ${observedRowVirtualization}: ${observedClipRoots} clip roots mounted for ` +
        `${ELEMENT_COUNT} elements against a ${budgets.maxMountedClipRoots} budget. ` +
        "Set VITE_STUDIO_TIMELINE_ROW_VIRTUALIZATION_ENABLED on the Studio dev server to match.",
    );
  }
  return observedClipRoots;
}

async function waitForFixtureRender(page, elementCount) {
  const deadline = Date.now() + 60_000;
  let observed = null;
  while (Date.now() < deadline) {
    observed = await page.evaluate(() => ({
      modelCount: window.__playerStore?.getState().elements.length ?? null,
      renderedCount:
        document
          .querySelector('[aria-label="Timeline track view"]')
          ?.getAttribute("data-timeline-element-count") ?? null,
    }));
    if (observed.renderedCount === String(elementCount)) {
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timeline fixture ${elementCount} did not render: ${JSON.stringify(observed)}`);
}

async function loadFixtureAndWait(page, elementCount, profile) {
  const summary = await page.evaluate(
    ({ count, fixtureProfile }) =>
      window.__studioTest.loadTimelinePerformanceFixture({
        elementCount: count,
        profile: fixtureProfile,
      }),
    { count: elementCount, fixtureProfile: profile },
  );
  await waitForFixtureRender(page, elementCount);
  return summary;
}

async function waitForStudioTestHookSettle(page) {
  await page.evaluate(
    // The callback must poll the window-scoped hook across two animation frames:
    // both identity stability and function readiness are part of the browser contract.
    // fallow-ignore-next-line complexity
    async () => {
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      for (;;) {
        const candidate = window.__studioTest;
        await nextFrame();
        await nextFrame();
        if (
          candidate === window.__studioTest &&
          typeof candidate?.loadTimelinePerformanceFixture === "function"
        ) {
          return;
        }
      }
    },
  );
}
