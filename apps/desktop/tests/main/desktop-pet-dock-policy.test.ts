// Issue #2394 — the packaged macOS app launched without a Dock icon
// (and without a menu bar): the icon flickered once during launch and
// then vanished, while the window itself rendered and worked fine.
//
// Root cause: the desktop-pet companion window calls
// `setVisibleOnAllWorkspaces` so it floats across every Space.
// Electron's macOS implementation, by default, transforms the whole
// *process* type between `UIElementApplication` and
// `ForegroundApplication` while applying that call (the Electron docs
// note it "will hide the window and dock for a short time"). On
// Electron 41 / macOS 26 that round-trip races during the launch burst
// — the pet window is created alongside the main window — and the
// process can stay stuck as an accessory app: no Dock icon, no menu
// bar. Passing `skipTransformProcessType: true` bypasses the transform,
// keeping the app a regular Dock app; the pet still floats on every
// Space via its `alwaysOnTop` floating level.
//
// `createDesktopPetWindow` builds a real Electron `BrowserWindow`, so
// this is a source-structure guard rather than a runtime test: the
// symptom (a missing Dock icon) is only observable on a live macOS
// session, which no cheaper test layer can see. It mirrors the
// `*-host-boundary` source guards already in this directory.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");

function source(relativePath: string): string {
  return readFileSync(join(desktopRoot, relativePath), "utf8");
}

function createDesktopPetWindowBody(): string {
  const runtime = source("src/main/runtime.ts");
  const start = runtime.indexOf("function createDesktopPetWindow");
  expect(start, "createDesktopPetWindow not found in runtime.ts").toBeGreaterThanOrEqual(0);
  const end = runtime.indexOf("\nfunction ", start + "function ".length);
  expect(end, "end of createDesktopPetWindow not found").toBeGreaterThan(start);
  return runtime.slice(start, end);
}

// Returns the `petWindow.setVisibleOnAllWorkspaces(...)` call statement
// only — anchored on the `petWindow.` receiver and `(` so prose in the
// surrounding docblock that merely names the API is not matched.
function petWindowSetVisibleOnAllWorkspacesCall(): string {
  const body = createDesktopPetWindowBody();
  const callStart = body.indexOf("petWindow.setVisibleOnAllWorkspaces(");
  expect(callStart, "pet window must call setVisibleOnAllWorkspaces").toBeGreaterThanOrEqual(0);
  const callEnd = body.indexOf(";", callStart);
  expect(callEnd, "setVisibleOnAllWorkspaces call must be terminated").toBeGreaterThan(callStart);
  return body.slice(callStart, callEnd + 1);
}

describe("desktop-pet window must not demote the app's macOS Dock policy (issue #2394)", () => {
  it("floats the pet window across all Spaces", () => {
    const call = petWindowSetVisibleOnAllWorkspacesCall();
    expect(call).toContain("visibleOnFullScreen: true");
  });

  it("skips the UIElementApplication <-> ForegroundApplication process transform", () => {
    const call = petWindowSetVisibleOnAllWorkspacesCall();
    expect(call).toContain("skipTransformProcessType: true");
  });
});
