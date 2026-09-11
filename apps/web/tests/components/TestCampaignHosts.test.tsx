// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type HostGlobal = typeof globalThis & { __cmsTestHost?: unknown };
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () => (globalThis as HostGlobal).__cmsTestHost,
}));

import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import {
	setTestRuntimeSession,
	clearTestRuntimeSession,
	type TestDecision,
	type TestRuntimeSession,
} from "../../src/components/TestCampaignModal";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";

const placements = [
	"opend.home.account-badge",
	"opend.home.campaign-modal",
	"opend.home.hover-entry",
	"opend.home.hover-layer",
] as const;
const context = {
	deploymentId: "deployment-four",
	testerMemberId: "member-four",
	scenario: "active" as const,
	simulatedAt: "2030-01-01T00:00:00.000Z",
	updatedAt: "2030-01-01T00:00:00.000Z",
};
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
	beforeEach(() => {
		vi.stubEnv("NEXT_PUBLIC_CMS_HOST_RELEASE", `sha256:${"a".repeat(64)}`);
		document.documentElement.lang = "zh-CN";
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		(globalThis as HostGlobal).__cmsTestHost = {
			version: 2,
			client: { type: "desktop", osLocale: "en-CN" },
		};
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-host",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(async function (this: OpenDesignTouchpointElement) {
			this.shadowRoot?.replaceChildren(document.createTextNode("Test host content"));
		});
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({ length: 1, item: () => null } as unknown as DOMRectList);
	});
	afterEach(() => {
		clearTestRuntimeSession();
		cleanup();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		delete (globalThis as HostGlobal).__cmsTestHost;
	});
	it("keeps a production hover pair mounted across unrelated parent renders",async()=>{
		vi.stubGlobal("fetch",async(url:string)=>{
			const placement=new URL(url,"http://localhost").searchParams.get("placementKey") as (typeof placements)[number];
			return new Response(JSON.stringify({...decision(placement),
				touchpointDecisionId:`decision-${placement}`,
				serverTime:new Date().toISOString(),
				authorizationExpiresAt:new Date(Date.now()+60_000).toISOString(),
				endsAt:new Date(Date.now()+300_000).toISOString(),
			}));
		});
		const {rerender}=render(<ProductionCampaignHover authenticated sessionSubject="stable-user" />);
		await screen.findByTestId("cms-hover-overlay-root");
		const entry=screen.getByTestId("cms-hover-overlay-root").querySelector("opend-touchpoint");
		await waitFor(()=>expect(entry).not.toHaveAttribute("hidden"));
		rerender(<ProductionCampaignHover authenticated sessionSubject="stable-user" />);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(2);
	});

	it("uses the selected Test session at modal, badge, and paired hover hosts without production reads", async () => {
		const decisions = new Map(placements.map((placementKey) => [placementKey, decision(placementKey)]));
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
		};
		setTestRuntimeSession(session);
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url.includes("acceptances")) return new Response(JSON.stringify({ id: "acceptance" }), { status: 201 });
			return new Response(JSON.stringify({ error: "production_read_forbidden" }), { status: 404 });
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
		await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).length).toBe(3));
		const entry = screen.getByTestId("cms-hover-overlay-root").querySelector("opend-touchpoint");
		expect(entry).not.toBeNull();
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		fireEvent.pointerEnter(entry!);
		await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).length).toBe(4));
		const reports = fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).map(([, init]) => JSON.parse(String(init?.body)));
		expect(reports.map((report) => report.placementKey).sort()).toEqual([...placements].sort());
		for (const report of reports) {
			expect(report.hostCompatibility).toMatchObject({
				version: 1,
				snapshotHash: session.deployment.snapshotHash,
				hostFamily: "open-design-desktop",
				platform: "desktop",
				hostRelease: `sha256:${"a".repeat(64)}`,
				runtime: {kind: "web-component", apiVersion: 1, wrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1"},
			});
			expect(report.hostCompatibility.capabilities).toEqual(decisions.get(report.placementKey)?.requiredCapabilities);
		}
		expect(fetchMock.mock.calls.some(([url]) => url.includes("production-runtime"))).toBe(false);
		expect(screen.getByTestId("campaign-custom-element").querySelector("opend-touchpoint")).not.toBeNull();
		expect(screen.getByTestId("production-campaign-badge").querySelector("opend-touchpoint")).not.toBeNull();
	});
});
