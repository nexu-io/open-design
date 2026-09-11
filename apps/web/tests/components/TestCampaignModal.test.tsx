// @vitest-environment jsdom
import { createHash } from "node:crypto";
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
import {
	TestCampaignModal,
	TestTouchpointMount,
	useTestRuntime,
} from "../../src/components/TestCampaignModal";
import type { TestDecision } from "../../src/components/TestCampaignModal";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";

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
		scenario: "active" as const,
		simulatedAt: "2030-01-01T00:00:00.000Z",
		updatedAt: "2030-01-01T00:00:00.000Z",
	};
	return {
		activityId: "activity-1",
		snapshotHash: "sha256:test-snapshot",
		artifactHash: "sha256:test-artifact",
		manifestHash: content.manifestHash,
		deploymentId: "deployment-1",
		placementKey: "opend.home.campaign-modal",
		requiredCapabilities: ["close"],
		staticActions: [],
		context,
		testContext: { ...context, scheduleState: "active" as const },
		content: contentValue,
	};
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
						: url.includes("context")
							? response.context
							: response,
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
	(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
		version: 2,
		client: { type: "desktop" },
	};
});
afterEach(() => {
	delete (globalThis as CampaignHostGlobal).__openDesignCampaignTestHost;
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
describe("TestCampaignModal", () => {
	it("is default-deny without the real desktop host", () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		render(<TestCampaignModal authenticated={false} />);
		expect(screen.queryByTestId("touchpoint-test-selector")).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
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
		render(
			<TestTouchpointMount
				decision={runtime() as TestDecision}
				placementKey="opend.home.campaign-modal"
				testId="test-touchpoint-mount"
				onVisible={vi.fn()}
				onCloseControlChange={onCloseControlChange}
			/>,
		);
		await waitFor(() => expect(onCloseControlChange).toHaveBeenCalledWith(false));
		closeControl.disabled = false;
		await waitFor(() => expect(onCloseControlChange).toHaveBeenCalledWith(true));
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
		const { rerender } = render(
			<div role="dialog">
				<TestTouchpointMount
					decision={firstDecision}
					placementKey="opend.home.campaign-modal"
					testId="test-touchpoint-mount"
					onVisible={vi.fn()}
					onCloseControlChange={onCloseControlChange}
				/>
			</div>,
		);
		await waitFor(() => expect(mountCount).toBe(1));
		rerender(
			<div role="dialog">
				<TestTouchpointMount
					decision={replacementDecision}
					placementKey="opend.home.campaign-modal"
					testId="test-touchpoint-mount"
					onVisible={vi.fn()}
					onCloseControlChange={onCloseControlChange}
				/>
			</div>,
		);
		await waitFor(() => expect(mountCount).toBe(2));
		await waitFor(() => expect(onCloseControlChange).toHaveBeenLastCalledWith(true));
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
			const diagnostics: string[] = [];
			document.addEventListener(
				"touchpointdiagnostic",
				(event) => diagnostics.push((event as CustomEvent).detail.code),
				{ once: true },
			);
			vi.stubGlobal("fetch", fetches(response));
			render(<TestCampaignHarness authenticated />);
			await screen.findByTestId("touchpoint-test-selector");
			fireEvent.change(screen.getByLabelText("Test activity"), {
				target: { value: "deployment-1" },
			});
			await waitFor(() =>
				expect(diagnostics).toContain("touchpoint_decision_mismatch"),
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
					JSON.stringify({ ...runtime().context, deploymentId: selected }),
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
		expect(forward.defaultPrevented).toBe(false);
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

describe("Test campaign four-placement contract", () => {
	it("loads the real context shape, mounts every enabled placement, and records one server acceptance per visible host", async () => {
		const context = {
			deploymentId: "deployment-four",
			testerMemberId: "member-four",
			scenario: "active" as const,
			simulatedAt: "2030-01-01T00:00:00.000Z",
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
			allTestPlacements.map((placementKey) => [
				placementKey,
				{
					...runtime(fourPlacementContent(placementKey)),
					deploymentId: deployment.id,
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
