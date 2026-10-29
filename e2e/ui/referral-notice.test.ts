import { test, expect } from "@/playwright/suite";
import { applyStandardMocks } from "@/playwright/mock-factory";
import { buildWorkspacePermissions } from "@open-design/contracts";
import { mkdir } from "node:fs/promises";
const now = "2026-10-26T00:00:00Z";
const context = {
	workspaceId: "invite-personal",
	workspaceMemberId: "invite-member",
	workspaceName: "Xiaoyi’s Workspace",
	workspaceType: "personal",
	role: "owner",
	memberStatus: "active",
	lifecycleState: "active",
	billingState: "active",
	planId: "go",
	providerMode: "platform_credits",
	seatSummary: {
		seatLimit: 1,
		usedSeats: 1,
		availableSeats: 0,
		isSeatFull: true,
	},
	permissions: buildWorkspacePermissions({
		role: "owner",
		lifecycleState: "active",
	}),
};
const summary = {
	serverTime: now,
	campaignStatus: "active",
	canShare: false,
	shareBlockReason: "free",
	inviteUrl: null,
	inviterIssuedCount: 0,
	inviterRewardLimit: 5,
	inviteeIssuedCount: 0,
	availableCardCount: 0,
	invitee: {
		status: "registered",
		purchaseDeadline: "2026-10-27T23:58:03Z",
		dueAt: null,
	},
};
async function capture(page: import("@playwright/test").Page, name: string) {
	const dir = process.env.INVITATION_CAPTURE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await page.evaluate(() => document.fonts.ready);
	await page.mouse.move(0, 0);
	await page.screenshot({ path: `${dir}/${name}.png` });
	await page
		.getByTestId("referral-notice")
		.screenshot({ path: `${dir}/${name}-notice.png` });
}
test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 960 });
	await applyStandardMocks(page);
	await page.clock.install({ time: new Date(now) });
	await page.addInitScript(() => {
		localStorage.setItem("open-design:locale", "zh-CN");
		localStorage.setItem("open-design:locale-source", "manual");
		localStorage.setItem("od.entry.railOpen", "true");
	});
	await page.route("**/api/app-config", (route) =>
		route.fulfill({
			json: {
				config: {
					onboardingCompleted: true,
					agentId: "mock",
					privacyDecisionAt: 1,
					telemetry: {
						metrics: false,
						content: false,
						artifactManifest: false,
					},
					agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: "local" } },
				},
			},
		}),
	);
	await page.route("**/api/integrations/vela/status*", (route) =>
		route.fulfill({
			json: {
				loggedIn: true,
				sessionState: "authenticated",
				profile: "local",
				user: { id: "invitation-qa", email: "qa@example.com", name: "Xiaoyi" },
				account: { plan: "go", balanceUsd: "106.00" },
			},
		}),
	);
	await page.route("**/api/integrations/vela/referral-account", (route) =>
		route.fulfill({ json: { appUserId: "invitation-qa" } }),
	);
	await page.route("**/api/workspace/directory", (route) =>
		route.fulfill({
			json: { items: [context], activeWorkspaceId: context.workspaceId },
		}),
	);
	await page.route("**/api/workspace/context*", (route) =>
		route.fulfill({ json: { context } }),
	);
	await page.route("**/api/projects*", (route) =>
		route.fulfill({ json: { projects: [] } }),
	);
	await page.route("**/api/workspace/billing*", (route) =>
		route.fulfill({
			json: {
				summary: null,
				workspaceBalance: null,
				preflight: {
					schemaVersion: 1,
					workspaceId: context.workspaceId,
					workspaceMemberId: context.workspaceMemberId,
					balanceUsd: "106.00",
					modelCovered: true,
					funding: "coding_plan",
					generatedAt: now,
					modelId: null,
					codingPlan: {
						workspaceId: context.workspaceId,
						eligible: true,
						tier: "go",
						generatedAt: now,
						windows: [
							{
								policyId: "week",
								durationSeconds: 604800,
								resetMode: "activity_triggered",
								usedCredits: "100",
								limitCredits: "100",
								remainingCredits: "0",
								windowStart: now,
								resetsAt: "2026-10-31T06:00:00Z",
							},
						],
					},
				},
			},
		}),
	);
});
test("[P1] C09 first subscription reminder remains readable, opens Subscribe and closes without a second navigation", async ({
	page,
}) => {
	await page.route("**/api/integrations/vela/referral-summary", (route) =>
		route.fulfill({ json: summary }),
	);
	await page.goto("/");
	const notice = page.getByTestId("referral-notice");
	await expect(notice).toHaveAttribute("data-state", "registered");
	await expect(notice).toContainText("48 小时内首次订阅即可领取");
	await capture(page, "client-C09-desktop");
	let opened = "";
	await page.route("**/api/system/open-external", async route => { opened = route.request().postDataJSON().url; await route.fulfill({ json: { ok: true } }); });
	await notice.getByRole("button", { name: "去订阅" }).click();
	await expect.poll(() => opened).toBe("http://localhost:5173/dashboard?source=open_design&billing=plan");
	const noticeBox = await notice.boundingBox();
	const titleBox = await page.locator(".home-hero__title").boundingBox();
	expect(noticeBox!.y + noticeBox!.height).toBeLessThan(titleBox!.y);
	await page
		.getByTestId("home-hero-input")
		.fill("这是用于检查首页输入框自动增高的长内容。".repeat(25));
	await page.setViewportSize({ width: 700, height: 844 });
	// The 700px reference keeps the reminder and countdown on one 36px row.
	await expect.poll(async () => (await notice.boundingBox())?.height).toBe(36);
	const narrowNotice = await notice.boundingBox();
	const narrowTitle = await page.locator(".home-hero__title").boundingBox();
	expect(narrowNotice!.y + narrowNotice!.height).toBeLessThan(narrowTitle!.y);
	await capture(page, "client-C09-narrow-long");
	const box = await notice.boundingBox();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(700);
	await notice.getByRole("button", { name: "关闭重置卡提示" }).click();
	await expect(notice).toBeHidden();
	await page.reload();
	await expect(notice).toBeVisible();
});
test("[P1] quota invitation uses the active environment independent page and preserves attribution", async ({
	page,
}) => {
	await page.route("**/api/integrations/vela/referral-summary", (route) =>
		route.fulfill({
			json: {
				...summary,
				canShare: true,
				inviteUrl: "https://example.com/login?ref=test",
				shareBlockReason: null,
				invitee: null,
			},
		}),
	);
	let opened = "";
	await page.route("**/api/system/open-external", async (route) => {
		opened = route.request().postDataJSON().url;
		await route.fulfill({ json: { ok: true } });
	});
	await page.goto("/");
	const notice = page.getByTestId("referral-notice");
	await expect(notice).toHaveAttribute("data-state", "exhausted");
	await notice.getByRole("button", { name: "邀请好友" }).click();
	await expect
		.poll(() => opened)
		.toBe("http://localhost:5173/reset?source=open_design&expectedAppUserId=invitation-qa");
	await capture(page, "client-exhausted-desktop");
});
