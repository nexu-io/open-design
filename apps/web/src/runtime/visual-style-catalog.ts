export type VisualStyleContext = 'deck' | 'prototype' | 'document' | 'image' | 'video';
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
  {
    slug: 'academic-research',
    title: 'Academic research',
    description: 'Evidence-led slides, disciplined figures, and rigorous explanatory flow.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'sketchbook',
    title: 'Sketchbook',
    description: 'Hand-drawn notes, marker diagrams, and tactile workshop energy.',
    variant: 'human',
    category: 'creative',
  },
  {
    slug: 'education-lesson',
    title: 'Education lesson',
    description: 'Friendly concept sequences that make learning easy to follow.',
    variant: 'playful',
    category: 'creative',
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
  {
    slug: 'y2k-chrome',
    title: 'Y2K chrome',
    description: 'Glossy chrome, translucent layers, and electric early-web optimism.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'paper-craft',
    title: 'Paper craft',
    description: 'Tactile cut-paper layers, warm shadows, and calm navigation.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'isometric',
    title: 'Isometric',
    description: 'Spatial system maps and dimensional cards for complex product flows.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'aurora-dark',
    title: 'Aurora dark',
    description: 'Near-black surfaces with quiet luminous gradients and premium depth.',
    variant: 'minimal',
    category: 'minimal',
  },
];

const DOCUMENT_STYLE_CATALOG: VisualStyleCatalogEntry[] = [
  {
    slug: 'docs-reference',
    title: 'Docs reference',
    description: 'Clear navigation, structured examples, and practical technical guidance.',
    variant: 'utility',
    category: 'business',
    recommended: true,
  },
  {
    slug: 'editorial-article',
    title: 'Editorial article',
    description: 'Magazine pacing, expressive imagery, and confident reading rhythm.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'creator-eguide',
    title: 'Creator e-guide',
    description: 'Warm, guided pages that make step-by-step learning approachable.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'formal-report',
    title: 'Formal report',
    description: 'Executive structure, credible analysis, and disciplined presentation.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'research-notebook',
    title: 'Research notebook',
    description: 'Evidence-led notes, annotations, and considered findings.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'data-briefing',
    title: 'Data briefing',
    description: 'Focused metrics, concise decisions, and clear visual evidence.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'swiss-minimal',
    title: 'Swiss minimal',
    description: 'Strict grid, sharp contrast, and deliberate whitespace.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'monochrome-manual',
    title: 'Monochrome manual',
    description: 'Technical diagrams, precise steps, and robust documentation craft.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'legal-policy',
    title: 'Legal policy',
    description: 'Formal sections, clauses, and trustworthy scan-first hierarchy.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'academic-paper',
    title: 'Academic paper',
    description: 'Journal rigor, research figures, and evidence-led reading flow.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'lesson-workbook',
    title: 'Lesson workbook',
    description: 'Exercises, visual guidance, and generous space to learn by doing.',
    variant: 'human',
    category: 'editorial',
  },
];

const IMAGE_STYLE_CATALOG: VisualStyleCatalogEntry[] = [
  {
    slug: 'poster-editorial-newsprint',
    title: 'Editorial newsprint',
    description: 'Tactile paper, urban imagery, and confident print contrast.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'poster-swiss-minimal',
    title: 'Swiss minimal poster',
    description: 'Gallery-like typography, modular grids, and one decisive accent.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'poster-bold-typography',
    title: 'Bold typography poster',
    description: 'High-contrast graphic forms with loud, kinetic visual energy.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'poster-cinematic-dark',
    title: 'Cinematic dark poster',
    description: 'Moody contrast, dramatic framing, and prestige-film atmosphere.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'poster-retro-pop',
    title: 'Retro pop poster',
    description: 'Playful color, printed texture, and upbeat cultural energy.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'poster-organic-natural',
    title: 'Organic natural poster',
    description: 'Botanical forms, earthy material cues, and a calmer rhythm.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'poster-neon-cyber',
    title: 'Neon cyber poster',
    description: 'Electric signal lines, controlled glitches, and dark-grid energy.',
    variant: 'utility',
    category: 'creative',
  },
  {
    slug: 'poster-clay-3d',
    title: 'Clay 3D poster',
    description: 'Soft sculptural forms with playful depth and studio light.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'photo-editorial',
    title: 'Editorial photo',
    description: 'Art-directed photography, tactile still life, and quiet sophistication.',
    variant: 'editorial',
    category: 'editorial',
    recommended: true,
  },
  {
    slug: 'illustration-soft',
    title: 'Soft illustration',
    description: 'Gentle organic forms, friendly color, and reassuring warmth.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'image-cinematic',
    title: 'Cinematic image',
    description: 'Dramatic scale, luminous detail, and film-like atmosphere.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'image-surreal-collage',
    title: 'Surreal collage',
    description: 'Impossible spaces, cut-paper texture, and artful visual surprise.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'image-pixel-arcade',
    title: 'Pixel arcade',
    description: 'Intentional pixel craft, saturated glow, and playful game energy.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'image-organic-natural',
    title: 'Organic natural image',
    description: 'Botanical still life, natural material, and soft daylight.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'image-clay-3d',
    title: 'Clay 3D image',
    description: 'Tactile everyday forms, gentle shadows, and playful dimensionality.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'image-neo-brutalist',
    title: 'Neo-brutalist image',
    description: 'Raw texture, bold frames, and unapologetic graphic contrast.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'product-photography',
    title: 'Product photography',
    description: 'Studio still life that makes material, silhouette, and detail tangible.',
    variant: 'luxury',
    category: 'business',
  },
  {
    slug: 'black-white-film',
    title: 'Black & white film',
    description: 'Grainy monochrome, timeless contrast, and observational texture.',
    variant: 'editorial',
    category: 'editorial',
  },
  {
    slug: 'watercolor',
    title: 'Watercolor',
    description: 'Layered washes, paper fibers, and refined painterly softness.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'ink-line',
    title: 'Ink line',
    description: 'Confident black ink, sparse washes, and expressive editorial drawing.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'chrome-3d',
    title: 'Chrome 3D',
    description: 'Reflective liquid metal, controlled light, and futuristic studio polish.',
    variant: 'luxury',
    category: 'creative',
  },
  {
    slug: 'risograph-print',
    title: 'Risograph print',
    description: 'Two-color overprint, halftone texture, and graphic imperfection.',
    variant: 'playful',
    category: 'creative',
  },
];

const VIDEO_STYLE_CATALOG: VisualStyleCatalogEntry[] = [
  {
    slug: 'swiss-pulse',
    title: 'Swiss Pulse',
    description: 'Precise modernist motion, bold forms, and controlled momentum.',
    variant: 'minimal',
    category: 'minimal',
    recommended: true,
  },
  {
    slug: 'velvet-standard',
    title: 'Velvet Standard',
    description: 'Luxurious pace, rich material, and cinematic golden light.',
    variant: 'luxury',
    category: 'business',
  },
  {
    slug: 'deconstructed',
    title: 'Deconstructed',
    description: 'Fragmented collage, exposed grids, and energetic editorial cuts.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'maximalist-type',
    title: 'Maximalist Type',
    description: 'Saturated layered forms and exuberant kinetic composition.',
    variant: 'playful',
    category: 'creative',
  },
  {
    slug: 'data-drift',
    title: 'Data Drift',
    description: 'Fluid information graphics that turn data into movement.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'soft-signal',
    title: 'Soft Signal',
    description: 'Translucent gradients, slow ripples, and calm contemporary motion.',
    variant: 'minimal',
    category: 'minimal',
  },
  {
    slug: 'folk-frequency',
    title: 'Folk Frequency',
    description: 'Handcrafted texture, rhythmic motifs, and warm visual storytelling.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'shadow-cut',
    title: 'Shadow Cut',
    description: 'Hard-edged silhouettes, theatrical contrast, and graphic depth.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'product-demo',
    title: 'Product demo',
    description: 'Crisp UI reveals and feature motion that explain value clearly.',
    variant: 'utility',
    category: 'business',
  },
  {
    slug: 'kinetic-type',
    title: 'Kinetic type',
    description: 'Rhythmic type-like forms and bold transitions that carry the message.',
    variant: 'brutalist',
    category: 'creative',
  },
  {
    slug: 'paper-stopmotion',
    title: 'Paper stop motion',
    description: 'Hand-cut layers and physical frame-by-frame charm.',
    variant: 'human',
    category: 'editorial',
  },
  {
    slug: 'chrome-3d',
    title: 'Chrome 3D',
    description: 'Liquid metal, studio reflections, and slow dimensional motion.',
    variant: 'luxury',
    category: 'creative',
  },
];

const STYLE_CATALOGS: Readonly<Record<VisualStyleContext, VisualStyleCatalogEntry[]>> = {
  deck: DECK_STYLE_CATALOG,
  prototype: PROTOTYPE_STYLE_CATALOG,
  document: DOCUMENT_STYLE_CATALOG,
  image: IMAGE_STYLE_CATALOG,
  video: VIDEO_STYLE_CATALOG,
};

export function visualStyleCardsForContext(context: VisualStyleContext): VisualStyleCard[] {
  const catalog = STYLE_CATALOGS[context];
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
