/**
 * Deterministic work counts for a Studio browser journey: how much work ran,
 * not how long it took, so the numbers do not move with runner load.
 * Compare them against perf-ceilings.json with perf-ratchet.mjs.
 */

/** Runs in every frame before any page script; child frames add into the top frame's tally. */
function installInPage(options) {
  const counts = sharedCounts();
  const add = (key) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  installReactHook();
  if (options.pageActivity) installPageActivity();

  // Helpers stay inside: the page receives this one function's source, nothing around it.
  function sharedCounts() {
    try {
      return (window.top.__hfWorkCounts ??= {});
    } catch {
      return (window.__hfWorkCounts ??= {});
    }
  }

  function installReactHook() {
    if (window !== window.top || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
    // React calls this hook on every commit, production builds included.
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      // The key exists once React connects, so a hook React never found reads as not measured.
      inject: () => {
        counts.reactCommits ??= 0;
        return 1;
      },
      onCommitFiberRoot: () => add("reactCommits"),
      onCommitFiberUnmount() {},
      onPostCommitFiberRoot() {},
      checkDCE() {},
    };
  }

  function installPageActivity() {
    new MutationObserver((records) => {
      counts.domMutations = (counts.domMutations ?? 0) + records.length;
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    countCallbacks("setTimeout", "timerCallbacks");
    countCallbacks("setInterval", "timerCallbacks");
    countCallbacks("requestAnimationFrame", "rafCallbacks");
  }

  function countCallbacks(name, key) {
    const native = window[name];
    window[name] = function (callback, ...rest) {
      if (typeof callback !== "function") return native.call(this, callback, ...rest);
      return native.call(
        this,
        function (...args) {
          add(key);
          return callback.apply(this, args);
        },
        ...rest,
      );
    };
  }
}

/**
 * Start counting on `page` before it navigates. `pageActivity` adds DOM
 * mutations, timer and animation-frame callbacks; leave it off where the
 * observer itself would weigh on a timed measurement.
 */
export async function startWorkCounters(browser, page, { pageActivity = true } = {}) {
  await page.evaluateOnNewDocument(installInPage, { pageActivity });
  const client = await page.createCDPSession();
  await client.send("Performance.enable");
  const tally = { requests: {}, frameNavigations: 0, targetsCreated: 0 };
  page.on("request", (request) => {
    const kind = request.url().includes("/thumbnail/") ? "thumbnail" : request.resourceType();
    tally.requests[kind] = (tally.requests[kind] ?? 0) + 1;
  });
  page.on("framenavigated", () => {
    tally.frameNavigations += 1;
  });
  browser.on("targetcreated", () => {
    tally.targetsCreated += 1;
  });

  return {
    /** A flat snapshot of every counter so far; subtract two snapshots for a window. */
    async read() {
      const { metrics } = await client.send("Performance.getMetrics");
      const inPage = await page.evaluate(() => ({ ...window.__hfWorkCounts }));
      const snapshot = {
        ...inPage,
        frameNavigations: tally.frameNavigations,
        targetsCreated: tally.targetsCreated,
      };
      // A metric Chrome stops reporting is left out, so the ratchet fails it as not measured.
      for (const [counter, name] of [
        ["styleRecalcs", "RecalcStyleCount"],
        ["layouts", "LayoutCount"],
      ]) {
        const entry = metrics.find((metric) => metric.name === name);
        if (entry) snapshot[counter] = entry.value;
      }
      for (const [kind, count] of Object.entries(tally.requests)) {
        snapshot[`requests.${kind}`] = count;
      }
      return snapshot;
    },
  };
}

/** `after - before` per counter; a counter absent from `before` started at zero. */
export function diffCounts(after, before) {
  return Object.fromEntries(
    Object.entries(after).map(([key, value]) => [key, value - (before[key] ?? 0)]),
  );
}
