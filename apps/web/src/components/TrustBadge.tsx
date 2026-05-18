import type {
  MarketplaceTrust,
  TrustTier,
} from '@open-design/contracts';

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
  { label: string; description: string }
> = {
  official: {
    label: 'Official',
    description: 'Open Design official',
  },
  trusted: {
    label: 'Trusted',
    description: 'Community trusted',
  },
  restricted: {
    label: 'Restricted',
    description: 'Restricted source',
  },
};

export function TrustBadge({
  trust,
  label,
  className,
  variant = 'default',
}: Props) {
  const tier = normalizeTrustTier(trust);
  const meta = TRUST_META[tier];
  const text = label ?? meta.label;
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
      title={meta.description}
      aria-label={`${meta.description}: ${text}`}
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
