import { useT } from '../i18n';
import type { LiveArtifactRefreshStatus, LiveArtifactStatus } from '../types';

interface Props {
  status: LiveArtifactStatus;
  refreshStatus: LiveArtifactRefreshStatus;
  className?: string;
  compact?: boolean;
}

export function LiveArtifactBadges({
  status,
  refreshStatus,
  className,
  compact = false,
}: Props) {
  const t = useT();
  const badges = [
    { key: 'live', label: t('designs.badgeLive') },
    refreshStatus === 'running'
      ? { key: 'refreshing', label: t('designs.statusRefreshing') }
      : null,
    refreshStatus === 'failed'
      ? { key: 'refresh-failed', label: t('designs.statusRefreshFailed') }
      : null,
    status === 'archived'
      ? { key: 'archived', label: t('designs.statusArchived') }
      : null,
  ].filter((badge): badge is { key: string; label: string } => Boolean(badge));

  return (
    <span
      className={`live-artifact-badges${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={t('designs.liveArtifactBadgesAria')}
    >
      {badges.map((badge) => (
        <span key={badge.key} className={`live-artifact-badge ${badge.key}`}>
          {badge.label}
        </span>
      ))}
    </span>
  );
}
