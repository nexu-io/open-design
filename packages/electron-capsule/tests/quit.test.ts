import { expect, it, vi } from "vitest";
import { createCommittedQuitHandler } from "@/quit.js";

it("owns one quit chain while handoff and asynchronous cleanup are pending", async () => {
  const handoff = Promise.withResolvers<void>(), cleanup = Promise.withResolvers<void>();
  const closingStarted = Promise.withResolvers<void>(), finished = Promise.withResolvers<void>();
  let closing = false;
  const close = vi.fn(async () => {
    if (closing) return;
    closing = true;
    closingStarted.resolve();
    await cleanup.promise;
  });
  const finish = vi.fn(() => finished.resolve());
  const handler = createCommittedQuitHandler({ committed: () => true,
    waitForHandoff: () => handoff.promise, close, report: vi.fn(), finish });
  const event = { preventDefault: vi.fn() };
  handler(event); handler(event);
  handoff.resolve();
  await closingStarted.promise;
  expect(close).toHaveBeenCalledOnce();
  expect(finish).not.toHaveBeenCalled();
  handler(event);
  cleanup.resolve();
  await finished.promise;
  expect(finish).toHaveBeenCalledOnce();
  expect(event.preventDefault).toHaveBeenCalledTimes(3);
});

it("leaves pre-commit quit to the carrier and closes once even after handoff failure", async () => {
  let committed = false;
  const failure = new Error("handoff failed"), finished = Promise.withResolvers<void>();
  const close = vi.fn(async () => {}), report = vi.fn(), finish = vi.fn(() => finished.resolve());
  const handler = createCommittedQuitHandler({ committed: () => committed,
    waitForHandoff: async () => { throw failure; }, close, report, finish });
  const event = { preventDefault: vi.fn() };
  handler(event);
  expect(event.preventDefault).not.toHaveBeenCalled();
  committed = true;
  handler(event); handler(event);
  await finished.promise;
  expect(report).toHaveBeenCalledExactlyOnceWith(failure);
  expect(close).toHaveBeenCalledOnce();
  expect(finish).toHaveBeenCalledOnce();
});
