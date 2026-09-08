// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { overlaySpy, diagnosticSpy } = vi.hoisted(() => ({
	overlaySpy: vi.fn(() => <div data-testid="production-hover-overlay" />),
	diagnosticSpy: vi.fn(),
}));
type HostGlobal = typeof globalThis & { __productionHoverHost?: unknown };
vi.mock("@open-design/host", () => ({
	getOpenDesignHost: () => (globalThis as HostGlobal).__productionHoverHost,
}));
vi.mock("../../src/components/HoverTouchpointOverlay", () => ({
	HoverTouchpointOverlay: overlaySpy,
}));
vi.mock(
	"../../src/components/touchpoint-component",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("../../src/components/touchpoint-component")
		>()),
		emitWebTouchpointDiagnostic: diagnosticSpy,
	}),
);

import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";

const content = (placementKey: string) => ({
	id: `version-${placementKey}`,
	placementKey,
	locale: "en-US",
	manifest: {
		placements: [
			{
				key: placementKey,
				requiredCapabilities: ["static-action"],
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
	requiredCapabilities: ["static-action"],
	staticActions: [
		{ id: "learn", target: { kind: "https", url: "https://example.com" } },
	],
	...overrides,
});

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
			requiredCapabilities: ["static-action"],
			staticActions: [
				{ id: "learn", target: { kind: "https", url: "https://example.com" } },
			],
		},
		{
			key: "opend.home.hover-layer",
			entry: "hover-layer.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["static-action"],
			staticActions: [
				{ id: "learn", target: { kind: "https", url: "https://example.com" } },
			],
		},
	],
	resources: ["modal.js", "badge.js", "hover-entry.js", "hover-layer.js"],
	images: [],
};

describe("ProductionCampaignHover", () => {
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
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/touchpoints/production-runtime?placementKey=opend.home.hover-entry&locale=en-US",
			expect.objectContaining({ cache: "no-store" }),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/touchpoints/production-runtime?placementKey=opend.home.hover-layer&locale=en-US",
			expect.objectContaining({ cache: "no-store" }),
		);
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
});
