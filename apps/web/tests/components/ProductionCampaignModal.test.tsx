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
import { ProductionCampaignModal } from "../../src/components/ProductionCampaignModal";
import { internalActionNavigationUrl } from "../../src/components/touchpoint-navigation";
import { ProductionCampaignBadge } from "../../src/components/ProductionCampaignBadge";
import * as touchpointComponent from "../../src/components/touchpoint-component";
import { OpenDesignTouchpointElement } from "../../src/components/touchpoint-component";
import { I18nProvider, useI18n } from "../../src/i18n";

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
		authorizationExpiresAt: new Date(serverTime.getTime() + 60_000).toISOString(),
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
function LocaleSwitcher() {
	const { setLocale } = useI18n();
	return (
		<>
			<button type="button" onClick={() => setLocale("en")}>
				Switch to en
			</button>
			<button type="button" onClick={() => setLocale("fr")}>
				Switch to fr
			</button>
		</>
	);
}

function localizedDecision(
	locale: "en" | "fr",
	overrides: Partial<Record<string, unknown>> = {},
) {
	const localizedManifest = {
		...manifest,
		placements: manifest.placements.map((placement) => ({
			...placement,
			locales: [locale],
		})),
	};
	return decision({
		content: {
			...content,
			id: `version-${locale}`,
			locale,
			manifest: localizedManifest,
			manifestHash: digest(JSON.stringify(localizedManifest)),
		},
		touchpointDecisionId: `decision-${locale}`,
		...overrides,
	});
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue({
		length: 1,
	} as DOMRectList);
	vi
		.spyOn(OpenDesignTouchpointElement.prototype, "mount")
		.mockImplementation(async function (this: OpenDesignTouchpointElement) {
			this.shadowRoot?.replaceChildren(
				document.createTextNode("Verified campaign"),
			);
		});
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
		expect(modalRule).toContain("background: transparent");
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
	it("reloads the still-open activity with the I18nProvider locale without reopening a dismissed impression", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "de-DE", type: "desktop" },
		};
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (
				this: OpenDesignTouchpointElement,
				_entry,
				_digest,
				context,
			) {
				this.shadowRoot?.replaceChildren(
					document.createTextNode(`Campaign ${context.locale}`),
				);
			});
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const locale = new URL(String(input), "http://localhost").searchParams.get(
				"locale",
			);
			return new Response(
				JSON.stringify(localizedDecision(locale === "fr" ? "fr" : "en")),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", fetchMock);
		render(
			<I18nProvider initial="en">
				<LocaleSwitcher />
				<ProductionCampaignModal authenticated sessionSubject="locale-user" />
			</I18nProvider>,
		);
		await waitFor(() =>
			expect(
				document.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
			).toContain("Campaign en"),
		);
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:locale-user:campaign-1"),
			).toBe("1"),
		);
		fireEvent.click(screen.getByRole("button", { name: "Switch to fr" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		await waitFor(() =>
			expect(
				document.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
			).toContain("Campaign fr"),
		);
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		fireEvent.click(screen.getByRole("button", { name: "Switch to en" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("keeps a displayed activity mounted when its renewed lease crosses the first authorization deadline before switching locale", async () => {
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
		try {
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
			(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
				client: { osLocale: "en-US", type: "desktop" },
			};
			let mounted!: () => void;
			const mountedPromise = new Promise<void>((resolve) => {
				mounted = resolve;
			});
			vi
				.spyOn(OpenDesignTouchpointElement.prototype, "mount")
				.mockImplementation(async function (
					this: OpenDesignTouchpointElement,
					_entry,
					_digest,
					context,
				) {
					this.shadowRoot?.replaceChildren(
						document.createTextNode(`Campaign ${context.locale}`),
					);
					mounted();
				});
			const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
				const locale = new URL(String(input), "http://localhost").searchParams.get(
					"locale",
				);
				const now = Date.now();
				return new Response(
					JSON.stringify(
						localizedDecision(locale === "fr" ? "fr" : "en", {
							serverTime: new Date(now).toISOString(),
							authorizationExpiresAt: new Date(now + 60_000).toISOString(),
							endsAt: new Date(now + 300_000).toISOString(),
						}),
					),
					{ status: 200 },
				);
			});
			vi.stubGlobal("fetch", fetchMock);
			render(
				<I18nProvider initial="en">
					<LocaleSwitcher />
					<ProductionCampaignModal authenticated sessionSubject="renew-user" />
				</I18nProvider>,
			);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await act(async () => {
				await mountedPromise;
			});
			expect(
				document.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
			).toContain("Campaign en");
			const originalElement = document.querySelector("opend-touchpoint");
			localStorage.setItem("touchpoint-displayed:v1:renew-user:campaign-1", "1");
			await act(async () => {
				await vi.advanceTimersByTimeAsync(30_000);
			});
			await act(async () => {
				await vi.advanceTimersByTimeAsync(31_000);
			});
			expect(document.querySelector("opend-touchpoint")).toBe(originalElement);
			expect(originalElement?.shadowRoot?.textContent).toContain("Campaign en");
			fireEvent.click(screen.getByRole("button", { name: "Switch to fr" }));
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			await vi.waitFor(() =>
				expect(
					document.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
				).toContain("Campaign fr"),
			);
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	});

	it("does not let a 404 locale transition exempt an already displayed activity", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const locale = new URL(String(input), "http://localhost").searchParams.get(
				"locale",
			);
			return locale === "fr"
				? new Response(null, { status: 404 })
				: new Response(JSON.stringify(localizedDecision("en")), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		render(
			<I18nProvider initial="en">
				<LocaleSwitcher />
				<ProductionCampaignModal authenticated sessionSubject="locale-user" />
			</I18nProvider>,
		);
		await waitFor(() =>
			expect(
				localStorage.getItem("touchpoint-displayed:v1:locale-user:campaign-1"),
			).toBe("1"),
		);
		fireEvent.click(screen.getByRole("button", { name: "Switch to fr" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		fireEvent.click(screen.getByRole("button", { name: "Switch to en" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("does not let a deferred old-language authorization revive after a locale switch", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let resolveEnglish!: (value: unknown) => void;
		const english = new Promise<unknown>((resolve) => {
			resolveEnglish = resolve;
		});
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const locale = new URL(String(input), "http://localhost").searchParams.get(
				"locale",
			);
			return locale === "fr"
				? new Response(null, { status: 404 })
				: { ok: true, json: () => english };
		});
		vi.stubGlobal("fetch", fetchMock);
		render(
			<I18nProvider initial="en">
				<LocaleSwitcher />
				<ProductionCampaignModal authenticated sessionSubject="locale-user" />
			</I18nProvider>,
		);
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
		fireEvent.click(screen.getByRole("button", { name: "Switch to fr" }));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		resolveEnglish(localizedDecision("en"));
		await act(async () => {});
		expect(screen.queryByRole("dialog")).toBeNull();
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
				new Response(JSON.stringify(decision({ deploymentId: "deployment-2" })), {
					status: 200,
				}),
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
		expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
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
			.mockResolvedValueOnce(new Response(JSON.stringify(active), { status: 200 }))
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

describe("Production campaign live refresh", () => {
	let available: boolean;
	let hidden: boolean;
	const fetchMock = vi.fn(async () =>
		available
			? new Response(JSON.stringify(decision()), { status: 200 })
			: new Response(null, { status: 404 }),
	);

	beforeEach(() => {
		vi.useFakeTimers();
		available = false;
		hidden = false;
		fetchMock.mockClear();
		vi.stubGlobal("fetch", fetchMock);
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		vi.spyOn(touchpointComponent, "verifyWebTouchpoint").mockResolvedValue({
			entryUrl: "blob:campaign",
			resourceUrls: new Map(),
			dispose: vi.fn(),
		});
	});
	const tick = async (ms: number) => {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(ms);
		});
	};
	const open = async (authenticated = true) => {
		const view = render(
			<ProductionCampaignModal
				authenticated={authenticated}
				sessionSubject="poll-user"
			/>,
		);
		await act(async () => {});
		return view;
	};

	it("discovers a newly published campaign at 30 seconds without a focus event", async () => {
		await open();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("dialog")).toBeNull();
		available = true;
		await tick(29_999);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("dialog")).toBeNull();
		await tick(1);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(
			document.querySelector("opend-touchpoint")?.shadowRoot?.textContent,
		).toContain("Verified campaign");
	});

	it("pauses polling while hidden and refreshes immediately when visible again", async () => {
		await open();
		hidden = true;
		await tick(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		available = true;
		hidden = false;
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it.each(["focus", "online"])("refreshes immediately on %s", async (event) => {
		await open();
		available = true;
		await act(async () => {
			window.dispatchEvent(new Event(event));
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("keeps an active mount and does not reopen a displayed campaign on later polls", async () => {
		available = true;
		await open();
		await tick(16);
		expect(
			localStorage.getItem("touchpoint-displayed:v1:poll-user:campaign-1"),
		).toBe("1");
		const host = document.querySelector("opend-touchpoint");
		expect(host).not.toBeNull();
		await tick(30_000);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		await tick(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("does not poll signed-out users and removes timers and wake listeners on cleanup", async () => {
		const view = await open(false);
		await tick(30_000);
		expect(fetchMock).not.toHaveBeenCalled();
		view.rerender(
			<ProductionCampaignModal authenticated sessionSubject="poll-user" />,
		);
		await act(async () => {});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		view.rerender(
			<ProductionCampaignModal authenticated={false} sessionSubject={null} />,
		);
		await tick(60_000);
		await act(async () => {
			window.dispatchEvent(new Event("focus"));
			window.dispatchEvent(new Event("online"));
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(fetchMock).toHaveBeenCalledTimes(1);
		view.rerender(
			<ProductionCampaignModal authenticated sessionSubject="poll-user" />,
		);
		await act(async () => {});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		view.unmount();
		await tick(60_000);
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
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
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (
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
			});
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

	it("does not add a host button on mount failure and remains dismissible with Escape", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockRejectedValue(new Error("mount failed"));
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
			expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalled(),
		);
		expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("never adds a host button while the component close control becomes enabled", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let closeControl!: HTMLButtonElement;
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (this: OpenDesignTouchpointElement) {
				closeControl = document.createElement("button");
				closeControl.dataset.touchpointClose = "true";
				closeControl.disabled = true;
				this.shadowRoot?.replaceChildren(closeControl);
			});
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response(JSON.stringify(decision()), { status: 200 }),
				),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await waitFor(() => expect(closeControl).toBeTruthy());
		expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
		closeControl.disabled = false;
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Close" })).toBeNull(),
		);
	});

	it("keeps a mounted action authorized after same-key polling renews its lease", async () => {
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
		try {
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
			(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
				client: { osLocale: "en-US", type: "desktop" },
			};
			let dispatchAction: ((actionId: string) => Promise<void>) | undefined;
			let mounted!: () => void;
			const mountedPromise = new Promise<void>((resolve) => {
				mounted = resolve;
			});
			vi
				.spyOn(OpenDesignTouchpointElement.prototype, "mount")
				.mockImplementation(async function (
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
					mounted();
				});
			let gets = 0;
			const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
				if (init?.method === "POST")
					return Promise.resolve(
						new Response(JSON.stringify({ ok: true }), { status: 200 }),
					);
				gets += 1;
				const time = Date.now();
				return Promise.resolve(
					new Response(
						JSON.stringify(
							decision({
								serverTime: new Date(time).toISOString(),
								authorizationExpiresAt: new Date(time + 40_000).toISOString(),
								endsAt: new Date(time + 300_000).toISOString(),
							}),
						),
						{ status: 200 },
					),
				);
			});
			vi.stubGlobal("fetch", fetchMock);
			Object.defineProperty(navigator, "userActivation", {
				configurable: true,
				value: { isActive: true },
			});
			render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(0);
			});
			// Commit the authorized decision before awaiting the mount effect it schedules.
			await act(async () => {
				await mountedPromise;
			});
			expect(dispatchAction).toBeTypeOf("function");
			await act(async () => {
				await vi.advanceTimersByTimeAsync(30_000);
			});
			expect(gets).toBe(2);
			expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
			await act(async () => {
				await vi.advanceTimersByTimeAsync(10_000);
			});
			await dispatchAction?.("learn");
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/touchpoints/production-runtime/events",
				expect.objectContaining({ method: "POST" }),
			);
			expect(openExternalUrlMock).toHaveBeenCalledWith("https://example.com");
		} finally {
			cleanup();
			vi.useRealTimers();
		}
	});

	it("fences the old modal action until recovery mounts a fresh decision", async () => {
		(globalThis as CampaignHostGlobal).__openDesignCampaignTestHost = {
			client: { osLocale: "en-US", type: "desktop" },
		};
		let dispatchAction: ((actionId: string) => Promise<void>) | undefined;
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (
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
			});
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
		await waitFor(() =>
			expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(2),
		);
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
		vi
			.spyOn(touchpointComponent, "verifyWebTouchpoint")
			.mockReturnValue(verified);
		const fetchMock = vi.fn(() =>
			Promise.resolve(new Response(JSON.stringify(decision()), { status: 200 })),
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
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (this: OpenDesignTouchpointElement) {
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
			});
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
			vi.fn(async () => new Response(JSON.stringify(decision()), { status: 200 })),
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
		await waitFor(() => expect(localStorage.getItem(marker("user-b"))).toBe("1"));
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
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(localStorage.getItem(marker())).toBeNull();
	});
	it("waits for a hidden document to become visible before loading and recording", async () => {
		const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await act(async () => {});
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(localStorage.getItem(marker())).toBeNull();
		hidden.mockReturnValue(false);
		fireEvent(document, new Event("visibilitychange"));
		await screen.findByRole("dialog");
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
	});
	it("does not re-present a displayed campaign after the page is hidden and shown again", async () => {
		// Screen sleep hides the page, which withdraws the lease and takes the
		// modal down. Waking is a NEW presentation, not a renewal: the recorded
		// impression has to close it even though the server still offers the
		// same activity.
		let hidden = false;
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await screen.findByRole("dialog");
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
		hidden = true;
		await act(async () => {
			fireEvent(document, new Event("visibilitychange"));
		});
		expect(screen.queryByRole("dialog")).toBeNull();
		hidden = false;
		await act(async () => {
			fireEvent(document, new Event("visibilitychange"));
		});
		await act(async () => {});
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	it("keeps the displayed campaign on screen when a poll fails and its retry recovers", async () => {
		// A transport failure is not a withdrawal: the lifecycle keeps the lease
		// and retries inside the same cycle. The presentation has to survive with
		// it, or the recovering poll reads the device impression and closes the
		// activity that never left the screen.
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
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		let calls = 0;
		const fetchMock = vi.fn(async () => {
			calls += 1;
			if (calls === 2) throw new TypeError("Failed to fetch");
			return new Response(JSON.stringify(decision()), { status: 200 });
		});
		vi.stubGlobal("fetch", fetchMock);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10);
		});
		expect(document.querySelector("opend-touchpoint")).not.toBeNull();
		// Fake timers do not drive jsdom's animation frames, so record the
		// impression the paint would have recorded.
		localStorage.setItem(marker(), "1");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(document.querySelector("opend-touchpoint")).not.toBeNull();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_500);
		});
		expect(calls).toBeGreaterThanOrEqual(3);
		expect(document.querySelector("opend-touchpoint")).not.toBeNull();
		expect(screen.queryByRole("dialog")).not.toBeNull();
	});
	it.each(["no-decision", "stale-revocation"] as const)(
		"keeps the displayed campaign on screen when a retained %s poll recovers",
		async (interim) => {
			const active = decision();
			let calls = 0;
			const fetchMock = vi.fn(async () => {
				calls += 1;
				if (calls !== 2)
					return new Response(JSON.stringify(active), { status: 200 });
				if (interim === "no-decision")
					return new Response(null, { status: 404 });
				return new Response(
					JSON.stringify({
						error: "production_runtime_revoked",
						receipt: {
							touchpointDecisionId: active.touchpointDecisionId,
							deploymentId: "stale-deployment",
							activityId: active.activityId,
							contentVersionId: active.content.id,
						},
					}),
					{ status: 410 },
				);
			});
			vi.stubGlobal("fetch", fetchMock);
			render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
			await waitFor(() => expect(calls).toBe(1));
			const host = document.querySelector("opend-touchpoint");
			expect(host).not.toBeNull();
			// The host is inserted before its asynchronous mount finishes. Wait for
			// the visibility record so this test cannot race a focus refresh against
			// creation of the open-presentation guard it is meant to exercise.
			await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
			await act(async () => {
				fireEvent(window, new Event("focus"));
			});
			await waitFor(() => expect(calls).toBe(2));
			expect(document.querySelector("opend-touchpoint")).toBe(host);
			await act(async () => {
				fireEvent(window, new Event("focus"));
			});
			await waitFor(() => expect(calls).toBe(3));
			expect(document.querySelector("opend-touchpoint")).toBe(host);
			expect(screen.queryByRole("dialog")).not.toBeNull();
		},
	);
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
		vi
			.spyOn(OpenDesignTouchpointElement.prototype, "mount")
			.mockImplementation(async function (
				this: OpenDesignTouchpointElement,
				_entry,
				_digest,
				_context,
				_urls,
				_actions,
				options,
			) {
				click = options!.dispatchAction!;
				this.shadowRoot?.replaceChildren(document.createTextNode("Open campaign"));
			});
		vi
			.mocked(fetch)
			.mockImplementation(
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
		await screen.findByRole("dialog");
		await act(async () => {});
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
		await screen.findByRole("dialog");
		await act(async () => {});
		await waitFor(() => expect(write).toHaveBeenCalled());
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
