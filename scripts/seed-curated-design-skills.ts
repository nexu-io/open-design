#!/usr/bin/env node
// Seed `skills/<id>/SKILL.md` for the curated design/creative skill
// catalogue surfaced in Settings → Skills.
//
// Each entry advertises an upstream skill from the awesome-claude-skills
// (ComposioHQ) and awesome-agent-skills (VoltAgent) communities. The body
// stays light — it points the agent at the upstream repo, lists the
// skill's purpose, and tells the user how to install the full upstream
// bundle if they want the original assets/scripts. The frontmatter carries
// `od.category` so the Settings → Skills filter row groups them visibly.
//
// Idempotent: a skill folder is only created when it does not already
// exist. To re-seed an entry, delete its folder under `skills/` first.
//
// Usage:
//   pnpm tsx scripts/seed-curated-design-skills.ts

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');

type Mode = 'image' | 'video' | 'audio' | 'deck' | 'design-system' | 'template' | 'prototype';

interface CuratedSkill {
  // Folder + frontmatter `name`; must be a slug (a-z, 0-9, dash) so the
  // daemon's listSkills() can read it back unchanged.
  id: string;
  // Display description shown in the Skills row summary and used as the
  // skill description inside system prompts when the entry is enabled.
  description: string;
  // Lowercase keywords / phrases the agent matches against. Aim for 3-6
  // distinct phrases per skill so triggers stay specific.
  triggers: string[];
  // Maps to the existing `od.mode` filter. Pick the closest of the seven
  // modes the daemon recognises; everything else falls back to "prototype".
  mode: Mode;
  // Free-form category slug that powers the new category filter row in
  // Settings → Skills. Keep the vocabulary tight so a few pills cover the
  // whole catalogue.
  category: string;
  // Upstream URL recorded under `od.upstream`. The Skills detail panel
  // surfaces it as a clickable source link.
  upstream: string;
  // Short one-line tagline rendered above the body. Keep it under 120
  // characters so it stays on one row in the row summary.
  tagline?: string;
  // Optional credit line ("By @author") shown at the top of the body.
  attribution?: string;
}

const CATALOGUE: CuratedSkill[] = [
  // -------------------------------------------------------------------------
  // Image generation & editing
  // -------------------------------------------------------------------------
  {
    id: 'canvas-design',
    description:
      'Create beautiful visual art in PNG and PDF documents using design philosophy and aesthetic principles for posters, illustrations, and static pieces.',
    triggers: ['canvas design', 'visual art', 'poster design', 'create poster', 'illustration', '海报', '插画'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/anthropics/skills/tree/main/canvas-design',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'algorithmic-art',
    description:
      'Create generative art using p5.js with seeded randomness so every render is reproducible. Useful for procedural posters, motion-style stills, and artistic frame studies.',
    triggers: ['algorithmic art', 'generative art', 'p5js', 'procedural art', 'seeded randomness', '生成艺术'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/anthropics/skills/tree/main/algorithmic-art',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'imagegen',
    description:
      'Generate and edit images using OpenAI\'s Image API for project assets — UI mockups, icons, illustrations, social cards, and visual references.',
    triggers: ['generate image', 'create image', 'image gen', 'openai image', 'icon design', 'mockup'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'imagen',
    description:
      'Generate images using Google Gemini\'s image generation API for UI mockups, icons, illustrations, and visual assets.',
    triggers: ['gemini image', 'imagen', 'google image gen', 'illustration', 'icon'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/sanjay3290/imagen',
    attribution: 'Curated from @sanjay3290.',
  },
  {
    id: 'image-enhancer',
    description:
      'Improve image and screenshot quality by enhancing resolution, sharpness, and clarity for professional presentations and documentation.',
    triggers: ['enhance image', 'upscale image', 'image quality', 'sharpen', 'denoise'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/image-enhancer',
    attribution: 'Curated from ComposioHQ awesome-claude-skills.',
  },
  {
    id: 'gif-sticker-maker',
    description:
      'Convert photos into animated GIF stickers in Funko Pop / Pop Mart style via the MiniMax API. Useful for personalized chat stickers and avatar packs.',
    triggers: ['gif sticker', 'funko sticker', 'animated sticker', 'pop mart', '表情包'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/MiniMax-AI/skills',
    attribution: 'Curated from MiniMax AI team.',
  },
  {
    id: 'slack-gif-creator',
    description:
      'Create animated GIFs optimized for Slack with validators for size constraints and composable animation primitives.',
    triggers: ['slack gif', 'animated gif', 'reaction gif', 'tiny gif'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/anthropics/skills/tree/main/slack-gif-creator',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'fal-generate',
    description:
      'Generate images and videos using fal.ai AI models. Production-grade catalogue covering Flux, SDXL, ideogram, and other community-hosted endpoints.',
    triggers: ['fal generate', 'fal.ai image', 'flux image', 'sdxl', 'ideogram'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-image-edit',
    description:
      'AI-powered image editing with style transfer, background removal, object removal, and inpainting via fal.ai hosted models.',
    triggers: ['fal image edit', 'inpaint', 'style transfer', 'background removal', 'object removal'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-realtime',
    description:
      'Real-time and streaming AI image generation via fal.ai. Suited for moodboard exploration, draft variations, and rapid creative iteration.',
    triggers: ['fal realtime', 'streaming image', 'realtime image gen', 'moodboard'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-restore',
    description:
      'Restore and fix image quality — deblur, denoise, fix faces, and restore old documents using fal.ai\'s hosted restoration models.',
    triggers: ['fal restore', 'restore image', 'deblur', 'denoise', 'fix faces', 'document restore'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-upscale',
    description:
      'Upscale and enhance image and video resolution using AI super-resolution models hosted on fal.ai.',
    triggers: ['fal upscale', 'upscale image', 'super resolution', '4k upscale', 'enhance resolution'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-train',
    description:
      'Train custom AI models (LoRA) on fal.ai for personalized image generation tailored to a brand, character, or style.',
    triggers: ['fal train', 'train lora', 'custom model', 'personalized image gen', 'brand lora'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-tryon',
    description:
      'Virtual try-on — see how clothes look on a person via fal.ai\'s hosted try-on models. Useful for ecommerce, lookbooks, and styling experiments.',
    triggers: ['virtual tryon', 'fal tryon', 'try on clothes', 'lookbook', 'ecommerce styling'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-vision',
    description:
      'Analyze images — segment objects, detect, run OCR, describe, and answer visual questions via fal.ai vision models.',
    triggers: ['fal vision', 'image analysis', 'object detection', 'ocr image', 'visual qa', 'segment'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'venice-image-generate',
    description:
      'Image generation endpoints and available styles via the Venice.ai API.',
    triggers: ['venice image', 'venice generate', 'venice ai image'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/veniceai/skills',
    attribution: 'Curated from the Venice.ai team.',
  },
  {
    id: 'venice-image-edit',
    description:
      'Image edits, upscaling, and background removal via the Venice.ai API.',
    triggers: ['venice image edit', 'venice upscale', 'venice background removal'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/veniceai/skills',
    attribution: 'Curated from the Venice.ai team.',
  },
  {
    id: 'nanobanana-ppt',
    description:
      'AI-powered PPT generation with document analysis and styled images via the NanoBanana stack. Combines image generation with structured deck output.',
    triggers: ['nanobanana ppt', 'ai ppt', 'styled ppt', 'document to ppt', 'banana ppt'],
    mode: 'deck',
    category: 'image-generation',
    upstream: 'https://github.com/op7418/NanoBanana-PPT-Skills',
    attribution: 'Curated from @op7418.',
  },
  {
    id: 'pixelbin-media',
    description:
      'Generate and edit images and videos with an 85+ API portfolio and build visually appealing website pages via Pixelbin.',
    triggers: ['pixelbin', 'media generation', 'image transform', 'video transform', 'cdn media'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/pixelbin-dev/skills',
    attribution: 'Curated from Pixelbin.',
  },
  {
    id: 'replicate',
    description:
      'Discover, compare, and run AI models using Replicate\'s API. Strong fit for image, audio, and video generation pipelines that swap models frequently.',
    triggers: ['replicate', 'run ai model', 'model comparison', 'replicate api'],
    mode: 'image',
    category: 'image-generation',
    upstream: 'https://github.com/replicate/skills',
    attribution: 'Curated from Replicate.',
  },

  // -------------------------------------------------------------------------
  // Video generation & editing
  // -------------------------------------------------------------------------
  {
    id: 'remotion',
    description:
      'Programmatic video creation with React. Useful for branded explainers, social cuts, dashboards-to-video, and reproducible motion graphics.',
    triggers: ['remotion', 'react video', 'programmatic video', 'motion graphics', 'video composition'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/remotion-dev/remotion',
    attribution: 'Curated from the Remotion team.',
  },
  {
    id: 'sora',
    description:
      'Generate, remix, and manage short video clips via OpenAI\'s Sora API. Useful for cinematic shots, b-roll, and rapid concept video iteration.',
    triggers: ['sora', 'openai video', 'short video', 'b roll', 'cinematic clip'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'fal-video-edit',
    description:
      'Edit existing videos using AI — remix style, upscale, remove background, and add audio via fal.ai\'s hosted video models.',
    triggers: ['fal video edit', 'video upscale', 'video style transfer', 'remove video bg', 'video remix'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-lip-sync',
    description:
      'Create talking head videos and lip sync audio to video via fal.ai. Useful for explainer avatars, multilingual dubbing previews, and social cuts.',
    triggers: ['lip sync', 'talking head', 'audio to video', 'avatar video', 'fal lipsync'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'fal-kling-o3',
    description:
      'Generate images and videos with Kling O3 — Kling\'s most powerful model family — via fal.ai.',
    triggers: ['fal kling', 'kling o3', 'kling video', 'kling image'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'venice-video',
    description:
      'Video generation and transcription workflows via the Venice.ai API.',
    triggers: ['venice video', 'venice video gen', 'venice transcribe'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/veniceai/skills',
    attribution: 'Curated from the Venice.ai team.',
  },
  {
    id: 'video-downloader',
    description:
      'Download videos from YouTube and other platforms for offline viewing, editing, or archival with support for various formats and quality options.',
    triggers: ['download video', 'youtube download', 'archive video', 'offline video'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/video-downloader',
    attribution: 'Curated from ComposioHQ awesome-claude-skills.',
  },
  {
    id: 'youtube-clipper',
    description:
      'YouTube clip generation and editing with automated workflows — pull source video, slice highlights, add captions, and export.',
    triggers: ['youtube clip', 'video clip', 'highlight reel', 'auto caption clip'],
    mode: 'video',
    category: 'video-generation',
    upstream: 'https://github.com/op7418/Youtube-clipper-skill',
    attribution: 'Curated from @op7418.',
  },

  // -------------------------------------------------------------------------
  // Audio & music
  // -------------------------------------------------------------------------
  {
    id: 'venice-audio-speech',
    description:
      'Text-to-speech models, voices, formats, and streaming via Venice.ai. Useful for narration, voiceover, and conversational agent voices.',
    triggers: ['tts', 'venice speech', 'text to speech', 'voiceover', 'narration'],
    mode: 'audio',
    category: 'audio-music',
    upstream: 'https://github.com/veniceai/skills',
    attribution: 'Curated from the Venice.ai team.',
  },
  {
    id: 'venice-audio-music',
    description:
      'Music generation queueing, retrieval, and completion endpoints via Venice.ai. Suited for jingles, background loops, and prototype scoring.',
    triggers: ['venice music', 'music gen', 'jingle', 'background loop', 'score'],
    mode: 'audio',
    category: 'audio-music',
    upstream: 'https://github.com/veniceai/skills',
    attribution: 'Curated from the Venice.ai team.',
  },
  {
    id: 'speech',
    description:
      'Generate spoken audio from text using OpenAI\'s API with built-in voices. Useful for narrated explainers, lecture audio, and quick voiceover tracks.',
    triggers: ['openai speech', 'tts openai', 'narrated audio', 'voice over'],
    mode: 'audio',
    category: 'audio-music',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'ai-music-album',
    description:
      'Full-lifecycle AI music album production — concept, lyric drafting, track sequencing, and export. Useful for indie album experiments and brand soundtracks.',
    triggers: ['ai music', 'music album', 'lyric writing', 'track sequencing', 'album production'],
    mode: 'audio',
    category: 'audio-music',
    upstream: 'https://github.com/bitwize-music-studio/claude-ai-music-skills',
    attribution: 'Curated from bitwize-music-studio.',
  },

  // -------------------------------------------------------------------------
  // 3D, shaders, generative
  // -------------------------------------------------------------------------
  {
    id: 'fal-3d',
    description:
      'Generate 3D models from text or images via fal.ai. Useful for game assets, AR previews, product mockups, and concept sculpting.',
    triggers: ['fal 3d', 'text to 3d', 'image to 3d', '3d model gen', 'game asset 3d'],
    mode: 'image',
    category: '3d-shaders',
    upstream: 'https://github.com/fal-ai-community/skills',
    attribution: 'Curated from the fal.ai community team.',
  },
  {
    id: 'threejs',
    description:
      'Three.js skills for creating 3D elements and interactive experiences in the browser — scenes, materials, controls, and post-processing.',
    triggers: ['threejs', 'three.js', '3d web', 'webgl scene', '3d interactive'],
    mode: 'prototype',
    category: '3d-shaders',
    upstream: 'https://github.com/CloudAI-X/threejs-skills',
    attribution: 'Curated from CloudAI-X.',
  },
  {
    id: 'shader-dev',
    description:
      'GLSL shader techniques for ray marching, fluid simulation, particle systems, and procedural generation. Useful for hero visuals and motion stills.',
    triggers: ['shader', 'glsl', 'ray marching', 'fluid simulation', 'procedural generation'],
    mode: 'prototype',
    category: '3d-shaders',
    upstream: 'https://github.com/MiniMax-AI/skills',
    attribution: 'Curated from the MiniMax AI team.',
  },

  // -------------------------------------------------------------------------
  // Slides / decks
  // -------------------------------------------------------------------------
  {
    id: 'pptx',
    description:
      'Read, generate, and adjust PowerPoint slides, layouts, and templates. Useful for executive decks, training material, and product reviews.',
    triggers: ['pptx', 'powerpoint', 'slide deck', 'create slides', 'edit pptx'],
    mode: 'deck',
    category: 'slides',
    upstream: 'https://github.com/anthropics/skills/tree/main/pptx',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'slides',
    description:
      'Create and edit .pptx presentation decks with PptxGenJS. Useful for sales decks, kickoff briefs, and design-system showcases.',
    triggers: ['slides', 'pptxgenjs', 'sales deck', 'design showcase deck'],
    mode: 'deck',
    category: 'slides',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'pptx-generator',
    description:
      'Create and edit PowerPoint presentations from scratch with PptxGenJS — MiniMax\'s production-tested deck pipeline.',
    triggers: ['pptx generator', 'minimax ppt', 'deck generator', 'auto pptx'],
    mode: 'deck',
    category: 'slides',
    upstream: 'https://github.com/MiniMax-AI/skills',
    attribution: 'Curated from the MiniMax AI team.',
  },
  {
    id: 'frontend-slides',
    description:
      'Generate animation-rich HTML presentations with visual style previews. Useful for online keynotes, embedded talks, and interactive briefs.',
    triggers: ['html slides', 'animation slides', 'interactive deck', 'web ppt', 'reveal slides'],
    mode: 'deck',
    category: 'slides',
    upstream: 'https://github.com/zarazhangrui/frontend-slides',
    attribution: 'Curated from @zarazhangrui.',
  },

  // -------------------------------------------------------------------------
  // Documents (PDF, DOCX) — design-adjacent: layout, typography, formatting.
  // -------------------------------------------------------------------------
  {
    id: 'docx',
    description:
      'Create, edit, and analyze Word documents with tracked changes, comments, and formatting. Useful for design briefs, copy docs, and review-ready deliverables.',
    triggers: ['docx', 'word document', 'tracked changes', 'design brief doc', 'copy doc'],
    mode: 'prototype',
    category: 'documents',
    upstream: 'https://github.com/anthropics/skills/tree/main/docx',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'pdf',
    description:
      'Extract text, create PDFs, and handle forms. Useful for press releases, branded one-pagers, and printable design deliverables.',
    triggers: ['pdf', 'create pdf', 'pdf form', 'branded pdf', 'one pager'],
    mode: 'prototype',
    category: 'documents',
    upstream: 'https://github.com/anthropics/skills/tree/main/pdf',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'doc',
    description:
      'Read, create, and edit .docx documents with formatting and layout fidelity via OpenAI\'s document skill.',
    triggers: ['openai doc', 'docx fidelity', 'word doc edit', 'layout doc'],
    mode: 'prototype',
    category: 'documents',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'minimax-pdf',
    description:
      'Generate, fill, and reformat PDFs with a token-based design system and 15 cover styles. Useful for branded PDFs, e-guides, and reports.',
    triggers: ['minimax pdf', 'branded pdf', 'cover style pdf', 'e-guide pdf', 'design system pdf'],
    mode: 'prototype',
    category: 'documents',
    upstream: 'https://github.com/MiniMax-AI/skills',
    attribution: 'Curated from the MiniMax AI team.',
  },
  {
    id: 'minimax-docx',
    description:
      'Professional DOCX document creation and editing using OpenXML SDK. Useful for branded reports, polished proposals, and template-based authoring.',
    triggers: ['minimax docx', 'openxml docx', 'branded report', 'proposal doc', 'template authoring'],
    mode: 'prototype',
    category: 'documents',
    upstream: 'https://github.com/MiniMax-AI/skills',
    attribution: 'Curated from the MiniMax AI team.',
  },

  // -------------------------------------------------------------------------
  // Design systems & brand
  // -------------------------------------------------------------------------
  {
    id: 'brand-guidelines',
    description:
      'Apply Anthropic\'s official brand colors and typography to artifacts for consistent visual identity and professional design standards. A reference for shaping your own.',
    triggers: ['brand guidelines', 'brand colors', 'brand typography', 'visual identity'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/anthropics/skills/tree/main/brand-guidelines',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'theme-factory',
    description:
      'Apply professional font and color themes to artifacts including slides, docs, reports, and HTML landing pages. Ships 10 pre-set themes.',
    triggers: ['theme factory', 'apply theme', 'design theme', 'theme generator', 'preset theme'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/anthropics/skills/tree/main/theme-factory',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'frontend-design',
    description:
      'Frontend design and UI/UX development tools for shipping production-ready interfaces with strong typographic and layout discipline.',
    triggers: ['frontend design', 'ui design', 'ux design', 'web design', 'production ui'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/anthropics/skills/tree/main/frontend-design',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'frontend-skill',
    description:
      'Create visually strong landing pages, websites, and app UIs with restrained composition. OpenAI\'s production frontend playbook.',
    triggers: ['landing page', 'frontend playbook', 'ui composition', 'restrained ui'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'web-design-guidelines',
    description:
      'Web design guidelines and standards by the Vercel engineering team. Covers layout, typography, color, motion, and accessibility for product UI.',
    triggers: ['web design guidelines', 'vercel design', 'product ui standards', 'design checklist'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/vercel-labs/skills',
    attribution: 'Curated from the Vercel engineering team.',
  },
  {
    id: 'design-md',
    description:
      'Create and manage DESIGN.md files. Useful for capturing design direction, tokens, and visual rules in a single source of truth.',
    triggers: ['design.md', 'design doc', 'design tokens doc', 'visual rules doc'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/google-labs-code/skills',
    attribution: 'Curated from Google Labs (Stitch).',
  },
  {
    id: 'enhance-prompt',
    description:
      'Improve prompts with design specs and UI/UX vocabulary. Useful for design-to-code workflows and clarifying requests for visual output.',
    triggers: ['enhance prompt', 'design prompt', 'ui prompt', 'design vocabulary'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/google-labs-code/skills',
    attribution: 'Curated from Google Labs (Stitch).',
  },
  {
    id: 'shadcn-ui',
    description:
      'Build UI components with shadcn/ui. Pairs with the Stitch design loop to ship structured, accessible components quickly.',
    triggers: ['shadcn', 'shadcn ui', 'shadcn components', 'accessible components'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/google-labs-code/skills',
    attribution: 'Curated from Google Labs (Stitch).',
  },
  {
    id: 'stitch-loop',
    description:
      'Iterative design-to-code feedback loop. Critique → adjust → ship cycle for tightening visual fidelity between brief and built UI.',
    triggers: ['stitch loop', 'design to code', 'design iteration', 'fidelity loop'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/google-labs-code/skills',
    attribution: 'Curated from Google Labs (Stitch).',
  },
  {
    id: 'apple-hig',
    description:
      'Apple Human Interface Guidelines as 14 agent skills covering platforms, foundations, components, patterns, inputs, and technologies for iOS, macOS, visionOS, watchOS, and tvOS.',
    triggers: ['apple hig', 'human interface', 'ios design', 'macos design', 'visionos design'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/raintree-technology/apple-hig-skills',
    attribution: 'Curated from raintree-technology.',
  },
  {
    id: 'platform-design',
    description:
      '300+ design rules from Apple HIG, Material Design 3, and WCAG 2.2 for cross-platform apps. Useful when shipping a single design across iOS, Android, and the web.',
    triggers: ['platform design', 'cross platform design', 'material design', 'hig rules', 'wcag rules'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/ehmo/platform-design-skills',
    attribution: 'Curated from @ehmo.',
  },
  {
    id: 'ui-skills',
    description:
      'Opinionated, evolving constraints to guide agents when building interfaces. Useful for keeping output coherent across many small UI pieces.',
    triggers: ['ui constraints', 'ui guide', 'opinionated ui', 'ui rules'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/ibelick/ui-skills',
    attribution: 'Curated from @ibelick.',
  },
  {
    id: 'ui-ux-pro-max',
    description:
      'UI/UX design patterns and best practices. Pattern library + heuristic checks for shipping clean, usable interfaces.',
    triggers: ['ui ux patterns', 'design patterns', 'ux heuristics', 'usability'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
    attribution: 'Curated from @nextlevelbuilder.',
  },
  {
    id: 'taste-skill',
    description:
      'High-agency frontend skill that gives AI good taste with tunable design variance, motion intensity, and visual density to stop generic UI slop.',
    triggers: ['design taste', 'visual taste', 'good taste', 'anti slop', 'visual density'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/Leonxlnx/taste-skill',
    attribution: 'Curated from @Leonxlnx.',
  },
  {
    id: 'wpds',
    description:
      'WordPress Design System. Apply WordPress\'s official design tokens, typography, and component patterns to themes and sites.',
    triggers: ['wpds', 'wordpress design', 'wp tokens', 'wp design system'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/WordPress/skills',
    attribution: 'Curated from the WordPress development team.',
  },
  {
    id: 'swiftui-design',
    description:
      'SwiftUI 前端设计 skill — anti AI-slop rules, design direction advisor, brand asset protocol, and five-dimension review. Works with Claude Code, Cursor, Codex, and OpenCode.',
    triggers: ['swiftui design', 'ios design', 'native ui design', 'apple frontend', 'swiftui slop'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/wholiver/swiftui-design-skill',
    attribution: 'Curated from @wholiver.',
  },
  {
    id: 'color-expert',
    description:
      'Color science expert skill with 286K words of reference material covering OKLCH/OKLAB, palette generation, accessibility/contrast, color naming, pigment mixing, and historical color theory.',
    triggers: ['color theory', 'palette generator', 'color science', 'oklch palette', 'contrast check'],
    mode: 'design-system',
    category: 'design-systems',
    upstream: 'https://github.com/meodai/skill.color-expert',
    attribution: 'Curated from @meodai.',
  },

  // -------------------------------------------------------------------------
  // Figma tooling
  // -------------------------------------------------------------------------
  {
    id: 'figma-use',
    description:
      'Run Figma Plugin API scripts for canvas writes, inspections, variables, and design-system work. Prerequisite for every other Figma skill in this catalogue.',
    triggers: ['figma use', 'figma plugin api', 'figma canvas', 'figma scripts'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },
  {
    id: 'figma-code-connect-components',
    description:
      'Connect Figma design components to code components using Code Connect so design-system updates flow into the codebase automatically.',
    triggers: ['figma code connect', 'design to code', 'figma components', 'code connect'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },
  {
    id: 'figma-create-design-system-rules',
    description:
      'Generate project-specific design system rules for Figma-to-code workflows. Useful for capturing tokens, naming, and lint rules in one source.',
    triggers: ['figma rules', 'design system rules', 'figma to code rules', 'figma tokens'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },
  {
    id: 'figma-create-new-file',
    description:
      'Create a new blank Figma Design or FigJam file. Useful as the first step in scripted design-system or workshop workflows.',
    triggers: ['figma new file', 'figjam new', 'create figma file'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },
  {
    id: 'figma-generate-design',
    description:
      'Build or update screens in Figma from code or description using design system components. Translate app pages into Figma using design tokens.',
    triggers: ['figma generate design', 'code to figma', 'screen generation', 'figma from code'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },
  {
    id: 'figma-generate-library',
    description:
      'Build or update a professional-grade design system library in Figma from a codebase. Useful for keeping the Figma source of truth in sync with shipped components.',
    triggers: ['figma library', 'design system library', 'figma from codebase', 'sync figma'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },
  {
    id: 'figma-implement-design',
    description:
      'Translate Figma designs into production-ready code with 1:1 visual fidelity. Useful for handing off Figma frames straight to a frontend agent.',
    triggers: ['figma to code', 'implement figma', 'figma fidelity', '1:1 figma'],
    mode: 'design-system',
    category: 'figma',
    upstream: 'https://github.com/figma/skills',
    attribution: 'Curated from Figma\'s MCP server guide.',
  },

  // -------------------------------------------------------------------------
  // Animation & motion
  // -------------------------------------------------------------------------
  {
    id: 'gsap-core',
    description:
      'Core GSAP API with gsap.to(), from(), fromTo(), easing, duration, stagger, and defaults. Production-grade web animation primitives.',
    triggers: ['gsap', 'gsap core', 'web animation', 'tween', 'easing'],
    mode: 'prototype',
    category: 'animation-motion',
    upstream: 'https://github.com/greensock/skills',
    attribution: 'Curated from GreenSock (GSAP).',
  },
  {
    id: 'gsap-timeline',
    description:
      'GSAP Timelines with sequencing, position parameter, labels, nesting, and playback control. Useful for orchestrating multi-step motion sequences.',
    triggers: ['gsap timeline', 'animation timeline', 'sequenced animation', 'motion choreography'],
    mode: 'prototype',
    category: 'animation-motion',
    upstream: 'https://github.com/greensock/skills',
    attribution: 'Curated from GreenSock (GSAP).',
  },
  {
    id: 'gsap-scrolltrigger',
    description:
      'GSAP ScrollTrigger for scroll-linked animations, pinning, scrub, and refresh handling. Useful for editorial sites and product pages.',
    triggers: ['scrolltrigger', 'scroll animation', 'gsap scroll', 'scroll pin', 'scroll scrub'],
    mode: 'prototype',
    category: 'animation-motion',
    upstream: 'https://github.com/greensock/skills',
    attribution: 'Curated from GreenSock (GSAP).',
  },
  {
    id: 'gsap-react',
    description:
      'GSAP React integration with useGSAP hook, refs, gsap.context(), cleanup, and SSR. Ships safe motion in React + Next.js apps.',
    triggers: ['gsap react', 'usegsap', 'react animation', 'gsap context', 'react motion'],
    mode: 'prototype',
    category: 'animation-motion',
    upstream: 'https://github.com/greensock/skills',
    attribution: 'Curated from GreenSock (GSAP).',
  },
  {
    id: 'flutter-animating-apps',
    description:
      'Implement animated effects, transitions, and motion in Flutter apps. Useful for native iOS/Android motion design.',
    triggers: ['flutter animation', 'flutter motion', 'mobile animation', 'flutter transitions'],
    mode: 'prototype',
    category: 'animation-motion',
    upstream: 'https://github.com/flutter/skills',
    attribution: 'Curated from the Flutter team.',
  },

  // -------------------------------------------------------------------------
  // Diagrams & visualization
  // -------------------------------------------------------------------------
  {
    id: 'd3-visualization',
    description:
      'Teaches the agent to produce D3 charts and interactive data visualizations. Useful for editorial dashboards, reports, and explanatory graphics.',
    triggers: ['d3', 'd3.js', 'interactive chart', 'data visualization', 'editorial chart'],
    mode: 'prototype',
    category: 'diagrams',
    upstream: 'https://github.com/chrisvoncsefalvay/d3-claude-skill',
    attribution: 'Curated from @chrisvoncsefalvay.',
  },
  {
    id: 'hand-drawn-diagrams',
    description:
      'Generate hand-drawn Excalidraw diagrams from a prompt — animated SVG, hosted edit link, and PNG export. Works with Claude Code, Codex, Gemini CLI, and any agent supporting standard skill paths.',
    triggers: ['excalidraw', 'hand drawn diagram', 'sketch diagram', 'whiteboard diagram'],
    mode: 'prototype',
    category: 'diagrams',
    upstream: 'https://github.com/muthuishere/hand-drawn-diagrams',
    attribution: 'Curated from @muthuishere.',
  },

  // -------------------------------------------------------------------------
  // Creative direction & critique
  // -------------------------------------------------------------------------
  {
    id: 'creative-director',
    description:
      'AI creative director with recursive self-assessment: 20+ methodologies (SIT, TRIZ, Bisociation, SCAMPER, Synectics), 3-axis evaluation calibrated against Cannes/D&AD/HumanKind, 5-phase process from brief to presentation.',
    triggers: ['creative director', 'campaign concept', 'creative critique', 'cannes review', 'scamper'],
    mode: 'design-system',
    category: 'creative-direction',
    upstream: 'https://github.com/smixs/creative-director-skill',
    attribution: 'Curated from @smixs.',
  },
  {
    id: 'design-consultation',
    description:
      'Build a complete design system from scratch with creative risks and realistic product mockups. Useful for kickoff workshops and brand-from-zero work.',
    triggers: ['design consultation', 'design from scratch', 'design system kickoff', 'brand workshop'],
    mode: 'design-system',
    category: 'creative-direction',
    upstream: 'https://github.com/garrytan/gstack',
    attribution: 'Curated from Garry Tan (gstack).',
  },
  {
    id: 'design-review',
    description:
      'Designer Who Codes: visual audit then fixes with atomic commits and before/after screenshots. Useful for tightening shipped UI before launch.',
    triggers: ['design review', 'visual audit', 'before after', 'pre launch design check'],
    mode: 'design-system',
    category: 'creative-direction',
    upstream: 'https://github.com/garrytan/gstack',
    attribution: 'Curated from Garry Tan (gstack).',
  },
  {
    id: 'plan-design-review',
    description:
      'Senior Designer review: rates each design dimension 0-10, explains what a 10 looks like, and flags AI Slop signals. Useful as a gate before merging UI work.',
    triggers: ['plan design review', 'senior designer review', 'design rating', 'ai slop check'],
    mode: 'design-system',
    category: 'creative-direction',
    upstream: 'https://github.com/garrytan/gstack',
    attribution: 'Curated from Garry Tan (gstack).',
  },
  {
    id: 'brainstorming',
    description:
      'Transform rough ideas into fully-formed designs through structured questioning and alternative exploration. Useful early in concept work.',
    triggers: ['brainstorm', 'ideation', 'concept exploration', 'rough ideas', 'design alternatives'],
    mode: 'design-system',
    category: 'creative-direction',
    upstream: 'https://github.com/obra/superpowers',
    attribution: 'Curated from @obra.',
  },

  // -------------------------------------------------------------------------
  // Marketing & ad creative
  // -------------------------------------------------------------------------
  {
    id: 'ad-creative',
    description:
      'Generate and iterate ad creative including headlines, descriptions, and primary text. Useful for paid social and search ad iteration.',
    triggers: ['ad creative', 'ad headline', 'ad copy', 'paid social ad', 'search ad'],
    mode: 'design-system',
    category: 'marketing-creative',
    upstream: 'https://github.com/coreyhaines31/marketingskills',
    attribution: 'Curated from Corey Haines.',
  },
  {
    id: 'copywriting',
    description:
      'Write and rewrite marketing copy for landing pages, homepages, and ads. Useful as a copy chief partner during launches.',
    triggers: ['copywriting', 'landing copy', 'ad copy', 'homepage copy', 'rewrite copy'],
    mode: 'design-system',
    category: 'marketing-creative',
    upstream: 'https://github.com/coreyhaines31/marketingskills',
    attribution: 'Curated from Corey Haines.',
  },
  {
    id: 'marketing-psychology',
    description:
      'Apply psychological principles and behavioral science to copy and design. Useful for tightening hooks, framing, and pricing presentation.',
    triggers: ['marketing psychology', 'behavioral copy', 'persuasion', 'framing', 'cognitive bias'],
    mode: 'design-system',
    category: 'marketing-creative',
    upstream: 'https://github.com/coreyhaines31/marketingskills',
    attribution: 'Curated from Corey Haines.',
  },
  {
    id: 'paywall-upgrade-cro',
    description:
      'Design and optimize upgrade screens, paywalls, and upsell modals. Useful for SaaS conversion design and pricing-page experiments.',
    triggers: ['paywall', 'upgrade screen', 'cro paywall', 'upsell modal', 'pricing screen'],
    mode: 'design-system',
    category: 'marketing-creative',
    upstream: 'https://github.com/coreyhaines31/marketingskills',
    attribution: 'Curated from Corey Haines.',
  },
  {
    id: 'competitive-ads-extractor',
    description:
      'Extract and analyze competitors\' ads from ad libraries to understand messaging and creative approaches that resonate.',
    triggers: ['competitive ads', 'ad library extract', 'competitor creative', 'ad teardown'],
    mode: 'design-system',
    category: 'marketing-creative',
    upstream: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/competitive-ads-extractor',
    attribution: 'Curated from ComposioHQ awesome-claude-skills.',
  },
  {
    id: 'domain-name-brainstormer',
    description:
      'Generate creative domain name ideas and check availability across multiple TLDs including .com, .io, .dev, and .ai.',
    triggers: ['domain name', 'brainstorm domain', 'tld check', 'startup name', 'product name'],
    mode: 'design-system',
    category: 'marketing-creative',
    upstream: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/domain-name-brainstormer',
    attribution: 'Curated from ComposioHQ awesome-claude-skills.',
  },

  // -------------------------------------------------------------------------
  // Screenshots & capture (creative reference, marketing assets)
  // -------------------------------------------------------------------------
  {
    id: 'screenshot',
    description:
      'Capture desktop, app windows, or pixel regions across OS platforms. Useful for marketing screenshots, design reviews, and bug reports.',
    triggers: ['screenshot', 'capture screen', 'window screenshot', 'pixel region capture'],
    mode: 'image',
    category: 'screenshots',
    upstream: 'https://github.com/openai/skills',
    attribution: 'Curated from OpenAI\'s skills repository.',
  },
  {
    id: 'screenshots-marketing',
    description:
      'Generate marketing screenshots with Playwright. Useful for landing-page hero shots, App Store screenshots, and changelog visuals.',
    triggers: ['marketing screenshot', 'playwright screenshot', 'hero shot', 'app store screenshot'],
    mode: 'image',
    category: 'screenshots',
    upstream: 'https://github.com/Shpigford/screenshots',
    attribution: 'Curated from @Shpigford.',
  },
  {
    id: 'full-page-screenshot',
    description:
      'Capture full-page screenshots of web pages via Chrome DevTools Protocol with zero dependencies. Useful for portfolios, case studies, and audit reports.',
    triggers: ['full page screenshot', 'long screenshot', 'devtools screenshot', 'web capture'],
    mode: 'image',
    category: 'screenshots',
    upstream: 'https://github.com/LewisLiu007/full-page-screenshot',
    attribution: 'Curated from @LewisLiu007.',
  },

  // -------------------------------------------------------------------------
  // Web artifacts & creative HTML output
  // -------------------------------------------------------------------------
  {
    id: 'artifacts-builder',
    description:
      'Suite of tools for creating elaborate, multi-component claude.ai HTML artifacts using modern frontend web technologies (React, Tailwind CSS, shadcn/ui).',
    triggers: ['artifacts builder', 'html artifact', 'multi component artifact', 'react artifact'],
    mode: 'prototype',
    category: 'web-artifacts',
    upstream: 'https://github.com/ComposioHQ/awesome-claude-skills/tree/master/artifacts-builder',
    attribution: 'Curated from ComposioHQ awesome-claude-skills.',
  },
  {
    id: 'web-artifacts-builder',
    description:
      'Build complex claude.ai HTML artifacts with React and Tailwind. Anthropic\'s reference workflow for shipping rich, embeddable artifacts.',
    triggers: ['web artifacts', 'tailwind artifact', 'react artifact', 'anthropic artifact'],
    mode: 'prototype',
    category: 'web-artifacts',
    upstream: 'https://github.com/anthropics/skills/tree/main/web-artifacts-builder',
    attribution: 'Curated from Anthropic\'s official skills repository.',
  },
  {
    id: 'frontend-dev',
    description:
      'Full-stack frontend with cinematic animations, AI-generated media via MiniMax API, and generative art. Useful for hero pages and showcase sites.',
    triggers: ['frontend dev', 'cinematic frontend', 'generative web', 'hero page', 'showcase site'],
    mode: 'prototype',
    category: 'web-artifacts',
    upstream: 'https://github.com/MiniMax-AI/skills',
    attribution: 'Curated from the MiniMax AI team.',
  },
];

function buildBody(s: CuratedSkill): string {
  const lines: string[] = [];
  lines.push(`# ${s.id}`);
  lines.push('');
  if (s.attribution) {
    lines.push(`> ${s.attribution}`);
    lines.push('');
  }
  if (s.tagline) {
    lines.push(s.tagline);
    lines.push('');
  }
  lines.push('## What it does');
  lines.push('');
  lines.push(s.description);
  lines.push('');
  lines.push('## Source');
  lines.push('');
  lines.push(`- Upstream: ${s.upstream}`);
  lines.push(`- Category: \`${s.category}\``);
  lines.push('');
  lines.push('## How to use');
  lines.push('');
  lines.push(
    'This catalogue entry advertises the skill in Open Design so the agent',
  );
  lines.push(
    'discovers it during planning. To run the full upstream workflow with',
  );
  lines.push(
    'its original assets, scripts, and references, install the upstream',
  );
  lines.push('bundle into your active agent\'s skills directory:');
  lines.push('');
  lines.push('```bash');
  lines.push(`# Inspect the upstream README for exact paths`);
  lines.push(`open ${s.upstream}`);
  lines.push('```');
  lines.push('');
  lines.push(
    'Then ask the agent to invoke this skill by name (`' + s.id + '`) or with',
  );
  lines.push(
    'one of the trigger phrases listed in this skill\'s frontmatter.',
  );
  lines.push('');
  return lines.join('\n');
}

function buildFrontmatter(s: CuratedSkill): string {
  const lines: string[] = ['---', `name: ${s.id}`];
  lines.push('description: |');
  for (const ln of s.description.split(/\r?\n/)) {
    lines.push(`  ${ln}`);
  }
  lines.push('triggers:');
  for (const t of s.triggers) {
    lines.push(`  - "${t.replace(/"/g, '\\"')}"`);
  }
  lines.push('od:');
  lines.push(`  mode: ${s.mode}`);
  lines.push(`  category: ${s.category}`);
  lines.push(`  upstream: "${s.upstream}"`);
  lines.push('---');
  return lines.join('\n');
}

function writeSkill(s: CuratedSkill): 'created' | 'skipped' {
  const dir = path.join(SKILLS_ROOT, s.id);
  const skillPath = path.join(dir, 'SKILL.md');
  if (existsSync(skillPath)) return 'skipped';
  mkdirSync(dir, { recursive: true });
  const md = `${buildFrontmatter(s)}\n\n${buildBody(s)}`;
  writeFileSync(skillPath, md, 'utf8');
  return 'created';
}

function main(): void {
  let created = 0;
  let skipped = 0;
  for (const entry of CATALOGUE) {
    const result = writeSkill(entry);
    if (result === 'created') created += 1;
    else skipped += 1;
  }
  // eslint-disable-next-line no-console
  console.log(
    `seed-curated-design-skills: ${created} created, ${skipped} skipped (already existed). Catalogue size: ${CATALOGUE.length}.`,
  );
}

main();
