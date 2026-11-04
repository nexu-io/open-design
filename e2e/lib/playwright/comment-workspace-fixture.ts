import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContext, TestInfo } from '@playwright/test';
import { startFakeCollabHub } from './fake-collab-hub.ts';
import { applyStandardMocks } from './mock-factory.ts';
import { seedCampaignDismissals } from './campaign-dismissals.ts';
import { createToolsDevSuite } from '../tools-dev/runtime.ts';

/** Real daemon authority/publication backed by the existing hermetic Vela hub.
 * Only the owner is required: this case observes DOM uncertainty, not relay. */
export async function commentWorkspaceFixture(browser: Browser, info: TestInfo) {
  const workspaceId = 'ws-comment-interaction';
  const owner = { controlKey: 'comment-rule-owner', memberId: 'comment-owner', name: 'Comment Owner', role: 'owner' as const };
  const root = info.outputPath('comment-authority-hub');
  await mkdir(root, { recursive: true });
  const hub = await startFakeCollabHub({ root, workspaceId, workspaceName: 'Comment interaction team', clients: [owner] });
  const scratch = join(root, 'scratch');
  const runtime = createToolsDevSuite({ root: scratch, ownerPid: process.pid, namespace: `comment-rules-${process.pid}-${info.workerIndex}`, dataDir: join(scratch, 'data'), codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
  let context: BrowserContext | undefined;
  let env: Record<string, string> = {};
  const close = async () => {
    try { await context?.close(); }
    finally {
      try { await runtime.stopWeb(env); }
      finally { await hub.close(); }
    }
  };
  try {
    const velaBin = await hub.writeVelaBin(info.outputPath('fake-comment-vela'));
    env = { OD_COLLAB_TRANSPORT: 'vela-cli', OD_RESOURCE_TRANSPORT: 'vela-cli', OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli', OD_WORKSPACE_CONTEXT_SOURCE: 'vela', VELA_API_URL: hub.url, VELA_BIN: velaBin, VELA_CONTROL_KEY: owner.controlKey };
    await runtime.startWeb(env);
    context = await browser.newContext({ baseURL: runtime.url.web(), viewport: { width: 1440, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light', deviceScaleFactor: 1 });
    await seedCampaignDismissals(context);
    const page = await context.newPage();
    await applyStandardMocks(page);
    const active = await page.request.put('/api/workspace/active', { data: { workspaceId, workspaceMemberId: owner.memberId } });
    if (!active.ok()) throw new Error(`workspace selection: ${await active.text()}`);
    const headers = { 'x-od-workspace-id': workspaceId, 'x-od-workspace-type': 'team', 'x-od-workspace-member-id': owner.memberId, 'x-od-workspace-role': owner.role, 'x-od-workspace-member-status': 'active', 'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-can-share-projects': 'true', 'x-od-workspace-can-write-synced-files': 'true' };
    return { page, workspaceId, headers, hub, close: async (succeeded: boolean) => {
      try {
        if (!succeeded) await info.attach('comment-authority-runtime', { body: JSON.stringify(await runtime.logs(env).catch(() => null)), contentType: 'application/json' });
      } finally { await close(); }
      if (succeeded) await rm(scratch, { recursive: true, force: true });
    } };
  } catch (error) { await close(); throw error; }
}
