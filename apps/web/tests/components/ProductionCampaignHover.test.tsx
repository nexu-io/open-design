import { TOUCHPOINT_POLL_MS } from "../../src/components/touchpoint-lifecycle";
import { touchpointLoadQueue, resetTouchpointLoadObservability } from "../../src/components/touchpoint-load-observability";
// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { overlaySpy, diagnosticSpy, useRealOverlay, verifiedDisposes } = vi.hoisted(() => ({
	overlaySpy: vi.fn(({ entry }: { entry?: { locale?: string } }) => <div data-testid="production-hover-overlay">{entry?.locale}</div>),
	diagnosticSpy: vi.fn(),
	useRealOverlay: { current: false },
	verifiedDisposes: vi.fn(),
}));
const cmsTrack = vi.hoisted(() => vi.fn());
const replaceRenewalValue = vi.hoisted(() => ({ current: false }));
vi.mock('../../src/components/touchpoint-lifecycle', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/components/touchpoint-lifecycle')>();
  const { useCallback } = await import('react');
  return { ...actual, useTouchpointLifecycle: <T,>(options: import('../../src/components/touchpoint-lifecycle').TouchpointLifecycleOptions<T>) => {
    // Exercise a renewed active credential independently of the normal retained mount.
    // The real owner, lifecycle authority, transport and visible callbacks still run.
    const load = useCallback(async (signal: AbortSignal, active: T | null) => {
      const result = await options.load(signal, active);
      return replaceRenewalValue.current && result.kind === 'decision' ? { ...result, replaceValue: true } : result;
    }, [options.load]);
    return actual.useTouchpointLifecycle({ ...options, load });
  } };
});
const openExternalUrl = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl }));
vi.mock("../../src/analytics/provider", () => ({ useAnalytics: () => ({ track: cmsTrack }), useAppVersion: () => "0.0.0" }));
type HostGlobal = typeof globalThis & { __productionHoverHost?: unknown };
vi.mock("@open-design/host", () => ({
	getOpenDesignHost: () => (globalThis as HostGlobal).__productionHoverHost,
}));
vi.mock("../../src/components/HoverTouchpointOverlay", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../src/components/HoverTouchpointOverlay")>();
	return {
		...actual,
		HoverTouchpointOverlay: (props: Parameters<typeof actual.HoverTouchpointOverlay>[0]) => {
			overlaySpy(props);
			return useRealOverlay.current ? <actual.HoverTouchpointOverlay {...props} /> : <div data-testid="production-hover-overlay">{props.entry?.locale}</div>;
		},
	};
});
vi.mock(
	"../../src/components/touchpoint-component",
	async (importOriginal) => ({
		...(await importOriginal<typeof import("../../src/components/touchpoint-component")>()),
		emitWebTouchpointDiagnostic: diagnosticSpy,
		verifyWebTouchpoint: vi.fn(async (entry) => ({ entryUrl: `blob:${entry.id}`, resourceUrls: new Map(), dispose: verifiedDisposes })),
		webTouchpointContext: vi.fn((entry) => ({ instanceId: `instance-${entry.id}`, contentVersionId: entry.id, placementKey: entry.placementKey, locale: entry.locale })),
	}),
);

import * as campaignNavigation from "../../src/components/touchpoint-navigation";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { I18nProvider, useI18n } from "../../src/i18n";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { clearTestRuntimeSession, setTestRuntimeSession, type TestRuntimeSession } from "../../src/components/TestCampaignModal";

const content = (placementKey: string) => ({
	id: "version-hover-pair",
	placementKey,
	locale: "en-US",
	manifest: {
		placements: [
			{
				key: placementKey,
				requiredCapabilities: ["hover", "static-action"],
				staticActions: [
					{
						id: "learn",
						target: { kind: "https", url: "https://example.com" },
					},
				],
			},
		],
	},
	manifestHash: "sha256:manifest",
	entryPath: "component.js",
	entryDigest: "sha256:entry",
	entryModule: "export {}",
	resources: [],
	runtime: {
		kind: "web-component",
		apiVersion: 1,
		wrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
	},
	buildIdentity: { fingerprint: "immutable" },
});
const decision = (
	placementKey: string,
	overrides: Record<string, unknown> = {},
) => ({
	activityId: "activity-1",
	touchpointDecisionId: `decision-${placementKey}`,
	deploymentId: "deployment-1",
	authorizationExpiresAt: "2030-01-01T00:01:00.000Z",
	endsAt: "2030-01-01T00:05:00.000Z",
	serverTime: "2030-01-01T00:00:00.000Z",
	placementKey,
	content: content(placementKey),
		requiredCapabilities: ["hover", "static-action"],
	staticActions: [
		{ id: "learn", target: { kind: "https", url: "https://example.com" } },
	],
	...overrides,
});
function LocaleSwitch() {
	const { setLocale } = useI18n();
	return <button onClick={() => setLocale("zh-CN")}>Switch locale</button>;
}

beforeEach(() => {
	vi.mocked(touchpointComponent.verifyWebTouchpoint).mockImplementation(
		async (entry) => ({
			entryUrl: `blob:${entry.id}`,
			resourceUrls: new Map(),
			dispose: verifiedDisposes,
		}),
	);
	vi.spyOn(touchpointLoadQueue("production"), "enqueue").mockImplementation(() => {});
	vi.spyOn(touchpointLoadQueue("test"), "enqueue").mockImplementation(() => {});
	vi.useFakeTimers({ shouldAdvanceTime: true });
	vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
	(globalThis as HostGlobal).__productionHoverHost = {
		client: { type: "desktop", osLocale: "en-US" },
	};
});
afterEach(() => {
	replaceRenewalValue.current = false;
	openExternalUrl.mockClear();
	cmsTrack.mockClear();
	cleanup();
	resetTouchpointLoadObservability();
	overlaySpy.mockClear();
	diagnosticSpy.mockClear();
	useRealOverlay.current = false;
	verifiedDisposes.mockClear();
	clearTestRuntimeSession();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	delete (globalThis as HostGlobal).__productionHoverHost;
});

const pairedMultiPlacementManifest = {
	formatVersion: 2,
	runtimeKind: "web-component",
	runtimeApiVersion: 1,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1",
	sdkVersion: "vela-touchpoint-sdk-v1",
	contentLine: "paired-hover-version",
	placements: [
		{
			key: "opend.home.campaign-modal",
			entry: "modal.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: [],
			staticActions: [],
		},
		{
			key: "opend.home.account-badge",
			entry: "badge.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: [],
			staticActions: [],
		},
		{
			key: "opend.home.hover-entry",
			entry: "hover-entry.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["hover", "static-action"],
			staticActions: [
				{ id: "learn", target: { kind: "https", url: "https://example.com" } },
			],
		},
		{
			key: "opend.home.hover-layer",
			entry: "hover-layer.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["hover", "static-action"],
			staticActions: [
				{ id: "learn", target: { kind: "https", url: "https://example.com" } },
			],
		},
	],
	resources: ["modal.js", "badge.js", "hover-entry.js", "hover-layer.js"],
	images: [],
};

describe("ProductionCampaignHover", () => {
	it("restarts a hover entry fenced during verification after a same-key renewal", async () => {
		useRealOverlay.current = true;
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
		const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, entryUrl: string) {
			const image = document.createElement("img");
			image.src = entryUrl;
			this.shadowRoot?.replaceChildren(image);
		});
		let resolveVerified!: (value: Awaited<ReturnType<typeof touchpointComponent.verifyWebTouchpoint>>) => void;
		const verified = new Promise<Awaited<ReturnType<typeof touchpointComponent.verifyWebTouchpoint>>>((resolve) => { resolveVerified = resolve; });
		const firstDispose = vi.fn();
		const verify = vi.mocked(touchpointComponent.verifyWebTouchpoint).mockImplementationOnce(() => verified);
		const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(decision(url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer")), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const root = await screen.findByTestId("cms-hover-overlay-root");
		await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
		const originalTime = Date.now();
		vi.setSystemTime(new Date(originalTime + 2 * 60_000));
		await act(async () => {
			resolveVerified({ entryUrl: "blob:first-entry", resourceUrls: new Map(), dispose: firstDispose });
		});
		expect(firstDispose).toHaveBeenCalledTimes(1);
		expect(mount).not.toHaveBeenCalled();
		vi.setSystemTime(new Date(originalTime));
		act(() => { window.dispatchEvent(new Event("focus")); });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
		const entry = root.querySelector("opend-touchpoint");
		await waitFor(() => expect(entry?.shadowRoot?.querySelector("img")).toHaveAttribute("src", "blob:version-hover-pair"));
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		rects.mockRestore();
	});
	it("keeps the real production overlay's Shadow DOM, Blob images, and expanded layer through periodic refreshes", async () => {
		useRealOverlay.current = true;
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, entryUrl: string) {
			const image = document.createElement("img");
			image.src = entryUrl;
			this.shadowRoot?.replaceChildren(image);
		});
		const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(decision(url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer")), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const { rerender } = render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const root = await screen.findByTestId("cms-hover-overlay-root");
		const [entry, layer] = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"));
		if (!entry || !layer) throw new Error("expected paired hover elements");
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		const entryImage = entry.shadowRoot?.querySelector("img");
		const layerImage = layer.shadowRoot?.querySelector("img");
		expect(entryImage).toHaveAttribute("src", "blob:version-hover-pair");
		expect(layerImage).toHaveAttribute("src", "blob:version-hover-pair");
		fireEvent.pointerEnter(entry);
		await waitFor(() => expect(entry).toHaveAttribute("aria-expanded", "true"));
		const initialImages = [entryImage, layerImage];
		for (let refresh = 0; refresh < 2; refresh += 1) {
			await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
			rerender(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
			await act(async () => {});
			await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => !url.endsWith("/events"))).toHaveLength((refresh + 2) * 2));
			expect(Array.from(root.querySelectorAll("opend-touchpoint"))).toEqual([entry, layer]);
			expect([entry.shadowRoot?.querySelector("img"), layer.shadowRoot?.querySelector("img")]).toEqual(initialImages);
			expect(entry).toHaveAttribute("aria-expanded", "true");
		}
		expect(entryImage?.isConnected).toBe(true);
		expect(layerImage?.isConnected).toBe(true);
		rects.mockRestore();
	});
	// OPEND-3374 at the hover pair. Its key carried BOTH decision ids, so either
	// credential rotating rebuilt both hosts.
	it("REGRESSION: a network outage that outlives the server credentials does not remount the hover pair", async () => {
		useRealOverlay.current = true;
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
		const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, entryUrl: string) {
			const image = document.createElement("img");
			image.src = entryUrl;
			this.shadowRoot?.replaceChildren(image);
		});
		let online = true;
		let credential = "1";
		const requests: string[] = [];
		const longLived = (placementKey: string) => {
			const now = Date.now();
			return decision(placementKey, {
				touchpointDecisionId: `decision-${placementKey}-${credential}`,
				serverTime: new Date(now).toISOString(),
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
			});
		};
		const fetchMock = vi.fn(async (url: string) => {
			requests.push(url);
			if (!online) throw new TypeError("Failed to fetch");
			return new Response(JSON.stringify(longLived(url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer")), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const root = await screen.findByTestId("cms-hover-overlay-root");
		const [entry, layer] = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"));
		if (!entry || !layer) throw new Error("expected paired hover elements");
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
		online = false;
		await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
		online = true;
		credential = "2";
		requests.length = 0;
		// OPEND-3436: a client in offline fallback revalidates on the reconnection
		// itself rather than on the next poll tick, so the event a real network
		// restore fires is now what drives recovery. What this case is about —
		// the host is not rebuilt across the outage — is unchanged.
		act(() => { window.dispatchEvent(new Event("online")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
		await act(async () => {});
		expect(requests.some((url) => url.includes("activeDecisionId=decision-opend.home.hover-entry-1"))).toBe(true);
		expect(Array.from(root.querySelectorAll("opend-touchpoint"))).toEqual([entry, layer]);
		expect(mount).toHaveBeenCalledTimes(2);
		rects.mockRestore();
	});

	// Both placements share a content version; a coherent version change must
	// rebuild the pair even when the deployment and decision ids stay the same.
	it("remounts both placements when the shared content version changes", async () => {
		useRealOverlay.current = true;
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
		const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, entryUrl: string) {
			const image = document.createElement("img");
			image.src = entryUrl;
			this.shadowRoot?.replaceChildren(image);
		});
		let layerVersion = "version-hover-pair";
		const longLived = (placementKey: string) => {
			const now = Date.now();
			const base = decision(placementKey, {
				serverTime: new Date(now).toISOString(),
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
			});
			return { ...base, content: { ...base.content, id: layerVersion } };
		};
		const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(longLived(url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer")), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const root = await screen.findByTestId("cms-hover-overlay-root");
		const [entry, layer] = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"));
		if (!entry || !layer) throw new Error("expected paired hover elements");
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
		layerVersion = "version-hover-pair-2";
		await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
		await act(async () => {});
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(4));
		// Both placements come from the same immutable multi-placement version.
		// The layer must render the new version too, rather than retain old bytes.
		const rebuiltLayer = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"))[1];
		expect(rebuiltLayer?.shadowRoot?.querySelector("img")).toHaveAttribute(
			"src",
			"blob:version-hover-pair-2",
		);
		rects.mockRestore();
	});

	it("keeps the real Test overlay's Shadow DOM and expanded layer across host rerenders", async () => {
		useRealOverlay.current = true;
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, entryUrl: string) {
			const image = document.createElement("img");
			image.src = entryUrl;
			this.shadowRoot?.replaceChildren(image);
		});
		vi.stubGlobal("requestAnimationFrame", () => 0);
		vi.stubGlobal("cancelAnimationFrame", () => {});
		setTestRuntimeSession({ selectionKey: "hover-rerender", deployment: { id: "deployment-1", snapshotHash: "sha256:hover" }, context: { deploymentId: "deployment-1", scenario: "realtime", updatedAt: "2026-01-01T00:00:00.000Z" }, decisions: new Map([["opend.home.hover-entry", decision("opend.home.hover-entry")], ["opend.home.hover-layer", decision("opend.home.hover-layer")]]), isAuthorized: () => true } as unknown as TestRuntimeSession);
		const { rerender } = render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const root = await screen.findByTestId("cms-hover-overlay-root");
		const [entry, layer] = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"));
		if (!entry || !layer) throw new Error("expected paired hover elements");
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		const images = [entry.shadowRoot?.querySelector("img"), layer.shadowRoot?.querySelector("img")];
		fireEvent.pointerEnter(entry);
		await waitFor(() => expect(entry).toHaveAttribute("aria-expanded", "true"));
		rerender(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		expect(Array.from(root.querySelectorAll("opend-touchpoint"))).toEqual([entry, layer]);
		await act(async () => {});
		expect([entry.shadowRoot?.querySelector("img"), layer.shadowRoot?.querySelector("img")]).toEqual(images);
		expect(entry).toHaveAttribute("aria-expanded", "true");
		expect(images[0]?.isConnected).toBe(true);
		expect(images[1]?.isConnected).toBe(true);
		rects.mockRestore();
	});
	it("keeps the paired hover identity gate for two selected placements from one version manifest", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							url.includes("hover-entry")
								? decision("opend.home.hover-entry", {
										content: {
											...content("opend.home.hover-entry"),
											id: "version-four-points",
											manifest: pairedMultiPlacementManifest,
										},
									})
								: decision("opend.home.hover-layer", {
										content: {
											...content("opend.home.hover-layer"),
											id: "version-four-points",
											manifest: pairedMultiPlacementManifest,
										},
									}),
						),
						{ status: 200 },
					),
				),
			),
		);
		render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("production-hover-overlay");
		const props = (
			overlaySpy.mock.calls as unknown as Array<
				[Record<string, { id: string; manifest: unknown }>]
			>
		)[0]?.[0];
		expect(props).toBeDefined();
		const entry = props!.entry!;
		const layer = props!.layer!;
		expect({ entry, layer }).toMatchObject({
			entry: { id: "version-four-points" },
			layer: { id: "version-four-points" },
		});
		expect(entry.manifest).toStrictEqual(pairedMultiPlacementManifest);
		expect(layer.manifest).toStrictEqual(pairedMultiPlacementManifest);
	});
	it("joins independently authorized entry and layer decisions before calling the v2 overlay", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve(
				new Response(
					JSON.stringify(
						url.includes("hover-entry")
							? decision("opend.home.hover-entry")
							: decision("opend.home.hover-layer"),
					),
					{ status: 200 },
				),
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("production-hover-overlay");
		expect(
			(
				overlaySpy.mock.calls as unknown as Array<[Record<string, unknown>]>
			)[0]?.[0],
		).toEqual(
			expect.objectContaining({
				entry: expect.objectContaining({
					placementKey: "opend.home.hover-entry",
				}),
				layer: expect.objectContaining({
					placementKey: "opend.home.hover-layer",
				}),
			}),
		);
	});

	it("fails closed when either independent decision is denied or carries the other placement identity", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify(decision("opend.home.hover-entry")), {
					status: 200,
				}),
			)
			.mockResolvedValueOnce(new Response(null, { status: 403 }));
		vi.stubGlobal("fetch", fetchMock);
		const first = render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
		first.unmount();
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							url.includes("hover-entry")
								? decision("opend.home.hover-entry")
								: decision("opend.home.hover-layer", {
										content: content("opend.home.hover-entry"),
									}),
						),
						{ status: 200 },
					),
				),
			),
		);
		render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await waitFor(() =>
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull(),
		);
	});

	it("clears a visible pair when a timed recheck returns different deployment snapshots", async () => {
		const fetchMock = vi.fn((url: string) => {
			const recheck = fetchMock.mock.calls.length > 2;
			const placementKey = url.includes("hover-entry")
				? "opend.home.hover-entry"
				: "opend.home.hover-layer";
			return Promise.resolve(
				new Response(
					JSON.stringify(
						recheck
							? decision(placementKey, {
									deploymentId:
										placementKey === "opend.home.hover-entry"
											? "entry-deployment"
											: "layer-deployment",
								})
							: decision(placementKey),
					),
					{ status: 200 },
				),
			);
		});
		vi.stubGlobal("fetch", fetchMock);
		render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("production-hover-overlay");
		expect(fetchMock).toHaveBeenCalledTimes(2);

		await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
		await waitFor(() =>
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull(),
		);
	});

	it.each(["activityId", "deploymentId", "content.id", "endsAt", "endsAt-format"])(
		"HST-007 rejects %s mismatch initially and on renewal, then restores a coherent pair",
		async (field) => {
			vi.useFakeTimers();
			let mismatch = true;
			const fetchMock = vi.fn(async (url: string) => {
				const key = url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer";
				const value = decision(key);
				if (mismatch && key.endsWith("layer")) {
					if (field === "content.id") value.content.id = "different-version";
					else if (field === "endsAt-format") value.endsAt = "2030-01-01T00:05:00+00:00";
					else Object.assign(value, { [field]: field === "endsAt" ? "2030-01-01T00:06:00.000Z" : "different-identity" });
				}
				return Response.json(value);
			});
			vi.stubGlobal("fetch", fetchMock);
			await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="hst007" />); });
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
			expect(diagnosticSpy).toHaveBeenCalledWith({ code: "touchpoint_pair_mismatch", detail: "opend.home.hover-entry:opend.home.hover-layer" });
			mismatch = false;
			await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
			expect(screen.queryByTestId("production-hover-overlay")).not.toBeNull();
			mismatch = true;
			diagnosticSpy.mockClear();
			await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
			expect(diagnosticSpy).toHaveBeenCalledWith({ code: "touchpoint_pair_mismatch", detail: "opend.home.hover-entry:opend.home.hover-layer" });
			mismatch = false;
			await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
			expect(screen.queryByTestId("production-hover-overlay")).not.toBeNull();
		},
	);

	it("HST-007 admits equal content and schedule with independent authorization deadlines", async () => {
		vi.useFakeTimers();
		vi.stubGlobal("fetch", vi.fn(async (url: string) => {
			const key = url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer";
			return Response.json(decision(key, { authorizationExpiresAt: key.endsWith("entry") ? "2030-01-01T00:00:10.000Z" : "2030-01-01T00:00:20.000Z" }));
		}));
		await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="hst007" />); });
		expect(screen.queryByTestId("production-hover-overlay")).not.toBeNull();
		expect(diagnosticSpy).not.toHaveBeenCalled();
		// No successful renewal may extend the shorter half of this grant.
		vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
		await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
		expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
	});

	it("fails closed for genuinely mismatched activity experiences", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							url.includes("hover-entry")
								? decision("opend.home.hover-entry")
								: decision("opend.home.hover-layer", {
										activityId: "activity-2",
									}),
						),
						{ status: 200 },
					),
				),
			),
		);
		render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await waitFor(() =>
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull(),
		);
	});

	it("synchronously fences account A content during an account A to B render", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							url.includes("hover-entry")
								? decision("opend.home.hover-entry")
								: decision("opend.home.hover-layer"),
						),
						{ status: 200 },
					),
				),
			),
		);
		const view = render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("production-hover-overlay");
		view.rerender(
			<ProductionCampaignHover authenticated sessionSubject="account-b" />,
		);
		expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
	});

	it("synchronously fences an authenticated account when authentication is revoked", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve(
					new Response(
						JSON.stringify(
							url.includes("hover-entry")
								? decision("opend.home.hover-entry")
								: decision("opend.home.hover-layer"),
						),
						{ status: 200 },
					),
				),
			),
		);
		const view = render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("production-hover-overlay");
		view.rerender(
			<ProductionCampaignHover
				authenticated={false}
				sessionSubject="account-a"
			/>,
		);
		expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
	});

	it("fences stale asynchronous decisions after account loss and never revives the overlay", async () => {
		let resolveEntry!: (response: Response) => void;
		let resolveLayer!: (response: Response) => void;
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(url: string) =>
					new Promise<Response>((resolve) => {
						if (url.includes("hover-entry")) resolveEntry = resolve;
						else resolveLayer = resolve;
					}),
			),
		);
		const view = render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		view.rerender(
			<ProductionCampaignHover authenticated={false} sessionSubject={null} />,
		);
		resolveEntry(
			new Response(JSON.stringify(decision("opend.home.hover-entry")), {
				status: 200,
			}),
		);
		resolveLayer(
			new Response(JSON.stringify(decision("opend.home.hover-layer")), {
				status: 200,
			}),
		);
		await Promise.resolve();
		await Promise.resolve();
		expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
	});
	const revocation = (
		value: ReturnType<typeof decision>,
		overrides: Record<string, string> = {},
	) =>
		new Response(
			JSON.stringify({
				error: "production_runtime_revoked",
				receipt: {
					touchpointDecisionId: value.touchpointDecisionId,
					deploymentId: value.deploymentId,
					activityId: value.activityId,
					contentVersionId: value.content.id,
					...overrides,
				},
			}),
			{ status: 410 },
		);

	it.each([
		["entry", "matching receipt", "late resolve"],
		["layer", "matching receipt", "late resolve"],
		["entry", "matching receipt", "abort rejection"],
		["layer", "matching receipt", "abort rejection"],
		["entry", "malformed receipt", "late resolve"],
		["layer", "malformed receipt", "late resolve"],
		["entry", "unqualified withdrawal", "late resolve"],
		["layer", "unqualified withdrawal", "late resolve"],
		["entry", "401", "late resolve"],
		["layer", "401", "late resolve"],
		["entry", "403", "late resolve"],
		["layer", "403", "late resolve"],
	] as const)(
		"promptly withdraws %s on %s with a pending sibling (%s)",
		async (placement, answer, siblingBehavior) => {
			vi.useFakeTimers();
			const addListener = vi.spyOn(AbortSignal.prototype, "addEventListener");
			const removeListener = vi.spyOn(AbortSignal.prototype, "removeEventListener");
			let resolveSibling!: (response: Response) => void;
			const pendingSibling = new Promise<Response>((resolve) => { resolveSibling = resolve; });
			let siblingSignal!: AbortSignal;
			const abortSpy = vi.fn();
			const fetchMock = vi.fn((url: string, init: RequestInit) => {
				const key = url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer";
				if (fetchMock.mock.calls.length <= 2)
					return Promise.resolve(new Response(JSON.stringify(decision(key)), { status: 200 }));
				if (!key.endsWith(placement)) {
					siblingSignal = init.signal!;
					if (siblingBehavior === "abort rejection")
						return new Promise<Response>((_resolve, reject) => {
							siblingSignal.addEventListener("abort", () => {
								abortSpy();
								reject(new DOMException("aborted", "AbortError"));
							}, { once: true });
						});
					return pendingSibling;
				}
				const response = answer === "matching receipt" ? revocation(decision(key))
					: answer === "malformed receipt" ? new Response(JSON.stringify({ error: "production_runtime_revoked", receipt: { touchpointDecisionId: "incomplete" } }), { status: 410 })
					: answer === "unqualified withdrawal" ? new Response(null, { status: 410 })
					: new Response(null, { status: Number(answer) });
				return Promise.resolve(response);
			});
			vi.stubGlobal("fetch", fetchMock);
			await act(async () => {
				render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
			});
			expect(screen.getByTestId("production-hover-overlay")).toBeTruthy();
			await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS - 1); });
			expect(fetchMock).toHaveBeenCalledTimes(2);
			await act(async () => { await vi.advanceTimersByTimeAsync(1); });
			expect(fetchMock).toHaveBeenCalledTimes(4);
			expect(fetchMock.mock.calls[2]?.[0]).toContain("activeDecisionId=decision-opend.home.hover-entry");
			expect(fetchMock.mock.calls[3]?.[0]).toContain("activeDecisionId=decision-opend.home.hover-layer");
			// Clear while the sibling is still pending, before the 15s request budget.
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
			expect(siblingSignal.aborted).toBe(true);
			if (siblingBehavior === "abort rejection") expect(abortSpy).toHaveBeenCalledTimes(1);
			if (answer !== "matching receipt")
				expect(diagnosticSpy).toHaveBeenCalledWith({ code: "touchpoint_load_failed", detail: `http_${answer === "401" || answer === "403" ? answer : "410"}` });
			else expect(diagnosticSpy).not.toHaveBeenCalled();
			await act(async () => {
				await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS - 1);
				resolveSibling(new Response(JSON.stringify(decision(`opend.home.hover-${placement === "entry" ? "layer" : "entry"}`)), { status: 200 }));
			});
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
			expect(fetchMock).toHaveBeenCalledTimes(4);
			// Every lifecycle-to-pair forwarding listener is removed on completion.
			for (const [index, args] of addListener.mock.calls.entries()) {
				if (args[0] !== "abort" || addListener.mock.contexts[index] === siblingSignal) continue;
				expect(removeListener.mock.calls.some((removed, removedIndex) =>
					removed[0] === "abort" && removed[1] === args[1] &&
					removeListener.mock.contexts[removedIndex] === addListener.mock.contexts[index],
				)).toBe(true);
			}
		},
	);

	it.each([
		["entry", "touchpointDecisionId"], ["layer", "touchpointDecisionId"],
		["entry", "deploymentId"], ["layer", "deploymentId"],
		["entry", "activityId"], ["layer", "activityId"],
		["entry", "contentVersionId"], ["layer", "contentVersionId"],
		["entry", "other placement"], ["layer", "other placement"],
	] as const)("retains %s for a mismatched %s while its sibling is pending", async (placement, field) => {
		vi.useFakeTimers();
		let resolveSibling!: (response: Response) => void;
		const pending = new Promise<Response>((resolve) => { resolveSibling = resolve; });
		let siblingSignal!: AbortSignal;
		const fetchMock = vi.fn((url: string, init: RequestInit) => {
			const key = url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer";
			if (fetchMock.mock.calls.length <= 2)
				return Promise.resolve(new Response(JSON.stringify(decision(key)), { status: 200 }));
			if (!key.endsWith(placement)) { siblingSignal = init.signal!; return pending; }
			return Promise.resolve(field === "other placement"
				? revocation(decision(`opend.home.hover-${placement === "entry" ? "layer" : "entry"}`))
				: revocation(decision(key), { [field]: "older-identity" }));
		});
		vi.stubGlobal("fetch", fetchMock);
		await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="account-a" />); });
		const mounted = screen.getByTestId("production-hover-overlay");
		await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(screen.getByTestId("production-hover-overlay")).toBe(mounted);
		expect(siblingSignal.aborted).toBe(false);
		await act(async () => {
			resolveSibling(new Response(JSON.stringify(decision(`opend.home.hover-${placement === "entry" ? "layer" : "entry"}`)), { status: 200 }));
		});
		expect(screen.getByTestId("production-hover-overlay")).toBe(mounted);
		expect(siblingSignal.aborted).toBe(true);
		expect(diagnosticSpy).not.toHaveBeenCalled();
	});

	it("updates a pair only after both coherent new grants arrive", async () => {
		vi.useFakeTimers();
		const resolvers: Array<(response: Response) => void> = [];
		const fetchMock = vi.fn((url: string) => fetchMock.mock.calls.length <= 2
			? Promise.resolve(new Response(JSON.stringify(decision(url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer")), { status: 200 }))
			: new Promise<Response>((resolve) => { resolvers.push(resolve); }));
		vi.stubGlobal("fetch", fetchMock);
		await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="account-a" />); });
		const latestEntry = () => (overlaySpy.mock.lastCall?.[0] as { entry: { id: string } }).entry.id;
		await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
		const next = (key: string) => new Response(JSON.stringify(decision(key, {
			deploymentId: "deployment-2", content: { ...content(key), id: "next-hover-pair" },
		})), { status: 200 });
		await act(async () => { resolvers[0]!(next("opend.home.hover-entry")); });
		expect(latestEntry()).toBe("version-hover-pair");
		await act(async () => { resolvers[1]!(next("opend.home.hover-layer")); });
		expect(latestEntry()).toBe("next-hover-pair");
	});

	it.each(["account", "locale"] as const)("fences a late matching withdrawal after a %s change", async (change) => {
		vi.useFakeTimers();
		let resolveLate!: (response: Response) => void;
		const pending = new Promise<Response>((resolve) => { resolveLate = resolve; });
		let pendingSignal!: AbortSignal;
		const fetchMock = vi.fn((url: string, init: RequestInit) => {
			const key = url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer";
			if (fetchMock.mock.calls.length === 4) { pendingSignal = init.signal!; return pending; }
			const fresh = fetchMock.mock.calls.length > 2;
			return Promise.resolve(new Response(JSON.stringify(decision(key, { content: {
				...content(key), id: fresh ? "fresh-hover-pair" : "version-hover-pair",
				locale: url.includes("locale=zh-CN") ? "zh-CN" : "en-US",
			} })), { status: 200 }));
		});
		vi.stubGlobal("fetch", fetchMock);
		const element = (subject: string) => <I18nProvider initial="en"><LocaleSwitch /><ProductionCampaignHover authenticated sessionSubject={subject} /></I18nProvider>;
		let view!: ReturnType<typeof render>;
		await act(async () => { view = render(element("account-a")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
		expect((overlaySpy.mock.lastCall?.[0] as { entry: { id: string } }).entry.id).toBe("version-hover-pair");
		await act(async () => {
			if (change === "account") view.rerender(element("account-b"));
			else screen.getByRole("button", { name: "Switch locale" }).click();
		});
		expect(pendingSignal.aborted).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(6);
		const mounted = screen.getByTestId("production-hover-overlay");
		expect((overlaySpy.mock.lastCall?.[0] as { entry: { id: string } }).entry.id).toBe("fresh-hover-pair");
		await act(async () => { resolveLate(revocation(decision("opend.home.hover-layer"))); });
		expect(screen.getByTestId("production-hover-overlay")).toBe(mounted);
		expect(diagnosticSpy).not.toHaveBeenCalled();
	});

	it("removes abort forwarding on unmount even when both transports ignore cancellation", async () => {
		vi.useFakeTimers();
		const addListener = vi.spyOn(AbortSignal.prototype, "addEventListener");
		const removeListener = vi.spyOn(AbortSignal.prototype, "removeEventListener");
		const rejectors: Array<(error: unknown) => void> = [];
		const signals: AbortSignal[] = [];
		vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
			signals.push(init.signal!);
			return new Promise<Response>((_resolve, reject) => { rejectors.push(reject); });
		}));
		const view = render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		expect(signals).toHaveLength(2);
		await act(async () => { view.unmount(); });
		expect(signals.every((signal) => signal.aborted)).toBe(true);
		const forwarding = addListener.mock.calls.find(([type]) => type === "abort");
		expect(forwarding).toBeDefined();
		expect(removeListener).toHaveBeenCalledWith("abort", forwarding![1]);
		await act(async () => { rejectors.forEach((reject) => reject(new TypeError("late transport failure"))); });
		expect(screen.queryByTestId("production-hover-overlay")).toBeNull();
		expect(diagnosticSpy).not.toHaveBeenCalled();
	});

	it.each([
		["entry revoked while layer unavailable", "match", "transient", true],
		["layer revoked while entry unavailable", "transient", "match", true],
		["unrelated receipt while layer unavailable", "mismatch", "transient", false],
		["entry mismatch and layer match", "mismatch", "match", true],
		["entry match and layer mismatch", "match", "mismatch", true],
		["both mismatched", "mismatch", "mismatch", false],
		["both match", "match", "match", true],
		[
			"entry receipt identifying layer arrives at entry",
			"layer",
			"mismatch",
			false,
		],
	] as const)(
		"evaluates corresponding mounted hover receipts: %s",
		async (_name, entryResult, layerResult, clears) => {
			const entry = decision("opend.home.hover-entry");
			const layer = decision("opend.home.hover-layer");
			const receiptFor = (
				result: "match" | "mismatch" | "layer" | "transient",
				value: typeof entry,
				other: typeof layer,
			) =>
				result === "transient"
					? new Response(JSON.stringify({ error: "upstream_unavailable" }), { status: 502 })
					: result === "match"
					? revocation(value)
					: result === "layer"
						? revocation(other)
						: revocation(value, { deploymentId: "other-deployment" });
			const fetchMock = vi.fn((url: string) => {
				const recheck = fetchMock.mock.calls.length > 2;
				if (!recheck)
					return Promise.resolve(
						new Response(
							JSON.stringify(url.includes("hover-entry") ? entry : layer),
							{ status: 200 },
						),
					);
				return Promise.resolve(
					url.includes("hover-entry")
						? receiptFor(entryResult, entry, layer)
						: receiptFor(layerResult, layer, entry),
				);
			});
			vi.stubGlobal("fetch", fetchMock);
			render(
				<ProductionCampaignHover authenticated sessionSubject="account-a" />,
			);
			await screen.findByTestId("production-hover-overlay");
			window.dispatchEvent(new Event("focus"));
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
			expect(fetchMock.mock.calls[2]?.[0]).toContain(
				"activeDecisionId=decision-opend.home.hover-entry",
			);
			expect(fetchMock.mock.calls[3]?.[0]).toContain(
				"activeDecisionId=decision-opend.home.hover-layer",
			);
			if (clears)
				await waitFor(() =>
					expect(screen.queryByTestId("production-hover-overlay")).toBeNull(),
				);
			else expect(screen.getByTestId("production-hover-overlay")).toBeTruthy();
		},
	);

	it("clears the mounted pair and diagnoses a malformed 410 receipt", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve(
				fetchMock.mock.calls.length <= 2
					? new Response(
							JSON.stringify(
								url.includes("hover-entry")
									? decision("opend.home.hover-entry")
									: decision("opend.home.hover-layer"),
							),
							{ status: 200 },
						)
					: new Response(
							JSON.stringify({
								error: "production_runtime_revoked",
								receipt: { touchpointDecisionId: "only-one-field" },
							}),
							{ status: 410 },
						),
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(
			<ProductionCampaignHover authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("production-hover-overlay");
		window.dispatchEvent(new Event("focus"));
		await waitFor(() =>
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull(),
		);
		expect(diagnosticSpy).toHaveBeenCalledWith({
			code: "touchpoint_load_failed",
			detail: "http_410",
		});
	});
	it("loads a zh-CN pair with the same decision IDs and fences late en pair responses after a client locale switch", async () => {
		(globalThis as HostGlobal).__productionHoverHost = { client: { type: "desktop", osLocale: "en-US" } } ;
		let resolveLateEntry: ((response: Response) => void) | undefined;
		let resolveLateLayer: ((response: Response) => void) | undefined;
		const lateEntry = new Promise<Response>((resolve) => { resolveLateEntry = resolve; });
		const lateLayer = new Promise<Response>((resolve) => { resolveLateLayer = resolve; });
		const localized = (placementKey: string, locale: string) => {
			const base = content(placementKey);
			return decision(placementKey, { content: { ...base, locale, manifest: { ...base.manifest, placements: [{ ...base.manifest.placements[0], locales: [locale] }] } } });
		};
		const fetchMock = vi.fn((url: string) => {
			const entry = url.includes("hover-entry");
			if (fetchMock.mock.calls.length === 3) return lateEntry;
			if (fetchMock.mock.calls.length === 4) return lateLayer;
			return Promise.resolve(new Response(JSON.stringify(localized(entry ? "opend.home.hover-entry" : "opend.home.hover-layer", url.includes("locale=zh-CN") ? "zh-CN" : "en-US")), { status: 200 }));
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<I18nProvider initial="en"><LocaleSwitch /><ProductionCampaignHover authenticated sessionSubject="account-a" /></I18nProvider>);
		await screen.findByTestId("production-hover-overlay");
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
		await act(async () => { screen.getByRole("button", { name: "Switch locale" }).click(); });
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
		await waitFor(() => expect(screen.getByTestId("production-hover-overlay")).toHaveTextContent("zh-CN"));
		resolveLateEntry?.(new Response(JSON.stringify(localized("opend.home.hover-entry", "en-US")), { status: 200 }));
		resolveLateLayer?.(new Response(JSON.stringify(localized("opend.home.hover-layer", "en-US")), { status: 200 }));
		await Promise.resolve();
		expect(screen.getByTestId("production-hover-overlay")).toHaveTextContent("zh-CN");
	});
});

describe('online timeout recovery', () => {
  it('probes five minutes after asymmetric timeout and resumes normal production renewal', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    let mode = 'fresh';
    let late!: (response: Response) => void;
    let signal!: AbortSignal;
    const fresh = (placement: string) => new Response(JSON.stringify(decision(placement, {
      endsAt: '2030-01-01T01:00:00.000Z', authorizationExpiresAt: '2030-01-01T01:00:00.000Z',
    })));
    const fetchMock = vi.fn((url: string, init: RequestInit) => {
      const placement = new URL(url, 'http://daemon.invalid').searchParams.get('placementKey')!;
      if (mode === 'fresh') return Promise.resolve(fresh(placement));
      if (placement.endsWith('hover-entry')) return Promise.resolve(new Response(JSON.stringify({
        error: 'production_runtime_revoked', receipt: {
          activityId: 'activity-1', deploymentId: 'other', contentVersionId: "version-hover-pair", touchpointDecisionId: `decision-${placement}`,
        },
      }), { status: 410 }));
      signal = init.signal as AbortSignal;
      return new Promise<Response>(resolve => { late = resolve; });
    });
    vi.stubGlobal('fetch', fetchMock);
    const step = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
    await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="A" />); });
    expect(screen.getByTestId('production-hover-overlay')).toBeTruthy();
    mode = 'pending'; await step(TOUCHPOINT_POLL_MS); await step(15_000);
    expect(signal.aborted).toBe(true);
    mode = 'fresh'; await act(async () => { late(fresh('opend.home.hover-layer')); });
    await step(299_999); expect(fetchMock).toHaveBeenCalledTimes(4);
    await step(1); expect(fetchMock).toHaveBeenCalledTimes(6);
    await step(TOUCHPOINT_POLL_MS); expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId('production-hover-overlay')).toBeTruthy();
  });
});

it.each([false, true])("binds a real hover dispatch to its credential and original B identity (replace renewal=%s)", async (replaceRenewal) => {
  const actual = await vi.importActual<
    typeof import("../../src/components/touchpoint-component")
  >("../../src/components/touchpoint-component");
  vi.mocked(touchpointComponent.verifyWebTouchpoint).mockImplementation(
    actual.verifyWebTouchpoint,
  );
  const digest = (value: string) =>
    `sha256:${createHash("sha256").update(value).digest("hex")}`;
  replaceRenewalValue.current = replaceRenewal;
  useRealOverlay.current = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) { return { length: this.hidden || this.closest('[hidden]') ? 0 : 1 } as DOMRectList; });
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  let layerMounts = 0;
  let resolveRenewedMount!: () => void;
  const renewedMount = new Promise<void>((resolve) => {
    resolveRenewedMount = resolve;
  });
  let dispatchLayer: ((id: string) => Promise<void>) | undefined;
  vi.spyOn(OpenDesignTouchpointElement.prototype, 'mount').mockImplementation(async function (this: OpenDesignTouchpointElement, _url, _digest, context, _resources, _actions, options) {
    if (context.placementKey === 'opend.home.hover-layer') {
      dispatchLayer = options?.dispatchAction;
      if (++layerMounts === 2) resolveRenewedMount();
    }
    this.shadowRoot?.replaceChildren(document.createTextNode(context.placementKey));
  });
  const navigate = campaignNavigation.navigateCampaignTarget;
  vi.spyOn(campaignNavigation, 'navigateCampaignTarget').mockImplementation((target, options) => target.kind === 'internal' ? Promise.resolve(true) : navigate(target, options));
  const material = {
    version: 1 as const,
    materialVersionId: '12345678-1234-4234-8234-123456789012',
    sourceHash: 'a'.repeat(64),
    templateId: 'hover-v3',
    templateVersion: 8,
    rendererDigest: `sha256:${'a'.repeat(64)}`,
    compilerIdentity: 'fixture',
    sourceDslVersion: 3 as const,
  };
  const dimensions = {
    template_id: material.templateId,
    template_version: material.templateVersion,
    material_version_id: material.materialVersionId,
  };
  let credential = 'decision-1';
  const transport = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/events')) return Response.json({});
    const placement = url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer';
    const staticActions = [{ id: 'learn', target: { kind: 'https', url: 'https://example.com' } }, { id: 'Link_B', target: { kind: 'https', url: 'https://example.com/b' } }, { id: 'Internal-C', target: { kind: 'internal', path: '/projects' } }];
    const declared = content(placement);
    Object.assign(
      declared.manifest,
      credential === 'decision-1'
        ? { material }
        : { material: { ...material, templateVersion: 99 } },
    );
    Object.assign(declared.manifest, {
      formatVersion: 2,
      runtimeKind: 'web-component',
      runtimeApiVersion: 1,
      platformWrapperVersion: 'vela-touchpoint-wrapper-v1',
      sdkVersion: 'vela-touchpoint-sdk-v1',
      contentLine: 'verified-hover',
      resources: ['component.js'],
      images: [],
    });
    Object.assign(declared.manifest.placements[0]!, {
      entry: 'component.js',
      resources: [],
      locales: ['en'],
    });
    Object.assign(declared, {
      locale: 'en',
      entryDigest: digest(declared.entryModule),
      resources: [
        {
          path: 'component.js',
          digest: digest(declared.entryModule),
          bytes: btoa(declared.entryModule),
        },
      ],
    });
    declared.manifest.placements[0]!.staticActions = staticActions as typeof declared.manifest.placements[0]['staticActions'];
    declared.manifestHash = digest(JSON.stringify(declared.manifest));
    return Response.json(decision(placement, { content: declared, staticActions, touchpointDecisionId: credential, serverTime: new Date().toISOString(), authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString() }));
  });
  vi.stubGlobal('fetch', transport);
  render(<ProductionCampaignHover authenticated sessionSubject="renewed-pair" />);
  const root = await screen.findByTestId('cms-hover-overlay-root');
  const entry = root.querySelector('opend-touchpoint')!;
  await waitFor(() => expect(entry).not.toHaveAttribute('hidden'));
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  expect(cmsTrack.mock.calls.filter(([event, props]) => event === 'surface_view' && props.area === 'cms_hover_layer')).toHaveLength(0);
  fireEvent.pointerEnter(entry);
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  const bodies = () => transport.mock.calls.filter(([url]) => url.endsWith('/events')).map(([, init]) => JSON.parse(String(init?.body)));
  const originalViews = cmsTrack.mock.calls.filter(([event]) => event === 'surface_view');
  const originalExposures = bodies().filter(body => body.kind === 'exposure');
  expect(originalViews).toHaveLength(2);
  for (const [, props] of originalViews)
    expect(props).toMatchObject(dimensions);
  expect(new Set(originalViews.map(([, , options]) => options.insertId)).size).toBe(2);
  credential = 'decision-2';
  await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
  expect(vi.mocked(touchpointLoadQueue('production').enqueue).mock.calls.some(([record]) => record.kind === 'renewal' && record.decision_id === 'decision-2')).toBe(true);
  if (replaceRenewal)
    await act(async () => {
      await renewedMount;
    });
  else expect(root.querySelector('opend-touchpoint')).toBe(entry);
  expect(dispatchLayer).toBeTypeOf('function');
  await act(async () => { await dispatchLayer!('learn'); await dispatchLayer!('Link_B'); await dispatchLayer!('Internal-C'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  const clicks = bodies().filter(body => body.kind === 'click');
  const [click] = clicks;
  expect(new Set(clicks.map(body => body.eventId)).size).toBe(3);
  expect(click).toMatchObject({
    touchpointDecisionId: replaceRenewal ? 'decision-2' : 'decision-1',
    placementKey: 'opend.home.hover-layer',
  });
  expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toEqual(['learn', 'Link_B', 'Internal-C'].map((action_id, i) => ['ui_click', expect.objectContaining({ decision_id: click.touchpointDecisionId, area: 'cms_hover_layer', element: 'link_cta', action_id, target_kind: i === 2 ? 'internal' : 'https' }), { insertId: clicks[i].eventId }]));
  for (const [, props] of cmsTrack.mock.calls)
    expect(props).toMatchObject(dimensions);
  expect(bodies().filter(body => body.kind === 'exposure')).toEqual(originalExposures);
  expect(cmsTrack.mock.calls.filter(([event]) => event === 'surface_view')).toEqual(originalViews);
  const terminals = vi.mocked(touchpointLoadQueue('production').enqueue).mock.calls.map(([record]) => record).filter(record => record.kind === 'terminal');
  expect(terminals).toHaveLength(2);
  for (const [, context, options] of originalViews) {
    expect(context.decision_id).toBe('decision-1');
    expect(terminals.find(record => record.placement_key === context.placement_key)).toMatchObject({ event_id: options.insertId, decision_id: 'decision-1' });
    expect(originalExposures.find(body => body.placementKey === context.placement_key)).toMatchObject({ eventId: options.insertId, touchpointDecisionId: 'decision-1' });
  }
  expect(openExternalUrl.mock.calls).toEqual([["https://example.com"], ["https://example.com/b"]]);
});

it("keeps both real hosts hidden until layer mount, then records each visible half once and clears on withdrawal", async () => {
  useRealOverlay.current = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) { return { length: this.hidden || this.closest('[hidden]') ? 0 : 1 } as DOMRectList; });
  let resolveLayer!: () => void;
  const layerMounted = new Promise<void>(resolve => { resolveLayer = resolve; });
  vi.spyOn(OpenDesignTouchpointElement.prototype, 'mount').mockImplementation(async function (this: OpenDesignTouchpointElement, _url, _digest, context) {
    if (context.placementKey === 'opend.home.hover-layer') await layerMounted;
    this.shadowRoot?.replaceChildren(document.createTextNode(context.placementKey));
  });
  let withdrawn = false;
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.endsWith('/events')) return new Response('{}', { status: 200 });
    if (withdrawn && url.includes('hover-layer')) return new Response('{}', { status: 410 });
    return new Response(JSON.stringify(decision(url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer')), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<ProductionCampaignHover authenticated sessionSubject="pair-account" />);
  const root = await screen.findByTestId('cms-hover-overlay-root');
  const [entry, layer] = root.querySelectorAll('opend-touchpoint');
  expect(entry).toHaveAttribute('hidden'); expect(layer).toHaveAttribute('hidden');
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(0);
  await act(async () => { resolveLayer(); });
  await waitFor(() => expect(entry).not.toHaveAttribute('hidden'));
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  const exposureBodies = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/events')).map(([, init]) => JSON.parse(String(init?.body)));
  expect(exposureBodies().map(body => body.placementKey)).toEqual(['opend.home.hover-entry']);
  expect(cmsTrack.mock.calls.filter(([event, props]) => event === 'surface_view' && props.area === 'cms_hover_layer')).toHaveLength(0);
  fireEvent.pointerEnter(entry!);
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  expect(exposureBodies().map(body => body.placementKey).sort()).toEqual(['opend.home.hover-entry', 'opend.home.hover-layer']);
  expect(exposureBodies().every(body => body.kind === 'exposure')).toBe(true);
  const facts = vi.mocked(touchpointLoadQueue("production").enqueue).mock.calls.map(([record]) => record);
  expect(facts.filter(record => record.kind === 'start')).toHaveLength(2);
  const visible = facts.filter(record => record.result === 'visible');
  expect(visible).toHaveLength(2);
  expect(new Set(visible.map(record => record.event_id)).size).toBe(2);
  for (const body of exposureBodies()) expect(visible.find(record => record.placement_key === body.placementKey)?.event_id).toBe(body.eventId);
  expect(cmsTrack.mock.calls.filter(([event]) => event === 'surface_view')).toHaveLength(2);
  for (const body of exposureBodies()) expect(cmsTrack).toHaveBeenCalledWith('surface_view', expect.objectContaining({ placement_key: body.placementKey, page_name: 'home', area: body.placementKey.endsWith('hover-entry') ? 'cms_account_badge' : 'cms_hover_layer', element: body.placementKey.endsWith('hover-entry') ? 'badge' : 'layer' }), { insertId: body.eventId });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(document.activeElement).toBe(entry);
  fireEvent.pointerEnter(entry!);
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  expect(exposureBodies()).toHaveLength(3);
  expect(exposureBodies().filter(body => body.kind === 'exposure')).toHaveLength(2);
  const closes = exposureBodies().filter(body => body.kind === 'click');
  expect(closes).toEqual([expect.objectContaining({ placementKey: 'opend.home.hover-layer', element: 'close' })]);
  expect(cmsTrack.mock.calls.filter(([event]) => event === "surface_view")).toHaveLength(2);
  expect(cmsTrack.mock.calls.filter(([event]) => event === "ui_click")).toEqual([
    ['ui_click', expect.objectContaining({ element: 'close' }), { insertId: closes[0].eventId }],
  ]);
  withdrawn = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
  expect(screen.queryByTestId('cms-hover-overlay-root')).toBeNull();
});

it.each([200, 404])("retains a live pair after no-decision %s until its existing lease expires", async status => {
  let absent = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => absent ? new Response(status === 200 ? JSON.stringify({ decision: null }) : null, { status }) : new Response(JSON.stringify(decision(url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer')), { status: 200 })));
  render(<ProductionCampaignHover authenticated sessionSubject="null-account" />);
  await screen.findByTestId('production-hover-overlay');
  absent = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
  expect(screen.queryByTestId('production-hover-overlay')).not.toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000 - TOUCHPOINT_POLL_MS); });
  expect(screen.queryByTestId('production-hover-overlay')).toBeNull();
});


it.each([false, true])("fences real T3 layer on leaving: triggered=%s, ready never counts as visible", async triggered => {
  useRealOverlay.current = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) { return { length: this.hidden || this.closest('[hidden]') ? 0 : 1 } as DOMRectList; });
  vi.spyOn(OpenDesignTouchpointElement.prototype, 'mount').mockImplementation(async function (this: OpenDesignTouchpointElement) { this.shadowRoot?.replaceChildren(document.createTextNode('ready')); });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/events') ? {} : decision(url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer')), { status: 200 })));
  const view = render(<ProductionCampaignHover authenticated sessionSubject="leaving-pair" />);
  const root = await screen.findByTestId('cms-hover-overlay-root');
  const entry = root.querySelector('opend-touchpoint')!;
  await waitFor(() => expect(entry).not.toHaveAttribute('hidden'));
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  if (triggered) fireEvent.pointerEnter(entry);
  view.unmount();
  const facts = vi.mocked(touchpointLoadQueue("production").enqueue).mock.calls.map(([record]) => record);
  const layer = facts.filter(record => record.placement_key === 'opend.home.hover-layer' && record.kind === 'terminal');
  expect(layer).toHaveLength(1); expect(layer[0]).toMatchObject({ result: 'cancelled', cancel_reason: triggered ? 'page_left' : 'not_triggered' });
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  expect(vi.mocked(touchpointLoadQueue("production").enqueue).mock.calls.filter(([record]) => record.placement_key === 'opend.home.hover-layer' && record.result === 'visible')).toHaveLength(0);
});


it.each(['opend.home.hover-entry', 'opend.home.hover-layer'])("records actual hover capability rejection for %s as cancelled unsupported", async rejectedPlacement => {
  const facts = () => vi.mocked(touchpointLoadQueue('production').enqueue).mock.calls.map(([record]) => record);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const placement = url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer';
    return new Response(JSON.stringify(decision(placement, placement === rejectedPlacement ? { requiredCapabilities: ['unsupported-real-host'] } : {})));
  }));
  render(<ProductionCampaignHover authenticated sessionSubject="unsupported-pair" />);
  await waitFor(() => expect(facts().some(record => record.placement_key === rejectedPlacement && record.kind === 'terminal')).toBe(true));
  expect(facts().filter(record => record.placement_key === rejectedPlacement && record.kind === 'terminal')).toEqual([expect.objectContaining({ result: 'cancelled', decision_outcome: 'capability_unsupported', cancel_reason: 'capability_unsupported' })]);
  expect(screen.queryByTestId('production-hover-overlay')).toBeNull();
});

it("recovers the real T3 pair after failed mount with fresh starts, independent B and no rehover POST", async () => {
  useRealOverlay.current = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) { return { length: this.hidden || this.closest('[hidden]') ? 0 : 1 } as DOMRectList; });
  const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, 'mount').mockImplementation(async function (this: OpenDesignTouchpointElement) { this.shadowRoot?.replaceChildren(document.createTextNode('ready')); }).mockRejectedValueOnce(new Error('mount failed'));
  const facts = () => vi.mocked(touchpointLoadQueue('production').enqueue).mock.calls.map(([record]) => record);
  const rounds = new Map<string, number>();
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/events')) return new Response('{}');
    const placement = url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer';
    const round = (rounds.get(placement) ?? 0) + 1; rounds.set(placement, round);
    expect(facts().filter(record => record.placement_key === placement && record.kind === 'start')).toHaveLength(Math.min(round, 2));
    return new Response(JSON.stringify(decision(placement, { touchpointDecisionId: 'recovered-' + placement })));
  });
  vi.stubGlobal('fetch', transport);
  render(<ProductionCampaignHover authenticated sessionSubject="failed-pair" />);
  await waitFor(() => expect(facts().filter(record => record.result === 'failed')).toHaveLength(2));
  expect(mount).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
  const root = await screen.findByTestId('cms-hover-overlay-root');
  const entry = root.querySelector('opend-touchpoint')!;
  await waitFor(() => expect(entry).not.toHaveAttribute('hidden'));
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  fireEvent.pointerEnter(entry);
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  const visible = facts().filter(record => record.result === 'visible');
  expect(visible).toHaveLength(2); expect(facts().filter(record => record.kind === 'start')).toHaveLength(4);
  expect(new Set(facts().filter(record => record.kind === 'terminal').map(record => record.load_attempt_id)).size).toBe(4);
  const exposures = () => transport.mock.calls.filter(([url]) => url.endsWith('/events')).map(([, init]) => JSON.parse(String(init?.body)));
  expect(exposures()).toHaveLength(2);
  for (const body of exposures()) expect(visible.find(record => record.placement_key === body.placementKey)?.event_id).toBe(body.eventId);
  fireEvent.keyDown(window, { key: 'Escape' }); fireEvent.pointerEnter(entry);
  await act(async () => { await vi.advanceTimersByTimeAsync(30032); });
  expect(exposures()).toHaveLength(3);
  expect(exposures().filter(body => body.kind === 'exposure')).toHaveLength(2);
  expect(exposures().filter(body => body.kind === 'click')).toEqual([
    expect.objectContaining({ placementKey: 'opend.home.hover-layer', element: 'close' }),
  ]);
  expect(facts().filter(record => record.kind === 'start')).toHaveLength(4);
});

it('keeps one first empty attempt per real placement across initial host polls, then loads a newly published pair', async () => {
 let absent = true;
 vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(absent ? { decision: null } : decision(url.includes('hover-entry') ? 'opend.home.hover-entry' : 'opend.home.hover-layer'))));
 render(<ProductionCampaignHover authenticated sessionSubject="initial-empty-account" />);
 await act(async () => { await vi.advanceTimersByTimeAsync(0); });
 await act(async () => { await vi.advanceTimersByTimeAsync(2 * TOUCHPOINT_POLL_MS); });
 const facts = () => vi.mocked(touchpointLoadQueue('production').enqueue).mock.calls.map(([record]) => record);
 expect(facts().filter(record => record.kind === 'start')).toHaveLength(2);
 expect(facts().filter(record => record.kind === 'terminal')).toHaveLength(2);
 expect(facts().filter(record => record.kind === 'renewal')).toHaveLength(4);
 expect(facts().filter(record => record.kind === 'renewal').every(record => record.decision_outcome === 'no_activity')).toBe(true);
 absent = false;
 await act(async () => { await vi.advanceTimersByTimeAsync(TOUCHPOINT_POLL_MS); });
 expect(screen.queryByTestId('production-hover-overlay')).not.toBeNull();
 expect(facts().filter(record => record.kind === 'start')).toHaveLength(4);
 expect(new Set(facts().map(record => record.session_id)).size).toBe(1);
});


it.each([false, true])("shares production hover X and Escape C with a bounded raw receipt (analytics throws=%s)", async throws => {
  useRealOverlay.current = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function(this:HTMLElement) {return {length:this.hidden || this.closest('[hidden]') ? 0 : 1} as DOMRectList;});
  if (throws) cmsTrack.mockImplementation(()=>{throw new Error('optional analytics unavailable');});
  let close!: (reason?: 'close' | 'secondary_close')=>void;
  vi.spyOn(OpenDesignTouchpointElement.prototype,'mount').mockImplementation(async function(this:OpenDesignTouchpointElement,_url,_digest,context,_resources,_actions,options) {
    if(context.placementKey==='opend.home.hover-layer') close=options!.requestClose!;
    this.shadowRoot?.replaceChildren(document.createTextNode('ready'));
  });
  const transport=vi.fn(async(url:string,_init?:RequestInit)=>url.endsWith('/events') ? Response.json({accepted:true},{status:202}) : Response.json(decision(url.includes('hover-entry')?'opend.home.hover-entry':'opend.home.hover-layer')));
  vi.stubGlobal('fetch',transport);
  const view=render(<ProductionCampaignHover authenticated sessionSubject="close-owner"/>);
  const root=await screen.findByTestId('cms-hover-overlay-root'); const entry=root.querySelector('opend-touchpoint')!;
  await waitFor(()=>expect(entry).not.toHaveAttribute('hidden'));
  const bodies=()=>transport.mock.calls.filter(([url])=>url.endsWith('/events')).map(([,init])=>JSON.parse(String(init?.body)));
  const clicks=()=>bodies().filter(b=>b.kind==='click');
  await act(async()=>{close('close');}); expect(clicks()).toHaveLength(0);
  const open=async()=>{fireEvent.pointerEnter(entry);await act(async()=>{await vi.advanceTimersByTimeAsync(32);});};
  await open();
  await act(async()=>{close('close');});
  expect(clicks()).toHaveLength(1);
  const captured=cmsTrack.mock.calls.filter(([event,props])=>event==='ui_click' && props.element==='close');
  expect(captured).toHaveLength(1);
  expect(clicks()[0]).toEqual({touchpointDecisionId:'decision-opend.home.hover-layer',activityId:'activity-1',placementKey:'opend.home.hover-layer',eventId:captured[0]![2].insertId,kind:'click',element:'close'});
  await act(async()=>{close('close');}); expect(clicks()).toHaveLength(1);
  await open(); await act(async()=>{close();}); expect(clicks()).toHaveLength(1);
  await open(); await act(async()=>{fireEvent.keyDown(window,{key:'Escape'});}); expect(clicks()).toHaveLength(2);
  expect(document.activeElement).toBe(entry);
  await open(); await act(async()=>{close('secondary_close');}); expect(clicks()).toHaveLength(2);
  await open(); await act(async()=>{close('close');}); expect(clicks()).toHaveLength(3);
  const allCaptured=cmsTrack.mock.calls.filter(([event])=>event==='ui_click');
  expect(allCaptured).toHaveLength(3);
  expect(clicks().every(body=>body.element==='close')).toBe(true);
  expect(allCaptured.every(([,props])=>props.element==='close')).toBe(true);
  expect(clicks().map(body=>body.eventId)).toEqual(allCaptured.map(([, ,options])=>options.insertId));
  expect(new Set(clicks().map(body=>body.eventId)).size).toBe(3);
  expect(bodies()).toHaveLength(5);
  expect(bodies().filter(b=>b.kind==='exposure')).toHaveLength(2);
  view.unmount(); await act(async()=>{close('close');}); expect(clicks()).toHaveLength(3);
  cmsTrack.mockReset();
});


it.each([
  ["en", "opend.home.hover-entry", 0],
  ["en", "opend.home.hover-entry", 1],
  ["en", "opend.home.hover-layer", 0],
  ["en", "opend.home.hover-layer", 1],
  ["zh-CN", "opend.home.hover-entry", 0],
  ["zh-CN", "opend.home.hover-entry", 1],
  ["zh-CN", "opend.home.hover-layer", 0],
  ["zh-CN", "opend.home.hover-layer", 1],
] as const)("HST-001 %s %s opens distinct target for button %s", async (locale, placementKey, buttonIndex) => {
  const actual = await vi.importActual<typeof import("../../src/components/touchpoint-component")>("../../src/components/touchpoint-component");
  vi.mocked(touchpointComponent.verifyWebTouchpoint).mockImplementation(actual.verifyWebTouchpoint);
  useRealOverlay.current = true;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) { return { length: this.hidden || this.closest("[hidden]") ? 0 : 1 } as DOMRectList; });
  Object.defineProperty(navigator, "userActivation", { configurable: true, value: { isActive: true } });
  const digest = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
  const module = "export function mount() {}";
  const keys = ["opend.home.hover-entry", "opend.home.hover-layer"];
  const actionsFor = (key: string) => [
    { id: "primary", target: { kind: "https" as const, url: `https://primary.example.test/${key}/a` } },
    { id: "secondary", target: { kind: "https" as const, url: `https://secondary.example.test/${key}/b` } },
  ];
  const dualManifest = {
    formatVersion: 2 as const, runtimeKind: "web-component" as const, runtimeApiVersion: 1 as const,
    platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const, sdkVersion: "vela-touchpoint-sdk-v1" as const,
    contentLine: "HST-001 hover pair", resources: keys.map(key => `${key}.js`), images: [],
    placements: keys.map(key => ({ key, entry: `${key}.js`, resources: [], locales: [locale], requiredCapabilities: ["hover", "static-action"], staticActions: actionsFor(key) })),
  };
  const contentFor = (key: string) => ({ ...content(key), id: "hst001-pair", locale, manifest: dualManifest, manifestHash: digest(JSON.stringify(dualManifest)),
    entryPath: `${key}.js`, entryModule: module, entryDigest: digest(module), resources: [{ path: `${key}.js`, digest: digest(module), bytes: btoa(module) }] });
  // Validate the test fixture through the real immutable-content verifier.
  for (const key of keys) {
    const verified = await actual.verifyWebTouchpoint(contentFor(key) as Parameters<typeof actual.verifyWebTouchpoint>[0]);
    verified.dispose();
  }
  const callbacks = new Map<string, (id: string) => Promise<void>>();
  vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, _url, _digest, context, _resources, _actions, options) {
    callbacks.set(context.placementKey, options!.dispatchAction!);
    this.shadowRoot?.replaceChildren(document.createTextNode(context.placementKey));
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return Response.json({ ok: true });
    const key = url.includes("hover-entry") ? keys[0]! : keys[1]!;
    return Response.json(decision(key, {
      staticActions: actionsFor(key),
      content: contentFor(key),
    }));
  }));
  render(<I18nProvider initial={locale}><ProductionCampaignHover authenticated sessionSubject="hst001-hover" /></I18nProvider>);
  const root = await screen.findByTestId("cms-hover-overlay-root");
  const entry = root.querySelector("opend-touchpoint")!;
  await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
  fireEvent.pointerEnter(entry);
  await act(async () => { await vi.advanceTimersByTimeAsync(32); });
  await waitFor(() => expect(callbacks.has(placementKey)).toBe(true));
  const actions = actionsFor(placementKey);
  expect(actions[0]!.target.url).not.toBe(actions[1]!.target.url);
  // A successful layer CTA closes it, so each action uses a fresh presentation.
  const chosen = actions[buttonIndex]!;
  await act(async () => { await callbacks.get(placementKey)!(chosen.id); });
  expect(openExternalUrl.mock.calls).toEqual([[chosen.target.url]]);
});
