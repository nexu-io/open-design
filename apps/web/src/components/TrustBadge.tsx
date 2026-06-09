import type {
  MarketplaceTrust,
  TrustTier,
} from '@open-design/contracts';
import { useT } from '../i18n';

type TrustBadgeTrust = TrustTier | MarketplaceTrust;
type NormalizedTrustTier = 'official' | 'trusted' | 'restricted';

const TRUST_LABEL_KEY = {
  official: 'pluginsView.trust.official',
  trusted: 'pluginsView.trust.trusted',
  restricted: 'pluginsView.trust.restricted',
} as const;

interface Props {
  trust: TrustBadgeTrust;
  label?: string;
  className?: string;
  variant?: 'default' | 'overlay';
}

export function TrustBadge({
  trust,
  label,
  className,
  variant = 'default',
}: Props) {
  const t = useT();
  const tier = normalizeTrustTier(trust);
  // The visible label AND the tooltip / screen-reader text all resolve from
  // the localized tier key, so non-English locales never see mixed-language
  // accessibility text leaking through (the old hard-coded English
  // descriptions did exactly that).
  const text = label ?? t(TRUST_LABEL_KEY[tier]);
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
      title={text}
      aria-label={text}
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
