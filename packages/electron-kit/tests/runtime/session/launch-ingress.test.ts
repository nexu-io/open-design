import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { installElectronLaunchIngress } from "@/runtime/session/launch-ingress.js";

function fixture(argv: string[] = []) {
  const app = new EventEmitter();
  const ingress = installElectronLaunchIngress({ app, protocol: "od", argv });
  const event = { preventDefault: vi.fn() };
  return { app, ingress, event };
}

it("retains bounded typed ingress received before Capsule loading", () => {
  const { app, ingress, event } = fixture(["--private", "od://initial"]);
  app.emit("open-url", event, "od://mac");
  app.emit("second-instance", event, ["--private", "od://second"], "/private", {});
  app.emit("activate");
  expect(ingress.queue.drain()).toEqual([
    { type: "deep-link", source: "initial-argv", url: "od://initial" },
    { type: "deep-link", source: "mac-open-url", url: "od://mac" },
    { type: "deep-link", source: "second-instance", url: "od://second" },
    { type: "focus", source: "app-activate" },
  ]);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  ingress.dispose();
});

it("validates OS ingress before offering it to the single Capsule receiver", () => {
  const { app, ingress, event } = fixture();
  const receiver = vi.fn(() => true);
  ingress.bindReceiver(receiver);
  app.emit("open-url", event, "https://foreign.test");
  app.emit("second-instance", event, ["od://replacement"], "/private", {
    kind: "installer-replacement", installAttemptId: "install-7",
  });
  expect(receiver).not.toHaveBeenCalled();
  app.emit("open-url", event, "od://accepted");
  expect(receiver).toHaveBeenCalledExactlyOnceWith({ type: "deep-link", source: "mac-open-url", url: "od://accepted" });
  expect(ingress.queue.drain()).toEqual([]);
  expect(() => ingress.bindReceiver(receiver)).toThrow("already has a receiver");
  ingress.dispose();
});

it("keeps unhandled startup events queued and unregisters only owned listeners", () => {
  const { app, ingress, event } = fixture();
  const other = vi.fn();
  app.on("activate", other);
  const receiver = vi.fn(() => false);
  ingress.bindReceiver(receiver);
  app.emit("second-instance", event, [], "/private", {});
  expect(ingress.queue.drain()).toEqual([{ type: "focus", source: "second-instance" }]);
  app.emit("activate");
  app.emit("will-quit");
  ingress.dispose();
  expect(ingress.queue.drain()).toEqual([]);
  app.emit("activate");
  expect(receiver).toHaveBeenCalledTimes(2);
  expect(other).toHaveBeenCalledTimes(2);
  expect(app.eventNames()).toEqual(["activate"]);
  expect(() => ingress.bindReceiver(receiver)).toThrow("closed");
});
