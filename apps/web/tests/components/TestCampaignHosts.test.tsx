// @vitest-environment jsdom
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider, useI18n } from "../../src/i18n";
type HostGlobal = typeof globalThis & { __cmsTestHost?: unknown };
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () => (globalThis as HostGlobal).__cmsTestHost,
}));

import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import { ProductionCampaignHover } from "../../src/components/ProductionCampaignHover";
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import {
	TestCampaignModal,
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
	deploymentId: "deployment-1",
	scenario: "realtime" as const,
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
		serverTime: "2030-01-01T00:00:00.000Z",
		authorizationExpiresAt: "2030-01-01T00:01:00.000Z",
		startsAt: "2029-12-31T23:00:00.000Z",
		endsAt: "2030-01-01T01:00:00.000Z",
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
	/**
	 * A host reports no box until React commits `hidden` and the package lays
	 * out. Pinning this to 1 for every element would assert away the very frame
	 * the receipt is lost in, so tests drive it and wake the observer by hand.
	 */
	let clientRectCount = 1;
	const resizeObserverCallbacks: Array<() => void> = [];
	const notifyResizeObservers = () => {
		for (const trigger of [...resizeObserverCallbacks]) trigger();
	};
	beforeEach(() => {
		localStorage.clear();
		clientRectCount = 1;
		resizeObserverCallbacks.length = 0;
		vi.stubEnv("NEXT_PUBLIC_CMS_HOST_RELEASE", `sha256:${"a".repeat(64)}`);
		document.documentElement.lang = "zh-CN";
		vi.stubGlobal(
			"ResizeObserver",
			class {
				private trigger?: () => void;
				constructor(private readonly callback: ResizeObserverCallback) {}
				observe() {
					this.trigger = () =>
						this.callback([], this as unknown as ResizeObserver);
					resizeObserverCallbacks.push(this.trigger);
				}
				disconnect() {
					const index = this.trigger
						? resizeObserverCallbacks.indexOf(this.trigger)
						: -1;
					if (index >= 0) resizeObserverCallbacks.splice(index, 1);
				}
			},
		);
		(globalThis as HostGlobal).__cmsTestHost = {
			version: 2,
			client: { type: "desktop", osLocale: "en-CN" },
		};
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:test-host",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		} as never);
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (this: OpenDesignTouchpointElement) {
				this.shadowRoot?.replaceChildren(
					document.createTextNode("Test host content"),
				);
			});
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
			() =>
				({
					length: clientRectCount,
					item: () => null,
				}) as unknown as DOMRectList,
		);
	});
	afterEach(() => {
		clearTestRuntimeSession();
		cleanup();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		delete (globalThis as HostGlobal).__cmsTestHost;
	});

	it("discovers new Test deployments without reload, preserves unchanged mounts and follows replacement/removal after end", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(context.updatedAt));
		let catalog: string[] = [];
		let ended = false;
		let startsAt = Date.parse("2029-12-31T23:00:00.000Z");
		const requested: string[] = [];
		// Each activity auto-presents once; later deployments carry new activities.
		const activityOf = (id: string) =>
			id === "deployment-c" || id === "deployment-future"
				? `activity-${id}`
				: "activity-four";
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string, init?: RequestInit) => {
				const url = new URL(input, "http://localhost");
				if (url.pathname.endsWith("/deployments"))
					return Response.json({
						deployments: catalog.map((id) => ({
							id,
							activityId: activityOf(id),
							snapshotHash: "sha256:four-snapshot",
							snapshot: {
								contentVersionId: "version-four-placement",
								manifestHash: "sha256:four-manifest",
								artifactHash: "sha256:four-artifact",
								placementKeys: [...placements],
							},
						})),
					});
				if (url.pathname.endsWith("/context"))
					return Response.json({
						...context,
						deploymentId: JSON.parse(String(init?.body)).deploymentId,
					});
				if (url.pathname === "/api/touchpoints/test-runtime") {
					const placement = placements.find(
						(key) => key === url.searchParams.get("placementKey"),
					);
					if (!placement) throw new Error("Unexpected placement");
					const id = url.searchParams.get("deploymentId")!;
					requested.push(id);
					return Response.json({
						...decision(placement),
						deploymentId: id,
						activityId: activityOf(id),
						serverTime: new Date().toISOString(),
						authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
						endsAt: ended
							? new Date(Date.now() - 1).toISOString()
							: "2030-01-01T01:00:00.000Z",
						startsAt: new Date(startsAt).toISOString(),
						testContext: {
							...context,
							deploymentId: id,
							scheduleState: ended
								? "ended"
								: Date.now() < startsAt
									? "before"
									: "active",
						},
					});
				}
				return Response.json(
					{},
					{ status: input.includes("acceptances") ? 201 : 404 },
				);
			}),
		);
		const nodes = () => [...document.querySelectorAll("opend-touchpoint")];
		const tick = async () => {
			await act(async () => {
				await vi.advanceTimersByTimeAsync(30_000);
			});
		};
		try {
			await act(async () => {
				render(
					<I18nProvider initial="zh-CN">
						<TestCampaignModal authenticated sessionSubject="account-a" />
						<ProductionCampaignModal authenticated sessionSubject="account-a" />
						<ProductionCampaignBadge authenticated sessionSubject="account-a" />
						<ProductionCampaignHover authenticated sessionSubject="account-a" />
					</I18nProvider>,
				);
			});
			expect(nodes()).toHaveLength(0);
			catalog = ["deployment-a"];
			await tick();
			expect(nodes()).toHaveLength(4);
			expect(requested).toContain("deployment-a");
			const originals = nodes();
			const mounts = vi.mocked(OpenDesignTouchpointElement.prototype.mount).mock
				.calls.length;
			await tick();
			expect(nodes()).toHaveLength(4);
			for (const [index, node] of nodes().entries())
				expect(node).toBe(originals[index]);
			expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(
				mounts,
			);
			catalog = ["deployment-b"];
			await tick();
			expect(requested).toContain("deployment-b");
			// Redeploying the presented activity refreshes badge and hover only.
			expect(nodes()).toHaveLength(3);
			catalog = [];
			await tick();
			expect(nodes()).toHaveLength(0);
			// An ended deployment must not stop discovery of the next one.
			ended = true;
			catalog = ["deployment-ended"];
			await tick();
			expect(requested).toContain("deployment-ended");
			expect(nodes()).toHaveLength(0);
			ended = false;
			catalog = ["deployment-c"];
			await tick();
			expect(requested).toContain("deployment-c");
			expect(nodes()).toHaveLength(4);
			fireEvent.keyDown(document, { key: "Escape" });
			expect(nodes()).toHaveLength(3);
			await tick();
			expect(nodes()).toHaveLength(3); // An unchanged directory cannot undo dismissal.
			catalog = ["deployment-future"];
			startsAt = Date.now() + 45_000;
			await tick();
			expect(nodes()).toHaveLength(0);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(14_999);
			});
			expect(nodes()).toHaveLength(0);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(1);
			});
			expect(nodes()).toHaveLength(4);
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	});

	it("switches all Test placements together when the client language changes without changing deployment", async () => {
		const deployment = {
			id: context.deploymentId,
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: "sha256:four-manifest",
				artifactHash: "sha256:four-artifact",
				placementKeys: [...placements],
			},
		};
		const requests: Array<{ placement: string; locale: string }> = [];
		const pending: Array<() => void> = [];
		let holdJapanese = false;
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string) => {
				const url = new URL(input, "http://localhost");
				if (url.pathname.endsWith("/deployments"))
					return Response.json({ deployments: [deployment] });
				if (url.pathname.endsWith("/context")) return Response.json(context);
				if (url.pathname === "/api/touchpoints/test-runtime") {
					const placement = placements.find(
						(key) => key === url.searchParams.get("placementKey"),
					);
					if (!placement) throw new Error("Unexpected Test placement");
					const locale = url.searchParams.get("locale") ?? "";
					requests.push({ placement, locale });
					if (holdJapanese && locale === "ja")
						await new Promise<void>((resolve) => pending.push(resolve));
					const value = decision(placement);
					return Response.json({
						...value,
						content: {
							...value.content,
							locale,
							manifest: {
								...manifest,
								placements: manifest.placements.map((p) => ({
									...p,
									locales: ["en", "ja", "zh-CN"],
								})),
							},
						},
					});
				}
				return Response.json(
					{},
					{ status: input.includes("acceptances") ? 201 : 404 },
				);
			}),
		);
		vi
			.mocked(OpenDesignTouchpointElement.prototype.mount)
			.mockImplementation(async function (
				this: OpenDesignTouchpointElement,
				_url,
				_digest,
				hostContext,
			) {
				this.shadowRoot?.replaceChildren(
					document.createTextNode(
						`${hostContext.placementKey}:${hostContext.locale}`,
					),
				);
			});
		function Controls() {
			const { setLocale } = useI18n();
			return (
				<>
					<button onClick={() => setLocale("ja")}>Japanese</button>
					<button onClick={() => setLocale("zh-CN")}>Chinese</button>
					<button onClick={() => setLocale("en")}>English</button>
				</>
			);
		}
		render(
			<I18nProvider initial="en">
				<Controls />
				<TestCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignModal authenticated sessionSubject="account-a" />
				<ProductionCampaignBadge authenticated sessionSubject="account-a" />
				<ProductionCampaignHover authenticated sessionSubject="account-a" />
			</I18nProvider>,
		);
		const mountedTexts = () =>
			[...document.querySelectorAll("opend-touchpoint")]
				.map((element) => element.shadowRoot?.textContent)
				.sort();
		const expected = (locale: string) =>
			placements.map((key) => `${key}:${locale}`).sort();
		await waitFor(() => expect(mountedTexts()).toEqual(expected("en")));
		// The modal records its impression one frame after it becomes visible. A
		// language switch after that point continues the same presentation; it is
		// not a new offer of an already-displayed activity.
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:account-a:activity-four"),
			).toBe("1"),
		);
		fireEvent.click(screen.getByText("Japanese"));
		await waitFor(() => expect(mountedTexts()).toEqual(expected("ja")));
		fireEvent.click(screen.getByText("Chinese"));
		await waitFor(() => expect(mountedTexts()).toEqual(expected("zh-CN")));
		for (const locale of ["en", "ja", "zh-CN"])
			expect(
				requests
					.filter((r) => r.locale === locale)
					.map((r) => r.placement)
					.sort(),
			).toEqual([...placements].sort());
		// The presentation has been on screen long enough to be recorded as
		// displayed (the visibility frame has run). A recorded activity must still
		// follow a language switch: the runtime's reload is not a new offer.
		await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
		await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
		expect(
			localStorage.getItem("touchpoint-displayed:v1:account-a:activity-four"),
		).toBe("1");
		// A late previous-language response must not restore any stale placement.
		holdJapanese = true;
		fireEvent.click(screen.getByText("Japanese"));
		await waitFor(() => expect(pending).toHaveLength(4));
		fireEvent.click(screen.getByText("English"));
		await waitFor(() => expect(mountedTexts()).toEqual(expected("en")));
		await act(async () => {
			for (const resolve of pending) resolve();
		});
		expect(mountedTexts()).toEqual(expected("en"));
	});

	it("keeps the Test modal image through delayed focus refresh and stays closed after SDK dismissal", async () => {
		vi.useFakeTimers({
			toFake: [
				"Date",
				"performance",
				"setTimeout",
				"clearTimeout",
				"setInterval",
				"clearInterval",
			],
		});
		vi.setSystemTime(new Date(context.updatedAt));
		const pending: Array<() => void> = [];
		let hold = false;
		let close: (() => void) | undefined;
		vi
			.mocked(OpenDesignTouchpointElement.prototype.mount)
			.mockImplementation(async function (
				this: OpenDesignTouchpointElement,
				_url,
				_digest,
				_context,
				_resources,
				_actions,
				callbacks,
			) {
				const image = document.createElement("img");
				image.src = "blob:test-host";
				this.shadowRoot?.replaceChildren(image);
				close = callbacks?.requestClose;
			});
		const deployment = {
			id: context.deploymentId,
			activityId: "activity-four",
			snapshotHash: "sha256:four-snapshot",
			snapshot: {
				contentVersionId: "version-four-placement",
				manifestHash: "sha256:four-manifest",
				artifactHash: "sha256:four-artifact",
				placementKeys: ["opend.home.campaign-modal"],
			},
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: string) => {
				const url = new URL(input, "http://localhost");
				if (url.pathname.endsWith("/deployments"))
					return Response.json({ deployments: [deployment] });
				if (url.pathname.endsWith("/context")) return Response.json(context);
				if (url.pathname === "/api/touchpoints/test-runtime") {
					if (hold) await new Promise<void>((resolve) => pending.push(resolve));
					return Response.json({
						...decision("opend.home.campaign-modal"),
						serverTime: new Date().toISOString(),
						authorizationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
					});
				}
				return Response.json(
					{},
					{ status: input.includes("acceptances") ? 201 : 404 },
				);
			}),
		);
		try {
			render(
				<I18nProvider initial="zh-CN">
					<TestCampaignModal authenticated sessionSubject="account-a" />
					<ProductionCampaignModal authenticated sessionSubject="account-a" />
				</I18nProvider>,
			);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			const dialog = screen.getByRole("dialog", { name: "Test campaign" });
			const element = dialog.querySelector("opend-touchpoint");
			const image = element?.shadowRoot?.querySelector("img");
			expect(image).toHaveAttribute("src", "blob:test-host");
			hold = true;
			act(() => {
				window.dispatchEvent(new Event("focus"));
			});
			expect(pending).toHaveLength(1);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(5000);
			});
			expect(screen.getByRole("dialog", { name: "Test campaign" })).toBe(dialog);
			expect(element?.isConnected).toBe(true);
			expect(element?.shadowRoot?.querySelector("img")).toBe(image);
			hold = false;
			await act(async () => {
				pending.splice(0).forEach((resolve) => resolve());
			});
			expect(dialog.querySelector("opend-touchpoint")).toBe(element);
			expect(element?.shadowRoot?.querySelector("img")).toBe(image);
			expect(close).toBeTypeOf("function");
			act(() => {
				close?.();
			});
			expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
			await act(async () => {
				window.dispatchEvent(new Event("online"));
			});
			await act(async () => {
				window.dispatchEvent(new Event("focus"));
				await vi.advanceTimersByTimeAsync(30_000);
			});
			expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	});

	it("keeps a dismissed Test campaign closed across temporary session loss and redeployment of the same activity", async () => {
		const value = decision("opend.home.campaign-modal");
		const session: TestRuntimeSession = {
			selectionKey: "deployment-four",
			deployment: {
				id: context.deploymentId,
				activityId: "activity-four",
				snapshotHash: value.snapshotHash,
				snapshot: {
					contentVersionId: value.content.id,
					manifestHash: value.manifestHash,
					artifactHash: value.artifactHash,
					placementKeys: [...placements],
				},
			},
			context,
			decisions: new Map([["opend.home.campaign-modal", value]]),
			isAuthorized: () => true,
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({}, { status: 404 })),
		);
		setTestRuntimeSession(session);
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await screen.findByRole("dialog", { name: "Test campaign" });
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		await act(async () => {
			clearTestRuntimeSession();
		});
		await act(async () => {
			setTestRuntimeSession({ ...session, decisions: new Map(session.decisions) });
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		const next = {
			...value,
			deploymentId: "deployment-2",
			testContext: { ...value.testContext, deploymentId: "deployment-2" },
		};
		await act(async () => {
			setTestRuntimeSession({
				...session,
				selectionKey: "deployment-2",
				deployment: { ...session.deployment, id: "deployment-2" },
				context: next.testContext,
				decisions: new Map([["opend.home.campaign-modal", next]]),
			});
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
	});

	it("presents a Test campaign modal once per account and activity on this device, sharing the production impression", async () => {
		const value = decision("opend.home.campaign-modal");
		const session: TestRuntimeSession = {
			selectionKey: "deployment-four",
			deployment: {
				id: context.deploymentId,
				activityId: "activity-four",
				snapshotHash: value.snapshotHash,
				snapshot: {
					contentVersionId: value.content.id,
					manifestHash: value.manifestHash,
					artifactHash: value.artifactHash,
					placementKeys: [...placements],
				},
			},
			context,
			decisions: new Map([["opend.home.campaign-modal", value]]),
			isAuthorized: () => true,
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({}, { status: 404 })),
		);
		setTestRuntimeSession(session);
		const first = render(
			<ProductionCampaignModal authenticated sessionSubject="account-a" />,
		);
		await screen.findByRole("dialog", { name: "Test campaign" });
		// Presentation, not dismissal, consumes the impression; the open modal stays.
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:account-a:activity-four"),
			).toBe("1"),
		);
		expect(screen.getByRole("dialog", { name: "Test campaign" })).toBeVisible();
		// Restart without closing: the same account and activity must not reopen.
		first.unmount();
		render(<ProductionCampaignModal authenticated sessionSubject="account-a" />);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		cleanup();
		// A production impression of the same activity suppresses Test too.
		localStorage.setItem("touchpoint-displayed:v1:account-b:activity-four", "1");
		render(<ProductionCampaignModal authenticated sessionSubject="account-b" />);
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		expect(screen.queryByRole("dialog", { name: "Test campaign" })).toBeNull();
		cleanup();
		// Another account on this device still gets its own single presentation.
		render(<ProductionCampaignModal authenticated sessionSubject="account-c" />);
		expect(
			await screen.findByRole("dialog", { name: "Test campaign" }),
		).toBeVisible();
	});

	it("uses the selected Test session at modal, badge, and paired hover hosts without production reads", async () => {
		const decisions = new Map(
			placements.map((placementKey) => [placementKey, decision(placementKey)]),
		);
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
			isAuthorized: () => true,
		};
		setTestRuntimeSession(session);
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
			if (url.includes("acceptances"))
				return new Response(JSON.stringify({ id: "acceptance" }), {
					status: 201,
				});
			return new Response(JSON.stringify({ error: "production_read_forbidden" }), {
				status: 404,
			});
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
		await waitFor(() =>
			expect(
				fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).length,
			).toBe(3),
		);
		const entry = screen
			.getByTestId("cms-hover-overlay-root")
			.querySelector("opend-touchpoint");
		expect(entry).not.toBeNull();
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		fireEvent.pointerEnter(entry!);
		await waitFor(() =>
			expect(
				fetchMock.mock.calls.filter(([url]) => url.includes("acceptances")).length,
			).toBe(4),
		);
		const reports = fetchMock.mock.calls
			.filter(([url]) => url.includes("acceptances"))
			.map(([, init]) => JSON.parse(String(init?.body)));
		expect(reports.map((report) => report.placementKey).sort()).toEqual(
			[...placements].sort(),
		);
		for (const report of reports) {
			expect(report.hostCompatibility).toMatchObject({
				version: 1,
				snapshotHash: session.deployment.snapshotHash,
				hostFamily: "open-design-desktop",
				platform: "desktop",
				hostRelease: `sha256:${"a".repeat(64)}`,
				runtime: {
					kind: "web-component",
					apiVersion: 1,
					wrapperVersion: "vela-touchpoint-wrapper-v1",
					sdkVersion: "vela-touchpoint-sdk-v1",
				},
			});
			expect(report.hostCompatibility.capabilities).toEqual(
				decisions.get(report.placementKey)?.requiredCapabilities,
			);
		}
		expect(
			fetchMock.mock.calls.some(([url]) => url.includes("production-runtime")),
		).toBe(false);
		expect(
			screen
				.getByTestId("campaign-custom-element")
				.querySelector("opend-touchpoint"),
		).not.toBeNull();
		expect(
			screen
				.getByTestId("production-campaign-badge")
				.querySelector("opend-touchpoint"),
		).not.toBeNull();
	});

	// Delayed visibility itself is covered directly in touchpointVisibility.test.ts:
	// at this level a re-mount can supply a second sample, which would hide a
	// regression back to sampling once. What this level can still pin down is
	// that a host nobody could see never earns a receipt.
	it("never accepts a hover entry that never gains a box", async () => {
		clientRectCount = 0;
		const decisions = new Map(
			placements.map((placementKey) => [placementKey, decision(placementKey)]),
		);
		setTestRuntimeSession({
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
			isAuthorized: () => true,
		});
		const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
			url.includes("acceptances")
				? new Response(JSON.stringify({ id: "acceptance" }), { status: 201 })
				: new Response(JSON.stringify({ error: "production_read_forbidden" }), {
						status: 404,
					}),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignHover authenticated sessionSubject="account-a" />);
		const entry = (await screen.findByTestId(
			"cms-hover-overlay-root",
		)).querySelector("opend-touchpoint");
		expect(entry).not.toBeNull();
		await waitFor(() => expect(entry).not.toHaveAttribute("hidden"));
		const entryAcceptances = () =>
			fetchMock.mock.calls
				.filter(([url]) => url.includes("acceptances"))
				.map(([, init]) => JSON.parse(String(init?.body)))
				.filter((report) => report.placementKey === "opend.home.hover-entry");
		notifyResizeObservers();
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		expect(entryAcceptances()).toHaveLength(0);
	});
});
