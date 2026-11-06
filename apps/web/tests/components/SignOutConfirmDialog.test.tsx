// @vitest-environment jsdom
//
// OPEND-4582: the sign-out dialog follows the 退出登录 design — the account
// variant asks "确认退出以下账号？" above the account card, and the plain
// variant asks "确定要退出登录吗？". Hover styling is pinned in the CSS module.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SignOutConfirmDialog } from '../../src/components/SignOutConfirmDialog';
import { I18nProvider } from '../../src/i18n';

function renderDialog(email?: string) {
  return render(
    <I18nProvider initial="zh-CN">
      <SignOutConfirmDialog email={email} onCancel={() => {}} onConfirm={() => {}} />
    </I18nProvider>,
  );
}

describe('SignOutConfirmDialog', () => {
  afterEach(cleanup);

  it('asks to sign out of the shown account when an email is known', () => {
    renderDialog('a@example.com');
    const dialog = screen.getByTestId('sign-out-confirm-dialog');
    expect(dialog.textContent).toContain('确认退出以下账号？');
    expect(dialog.textContent).toContain('a@example.com');
    expect(dialog.textContent).not.toContain('网页账号保持登录');
  });

  it('asks a plain confirmation without an account', () => {
    renderDialog();
    expect(screen.getByTestId('sign-out-confirm-dialog').textContent).toContain('确定要退出登录吗？');
  });
});
