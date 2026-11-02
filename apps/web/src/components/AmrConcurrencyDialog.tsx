import { useWorkspaceJourney } from '../analytics/use-workspace-journey';
import { workspaceAnalyticsDimensions } from '../analytics/workspace';
import type { WorkspaceJourneySurfaceProps } from '@open-design/contracts/analytics';
import { Button, Dialog } from '@open-design/components';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { useT } from '../i18n';
import type { AmrBalanceBranch } from '../runtime/amr-balance-branch';
import { workspaceUpgradeUrl } from './EntryNavRail';
import { Icon } from './Icon';
import frame from './AmrBalanceDialog.module.css';
import styles from './AmrConcurrencyDialog.module.css';

/** A real Link request rejection, never a local task-slot reservation. Closing
 * or changing plans only dismisses the notice; sending again is always manual. */
export function AmrConcurrencyDialog({ branch, workspaceContext, profile, consoleOrigin, upgradeAllowed = true, pageName = 'chat_panel', stage = 'unknown', onClose }: {
  pageName?: 'home' | 'chat_panel';
  stage?: WorkspaceJourneySurfaceProps['stage'];
  branch: AmrBalanceBranch;
  upgradeAllowed?: boolean;
  workspaceContext: WorkspaceCollabContext | null;
  profile?: string | null;
  consoleOrigin?: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const journey = useWorkspaceJourney({ page_name: pageName, area: 'concurrency_limit_dialog', reason: 'concurrency_limit', stage, ...workspaceAnalyticsDimensions(workspaceContext) });
  const close = () => { journey.click('close'); onClose(); };
  const upgradeUrl = upgradeAllowed && branch.audience === 'owner' && branch.tier !== 'max' && workspaceContext
    ? workspaceUpgradeUrl(workspaceContext, null, { fallbackProfile: profile, consoleOrigin }) : null;
  const isMax = branch.tier === 'max';
  const memberNotice = branch.audience === 'member';
  const benefits = [
    t('chat.amrConcurrencyGate.benefit1'),
    t('chat.amrConcurrencyGate.benefit2'),
    t('chat.amrConcurrencyGate.benefit3'),
    t('chat.amrConcurrencyGate.benefit4'),
  ];
  return (
    <Dialog className={`${frame.panel} ${frame.frozenPanel} ${styles.offerPanel}`} backdropClassName={frame.frozenBackdrop} onClose={close} closeOnEscape
      ariaLabelledBy="amr-concurrency-title" data-testid="amr-concurrency-dialog">
      <div className={frame.banner}>
        <img className={frame.bannerImage} src="/upgrade/cloud-signin-aurora.jpg"
          width={1680} height={720} alt="" decoding="async" draggable={false} />
      </div>
      <Button variant="ghost" className={frame.closeButton} onClick={close} aria-label={t('common.close')}>
        <Icon name="close" size={14} />
      </Button>
      <h2 id="amr-concurrency-title" className={frame.title}>
        {t(isMax ? 'chat.amrConcurrencyGate.maxTitle'
          : memberNotice ? 'chat.amrConcurrencyGate.teamTitle'
          : upgradeUrl ? 'chat.amrConcurrencyGate.title' : 'chat.runError.title.membershipConcurrencyLimit')}
      </h2>
      <p className={`${frame.message}${upgradeUrl ? '' : ` ${frame.memberMessage}`}`}>{t(isMax
        ? 'chat.amrConcurrencyGate.maxMessage'
        : upgradeUrl ? 'chat.amrConcurrencyGate.message'
        : branch.audience === 'member'
          ? 'chat.amrConcurrencyGate.teamMessage'
          : 'chat.runError.membershipConcurrencyLimitMessageNoTime')}</p>
      {upgradeUrl ? <div className={frame.benefitsCard}>
        <span className={`${frame.benefitsTitle} ${styles.benefitsTitle}`}>{t('chat.amrBalanceGate.benefitsTitle')}</span>
        <ul className={frame.benefits}>
          {benefits.map((benefit) => <li key={benefit} className={frame.benefit}>
            <span className={styles.benefitIcon} aria-hidden><Icon name="check" size={14} /></span>
            {benefit}
          </li>)}
        </ul>
      </div> : null}
      <div className={frame.actions}>
        <Button variant={upgradeUrl ? 'ghost' : 'primary'}
          className={upgradeUrl ? `${frame.later} ${styles.laterButton}`
            : `${frame.cta} ${styles.noticeButton}`}
          onClick={close} data-testid="amr-concurrency-close">
          {t(upgradeUrl ? 'chat.amrBalanceGate.laterCta'
            : isMax || memberNotice ? 'chat.amrBalanceOwner.dismissCta' : 'common.close')}
        </Button>
        {upgradeUrl ? <Button className={`${frame.cta} ${styles.upgradeButton}`}
          onClick={() => { journey.click('upgrade'); window.open(upgradeUrl, '_blank', 'noopener,noreferrer'); }}
          data-testid="amr-concurrency-upgrade">{t('chat.amrBalanceGate.plansCta')}</Button> : null}
      </div>
    </Dialog>
  );
}
