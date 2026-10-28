// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { overlaySpy, diagnosticSpy, useRealOverlay, verifiedDisposes } = vi.hoisted(() => ({
	overlaySpy: vi.fn(({ entry }: { entry?: { locale?: string } }) => <div data-testid="production-hover-overlay">{entry?.locale}</div>),
	diagnosticSpy: vi.fn(),
	useRealOverlay: { current: false },
	verifiedDisposes: vi.fn(),
}));
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

import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { I18nProvider, useI18n } from "../../src/i18n";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { clearTestRuntimeSession, setTestRuntimeSession, type TestRuntimeSession } from "../../src/components/TestCampaignModal";

const content = (placementKey: string) => ({
	id: `version-${placementKey}`,
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
	vi.useFakeTimers({ shouldAdvanceTime: true });
	vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
	(globalThis as HostGlobal).__productionHoverHost = {
		client: { type: "desktop", osLocale: "en-US" },
	};
});
afterEach(() => {
	cleanup();
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
		await waitFor(() => expect(entry?.shadowRoot?.querySelector("img")).toHaveAttribute("src", "blob:version-opend.home.hover-entry"));
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
		expect(entryImage).toHaveAttribute("src", "blob:version-opend.home.hover-entry");
		expect(layerImage).toHaveAttribute("src", "blob:version-opend.home.hover-layer");
		fireEvent.pointerEnter(entry);
		await waitFor(() => expect(entry).toHaveAttribute("aria-expanded", "true"));
		const initialImages = [entryImage, layerImage];
		for (let refresh = 0; refresh < 2; refresh += 1) {
			await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
			rerender(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
			await act(async () => {});
			await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes((refresh + 2) * 2));
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
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		await act(async () => {});
		expect(requests.some((url) => url.includes("activeDecisionId=decision-opend.home.hover-entry-1"))).toBe(true);
		expect(Array.from(root.querySelectorAll("opend-touchpoint"))).toEqual([entry, layer]);
		expect(mount).toHaveBeenCalledTimes(2);
		rects.mockRestore();
	});

	// The hover key was the one that needed arguing rather than deleting. It
	// carried the ENTRY's content id and both decision ids — the layer's content
	// id was never in it, so the layer's identity rode on its credential. Once
	// the credentials leave the key, a layer whose content is swapped underneath
	// has to be caught by the layer's own content id, or the pair keeps showing
	// content the server has replaced. (The claim that the two content ids are
	// always equal is a server-side property this side cannot check — and these
	// fixtures, which give each placement its own version, assume they are not.)
	it("still remounts the pair when only the layer's content version changes", async () => {
		useRealOverlay.current = true;
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		const rects = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
		const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement, entryUrl: string) {
			const image = document.createElement("img");
			image.src = entryUrl;
			this.shadowRoot?.replaceChildren(image);
		});
		let layerVersion = "version-opend.home.hover-layer";
		const longLived = (placementKey: string) => {
			const now = Date.now();
			const base = decision(placementKey, {
				serverTime: new Date(now).toISOString(),
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
			});
			return placementKey === "opend.home.hover-layer"
				? { ...base, content: { ...base.content, id: layerVersion } }
				: base;
		};
		const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(longLived(url.includes("hover-entry") ? "opend.home.hover-entry" : "opend.home.hover-layer")), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const root = await screen.findByTestId("cms-hover-overlay-root");
		const [entry, layer] = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"));
		if (!entry || !layer) throw new Error("expected paired hover elements");
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(2));
		layerVersion = "version-opend.home.hover-layer-2";
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		await act(async () => {});
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(4));
		// The mocked verifier names each Blob after the content it verified, so
		// the layer's rendered bytes say which version actually reached the
		// screen. Stale content here is the whole risk of dropping the layer's
		// credential from the key without naming its content version.
		const rebuiltLayer = Array.from(root.querySelectorAll<OpenDesignTouchpointElement>("opend-touchpoint"))[1];
		expect(rebuiltLayer?.shadowRoot?.querySelector("img")).toHaveAttribute(
			"src",
			"blob:version-opend.home.hover-layer-2",
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

		await vi.advanceTimersByTimeAsync(30_000);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
		await waitFor(() =>
			expect(screen.queryByTestId("production-hover-overlay")).toBeNull(),
		);
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
			await act(async () => { await vi.advanceTimersByTimeAsync(29_999); });
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
				await vi.advanceTimersByTimeAsync(15_000);
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
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
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
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		const next = (key: string) => new Response(JSON.stringify(decision(key, {
			deploymentId: "deployment-2", content: { ...content(key), id: `next-${key}` },
		})), { status: 200 });
		await act(async () => { resolvers[0]!(next("opend.home.hover-entry")); });
		expect(latestEntry()).toBe("version-opend.home.hover-entry");
		await act(async () => { resolvers[1]!(next("opend.home.hover-layer")); });
		expect(latestEntry()).toBe("next-opend.home.hover-entry");
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
				...content(key), id: fresh ? `fresh-${key}` : `version-${key}`,
				locale: url.includes("locale=zh-CN") ? "zh-CN" : "en-US",
			} })), { status: 200 }));
		});
		vi.stubGlobal("fetch", fetchMock);
		const element = (subject: string) => <I18nProvider initial="en"><LocaleSwitch /><ProductionCampaignHover authenticated sessionSubject={subject} /></I18nProvider>;
		let view!: ReturnType<typeof render>;
		await act(async () => { view = render(element("account-a")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
		expect((overlaySpy.mock.lastCall?.[0] as { entry: { id: string } }).entry.id).toBe("version-opend.home.hover-entry");
		await act(async () => {
			if (change === "account") view.rerender(element("account-b"));
			else screen.getByRole("button", { name: "Switch locale" }).click();
		});
		expect(pendingSignal.aborted).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(6);
		const mounted = screen.getByTestId("production-hover-overlay");
		expect((overlaySpy.mock.lastCall?.[0] as { entry: { id: string } }).entry.id).toBe("fresh-opend.home.hover-entry");
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
  it('probes five minutes after asymmetric timeout and resumes normal thirty-second renewal', async () => {
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
          activityId: 'activity-1', deploymentId: 'other', contentVersionId: `version-${placement}`, touchpointDecisionId: `decision-${placement}`,
        },
      }), { status: 410 }));
      signal = init.signal as AbortSignal;
      return new Promise<Response>(resolve => { late = resolve; });
    });
    vi.stubGlobal('fetch', fetchMock);
    const step = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
    await act(async () => { render(<ProductionCampaignHover authenticated sessionSubject="A" />); });
    expect(screen.getByTestId('production-hover-overlay')).toBeTruthy();
    mode = 'pending'; await step(30_000); await step(15_000);
    expect(signal.aborted).toBe(true);
    mode = 'fresh'; await act(async () => { late(fresh('opend.home.hover-layer')); });
    await step(299_999); expect(fetchMock).toHaveBeenCalledTimes(4);
    await step(1); expect(fetchMock).toHaveBeenCalledTimes(6);
    await step(30_000); expect(fetchMock).toHaveBeenCalledTimes(8);
    expect(screen.getByTestId('production-hover-overlay')).toBeTruthy();
  });
});
