// Spec 101 T033 — Ceremonia design system.
// Tokens derived from openclaw DESIGN.md (--site-* CSS custom properties)
// + constitution principle IV voice rules.

import type { DesignSystem } from '../_types.js';

const ceremonia: DesignSystem = {
  key: 'ceremonia',
  palette: {
    primary: '#121212',
    bg: '#FFFFFF',
    subtle_bg: '#F0FDFA', // --site-bg-tint
    accent: '#14B8A6', // --site-accent (Ceremonia teal)
    body_text: '#4A4A4A', // --site-text-body
  },
  typography: {
    heading_family: "'Merriweather', Georgia, serif",
    body_family: "'Open Sans', system-ui, sans-serif",
    weights: [400, 600, 700, 900],
    case: 'sentence',
    tracking: 'normal',
  },
  logo: {
    url: 'https://ceremoniacircle.org/images/ceremonia-logo.svg',
  },
  hero_style: 'warm-organic',
  voice_tokens: [
    'warm',
    'grounded',
    'human',
    'direct',
    'evidence-based',
  ],
  voice_avoid: [
    // Constitution principle IV + USER.md voice kill list:
    'sacred container',
    'held space',
    'divine',
    'quantum',
    'alignment',
    'activation',
    'exciting news',
    "don't miss out",
    // Generic landing-page filler that violates Ceremonia voice:
    'transform your life',
    'unlock your potential',
  ],
};

export default ceremonia;
