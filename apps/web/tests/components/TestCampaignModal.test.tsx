import { touchpointLoadQueue, resetTouchpointLoadObservability } from "../../src/components/touchpoint-load-observability";
// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { StrictMode } from "react";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CampaignHostGlobal = typeof globalThis & {
	__openDesignCampaignTestHost?: unknown;
};
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () =>
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost,
}));

import { I18nProvider } from "../../src/i18n";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import {
	clearTestRuntimeSession,
	isSelectedTestCampaignDecision,
	setTestRuntimeSession,
	type TestDecision,
	type TestCampaignPlacement,
	TestCampaignModal,
	TestTouchpointMount,
	useTestRuntime,
} from "../../src/components/TestCampaignModal";
import * as providerRegistry from "../../src/providers/registry";
import * as campaignNavigation from "../../src/components/touchpoint-navigation";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";

const cmsTrack = vi.hoisted(() => vi.fn());
vi.mock('../../src/analytics/provider', () => ({ useAnalytics: () => ({ track: cmsTrack }), useAppVersion: () => '0.0.0' }));

const digest = (value: string) =>
	`sha256:${createHash("sha256").update(value).digest("hex")}`;
const entryModule =
	"export function mount(root) { root.textContent = 'Verified campaign'; return root; }";
const manifest = {
	formatVersion: 2 as const,
	runtimeKind: "web-component" as const,
	runtimeApiVersion: 1 as const,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
	sdkVersion: "vela-touchpoint-sdk-v1" as const,
	contentLine: "test",
	placements: [
		{
			key: "opend.home.campaign-modal" as const,
			entry: "component.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["close"],
			staticActions: [],
		},
	],
	resources: ["component.js"],
	images: [],
};
const content = {
	id: "version-1",
	placementKey: "opend.home.campaign-modal",
	locale: "en-US",
	manifestHash: digest(JSON.stringify(manifest)),
	entryPath: "component.js",
	entryDigest: digest(entryModule),
	entryModule,
	resources: [
		{
			path: "component.js",
			digest: digest(entryModule),
			bytes: btoa(entryModule),
		},
	],
	runtime: {
		kind: "web-component" as const,
		apiVersion: 1 as const,
		wrapperVersion: "vela-touchpoint-wrapper-v1" as const,
		sdkVersion: "vela-touchpoint-sdk-v1" as const,
	},
	buildIdentity: { fingerprint: "fixed" },
	manifest,
};
function runtime(contentValue: unknown = content) {
	const context = {
		deploymentId: "deployment-1",
		scenario: "realtime" as const,
		updatedAt: "2030-01-01T00:00:00.000Z",
	};
	return { activityId: "activity-1", snapshotHash: "sha256:test-snapshot", artifactHash: "sha256:test-artifact", manifestHash: content.manifestHash, deploymentId: "deployment-1", placementKey: "opend.home.campaign-modal", requiredCapabilities: ["close"], staticActions: [], serverTime: "2030-01-01T00:00:00.000Z", authorizationExpiresAt: "2030-01-01T00:01:00.000Z", startsAt: "2029-12-31T23:00:00.000Z", endsAt: "2030-01-01T01:00:00.000Z", testContext: { ...context, scheduleState: "active" as const }, content: contentValue, };
}
function authorizeMount(decision: TestDecision) {
	setTestRuntimeSession({
		selectionKey: "standalone-test",
		deployment: { id: decision.deploymentId ?? "", activityId: decision.activityId ?? "", snapshotHash: decision.snapshotHash, snapshot: { contentVersionId: decision.content.id, manifestHash: decision.manifestHash ?? "", artifactHash: decision.artifactHash ?? "", placementKeys: [decision.placementKey as TestCampaignPlacement] } },
		context: decision.testContext,
		decisions: new Map<TestCampaignPlacement, TestDecision>([[decision.placementKey as TestCampaignPlacement, decision]]),
		isAuthorized: () => true,
	});
}
function fetches(response: Record<string, unknown> = runtime()) {
	return vi.fn(
		async (url: string) =>
			new Response(
				JSON.stringify(
					url.includes("deployments")
						? {
								deployments: [
									{
										id: "deployment-1",
										activityId: "activity-1",
										snapshotHash: "sha256:test-snapshot",
										snapshot: {
											contentVersionId: content.id,
											manifestHash: content.manifestHash,
											artifactHash: "sha256:test-artifact",
											placementKeys: ["opend.home.campaign-modal"],
										},
									},
								],
							}
						: url.includes("context") ? runtime().testContext : response,
				),
				{ status: 200 },
			),
	);
}

const allTestPlacements = [
	"opend.home.account-badge",
	"opend.home.campaign-modal",
	"opend.home.hover-entry",
	"opend.home.hover-layer",
] as const;
const allTestManifest = {
	formatVersion: 2 as const,
	runtimeKind: "web-component" as const,
	runtimeApiVersion: 1 as const,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
	sdkVersion: "vela-touchpoint-sdk-v1" as const,
	contentLine: "four-placement-test",
	placements: allTestPlacements.map((key) => ({
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
	resources: allTestPlacements.map((key) => `${key.split(".").at(-1)}.js`),
	images: [],
};
function fourPlacementContent(
	placementKey: (typeof allTestPlacements)[number],
) {
	const entryPath = `${placementKey.split(".").at(-1)}.js`;
	const module =
		"export function mount(root) { root.textContent = 'Verified campaign'; return root; }";
	return {
		...content,
		id: "version-four-placement",
		placementKey,
		locale: "zh-CN",
		manifest: allTestManifest,
		manifestHash: digest(JSON.stringify(allTestManifest)),
		entryPath,
		entryDigest: digest(module),
		entryModule: module,
		resources: [
			{ path: entryPath, digest: digest(module), bytes: btoa(module) },
		],
	};
}
function TestRuntimeProbe() {
	const runtime = useTestRuntime();
	return (
		<output
			data-testid="test-runtime-decision-count"
			data-selected={runtime?.deployment.id ?? ""}
		>
			{runtime?.decisions.size ?? 0}
		</output>
	);
}
function TestCampaignHarness({
	authenticated,
	sessionSubject = "account-a",
}: {
	authenticated: boolean;
	sessionSubject?: string | null;
}) {
	return (
		<>
			<TestCampaignModal
				authenticated={authenticated}
				sessionSubject={sessionSubject}
			/>
			<ProductionCampaignModal
				authenticated={authenticated}
				sessionSubject={sessionSubject ?? null}
			/>
		</>
	);
}
beforeEach(() => {
  cmsTrack.mockClear();
	vi.spyOn(touchpointLoadQueue("production"), "enqueue").mockImplementation(() => {});
	vi.spyOn(touchpointLoadQueue("test"), "enqueue").mockImplementation(() => {});
	// jsdom cannot import the verified Blob entry. The modal is presented only
	// once content has mounted, so stand in for a successful mount as the
	// Production suite does; cases that exercise mount failures override it.
	vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
		async function (this: OpenDesignTouchpointElement) {
			this.shadowRoot?.replaceChildren(
				document.createTextNode("Verified campaign"),
			);
		},
	);
	window.history.replaceState(null, "", "/?cmsTestControls=1");
	(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
		version: 2,
		client: { type: "desktop" },
	};
});
afterEach(() => {
	resetTouchpointLoadObservability();
	window.history.replaceState(null, "", "/");
	delete (globalThis as CampaignHostGlobal).__openDesignCampaignTestHost;
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	clearTestRuntimeSession();
});
describe("TestCampaignModal", () => {
	it("is default-deny without the real desktop host", () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		render(<TestCampaignModal authenticated={false} />);
		expect(screen.queryByTestId("touchpoint-test-selector")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
	it("starts one realtime context request when a Test activity is selected", async () => {
		const fetchMock = fetches();
		vi.stubGlobal("fetch", fetchMock);
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		await screen.findByRole("dialog");
		expect(fetchMock).toHaveBeenCalledWith("/api/touchpoints/test-runtime/context", expect.objectContaining({ body: JSON.stringify({ deploymentId: "deployment-1", scenario: "realtime" }) }));
		expect(fetchMock.mock.calls.filter(([url]) => url.includes("/context")).length).toBe(1);
	});
	it("uses the selected Test decision to create a v2 ShadowRoot custom element, never iframe or webview", async () => {
		vi.stubGlobal("fetch", fetches());
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await screen.findByRole("dialog");
		expect(
			screen
				.getByTestId("campaign-custom-element")
				.querySelector("opend-touchpoint")?.shadowRoot,
		).not.toBeNull();
		expect(document.querySelector("iframe,webview")).toBeNull();
	});
	it("cleans host scroll lock and restores focus after Escape", async () => {
		const trigger = document.createElement("button");
		document.body.append(trigger);
		trigger.focus();
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-campaign",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi.spyOn(
			OpenDesignTouchpointElement.prototype,
			"mount",
		).mockResolvedValue();
		vi.stubGlobal("fetch", fetches());
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await screen.findByRole("dialog");
		await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(document.body.style.overflow).toBe("");
		expect(document.activeElement).toBe(trigger);
		trigger.remove();
	});
	it("SDK requestClose clears the active decision and disposes its custom element", async () => {
		const { OpenDesignTouchpointElement } = await import(
			"../../src/components/touchpoint-component"
		);
		let requestClose: (() => void) | undefined;
		const mount = vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(
				async (_entry, _digest, _context, _resources, _actions, options) => {
					requestClose = options?.requestClose;
				},
			);
		const dispose = vi.spyOn(OpenDesignTouchpointElement.prototype, "dispose");
		vi.stubGlobal("fetch", fetches());
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await screen.findByRole("dialog");
		await waitFor(() => expect(requestClose).toBeTypeOf("function"));
		requestClose?.();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(document.body.style.overflow).toBe("");
		expect(dispose).toHaveBeenCalled();
		mount.mockRestore();
		dispose.mockRestore();
	});
});

describe("CMS modal host cleanup", () => {
	it("holds the host scroll lock until every concurrent CMS modal releases it", async () => {
		const { lockWebTouchpointModalScroll } = await import(
			"../../src/components/touchpoint-component"
		);
		const releaseFirst = lockWebTouchpointModalScroll();
		const releaseSecond = lockWebTouchpointModalScroll();
		expect(document.body.style.overflow).toBe("hidden");
		releaseFirst();
		expect(document.body.style.overflow).toBe("hidden");
		releaseSecond();
		expect(document.body.style.overflow).toBe("");
	});
});

describe("TestCampaignModal host guards", () => {
	it("keeps a recorded Test activity closed without a replay button or clearing impression history", async () => {
		const subject = "explicit-test-replay";
		const key = `touchpoint-displayed:v1:${subject}:activity-1`;
		localStorage.setItem(key, "1");
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:test", resourceUrls: new Map(), dispose: vi.fn() } as never);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockResolvedValue();
		const decision = runtime() as TestDecision;
		authorizeMount(decision);
		render(<ProductionCampaignModal authenticated sessionSubject={subject} />);
		expect(screen.queryByRole("button", { name: "Reopen test activity" })).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(localStorage.getItem(key)).toBe("1");
		localStorage.removeItem(key);
	});

	it("closes a recorded open modal on a direct replacement deployment of the same activity", async () => {
		const subject = "direct-redeployment-account";
		const storageKey = `touchpoint-displayed:v1:${subject}:activity-1`;
		localStorage.removeItem(storageKey);
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
			length: 1,
		} as DOMRectList);
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-campaign",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockResolvedValue();
		const firstDecision = runtime() as TestDecision;
		authorizeMount(firstDecision);
		render(<ProductionCampaignModal authenticated sessionSubject={subject} />);
		await screen.findByRole("dialog");
		await waitFor(() => expect(localStorage.getItem(storageKey)).toBe("1"));

		act(() => authorizeMount({
			...firstDecision,
			deploymentId: "deployment-2",
			testContext: { ...firstDecision.testContext, deploymentId: "deployment-2" },
		}));
		expect(screen.queryByRole("dialog")).toBeNull();
		localStorage.removeItem(storageKey);
	});

	it("refreshes close-control availability when a shadow control becomes enabled", async () => {
		let closeControl!: HTMLButtonElement;
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-campaign",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (this: OpenDesignTouchpointElement) {
				closeControl = document.createElement("button");
				closeControl.dataset.touchpointClose = "true";
				closeControl.disabled = true;
				this.shadowRoot?.replaceChildren(closeControl);
			},
		);
		const onCloseControlChange = vi.fn();
		const decision = runtime() as TestDecision;
		authorizeMount(decision);
		render(
			<TestTouchpointMount
				decision={decision}
				placementKey="opend.home.campaign-modal"
				testId="test-touchpoint-mount"
				onVisible={vi.fn()}
				isAuthorized={() => true}
				onCloseControlChange={onCloseControlChange}
			/>,
		);
		await waitFor(() =>
			expect(onCloseControlChange).toHaveBeenCalledWith(false),
		);
		closeControl.disabled = false;
		await waitFor(() =>
			expect(onCloseControlChange).toHaveBeenCalledWith(true),
		);
	});

	it("does not let a rejected stale Test mount overwrite a replacement close control", async () => {
		let rejectOldMount!: (reason?: unknown) => void;
		let mountCount = 0;
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-campaign",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (this: OpenDesignTouchpointElement) {
				mountCount += 1;
				if (mountCount === 1) {
					await new Promise<never>((_, reject) => {
						rejectOldMount = reject;
					});
					return;
				}
				const close = document.createElement("button");
				close.dataset.touchpointClose = "true";
				this.shadowRoot?.replaceChildren(close);
			},
		);
		const onCloseControlChange = vi.fn();
		touchpointComponent.ensureWebTouchpointElement();
		const firstDecision = runtime() as TestDecision;
		const replacementDecision = {
			...firstDecision,
			content: { ...firstDecision.content, id: "replacement-version" },
		} as TestDecision;
		authorizeMount(firstDecision);
		const { rerender } = render(
			<div role="dialog">
				<TestTouchpointMount
					decision={firstDecision}
					placementKey="opend.home.campaign-modal"
					testId="test-touchpoint-mount"
					onVisible={vi.fn()}
					isAuthorized={() => true}
					onCloseControlChange={onCloseControlChange}
				/>
			</div>,
		);
		await waitFor(() => expect(mountCount).toBe(1));
		authorizeMount(replacementDecision);
		rerender(
			<div role="dialog">
				<TestTouchpointMount
					decision={replacementDecision}
					placementKey="opend.home.campaign-modal"
					testId="test-touchpoint-mount"
					onVisible={vi.fn()}
					isAuthorized={() => true}
					onCloseControlChange={onCloseControlChange}
				/>
			</div>,
		);
		await waitFor(() => expect(mountCount).toBe(2));
		await waitFor(() =>
			expect(onCloseControlChange).toHaveBeenLastCalledWith(true),
		);
		rejectOldMount(new Error("stale Test mount failed"));
		await Promise.resolve();
		expect(onCloseControlChange).toHaveBeenLastCalledWith(true);
	});

	it("skips a decision whose required capabilities drift from its immutable manifest and emits a diagnostic", async () => {
		const diagnostics: string[] = [];
		document.addEventListener(
			"touchpointdiagnostic",
			(event) => diagnostics.push((event as CustomEvent).detail.code),
			{ once: true },
		);
		vi.stubGlobal(
			"fetch",
			fetches({ ...runtime(), requiredCapabilities: ["unknown"] }),
		);
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await waitFor(() =>
			expect(diagnostics).toEqual(["touchpoint_capability_unsupported"]),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it("contains Tab focus with the host helper", async () => {
		const { trapWebTouchpointModalFocus } = await import(
			"../../src/components/touchpoint-component"
		);
		const modal = document.createElement("div");
		const first = document.createElement("button");
		const last = document.createElement("button");
		modal.append(first, last);
		document.body.append(modal);
		last.focus();
		const tab = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		trapWebTouchpointModalFocus(tab, modal);
		expect(tab.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(first);
		modal.remove();
	});
});

describe("Test campaign decision and lifecycle guards", () => {
	it("rejects a response from another selected deployment or content placement before mounting", async () => {
		const diagnostics: string[] = [];
		document.addEventListener(
			"touchpointdiagnostic",
			(event) => diagnostics.push((event as CustomEvent).detail.code),
			{ once: true },
		);
		vi.stubGlobal(
			"fetch",
			fetches({ ...runtime(), deploymentId: "deployment-other" }),
		);
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await waitFor(() =>
			expect(diagnostics).toEqual(["touchpoint_decision_mismatch"]),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it("refuses a selected deployment whose immutable snapshot identity is missing", async () => {
		const base = fetches();
		vi.stubGlobal("fetch", async (url: string) => {
			const response = await base(url);
			if (!url.endsWith("/deployments")) return response;
			const body = await response.json();
			delete body.deployments[0].snapshotHash;
			return new Response(JSON.stringify(body));
		});
		const diagnostics: string[] = [];
		document.addEventListener(
			"touchpointdiagnostic",
			(event) => diagnostics.push((event as CustomEvent).detail.code),
			{ once: true },
		);
		render(
			<>
				<TestCampaignHarness authenticated />
				<TestRuntimeProbe />
			</>,
		);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await waitFor(() =>
			expect(diagnostics).toContain("touchpoint_decision_mismatch"),
		);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByTestId("test-runtime-decision-count")).toHaveAttribute(
			"data-selected",
			"deployment-1",
		);
	});
	it.each(["activity", "tester", "actions"])(
		"rejects mismatched %s identity before mounting",
		async (kind) => {
			const value = runtime();
			const response = {
				...value,
				...(kind === "activity" ? { activityId: "other-activity" } : {}),
				...(kind === "tester"
					? {
							testContext: {
								...value.testContext,
								testerMemberId: "other-tester",
							},
						}
					: {}),
				...(kind === "actions"
					? {
							staticActions: [
								{
									id: "forged",
									target: { kind: "https", url: "https://example.com" },
								},
							],
						}
					: {}),
			};
			vi.stubGlobal("fetch", fetches(response));
			render(<TestCampaignHarness authenticated />);
			await screen.findByTestId("touchpoint-test-selector");
			fireEvent.change(screen.getByLabelText("Test activity"), {
				target: { value: "deployment-1" },
			});
			await waitFor(() =>
				expect(screen.getByTestId("touchpoint-test-clock")).toHaveTextContent("error"),
			);
			expect(screen.queryByRole("dialog")).toBeNull();
		},
	);
	it("clears selected Test content when the authenticated account changes", async () => {
		vi.stubGlobal("fetch", fetches());
		const { rerender } = render(
			<TestCampaignHarness authenticated sessionSubject="account-a" />,
		);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await screen.findByRole("dialog");
		rerender(<TestCampaignHarness authenticated sessionSubject="account-b" />);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.getByLabelText("Test activity")).toHaveValue("");
	});
	it("does not let a late failed context request clear a newer selection", async () => {
		let failFirst!: (value: Response) => void;
		const firstContext = new Promise<Response>((resolve) => {
			failFirst = resolve;
		});
		const base = fetches();
		vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
			if (url.endsWith("/deployments")) {
				const body = await (await base(url)).json();
				body.deployments.push({
					...body.deployments[0],
					id: "deployment-2",
					activityId: "activity-2",
				});
				return new Response(JSON.stringify(body));
			}
			if (url.endsWith("/context")) {
				const selected = JSON.parse(String(init?.body)).deploymentId;
				if (selected === "deployment-1") return firstContext;
				return new Response(
					JSON.stringify({ ...runtime().testContext, deploymentId: selected }),
				);
			}
			const value = runtime();
			return new Response(
				JSON.stringify({
					...value,
					activityId: "activity-2",
					deploymentId: "deployment-2",
					testContext: { ...value.testContext, deploymentId: "deployment-2" },
				}),
			);
		});
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-2" },
		});
		await screen.findByRole("dialog");
		await act(async () => {
			failFirst(
				new Response(JSON.stringify({ error: "failed" }), { status: 500 }),
			);
			await firstContext;
		});
		await waitFor(() =>
			expect(screen.getByLabelText("Test activity")).toHaveValue(
				"deployment-2",
			),
		);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});
	it("diagnoses immutable byte integrity failure and revokes every created Blob URL", async () => {
		const { verifyWebTouchpoint } = await import(
			"../../src/components/touchpoint-component"
		);
		const revoked: string[] = [];
		const create = vi
			.spyOn(URL, "createObjectURL")
			.mockReturnValue("blob:verified");
		const revoke = vi
			.spyOn(URL, "revokeObjectURL")
			.mockImplementation((url) => {
				revoked.push(url);
			});
		await expect(
			verifyWebTouchpoint({ ...content, entryModule: "tampered" } as any),
		).rejects.toThrow("touchpoint_integrity_failed");
		expect(create).toHaveBeenCalledOnce();
		expect(revoke).toHaveBeenCalledWith("blob:verified");
		create.mockRestore();
		revoke.mockRestore();
	});
	it("gives initial focus to the first control a user can reach, past hidden and unfocusable ones", async () => {
		const { focusWebTouchpointModal } = await import(
			"../../src/components/touchpoint-component"
		);
		const modal = document.createElement("div");
		modal.tabIndex = -1;
		const component = document.createElement("opend-touchpoint");
		const shadow =
			component.shadowRoot ?? component.attachShadow({ mode: "open" });
		const hiddenInput = document.createElement("input");
		hiddenInput.type = "hidden";
		const collapsed = document.createElement("div");
		collapsed.style.display = "none";
		collapsed.append(document.createElement("button"));
		const invisible = document.createElement("button");
		invisible.style.visibility = "hidden";
		const inertGroup = document.createElement("div");
		inertGroup.inert = true;
		inertGroup.append(document.createElement("button"));
		const refusing = document.createElement("button");
		refusing.focus = () => {};
		const action = document.createElement("button");
		shadow.append(hiddenInput, collapsed, invisible, inertGroup, refusing, action);
		modal.append(component);
		document.body.append(modal);
		focusWebTouchpointModal(modal);
		expect(shadow.activeElement).toBe(action);
		action.remove();
		focusWebTouchpointModal(modal);
		expect(document.activeElement).toBe(modal);
		modal.remove();
	});
	it("traps both directions across the mounted open ShadowRoot boundary", async () => {
		const { trapWebTouchpointModalFocus } = await import(
			"../../src/components/touchpoint-component"
		);
		const modal = document.createElement("div");
		const close = document.createElement("button");
		const component = document.createElement("opend-touchpoint");
		const shadow =
			component.shadowRoot ?? component.attachShadow({ mode: "open" });
		const action = document.createElement("button");
		shadow.append(action);
		modal.append(close, component);
		document.body.append(modal);
		close.focus();
		const forward = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		trapWebTouchpointModalFocus(forward, modal);
		expect(forward.defaultPrevented).toBe(true);
		expect(shadow.activeElement).toBe(action);
		action.focus();
		const wrapForward = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		trapWebTouchpointModalFocus(wrapForward, modal);
		expect(wrapForward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(close);
		close.focus();
		const wrapReverse = new KeyboardEvent("keydown", {
			key: "Tab",
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		});
		trapWebTouchpointModalFocus(wrapReverse, modal);
		expect(wrapReverse.defaultPrevented).toBe(true);
		expect(shadow.activeElement).toBe(action);
		modal.remove();
	});
	it("wraps Tab past controls that refuse focus in either direction", async () => {
		const { trapWebTouchpointModalFocus } = await import("../../src/components/touchpoint-component");
		const modal = document.createElement("div");
		modal.tabIndex = -1;
		const refusingFirst = document.createElement("button");
		const first = document.createElement("button");
		const last = document.createElement("button");
		const refusingLast = document.createElement("button");
		refusingFirst.focus = refusingLast.focus = () => {};
		modal.append(refusingFirst, first, last, refusingLast);
		document.body.append(modal);
		last.focus();
		const forward = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
		trapWebTouchpointModalFocus(forward, modal);
		expect(forward.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(first);
		const reverse = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, cancelable: true });
		trapWebTouchpointModalFocus(reverse, modal);
		expect(reverse.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(last);
		first.remove();
		last.remove();
		trapWebTouchpointModalFocus(reverse, modal);
		expect(document.activeElement).toBe(modal);
		modal.remove();
	});
	it("never consumes a Test static target without an approved server event contract", async () => {
		const { dispatchTestCampaignAction } = await import(
			"../../src/components/TestCampaignModal"
		);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		await expect(
			dispatchTestCampaignAction(runtime() as any, "learn"),
		).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});


	it.each([
		["missing authorization", undefined],
		["authorization longer than the 60-second Test lease", "2030-01-01T00:01:00.001Z"],
	])("does not mount with %s", async (_case, authorizationExpiresAt) => {
		const response = runtime();
		if (authorizationExpiresAt === undefined) delete (response as { authorizationExpiresAt?: string }).authorizationExpiresAt;
		else response.authorizationExpiresAt = authorizationExpiresAt;
		const fetchMock = fetches(response);
		vi.stubGlobal("fetch", fetchMock);
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("/test-runtime?"))).toBe(true));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

describe("Test runtime response adapter", () => {
	it("keeps a server-before response unmounted", async () => {
		const now = Date.now();
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("deployments")) return fetches()(url);
			if (init?.method === "POST") return new Response(JSON.stringify(runtime().testContext));
			return new Response(JSON.stringify({
				...runtime(),
				serverTime: new Date(now).toISOString(),
				startsAt: new Date(now + 10_000).toISOString(),
				endsAt: new Date(now + 20_000).toISOString(),
				authorizationExpiresAt: new Date(now + 20_000).toISOString(),
				testContext: { ...runtime().testContext, scheduleState: "before" },
			}));
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		await waitFor(() => expect(screen.getByTestId("touchpoint-test-clock")).toHaveTextContent("before"));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("clears only when the server marks the selected activity ended", async () => {
		let ended = false;
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("deployments")) return fetches()(url);
			if (init?.method === "POST") return new Response(JSON.stringify(runtime().testContext));
			const base = Date.parse("2030-01-01T00:00:00.000Z");
			const serverTime = new Date(base + (ended ? 21_000 : 1_000)).toISOString();
			return new Response(JSON.stringify({
				...runtime(), serverTime, startsAt: new Date(base).toISOString(), endsAt: new Date(base + 20_000).toISOString(), authorizationExpiresAt: new Date(base + 20_000).toISOString(),
				testContext: { ...runtime().testContext, scheduleState: ended ? "ended" : "active" },
			}));
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		await screen.findByRole("dialog");
		ended = true;
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(screen.getByTestId("touchpoint-test-clock")).toHaveTextContent("ended"));
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});


describe("Test campaign four-placement contract", () => {
	it("loads the real context shape, mounts every enabled placement, and records one server acceptance per visible host", async () => {
		const context = {
			deploymentId: "deployment-four",
			scenario: "realtime" as const,
			updatedAt: "2030-01-01T00:00:00.000Z",
		};
		const deployment = {
			id: "deployment-four",
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: digest(JSON.stringify(allTestManifest)),
				artifactHash: "sha256:four-artifact",
				placementKeys: [...allTestPlacements],
			},
		};
		const responses = new Map(
			allTestPlacements.map((placementKey, index) => [
				placementKey,
				{
					...runtime(fourPlacementContent(placementKey)),
					deploymentId: deployment.id,
					serverTime: new Date(Date.parse("2030-01-01T00:00:00.000Z") + index).toISOString(),
					placementKey,
					snapshotHash: deployment.snapshotHash,
					artifactHash: deployment.snapshot.artifactHash,
					manifestHash: deployment.snapshot.manifestHash,
					requiredCapabilities:
						placementKey === "opend.home.campaign-modal"
							? ["close", "static-action"]
							: placementKey === "opend.home.account-badge"
								? ["static-action"]
								: ["hover", "static-action"],
					activityId: deployment.activityId,
					testContext: { ...context, scheduleState: "active" as const },
				},
			]),
		);
		(
			(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost as {
				client: { osLocale: string };
			}
		).client.osLocale = "zh-CN";
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (init?.method === "POST" && url.includes("acceptances"))
				return new Response(JSON.stringify({ id: "acceptance" }), {
					status: 201,
				});
			if (url.includes("/production-runtime"))
				return new Response(null, { status: 404 });
			if (init?.method === "POST")
				return new Response(JSON.stringify(context), { status: 201 });
			if (url.includes("/deployments"))
				return new Response(JSON.stringify({ deployments: [deployment] }), {
					status: 200,
				});
			const placementKey = new URL(url, "http://127.0.0.1").searchParams.get(
				"placementKey",
			);
			return new Response(
				JSON.stringify(
					responses.get(placementKey as (typeof allTestPlacements)[number]),
				),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);
		const mount = vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (this: OpenDesignTouchpointElement) {
				this.shadowRoot?.replaceChildren(
					document.createTextNode("Verified campaign"),
				);
			});
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-four-placement",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
			length: 1,
			item: () => null,
		} as unknown as DOMRectList);
		render(
			<>
				<TestRuntimeProbe />
				<TestCampaignHarness authenticated />
			</>,
		);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: deployment.id },
		});
		await screen.findByRole("dialog");
		await waitFor(() =>
			expect(
				screen.getByTestId("test-runtime-decision-count"),
			).toHaveTextContent("4"),
		);
		await waitFor(() => expect(mount).toHaveBeenCalledTimes(1));
		const acceptanceCalls = () =>
			fetchMock.mock.calls.filter(
				([url, init]) => init?.method === "POST" && url.includes("acceptances"),
			);
		await waitFor(() => expect(acceptanceCalls()).toHaveLength(1));
		const facts = vi.mocked(touchpointLoadQueue("test").enqueue).mock.calls.map(([record]) => record);
		expect(facts.filter(record => record.kind === "start")).toHaveLength(4);
		expect(facts.filter(record => record.kind === "start").every(record => record.decision_id === null && record.decision_outcome === null)).toBe(true);
		expect(facts.filter(record => record.result === "visible")).toHaveLength(1);
		expect(facts.find(record => record.result === "visible")).toMatchObject({ decision_id: null, decision_outcome: "eligible" });
		expect(JSON.parse(String(acceptanceCalls()[0]?.[1]?.body))).not.toHaveProperty("eventId");
		expect(
			acceptanceCalls().map(
				([, init]) => JSON.parse(String(init?.body)).placementKey,
			),
		).toEqual(["opend.home.campaign-modal"]);
		for (const placementKey of allTestPlacements) {
			expect(
				fetchMock.mock.calls.some(
					([url, init]) =>
						init?.method !== "POST" &&
						new URL(url, "http://127.0.0.1").searchParams.get(
							"placementKey",
						) === placementKey,
				),
			).toBe(true);
		}
	});
});

describe("Test campaign realtime controller regressions", () => {
	it("selects once under StrictMode without duplicating the realtime context request", async () => {
		const fetchMock = fetches();
		vi.stubGlobal("fetch", fetchMock);
		render(<StrictMode><TestCampaignHarness authenticated /></StrictMode>);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), {
			target: { value: "deployment-1" },
		});
		await screen.findByRole("dialog");
		expect(fetchMock.mock.calls.filter(([url]) => url.includes("/context")).length).toBe(1);
	});

});

describe("Test runtime context generation", () => {
	const staleUpdatedAt = "2030-01-01T00:00:00.000Z";
	const freshUpdatedAt = "2030-01-01T00:00:05.000Z";
	const contextWith = (updatedAt: string) => ({ ...runtime().testContext, updatedAt });
	const decisionWith = (updatedAt: string) => ({
		...runtime(),
		testContext: { ...runtime().testContext, updatedAt, scheduleState: "active" as const },
	});
	const contextRequests = (fetchMock: ReturnType<typeof vi.fn>) =>
		fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/test-runtime/context")).length;
	function recordDiagnostics() {
		const codes: string[] = [];
		const listener = (event: Event) => codes.push((event as CustomEvent).detail.code);
		document.addEventListener("touchpointdiagnostic", listener);
		return { codes, stop: () => document.removeEventListener("touchpointdiagnostic", listener) };
	}
	/** The server's context and decisions each follow their own mutable generation. */
	function serverWith(state: { context: () => Response; decisionUpdatedAt: () => string }) {
		return vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("deployments")) return fetches()(url);
			if (init?.method === "POST") return state.context();
			return new Response(JSON.stringify(decisionWith(state.decisionUpdatedAt())));
		});
	}
	async function selectDeployment() {
		render(<TestCampaignHarness authenticated />);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
	}

	it("refetches a context the server replaced before the first decision and mounts", async () => {
		const contexts = [staleUpdatedAt, freshUpdatedAt];
		const fetchMock = serverWith({
			context: () => new Response(JSON.stringify(contextWith(contexts.shift() ?? freshUpdatedAt))),
			decisionUpdatedAt: () => freshUpdatedAt,
		});
		vi.stubGlobal("fetch", fetchMock);
		await selectDeployment();
		await screen.findByRole("dialog");
		expect(contextRequests(fetchMock)).toBe(2);
	});

	it("follows a context generation change while a campaign is displayed", async () => {
		let generation = staleUpdatedAt;
		const diagnostics = recordDiagnostics();
		const fetchMock = serverWith({
			context: () => new Response(JSON.stringify(contextWith(generation))),
			decisionUpdatedAt: () => generation,
		});
		vi.stubGlobal("fetch", fetchMock);
		await selectDeployment();
		await screen.findByRole("dialog");
		generation = freshUpdatedAt;
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(contextRequests(fetchMock)).toBe(2));
		await act(async () => {});
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(diagnostics.codes).not.toContain("touchpoint_decision_mismatch");
		diagnostics.stop();
	});

	it("publishes the refreshed context and decisions instead of renewing the stale generation", async () => {
		let generation = staleUpdatedAt;
		let published: ReturnType<typeof useTestRuntime> = null;
		function Probe() {
			published = useTestRuntime();
			return null;
		}
		const fetchMock = serverWith({
			context: () => new Response(JSON.stringify(contextWith(generation))),
			decisionUpdatedAt: () => generation,
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<Probe />);
		await selectDeployment();
		await screen.findByRole("dialog");
		await waitFor(() => expect(published?.context.updatedAt).toBe(staleUpdatedAt));
		generation = freshUpdatedAt;
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(published?.context.updatedAt).toBe(freshUpdatedAt));
		const decision = published!.decisions.get("opend.home.campaign-modal");
		expect(decision?.testContext.updatedAt).toBe(freshUpdatedAt);
		expect(published!.isAuthorized()).toBe(true);
		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("refetches at most once per attempt and stays closed while decisions keep disagreeing", async () => {
		const diagnostics = recordDiagnostics();
		const fetchMock = serverWith({
			context: () => new Response(JSON.stringify(contextWith(staleUpdatedAt))),
			decisionUpdatedAt: () => freshUpdatedAt,
		});
		vi.stubGlobal("fetch", fetchMock);
		await selectDeployment();
		await waitFor(() => expect(diagnostics.codes).toContain("touchpoint_decision_mismatch"));
		expect(contextRequests(fetchMock)).toBe(2);
		expect(screen.queryByRole("dialog")).toBeNull();
		diagnostics.stop();
	});

	it("fails closed when the server refuses the replacement context", async () => {
		const diagnostics = recordDiagnostics();
		const responses = [
			() => new Response(JSON.stringify(contextWith(staleUpdatedAt))),
			() => new Response(JSON.stringify({ error: "test_deployment_withdrawn" }), { status: 410 }),
		];
		const fetchMock = serverWith({
			context: () => (responses.shift() ?? responses[0]!)(),
			decisionUpdatedAt: () => freshUpdatedAt,
		});
		vi.stubGlobal("fetch", fetchMock);
		await selectDeployment();
		await waitFor(() => expect(diagnostics.codes).toContain("realtime_test_runtime_required"));
		expect(contextRequests(fetchMock)).toBe(2);
		expect(screen.queryByRole("dialog")).toBeNull();
		diagnostics.stop();
	});

	it("does not refetch the context for a mismatch the context cannot explain", async () => {
		const diagnostics = recordDiagnostics();
		const fetchMock = fetches({ ...runtime(), deploymentId: "deployment-other" });
		vi.stubGlobal("fetch", fetchMock);
		await selectDeployment();
		await waitFor(() => expect(diagnostics.codes).toContain("touchpoint_decision_mismatch"));
		expect(contextRequests(fetchMock)).toBe(1);
		expect(screen.queryByRole("dialog")).toBeNull();
		diagnostics.stop();
	});

	it("shares one context refetch across every placement that saw the old generation", async () => {
		const context = { deploymentId: "deployment-four", scenario: "realtime" as const };
		const deployment = {
			id: "deployment-four",
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: digest(JSON.stringify(allTestManifest)),
				artifactHash: "sha256:four-artifact",
				placementKeys: [...allTestPlacements],
			},
		};
		((globalThis as CampaignHostGlobal).__openDesignCampaignTestHost as { client: { osLocale: string } }).client.osLocale = "zh-CN";
		const contexts = [staleUpdatedAt, freshUpdatedAt];
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("acceptances")) return new Response(JSON.stringify({ id: "acceptance" }), { status: 201 });
			if (url.includes("/production-runtime")) return new Response(null, { status: 404 });
			if (init?.method === "POST")
				return new Response(JSON.stringify({ ...context, updatedAt: contexts.shift() ?? freshUpdatedAt }), { status: 201 });
			if (url.includes("/deployments")) return new Response(JSON.stringify({ deployments: [deployment] }));
			const placementKey = new URL(url, "http://127.0.0.1").searchParams.get("placementKey") as (typeof allTestPlacements)[number];
			return new Response(JSON.stringify({
				...runtime(fourPlacementContent(placementKey)),
				deploymentId: deployment.id,
				placementKey,
				activityId: deployment.activityId,
				snapshotHash: deployment.snapshotHash,
				artifactHash: deployment.snapshot.artifactHash,
				manifestHash: deployment.snapshot.manifestHash,
				requiredCapabilities: placementKey === "opend.home.campaign-modal" ? ["close", "static-action"] : placementKey === "opend.home.account-badge" ? ["static-action"] : ["hover", "static-action"],
				testContext: { ...context, updatedAt: freshUpdatedAt, scheduleState: "active" as const },
			}));
		});
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:test-four-placement", resourceUrls: new Map(), dispose: vi.fn() } as never);
		render(<><TestRuntimeProbe /><TestCampaignHarness authenticated /></>);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: deployment.id } });
		await waitFor(() => expect(screen.getByTestId("test-runtime-decision-count")).toHaveTextContent("4"));
		expect(contextRequests(fetchMock)).toBe(2);
	});

	it("withdraws at once when one placement answers 410 while a sibling hangs", async () => {
		const context = { deploymentId: "deployment-four", scenario: "realtime" as const, updatedAt: freshUpdatedAt };
		const deployment = {
			id: "deployment-four",
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: digest(JSON.stringify(allTestManifest)),
				artifactHash: "sha256:four-artifact",
				placementKeys: [...allTestPlacements],
			},
		};
		((globalThis as CampaignHostGlobal).__openDesignCampaignTestHost as { client: { osLocale: string } }).client.osLocale = "zh-CN";
		let withdrawn = false;
		const hung: AbortSignal[] = [];
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("acceptances")) return new Response(JSON.stringify({ id: "acceptance" }), { status: 201 });
			if (url.includes("/production-runtime")) return new Response(null, { status: 404 });
			if (init?.method === "POST") return new Response(JSON.stringify(context), { status: 201 });
			if (url.includes("/deployments")) return new Response(JSON.stringify({ deployments: [deployment] }));
			const placementKey = new URL(url, "http://127.0.0.1").searchParams.get("placementKey") as (typeof allTestPlacements)[number];
			if (withdrawn && placementKey === "opend.home.campaign-modal")
				return new Response(JSON.stringify({ error: "test_deployment_withdrawn" }), { status: 410 });
			if (withdrawn)
				return new Promise<Response>((_resolve, reject) => {
					hung.push(init!.signal!);
					init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
				});
			return new Response(JSON.stringify({
				...runtime(fourPlacementContent(placementKey)),
				deploymentId: deployment.id,
				placementKey,
				activityId: deployment.activityId,
				snapshotHash: deployment.snapshotHash,
				artifactHash: deployment.snapshot.artifactHash,
				manifestHash: deployment.snapshot.manifestHash,
				requiredCapabilities: placementKey === "opend.home.campaign-modal" ? ["close", "static-action"] : placementKey === "opend.home.account-badge" ? ["static-action"] : ["hover", "static-action"],
				testContext: { ...context, scheduleState: "active" as const },
			}));
		});
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:test-four-placement", resourceUrls: new Map(), dispose: vi.fn() } as never);
		render(<><TestRuntimeProbe /><TestCampaignHarness authenticated /></>);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: deployment.id } });
		await waitFor(() => expect(screen.getByTestId("test-runtime-decision-count")).toHaveTextContent("4"));
		withdrawn = true;
		window.dispatchEvent(new Event("focus"));
		// Well inside the lifecycle's 15-second request budget.
		await waitFor(() => expect(screen.getByTestId("test-runtime-decision-count")).toHaveTextContent("0"));
		expect(hung.length).toBeGreaterThan(0);
		expect(hung.every((signal) => signal.aborted)).toBe(true);
	});
});


describe("Test modal action dismissal", () => {
	it.each(["success", "failure", "stale", "unmounted", "hover"] as const)("handles %s", async (outcome) => {
		let dispatchAction!: (id: string) => Promise<void>;
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-campaign", resourceUrls: new Map(), dispose: vi.fn(),
		});
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async (_entry, _digest, _context, _urls, _actions, options) => {
				dispatchAction = options!.dispatchAction!;
			},
		);
		Object.defineProperty(navigator, "userActivation", { configurable: true, value: { isActive: true } });
		let finish!: (accepted: boolean) => void;
		vi.spyOn(campaignNavigation, "navigateCampaignTarget").mockImplementationOnce(() =>
			new Promise<boolean>((resolve) => { finish = resolve; }),
		);
		const decision = { ...runtime(), staticActions: [{ id: "plan", target: { kind: "https", url: "https://example.com" } }] } as TestDecision;
		const placement = outcome === "hover" ? "opend.home.hover-entry" : "opend.home.campaign-modal";
		decision.placementKey = placement;
		decision.content = { ...decision.content, placementKey: placement, manifest: {
			...decision.content.manifest, placements: [{ ...manifest.placements[0]!, key: placement, staticActions: decision.staticActions }],
		} };
		authorizeMount(decision);
		const close = vi.fn();
		const view = render(<TestTouchpointMount decision={decision} placementKey={placement} testId="action-mount" onVisible={vi.fn()} isAuthorized={() => true} requestClose={close} />);
		await waitFor(() => expect(dispatchAction).toBeTypeOf("function"));
		const completion = dispatchAction("plan").catch((error: Error) => error.message);
		expect(close).not.toHaveBeenCalled();
		if (outcome === "stale") authorizeMount({ ...decision });
		if (outcome === "unmounted") view.unmount();
		let result: unknown;
		await act(async () => { finish(outcome !== "failure"); result = await completion; });
		expect(close).toHaveBeenCalledTimes(outcome === "success" ? 1 : 0);
		if (outcome === "failure") expect(result).toBe("touchpoint_action_denied");
	});
});


describe("negotiated immutable Test context", () => {
	const identity = (seed = "one") => ({
		contextId: `ctx-v1:${createHash("sha256").update("deployment-1/account-a/realtime").digest("hex")}`,
		generation: "7",
		contextToken: `ctx-token-v1:${createHash("sha256").update(seed).digest("hex")}`,
	});
	const context = (seed = "one") => ({ ...runtime().testContext, testerMemberId: "account-a", ...identity(seed) });
	const decision = (seed = "one"): TestDecision => ({ ...runtime() as TestDecision, testContext: context(seed) });
	const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
	const contextCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.filter(([url]) => String(url).endsWith("/context")).length;
	const runtimeCalls = (mock: ReturnType<typeof vi.fn>) => mock.mock.calls.filter(([url]) => String(url).includes("test-runtime?"));
	let diagnostics: Array<{ code: string; detail?: string }>;
	let latest: ReturnType<typeof useTestRuntime>;
	const diagnostic = (event: Event) => diagnostics.push((event as CustomEvent).detail);
	function Probe() { latest = useTestRuntime(); return null; }
	beforeEach(() => {
		diagnostics = []; latest = null;
		document.addEventListener("touchpointdiagnostic", diagnostic);
	});
	afterEach(() => document.removeEventListener("touchpointdiagnostic", diagnostic));
	function server(options: { context?: () => Response | Promise<Response>; decision?: (url: string, init?: RequestInit) => Response | Promise<Response> } = {}) {
		const base = fetches();
		return vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("/deployments")) return base(url);
			if (url.endsWith("/context")) return options.context ? options.context() : json(context());
			if (url.includes("/acceptances")) return json({ id: "accepted" }, 201);
			if (url.includes("/production-runtime")) return new Response(null, { status: 404 });
			return options.decision ? options.decision(url, init) : json(decision());
		});
	}
	async function start(owner: string | null = "account-a") {
		const view = render(<><Probe /><TestCampaignHarness authenticated sessionSubject={owner} /></>);
		await screen.findByTestId("touchpoint-test-selector");
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		return view;
	}
	async function failed() {
		await waitFor(() => expect(screen.getByTestId("touchpoint-test-clock")).toHaveTextContent("error"));
		expect(screen.queryByRole("dialog")).toBeNull();
	}

	it("binds a distinct workspace member to the authenticated app user without weakening context matching", async () => {
		const bound = { ...context(), testerMemberId: "workspace-member", testerAppUserId: "account-a" };
		const next = { ...decision(), testContext: bound };
		vi.stubGlobal("fetch", server({ context: () => json(bound), decision: () => json(next) }));
		await start(); await screen.findByRole("dialog");
		expect(isSelectedTestCampaignDecision({ ...next, testContext: { ...bound, testerAppUserId: "account-b" } }, bound)).toBe(false);
		expect(isSelectedTestCampaignDecision({ ...next, testContext: { ...bound, testerMemberId: "foreign-member" } }, bound)).toBe(false);
	});

	it.each(["account-b", "", null])("refuses a foreign or malformed authenticated tester app user %s", async testerAppUserId => {
		const bound = { ...context(), testerMemberId: "workspace-member", testerAppUserId };
		const mock = server({ context: () => json(bound) }); vi.stubGlobal("fetch", mock);
		await start(); await failed(); expect(runtimeCalls(mock)).toHaveLength(0);
	});

	it("sends the acquired token on cold start and compares every immutable field", async () => {
		const mock = server(); vi.stubGlobal("fetch", mock);
		await start(); await screen.findByRole("dialog");
		expect(new URL(String(runtimeCalls(mock)[0]![0]), "http://localhost").searchParams.get("contextToken")).toBe(context().contextToken);
		for (const field of ["contextId", "generation", "contextToken"] as const) {
			const other = { ...decision(), testContext: { ...context(), [field]: field === "generation" ? "8" : identity("two").contextToken } };
			expect(isSelectedTestCampaignDecision(other, context())).toBe(false);
		}
		expect(isSelectedTestCampaignDecision({ ...decision(), testContext: { ...context(), updatedAt: "2030-01-01T00:00:05.000Z" } }, context())).toBe(true);
	});

	it("repairs an equal-timestamp token mismatch once and records redacted correlated recovery", async () => {
		let posts = 0;
		const mock = server({ context: () => json(context(++posts === 1 ? "one" : "two")), decision: () => json(decision("two")) });
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog");
		expect(contextCalls(mock)).toBe(2); expect(runtimeCalls(mock)).toHaveLength(2);
		expect(latest?.context).toMatchObject(identity("two"));
		const drift = diagnostics.find(item => item.code === "touchpoint_test_context_drift");
		expect(drift).toBeDefined();
		const detail = JSON.parse(drift!.detail!);
		expect(detail).toMatchObject({ mode: "immutable", reason: "context_token_mismatch", retry: 1 });
		expect(detail.correlation).toEqual(expect.any(String));
		expect(detail.expected.context).toMatchObject({ contextId: context().contextId, generation: "7", tokenFingerprint: expect.any(String) });
		expect(drift!.detail).not.toContain(context().contextToken);
		expect(drift!.detail).not.toContain(context("two").contextToken);
	});

	it("ignores timestamp-only drift without refreshing or rebuilding a healthy host", async () => {
		let timestamp = context().updatedAt;
		const mock = server({ decision: () => json({ ...decision(), testContext: { ...context(), updatedAt: timestamp } }) });
		vi.stubGlobal("fetch", mock); await start(); const dialog = await screen.findByRole("dialog");
		const mounted = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock.calls.length;
		timestamp = "2030-01-01T00:00:05.000Z";
		act(() => window.dispatchEvent(new Event("focus")));
		await waitFor(() => expect(runtimeCalls(mock)).toHaveLength(2)); await act(async () => {});
		expect(contextCalls(mock)).toBe(1); expect(screen.getByRole("dialog")).toBe(dialog);
		expect(vi.mocked(OpenDesignTouchpointElement.prototype.mount)).toHaveBeenCalledTimes(mounted);
		expect(diagnostics.filter(item => item.code.includes("mismatch") || item.code.includes("drift"))).toEqual([]);
	});

	// OPEND-4143: the server-authenticated tester is a workspace member id, a
	// different identifier from the app account id passed as sessionSubject.
	it("accepts a valid context whose tester member id differs from the account id", async () => {
		const member = (seed = "one") => ({ ...context(seed), testerMemberId: "member-z0" });
		const mock = server({ context: () => json(member()), decision: () => json({ ...decision(), testContext: member() }) });
		vi.stubGlobal("fetch", mock); await start("account-a"); await screen.findByRole("dialog");
		expect(contextCalls(mock)).toBe(1); expect(latest?.context.testerMemberId).toBe("member-z0");
		expect(diagnostics.some(item => item.code === "touchpoint_decision_mismatch")).toBe(false);
	});

	it("recovers 409 drift for a tester member id that differs from the account id", async () => {
		let posts = 0;
		const member = (seed: string) => ({ ...context(seed), testerMemberId: "member-z0" });
		const mock = server({ context: () => json(member(++posts === 1 ? "one" : "two")), decision: url => {
			const token = new URL(url, "http://localhost").searchParams.get("contextToken");
			return token === context("two").contextToken
				? json({ ...decision("two"), testContext: member("two") })
				: json({ error: "test_context_mismatch", reason: "context_token_mismatch", testContext: member("two") }, 409);
		} });
		vi.stubGlobal("fetch", mock); await start("account-a"); await screen.findByRole("dialog");
		expect(contextCalls(mock)).toBe(2); expect(latest?.context).toMatchObject({ ...identity("two"), testerMemberId: "member-z0" });
		expect(diagnostics.some(item => item.code === "touchpoint_decision_mismatch")).toBe(false);
	});

	it("discards a late context acquired for the previous account", async () => {
		let posts = 0, finish!: (response: Response) => void;
		const late = new Promise<Response>(resolve => { finish = resolve; });
		const mock = server({ context: () => ++posts === 1 ? late : new Promise<Response>(() => {}) });
		vi.stubGlobal("fetch", mock);
		const view = await start("account-a");
		await waitFor(() => expect(contextCalls(mock)).toBe(1));
		view.rerender(<><Probe /><TestCampaignHarness authenticated sessionSubject="account-b" /></>);
		await act(async () => { finish(json({ ...context(), testerMemberId: "member-a" })); });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(runtimeCalls(mock)).toHaveLength(0);
		expect(latest?.decisions.size ?? 0).toBe(0);
	});

	it("rejects a re-acquired context that switches tester within one selection", async () => {
		let posts = 0;
		const member = (seed: string, tester: string) => ({ ...context(seed), testerMemberId: tester });
		const mock = server({
			context: () => json(++posts === 1 ? member("one", "member-1") : member("two", "member-2")),
			decision: () => json({ ...decision("two"), testContext: member("two", "member-1") }),
		});
		vi.stubGlobal("fetch", mock); await start(); await failed();
		expect(contextCalls(mock)).toBe(2);
		expect(diagnostics.some(item => item.code === "touchpoint_decision_mismatch")).toBe(true);
	});

	it.each(["contextId", "generation", "contextToken", "testerMemberId", "invalid-token"])("fails closed for acquired %s identity", async field => {
		const malformed: Record<string, unknown> = { ...context() };
		if (field === "invalid-token") malformed.contextToken = "credential-like-value";
		else delete malformed[field];
		const mock = server({ context: () => json(malformed) }); vi.stubGlobal("fetch", mock);
		await start(); await failed(); expect(runtimeCalls(mock)).toHaveLength(0);
		expect(diagnostics.some(item => item.code === "touchpoint_decision_mismatch")).toBe(true);
	});

	it.each(["downgrade", "partial", "wrong-tester", "wrong-snapshot", "wrong-placement", "wrong-actions", "wrong-deployment", "wrong-activity", "wrong-content", "wrong-manifest", "wrong-artifact", "wrong-capabilities", "invalid-time"])("never refreshes a %s decision even with context drift", async kind => {
		const value: Record<string, unknown> = { ...decision("two") };
		if (kind === "downgrade") value.testContext = { ...runtime().testContext, testerMemberId: "account-a" };
		if (kind === "partial") value.testContext = { ...context("two"), generation: undefined };
		if (kind === "wrong-tester") value.testContext = { ...context("two"), testerMemberId: "account-b" };
		if (kind === "wrong-snapshot") value.snapshotHash = "foreign";
		if (kind === "wrong-placement") value.placementKey = "opend.home.hover-entry";
		if (kind === "wrong-actions") value.staticActions = [{ id: "foreign", target: { kind: "https", url: "https://example.com" } }];
		if (kind === "wrong-deployment") value.deploymentId = "foreign";
		if (kind === "wrong-activity") value.activityId = "foreign";
		if (kind === "wrong-content") value.content = { ...content, id: "foreign" };
		if (kind === "wrong-manifest") value.manifestHash = "foreign";
		if (kind === "wrong-artifact") value.artifactHash = "foreign";
		if (kind === "wrong-capabilities") value.requiredCapabilities = ["unsupported"];
		if (kind === "invalid-time") value.serverTime = "malformed";
		const mock = server({ decision: () => json(value) }); vi.stubGlobal("fetch", mock);
		await start(); await failed(); expect(contextCalls(mock)).toBe(1);
	});

	it("bounds mismatch diagnostics to scalars and excludes malformed tokens, credentials and whole objects", async () => {
		const secret = "Bearer credential-value-must-never-be-logged";
		const mock = server({ decision: () => json({ ...decision(), snapshotHash: "x".repeat(10_000),
			testContext: { ...context(), contextId: secret, contextToken: secret, testerMemberId: { authorization: secret } },
			authorization: secret, controlKey: secret, resources: [{ bytes: secret }],
		}) });
		vi.stubGlobal("fetch", mock); await start(); await failed();
		const mismatch = diagnostics.find(item => item.code === "touchpoint_decision_mismatch")!;
		expect(mismatch.detail).not.toContain(secret); expect(mismatch.detail!.length).toBeLessThan(4_096);
		const detail = JSON.parse(mismatch.detail!);
		expect(detail.received.snapshotHash).toHaveLength(256);
		expect(detail.received.context).toMatchObject({ testerMemberId: null, contextId: null, tokenFingerprint: null });
		expect(contextCalls(mock)).toBe(1);
	});

	it("pins legacy mode and refuses an unsolicited immutable decision upgrade", async () => {
		const mock = server({ context: () => json(runtime().testContext) }); vi.stubGlobal("fetch", mock);
		await start(); await failed(); expect(contextCalls(mock)).toBe(1);
		expect(new URL(String(runtimeCalls(mock)[0]![0]), "http://localhost").searchParams.has("contextToken")).toBe(false);
	});

	it("reacquires typed 409 metadata without treating it as a display grant", async () => {
		let posts = 0, finish!: (response: Response) => void;
		const replacement = new Promise<Response>(resolve => { finish = resolve; });
		const mock = server({ context: () => ++posts === 1 ? json(context()) : replacement, decision: url => {
			const token = new URL(url, "http://localhost").searchParams.get("contextToken");
			return token === context("two").contextToken ? json(decision("two")) : json({ error: "test_context_mismatch", reason: "context_token_mismatch", testContext: context("two") }, 409);
		} });
		vi.stubGlobal("fetch", mock); await start();
		await waitFor(() => expect(contextCalls(mock)).toBe(2)); expect(latest?.decisions.size ?? 0).toBe(0);
		await act(async () => { finish(json(context("two"))); }); await screen.findByRole("dialog");
		expect(runtimeCalls(mock)).toHaveLength(2);
	});

	it.each(["foreign-tester", "foreign-deployment", "partial", "wrong-error", "unchanged"])("rejects %s 409 metadata without refreshing", async kind => {
		const value: Record<string, unknown> = { ...context("two") };
		if (kind === "foreign-tester") value.testerMemberId = "account-b";
		if (kind === "foreign-deployment") value.deploymentId = "other";
		if (kind === "partial") delete value.contextId;
		const mock = server({ decision: () => json({ error: kind === "wrong-error" ? "conflict" : "test_context_mismatch", reason: "context_token_mismatch", testContext: kind === "unchanged" ? context() : value }, 409) });
		vi.stubGlobal("fetch", mock); await start(); await failed(); expect(contextCalls(mock)).toBe(1);
	});

	it("bounds a repeatedly stale immutable server to one replacement round", async () => {
		const mock = server({ decision: () => json(decision("two")) }); vi.stubGlobal("fetch", mock);
		await start(); await failed(); expect(contextCalls(mock)).toBe(2); expect(runtimeCalls(mock)).toHaveLength(2);
		const terminal = diagnostics.find(item => item.code === "touchpoint_decision_mismatch");
		expect(JSON.parse(terminal!.detail!)).toMatchObject({ mode: "immutable", reason: "context_token_mismatch", retry: 1 });
	});

	it("follows live immutable identity drift without relying on updatedAt", async () => {
		let current = "one";
		const mock = server({ context: () => json(context(current)), decision: () => json(decision(current)) });
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog");
		current = "two"; act(() => window.dispatchEvent(new Event("focus")));
		await waitFor(() => expect(latest?.context).toMatchObject(identity("two")));
		expect(contextCalls(mock)).toBe(2); expect(latest?.isAuthorized()).toBe(true);
	});

	it.each(["contextId", "generation"] as const)("compares %s independently of token and timestamp", async field => {
		const changed = { ...context(), [field]: field === "generation" ? "8" : `ctx-v1:${"b".repeat(64)}` };
		let posts = 0;
		const mock = server({ context: () => json(++posts === 1 ? context() : changed), decision: () => json({ ...decision(), testContext: changed }) });
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog");
		expect(contextCalls(mock)).toBe(2); expect(latest?.context).toMatchObject(changed);
	});

	it("rejects changed schedule bounds with token drift without reacquiring context", async () => {
		let changed = false;
		const mock = server({ decision: () => json(changed ? { ...decision("two"), endsAt: "2030-01-01T02:00:00.000Z" } : decision()) });
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog");
		changed = true; act(() => window.dispatchEvent(new Event("focus")));
		await failed(); expect(contextCalls(mock)).toBe(1);
	});

	it("never negotiates immutable identity without a current authenticated tester", async () => {
		const mock = server(); vi.stubGlobal("fetch", mock); await start(null); await failed();
		expect(runtimeCalls(mock)).toHaveLength(0);
	});

	it("rejects an immutable replacement POST downgrade after the one allowed refresh", async () => {
		let posts = 0;
		const mock = server({ context: () => json(++posts === 1 ? context() : runtime().testContext), decision: () => json(decision("two")) });
		vi.stubGlobal("fetch", mock); await start(); await failed();
		expect(contextCalls(mock)).toBe(2); expect(runtimeCalls(mock)).toHaveLength(1);
	});

	it("gives two independently acquired clients the same immutable identity despite clock metadata", async () => {
		let timestamp = context().updatedAt;
		const mock = server({ context: () => json({ ...context(), updatedAt: timestamp }) });
		vi.stubGlobal("fetch", mock); const first = await start(); await screen.findByRole("dialog");
		const firstIdentity = latest!.context; first.unmount(); clearTestRuntimeSession();
		timestamp = "2030-01-01T00:00:05.000Z";
		await start(); await screen.findByRole("dialog");
		expect(latest!.context).toMatchObject(identity()); expect(firstIdentity).toMatchObject(identity());
		expect(latest!.context.updatedAt).not.toBe(firstIdentity.updatedAt);
		expect(contextCalls(mock)).toBe(2); expect(runtimeCalls(mock)).toHaveLength(2);
	});

	it("keeps retained immutable decisions when remount context changes only updatedAt", async () => {
		let timestamp = context().updatedAt;
		const mock = server({ context: () => json({ ...context(), updatedAt: timestamp }) });
		vi.stubGlobal("fetch", mock); const first = await start(); await screen.findByRole("dialog");
		const held = latest!.decisions.get("opend.home.campaign-modal"); first.unmount();
		timestamp = "2030-01-01T00:00:05.000Z";
		render(<><Probe /><TestCampaignHarness authenticated /></>);
		await screen.findByRole("dialog"); await waitFor(() => expect(contextCalls(mock)).toBe(2)); await act(async () => {});
		expect(latest!.decisions.get("opend.home.campaign-modal")).toBe(held);
		expect(runtimeCalls(mock)).toHaveLength(2);
	});

	it.each([401, 403, 410])("treats HTTP %s as terminal withdrawal even when the body claims token drift", async status => {
		let refused = false;
		const mock = server({ decision: () => refused ? json({ error: "test_context_mismatch", reason: "context_token_mismatch", testContext: context("two") }, status) : json(decision()) });
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog");
		refused = true; act(() => window.dispatchEvent(new Event("focus")));
		await failed(); expect(contextCalls(mock)).toBe(1); expect(latest?.decisions.size ?? 0).toBe(0);
	});

	it("fails closed on an unrepaired live token mismatch rather than retaining an old display grant", async () => {
		let drift = false;
		const mock = server({ decision: () => json(decision(drift ? "two" : "one")) });
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog");
		drift = true; act(() => window.dispatchEvent(new Event("focus")));
		await failed(); expect(latest?.decisions.size ?? 0).toBe(0); expect(contextCalls(mock)).toBe(2);
	});

	it.each(["network", "empty body", "null body", "unreadable JSON"])("preserves only the original short immutable grant after a %s renewal failure", async failure => {
		vi.useFakeTimers();
		let offline = false;
		const mock = server({ decision: async () => {
			if (!offline) return json(decision());
			if (failure === "empty body") return json({});
			if (failure === "null body") return json(null);
			if (failure === "unreadable JSON") return new Response("{", { status: 200 });
			throw new TypeError("Failed to fetch");
		} });
		vi.stubGlobal("fetch", mock); render(<><Probe /><TestCampaignHarness authenticated /></>);
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		await act(async () => { await vi.advanceTimersByTimeAsync(0); }); expect(latest?.decisions.size).toBe(1);
		offline = true;
		await act(async () => { await vi.advanceTimersByTimeAsync(59_999); }); expect(latest?.decisions.size).toBe(1);
		await act(async () => { await vi.advanceTimersByTimeAsync(1); }); expect(latest?.decisions.size ?? 0).toBe(0);
		expect(contextCalls(mock)).toBe(1);
	});

	it.each(["context-fetch", "context-body", "decision-fetch", "decision-body", "409-body"])("fences late %s on activity switch even when abort is ignored", async stage => {
		let release!: (value: unknown) => void;
		const late = new Promise<unknown>(resolve => { release = resolve; });
		let oldStarted!: () => void;
		const started = new Promise<void>(resolve => { oldStarted = resolve; });
		const base = fetches();
		const oldSignals: AbortSignal[] = [];
		const mock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
			if (url.includes("/deployments")) {
				const body = await (await base(url)).json();
				body.deployments.push({ ...body.deployments[0], id: "deployment-2", activityId: "activity-2" }); return json(body);
			}
			if (url.includes("/acceptances")) return json({ id: "accepted" }, 201);
			if (url.includes("/production-runtime")) return new Response(null, { status: 404 });
			const isContext = url.endsWith("/context");
			const deploymentId = isContext ? JSON.parse(String(init?.body)).deploymentId : new URL(url, "http://localhost").searchParams.get("deploymentId");
			const selectedContext = { ...context(deploymentId), deploymentId };
			const value = { ...decision(deploymentId), deploymentId, activityId: deploymentId === "deployment-1" ? "activity-1" : "activity-2", testContext: selectedContext };
			if (deploymentId === "deployment-1" && ((isContext && stage.startsWith("context")) || (!isContext && !stage.startsWith("context")))) {
				oldSignals.push(init!.signal!); oldStarted();
				return stage.endsWith("fetch") ? late as Promise<Response> : { ok: stage !== "409-body", status: stage === "409-body" ? 409 : 200, json: () => late } as Response;
			}
			return json(isContext ? selectedContext : value);
		});
		vi.stubGlobal("fetch", mock); await start(); await started;
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-2" } });
		await screen.findByRole("dialog"); expect(latest?.deployment.id).toBe("deployment-2");
		const acquired = latest!.context; const mounted = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock.calls.length;
		const oldValue = stage.startsWith("context") ? context("deployment-1") : stage === "409-body"
			? { error: "test_context_mismatch", reason: "context_token_mismatch", testContext: context("foreign") } : decision("deployment-1");
		await act(async () => { release(stage.endsWith("fetch") ? json(oldValue) : oldValue); await late; });
		expect(oldSignals.every(signal => signal.aborted)).toBe(true); expect(latest!.context).toBe(acquired);
		expect(latest?.deployment.id).toBe("deployment-2"); expect(vi.mocked(OpenDesignTouchpointElement.prototype.mount)).toHaveBeenCalledTimes(mounted);
		expect(diagnostics.filter(item => item.code.includes("mismatch") || item.code.includes("drift"))).toEqual([]);
	});

	it.each(["success", "failure"])("fences a parsed old-account context %s before requesting decisions", async outcome => {
		let release!: (value: unknown) => void;
		const late = new Promise<unknown>(resolve => { release = resolve; });
		let parsing!: () => void; const parsed = new Promise<void>(resolve => { parsing = resolve; });
		const mock = server({ context: () => { parsing(); return { ok: true, json: async () => { await late; if (outcome === "failure") throw new Error("old_account_parse_failure"); return context(); } } as Response; } });
		vi.stubGlobal("fetch", mock); const view = await start(); await parsed;
		view.rerender(<><Probe /><TestCampaignHarness authenticated sessionSubject="account-b" /></>);
		await act(async () => { release(context()); await late; });
		expect(latest?.decisions.size ?? 0).toBe(0); expect(runtimeCalls(mock)).toHaveLength(0); expect(screen.getByLabelText("Test activity")).toHaveValue("");
		expect(diagnostics.some(item => item.code === "old_account_parse_failure")).toBe(false);
	});

	/** All independent presentations share acquisition, but retain their own lease and host. */
	function multiServer(reply: (key: (typeof allTestPlacements)[number], token: string | null, init?: RequestInit) => Response | Promise<Response>, acquire: () => Response = () => json(context())) {
		const deployment = { id: "deployment-1", activityId: "activity-1", snapshotHash: "sha256:test-snapshot", snapshot: {
			contentVersionId: "version-four-placement", manifestHash: digest(JSON.stringify(allTestManifest)), artifactHash: "sha256:test-artifact", placementKeys: [...allTestPlacements],
		} };
		return vi.fn(async (url: string, init?: RequestInit) => {
			if (url.includes("/deployments")) return json({ deployments: [deployment] });
			if (url.endsWith("/context")) return acquire();
			if (url.includes("/acceptances")) return json({ id: "accepted" }, 201);
			if (url.includes("/production-runtime")) return new Response(null, { status: 404 });
			const query = new URL(url, "http://localhost").searchParams;
			return reply(query.get("placementKey") as (typeof allTestPlacements)[number], query.get("contextToken"), init);
		});
	}
	const multiDecision = (key: (typeof allTestPlacements)[number], seed = "one") => ({
		...decision(seed), placementKey: key, content: fourPlacementContent(key), manifestHash: digest(JSON.stringify(allTestManifest)),
		requiredCapabilities: key === "opend.home.campaign-modal" ? ["close", "static-action"] : key === "opend.home.account-badge" ? ["static-action"] : ["hover", "static-action"],
	});
	function multiSetup() {
		((globalThis as CampaignHostGlobal).__openDesignCampaignTestHost as { client: { osLocale: string } }).client.osLocale = "zh-CN";
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({ entryUrl: "blob:immutable", resourceUrls: new Map(), dispose: vi.fn() });
	}

	it("single-flights one 409 refresh across presentations and ignores late old-round decision bodies", async () => {
		multiSetup();
		let posts = 0, release!: (value: unknown) => void;
		const late = new Promise<unknown>(resolve => { release = resolve; });
		const oldSignals: AbortSignal[] = [];
		const mock = multiServer((key, token, init) => {
			if (token === context("two").contextToken) return json(multiDecision(key, "two"));
			oldSignals.push(init!.signal!);
			if (key === "opend.home.campaign-modal") return json({ error: "test_context_mismatch", reason: "context_token_mismatch", testContext: context("two") }, 409);
			return { ok: true, status: 200, json: () => late } as Response;
		}, () => json(context(++posts === 1 ? "one" : "two")));
		vi.stubGlobal("fetch", mock); await start(); await waitFor(() => expect(latest?.decisions.size).toBe(4));
		expect(contextCalls(mock)).toBe(2); expect(runtimeCalls(mock)).toHaveLength(8);
		const held = latest!; const mounted = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock.calls.length;
		await act(async () => { release(multiDecision("opend.home.account-badge")); await late; });
		expect(oldSignals.every(signal => signal.aborted)).toBe(true); expect(latest?.context).toBe(held.context);
		expect(latest?.decisions.get("opend.home.account-badge")).toBe(held.decisions.get("opend.home.account-badge"));
		expect(vi.mocked(OpenDesignTouchpointElement.prototype.mount)).toHaveBeenCalledTimes(mounted);
		expect(diagnostics.filter(item => item.code === "touchpoint_test_context_drift")).toHaveLength(1);
	});

	it("isolates immutable presentation failures without hiding or remounting healthy hosts, and keeps hover atomic", async () => {
		multiSetup();
		let failing = false;
		const mock = multiServer(key => failing && (key === "opend.home.account-badge" || key === "opend.home.hover-entry")
			? Promise.reject(new TypeError("Failed to fetch")) : json(multiDecision(key)));
		vi.stubGlobal("fetch", mock); await start(); await screen.findByRole("dialog"); await waitFor(() => expect(latest?.decisions.size).toBe(4));
		const dialog = screen.getByRole("dialog"); const heldModal = latest!.decisions.get("opend.home.campaign-modal");
		const mounted = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock.calls.length;
		failing = true; act(() => window.dispatchEvent(new Event("focus")));
		await waitFor(() => expect(latest?.decisions.size).toBe(1));
		expect(latest!.decisions.has("opend.home.hover-layer")).toBe(false);
		expect(latest!.decisions.get("opend.home.campaign-modal")).toBe(heldModal); expect(screen.getByRole("dialog")).toBe(dialog);
		expect(vi.mocked(OpenDesignTouchpointElement.prototype.mount)).toHaveBeenCalledTimes(mounted); expect(contextCalls(mock)).toBe(1);
	});

	it("withdraws immutable siblings immediately and refuses a late abort-ignoring body after 410", async () => {
		multiSetup();
		let withdrawn = false, release!: (value: unknown) => void;
		const late = new Promise<unknown>(resolve => { release = resolve; }); const hung: AbortSignal[] = [];
		const mock = multiServer((key, _token, init) => {
			if (!withdrawn) return json(multiDecision(key));
			if (key === "opend.home.campaign-modal") return json({ error: "test_deployment_withdrawn" }, 410);
			hung.push(init!.signal!); return { ok: true, status: 200, json: () => late } as Response;
		});
		vi.stubGlobal("fetch", mock); await start(); await waitFor(() => expect(latest?.decisions.size).toBe(4));
		withdrawn = true; act(() => window.dispatchEvent(new Event("focus")));
		await waitFor(() => expect(latest?.decisions.size ?? 0).toBe(0)); expect(hung.length).toBeGreaterThan(0);
		await act(async () => { release(multiDecision("opend.home.account-badge")); await late; });
		expect(hung.every(signal => signal.aborted)).toBe(true); expect(latest?.decisions.size ?? 0).toBe(0); expect(contextCalls(mock)).toBe(1);
	});

	it.each(["fetch", "body"])("fences a late context %s after timeout while a fresh attempt owns the context", async stage => {
		vi.useFakeTimers();
		let resolveOld!: (value: Response | unknown) => void;
		const old = new Promise<Response | unknown>(resolve => { resolveOld = resolve; });
		let posts = 0;
		const mock = server({ context: () => ++posts === 1 ? (stage === "fetch" ? old as Promise<Response> : { ok: true, json: () => old } as Response) : json(context("two")), decision: () => json(decision("two")) });
		vi.stubGlobal("fetch", mock);
		const view = render(<><Probe /><TestCampaignHarness authenticated /></>);
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		fireEvent.change(screen.getByLabelText("Test activity"), { target: { value: "deployment-1" } });
		await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
		act(() => window.dispatchEvent(new Event("focus")));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(contextCalls(mock)).toBe(2); expect(latest?.context).toMatchObject(identity("two"));
		await act(async () => { resolveOld(stage === "fetch" ? json(context()) : context()); await old; });
		act(() => window.dispatchEvent(new Event("focus")));
		await act(async () => { await vi.advanceTimersByTimeAsync(0); });
		expect(latest?.context).toMatchObject(identity("two")); expect(contextCalls(mock)).toBe(2);
		expect(runtimeCalls(mock).every(([url]) => new URL(String(url), "http://localhost").searchParams.get("contextToken") === context("two").contextToken)).toBe(true);
		view.unmount();
	});
});


it("recovers a real same-content Test modal mount with a fresh null-decision attempt and original acceptance schema", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  const mount = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mockRejectedValueOnce(new Error('mount failed'));
  const facts = () => vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([record]) => record);
  const base = fetches(); let requests = 0;
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/test-runtime?')) {
      requests++;
      expect(facts().filter(record => record.kind === 'start')).toHaveLength(Math.min(requests, 2));
    }
    if (url.endsWith('/acceptances')) return new Response('{}');
    return base(url);
  });
  vi.stubGlobal('fetch', transport);
  render(<TestCampaignHarness authenticated />);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: 'deployment-1' } });
  await waitFor(() => expect(facts().some(record => record.result === 'failed')).toBe(true));
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(mount.mock.calls.length).toBeGreaterThanOrEqual(2));
  await waitFor(() => expect(facts().some(record => record.result === 'visible')).toBe(true));
  const starts = facts().filter(record => record.kind === 'start');
  const terminals = facts().filter(record => record.kind === 'terminal');
  expect(starts).toHaveLength(2); expect(terminals).toHaveLength(2);
  expect(new Set(terminals.map(record => record.load_attempt_id)).size).toBe(2);
  expect(terminals.every(record => record.decision_id === null)).toBe(true);
  const acceptance = transport.mock.calls.filter(([url]) => url.endsWith('/acceptances'));
  expect(acceptance).toHaveLength(1);
  expect(JSON.parse(String(acceptance[0]![1]?.body))).not.toHaveProperty('eventId');
  expect(transport.mock.calls.some(([url]) => url.endsWith('/production-runtime/events'))).toBe(false);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(facts().filter(record => record.kind === 'start')).toHaveLength(2);
  expect(facts().filter(record => record.kind === 'terminal')).toHaveLength(2);
  expect(transport.mock.calls.filter(([url]) => url.endsWith('/acceptances'))).toHaveLength(1);
});

it('OBS-004 records a body transfer failure with received status and one terminal', async () => {
  const base = fetches();
  const error = new TypeError('body stream interrupted at private URL');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.includes('/test-runtime?')) return base(url);
    const response = Response.json(runtime());
    vi.spyOn(response, 'text').mockRejectedValue(error);
    return response;
  }));
  render(<TestCampaignHarness authenticated />);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: 'deployment-1' } });
  const facts = () => vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([record]) => record);
  await waitFor(() => expect(facts().some(record => record.result === 'failed')).toBe(true));
  const terminals = facts().filter(record => record.kind === 'terminal');
  expect(terminals).toHaveLength(1);
  expect(terminals[0]).toMatchObject({ result: 'failed', failure_stage: 'transfer', error_code: 'network_error', http_status: 200 });
  expect(error).toBeInstanceOf(TypeError);
  expect(JSON.stringify(facts())).not.toContain('private URL');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('OBS-004 preserves an active body AbortError without adding transfer metadata', async () => {
  const base = fetches();
  const error = new DOMException('aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.includes('/test-runtime?')) return base(url);
    const response = Response.json(runtime());
    vi.spyOn(response, 'text').mockRejectedValue(error);
    return response;
  }));
  render(<TestCampaignHarness authenticated />);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: 'deployment-1' } });
  const facts = () => vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([record]) => record);
  await waitFor(() => expect(facts().filter(record => record.kind === 'terminal')).toHaveLength(1));
  expect(error.name).toBe('AbortError');
  expect(error).not.toHaveProperty('failure_stage');
  expect(error).not.toHaveProperty('error_code');
  expect(facts().some(record => record.failure_stage === 'transfer')).toBe(false);
});

it('OBS-004 preserves a late body AbortError after unmount without classifying cancellation as transfer failure', async () => {
  const base = fetches();
  const error = new DOMException('aborted', 'AbortError');
  let rejectBody!: (error: unknown) => void;
  const text = vi.fn(() => new Promise<string>((_resolve, reject) => { rejectBody = reject; }));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (!url.includes('/test-runtime?')) return base(url);
    const response = Response.json(runtime());
    vi.spyOn(response, 'text').mockImplementation(text);
    return response;
  }));
  const view = render(<TestCampaignHarness authenticated />);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: 'deployment-1' } });
  await waitFor(() => expect(text).toHaveBeenCalledOnce());
  view.unmount();
  await act(async () => { rejectBody(error); });
  expect(error.name).toBe('AbortError');
  expect(error).not.toHaveProperty('failure_stage');
  const facts = vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([record]) => record);
  expect(facts.filter(record => record.kind === 'terminal')).toHaveLength(1);
  expect(facts.some(record => record.result === 'failed')).toBe(false);
});

it.each(['http', 'json'] as const)('records the actual Test runtime %s failure at its source stage', async kind => {
  const base = fetches();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/test-runtime?') ? kind === 'http'
    ? Response.json({ error: 'resource_unavailable', failure_stage: 'resource_read', error_code: 'http_error', detail: 'private upstream URL' }, { status: 503 })
    : new Response('{', { status: 200 }) : base(url)));
  render(<TestCampaignHarness authenticated />);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: 'deployment-1' } });
  const facts = () => vi.mocked(touchpointLoadQueue('test').enqueue).mock.calls.map(([record]) => record);
  await waitFor(() => expect(facts().some(record => record.result === 'failed')).toBe(true));
  expect(facts().find(record => record.result === 'failed')).toMatchObject(kind === 'http'
    ? { failure_stage: 'resource_read', error_code: 'http_error', http_status: 503 }
    : { failure_stage: 'decode_validate', error_code: 'decode_error', http_status: null });
  expect(JSON.stringify(facts())).not.toContain('private upstream URL');
});


async function startAutomaticFixture(input: { locale: "en" | "ja" | "en-US"; seed: string; fixed?: boolean; receipt?: unknown; report?: (init?: RequestInit) => Promise<Response> }) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  vi.stubEnv('NEXT_PUBLIC_CMS_HOST_RELEASE', digest('real-release-fixture'));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  const locale = input.locale;
  const material = { version: 1 as const, materialVersionId: '12345678-1234-4234-8234-123456789012', sourceHash: 'a'.repeat(64), templateId: 'fixed', templateVersion: 1, rendererDigest: digest('renderer'), compilerIdentity: 'fixture', sourceDslVersion: 3 as const };
  const fixedManifest = { ...manifest, ...(input.fixed === false ? {} : { material }), placements: [{ ...manifest.placements[0]!, locales: [locale] }] };
  const fixedContent = { ...content, locale, manifest: fixedManifest, manifestHash: digest(JSON.stringify(fixedManifest)) };
  const snapshotHash = digest(`fixed-snapshot-${input.seed}`);
  const context = { ...runtime().testContext, deploymentId: `deployment-${input.seed}`, contextId: `ctx-v1:${'a'.repeat(64)}`, generation: '1', contextToken: `ctx-token-v1:${'b'.repeat(64)}`, testerMemberId: 'account-a' };
  const fixedDecision = { ...runtime(fixedContent), deploymentId: context.deploymentId, activityId: `activity-${input.seed}`, snapshotHash, manifestHash: fixedContent.manifestHash, testContext: context };
  const deployment = { id: context.deploymentId, activityId: fixedDecision.activityId, snapshotHash, snapshot: { contentVersionId: content.id, manifestHash: fixedContent.manifestHash, artifactHash: fixedDecision.artifactHash, placementKeys: ['opend.home.campaign-modal'] } };
  const requests: { url: string; body: Record<string, unknown>; signal?: AbortSignal | null }[] = [];
  const diagnostics: unknown[] = [];
  const listener = (event: Event) => diagnostics.push((event as CustomEvent).detail);
  document.addEventListener('touchpointdiagnostic', listener);
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/acceptances') || url.endsWith('/automated-reports')) requests.push({ url, body: JSON.parse(String(init?.body)), signal: init?.signal });
    if (url.endsWith('/acceptances')) return Response.json(input.receipt ?? { id: 'display-receipt' }, { status: 201 });
    if (url.endsWith('/automated-reports')) return input.report ? input.report(init) : Response.json({ status: 'unverified' }, { status: 201 });
    if (url.endsWith('/context')) return Response.json(context);
    if (url.endsWith('/deployments')) return Response.json({ deployments: [deployment] });
    return Response.json(fixedDecision);
  });
  vi.stubGlobal('fetch', transport);

  const view = render(<I18nProvider initial={locale === 'ja' ? 'ja' : 'en'}><TestCampaignHarness authenticated /></I18nProvider>);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: deployment.id } });
  try { await waitFor(() => expect(requests.some(request => request.url.endsWith('/acceptances')), JSON.stringify(diagnostics)).toBe(true)); }
  finally { document.removeEventListener('touchpointdiagnostic', listener); }
  expect(screen.getByRole('dialog')).toBeVisible();
  return { view, requests, context, snapshotHash, locale };
}
it.each(['en', 'ja'] as const)("submits server automatic checks after a real fixed-template %s display receipt and reuses its UUID on retry", async locale => {
  let sent = 0;
  const f = await startAutomaticFixture({ locale, seed: locale, report: async () => Response.json({ status: 'unverified' }, { status: ++sent === 1 ? 503 : 201 }) });
  await waitFor(() => expect(f.requests.some(request => request.url.endsWith('/automated-reports'))).toBe(true));
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  const automatic = f.requests.filter(request => request.url.endsWith('/automated-reports'));
  expect(automatic).toHaveLength(2);
  expect(automatic[0]!.body).toEqual(automatic[1]!.body);
  expect(automatic[0]!.body).toMatchObject({ version: 1, acceptanceId: 'display-receipt', contextToken: f.context.contextToken, snapshotHash: f.snapshotHash, placementKey: 'opend.home.campaign-modal', locale, hostRelease: digest('real-release-fixture'), observations: [] });
  expect(automatic[0]!.body.reportId).toMatch(/^[a-f0-9-]{36}$/);
  expect(automatic[0]!.body).not.toHaveProperty('passed');
});
it.each(['legacy ZIP', 'missing display id'] as const)('does not create an automatic gate for %s after a real Test mount', async kind => {
  const f = await startAutomaticFixture({ locale: kind === 'legacy ZIP' ? 'en-US' : 'en', seed: kind === 'legacy ZIP' ? 'legacy' : 'missing-id', fixed: kind !== 'legacy ZIP', receipt: {} });
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  expect(f.requests.filter(request => request.url.endsWith('/automated-reports'))).toHaveLength(0);
});
it('aborts an automatic Test report when identity changes and rejects its late completion', async () => {
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const f = await startAutomaticFixture({ locale: 'en', seed: 'identity', report: () => pending });
  await waitFor(() => expect(f.requests.some(request => request.url.endsWith('/automated-reports'))).toBe(true));
  const oldReport = f.requests.find(request => request.url.endsWith('/automated-reports'))!;
  await act(async () => { f.view.rerender(<I18nProvider initial="en"><TestCampaignHarness authenticated sessionSubject="account-b" /></I18nProvider>); });
  expect(oldReport.signal?.aborted).toBe(true);
  await act(async () => { release(Response.json({ status: 'unverified' }, { status: 201 })); await pending; await vi.advanceTimersByTimeAsync(1500); });
  expect(f.requests.filter(request => request.url.endsWith('/automated-reports'))).toHaveLength(1);
});

it.each(['retry', 'pending'] as const)('defensively cancels the old automatic report %s if an immutable context changes under the same selection', async kind => {
  // Current server immutable deployments do not produce this drift. Exercise
  // the client boundary with a malformed/future producer, through the real 409 recovery.
  let published: ReturnType<typeof useTestRuntime> = null;
  function Probe() { published = useTestRuntime(); return null; }
  render(<Probe />);
  let reports = 0;
  let release!: (value: Response) => void;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const f = await startAutomaticFixture({ locale: 'en', seed: `context-drift-defense-${kind}`, report: () => kind === 'pending' ? pending : Promise.resolve(Response.json({ status: 'unverified' }, { status: ++reports === 1 ? 503 : 201 })) });
  await waitFor(() => expect(f.requests.filter(r => r.url.endsWith('/automated-reports'))).toHaveLength(1));
  const first = f.requests.find(r => r.url.endsWith('/automated-reports'))!;
  const nextContext = { ...f.context, generation: '2', contextToken: 'ctx-token-v1:' + 'c'.repeat(64), updatedAt: '2030-01-01T00:00:00.001Z' };
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/context')) return Response.json(nextContext);
    const result = await original(url, init);
    if (url.includes('/test-runtime?')) {
      if (new URL(url, 'http://local').searchParams.get('contextToken') !== nextContext.contextToken) return Response.json({ error: 'test_context_mismatch', reason: 'context_token_mismatch', testContext: nextContext }, { status: 409 });
      return Response.json({ ...await result.json(), testContext: { ...nextContext, scheduleState: 'active' } });
    }
    return result;
  }));
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(published?.context.contextToken).toBe(nextContext.contextToken));
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  if (kind === 'pending') {
    expect(first.signal?.aborted).toBe(true);
    await act(async () => { release(Response.json({ status: 'unverified' }, { status: 201 })); await pending; });
  }
  expect(f.requests.filter(r => r.url.endsWith('/automated-reports') && r.body.contextToken === f.context.contextToken)).toHaveLength(1);
  f.view.unmount();
});


it.each([['opend.home.campaign-modal', 'https', false], ['opend.home.campaign-modal', 'internal', false], ['opend.home.hover-layer', 'https', false], ['opend.home.hover-layer', 'internal', false], ['opend.home.campaign-modal', 'console_pricing', false], ['opend.home.hover-layer', 'console_pricing', false], ['opend.home.campaign-modal', 'https', true], ['opend.home.hover-layer', 'internal', true]] as const)('dispatches Test %s %s SDK link A/B (role bindings: %s) with actual targets and unchanged retry C', async (placementKey, target_kind, bound) => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
  sessionStorage.clear(); localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) { return { length: this.hidden || this.closest('[hidden]') ? 0 : 1 } as DOMRectList; });
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  const staticActions = [
    { id: 'Link-A', target: target_kind === 'console_pricing' ? { kind: 'console-pricing' } : target_kind === 'https' ? { kind: 'https', url: 'https://example.com/a' } : { kind: 'internal', path: '/projects?a=1' } },
    { id: 'Link_B', target: target_kind === 'console_pricing' ? { kind: 'console-pricing' } : target_kind === 'https' ? { kind: 'https', url: 'https://example.com/b' } : { kind: 'internal', path: '/projects?b=1' } },
  ];
  const requiredCapabilities = target_kind === 'console_pricing' ? ['static-action', 'action-console-pricing-v1'] : ['static-action'];
  const apiVersion = target_kind === 'console_pricing' ? 2 : 1;
  const placementKeys = placementKey === 'opend.home.hover-layer' ? ['opend.home.hover-entry', placementKey] : [placementKey];
  const material = {
    version: 1 as const,
    materialVersionId: '12345678-1234-4234-8234-123456789012',
    sourceHash: 'a'.repeat(64),
    templateId: 'test-v3',
    templateVersion: 9,
    rendererDigest: digest('renderer'),
    compilerIdentity: 'fixture',
    sourceDslVersion: 3 as const,
  };
  const dimensions = {
    template_id: material.templateId,
    template_version: material.templateVersion,
    material_version_id: material.materialVersionId,
  };
  // OBS-011: A is the registered primary, B the registered secondary button.
  const roleBindings = { version: 1 as const, bindings: placementKeys.flatMap((key) => [
    { placementKey: key, fieldKey: 'primaryCta', buttonId: 'Link-A', role: 'primary' as const },
    { placementKey: key, fieldKey: 'secondaryCta', buttonId: 'Link_B', role: 'secondary' as const },
  ]) };
  const linkManifest = {
    ...manifest,
    material,
    ...(bound ? { roleBindings } : {}),
    resources: placementKeys.map((key) => `${key}.js`),
    runtimeApiVersion: apiVersion,
    placements: placementKeys.map((key) => ({
      ...manifest.placements[0]!,
      key,
      entry: `${key}.js`,
      locales: ['en'],
      requiredCapabilities,
      staticActions,
    })),
  };
  const linkContent = {
    ...content,
    locale: 'en',
    entryPath: `${placementKey}.js`,
    resources: [{ ...content.resources[0]!, path: `${placementKey}.js` }],
    runtime: { ...content.runtime, apiVersion },
    placementKey,
    manifest: linkManifest,
    manifestHash: digest(JSON.stringify(linkManifest)),
  };
  const context = { ...runtime().testContext, contextId: `ctx-v1:${'a'.repeat(64)}`, generation: '1', contextToken: `ctx-token-v1:${'b'.repeat(64)}`, testerMemberId: 'account-a' };
  const linkDecision = { ...runtime(linkContent), placementKey, requiredCapabilities, staticActions, manifestHash: linkContent.manifestHash, testContext: context };
  const deployment = { id: context.deploymentId, activityId: linkDecision.activityId, snapshotHash: linkDecision.snapshotHash, snapshot: { contentVersionId: content.id, manifestHash: linkContent.manifestHash, artifactHash: linkDecision.artifactHash, placementKeys } };
  let failedClick = false;
  const transport = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/events')) {
      const body = JSON.parse(String(init?.body));
      if (body.kind === 'click' && !failedClick) { failedClick = true; return Response.json({}, { status: 503 }); }
      return Response.json({ accepted: true }, { status: 202 });
    }
    if (url.endsWith('/context')) return Response.json(context);
    if (url.endsWith('/deployments')) return Response.json({ deployments: [deployment] });
    if (url.endsWith('/acceptances')) return Response.json({ id: 'display' }, { status: 201 });
    const requestedPlacement = new URL(url, window.location.href).searchParams.get('placementKey') ?? placementKey;
    return Response.json({
      ...linkDecision,
      placementKey: requestedPlacement,
      content: {
        ...linkContent,
        placementKey: requestedPlacement,
        entryPath: `${requestedPlacement}.js`,
        resources: [
          { ...content.resources[0]!, path: `${requestedPlacement}.js` },
        ],
      },
    });
  });
  vi.stubGlobal('fetch', transport);

  const navigation = vi.spyOn(campaignNavigation, 'navigateCampaignTarget');
  const external = vi.spyOn(providerRegistry, 'openExternalUrl').mockResolvedValue(false);
  if (target_kind !== 'console_pricing') navigation.mockResolvedValue(false);
  render(<><TestCampaignHarness authenticated />{placementKey === 'opend.home.hover-layer' && <ProductionCampaignHover authenticated sessionSubject="account-a" />}</>);
  await screen.findByTestId('touchpoint-test-selector');
  fireEvent.change(screen.getByLabelText('Test activity'), { target: { value: deployment.id } });
  if (placementKey === 'opend.home.hover-layer') {
    const overlay = await screen.findByTestId('cms-hover-overlay-root');
    const entry = overlay.querySelector('opend-touchpoint')!;
    await waitFor(() => expect(entry).not.toHaveAttribute('hidden'));
    fireEvent.pointerEnter(entry);
  }
  await waitFor(() => expect(cmsTrack.mock.calls.some(([event, props]) => event === 'surface_view' && props.placement_key === placementKey)).toBe(true));
  for (const [event, props] of cmsTrack.mock.calls)
    if (event === 'surface_view') expect(props).toMatchObject(dimensions);
  const dispatch = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock.calls.slice().reverse().find(call => call[2].placementKey === placementKey && call[2].mode === 'test')![5]!.dispatchAction!;
  await act(async () => { await expect(dispatch('not-registered')).rejects.toThrow('touchpoint_action_denied'); });
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } });
  await act(async () => { await expect(dispatch(staticActions[0]!.id)).rejects.toThrow('touchpoint_action_denied'); });
  expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toHaveLength(0);
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
  for (const action of staticActions) await act(async () => { await expect(dispatch(action.id)).rejects.toThrow('touchpoint_action_denied'); });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  const clicks = transport.mock.calls.filter(([url]) => url.endsWith('/events')).map(([, init]) => JSON.parse(String(init?.body))).filter(body => body.kind === 'click');
  expect(clicks).toHaveLength(3);
  expect(clicks[2]).toEqual(clicks[0]);
  expect(clicks[1].eventId).not.toBe(clicks[0].eventId);
  // Each click names the button actually pressed; the element follows its verified role only.
  const roleOf = (id: string) => (bound ? (id === 'Link-A' ? 'primary' : 'secondary') : null);
  expect(clicks.map(body => body.button.id)).toEqual(['Link-A', 'Link_B', 'Link-A']);
  for (const body of clicks) {
    const action = staticActions.find(a => a.id === body.button.id)!;
    expect(body).toMatchObject({
      contractVersion: 2,
      element: bound ? (roleOf(action.id) === 'primary' ? 'primary_cta' : 'secondary_cta') : 'unclassified_cta',
      button: {
        id: action.id, role: roleOf(action.id), targetKind: target_kind,
        targetUrl: action.target.kind === 'https' ? action.target.url : action.target.kind === 'internal' ? action.target.path : null,
        templateId: material.templateId, templateVersion: material.templateVersion, materialVersionId: material.materialVersionId,
      },
    });
  }
  expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toEqual(staticActions.map((action, i) => ['ui_click', expect.objectContaining({ mode: 'test', decision_id: null, page_name: 'home', area: placementKey.endsWith('hover-layer') ? 'cms_hover_layer' : 'cms_campaign_modal', element: target_kind === 'console_pricing' ? 'primary_cta' : 'link_cta', ...(target_kind !== 'console_pricing' ? { action_id: action.id, target_kind } : {}), ...(bound ? { button_role: roleOf(action.id) } : {}) }), { insertId: clicks[i].eventId }]));
  for (const [, props] of cmsTrack.mock.calls)
    expect(props).toMatchObject(dimensions);
  if (target_kind === 'console_pricing') {
    const analyticsClicks = cmsTrack.mock.calls.filter(([event]) => event === 'ui_click');
    expect(external).toHaveBeenCalledTimes(2);
    for (const [i, [url]] of external.mock.calls.entries()) {
      const destination = new URL(url);
      expect(destination.searchParams.get('billing')).toBe('plan');
      expect(analyticsClicks[i]![1].entry_id).toBe(destination.searchParams.get('od_entry_id'));
      expect(analyticsClicks[i]![1].source_detail).toBe('cms_campaign_primary_cta');
      expect(analyticsClicks[i]![1]).not.toHaveProperty('action_id');
      expect(analyticsClicks[i]![1]).not.toHaveProperty('target_kind');
    }
  } else expect(localStorage.getItem('open-design:amr-entry-attribution:v1')).toBeNull();
  if (placementKey === 'opend.home.hover-layer') {
    const close = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock.calls.slice().reverse().find(call => call[2].placementKey === placementKey && call[2].mode === 'test')![5]!.requestClose!;
    await act(async()=>{close('close');});
    const raw = transport.mock.calls.filter(([url])=>url.endsWith('/events')).map(([,init])=>JSON.parse(String(init?.body))).filter(body=>body.element==='close');
    const captures = cmsTrack.mock.calls.filter(([event,props])=>event==='ui_click' && props.element==='close');
    expect(raw).toHaveLength(1); expect(captures).toHaveLength(1);
    expect(raw[0]).toMatchObject({eventId:captures[0]![2].insertId,kind:'click',surface:'layer',placementKey,contextId:context.contextId,loadAttemptId:captures[0]![1].load_attempt_id});
    await act(async()=>{close('close');});
    expect(transport.mock.calls.filter(([url,init])=>url.endsWith('/events') && JSON.parse(String(init?.body)).element==='close')).toHaveLength(1);
  }
  // The retired mount's callback becomes inert; it must not navigate or capture again.
  act(() => clearTestRuntimeSession());
  await act(async () => {
    if (placementKey === 'opend.home.hover-layer') await expect(dispatch(staticActions[0]!.id)).rejects.toThrow('touchpoint_action_denied');
    else await dispatch(staticActions[0]!.id);
  });
  expect(campaignNavigation.navigateCampaignTarget).toHaveBeenCalledTimes(2);
  expect(cmsTrack.mock.calls.filter(([event]) => event === 'ui_click')).toHaveLength(placementKey === 'opend.home.hover-layer' ? 3 : 2);
});

it.each(['close', 'secondary_close'] as const)(
  'keeps verified Test B identity on independent SDK %s X and raw C',
  async (reason) => {
    const f = await startAutomaticFixture({
      locale: 'en',
      seed: `obs-x-${reason}`,
    });
    const view = cmsTrack.mock.calls.find(
      ([event]) => event === 'surface_view',
    )!;
    expect(view[1]).toMatchObject({
      template_id: 'fixed',
      template_version: 1,
      material_version_id: '12345678-1234-4234-8234-123456789012',
    });
    const mount = vi
      .mocked(OpenDesignTouchpointElement.prototype.mount)
      .mock.calls.at(-1)!;
    await act(async () => {
      mount[5]!.requestClose!(reason);
    });
    const click = cmsTrack.mock.calls.find(([event]) => event === 'ui_click')!;
    expect(click[1]).toMatchObject({
      template_id: view[1].template_id,
      template_version: view[1].template_version,
      material_version_id: view[1].material_version_id,
      element: reason,
      load_attempt_id: view[1].load_attempt_id,
    });
    const bodies = vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith('/events'))
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toContainEqual(
      expect.objectContaining({
        kind: 'click',
        element: reason,
        eventId: click[2].insertId,
      }),
    );
    for (const body of bodies) expect(body).not.toHaveProperty('template_id');
    f.view.unmount();
  },
);

it.each(['missing', 'different'] as const)(
  'retains Test rendered identity across same-content %s renewal metadata',
  async (kind) => {
    const f = await startAutomaticFixture({
      locale: 'en',
      seed: `obs-renew-${kind}`,
    });
    const host = document.querySelector('opend-touchpoint');
    const originalViews = cmsTrack.mock.calls.filter(
      ([event]) => event === 'surface_view',
    );
    const transport = vi.mocked(fetch).getMockImplementation()!;
    let resolveRenewal!: () => void;
    const completed = new Promise<void>((resolve) => {
      resolveRenewal = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await transport(input, init);
        if (String(input).includes('/test-runtime?')) {
          const next = await response.json();
          if (kind === 'missing') delete next.content.manifest.material;
          else next.content.manifest.material.templateVersion = 99;
          resolveRenewal();
          return Response.json(next);
        }
        return response;
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await completed;
    });
    expect(document.querySelector('opend-touchpoint')).toBe(host);
    expect(
      cmsTrack.mock.calls.filter(([event]) => event === 'surface_view'),
    ).toEqual(originalViews);
    const mount = vi
      .mocked(OpenDesignTouchpointElement.prototype.mount)
      .mock.calls.at(-1)!;
    await act(async () => {
      mount[5]!.requestClose!('secondary_close');
    });
    const view = originalViews[0]![1];
    expect(cmsTrack).toHaveBeenLastCalledWith(
      'ui_click',
      expect.objectContaining({
        template_id: view.template_id,
        template_version: 1,
        material_version_id: view.material_version_id,
        load_attempt_id: view.load_attempt_id,
        element: 'secondary_close',
      }),
      expect.anything(),
    );
    f.view.unmount();
  },
);
