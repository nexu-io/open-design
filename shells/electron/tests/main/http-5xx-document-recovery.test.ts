import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isRendererFailureHttpStatus } from "../../src/main/runtime.js";

// An HTTP 5xx document (e.g. the packaged od:// proxy's synthetic 502) is a
// *successful* load to Electron: `loadURL` resolves and `did-fail-load` fires
// only for net::ERR_* failures. Without dedicated wiring the renderer parks on
// the error page forever, the mount marker never appears, and the splash
// reveals a raw 502 after its ceiling. These tests pin the recovery wiring.
//
// The poll loop lives inside `createDesktopRuntime`, which builds real
// Electron `BrowserWindow`s and cannot be instantiated under vitest, so the
// wiring assertions follow the source-pinning pattern of
// `renderer-recovery-poll-loop.test.ts`.
const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

describe("isRendererFailureHttpStatus", () => {
  it("treats every HTTP 5xx document as a failed load", () => {
    expect(isRendererFailureHttpStatus(500)).toBe(true);
    expect(isRendererFailureHttpStatus(502)).toBe(true);
    expect(isRendererFailureHttpStatus(599)).toBe(true);
  });

  it("ignores successful, redirect, client-error, and non-HTTP navigations", () => {
    expect(isRendererFailureHttpStatus(200)).toBe(false);
    expect(isRendererFailureHttpStatus(302)).toBe(false);
    expect(isRendererFailureHttpStatus(404)).toBe(false);
    // Electron reports non-HTTP navigations with 0 / -1; they must never be
    // routed into the reload loop.
    expect(isRendererFailureHttpStatus(0)).toBe(false);
    expect(isRendererFailureHttpStatus(-1)).toBe(false);
  });
});

describe("desktop 5xx-document recovery wiring", () => {
  it("routes 5xx main-frame documents from did-navigate into markRendererFailed", () => {
    const didNavigateBlock =
      /webContents\.on\("did-navigate",([\s\S]*?)\n  \}\);/.exec(runtimeSource)?.[0] ?? "";
    expect(didNavigateBlock).toContain("isRendererFailureHttpStatus(");
    expect(didNavigateBlock).toContain("markRendererFailed()");
  });

  it("tick clears the renderer-failed flag before awaiting loadURL, not after", () => {
    // `did-navigate` (which re-flags a 5xx document) fires BEFORE `loadURL`'s
    // promise resolves; clearing the flag after the await would clobber the
    // failure the listener just recorded.
    const tickBlock = /const tick = async \(\) => \{([\s\S]*?)\n  \};/.exec(runtimeSource)?.[0] ?? "";
    const clearIndex = tickBlock.indexOf("rendererFailed = false;");
    const loadIndex = tickBlock.indexOf("await window.loadURL(");
    expect(clearIndex).toBeGreaterThan(-1);
    expect(loadIndex).toBeGreaterThan(-1);
    expect(clearIndex).toBeLessThan(loadIndex);
  });

  it("a still-failed renderer re-polls at the prompt cadence, not the running cadence", () => {
    expect(runtimeSource).toContain(
      "schedule(currentUrl == null || rendererFailed ? PENDING_POLL_MS : RUNNING_POLL_MS);",
    );
  });
});
