// @vitest-environment jsdom
// Intentionally red acceptance specs against main. No production fixes here.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { TouchpointSdk } from "@open-design/contracts";

const external = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () => ({ version: 2, client: { type: "desktop", osLocale: "en-US" } }),
}));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: external }));
vi.mock("../../src/i18n", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));

import { ProductionCampaignModal, dispatchProductionCampaignAction } from "../../src/components/ProductionCampaignModal";
import { clearTestRuntimeSession, setTestRuntimeSession, type TestDecision } from "../../src/components/TestCampaignModal";
import { HoverTouchpointOverlay } from "../../src/components/HoverTouchpointOverlay";
import * as component from "../../src/components/touchpoint-component";

const placement = "opend.home.campaign-modal";
const actions = [{ id: "try", target: { kind: "https" as const, url: "https://example.com/try" } }];
function content(key = placement): component.WebTouchpointContent {
	return {
		id: `content:${key}`, placementKey: key, locale: "en-US",
		manifestHash: "sha256:fixture", entryPath: "component.js", entryDigest: `sha256:${key}`,
		entryModule: "", resources: [], buildIdentity: { fingerprint: "fixture" },
		runtime: { kind: "web-component", apiVersion: 1, wrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1" },
		manifest: {
			formatVersion: 2, runtimeKind: "web-component", runtimeApiVersion: 1,
			platformWrapperVersion: "vela-touchpoint-wrapper-v1", sdkVersion: "vela-touchpoint-sdk-v1",
			contentLine: "fixture", resources: ["component.js"], images: [],
			placements: [{ key: key as typeof placement, entry: "component.js", resources: [], locales: ["en-US"], requiredCapabilities: ["close", "static-action"], staticActions: actions }],
		},
	};
}
function decision() {
	return {
		activityId: "activity", deploymentId: "deployment", touchpointDecisionId: "decision",
		placementKey: placement, content: content(), staticActions: actions,
		requiredCapabilities: ["close", "static-action"], serverTime: new Date().toISOString(),
		authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
		endsAt: new Date(Date.now() + 300_000).toISOString(),
	};
}
function authorizeTest() {
	const value: TestDecision = {
		...decision(), snapshotHash: "snapshot", manifestHash: "sha256:fixture", artifactHash: "artifact",
		startsAt: new Date(Date.now() - 60_000).toISOString(),
		testContext: { deploymentId: "deployment", scenario: "realtime", updatedAt: new Date().toISOString(), scheduleState: "active" },
	};
	setTestRuntimeSession({
		selectionKey: "selection", context: value.testContext, isAuthorized: () => true,
		deployment: { id: "deployment", activityId: "activity", snapshotHash: "snapshot", snapshot: { contentVersionId: value.content.id, manifestHash: "sha256:fixture", artifactHash: "artifact", placementKeys: [placement] } },
		decisions: new Map([[placement, value]]),
	});
}

let sdk: TouchpointSdk;
let clicked: Promise<void> | undefined;
let diagnostics: string[];
const captureDiagnostic = (event: Event) => diagnostics.push((event as CustomEvent).detail.code);
let verify: MockInstance<typeof component.verifyWebTouchpoint>;
let importModule: MockInstance<typeof component.webTouchpointModuleCache.import>;

beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	clearTestRuntimeSession();
	external.mockReset().mockResolvedValue(true);
	clicked = undefined;
	diagnostics = [];
	document.addEventListener("touchpointdiagnostic", captureDiagnostic);
	vi.stubGlobal("navigator", Object.create(navigator, {
		userActivation: { configurable: true, get: () => ({ isActive: true, hasBeenActive: true }) },
	}));
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
		if (String(input).startsWith("/api/touchpoints/production-runtime?")) return new Response(JSON.stringify(decision()));
		if (String(input).endsWith("/events") || String(input).endsWith("/acceptances")) return new Response("{}");
		throw new Error(`Unexpected test fetch: ${String(input)}`);
	}));
	// Only byte acquisition/import is stubbed. Real React hosts, lifecycle, custom
	// element, ShadowRoot, SDK and action adapters execute. Fixture CTA dispatches
	// its action only, matching the host-owned dismissal acceptance requirement.
	verify = vi.spyOn(component, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:fixture", resourceUrls: new Map(), dispose: vi.fn() });
	importModule = vi.spyOn(component.webTouchpointModuleCache, "import").mockResolvedValue({
		mount(root, _context, nextSdk) {
			sdk = nextSdk;
			const button = document.createElement("button");
			button.textContent = "立即体验";
			button.onclick = () => { clicked = nextSdk.dispatchAction("try"); };
			root.append(button);
			return button;
		},
	});
});

afterEach(() => {
	cleanup();
	clearTestRuntimeSession();
	document.removeEventListener("touchpointdiagnostic", captureDiagnostic);
	localStorage.clear();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function show(mode: "Production" | "Test" = "Production") {
	if (mode === "Test") authorizeTest();
	await act(async () => { render(<ProductionCampaignModal authenticated sessionSubject="repro-user" />); });
}
function mountedButton() {
	const button = document.querySelector("opend-touchpoint")?.shadowRoot?.querySelector("button");
	expect(button).toBeInstanceOf(HTMLButtonElement);
	return button as HTMLButtonElement;
}

describe("OPEND-3165", () => {
	it.each(["Production", "Test"] as const)("%s closes the modal after the CTA successfully navigates", async (mode) => {
		await show(mode);
		await act(async () => { fireEvent.click(mountedButton()); await clicked; });
		expect(external).toHaveBeenCalledWith("https://example.com/try");
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it("Production reports a refused external navigation as rejected", async () => {
		external.mockResolvedValue(false);
		const accepted = await dispatchProductionCampaignAction(decision(), "try", 1, () => 1, Date.now() + 60_000);
		expect(external).toHaveBeenCalledOnce();
		expect(accepted).toBe(false);
	});
	it.each(["Production", "Test"] as const)("%s rejects a CTA without user activation and retains the modal", async (mode) => {
		await show(mode);
		vi.spyOn(navigator, "userActivation", "get").mockReturnValue({ isActive: false, hasBeenActive: false });
		const result = await sdk.dispatchAction("try").then(() => "accepted", (error: Error) => error.message);
		expect(external).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).not.toBeNull();
		expect(result).toBe("touchpoint_action_denied");
	});
});

describe("stuck gray backdrop", () => {
	it.each(["Production", "Test"] as const)("%s does not block the page before content verification completes", async (mode) => {
		verify.mockReturnValue(new Promise(() => {}));
		await show(mode);
		expect(importModule).not.toHaveBeenCalled();
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it.each(["Production", "Test"] as const)("%s releases the backdrop when content verification fails", async (mode) => {
		verify.mockRejectedValue(new Error("touchpoint_integrity_failed"));
		await show(mode);
		expect(diagnostics).toContain("touchpoint_integrity_failed");
		expect(importModule).not.toHaveBeenCalled();
		expect(document.querySelector("opend-touchpoint")?.shadowRoot?.childElementCount).toBe(0);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it.each(["Production", "Test"] as const)("%s releases the backdrop after a component mount timeout", async (mode) => {
		importModule.mockResolvedValue({ mount: () => new Promise(() => {}) });
		await show(mode);
		await act(async () => { await vi.advanceTimersByTimeAsync(component.TOUCHPOINT_TIMEOUT_MS); });
		expect(diagnostics).toContain("touchpoint_mount_timeout");
		expect(document.querySelector("opend-touchpoint")?.shadowRoot?.childElementCount).toBe(0);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it("Production releases a loading backdrop when its authorization expires", async () => {
		verify.mockReturnValue(new Promise(() => {}));
		await show();
		// Stop renewals to isolate the authorization boundary from mount failure.
		vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
		await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("visual investigation witnesses (not pixel reproductions)", () => {
	it.each(["Production", "Test"] as const)("OPEND-3286 %s focuses the shadow CTA, not the outer modal, on entry and re-entry", async (mode) => {
		for (let entry = 0; entry < 2; entry++) {
			await show(mode);
			const button = mountedButton();
			const modal = screen.getByRole("dialog").firstElementChild;
			expect(document.activeElement).not.toBe(modal);
			expect(document.activeElement).toBe(button.getRootNode() instanceof ShadowRoot ? (button.getRootNode() as ShadowRoot).host : null);
			expect((button.getRootNode() as ShadowRoot).activeElement).toBe(button);
			expect(modal?.querySelector("button")).toBeNull();
			cleanup();
		}
		// jsdom cannot paint Chromium's platform focus ring. On main this witness
		// recorded the outer container receiving focus (the light-DOM query could
		// not reach the ShadowRoot); the fix focuses the CTA through composed
		// traversal. With no layout rectangles/RAF paint, these mounts record no
		// impression.
	});
	it("OPEND-3310 the custom-element host propagates background even outside component content", async () => {
		const read = vi.spyOn(component, "readWebTouchpointHostContext");
		read.mockReturnValue({ locale: "en-US", theme: "light", fontFamily: "sans-serif", cssVariables: { "--background": "#eee" } });
		await show();
		const host = document.querySelector("opend-touchpoint") as HTMLElement;
		expect(host.style.getPropertyValue("--background")).toBe("#eee");
		expect(host.shadowRoot?.querySelector("style[data-vela-touchpoint-host]")?.textContent).toContain("background: var(--background)");
	});
	it.each([1, 2])("OPEND-3323 hover positioning uses CSS coordinates at DPR %s without scaling content", async (dpr) => {
		vi.stubGlobal("devicePixelRatio", dpr);
		vi.stubGlobal("innerWidth", 1920);
		vi.stubGlobal("innerHeight", 1080);
		vi.stubGlobal("visualViewport", undefined);
		vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
			return this.getAttribute("role") === "dialog"
				? new DOMRect(0, 0, 480, 320) : new DOMRect(1840, 20, 24, 24);
		});
		await act(async () => {
			render(<HoverTouchpointOverlay entry={content("opend.home.hover-entry")} layer={content("opend.home.hover-layer")} isAuthorized={() => true} />);
		});
		const entry = document.querySelector("opend-touchpoint")!;
		await act(async () => { fireEvent.pointerEnter(entry); });
		const layer = screen.getByRole("dialog") as HTMLElement;
		expect(layer.style.left).toBe("1432px");
		expect(layer.style.top).toBe("52px");
		expect(layer.style.maxWidth).toBe("1904px");
		expect(layer.style.transform).toBe("");
		expect(layer.style.getPropertyValue("zoom")).toBe("");
	});
});
