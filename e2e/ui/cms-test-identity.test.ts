import { expect, test } from "@/playwright/suite";
import { mockAmrPersonalWorkspace, mockAmrWalletSnapshot } from "@/playwright/amr";
import {
	ACCOUNT_USER_ID,
	TESTER_MEMBER_ID,
	TEST_DEPLOYMENT_ID,
	installTestDesktopHost,
	installTestRuntimeFixture,
	recordTouchpointDiagnostics,
	testContextFor,
} from "@/playwright/cms-test-runtime";
import { applyStandardMocks } from "@/playwright/mock-factory";
import { T } from "@/timeouts";
import type { Page } from "@playwright/test";

// OPEND-4143: the Test context's tester is the server-authenticated workspace
// member id, never the app account id. Every case here keeps the two distinct.

async function gotoTestControls(page: Page) {
	await page.goto("/?cmsTestControls=1", { waitUntil: "domcontentloaded" });
	await expect(page.getByText("Loading OpenDesign…")).toHaveCount(0, { timeout: T.long });
	const selector = page.getByLabel("Test activity");
	await expect(selector).toBeVisible({ timeout: T.long });
	await selector.selectOption(TEST_DEPLOYMENT_ID);
}

const testDialog = (page: Page) => page.getByRole("dialog", { name: "Test campaign" });
const identityFailures = (log: string[]) =>
	log.filter((entry) => /context_identity_invalid|touchpoint_decision_mismatch/.test(entry));

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
	expect(ACCOUNT_USER_ID).not.toBe(TESTER_MEMBER_ID);
	await applyStandardMocks(page);
	await installTestDesktopHost(page);
	await mockAmrPersonalWorkspace(page, undefined, { accountPlan: "free" });
	await mockAmrWalletSnapshot(page, { email: "cms-test@example.com", plan: "free" });
});

test("[P1] Test campaign shows for a tester whose member id differs from the account id", async ({ page }) => {
	const diagnostics = await recordTouchpointDiagnostics(page);
	const { calls } = await installTestRuntimeFixture(page);
	await gotoTestControls(page);
	await expect(testDialog(page)).toBeVisible({ timeout: T.long });
	await expect(page.getByTestId("touchpoint-test-clock")).not.toContainText("error");
	expect(calls.context).toBe(1);
	expect(identityFailures(await diagnostics())).toEqual([]);
});

test("[P1] Test campaign recovers 409 context drift for a member id that differs from the account id", async ({ page }) => {
	const diagnostics = await recordTouchpointDiagnostics(page);
	const { calls } = await installTestRuntimeFixture(page, {
		contextFor: (post) => testContextFor(post === 1 ? "one" : "two"),
		acceptedToken: () => testContextFor("two").contextToken,
	});
	await gotoTestControls(page);
	await expect(testDialog(page)).toBeVisible({ timeout: T.long });
	expect(calls.context).toBe(2);
	expect(calls.conflicts).toBe(1);
	expect(identityFailures(await diagnostics())).toEqual([]);
});

test("[P1] Test campaign rejects 409 drift metadata that names another tester without re-acquiring", async ({ page }) => {
	const diagnostics = await recordTouchpointDiagnostics(page);
	const { calls } = await installTestRuntimeFixture(page, {
		acceptedToken: () => testContextFor("two").contextToken,
		conflictContext: () => testContextFor("two", "another-workspace-member"),
	});
	await gotoTestControls(page);
	await expect(page.getByTestId("touchpoint-test-clock")).toContainText("error", { timeout: T.long });
	await expect(testDialog(page)).toHaveCount(0);
	expect(calls.context).toBe(1);
	expect(identityFailures(await diagnostics()).length).toBeGreaterThan(0);
});

test("[P1] Test campaign stays hidden when a re-acquired context names another tester", async ({ page }) => {
	const diagnostics = await recordTouchpointDiagnostics(page);
	const { calls } = await installTestRuntimeFixture(page, {
		contextFor: (post) =>
			post === 1 ? testContextFor("one") : testContextFor("two", "another-workspace-member"),
		acceptedToken: () => testContextFor("two").contextToken,
		conflictContext: () => testContextFor("two"),
	});
	await gotoTestControls(page);
	await expect(page.getByTestId("touchpoint-test-clock")).toContainText("error", { timeout: T.long });
	await expect(testDialog(page)).toHaveCount(0);
	expect(calls.context).toBe(2);
	expect(identityFailures(await diagnostics()).length).toBeGreaterThan(0);
});
