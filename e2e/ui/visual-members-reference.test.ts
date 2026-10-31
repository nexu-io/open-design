import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '@/playwright/suite';
import { configureVisualPage, gotoVisualHome, mockSignedInVelaAccount, waitForVisualStable } from '@/playwright/visual';
import { ensureRailOpen } from '@/playwright/rail';

// Rendering/interaction witnesses only: real app browser and isolated tools-dev,
// controlled Workspace/AMR responses. No claim of real invitations or revocation.
test.use({ actionTimeout: 15_000, navigationTimeout: 20_000 });
const artifactRoot = process.env.OD_MEMBERS_VISUAL_ARTIFACT_DIR ?? path.resolve(import.meta.dirname, '../../.tmp/members-visual-qa');
// Match the reference's selected prototype and example catalog through normal
// browser/API seams; these are controlled test data, never production fallbacks.
async function configureReferenceExamples(page: Page) {
  const plugins = ['模拟产品官网', '模拟项目报告'].map((title, index) => ({
    id: `members-reference-example-${index}`, title, version: '1.0.0', trust: 'trusted', sourceKind: 'local',
    source: `/tmp/members-reference-example-${index}`, fsPath: `/tmp/members-reference-example-${index}`,
    capabilitiesGranted: ['prompt:inject'], installedAt: 1700000000000, updatedAt: 1700000000000,
    manifest: { name: `members-reference-example-${index}`, title, version: '1.0.0', description: `请用「${title}」制作一个模拟作品。`,
      od: { kind: 'scenario', mode: 'prototype', taskKind: 'new-generation', useCase: { query: { 'zh-CN': `请用「${title}」制作一个模拟作品。`, en: `Create ${title}.` } } } },
  }));
  const prototype = { ...plugins[0]!, id: 'example-web-prototype', manifest: { ...plugins[0]!.manifest, name: 'example-web-prototype', od: { kind: 'scenario', mode: 'prototype', taskKind: 'new-generation' } } };
  await page.route('**/api/plugins', route => route.fulfill({ json: { plugins: [prototype, ...plugins] } }));
}
async function selectReferencePrototype(page: Page) {
  await expect(async () => {
    const selected = page.getByTestId('home-hero-template-picker');
    if (!await selected.count() || await selected.getAttribute('data-type') !== 'prototype') {
      const pill = page.getByTestId('home-hero-type-pill-prototype');
      if (await pill.isEnabled().catch(() => false)) await pill.click();
    }
    await expect(selected).toHaveAttribute('data-type', 'prototype');
  }).toPass();
  await page.getByTestId('home-hero-input').blur();
}
async function setup(page: Page, role: 'owner' | 'admin' | 'member', openInvite = true, workspaceCount = 2, options: { workspaceName?: string; workspaceType?: 'personal' | 'team'; dismissBanner?: boolean; registration?: boolean; referenceHome?: boolean; planId?: string; beforeHome?: (context: Record<string, unknown>) => Promise<void> } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await configureVisualPage(page);
  await configureReferenceExamples(page);
  await mockSignedInVelaAccount(page, { email: 'designer@example.com' });
  const context = {
    memberCount: 3,
    workspaceId: 'members-visual-workspace', workspaceName: options.workspaceName ?? 'Xiaoyi’s Workspace', workspaceType: options.workspaceType ?? 'team',
    workspaceMemberId: `members-visual-${role}`, role, memberStatus: 'active', lifecycleState: 'active',
    billingState: 'active', planId: options.planId ?? 'team-pro', workspaceSettingsUrl: 'https://console.example.test/settings?workspaceId=members-visual-workspace',
    seatSummary: { seatLimit: 3, usedSeats: 3, availableSeats: 0, isSeatFull: true },
    permissions: { canInviteMembers: true, canManageMembers: role === 'owner', canManageBilling: role === 'owner', canManageAutoRecharge: false, canShareProjects: true, canWriteSyncedFiles: true, canViewWorkspaceSettings: role === 'owner', canManageSharedResources: role === 'owner' },
  };
  await page.addInitScript((current) => {
    localStorage.setItem('open-design:locale', 'zh-CN');
    localStorage.setItem('open-design:locale-source', 'manual');
    sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: current.workspaceId, workspaceMemberId: current.workspaceMemberId }));
  }, context);
  await page.route('**/api/workspace/directory', route => route.fulfill({ json: { items: Array.from({ length: workspaceCount }, (_, i) => i === 0 ? context : { ...context, workspaceId: i === 1 ? 'members-visual-design-space' : `members-visual-space-${i}`, workspaceMemberId: i === 1 ? 'members-visual-design-member' : `members-visual-member-${i}`, workspaceName: i === 1 ? 'Design space' : `Workspace ${i + 1}` }), activeWorkspaceId: context.workspaceId } }));
  await page.route('**/api/workspace/context', route => {
    const selected = route.request().headers()['x-od-workspace-id'];
    return route.fulfill({ json: { context: selected === 'members-visual-design-space' ? { ...context, workspaceId: selected, workspaceMemberId: 'members-visual-design-member', workspaceName: 'Design space' } : context } });
  });
  await page.route('**/api/workspace/projects/team', route => route.fulfill({ json: { projects: [] } }));
  await page.route('**/api/workspaces/*/projects**', route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || !url.pathname.endsWith('/projects')) return route.fallback();
    const workspaceId = url.pathname.split('/')[3]!;
    const memberId = workspaceId === 'members-visual-design-space' ? 'members-visual-design-member' : context.workspaceMemberId;
    const projects = [1, 2, 3].map(n => { const project = { id: `visual-reference-project-${n}`, name: `Mock project ${n}`, skillId: null, designSystemId: null, createdAt: 1700000000000, updatedAt: 1700000000000, metadata: {} }; return { ...project, project, workspaceId, visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: memberId, updatedByWorkspaceMemberId: memberId, resourceHubResourceId: null, cloudTombstonedAt: null, syncState: 'local_only', currentUserAccess: { canOpen: true, canRename: true, canDelete: true, canDuplicate: true, canMoveToTeam: true, canMoveToPersonal: false, canExport: true, canSendTo: true, canRestoreVersion: true } }; });
    return route.fulfill({ json: { projects } });
  });
  if (options.dismissBanner ?? openInvite) await page.addInitScript(() => localStorage.setItem('od.invitation-banner.dismissed:u1', '1'));
  await options.beforeHome?.(context);
  if (options.registration) {
    await page.route('**/api/integrations/vela/status**', route => route.fulfill({ json: {
      loggedIn: true, sessionState: 'authenticated', credentialRevision: 'visual-registration-credential',
      profile: 'test', user: { id: 'u1', email: 'designer@example.com' }, configPath: '/home/test/.amr/config.json',
      registrationInvite: { accountId: 'u1', deviceAuthorizationId: 'visual-registration-authorization' },
    } }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const registration = page.getByRole('region', { name: '邀请成员', exact: true });
    await expect(registration.getByRole('heading', { name: '免费邀请同事，一起做设计', exact: true })).toBeVisible();
    return registration;
  }
  await gotoVisualHome(page);
  // The invitation is independent of the current home composer mode.
  // Keep the actual integration homepage rather than requiring a retired picker.
  if (options.referenceHome) await selectReferencePrototype(page);
  await ensureRailOpen(page);
  await page.getByTestId('workspace-switcher').click();
  if (!openInvite) return page.getByRole('menu');
  await page.getByRole('menu').getByRole('menuitem', { name: /邀请/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}
async function capture(page: Page, state: string) {
  await mkdir(artifactRoot, { recursive: true });
  if (!state.endsWith('-hover')) await page.mouse.move(1300, 800);
  await waitForVisualStable(page);
  if (['A01', 'A03', 'A05', 'A06', 'A07'].includes(state)) {
    await expect(page.locator('.entry-main--scroll')).toHaveCSS('background-color', 'rgb(252, 250, 249)');
    await expect(page.locator('.entry-shell--no-header')).toHaveCSS('background-color', 'rgb(229, 223, 220)');
    await expect(page.locator('.workspace-tabs-chrome')).toHaveCSS('background-color', 'rgb(229, 223, 220)');
  }
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const frameMetrics = await page.locator('.home-hero, .home-hero__title, .home-hero__subtitle, .home-hero__input-card, .entry-main--scroll').evaluateAll(elements => elements.map(el => ({ className: el.className, rect: el.getBoundingClientRect().toJSON(), background: getComputedStyle(el).backgroundColor })));
  await writeFile(path.join(artifactRoot, `${state}-frame.json`), JSON.stringify(frameMetrics, null, 2));
  const metrics = await page.evaluate(() => Object.fromEntries(['card', 'banner', 'panel', 'heading', 'context', 'labels', 'row', 'close', 'add', 'footer', 'submit', 'onboardingFooter'].map(name => { const inviteRoot = document.querySelector('[role=dialog], [role=region][aria-label="邀请成员"]'); const el = name === 'card' ? document.querySelector('[data-testid=entry-cloud-signin-tip]') : name === 'banner' ? document.querySelector('[role=region][aria-label="邀请"]') : inviteRoot?.querySelector(`[class*="_${name}_"]`); if (!el) return [name, null]; const r=el.getBoundingClientRect(); const css=getComputedStyle(el); return [name,{x:r.x,y:r.y,width:r.width,height:r.height,margin:css.margin,padding:css.padding,font:css.font,features:css.fontFeatureSettings,letterSpacing:css.letterSpacing,text:el.textContent,lineHeight:css.lineHeight,background:css.backgroundColor,color:css.color,opacity:css.opacity}]; })));
  await writeFile(path.join(artifactRoot, `${state}-metrics.json`), JSON.stringify(metrics, null, 2));
  const options = await page.getByRole('option').evaluateAll(items => items.map(item => { const r = item.getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,scrollHeight:item.scrollHeight,clientHeight:item.clientHeight }; }));
  await writeFile(path.join(artifactRoot, `${state}-options.json`), JSON.stringify(options, null, 2));
  const toastMetrics = await page.locator('.od-toast').evaluateAll(items => items.map(el => { const css = getComputedStyle(el); return { rect: el.getBoundingClientRect().toJSON(), background: css.backgroundColor, borderRadius: css.borderRadius, closeButtons: el.querySelectorAll('button').length }; }));
  await writeFile(path.join(artifactRoot, `${state}-toast-metrics.json`), JSON.stringify(toastMetrics, null, 2));
  await page.screenshot({ path: path.join(artifactRoot, `${state}.png`), animations: 'disabled' });
  const dialog = page.getByRole('dialog');
  if (await dialog.count() && await dialog.isVisible()) await dialog.locator('section').first().screenshot({ path: path.join(artifactRoot, `${state}-panel.png`), animations: 'disabled' });
  const menu = page.getByRole('listbox');
  if (await menu.count() && await menu.first().isVisible()) await menu.first().screenshot({ path: path.join(artifactRoot, `${state}-menu.png`), animations: 'disabled' });
  const tooltip = page.getByRole('tooltip');
  if (await tooltip.count() && await tooltip.first().isVisible()) await tooltip.first().screenshot({ path: path.join(artifactRoot, `${state}-tooltip.png`), animations: 'disabled' });
}
async function capturePermissionsNarrow(page: Page, state: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForVisualStable(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (state === 'H01') {
    await expect(page.getByRole('alertdialog').getByRole('button', { name: '确认', exact: true })).toBeInViewport();
    await expect(page.getByTestId('home-hero')).toHaveCount(0);
  }
  if (state === 'H12') await expect(page.getByTestId('entry-top-right-credits')).toBeInViewport();
  await capture(page, `${state}-narrow`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await waitForVisualStable(page);
}
for (const [state, role] of [['B02', 'owner'], ['B03', 'member'], ['B27', 'admin']] as const) {
  test(`[P1] ${state} reference viewport invitation role and layout`, async ({ page }) => {
    const dialog = await setup(page, role);
    await expect(dialog.locator('input[type="email"]')).toHaveCount(1);
    if (role !== 'owner') await expect(dialog.locator('[aria-haspopup="listbox"]:enabled')).toHaveCount(0);
    await capture(page, state);
    if (role === 'owner') {
      // OPEND-4453: use the established 12px field padding plus its 1px border,
      // rather than leaving unused space after a text-adjacent chevron.
      const rightInset = await dialog.locator('[aria-haspopup="listbox"]').evaluate(trigger => {
        const arrow = trigger.querySelector('svg');
        if (!arrow) throw new Error('Invitation role chevron missing');
        return trigger.getBoundingClientRect().right - arrow.getBoundingClientRect().right;
      });
      expect(rightInset).toBeCloseTo(13, 1);
      await expect(dialog.getByRole('heading')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: '发送邀请', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(dialog.getByRole('button', { name: '邀请成员说明', exact: true })).toBeFocused();
    } else {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(dialog.locator('section')).toHaveCSS('width', '358px');
      await expect(dialog.locator('[aria-haspopup="listbox"]')).toHaveCount(0);
      await capture(page, `${state}-narrow`);
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
    }
  });
}
test('[P1] B20 owner multiple rows and role description', async ({ page }) => {
  const dialog = await setup(page, 'owner');
  await dialog.getByRole('button', { name: /添加成员/ }).click();
  await expect(dialog.locator('input[type="email"]')).toHaveCount(2);
  await dialog.getByRole('button', { name: '移除', exact: true }).first().hover();
  await expect(dialog.getByRole('button', { name: '移除', exact: true }).first()).toHaveCSS('background-color', 'rgb(242, 242, 242)');
  await expect(dialog.getByRole('button', { name: '移除', exact: true }).first()).toHaveCSS('height', '24px');
  await capture(page, 'B20-remove-hover');
  await dialog.locator('[aria-haspopup="listbox"]').first().click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await capture(page, 'B20');
  await expect.poll(() => page.getByRole('option').evaluateAll(items => items.map(item => item.scrollHeight <= item.clientHeight))).toEqual([true, true]);
  const admin = page.getByRole('option', { name: /^管理员/ });
  await admin.hover(); await capture(page, 'B20-admin-hover');
  const firstRole = dialog.locator('[aria-haspopup="listbox"]').first();
  await firstRole.press('ArrowDown');
  await expect(page.getByRole('option', { name: /^成员/ })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(admin).toBeFocused(); await capture(page, 'B20-admin-focus');
  await page.keyboard.press('Enter'); await expect(firstRole).toContainText('管理员');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await firstRole.click(); await page.getByRole('option', { name: /^成员/ }).click();
  await expect(firstRole).toContainText('成员');
  await firstRole.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const menu = await page.getByRole('listbox').boundingBox();
    const trigger = await dialog.locator('[aria-haspopup="listbox"]').first().boundingBox();
    return menu && trigger ? Math.abs(menu.x - trigger.x) + Math.abs(menu.y - trigger.y - trigger.height - 6) : Number.POSITIVE_INFINITY;
  }).toBeLessThan(.1);
  await page.keyboard.press('Escape');
  await dialog.locator('[aria-haspopup="listbox"]').first().blur();
  await dialog.locator('[aria-haspopup="listbox"]').first().click();
  await capture(page, 'B20-narrow');
  const menuBounds = await page.getByRole('listbox').boundingBox();
  const roleBounds = await dialog.locator('[aria-haspopup="listbox"]').first().boundingBox();
  if (!menuBounds || !roleBounds) throw new Error('Role menu has no visible bounds');
  expect(menuBounds.x).toBeCloseTo(roleBounds.x, 1);
  expect(menuBounds.y - roleBounds.y - roleBounds.height).toBeCloseTo(6, 1);
  await admin.hover(); await capture(page, 'B20-admin-narrow-hover');
  await expect(dialog).toHaveCSS('pointer-events', 'auto');
  await admin.click(); await expect(dialog.locator('[aria-haspopup="listbox"]').first()).toContainText('管理员');
  await dialog.getByRole('button', { name: '移除', exact: true }).first().click();
  await expect(dialog.locator('input[type="email"]')).toHaveCount(1);
});
test('[P1] A06 workspace switcher shows the two reference identities', async ({ page }) => {
  const menu = await setup(page, 'owner', false, 2, { dismissBanner: true });
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
  await expect(menu).toContainText('Xiaoyi’s Workspace');
  await expect(menu).toContainText('Design space');
  await expect(menu.getByTestId('entry-nav-create-team')).toBeVisible();
  await expect(menu.getByTestId('entry-nav-create-team')).toHaveAttribute('target', '_blank');
  await capture(page, 'A06');
});
async function verifyOrdinaryErrorRecovery(page: Page, dialog: ReturnType<Page['getByRole']>, state: string) {
  const inputs = dialog.locator('input[type="email"]');
  await inputs.last().focus(); await capture(page, `${state}-error-focus`); await inputs.last().blur();
  await page.setViewportSize({ width: 390, height: 844 }); await capture(page, `${state}-narrow`);
  await inputs.last().fill('corrected@example.com'); await inputs.last().blur();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '发送邀请', exact: true })).toBeEnabled();
}
test('[P1] B21 invalid email stays editable and unsent', async ({ page }) => {
  const dialog = await setup(page, 'owner');
  let inviteRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/workspace/invite') inviteRequests += 1; });
  await dialog.locator('input[type="email"]').fill('invalid-email');
  await dialog.getByRole('button', { name: /发送邀请|确认并邀请/ }).click();
  await expect(dialog.locator('input[type="email"]')).toHaveValue('invalid-email');
  await expect(dialog.getByText(/邮箱格式/)).toBeVisible();
  await capture(page, 'B21');
  expect(inviteRequests).toBe(0);
  await verifyOrdinaryErrorRecovery(page, dialog, 'B21');
  expect(inviteRequests).toBe(0);
});
test('[P1] B22 duplicate emails retain both rows for correction', async ({ page }) => {
  const dialog = await setup(page, 'owner');
  let inviteRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/workspace/invite') inviteRequests += 1; });
  await dialog.getByRole('button', { name: /添加成员/ }).click();
  const inputs = dialog.locator('input[type="email"]');
  await inputs.nth(0).fill('lee@example.com');
  await inputs.nth(1).fill('lee@example.com');
  await dialog.getByRole('button', { name: /发送邀请|确认并邀请/ }).click();
  await expect(inputs).toHaveCount(2);
  await expect(dialog.getByText(/重复/)).toBeVisible();
  await capture(page, 'B22');
  expect(inviteRequests).toBe(0);
  await verifyOrdinaryErrorRecovery(page, dialog, 'B22');
  expect(inviteRequests).toBe(0);
});
test('[P1] B24 pending request disables repeated sends', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const dialog = await setup(page, 'owner');
  let closing = false;
  let finishReply = () => {};
  const replyFinished = new Promise<void>(resolve => { finishReply = resolve; });
  let requests = 0;
  await page.route('**/api/workspace/invite', async route => {
    requests += 1;
    await gate;
    try { await route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: true, inviteId: 'visual-only-invite' }] } }); }
    catch (error) { if (!closing) throw error; } finally { finishReply(); }
  });
  try {
    await dialog.getByRole('button', { name: /添加成员/ }).click();
    await dialog.locator('input[type="email"]').nth(0).fill('mika@example.com');
    await dialog.locator('input[type="email"]').nth(1).fill('lee@example.com');
    await dialog.getByRole('button', { name: /发送邀请|确认并邀请/ }).click();
    await expect(dialog.getByRole('button', { name: /正在发送/ })).toBeDisabled();
    for (const input of await dialog.locator('input').all()) await expect(input).toBeDisabled();
    for (const button of await dialog.locator('form').getByRole('button').all()) await expect(button).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '邀请成员说明' })).toBeEnabled();
    await expect(dialog.locator('header').getByRole('button', { name: '取消', exact: true })).toBeEnabled();
    await capture(page, 'B24');
    await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'B24-narrow');
    closing = true;
    await dialog.locator('header').getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0); expect(requests).toBe(1);
  } finally { release(); }
  await replyFinished;
  await expect(page.locator('.od-toast')).toHaveCount(0);
});
test('[P1] B26 partial failure keeps only the failed recipient', async ({ page }) => {
  const dialog = await setup(page, 'owner');
  const attempts: string[][] = [];
  await page.route('**/api/workspace/invite', route => {
    const emails = (route.request().postDataJSON().invites as Array<{ email: string }>).map(invite => invite.email); attempts.push(emails);
    return route.fulfill({ json: { results: attempts.length > 1 ? emails.map(email => ({ email, ok: true, inviteId: 'retry-visual-invite' })) : [
      { email: 'mika@example.com', ok: true, inviteId: 'visual-only-sent' },
      { email: 'lee@example.com', ok: false, error: 'active_pending_invite' },
    ] } });
  });
  await dialog.getByRole('button', { name: /添加成员/ }).click();
  await dialog.locator('input[type="email"]').nth(0).fill('mika@example.com');
  await dialog.locator('input[type="email"]').nth(1).fill('lee@example.com');
  await dialog.getByRole('button', { name: /发送邀请|确认并邀请/ }).click();
  await expect(dialog.locator('input[type="email"]')).toHaveCount(1);
  await expect(dialog.locator('input[type="email"]')).toHaveValue('lee@example.com');
  await expect(dialog.getByText('此邮箱已有待接受的邀请，可在成员页重新发送')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '发送邀请', exact: true })).toBeEnabled();
  await expect(page.locator('.od-toast')).toHaveCount(0);
  await page.mouse.move(1300, 800); await capture(page, 'B26');
  const retry = dialog.getByRole('button', { name: '发送邀请', exact: true });
  await retry.hover(); await expect(retry).toHaveCSS('background-color', 'rgb(51, 51, 51)'); await capture(page, 'B26-retry-hover');
  await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'B26-narrow');
  await retry.click(); await expect(dialog).toHaveCount(0);
  expect(attempts).toEqual([['mika@example.com', 'lee@example.com'], ['lee@example.com']]);
  await expect(page.getByRole('status').filter({ hasText: '已向 2 位同事发送邀请' })).toBeVisible();
});

test('[P1] A01 local identity shows cloud sign-in entry', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await configureVisualPage(page, { velaLoggedIn: false });
  await configureReferenceExamples(page);
  await page.addInitScript(() => { localStorage.setItem('open-design:locale', 'zh-CN'); localStorage.setItem('open-design:locale-source', 'manual'); });
  await gotoVisualHome(page);
  await ensureRailOpen(page);
  // The invitation is independent of the current home composer mode.
  // Keep the actual integration homepage rather than requiring a retired picker.
  await expect(page.getByTestId('entry-cloud-signin-tip')).toBeVisible();
  await capture(page, 'A01');
  const card = page.getByTestId('entry-cloud-signin-tip');
  await card.screenshot({ path: path.join(artifactRoot, 'A01-card.png'), animations: 'disabled' });
  await card.hover(); await card.screenshot({ path: path.join(artifactRoot, 'A01-card-hover.png'), animations: 'disabled' });
  await page.mouse.move(1300, 800); await page.keyboard.press('Tab'); await card.focus();
  await capture(page, 'A01-focus');
  await card.blur(); await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'A01-narrow');
  if (await card.isVisible()) await card.screenshot({ path: path.join(artifactRoot, 'A01-card-narrow.png'), animations: 'disabled' });
});

test('[P1] A03 and A05 dismissal persists across reload while header invite remains', async ({ page }) => {
  await setup(page, 'owner', false, 2, { workspaceType: 'personal' });
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  const banner = page.getByRole('region', { name: '邀请', exact: true });
  await expect(banner).toBeVisible();
  await capture(page, 'A03');
  await banner.getByRole('button', { name: '关闭邀请横条' }).click();
  await expect(banner).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('workspace-switcher')).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.addInitScript(() => sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: 'members-visual-design-space', workspaceMemberId: 'members-visual-design-member' })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? '{}').workspaceId)).toBe('members-visual-design-space');
  await expect(banner).toHaveCount(0);
  const persistentInvite = page.getByRole('banner', { name: 'Workspace tabs' }).getByRole('button', { name: '邀请', exact: true });
  await expect(persistentInvite).toBeVisible();
  await page.addInitScript(() => sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: 'members-visual-workspace', workspaceMemberId: 'members-visual-owner' })));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('workspace-switcher')).toContainText('Xiaoyi’s Workspace');
  await page.getByTestId('entry-nav-drafts').click();
  await expect(page).toHaveURL(/\/drafts$/);
  await expect(page.getByTestId('recent-projects-strip')).toBeVisible();
  await expect(persistentInvite).toBeVisible();
  await capture(page, 'A05');
  await persistentInvite.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('[P1] banner dismissal is scoped to account identity', async ({ page }) => {
  await setup(page, 'owner', false);
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  const banner = page.getByRole('region', { name: '邀请', exact: true });
  await banner.getByRole('button', { name: '关闭邀请横条' }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('od.invitation-banner.dismissed:u1'))).toBe('1');
  await page.route('**/api/integrations/vela/status', route => route.fulfill({ json: {
    loggedIn: true, loginInFlight: false, profile: 'test',
    user: { id: 'u2', email: 'second@example.com' }, account: { plan: 'plus', balanceUsd: '247.51' },
  } }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(banner).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('od.invitation-banner.dismissed:u2'))).toBeNull();
});

test('[P1] A06 fifty workspace limit preserves scroll and disables create', async ({ page }) => {
  const menu = await setup(page, 'owner', false, 50, { dismissBanner: true });
  await expect(menu).toContainText('50/50');
  await expect(menu.getByRole('menuitem', { name: '新建工作空间' })).toBeDisabled();
  await expect(menu.getByText('已达 50 个上限')).toBeVisible();
  const list = page.getByTestId('workspace-switcher-list');
  await expect.poll(() => list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await capture(page, 'A06-limit');
});

// HTTP-edge SSE witness, not a real AMR removal or provider task-stop proof.
for (const removal of ['exact', 'other-member', 'other-workspace'] as const) {
  const exact = removal === 'exact';
  test(`[P1] ${exact ? 'H01 H12 exact removal requires verified default recovery' : removal === 'other-workspace' ? 'H02 background workspace removal keeps current content' : 'different member removal preserves exact current authority'}`, async ({ page }) => {
    let deliver!: () => void;
    const gate = new Promise<void>(resolve => { deliver = resolve; });
    let delivered = false;
    let removed = false;
    let switched = false;
    let activeAttempts = 0;
    let contextReads = 0;
    const writes: unknown[] = [];
    try {
      await setup(page, 'owner', false, 2, { workspaceName: 'Xiaoyi’s Workspace', workspaceType: 'personal', planId: 'pro', dismissBanner: true, referenceHome: true, beforeHome: async current => {
        const fallback = { ...current, workspaceId: 'members-default', workspaceMemberId: 'members-default-owner', workspaceName: 'Xiaoyi’s Workspace', planId: 'free', billingState: 'free', isDefault: true };
        await page.route('**/api/workspace/directory', route => route.fulfill({ json: { items: removed && exact ? [fallback] : removed && removal === 'other-workspace' ? [{ ...current, isDefault: false }] : [{ ...current, isDefault: false }, fallback], activeWorkspaceId: switched ? fallback.workspaceId : current.workspaceId } }));
        await page.route('**/api/workspace/billing**', route => {
          const isDefault = new URL(route.request().url()).searchParams.get('workspaceId') === fallback.workspaceId;
          const scope = isDefault ? fallback : current;
          const wallet = { workspaceId: scope.workspaceId, workspaceMemberId: scope.workspaceMemberId, billingScopeVersion: 2, balanceUsd: '0.00', expiresAt: null, updatedAt: null };
          return route.fulfill({ json: { summary: null, workspaceBalance: wallet, workspaceSnapshot: {
            schemaVersion: 1, billingScopeVersion: 2, workspaceId: scope.workspaceId, workspaceMemberId: scope.workspaceMemberId,
            billing: { planId: scope.planId, billingState: scope.billingState }, wallet,
            revisions: { billing: `visual-${scope.workspaceId}`, wallet: `visual-${scope.workspaceId}` },
          } } });
        });
        await page.route('**/api/workspace/context', route => {
          contextReads += 1;
          return route.fulfill({ json: { context: route.request().headers()['x-od-workspace-id'] === fallback.workspaceId ? fallback : current } });
        });
        await page.route('**/api/workspace/active', route => {
          const body = route.request().postDataJSON(); writes.push(body); activeAttempts += 1;
          if (activeAttempts === 1) return route.fulfill({ status: 503, json: { error: 'fixture_unavailable' } });
          switched = true;
          return route.fulfill({ json: { activeWorkspaceId: fallback.workspaceId, context: fallback } });
        });
        await page.route('**/api/workspace/events**', async route => {
          await gate;
          if (delivered) return route.fulfill({ status: 204 });
          delivered = true;
          const scope = { workspaceId: current.workspaceId, workspaceMemberId: current.workspaceMemberId };
          const payload = { type: 'workspace-context-changed', memberRemoval: { ...scope, workspaceId: removal === 'other-workspace' ? fallback.workspaceId : scope.workspaceId, workspaceMemberId: exact ? scope.workspaceMemberId : removal === 'other-workspace' ? fallback.workspaceMemberId : 'another-member', reason: 'member-removed' }, at: new Date().toISOString() };
          return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: ${JSON.stringify(scope)}\n\nevent: workspace-context-changed\ndata: ${JSON.stringify(payload)}\n\n` });
        });
      } });
      await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
      await expect(page.getByTestId('home-hero')).toBeVisible();
      const before = contextReads;
      removed = true; deliver();
      if (!exact) {
        await expect.poll(() => contextReads).toBeGreaterThan(before);
        await expect(page.getByRole('alertdialog')).toHaveCount(0);
        await expect(page.getByTestId('workspace-switcher')).toContainText('Xiaoyi’s Workspace');
        await expect(page.getByTestId('home-hero')).toBeVisible();
        expect(writes).toEqual([]);
        if (removal === 'other-workspace') {
          await page.getByTestId('workspace-switcher').click();
          await expect(page.getByRole('menu')).toContainText('1/50');
          await expect(page.locator('.home-hero__title')).toHaveText('让我们创建原型');
          expect((await page.locator('.home-hero__title').boundingBox())!.y).toBeCloseTo(184, 0);
          await capture(page, 'H02');
          await capturePermissionsNarrow(page, 'H02');
        }
        return;
      }
      const dialog = page.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading')).toContainText('Xiaoyi’s Workspace');
      await expect(page.getByTestId('home-hero')).toHaveCount(0);
      await expect(dialog).toHaveCSS('font-family', 'Inter, -apple-system, system-ui, \"Segoe UI\", \"PingFang SC\", sans-serif');
      await capture(page, 'H01');
      await capturePermissionsNarrow(page, 'H01');
      await dialog.getByRole('button').click();
      await expect(dialog.getByRole('alert')).toBeVisible();
      await capture(page, 'H01-retry');
      await expect(page.getByTestId('home-hero')).toHaveCount(0);
      await dialog.getByRole('button').click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId('workspace-switcher')).toContainText('Xiaoyi’s Workspace');
      await expect(page.getByTestId('home-hero')).toBeVisible();
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? '{}').workspaceId)).toBe('members-default');
      expect(writes).toEqual(Array.from({ length: 2 }, () => ({ workspaceId: 'members-default', workspaceMemberId: 'members-default-owner' })));
      await expect(page.getByRole('button', { name: '升级', exact: true })).toBeVisible();
      await selectReferencePrototype(page);
      await expect(page.locator('.entry-top-right-account-pill--upgrade')).toBeVisible();
      await capture(page, 'H12');
      await capturePermissionsNarrow(page, 'H12');
    } finally { deliver?.(); }
  });
}

test('[P1] B23 existing member is a row error with editable email retained', async ({ page }) => {
  const dialog = await setup(page, 'owner');
  await page.route('**/api/workspace/invite', route => route.fulfill({ json: { results: [{ email: 'lee@example.com', ok: false, error: 'already_member' }] } }));
  const input = dialog.locator('input[type="email"]');
  await input.fill('lee@example.com');
  await dialog.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(dialog.getByText('此邮箱已是工作空间成员，无需邀请')).toBeVisible();
  await expect(input).toHaveValue('lee@example.com');
  await expect(input).toBeEditable();
  await page.mouse.move(1300, 800);
  await capture(page, 'B23');
  await input.fill('new@example.com');
  await expect(dialog.getByText('此邮箱已是工作空间成员，无需邀请')).toHaveCount(0);
});

test('[P1] B10 partial success then corrected retry closes with actual cumulative count two', async ({ page }) => {
  const dialog = await setup(page, 'owner');
  let calls = 0;
  await page.route('**/api/workspace/invite', route => {
    calls += 1;
    return route.fulfill({ json: { results: calls === 1 ? [
      { email: 'mika@example.com', ok: true, inviteId: 'visual-one' },
      { email: 'lee@example.com', ok: false, error: 'active_pending_invite' },
    ] : [{ email: 'corrected@example.com', ok: true, inviteId: 'visual-two' }] } });
  });
  await dialog.getByRole('button', { name: /添加成员/ }).click();
  await dialog.locator('input[type="email"]').nth(0).fill('mika@example.com');
  await dialog.locator('input[type="email"]').nth(1).fill('lee@example.com');
  await dialog.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(dialog.locator('input[type="email"]')).toHaveCount(1);
  await expect(dialog.getByText('此邮箱已有待接受的邀请，可在成员页重新发送')).toBeVisible();
  await dialog.locator('input[type="email"]').fill('corrected@example.com');
  await dialog.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '已向 2 位同事发送邀请' })).toBeVisible();
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
  expect(calls).toBe(2);
  await page.mouse.move(1300, 800);
  await capture(page, 'B10');
});

test('[P1] A07 create workspace hands off to a browser without adding a client form', async ({ page }) => {
  const menu = await setup(page, 'owner', false, 2, { dismissBanner: true });
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
  const create = menu.getByTestId('entry-nav-create-team');
  const href = await create.getAttribute('href');
  expect(href).toBeTruthy();
  await page.context().route('https://console.example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Controlled console handoff</title><p>External navigation witness only</p>' }));
  await capture(page, 'A07');
  const popupPromise = page.waitForEvent('popup');
  await create.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(href!);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('workspace-switcher')).toBeVisible();
  await popup.close();
});

test('[P1] C12 joined directory appears without account logout and switches by exact identity', async ({ page }) => {
  let deliver!: () => void;
  const gate = new Promise<void>(resolve => { deliver = resolve; });
  let delivered = false;
  let joined = false;
  let directoryReads = 0;
  let activeId = 'members-visual-workspace';
  const writes: unknown[] = [];
  const logoutRequests: string[] = [];
  page.on('request', request => { if (/\/(?:logout|signout|sign-out)(?:[/?]|$)/.test(request.url())) logoutRequests.push(request.url()); });
  try {
    const menu = await setup(page, 'owner', false, 2, { dismissBanner: true, beforeHome: async current => {
      const added = { ...current, workspaceId: 'members-joined-design', workspaceMemberId: 'members-joined-owner', workspaceName: 'Design space' };
      await page.route('**/api/workspace/directory', route => {
        directoryReads += 1;
        return route.fulfill({ json: { items: joined ? [current, added] : [current], activeWorkspaceId: activeId } });
      });
      await page.route('**/api/workspace/context', route => route.fulfill({ json: { context: route.request().headers()['x-od-workspace-id'] === added.workspaceId ? added : current } }));
      await page.route('**/api/workspace/active', route => {
        writes.push(route.request().postDataJSON()); activeId = added.workspaceId;
        return route.fulfill({ json: { activeWorkspaceId: activeId, context: added } });
      });
      await page.route('**/api/workspace/events**', async route => {
        await gate;
        if (delivered) return route.fulfill({ status: 204 });
        delivered = true;
        return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {}\n\nevent: workspace-context-changed\ndata: ${JSON.stringify({ type: 'workspace-context-changed', at: new Date().toISOString() })}\n\n` });
      });
    } });
    await expect(menu.getByRole('menuitem', { name: 'Design space', exact: true })).toHaveCount(0);
    await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
    const before = directoryReads;
    joined = true; deliver();
    await expect.poll(() => directoryReads).toBeGreaterThan(before);
    await page.getByTestId('workspace-switcher').click();
    await page.getByRole('menuitem', { name: 'Design space', exact: true }).click();
    await expect(page.getByTestId('workspace-switcher')).toContainText('Design space');
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? '{}').workspaceId)).toBe('members-joined-design');
    expect(writes).toEqual([{ workspaceId: 'members-joined-design', workspaceMemberId: 'members-joined-owner' }]);
    expect(logoutRequests).toEqual([]);
    await page.getByTestId('workspace-switcher').click();
    await expect(page.getByRole('menuitem', { name: 'Design space', exact: true })).toHaveAttribute('aria-current', 'true');
    await capture(page, 'C12');
  } finally { deliver?.(); }
});

test('[P1] H04 rejoined workspace uses a new membership identity without a restoration dialog', async ({ page }) => {
  let deliver!: () => void;
  const gate = new Promise<void>(resolve => { deliver = resolve; });
  let delivered = false;
  let phase: 'before' | 'removed' | 'rejoined' = 'before';
  let directoryReads = 0;
  let activeId = 'members-visual-workspace';
  const writes: unknown[] = [];
  try {
    const menu = await setup(page, 'owner', false, 2, { workspaceType: 'personal', planId: 'pro', dismissBanner: true, referenceHome: true, beforeHome: async current => {
      const old = { ...current, workspaceId: 'members-rejoined-design', workspaceMemberId: 'members-rejoined-old', workspaceName: 'Design space' };
      const rejoined = { ...old, workspaceMemberId: 'members-rejoined-new' };
      await page.route('**/api/workspace/directory', route => {
        directoryReads += 1;
        const items = phase === 'before' ? [current, old] : phase === 'removed' ? [current] : [current, rejoined];
        return route.fulfill({ json: { items, activeWorkspaceId: activeId } });
      });
      await page.route('**/api/workspace/context', route => route.fulfill({ json: { context: route.request().headers()['x-od-workspace-member-id'] === rejoined.workspaceMemberId ? rejoined : current } }));
      await page.route('**/api/workspace/active', route => {
        writes.push(route.request().postDataJSON()); activeId = rejoined.workspaceId;
        return route.fulfill({ json: { activeWorkspaceId: activeId, context: rejoined } });
      });
      await page.route('**/api/workspace/events**', async route => {
        await gate;
        if (delivered) return route.fulfill({ status: 204 });
        delivered = true;
        const event = { type: 'workspace-context-changed', memberRemoval: { workspaceId: old.workspaceId, workspaceMemberId: old.workspaceMemberId, reason: 'member-removed' }, at: new Date().toISOString() };
        return route.fulfill({ contentType: 'text/event-stream', body: `event: ready\ndata: {}\n\nevent: workspace-context-changed\ndata: ${JSON.stringify(event)}\n\n` });
      });
    } });
    await expect(menu.getByRole('menuitem', { name: 'Design space', exact: true })).toBeVisible();
    await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
    const before = directoryReads;
    phase = 'removed'; deliver();
    await expect.poll(() => directoryReads).toBeGreaterThan(before);
    await page.getByTestId('workspace-switcher').click();
    await expect(page.getByRole('menuitem', { name: 'Design space', exact: true })).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    phase = 'rejoined';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await selectReferencePrototype(page);
    await ensureRailOpen(page);
    await page.getByTestId('workspace-switcher').click();
    await page.getByRole('menuitem', { name: 'Design space', exact: true }).click();
    await expect(page.getByTestId('workspace-switcher')).toContainText('Design space');
    await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? '{}').workspaceMemberId)).toBe('members-rejoined-new');
    expect(writes).toEqual([{ workspaceId: 'members-rejoined-design', workspaceMemberId: 'members-rejoined-new' }]);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByTestId('workspace-switcher').click();
    await expect(page.getByRole('menuitem', { name: 'Design space', exact: true })).toHaveAttribute('aria-current', 'true');
    expect((await page.locator('.home-hero__title').boundingBox())!.y).toBeCloseTo(184, 0);
    await capture(page, 'H04');
    await capturePermissionsNarrow(page, 'H04');
  } finally { deliver?.(); }
});

test('[P1] member entry light frame preserves dark and narrow surfaces', async ({ page }) => {
  await setup(page, 'owner', false, 2, { dismissBanner: true });
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await expect(page.locator('.entry-main--scroll')).not.toHaveCSS('background-color', 'rgb(252, 250, 249)');
  await expect(page.locator('.workspace-tabs-chrome')).not.toHaveCSS('background-color', 'rgb(229, 223, 220)');
  await capture(page, 'supplement-dark');
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.entry-main--scroll')).not.toHaveCSS('background-color', 'rgb(252, 250, 249)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('.entry-main--scroll')).toHaveCSS('background-color', 'rgb(252, 250, 249)');
  await page.setViewportSize({ width: 768, height: 900 });
  const bounds = await page.locator('.entry-main--scroll').boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(768);
  await capture(page, 'supplement-narrow');
});

test('[P1] B02 hover, help and narrow viewport remain readable', async ({ page }) => {
 const dialog = await setup(page, 'owner');
 const submit = dialog.getByRole('button', { name: '发送邀请', exact: true });
 await submit.hover();
 await expect(submit).toHaveCSS('background-color', 'rgb(51, 51, 51)');
 await capture(page, 'B02-send-hover');
 const email = dialog.locator('input[type="email"]');
 await email.fill('new.teammate@example.com'); await submit.hover(); await capture(page, 'B02-enabled-send-hover');
 await email.fill(''); await email.focus(); await capture(page, 'B02-input-focus'); await email.blur();
 await dialog.getByRole('button', { name: '邀请成员说明' }).hover();
 await expect(page.getByRole('tooltip')).toBeVisible();
 const helpBounds = await page.getByRole('tooltip').boundingBox();
 const triggerBounds = await dialog.getByRole('button', { name: '邀请成员说明' }).boundingBox();
 if (!helpBounds || !triggerBounds) throw new Error('Invite help has no visible bounds');
 expect(triggerBounds.y - helpBounds.y - helpBounds.height).toBeCloseTo(10, 1);
 await capture(page, 'B02-help-hover');
 await page.mouse.move(1300, 800);
 await dialog.getByRole('button', { name: /添加成员/ }).hover();
 await capture(page, 'B02-add-hover');
 await dialog.locator('footer').getByRole('button', { name: '取消', exact: true }).hover(); await capture(page, 'B02-cancel-hover');
 await dialog.locator('header').getByRole('button', { name: '取消', exact: true }).hover(); await capture(page, 'B02-close-hover');
 await page.setViewportSize({ width:390, height:844 });
 await page.mouse.move(0,0);
 await capture(page, 'B02-narrow');
 const input=dialog.locator('input[type="email"]');
 expect((await input.boundingBox())?.width).toBeLessThanOrEqual(318);
 await dialog.getByRole('button', { name: '邀请成员说明' }).focus();
 await expect(page.getByRole('tooltip')).toBeVisible();
 await capture(page, 'B02-help-focus-narrow');
});

test('[P1] B01 registration invitation default from a verified registration claim', async ({ page }) => {
  const registration = await setup(page, 'owner', false, 2, { registration: true });
  await expect(registration.locator('input[type="email"]')).toHaveCount(1);
  await capture(page, 'B01');
  await registration.getByRole('button', { name: '发送邀请', exact: true }).hover(); await expect(registration.getByRole('button', { name: '发送邀请', exact: true })).toHaveCSS('background-color', 'rgb(53, 53, 53)'); await capture(page, 'B01-submit-hover');
  await registration.getByRole('button', { name: '暂时跳过', exact: true }).hover(); await expect(registration.getByRole('button', { name: '暂时跳过', exact: true })).toHaveCSS('color', 'rgb(136, 136, 136)'); await capture(page, 'B01-skip-hover');
  const add = registration.getByRole('button', { name: /添加成员/ });
  await add.hover(); await capture(page, 'B01-add-hover');
  const input = registration.locator('input[type="email"]');
  await input.focus(); await capture(page, 'B01-input-focus');
  await input.blur();
  const role = registration.locator('[aria-haspopup="listbox"]').first();
  await role.click(); await expect(page.getByRole('listbox')).toBeVisible(); await capture(page, 'B01-role-menu');
  await page.getByRole('option', { name: /^管理员/ }).hover(); await capture(page, 'B01-admin-hover');
  await page.keyboard.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, 'B01-narrow');
  await role.click(); await expect(page.getByRole('listbox')).toBeVisible(); await capture(page, 'B01-role-menu-narrow');
});

for (const state of ['B04', 'B05', 'B06', 'B07', 'B08'] as const) {
  test(`[P1] ${state} registration invitation reference state`, async ({ page }) => {
    const registration = await setup(page, 'owner', false, 2, { registration: true });
    const inputs = registration.locator('input[type="email"]');
    if (state !== 'B05' && state !== 'B07') await registration.getByRole('button', { name: /添加成员/ }).click();
    await inputs.nth(0).fill(state === 'B05' ? 'invalid-email' : state === 'B07' ? 'designer@example.com' : state === 'B06' ? 'lee@example.com' : 'mika@example.com');
    if (await inputs.count() > 1) await inputs.nth(1).fill('lee@example.com');
    let release = () => {};
    if (state === 'B07') await page.route('**/api/workspace/invite', route => route.fulfill({ json: { results: [{ email: 'designer@example.com', ok: false, error: 'already_member' }] } }));
    if (state === 'B08') {
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/api/workspace/invite', async route => { await gate; await route.fulfill({ json: { results: [] } }); });
    }
    try {
      if (state !== 'B04') await registration.getByRole('button', { name: '发送邀请', exact: true }).click();
      if (state === 'B05') await expect(registration.getByText(/邮箱格式/)).toBeVisible();
      if (state === 'B06') await expect(registration.getByText(/重复/)).toBeVisible();
      if (state === 'B07') await expect(registration.getByText(/已是|已经是/)).toBeVisible();
      if (state === 'B08') await expect(registration.getByRole('button', { name: /正在发送/ })).toBeDisabled();
      await inputs.last().blur();
      await capture(page, state);
      if (state === 'B04' || state === 'B06') {
        await registration.getByRole('button', { name: '移除', exact: true }).first().hover();
        await capture(page, `${state}-remove-hover`);
      }
      if (state === 'B05' || state === 'B06' || state === 'B07') {
        await inputs.last().focus(); await capture(page, `${state}-error-focus`); await inputs.last().blur();
      }
      if (state === 'B08') {
        for (const input of await inputs.all()) await expect(input).toBeDisabled();
        for (const button of await registration.getByRole('button').all()) await expect(button).toBeDisabled();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await capture(page, `${state}-narrow`);
      if (state === 'B04' || state === 'B06') {
        await registration.getByRole('button', { name: '移除', exact: true }).first().hover();
        await capture(page, `${state}-remove-narrow-hover`);
        await registration.getByRole('button', { name: '移除', exact: true }).first().click();
        await expect(inputs).toHaveCount(1);
      }
      if (state === 'B05' || state === 'B06' || state === 'B07') {
        await inputs.last().fill('corrected@example.com'); await inputs.last().blur();
        await expect(registration.getByRole('alert')).toHaveCount(0);
        await expect(registration.getByRole('button', { name: '发送邀请', exact: true })).toBeEnabled();
      }
    } finally { release(); }
  });
}

for (const state of ['B09', 'B11', 'B12'] as const) {
  test(`[P1] ${state} registration delivery reference`, async ({ page }) => {
    const registration = await setup(page, 'owner', false, 2, { registration: true });
    await registration.getByRole('button', { name: /添加成员/ }).click();
    const inputs = registration.locator('input[type="email"]');
    await inputs.nth(0).fill('mika@example.com'); await inputs.nth(1).fill('lee@example.com');
    const attempts: string[][] = [];
    await page.route('**/api/workspace/invite', route => {
      const emails = (route.request().postDataJSON().invites as Array<{ email: string }>).map(invite => invite.email);
      attempts.push(emails);
      if (attempts.length > 1) return route.fulfill({ json: { results: emails.map(email => ({ email, ok: true, inviteId: `retry-${email}` })) } });
      return state === 'B11' ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { results: [
        { email: 'mika@example.com', ok: true, inviteId: 'registration-visual-1' },
        { email: 'lee@example.com', ok: state === 'B09', ...(state === 'B09' ? { inviteId: 'registration-visual-2' } : { error: 'active_pending_invite' }) },
      ] } });
    });
    if (state === 'B09') { await page.clock.install(); await page.clock.pauseAt(new Date()); }
    await registration.getByRole('button', { name: '发送邀请', exact: true }).click();
    if (state === 'B09') {
      await expect(registration.getByRole('heading', { name: '邀请已发送' })).toBeVisible();
      await expect(registration.getByText('3s 后自动进入')).toBeVisible();
      await capture(page, state);
      const enter = registration.getByRole('button', { name: '进入工作台', exact: true });
      await enter.hover(); await expect(enter).toHaveCSS('background-color', 'rgb(51, 51, 51)'); await capture(page, 'B09-enter-hover');
      await page.mouse.move(1300, 800); await page.keyboard.press('Tab'); await expect(enter).toBeFocused(); await capture(page, 'B09-enter-focus');
      await enter.blur(); await page.setViewportSize({ width: 390, height: 844 });
      await expect(enter).toHaveCSS('width', '342px'); await expect(enter).toHaveCSS('height', '48px');
      await expect(registration.getByRole('heading')).toHaveCSS('font-size', '28px');
      await capture(page, 'B09-narrow');
      await page.clock.fastForward(1000); await expect(registration.getByText('2s 后自动进入')).toBeVisible();
      await page.clock.fastForward(2000); await expect(registration).toHaveCount(0);
      await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
    } else {
      await expect(registration.getByRole('button', { name: '发送邀请', exact: true })).toBeEnabled();
      await expect(inputs).toHaveCount(state === 'B12' ? 1 : 2);
      await expect(registration.getByRole('alert').first()).toBeVisible();
      await capture(page, state);
      await registration.getByRole('button', { name: '发送邀请', exact: true }).hover(); await capture(page, `${state}-retry-hover`);
      await page.setViewportSize({ width: 390, height: 844 }); await capture(page, `${state}-narrow`);
      await registration.getByRole('button', { name: '发送邀请', exact: true }).click();
      await expect(registration.getByRole('heading', { name: '邀请已发送' })).toBeVisible();
      await expect(registration.getByText('已向 2 位同事发送邀请，', { exact: false })).toBeVisible();
      expect(attempts).toEqual([['mika@example.com', 'lee@example.com'], state === 'B11' ? ['mika@example.com', 'lee@example.com'] : ['lee@example.com']]);
    }
  });
}

for (const state of ['B13', 'B18', 'B19'] as const) {
  test(`[P1] ${state} registration exit reference`, async ({ page }) => {
    const registration = await setup(page, 'owner', false, 2, { registration: true });
    let inviteCalls = 0;
    await page.route('**/api/workspace/invite', route => {
      inviteCalls += 1;
      return route.fulfill({ json: { results: [
        { email: 'mika@example.com', ok: true, inviteId: 'exit-visual-1' },
        { email: 'lee@example.com', ok: state === 'B18', ...(state === 'B18' ? { inviteId: 'exit-visual-2' } : { error: 'active_pending_invite' }) },
      ] } });
    });
    if (state !== 'B13') {
      await registration.getByRole('button', { name: /添加成员/ }).click();
      const inputs = registration.locator('input[type="email"]');
      await inputs.nth(0).fill('mika@example.com'); await inputs.nth(1).fill('lee@example.com');
      await registration.getByRole('button', { name: '发送邀请', exact: true }).click();
      if (state === 'B19') await expect(registration.getByRole('button', { name: '暂时跳过', exact: true })).toBeEnabled();
      else await expect(registration.getByRole('heading', { name: '邀请已发送' })).toBeVisible();
    }
    if (state === 'B19') { await page.clock.install(); await page.clock.pauseAt(new Date()); }
    await registration.getByRole('button', { name: state === 'B18' ? '进入工作台' : '暂时跳过', exact: true }).click();
    await expect(registration).toHaveCount(0);
    await ensureRailOpen(page);
    const banner = page.getByRole('region', { name: '邀请', exact: true });
    if (state === 'B13') { await expect(banner).toBeVisible(); expect(inviteCalls).toBe(0); }
    else { await expect(banner).toHaveCount(0); expect(inviteCalls).toBe(1); }
    if (state === 'B19') await expect(page.getByRole('status').filter({ hasText: '已向 1 位同事发送邀请' })).toBeVisible();
    else await expect(page.locator('.od-toast')).toHaveCount(0);
    await capture(page, state);
    if (state === 'B13') {
      const invite = banner.getByRole('button', { name: '邀请', exact: true });
      await invite.hover(); await capture(page, 'B13-invite-hover');
      await page.mouse.move(1300, 800); await page.keyboard.press('Tab'); await invite.focus(); await capture(page, 'B13-invite-focus');
      await invite.blur(); await banner.getByRole('button', { name: '关闭邀请横条' }).hover(); await capture(page, 'B13-close-hover');
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, `${state}-narrow`);
    if (state === 'B19') {
      const toast = page.locator('.od-toast');
      await expect(toast).toBeVisible();
      const box = await toast.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeCloseTo(279.5, 1);
      expect(box!.y).toBe(64);
      expect(box!.width).toBe(99);
      expect(box!.height).toBeCloseTo(203.875, 1);
      await toast.screenshot({ path: path.join(artifactRoot, 'B19-narrow-toast.png'), animations: 'disabled' });
      await page.clock.fastForward(4000); await expect(toast).toHaveCount(0);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(registration).toHaveCount(0);
    if (state !== 'B13') await expect(banner).toHaveCount(0);
    else {
      await expect(banner).toBeVisible();
      await banner.getByRole('button', { name: '邀请', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
      await banner.getByRole('button', { name: '关闭邀请横条' }).click(); await expect(banner).toHaveCount(0);
      await page.reload({ waitUntil: 'domcontentloaded' }); await expect(banner).toHaveCount(0);
      expect(inviteCalls).toBe(0);
    }
  });
}

for (const state of ['B10', 'B23', 'B25'] as const) {
  test(`[P1] ${state} ordinary invitation delivery reference`, async ({ page }) => {
    const dialog = await setup(page, 'owner');
    let requests = 0;
    const invitationEmails: string[][] = [];
    await page.route('**/api/workspace/invite', route => {
      requests += 1;
      if (state === 'B23') {
        const emails = (route.request().postDataJSON().invites as Array<{ email: string }>).map(invite => invite.email);
        invitationEmails.push(emails);
        if (requests > 1) return route.fulfill({ json: { results: emails.map(email => ({ email, ok: true, inviteId: 'corrected-visual-invite' })) } });
      }
      if (state === 'B25' && requests === 1) return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { results: state === 'B23' ? [{ email: 'designer@example.com', ok: false, error: 'already_member' }] : [
        { email: 'mika@example.com', ok: true, inviteId: 'ordinary-visual-1' },
        { email: 'lee@example.com', ok: true, inviteId: 'ordinary-visual-2' },
      ] } });
    });
    if (state !== 'B23') await dialog.getByRole('button', { name: /添加成员/ }).click();
    const inputs = dialog.locator('input[type="email"]');
    await inputs.nth(0).fill(state === 'B23' ? 'designer@example.com' : 'mika@example.com');
    if (state !== 'B23') await inputs.nth(1).fill('lee@example.com');
    if (state === 'B10') { await page.clock.install(); await page.clock.pauseAt(new Date()); }
    await dialog.getByRole('button', { name: '发送邀请', exact: true }).click();
    if (state === 'B10') {
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('status').filter({ hasText: '已向 2 位同事发送邀请' })).toBeVisible();
      await capture(page, state);
      await page.clock.fastForward(4000); await expect(page.locator('.od-toast')).toHaveCount(0);
    } else {
      await expect(dialog.getByRole('alert')).toBeVisible();
      await expect(inputs).toHaveCount(state === 'B23' ? 1 : 2);
      await capture(page, state);
      if (state === 'B23') {
        await verifyOrdinaryErrorRecovery(page, dialog, state); expect(requests).toBe(1);
        await dialog.getByRole('button', { name: '发送邀请', exact: true }).click();
        await expect(dialog).toHaveCount(0);
        expect(invitationEmails).toEqual([['designer@example.com'], ['corrected@example.com']]);
      }
      if (state === 'B25') {
        await expect(page.locator('.od-toast')).toHaveCount(0);
        await expect(dialog.getByRole('alert')).toHaveText('邀请发送失败，请检查网络后重试。邮箱和角色已保留。');
        await dialog.getByRole('button', { name: '发送邀请', exact: true }).hover(); await capture(page, 'B25-retry-hover');
        await page.setViewportSize({ width: 390, height: 844 }); await capture(page, 'B25-narrow');
        await expect(inputs.nth(0)).toHaveValue('mika@example.com'); await expect(inputs.nth(1)).toHaveValue('lee@example.com');
        await dialog.getByRole('button', { name: '发送邀请', exact: true }).click(); await expect(dialog).toHaveCount(0); expect(requests).toBe(2);
      }
    }
  });
}


test('[P1] A05 persistent invite button matches reference capsule and states', async ({ page }) => {
  await setup(page, 'owner', false, 2, { dismissBanner: true });
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 10, y: 700 } });
  const invite = page.getByRole('banner', { name: 'Workspace tabs' }).getByRole('button', { name: '邀请', exact: true });
  await expect(invite).toHaveCSS('height', '28px');
  await expect(invite).toHaveCSS('width', '70px');
  await expect(invite).toHaveCSS('border-top-width', '1px');
  await mkdir(artifactRoot, { recursive: true });
  await page.mouse.move(800, 800);
  await invite.screenshot({ path: path.join(artifactRoot, 'header-invite-default.png') });
  await invite.hover();
  await invite.screenshot({ path: path.join(artifactRoot, 'header-invite-hover.png') });
  await page.keyboard.press('Tab');
  await invite.focus();
  const focusBox = await invite.boundingBox();
  if (!focusBox) throw new Error('Invite button has no bounds');
  await page.screenshot({ path: path.join(artifactRoot, 'header-invite-focus.png'), clip: { x: focusBox.x - 4, y: focusBox.y - 4, width: focusBox.width + 8, height: focusBox.height + 8 } });
  await invite.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('[P1] A06 menu reference interactions and dimensions', async ({ page }) => {
  const menu = await setup(page, 'owner', false, 2, { dismissBanner: true });
  await expect(menu).toHaveCSS('height', '192px');
  await expect(menu.getByTestId('workspace-switcher-list').getByRole('menuitem').first()).toHaveCSS('height', '32px');
  await mkdir(artifactRoot, { recursive: true });
  await page.mouse.move(1300, 800);
  await writeFile(path.join(artifactRoot, 'workspace-menu-metrics.json'), JSON.stringify(await menu.evaluate(e => ({r:e.getBoundingClientRect().toJSON(),children:[...e.children].map(x=>({class:x.className,r:x.getBoundingClientRect().toJSON(),padding:getComputedStyle(x).padding})),rows:[...e.querySelectorAll('[role=menuitem]')].map(x=>({r:x.getBoundingClientRect().toJSON(),padding:getComputedStyle(x).padding,line:getComputedStyle(x).lineHeight}))})), null, 2));
  await writeFile(path.join(artifactRoot, 'workspace-check-metrics.json'), JSON.stringify(await menu.locator('[aria-current=true] svg').evaluate(e => ({html:e.outerHTML,r:e.getBoundingClientRect().toJSON(),color:getComputedStyle(e).color,stroke:getComputedStyle(e).stroke,strokeWidth:getComputedStyle(e).strokeWidth,fill:getComputedStyle(e).fill,flex:getComputedStyle(e).flex})), null, 2));
  await menu.screenshot({ path: path.join(artifactRoot, 'workspace-menu-default.png') });
  const invite = menu.getByRole('menuitem', { name: /邀请/ });
  await invite.hover();
  await menu.screenshot({ path: path.join(artifactRoot, 'workspace-menu-hover.png') });
  await page.keyboard.press('Tab');
  await invite.focus();
  await menu.screenshot({ path: path.join(artifactRoot, 'workspace-menu-focus.png') });
  await page.setViewportSize({ width: 768, height: 844 });
  await waitForVisualStable(page);
  await ensureRailOpen(page);
  await expect(menu).toBeVisible();
  await writeFile(path.join(artifactRoot, 'workspace-menu-narrow-metrics.json'), JSON.stringify(await menu.evaluate(e => ({ rect: e.getBoundingClientRect().toJSON(), shell: document.querySelector('.entry')?.className, grid: getComputedStyle(document.querySelector('.entry')!).gridTemplateColumns, rail: document.querySelector('.entry-nav-rail')?.getBoundingClientRect().toJSON() })), null, 2));
  await menu.screenshot({ path: path.join(artifactRoot, 'workspace-menu-narrow.png') });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
});
