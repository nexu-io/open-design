import type {
  MarketplaceTrust,
  TrustTier,
} from '@open-design/contracts';
import { useT } from '../i18n';
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
  { labelKey: keyof Dict; descriptionKey: keyof Dict }
> = {
  official: {
    labelKey: 'trust.official',
    descriptionKey: 'trust.officialDescription',
  },
  trusted: {
    labelKey: 'trust.trusted',
    descriptionKey: 'trust.trustedDescription',
  },
  restricted: {
    labelKey: 'trust.restricted',
    descriptionKey: 'trust.restrictedDescription',
  },
};

export function TrustBadge({
  trust,
  label,
  className,
  variant = 'default',
}: Props) {
  const t = useT();
  const tier = normalizeTrustTier(trust);
  const meta = TRUST_META[tier];
  const description = t(meta.descriptionKey);
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
