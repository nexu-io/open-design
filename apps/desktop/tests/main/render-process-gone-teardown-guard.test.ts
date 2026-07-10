import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

// `createDesktopRuntime` builds real Electron `BrowserWindow`s and cannot be
// instantiated under vitest, so — following the pattern in
// `renderer-recovery-poll-loop.test.ts` and `window-chrome.test.ts` — these
// tests assert on the runtime source to pin the teardown-safety invariant of the
// `render-process-gone` handler. See nexu-io/open-design#5095: reading
// `webContents.getURL()` after the window is destroyed during app quit throws
// "Object has been destroyed" as a fatal uncaught exception.
const runtimeSource = readFileSync(new URL("../../src/main/runtime.ts", import.meta.url), "utf8");

const handlerBlock =
  /window\.webContents\.on\("render-process-gone",[\s\S]*?\n {2}\}\);/.exec(runtimeSource)?.[0] ?? "";

describe("desktop render-process-gone teardown guard", () => {
  test("the handler block is present", () => {
    expect(handlerBlock).not.toBe("");
  });

  test("computes a destroyed guard from the window and its webContents", () => {
    expect(handlerBlock).toMatch(
      /const gone = window\.isDestroyed\(\) \|\| window\.webContents\.isDestroyed\(\);/,
    );
  });

  test("never reads getURL() unconditionally during teardown", () => {
    // The pre-fix bug was a bare `url: window.webContents.getURL()`; once the
    // window is gone the URL must be reported as null instead of touched.
    expect(handlerBlock).not.toMatch(/url:\s*window\.webContents\.getURL\(\),/);
    expect(handlerBlock).toMatch(/url:\s*gone \? null : window\.webContents\.getURL\(\),/);
  });

  test("short-circuits crash-report / recovery work once the window is gone", () => {
    // Once destroyed we bail before reportRendererCrash / markRendererFailed,
    // which would otherwise keep operating on a torn-down window.
    const returnIndex = handlerBlock.indexOf("if (gone) return;");
    const reportIndex = handlerBlock.indexOf("reportRendererCrash");
    expect(returnIndex).toBeGreaterThan(-1);
    expect(reportIndex).toBeGreaterThan(returnIndex);
  });
});
