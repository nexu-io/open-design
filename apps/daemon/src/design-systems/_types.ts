// Spec 101 — DesignSystem entity per data-model.md.
// Each tenant points at one of these via registry's open_design.design_system key.

export type HeroStyle = 'dark-editorial' | 'warm-organic' | 'minimal-typographic' | 'photo-led';

export interface DesignSystemPalette {
  primary: string;
  bg: string;
  subtle_bg: string;
  accent: string;
  body_text: string;
}

export interface DesignSystemTypography {
  heading_family: string;
  body_family: string;
  weights: number[];
  case: 'all-caps' | 'sentence' | 'title';
  tracking: 'tight' | 'normal' | 'wide';
}

export interface DesignSystemLogo {
  url?: string;
  svg_inline?: string;
}

export interface DesignSystem {
  key: string;
  palette: DesignSystemPalette;
  typography: DesignSystemTypography;
  logo: DesignSystemLogo;
  hero_style: HeroStyle;
  voice_tokens: string[];
  voice_avoid: string[];
}
