import { expect, it } from "vitest";
import { preparationQueue } from "../src/preparation-queue.js";

it("bounds work and transfers freed slots without sleeps", async () => {
  const queue = preparationQueue(2, new AbortController().signal);
  const started: number[] = [], release: Array<() => void> = [];
  const jobs = [0, 1, 2, 3].map(id => queue(async () => {
    started.push(id);
    await new Promise<void>(resolve => release.push(resolve));
  }));
  expect(started).toEqual([0, 1]);
  release[0]!(); await jobs[0];
  expect(started).toEqual([0, 1, 2]);
  release[1]!(); await jobs[1];
  expect(started).toEqual([0, 1, 2, 3]);
  release[2]!(); release[3]!(); await Promise.all(jobs);
});

it("drains active work but never starts queued work after cancellation", async () => {
  const controller = new AbortController(), queue = preparationQueue(1, controller.signal);
  let release!: () => void;
  const active = queue(() => new Promise<void>(resolve => { release = resolve; }));
  let started = false;
  const queued = queue(async () => { started = true; });
  const outcome = Promise.allSettled([active, queued]);
  controller.abort(new Error("failed acquisition"));
  release();
  expect((await outcome).map(item => item.status)).toEqual(["fulfilled", "rejected"]);
  expect(started).toBe(false);
});
