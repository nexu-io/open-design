import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Page, Route } from "@playwright/test";

/**
 * Server-level fixture for the CMS Test touchpoint channel.
 *
 * The app account id (`/api/integrations/vela/status` → `user.id`) and the
 * server-authenticated tester (`testContext.testerMemberId`, a workspace member
 * id) are deliberately different identifiers here, as they are in production
 * (OPEND-4143). A fixture that reuses one value for both hides the regression.
 */

export const TEST_CAMPAIGN_PLACEMENT = "opend.home.campaign-modal";
export const TEST_DEPLOYMENT_ID = "cms-test-identity-deployment";
export const TEST_ACTIVITY_ID = "cms-test-identity-activity";
export const ACCOUNT_USER_ID = "account-user-qfudpj9";
export const TESTER_MEMBER_ID = "workspace-member-z0msswbat";

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
const hex = (seed: string) => createHash("sha256").update(seed).digest("hex");
const hostFingerprint = cmsHostReleaseFingerprint((file) =>
	readFileSync(resolve(workspaceRoot, file)),
);

const entryModule = `
  export function mount(root, context, sdk) {
    const title = document.createElement('h1');
    title.textContent = 'CMS Test identity fixture';
    root.append(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close campaign');
    close.textContent = 'Close';
    close.addEventListener('click', () => sdk.requestClose());
    root.append(close);
    return root;
  }
`;
const manifest = {
	formatVersion: 2 as const,
	runtimeKind: "web-component" as const,
	runtimeApiVersion: 1 as const,
	platformWrapperVersion: "vela-touchpoint-wrapper-v1" as const,
	sdkVersion: "vela-touchpoint-sdk-v1" as const,
	contentLine: "cms-test-identity-fixture",
	placements: [
		{
			key: TEST_CAMPAIGN_PLACEMENT,
			entry: "campaign-modal.js",
			resources: [],
			locales: ["en-US"],
			requiredCapabilities: ["close"],
			staticActions: [],
		},
	],
	resources: ["campaign-modal.js"],
	images: [],
};
const content = {
	id: "cms-test-identity-content",
	placementKey: TEST_CAMPAIGN_PLACEMENT,
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
const SNAPSHOT_HASH = "sha256:cms-test-identity-snapshot";
const ARTIFACT_HASH = "sha256:cms-test-identity-artifact";

/** An immutable-mode Test context; `seed` selects the token generation. */
export function testContextFor(seed: string, testerMemberId = TESTER_MEMBER_ID) {
	return {
		deploymentId: TEST_DEPLOYMENT_ID,
		scenario: "realtime" as const,
		updatedAt: new Date().toISOString(),
		testerMemberId,
		contextId: `ctx-v1:${hex(`${TEST_DEPLOYMENT_ID}/${testerMemberId}/realtime`)}`,
		generation: "7",
		contextToken: `ctx-token-v1:${hex(seed)}`,
	};
}

function decisionFor(context: ReturnType<typeof testContextFor>) {
	const now = Date.now();
	return {
		activityId: TEST_ACTIVITY_ID,
		deploymentId: TEST_DEPLOYMENT_ID,
		snapshotHash: SNAPSHOT_HASH,
		artifactHash: ARTIFACT_HASH,
		manifestHash: content.manifestHash,
		placementKey: TEST_CAMPAIGN_PLACEMENT,
		requiredCapabilities: ["close"],
		staticActions: [],
		serverTime: new Date(now).toISOString(),
		authorizationExpiresAt: new Date(now + 60_000).toISOString(),
		startsAt: new Date(now - 60_000).toISOString(),
		endsAt: new Date(now + 600_000).toISOString(),
		testContext: { ...context, scheduleState: "active" as const },
		content,
	};
}

export interface TestRuntimeFixtureOptions {
	/** Context returned by the Nth (1-based) POST /context. */
	contextFor?: (post: number) => ReturnType<typeof testContextFor>;
	/** Token the decision endpoint accepts; any other token gets a typed 409. */
	acceptedToken?: (post: number) => string;
	/** Context carried by a typed 409; defaults to the next POST's context. */
	conflictContext?: (post: number) => ReturnType<typeof testContextFor>;
}

/** Mocks the authenticated account and the Test runtime endpoints. */
export async function installTestRuntimeFixture(
	page: Page,
	options: TestRuntimeFixtureOptions = {},
) {
	const contextFor = options.contextFor ?? (() => testContextFor("one"));
	const calls = { context: 0, decision: 0, conflicts: 0 };
	let current = contextFor(1);
	await page.route("**/api/integrations/vela/status", async (route) => {
		await route.fulfill({
			json: {
				loggedIn: true,
				profile: "local",
				user: { id: ACCOUNT_USER_ID, email: "cms-test@example.com", plan: "free" },
			},
		});
	});
	await page.route("**/api/touchpoints/production-runtime**", (route) =>
		route.fulfill({ status: 404, json: { error: "not_found" } }),
	);
	await page.route("**/api/touchpoints/test-runtime**", async (route: Route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.pathname.endsWith("/deployments")) {
			await route.fulfill({
				json: {
					deployments: [
						{
							id: TEST_DEPLOYMENT_ID,
							activityId: TEST_ACTIVITY_ID,
							snapshotHash: SNAPSHOT_HASH,
							snapshot: {
								contentVersionId: content.id,
								manifestHash: content.manifestHash,
								artifactHash: ARTIFACT_HASH,
								placementKeys: [TEST_CAMPAIGN_PLACEMENT],
							},
						},
					],
					nextCursor: null,
				},
			});
			return;
		}
		if (url.pathname.endsWith("/context") && request.method() === "POST") {
			calls.context += 1;
			current = contextFor(calls.context);
			await route.fulfill({ status: 201, json: current });
			return;
		}
		if (url.pathname.endsWith("/acceptances")) {
			await route.fulfill({ status: 201, json: { id: "accepted" } });
			return;
		}
		calls.decision += 1;
		const accepted = options.acceptedToken?.(calls.context) ?? current.contextToken;
		if (url.searchParams.get("contextToken") !== accepted) {
			calls.conflicts += 1;
			await route.fulfill({
				status: 409,
				json: {
					error: "test_context_mismatch",
					reason: "context_token_mismatch",
					testContext: (options.conflictContext ?? ((post) => contextFor(post + 1)))(calls.context),
				},
			});
			return;
		}
		await route.fulfill({ json: decisionFor(current) });
	});
	return { calls };
}

/** The Test channel only runs inside the desktop host (`__od__` v2, desktop client). */
export async function installTestDesktopHost(page: Page) {
	await page.addInitScript(() => {
		const ok = async () => ({ ok: true });
		(window as Window & { __od__?: unknown }).__od__ = {
			version: 2,
			client: { type: "desktop", platform: "test", osLocale: "en-US" },
			shell: { openExternal: ok, openPath: ok },
			browser: { clearData: ok },
			capture: { page: async () => ({ ok: true, dataUrl: "data:image/png;base64,", h: 1, w: 1 }) },
			project: {
				pickAndImport: async () => ({ ok: true, projectId: "fixture", conversationId: "fixture", entryFile: "index.html" }),
				pickAndReplaceWorkingDir: async () => ({ ok: true, baseDir: "/tmp/fixture", entryFile: null }),
			},
			pdf: { print: ok },
			pet: { setVisible: () => undefined },
			updater: {
				status: async () => ({
					arch: "arm64", capabilities: {}, channel: "beta", currentVersion: "fixture",
					enabled: true, mode: "test", platform: "test", state: "idle", supported: true,
				}),
				check: ok, "clear-cache": ok, download: ok, install: ok, quit: ok, setMenuLabels: ok,
				subscribe: () => () => undefined,
				subscribeOpenDialog: () => () => undefined,
			},
		};
	});
}

/** Records every web touchpoint diagnostic code the page emits. */
export async function recordTouchpointDiagnostics(page: Page) {
	await page.addInitScript(() => {
		const scope = window as unknown as { __touchpointDiagnosticLog: string[] };
		scope.__touchpointDiagnosticLog = [];
		document.addEventListener("touchpointdiagnostic", (event) => {
			const detail = (event as CustomEvent<{ code?: string; detail?: string }>).detail;
			scope.__touchpointDiagnosticLog.push(
				`${detail?.code ?? "unknown"} ${detail?.detail ?? ""}`,
			);
		});
	});
	return () =>
		page.evaluate(
			() =>
				(window as unknown as { __touchpointDiagnosticLog: string[] })
					.__touchpointDiagnosticLog,
		);
}
