import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

// The poll loop lives inside `createDesktopRuntime`, which builds real Electron
// `BrowserWindow`s and so cannot be instantiated under vitest. Following the
// pattern in `window-chrome.test.ts`, these tests assert on the runtime source
// to pin the timer-ownership invariant: a single poll loop, even when a load
// fails mid-tick. See nexu-io/open-design#4179 review.
const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

const markRendererFailedBlock =
  /const markRendererFailed = \(\) => \{([\s\S]*?)\n  \};/.exec(runtimeSource)?.[0] ?? "";

describe("desktop renderer-recovery poll loop", () => {
  test("tracks whether a tick is in flight", () => {
    expect(runtimeSource).toContain("let ticking = false;");
  });

  test("the failure handler does not reschedule while a tick is in flight", () => {
    // A rejecting `loadURL` inside a tick fires `did-fail-load` AND rejects into
    // the tick's catch. If `markRendererFailed` scheduled unconditionally, both
    // would queue a timer and the loop would fork. The early return on `ticking`
    // must come before the `schedule(...)` call.
    expect(markRendererFailedBlock).toContain("if (ticking) return;");
    const guardIndex = markRendererFailedBlock.indexOf("if (ticking) return;");
    const scheduleIndex = markRendererFailedBlock.indexOf("schedule(");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(guardIndex);
  });

  test("tick marks itself in flight and always clears the flag", () => {
    expect(runtimeSource).toMatch(/const tick = async \(\) => \{[\s\S]*?ticking = true;/);
    expect(runtimeSource).toMatch(/\}\s*finally\s*\{\s*ticking = false;\s*\}/);
  });

  test("tick remains the place that reschedules after a failed discovery", () => {
    // The catch still backs off and re-polls; we only removed the duplicate
    // timer from the failure handler, not the loop's own recovery.
    expect(runtimeSource).toMatch(/catch \(error\) \{[\s\S]*?schedule\(PENDING_POLL_MS\);/);
  });
});
