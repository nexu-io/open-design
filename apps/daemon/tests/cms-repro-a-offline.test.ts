// OPEND-3436 acceptance probes: local files and virtual clocks only, no sockets.
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTouchpointContentCache } from "../src/routes/touchpoint-content-cache.js";

const T0 = Date.parse("2030-01-01T00:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();
const entry = "export function mount() {}";
const digest = `sha256:${createHash("sha256").update(entry).digest("hex")}`;
const key = { scope: "production:A", placementKey: "opend.home.campaign-modal", locale: "en-US" };
const body = () => ({
  activityId: "activity-1", deploymentId: "deployment-1", touchpointDecisionId: "decision-1",
  placementKey: key.placementKey, requiredCapabilities: [], staticActions: [],
  serverTime: iso(0), startsAt: iso(-60_000), endsAt: iso(3_600_000), authorizationExpiresAt: iso(60_000),
  content: {
    id: "version-1", placementKey: key.placementKey, locale: key.locale,
    manifest: { resources: ["entry.js"], placements: [{ key: key.placementKey, entry: "entry.js" }] },
    manifestHash: "sha256:manifest", entryPath: "entry.js", entryDigest: digest, entryModule: entry,
    resources: [{ path: "entry.js", digest, bytes: Buffer.from(entry).toString("base64") }],
    runtime: { kind: "web-component", apiVersion: 1 }, buildIdentity: { fingerprint: "fixture" },
  },
});
const receipt = (touchpointDecisionId = "decision-1") => ({
  error: "production_runtime_revoked",
  receipt: { activityId: "activity-1", deploymentId: "deployment-1", contentVersionId: "version-1", touchpointDecisionId },
});
let dataDir: string;
const files = (): string[] => readdirSync(dataDir, { recursive: true }).map(String);
const records = () => files().filter((name) => name.includes("assemblies") && name.endsWith(".json"));
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(T0);
  dataDir = mkdtempSync(path.join(tmpdir(), "cms-repro-a-"));
});
afterEach(() => { vi.useRealTimers(); rmSync(dataDir, { recursive: true, force: true }); });

describe("OPEND-3436 offline cache acceptance", () => {
  it("AC1 persists all schedule fields, identities, fetch time and complete bytes across restart", () => {
    const cache = createTouchpointContentCache(dataDir); cache.remember(key, body());
    const stored = JSON.parse(readFileSync(path.join(dataDir, records()[0]!), "utf8"));
    for (const field of ["serverTime", "startsAt", "endsAt", "authorizationExpiresAt"] as const) {
      expect(stored.schedule[field]).toBe(body()[field]);
    }
    expect(stored.identity).toEqual(receipt().receipt);
    expect(stored.clock.fetchedAt).toBe(T0);
    vi.advanceTimersByTime(120_000);
    const replay = createTouchpointContentCache(dataDir).replayOffline(key, "upstream_unreachable");
    expect(replay?.content).toEqual(body().content);
    expect(replay?.authorizationExpiresAt).toBe(iso(3_600_000));
  });
  it.each(["production:B", "test:A"])("AC1 isolates scope %s", (scope) => {
    const cache = createTouchpointContentCache(dataDir); cache.remember(key, body());
    expect(cache.replayOffline({ ...key, scope }, "upstream_unreachable")).toBeNull();
    expect(cache.replayOffline(key, "upstream_unreachable")).not.toBeNull();
  });
  it.each(["startsAt", "endsAt", "serverTime", "authorizationExpiresAt"] as const)("AC4 missing %s never replays", (field) => {
    const cache = createTouchpointContentCache(dataDir);
    const response: Partial<ReturnType<typeof body>> = body(); delete response[field];
    cache.remember(key, response);
    expect(cache.replayOffline(key, "upstream_unreachable")).toBeNull();
  });
  it("AC8 trimmed successful renewal persists shortened schedule before the next offline restart", () => {
    const cache = createTouchpointContentCache(dataDir); cache.remember(key, body());
    vi.advanceTimersByTime(30_000);
    const { content: _content, ...envelope } = body();
    const shortened = { ...envelope, contentOmitted: true, serverTime: iso(30_000), endsAt: iso(90_000), authorizationExpiresAt: iso(90_000) };
    const held = cache.held(key)!;
    // This is the exact cache API sequence in vela.ts's contentOmitted path.
    expect(cache.reassemble(key, held, shortened)?.endsAt).toBe(iso(90_000));
    vi.advanceTimersByTime(60_001);
    expect(createTouchpointContentCache(dataDir).replayOffline(key, "upstream_unreachable")).toBeNull();
  });
  it("AC6 a late full response cannot repopulate a revoked version", () => {
    const cache = createTouchpointContentCache(dataDir); const delayedResponse = body();
    cache.remember(key, body());
    expect(cache.forgetWithdrawn(key, receipt())).toBe(true);
    // Another still-connected caller's earlier request completes after the 410.
    // vela.ts remembers every completed full 200; there is no request epoch.
    cache.remember(key, delayedResponse);
    expect(createTouchpointContentCache(dataDir).replayOffline(key, "upstream_unreachable")).toBeNull();
  });
  it.each([
    ["an empty cache", () => undefined, receipt()],
    ["another delivery", (cache: ReturnType<typeof createTouchpointContentCache>) =>
      cache.remember(key, { ...body(), deploymentId: "deployment-2" }), receipt()],
    ["no receipt", () => undefined, null],
  ] as const)("AC6 a 410 over %s still fences a full response requested before it", (_label, seed, withdrawal) => {
    const cache = createTouchpointContentCache(dataDir);
    seed(cache);
    const earlier = cache.ticket(key);
    cache.forgetWithdrawn(key, withdrawal);
    cache.remember(key, body(), earlier);
    const replay = createTouchpointContentCache(dataDir).replayOffline(key, "upstream_unreachable");
    expect(replay?.deploymentId).not.toBe("deployment-1");
    // A request sent after the 410 is an answer the server gave knowing about it.
    cache.remember(key, { ...body(), serverTime: iso(1) }, cache.ticket(key));
    expect(createTouchpointContentCache(dataDir).replayOffline(key, "upstream_unreachable")?.deploymentId).toBe("deployment-1");
  });
  it("AC6 receipt for the retained UI credential clears the rotated cache credential's same delivery", () => {
    const cache = createTouchpointContentCache(dataDir); cache.remember(key, body());
    cache.remember(key, { ...body(), touchpointDecisionId: "decision-2" });
    // OPEND-3374 deliberately keeps decision-1 in the mounted UI; its next
    // activeDecisionId asks for decision-1's receipt, while disk has decision-2.
    cache.forgetWithdrawn(key, receipt("decision-1"));
    expect(createTouchpointContentCache(dataDir).replayOffline(key, "upstream_unreachable")).toBeNull();
  });
  it("AC5 expiry deletes persisted assemblies without another request", () => {
    const cache = createTouchpointContentCache(dataDir); cache.remember(key, { ...body(), endsAt: iso(60_000) });
    expect(cache.replayOffline(key, "upstream_unreachable")).not.toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(records()).toHaveLength(0);
  });
  it("AC5 startup cleans expired packages before requests arrive", () => {
    createTouchpointContentCache(dataDir).remember(key, { ...body(), endsAt: iso(60_000) });
    // The daemon was down through endsAt: the old instance's expiry timer never fires.
    vi.clearAllTimers();
    vi.setSystemTime(T0 + 120_000);
    expect(records()).toHaveLength(1);
    createTouchpointContentCache(dataDir);
    expect(records()).toHaveLength(0);
  });
  it("AC6 nonmatching delivery receipt preserves the other activity", () => {
    const cache = createTouchpointContentCache(dataDir); cache.remember(key, body());
    const other = receipt(); other.receipt.deploymentId = "another-deployment";
    expect(cache.forgetWithdrawn(key, other)).toBe(false);
    expect(cache.replayOffline(key, "upstream_unreachable")).not.toBeNull();
  });
});
