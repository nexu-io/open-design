// Spec 101 T032 — ported from spec 100 brand-kit
// (docs/artifacts/eric-edmeades-brand-kit-2026-04-30.md).
// Source DESIGN.md: design-systems/ericedmeades/DESIGN.md (cherry-pick dbc6b7b).

import type { DesignSystem } from '../_types.js';

const ericedmeades: DesignSystem = {
  key: 'ericedmeades',
  palette: {
    primary: '#000000',
    bg: '#FFFFFF',
    subtle_bg: '#F5F4F1',
    accent: '#B08D57', // warm bronze
    body_text: '#1A1A1A',
  },
  typography: {
    heading_family: "'Inter', 'Archivo Black', 'Space Grotesk', system-ui, sans-serif",
    body_family: "'Inter', system-ui, -apple-system, sans-serif",
    weights: [400, 700, 900],
    case: 'all-caps',
    tracking: 'tight',
  },
  logo: {
    url: 'https://ericedmeades.com/images/ee-logo-full.png',
  },
  hero_style: 'dark-editorial',
  voice_tokens: [
    'BUILT FOR THE STAGE',
    'BRING STOP IT TO YOUR EVENT',
    'TRANSFORMATION ARCHITECT',
    'ZERO SOFTNESS',
  ],
  voice_avoid: [
    // WildFit cross-contamination — Eric's brand explicitly forbids this:
    'WildFit',
    'wellness coach',
    // Saturated brand-color leakage (the Eric brand is monochrome + bronze):
    'green gradient',
  ],
};

export default ericedmeades;
