// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../../src/i18n";
import {
	TestCampaignModal, clearTestRuntimeSession, useTestRuntime,
	type TestCampaignPlacement, type TestDecision, type TestRuntimeSession,
} from "../../src/components/TestCampaignModal";
import * as component from "../../src/components/touchpoint-component";

vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () => ({ version: 2, client: { type: "desktop" } }),
}));
const epoch = Date.parse("2030-01-01T00:00:00Z");
const placements: TestCampaignPlacement[] = ["opend.home.account-badge", "opend.home.campaign-modal", "opend.home.hover-entry", "opend.home.hover-layer"];
const deployment = {
	id: "deployment-a", activityId: "activity-a", snapshotHash: "snapshot",
	snapshot: { contentVersionId: "content-a", manifestHash: "manifest", artifactHash: "artifact", placementKeys: placements },
};
const context = { deploymentId: deployment.id, scenario: "realtime" as const, updatedAt: new Date(epoch).toISOString() };
function decision(key: TestCampaignPlacement, locale: string): TestDecision {
	const capabilities = key === "opend.home.campaign-modal" ? ["close", "static-action"] : key === "opend.home.account-badge" ? ["static-action"] : ["hover", "static-action"];
	return {
		activityId: deployment.activityId, deploymentId: deployment.id, snapshotHash: deployment.snapshotHash,
		manifestHash: "manifest", artifactHash: "artifact", placementKey: key, requiredCapabilities: capabilities, staticActions: [],
		serverTime: new Date().toISOString(), authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		startsAt: new Date(epoch - 60_000).toISOString(), endsAt: new Date(epoch + 3_600_000).toISOString(),
		testContext: { ...context, scheduleState: "active" },
		content: {
			id: "content-a", placementKey: key, locale, manifestHash: "manifest", entryPath: key + ".js", entryDigest: "entry", entryModule: "export {}", resources: [],
			runtime: { kind: "web-component", apiVersion: 1, wrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1" }, buildIdentity: { fingerprint: "test" },
			manifest: { formatVersion: 2, runtimeKind: "web-component", runtimeApiVersion: 1, platformWrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1", contentLine: "test", resources: placements.map(p => p + ".js"), images: [], placements: placements.map(p => ({ key: p, entry: p + ".js", resources: [], locales: ["en", "en-US", "ja"], requiredCapabilities: p === "opend.home.campaign-modal" ? ["close", "static-action"] : p === "opend.home.account-badge" ? ["static-action"] : ["hover", "static-action"], staticActions: [] })) },
		},
	};
}
let latest: TestRuntimeSession | null;
let catalogReply: () => Promise<Response>;
let runtimeReply: (key: TestCampaignPlacement, locale: string) => Promise<Response>;
let fetchMock: ReturnType<typeof vi.fn>;
const catalogCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/deployments")).length;
const decisionCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).startsWith("/api/touchpoints/test-runtime?")).length;
function Probe() { latest = useTestRuntime(); return null; }
function Language() { const { setLocale } = useI18n(); return <button onClick={() => setLocale("ja")}>Japanese</button>; }
function Home({ home = true, owner = "account-a" }: { home?: boolean; owner?: string }) {
	return <I18nProvider initial="en"><Language /><Probe />{home && <TestCampaignModal authenticated sessionSubject={owner} />}</I18nProvider>;
}
async function advance(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
async function recover() {
	await act(async () => {
		window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus"));
		window.dispatchEvent(new Event("pageshow")); document.dispatchEvent(new Event("visibilitychange"));
	});
	await advance();
}
const failed = (kind: "network" | "5xx" | "timeout") => kind === "timeout" ? new Promise<Response>(() => {}) : kind === "network" ? Promise.reject(new TypeError("Failed to fetch")) : Promise.resolve(new Response(null, { status: 503 }));
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
	vi.setSystemTime(epoch); latest = null; localStorage.clear();
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
	vi.spyOn(component, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:test", resourceUrls: new Map(), dispose: vi.fn() } as never);
	vi.spyOn(component.OpenDesignTouchpointElement.prototype, "mount").mockResolvedValue();
	catalogReply = async () => Response.json({ deployments: [deployment] });
	runtimeReply = async (key, locale) => Response.json(decision(key, locale));
	fetchMock = vi.fn(async (input: string) => {
		const url = new URL(input, "http://localhost");
		if (url.pathname.endsWith("/deployments")) return catalogReply();
		if (url.pathname.endsWith("/context")) return Response.json(context);
		if (url.pathname.endsWith("/acceptances")) return Response.json({ id: "accepted" });
		if (url.pathname === "/api/touchpoints/test-runtime") return runtimeReply(url.searchParams.get("placementKey") as TestCampaignPlacement, url.searchParams.get("locale")!);
		throw new Error("Unexpected request " + input);
	});
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); clearTestRuntimeSession(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OPEND-3436 Test request recovery", () => {
	it.each(["network", "5xx", "timeout"] as const)("keeps directory polling after its first %s failure, recovers on cadence and deduplicates a recovery burst", async kind => {
		catalogReply = () => failed(kind);
		render(<Home />); await advance(15_000);
		expect(catalogCalls()).toBe(1); expect(decisionCalls()).toBe(0);
		await advance(60_000); expect(catalogCalls()).toBe(3); expect(decisionCalls()).toBe(0);
		catalogReply = async () => Response.json({ deployments: [deployment] });
		await recover(); expect(catalogCalls()).toBe(4); expect(decisionCalls()).toBe(4); expect(latest?.decisions.size).toBe(4);
		await advance(30_000); expect(catalogCalls()).toBe(5); expect(decisionCalls()).toBe(16);
	});
	it.each(["network", "5xx", "timeout"] as const)("keeps directory and decision timers after the initial decision %s failure and recovers without an event", async kind => {
		runtimeReply = () => failed(kind);
		render(<Home />); await advance(5_000);
		expect(decisionCalls()).toBe(4); expect(latest?.decisions.size ?? 0).toBe(0);
		const catalogs = catalogCalls(), decisions = decisionCalls(); await advance(60_000);
		expect(catalogCalls()).toBe(catalogs + 2); expect(decisionCalls()).toBeGreaterThan(decisions);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		await advance(35_000); expect(latest?.decisions.size).toBe(4);
	});
	it.each(["network", "5xx", "timeout"] as const)("keeps renewal authority only to its original expiry after %s and recovers on home remount", async kind => {
		const view = render(<Home />); await advance(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = () => failed(kind); await advance(45_000);
		expect(decisionCalls()).toBeGreaterThan(8); expect(latest?.decisions.size).toBe(4);
		const catalogs = catalogCalls(); await advance(14_999); expect(latest?.decisions.size).toBe(4);
		await advance(1); expect(latest?.decisions.size ?? 0).toBe(0);
		const decisions = decisionCalls(); await advance(60_000);
		expect(decisionCalls()).toBeGreaterThan(decisions); expect(catalogCalls()).toBeGreaterThan(catalogs);
		view.rerender(<Home home={false} />); await advance();
		runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		const remounted = decisionCalls();
		view.rerender(<Home />); await advance(); expect(decisionCalls()).toBe(remounted + 4); expect(latest?.decisions.size).toBe(4);
	});
	it("retains same-owner grants within their original window on failed remount, then hides exactly at expiry", async () => {
		const view = render(<Home />); await advance();
		view.rerender(<Home home={false} />); await advance(10_000);
		catalogReply = () => failed("network"); runtimeReply = () => failed("network");
		view.rerender(<Home />); await advance(); expect(latest?.decisions.size).toBe(4);
		const catalogs = catalogCalls(), decisions = decisionCalls();
		await advance(49_999); expect(latest?.decisions.size).toBe(4);
		await advance(1); expect(latest?.decisions.size ?? 0).toBe(0);
		expect(catalogCalls()).toBeGreaterThan(catalogs); expect(decisionCalls()).toBeGreaterThan(decisions);
		catalogReply = async () => Response.json({ deployments: [deployment] });
		runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		await advance(35_000); expect(latest?.decisions.size).toBe(4);
	});
	it("isolates failed recovery across account and language changes and never retains a withdrawn grant", async () => {
		const view = render(<Home />); await advance();
		runtimeReply = () => failed("network"); await advance(30_000);
		view.rerender(<Home owner="account-b" />); await advance(); expect(latest?.decisions.size ?? 0).toBe(0);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale)); await recover(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = () => failed("network"); fireEvent.click(screen.getByText("Japanese")); await advance(); expect(latest?.decisions.size ?? 0).toBe(0);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale)); await recover(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = async () => new Response(null, { status: 410 }); await recover(); expect(latest?.decisions.size ?? 0).toBe(0);
		view.rerender(<Home home={false} owner="account-b" />); await advance();
		catalogReply = () => failed("network"); view.rerender(<Home owner="account-b" />); await advance(); expect(latest?.decisions.size ?? 0).toBe(0);
	});
	it.each(["network", "timeout"] as const)("isolates a partial %s renewal while healthy siblings continue normal renewal", async kind => {
		render(<Home />); await advance();
		runtimeReply = async (key, locale) => key === "opend.home.account-badge" ? failed(kind) : Response.json(decision(key, locale));
		await advance(15_000); expect(decisionCalls()).toBe(8);
		expect(latest?.decisions.size).toBe(kind === "timeout" ? 4 : 3);
		await advance(55_000); expect(latest?.decisions.size).toBe(3);
		await advance(120_000); expect(latest?.decisions.size).toBe(3);
		expect(catalogCalls()).toBeGreaterThan(2); expect(decisionCalls()).toBeGreaterThan(8);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale)); await advance(35_000); expect(latest?.decisions.size).toBe(4);
	});
	it("retires equal-spaced remount authorizations at every original boundary while failed polls continue", async () => {
		runtimeReply = async (key, locale) => Response.json({ ...decision(key, locale), authorizationExpiresAt: new Date(epoch + 15_000 * (placements.indexOf(key) + 1)).toISOString() });
		const view = render(<Home />); await advance(10_000);
		view.rerender(<Home home={false} />); await advance();
		catalogReply = () => failed("network"); runtimeReply = () => failed("network"); view.rerender(<Home />); await advance();
		const requests = fetchMock.mock.calls.length;
		for (let index = 0; index < placements.length; index++) {
			await advance(index === 0 ? 4_999 : 14_999); expect(latest?.decisions.size).toBe(4 - index);
			await advance(1); expect(latest?.decisions.size ?? 0).toBe(3 - index);
		}
		expect(fetchMock.mock.calls.length).toBeGreaterThan(requests);
	});
	it.each(["network", "timeout"] as const)("shows nothing on %s while only half an atomic hover succeeds, keeps polling, and shows the pair once it clears", async kind => {
		catalogReply = async () => Response.json({ deployments: [{ ...deployment, snapshot: { ...deployment.snapshot, placementKeys: placements.slice(2) } }] });
		runtimeReply = async (key, locale) => key === "opend.home.hover-entry" ? failed(kind) : Response.json(decision(key, locale));
		render(<Home />); await advance(); await advance(60_000); expect(latest?.decisions.size ?? 0).toBe(0);
		expect(catalogCalls()).toBe(3); expect(decisionCalls()).toBeGreaterThan(2);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale)); await advance(35_000); expect(latest?.decisions.size).toBe(2);
	});
	it("keeps both chains polling while either fails and recovers each on cadence without events", async () => {
		render(<Home />); await advance();
		catalogReply = () => failed("network"); runtimeReply = () => failed("network"); await advance(30_000);
		const catalogs = catalogCalls(), decisions = decisionCalls();
		await advance(60_000); expect(catalogCalls()).toBe(catalogs + 2); expect(decisionCalls()).toBeGreaterThan(decisions);
		catalogReply = async () => Response.json({ deployments: [deployment] });
		const catalogRecovered = decisionCalls(); await advance(30_000); expect(decisionCalls()).toBeGreaterThan(catalogRecovered);
		catalogReply = () => failed("network"); runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		await advance(35_000); expect(latest?.decisions.size).toBe(4);
		catalogReply = async () => Response.json({ deployments: [deployment] });
		await advance(30_000);
		const recoveredCatalogs = catalogCalls(), allRecovered = decisionCalls();
		await advance(30_000); expect(catalogCalls()).toBe(recoveredCatalogs + 1); expect(decisionCalls()).toBe(allRecovered + 12);
	});
});

describe("D-POLL a single failed runtime request never stops Test polling", () => {
	const shifted = (key: TestCampaignPlacement, locale: string) => ({ ...decision(key, locale), startsAt: new Date(epoch - 30_000).toISOString() });
	const faults: Record<string, (key: TestCampaignPlacement, locale: string) => Promise<Response>> = {
		"connection failure": () => Promise.reject(new TypeError("Failed to fetch")),
		"503": async () => new Response(null, { status: 503 }),
		"401": async () => new Response(null, { status: 401 }),
		"deploymentId mismatch": async (key, locale) => Response.json({ ...decision(key, locale), deploymentId: "deployment-other" }),
		"activityId mismatch": async (key, locale) => Response.json({ ...decision(key, locale), activityId: "activity-other" }),
	};
	it.each(Object.keys(faults))("%s: keeps runtime and directory polling through the fault and restores the whole group within 35 s of it clearing, with no recovery event", async kind => {
		render(<Home />); await advance(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = faults[kind]!;
		// Several consecutive failed polls, long enough for the 60 s grant to lapse.
		await advance(65_000);
		expect(latest?.decisions.size ?? 0).toBe(0);
		const decisions = decisionCalls(), catalogs = catalogCalls();
		await advance(30_000);
		expect(decisionCalls()).toBeGreaterThanOrEqual(decisions + 8);
		expect(catalogCalls()).toBeGreaterThan(catalogs);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		const cleared = decisionCalls();
		await advance(35_000);
		expect(decisionCalls()).toBeGreaterThan(cleared);
		expect(latest?.decisions.size).toBe(4);
	});
	it("keeps the test-deployments list polling after its own failure and after a runtime failure", async () => {
		render(<Home />); await advance(); const first = catalogCalls();
		catalogReply = () => Promise.reject(new TypeError("Failed to fetch"));
		runtimeReply = () => Promise.reject(new TypeError("Failed to fetch"));
		await advance(90_000); expect(catalogCalls()).toBe(first + 3);
		catalogReply = async () => Response.json({ deployments: [deployment] });
		runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		await advance(35_000); expect(catalogCalls()).toBeGreaterThan(first + 3); expect(latest?.decisions.size).toBe(4);
	});
	it("window-bounds mismatch (changed startsAt) discards one round, never stops polling, and each matching round restores the group", async () => {
		render(<Home />); await advance(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = async (key, locale) => Response.json(shifted(key, locale));
		await advance(10_000); expect(latest?.decisions.size ?? 0).toBe(0);
		await advance(10_000); expect(latest?.decisions.size).toBe(4);
		expect(latest?.decisions.get("opend.home.campaign-modal")?.startsAt).toBe(new Date(epoch - 30_000).toISOString());
		await advance(30_000); expect(latest?.decisions.size).toBe(4);
		runtimeReply = async (key, locale) => Response.json(decision(key, locale));
		const reverted = decisionCalls();
		await advance(10_000); expect(latest?.decisions.size ?? 0).toBe(0);
		await advance(25_000); expect(decisionCalls()).toBeGreaterThan(reverted); expect(latest?.decisions.size).toBe(4);
		expect(latest?.decisions.get("opend.home.campaign-modal")?.startsAt).toBe(new Date(epoch - 60_000).toISOString());
	});
});


describe("D-STALE rejects inconsistent actions without retaining old content", () => {
	const declaredActions = [{ id: "primary", target: { kind: "https" as const, url: "https://example.test/declared" } }];
	const changedActions = [{ id: "primary", target: { kind: "https" as const, url: "https://example.test/undeclared" } }];
	function matchingDecision(key: TestCampaignPlacement, locale: string): TestDecision {
		const value = decision(key, locale);
		return { ...value, staticActions: declaredActions, content: { ...value.content,
			manifest: { ...value.content.manifest, placements: value.content.manifest.placements.map(p => ({ ...p, staticActions: declaredActions })) },
		} };
	}
	it.each(["opend.home.hover-entry", "opend.home.hover-layer", "opend.home.campaign-modal", "opend.home.account-badge"] as const)("%s mismatch immediately clears the whole session and recovers on cadence", async faultyPlacement => {
		runtimeReply = async (key, locale) => Response.json(matchingDecision(key, locale));
		render(<Home />); await advance(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = async (key, locale) => Response.json({ ...matchingDecision(key, locale),
			...(key === faultyPlacement ? { staticActions: changedActions } : {}),
		});
		await advance(10_000);
		// The original grant still has 50 s left: rejection must clear it now.
		expect(latest?.decisions.size ?? 0).toBe(0);
		const calls = decisionCalls();
		await advance(20_000);
		expect(latest?.decisions.size ?? 0).toBe(0);
		expect(decisionCalls()).toBeGreaterThan(calls);
		runtimeReply = async (key, locale) => Response.json(matchingDecision(key, locale));
		await advance(10_000);
		expect(latest?.decisions.size).toBe(4);
	});
	it("rejects before a hanging sibling settles and does not resurrect retained content on remount", async () => {
		runtimeReply = async (key, locale) => Response.json(matchingDecision(key, locale));
		const view = render(<Home />); await advance(); expect(latest?.decisions.size).toBe(4);
		runtimeReply = (key, locale) => key === "opend.home.hover-layer"
			? Promise.resolve(Response.json({ ...matchingDecision(key, locale), staticActions: changedActions }))
			: new Promise<Response>(() => {});
		await advance(10_000);
		expect(latest?.decisions.size ?? 0).toBe(0);
		view.rerender(<Home home={false} />); await advance();
		view.rerender(<Home />); await advance();
		expect(latest?.decisions.size ?? 0).toBe(0);
		runtimeReply = async (key, locale) => Response.json(matchingDecision(key, locale));
		await advance(35_000);
		expect(latest?.decisions.size).toBe(4);
	});
});
