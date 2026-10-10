// @vitest-environment jsdom
// Local lifecycle regressions, not real-client acceptance. The 2026-10-02
// ruling keeps Test's short authorization deadline and 5-minute Production
// fallback probes. Test failures stop automatic requests under OPEND-3436.
import { createElement, StrictMode } from "react";
import path from "node:path";
import ts from "typescript";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REQUEST_TIMEOUT_MS, SERVER_FAULT_HEARTBEAT_MS, touchpointContentIdentity,
  touchpointLeaseValue, useTouchpointLifecycle, type TouchpointLifecycleLoad,
} from "../../src/components/touchpoint-lifecycle";
import { ProductionTouchpointLoadError } from "../../src/components/production-touchpoint-loader";

vi.mock("@open-design/host", () => ({
  OPEN_DESIGN_HOST_VERSION: 2,
  getOpenDesignHost: () => ({ version: 2, client: { type: "desktop", osLocale: "en-US" } }),
}));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: vi.fn() }));
import { TestCampaignModal, clearTestRuntimeSession, useTestRuntime, type TestCampaignPlacement } from "../../src/components/TestCampaignModal";
import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import * as host from "../../src/components/touchpoint-component";
import { I18nProvider, type Locale } from "../../src/i18n";

const T0 = Date.parse("2030-01-01T00:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
const placements = ["opend.home.campaign-modal", "opend.home.account-badge", "opend.home.hover-entry", "opend.home.hover-layer"];
function decision(placementKey = placements[0]!) {
  const manifest = {
    formatVersion: 2, runtimeKind: "web-component", runtimeApiVersion: 1,
    platformWrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1",
    contentLine: "production", resources: ["entry.js"], images: [],
    placements: [{ key: placementKey, entry: "entry.js", resources: [], locales: ["en-US"], requiredCapabilities: [], staticActions: [] }],
  };
  return {
    activityId: "activity-1", deploymentId: "deployment-1", touchpointDecisionId: "decision-1",
    snapshotHash: "sha256:snapshot", artifactHash: "sha256:artifact", manifestHash: "sha256:manifest",
    placementKey, requiredCapabilities: [], staticActions: [],
    serverTime: at(0), startsAt: at(-60_000), endsAt: at(3_600_000), authorizationExpiresAt: at(3_600_000),
    content: {
      id: "version-1", placementKey, locale: "en-US", manifest, manifestHash: "sha256:manifest",
      entryPath: "entry.js", entryDigest: "sha256:entry", entryModule: "export {}", resources: [],
      runtime: { kind: "web-component", apiVersion: 1, wrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1" },
      buildIdentity: { fingerprint: "fixture" },
    },
  };
}
type Value = ReturnType<typeof touchpointLeaseValue<ReturnType<typeof decision>>>;
type Load = (signal: AbortSignal, active: Value | null) => Promise<TouchpointLifecycleLoad<Value>>;
const grant = (value = decision(), validForMs = 3_600_000): TouchpointLifecycleLoad<Value> => ({
  kind: "decision", key: touchpointContentIdentity(value), value: touchpointLeaseValue(value), validForMs,
});
const step = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const wake = (event: string) => act(() => { (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)); });
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  vi.setSystemTime(T0);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  localStorage.clear();
  clearTestRuntimeSession();
});
afterEach(() => {
  cleanup(); clearTestRuntimeSession(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); localStorage.clear();
});

describe("OPEND-3363/3374/3376/3377/3378 acceptance gaps", () => {
  it("3366 expiry crosses the maximum timer segment and retires at the final millisecond", async () => {
    // Isolate the expiry timer from 71,583 irrelevant poll callbacks. Polling
    // and recovery have independent coverage; only the expiry clock runs here.
    vi.spyOn(globalThis, "setInterval").mockImplementation(() => 0 as unknown as ReturnType<typeof setInterval>);
    const max = 2_147_483_647;
    const load = vi.fn<Load>().mockResolvedValue(grant(decision(), max + 1000));
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load }));
    await step(); const value = result.current.current;
    await step(max - 1); expect(result.current.current).toBe(value);
    await step(1); expect(result.current.current).toBe(value);
    await step(999); expect(result.current.current).toBe(value);
    await step(1); expect(result.current.current).toBeNull();
  });
  it("3377 TypeScript rejects all three authorization timing reads from the real lease helper", () => {
    const file = path.resolve("tests/components/cms-repro-timing-probe.ts");
    const source = `import { touchpointLeaseValue } from '../../src/components/touchpoint-lifecycle';
      const retained = touchpointLeaseValue({ activityId: 'a', serverTime: 's', endsAt: 'e', authorizationExpiresAt: 'x' });
      retained.serverTime;
      retained.endsAt;
      retained.authorizationExpiresAt;
      retained.activityId;`;
    const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX };
    const compiler = ts.createCompilerHost(options);
    const original = compiler.getSourceFile.bind(compiler);
    compiler.getSourceFile = (name, language, onError, fresh) => name === file ? ts.createSourceFile(name, source, language, true) : original(name, language, onError, fresh);
    const program = ts.createProgram([file], options, compiler);
    const errors = program.getSemanticDiagnostics(program.getSourceFile(file));
    expect(errors.map((error) => error.code)).toEqual([2339, 2339, 2339]);
    expect(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, " ")).join(" ")).toContain("authorizationExpiresAt");
  });
  it.each(["online", "pageshow", "visibilitychange", "focus"])("expired %s recovery passes no old activeDecisionId", async (event) => {
    const load = vi.fn<Load>().mockResolvedValueOnce(grant(decision(), 1000)).mockResolvedValue({ kind: "retain" });
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A:en", load }));
    await step(1000);
    expect(result.current.current).toBeNull();
    wake(event); await step();
    expect(load).toHaveBeenLastCalledWith(expect.any(AbortSignal), null);
    expect(result.current.current).toBeNull();
  });
  it.each(["activityId", "deploymentId", "content"] as const)("changing %s still advances generation", async (field) => {
    const old = decision();
    const next = { ...old, [field]: field === "content" ? { ...old.content, id: "version-2" } : "new-identity" };
    const load = vi.fn<Load>().mockResolvedValueOnce(grant(old)).mockResolvedValue(grant(next));
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A:en", load }));
    await step(); const initial = result.current.generation;
    wake("online"); await step();
    expect(result.current.generation).toBe(initial + 1);
    expect(result.current.current?.[field]).toEqual(next[field]);
  });
  it.each(["B:en", "A:zh"])("identity change to %s replaces the presentation", async (identity) => {
    const load = vi.fn<Load>().mockResolvedValue(grant());
    const { result, rerender } = renderHook(({ owner }) => useTouchpointLifecycle({ enabled: true, identity: owner, load }), { initialProps: { owner: "A:en" } });
    await step(); const initial = result.current.generation;
    rerender({ owner: identity }); await step();
    expect(result.current.generation).toBeGreaterThan(initial);
  });
  it("wall-clock round trip on a mounted renewal preserves generation and credential", async () => {
    const load = vi.fn<Load>().mockResolvedValueOnce(grant()).mockResolvedValue(grant({ ...decision(), touchpointDecisionId: "rotated" }));
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A:en", load }));
    await step(); const initial = result.current.generation; const value = result.current.current;
    vi.setSystemTime(T0 + 7_200_000);
    await step(30_000);
    vi.setSystemTime(T0 + 30_000);
    expect(result.current.generation).toBe(initial);
    expect(result.current.current).toBe(value);
    expect(result.current.current?.touchpointDecisionId).toBe("decision-1");
  });
});

describe("OPEND-3436 missing offline acceptance", () => {
  it("AC3/8 temporary 5xx fallback probes every five minutes instead of every thirty seconds", async () => {
    const load = vi.fn<Load>().mockResolvedValueOnce(grant()).mockRejectedValue(new ProductionTouchpointLoadError("http_503"));
    renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
    await step(30_000); expect(load).toHaveBeenCalledTimes(2);
    await step(SERVER_FAULT_HEARTBEAT_MS - 1);
    expect(load).toHaveBeenCalledTimes(2);
    await step(1); expect(load).toHaveBeenCalledTimes(3);
    await step(SERVER_FAULT_HEARTBEAT_MS); expect(load).toHaveBeenCalledTimes(4);
  });
  it("AC3/8 a cached daemon answer after DNS failure probes every five minutes and returns to normal renewal on recovery", async () => {
    const load = vi.fn<Load>().mockResolvedValue({ ...grant(), offlineRecovery: "unannounced" } as TouchpointLifecycleLoad<Value>);
    renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
    await step(); expect(load).toHaveBeenCalledTimes(1);
    await step(SERVER_FAULT_HEARTBEAT_MS - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await step(1); expect(load).toHaveBeenCalledTimes(2);
    await step(SERVER_FAULT_HEARTBEAT_MS); expect(load).toHaveBeenCalledTimes(3);
    load.mockResolvedValue(grant());
    wake("focus"); await step(); expect(load).toHaveBeenCalledTimes(4);
    await step(29_999); expect(load).toHaveBeenCalledTimes(4);
    await step(1); expect(load).toHaveBeenCalledTimes(5);
  });
  it("AC3 known offline focus must not send another request", async () => {
    const load = vi.fn<Load>().mockResolvedValueOnce(grant()).mockRejectedValue(new ProductionTouchpointLoadError("network"));
    renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
    await step(30_000); expect(load).toHaveBeenCalledTimes(2);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    wake("offline"); wake("focus"); await step();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("AC3 a timed-out production refresh has no retries for two minutes", async () => {
    const load = vi.fn<Load>().mockResolvedValueOnce(grant()).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
    await step(30_000 + REQUEST_TIMEOUT_MS); const value = result.current.current;
    await step(120_000);
    expect(load).toHaveBeenCalledTimes(2); expect(result.current.current).toBe(value);
  });
});

describe("production component acceptance", () => {
  const components = [ProductionCampaignModal, ProductionCampaignBadge, ProductionCampaignHover] as const;
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    vi.spyOn(host, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:fixture", resourceUrls: new Map(), dispose: vi.fn() });
    vi.spyOn(host, "webTouchpointContext").mockImplementation((value) => ({ instanceId: "instance", contentVersionId: value.id, placementKey: value.placementKey, locale: value.locale }) as ReturnType<typeof host.webTouchpointContext>);
    vi.spyOn(host.OpenDesignTouchpointElement.prototype, "mount").mockResolvedValue();
    vi.spyOn(host.OpenDesignTouchpointElement.prototype, "dispose").mockResolvedValue();
  });
  it("3363 a ten-minute sleep inside endsAt preserves modal DOM and mount while revalidation is pending", async () => {
    let pending = false;
    vi.stubGlobal("fetch", vi.fn(async () => pending ? new Promise<Response>(() => {}) : json(decision())));
    const view = render(createElement(ProductionCampaignModal, { authenticated: true, sessionSubject: "A" }));
    await step(); const element = view.container.querySelector("opend-touchpoint");
    expect(element).not.toBeNull();
    // A sleeping device advances wall time but may pause performance.now().
    vi.setSystemTime(T0 + 600_000); pending = true; wake("pageshow"); await step();
    expect(view.container.querySelector("opend-touchpoint")).toBe(element);
    expect(document.body.style.overflow).toBe("hidden");
    expect(host.OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
  });
  it("3378 wall-clock round trip during verification recovers the mount on a fresh same-key grant", async () => {
    let finish!: (value: Awaited<ReturnType<typeof host.verifyWebTouchpoint>>) => void;
    vi.mocked(host.verifyWebTouchpoint).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", vi.fn(async () => json(decision("opend.home.account-badge"))));
    render(createElement(ProductionCampaignBadge, { authenticated: true, sessionSubject: "A" }));
    await step(); expect(host.verifyWebTouchpoint).toHaveBeenCalledTimes(1);
    expect(host.OpenDesignTouchpointElement.prototype.mount).not.toHaveBeenCalled();
    vi.setSystemTime(T0 + 7_200_000);
    const dispose = vi.fn();
    await act(async () => { finish({ entryUrl: "blob:fixture", resourceUrls: new Map(), dispose }); });
    expect(dispose).toHaveBeenCalledTimes(1);
    // Correct before the lease timer fires; a fresh successful grant must be
    // able to present content whose first mount was fenced by the clock step.
    vi.setSystemTime(T0);
    wake("online"); await step();
    expect(host.OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
  });
  for (const Component of components) {
    it(`3377 ${Component.name} applies shortened endsAt without remounting the retained object`, async () => {
      let shortened = false;
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        const placement = new URL(String(url), "http://localhost").searchParams.get("placementKey") ?? placements[0]!;
        const body = decision(placement);
        return json(shortened ? { ...body, touchpointDecisionId: "rotated", endsAt: at(1000), authorizationExpiresAt: at(1000) } : body);
      }));
      const view = render(createElement(Component, { authenticated: true, sessionSubject: "A" }));
      await step(); const element = view.container.querySelector("opend-touchpoint");
      expect(element).not.toBeNull();
      const mounts = vi.mocked(host.OpenDesignTouchpointElement.prototype.mount).mock.calls.length;
      shortened = true; wake("online"); await step(999);
      expect(view.container.querySelector("opend-touchpoint")).toBe(element);
      expect(host.OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(mounts);
      await step(1); expect(view.container.querySelector("opend-touchpoint")).toBeNull();
    });
    it(`AC2 ${Component.name} keeps the cached campaign past sixty seconds when revalidation times out`, async () => {
      let stalled = false;
      vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
        if (stalled) return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
        const placement = new URL(String(url), "http://localhost").searchParams.get("placementKey") ?? placements[0]!;
        return json({ ...decision(placement), authorizationExpiresAt: at(60_000) });
      }));
      const view = render(createElement(Component, { authenticated: true, sessionSubject: "A" }));
      await step(); const element = view.container.querySelector("opend-touchpoint");
      expect(element).not.toBeNull();
      stalled = true; await step(120_000);
      expect(view.container.querySelector("opend-touchpoint")).toBe(element);
    });
    it.each(["activityId", "deploymentId", "content"] as const)(`${Component.name} remounts after %s changes`, async (field) => {
      let changed = false;
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        const placement = new URL(String(url), "http://localhost").searchParams.get("placementKey") ?? placements[0]!;
        const body = decision(placement);
        if (changed) {
          if (field === "content") body.content.id = "version-2";
          else body[field] = "new-identity";
        }
        return json(body);
      }));
      const view = render(createElement(Component, { authenticated: true, sessionSubject: "A" }));
      await step();
      const initial = Array.from(view.container.querySelectorAll("opend-touchpoint"));
      expect(initial.length).toBe(Component === ProductionCampaignHover ? 2 : 1);
      const initialMounts = vi.mocked(host.OpenDesignTouchpointElement.prototype.mount).mock.calls.length;
      changed = true; wake("online"); await step();
      const next = Array.from(view.container.querySelectorAll("opend-touchpoint"));
      expect(next).toHaveLength(initial.length);
      // Hover reuses the custom-element shell while remounting its content.
      expect(vi.mocked(host.OpenDesignTouchpointElement.prototype.mount).mock.calls.length).toBe(initialMounts + initial.length);
      if (Component !== ProductionCampaignHover) expect(next[0]).not.toBe(initial[0]);
    });
    it.each([401, 403])(`AC9 ${Component.name} clears cached display on HTTP %s`, async (status) => {
      let denied = false;
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (denied) return new Response("{}", { status });
        const placement = new URL(String(url), "http://localhost").searchParams.get("placementKey") ?? placements[0]!;
        return json({ ...decision(placement), offlineReplay: { reason: "upstream_unreachable", cachedServerTime: at(0), effectiveServerTime: at(0) } });
      }));
      const view = render(createElement(Component, { authenticated: true, sessionSubject: "A" }));
      await step(); expect(view.container.querySelector("opend-touchpoint")).not.toBeNull();
      denied = true; wake("online"); await step();
      expect(view.container.querySelector("opend-touchpoint")).toBeNull();
    });
  }
});

describe("OPEND-3436 Test channel", () => {
  function setupTest(authorizationMs = placements.map(() => 60_000)) {
    let failed = false;
    let recovered = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (failed) throw new TypeError("DNS unavailable");
      const context = { deploymentId: "deployment-1", scenario: "realtime", updatedAt: at(0), scheduleState: "active" };
      if (String(url).includes("deployments")) return json({ deployments: [{ id: "deployment-1", activityId: "activity-1", snapshotHash: "sha256:snapshot", snapshot: { contentVersionId: "version-1", manifestHash: "sha256:manifest", artifactHash: "sha256:artifact", placementKeys: placements } }] });
      if (String(url).includes("context")) return json(context);
      const placement = new URL(String(url), "http://localhost").searchParams.get("placementKey")!;
      return json({
        ...decision(placement),
        serverTime: recovered ? new Date(Date.now()).toISOString() : at(0),
        authorizationExpiresAt: recovered ? new Date(Date.now() + 60_000).toISOString() : at(authorizationMs[placements.indexOf(placement)]!),
        testContext: context,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const element = (authenticated = true, sessionSubject: string | null = "A", locale: Locale = "en") => createElement(I18nProvider, { initial: locale, children: createElement(TestCampaignModal, { authenticated, sessionSubject }) });
    let view = render(element());
    const probe = renderHook(() => useTestRuntime());
    return { fetchMock, probe, fail: () => { failed = true; }, recover: () => { failed = false; recovered = true; }, change: (authenticated: boolean, sessionSubject: string | null = "A") => view.rerender(element(authenticated, sessionSubject)), restart: (sessionSubject: string | null = "A", locale: Locale = "en", strict = false) => {
      view.unmount();
      view = render(strict ? createElement(StrictMode, null, element(true, sessionSubject, locale)) : element(true, sessionSubject, locale));
    } };
  }
  // Product ruling, 2026-10-02: Test does not extend offline authority to
  // activity endsAt. Keep the old failure evidence; assert the approved rule.
  it("AC2/10 Test hides all four decisions at the short authorization deadline offline and revalidates on recovery", async () => {
    const { probe, fail, recover } = setupTest(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    fail(); await step(59_999);
    expect(probe.result.current?.decisions.size).toBe(4);
    expect(probe.result.current?.isAuthorized()).toBe(true);
    await step(1);
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    expect(probe.result.current?.isAuthorized() ?? false).toBe(false);
    await step(60_000);
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    recover(); wake("online"); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    expect(probe.result.current?.isAuthorized()).toBe(true);
  });
  it("AC3/10 Test stops automatic rechecks after failure without extending expired display authority", async () => {
    const { fetchMock, probe, fail, recover } = setupTest(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    fail(); await step(30_000);
    const calls = fetchMock.mock.calls.length;
    await step(120_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    expect(probe.result.current?.isAuthorized() ?? false).toBe(false);
    recover(); wake("online"); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    expect(probe.result.current?.isAuthorized()).toBe(true);
  });
  it("AC4/10 Test does not restore expired offline grants on remount and requires a fresh server answer", async () => {
    const { probe, fail, restart, recover } = setupTest(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    fail(); await step(60_000); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    expect(probe.result.current?.isAuthorized() ?? false).toBe(false);
    recover(); wake("online"); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    expect(probe.result.current?.isAuthorized()).toBe(true);
  });
  it("AC4/10 Test restores all four still-authorized decisions after immediate offline remount without renewing their clocks", async () => {
    const { probe, fail, restart } = setupTest(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    fail(); restart(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    for (const placement of placements) expect(probe.result.current?.isAuthorized(placement as TestCampaignPlacement)).toBe(true);
    await step(59_999);
    expect(probe.result.current?.decisions.size).toBe(4);
    await step(1);
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    expect(probe.result.current?.isAuthorized() ?? false).toBe(false);
  });
  it("remount after twenty seconds preserves only the original forty seconds and stops failed requests", async () => {
    const { probe, fetchMock, fail, restart } = setupTest(); await step(); await step(20_000);
    fail(); restart(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    const requests = fetchMock.mock.calls.length;
    await step(999); expect(fetchMock.mock.calls.length).toBe(requests);
    await step(1); expect(fetchMock.mock.calls.length).toBe(requests);
    await step(38_999); expect(probe.result.current?.decisions.size).toBe(4);
    await step(1); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(requests);
  });
  it("restored placements independently retire at their original fifteen-second boundaries", async () => {
    const { probe, fail, restart } = setupTest([15_000, 30_000, 45_000, 60_000]); await step(); await step(10_000);
    fail(); restart(); await step();
    for (let index = 0; index < placements.length; index += 1) {
      await step(index === 0 ? 4_999 : 14_999);
      expect(probe.result.current?.decisions.size).toBe(4 - index);
      await step(1);
      expect(probe.result.current?.decisions.size ?? 0).toBe(3 - index);
      expect(probe.result.current?.isAuthorized(placements[index] as TestCampaignPlacement)).toBe(false);
    }
  });
  it.each(["account", "logout", "locale"] as const)("never restores old grants after %s changes and changes back", async (boundary) => {
    const { probe, fail, restart, change } = setupTest(); await step(); fail();
    if (boundary === "account") restart("B");
    else if (boundary === "logout") change(false);
    else restart("A", "ja");
    await step(); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    restart(); await step(); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it("a forward clock observation followed by rollback cannot resurrect a restored grant", async () => {
    const { probe, fail, restart } = setupTest(); await step(); await step(20_000); fail();
    vi.setSystemTime(T0 + 60_001); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    vi.setSystemTime(T0 + 20_000); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it.each([401, 403, 410, "empty", "snapshot"] as const)("authoritative directory %s prevents subsequent offline remount", async (answer) => {
    const { probe, fetchMock, fail, restart } = setupTest(); await step(); fail(); restart(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("deployments")) return typeof answer === "number" ? new Response(null, { status: answer }) : json({ deployments: answer === "empty" ? [] : [{ id: "deployment-1", activityId: "activity-1", snapshotHash: "changed", snapshot: { placementKeys: placements } }] });
      throw new TypeError("DNS unavailable");
    });
    wake("online"); await step(); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    fetchMock.mockRejectedValue(new TypeError("DNS unavailable")); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it.each([401, 403, 410])("runtime refusal %s cancels old siblings and cannot be replayed after offline remount", async (status) => {
    const { probe, fetchMock, restart } = setupTest(); await step();
    const original = fetchMock.getMockImplementation()!;
    const pending: Array<() => void> = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (!String(url).includes("placementKey")) return original(url);
      const placement = new URL(url, "http://localhost").searchParams.get("placementKey")!;
      if (placement === placements[0]) return new Response(null, { status });
      return new Promise<Response>((resolve) => pending.push(() => resolve(json({ ...decision(placement), authorizationExpiresAt: at(60_000), testContext: { deploymentId: "deployment-1", scenario: "realtime", updatedAt: at(0), scheduleState: "active" } }))));
    });
    await step(30_000); expect(pending).toHaveLength(3);
    await act(async () => { pending.forEach((resolve) => resolve()); });
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    fetchMock.mockRejectedValue(new TypeError("DNS unavailable")); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it("an empty directory fences a late pre-remount renewal even when fetch ignores abort", async () => {
    const { probe, fetchMock, restart } = setupTest(); await step();
    const original = fetchMock.getMockImplementation()!;
    const pending: Array<() => void> = [];
    fetchMock.mockImplementation(async (url: string) => {
      if (!String(url).includes("placementKey")) return original(url);
      return new Promise<Response>((resolve) => pending.push(() => void original(url).then(resolve)));
    });
    await step(30_000); expect(pending).toHaveLength(4);
    fetchMock.mockImplementation(async () => json({ deployments: [] })); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    await act(async () => { pending.forEach((resolve) => resolve()); });
    fetchMock.mockRejectedValue(new TypeError("DNS unavailable")); restart(); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it.each(["unknown owner", "explicit clear"])("%s cannot reuse a grant on another same-owner remount", async (boundary) => {
    const { probe, fail, restart, change } = setupTest(); await step();
    if (boundary === "unknown owner") { change(true, null); await step(); }
    else clearTestRuntimeSession();
    fail(); restart(); await step(); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it("StrictMode remount retains valid grants and accepts a genuinely fresh in-flight renewal after their original deadline", async () => {
    const { probe, fetchMock, fail, restart } = setupTest(); await step(); await step(20_000); fail();
    restart("A", "en", true); await step(); expect(probe.result.current?.decisions.size).toBe(4);
    await step(39_000);
    const pending: Array<() => void> = [];
    const context = { deploymentId: "deployment-1", scenario: "realtime", updatedAt: at(0), scheduleState: "active" };
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("deployments")) throw new TypeError("DNS unavailable");
      if (String(url).includes("context")) return json(context);
      const placement = new URL(url, "http://localhost").searchParams.get("placementKey")!;
      return new Promise<Response>((resolve) => pending.push(() => resolve(json({ ...decision(placement), serverTime: at(59_000), authorizationExpiresAt: at(119_000), testContext: context }))));
    });
    wake("online"); await step(); expect(pending).toHaveLength(4);
    await step(1_000); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    await act(async () => { pending.forEach((resolve) => resolve()); });
    expect(probe.result.current?.decisions.size).toBe(4);
    fail(); fetchMock.mockRejectedValue(new TypeError("DNS unavailable")); restart(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    await step(58_999); expect(probe.result.current?.decisions.size).toBe(4);
    await step(1); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it("an unidentified owner may display a fresh grant but cannot replay it on remount", async () => {
    const { probe, fail, restart } = setupTest(); await step(); restart(null); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    fail(); restart(null); await step(); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it.each(["directory 404", "directory malformed", "runtime 404", "runtime malformed"])("%s preserves only the existing short grant through remount", async (failure) => {
    const { probe, fetchMock, restart } = setupTest(); await step();
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string) => {
      const matches = failure.startsWith("directory") ? String(url).includes("deployments") : String(url).includes("placementKey");
      if (matches) return failure.endsWith("404") ? new Response(null, { status: 404 }) : json({});
      return original(url);
    });
    await step(30_000); expect(probe.result.current?.decisions.size).toBe(4);
    fetchMock.mockRejectedValue(new TypeError("DNS unavailable")); restart(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    // Neither chain renews automatically after the directory/runtime failure.
    const remaining = 30_000;
    await step(remaining - 1); expect(probe.result.current?.decisions.size).toBe(4);
    await step(1); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it("manual switching spends the old selection's replay grant even when switching back offline", async () => {
    const originalUrl = window.location.href;
    window.history.replaceState(null, "", "?cmsTestControls=1");
    try {
      const { probe, fetchMock, fail, restart } = setupTest(); await step();
      const original = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation(async (url: string) => {
        const response = await original(url);
        if (!String(url).includes("deployments")) return response;
        const body = await response.json();
        return json({ deployments: [...body.deployments, { ...body.deployments[0], id: "deployment-2" }] });
      });
      wake("focus"); await step();
      fireEvent.change(document.querySelector("select")!, { target: { value: "deployment-1" } }); await step();
      expect(probe.result.current?.decisions.size).toBe(4);
      fail();
      fireEvent.change(document.querySelector("select")!, { target: { value: "deployment-2" } }); await step();
      expect(probe.result.current?.decisions.size ?? 0).toBe(0);
      fireEvent.change(document.querySelector("select")!, { target: { value: "deployment-1" } }); await step();
      expect(probe.result.current?.decisions.size ?? 0).toBe(0);
      restart(); await step(); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    } finally { window.history.replaceState(null, "", originalUrl); }
  });
  it("a remount renewal with one hung placement keeps its original grant while siblings receive fresh grants", async () => {
    const { probe, fetchMock, restart } = setupTest(); await step(); await step(20_000);
    const original = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string) => {
      if (!String(url).includes("placementKey")) return original(url);
      const placement = new URL(url, "http://localhost").searchParams.get("placementKey")!;
      if (placement === placements[0]) return new Promise<Response>(() => {});
      const body = await (await original(url)).json();
      return json({ ...body, serverTime: at(20_000), authorizationExpiresAt: at(80_000) });
    });
    restart(); await step(); expect(probe.result.current?.decisions.size).toBe(4);
    await step(10_000); expect(probe.result.current?.decisions.size).toBe(4);
    expect(probe.result.current?.isAuthorized(placements[0] as TestCampaignPlacement)).toBe(true);
    fetchMock.mockRejectedValue(new TypeError("DNS unavailable"));
    await step(29_999); expect(probe.result.current?.decisions.size).toBe(4);
    await step(1); expect(probe.result.current?.decisions.size).toBe(3);
    expect(probe.result.current?.isAuthorized(placements[0] as TestCampaignPlacement)).toBe(false);
    await step(19_999); expect(probe.result.current?.decisions.size).toBe(3);
    await step(1); expect(probe.result.current?.decisions.size ?? 0).toBe(0);
  });
  it("withdrawal spends inherited grants for future requests as well as requests already in flight", async () => {
    const { probe, fetchMock, fail, restart } = setupTest(); await step(); fail(); restart(); await step();
    expect(probe.result.current?.decisions.size).toBe(4);
    const context = { deploymentId: "deployment-1", scenario: "realtime", updatedAt: at(0), scheduleState: "active" };
    fetchMock.mockImplementation(async (url: string) => String(url).includes("context") ? json(context) : new Response(null, { status: 401 }));
    await step(10_000); wake("online"); await step();
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    await step(30_000);
    expect(probe.result.current?.decisions.size ?? 0).toBe(0);
    expect(probe.result.current?.isAuthorized() ?? false).toBe(false);
  });
});


describe("online fallback recovery bounds", () => {
  it.each(["timeout", "transport"] as const)("probes five minutes after online %s, then restores thirty-second renewal", async kind => {
    let fail = false;
    const load = vi.fn<Load>().mockImplementation(() => !fail ? Promise.resolve(grant()) : kind === "timeout"
      ? new Promise(() => {}) : Promise.reject(Object.assign(new Error("transport"), { touchpointOfflineFallback: true })));
    const { result } = renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
    await step(); fail = true; await step(30_000);
    if (kind === "timeout") await step(REQUEST_TIMEOUT_MS);
    expect(result.current.current).not.toBeNull();
    fail = false;
    await step(SERVER_FAULT_HEARTBEAT_MS - 1); expect(load).toHaveBeenCalledTimes(2);
    await step(1); expect(load).toHaveBeenCalledTimes(3);
    await step(30_000); expect(load).toHaveBeenCalledTimes(4);
  });
  it("does not probe a transport fallback while the device explicitly reports offline", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const load = vi.fn<Load>().mockResolvedValueOnce(grant()).mockRejectedValue(Object.assign(new Error("transport"), { touchpointOfflineFallback: true }));
    renderHook(() => useTouchpointLifecycle({ enabled: true, identity: "A", load, offlineFallback: true }));
    await step(); await step(30_000); online.mockReturnValue(false); wake("offline");
    await step(SERVER_FAULT_HEARTBEAT_MS * 2); expect(load).toHaveBeenCalledTimes(2);
    online.mockReturnValue(true); load.mockResolvedValue(grant()); wake("online"); await step();
    expect(load).toHaveBeenCalledTimes(3);
  });
});
