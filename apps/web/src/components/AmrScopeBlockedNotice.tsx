import { Button } from '@open-design/components';

import { useT } from '../i18n';
import type { AmrWorkspaceScopeBlock } from '../runtime/amr-workspace-scope-gate';
import { AmrLoginPill } from './AmrLoginPill';
import { Icon } from './Icon';
import styles from './AmrScopeBlockedNotice.module.css';

interface Props {
  block: AmrWorkspaceScopeBlock;
  metricsConsent: boolean;
  installationId: string | null | undefined;
  /** Re-read `GET /api/projects/:id/workspace-scope` — the `unresolved` remedy. */
  onRetryWorkspaceScope?: () => void;
}

/**
 * The reason an Open Design Cloud send is held closed, rendered where the user
 * is already looking: directly above the composer they just typed into.
 *
 * It explains, it does not unblock. The send button stays disabled either way —
 * `ProjectView.currentConversationSendDisabled` owns that, and this notice never
 * participates in it. Its whole job is to replace a dead grey button with a
 * sentence plus the one action that clears the block:
 *
 *   signed_out  — the same in-app sign-in Home's balance gate uses
 *                 (`AmrLoginPill` + `chat.amrBalanceGate.signInCta`), so a user
 *                 who lands here from either surface performs one identical
 *                 action. Signing in fires the workspace-context refresh, the
 *                 project scope revalidates, and the composer reopens on its own.
 *   unresolved  — the session is not the missing piece, so the remedy is a
 *                 re-read of the project's workspace authority. Offering an
 *                 account action here would be a guess.
 *
 * Deliberately not a dialog: the blocked state persists for as long as the
 * authority is unknown, and a modal would have to be dismissed before the user
 * could even see the composer it is talking about.
 */
export function AmrScopeBlockedNotice({
  block,
  metricsConsent,
  installationId,
  onRetryWorkspaceScope,
}: Props) {
  const t = useT();
  const signedOut = block.kind === 'signed_out';
  return (
    <div
      className={styles.notice}
      data-testid="amr-scope-blocked-notice"
      role="status"
    >
      <span className={styles.icon} aria-hidden>
        <Icon name="alert-triangle" size={14} />
      </span>
      <p className={styles.message}>
        {signedOut
          ? t('chat.amrScopeGate.signedOutMessage')
          : t('chat.amrScopeGate.unresolvedMessage')}
      </p>
      <div className={styles.action}>
        {signedOut ? (
          <AmrLoginPill
            className={styles.signInPill}
            signInLabel={t('chat.amrBalanceGate.signInCta')}
            amrEntrySourceDetail="chat_balance_gate_sign_in"
            metricsConsent={metricsConsent}
            installationId={installationId}
            showActivationDetails
            hideSignedOutStatus
            revealPendingCancelAction
          />
        ) : onRetryWorkspaceScope ? (
          <Button
            variant="subtle"
            className={styles.retry}
            onClick={onRetryWorkspaceScope}
            data-testid="amr-scope-blocked-retry"
          >
            {t('promptTemplates.retry')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
