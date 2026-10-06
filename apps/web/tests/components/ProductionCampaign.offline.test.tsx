// @vitest-environment jsdom
//
// OPEND-3436 at the three production placements. The hook-level cases pin the
// scheduling rules; these pin that all three surfaces are actually wired to
// them, because "we shipped it for the modal" is the shape this regresses in.
//
// Each placement gets the same story: a live decision mounts it, the runtime
// then goes away, the daemon answers the next request from its own cache with
// `authorizationExpiresAt` moved out to `endsAt`, and the placement is still
// there long after the sixty-second authorization it was issued would have
// retired it — with no further requests being made.

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getOpenDesignHostMock, verifiedDispose } = vi.hoisted(() => ({
	getOpenDesignHostMock: vi.fn(),
	verifiedDispose: vi.fn(),
}));
vi.mock("@open-design/host", () => ({ getOpenDesignHost: getOpenDesignHostMock }));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: vi.fn(async () => true) }));
vi.mock("../../src/components/HoverTouchpointOverlay", () => ({
	HoverTouchpointOverlay: (props: { entry?: { id?: string } }) => (
		<div data-testid="production-hover-overlay">{props.entry?.id}</div>
	),
}));
vi.mock("../../src/components/touchpoint-component", async (importOriginal) => ({
	...(await importOriginal<typeof import("../../src/components/touchpoint-component")>()),
	verifyWebTouchpoint: vi.fn(async (entry: { id: string }) => ({
		entryUrl: `blob:${entry.id}`,
		resourceUrls: new Map<string, string>(),
		dispose: verifiedDispose,
	})),
	webTouchpointContext: vi.fn((entry: { id: string; placementKey: string; locale: string }) => ({
		instanceId: `instance-${entry.id}`,
		contentVersionId: entry.id,
		placementKey: entry.placementKey,
		locale: entry.locale,
	})),
}));

import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";
import { SERVER_FAULT_HEARTBEAT_MS } from "../../src/components/touchpoint-lifecycle";

const T0 = "2030-01-01T00:00:00.000Z";
const at = (offsetMs: number) => new Date(Date.parse(T0) + offsetMs).toISOString();

const content = (placementKey: string, capabilities: string[]) => ({
	id: `version-${placementKey}`,
	placementKey,
	locale: "en-US",
	manifest: {
		formatVersion: 2,
		runtimeKind: "web-component",
		runtimeApiVersion: 1,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1",
		sdkVersion: "vela-touchpoint-sdk-v1",
		contentLine: "production",
		placements: [
			{
				key: placementKey,
				entry: "component.js",
				resources: [],
				locales: ["en-US"],
				requiredCapabilities: capabilities,
				staticActions: [],
			},
		],
		resources: ["component.js"],
		images: [],
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

/**
 * A live decision: authorized for sixty seconds, inside a five-hour activity.
 * The gap between those two numbers is what every case here is about.
 */
const live = (placementKey: string, capabilities: string[] = []) => ({
	activityId: "activity-1",
	deploymentId: "deployment-1",
	touchpointDecisionId: `decision-${placementKey}`,
	placementKey,
	requiredCapabilities: capabilities,
	staticActions: [],
	content: content(placementKey, capabilities),
	serverTime: T0,
	startsAt: at(-60_000),
	endsAt: at(5 * 3_600_000),
	authorizationExpiresAt: at(60_000),
});

/**
 * The same decision as the daemon replays it after the runtime went away:
 * `serverTime` moved to now, `authorizationExpiresAt` moved out to `endsAt`,
 * and the marker that tells this client to stop asking.
 */
const replayed = (placementKey: string, capabilities: string[] = [], elapsedMs = 30_000) => {
	const decision = live(placementKey, capabilities);
	return {
		...decision,
		serverTime: at(elapsedMs),
		authorizationExpiresAt: decision.endsAt,
		offlineReplay: {
			reason: "upstream_unreachable",
			cachedServerTime: T0,
			effectiveServerTime: at(elapsedMs),
		},
	};
};

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

/** Routes one fetch to whichever placement it asked about. */
const router = (bodies: Record<string, unknown>) =>
	vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
		if (init?.method === "POST") return Promise.resolve(new Response("{}", { status: 200 }));
		const placementKey = new URL(String(input), "http://localhost").searchParams.get("placementKey");
		const body = placementKey ? bodies[placementKey] : undefined;
		return Promise.resolve(
			body ? json(body) : new Response(JSON.stringify({ error: "no_decision" }), { status: 404 }),
		);
	});

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	vi.setSystemTime(new Date(T0));
	getOpenDesignHostMock.mockReturnValue({ client: { type: "desktop", osLocale: "en-US" } });
	vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (
		this: OpenDesignTouchpointElement,
	) {
		this.shadowRoot?.replaceChildren(document.createTextNode("campaign"));
	});
	vi.spyOn(OpenDesignTouchpointElement.prototype, "dispose").mockResolvedValue();
	localStorage.clear();
});
afterEach(() => {
	cleanup();
	getOpenDesignHostMock.mockReset();
	verifiedDispose.mockClear();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
	localStorage.clear();
});

/** Past the original authorization, past four poll intervals. */
const wellPastTheAuthorization = async () => {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(120_000);
	});
};

describe("a cache-replayed activity keeps every production placement up", () => {
	it("account badge", async () => {
		const fetchMock = router({ "opend.home.account-badge": live("opend.home.account-badge") });
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignBadge authenticated sessionSubject="account-a" />);
		await screen.findByTestId("production-campaign-badge");

		fetchMock.mockImplementation(
			router({ "opend.home.account-badge": replayed("opend.home.account-badge") }),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		const afterReplay = fetchMock.mock.calls.length;
		await wellPastTheAuthorization();
		expect(screen.getByTestId("production-campaign-badge")).toBeTruthy();
		// Nothing asked again: the replay is what put this client to sleep.
		expect(fetchMock.mock.calls.length).toBe(afterReplay);
	});

	it("campaign modal", async () => {
		const fetchMock = router({ "opend.home.campaign-modal": live("opend.home.campaign-modal") });
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await screen.findByRole("dialog", { name: "Campaign" });

		fetchMock.mockImplementation(
			router({ "opend.home.campaign-modal": replayed("opend.home.campaign-modal") }),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		const afterReplay = fetchMock.mock.calls.length;
		await wellPastTheAuthorization();
		expect(screen.getByRole("dialog", { name: "Campaign" })).toBeTruthy();
		expect(fetchMock.mock.calls.length).toBe(afterReplay);
	});

	it("hover entry and layer", async () => {
		const capabilities = ["hover", "static-action"];
		const bodies = {
			"opend.home.hover-entry": live("opend.home.hover-entry", capabilities),
			"opend.home.hover-layer": live("opend.home.hover-layer", capabilities),
		};
		const fetchMock = router(bodies);
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		await screen.findByTestId("production-hover-overlay");

		fetchMock.mockImplementation(
			router({
				"opend.home.hover-entry": replayed("opend.home.hover-entry", capabilities),
				"opend.home.hover-layer": replayed("opend.home.hover-layer", capabilities),
			}),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		const afterReplay = fetchMock.mock.calls.length;
		await wellPastTheAuthorization();
		expect(screen.getByTestId("production-hover-overlay")).toBeTruthy();
		expect(fetchMock.mock.calls.length).toBe(afterReplay);
	});

	// AC4, as a PRESERVATION guard rather than a new behaviour: the impression
	// gate that stops a dismissed modal re-opening already existed and is not
	// changed by this ticket. It is pinned here because offline replay is the
	// first thing that makes a decision which LOOKS like a fresh offer arrive
	// without anyone having asked the server — exactly the input that would
	// expose a gate keyed on the response instead of on the device record. This
	// case is green before the fallback wiring as well as after it; that is the
	// point of it.
	it("does not re-open a modal this device already saw, even offline after a restart", async () => {
		const modal = live("opend.home.campaign-modal");
		const fetchMock = router({ "opend.home.campaign-modal": modal });
		vi.stubGlobal("fetch", fetchMock);
		const shown = render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await screen.findByRole("dialog", { name: "Campaign" });
		// Presented and seen: the host reports a box, so the impression is recorded.
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(
			Object.assign([new DOMRect(0, 0, 100, 100)], { item: () => null }),
		);
		document.dispatchEvent(new Event("visibilitychange"));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(32);
		});
		await waitFor(() =>
			expect(
				Object.keys(localStorage).some((key) => key.startsWith("touchpoint-displayed:")),
			).toBe(true),
		);
		shown.unmount();

		// Restart, still inside the activity, still with no network behind the
		// daemon. The badge may come back; the modal may not re-open by itself.
		fetchMock.mockImplementation(
			router({ "opend.home.campaign-modal": replayed("opend.home.campaign-modal") }),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(120_000);
		});
		expect(screen.queryByRole("dialog", { name: "Campaign" })).toBeNull();
	});
});

// The case the whole fallback bargain rests on, driven through the real
// loader: daemon HTTP 200 in, revocation out, and not one browser event in
// between.
//
// The bargain OPEND-3436 struck is "revocation depends on being connected:
// clean up as soon as a recovery check learns about it". The trap is that the
// browser IS connected for the whole of this story. It talks to its local
// daemon and gets a 200 every time it asks; what is unreachable is the runtime
// BEHIND the daemon, which this browser cannot observe at all. So
// `navigator.onLine` never goes false and `online` never fires; the user is
// sitting on the home page where the activity is shown, so `focus`,
// `pageshow` and `visibilitychange` do not fire either. No event in this case
// is not an omission — it is the case.
//
// Which means: if the client does not ask on a clock, nothing else will ever
// ask, and the pulled activity stays on screen until `endsAt` — here five
// hours away, and in production a schedule that may run for years.
describe("a withdrawal reaches a screen only the daemon's cache is feeding", () => {
	const REVOKED = {
		error: "production_runtime_revoked",
		receipt: {
			touchpointDecisionId: "decision-opend.home.campaign-modal",
			deploymentId: "deployment-1",
			activityId: "activity-1",
			contentVersionId: "version-opend.home.campaign-modal",
		},
	};
	/** Decision requests only; delivery beacons are POSTs and are not asking anything. */
	const asked = (fetchMock: ReturnType<typeof router>) =>
		fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== "POST")
			.length;

	it("asks on its own clock, because nothing else in this story ever will", async () => {
		const fetchMock = router({ "opend.home.campaign-modal": live("opend.home.campaign-modal") });
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await screen.findByRole("dialog", { name: "Campaign" });

		// The runtime goes away behind the daemon. The daemon answers 200 from
		// its own cache, re-timed to the end of the activity — five hours out.
		fetchMock.mockImplementation(
			router({ "opend.home.campaign-modal": replayed("opend.home.campaign-modal") }),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		const afterReplay = asked(fetchMock);

		// Two minutes of the bargain as it stands: the poll is down and the
		// activity is up. This is the behaviour the ticket wanted and it is
		// unchanged.
		await wellPastTheAuthorization();
		expect(asked(fetchMock)).toBe(afterReplay);
		expect(screen.getByRole("dialog", { name: "Campaign" })).toBeTruthy();

		// The operator pulls the activity. The runtime is answering again, but
		// no event has announced that and none can: nothing is dispatched here.
		fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) =>
			Promise.resolve(
				init?.method === "POST"
					? new Response("{}", { status: 200 })
					: new Response(JSON.stringify(REVOKED), { status: 410 }),
			),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(SERVER_FAULT_HEARTBEAT_MS);
		});

		// The withdrawal was asked for, and acted on. Without the heartbeat the
		// activity would sit here until `endsAt`.
		expect(asked(fetchMock)).toBeGreaterThan(afterReplay);
		await waitFor(() => expect(screen.queryByRole("dialog", { name: "Campaign" })).toBeNull());
	});
});
