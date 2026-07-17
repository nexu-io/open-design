export type VisualStyleContext = 'deck' | 'prototype';
export type VisualStyleCategory = 'business' | 'editorial' | 'creative' | 'minimal';

export type VisualStyleVariant =
  | 'editorial'
  | 'minimal'
  | 'playful'
  | 'utility'
  | 'luxury'
  | 'brutalist'
  | 'human';

export interface VisualStylePreviewAsset {
  src: string;
  alt: string;
}

export interface VisualStyleCard {
  value: string;
  title: string;
  description: string;
  variant: VisualStyleVariant;
  category: VisualStyleCategory;
  preview: VisualStylePreviewAsset;
  recommended?: boolean;
}

interface VisualStyleCatalogEntry {
  slug: string;
  title: string;
  description: string;
  variant: VisualStyleVariant;
  category: VisualStyleCategory;
  recommended?: boolean;
}

const STYLE_CATALOG_ASSET_BASE_URL = 'https://repo-assets.open-design.ai/style-catalog/v1';

const DECK_STYLE_CATALOG: VisualStyleCatalogEntry[] = [
  {
    slug: 'editorial-narrative',
    title: 'Editorial narrative',
    description: 'Warm paper, confident hierarchy, and paced storytelling.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'product-keynote',
    title: 'Product keynote',
    description: 'Quiet layouts, generous space, and one idea per slide.',
    variant: 'minimal',
    category: 'minimal',
    recommended: true,
  },
  {
    slug: 'bold-storytelling',
    title: 'Bold storytelling',
    description: 'Expressive shapes and lively compositions for memorable beats.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'data-briefing',
    title: 'Data briefing',
    description: 'Dense but legible systems for metrics, diagrams, and decisions.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'premium-pitch',
    title: 'Premium pitch',
    description: 'Restrained color, elegant type, and polished product framing.',
    variant: 'luxury',
    category: 'business',
  },
  {
    slug: 'experimental-grid',
    title: 'Experimental grid',
    description: 'High contrast, assertive type, and unconventional pacing.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'warm-workshop',
    title: 'Warm workshop',
    description: 'Friendly typography and accessible, people-first storytelling.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'swiss-minimal',
    title: 'Swiss minimal',
    description: 'Strict alignment, strong contrast, and disciplined whitespace.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'cinematic-dark',
    title: 'Cinematic dark',
    description: 'Image-led narrative with rich contrast and dramatic pacing.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'formal-corporate',
    title: 'Formal corporate',
    description: 'Executive structure, credible claims, and clear charts.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'soft-gradient',
    title: 'Soft gradient',
    description: 'Airy pastel depth and calm, optimistic geometry.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'photojournal',
    title: 'Photojournal',
    description: 'Documentary imagery, captions, and evidence-led storytelling.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'retro-pop',
    title: 'Retro pop',
    description: 'Bright color, playful patterns, and energetic cultural beats.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'tech-futurist',
    title: 'Tech futurist',
    description: 'Electric systems and polished technical vision without sci-fi clutter.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'organic-natural',
    title: 'Organic natural',
    description: 'Earthy color, tactile material cues, and sustainable storytelling.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'mono-terminal',
    title: 'Monochrome terminal',
    description: 'Off-white grids, command-line precision, and green status signals.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'soft-glass',
    title: 'Soft glass',
    description: 'Frosted layers, soft blur, and a spacious contemporary feel.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'clay-3d',
    title: 'Clay 3D',
    description: 'Tactile rounded objects with a warm, playful dimensionality.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'neon-cyber',
    title: 'Neon cyber',
    description: 'Cyan and magenta signal lines on a controlled dark grid.',
    variant: 'utility',
    category: 'creative',
  },
  {
    slug: 'pixel-arcade',
    title: 'Pixel arcade',
    description: 'Intentional 8-bit geometry and high-contrast playful forms.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'skeuomorphic',
    title: 'Skeuomorphic',
    description: 'Paper, panels, and physical material cues with gentle depth.',
    variant: 'human',
    category: 'creative',
  },
  {
    slug: 'bento',
    title: 'Bento modular',
    description: 'Calm reusable modules with obvious grouping and rhythm.',
    variant: 'minimal',
    category: 'minimal',
  },
];

const PROTOTYPE_STYLE_CATALOG: VisualStyleCatalogEntry[] = [
  {
    slug: 'content-led-product',
    title: 'Content-led product',
    description: 'Editorial rhythm, expressive type, and immersive content surfaces.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'quiet-saas',
    title: 'Quiet SaaS',
    description: 'Precise spacing, calm controls, and focused product hierarchy.',
    variant: 'minimal',
    category: 'minimal',
    recommended: true,
  },
  {
    slug: 'expressive-consumer',
    title: 'Expressive consumer',
    description: 'Friendly color, rounded interactions, and moments of delight.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'dense-utility',
    title: 'Dense utility',
    description: 'Compact navigation and information-rich expert workflows.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'premium-commerce',
    title: 'Premium commerce',
    description: 'Image-led layouts, refined details, and deliberate restraint.',
    variant: 'luxury',
    category: 'business',
  },
  {
    slug: 'experimental-interface',
    title: 'Experimental interface',
    description: 'Graphic contrast, raw structure, and unconventional interaction cues.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'friendly-service',
    title: 'Friendly service',
    description: 'Comfortable density, reassuring language, and welcoming surfaces.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'mobile-native',
    title: 'Mobile-native',
    description: 'Touch-first cards, concise task flows, and clear thumb reach.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'brand-landing',
    title: 'Brand landing',
    description: 'Image-led hero storytelling with an unmistakable conversion path.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'soft-glass',
    title: 'Soft glass',
    description: 'Frosted panels, pale gradients, and soft controlled depth.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'neo-brutalist',
    title: 'Neo-brutalist',
    description: 'Bold outlines, chunky controls, and direct energetic interactions.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'spatial-3d',
    title: 'Spatial 3D',
    description: 'Dimensional cards and floating objects that clarify hierarchy.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'social-community',
    title: 'Social community',
    description: 'Colorful participation cues and approachable discovery.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'marketplace',
    title: 'Marketplace',
    description: 'Visual product grids with easy browsing, comparison, and trust.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'monochrome-terminal',
    title: 'Monochrome terminal',
    description: 'Dense commands, reliable status, and technical precision.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'editorial-print',
    title: 'Editorial print',
    description: 'Warm paper, serif rhythm, and magazine-like reading flow.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'cinematic-dark',
    title: 'Cinematic dark',
    description: 'Immersive dark imagery with quiet navigation and dramatic contrast.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'swiss-minimal',
    title: 'Swiss minimal',
    description: 'Precise grid, red geometric accents, and disciplined whitespace.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'retro-pop',
    title: 'Retro pop',
    description: 'Tangerine, mustard, sky blue, and a bright consumer energy.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'tech-futurist',
    title: 'Tech futurist',
    description: 'Credible AI and data surfaces with cyan and violet signals.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'organic-natural',
    title: 'Organic natural',
    description: 'Sustainable material cues, gentle curves, and warm earth tones.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'photojournal',
    title: 'Photojournal',
    description: 'Photography-forward evidence and concise supporting context.',
    variant: 'editorial',
    category: 'editorial',
  },
];

export function visualStyleCardsForContext(context: VisualStyleContext): VisualStyleCard[] {
  const catalog = context === 'deck' ? DECK_STYLE_CATALOG : PROTOTYPE_STYLE_CATALOG;
  return catalog.map((style) => ({
    value: `${context}-${style.slug}`,
    title: style.title,
    description: style.description,
    variant: style.variant,
    category: style.category,
    preview: {
      src: `${STYLE_CATALOG_ASSET_BASE_URL}/${context}-${style.slug}-v1.webp`,
      alt: `${style.title} ${context} style preview.`,
    },
    recommended: style.recommended,
  }));
}
