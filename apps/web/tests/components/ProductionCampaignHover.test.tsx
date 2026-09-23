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
		setTestRuntimeSession({ decisions: new Map([["opend.home.hover-entry", decision("opend.home.hover-entry")], ["opend.home.hover-layer", decision("opend.home.hover-layer")]]), isAuthorized: () => true } as unknown as TestRuntimeSession);
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
				result: "match" | "mismatch" | "layer",
				value: typeof entry,
				other: typeof layer,
			) =>
				result === "match"
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
