import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@/playwright/suite";
import {
	mockAmrPersonalWorkspace,
	mockAmrWalletSnapshot,
} from "@/playwright/amr";
import { applyStandardMocks } from "@/playwright/mock-factory";
import { T } from "@/timeouts";
import type { Page, Route } from "@playwright/test";

const { cmsHostReleaseFingerprint } = (await import(
	`${process.cwd()}/../apps/web/next.config.ts`
)) as {
	cmsHostReleaseFingerprint: (
		readFile: (file: string) => string | Buffer,
	) => string;
};
const workspaceRoot = resolve(process.cwd(), "..");
const digest = (value: string | Buffer) =>
	`sha256:${createHash("sha256").update(value).digest("hex")}`;
const hostFingerprint = cmsHostReleaseFingerprint((file) =>
	readFileSync(resolve(workspaceRoot, file)),
);

const PLACEMENT = "opend.home.campaign-modal";
const ACTION_ID = "use";
type CloseMode = "sdk" | "failed" | "hidden" | "disabled" | "none";

const moduleFor = (mode: CloseMode, tall = false) => `
  export function mount(root, context, sdk) {
    ${mode === "failed" ? "throw new Error('fixture_mount_failed');" : ""}
    ${tall ? "const filler = document.createElement('div'); filler.style.cssText = 'height: 900px; width: 420px;'; root.append(filler);" : ""}
    const title = document.createElement('h1');
    title.textContent = 'CMS campaign fixture';
    root.append(title);
    ${mode === "sdk" ? "const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Close campaign'); close.textContent = 'Close'; close.addEventListener('click', () => sdk.requestClose()); root.append(close);" : ""}
    ${mode === "hidden" ? "const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Close campaign'); close.hidden = true; close.textContent = 'Close'; root.append(close);" : ""}
    ${mode === "disabled" ? "const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Close campaign'); close.disabled = true; close.textContent = 'Close'; root.append(close);" : ""}
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = 'Use campaign';
    action.addEventListener('click', () => void sdk.dispatchAction('${ACTION_ID}'));
    root.append(action);
    return root;
  }
`;

function contentFor(mode: CloseMode, tall = false) {
	const entryModule = moduleFor(mode, tall);
	const manifest = {
		formatVersion: 2 as const,
		runtimeKind: "web-component" as const,
		runtimeApiVersion: 1 as const,
		platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
		sdkVersion: "vela-touchpoint-sdk-v1" as const,
		contentLine: "cms-modal-browser-fixture",
		placements: [
			{
				key: PLACEMENT,
				entry: "campaign-modal.js",
				resources: [],
				locales: ["en-US"],
				requiredCapabilities: ["close", "static-action"],
				staticActions: [
					{
						id: ACTION_ID,
						target: {
							kind: "https" as const,
							url: "https://example.com/campaign",
						},
					},
				],
			},
		],
		resources: ["campaign-modal.js"],
		images: [],
	};
	return {
		id: `cms-modal-${mode}-${tall ? "tall" : "normal"}`,
		placementKey: PLACEMENT,
		locale: "en-US",
		manifest,
		manifestHash: digest(JSON.stringify(manifest)),
		entryPath: "campaign-modal.js",
		entryDigest: digest(entryModule),
		entryModule,
		resources: [
			{
				path: "campaign-modal.js",
				digest: digest(entryModule),
				bytes: Buffer.from(entryModule).toString("base64"),
			},
		],
		runtime: {
			kind: "web-component" as const,
			apiVersion: 1 as const,
			wrapperVersion: "vela-touchpoint-wrapper-v1" as const,
			sdkVersion: "vela-touchpoint-sdk-v1" as const,
		},
		buildIdentity: { fingerprint: hostFingerprint },
	};
}

function decisionFor(mode: CloseMode, tall = false) {
	const now = Date.now();
	return {
		activityId: `cms-modal-${mode}-activity`,
		touchpointDecisionId: `cms-modal-${mode}-decision`,
		deploymentId: "cms-modal-browser-deployment",
		authorizationExpiresAt: new Date(now + 60_000).toISOString(),
		endsAt: new Date(now + 300_000).toISOString(),
		serverTime: new Date(now).toISOString(),
		placementKey: PLACEMENT,
		requiredCapabilities: ["close", "static-action"],
		staticActions: [
			{
				id: ACTION_ID,
				target: {
					kind: "https" as const,
					url: "https://example.com/campaign",
				},
			},
		],
		content: contentFor(mode, tall),
	};
}

async function installDesktopHost(page: Page) {
	await page.addInitScript(() => {
		const scope = window as Window & {
			__od__?: unknown;
			__cmsExternalOpens?: string[];
		};
		scope.__cmsExternalOpens = [];
		scope.__od__ = {
			version: 2,
			client: { type: "desktop", platform: "test", osLocale: "en-US" },
			shell: {
				openExternal: async (url: string) => {
					scope.__cmsExternalOpens?.push(url);
					return { ok: true };
				},
				openPath: async () => ({ ok: true }),
			},
			browser: { clearData: async () => ({ ok: true }) },
			capture: {
				page: async () => ({
					ok: true,
					dataUrl: "data:image/png;base64,",
					h: 1,
					w: 1,
				}),
			},
			project: {
				pickAndImport: async () => ({
					ok: true,
					projectId: "fixture",
					conversationId: "fixture",
					entryFile: "index.html",
				}),
				pickAndReplaceWorkingDir: async () => ({
					ok: true,
					baseDir: "/tmp/fixture",
					entryFile: null,
				}),
			},
			pdf: { print: async () => ({ ok: true }) },
			pet: { setVisible: () => undefined },
			updater: {
				status: async () => ({
					arch: "arm64",
					capabilities: {},
					channel: "beta",
					currentVersion: "fixture",
					enabled: true,
					mode: "test",
					platform: "test",
					state: "idle",
					supported: true,
				}),
				check: async () => ({ ok: true }),
				"clear-cache": async () => ({ ok: true }),
				download: async () => ({ ok: true }),
				install: async () => ({ ok: true }),
				quit: async () => ({ ok: true }),
				setMenuLabels: async () => ({ ok: true }),
				subscribe: () => () => undefined,
				subscribeOpenDialog: () => () => undefined,
			},
		};
	});
}

async function installProductionFixture(
	page: Page,
	options: {
		mode?: CloseMode;
		tall?: boolean;
		eventStatus?: number;
		eventNetworkFailure?: boolean;
	} = {},
) {
	const mode = options.mode ?? "none";
	const events: Array<Record<string, unknown>> = [];
	await page.route("**/api/integrations/vela/status", async (route) => {
		await route.fulfill({
			json: {
				loggedIn: true,
				profile: "local",
				user: {
					id: "cms-modal-user",
					email: "cms-modal@example.com",
					plan: "free",
				},
			},
		});
	});
	await mockAmrPersonalWorkspace(page, undefined, { accountPlan: "free" });
	await mockAmrWalletSnapshot(page, {
		email: "cms-modal@example.com",
		plan: "free",
	});
	await page.route(
		"**/api/touchpoints/production-runtime**",
		async (route: Route) => {
			const request = route.request();
			if (request.method() === "POST") {
				if (options.eventNetworkFailure) {
					await route.abort();
					return;
				}
				events.push(request.postDataJSON() as Record<string, unknown>);
				await route.fulfill({
					status: options.eventStatus ?? 200,
					json: {
						ok: options.eventStatus == null || options.eventStatus < 400,
					},
				});
				return;
			}
			await route.fulfill({ json: decisionFor(mode, options.tall) });
		},
	);
	return { events };
}

async function gotoModal(page: Page) {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Loading OpenDesign…")).toHaveCount(0, {
		timeout: T.long,
	});
	await expect(page.getByRole("dialog", { name: "Campaign" })).toBeVisible({
		timeout: T.long,
	});
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
	await applyStandardMocks(page);
	await installDesktopHost(page);
});

test("[P1] production modal closes through its mounted SDK control without a host fallback", async ({
	page,
}) => {
	await installProductionFixture(page, { mode: "sdk" });
	await gotoModal(page);
	const modal = page.getByRole("dialog", { name: "Campaign" });
	await expect(
		modal.getByRole("button", { name: "Close campaign" }),
	).toBeVisible({
		timeout: T.medium,
	});
	await expect(
		modal.getByRole("button", { name: "Close", exact: true }),
	).toHaveCount(0);
	await modal.getByRole("button", { name: "Close campaign" }).click();
	await expect(modal).toBeHidden();
});

for (const mode of ["failed", "hidden", "disabled"] as const) {
	test(`[P1] production modal adds no host Close button and Escape dismisses when the mounted control is ${mode}`, async ({
		page,
	}) => {
		await installProductionFixture(page, { mode });
		await gotoModal(page);
		const modal = page.getByRole("dialog", { name: "Campaign" });
		const fallback = modal.getByRole("button", { name: "Close", exact: true });
		await expect(modal).toBeVisible({ timeout: T.medium });
		await expect(fallback).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(modal).toBeHidden();
	});
}

test("[P1] production modal stays within short and narrow viewports and closes on Escape", async ({
	page,
}) => {
	await page.setViewportSize({ width: 500, height: 240 });
	await installProductionFixture(page, { mode: "sdk", tall: true });
	await gotoModal(page);
	const modal = page.getByRole("dialog", { name: "Campaign" });
	const surface = modal;
	await expect(surface).toBeVisible();
	const box = await surface.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.width).toBeLessThanOrEqual(500);
	expect(box!.height).toBeLessThanOrEqual(240);
	await page.setViewportSize({ width: 320, height: 180 });
	const narrowBox = await modal.boundingBox();
	expect(narrowBox).not.toBeNull();
	expect(narrowBox!.width).toBeLessThanOrEqual(320);
	expect(narrowBox!.height).toBeLessThanOrEqual(180);
	await page.keyboard.press("Escape");
	await expect(modal).toBeHidden();
	await expect(page.locator("body")).toHaveCSS("overflow", "visible");
});

for (const outcome of [
	{ label: "401", eventStatus: 401, navigates: false },
	{ label: "403", eventStatus: 403, navigates: false },
	{ label: "409", eventStatus: 409, navigates: false },
	{ label: "500", eventStatus: 500, navigates: true },
	{ label: "network failure", eventNetworkFailure: true, navigates: true },
] as const) {
	test(`[P1] production action telemetry ${outcome.label} ${outcome.navigates ? "still navigates" : "denies navigation"}`, async ({
		page,
	}) => {
		const fixture = await installProductionFixture(page, outcome);
		await gotoModal(page);
		const modal = page.getByRole("dialog", { name: "Campaign" });
		await modal.getByRole("button", { name: "Use campaign" }).click();
		await expect
			.poll(() => fixture.events.length)
			.toBeGreaterThanOrEqual(outcome.eventNetworkFailure ? 0 : 1);
		await expect
			.poll(async () =>
				page.evaluate(
					() =>
						(window as Window & { __cmsExternalOpens?: string[] })
							.__cmsExternalOpens?.length ?? 0,
				),
			)
			.toBe(outcome.navigates ? 1 : 0);
		if (outcome.navigates) {
			expect(
				await page.evaluate(
					() =>
						(window as Window & { __cmsExternalOpens?: string[] })
							.__cmsExternalOpens,
				),
			).toEqual(["https://example.com/campaign"]);
		} else {
			expect(
				await page.evaluate(
					() =>
						(window as Window & { __cmsExternalOpens?: string[] })
							.__cmsExternalOpens,
				),
			).toEqual([]);
		}
	});
}
