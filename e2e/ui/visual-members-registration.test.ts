import { expect, test } from '@/playwright/suite';
import { captureRegistration, registrationHost, NEW_ACCOUNT_ID, NEW_AUTHORIZATION_ID } from '@/playwright/members-registration';
import { T } from '@/timeouts';
import type { Page } from '@playwright/test';

test.use({ actionTimeout: T.medium, navigationTimeout: T.long });
async function start(page: Page) {
  const host = await registrationHost(page);
  await host.begin();
  await expect(host.form).toBeVisible({ timeout: T.long });
  return host;
}
async function pauseSuccessTimer(page: Page) {
  await page.clock.install({ time: new Date('2026-10-20T03:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-20T03:00:01Z'));
}

test('[P1] registration invitation sentences wrap and remain centered in every language', async ({ page }, testInfo) => {
  await start(page);
  const panel = page.locator('div[role=region] > section').filter({ has: page.locator('input[type=email]') });
  const language = panel.locator('footer select');
  const heading = panel.locator('header h2');
  const description = panel.locator('header + p');
  for (const size of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    for (const locale of ['en', 'id', 'de', 'zh-CN', 'zh-TW', 'pt-BR', 'es-ES', 'ru', 'fa', 'ar', 'ja', 'ko', 'pl', 'hu', 'fr', 'uk', 'tr', 'th', 'it']) {
      await language.selectOption(locale);
      if (locale !== 'en') {
        await expect(heading).not.toHaveText('Invite colleagues for free. Design together.');
      }
      if (locale === 'ja' || locale === 'ar') {
        const copy = locale === 'ja'
          ? { send: '招待を送信', add: 'メンバーを追加', skip: '今はスキップ', role: '役割' }
          : { send: 'إرسال الدعوات', add: 'إضافة عضو', skip: 'التخطي الآن', role: 'الدور' };
        for (const name of Object.values(copy)) {
          await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
        }
      }
      await expect(heading).toHaveCSS('text-align', 'center');
      await expect(description).toHaveCSS('text-align', 'center');
      await expect(heading.locator('span')).toHaveCount(locale.startsWith('zh') ? 1 : 2);
      await expect(description.locator('span')).toHaveCount(locale.startsWith('zh') ? 2 : 3);
      for (const text of [heading, description]) {
        const bounds = await text.evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth }));
        expect(bounds.scroll, `${locale} text at ${size.width}px`).toBeLessThanOrEqual(bounds.width);
      }
      if (['en', 'zh-CN', 'ar', 'ja'].includes(locale)) {
        await testInfo.attach(`invite-${locale}-${size.width}`, { body: await page.screenshot(), contentType: 'image/png' });
      }
    }
  }
});

test('[P1] B01 only the new-registration signal enters the real invitation host', async ({ page }) => {
  const host = await start(page);
  await expect(host.form.getByRole('heading')).toHaveText('免费邀请同事，一起做设计');
  await expect(host.form.locator('input[type=email]')).toHaveCount(1);
  await expect(host.form.getByRole('button', { name: '取消' })).toHaveCount(0);
  await expect(host.form.getByRole('button', { name: '暂时跳过' })).toBeVisible();
  expect(host.loginCalls).toBe(1);
  expect(host.invitationRequests).toEqual([]);
  await captureRegistration(page, 'B01');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(host.form.locator('img')).toBeHidden();
  expect(await host.form.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).scrollIntoViewIfNeeded();
  await expect(host.form.getByRole('button', { name: '发送邀请', exact: true })).toBeVisible();
  await host.form.getByRole('button', { name: '暂时跳过' }).scrollIntoViewIfNeeded();
  await expect(host.form.getByRole('button', { name: '暂时跳过' })).toBeVisible();
  await host.form.locator('[aria-haspopup=listbox]').click();
  await expect(page.getByRole('option', { name: /管理员/ })).toBeVisible();
  const menuRect = await page.getByRole('listbox').boundingBox();
  expect(menuRect).not.toBeNull();
  expect(menuRect!.x).toBeGreaterThanOrEqual(0);
  expect(menuRect!.x + menuRect!.width).toBeLessThanOrEqual(390);
  expect(menuRect!.y + menuRect!.height).toBeLessThanOrEqual(844);
  await captureRegistration(page, 'B01-narrow');
});

test('[P1] B01 invitation layout stays usable at Windows scaled and narrow sizes', async ({ page }) => {
  const host = await start(page);
  await page.setViewportSize({ width: 1268, height: 715 });
  const input = host.form.locator('input[type=email]').first();
  const role = host.form.getByRole('button', { name: '角色', exact: true }).first();
  const inputBox = await input.boundingBox();
  const roleBox = await role.boundingBox();
  expect(inputBox).not.toBeNull(); expect(roleBox).not.toBeNull();
  expect(inputBox!.height).toBe(48);
  expect(roleBox!.height).toBe(inputBox!.height);
  expect(roleBox!.y).toBe(inputBox!.y);
  const expectFooterAtBottom = async () => {
    const footer = host.form.locator('section > footer');
    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();
    const bottomGap = page.viewportSize()!.height - footerBox!.y - footerBox!.height;
    // scrollTop rounds to whole pixels while text geometry can be fractional.
    expect(bottomGap).toBeGreaterThanOrEqual(23);
    expect(bottomGap).toBeLessThanOrEqual(41);
    const skipBox = await host.form.getByRole('button', { name: '暂时跳过' }).boundingBox();
    expect(footerBox!.y).toBeGreaterThanOrEqual(skipBox!.y + skipBox!.height);
  };
  await expectFooterAtBottom();
  const language = host.form.locator('section > footer select');
  // Keep the shared select chevron when applying the local transparent fill.
  await expect(language).not.toHaveCSS('background-image', 'none');
  await expect(language).toHaveCSS('background-size', '12px 12px');
  await expect(language).toHaveCSS('background-position', 'calc(100% - 12px) 50%');
  await expect(language).toHaveCSS('padding-right', '32px');
  await captureRegistration(page, 'B01-scaled');
  await role.click();
  await expect(page.getByRole('option', { name: /管理员/ })).toBeVisible();
  await captureRegistration(page, 'B01-scaled-role');
  await page.keyboard.press('Escape');
  for (let index = 1; index < 5; index++) await host.form.getByRole('button', { name: '添加成员' }).click();
  await expect(host.form.locator('input[type=email]').last()).toBeFocused();
  expect(await host.form.locator('[data-invite-rows]').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect.poll(async () => {
    const rowsBox = await host.form.locator('[data-invite-rows]').boundingBox();
    const lastBox = await host.form.locator('input[type=email]').last().boundingBox();
    return lastBox!.y + lastBox!.height <= rowsBox!.y + rowsBox!.height;
  }).toBe(true);
  await expectFooterAtBottom();
  await captureRegistration(page, 'B01-scaled-rows');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(host.form.locator('img')).toBeHidden();
  expect(await host.form.evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(390);
  await host.form.getByRole('button', { name: '暂时跳过' }).scrollIntoViewIfNeeded();
  await expect(host.form.getByRole('button', { name: '暂时跳过' })).toBeInViewport();
  await captureRegistration(page, 'B01-scaled-narrow');
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(host.form.locator('section')).toHaveCSS('padding-bottom', '24px');
  await host.form.locator('section > footer').scrollIntoViewIfNeeded();
  await host.form.locator('section').evaluate(panel => { panel.scrollTop = panel.scrollHeight; });
  await expectFooterAtBottom();
  await expect(host.form.locator('section > footer select')).toBeInViewport();
  await captureRegistration(page, 'B01-short-narrow-footer');
  await language.selectOption('en');
  await expect(page.getByRole('combobox')).toHaveValue('en');
  await page.getByRole('combobox').selectOption('zh-CN');
  await expect(language).toHaveValue('zh-CN');
});

test('[P1] OPEND-4321 new member registration keeps the role text clear of the email field', async ({ page }) => {
  const host = await registrationHost(page, { role: 'member' });
  await host.begin();
  await expect(host.form).toBeVisible({ timeout: T.long });
  await expect(host.form.getByRole('button', { name: '角色', exact: true })).toHaveCount(0);
  const email = host.form.locator('input[type=email]').first();
  const member = host.form.getByText('成员', { exact: true });
  await expect(member).toBeVisible();
  await expect(member).toHaveCSS('border-top-width', '0px');
  await expect(member).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(member).toHaveCSS('font-size', '13px');
  const inputBox = await email.boundingBox();
  const textBox = await member.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, height: rect.height };
  });
  // Confirmed OPEND-4321: B03 plain text aligned with the role label,
  // retaining the registration layout's clear separation from the email.
  expect(textBox.x - (inputBox!.x + inputBox!.width)).toBe(21);
  await captureRegistration(page, 'OPEND-4321-new-member-spacing');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(member).toBeVisible();
  const narrowInput = await email.boundingBox();
  const narrowRole = await member.boundingBox();
  expect(narrowRole!.x).toBeGreaterThanOrEqual(narrowInput!.x + narrowInput!.width + 8);
  await captureRegistration(page, 'OPEND-4321-new-member-narrow');
  await host.invite(async route => {
    await route.fulfill({ json: { results: [{ email: 'colleague@example.com', ok: true }] } });
  });
  await email.fill('colleague@example.com');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect.poll(() => host.invitationRequests.length).toBe(1);
  expect(host.invitationRequests[0]).toMatchObject({ invites: [{ email: 'colleague@example.com', role: 'member' }] });
});

test('[P1] OPEND-4343 added invitation rows stay clean until submission', async ({ page }) => {
  const host = await start(page);
  const emails = host.form.locator('input[type=email]');
  await emails.first().fill('first@example.com');
  await host.form.getByRole('button', { name: '添加成员' }).click();
  await expect(host.form.getByRole('alert')).toHaveCount(0);
  await captureRegistration(page, 'OPEND-4343-added-clean-row');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(emails.nth(1)).toHaveAttribute('aria-invalid', 'true');
  await expect(host.form.getByRole('alert')).toHaveCount(1);
  expect(host.invitationRequests).toEqual([]);
  await captureRegistration(page, 'OPEND-4343-submit-validation');
  await host.form.getByRole('button', { name: '添加成员' }).click();
  await expect(emails.nth(2)).not.toHaveAttribute('aria-invalid', 'true');
  await expect(host.form.getByRole('alert')).toHaveCount(1);
});

test('[P1] B04 multiple rows retain independent roles and can be removed', async ({ page }) => {
  const host = await start(page);
  await host.form.getByRole('button', { name: '添加成员' }).click();
  const inputs = host.form.locator('input[type=email]');
  await expect(inputs.nth(1)).toBeFocused();
  await inputs.nth(0).fill('mika@example.com'); await inputs.nth(1).fill('lee@example.com');
  await captureRegistration(page, 'B04');
  await host.form.locator('[aria-haspopup=listbox]').nth(0).click();
  await page.getByRole('option', { name: /管理员/ }).click();
  await expect(host.form.locator('[aria-haspopup=listbox]').nth(0)).toHaveText('管理员');
  await expect(host.form.locator('[aria-haspopup=listbox]').nth(1)).toHaveText('成员');
  await host.form.getByRole('button', { name: /移除/ }).nth(1).click();
  await expect(inputs).toHaveCount(1); await expect(inputs).toHaveValue('mika@example.com');
});

test('[P1] B05 invalid email is editable and never sent', async ({ page }) => {
  const host = await start(page);
  await host.form.locator('input[type=email]').fill('invalid-email');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.getByRole('alert')).toContainText('邮箱格式');
  await expect(host.form.locator('input[type=email]')).toHaveValue('invalid-email');
  expect(host.invitationRequests).toEqual([]);
  await captureRegistration(page, 'B05');
});

test('[P1] B06 only the later duplicate row is marked until corrected', async ({ page }) => {
  const host = await start(page);
  await host.form.getByRole('button', { name: '添加成员' }).click();
  const inputs = host.form.locator('input[type=email]');
  await inputs.nth(0).fill('lee@example.com'); await inputs.nth(1).fill('lee@example.com');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(inputs.nth(0)).toHaveAttribute('aria-invalid', 'false');
  await expect(inputs.nth(1)).toHaveAttribute('aria-invalid', 'true');
  expect(host.invitationRequests).toEqual([]);
  await captureRegistration(page, 'B06');
  await inputs.nth(1).fill('corrected@example.com');
  await expect(inputs.nth(1)).toHaveAttribute('aria-invalid', 'false');
});

test('[P1] B07 existing member error remains local to the editable row', async ({ page }) => {
  const host = await start(page);
  await host.invite(route => route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: false, error: 'already_member' }] } }));
  await host.form.locator('input[type=email]').fill('mika@example.com');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.getByText('此邮箱已是工作空间成员，无需邀请')).toBeVisible();
  await expect(host.form.locator('input[type=email]')).toBeEditable();
  await captureRegistration(page, 'B07');
  await host.form.locator('input[type=email]').fill('corrected@example.com');
  await expect(host.form.getByText('此邮箱已是工作空间成员，无需邀请')).toHaveCount(0);
});

test('[P1] B08 pending request prevents repeat submits and skip', async ({ page }) => {
  const host = await start(page);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await host.invite(async route => { await gate; await route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: false, error: 'create_unreachable' }, { email: 'lee@example.com', ok: false, error: 'create_unreachable' }] } }); });
  try {
    await host.form.getByRole('button', { name: '添加成员' }).click();
    await host.form.locator('input[type=email]').nth(0).fill('mika@example.com');
    await host.form.locator('input[type=email]').nth(1).fill('lee@example.com');
    await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
    await expect(host.form.getByRole('button', { name: /正在发送/ })).toBeDisabled();
    await expect(host.form.getByRole('button', { name: '暂时跳过' })).toBeDisabled();
    expect(host.invitationRequests).toHaveLength(1);
    await captureRegistration(page, 'B08');
  } finally { release(); }
});

test('[P1] B09 B18 success counts down, fades and enters once without a duplicate toast', async ({ page }) => {
  const host = await start(page);
  await host.invite(route => route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: true }, { email: 'lee@example.com', ok: true }] } }));
  await host.form.getByRole('button', { name: '添加成员' }).click();
  await host.form.locator('input[type=email]').nth(0).fill('mika@example.com');
  await host.form.locator('input[type=email]').nth(1).fill('lee@example.com');
  await pauseSuccessTimer(page);
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.getByRole('heading', { name: '邀请已发送' })).toBeVisible();
  await expect(host.form.getByText('3s 后自动进入')).toBeVisible();
  await captureRegistration(page, 'B09', true);
  await page.clock.runFor(1000);
  await expect(host.form.getByText('2s 后自动进入')).toBeVisible();
  await page.clock.runFor(1000);
  await expect(host.form.getByText('1s 后自动进入')).toBeVisible();
  await page.clock.runFor(1000);
  await expect(host.form).toBeVisible();
  await page.clock.runFor(180);
  await expect(host.form).toHaveCount(0);
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '已向 2 位同事发送邀请' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => localStorage.getItem(key), `od.registration-invite.completed:${NEW_ACCOUNT_ID}:${NEW_AUTHORIZATION_ID}`)).toBe('1');
  await captureRegistration(page, 'B18', true);
  await page.clock.resume();
});

test('[P1] B11 failed batch preserves every recipient and retry sends only one request', async ({ page }) => {
  const host = await start(page);
  let attempts = 0;
  await host.invite(route => { attempts += 1; return route.fulfill({ status: 503, json: { error: 'fixture_unavailable' } }); });
  await host.form.getByRole('button', { name: '添加成员' }).click();
  const inputs = host.form.locator('input[type=email]');
  await inputs.nth(0).fill('mika@example.com'); await inputs.nth(1).fill('lee@example.com');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.getByRole('alert')).toContainText('邀请发送失败，请检查网络后重试');
  await expect(inputs).toHaveCount(2); await expect(inputs.nth(0)).toHaveValue('mika@example.com'); await expect(inputs.nth(1)).toHaveValue('lee@example.com');
  await expect(host.form.getByRole('button', { name: '发送邀请', exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
  await captureRegistration(page, 'B11');
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
});

test('[P1] B12 B19 partial success keeps only failure and skip reports actual cumulative count', async ({ page }) => {
  const host = await start(page);
  await host.invite(route => route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: true }, { email: 'lee@example.com', ok: false, error: 'active_pending_invite' }] } }));
  await host.form.getByRole('button', { name: '添加成员' }).click();
  await host.form.locator('input[type=email]').nth(0).fill('mika@example.com'); await host.form.locator('input[type=email]').nth(1).fill('lee@example.com');
  await pauseSuccessTimer(page);
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.locator('input[type=email]')).toHaveCount(1);
  await expect(host.form.locator('input[type=email]')).toHaveValue('lee@example.com');
  await expect(host.form.getByText('此邮箱已有待接受的邀请，可在成员页重新发送')).toBeVisible();
  await expect(host.form.getByRole('button', { name: '已邀请 1 位同事' })).toBeDisabled();
  await captureRegistration(page, 'B12-transient', true);
  await page.clock.runFor(650);
  await page.clock.resume();
  await expect(host.form.getByRole('button', { name: '发送邀请', exact: true })).toBeEnabled();
  await captureRegistration(page, 'B12');
  await host.form.getByRole('button', { name: '暂时跳过' }).click();
  await expect(host.form).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '已向 1 位同事发送邀请' })).toBeVisible();
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
  await captureRegistration(page, 'B19');
  const toast = page.getByRole('status').filter({ hasText: '已向 1 位同事发送邀请' });
  await expect(toast).toHaveCSS('top', '64px');
  await toast.getByRole('button').click();
  await expect(toast).toHaveCount(0);
});

test('[P1] B13 skip without confirmed success shows home banner and consumes onboarding once', async ({ page }) => {
  const host = await start(page);
  await host.form.getByRole('button', { name: '暂时跳过' }).click();
  await expect(host.form).toHaveCount(0);
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toBeVisible();
  expect(host.invitationRequests).toEqual([]);
  expect(await page.evaluate(key => localStorage.getItem(key), `od.registration-invite.completed:${NEW_ACCOUNT_ID}:${NEW_AUTHORIZATION_ID}`)).toBe('1');
  expect(await page.evaluate(key => localStorage.getItem(key), `od.invitation-banner.dismissed:${NEW_ACCOUNT_ID}`)).toBeNull();
  await captureRegistration(page, 'B13');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(host.form).toHaveCount(0);
});

for (const existingSetup of [true, false]) {
  test(`[P1] existing account skips registration invitation with setup=${existingSetup}`, async ({ page }) => {
    const host = await registrationHost(page, { account: { id: 'existing-account' }, existingSetup });
    await host.begin();
    await expect(page.getByTestId('home-view')).toBeVisible({ timeout: T.long });
    await expect(host.form).toHaveCount(0);
    expect(host.invitationRequests).toEqual([]);
  });
}

test('[P1] mismatched registration receipt never grants another account the invitation step', async ({ page }) => {
  const host = await registrationHost(page, { account: { id: 'existing-account', receipt: { accountId: 'different-account', deviceAuthorizationId: 'different-authorization' } } });
  await host.begin();
  await expect(page.getByTestId('home-view')).toBeVisible({ timeout: T.long });
  await expect(host.form).toHaveCount(0);
});

test('[P1] completed registration does not leak or reappear across account switch and restart', async ({ page }) => {
  const host = await start(page);
  await host.form.getByRole('button', { name: '暂时跳过' }).click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  await host.changeAccount({ id: 'second-existing-account' });
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(host.form).toHaveCount(0);
  await host.changeAccount({ id: NEW_ACCOUNT_ID, receipt: { accountId: NEW_ACCOUNT_ID, deviceAuthorizationId: NEW_AUTHORIZATION_ID } });
  await expect(page.getByTestId('home-view')).toBeVisible();
  await expect(host.form).toHaveCount(0);
  expect(host.invitationRequests).toEqual([]);
});


test('[P1] unfinished registration survives reload without another login or lost receipt', async ({ page }) => {
  const host = await start(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(host.form).toBeVisible({ timeout: T.long });
  await expect(host.form.getByRole('heading')).toHaveText('免费邀请同事，一起做设计');
  expect(host.loginCalls).toBe(1);
  expect(host.invitationRequests).toEqual([]);
});

test('[P1] completed account does not suppress a separate new account receipt', async ({ page }) => {
  const host = await start(page);
  await host.form.getByRole('button', { name: '暂时跳过' }).click();
  await expect(page.getByTestId('home-view')).toBeVisible();
  await host.changeAccount({ id: '33333333-3333-4333-8333-333333333333', receipt: { accountId: '33333333-3333-4333-8333-333333333333', deviceAuthorizationId: '44444444-4444-4444-8444-444444444444' } });
  await expect(host.form).toBeVisible({ timeout: T.long });
});

async function expectNoCompletionOrDismissal(page: Page, id: string, authorization: string) {
  const completion = `od.registration-invite.completed:${encodeURIComponent(id)}:${encodeURIComponent(authorization)}`;
  const dismissal = `od.invitation-banner.dismissed:${encodeURIComponent(id)}`;
  expect(await page.evaluate(keys => keys.map(key => localStorage.getItem(key)), [completion, dismissal])).toEqual([null, null]);
}

test('[P1] account change during send aborts old success without dismissing the next account', async ({ page }) => {
  const host = await start(page);
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let settled = false;
  await host.invite(async route => { await gate; try { await route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: true }] } }); } finally { settled = true; } });
  try {
    await host.form.locator('input[type=email]').fill('mika@example.com');
    await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
    await expect(host.form.getByRole('button', { name: /正在发送/ })).toBeDisabled();
    await host.changeAccount({ id: 'second-existing-account' }, false);
    await expect(host.form).toHaveCount(0);
    await expect(page.getByTestId('home-view')).toBeVisible({ timeout: T.long });
    release(); await expect.poll(() => settled).toBe(true);
    await page.clock.fastForward(2000);
    await expect(page.getByRole('status').filter({ hasText: /已向.*位同事发送邀请/ })).toHaveCount(0);
    await expectNoCompletionOrDismissal(page, NEW_ACCOUNT_ID, NEW_AUTHORIZATION_ID);
    await expectNoCompletionOrDismissal(page, 'second-existing-account', NEW_AUTHORIZATION_ID);
    await expect(page.getByRole('region', { name: '邀请', exact: true })).toBeVisible();
  } finally { release(); }
});

for (const success of [false, true]) {
  test(`[P1] pending finish fresh identity read cannot consume switched account success=${success}`, async ({ page }) => {
    const host = await start(page);
    await page.clock.install();
    const held = host.holdNextFresh();
    try {
      if (success) {
        await host.invite(route => route.fulfill({ json: { results: [{ email: 'mika@example.com', ok: true }] } }));
        await host.form.locator('input[type=email]').fill('mika@example.com');
        await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
        await expect(host.form.getByRole('heading', { name: '邀请已发送' })).toBeVisible();
  await expect(host.form.getByText(/已向 2 位同事发送邀请/)).toBeVisible();
        await page.clock.fastForward(1000);
      } else await host.form.getByRole('button', { name: '暂时跳过' }).click();
      await expect.poll(() => held.opened, { timeout: T.long }).toBe(true);
      await host.changeAccount({ id: 'second-existing-account' }, false);
      await expect(host.form).toHaveCount(0);
      await expect(page.getByTestId('home-view')).toBeVisible({ timeout: T.long });
      held.release(); await held.settled;
      await page.clock.fastForward(2000);
      await expectNoCompletionOrDismissal(page, NEW_ACCOUNT_ID, NEW_AUTHORIZATION_ID);
      await expectNoCompletionOrDismissal(page, 'second-existing-account', NEW_AUTHORIZATION_ID);
      await expect(page.getByRole('status').filter({ hasText: /已向.*位同事发送邀请/ })).toHaveCount(0);
      await expect(page.getByRole('region', { name: '邀请', exact: true })).toBeVisible();
    } finally { held.release(); }
  });
}


for (const failure of ['forbidden', 'workspace', 'member', 'permission'] as const) {
  test(`[P1] registration fresh context ${failure} fails closed and recovers only after exact verification`, async ({ page }) => {
    const host = await registrationHost(page, { contextFailure: failure });
    await host.begin();
    const recovery = page.getByRole('alert').filter({ has: page.getByRole('button', { name: /重试|Retry/ }) });
    await expect(recovery).toBeVisible({ timeout: T.long });
    await expect(host.form).toHaveCount(0);
    expect(host.invitationRequests).toEqual([]);
    expect(host.verifiedContextRequests.length).toBeGreaterThan(0);
    for (const headers of host.verifiedContextRequests) {
      expect(headers['x-od-workspace-id']).toBe(`${NEW_ACCOUNT_ID}-workspace`);
      expect(headers['x-od-workspace-member-id']).toBe(`${NEW_ACCOUNT_ID}-member`);
    }
    await expectNoCompletionOrDismissal(page, NEW_ACCOUNT_ID, NEW_AUTHORIZATION_ID);
    host.restoreContext();
    await recovery.getByRole('button', { name: /重试|Retry/ }).click();
    await expect(host.form).toBeVisible({ timeout: T.long });
    expect(host.invitationRequests).toEqual([]);
  });
}


test('[P1] registration partial retry sends failed recipient only and completes with cumulative two successes', async ({ page }) => {
  const host = await start(page);
  const bodies: unknown[] = [];
  await host.invite(route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ json: { results: bodies.length === 1
      ? [{ email: 'mika@example.com', ok: true }, { email: 'lee@example.com', ok: false, error: 'active_pending_invite' }]
      : [{ email: 'lee@example.com', ok: true }] } });
  });
  await host.form.getByRole('button', { name: '添加成员' }).click();
  await host.form.locator('input[type=email]').nth(0).fill('mika@example.com');
  await host.form.locator('input[type=email]').nth(1).fill('lee@example.com');
  await pauseSuccessTimer(page);
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.locator('input[type=email]')).toHaveCount(1);
  await expect(host.form.locator('input[type=email]')).toHaveValue('lee@example.com');
  await expect(host.form.getByRole('button', { name: '已邀请 1 位同事' })).toBeDisabled();
  await page.clock.runFor(650);
  await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
  await expect(host.form.getByRole('heading', { name: '邀请已发送' })).toBeVisible();
  await expect(host.form.getByText(/已向 2 位同事发送邀请/)).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(JSON.stringify(bodies[1])).toContain('lee@example.com');
  expect(JSON.stringify(bodies[1])).not.toContain('mika@example.com');
  await page.clock.runFor(3180); await page.clock.resume();
  await expect(host.form).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '已向 2 位同事发送邀请' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '邀请', exact: true })).toHaveCount(0);
});
