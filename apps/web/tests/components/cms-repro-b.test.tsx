// @vitest-environment jsdom
// Intentionally red acceptance specs against main. No production fixes here.
import { createHash } from "node:crypto";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import type { TouchpointSdk } from "@open-design/contracts";

const cmsTrack = vi.hoisted(() => vi.fn());
vi.mock("../../src/analytics/provider", () => ({
	useAnalytics: () => ({ track: cmsTrack }),
	useAppVersion: () => "0.0.0",
}));
const external = vi.hoisted(() => vi.fn(async (_url: string) => true));
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () => ({
		version: 2,
		client: { type: "desktop", osLocale: "en-US" },
	}),
}));
vi.mock("../../src/providers/registry", () => ({ openExternalUrl: external }));
vi.mock("../../src/i18n", () => ({ useI18n: () => ({ locale: "en-US", t: (key: string) => key }) }));

import { ProductionCampaignModal, dispatchProductionCampaignAction } from "../../src/components/ProductionCampaignModal";
import { clearTestRuntimeSession, setTestRuntimeSession, type TestDecision } from "../../src/components/TestCampaignModal";
import { HoverTouchpointOverlay } from "../../src/components/HoverTouchpointOverlay";
import * as component from "../../src/components/touchpoint-component";

const actualVerify = component.verifyWebTouchpoint;
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
	// Leave native crypto completion scheduling real; fake only host clocks.
	vi.useFakeTimers({
		toFake: [
			"Date",
			"setTimeout",
			"clearTimeout",
			"setInterval",
			"clearInterval",
			"requestAnimationFrame",
			"cancelAnimationFrame",
		],
	});
	cmsTrack.mockReset();
	localStorage.clear();
	clearTestRuntimeSession();
	external.mockReset().mockResolvedValue(true);
	clicked = undefined;
	diagnostics = [];
	document.addEventListener("touchpointdiagnostic", captureDiagnostic);
	const browserNavigator = navigator;
	vi.stubGlobal(
		"navigator",
		Object.create(browserNavigator, {
			onLine: { configurable: true, get: () => browserNavigator.onLine },
			userActivation: {
				configurable: true,
				get: () => ({ isActive: true, hasBeenActive: true }),
			},
		}),
	);
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).startsWith("/api/touchpoints/production-runtime?"))
				return new Response(JSON.stringify(decision()));
			if (
				String(input).endsWith("/events") ||
				String(input).endsWith("/acceptances")
			)
				return new Response("{}");
			throw new Error(`Unexpected test fetch: ${String(input)}`);
		}),
	);
	// Only byte acquisition/import is stubbed. Real React hosts, lifecycle, custom
	// element, ShadowRoot, SDK and action adapters execute. Fixture CTA dispatches
	// its action only, matching the host-owned dismissal acceptance requirement.
	verify = vi.spyOn(component, "verifyWebTouchpoint").mockResolvedValue({
		entryUrl: "blob:fixture",
		resourceUrls: new Map(),
		dispose: vi.fn(),
	});
	importModule = vi
		.spyOn(component.webTouchpointModuleCache, "import")
		.mockResolvedValue({
			mount(root, _context, nextSdk) {
				sdk = nextSdk;
				const button = document.createElement("button");
				button.textContent = "立即体验";
				button.onclick = () => {
					clicked = nextSdk.dispatchAction("try");
				};
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

const hash = (value: string) =>
	`sha256:${createHash("sha256").update(value).digest("hex")}`;
function realRoleDecision() {
	const d = decision();
	const staticActions = [
		actions[0]!,
		{ id: "plans", target: { kind: "console-pricing" as const } },
	];
	const manifest = {
		...d.content.manifest,
		runtimeApiVersion: 2 as const,
		material: {
			version: 1 as const,
			materialVersionId: "10000000-0000-4000-8000-000000000001",
			sourceHash: "a".repeat(64),
			templateId: "roles-host",
			templateVersion: 3,
			rendererDigest: `sha256:${"b".repeat(64)}`,
			compilerIdentity: "test",
			sourceDslVersion: 3 as const,
		},
		roleBindings: {
			version: 1 as const,
			bindings: [
				{
					placementKey: placement,
					fieldKey: "buttons",
					buttonId: "try",
					role: "primary" as const,
				},
				{
					placementKey: placement,
					fieldKey: "buttons",
					buttonId: "plans",
					role: "secondary" as const,
				},
			],
		},
		placements: [
			{
				...d.content.manifest.placements[0]!,
				locales: ["en"],
				staticActions,
				requiredCapabilities: [
					"close",
					"static-action",
					"action-console-pricing-v1",
				],
			},
		],
	};
	const entryModule = "export {}";
	return {
		...d,
		staticActions,
		requiredCapabilities: manifest.placements[0]!.requiredCapabilities,
		content: {
			...d.content,
			manifest,
			manifestHash: hash(JSON.stringify(manifest)),
			entryModule,
			entryDigest: hash(entryModule),
			runtime: { ...d.content.runtime, apiVersion: 2 as const },
			resources: [
				{
					path: "component.js",
					bytes: btoa(entryModule),
					digest: hash(entryModule),
				},
			],
		},
	};
}
describe("B2 actual verifier to ShadowRoot SDK to production analytics", () => {
	it.each(["try", "plans"])(
		"registered %s preserves target semantics and carries the privately verified role",
		async (id) => {
			const d = realRoleDecision();
			verify.mockImplementation(actualVerify);
			const transport = vi.fn(
				async (input: RequestInfo | URL, _init?: RequestInit) =>
					String(input).startsWith("/api/touchpoints/production-runtime?")
						? Response.json(d)
						: Response.json({}),
			);
			vi.stubGlobal("fetch", transport);
			vi.spyOn(document, "hidden", "get").mockReturnValue(false);
			vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
				length: 1,
			} as DOMRectList);
			vi.stubGlobal(
				"ResizeObserver",
				class {
					observe() {}
					disconnect() {}
				},
			);
			let mounted!: () => void;
			const completion = new Promise<void>((done) => {
				mounted = done;
			});
			importModule.mockResolvedValue({
				mount(root, _context, nextSdk) {
					sdk = nextSdk;
					for (const action of d.staticActions) {
						const button = document.createElement("button");
						button.dataset.action = action.id;
						button.textContent = action.id;
						button.onclick = () => {
							clicked = nextSdk.dispatchAction(action.id);
						};
						root.append(button);
					}
					mounted();
					return root;
				},
			});
			await show();
			// Crypto completion precedes React's next commit; awaiting mount inside act
			// would hold that commit behind the mount signal it must itself produce.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await completion;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(32);
			});
			const button = document
				.querySelector("opend-touchpoint")!
				.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
			await act(async () => {
				fireEvent.click(button);
				await clicked;
			});
			const click = cmsTrack.mock.calls.find(
				([event, props]) => event === "ui_click" && props.action_id === id,
			)!;
			expect(click).toBeDefined();
			expect(click[1]).toMatchObject({
				action_id: id,
				button_role: id === "try" ? "primary" : "secondary",
				target_kind: id === "try" ? "https" : "console_pricing",
				element: id === "try" ? "link_cta" : "primary_cta",
				template_id: "roles-host",
			});
			if (id === "try") {
				expect(external).toHaveBeenCalledWith(actions[0]!.target.url);
				expect(click[1]).not.toHaveProperty("entry_id");
			} else {
				expect(click[1].entry_id).toBeTruthy();
				expect(external.mock.calls[0]![0]).not.toBe(actions[0]!.target.url);
			}
			const raw = transport.mock.calls
				.filter(([url]) => String(url).endsWith("/events"))
				.map(([, init]) =>
					JSON.parse(String((init as RequestInit | undefined)?.body)),
				)
				.find((body) => body.kind === "click");
			expect(raw).toMatchObject({ kind: "click", eventId: click[2].insertId });
			expect(Object.keys(raw).sort()).toEqual(
				[
					"activityId",
					"eventId",
					"kind",
					"placementKey",
					"touchpointDecisionId",
				].sort(),
			);
			expect(screen.queryByRole("dialog")).toBeNull();
		},
	);
	it.each([undefined, "secondary_close", "close"] as const)(
		"genuine hover SDK reason %s routes only explicit visible X once",
		async (reason) => {
			const nextSdks = new Map<string, TouchpointSdk>();
			const onLayerClose = vi.fn();
			let authorized = true;
			vi.spyOn(document, "hidden", "get").mockReturnValue(false);
			vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
				length: 1,
			} as DOMRectList);
			vi.stubGlobal(
				"ResizeObserver",
				class {
					observe() {}
					disconnect() {}
				},
			);
			importModule.mockResolvedValue({
				mount(root, context, nextSdk) {
					nextSdks.set(context.placementKey, nextSdk);
					const button = document.createElement("button");
					button.textContent = "X";
					button.onclick = () => nextSdk.requestClose(reason);
					root.append(button);
					return root;
				},
			});
			const view = render(
				<HoverTouchpointOverlay
					entry={content("opend.home.hover-entry")}
					layer={content("opend.home.hover-layer")}
					isAuthorized={() => authorized}
					onLayerClose={onLayerClose}
				/>,
			);
			await act(async () => {});
			const layerSdk = nextSdks.get("opend.home.hover-layer")!;
			act(() => layerSdk.requestClose("close")); // before first visibility cannot be X
			expect(onLayerClose).not.toHaveBeenCalled();
			const entry = document.querySelector("opend-touchpoint")!;
			await act(async () => {
				fireEvent.pointerEnter(entry);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(32);
			});
			const button = document
				.querySelectorAll("opend-touchpoint")[1]!
				.shadowRoot!.querySelector("button")!;
			act(() => {
				fireEvent.click(button);
				layerSdk.requestClose(reason);
			});
			expect(onLayerClose).toHaveBeenCalledTimes(reason === "close" ? 1 : 0);
			const count = onLayerClose.mock.calls.length;
			await act(async () => {
				fireEvent.pointerEnter(entry);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(32);
			});
			authorized = false;
			act(() => layerSdk.requestClose("close"));
			view.unmount();
			act(() => layerSdk.requestClose("close"));
			expect(onLayerClose).toHaveBeenCalledTimes(count);
		},
	);
});

it.each([
	"hidden",
	"expired",
	"Escape",
	"pointer_leave",
	"outside_focus",
	"auto",
])("B2 real SDK hover %s never attributes X", async (control) => {
	const nextSdks = new Map<string, TouchpointSdk>();
	const onLayerClose = vi.fn();
	let authorized = true;
	vi.spyOn(document, "hidden", "get").mockReturnValue(false);
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	importModule.mockResolvedValue({
		mount(root, context, nextSdk) {
			nextSdks.set(context.placementKey, nextSdk);
			root.append(document.createElement("button"));
			return root;
		},
	});
	await act(async () => {
		render(
			<HoverTouchpointOverlay
				entry={content("opend.home.hover-entry")}
				layer={content("opend.home.hover-layer")}
				isAuthorized={() => authorized}
				onLayerClose={onLayerClose}
				layerActionIds={new Set(["try"])}
				dispatchLayerAction={async () => {}}
			/>,
		);
	});
	const entry = document.querySelector("opend-touchpoint")!;
	await act(async () => {
		fireEvent.pointerEnter(entry);
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(32);
	});
	const layerSdk = nextSdks.get("opend.home.hover-layer")!;
	if (control === "hidden") {
		vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		act(() => layerSdk.requestClose("close"));
	}
	if (control === "expired") {
		authorized = false;
		act(() => layerSdk.requestClose("close"));
	}
	if (control === "Escape") fireEvent.keyDown(window, { key: "Escape" });
	if (control === "pointer_leave")
		fireEvent.pointerLeave(entry, { clientX: 999, clientY: 999 });
	if (control === "outside_focus") {
		const outside = document.createElement("button");
		document.body.append(outside);
		fireEvent.focusOut(entry, { relatedTarget: outside });
	}
	if (control === "auto")
		await act(async () => {
			await layerSdk.dispatchAction("try");
		});
	expect(onLayerClose).not.toHaveBeenCalled();
});
