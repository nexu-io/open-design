import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '@/playwright/amr';
import { T } from '@/timeouts';

// OPEND-4599 — 右上角「升级」的 hover 卡片被分享弹窗遮住。
//
// 这一条要的是**真实浏览器证据**，不是源码断言：卡片原本是 rail 内的
// `position: absolute; z-index: 30`，而分享弹窗在自己的层叠上下文里是 220 ——
// 调大 z-index 从来不是修法，因为 absolute 只在自己上下文内排序。
//
// 所以这个 spec 真的建一个项目、真的打开分享弹窗、真的把指针移到 pill 上，
// 再用 elementFromPoint 问浏览器「卡片中心最上面那一层是谁」。答案必须是卡片自己。
//
// OD_LAYER_CAPTURE=1 时只截图断言放行，用于在修复前后各抓一张对照图。

const CAPTURE = process.env.OD_LAYER_CAPTURE === '1';
const SHOT = process.env.OD_LAYER_SHOT ?? '/tmp/opend-4599-layer.png';

async function mockBilling(page: Page) {
  const scope = AMR_PERSONAL_WORKSPACE_CONTEXT;
  await page.route('**/api/workspace/billing?*', async (route) => {
    const generatedAt = new Date().toISOString();
    await route.fulfill({
      json: {
        summary: {
          workspaceId: null, membershipTier: 'go', subscriptionStatus: 'active',
          balanceUsd: '12.00', totalAvailableCredits: 1200, subscriptionCredits: 0,
          rechargeCredits: 0, availableActions: [], workspaceBalance: null,
        },
        workspaceBalance: {
          workspaceId: scope.workspaceId, workspaceMemberId: scope.workspaceMemberId,
          balanceUsd: '12.00', billingScopeVersion: 2,
          updatedAt: generatedAt, expiresAt: null,
        },
        quotaRealtime: { healthy: true },
        workspaceRuntime: {
          workspaceId: scope.workspaceId, workspaceMemberId: scope.workspaceMemberId,
          status: 'fresh', revision: '1', observedAt: generatedAt,
          softExpiresAt: new Date(Date.parse(generatedAt) + 30_000).toISOString(),
          hardExpiresAt: new Date(Date.parse(generatedAt) + 600_000).toISOString(),
          retryAt: null, errorCode: null, reason: 'browser-fixture', sourceGapDetected: false,
        },
        preflight: {
          schemaVersion: 1, workspaceId: scope.workspaceId,
          workspaceMemberId: scope.workspaceMemberId, modelId: null, generatedAt,
          balanceUsd: '12.00', funding: 'coding_plan', modelCovered: null,
          codingPlan: {
            workspaceId: scope.workspaceId, generatedAt, eligible: true, tier: 'go', windows: [],
          },
        },
      },
    });
  });
}

test('[P1] OPEND-4599 升级卡片画在分享弹窗之上', async ({ page }) => {
  test.setTimeout(T.xlong);
  await page.addInitScript(() => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
  });
  await applyStandardMocks(page);
  await mockAmrPersonalWorkspace(page);
  await mockBilling(page);
  await page.route('**/api/projects/*/workspace-scope', async (route) => {
    const id = new URL(route.request().url()).pathname.match(/\/api\/projects\/([^/]+)/)?.[1];
    await route.fulfill({
      json: {
        scope: {
          kind: 'personal', projectId: id, workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
          visibility: 'personal', context: AMR_PERSONAL_WORKSPACE_CONTEXT,
        },
      },
    });
  });

  // 真实项目 + 真实文件，这样右上角的分享入口才是产品里的那个。
  const projectId = `opend-4599-${Date.now()}`;
  const created = await page.request.post('/api/projects', {
    data: {
      id: projectId, name: 'OPEND-4599 layer fixture', skillId: null, designSystemId: null,
      metadata: { kind: 'prototype', nameSource: 'user' },
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const content = '<!doctype html><html lang="zh-CN"><body><main><h1>层级验收</h1></main></body></html>';
  const file = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'index.html', content,
      artifactManifest: {
        version: 1, kind: 'html', title: 'index.html', entry: 'index.html',
        renderer: 'html', exports: ['html'],
      },
    },
  });
  expect(file.ok(), await file.text()).toBeTruthy();

  await page.goto(`/projects/${projectId}/files/index.html`, { waitUntil: 'domcontentloaded' });

  // 打开产品里真实存在的分享弹窗（文件工作区右上角的「分享」）。
  const shareEntry = page.getByTestId('file-workspace').getByRole('button', { name: '分享', exact: true });
  await expect(shareEntry).toBeVisible({ timeout: T.long });
  await shareEntry.click();
  const sharePopover = page.locator('.share-menu-popover[role="menu"]');
  await expect(sharePopover).toBeVisible({ timeout: T.long });

  const pill = page.getByTestId('entry-top-right-credits');
  await expect(pill).toBeVisible({ timeout: T.long });

  // 指针真的移到 pill 上（用坐标而不是 hover()：弹窗就在旁边，让真实命中决定结果）。
  const box = await pill.boundingBox();
  expect(box, '升级 pill 必须可定位').not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

  const panel = page.getByTestId('entry-top-right-credits-panel');
  await expect(panel).toBeVisible({ timeout: T.long });

  const hit = await panel.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const share = document.querySelector('.share-menu-popover');
    const shareRect = share?.getBoundingClientRect();
    const probe = (x: number, y: number) => {
      const top = document.elementFromPoint(x, y);
      return {
        insidePanel: top != null && node.contains(top),
        topTag: top?.tagName ?? null,
        topClass: typeof top?.className === 'string' ? top.className : null,
      };
    };
    const style = getComputedStyle(node);
    return {
      // 卡片中心 + 卡片与分享弹窗重叠区域各取一点
      center: probe(rect.left + rect.width / 2, rect.top + rect.height / 2),
      overlap: shareRect
        ? probe(
            Math.max(rect.left, shareRect.left) + 2,
            Math.max(rect.top, shareRect.top) + 2,
          )
        : null,
      overlapsShare: shareRect
        ? !(rect.right < shareRect.left || rect.left > shareRect.right
            || rect.bottom < shareRect.top || rect.top > shareRect.bottom)
        : false,
      panelZ: style.zIndex,
      panelPosition: style.position,
      panelParentIsBody: node.parentElement === document.body,
      panelInsideRail: node.closest('.entry-nav-rail') != null,
      shareZ: share ? getComputedStyle(share).zIndex : null,
    };
  });

  // 修复前后都值得记下来的事实
  console.log('[OPEND-4599]', JSON.stringify(hit));

  if (CAPTURE) {
    await page.screenshot({ path: SHOT, animations: 'disabled' });
    return;
  }

  // 卡片必须真的挂着真实的分享弹窗，否则这条断言没有意义。
  expect(hit.overlapsShare, '卡片与分享弹窗必须真的重叠，否则复现不了遮挡').toBe(true);
  expect(hit.panelPosition).toBe('fixed');
  expect(hit.panelParentIsBody).toBe(true);
  expect(hit.panelInsideRail).toBe(false);
  expect(
    hit.center.insidePanel,
    `卡片中心最上层是 ${hit.center.topTag}.${hit.center.topClass}，不是卡片`,
  ).toBe(true);
  expect(
    hit.overlap?.insidePanel,
    `卡片与弹窗重叠区最上层是 ${hit.overlap?.topTag}.${hit.overlap?.topClass}，不是卡片`,
  ).toBe(true);

  await page.screenshot({ path: SHOT, animations: 'disabled' });
});
