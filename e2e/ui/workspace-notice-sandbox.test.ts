import { createHash } from 'node:crypto';
import type { Locator } from '@playwright/test';
import { clusterTest as test, expect } from '@/playwright/suite';
import { startFundingClient } from '@/playwright/workspace-funding-client';
import { fundingHeaders, readFundingFixture } from '@/playwright/workspace-funding-fixture';
import { readNoticeOwnerProfile } from '@/playwright/workspace-notice-fixture';
import { T } from '@/timeouts';

test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('[P0] VIEW-020 real admin or member funding notice stays above empty and artifact projects across widths and languages', async ({ page }, info) => {
  test.setTimeout(T.xlong * 7);
  const fixture = await readFundingFixture();
  const ownerProfile = await readNoticeOwnerProfile(fixture);
  const client = await startFundingClient(page, info, { preserveSelectedLocale: true, initialSpace: 'empty' });
  const rows: unknown[] = [];
  const role = fixture.spaces.empty.actorRole!;
  const space = fixture.spaces.empty;
  const artifactName = 'view020-existing.html';
  const artifact = '<!doctype html><html><title>VIEW020 artifact</title><h1>Existing project output must remain</h1></html>';
  const artifactHash = createHash('sha256').update(artifact).digest('hex');
  try {
    await page.goto(client.runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await client.attach('VIEW020-actual-role-and-long-owner', { role, workspaceId: space.workspaceId,
      actorUserId: fixture.actor.userId, actorMemberId: space.actorMemberId, ownerProfile,
      boundary: 'Actual long Owner profile Given; no new requirement to interpolate the name into frozen contact-Owner copy' });
    for (const projectState of ['empty', 'artifact'] as const) {
      const projectId = await client.createProject(space);
      const fileUrl = client.runtime.url.web(`/api/projects/${projectId}/files/${artifactName}`);
      if (projectState === 'artifact') {
        const saved = await fetch(client.runtime.url.web(`/api/projects/${projectId}/files`), {
          method: 'POST', headers: { ...fundingHeaders(space), 'content-type': 'application/json' },
          body: JSON.stringify({ name: artifactName, content: artifact, encoding: 'utf8' }),
        });
        expect(saved.ok).toBe(true);
      }
      for (const locale of ['en', 'zh-CN'] as const) {
        // The layout case changes the real persisted preference, then reloads;
        // language-picker behavior itself is not an extra VIEW-020 criterion.
        await page.evaluate(locale => {
          localStorage.setItem('open-design:locale', locale);
          localStorage.setItem('open-design:locale-source', 'manual');
        }, locale);
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(client.runtime.url.web(`/projects/${projectId}`), { waitUntil: 'domcontentloaded', timeout: T.xlong });
        await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.xlong });
        // VIEW-020 checks the actual localized notice below. Record document
        // metadata separately: html.lang is not this QA case's acceptance rule.
        const documentLanguage = await page.locator('html').getAttribute('lang');
        const contextResponse = await fetch(client.runtime.url.web('/api/workspace/context'), { headers: fundingHeaders(space) });
        expect(contextResponse.ok).toBe(true);
        const context = await contextResponse.json();
        expect(context.context.workspaceId).toBe(space.workspaceId);
        expect(context.context.workspaceMemberId).toBe(space.actorMemberId);
        expect(context.context.role).toBe(role);
        const input = page.getByTestId('chat-composer-input');
        const send = page.getByTestId('chat-send');
        const draft = `VIEW020 ${role} ${projectState} ${locale}`;
        await input.fill(draft);
        const postStart = client.posts.length;
        const show = async () => {
          await expect(send).toBeEnabled({ timeout: T.medium });
          await send.click({ timeout: T.medium });
          const overlay = page.getByTestId('amr-balance-owner-dialog');
          await expect(overlay).toBeVisible({ timeout: T.medium });
          return overlay;
        };
        let overlay = await show();
        const closeAndObserve = async (button: Locator) => {
          const beforeClose = client.posts.length;
          // Arm before the click so even a synchronous accidental send is seen.
          const auto = page.waitForEvent('request', { predicate: r => r.method() === 'POST'
            && new URL(r.url()).pathname === '/api/runs', timeout: 2000 }).catch(() => null);
          await button.click({ timeout: T.medium });
          await expect(overlay).toBeHidden({ timeout: T.medium });
          expect(await auto, 'Closing the notice must not start a task').toBeNull();
          expect(client.posts.slice(beforeClose).filter(p => p.path === '/api/runs')).toEqual([]);
        };
        for (const [index, viewport] of [{ width: 1280, height: 800 }, { width: 375, height: 812 }].entries()) {
          await page.setViewportSize(viewport);
          const dialog = overlay.getByRole('dialog');
          const message = dialog.locator('p');
          const dismiss = dialog.getByTestId('amr-balance-owner-dismiss');
          const close = dialog.getByRole('button', { name: locale === 'en' ? 'Close' : '关闭', exact: true });
          await expect(message).toContainText(locale === 'en' ? /(?:contact|ask)[\s\S]*owner/i : /联系[\s\S]*Owner/i);
          await expect(message).toBeInViewport({ ratio: 1 });
          await expect(dismiss).toBeInViewport({ ratio: 1 });
          await expect(close).toBeInViewport({ ratio: 1 });
          const purchaseCopy = locale === 'en' ? /upgrade|recharge|top.?up|buy/i : /升级|充值|购买/;
          await expect(dialog.getByRole('button', { name: purchaseCopy })).toHaveCount(0);
          await expect(dialog.getByRole('link', { name: purchaseCopy })).toHaveCount(0);
          await expect(dialog.getByTestId('amr-balance-dialog-plans')).toHaveCount(0);
          const geometry = await dialog.evaluate(element => {
            const bounds = element.getBoundingClientRect();
            const targets = [...element.querySelectorAll('button,p')].map(target => {
              const r = target.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              return { text: target.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
                clientWidth: target.clientWidth, scrollWidth: target.scrollWidth,
                clientHeight: target.clientHeight, scrollHeight: target.scrollHeight,
                topmost: !!hit && target.contains(hit) };
            });
            return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, targets };
          });
          expect(geometry.targets.every(t => t.topmost), 'Contact text and close controls must be above project content').toBe(true);
          expect(geometry.targets.every(t => t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1),
            'Contact text and close controls must not be clipped inside their own boxes').toBe(true);
          const name = `${role}-${projectState}-${locale}-${viewport.width}`;
          await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
          rows.push({ name, geometry, context: context.context, viewport, requestedLocale: locale, documentLanguage,
            ownerNameRendered: (await dialog.innerText()).includes(ownerProfile.ownerDisplayName),
            realRunPosts: client.posts.slice(postStart).filter(p => p.path === '/api/runs'), originalPage: new URL(page.url()).pathname });
          if (index === 1) {
            await closeAndObserve(close);
            // Closing/reopening after the narrow layout is the original QA step.
            await input.fill(draft);
            overlay = await show();
            await expect(overlay.getByTestId('amr-balance-owner-dismiss')).toBeInViewport({ ratio: 1 });
            await info.attach(`${name}-reopened`, { body: await page.screenshot(), contentType: 'image/png' });
            await closeAndObserve(overlay.getByTestId('amr-balance-owner-dismiss'));
          }
        }
        if (projectState === 'artifact') {
          const saved = await fetch(fileUrl, { headers: fundingHeaders(space) });
          expect(saved.ok).toBe(true);
          const actualHash = createHash('sha256').update(await saved.text()).digest('hex');
          expect(actualHash).toBe(artifactHash);
          await client.attach(`VIEW020-artifact-${role}-${locale}`, { projectId, artifactName, expectedHash: artifactHash, actualHash });
        }
      }
    }
  } finally {
    await client.attach('VIEW020-full-observation-matrix', { role, rows, wholeQaPassed: false,
      reason: 'Both real roles and independent server profile/no-usage review are required to aggregate the whole QA case' });
    await client.close();
  }
});
