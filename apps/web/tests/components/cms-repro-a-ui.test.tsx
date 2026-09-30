// @vitest-environment jsdom
// Deliberate red specs are ordinary tests: failures document unmet ticket expectations on main.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../src/i18n";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import {
  TestCampaignModal, clearTestRuntimeSession, setTestRuntimeSession, useTestRuntime, recordVisibleTestTouchpoint,
  type TestContext, type TestDecision, type TestDeployment, type TestRuntimeSession,
} from "../../src/components/TestCampaignModal";
import * as component from "../../src/components/touchpoint-component";
import * as navigation from "../../src/components/touchpoint-navigation";

vi.mock("@open-design/host", () => ({
  OPEN_DESIGN_HOST_VERSION: 2,
  getOpenDesignHost: () => ({ version: 2, client: { type: "desktop", osLocale: "en-US" } }),
}));

const modal = "opend.home.campaign-modal";
const entry = "opend.home.hover-entry";
const layer = "opend.home.hover-layer";
const placements = [modal, entry, layer] as const;
type Placement = typeof placements[number];
const epoch = Date.parse("2030-01-01T00:00:00.000Z");
const oldGeneration = new Date(epoch).toISOString();
const newGeneration = new Date(epoch + 1_000).toISOString();
const capabilities = (key: Placement) => key === modal ? ["close", "static-action"] : ["hover", "static-action"];
const manifest: TestDecision["content"]["manifest"] = {
  formatVersion: 2, runtimeKind: "web-component", runtimeApiVersion: 1,
  platformWrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1",
  contentLine: "cms-repro-a",
  placements: placements.map(key => ({
    key, entry: `${key}.js`, resources: [], locales: ["en", "en-US", "zh-CN", "zh-TW", "ko", "ja"],
    requiredCapabilities: capabilities(key), staticActions: [],
  })),
  resources: placements.map(key => `${key}.js`), images: [],
};
const deployment = (id = "deployment-a"): TestDeployment => ({
  id, activityId: `activity-${id}`, snapshotHash: "sha256:snapshot",
  snapshot: { contentVersionId: "content-a", manifestHash: "sha256:manifest", artifactHash: "sha256:artifact", placementKeys: [...placements] },
});
const context = (updatedAt = oldGeneration, id = "deployment-a"): TestContext => ({ deploymentId: id, scenario: "realtime", updatedAt });
function decision(key: Placement, locale = "zh-TW", generation = oldGeneration, id = "deployment-a"): TestDecision {
  return {
    deploymentId: id, activityId: `activity-${id}`, placementKey: key,
    snapshotHash: "sha256:snapshot", manifestHash: "sha256:manifest", artifactHash: "sha256:artifact",
    requiredCapabilities: capabilities(key), staticActions: [],
    serverTime: new Date().toISOString(), authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    startsAt: new Date(epoch - 60_000).toISOString(), endsAt: new Date(epoch + 3_600_000).toISOString(),
    testContext: { ...context(generation, id), scheduleState: "active" },
    content: {
      id: "content-a", placementKey: key, locale, manifest, manifestHash: "sha256:manifest",
      entryPath: `${key}.js`, entryDigest: "sha256:entry", entryModule: "export {}", resources: [],
      runtime: { kind: "web-component", apiVersion: 1, wrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1" },
      buildIdentity: { fingerprint: "cms-repro-a" },
    },
  };
}

type Reply = Response | Promise<Response>;
let catalogReply: () => Reply;
let contextReply: (id: string) => Reply;
let decisionReply: (key: Placement, locale: string, id: string) => Reply;
let productionReply: (key: Placement, locale: string) => Reply;
let acceptanceReply: (body: Record<string, string>) => Reply;
let latest: TestRuntimeSession | null;
let fetchMock: ReturnType<typeof vi.fn>;
let hasBox: boolean;
const resizeChecks = new Set<() => void>();
const diagnostics: unknown[] = [];
const diagnosticListener = (event: Event) => diagnostics.push((event as CustomEvent).detail);
const requests = (suffix: string) => fetchMock.mock.calls.filter(([url]) => new URL(String(url), "http://localhost").pathname.endsWith(suffix));
const receipts = () => requests("/acceptances").map(([, init]) => JSON.parse(String(init.body)) as Record<string, string>);
const hoverEntry = () => document.querySelector<HTMLElement>('[data-testid="cms-hover-overlay-root"] opend-touchpoint');
const visibleEntry = () => { const node = hoverEntry(); return !!node && !node.hidden; };
function Probe() { latest = useTestRuntime(); return null; }
function LocaleControls() {
  const { setLocale } = useI18n();
  return <>{(["zh-TW", "zh-CN", "ja", "ko"] as const).map(value => <button key={value} onClick={() => setLocale(value)}>{value}</button>)}</>;
}
function Home({ home = true, test = true, initial = "zh-TW" }: { home?: boolean; test?: boolean; initial?: "zh-TW" | "zh-CN" | "ko" | "ja" }) {
  // Mirrors App/EntryShell's home-only conditional mounts; no router mock or lifecycle replacement.
  return <I18nProvider initial={initial}><LocaleControls /><Probe />{home && <>
    {test && <TestCampaignModal authenticated sessionSubject="account-a" />}
    <ProductionCampaignModal authenticated sessionSubject="account-a" />
    <ProductionCampaignHover authenticated sessionSubject="account-a" />
  </>}</I18nProvider>;
}
async function settle(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await act(async () => {});
}
async function start(props: Parameters<typeof Home>[0] = {}) {
  let view!: ReturnType<typeof render>;
  await act(async () => { view = render(<Home {...props} />); });
  await settle(32);
  return view;
}
function installSession(id = "deployment-a", locale = "zh-TW") {
  setTestRuntimeSession({
    selectionKey: `${id}:${locale}`, deployment: deployment(id), context: context(oldGeneration, id),
    decisions: new Map(placements.map(key => [key, decision(key, locale, oldGeneration, id)])), isAuthorized: () => true,
  });
}
async function directHover() {
  installSession();
  await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="account-a" />); });
  await settle(32);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(epoch);
  localStorage.clear();
  latest = null;
  hasBox = true;
  diagnostics.length = 0;
  resizeChecks.clear();
  window.history.replaceState({}, "", "/");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(document.documentElement, "lang", "get").mockReturnValue("en");
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return { length: hasBox && !this.hidden ? 1 : 0, item: () => null } as unknown as DOMRectList;
  });
  vi.stubGlobal("ResizeObserver", class {
    private check: () => void;
    constructor(callback: ResizeObserverCallback) { this.check = () => callback([], this as unknown as ResizeObserver); }
    observe() { resizeChecks.add(this.check); }
    disconnect() { resizeChecks.delete(this.check); }
  });
  // jsdom cannot load verified blob ES modules. Only verification/material rendering is replaced;
  // request scheduling, locale resolution, mounts, visibility and acceptance POSTs remain real.
  vi.spyOn(component, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:cms-repro", resourceUrls: new Map(), dispose: vi.fn() } as never);
  vi.spyOn(component.OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: InstanceType<typeof component.OpenDesignTouchpointElement>, _url, _digest, host) {
    this.shadowRoot?.replaceChildren(document.createTextNode(`${host.placementKey}:${host.locale}`));
  });
  document.addEventListener("touchpointdiagnostic", diagnosticListener);
  catalogReply = () => Response.json({ deployments: [deployment()] });
  contextReply = id => Response.json(context(oldGeneration, id));
  decisionReply = (key, locale, id) => Response.json(decision(key, locale, oldGeneration, id));
  productionReply = () => new Response(null, { status: 404 });
  acceptanceReply = () => Response.json({ id: "accepted" }, { status: 201 });
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    if (url.pathname.endsWith("/acceptances")) return acceptanceReply(JSON.parse(String(init?.body)));
    if (url.pathname.endsWith("/deployments")) return catalogReply();
    if (url.pathname.endsWith("/context")) return contextReply(JSON.parse(String(init?.body)).deploymentId);
    const key = url.searchParams.get("placementKey") as Placement;
    const locale = url.searchParams.get("locale")!;
    if (url.pathname === "/api/touchpoints/test-runtime") return decisionReply(key, locale, url.searchParams.get("deploymentId")!);
    if (url.pathname === "/api/touchpoints/production-runtime") return productionReply(key, locale);
    throw new Error(`Unexpected local fixture request: ${url.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  clearTestRuntimeSession();
  document.removeEventListener("touchpointdiagnostic", diagnosticListener);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("OPEND-3475 locale regression", () => {
  it.each(["zh-TW", "zh-CN", "ko", "ja"] as const)("mounts Test %s on first display, switch and home remount despite html lang=en", async initial => {
    const view = await start({ initial });
    const texts = () => [...document.querySelectorAll("opend-touchpoint")].map(node => node.shadowRoot?.textContent);
    expect(texts()).toEqual(expect.arrayContaining(placements.map(key => `${key}:${initial}`)));
    fireEvent.click(screen.getByText(initial === "ja" ? "zh-TW" : "ja"));
    await settle(32);
    const switched = initial === "ja" ? "zh-TW" : "ja";
    expect(texts()).toEqual(expect.arrayContaining(placements.map(key => `${key}:${switched}`)));
    view.rerender(<Home home={false} initial={initial} />);
    await settle();
    view.rerender(<Home initial={initial} />);
    await settle(32);
    // Modal has already recorded its one-per-activity impression; returning home must not reopen it.
    expect(texts().sort()).toEqual([`${entry}:${switched}`, `${layer}:${switched}`].sort());
  });

  it("ignores late previous-language decisions after a rapid switch", async () => {
    await start();
    const pending: Array<() => void> = [];
    decisionReply = (key, locale, id) => locale === "ja"
      ? new Promise(resolve => pending.push(() => resolve(Response.json(decision(key, locale, oldGeneration, id)))))
      : Response.json(decision(key, locale, oldGeneration, id));
    fireEvent.click(screen.getByText("ja"));
    await settle();
    expect(pending).toHaveLength(3);
    fireEvent.click(screen.getByText("ko"));
    await settle(32);
    await act(async () => { pending.forEach(resolve => resolve()); });
    expect(latest?.decisions.get(entry)?.content.locale).toBe("ko");
    expect([...document.querySelectorAll("opend-touchpoint")].map(node => node.shadowRoot?.textContent).sort())
      .toEqual(placements.map(key => `${key}:ko`).sort());
  });

  it("retains exact, base-language and en-US fallback order when translations are missing", () => {
    expect(component.resolveWebTouchpointLocale("zh-TW", ["zh-TW", "zh", "en-US"])).toBe("zh-TW");
    expect(component.resolveWebTouchpointLocale("zh-TW", ["zh", "en-US"])).toBe("zh");
    expect(component.resolveWebTouchpointLocale("ko", ["en-US"])).toBe("en-US");
    expect(component.resolveWebTouchpointLocale("ko", ["ja"])).toBeUndefined();
  });

  it.each(["zh-TW", "zh-CN", "ko", "ja"] as const)("keeps production modal and hover on app locale %s across a switch", async initial => {
    productionReply = (key, locale) => Response.json({ ...decision(key, locale), touchpointDecisionId: `decision-${key}` });
    await start({ test: false, initial });
    const texts = () => [...document.querySelectorAll("opend-touchpoint")].map(node => node.shadowRoot?.textContent).sort();
    expect(texts()).toEqual(placements.map(key => `${key}:${initial}`).sort());
    const switched = initial === "ja" ? "zh-TW" : "ja";
    fireEvent.click(screen.getByText(switched));
    await settle(32);
    expect(texts()).toEqual(placements.map(key => `${key}:${switched}`).sort());
  });
});

describe("OPEND-3327 acceptance receipts", () => {
  it("posts entry within five seconds after late layout, then layer only on hover, with exact snapshot evidence", async () => {
    hasBox = false;
    await directHover();
    expect(receipts()).toHaveLength(0);
    hasBox = true;
    act(() => resizeChecks.forEach(check => check()));
    await settle(32);
    expect(receipts().map(body => body.placementKey)).toEqual([entry]);
    fireEvent.pointerEnter(hoverEntry()!);
    await settle(32);
    expect(receipts().map(body => body.placementKey)).toEqual([entry, layer]);
    for (const body of receipts()) {
      const evidence = new URL(String(body.evidence));
      expect(evidence.searchParams.get("cmsTestDeployment")).toBe("deployment-a");
      expect(evidence.searchParams.get("cmsTestSnapshot")).toBe("sha256:snapshot");
      expect(evidence.searchParams.get("cmsTestPlacement")).toBe(body.placementKey);
    }
  });

  it("deduplicates repeated hover and sends correct identities after locale/deployment changes", async () => {
    await directHover();
    for (let index = 0; index < 3; index++) {
      fireEvent.pointerEnter(hoverEntry()!);
      await settle(32);
      fireEvent.keyDown(window, { key: "Escape" });
      await settle(32);
    }
    expect(receipts().map(body => body.placementKey)).toEqual([entry, layer]);
    await act(async () => { installSession("deployment-a", "ko"); });
    await settle(32);
    fireEvent.pointerEnter(hoverEntry()!);
    await settle(32);
    // Local dedupe resets on locale selection; server-side idempotency is outside this test.
    expect(receipts()).toHaveLength(4);
    expect(new Set(receipts().map(body => `${new URL(String(body.evidence)).searchParams.get("cmsTestDeployment")}:${body.placementKey}`)).size).toBe(2);
    await act(async () => { installSession("deployment-b"); });
    await settle(32);
    fireEvent.pointerEnter(hoverEntry()!);
    await settle(32);
    expect(receipts().filter(body => new URL(String(body.evidence)).searchParams.get("cmsTestDeployment") === "deployment-b").map(body => body.placementKey)).toEqual([entry, layer]);
  });

  it.each(["500", "network", "timeout"] as const)("retries an entry receipt after one %s and subsequent hover/visibility", async failure => {
    let failed = false;
    let releaseTimeout: (() => void) | undefined;
    acceptanceReply = body => {
      if (body.placementKey === entry && !failed) {
        failed = true;
        if (failure === "500") return new Response(null, { status: 500 });
        if (failure === "network") return Promise.reject(new TypeError("Failed to fetch"));
        return new Promise((_resolve, reject) => { releaseTimeout = () => reject(new DOMException("Timed out", "TimeoutError")); });
      }
      return Response.json({ id: "accepted" }, { status: 201 });
    };
    await directHover();
    if (releaseTimeout) { await act(async () => { releaseTimeout!(); }); }
    expect(receipts().filter(body => body.placementKey === entry)).toHaveLength(1);
    fireEvent.pointerEnter(hoverEntry()!);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await settle(5_000);
    expect(receipts().filter(body => body.placementKey === layer)).toHaveLength(1);
    // Expected behavior: a failed POST is retried after visibility/hover or a bounded timer.
    expect(receipts().filter(body => body.placementKey === entry).length).toBeGreaterThanOrEqual(2);
  });
});

describe("OPEND-3298 context recovery and remaining P1", () => {
  it("single-flights a cold-start generation refresh across all placements and retries only once", async () => {
    let contexts = 0;
    contextReply = () => Response.json(context(++contexts === 1 ? oldGeneration : newGeneration));
    decisionReply = (key, locale, id) => Response.json(decision(key, locale, newGeneration, id));
    await start();
    expect(contexts).toBe(2);
    expect(requests("/test-runtime")).toHaveLength(6);
    expect(latest?.decisions.size).toBe(3);
    expect(visibleEntry()).toBe(true);
  });

  it("stops after one context refetch when the replacement also disagrees", async () => {
    decisionReply = (key, locale, id) => Response.json(decision(key, locale, newGeneration, id));
    await start();
    expect(requests("/context")).toHaveLength(2);
    expect(requests("/test-runtime")).toHaveLength(6);
    expect(latest?.decisions.size).toBe(0);
    expect(visibleEntry()).toBe(false);
  });

  it("fails closed on cold-start context withdrawal and on cold-start network failure", async () => {
    contextReply = () => new Response(null, { status: 410 });
    const view = await start();
    expect(latest?.decisions.size).toBe(0);
    expect(visibleEntry()).toBe(false);
    view.unmount();
    contextReply = () => Promise.reject(new TypeError("Failed to fetch"));
    await start();
    expect(latest?.decisions.size).toBe(0);
    expect(visibleEntry()).toBe(false);
  });

  it("refreshes a live generation and remains displayed for two simulated minutes", async () => {
    await start();
    contextReply = () => Response.json(context(newGeneration));
    decisionReply = (key, locale, id) => Response.json(decision(key, locale, newGeneration, id));
    act(() => window.dispatchEvent(new Event("focus")));
    await settle(32);
    expect(latest?.context.updatedAt).toBe(newGeneration);
    for (let index = 0; index < 4; index++) {
      await settle(30_000);
      expect(visibleEntry()).toBe(true);
    }
    expect(requests("/context")).toHaveLength(2);
  });

  it("recovers when the context changes while its first request is still pending", async () => {
    let release!: () => void;
    let calls = 0;
    contextReply = () => ++calls === 1
      ? new Promise(resolve => { release = () => resolve(Response.json(context(oldGeneration))); })
      : Response.json(context(newGeneration));
    await start();
    expect(calls).toBe(1);
    expect(visibleEntry()).toBe(false);
    decisionReply = (key, locale, id) => Response.json(decision(key, locale, newGeneration, id));
    await act(async () => { release(); });
    await settle(32);
    expect(calls).toBe(2);
    expect(visibleEntry()).toBe(true);
    expect(latest?.context.updatedAt).toBe(newGeneration);
  });

  it("fences late old-activity decisions after the catalog selects a replacement", async () => {
    const pending: Array<() => void> = [];
    decisionReply = (key, locale, id) => id === "deployment-a"
      ? new Promise(resolve => pending.push(() => resolve(Response.json(decision(key, locale, oldGeneration, id)))))
      : Response.json(decision(key, locale, oldGeneration, id));
    await start();
    expect(pending).toHaveLength(3);
    catalogReply = () => Response.json({ deployments: [deployment("deployment-b")] });
    act(() => window.dispatchEvent(new Event("focus")));
    await settle(32);
    expect(latest?.deployment.id).toBe("deployment-b");
    expect(visibleEntry()).toBe(true);
    await act(async () => { pending.forEach(resolve => resolve()); });
    expect(latest?.deployment.id).toBe("deployment-b");
    expect([...latest!.decisions.values()].every(value => value.deploymentId === "deployment-b")).toBe(true);
  });

  it.each(["decision", "replacement context"] as const)("immediately hides an existing Test lease when the server withdraws its %s with 410", async endpoint => {
    await start();
    expect(visibleEntry()).toBe(true);
    if (endpoint === "decision") decisionReply = () => new Response(null, { status: 410 });
    else {
      decisionReply = (key, locale, id) => Response.json(decision(key, locale, newGeneration, id));
      contextReply = () => new Response(null, { status: 410 });
    }
    act(() => window.dispatchEvent(new Event("focus")));
    await settle(32);
    expect(visibleEntry()).toBe(false);
  });

  it.each([modal, layer] as const)("isolates %s failure from the other presentation while keeping hover atomic", async failedPlacement => {
    decisionReply = (key, locale, id) => key === failedPlacement
      ? new Response(null, { status: 500 }) : Response.json(decision(key, locale, oldGeneration, id));
    await start();
    if (failedPlacement === modal) expect(visibleEntry()).toBe(true);
    else {
      expect(visibleEntry()).toBe(false);
      expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
    }
  });

  it("shows the healthy presentations when one placement hangs on first display", async () => {
    decisionReply = (key, locale, id) => key === modal
      ? new Promise<Response>(() => {}) : Response.json(decision(key, locale, oldGeneration, id));
    await start();
    expect(visibleEntry()).toBe(false);
    // Before the lifecycle's 15s attempt budget abandons every placement.
    await settle(10_000);
    expect(visibleEntry()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
    expect(diagnostics).toContainEqual({ code: "touchpoint_test_placement_timeout" });
  });

  it("keeps an on-screen presentation when its renewal hangs", async () => {
    await start();
    expect(visibleEntry()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
    decisionReply = (key, locale, id) => key === modal
      ? new Promise<Response>(() => {}) : Response.json(decision(key, locale, oldGeneration, id));
    act(() => window.dispatchEvent(new Event("focus")));
    await settle(12_000);
    expect(visibleEntry()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
  });

  it("renews healthy presentations past the original lease while one renewal keeps hanging", async () => {
    await start();
    expect(visibleEntry()).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
    decisionReply = (key, locale, id) => key === modal
      ? new Promise<Response>(() => {}) : Response.json(decision(key, locale, oldGeneration, id));
    act(() => window.dispatchEvent(new Event("focus")));
    await settle(12_000);
    // The hung modal stays on screen within the authority it already had.
    expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
    // Well past the first 60s lease: the hover kept renewing on its own answers
    // and never blinked out, while the modal lapsed with the authority its last
    // answer granted.
    const hidden: number[] = [];
    for (let second = 13; second <= 150; second += 1) {
      await settle(1_000);
      if (!visibleEntry()) hidden.push(second);
    }
    expect(hidden).toEqual([]);
    expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
  });

  it("holds a poll-driven timeout only to its own deadline without remounting healthy hover siblings", async () => {
    await start();
    const mount = vi.mocked(component.OpenDesignTouchpointElement.prototype.mount);
    const hoverMounts = () => mount.mock.calls.filter(([, , host]) => host.placementKey !== modal).length;
    const initialMounts = hoverMounts();
    const originalEntry = latest?.decisions.get(entry);
    let hanging = true;
    decisionReply = (key, locale, id) => key === modal && hanging
      ? new Promise<Response>(() => {}) : Response.json(decision(key, locale, oldGeneration, id));
    // No focus refresh: the first timeout is discovered by the ordinary poll at t=40s.
    for (let second = 1; second <= 150; second += 1) {
      await settle(1_000);
      expect(visibleEntry(), `hover at t=${second}s`).toBe(true);
      expect(hoverMounts(), `hover mounts at t=${second}s`).toBe(initialMounts);
      expect(latest?.decisions.get(entry)).toBe(originalEntry);
      if (second < 60) expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
      if (second >= 60 && second <= 90) {
        expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
        expect(latest?.decisions.has(modal)).toBe(false);
      }
      if (second === 90) hanging = false;
    }
    expect(latest?.decisions.has(modal)).toBe(true);
  });

  it("ages an answer from its own fetch completion while a sibling delays the round", async () => {
    let hangEntry = false;
    decisionReply = (key, locale, id) => key === modal || (key === entry && hangEntry)
      ? new Promise<Response>(() => {}) : Response.json(decision(key, locale, oldGeneration, id));
    await start();
    await settle(10_000);
    expect(visibleEntry()).toBe(true);
    hangEntry = true;
    await settle(49_000);
    expect(latest?.decisions.has(entry)).toBe(true);
    await settle(1_000);
    expect(latest?.decisions.has(entry)).toBe(false);
  });

  it("reports actionable mismatch identities instead of a bare diagnostic code", async () => {
    decisionReply = (key, locale, id) => Response.json({ ...decision(key, locale, oldGeneration, id), snapshotHash: "sha256:other" });
    await start();
    const mismatch = diagnostics.find(value => (value as { code?: string }).code === "touchpoint_decision_mismatch");
    expect(mismatch).toBeDefined();
    // No proposed field names: require the emitted diagnostic to actually identify the failed selection.
    expect(JSON.stringify(mismatch)).toContain("deployment-a");
    expect(JSON.stringify(mismatch)).toContain("sha256:other");
  });
});

describe("OPEND-3311 return-home timing", () => {
  it.each([true, false])("healthy home remount fetches immediately without a focus event (Test=%s)", async test => {
    if (!test) productionReply = (key, locale) => Response.json({ ...decision(key, locale), touchpointDecisionId: `decision-${key}` });
    const view = await start({ test });
    expect(visibleEntry()).toBe(true);
    for (const awayMs of [100, 15_000, 29_900]) {
      view.rerender(<Home home={false} test={test} />);
      await settle(awayMs);
      const before = fetchMock.mock.calls.length;
      view.rerender(<Home test={test} />);
      await settle(32);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
      expect(visibleEntry()).toBe(true);
      expect(document.querySelectorAll('[data-testid="cms-hover-overlay-root"]')).toHaveLength(1);
      fireEvent.pointerEnter(hoverEntry()!);
      await settle(32);
      expect(hoverEntry()?.getAttribute("aria-expanded")).toBe("true");
    }
  });

  it("recovers a still-eligible Test entry promptly after one failed remount catalog read", async () => {
    const view = await start();
    expect(visibleEntry()).toBe(true);
    view.rerender(<Home home={false} />);
    await settle(100);
    let catalogs = 0;
    catalogReply = () => ++catalogs === 1 ? new Response(null, { status: 500 }) : Response.json({ deployments: [deployment()] });
    view.rerender(<Home />);
    await settle(999);
    expect(catalogs).toBe(1);
    // Ticket says timely, with no numeric SLA. Five seconds is the explicit repro threshold;
    // before the fix the entry stayed blank until the 30-second poll.
    await settle(4_001);
    expect(catalogs).toBe(2);
    expect(visibleEntry()).toBe(true);
  });

  it("bounds the short catalog retries and falls back to the regular poll", async () => {
    const view = await start();
    view.rerender(<Home home={false} />);
    await settle(100);
    let catalogs = 0;
    catalogReply = () => { catalogs += 1; return new Response(null, { status: 500 }); };
    view.rerender(<Home />);
    await settle(29_000);
    // One remount read plus the 1s and 3s retries; nothing more until the 30s poll.
    expect(catalogs).toBe(3);
  });

  it("focus wakes failed catalog discovery immediately instead of waiting for its poll", async () => {
    let catalogs = 0;
    catalogReply = () => ++catalogs === 1 ? new Response(null, { status: 500 }) : Response.json({ deployments: [deployment()] });
    await start();
    expect(visibleEntry()).toBe(false);
    act(() => window.dispatchEvent(new Event("focus")));
    await settle(32);
    expect(visibleEntry()).toBe(true);
    expect(catalogs).toBe(2);
  });

  it("does not resurrect withdrawn or ineligible campaigns from a previous home mount", async () => {
    const view = await start();
    expect(visibleEntry()).toBe(true);
    view.rerender(<Home home={false} />);
    await settle();
    catalogReply = () => Response.json({ deployments: [] });
    view.rerender(<Home />);
    await settle(32);
    expect(visibleEntry()).toBe(false);
    expect(latest).toBeNull();
  });
});


describe("adversarial Test placement authority", () => {
  it.each([9_000, 100])("charges %sms of body download against a five-second grant", async delay => {
    const grantedAt = Date.now();
    const mount = vi.mocked(component.OpenDesignTouchpointElement.prototype.mount);
    decisionReply = (key, locale, id) => {
      const answer = { ...decision(key, locale, oldGeneration, id),
        serverTime: new Date(grantedAt).toISOString(),
        authorizationExpiresAt: new Date(grantedAt + 5_000).toISOString(),
      };
      const response = Response.json(answer);
      vi.spyOn(response, "json").mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(answer), delay);
      }));
      return response;
    };
    await start();
    expect(mount).not.toHaveBeenCalled();
    await settle(delay);
    if (delay > 5_000) {
      expect(latest?.decisions.size ?? 0).toBe(0);
      expect(mount).not.toHaveBeenCalled();
      expect(visibleEntry()).toBe(false);
      expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
    } else {
      expect(latest?.decisions.size).toBe(3);
      expect(visibleEntry()).toBe(true);
      expect(screen.queryByRole("dialog", { name: "Test campaign" })).not.toBeNull();
      // Do not run the expiry/pruning timers: authorization must read the clock itself.
      vi.setSystemTime(grantedAt + 4_999);
      expect(latest?.isAuthorized(modal)).toBe(true);
      vi.setSystemTime(grantedAt + 5_000);
      expect(latest?.isAuthorized(modal)).toBe(false);
    }
  });

  it("denies a still-mounted expired layer CTA while its sibling grant is live", async () => {
    const target = { kind: "https" as const, url: "https://example.com" };
    const actions = [{ id: "plan", target }];
    let dispatchAction!: (id: string) => Promise<void>;
    vi.mocked(component.OpenDesignTouchpointElement.prototype.mount).mockImplementation(async function (this: component.OpenDesignTouchpointElement, _url, _digest, host, _resources, _actions, options) {
      this.shadowRoot?.replaceChildren(document.createTextNode(host.placementKey));
      if (host.placementKey === layer) {
        dispatchAction = options!.dispatchAction!;
        const cta = document.createElement("button");
        cta.onclick = () => { void dispatchAction("plan").catch(() => {}); };
        this.shadowRoot?.append(cta);
      }
    });
    const navigate = vi.spyOn(navigation, "navigateCampaignTarget").mockResolvedValue(true);
    vi.stubGlobal("navigator", new Proxy(navigator, { get: (value, property) => property === "userActivation" ? { isActive: true, hasBeenActive: true } : Reflect.get(value, property, value) }));
    const grantedAt = Date.now();
    decisionReply = (key, locale, id) => {
      const answer = decision(key, locale, oldGeneration, id);
      return Response.json({ ...answer,
        authorizationExpiresAt: new Date(grantedAt + (key === layer ? 5_000 : 60_000)).toISOString(),
        staticActions: actions,
        content: { ...answer.content, manifest: { ...manifest,
          placements: manifest.placements.map(value => ({ ...value, staticActions: actions })),
        } },
      });
    };
    await start();
    fireEvent.pointerEnter(hoverEntry()!);
    await settle(32);
    const layerHost = Array.from(document.querySelectorAll("opend-touchpoint")).find(host => host.shadowRoot?.querySelector("button"));
    expect(layerHost).toBeDefined();
    const session = latest!;
    const layerDecision = session.decisions.get(layer)!;
    expect(session.isAuthorized(layer)).toBe(true);
    // Jump wall time without firing any timers; the expired host is still connected.
    vi.setSystemTime(grantedAt + 6_000);
    expect(layerHost!.isConnected).toBe(true);
    expect(session.isAuthorized()).toBe(true);
    expect(session.isAuthorized(layer)).toBe(false);
    await act(async () => { fireEvent.click(layerHost!.shadowRoot!.querySelector("button")!); });
    expect(navigate).not.toHaveBeenCalled();
    // A fresh visibility notification also cannot accept an expired placement.
    const acceptances = requests("/acceptances").length;
    clearTestRuntimeSession();
    setTestRuntimeSession(session);
    recordVisibleTestTouchpoint(session, layerDecision, layer);
    expect(requests("/acceptances")).toHaveLength(acceptances);
  });
});
