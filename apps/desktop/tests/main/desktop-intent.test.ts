import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { watchUserDesktopIntent, type DesktopIntentEmitter } from "../../src/main/desktop-intent.js";

describe("watchUserDesktopIntent", () => {
  function setup() {
    let clock = 10_000;
    const app = new EventEmitter();
    const onIntent = vi.fn();
    watchUserDesktopIntent(app as unknown as DesktopIntentEmitter, onIntent, { now: () => clock });
    return { advance: (ms: number) => { clock += ms; }, app, onIntent };
  }

  it("treats a reopen that follows the app becoming active as a user open", () => {
    const { app, onIntent } = setup();
    app.emit("did-become-active");
    app.emit("activate", {}, false);
    expect(onIntent).toHaveBeenCalledWith("activate");
  });

  it("pairs the events in either order", () => {
    const { advance, app, onIntent } = setup();
    app.emit("open-url", {}, "opendesign://workspace/open");
    expect(onIntent).not.toHaveBeenCalled();
    advance(40);
    app.emit("did-become-active");
    expect(onIntent).toHaveBeenCalledWith("open-url");
    expect(onIntent).toHaveBeenCalledTimes(1);
  });

  it("ignores a background reopen that never activates the app", () => {
    const { advance, app, onIntent } = setup();
    app.emit("activate", {}, false);
    advance(5_000);
    app.emit("did-become-active");
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("ignores a reopen after the app resigns active", () => {
    const { app, onIntent } = setup();
    app.emit("did-become-active");
    app.emit("did-resign-active");
    app.emit("activate", {}, false);
    expect(onIntent).not.toHaveBeenCalled();
  });

  it("shows on a reopen while the app is still active", () => {
    const { advance, app, onIntent } = setup();
    app.emit("did-become-active");
    advance(60_000);
    app.emit("activate", {}, false);
    expect(onIntent).toHaveBeenCalledWith("activate");
  });
});
