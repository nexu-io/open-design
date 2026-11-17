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

const moduleFor = (mode: CloseMode, tall = false, cardWidth?: number, viewportCanvas = false) => `
  export function mount(root, context, sdk) {
    ${mode === "failed" ? "throw new Error('fixture_mount_failed');" : ""}
    ${viewportCanvas ? `const canvasHost = document.createElement('div'); root.append(canvasHost); const shadow = canvasHost.attachShadow({mode: 'closed'}); const canvas = document.createElement('div'); canvas.style.cssText = 'display: grid; place-items: center;'; shadow.append(canvas); const host = root.host; const refresh = () => { canvas.style.width = (host.clientWidth > 32 ? host.clientWidth : document.documentElement.clientWidth) + 'px'; canvas.style.height = (host.clientHeight > 32 ? host.clientHeight : document.documentElement.clientHeight) + 'px'; }; refresh(); const observer = new ResizeObserver(refresh); observer.observe(host); sdk.signal.addEventListener('abort', () => observer.disconnect(), { once: true });` : ''}
    const surface = ${cardWidth ? "document.createElement('section')" : "root"};
    ${cardWidth ? `surface.setAttribute('data-testid', 'campaign-card'); surface.style.cssText = 'width: ${cardWidth}px; max-width: calc(100vw - 32px); background: white;'; root.append(surface);` : ""}
    ${tall ? `const filler = document.createElement('div'); filler.style.cssText = 'height: 900px; width: ${cardWidth ? "100%" : "420px"};'; surface.append(filler);` : ""}
    ${viewportCanvas ? `canvas.append(surface); surface.style.height = 'min(420px, calc(100vh - 32px))'; surface.style.overflow = 'auto';` : ''}
    const title = document.createElement('h1');
    title.textContent = 'CMS campaign fixture';
    surface.append(title);
    ${mode === "sdk" ? "const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Close campaign'); close.textContent = 'Close'; close.addEventListener('click', () => sdk.requestClose()); surface.append(close);" : ""}
    ${mode === "hidden" ? "const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Close campaign'); close.hidden = true; close.textContent = 'Close'; surface.append(close);" : ""}
    ${mode === "disabled" ? "const close = document.createElement('button'); close.type = 'button'; close.setAttribute('aria-label', 'Close campaign'); close.disabled = true; close.textContent = 'Close'; surface.append(close);" : ""}
    const action = document.createElement('button');
    action.type = 'button';
    action.textContent = 'Use campaign';
    action.addEventListener('click', () => void sdk.dispatchAction('${ACTION_ID}'));
    surface.append(action);
    return root;
  }
`;

function contentFor(mode: CloseMode, tall = false, cardWidth?: number, viewportCanvas = false) {
	const entryModule = moduleFor(mode, tall, cardWidth, viewportCanvas);
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

function decisionFor(mode: CloseMode, tall = false, cardWidth?: number, viewportCanvas = false) {
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
		content: contentFor(mode, tall, cardWidth, viewportCanvas),
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
		cardWidth?: number;
		viewportCanvas?: boolean;
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
			await route.fulfill({ json: decisionFor(mode, options.tall, options.cardWidth, options.viewportCanvas) });
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

test("[P1] production modal leaves no dialog or backdrop behind when the mounted content throws", async ({
	page,
}) => {
	await page.addInitScript(() => {
		const seen: string[] = [];
		const witness = window as unknown as {
			__touchpointDiagnostics: string[];
			__touchpointDialogAppeared: boolean;
		};
		witness.__touchpointDiagnostics = seen;
		witness.__touchpointDialogAppeared = false;
		const selector = '[role="dialog"][aria-label="Campaign"], [aria-modal="true"]';
		const record = (node: Node) => {
			if (!(node instanceof Element)) return;
			const dialogs = [...node.querySelectorAll(selector)];
			if (node.matches(selector)) dialogs.push(node);
			if (dialogs.length) witness.__touchpointDialogAppeared = true;
		};
		// Added nodes remain in mutation records even if React removes them before
		// the observer runs. Attribute old values also expose same-turn flashes.
		new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				for (const node of mutation.addedNodes) record(node);
				record(mutation.target);
				if (mutation.type !== "attributes" || !(mutation.target instanceof Element)) continue;
				const target = mutation.target;
				const campaignLabel = target.getAttribute("aria-label") === "Campaign" || mutations.some(
					(change) => change.target === target && change.attributeName === "aria-label" && change.oldValue === "Campaign",
				);
				if (
					(mutation.attributeName === "role" && mutation.oldValue === "dialog" && campaignLabel) ||
					(mutation.attributeName === "aria-modal" && mutation.oldValue === "true")
				) witness.__touchpointDialogAppeared = true;
			}
		}).observe(document, { childList: true, subtree: true, attributes: true, attributeOldValue: true });
		document.addEventListener("touchpointdiagnostic", (event) => {
			const code = (event as CustomEvent<{ code?: string }>).detail?.code;
			if (code) seen.push(code);
		});
	});
	await installProductionFixture(page, { mode: "failed" });
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Loading OpenDesign…")).toHaveCount(0, {
		timeout: T.long,
	});
	// The mount was attempted and failed: only then is "no dialog" evidence.
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						(window as unknown as { __touchpointDiagnostics: string[] })
							.__touchpointDiagnostics,
				),
			{ timeout: T.long },
		)
		.toContain("fixture_mount_failed");
	await expect(page.getByRole("dialog", { name: "Campaign" })).toHaveCount(0);
	await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
	await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
	const everAppeared = await page.evaluate(() =>
		(window as unknown as { __touchpointDialogAppeared: boolean }).__touchpointDialogAppeared,
	);
	expect(everAppeared).toBe(false);
});

for (const mode of ["hidden", "disabled"] as const) {
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

for (const cardWidth of [460, 800]) {
	test(`[P1] ${cardWidth}px campaign card stays centered and tall content remains scrollable`, async ({ page }) => {
		await installProductionFixture(page, { mode: "sdk", tall: true, cardWidth });
		await page.setViewportSize({ width: 1280, height: 1400 });
		await gotoModal(page);
		const card = page.getByTestId("campaign-card");
		const frame = page.getByRole("dialog", { name: "Campaign" }).locator("[tabindex='-1']");
		// Inspect the visible content, not the full-screen backdrop or a transparent canvas.
		const geometry = () => card.evaluate(element => {
			const r = element.getBoundingClientRect();
			return { centerX: r.x + r.width / 2, centerY: r.y + r.height / 2, viewportX: innerWidth / 2, viewportY: innerHeight / 2 };
		});
		await expect.poll(async () => {
			const g = await geometry();
			return Math.max(Math.abs(g.centerX - g.viewportX), Math.abs(g.centerY - g.viewportY));
		}).toBeLessThanOrEqual(1);
		for (const viewport of [{ width: 760, height: 500 }, { width: 320, height: 240 }]) {
			await page.setViewportSize(viewport);
			await expect.poll(async () => {
				const r = await frame.boundingBox();
				return Boolean(r && r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width && r.y + r.height <= viewport.height);
			}).toBe(true);
			await frame.hover();
			await page.mouse.wheel(0, 1500);
			await expect.poll(() => frame.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
			await expect(page.locator("body")).toHaveAttribute("data-web-modal-scroll-lock");
			await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
		}
		await page.getByRole("button", { name: "Close campaign" }).click();
		await expect(page.getByRole("dialog", { name: "Campaign" })).toHaveCount(0);
		await expect(page.locator("body")).not.toHaveAttribute("data-web-modal-scroll-lock");
	});
}

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

// Registered CMS popup templates center their own card inside a transparent
// viewport-sized canvas, including inside a closed shadow root. An extra host
// inset must not turn that otherwise-fitting canvas into scrollable overflow.
test("[P1] pixel-sized campaign canvas follows host shrink and grow without outer scrollbars", async ({ page }) => {
	await installProductionFixture(page, { mode: "sdk", cardWidth: 720, viewportCanvas: true });
	await page.setViewportSize({ width: 1280, height: 851 });
	await gotoModal(page);
	const frame = page.getByRole("dialog", { name: "Campaign" }).locator("[tabindex='-1']");
	for (const viewport of [{ width: 1280, height: 851 }, { width: 900, height: 600 }, { width: 760, height: 500 }, { width: 320, height: 240 }, { width: 900, height: 600 }, { width: 1280, height: 851 }]) {
		await page.setViewportSize(viewport);
		await expect.poll(() => frame.evaluate(element => {
			const bounds = element.getBoundingClientRect();
			return Math.max(element.scrollWidth - bounds.width, element.scrollHeight - bounds.height);
		})).toBeLessThanOrEqual(0.01);
		await expect(page.locator("body")).toHaveAttribute("data-web-modal-scroll-lock");
	}
	// Desktop zoom can produce fractional CSS viewport dimensions. Exercise
	// the same fractional available space through the host's scrollbar insets.
	await page.evaluate(() => {
		document.body.style.setProperty("--web-modal-scrollbar-width", "0.4px");
		document.body.style.setProperty("--web-modal-scrollbar-height", "0.4px");
	});
	await expect.poll(() => frame.evaluate(element => {
		const bounds = element.getBoundingClientRect();
		return Math.max(element.scrollWidth - bounds.width, element.scrollHeight - bounds.height);
	})).toBeLessThanOrEqual(0.01);
	await page.keyboard.press("Escape");
	await expect(page.getByRole("dialog", { name: "Campaign" })).toHaveCount(0);
	await expect(page.locator("body")).not.toHaveAttribute("data-web-modal-scroll-lock");
});
