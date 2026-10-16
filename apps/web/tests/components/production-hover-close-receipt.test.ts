import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TouchpointLoadOwner } from "../../src/components/touchpoint-load-observability";
const decision = {
  touchpointDecisionId: "decision",
  activityId: "activity",
  placementKey: "opend.home.hover-layer",
  deploymentId: "deployment",
  content: { id: "content" },
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function owned() {
  const records: unknown[] = [];
  const owner = new TouchpointLoadOwner("production", "en", (r) =>
    records.push(r),
  );
  const attempt = owner.decision(
    decision.placementKey,
    owner.begin(decision.placementKey),
    decision,
  );
  return { attempt, records };
}
it("never posts an unseen or stale close and fences a revoked generation before transport", async () => {
  const transport = vi.fn(async () => Response.json({}));
  vi.stubGlobal("fetch", transport);
  const { attempt } = owned();
  attempt.close(decision, crypto.randomUUID(), () => true);
  await vi.advanceTimersByTimeAsync(0);
  expect(transport).not.toHaveBeenCalled();
  attempt.visible();
  let current = true;
  attempt.close(decision, crypto.randomUUID(), () => current);
  current = false;
  await vi.advanceTimersByTimeAsync(0);
  expect(transport).not.toHaveBeenCalled();
  attempt.close(
    { ...decision, activityId: "foreign" },
    crypto.randomUUID(),
    () => true,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(transport).not.toHaveBeenCalled();
});
it("bounds hanging close delivery without turning a visible mount into a failed load", async () => {
  const transport = vi.fn(
    (_url: string, _init: RequestInit) =>
      new Promise<Response>(() => undefined),
  );
  vi.stubGlobal("fetch", transport);
  const { attempt, records } = owned();
  attempt.visible();
  const diagnostic = vi.fn();
  const id = crypto.randomUUID();
  attempt.close(decision, id, () => true, diagnostic);
  await vi.advanceTimersByTimeAsync(3000);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]![1].signal?.aborted).toBe(true);
  expect(JSON.parse(String(transport.mock.calls[0]![1].body))).toMatchObject({
    eventId: id,
    element: "close",
  });
  expect(diagnostic).toHaveBeenCalledWith("network");
  expect(records).toContainEqual(
    expect.objectContaining({ kind: "report", report_result: "failed" }),
  );
  expect(
    records.filter((r) => (r as { result: string }).result === "failed"),
  ).toHaveLength(0);
});
