import { expect, test } from '@/playwright/suite';
import { registrationHost } from '@/playwright/members-registration';
import { T } from '@/timeouts';

// Hermetic daemon responses exercise the real shell. Real-account mail and
// database validation is separate; no credentials or fixed ports belong here.
test.use({ actionTimeout: T.medium, navigationTimeout: T.long });

for (const outcome of ['success', 'retry', 'skip'] as const) {
  test(`[P1] B12 B18 B19 registration invitation ${outcome} follows manual completion`, async ({ page }) => {
    const host = await registrationHost(page);
    await host.begin();
    await expect(host.form).toBeVisible({ timeout: T.long });
    let attempts = 0;
    await host.invite(route => {
      attempts += 1;
      return route.fulfill({ json: { results: outcome === 'success' ? [{ email: 'first@example.com', ok: true }] : attempts === 1 ? [
        { email: 'first@example.com', ok: true },
        { email: 'retry@example.com', ok: false, error: 'create_unreachable' },
      ] : [{ email: 'retry@example.com', ok: true }] } });
    });
    const inputs = host.form.locator('input[type=email]');
    await inputs.first().fill('first@example.com');
    if (outcome !== 'success') {
      await host.form.getByRole('button', { name: '添加成员', exact: true }).click();
      await inputs.nth(1).fill('retry@example.com');
      await host.form.locator('[aria-haspopup=listbox]').nth(1).click();
      await page.getByRole('option', { name: /管理员/ }).click();
    }
    await page.clock.install();
    await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
    const enter = host.form.getByRole('button', { name: '进入工作台', exact: true });
    if (outcome === 'success') await expect(enter).toBeVisible();
    else {
      await expect(inputs).toHaveCount(1);
      await expect(inputs).toHaveValue('retry@example.com');
      await expect(host.form.locator('[aria-haspopup=listbox]')).toHaveText('管理员');
    }
    await page.clock.runFor(1600);
    await expect(host.form).toBeVisible();
    await expect(page.locator('.od-toast')).toHaveCount(0);
    if (outcome === 'retry') {
      await host.form.getByRole('button', { name: '发送邀请', exact: true }).click();
      await expect(enter).toBeVisible();
      expect(host.invitationRequests).toHaveLength(2);
      expect(host.invitationRequests[1]).toMatchObject({ invites: [{ email: 'retry@example.com', role: 'admin' }] });
    } else expect(host.invitationRequests).toHaveLength(1);
    if (outcome === 'skip') await host.form.getByRole('button', { name: '暂时跳过', exact: true }).click();
    else await enter.click();
    await page.clock.runFor(300);
    await page.clock.resume();
    await expect(page.getByTestId('home-view')).toBeVisible({ timeout: T.long });
    await expect(host.form).toHaveCount(0);
    if (outcome === 'skip') await expect(page.getByRole('status').filter({ hasText: '已向 1 位同事发送邀请' })).toBeVisible();
    else await expect(page.locator('.od-toast')).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('home-view')).toBeVisible({ timeout: T.long });
    await expect(host.form).toHaveCount(0);
    expect(host.invitationRequests).toHaveLength(outcome === 'retry' ? 2 : 1);
  });
}
