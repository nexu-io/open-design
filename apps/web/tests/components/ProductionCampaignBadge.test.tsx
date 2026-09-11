// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getOpenDesignHostMock } = vi.hoisted(() => ({ getOpenDesignHostMock: vi.fn() }));
vi.mock("@open-design/host", () => ({ getOpenDesignHost: getOpenDesignHostMock }));
import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";
const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const openExternalUrlMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: openExternalUrlMock }));
const entry = "export function mount(root) { root.textContent = 'Badge'; return root; }";
const manifest = { formatVersion: 2 as const, runtimeKind: "web-component" as const, runtimeApiVersion: 1 as const, platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const, sdkVersion: "vela-touchpoint-sdk-v1" as const, contentLine: "badge", placements: [{ key: "opend.home.account-badge" as const, entry: "component.js", resources: [], locales: ["en-US"], requiredCapabilities: ["static-action"], staticActions: [{ id: "learn", target: { kind: "https" as const, url: "https://example.com" } }] }], resources: ["component.js"], images: [] };
const content = { id: "version-badge", placementKey: "opend.home.account-badge", locale: "en-US", manifestHash: digest(JSON.stringify(manifest)), entryPath: "component.js", entryDigest: digest(entry), entryModule: entry, resources: [{ path: "component.js", digest: digest(entry), bytes: btoa(entry) }], runtime: { kind: "web-component" as const, apiVersion: 1 as const, wrapperVersion: "vela-touchpoint-wrapper-v1" as const, sdkVersion: "vela-touchpoint-sdk-v1" as const }, buildIdentity: { fingerprint: "badge-fixed" }, manifest };
const decision = (overrides: Record<string, unknown> = {}) => { const now = new Date(); return { activityId: "badge-activity", authorizationExpiresAt: new Date(now.getTime() + 60_000).toISOString(), content, deploymentId: "deployment-badge", endsAt: new Date(now.getTime() + 5 * 60_000).toISOString(), placementKey: "opend.home.account-badge", requiredCapabilities: ["static-action"], serverTime: now.toISOString(), staticActions: [{ id: "learn", target: { kind: "https", url: "https://example.com" } }], touchpointDecisionId: "decision-badge", ...overrides }; };
beforeEach(() => { vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement) { this.shadowRoot?.replaceChildren(document.createTextNode("Badge")); }); });
afterEach(() => { cleanup(); getOpenDesignHostMock.mockReset(); openExternalUrlMock.mockClear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("ProductionCampaignBadge", () => {
  it("mounts the immutable account-badge through the shared custom-element adapter with locale fallback and no close control", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-GB" } });
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(decision()), { status: 200 }))); vi.stubGlobal("fetch", fetchMock);
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    const badge = await screen.findByTestId("production-campaign-badge");
    await waitFor(() => expect(badge.querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("Badge"));
    expect(fetchMock).toHaveBeenCalledWith("/api/touchpoints/production-runtime?placementKey=opend.home.account-badge&locale=en-GB", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(badge.querySelector("iframe, webview")).toBeNull();
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });
  it("fails closed when the immutable content placement or static actions disagree with the outer decision", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    const mismatchedContent = { ...content, placementKey: "opend.home.campaign-modal" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(decision({ content: mismatchedContent })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(decision({ staticActions: [{ id: "substituted", target: { kind: "internal", path: "/other" } }] })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("production-campaign-badge")).toBeNull();
    view.rerender(<ProductionCampaignBadge authenticated sessionSubject="account-b" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId("production-campaign-badge")).toBeNull());
  });

  it.each([
    ["matching receipt clears the mounted lease", "matching", true, false],
    ["valid mismatched receipt retains the mounted lease", "mismatched", false, false],
    ["malformed 410 diagnoses and clears the mounted lease", "malformed", true, true],
  ] as const)("%s", async (_name, kind, clears, diagnoses) => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    const active = decision();
    const receipt = { touchpointDecisionId: active.touchpointDecisionId, deploymentId: active.deploymentId, activityId: active.activityId, contentVersionId: active.content.id };
    const response = kind === "malformed"
      ? new Response(JSON.stringify({ error: "production_runtime_revoked", receipt: { touchpointDecisionId: receipt.touchpointDecisionId } }), { status: 410 })
      : new Response(JSON.stringify({ error: "production_runtime_revoked", receipt: kind === "matching" ? receipt : { ...receipt, deploymentId: "other-deployment" } }), { status: 410 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(active), { status: 200 }))
      .mockResolvedValueOnce(response);
    const diagnostic = vi.spyOn(touchpointComponent, "emitWebTouchpointDiagnostic");
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await screen.findByTestId("production-campaign-badge");
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]?.[0]).toContain(`activeDecisionId=${active.touchpointDecisionId}`);
    if (clears) await waitFor(() => expect(screen.queryByTestId("production-campaign-badge")).toBeNull());
    else expect(screen.getByTestId("production-campaign-badge")).toBeTruthy();
    if (diagnoses) expect(diagnostic).toHaveBeenCalledWith({ code: "touchpoint_load_failed", detail: "http_410" });
    else expect(diagnostic).not.toHaveBeenCalledWith(expect.objectContaining({ detail: "http_410" }));
  });

  it("denies synchronously when authentication is revoked and ignores a deferred A response body", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    let resolveBody: ((value: ReturnType<typeof decision>) => void) | undefined;
    const body = new Promise<ReturnType<typeof decision>>((resolve) => { resolveBody = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => body }));
    const view = render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    view.rerender(<ProductionCampaignBadge authenticated={false} sessionSubject="account-a" />);
    expect(screen.queryByTestId("production-campaign-badge")).toBeNull();
    resolveBody?.(decision());
    await Promise.resolve();
    expect(screen.queryByTestId("production-campaign-badge")).toBeNull();
  });

  it("tears down mounted account A and never revives it when a deferred A recheck resolves after account B", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    let resolveLateA: ((response: Response) => void) | undefined;
    const lateA = new Promise<Response>((resolve) => { resolveLateA = resolve; });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(decision()), { status: 200 }))
      .mockImplementationOnce(() => lateA)
      .mockResolvedValueOnce(new Response(JSON.stringify(decision({ placementKey: "opend.home.campaign-modal" })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    const badge = await screen.findByTestId("production-campaign-badge");
    await waitFor(() => expect(badge.querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("Badge"));
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    view.rerender(<ProductionCampaignBadge authenticated sessionSubject="account-b" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByTestId("production-campaign-badge")).toBeNull();
    resolveLateA?.(new Response(JSON.stringify(decision()), { status: 200 }));
    await Promise.resolve();
    expect(screen.queryByTestId("production-campaign-badge")).toBeNull();
  });
  it("keeps the mounted badge action authorized across focus, online, and interval refreshes", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    let dispatchAction: ((actionId: string) => Promise<void>) | undefined;
    vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, _entry, _digest, _context, _urls, _actions, options) { dispatchAction = options?.dispatchAction; this.shadowRoot?.replaceChildren(document.createTextNode("Badge")); });
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(
      init?.method === "POST"
        ? new Response(JSON.stringify({ ok: true }), { status: 200 })
        : new Response(JSON.stringify(decision()), { status: 200 }),
    ));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:badge", resourceUrls: new Map(), dispose: vi.fn() } as any);
    Object.defineProperty(navigator, "userActivation", { configurable: true, value: { isActive: true } });
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(dispatchAction).toBeTypeOf("function");
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await dispatchAction?.("learn");
    expect(fetchMock).toHaveBeenCalledWith("/api/touchpoints/production-runtime/events", expect.objectContaining({ method: "POST" }));
    expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("mounts valid badge content when a refresh starts while verification is deferred", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    let resolveVerified: ((value: any) => void) | undefined;
    const verified = new Promise<any>((resolve) => { resolveVerified = resolve; });
    const verify = vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockReturnValue(verified);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(decision()), { status: 200 }))); vi.stubGlobal("fetch", fetchMock);
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event("focus")); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveVerified?.({ entryUrl: "blob:badge", resourceUrls: new Map(), dispose: vi.fn() });
    const badge = await screen.findByTestId("production-campaign-badge");
    await waitFor(() => expect(badge.querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("Badge"));
  });

  it("cancels and fences an expired badge timer after accepting a replacement", async () => {
  getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
  const start = Date.now();
  const now = vi.spyOn(Date, "now").mockReturnValue(start);
  const scheduledTimers: Array<{ callback: () => void; delay: number; handle: number }> = [];
  const actualSetTimeout = globalThis.setTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: TimerHandler, delay?: number, ...args: any[]) => {
   const handle = actualSetTimeout(callback, delay, ...args);
   if (typeof callback === "function") scheduledTimers.push({ callback: () => callback(...args), delay: Number(delay), handle });
   return handle;
  }) as typeof setTimeout);
  const clearTimeoutMock = vi.spyOn(globalThis, "clearTimeout");
  const callbacks: Array<(actionId: string) => Promise<void>> = [];
  vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, _entry, _digest, _context, _urls, _actions, options) { if (options?.dispatchAction) callbacks.push(options.dispatchAction); this.shadowRoot?.replaceChildren(document.createTextNode("Badge")); });
  let resolveReplacement: ((value: ReturnType<typeof decision>) => void) | undefined;
  const replacementBody = new Promise<ReturnType<typeof decision>>((resolve) => { resolveReplacement = resolve; });
  const oldDecision = decision({ authorizationExpiresAt: new Date(start + 7_000).toISOString() });
  const replacementDecision = decision({ authorizationExpiresAt: new Date(start + 15_000).toISOString(), touchpointDecisionId: "replacement-badge" });
  const replacementResponse = new Response(JSON.stringify(replacementDecision), { status: 200 });
  vi.spyOn(replacementResponse, "json").mockReturnValue(replacementBody);
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
   if (init?.method === "POST") return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
   if (fetchMock.mock.calls.length === 2) return Promise.resolve(replacementResponse);
   return Promise.resolve(new Response(JSON.stringify(oldDecision), { status: 200 }));
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "userActivation", { configurable: true, value: { isActive: true } });
  render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
  await waitFor(() => expect(callbacks).toHaveLength(1));
  const oldCallback = callbacks[0]!;
  const oldTimer = scheduledTimers.find((timer) => timer.delay === 7_000);
  expect(oldTimer).toBeDefined();
  now.mockReturnValue(start + 7_001); // The old lease is expired, but its timer callback is delayed.
  window.dispatchEvent(new Event("focus"));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  resolveReplacement?.(replacementDecision);
  await Promise.resolve(); // Replacement acceptance must cancel and fence the old timer before React cleanup.
  expect(clearTimeoutMock).toHaveBeenCalled(); // The queued old timer below proves cancellation/fencing behavior without Node Timeout identity.
  await oldCallback("learn");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(openExternalUrlMock).not.toHaveBeenCalled();
  await waitFor(() => expect(callbacks).toHaveLength(2));
  await act(async () => { oldTimer?.callback(); }); // A queued stale callback must not clear the replacement.
  expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("Badge");
  await callbacks[1]!("learn");
  expect(fetchMock).toHaveBeenCalledWith("/api/touchpoints/production-runtime/events", expect.objectContaining({ method: "POST" }));
  expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
  const replacementTimer = scheduledTimers.find((timer) => timer.delay === 7_999);
  expect(replacementTimer).toBeDefined();
  now.mockReturnValue(start + 15_001);
  await act(async () => { replacementTimer?.callback(); });
  expect(screen.queryByTestId("production-campaign-badge")).toBeNull();
  await callbacks[1]!("learn");
  expect(fetchMock).toHaveBeenCalledTimes(3);
 });

 it("releases a late verified badge resource once without mounting after an account switch", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    let resolveVerified: ((value: any) => void) | undefined;
    const verified = new Promise<any>((resolve) => { resolveVerified = resolve; });
    const verify = vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockReturnValue(verified);
    const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, "mount");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(decision()), { status: 200 })));
    const view = render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    view.rerender(<ProductionCampaignBadge authenticated sessionSubject="account-b" />);
    const release = vi.fn(); resolveVerified?.({ entryUrl: "blob:badge", resourceUrls: new Map(), dispose: release });
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    expect(mount).not.toHaveBeenCalled();
  });
});
