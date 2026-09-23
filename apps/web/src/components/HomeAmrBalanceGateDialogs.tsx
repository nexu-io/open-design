import type { AmrWalletSnapshot } from '@open-design/contracts';

import { AmrBalanceDialog } from './AmrBalanceDialog';
import { AmrOwnerTopUpDialog } from './chat/AmrOwnerTopUpDialog';

/**
 * A hard block from the Home pre-run balance gate (empty wallet or signed
 * out). The dialog resolves the promise the submit handler is awaiting:
 * 'retry' (sign-in completed / recharge landed) re-runs the gate and continues
 * the very same create-and-run; 'dismiss' hands the composer back to the user.
 */
export interface HomeAmrBalanceGateBlock {
  reason: 'insufficient' | 'signed_out';
  /**
   * 哪一张弹窗 —— 身份的分支(规格 §6.V)。
   *
   * 这里曾经还挂着一条 `?? 'upgrade'` 的兜底,理由是「首页没有那张升级卡,
   * 『Max · owner 不弹窗』那一支落到首页会变成一片空白」。T58 之后那一支
   * 不存在了(owner 两格共用同一张会员转化弹窗),兜底随之删除 —— 它当时把
   * Max 所有者兜成了**转化弹窗 + 套餐页链接**,等于让他买一个已经在用的套餐。
   */
  dialog: 'upgrade' | 'ask_owner';
  /** 那张弹窗的主按钮去哪(T58);和 `dialog` 同一个 branch 快照算出来。 */
  upgradeIntent: 'pricing' | 'auto_recharge';
  snapshot: AmrWalletSnapshot;
  resolve: (decision: 'retry' | 'dismiss') => void;
}

interface Props {
  block: HomeAmrBalanceGateBlock | null;
  metricsConsent: boolean;
  installationId: string | null | undefined;
}

/**
 * Host for the Home balance-gate dialog. It is mounted by App rather than by
 * EntryShell because the gate now resolves behind the optimistic pending frame
 * (OPEND-2614): the Home send hands off to the project route on the click
 * tick, EntryShell unmounts with it, and the verdict — including this dialog —
 * lands over the pending frame. A dismiss rolls the hand-off back to Home.
 */
export function HomeAmrBalanceGateDialogs({ block, metricsConsent, installationId }: Props) {
  if (!block) return null;
  if (block.dialog === 'ask_owner') {
    /*
     * 没有账单权限的成员。原来这一档给的是 `AmrBalanceDialog`,而它的
     * 主按钮取自 `workspaceUpgradeUrl` —— 对这类成员返回 `null`,于是
     * 弹窗上只剩一颗「暂不需要」(§6.Y)。这张弹窗至少给得出一条路。
     */
    return <AmrOwnerTopUpDialog onClose={() => block.resolve('dismiss')} />;
  }
  return (
    <AmrBalanceDialog
      reason={block.reason}
      balanceUsd={block.snapshot.balanceUsd}
      profile={block.snapshot.profile}
      entrySource="home_balance_gate_upgrade"
      upgradeIntent={block.upgradeIntent}
      metricsConsent={metricsConsent}
      installationId={installationId}
      onClose={() => block.resolve('dismiss')}
      onResolved={() => block.resolve('retry')}
    />
  );
}
