import type { DesignSystemSummary } from '../types';

/**
 * Maps a design system's authored metadata to prompt-template gallery categories.
 * Used when the workspace default design system is image/video-aligned so the
 * template tabs can narrow results without per-template schema coupling.
 */
export function inferPromptTemplateCategoriesForDs(
  ds: DesignSystemSummary,
): string[] | null {
  const blob = `${ds.category} ${ds.title} ${ds.summary}`.toLowerCase();
  const out = new Set<string>();
  const add = (cats: string[]) => {
    for (const c of cats) out.add(c);
  };

  if (/anime|manga|illustration|creative|artistic|editorial/i.test(blob)) {
    add([
      'Anime',
      'Anime / Manga',
      'Illustration',
      'Profile / Avatar',
      'Social Media Post',
    ]);
  }
  if (/game|gaming|\bgui\b|\bui\b|interface/i.test(blob)) {
    add(['Game UI', 'App / Web Design']);
  }
  if (/e-?commerce|retail|shopping|product|saas|marketplace|store/i.test(blob)) {
    add(['Product', 'Social Media Post', 'Marketing', 'App / Web Design']);
  }
  if (/fintech|finance|crypto|payment|bank|stripe/i.test(blob)) {
    add(['App / Web Design', 'Data', 'Marketing', 'Branding']);
  }
  if (/developer|tool|api|backend|data|engineering|llm|ai\b/i.test(blob)) {
    add(['App / Web Design', 'Data', 'General']);
  }
  if (
    /video|cinematic|film|motion|advertis|marketing|media|social|meme|travel|vfx|fantasy|short form/i.test(
      blob,
    )
  ) {
    add([
      'Cinematic',
      'Motion Graphics',
      'Advertising',
      'Marketing',
      'Social / Meme',
      'Travel',
      'VFX / Fantasy',
      'Short Form',
    ]);
  }
  if (/automotive|car|vehicle|motor/i.test(blob)) {
    add(['Product', 'Cinematic', 'Advertising']);
  }
  if (/\bbrand/i.test(blob)) {
    add(['Branding']);
  }
  if (/infographic|data\s+viz|chart|diagram/i.test(blob)) {
    add(['Infographic', 'Data']);
  }
  if (/profile|avatar|portrait/i.test(blob)) {
    add(['Profile / Avatar']);
  }

  return out.size > 0 ? [...out] : null;
}
