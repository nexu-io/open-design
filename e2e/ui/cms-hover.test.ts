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
	`${process.cwd()}/../apps/web/next.config.ts`,
)) as {
	cmsHostReleaseFingerprint: (
		readFile: (file: string) => string | Buffer,
	) => string;
};

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const digest = (value: string | Buffer) =>
	`sha256:${createHash("sha256").update(value).digest("hex")}`;
const hostReleaseFingerprint = cmsHostReleaseFingerprint((file) =>
	readFileSync(resolve(WORKSPACE_ROOT, file)),
);

const ENTRY_PLACEMENT = "opend.home.hover-entry";
const LAYER_PLACEMENT = "opend.home.hover-layer";
const BADGE_PLACEMENT = "opend.home.account-badge";
const ACTION_ID = "learn";

const entryModule = `
  export function mount(root) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open campaign';
    button.style.cssText = 'width: 128px; height: 32px;';
    root.append(button);
    return button;
  }
`;
const layerModule = `
  export function mount(root, context, sdk) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Learn more';
    button.style.cssText = 'width: 180px; height: 72px;';
    button.addEventListener('click', () => void sdk.dispatchAction('${ACTION_ID}'));
    root.append(button);
    return button;
  }
`;
const badgeModule = `
  export function mount(root) {
    const badge = document.createElement('span');
    badge.textContent = 'Campaign badge';
    badge.style.cssText = 'display: inline-block; width: 116px; height: 24px;';
    root.append(badge);
    return badge;
  }
`;

const manifest = {
	formatVersion: 2 as const,
	runtimeKind: "web-component" as const,
	runtimeApiVersion: 1 as const,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
	sdkVersion: "vela-touchpoint-sdk-v1" as const,
	contentLine: "cms-hover-browser-fixture",
	placements: [
		{
			key: ENTRY_PLACEMENT,
			entry: "hover-entry.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["hover", "static-action"],
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
		{
			key: LAYER_PLACEMENT,
			entry: "hover-layer.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["hover", "static-action"],
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
		{
			key: BADGE_PLACEMENT,
			entry: "badge.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["static-action"],
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
	resources: ["hover-entry.js", "hover-layer.js", "badge.js"],
	images: [],
};

const moduleByPlacement = new Map([
	[ENTRY_PLACEMENT, ["hover-entry.js", entryModule]],
	[LAYER_PLACEMENT, ["hover-layer.js", layerModule]],
	[BADGE_PLACEMENT, ["badge.js", badgeModule]],
] as const);

function contentFor(placementKey: string) {
	const [entryPath, entry] =
		moduleByPlacement.get(placementKey as typeof ENTRY_PLACEMENT) ?? [];
	if (!entryPath || !entry)
		throw new Error(`missing fixture module for ${placementKey}`);
	return {
		id: "cms-hover-browser-version",
		placementKey,
		locale: "en-US",
		manifest,
		manifestHash: digest(JSON.stringify(manifest)),
		entryPath,
		entryDigest: digest(entry),
		entryModule: entry,
		resources: [
			{
				path: entryPath,
				digest: digest(entry),
				bytes: Buffer.from(entry).toString("base64"),
			},
		],
		runtime: {
			kind: "web-component" as const,
			apiVersion: 1 as const,
			wrapperVersion: "vela-touchpoint-wrapper-v1" as const,
			sdkVersion: "vela-touchpoint-sdk-v1" as const,
		},
		buildIdentity: { fingerprint: hostReleaseFingerprint },
	};
}

function decisionFor(placementKey: string) {
	const now = Date.now();
	return {
		activityId: "cms-hover-browser-activity",
		touchpointDecisionId: `cms-hover-${placementKey}`,
		deploymentId: "cms-hover-browser-deployment",
		authorizationExpiresAt: new Date(now + 60_000).toISOString(),
		endsAt: new Date(now + 300_000).toISOString(),
		serverTime: new Date(now).toISOString(),
		placementKey,
		requiredCapabilities:
			placementKey === BADGE_PLACEMENT
				? ["static-action"]
				: ["hover", "static-action"],
		staticActions: [
			{
				id: ACTION_ID,
				target: { kind: "https" as const, url: "https://example.com/campaign" },
			},
		],
		content: contentFor(placementKey),
	};
}

async function installDesktopHost(page: Page) {
	await page.addInitScript(() => {
		(window as Window & { __od__?: unknown }).__od__ = {
			version: 2,
			client: { type: "desktop", platform: "test", osLocale: "en-US" },
			shell: {
				openExternal: async () => ({ ok: true }),
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

async function installCmsFixture(page: Page) {
	const responses: Array<{ placementKey: string; fingerprint: string }> = [];
	const events: Array<Record<string, unknown>> = [];
	await page.route("**/api/integrations/vela/status", async (route) => {
		await route.fulfill({
			json: {
				loggedIn: true,
				profile: "local",
				user: {
					id: "cms-hover-user",
					email: "cms-hover@example.com",
					plan: "free",
				},
			},
		});
	});
	await mockAmrPersonalWorkspace(page, undefined, { accountPlan: "free" });
	await mockAmrWalletSnapshot(page, {
		email: "cms-hover@example.com",
		plan: "free",
	});
	await page.route(
		"**/api/touchpoints/production-runtime**",
		async (route: Route) => {
			const request = route.request();
			if (request.method() === "POST") {
				events.push(request.postDataJSON() as Record<string, unknown>);
				await route.fulfill({ json: { ok: true } });
				return;
			}
			const placementKey = new URL(request.url()).searchParams.get(
				"placementKey",
			);
			if (!placementKey || placementKey === "opend.home.campaign-modal") {
				await route.fulfill({ status: 404, json: { error: "no_decision" } });
				return;
			}
			const decision = decisionFor(placementKey);
			responses.push({
				placementKey,
				fingerprint: decision.content.buildIdentity.fingerprint,
			});
			await route.fulfill({ json: decision });
		},
	);
	return { responses, events };
}

async function gotoCmsHome(page: Page) {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Loading OpenDesign…")).toHaveCount(0, {
		timeout: T.long,
	});
	await expect(page.getByTestId("home-hero")).toBeVisible({ timeout: T.long });
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
	await applyStandardMocks(page);
	await installDesktopHost(page);
});

test("[P1] controlled CMS fixture mounts the top-right badge and hover pair in the real browser", async ({
	page,
}) => {
	const fixture = await installCmsFixture(page);
	await gotoCmsHome(page);

	const cluster = page.locator(".entry-top-right-cluster");
	await expect(cluster).toBeVisible();
	const badge = cluster.getByTestId("production-campaign-badge");
	await expect(badge).toBeVisible({ timeout: T.medium });
	const hoverRoot = cluster.getByTestId("cms-hover-overlay-root");
	const entry = hoverRoot.locator("opend-touchpoint").first();
	await expect(entry).toBeVisible();
	await expect.poll(() => fixture.responses.length).toBeGreaterThanOrEqual(3);
	expect(
		fixture.responses.every(
			(response) => response.fingerprint === hostReleaseFingerprint,
		),
	).toBe(true);
	expect(
		await page
			.locator(
				'.entry-top-right-cluster [data-testid="cms-hover-overlay-root"]',
			)
			.count(),
	).toBe(1);
	expect(
		await page
			.locator('[style*="bottom"] [data-testid="cms-hover-overlay-root"]')
			.count(),
	).toBe(0);
});

test("[P1] controlled CMS fixture keeps the real hover layer open across three slow 8px crossings each way", async ({
	page,
}) => {
	const fixture = await installCmsFixture(page);
	await gotoCmsHome(page);
	const hoverRoot = page.getByTestId("cms-hover-overlay-root");
	const entry = hoverRoot.locator("opend-touchpoint").first();
	const layer = hoverRoot.locator("opend-touchpoint").nth(1);
	await expect(entry).toBeVisible({ timeout: T.medium });
	await entry.hover();
	await expect(layer).toBeVisible({ timeout: T.medium });

	const entryBox = await entry.boundingBox();
	const layerBox = await layer.boundingBox();
	expect(entryBox).not.toBeNull();
	expect(layerBox).not.toBeNull();
	const entryPoint = {
		x: entryBox!.x + entryBox!.width / 2,
		y: entryBox!.y + entryBox!.height / 2,
	};
	const layerPoint = {
		x: layerBox!.x + layerBox!.width / 2,
		y: layerBox!.y + layerBox!.height / 2,
	};
	const layerIsBelow = layerBox!.y >= entryBox!.y + entryBox!.height;
	const gap = layerIsBelow
		? layerBox!.y - (entryBox!.y + entryBox!.height)
		: entryBox!.y - (layerBox!.y + layerBox!.height);
	expect(gap).toBe(8);
	const bridgePoint = {
		x: 0,
		y: layerIsBelow
			? entryBox!.y + entryBox!.height + gap / 2
			: layerBox!.y + layerBox!.height + gap / 2,
	};
	bridgePoint.x =
		Math.max(entryBox!.x, layerBox!.x) +
		(Math.min(entryBox!.x + entryBox!.width, layerBox!.x + layerBox!.width) -
			Math.max(entryBox!.x, layerBox!.x)) /
			2;
	const cross = async (from: typeof entryPoint, to: typeof layerPoint) => {
		await page.mouse.move(from.x, from.y);
		await page.mouse.move(bridgePoint.x, bridgePoint.y, { steps: 8 });
		await page.mouse.move(to.x, to.y, { steps: 6 });
	};
	for (let index = 0; index < 3; index += 1) {
		await cross(entryPoint, layerPoint);
		await expect(layer).toBeVisible();
		await cross(layerPoint, entryPoint);
		await expect(layer).toBeVisible();
	}

	const action = layer.locator("button", { hasText: "Learn more" });
	await expect(action).toBeVisible();
	await action.click();
	await expect.poll(() => fixture.events.length).toBeGreaterThanOrEqual(1);
	expect(fixture.events.at(-1)).toMatchObject({
		activityId: "cms-hover-browser-activity",
		placementKey: LAYER_PLACEMENT,
		touchpointDecisionId: `cms-hover-${LAYER_PLACEMENT}`,
		kind: "click",
	});
});

test("[P1] controlled CMS fixture stays within a narrow viewport and restores focus on Escape", async ({
	page,
}) => {
	const fixture = await installCmsFixture(page);
	await gotoCmsHome(page);
	await page.setViewportSize({ width: 360, height: 160 });
	const hoverRoot = page.getByTestId("cms-hover-overlay-root");
	const entry = hoverRoot.locator("opend-touchpoint").first();
	const layer = hoverRoot.locator("opend-touchpoint").nth(1);
	await expect(entry).toBeVisible({ timeout: T.medium });
	await entry.focus();
	await expect(layer).toBeVisible({ timeout: T.medium });
	const box = await layer.boundingBox();
	expect(box).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.y).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(360);
	expect(box!.y + box!.height).toBeLessThanOrEqual(160);
	await page.keyboard.press("Escape");
	await expect(layer).toBeHidden();
	await expect(entry).toBeFocused();
	expect(
		fixture.responses.some(
			(response) => response.placementKey === ENTRY_PLACEMENT,
		),
	).toBe(true);
});
