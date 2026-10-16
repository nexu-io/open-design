import { touchpointLoadQueue, resetTouchpointLoadObservability } from "../../src/components/touchpoint-load-observability";
// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TouchpointCloseReason, TouchpointSdk } from "@open-design/contracts";
import { touchpointLoadBatchSchema } from "@open-design/contracts/api/touchpointLoadResults";

import { I18nProvider, useI18n } from "../../src/i18n";
const cmsTrack = vi.hoisted(() => vi.fn());
vi.mock("../../src/analytics/provider", () => ({ useAnalytics: () => ({ track: cmsTrack }), useAppVersion: () => "test" }));
type HostGlobal = typeof globalThis & { __cmsTestHost?: unknown };
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () => (globalThis as HostGlobal).__cmsTestHost,
}));

import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import {
	TEST_ACCEPTANCE_RETRY_MS,
	TestCampaignModal,
	recordVisibleTestTouchpoint,
	setTestRuntimeSession,
	clearTestRuntimeSession,
	useTestRuntime,
	dispatchTestCampaignAction,
	testTouchpointLoadAttempt,
	type TestContext,
	type TestDecision,
	type TestRuntimeSession,
} from "../../src/components/TestCampaignModal";
import * as campaignNavigation from "../../src/components/touchpoint-navigation";
import { resolveConsolePricingTarget } from '../../src/components/console-pricing-target';
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";

const placements = [
	"opend.home.account-badge",
	"opend.home.campaign-modal",
	"opend.home.hover-entry",
	"opend.home.hover-layer",
] as const;
const context = {
	deploymentId: "deployment-1",
	scenario: "realtime" as const,
	updatedAt: "2030-01-01T00:00:00.000Z",
};
const immutableContext: TestContext = { ...context, testerMemberId: 'account-a', contextId: `ctx-v1:${'a'.repeat(64)}`,
  generation: '1', contextToken: `ctx-token-v1:${'b'.repeat(64)}` };
const manifest = {
	formatVersion: 2 as const,
	runtimeKind: "web-component" as const,
	runtimeApiVersion: 1 as const,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
	sdkVersion: "vela-touchpoint-sdk-v1" as const,
	contentLine: "four-placement-test",
	placements: placements.map((key) => ({
		key,
		entry: `${key.split(".").at(-1)}.js`,
		resources: [],
		locales: ["zh-CN"],
		requiredCapabilities:
			key === "opend.home.campaign-modal"
				? ["close", "static-action"]
				: key === "opend.home.account-badge"
					? ["static-action"]
					: ["hover", "static-action"],
		staticActions: [],
	})),
	resources: placements.map((key) => `${key.split(".").at(-1)}.js`),
	images: [],
};
function decision(placementKey: (typeof placements)[number]): TestDecision {
	const entryPath = `${placementKey.split(".").at(-1)}.js`;
	return {
		deploymentId: context.deploymentId,
		activityId: "activity-four",
		snapshotHash: "sha256:four-snapshot",
		artifactHash: "sha256:four-artifact",
		manifestHash: "sha256:four-manifest",
		placementKey,
		requiredCapabilities:
			placementKey === "opend.home.campaign-modal"
				? ["close", "static-action"]
				: placementKey === "opend.home.account-badge"
					? ["static-action"]
					: ["hover", "static-action"],
		staticActions: [],
		serverTime: "2030-01-01T00:00:00.000Z",
		authorizationExpiresAt: "2030-01-01T00:01:00.000Z",
		startsAt: "2029-12-31T23:00:00.000Z",
		endsAt: "2030-01-01T01:00:00.000Z",
		testContext: { ...context, scheduleState: "active" },
		content: {
			id: "version-four-placement",
			placementKey,
			locale: "zh-CN",
			manifest,
			manifestHash: "sha256:four-manifest",
			entryPath,
			entryDigest: "sha256:entry",
			entryModule: "export {}",
			resources: [],
			runtime: {
				kind: "web-component",
				apiVersion: 1,
				wrapperVersion: "vela-touchpoint-wrapper-v1",
				sdkVersion: "vela-touchpoint-sdk-v1",
			},
			buildIdentity: { fingerprint: "four-placement" },
		},
	};
}

describe("Test decisions at the existing host touchpoints", () => {
	/**
	 * A host reports no box until React commits `hidden` and the package lays
	 * out. Pinning this to 1 for every element would assert away the very frame
	 * the receipt is lost in, so tests drive it and wake the observer by hand.
	 */
	let clientRectCount = 1;
	const resizeObserverCallbacks: Array<() => void> = [];
	const notifyResizeObservers = () => {
		for (const trigger of [...resizeObserverCallbacks]) trigger();
	};
	beforeEach(() => {
	vi.spyOn(touchpointLoadQueue("production"), "enqueue").mockImplementation(() => {});
	vi.spyOn(touchpointLoadQueue("test"), "enqueue").mockImplementation(() => {});
		localStorage.clear();
		clientRectCount = 1;
		resizeObserverCallbacks.length = 0;
		vi.stubEnv("NEXT_PUBLIC_CMS_HOST_RELEASE", `sha256:${"a".repeat(64)}`);
		document.documentElement.lang = "zh-CN";
		vi.stubGlobal(
			"ResizeObserver",
			class {
				private trigger?: () => void;
				constructor(private readonly callback: ResizeObserverCallback) {}
				observe() {
					this.trigger = () =>
						this.callback([], this as unknown as ResizeObserver);
					resizeObserverCallbacks.push(this.trigger);
				}
				disconnect() {
					const index = this.trigger
						? resizeObserverCallbacks.indexOf(this.trigger)
						: -1;
					if (index >= 0) resizeObserverCallbacks.splice(index, 1);
				}
			},
		);
		(globalThis as HostGlobal).__cmsTestHost = {
			version: 2,
			client: { type: "desktop", osLocale: "en-CN" },
		};
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-host",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (this: OpenDesignTouchpointElement) {
				this.shadowRoot?.replaceChildren(
					document.createTextNode("Test host content"),
				);
			});
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
			() =>
				({
					length: clientRectCount,
					item: () => null,
				}) as unknown as DOMRectList,
		);
	});
	afterEach(() => {
	cmsTrack.mockClear();
	resetTouchpointLoadObservability();
		clearTestRuntimeSession();
		cleanup();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		delete (globalThis as HostGlobal).__cmsTestHost;
		vi.useRealTimers();
	});

	function pendingDecisions(
		held: readonly (typeof placements)[number][],
		renderer?: { apiVersion: 1 | 2; entryDigest: string; pricing?: boolean },
		initialContext: TestContext = context,
	) {
		vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
		vi.setSystemTime(new Date(context.updatedAt));
		vi.spyOn(document, "hidden", "get").mockReturnValue(false);
		const pending = new Map<string, { resolve: (response: Response) => void; signal: AbortSignal }>();
		let current: TestRuntimeSession | null = null;
		function Probe() { current = useTestRuntime(); return null; }
		let deployment = {
			id: context.deploymentId, activityId: "activity-four", snapshotHash: "sha256:four-snapshot",
			snapshot: { contentVersionId: "version-four-placement", manifestHash: "sha256:four-manifest", artifactHash: "sha256:four-artifact", placementKeys: [...placements] },
		};
		const calls: string[] = [];
		let runtimeContext = initialContext;
		const behaviors: Array<{ body: Record<string, unknown>; signal: AbortSignal }> = [];
		const receipts: string[] = [];
		const mirrors: Array<Record<string, unknown>> = [];
		let behaviorStatus = 202;
		let holdContext = false;
		vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
			const url = new URL(input, "http://localhost");
			if (url.pathname.endsWith("/deployments")) return Response.json({ deployments: [deployment] });
			if (url.pathname.endsWith("/context")) {
				if (holdContext) return new Promise<Response>((resolve) => pending.set("context", { resolve, signal: init!.signal! }));
				return Response.json({ ...runtimeContext, deploymentId: deployment.id });
			}
			if (url.pathname.includes("acceptances")) { receipts.push(input); return Response.json({ id: "acceptance" }); }
			if (url.pathname === '/api/integrations/vela/analytics-entry') { mirrors.push(JSON.parse(String(init?.body))); return Response.json({}); }
			if (url.pathname === '/api/touchpoints/test-runtime/events') {
				behaviors.push({ body: JSON.parse(String(init?.body)), signal: init!.signal! });
				return Response.json({ accepted: behaviorStatus === 202, deduplicated: false }, { status: behaviorStatus });
			}
			if (url.pathname === "/api/touchpoints/test-runtime") {
				const key = placements.find((key) => key === url.searchParams.get("placementKey"))!;
				calls.push(key);
				// Deliberately ignores abort: cancellation must fence late results too.
				if (held.includes(key)) return new Promise<Response>((resolve) => pending.set(key, { resolve, signal: init!.signal! }));
				const value = decision(key);
				if (renderer) {
					const actions = [{ id: 'primary', target: renderer.pricing ? { kind: 'console-pricing' as const } : { kind: 'https' as const, url: 'https://example.com/test' } }];
					value.staticActions = actions;
					if (renderer.pricing) value.requiredCapabilities = [...value.requiredCapabilities, 'action-console-pricing-v1'];
					value.content.manifest = { ...value.content.manifest, placements: value.content.manifest.placements.map(p => ({ ...p, staticActions: actions,
						requiredCapabilities: renderer.pricing ? [...p.requiredCapabilities, 'action-console-pricing-v1'] : p.requiredCapabilities })) };
				}
				if (renderer) {
					value.content = { ...value.content, entryDigest: renderer.entryDigest,
						manifest: { ...value.content.manifest, runtimeApiVersion: renderer.apiVersion },
						runtime: { ...value.content.runtime, apiVersion: renderer.apiVersion } };
				}
				return Response.json({ ...value, deploymentId: deployment.id, activityId: deployment.activityId,
					testContext: { ...runtimeContext, scheduleState: 'active', deploymentId: deployment.id },
					serverTime: new Date().toISOString(), authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString() });
			}
			return Response.json({}, { status: 404 });
		}));
		const view = render(<I18nProvider initial="zh-CN"><Probe />
			<TestCampaignModal authenticated sessionSubject="account-a" />
			<ProductionCampaignModal authenticated sessionSubject="account-a" />
			<ProductionCampaignBadge authenticated sessionSubject="account-a" />
			<ProductionCampaignHover authenticated sessionSubject="account-a" />
		</I18nProvider>);
		const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
		const resolve = async (key: (typeof placements)[number], response = Response.json(decision(key))) => {
			await act(async () => { pending.get(key)!.resolve(response); });
			await tick();
		};
		return { pending, calls, tick, resolve, view, behaviors, receipts, mirrors, session: () => current, holdContext: () => { holdContext = true; },
			setContext: (next: TestContext) => { runtimeContext = next; }, failBehavior: () => { behaviorStatus = 503; },
			replaceActivity: () => { deployment = { ...deployment, id: "deployment-2", activityId: "activity-new" }; } };
	}

	async function realSdkModal(apiVersion: 1 | 2, runtimeContext: TestContext = context, options: { pricing?: boolean; failBehavior?: boolean } = {}) {
		// Exercise the real component, SDK and mountTouchpoint adapter. Only the
		// verified-package boundary and module download are replaced by fixtures.
		vi.mocked(OpenDesignTouchpointElement.prototype.mount).mockRestore();
		const sdks = new Map<string, TouchpointSdk>();
		const entryDigest = `sha256:${crypto.randomUUID().replaceAll("-", "").repeat(2)}`;
		await touchpointComponent.webTouchpointModuleCache.import(entryDigest, async () => ({
			mount(root: ShadowRoot, host: touchpointComponent.WebTouchpointContext, sdk: TouchpointSdk) {
				sdks.set(host.placementKey, sdk);
				root.replaceChildren(document.createTextNode("Real SDK fixture"));
				return {};
			},
			update() {},
			dispose() {},
		}));
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
		const h = pendingDecisions([], { apiVersion, entryDigest, pricing: options.pricing }, runtimeContext);
		if (options.failBehavior) h.failBehavior();
		await h.tick();
		await act(async () => { notifyResizeObservers(); });
		await h.tick(32);
		const sdk = sdks.get("opend.home.campaign-modal")!;
		expect(sdk).toBeDefined();
		expect(sdk.runtimeApiVersion).toBe(apiVersion);
		const visible = vi.mocked(touchpointLoadQueue("test").enqueue).mock.calls
			.map(([record]) => record).find(record => record.result === "visible" && record.placement_key === "opend.home.campaign-modal")!;
		expect(visible).toBeDefined();
		expect(cmsTrack).toHaveBeenCalledWith("surface_view", expect.objectContaining({ mode: "test", decision_id: null,
			load_attempt_id: visible.load_attempt_id }), { insertId: visible.event_id });
		return { ...h, sdk, sdks, visible };
	}

	it("CMS-REL-009 removes every Test host within 30s including a delayed withdrawal response", async () => {
		const h = await realSdkModal(2, immutableContext);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(4);
		const fetchMock = vi.mocked(fetch);
		const original = fetchMock.getMockImplementation()!;
		fetchMock.mockImplementation(async (input, init) => {
			if (new URL(String(input), "http://localhost").pathname === "/api/touchpoints/test-runtime") {
				await new Promise(resolve => setTimeout(resolve, 5_000));
				return new Response(null, { status: 410 });
			}
			return original(input, init);
		});
		await h.tick(30_000);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		await h.tick(30_000);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
	});

	it.each([1, 2] as const)('actual SDK %s shares four visible B values across terminal/analytics/Test network and keeps renewal immutable', async apiVersion => {
		const h = await realSdkModal(apiVersion, immutableContext);
		expect(h.behaviors).toHaveLength(3);
		expect(h.behaviors.some(({ body }) => body.placementKey === 'opend.home.hover-layer')).toBe(false);
		fireEvent.pointerEnter(screen.getByTestId('cms-hover-overlay-root').querySelector('opend-touchpoint')!);
		await h.tick(32);
		expect(h.behaviors).toHaveLength(4);
		const terminals = vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([r]) => r).filter(r => r.result === 'visible');
		for (const terminal of terminals) {
			expect(h.behaviors.map(({ body }) => body)).toContainEqual(expect.objectContaining({ kind: 'exposure', eventId: terminal.event_id,
				loadAttemptId: terminal.load_attempt_id, placementKey: terminal.placement_key, contextId: immutableContext.contextId,
				generation: '1', contextToken: immutableContext.contextToken, locale: 'zh-CN' }));
			expect(cmsTrack).toHaveBeenCalledWith('surface_view', expect.objectContaining({ decision_id: null, load_attempt_id: terminal.load_attempt_id }), { insertId: terminal.event_id });
		}
		expect(new Set(h.behaviors.map(({ body }) => body.eventId)).size).toBe(4);
		await h.tick(30_000);
		expect(h.behaviors).toHaveLength(4);
		fireEvent.pointerLeave(screen.getByTestId('cms-hover-overlay-root').querySelector('opend-touchpoint')!);
		await h.tick(500);
		expect(h.behaviors.filter(({ body }) => body.kind === 'click')).toHaveLength(0);
	});

	it.each(['close', 'secondary_close'] as const)('actual manual %s shares C with runtime and does not repeat after revoke', async reason => {
		const h = await realSdkModal(2, immutableContext);
		await act(async () => { h.sdk.requestClose(reason); }); await h.tick();
		const click = h.behaviors.find(({ body }) => body.kind === 'click')!.body;
		expect(click).toMatchObject({ element: reason, loadAttemptId: h.visible.load_attempt_id, contextToken: immutableContext.contextToken });
		expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toHaveLength(1);
		expect(cmsTrack).toHaveBeenCalledWith('ui_click', expect.objectContaining({ element: reason, decision_id: null }), { insertId: click.eventId });
		await act(async () => { h.sdk.requestClose(reason); }); await h.tick();
		expect(h.behaviors.filter(({ body }) => body.kind === 'click')).toHaveLength(1);
	});

	it('actual primary binds the dispatch owner, ignores injected capture and remains independent of suppressed analytics', async () => {
		const h = await realSdkModal(2, immutableContext);
		vi.stubGlobal('navigator', { userActivation: { isActive: true } });
		const navigation = vi.spyOn(campaignNavigation, 'navigateCampaignTarget').mockResolvedValue(true);
		cmsTrack.mockClear();
		cmsTrack.mockImplementation(() => undefined); // Consent suppression: track emits nothing externally.
		const current = h.session()!.decisions.get('opend.home.campaign-modal')!;
		expect(await dispatchTestCampaignAction(current, 'primary', { track: cmsTrack, cmsCapture: { context: {} as never, eventId: 'browser-forged' } })).toBe(true);
		await h.tick();
		const click = h.behaviors.find(({ body }) => body.kind === 'click')!.body;
		// No role binding: an action ID spelled "primary" is not a verified primary role.
		expect(click).toMatchObject({ contractVersion: 2, element: 'unclassified_cta', button: expect.objectContaining({ id: 'primary', role: null }), contextToken: immutableContext.contextToken, loadAttemptId: h.visible.load_attempt_id });
		expect(click.eventId).not.toBe('browser-forged');
		expect(navigation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cmsCapture: expect.objectContaining({ eventId: click.eventId }) }));
		expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toHaveLength(1);
		expect(cmsTrack.mock.calls[0]![2]).toEqual({ insertId: click.eventId });
	});
	it.each([true, false])('actual SDK pricing primary has one C across runtime, analytics and consent=%s AMR mirror', async consent => {
		const h = await realSdkModal(2, immutableContext, { pricing: true });
		vi.stubGlobal('navigator', { userActivation: { isActive: true } });
		vi.spyOn(campaignNavigation, 'navigateCampaignTarget').mockImplementation(async (target, options) => {
			expect(target.kind).toBe('console-pricing');
			// Privacy preference is daemon-owned, not a browser localStorage field.
			resolveConsolePricingTarget({ ...options, metricsConsent: consent }); return true;
		});
		cmsTrack.mockClear();
		await act(async () => { await h.sdk.dispatchAction('primary'); }); await h.tick();
		const click = h.behaviors.find(({ body }) => body.kind === 'click')!.body;
		// No role binding: an action ID spelled "primary" is not a verified primary role.
		expect(click).toMatchObject({ contractVersion: 2, element: 'unclassified_cta', button: expect.objectContaining({ id: 'primary', role: null }), contextToken: immutableContext.contextToken, loadAttemptId: h.visible.load_attempt_id });
		const analytics = cmsTrack.mock.calls.filter(([event]) => event === 'ui_click'); expect(analytics).toHaveLength(1);
		expect(analytics[0]![2]).toEqual({ insertId: click.eventId });
		expect(h.mirrors).toHaveLength(consent ? 1 : 0);
		if (consent) expect(h.mirrors[0]).toMatchObject({ payload: { cmsEventId: click.eventId, entryId: analytics[0]![1].entry_id } });
		expect(h.behaviors.filter(({ body }) => body.kind === 'click')).toHaveLength(1); // CTA closing is automatic, not another close C.
	});
	it('actual renewed hover primary takes the current context while historical B keeps its first binding', async () => {
		const h = await realSdkModal(2, immutableContext);
		fireEvent.pointerEnter(screen.getByTestId('cms-hover-overlay-root').querySelector('opend-touchpoint')!); await h.tick(32);
		const firstLayer = h.behaviors.find(({ body }) => body.placementKey === 'opend.home.hover-layer')!.body;
		h.setContext({ ...immutableContext, generation: '2', contextToken: `ctx-token-v1:${'c'.repeat(64)}` });
		await h.tick(30_000); await act(async () => { notifyResizeObservers(); }); await h.tick(32);
		fireEvent.pointerEnter(screen.getByTestId('cms-hover-overlay-root').querySelector('opend-touchpoint')!); await h.tick(32);
		vi.stubGlobal('navigator', { userActivation: { isActive: true } });
		vi.spyOn(campaignNavigation, 'navigateCampaignTarget').mockResolvedValue(true);
		await act(async () => { await h.sdks.get('opend.home.hover-layer')!.dispatchAction('primary'); }); await h.tick();
		const click = h.behaviors.find(({ body }) => body.kind === 'click')!.body;
		expect(firstLayer).toMatchObject({ generation: '1', contextToken: immutableContext.contextToken });
		expect(click).toMatchObject({ generation: '2', contextToken: `ctx-token-v1:${'c'.repeat(64)}`, placementKey: 'opend.home.hover-layer' });
	});
	it('runtime transport failures preserve actual visible/QA success and selection exit cancels retries', async () => {
		const h = await realSdkModal(2, immutableContext, { failBehavior: true });
		expect(h.receipts).toHaveLength(3);
		expect(screen.getByRole('dialog', { name: '测试活动' })).toBeVisible();
		const before = h.behaviors.length;
		clearTestRuntimeSession(); await h.tick(10_000);
		expect(h.behaviors).toHaveLength(before);
		const records = vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([r]) => r);
		expect(records.filter(r => r.result === 'visible')).toHaveLength(3);
		// The accepted QA receipt is not the exposure receipt: it must not claim report success.
		expect(records.filter(r => r.kind === 'report' && r.report_result === 'success')).toHaveLength(0);
	});
	const exposureReports = () => {
		const records = vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([r]) => r);
		const visible = records.filter(r => r.result === 'visible');
		return { records, visible, reports: records.filter(r => r.kind === 'report' && visible.some(v => v.load_attempt_id === r.load_attempt_id)) };
	};
	it('OBS-006 an exhausted test-events receipt reports failed with its HTTP status while the terminal stays visible', async () => {
		const h = await realSdkModal(2, immutableContext, { failBehavior: true });
		await h.tick(10_000);
		const exposures = h.behaviors.filter(({ body }) => body.kind === 'exposure');
		expect(new Set(exposures.map(({ body }) => body.eventId)).size).toBe(3);
		expect(exposures).toHaveLength(9); // three bounded attempts per receipt
		const { records, visible, reports } = exposureReports();
		expect(visible).toHaveLength(3);
		expect(reports).toHaveLength(3);
		for (const record of visible) expect(reports.filter(r => r.load_attempt_id === record.load_attempt_id)).toEqual([
			expect.objectContaining({ kind: 'report', report_result: 'failed', http_status: 503, result: null, failure_stage: null, error_code: null }),
		]);
		// Rendering succeeded: no failed/mount_error terminal, the modal stays on screen.
		expect(records.filter(r => r.kind === 'terminal' && r.result !== 'visible')).toHaveLength(0);
		expect(screen.getByRole('dialog', { name: '测试活动' })).toBeVisible();
		expect(h.receipts).toHaveLength(3);
		expect(touchpointLoadBatchSchema.safeParse({ contractVersion: 1, records: reports }).success).toBe(true);
	});
	it('OBS-006 an accepted test-events receipt reports success once per visible attempt', async () => {
		const h = await realSdkModal(2, immutableContext);
		await h.tick(10_000);
		const { visible, reports } = exposureReports();
		expect(visible).toHaveLength(3);
		expect(reports).toHaveLength(3);
		expect(reports.every(r => r.report_result === 'success' && r.http_status === null)).toBe(true);
		expect(h.receipts).toHaveLength(3);
	});

	it('does not let an accepted QA receipt swallow a new real load attempt B', async () => {
		const h = await realSdkModal(2, immutableContext);
		const receiptCount = h.receipts.length;
		const previous = h.session()!.decisions.get('opend.home.campaign-modal')!;
		testTouchpointLoadAttempt(previous)!.cancel('page_left');
		await h.tick(30_000); await act(async () => { notifyResizeObservers(); }); await h.tick(32);
		const modalEvents = h.behaviors.filter(({ body }) => body.kind === 'exposure' && body.placementKey === 'opend.home.campaign-modal');
		expect(modalEvents).toHaveLength(2);
		expect(modalEvents[1]!.body.loadAttemptId).not.toBe(modalEvents[0]!.body.loadAttemptId);
		expect(modalEvents[1]!.body.eventId).not.toBe(modalEvents[0]!.body.eventId);
		expect(h.receipts).toHaveLength(receiptCount);
	});

	it('old-server actual SDK keeps display and QA while behavior reporting is unavailable', async () => {
		const h = await realSdkModal(1);
		expect(h.receipts.length).toBe(3); expect(h.behaviors).toHaveLength(0);
		await act(async () => { h.sdk.requestClose('close'); }); await h.tick();
		expect(h.behaviors).toHaveLength(0);
	});
	it.each([{ ...context, contextId: immutableContext.contextId }, { ...immutableContext, generation: '0' },
		{ ...immutableContext, contextToken: 'Bearer forged' }])('fails closed for invalid context bundle %j', async bad => {
		const h = pendingDecisions([], undefined, bad as TestContext); await h.tick(32);
		expect(h.session()?.decisions.size ?? 0).toBe(0); expect(h.behaviors).toHaveLength(0); expect(h.receipts).toHaveLength(0);
		expect(screen.queryByRole('dialog', { name: 'Test campaign' })).toBeNull();
	});

	it.each(([1, 2] as const).flatMap(apiVersion =>
		(["close", "secondary_close", undefined, "forged"] as const).map(reason => ({ apiVersion, reason })),
	))("real SDK API $apiVersion close $reason crosses the Test adapter without inventing a category", async ({ apiVersion, reason }) => {
		const h = await realSdkModal(apiVersion);
		await act(async () => {
			if (reason === undefined) h.sdk.requestClose();
			else h.sdk.requestClose(reason as TouchpointCloseReason);
		});
		await h.tick();
		const clicks = () => cmsTrack.mock.calls.filter(([event]) => event === "ui_click");
		if (reason === "close" || reason === "secondary_close") {
			expect(clicks()).toHaveLength(1);
			expect(clicks()[0]).toEqual(["ui_click", expect.objectContaining({ page_name: "home", area: "cms_campaign_modal",
				element: reason, mode: "test", decision_id: null, placement_key: "opend.home.campaign-modal",
				activity_id: "activity-four", deployment_id: context.deploymentId, content_version_id: "version-four-placement",
				load_attempt_id: h.visible.load_attempt_id }), { insertId: expect.any(String) }]);
		} else expect(clicks()).toHaveLength(0);
		// The host still closes for legacy/invalid requests, then revokes the SDK.
		expect(h.sdk.signal.aborted).toBe(true);
		const count = clicks().length;
		await act(async () => { h.sdk.requestClose("close"); });
		expect(clicks()).toHaveLength(count);
	});

	it.each([1, 2] as const)("real SDK API %s cannot close through a no-longer-current Test adapter", async apiVersion => {
		const h = await realSdkModal(apiVersion);
		expect(h.session()!.isAuthorized("opend.home.campaign-modal")).toBe(true);
		// No visibility event/dispose runs first: the still-live SDK must hit the
		// adapter's fresh authorization guard, rather than rely on SDK revocation.
		vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		expect(h.session()!.isAuthorized("opend.home.campaign-modal")).toBe(false);
		expect(h.sdk.signal.aborted).toBe(false);
		await act(async () => { h.sdk.requestClose("secondary_close"); });
		expect(cmsTrack.mock.calls.filter(([event]) => event === "ui_click")).toHaveLength(0);
		expect(h.sdk.signal.aborted).toBe(false);
	});

	it("captures actual Test visible facts with nullable decisions and no untriggered layer", async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
    const h = pendingDecisions([]);
    await h.tick();
    await act(async () => { notifyResizeObservers(); });
    await h.tick(32);
    const records = () => vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([record]) => record);
    const visible = records().filter(record => record.result === 'visible');
    expect(visible).toHaveLength(3);
    for (const record of visible) expect(cmsTrack).toHaveBeenCalledWith('surface_view', expect.objectContaining({ mode: 'test', decision_id: null, placement_key: record.placement_key, load_attempt_id: record.load_attempt_id }), { insertId: record.event_id });
    expect(cmsTrack.mock.calls.filter(([, props]) => props.area === 'cms_hover_layer')).toHaveLength(0);
    const entry = screen.getByTestId('cms-hover-overlay-root').querySelector('opend-touchpoint')!;
    fireEvent.pointerEnter(entry);
    await h.tick(32);
    const layer = records().find(record => record.result === 'visible' && record.placement_key === 'opend.home.hover-layer')!;
    expect(layer).toBeTruthy();
    expect(cmsTrack).toHaveBeenCalledWith('surface_view', expect.objectContaining({ mode: 'test', area: 'cms_hover_layer', element: 'layer', decision_id: null }), { insertId: layer.event_id });
    await h.tick(30_000);
    expect(cmsTrack.mock.calls.filter(([event]) => event === 'surface_view')).toHaveLength(4);
    expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toHaveLength(0);
  });

	it("publishes ready badge and atomic hover before an unresolved modal, and renews healthy grants after its timeout", async () => {
		const h = pendingDecisions(["opend.home.campaign-modal"]);
		await h.tick();
		expect(h.pending.has("opend.home.campaign-modal")).toBe(true);
		expect(h.session()?.decisions.size).toBe(3);
		expect(screen.getByTestId("production-campaign-badge")).toBeVisible();
		const entry = screen.getByTestId("cms-hover-overlay-root").querySelector("opend-touchpoint");
		expect(entry).not.toHaveAttribute("hidden");
		await h.tick(9_999);
		expect(h.session()?.decisions.size).toBe(3);
		await h.tick(1);
		await h.tick(20_000); // Healthy presentations renew at their existing poll boundary.
		await h.tick(30_001);
		expect(h.session()?.isAuthorized("opend.home.account-badge")).toBe(true);
		expect(screen.getByTestId("production-campaign-badge")).toBeVisible();
		expect(h.calls.filter((key) => key === "opend.home.account-badge").length).toBeGreaterThan(1);
		expect(h.calls.filter((key) => key === "opend.home.campaign-modal").length).toBeGreaterThan(1);
		// D-POLL retries the failed presentation on cadence without a recovery event.
		await h.resolve("opend.home.campaign-modal");
		expect(h.session()?.isAuthorized("opend.home.campaign-modal")).toBe(true);
	});

	it("waits for both hover halves while badge is ready, independently of a mounting modal", async () => {
		vi.mocked(OpenDesignTouchpointElement.prototype.mount).mockImplementation(async function (_url, _digest, host) {
			if (host.placementKey === "opend.home.campaign-modal") await new Promise<void>(() => {});
		});
		const h = pendingDecisions(["opend.home.hover-layer"]);
		await h.tick();
		expect(screen.getByTestId("production-campaign-badge")).toBeVisible();
		expect(h.session()?.decisions.has("opend.home.hover-entry")).toBe(false);
		expect(screen.queryByTestId("cms-hover-overlay-root")).toBeNull();
		await h.resolve("opend.home.hover-layer");
		expect(h.session()?.decisions.size).toBe(4);
		expect(screen.getByTestId("cms-hover-overlay-root").querySelector("opend-touchpoint")).not.toHaveAttribute("hidden");
	});

	it.each([401, 403, 410])("late modal %s withdraws early authority immediately and fences an abort-ignoring sibling", async (status) => {
		const h = pendingDecisions(["opend.home.campaign-modal", "opend.home.hover-layer"]);
		await h.tick();
		expect(h.session()?.decisions.size).toBe(1);
		const previous = h.session()!;
		await h.resolve("opend.home.campaign-modal", Response.json({}, { status }));
		expect(previous.isAuthorized("opend.home.account-badge")).toBe(false);
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
		expect(h.pending.get("opend.home.hover-layer")!.signal.aborted).toBe(true);
		await h.resolve("opend.home.hover-layer");
		await h.tick();
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
		await h.tick(10_001);
		// A new valid badge answer may display on cadence; the rejected grant
		// and abort-ignoring hover answer must never regain authority.
		expect(previous.isAuthorized("opend.home.account-badge")).toBe(false);
		expect(h.session()).not.toBe(previous);
		expect(h.session()?.decisions.size).toBe(1);
		expect(h.session()?.isAuthorized("opend.home.account-badge")).toBe(true);
		expect(h.session()?.decisions.has("opend.home.hover-layer")).toBe(false);
		expect(h.session()?.decisions.has("opend.home.campaign-modal")).toBe(false);
	});

	it.each(["activity", "schedule", "schedule-state", "context"] as const)("late %s conflict clears the partial session before a sibling settles", async (kind) => {
		const h = pendingDecisions(["opend.home.campaign-modal", "opend.home.hover-layer"]);
		await h.tick();
		const previous = h.session()!;
		expect(previous.decisions.size).toBe(1);
		h.holdContext();
		const value = decision("opend.home.campaign-modal");
		await h.resolve("opend.home.campaign-modal", Response.json({ ...value,
			...(kind === "activity" ? { activityId: "foreign-activity" } : {}),
			...(kind === "schedule" ? { endsAt: "2030-01-01T00:30:00.000Z" } : {}),
			...(kind === "schedule-state" ? { testContext: { ...value.testContext, scheduleState: "before" } } : {}),
			...(kind === "context" ? { testContext: { ...value.testContext, updatedAt: "2030-01-01T00:00:01.000Z" } } : {}),
		}));
		expect(previous.isAuthorized("opend.home.account-badge")).toBe(false);
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
		await h.resolve("opend.home.hover-layer");
		await h.tick();
		expect(h.session()?.decisions.size ?? 0).toBe(0);
	});

	it("fences a stale activity refusal after selection replacement while a matching activity refusal still clears authority", async () => {
		const h = pendingDecisions(["opend.home.campaign-modal", "opend.home.hover-layer"]);
		await h.tick();
		const previous = h.session()!;
		const oldModal = h.pending.get("opend.home.campaign-modal")!;
		const oldLayer = h.pending.get("opend.home.hover-layer")!;
		h.replaceActivity();
		await act(async () => { window.dispatchEvent(new Event("focus")); });
		await h.tick();
		expect(h.session()?.deployment.activityId).toBe("activity-new");
		expect(h.session()?.isAuthorized("opend.home.account-badge")).toBe(true);
		expect(previous.isAuthorized("opend.home.account-badge")).toBe(false);
		expect(oldModal.signal.aborted).toBe(true);
		await act(async () => {
			oldModal.resolve(Response.json({}, { status: 401 }));
			oldLayer.resolve(Response.json(decision("opend.home.hover-layer")));
		});
		await h.tick();
		expect(h.session()?.deployment.activityId).toBe("activity-new");
		expect(h.session()?.isAuthorized("opend.home.account-badge")).toBe(true);
		await h.resolve("opend.home.campaign-modal", Response.json({}, { status: 403 }));
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
	});

	it("a late schedule end clears early authority and a later active sibling cannot republish it", async () => {
		const h = pendingDecisions(["opend.home.campaign-modal", "opend.home.hover-layer"]);
		await h.tick();
		const previous = h.session()!;
		expect(previous.decisions.size).toBe(1);
		const value = decision("opend.home.campaign-modal");
		await h.resolve("opend.home.campaign-modal", Response.json({ ...value,
			serverTime: value.endsAt, authorizationExpiresAt: value.endsAt,
			testContext: { ...value.testContext, scheduleState: "ended" },
		}));
		expect(previous.isAuthorized("opend.home.account-badge")).toBe(false);
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		await h.resolve("opend.home.hover-layer");
		expect(h.session()?.decisions.size ?? 0).toBe(0);
		expect(document.querySelectorAll("opend-touchpoint")).toHaveLength(0);
	});


	it.each([401, 403, 410, 503])("runtime %s controls all mounted Test authority while catalog is stalled", async (status) => {
		vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
		vi.setSystemTime(new Date(context.updatedAt));
		vi.spyOn(document, "hidden", "get").mockReturnValue(false);
		const activationDescriptor = Object.getOwnPropertyDescriptor(navigator, "userActivation");
		Object.defineProperty(navigator, "userActivation", { configurable: true, value: { isActive: true } });
		const navigate = vi.spyOn(campaignNavigation, "navigateCampaignTarget").mockResolvedValue(true);
		const deployment = {
			id: context.deploymentId, activityId: "activity-four", snapshotHash: "sha256:four-snapshot",
			snapshot: { contentVersionId: "version-four-placement", manifestHash: "sha256:four-manifest", artifactHash: "sha256:four-artifact", placementKeys: [...placements] },
		};
		const actions = [{ id: "plan", target: { kind: "https" as const, url: "https://example.com" } }];
		let renewed = false;
		const siblings: AbortSignal[] = [];
		const receipts: AbortSignal[] = [];
		const catalogs: AbortSignal[] = [];
		const stalled = (signal: AbortSignal, signals: AbortSignal[]) => new Promise<Response>((_resolve, reject) => {
			signals.push(signal);
			signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
		});
		const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
			const url = new URL(input, "http://localhost");
			if (url.pathname.endsWith("/deployments")) return renewed ? stalled(init!.signal!, catalogs) : Response.json({ deployments: [deployment] });
			if (url.pathname.endsWith("/context")) return Response.json(context);
			if (url.pathname.includes("acceptances")) return stalled(init!.signal!, receipts);
			if (url.pathname === "/api/touchpoints/test-runtime") {
				const placement = placements.find((key) => key === url.searchParams.get("placementKey"))!;
				if (renewed) {
					if (status === 503 || placement === "opend.home.campaign-modal") return Response.json({}, { status });
					return stalled(init!.signal!, siblings);
				}
				const value = { ...decision(placement), serverTime: new Date().toISOString() };
				return Response.json({ ...value, staticActions: actions, content: {
					...value.content, manifest: { ...manifest, placements: manifest.placements.map((p) => ({ ...p, staticActions: actions })) },
				} });
			}
			return Response.json({}, { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);
		let current: TestRuntimeSession | null = null;
		function Probe() { current = useTestRuntime(); return null; }
		const tick = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
		const nodes = () => document.querySelectorAll("opend-touchpoint");
		try {
			render(<I18nProvider initial="zh-CN"><Probe />
				<TestCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignBadge authenticated sessionSubject="account-a" />
				<ProductionCampaignHover authenticated sessionSubject="account-a" />
			</I18nProvider>);
			await tick(0);
			expect(nodes()).toHaveLength(4);
			const previous = current! as TestRuntimeSession;
			expect(previous.decisions.size).toBe(4);
			const oldDecision = previous.decisions.get("opend.home.campaign-modal")!;
			await expect(dispatchTestCampaignAction(oldDecision, "plan")).resolves.toBe(true);
			expect(navigate).toHaveBeenCalledTimes(1);
			await tick(29_999);
			expect(receipts.some((signal) => !signal.aborted)).toBe(true);
			expect(previous.isAuthorized("opend.home.campaign-modal")).toBe(true);
			renewed = true;
			await tick(1); // Directory refresh coincides with the third decision renewal.
			expect(catalogs).toHaveLength(1);
			expect(catalogs[0]!.aborted).toBe(false);
			if (status === 503) {
				expect(nodes()).toHaveLength(4);
				expect((current! as TestRuntimeSession).decisions.size).toBe(4);
				expect(previous.isAuthorized("opend.home.campaign-modal")).toBe(true);
				await tick(29_999);
				expect(nodes()).toHaveLength(4);
				await tick(1);
			}
			expect(nodes()).toHaveLength(0);
			if (status !== 503) {
				expect(siblings).toHaveLength(3);
				expect(siblings.every((signal) => signal.aborted)).toBe(true);
			}
			expect(current === null || (current as TestRuntimeSession).decisions.size === 0).toBe(true);
			for (const placement of placements) expect(previous.isAuthorized(placement)).toBe(false);
			await expect(dispatchTestCampaignAction(oldDecision, "plan")).resolves.toBe(false);
			expect(navigate).toHaveBeenCalledTimes(1);
			expect(receipts.every((signal) => signal.aborted)).toBe(true);
			const sent = receipts.length;
			recordVisibleTestTouchpoint(previous, oldDecision, "opend.home.campaign-modal");
			await tick(1_000);
			expect(receipts).toHaveLength(sent); // Stale visibility and queued receipt retries lost authority.
		} finally {
			cleanup();
			vi.useRealTimers();
			if (activationDescriptor) Object.defineProperty(navigator, "userActivation", activationDescriptor);
			else Reflect.deleteProperty(navigator, "userActivation");
		}
	});

	it("discovers new Test deployments without reload, preserves unchanged mounts and follows replacement/removal after end", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(context.updatedAt));
		let catalog: string[] = [];
		let startsAt = Date.parse("2029-12-31T23:00:00.000Z");
		const requested: string[] = [];
		// Each activity auto-presents once; later deployments carry new activities.
		const activityOf = (id: string) =>
			id === "deployment-c" || id === "deployment-future"
				? `activity-${id}`
				: "activity-four";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string, init?: RequestInit) => {
				const url = new URL(input, "http://localhost");
				if (url.pathname.endsWith("/deployments"))
					return Response.json({
						deployments: catalog.map((id) => ({
							id,
							activityId: activityOf(id),
							snapshotHash: "sha256:four-snapshot",
							snapshot: {
								contentVersionId: "version-four-placement",
								manifestHash: "sha256:four-manifest",
								artifactHash: "sha256:four-artifact",
								placementKeys: [...placements],
							},
						})),
					});
				if (url.pathname.endsWith("/context"))
					return Response.json({
						...context,
						deploymentId: JSON.parse(String(init?.body)).deploymentId,
					});
				if (url.pathname === "/api/touchpoints/test-runtime") {
					const placement = placements.find(
						(key) => key === url.searchParams.get("placementKey"),
					);
					if (!placement) throw new Error("Unexpected placement");
					const id = url.searchParams.get("deploymentId")!;
					requested.push(id);
					// Published schedules are immutable per deployment. A new
					// catalog entry must not rewrite the old selection in flight.
					const deploymentStartsAt = id === "deployment-future" ? startsAt : Date.parse("2029-12-31T23:00:00.000Z");
					const ended = id === "deployment-ended";
					return Response.json({
						...decision(placement),
						deploymentId: id,
						activityId: activityOf(id),
						serverTime: new Date().toISOString(),
						authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
						endsAt: ended
							? new Date(Date.now() - 1).toISOString()
							: "2030-01-01T01:00:00.000Z",
						startsAt: new Date(deploymentStartsAt).toISOString(),
						testContext: {
							...context,
							deploymentId: id,
							scheduleState: ended
								? "ended"
								: Date.now() < deploymentStartsAt
									? "before"
									: "active",
						},
					});
				}
				return Response.json(
					{},
					{ status: input.includes("acceptances") ? 201 : 404 },
				);
			}),
		);
		const nodes = () => [...document.querySelectorAll("opend-touchpoint")];
		const tick = async () => {
			await act(async () => {
				await vi.advanceTimersByTimeAsync(30_000);
			});
		};
		try {
			await act(async () => {
				render(
					<I18nProvider initial="zh-CN">
						<TestCampaignModal authenticated sessionSubject="account-a" />
						<ProductionCampaignModal authenticated sessionSubject="account-a" />
						<ProductionCampaignBadge authenticated sessionSubject="account-a" />
						<ProductionCampaignHover authenticated sessionSubject="account-a" />
					</I18nProvider>,
				);
			});
			expect(nodes()).toHaveLength(0);
			catalog = ["deployment-a"];
			await tick();
			expect(nodes()).toHaveLength(4);
			expect(requested).toContain("deployment-a");
			const originals = nodes();
			const mounts = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock
				.calls.length;
			await tick();
			expect(nodes()).toHaveLength(4);
			for (const [index, node] of nodes().entries())
				expect(node).toBe(originals[index]);
			expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(
				mounts,
			);
			catalog = ["deployment-b"];
			await tick();
			expect(requested).toContain("deployment-b");
			// Redeploying the presented activity refreshes badge and hover only.
			expect(nodes()).toHaveLength(3);
			catalog = [];
			await tick();
			expect(nodes()).toHaveLength(0);
			// An ended deployment must not stop discovery of the next one.
			catalog = ["deployment-ended"];
			await tick();
			expect(requested).toContain("deployment-ended");
			expect(nodes()).toHaveLength(0);
			catalog = ["deployment-c"];
			await tick();
			expect(requested).toContain("deployment-c");
			expect(nodes()).toHaveLength(4);
			fireEvent.keyDown(document, { key: "Escape" });
			expect(nodes()).toHaveLength(3);
			await tick();
			expect(nodes()).toHaveLength(3); // An unchanged directory cannot undo dismissal.
			catalog = ["deployment-future"];
			startsAt = Date.now() + 45_000;
			await tick();
			expect(nodes()).toHaveLength(0);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(14_999);
			});
			expect(nodes()).toHaveLength(0);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1);
			});
			expect(nodes()).toHaveLength(4);
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	});

	it.each([
		[3, "en"], [2, "en-US"], [undefined, "en-US"],
	] as const)("mounts server-selected English and records its exact locale for source %s", async (sourceDslVersion, selected) => {
		// Mock API/renderer boundary; integrity is exercised in touchpoint-component.test.ts.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date(context.updatedAt));
		const requests: string[] = [];
		const receipts: Array<{ placementKey: string; locale: string }> = [];
		const mounted: Array<{ placementKey: string; locale: string }> = [];
		const selectedManifest = {
			...manifest,
			...(sourceDslVersion === undefined ? {} : { material: {
				version: 1 as const, materialVersionId: "10000000-0000-4000-8000-000000000001",
				sourceHash: "a".repeat(64), templateId: "locale-test", templateVersion: 1,
				rendererDigest: `sha256:${"b".repeat(64)}`, compilerIdentity: "test-compiler", sourceDslVersion,
			} }),
			placements: manifest.placements.map((p) => ({ ...p, locales: [selected] })),
		};
		const deployment = {
			id: context.deploymentId, activityId: "activity-four", snapshotHash: "sha256:four-snapshot",
			snapshot: { contentVersionId: "version-four-placement", manifestHash: "sha256:four-manifest", artifactHash: "sha256:four-artifact", placementKeys: [...placements] },
		};
		vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
			const url = new URL(input, "http://localhost");
			if (url.pathname.endsWith("/deployments")) return Response.json({ deployments: [deployment] });
			if (url.pathname.endsWith("/context")) return Response.json(context);
			if (url.pathname.includes("acceptances")) {
				receipts.push(JSON.parse(init!.body as string));
				return Response.json({ id: "acceptance" }, { status: 201 });
			}
			if (url.pathname === "/api/touchpoints/test-runtime") {
				requests.push(url.searchParams.get("locale")!);
				const key = placements.find((p) => p === url.searchParams.get("placementKey"))!;
				const value = decision(key);
				return Response.json({ ...value, content: { ...value.content, locale: selected, manifest: selectedManifest } });
			}
			return Response.json({}, { status: 404 });
		}));
		vi.mocked(OpenDesignTouchpointElement.prototype.mount).mockImplementation(async function (this: OpenDesignTouchpointElement, _url, _digest, host) {
			mounted.push({ placementKey: host.placementKey, locale: host.locale });
			const translations = { [selected]: { title: "English title", button: "English button" } };
			const copy = translations[host.locale];
			if (!copy) throw new Error("missing_declared_translation");
			this.shadowRoot?.replaceChildren(document.createTextNode(`${copy.title} / ${copy.button}`));
		});
		render(<I18nProvider initial="fr">
			<TestCampaignModal authenticated sessionSubject="account-a" />
			<ProductionCampaignModal authenticated sessionSubject="account-a" />
			<ProductionCampaignBadge authenticated sessionSubject="account-a" />
			<ProductionCampaignHover authenticated sessionSubject="account-a" />
		</I18nProvider>);
		await waitFor(() => expect(mounted.map((m) => m.placementKey).sort()).toEqual([...placements].sort()));
		expect(mounted.every((m) => m.locale === selected)).toBe(true);
		expect(requests).toEqual(["fr", "fr", "fr", "fr"]);
		for (const element of document.querySelectorAll("opend-touchpoint"))
			expect(element.shadowRoot?.textContent).toBe("English title / English button");
		await waitFor(() => expect(receipts.some((r) => r.placementKey === "opend.home.campaign-modal")).toBe(true));
		expect(receipts.every((r) => r.locale === selected)).toBe(true);
	});

	it.each(["zh-TW", "ko", "ja", "zh-CN"] as const)("uses app locale %s on first mount and language changes even when document lang stays English", async (initialLocale) => {
		// Editors and initial HTML can leave this unrelated DOM attribute stale.
		vi.spyOn(document.documentElement, "lang", "get").mockReturnValue("en");
		const deployment = {
			id: context.deploymentId,
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: "sha256:four-manifest",
				artifactHash: "sha256:four-artifact",
				placementKeys: [...placements],
			},
		};
		const requests: Array<{ placement: string; locale: string }> = [];
		const pending: Array<() => void> = [];
		let holdJapanese = false;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string) => {
				const url = new URL(input, "http://localhost");
				if (url.pathname.endsWith("/deployments"))
					return Response.json({ deployments: [deployment] });
				if (url.pathname.endsWith("/context")) return Response.json(context);
				if (url.pathname === "/api/touchpoints/test-runtime") {
					const placement = placements.find(
						(key) => key === url.searchParams.get("placementKey"),
					);
					if (!placement) throw new Error("Unexpected Test placement");
					const locale = url.searchParams.get("locale") ?? "";
					requests.push({ placement, locale });
					if (holdJapanese && locale === "ja")
						await new Promise<void>((resolve) => pending.push(resolve));
					const value = decision(placement);
					return Response.json({
						...value,
						content: {
							...value.content,
							locale,
							manifest: {
								...manifest,
								placements: manifest.placements.map((p) => ({
									...p,
									locales: ["en", "en-US", "ja", "zh-CN", "zh-TW", "ko"],
								})),
							},
						},
					});
				}
				return Response.json(
					{},
					{ status: input.includes("acceptances") ? 201 : 404 },
				);
			}),
		);
		vi
			.mocked(OpenDesignTouchpointElement.prototype.mount)
			.mockImplementation(async function (
				this: OpenDesignTouchpointElement,
				_url,
				_digest,
				hostContext,
			) {
				this.shadowRoot?.replaceChildren(
					document.createTextNode(
						`${hostContext.placementKey}:${hostContext.locale}`,
					),
				);
			});
		function Controls() {
			const { setLocale } = useI18n();
			return (
				<>
					<button onClick={() => setLocale("ja")}>Japanese</button>
					<button onClick={() => setLocale("zh-CN")}>Chinese</button>
					<button onClick={() => setLocale("en")}>English</button>
				</>
			);
		}
		render(
			<I18nProvider initial={initialLocale}>
				<Controls />
				<TestCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignBadge authenticated sessionSubject="account-a" />
				<ProductionCampaignHover authenticated sessionSubject="account-a" />
			</I18nProvider>,
		);
		const mountedTexts = () =>
			[...document.querySelectorAll("opend-touchpoint")]
				.map((element) => element.shadowRoot?.textContent)
				.sort();
		const expected = (locale: string) =>
			placements.map((key) => `${key}:${locale}`).sort();
		await waitFor(() => expect(mountedTexts()).toEqual(expected(initialLocale)));
		// The modal records its impression one frame after it becomes visible. A
		// language switch after that point continues the same presentation; it is
		// not a new offer of an already-displayed activity.
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:account-a:activity-four"),
			).toBe("1"),
		);
		fireEvent.click(screen.getByText("Japanese"));
		await waitFor(() => expect(mountedTexts()).toEqual(expected("ja")));
		fireEvent.click(screen.getByText("Chinese"));
		await waitFor(() => expect(mountedTexts()).toEqual(expected("zh-CN")));
		for (const locale of [initialLocale, "ja", "zh-CN"])
			expect(
				[...new Set(requests
					.filter((r) => r.locale === locale)
					.map((r) => r.placement))]
					.sort(),
			).toEqual([...placements].sort());
		// The presentation has been on screen long enough to be recorded as
		// displayed (the visibility frame has run). A recorded activity must still
		// follow a language switch: the runtime's reload is not a new offer.
		await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
		await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
		expect(
			localStorage.getItem("touchpoint-displayed:v1:account-a:activity-four"),
		).toBe("1");
		// A late previous-language response must not restore any stale placement.
		holdJapanese = true;
		fireEvent.click(screen.getByText("Japanese"));
		await waitFor(() => expect(pending).toHaveLength(4));
		fireEvent.click(screen.getByText("English"));
		await waitFor(() => expect(mountedTexts()).toEqual(expected("en")));
		await act(async () => {
			for (const resolve of pending) resolve();
		});
		expect(mountedTexts()).toEqual(expected("en"));
	});

	it("keeps the Test modal image through delayed focus refresh and stays closed after SDK dismissal", async () => {
		vi.useFakeTimers({
			toFake: [
				"Date",
				"performance",
				"setTimeout",
				"clearTimeout",
				"setInterval",
				"clearInterval",
			],
		});
		vi.setSystemTime(new Date(context.updatedAt));
		const pending: Array<() => void> = [];
		let hold = false;
		let close: (() => void) | undefined;
		vi
			.mocked(OpenDesignTouchpointElement.prototype.mount)
			.mockImplementation(async function (
				this: OpenDesignTouchpointElement,
				_url,
				_digest,
				_context,
				_resources,
				_actions,
				callbacks,
			) {
				const image = document.createElement("img");
				image.src = "blob:test-host";
				this.shadowRoot?.replaceChildren(image);
				close = callbacks?.requestClose;
			});
		const deployment = {
			id: context.deploymentId,
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: "sha256:four-manifest",
				artifactHash: "sha256:four-artifact",
				placementKeys: ["opend.home.campaign-modal"],
			},
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string) => {
				const url = new URL(input, "http://localhost");
				if (url.pathname.endsWith("/deployments"))
					return Response.json({ deployments: [deployment] });
				if (url.pathname.endsWith("/context")) return Response.json(context);
				if (url.pathname === "/api/touchpoints/test-runtime") {
					if (hold) await new Promise<void>((resolve) => pending.push(resolve));
					return Response.json({
						...decision("opend.home.campaign-modal"),
						serverTime: new Date().toISOString(),
						authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
					});
				}
				return Response.json(
					{},
					{ status: input.includes("acceptances") ? 201 : 404 },
				);
			}),
		);
		try {
			render(
				<I18nProvider initial="zh-CN">
					<TestCampaignModal authenticated sessionSubject="account-a" />
					<ProductionCampaignModal authenticated sessionSubject="account-a" />
				</I18nProvider>,
			);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			const dialog = screen.getByRole("dialog", { name: "测试活动" });
			const element = dialog.querySelector("opend-touchpoint");
			const image = element?.shadowRoot?.querySelector("img");
			expect(image).toHaveAttribute("src", "blob:test-host");
			hold = true;
			act(() => {
				window.dispatchEvent(new Event("focus"));
			});
			expect(pending).toHaveLength(1);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(5000);
			});
			expect(screen.getByRole("dialog", { name: "测试活动" })).toBe(dialog);
			expect(element?.isConnected).toBe(true);
			expect(element?.shadowRoot?.querySelector("img")).toBe(image);
			hold = false;
			await act(async () => {
				pending.splice(0).forEach((resolve) => resolve());
			});
			expect(dialog.querySelector("opend-touchpoint")).toBe(element);
			expect(element?.shadowRoot?.querySelector("img")).toBe(image);
			expect(close).toBeTypeOf("function");
			act(() => {
				close?.();
			});
			expect(screen.queryByRole("dialog", { name: "测试活动" })).toBeNull();
			await act(async () => {
				window.dispatchEvent(new Event("online"));
			});
			await act(async () => {
				window.dispatchEvent(new Event("focus"));
				await vi.advanceTimersByTimeAsync(30_000);
			});
			expect(screen.queryByRole("dialog", { name: "测试活动" })).toBeNull();
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	});

	it("keeps a dismissed Test campaign closed across temporary session loss and redeployment of the same activity", async () => {
		const value = decision("opend.home.campaign-modal");
		const session: TestRuntimeSession = {
			selectionKey: "deployment-four",
			deployment: {
				id: context.deploymentId,
				activityId: "activity-four",
				snapshotHash: value.snapshotHash,
				snapshot: {
					contentVersionId: value.content.id,
					manifestHash: value.manifestHash,
					artifactHash: value.artifactHash,
					placementKeys: [...placements],
				},
			},
			context,
			decisions: new Map([["opend.home.campaign-modal", value]]),
			isAuthorized: () => true,
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({}, { status: 404 })),
		);
		setTestRuntimeSession(session);
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await screen.findByRole("dialog", { name: "Test campaign" });
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		await act(async () => {
			clearTestRuntimeSession();
		});
		await act(async () => {
			setTestRuntimeSession({ ...session, decisions: new Map(session.decisions) });
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		const next = {
			...value,
			deploymentId: "deployment-2",
			testContext: { ...value.testContext, deploymentId: "deployment-2" },
		};
		await act(async () => {
			setTestRuntimeSession({
				...session,
				selectionKey: "deployment-2",
				deployment: { ...session.deployment, id: "deployment-2" },
				context: next.testContext,
				decisions: new Map([["opend.home.campaign-modal", next]]),
			});
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
	});

	it("presents a Test campaign modal once per account and activity on this device, sharing the production impression", async () => {
		const value = decision("opend.home.campaign-modal");
		const session: TestRuntimeSession = {
			selectionKey: "deployment-four",
			deployment: {
				id: context.deploymentId,
				activityId: "activity-four",
				snapshotHash: value.snapshotHash,
				snapshot: {
					contentVersionId: value.content.id,
					manifestHash: value.manifestHash,
					artifactHash: value.artifactHash,
					placementKeys: [...placements],
				},
			},
			context,
			decisions: new Map([["opend.home.campaign-modal", value]]),
			isAuthorized: () => true,
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({}, { status: 404 })),
		);
		setTestRuntimeSession(session);
		const first = render(
			<ProductionCampaignModal authenticated sessionSubject="account-a" />,
		);
		await screen.findByRole("dialog", { name: "Test campaign" });
		// Presentation, not dismissal, consumes the impression; the open modal stays.
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:account-a:activity-four"),
			).toBe("1"),
		);
		expect(screen.getByRole("dialog", { name: "Test campaign" })).toBeVisible();
		// Restart without closing: the same account and activity must not reopen.
		first.unmount();
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		cleanup();
		// A production impression of the same activity suppresses Test too.
		localStorage.setItem("touchpoint-displayed:v1:account-b:activity-four", "1");
		render(<ProductionCampaignModal authenticated sessionSubject="account-b" />);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		cleanup();
		// Another account on this device still gets its own single presentation.
		render(<ProductionCampaignModal authenticated sessionSubject="account-c" />);
		expect(
			await screen.findByRole("dialog", { name: "Test campaign" }),
		).toBeVisible();
	});

	it.each([1, 2] as const)("uses actual runtime %s at modal, badge, and paired hover hosts without production reads", async (apiVersion) => {
		const decisions = new Map(
			placements.map((placementKey) => {
				const value = decision(placementKey);
				value.content.runtime.apiVersion = apiVersion;
				value.content.manifest.runtimeApiVersion = apiVersion;
				return [placementKey, value] as const;
			}),
		);
		const session: TestRuntimeSession = {
			selectionKey: "deployment-four:sha256:four-snapshot:active",
			deployment: {
				id: context.deploymentId,
				activityId: "activity-four",
				snapshotHash: "sha256:four-snapshot",
				snapshot: {
					contentVersionId: "version-four-placement",
					manifestHash: "sha256:four-manifest",
					artifactHash: "sha256:four-artifact",
					placementKeys: [...placements],
				},
			},
			context,
			decisions,
			isAuthorized: () => true,
		};
		setTestRuntimeSession(session);
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url.includes("acceptances"))
				return new Response(JSON.stringify({ id: "acceptance" }), {
					status: 201,
				});
			return new Response(JSON.stringify({ error: "production_read_forbidden" }), {
				status: 404,
			});
		});
		vi.stubGlobal("fetch", fetchMock);
		render(
			<>
				<ProductionCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignBadge authenticated sessionSubject="account-a" />
				<ProductionCampaignHover authenticated sessionSubject="account-a" />
			</>,
		);
		await screen.findByTestId("campaign-custom-element");
		await screen.findByTestId("production-campaign-badge");
		await screen.findByTestId("cms-hover-overlay-root");
		await waitFor(() =>
			expect(
				fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).length,
			).toBe(3),
		);
		const entry = screen
			.getByTestId("cms-hover-overlay-root")
			.querySelector("opend-touchpoint");
		expect(entry).not.toBeNull();
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		fireEvent.pointerEnter(entry!);
		await waitFor(() =>
			expect(
				fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).length,
			).toBe(4),
		);
		const reports = fetchMock.mock.calls
			.filter(([url]) => url.includes("acceptances"))
			.map(([, init]) => JSON.parse(String(init?.body)));
		expect(reports.map((report) => report.placementKey).sort()).toEqual(
			[...placements].sort(),
		);
		for (const report of reports) {
			expect(report.hostCompatibility).toMatchObject({
				version: 1,
				snapshotHash: session.deployment.snapshotHash,
				hostFamily: "open-design-desktop",
				platform: "desktop",
				hostRelease: `sha256:${"a".repeat(64)}`,
				runtime: {
					kind: "web-component",
					apiVersion,
					wrapperVersion: "vela-touchpoint-wrapper-v1",
					sdkVersion: "vela-touchpoint-sdk-v1",
				},
			});
			expect(report.hostCompatibility.capabilities).toEqual(
				[...decisions.get(report.placementKey)!.requiredCapabilities, "countdown-v1", "action-console-pricing-v1"],
			);
		}
		expect(
			fetchMock.mock.calls.some(([url]) => url.includes("production-runtime")),
		).toBe(false);
		expect(
			screen
				.getByTestId("campaign-custom-element")
				.querySelector("opend-touchpoint"),
		).not.toBeNull();
		expect(
			screen
				.getByTestId("production-campaign-badge")
				.querySelector("opend-touchpoint"),
		).not.toBeNull();
	});

	// Delayed visibility itself is covered directly in touchpointVisibility.test.ts:
	// at this level a re-mount can supply a second sample, which would hide a
	// regression back to sampling once. What this level can still pin down is
	// that a host nobody could see never earns a receipt.
	it("never accepts a hover entry that never gains a box", async () => {
		clientRectCount = 0;
		const decisions = new Map(
			placements.map((placementKey) => [placementKey, decision(placementKey)]),
		);
		setTestRuntimeSession({
			selectionKey: "deployment-four:sha256:four-snapshot:active",
			deployment: {
				id: context.deploymentId,
				activityId: "activity-four",
				snapshotHash: "sha256:four-snapshot",
				snapshot: {
					contentVersionId: "version-four-placement",
					manifestHash: "sha256:four-manifest",
					artifactHash: "sha256:four-artifact",
					placementKeys: [...placements],
				},
			},
			context,
			decisions,
			isAuthorized: () => true,
		});
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
			url.includes("acceptances")
				? new Response(JSON.stringify({ id: "acceptance" }), { status: 201 })
				: new Response(JSON.stringify({ error: "production_read_forbidden" }), {
						status: 404,
					}),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const entry = (await screen.findByTestId(
			"cms-hover-overlay-root",
		)).querySelector("opend-touchpoint");
		expect(entry).not.toBeNull();
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		const entryAcceptances = () =>
			fetchMock.mock.calls
				.filter(([url]) => url.includes("acceptances"))
				.map(([, init]) => JSON.parse(String(init?.body)))
				.filter((report) => report.placementKey === "opend.home.hover-entry");
		notifyResizeObservers();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(entryAcceptances()).toHaveLength(0);
	});
});

describe("Test acceptance delivery", () => {
	const placement = "opend.home.hover-entry" as const;
	const retryBudgetMs =
		TEST_ACCEPTANCE_RETRY_MS.reduce((sum, delay) => sum + delay, 0) + 60_000;
	function session(): TestRuntimeSession {
		const value = decision(placement);
		return {
			selectionKey: "deployment-1:snapshot-1",
			deployment: {
				id: "deployment-1",
				activityId: "activity-four",
				snapshotHash: value.snapshotHash,
				snapshot: {
					contentVersionId: value.content.id,
					artifactHash: value.artifactHash!,
					manifestHash: value.manifestHash!,
					placementKeys: [placement],
				},
			},
			context: value.testContext,
			decisions: new Map([[placement, value]]),
			isAuthorized: () => true,
		};
	}
	function visible(value: TestRuntimeSession) {
		recordVisibleTestTouchpoint(value, value.decisions.get(placement)!, placement);
	}
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		clearTestRuntimeSession();
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	it("retries a failed receipt without another visibility callback, then deduplicates", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValue(new Response("{}", { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(TEST_ACCEPTANCE_RETRY_MS[0] - 1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		visible(value);
		await vi.advanceTimersByTimeAsync(retryBudgetMs);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("abandons a hanging receipt at its deadline and retries", async () => {
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(() => new Promise(() => {}))
			.mockResolvedValue(new Response("{}", { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(10_000 + TEST_ACCEPTANCE_RETRY_MS[0]);
		expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("bounds repeated failures and lets a later visibility recover", async () => {
		const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(retryBudgetMs);
		expect(fetchMock).toHaveBeenCalledTimes(TEST_ACCEPTANCE_RETRY_MS.length + 1);
		fetchMock.mockResolvedValue(new Response("{}", { status: 201 }));
		visible(value);
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchMock).toHaveBeenCalledTimes(TEST_ACCEPTANCE_RETRY_MS.length + 2);
	});
	it("does not retry an explicit rejection", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(retryBudgetMs);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("stops queued retries once the lease is no longer authorized", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);
		let authorized = true;
		const value = { ...session(), isAuthorized: () => authorized };
		setTestRuntimeSession(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(0);
		authorized = false;
		await vi.advanceTimersByTimeAsync(retryBudgetMs);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("pauses retries while the page is hidden and resumes once it is shown", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValue(new Response("{}", { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		let hidden = false;
		const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, "hidden")!;
		Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
		try {
			// The lease reads visibility, as the real one does.
			const value = { ...session(), isAuthorized: () => !document.hidden };
			setTestRuntimeSession(value);
			visible(value);
			await vi.advanceTimersByTimeAsync(0);
			hidden = true;
			await vi.advanceTimersByTimeAsync(retryBudgetMs);
			expect(fetchMock).toHaveBeenCalledTimes(1);
			hidden = false;
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		} finally {
			Object.defineProperty(document, "hidden", descriptor);
			delete (document as { hidden?: boolean }).hidden;
		}
	});
	it("cancels in-flight delivery when the session is cleared", async () => {
		const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(() => {}));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		clearTestRuntimeSession();
		expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(retryBudgetMs);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("cancels in-flight work on logout and ignores its late success", async () => {
		let complete!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						complete = resolve;
					}),
			)
			.mockResolvedValue(new Response("{}", { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		clearTestRuntimeSession();
		expect(fetchMock.mock.calls[0]![1].signal?.aborted).toBe(true);
		complete(new Response("{}", { status: 201 }));
		await vi.advanceTimersByTimeAsync(0);
		const next = session();
		setTestRuntimeSession(next);
		visible(next);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
	it("isolates a new snapshot and cancels the previous snapshot's queued retry", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValue(new Response("{}", { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(0);
		const nextContext = { ...value.context, deploymentId: "deployment-2" };
		const nextDecision = {
			...decision(placement),
			deploymentId: "deployment-2",
			snapshotHash: "sha256:new",
			testContext: { ...nextContext, scheduleState: "active" as const },
		};
		const next = {
			...session(),
			selectionKey: "deployment-2:snapshot-2",
			context: nextContext,
			decisions: new Map([[placement, nextDecision]]),
			deployment: {
				...value.deployment,
				id: "deployment-2",
				snapshotHash: "sha256:new",
			},
		};
		setTestRuntimeSession(next);
		visible(next);
		await vi.advanceTimersByTimeAsync(120_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(fetchMock.mock.calls[1]?.[0]).toContain(
			"/test-deployments/deployment-2/acceptances",
		);
		visible(next);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it.each(["tester", "snapshot"] as const)(
		"cancels a receipt when the %s changes under the same selection key",
		async (changed) => {
			const fetchMock = vi
				.fn()
				.mockImplementationOnce(() => new Promise(() => {}))
				.mockResolvedValue(new Response("{}", { status: 201 }));
			vi.stubGlobal("fetch", fetchMock);
			const value = session();
			setTestRuntimeSession(value);
			visible(value);
			const next = {
				...session(),
				context: changed === "tester"
					? { ...value.context, testerMemberId: "another-tester" }
					: value.context,
				deployment: changed === "snapshot"
					? { ...value.deployment, snapshotHash: "sha256:replacement" }
					: value.deployment,
			};
			setTestRuntimeSession(next);
			expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
			visible(next);
			await vi.advanceTimersByTimeAsync(0);
			expect(fetchMock).toHaveBeenCalledTimes(2);
		},
	);
	it("keeps retrying after a same-snapshot credential refresh", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 500 }))
			.mockResolvedValue(new Response("{}", { status: 201 }));
		vi.stubGlobal("fetch", fetchMock);
		const value = session();
		setTestRuntimeSession(value);
		visible(value);
		await vi.advanceTimersByTimeAsync(0);
		setTestRuntimeSession(session());
		await vi.advanceTimersByTimeAsync(1_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
