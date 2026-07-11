import type { Dict } from '../../i18n/types';
import type { StarterPrompt } from './types';

export const CHAT_MESSAGE_VIRTUALIZE_THRESHOLD = 80;
export const CHAT_MESSAGE_OVERSCAN_PX = 900;
export const CHAT_VIRTUAL_ROW_GAP_PX = 14;
export const CHAT_VIRTUAL_MIN_ROW_HEIGHT = 36;
export const CHAT_VIRTUAL_DEFAULT_VIEWPORT_PX = 640;
export const CHAT_VIRTUAL_INITIAL_TAIL_ROWS = 16;

export const WORKSPACE_DESIGN_FILES_TAB = '__design_files__';
export const WORKSPACE_DESIGN_SYSTEM_TAB = '__design_system__';

export const IMPORTED_ARTIFACTS_INITIAL_VISIBLE_COUNT = 5;
export const IMPORTED_ARTIFACTS_REVEAL_COUNT = 5;

export const QUEUED_SEND_DRAG_MIME = 'application/x-open-design-queued-send';
export const QUEUED_SEND_VISIBLE_ROW_COUNT = 4;

// Featured starter prompts shown on the empty chat. Clicking one fills
// the composer (does not auto-send) so users can tweak before sending.
// Each prompt is intentionally dense — it should showcase ambitious
// layout, typographic, and information-design moves rather than a
// generic landing page.
//
// Starter sets are picked per project kind (and per video model) so a
// fresh seedance video, a hyperframes html-in-canvas video, an image
// project and an audio project each see relevant prompts instead of the
// generic starter set. The default (prototype/deck/template/other/
// live-artifact) set stays i18n-translated via existing chat.example*
// keys so the user-facing copy keeps its localizations. The new media
// sets are inline English literals — they are technical agent prompts
// that work well across locales without translation, and going through
// i18n for each of them would balloon every Dict entry by 12+ keys.
export const DEFAULT_STARTER_KEYS: Array<{
  icon: string;
  titleKey: keyof Dict;
  tagKey: keyof Dict;
  promptKey: keyof Dict;
}> = [
  {
    icon: '▤',
    titleKey: 'chat.example1Title',
    tagKey: 'chat.example1Tag',
    promptKey: 'chat.example1Prompt',
  },
  {
    icon: '▦',
    titleKey: 'chat.example2Title',
    tagKey: 'chat.example2Tag',
    promptKey: 'chat.example2Prompt',
  },
  {
    icon: '◈',
    titleKey: 'chat.example3Title',
    tagKey: 'chat.example3Tag',
    promptKey: 'chat.example3Prompt',
  },
  {
    icon: '▶',
    titleKey: 'chat.example4Title',
    tagKey: 'chat.example4Tag',
    promptKey: 'chat.example4Prompt',
  },
];

export const IMAGE_STARTERS: StarterPrompt[] = [
  {
    icon: '◯',
    title: 'Editorial portrait',
    tag: 'Portrait',
    prompt:
      'A close-up editorial portrait of a young creative director in their late 20s, soft natural light through tall studio windows, warm neutral palette (cream, taupe, soft black), shot at 85mm f/1.8 with shallow depth of field, sharp gaze straight to camera, subtle film grain, no makeup look.',
  },
  {
    icon: '▭',
    title: 'Product hero',
    tag: 'E-commerce',
    prompt:
      'A premium product hero shot of a single matte ceramic coffee mug on a warm cream paper backdrop. Hard rim light from the upper-left, gentle elongated shadow stretching to the lower-right, faint steam rising from the cup. Square crop, centered composition, room above for headline copy, no props or hands in frame.',
  },
  {
    icon: '◐',
    title: 'Flat illustration',
    tag: 'Illustration',
    prompt:
      'A flat vector illustration of a cozy reading nook by a rainy window — geometric shapes, restrained 5-color palette (cream, terracotta, deep teal, burnt sienna, soft black), thin 1.5px line accents, no gradients, no textures, soft drop shadows only on the foreground armchair.',
  },
];

// Pure-video / cinematic-shot starters for seedance, sora, kling, veo,
// grok-imagine and similar text-to-video models. Each prompt is one
// shot, restrained motion, and a clear visual concept the model can
// nail in 5-10 seconds.
export const VIDEO_SEEDANCE_STARTERS: StarterPrompt[] = [
  {
    icon: '◉',
    title: 'Product reveal',
    tag: 'Cinematic',
    prompt:
      'A 5-second product reveal: a minimal high-end skincare bottle on a clean cream stone surface, soft side light from camera-left, slow camera push-in, subtle depth-of-field shift from the cap to the label, restrained motion, no text overlays, no people in frame.',
  },
  {
    icon: '▣',
    title: 'Lantern close-up',
    tag: 'Mood',
    prompt:
      'A 6-second cinematic close-up of a young woman holding a glowing paper lantern in a misty pine forest at golden hour. Shallow depth of field on her eyes, gentle dolly-in, ambient particles drifting through the warm shaft of light, no dialogue, ambient forest sound only.',
  },
  {
    icon: '⌘',
    title: 'Neon street drift',
    tag: 'Action',
    prompt:
      'A 5-second street-racing tracking shot at night in a neon-lit cyberpunk Hong Kong alley. Low-angle camera following a matte-black sports car drifting around a tight corner, motion blur on the wheels, lens flares from oncoming neon signs, rain-slick asphalt reflecting the lights, no on-screen text.',
  },
];

// HyperFrames HTML-in-canvas starters — these target the
// hyperframes-html video model where the renderer captures live DOM
// into a WebGL texture and runs shader effects on top. References:
// https://www.remotion.dev/docs/html-in-canvas (concept), the seven
// vfx-* catalog blocks shipped via `npx hyperframes add vfx-*`, and
// skills/hyperframes/references/html-in-canvas.md.
export const VIDEO_HYPERFRAMES_STARTERS: StarterPrompt[] = [
  {
    icon: '◉',
    title: 'Magnifying glass reveal',
    tag: 'HTML-in-canvas',
    prompt:
      'Make a 5-second composition with a single line of bold display text on a clean canvas. Animate a round magnifying glass that travels left to right across the line, with subtle glass refraction warping the letters underneath as it passes. Use HyperFrames html-in-canvas — capture the text DOM and run the lens shader on top via a vfx-liquid-glass-style pass. Pure CSS for the text; the glass is a WebGL layer.',
  },
  {
    icon: '▦',
    title: 'CRT terminal scene',
    tag: 'Vintage VFX',
    prompt:
      "Make a CRT-screen composition: dark canvas, monospace terminal text typing `npx hyperframes init my-video`, then `claude` invoked with the prompt 'Add a CRT effect using HTML-in-canvas'. Apply a subtle convex-curvature shader, scanlines, slight chromatic aberration, and a soft phosphor glow on top of the live DOM via html-in-canvas. The terminal text stays as real CSS so it's pixel-sharp before the shader pass.",
  },
  {
    icon: '◈',
    title: 'Glitch breakdown',
    tag: 'Glitch',
    prompt:
      'Build a 6-second composition that displays a hero headline and a one-line subhead on a dark canvas, then breaks into a hard digital glitch — RGB channel split, horizontal displacement bands, brief frame-stutter, and a final clean reset. Capture the live DOM via html-in-canvas and run the glitch pass on top, so the type is real CSS underneath the shader.',
  },
];

// Speech-focused audio starters — the New Project audio panel only
// surfaces the `speech` kind today (see MediaProjectOptions), so we
// match that. If/when the music + sfx tabs come back, broaden this set.
export const AUDIO_STARTERS: StarterPrompt[] = [
  {
    icon: '♪',
    title: 'Brand voiceover',
    tag: 'Speech',
    prompt:
      "A 30-second warm-toned narrative voiceover for a product launch video — confident but conversational, mid-tempo, with a beat of pause after the brand name. Script: 'Three years in the making. One simple promise. Meet [product name] — the way work was supposed to feel.' English, neutral North American accent.",
  },
  {
    icon: '♫',
    title: 'Onboarding narration',
    tag: 'Speech',
    prompt:
      "A 20-second friendly onboarding narration for a mobile app's first-launch screen. Reassuring, smiling tone, slow enough to feel attentive without sounding scripted. Script: 'Welcome to Loop. Let's set up your space — three quick questions and you're in. You can change any of this later.'",
  },
  {
    icon: '♬',
    title: 'Story passage read',
    tag: 'Speech',
    prompt:
      "A 45-second cinematic read of an opening passage. Low, measured delivery with breath between sentences, slightly intimate close-mic'd quality. Script: 'The city sleeps in pieces. A neon sign flickers above the ramen counter. Across the avenue, a window glows — the only one still on this side of midnight.'",
  },
];
