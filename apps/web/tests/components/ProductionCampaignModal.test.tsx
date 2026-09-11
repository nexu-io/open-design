// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openExternalUrlMock = vi.hoisted(() => vi.fn(async () => true));
type CampaignHostGlobal = typeof globalThis & {
	__openDesignCampaignTestHost?: unknown;
};
vi.mock("@open-design/host", () => ({
	OPEN_DESIGN_HOST_VERSION: 2,
	getOpenDesignHost: () =>
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost,
}));
vi.mock("../../src/providers/registry", () => ({
	openExternalUrl: openExternalUrlMock,
}));

import {
	ProductionCampaignModal,
	internalActionNavigationUrl,
} from "../../src/components/ProductionCampaignModal";
import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
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
	contentLine: "production",
	placements: [
		{
			key: "opend.home.campaign-modal" as const,
			entry: "component.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["close", "static-action"],
			staticActions: [
				{
					id: "learn",
					target: { kind: "https" as const, url: "https://example.com" },
				},
			],
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
function decision(overrides: Partial<Record<string, unknown>> = {}) {
	const serverTime = new Date();
	return {
		activityId: "campaign-1",
		authorizationExpiresAt: new Date(
			serverTime.getTime() + 60_000,
		).toISOString(),
		content,
		deploymentId: "deployment-1",
		endsAt: new Date(serverTime.getTime() + 5 * 60_000).toISOString(),
		placementKey: "opend.home.campaign-modal",
		requiredCapabilities: ["close", "static-action"],
		touchpointDecisionId: "decision-1",
		serverTime: serverTime.toISOString(),
		staticActions: [
			{ id: "learn", target: { kind: "https", url: "https://example.com" } },
		],
		...overrides,
	};
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
	vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
		async function (this: OpenDesignTouchpointElement) {
			this.shadowRoot?.replaceChildren(
				document.createTextNode("Verified campaign"),
			);
		},
	);
});

afterEach(() => {
	cleanup();
	delete (globalThis as CampaignHostGlobal).__openDesignCampaignTestHost;
	openExternalUrlMock.mockClear();
	vi.unstubAllGlobals();
	localStorage.clear();
	sessionStorage.clear();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const modalHostStyles = readFileSync(
	resolve(process.cwd(), "src/components/TestCampaignModal.module.css"),
	"utf8",
);

describe("ProductionCampaignModal", () => {
	it("keeps generic modal chrome content-sized without asymmetric host padding", () => {
		const modalRule = modalHostStyles.match(/\.modal\s*\{[^}]*\}/)?.[0];
		expect(modalRule).toContain("max-width: calc(100vw - 32px)");
		expect(modalRule).not.toMatch(/(?:^|[;{]\s*)width:/);
		expect(modalRule).not.toMatch(/(?:^|[;{]\s*)padding:/);
	});
	it("does not restart the production loader on an unchanged parent render", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify(decision()), { status: 200 }),
		);
		vi.stubGlobal("fetch", fetchMock);
		const { rerender } = render(
			<ProductionCampaignModal authenticated sessionSubject="stable-user" />,
		);
		await screen.findByRole("dialog");
		rerender(
			<ProductionCampaignModal authenticated sessionSubject="stable-user" />,
		);
		await act(async () => {});
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
	it("suppresses a displayed campaign for the same subject while leaving a normal update in the current bounded lease", async () => {
		const registerContent = vi.fn(async () => ({ ok: true }));
		const removeContent = vi.fn(async () => ({ ok: true }));
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
			touchpoints: { registerContent, removeContent },
		};
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify(decision()), { status: 200 }),
			)
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify(decision({ deploymentId: "deployment-2" })),
					{ status: 200 },
				),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify(decision()), { status: 200 }),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify(decision()), { status: 200 }),
			);
		vi.stubGlobal("fetch", fetchMock);
		const first = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await screen.findByRole("dialog");
		fireEvent.focus(window);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(
			screen
				.getByTestId("campaign-custom-element")
				.querySelector("opend-touchpoint"),
		).not.toBeNull();
		expect(document.body.style.overflow).toBe("hidden");
		expect(document.querySelector("iframe,webview")).toBeNull();
		// The fixture declares the SDK capability but exposes no actual close
		// control, so the host fallback remains available.
		expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:user-a:campaign-1"),
			).toBe("1"),
		);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(document.body.style.overflow).toBe("");
		expect(screen.queryByRole("dialog")).toBeNull();
		first.unmount();

		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		expect(screen.queryByRole("dialog")).toBeNull();
		cleanup();
		render(<ProductionCampaignModal authenticated sessionSubject="user-b" />);
		await screen.findByRole("dialog");
	});

	it.each([
		["matching receipt clears the mounted lease", "matching", true, false],
		[
			"valid mismatched receipt retains the mounted lease",
			"mismatched",
			false,
			false,
		],
		[
			"malformed 410 diagnoses and clears the mounted lease",
			"malformed",
			true,
			true,
		],
	] as const)("%s", async (_name, kind, clears, diagnoses) => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		const active = decision();
		const receipt = {
			touchpointDecisionId: active.touchpointDecisionId,
			deploymentId: active.deploymentId,
			activityId: active.activityId,
			contentVersionId: active.content.id,
		};
		const response =
			kind === "malformed"
				? new Response(
						JSON.stringify({
							error: "production_runtime_revoked",
							receipt: { touchpointDecisionId: receipt.touchpointDecisionId },
						}),
						{ status: 410 },
					)
				: new Response(
						JSON.stringify({
							error: "production_runtime_revoked",
							receipt:
								kind === "matching"
									? receipt
									: { ...receipt, deploymentId: "other-deployment" },
						}),
						{ status: 410 },
					);
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify(active), { status: 200 }),
			)
			.mockResolvedValueOnce(response);
		const diagnostic = vi.spyOn(
			touchpointComponent,
			"emitWebTouchpointDiagnostic",
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await screen.findByTestId("campaign-custom-element");
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls[1]?.[0]).toContain(
			`activeDecisionId=${active.touchpointDecisionId}`,
		);
		if (clears)
			await waitFor(() =>
				expect(screen.queryByTestId("campaign-custom-element")).toBeNull(),
			);
		else expect(screen.getByRole("dialog")).toBeTruthy();
		if (diagnoses)
			expect(diagnostic).toHaveBeenCalledWith({
				code: "touchpoint_load_failed",
				detail: "http_410",
			});
		else
			expect(diagnostic).not.toHaveBeenCalledWith(
				expect.objectContaining({ detail: "http_410" }),
			);
	});
});

it("denies synchronously when authentication is revoked and ignores a deferred A response body", async () => {
	(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
		client: { osLocale: "en-US", type: "desktop" },
	};
	let resolveBody: ((value: ReturnType<typeof decision>) => void) | undefined;
	const body = new Promise<ReturnType<typeof decision>>((resolve) => {
		resolveBody = resolve;
	});
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue({ ok: true, json: () => body }),
	);
	const view = render(
		<ProductionCampaignModal authenticated sessionSubject="user-a" />,
	);
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
	view.rerender(
		<ProductionCampaignModal authenticated={false} sessionSubject="user-a" />,
	);
	expect(screen.queryByRole("dialog")).toBeNull();
	resolveBody?.(decision());
	await Promise.resolve();
	expect(screen.queryByRole("dialog")).toBeNull();
});

it("rejects static actions substituted from the verified modal placement", async () => {
	(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
		client: { osLocale: "en-US", type: "desktop" },
	};
	vi.stubGlobal(
		"fetch",
		vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify(
					decision({
						staticActions: [
							{
								id: "substituted",
								target: { kind: "internal", path: "/other" },
							},
						],
					}),
				),
				{ status: 200 },
			),
		),
	);
	render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
	await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("rejects a decision unless both decision and content target the campaign modal placement", async () => {
	(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
		client: { osLocale: "en-US", type: "desktop" },
		touchpoints: {
			registerContent: vi.fn(async () => ({ ok: true })),
			removeContent: vi.fn(async () => ({ ok: true })),
		},
	};
	const mismatchedContent = {
		...content,
		placementKey: "opend.home.account-badge",
	};
	const fetchMock = vi.fn().mockResolvedValue(
		new Response(JSON.stringify(decision({ content: mismatchedContent })), {
			status: 200,
		}),
	);
	vi.stubGlobal("fetch", fetchMock);
	render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
	expect(screen.queryByRole("dialog")).toBeNull();
	expect(screen.queryByTestId("campaign-custom-element")).toBeNull();
});

describe("Production campaign action guard", () => {
	it.each([500, 502, 503])(
		"consumes an authorized action when telemetry returns %s",
		async (status) => {
			const { dispatchProductionCampaignAction } = await import(
				"../../src/components/ProductionCampaignModal"
			);
			Object.defineProperty(navigator, "userActivation", {
				configurable: true,
				value: { isActive: true },
			});
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("telemetry unavailable", { status })),
			);
			const accepted = await dispatchProductionCampaignAction(
				decision() as any,
				"learn",
				1,
				() => 1,
				Date.now() + 10_000,
			);
			expect(accepted).toBe(true);
			expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
		},
	);

	it("consumes an authorized action when telemetry is unreachable", async () => {
		const { dispatchProductionCampaignAction } = await import(
			"../../src/components/ProductionCampaignModal"
		);
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new TypeError("Failed to fetch");
			}),
		);
		const accepted = await dispatchProductionCampaignAction(
			decision() as any,
			"learn",
			1,
			() => 1,
			Date.now() + 10_000,
		);
		expect(accepted).toBe(true);
		expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
	});

	it("bounds a hanging telemetry request and still consumes the live action", async () => {
		const {
			dispatchProductionCampaignAction,
			PRODUCTION_ACTION_TELEMETRY_TIMEOUT_MS,
		} = await import("../../src/components/ProductionCampaignModal");
		vi.useFakeTimers();
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_input: RequestInfo | URL, init?: RequestInit) =>
					new Promise<Response>((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () =>
							reject(new DOMException("aborted", "AbortError")),
						);
					}),
			),
		);
		const pending = dispatchProductionCampaignAction(
			decision() as any,
			"learn",
			1,
			() => 1,
			Date.now() + 10_000,
		);
		await vi.advanceTimersByTimeAsync(PRODUCTION_ACTION_TELEMETRY_TIMEOUT_MS);
		expect(await pending).toBe(true);
		expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
		vi.useRealTimers();
	});

	it.each([401, 403, 409, 422])(
		"denies an action when telemetry returns authorization/conflict status %s",
		async (status) => {
			const { dispatchProductionCampaignAction } = await import(
				"../../src/components/ProductionCampaignModal"
			);
			Object.defineProperty(navigator, "userActivation", {
				configurable: true,
				value: { isActive: true },
			});
			vi.stubGlobal(
				"fetch",
				vi.fn(async () => new Response("denied", { status })),
			);
			const accepted = await dispatchProductionCampaignAction(
				decision() as any,
				"learn",
				1,
				() => 1,
				Date.now() + 10_000,
			);
			expect(accepted).toBe(false);
			expect(openExternalUrlMock).not.toHaveBeenCalled();
		},
	);

	it("rejects normalized cross-origin internal targets before reporting an event", async () => {
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const accepted = await (
			await import("../../src/components/ProductionCampaignModal")
		).dispatchProductionCampaignAction(
			decision({
				staticActions: [
					{
						id: "escape",
						target: { kind: "internal", path: "/\\evil.example" },
					},
				],
			}) as any,
			"escape",
			1,
			() => 1,
			Date.now() + 10_000,
		);
		expect(accepted).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("keeps valid internal navigation on the current origin", () => {
		expect(
			internalActionNavigationUrl(
				"/projects?view=active#recent",
				"https://app.example/home",
			)?.href,
		).toBe("https://app.example/projects?view=active#recent");
		for (const path of [
			String.raw`/\evil.example`,
			`/${"\t"}/evil.example`,
			`/${"\n"}/evil.example`,
		])
			expect(
				internalActionNavigationUrl(path, "https://app.example/home"),
			).toBeNull();
	});

	it("rejects stale callbacks before they can report or consume a static action", async () => {
		const { dispatchProductionCampaignAction } = await import(
			"../../src/components/ProductionCampaignModal"
		);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const accepted = await dispatchProductionCampaignAction(
			decision({
				staticActions: [
					{
						id: "learn",
						target: { kind: "https", url: "https://example.com" },
					},
				],
			}) as any,
			"learn",
			1,
			() => 2,
			Date.now() + 10_000,
		);
		expect(accepted).toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

it("reports the trusted production click before consuming its static target", async () => {
	const { dispatchProductionCampaignAction } = await import(
		"../../src/components/ProductionCampaignModal"
	);
	Object.defineProperty(navigator, "userActivation", {
		configurable: true,
		value: { isActive: true },
	});
	const fetchMock = vi.fn(
		async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
	);
	vi.stubGlobal("fetch", fetchMock);
	const accepted = await dispatchProductionCampaignAction(
		decision({
			staticActions: [
				{ id: "learn", target: { kind: "https", url: "https://example.com" } },
			],
		}) as any,
		"learn",
		1,
		() => 1,
		Date.now() + 10_000,
	);
	expect(accepted).toBe(true);
	expect(fetchMock).toHaveBeenCalledWith(
		"/api/touchpoints/production-runtime/events",
		expect.objectContaining({ method: "POST" }),
	);
	expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
});

describe("ProductionCampaignModal mount lifetime", () => {
	it("uses an actual shadow close control and closes on pointer activation", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (
				this: OpenDesignTouchpointElement,
				_entry,
				_digest,
				_context,
				_urls,
				_actions,
				options,
			) {
				const close = document.createElement("button");
				close.type = "button";
				close.dataset.touchpointClose = "true";
				close.textContent = "Close campaign";
				close.addEventListener("click", () => options?.requestClose?.());
				this.shadowRoot?.replaceChildren(close);
			},
		);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(decision()), { status: 200 }),
				),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		const host = await screen.findByTestId("campaign-custom-element");
		const close = await waitFor(() => {
			const control = host
				.querySelector("opend-touchpoint")
				?.shadowRoot?.querySelector("[data-touchpoint-close]");
			expect(control).toBeTruthy();
			return control as HTMLElement;
		});
		expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
		fireEvent.pointerUp(close);
		fireEvent.click(close);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(document.body.style.overflow).toBe("");
	});

	it("keeps a host fallback when the component mount fails", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockRejectedValue(
			new Error("mount failed"),
		);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(decision()), { status: 200 }),
				),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Close" })).toBeTruthy(),
		);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("removes the host fallback when a shadow close control becomes enabled", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let closeControl!: HTMLButtonElement;
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (this: OpenDesignTouchpointElement) {
				closeControl = document.createElement("button");
				closeControl.dataset.touchpointClose = "true";
				closeControl.disabled = true;
				this.shadowRoot?.replaceChildren(closeControl);
			},
		);
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(decision()), { status: 200 }),
				),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Close" })).toBeTruthy(),
		);
		closeControl.disabled = false;
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Close" })).toBeNull(),
		);
	});

	it("keeps the mounted modal action authorized across focus and online refreshes", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let dispatchAction: ((actionId: string) => Promise<void>) | undefined;
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (
				this: OpenDesignTouchpointElement,
				_entry,
				_digest,
				_context,
				_urls,
				_actions,
				options,
			) {
				dispatchAction = options?.dispatchAction;
				this.shadowRoot?.replaceChildren(
					document.createTextNode("Verified campaign"),
				);
			},
		);
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
			Promise.resolve(
				init?.method === "POST"
					? new Response(JSON.stringify({ ok: true }), { status: 200 })
					: new Response(JSON.stringify(decision()), { status: 200 }),
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(dispatchAction).toBeTypeOf("function"));
		window.dispatchEvent(new Event("focus"));
		window.dispatchEvent(new Event("online"));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		await dispatchAction?.("learn");
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/touchpoints/production-runtime/events",
			expect.objectContaining({ method: "POST" }),
		);
		expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
	});

	it("mounts valid modal content when a refresh starts while verification is deferred", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let resolveVerified: ((value: any) => void) | undefined;
		const verified = new Promise<any>((resolve) => {
			resolveVerified = resolve;
		});
		const verify = vi
			.spyOn(touchpointComponent, "verifyWebTouchpoint")
			.mockReturnValue(verified);
		const fetchMock = vi.fn(() =>
			Promise.resolve(
				new Response(JSON.stringify(decision()), { status: 200 }),
			),
		);
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		resolveVerified?.({
			entryUrl: "blob:modal",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		});
		const host = await screen.findByTestId("campaign-custom-element");
		await waitFor(() =>
			expect(
				host.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
			).toContain("Verified campaign"),
		);
	});

	it("does not let a rejected stale mount restore the fallback over a replacement close control", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		const start = Date.now();
		const now = vi.spyOn(Date, "now").mockReturnValue(start);
		const oldDecision = decision({
			touchpointDecisionId: "old-modal",
			authorizationExpiresAt: new Date(start + 1_000).toISOString(),
		});
		const replacementDecision = decision({
			touchpointDecisionId: "replacement-modal",
			authorizationExpiresAt: new Date(start + 5_000).toISOString(),
		});
		let rejectOldMount!: (reason?: unknown) => void;
		let mountCount = 0;
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
				close.textContent = "Close campaign";
				this.shadowRoot?.replaceChildren(close);
			},
		);
		let fetchCount = 0;
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				const value = fetchCount++ === 0 ? oldDecision : replacementDecision;
				return new Response(JSON.stringify(value), { status: 200 });
			}),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(mountCount).toBe(1));
		now.mockReturnValue(start + 1_001);
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(fetchCount).toBe(2));
		await waitFor(() => expect(mountCount).toBe(2));
		await waitFor(() =>
			expect(
				screen
					.getByTestId("campaign-custom-element")
					.querySelector("opend-touchpoint")
					?.shadowRoot?.querySelector("[data-touchpoint-close]"),
			).toBeTruthy(),
		);
		rejectOldMount(new Error("stale mount failed"));
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Close" })).toBeNull(),
		);
	});

	it("cancels and fences an expired modal timer after accepting a replacement", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		const start = Date.now();
		const now = vi.spyOn(Date, "now").mockReturnValue(start);
		const scheduledTimers: Array<{
			callback: () => void;
			delay: number;
			handle: number;
		}> = [];
		const actualSetTimeout = globalThis.setTimeout;
		vi.spyOn(globalThis, "setTimeout").mockImplementation(((
			callback: TimerHandler,
			delay?: number,
			...args: any[]
		) => {
			const handle = actualSetTimeout(callback, delay, ...args);
			if (typeof callback === "function")
				scheduledTimers.push({
					callback: () => callback(...args),
					delay: Number(delay),
					handle,
				});
			return handle;
		}) as typeof setTimeout);
		const clearTimeoutMock = vi.spyOn(globalThis, "clearTimeout");
		const callbacks: Array<(actionId: string) => Promise<void>> = [];
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (
				this: OpenDesignTouchpointElement,
				_entry,
				_digest,
				_context,
				_urls,
				_actions,
				options,
			) {
				if (options?.dispatchAction) callbacks.push(options.dispatchAction);
				this.shadowRoot?.replaceChildren(
					document.createTextNode("Verified campaign"),
				);
			},
		);
		let resolveReplacement:
			| ((value: ReturnType<typeof decision>) => void)
			| undefined;
		const replacementBody = new Promise<ReturnType<typeof decision>>(
			(resolve) => {
				resolveReplacement = resolve;
			},
		);
		const oldDecision = decision({
			authorizationExpiresAt: new Date(start + 7_000).toISOString(),
		});
		const replacementDecision = decision({
			authorizationExpiresAt: new Date(start + 15_000).toISOString(),
			touchpointDecisionId: "replacement-modal",
		});
		const replacementResponse = new Response(
			JSON.stringify(replacementDecision),
			{ status: 200 },
		);
		vi.spyOn(replacementResponse, "json").mockReturnValue(replacementBody);
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === "POST")
				return Promise.resolve(
					new Response(JSON.stringify({ ok: true }), { status: 200 }),
				);
			if (fetchMock.mock.calls.length === 2)
				return Promise.resolve(replacementResponse);
			return Promise.resolve(
				new Response(JSON.stringify(oldDecision), { status: 200 }),
			);
		});
		vi.stubGlobal("fetch", fetchMock);
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(callbacks).toHaveLength(1));
		const oldCallback = callbacks[0]!;
		const oldTimer = scheduledTimers.find((timer) => timer.delay === 7_000);
		expect(oldTimer).toBeDefined();
		now.mockReturnValue(start + 7_001); // The old lease is expired, but its timer callback is delayed.
		window.dispatchEvent(new Event("focus"));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		resolveReplacement?.(replacementDecision);
		await Promise.resolve(); // Replacement acceptance must cancel and fence the old timer before React cleanup.
		expect(clearTimeoutMock).toHaveBeenCalled(); // The queued old timer below proves cancellation/fencing behavior without Node Timeout identity.
		await oldCallback("learn");
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(openExternalUrlMock).not.toHaveBeenCalled();
		await waitFor(() => expect(callbacks).toHaveLength(2));
		await act(async () => {
			oldTimer?.callback();
		}); // A queued stale callback must not clear the replacement.
		expect(
			screen
				.getByTestId("campaign-custom-element")
				.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
		).toContain("Verified campaign");
		await callbacks[1]!("learn");
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/touchpoints/production-runtime/events",
			expect.objectContaining({ method: "POST" }),
		);
		expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
		const replacementTimer = scheduledTimers.find(
			(timer) => timer.delay === 7_999,
		);
		expect(replacementTimer).toBeDefined();
		now.mockReturnValue(start + 15_001);
		await act(async () => {
			replacementTimer?.callback();
		});
		expect(screen.queryByTestId("campaign-custom-element")).toBeNull();
		await callbacks[1]!("learn");
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it("releases a late verified modal resource once without mounting after unmount", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let resolveVerified: ((value: any) => void) | undefined;
		const verified = new Promise<any>((resolve) => {
			resolveVerified = resolve;
		});
		const verify = vi
			.spyOn(touchpointComponent, "verifyWebTouchpoint")
			.mockReturnValue(verified);
		const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, "mount");
		mount.mockClear();
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(decision()), { status: 200 }),
				),
		);
		const view = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
		view.unmount();
		const release = vi.fn();
		resolveVerified?.({
			entryUrl: "blob:modal",
			resourceUrls: new Map(),
			dispose: release,
		});
		await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
		expect(mount).not.toHaveBeenCalled();
	});
});

describe("ProductionCampaignModal device impressions", () => {
	const marker = (subject = "user-a", activity = "campaign-1") =>
		`touchpoint-displayed:v1:${encodeURIComponent(subject)}:${encodeURIComponent(activity)}`;
	beforeEach(() => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () => new Response(JSON.stringify(decision()), { status: 200 }),
			),
		);
	});
	it("persists successful display without dismissal across restart and login, isolating accounts and profiles", async () => {
		const first = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
		expect(screen.getByRole("dialog")).toBeTruthy();
		first.unmount();
		sessionStorage.clear();
		const restarted = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await act(async () => {});
		expect(screen.queryByRole("dialog")).toBeNull();
		restarted.rerender(
			<ProductionCampaignModal authenticated={false} sessionSubject={null} />,
		);
		restarted.rerender(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await act(async () => {});
		expect(screen.queryByRole("dialog")).toBeNull();
		restarted.rerender(
			<ProductionCampaignModal authenticated sessionSubject="user-b" />,
		);
		await waitFor(() =>
			expect(localStorage.getItem(marker("user-b"))).toBe("1"),
		);
		restarted.unmount();
		localStorage.clear(); // A different local browser/device profile has its own storage.
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
	});
	it("suppresses republication of the same activity but permits a new activity", async () => {
		localStorage.setItem(marker(), "1");
		vi.mocked(fetch).mockImplementation(
			async () =>
				new Response(
					JSON.stringify(
						decision({
							deploymentId: "republished",
							content: { ...content, id: "version-2" },
						}),
					),
					{ status: 200 },
				),
		);
		const view = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await act(async () => {});
		expect(screen.queryByRole("dialog")).toBeNull();
		view.unmount();
		vi.mocked(fetch).mockImplementation(
			async () =>
				new Response(JSON.stringify(decision({ activityId: "campaign-2" })), {
					status: 200,
				}),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() =>
			expect(localStorage.getItem(marker("user-a", "campaign-2"))).toBe("1"),
		);
	});
	it("does not consume an impression during verification or on failed mount and dismissal", async () => {
		let finish!: () => void;
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			() =>
				new Promise<void>((_, reject) => {
					finish = () => reject(new Error("mount failed"));
				}),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(finish).toBeTypeOf("function"));
		expect(localStorage.getItem(marker())).toBeNull();
		await act(async () => finish());
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(localStorage.getItem(marker())).toBeNull();
	});
	it("waits for a hidden document to become visible before recording", async () => {
		const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await screen.findByRole("button", { name: "Close" });
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
		});
		expect(localStorage.getItem(marker())).toBeNull();
		hidden.mockReturnValue(false);
		fireEvent(document, new Event("visibilitychange"));
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
	});
	it("keeps the existing badge and its manual static action usable after automatic suppression", async () => {
		localStorage.setItem(marker(), "1");
		const placementKey = "opend.home.account-badge";
		const badgeManifest = {
			...manifest,
			placements: [
				{
					...manifest.placements[0]!,
					key: placementKey,
					requiredCapabilities: ["static-action"],
				},
			],
		};
		const badgeDecision = decision({
			placementKey,
			requiredCapabilities: ["static-action"],
			content: {
				...content,
				placementKey,
				manifest: badgeManifest,
				manifestHash: digest(JSON.stringify(badgeManifest)),
			},
		});
		let click!: (id: string) => Promise<void>;
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			async function (
				this: OpenDesignTouchpointElement,
				_entry,
				_digest,
				_context,
				_urls,
				_actions,
				options,
			) {
				click = options!.dispatchAction!;
				this.shadowRoot?.replaceChildren(
					document.createTextNode("Open campaign"),
				);
			},
		);
		vi.mocked(fetch).mockImplementation(
			async (input, init) =>
				new Response(
					JSON.stringify(
						init?.method === "POST"
							? { ok: true }
							: String(input).includes(placementKey)
								? badgeDecision
								: decision(),
					),
					{ status: 200 },
				),
		);
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		render(
			<>
				<ProductionCampaignModal authenticated sessionSubject="user-a" />
				<ProductionCampaignBadge authenticated sessionSubject="user-a" />
			</>,
		);
		await waitFor(() => expect(click).toBeTypeOf("function"));
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.getByTestId("production-campaign-badge")).toBeTruthy();
		await click("learn");
		expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
	});
	it("does not record a verified mount with no visible geometry", async () => {
		vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
			length: 0,
		} as DOMRectList);
		let paint!: FrameRequestCallback;
		vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
			paint = callback;
			return 1;
		});
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(paint).toBeTypeOf("function"));
		await act(async () => paint(0));
		expect(localStorage.getItem(marker())).toBeNull();
	});
	it("does not persist rejected verification, and permits a subsequent successful retry", async () => {
		const verify = vi
			.spyOn(touchpointComponent, "verifyWebTouchpoint")
			.mockRejectedValueOnce(new Error("digest mismatch"));
		const view = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await screen.findByRole("button", { name: "Close" });
		expect(localStorage.getItem(marker())).toBeNull();
		view.unmount();
		verify.mockRestore();
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
	});
	it("does not record a successful mount that completes after unmount", async () => {
		let finish!: () => void;
		vi.spyOn(OpenDesignTouchpointElement.prototype, "mount").mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		const view = render(
			<ProductionCampaignModal authenticated sessionSubject="user-a" />,
		);
		await waitFor(() => expect(finish).toBeTypeOf("function"));
		view.unmount();
		await act(async () => finish());
		expect(localStorage.getItem(marker())).toBeNull();
	});
	it("remains displayable and dismissible when local storage access fails", async () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage denied");
		});
		const write = vi
			.spyOn(Storage.prototype, "setItem")
			.mockImplementation(() => {
				throw new Error("quota");
			});
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await screen.findByRole("button", { name: "Close" });
		await waitFor(() => expect(write).toHaveBeenCalled());
		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
