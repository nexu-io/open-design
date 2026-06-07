import type {
  MarketplaceTrust,
  TrustTier,
} from '@open-design/contracts';
import { useI18n } from '../i18n';
import type { Dict } from '../i18n/types';

type TrustBadgeTrust = TrustTier | MarketplaceTrust;
type NormalizedTrustTier = 'official' | 'trusted' | 'restricted';

interface Props {
  trust: TrustBadgeTrust;
  label?: string;
  className?: string;
  variant?: 'default' | 'overlay';
}

const TRUST_META: Record<
  NormalizedTrustTier,
  { labelKey: keyof Dict; description: string; zhDescription: string }
> = {
  official: {
    labelKey: 'pluginsView.trust.official',
    description: 'Open Design official',
    zhDescription: 'Open Design 官方',
  },
  trusted: {
    labelKey: 'pluginsView.trust.trusted',
    description: 'Community trusted',
    zhDescription: '社区可信',
  },
  restricted: {
    labelKey: 'pluginsView.trust.restricted',
    description: 'Restricted source',
    zhDescription: '受限来源',
  },
};

export function TrustBadge({
  trust,
  label,
  className,
  variant = 'default',
}: Props) {
  const { locale, t } = useI18n();
  const tier = normalizeTrustTier(trust);
  const meta = TRUST_META[tier];
  const description = locale === 'zh-CN' ? meta.zhDescription : meta.description;
  const text = label ?? t(meta.labelKey);
  const classes = [
    'plugin-trust-badge',
    `plugin-trust-badge--${tier}`,
    variant === 'overlay' ? 'plugin-trust-badge--overlay' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      data-trust-tier={tier}
      data-trust-source={trust}
      title={description}
      aria-label={`${description}: ${text}`}
    >
      <span className="plugin-trust-badge__dot" aria-hidden />
      <span>{text}</span>
    </span>
  );
}

export function normalizeTrustTier(trust: TrustBadgeTrust): NormalizedTrustTier {
  if (trust === 'bundled' || trust === 'official') return 'official';
  if (trust === 'trusted') return 'trusted';
  return 'restricted';
}
