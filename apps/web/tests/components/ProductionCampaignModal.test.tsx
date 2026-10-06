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

	// OPEND-3363 at the component seam. `online` used to run the destructive
	// wake, which published a null decision and unmounted the dialog — taking the
	// scroll lock, the focus trap and the mounted host element with it — before
	// any evidence about the activity had arrived. Everything observable here is
	// asserted INSIDE the pending revalidation window.
	it("keeps the dialog mounted, scroll-locked and focus-trapped while an online revalidation is pending", async () => {
		available = true;
		let stall!: (value: Response) => void;
		let calls = 0;
		const staged = vi.fn(async () => {
			calls += 1;
			if (calls === 1)
				return new Response(JSON.stringify(decision()), { status: 200 });
			return new Promise<Response>((resolve) => {
				stall = resolve;
			});
		});
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		const dialog = screen.getByRole("dialog");
		const modal = dialog.firstElementChild as HTMLElement;
		const element = document.querySelector("opend-touchpoint");
		expect(element).not.toBeNull();
		expect(document.body.style.overflow).toBe("hidden");
		const outside = document.createElement("button");
		document.body.append(outside);
		outside.focus();
		await act(async () => {
			window.dispatchEvent(new Event("online"));
		});
		expect(staged).toHaveBeenCalledTimes(2);
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(element);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
		expect(document.body.style.overflow).toBe("hidden");
		fireEvent.keyDown(document, { key: "Tab" });
		expect(modal.contains(document.activeElement)).toBe(true);
		outside.remove();
		await act(async () => {
			stall(new Response(JSON.stringify(decision()), { status: 200 }));
		});
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(element);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
	});

	// OPEND-3369 measured this; OPEND-3374 reversed it. **Deliberate contract
	// change.** The Modal's key was
	// `touchpointDecisionId:deploymentId:activityId:content.id`, so an id that
	// rotated every poll rebuilt the host 120 times an hour. The key is now
	// content identity alone, so the same hour of rotating credentials costs
	// nothing: one host, one mount.
	it("keeps one mounted host for a whole hour of rotating decision ids", async () => {
		const POLLS = 120; // one hour at the 30s interval
		let issued = 0;
		const rotating = vi.fn(async () => {
			issued += 1;
			return new Response(
				JSON.stringify(decision({ touchpointDecisionId: `decision-${issued}` })),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", rotating);
		await open();
		await tick(16);
		expect(screen.getByRole("dialog")).toBeTruthy();
		const hosts = new Set<Element>();
		hosts.add(document.querySelector("opend-touchpoint") as Element);
		for (let poll = 1; poll <= POLLS; poll += 1) {
			await tick(30_000);
			hosts.add(document.querySelector("opend-touchpoint") as Element);
		}
		expect(rotating).toHaveBeenCalledTimes(POLLS + 1);
		// One host element for the whole hour, mounted once.
		expect(hosts.size).toBe(1);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
	});

	// The control it used to need: with a stable id the answer was already one
	// host and one mount, and it still is. The two cases now agree, which is the
	// point — the credential has stopped being able to change the answer.
	it("keeps one mounted host for a whole hour when the decision id is stable", async () => {
		const POLLS = 120;
		available = true;
		await open();
		await tick(16);
		const host = document.querySelector("opend-touchpoint");
		expect(host).not.toBeNull();
		await tick(POLLS * 30_000);
		expect(fetchMock).toHaveBeenCalledTimes(POLLS + 1);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
	});

	// OPEND-3374, the core case. The server credential row lives 60s and the
	// client polls every 30s, so missing two polls — a Wi-Fi switch, a tunnel, a
	// closed lid — expires it. On recovery the server INSERTs a new row and
	// issues a NEW `touchpointDecisionId`, everything else identical. While the
	// id was part of the lease key that was a changed key, so the campaign was
	// torn down and rebuilt: shadow DOM, Blob URLs, entry animation, scroll lock.
	// After OPEND-3369 it was the ONLY thing that still caused a remount, which
	// moved the flicker from "every 30s for everyone" to "whenever the network
	// wobbles" — the same users the P1 was about.
	it("REGRESSION: a network outage that outlives the server credential does not remount the campaign", async () => {
		const longLived = (overrides: Record<string, unknown> = {}) => {
			const now = Date.now();
			return decision({
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
				...overrides,
			});
		};
		let online = true;
		let decisionId = "decision-1";
		const requests: string[] = [];
		const staged = vi.fn(async (input: RequestInfo | URL) => {
			requests.push(String(input));
			if (!online) throw new TypeError("Failed to fetch");
			return new Response(
				JSON.stringify(longLived({ touchpointDecisionId: decisionId })),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		const dialog = screen.getByRole("dialog");
		const host = document.querySelector("opend-touchpoint");
		expect(host).not.toBeNull();
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);

		// Three polls' worth of outage: past the 60s credential TTL, well inside
		// the authorization the server granted.
		online = false;
		await tick(90_000);
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(host);

		// Recovery. Same activity, same deployment, same content — new credential.
		online = true;
		decisionId = "decision-2";
		requests.length = 0;
		// OPEND-3436: a client in offline fallback revalidates on the reconnection
		// itself rather than on the next poll tick, so the event a real network
		// restore fires is now what drives recovery. What this case is about —
		// the host is not rebuilt across the outage — is unchanged.
		act(() => { window.dispatchEvent(new Event("online")); });
		await tick(30_000);
		expect(requests.length).toBeGreaterThan(0);
		// The client still identifies itself with the credential it is holding,
		// which by now the server has expired (OPEND-3372 keeps it answerable).
		expect(requests[0]).toContain("activeDecisionId=decision-1");
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
		// One mount for the whole episode: no rebuilt shadow DOM, no replayed
		// entry animation, no scroll lock released and re-taken.
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
		expect(document.body.style.overflow).toBe("hidden");
	});

	// The other half of OPEND-3372's premise: the client now holds a credential
	// the server has long since expired, and still has to be able to be told the
	// activity was withdrawn. The receipt comparison is four fields, and the one
	// the client offers is the stale id.
	it("still clears on a 410 whose receipt echoes the stale decision id the client kept", async () => {
		const longLived = (overrides: Record<string, unknown> = {}) => {
			const now = Date.now();
			return decision({
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
				...overrides,
			});
		};
		const original = longLived({ touchpointDecisionId: "decision-1" });
		let call = 0;
		const staged = vi.fn(async () => {
			call += 1;
			if (call === 1) return new Response(JSON.stringify(original), { status: 200 });
			if (call === 2)
				return new Response(
					JSON.stringify(longLived({ touchpointDecisionId: "decision-2" })),
					{ status: 200 },
				);
			return new Response(
				JSON.stringify({
					error: "production_runtime_revoked",
					receipt: {
						touchpointDecisionId: "decision-1",
						deploymentId: original.deploymentId,
						activityId: original.activityId,
						contentVersionId: original.content.id,
					},
				}),
				{ status: 410 },
			);
		});
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		await tick(30_000);
		expect(screen.getByRole("dialog")).toBeTruthy();
		await tick(30_000);
		await tick(16);
		expect(staged.mock.calls.length).toBeGreaterThanOrEqual(3);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	// OPEND-3364's premise, stated as an assertion rather than an assumption: a
	// click after the credential rotated reports the id the client is holding,
	// which is the stale one. Settlement has to be bound to the deployment
	// window, not to that credential's own sixty seconds.
	it("reports the stale decision id on a click after the credential rotated", async () => {
		const longLived = (overrides: Record<string, unknown> = {}) => {
			const now = Date.now();
			return decision({
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
				...overrides,
			});
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
		Object.defineProperty(navigator, "userActivation", {
			configurable: true,
			value: { isActive: true },
		});
		let decisionId = "decision-1";
		const posted: unknown[] = [];
		const staged = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			if (init?.method === "POST") {
				posted.push(JSON.parse(String(init.body)));
				return new Response(JSON.stringify({ ok: true }), { status: 200 });
			}
			return new Response(
				JSON.stringify(longLived({ touchpointDecisionId: decisionId })),
				{ status: 200 },
			);
		});
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		decisionId = "decision-2";
		await tick(30_000);
		await act(async () => {
			await dispatchAction?.("learn");
		});
		expect(posted).toHaveLength(1);
		expect(posted[0]).toMatchObject({ touchpointDecisionId: "decision-1" });
	});

	it.each([
		["the content version changes", { content: { ...content, id: "version-2" } }],
		["the deployment changes", { deploymentId: "deployment-2" }],
		["the activity changes", { activityId: "campaign-2" }],
	])("still rebuilds the host when %s", async (_label, overrides) => {
		const longLived = (extra: Record<string, unknown> = {}) => {
			const now = Date.now();
			return decision({
				authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
				endsAt: new Date(now + 40 * 60_000).toISOString(),
				...extra,
			});
		};
		let next: Record<string, unknown> = {};
		const staged = vi.fn(
			async () => new Response(JSON.stringify(longLived(next)), { status: 200 }),
		);
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		const host = document.querySelector("opend-touchpoint");
		expect(host).not.toBeNull();
		next = overrides;
		await tick(30_000);
		await tick(16);
		expect(document.querySelector("opend-touchpoint")).not.toBe(host);
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(2);
	});

	// Keeping the previous decision OBJECT when the key matches must never mean
	// keeping the previous deadline: `validForMs` always comes from the new
	// result, so an activity cut short still ends on time.
	it("honours an authorization the server shortens even though the decision object is kept", async () => {
		let call = 0;
		const staged = vi.fn(async () => {
			call += 1;
			const now = Date.now();
			if (call === 1)
				return new Response(
					JSON.stringify(
						decision({
							touchpointDecisionId: "decision-1",
							authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
							endsAt: new Date(now + 40 * 60_000).toISOString(),
						}),
					),
					{ status: 200 },
				);
			if (call === 2)
				return new Response(
					JSON.stringify(
						decision({
							touchpointDecisionId: "decision-2",
							authorizationExpiresAt: new Date(now + 45_000).toISOString(),
							endsAt: new Date(now + 45_000).toISOString(),
						}),
					),
					{ status: 200 },
				);
			throw new TypeError("Failed to fetch");
		});
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		const host = document.querySelector("opend-touchpoint");
		await tick(30_000);
		// Same key, so the host survives...
		expect(document.querySelector("opend-touchpoint")).toBe(host);
		await tick(44_000);
		expect(screen.getByRole("dialog")).toBeTruthy();
		// ...but the shortened authorization still retires it on the new deadline.
		await tick(1_500);
		await tick(16);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	// OPEND-3375 through the whole chain: real loader, real lifecycle, real host.
	// A withdrawn deployment answers 410 with no receipt, and the campaign has to
	// come off the screen at once rather than ride the failure out on its lease.
	it("closes at once when a withdrawn deployment answers 410 without a receipt", async () => {
		let withdrawn = false;
		const staged = vi.fn(async () => {
			const now = Date.now();
			return withdrawn
				? new Response(JSON.stringify({ error: "production_runtime_withdrawn" }), { status: 410 })
				: new Response(
						JSON.stringify(
							decision({
								authorizationExpiresAt: new Date(now + 30 * 60_000).toISOString(),
								endsAt: new Date(now + 40 * 60_000).toISOString(),
							}),
						),
						{ status: 200 },
					);
		});
		vi.stubGlobal("fetch", staged);
		await open();
		await tick(16);
		expect(screen.getByRole("dialog")).toBeTruthy();
		withdrawn = true;
		await tick(30_000);
		await tick(16);
		expect(screen.queryByRole("dialog")).toBeNull();
		// Not merely gone: gone and not coming back on a later poll.
		withdrawn = false;
		await tick(30_000);
		await tick(16);
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

	// OPEND-3363, deliberate contract change. This case used to require that
	// recovery FENCE the mounted decision and mount a second time before the
	// action was authorized again — the destructive `wake` seen from the action
	// path. Recovery no longer withdraws a live lease, so the host mounted once
	// stays the authorized one across both events.
	it("keeps the mounted modal action authorized across focus and online recovery", async () => {
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
		const host = document.querySelector("opend-touchpoint");
		window.dispatchEvent(new Event("focus"));
		window.dispatchEvent(new Event("online"));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(OpenDesignTouchpointElement.prototype.mount).toHaveBeenCalledTimes(1);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
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
	/**
	 * The impression is recorded inside a `requestAnimationFrame`, so a case that
	 * waits for one has to fake frames too. Leaving `requestAnimationFrame` out
	 * of `toFake` leaves it on the REAL clock while the case advances only the
	 * fake one, and then whether the marker is written comes down to how much
	 * wall time happened to pass inside the awaits — green on an idle machine,
	 * red under load.
	 */
	const IMPRESSION_TIMERS = [
		"Date",
		"performance",
		"setTimeout",
		"clearTimeout",
		"setInterval",
		"clearInterval",
		"requestAnimationFrame",
		"cancelAnimationFrame",
	] as const;
	/**
	 * Faking frames on its own is not enough, and on its own makes it worse: the
	 * frame is requested only once `verifyWebTouchpoint` resolves, and that is
	 * real asynchronous crypto which no amount of fake time can hurry. A single
	 * fixed advance can therefore run out before the frame is even asked for.
	 *
	 * So step until the marker lands, and keep the two waits inside a step
	 * separate. The real queue has to TURN for the crypto to finish; fake time
	 * has to MOVE for the frame that records the impression to fire. Advancing
	 * alone couples them — a step would buy exactly one turn of the real queue,
	 * so a box that is slow at the crypto runs out of steps long before it runs
	 * out of fake milliseconds. Yielding first decouples them. A healthy mount
	 * leaves on the first step, so the budget is only ever paid by a mount that
	 * is genuinely stuck, and the assertion then names that as the cause.
	 */
	const advanceToRecordedImpression = async (subject = "user-a", activity = "campaign-1") => {
		for (let step = 0; step < 300 && localStorage.getItem(marker(subject, activity)) === null; step += 1)
			await act(async () => {
				for (let turn = 0; turn < 8; turn += 1) await new Promise(resolve => setImmediate(resolve));
				await vi.advanceTimersByTimeAsync(16);
			});
		expect(
			localStorage.getItem(marker(subject, activity)),
			"impression never recorded — the mount it follows most likely never resolved",
		).toBe("1");
	};
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
	// The interaction between OPEND-3363 and the wake fence from #8269.
	//
	// The fence exists to compensate for a premise the fence's own comment
	// states: "A hidden page ... withdraws the lease and takes this modal down
	// with it". OPEND-3363 removed that premise — hiding now cancels only the
	// request in flight, and both the lease and the modal stay. The fence still
	// releases the presentation, so the campaign is on screen with nothing
	// recorded as presenting it; the poll that follows on return then reads the
	// device impression, finds no open presentation, and clears the host.
	//
	// Two correct fixes producing the P1 symptom between them.
	it("keeps a displayed campaign through a tab switch now that hiding no longer withdraws it", async () => {
		let hidden = false;
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		const dialog = await screen.findByRole("dialog");
		await waitFor(() => expect(localStorage.getItem(marker())).toBe("1"));
		const host = document.querySelector("opend-touchpoint");

		// Away. OPEND-3363: the lease is untouched, so the modal is still mounted.
		hidden = true;
		await act(async () => {
			fireEvent(document, new Event("visibilitychange"));
		});
		expect(screen.getByRole("dialog")).toBe(dialog);

		// Back, and the revalidation that follows lands.
		hidden = false;
		await act(async () => {
			fireEvent(document, new Event("visibilitychange"));
		});
		await act(async () => {});
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
	});

	// The same tab switch, but with time actually passing. The case above toggles
	// visibility on the real clock with nothing in between, so it cannot tell "the
	// lease was left alone" from "nothing had time to lapse". Forty-five seconds
	// of a sixty-second authorization puts a poll tick inside the hidden spell and
	// still leaves the lease the server's to renew, which is the shape a user
	// actually produces by reading a mail and coming back.
	it("keeps the same host through a background spell shorter than its authorization", async () => {
		vi.useFakeTimers({ toFake: [...IMPRESSION_TIMERS] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		let hidden = false;
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		const fetchMock = vi.fn(async () => new Response(JSON.stringify(decision()), { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await act(async () => { await vi.advanceTimersByTimeAsync(16); });
		const dialog = screen.getByRole("dialog");
		const host = document.querySelector("opend-touchpoint");
		expect(host).not.toBeNull();
		await advanceToRecordedImpression();
		const callsBeforeHiding = fetchMock.mock.calls.length;

		// Backgrounded. The thirty-second tick lands inside this and must not fire:
		// no answer could be acted on while `isCurrent` fences a hidden page.
		hidden = true;
		await act(async () => { fireEvent(document, new Event("visibilitychange")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
		expect(fetchMock.mock.calls.length).toBe(callsBeforeHiding);

		// Back with fifteen seconds of authorization left. That revalidates, it
		// does not re-present: same dialog, same host, no replayed entry animation.
		hidden = false;
		await act(async () => { fireEvent(document, new Event("visibilitychange")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(16); });
		expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBeforeHiding);
		expect(screen.getByRole("dialog")).toBe(dialog);
		expect(document.querySelector("opend-touchpoint")).toBe(host);
	});

	// Deliberate contract change (OPEND-3363). This case used to assert that
	// hiding the page took the modal down, and then that waking did not bring it
	// back. The first half is no longer true: hiding cancels the request in
	// flight and leaves the lease alone, which is what stopped a tab switch from
	// tearing a campaign off the screen.
	//
	// The second half is what the case was really protecting, and it still holds
	// — it just needs a sleep long enough to be a real one. The presentation is
	// anchored to the authorization that opened it, so once that lapses, the
	// offer arriving on wake is a new presentation and the device impression
	// closes it.
	it("does not re-present a displayed campaign after a sleep outlasts its authorization", async () => {
		vi.useFakeTimers({ toFake: [...IMPRESSION_TIMERS] });
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
		let hidden = false;
		vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(decision()), { status: 200 })),
		);
		render(<ProductionCampaignModal authenticated sessionSubject="user-a" />);
		await act(async () => { await vi.advanceTimersByTimeAsync(16); });
		expect(screen.getByRole("dialog")).toBeTruthy();
		await advanceToRecordedImpression();

		// Asleep past the sixty-second authorization this decision carries. The
		// lease retires on its own deadline while the page is hidden.
		hidden = true;
		await act(async () => { fireEvent(document, new Event("visibilitychange")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
		expect(screen.queryByRole("dialog")).toBeNull();

		// Awake. The server still offers the same activity; the device impression
		// has to close it, because this would be a second presentation.
		hidden = false;
		await act(async () => { fireEvent(document, new Event("visibilitychange")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(16); });
		expect(screen.queryByRole("dialog")).toBeNull();

		// Control. Both assertions above are absences, and an absence is what a
		// lifecycle that never came back at all also looks like — a `wake` that
		// stopped waking would leave this case fully green while proving nothing.
		// Drop the impression and wake once more, through the same event and the
		// same advance as the assertion above, so the impression is the only
		// difference between the two outcomes: the same path now has to PRESENT,
		// which is what makes the nulls above readable as the impression gate
		// closing a live offer rather than as no offer arriving.
		localStorage.removeItem(marker());
		await act(async () => { fireEvent(document, new Event("visibilitychange")); });
		await act(async () => { await vi.advanceTimersByTimeAsync(16); });
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
	it("keeps the displayed campaign on screen when a failed poll later recovers", async () => {
		// A transport failure is not a withdrawal: the lifecycle keeps the lease
		// and revalidates when the network comes back. The presentation has to
		// survive with it, or the recovering attempt reads the device impression
		// and closes the activity that never left the screen.
		//
		// OPEND-3436 changed what schedules that recovery — the in-cycle backoff
		// chain is gone, because a client with no network answers every attempt
		// in it the same way — so the recovery here is driven by the `online`
		// event a real reconnection fires. The property under test is the one it
		// always was: the same campaign is still on screen afterwards.
		//
		// The impression this case needs has to be the REAL one. Writing the
		// marker by hand reads like a shortcut past an unfaked frame, but it
		// manufactures a state the product cannot produce: `openPresentation` is
		// assigned when `mountTouchpoint` resolves and the marker only in the
		// frame after that, so "impression recorded, nothing open" exists in the
		// test and nowhere else. It is also precisely the `{kind:"clear"}` branch
		// of the load callback. Waiting for the marker instead is a mount barrier,
		// because nothing can write it until the presentation is open.
		vi.useFakeTimers({ toFake: [...IMPRESSION_TIMERS] });
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
			await vi.advanceTimersByTimeAsync(16);
		});
		expect(document.querySelector("opend-touchpoint")).not.toBeNull();
		await advanceToRecordedImpression();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(30_000);
		});
		expect(calls).toBe(2);
		expect(document.querySelector("opend-touchpoint")).not.toBeNull();
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_500);
		});
		// The failing attempt and its recovery both have to have happened, or the
		// two surviving hosts below would only mean nothing ever disturbed them.
		expect(calls).toBe(3);
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
