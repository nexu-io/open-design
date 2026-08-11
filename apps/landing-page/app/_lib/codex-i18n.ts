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

/** Prose for one curated skill, keyed by slug in `CodexCopy.skills`. */
export interface CodexSkillCopy {
  readonly name: string;
  readonly tagline: string;
  readonly whatIsIt: string;
  readonly whyForDesign: readonly string[];
  readonly howWithCodex: readonly string[];
  readonly example?: string;
}

export interface CodexCopy {
  /* Collection page. */
  readonly collectionEyebrow: string;
  readonly collectionHeading: string;
  readonly collectionLede: string;
  readonly collectionStats: readonly { readonly value: string; readonly label: string }[];
  readonly collectionIntro: string;
  readonly collectionCategoryBlurbs: readonly string[];
  readonly collectionCloserHeading: string;
  readonly collectionCloserBody: string;
  readonly filterAll: string;

  /* Category names, shown as card labels and in the "why these" strip. */
  readonly categoryFrontend: string;
  readonly categoryDesignSystems: string;

  /* Shared chrome. */
  readonly ctaDownload: string;
  readonly ctaStarList: string;
  readonly ctaBrowseAll: string;
  readonly ctaViewSource: string;
  readonly ctaOurRepo: string;
  readonly cardKind: string;
  readonly cardWhatItDoes: string;
  readonly cardCta: string;

  /* Detail page section headings. */
  readonly detailWhatIsIt: string;
  readonly detailWhyForDesign: string;
  readonly detailHowWithCodex: string;
  readonly detailExampleTag: string;
  readonly detailSource: string;
  readonly detailCategory: string;
  readonly detailMaintainer: string;
  readonly detailTags: string;
  readonly detailLicense: string;
  readonly detailCovers: string;
  readonly detailUpstream: string;
  readonly detailCodexNote: string;
  readonly detailTraction: string;
  readonly detailRepo: string;
  readonly detailStars: string;

  /* Install module. Shell commands live in the data, never in these strings. */
  readonly installHeading: string;
  readonly installRunInCodex: string;
  readonly installRestart: string;
  readonly installClone: string;
  readonly installPoint: string;
  readonly installThenUse: string;

  /* "How to install" module. The shell command itself is never translated. */
  readonly installNote: string;
  readonly installNoteCta: string;
  readonly detailMoreOnList: string;
  readonly detailRelated: string;
  readonly finalEyebrow: string;
  readonly detailCloserHeading: string;
  readonly detailCloserBody: string;

  /* Per-skill prose, keyed by the slug in `CODEX_SKILLS`. */
  readonly skills: Readonly<Record<string, CodexSkillCopy>>;
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
  collectionCloserHeading: 'Skip the setup. Design with Codex inside Open Design',
  filterAll: 'All',
  collectionCloserBody:
    'Open Design is the open-source, agent-native design workspace that runs around Codex. It keeps your systems, skills and templates consistent, so the agent ships work you own.',

  categoryFrontend: 'Frontend & UI',
  categoryDesignSystems: 'Design Systems',

  ctaDownload: 'Download Open Design',
  ctaStarList: 'Star the list',
  ctaBrowseAll: 'Browse all plugins',
  ctaViewSource: 'View source',
  ctaOurRepo: 'codex-design on GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'What it does',
  cardCta: 'View plugin',

  detailWhatIsIt: 'What it is',
  detailWhyForDesign: 'Why it matters for design',
  detailHowWithCodex: 'How to run it with Codex',
  detailExampleTag: 'When to reach for it',
  detailSource: 'Source',
  detailCategory: 'Category',
  detailMaintainer: 'Author',
  detailTags: 'Tags',
  detailLicense: 'License',
  detailCovers: 'What it covers',
  detailUpstream: 'From the upstream SKILL.md',
  detailCodexNote: 'Works with Codex',
  detailTraction: 'Traction',
  detailRepo: 'Source repo',
  detailStars: 'Stars',

  installHeading: 'How to install',
  installRunInCodex: 'Run this inside Codex.',
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
  detailCloserHeading: 'Design with Open Design, without the setup',
  detailCloserBody:
    'Install this plugin yourself, or run a whole curated design layer around Codex with Open Design. Bring your own key, own your output.',

  skills: Object.fromEntries(
    CODEX_SKILLS.map((s) => [
      s.slug,
      {
        name: s.name,
        tagline: s.tagline,
        whatIsIt: s.whatIsIt,
        whyForDesign: s.whyForDesign,
        howWithCodex: s.howWithCodex,
        example: s.example,
      },
    ]),
  ),
};

/**
 * Drop explicitly-undefined keys so a partial override never overwrites an
 * English value with `undefined` when spread on top of the baseline.
 */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

/**
 * Locale copy with English fallback. Overrides are `Partial`, so a locale can
 * translate the chrome first and the long-form skill prose later without
 * breaking the build.
 */
export function getCodexCopy(locale: LandingLocaleCode): CodexCopy {
  if (locale === DEFAULT_LOCALE) return en;
  const override = CODEX_COPY_OVERRIDES[locale];
  if (!override) return en;
  const skills: Record<string, CodexSkillCopy> = { ...en.skills };
  for (const [slug, copy] of Object.entries(override.skills ?? {})) {
    const base = en.skills[slug];
    // A slug the English baseline does not know about is a stale translation;
    // ignore it rather than rendering a half-populated page.
    if (!base || !copy) continue;
    // A skill's name is its published product name (the id you install), so it
    // stays in English in every locale — a translated name would not match the
    // upstream catalogue. Drop any `name` a translation supplied.
    const { name: _translatedName, ...translatable } = copy;
    skills[slug] = { ...base, ...stripUndefined(translatable) };
  }
  return { ...en, ...stripUndefined(override), skills };
}

/**
 * Prose for one skill. Every slug in `CODEX_SKILLS` is present in the English
 * baseline by construction, so a miss means the two files drifted — surface it
 * as a build failure instead of rendering blanks.
 */
export function skillCopy(copy: CodexCopy, slug: string): CodexSkillCopy {
  const entry = copy.skills[slug];
  if (!entry) throw new Error(`No Codex skill copy for slug "${slug}".`);
  return entry;
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
