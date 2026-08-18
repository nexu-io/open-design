/*
 * Localized copy for the curated "DeepSeek Harness design" collection: the
 * collection page, the flat `/plugins/<slug>/` plugin detail pages, and the
 * shared page chrome around them.
 *
 * English is the authoritative source. Every other landing locale ships a
 * translated override in `deepseek-i18n/<locale>.ts`; anything a locale
 * omits falls back to English key by key, so adding a string here never
 * breaks a locale build.
 *
 * Structural fields (slug, image, href, source URLs) deliberately live in
 * `deepseek-design.ts`, not here — translators only ever see prose.
 */
import type { LandingLocaleCode } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n';
import {
  DEEPSEEK_COLLECTION,
  DEEPSEEK_SKILLS,
  type DeepseekSkillCategory,
} from './deepseek-design';
import { DEEPSEEK_COPY_OVERRIDES } from './deepseek-i18n/index';
import {
  curatedSkillCopy,
  mergeCuratedCopy,
  type CuratedCopyBase,
  type CuratedSkillCopy,
} from './curated-collection';

export type DeepseekSkillCopy = CuratedSkillCopy;

export interface DeepseekCopy extends CuratedCopyBase {
  /* Category names, shown as card labels and in the "why these" strip. */
  readonly categoryVision: string;
  readonly categoryCanvas: string;
  readonly categoryWorkflow: string;
  readonly categoryWorkspace: string;
}

/*
 * The English baseline derives its prose from `deepseek-design.ts` so there
 * is exactly one copy of the source text; only chrome strings are authored
 * here.
 */
const en: DeepseekCopy = {
  collectionEyebrow: 'Curated collection',
  collectionHeading: DEEPSEEK_COLLECTION.heading,
  collectionLede: DEEPSEEK_COLLECTION.lede,
  collectionStats: DEEPSEEK_COLLECTION.stats,
  collectionIntro: DEEPSEEK_COLLECTION.intro,
  collectionCategoryBlurbs: DEEPSEEK_COLLECTION.categories.map((c) => c.blurb),
  collectionCloserHeading: 'Skip the setup. Design with DeepSeek Harness inside Open Design',
  filterAll: 'All',
  collectionCloserBody:
    'Open Design is the open-source, agent-native design workspace that runs around DeepSeek Harness. It keeps your systems, skills and templates consistent, so the agent ships work you own.',

  categoryVision: 'Vision & Input',
  categoryCanvas: 'Canvas & Generative UI',
  categoryWorkflow: 'Design Workflow',
  categoryWorkspace: 'Workspace & Preview',


  ctaDownload: 'Download Open Design',
  ctaStarList: 'Star DeepSeek Harness',
  ctaGuide: 'See how to design with DeepSeek Harness',
  ctaBrowseAll: 'Browse all plugins',
  ctaViewSource: 'View source',
  ctaOurRepo: 'deepseek-harness on GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'What it does',
  cardCta: 'View plugin',

  detailWhatIsIt: 'What it is',
  detailWhyForDesign: 'Why it matters for design',
  detailHowWithAgent: 'How to run it with DeepSeek Harness',
  detailExampleTag: 'When to reach for it',
  detailSource: 'Source',
  detailCategory: 'Category',
  detailMaintainer: 'Author',
  detailTags: 'Tags',
  detailLicense: 'License',
  detailCovers: 'What it covers',
  detailUpstream: 'From the upstream README',
  detailAgentNote: 'Works with DeepSeek Harness',
  detailTraction: 'Traction',
  detailRepo: 'Source repo',
  detailStars: 'Stars',

  installHeading: 'How to install',
  installRunInAgent: 'Run this in a terminal.',
  installRestart: 'Restart dsh web so it picks up the plugin.',
  installClone: 'Clone the repo.',
  installPoint: 'Point DeepSeek Harness at the skill file.',
  installThenUse: 'Then describe the design you want. The harness picks up the plugin’s tools.',

  installNote:
    'Every plugin here is free to install and links to its real upstream source.',
  installNoteCta: 'Browse the whole collection',
  detailMoreOnList: 'More in the DeepSeek Harness repo',
  detailRelated: 'More DeepSeek Harness design plugins',
  finalEyebrow: 'Next step',
  detailCloserHeading: 'Design with Open Design, without the setup',
  detailCloserBody:
    'Install this plugin yourself, or run a whole curated design layer around DeepSeek Harness with Open Design. Bring your own key, own your output.',

  skills: Object.fromEntries(
    DEEPSEEK_SKILLS.map((s) => [
      s.slug,
      {
        name: s.name,
        tagline: s.tagline,
        whatIsIt: s.whatIsIt,
        whyForDesign: s.whyForDesign,
        howWithAgent: s.howWithAgent,
        example: s.example,
      },
    ]),
  ),
};

/**
 * Locale copy with English fallback. Overrides are `Partial`, so a locale can
 * translate the chrome first and the long-form plugin prose later without
 * breaking the build.
 */
export function getDeepseekCopy(locale: LandingLocaleCode): DeepseekCopy {
  if (locale === DEFAULT_LOCALE) return en;
  return mergeCuratedCopy(en, DEEPSEEK_COPY_OVERRIDES[locale]);
}

export function deepseekSkillCopy(copy: DeepseekCopy, slug: string): DeepseekSkillCopy {
  return curatedSkillCopy('DeepSeek Harness', copy, slug);
}

/** Localized label for a plugin's category (categories are a closed set). */
export function deepseekCategoryLabel(
  copy: DeepseekCopy,
  category: DeepseekSkillCategory,
): string {
  switch (category) {
    case 'Vision & Input':
      return copy.categoryVision;
    case 'Canvas & Generative UI':
      return copy.categoryCanvas;
    case 'Design Workflow':
      return copy.categoryWorkflow;
    case 'Workspace & Preview':
      return copy.categoryWorkspace;
  }
}

export const DEEPSEEK_COPY_EN = en;
