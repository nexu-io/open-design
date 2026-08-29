/*
 * Localized copy for the curated "Codex design" collection: the collection
 * page, the flat `/plugins/<slug>/` skill detail pages, and the shared page
 * chrome around them.
 *
 * English is the authoritative source. Every other landing locale ships a
 * translated override in `codex-i18n/<locale>.ts`; anything a locale omits
 * falls back to English key by key, so adding a string here never breaks a
 * locale build.
 *
 * Structural fields (slug, image, href, source URLs) deliberately live in
 * `codex-design.ts`, not here — translators only ever see prose.
 */
import type { LandingLocaleCode } from '../i18n';
import { DEFAULT_LOCALE } from '../i18n';
import { CODEX_COLLECTION, CODEX_SKILLS, type CodexSkillCategory } from './codex-design';
import { CODEX_COPY_OVERRIDES } from './codex-i18n/index';
import {
  curatedSkillCopy,
  mergeCuratedCopy,
  type CuratedCopyBase,
  type CuratedSkillCopy,
} from './curated-collection';

/** Prose for one curated skill, keyed by slug in `CodexCopy.skills`. */
export type CodexSkillCopy = CuratedSkillCopy;

export interface CodexCopy extends CuratedCopyBase {
  /* Category names, shown as card labels and in the "why these" strip.
     Each collection owns its category-label keys; everything else is the
     shared curated-collection chrome (see `CuratedCopyBase`). */
  readonly categoryFrontend: string;
  readonly categoryDesignSystems: string;
}

/*
 * The English baseline derives its prose from `codex-design.ts` so there is
 * exactly one copy of the source text; only chrome strings are authored here.
 */
const en: CodexCopy = {
  collectionEyebrow: 'Curated collection',
  collectionHeading: CODEX_COLLECTION.heading,
  collectionLede: CODEX_COLLECTION.lede,
  collectionStats: CODEX_COLLECTION.stats,
  collectionIntro: CODEX_COLLECTION.intro,
  collectionCategoryBlurbs: CODEX_COLLECTION.categories.map((c) => c.blurb),
  collectionCloserHeading: 'Skip the setup. Design with Codex inside OpenDesign',
  filterAll: 'All',
  collectionCloserBody:
    'OpenDesign is the open-source, agent-native design workspace that runs around Codex. It keeps your systems, skills and templates consistent, so the agent ships work you own.',

  categoryFrontend: 'Frontend & UI',
  categoryDesignSystems: 'Design Systems',

  ctaDownload: 'Download OpenDesign',
  ctaStarList: 'Star the list',
  ctaBrowseAll: 'Browse all plugins',
  ctaViewSource: 'View source',
  ctaOurRepo: 'codex-design on GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'What it does',
  cardCta: 'View plugin',

  detailWhatIsIt: 'What it is',
  detailWhyForDesign: 'Why it matters for design',
  detailHowWithAgent: 'How to run it with Codex',
  detailExampleTag: 'When to reach for it',
  detailSource: 'Source',
  detailCategory: 'Category',
  detailMaintainer: 'Author',
  detailTags: 'Tags',
  detailLicense: 'License',
  detailCovers: 'What it covers',
  detailUpstream: 'From the upstream SKILL.md',
  detailAgentNote: 'Works with Codex',
  detailTraction: 'Traction',
  detailRepo: 'Source repo',
  detailStars: 'Stars',

  installHeading: 'How to install',
  installRunInAgent: 'Run this inside Codex.',
  installRestart: 'Restart Codex so it picks up the new skill.',
  installClone: 'Clone the repo.',
  installPoint: 'Point Codex at the skill file.',
  installThenUse: 'Then describe the UI you want. Codex follows the skill.',

  installNote:
    'Every plugin here is free, open source, and links to its real upstream source.',
  installNoteCta: 'Browse the whole collection',
  detailMoreOnList: 'More on the codex-design list',
  detailRelated: 'More Codex design plugins',
  finalEyebrow: 'Next step',
  detailCloserHeading: 'Design with OpenDesign, without the setup',
  detailCloserBody:
    'Install this plugin yourself, or run a whole curated design layer around Codex with OpenDesign. Bring your own key, own your output.',

  skills: Object.fromEntries(
    CODEX_SKILLS.map((s) => [
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
 * translate the chrome first and the long-form skill prose later without
 * breaking the build.
 */
export function getCodexCopy(locale: LandingLocaleCode): CodexCopy {
  if (locale === DEFAULT_LOCALE) return en;
  return mergeCuratedCopy(en, CODEX_COPY_OVERRIDES[locale]);
}

/**
 * Prose for one skill. Every slug in `CODEX_SKILLS` is present in the English
 * baseline by construction, so a miss means the two files drifted — surface it
 * as a build failure instead of rendering blanks.
 */
export function skillCopy(copy: CodexCopy, slug: string): CodexSkillCopy {
  return curatedSkillCopy('Codex', copy, slug);
}

/** Localized label for a skill's category (categories are a closed set). */
export function categoryLabel(copy: CodexCopy, category: CodexSkillCategory): string {
  switch (category) {
    case 'Frontend & UI':
      return copy.categoryFrontend;
    case 'Design Systems':
      return copy.categoryDesignSystems;
  }
}

export const CODEX_COPY_EN = en;
