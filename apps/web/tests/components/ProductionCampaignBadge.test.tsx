// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { getOpenDesignHostMock } = vi.hoisted(() => ({ getOpenDesignHostMock: vi.fn() }));
vi.mock("@open-design/host", () => ({ getOpenDesignHost: getOpenDesignHostMock }));
import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import { I18nProvider, useI18n } from "../../src/i18n";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";
const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const openExternalUrlMock = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: openExternalUrlMock }));
const entry = "export function mount(root) { root.textContent = 'Badge'; return root; }";
const manifest = { formatVersion: 2 as const, runtimeKind: "web-component" as const, runtimeApiVersion: 1 as const, platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const, sdkVersion: "vela-touchpoint-sdk-v1" as const, contentLine: "badge", placements: [{ key: "opend.home.account-badge" as const, entry: "component.js", resources: [], locales: ["en-US"], requiredCapabilities: ["static-action"], staticActions: [{ id: "learn", target: { kind: "https" as const, url: "https://example.com" } }] }], resources: ["component.js"], images: [] };
const content = { id: "version-badge", placementKey: "opend.home.account-badge", locale: "en-US", manifestHash: digest(JSON.stringify(manifest)), entryPath: "component.js", entryDigest: digest(entry), entryModule: entry, resources: [{ path: "component.js", digest: digest(entry), bytes: btoa(entry) }], runtime: { kind: "web-component" as const, apiVersion: 1 as const, wrapperVersion: "vela-touchpoint-wrapper-v1" as const, sdkVersion: "vela-touchpoint-sdk-v1" as const }, buildIdentity: { fingerprint: "badge-fixed" }, manifest };
const decision = (overrides: Record<string, unknown> = {}) => { const now = new Date(); return { activityId: "badge-activity", authorizationExpiresAt: new Date(now.getTime() + 60_000).toISOString(), content, deploymentId: "deployment-badge", endsAt: new Date(now.getTime() + 5 * 60_000).toISOString(), placementKey: "opend.home.account-badge", requiredCapabilities: ["static-action"], serverTime: now.toISOString(), staticActions: [{ id: "learn", target: { kind: "https", url: "https://example.com" } }], touchpointDecisionId: "decision-badge", ...overrides }; };
function LocaleSwitch() {
  const { setLocale } = useI18n();
  return <button onClick={() => setLocale("zh-CN")}>Switch locale</button>;
}
beforeEach(() => { vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement) { this.shadowRoot?.replaceChildren(document.createTextNode("Badge")); }); });
afterEach(() => { cleanup(); getOpenDesignHostMock.mockReset(); openExternalUrlMock.mockClear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("ProductionCampaignBadge", () => {
  it("mounts the immutable account-badge through the shared custom-element adapter with locale fallback and no close control", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-GB" } });
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(decision()), { status: 200 }))); vi.stubGlobal("fetch", fetchMock);
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    const badge = await screen.findByTestId("production-campaign-badge");
    await waitFor(() => expect(badge.querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("Badge"));
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
  // OPEND-3363 contract change: `online` no longer withdraws the badge and
  // re-requests. It joins the revalidation `focus` already has in flight, so the
  // pair costs one request instead of two, and the mounted host is never torn
  // down between them.
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
    const host = screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint");
    await act(async () => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")).toBe(host);
    expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await dispatchAction?.("learn");
    expect(fetchMock).toHaveBeenCalledWith("/api/touchpoints/production-runtime/events", expect.objectContaining({ method: "POST" }));
    expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  // OPEND-3374 at the badge. Same story as the modal: a credential that expires
  // while the network is down comes back as a new `touchpointDecisionId`, and
  // while that id was in the lease key it rebuilt the badge for no reason.
  it("REGRESSION: a network outage that outlives the server credential does not remount the badge", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:badge", resourceUrls: new Map(), dispose: vi.fn() } as never);
    let online = true;
    let decisionId = "decision-1";
    const requests: string[] = [];
    const longLived = (overrides: Record<string, unknown> = {}) => {
      const now = Date.now();
      return decision({ touchpointDecisionId: decisionId, authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(), endsAt: new Date(now + 40 * 60_000).toISOString(), ...overrides });
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input));
      if (!online) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(longLived()), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const host = screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint");
    expect(host).not.toBeNull();
    expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
    online = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    online = true;
    decisionId = "decision-2";
    requests.length = 0;
    // OPEND-3436: a client in offline fallback revalidates on the reconnection
    // itself rather than on the next poll tick, so the event a real network
    // restore fires is now what drives recovery. What this case is about — the
    // host is not remounted across the outage — is unchanged.
    act(() => { window.dispatchEvent(new Event("online")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(requests[0]).toContain("activeDecisionId=decision-1");
    expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")).toBe(host);
    expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
  });

  it("still remounts the badge when the content version changes", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
    vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:badge", resourceUrls: new Map(), dispose: vi.fn() } as never);
    let nextContent = content;
    const fetchMock = vi.fn(async () => {
      const now = Date.now();
      return new Response(JSON.stringify(decision({ content: nextContent, authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(), endsAt: new Date(now + 40 * 60_000).toISOString() })), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date());
    render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const host = screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint");
    nextContent = { ...content, id: "version-badge-2" };
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(16); });
    expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")).not.toBe(host);
    expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(2);
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
  it("loads zh-CN content for the same decision after a client locale switch and fences a late en response", async () => {
    getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "fr-FR" } });
    let resolveLateEn: ((response: Response) => void) | undefined;
    const lateEn = new Promise<Response>((resolve) => { resolveLateEn = resolve; });
    const localized = (locale: string) => {
      const localizedManifest = { ...manifest, placements: [{ ...manifest.placements[0], locales: [locale] }] };
      return decision({ content: { ...content, locale, manifest: localizedManifest, manifestHash: digest(JSON.stringify(localizedManifest)) } });
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("locale=en") && fetchMock.mock.calls.length === 2) return lateEn;
      return Promise.resolve(new Response(JSON.stringify(localized(url.includes("locale=zh-CN") ? "zh-CN" : "en-US")), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, _entry, _digest, context) {
      this.shadowRoot?.replaceChildren(document.createTextNode(context.locale === "zh-CN" ? "中文内容" : "English content"));
    });
    render(<I18nProvider initial="en"><LocaleSwitch /><ProductionCampaignBadge authenticated sessionSubject="account-a" /></I18nProvider>);
    await screen.findByTestId("production-campaign-badge");
    await waitFor(() => expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("English content"));
    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => { screen.getByRole("button", { name: "Switch locale" }).click(); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("中文内容"));
    resolveLateEn?.(new Response(JSON.stringify(localized("en-US")), { status: 200 }));
    await Promise.resolve();
    expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")?.shadowRoot?.textContent).toContain("中文内容");
  });
});
