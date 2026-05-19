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
  { description: keyof Dict; label: keyof Dict }
> = {
  official: {
    label: 'trust.official',
    description: 'trust.officialDescription',
  },
  trusted: {
    label: 'trust.trusted',
    description: 'trust.trustedDescription',
  },
  restricted: {
    label: 'trust.restricted',
    description: 'trust.restrictedDescription',
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
  const description = t(meta.description);
  const text = label ?? t(meta.label);
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
