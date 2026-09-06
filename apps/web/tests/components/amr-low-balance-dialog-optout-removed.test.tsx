// @vitest-environment jsdom
//
// 红测 · 拆掉首页低余额弹窗底部的「不再提醒」勾选框(产品 2026-09-04 拍板)
//
// 这颗勾选框写的位被**项目页发送前**那道闸门的 soft 档共用,勾一次就把项目页的
// 升级卡也永久静音了。拆的是这颗开关,**不是这张弹窗** —— 下面的反向对照钉住
// 弹窗本体(标题、两个动作、右上角关闭)还在,免得整张删掉也照样绿。

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmrLowBalanceDialog } from '../../src/components/AmrLowBalanceDialog';

/** 真实用户机器上的那条裸数据;拆掉之后任何交互都不许再写它。 */
const LEGACY_OPTOUT_KEY = 'open-design:amr-low-balance-warn-optout:v1';

function renderDialog() {
  const onDecision = vi.fn();
  render(
    <AmrLowBalanceDialog
      balanceUsd="1.20"
      profile="prod"
      entrySource="home_low_balance_warn_recharge"
      metricsConsent={false}
      installationId={null}
      onDecision={onDecision}
    />,
  );
  return { onDecision };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('AmrLowBalanceDialog · 「不再提醒」已拆除', () => {
  it('底部不再渲染任何静音开关', () => {
    renderDialog();

    expect(screen.queryByTestId('amr-low-balance-dialog-optout')).toBeNull();
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(screen.queryByText("Don't ask again")).toBeNull();
  });

  it('走完一次决策不会往 localStorage 写静音位', () => {
    renderDialog();

    // 还留着开关的话,用户会勾它 —— 勾完再决策,断言仍然什么都没写。
    for (const box of Array.from(document.querySelectorAll('input[type="checkbox"]'))) {
      fireEvent.click(box);
    }
    fireEvent.click(screen.getByTestId('amr-low-balance-dialog-proceed'));

    expect(window.localStorage.getItem(LEGACY_OPTOUT_KEY)).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  // ⚠️ 没有这一条,「把整张弹窗删掉」也会让上面两条绿。
  it('反向对照:弹窗本体没被删 —— 标题、两个动作、关闭按钮都还在', () => {
    const { onDecision } = renderDialog();

    expect(screen.getByTestId('amr-low-balance-dialog')).toBeTruthy();
    expect(screen.getByText('Running low on allowance')).toBeTruthy();
    expect(screen.getByTestId('amr-low-balance-dialog-proceed').textContent)
      .toBe('Start anyway');
    expect(screen.getByTestId('amr-low-balance-dialog-recharge').textContent)
      .toBe('Top up');

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDecision).toHaveBeenCalledWith('dismiss');
  });

  it('反向对照:「继续发送」仍然把挂起的发送放行', () => {
    const { onDecision } = renderDialog();

    fireEvent.click(screen.getByTestId('amr-low-balance-dialog-proceed'));

    expect(onDecision).toHaveBeenCalledWith('proceed');
  });
});
