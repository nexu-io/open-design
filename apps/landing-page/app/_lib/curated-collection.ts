/*
 * Shared shape of a curated external-plugin collection ("Codex design",
 * "DeepSeek Harness design", …): an editorial board of real, verified,
 * external skills for doing design with a coding agent, filed flat under
 * `/plugins/<slug>/` with a collection hub at `/plugins/<collection>/`.
 *
 * Each collection keeps its own data module (`codex-design.ts`,
 * `deepseek-design.ts`) and its own localized copy module; this file only
 * holds the types and the locale-merge helpers they share, so the two
 * collections cannot drift structurally.
 */
import type { LandingLocaleCode } from '../i18n';

export interface CuratedLink {
  readonly label: string;
  readonly url: string;
}

/**
 * `installer`: run `command` inside the agent, then restart it.
 * `clone`: clone the repo, then point the agent at `skillPath`.
 */
export type CuratedInstall =
  | { readonly kind: 'installer'; readonly command: string }
  | { readonly kind: 'clone'; readonly command: string; readonly skillPath: string };

export interface CuratedSkill<C extends string = string> {
  /** Route slug under /plugins/<slug>/ */
  readonly slug: string;
  readonly name: string;
  readonly category: C;
  /** Short attribution shown as a badge: "Official" for first-party catalogues, else author. */
  readonly badge: string;
  /** One-line promise. */
  readonly tagline: string;
  /** Illustration under /plugins/<collection>/skills/<file>. */
  readonly image: string;
  /** 1–2 sentence "what it is". */
  readonly whatIsIt: string;
  /** Why it matters for *design* specifically (bullets). */
  readonly whyForDesign: readonly string[];
  /** How you run it with the agent — plain steps. */
  readonly howWithAgent: readonly string[];
  /** Optional worked example / when-to-reach-for-it note. */
  readonly example?: string;
  /** Canonical upstream source (repo / folder). */
  readonly source: CuratedLink;
  /** `owner/name` of the source repo, used to look up snapshotted GitHub stats. */
  readonly repo: string;
  /** How this plugin is actually installed; commands are verbatim from the upstream README. */
  readonly install: CuratedInstall;
  /** Licence the upstream skill ships under (per-skill: catalogues are not uniform). */
  readonly license: CuratedLink;
  /** The `description` from the upstream SKILL.md frontmatter, verbatim. */
  readonly upstreamDescription: string;
  /**
   * What the upstream SKILL.md actually covers, taken from its own section
   * headings. Kept in English in every locale: these are the headings a reader
   * will meet when they open the file.
   */
  readonly covers: readonly string[];
  /** Optional extra reference (docs, author). */
  readonly reference?: CuratedLink;
  /** Filing tags shown in the detail sidebar; kept in English across locales. */
  readonly tags: readonly string[];
  /** Stargazers on the source repo, from a snapshot; shown as a popularity signal. */
  readonly stars?: number;
  /** How we know it works with this agent, quoting the repo's own README. */
  readonly agentNote?: string;
  /** Social/video traction with a number, for the popularity line. */
  readonly social?: string;
  /** When several upstream units are catalogued as one entry, what they are. */
  readonly bundle?: string;
}

export interface CuratedCollectionContent<C extends string = string> {
  readonly eyebrow: string;
  readonly heading: string;
  readonly lede: string;
  readonly stats: readonly { readonly value: string; readonly label: string }[];
  /** Intro paragraph above the skills grid. */
  readonly intro: string;
  /** "Why these" framing shown before the grid. */
  readonly categories: readonly { readonly key: C; readonly blurb: string }[];
}

/** Prose for one curated skill, keyed by slug in `CuratedCopyBase.skills`. */
export interface CuratedSkillCopy {
  readonly name: string;
  readonly tagline: string;
  readonly whatIsIt: string;
  readonly whyForDesign: readonly string[];
  readonly howWithAgent: readonly string[];
  readonly example?: string;
}

/**
 * Localized chrome + per-skill prose every curated collection provides.
 * Collection copy types extend this with their own category-label keys;
 * `CuratedBinding.categoryLabel` maps those back to a closed category set.
 */
export interface CuratedCopyBase {
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

  /* Shared chrome. */
  readonly ctaDownload: string;
  readonly ctaStarList: string;
  /** Optional hero CTA label for a collection whose hero links a guide page. */
  readonly ctaGuide?: string;
  readonly ctaBrowseAll: string;
  readonly ctaViewSource: string;
  readonly ctaOurRepo: string;
  readonly cardKind: string;
  readonly cardWhatItDoes: string;
  readonly cardCta: string;

  /* Detail page section headings. */
  readonly detailWhatIsIt: string;
  readonly detailWhyForDesign: string;
  readonly detailHowWithAgent: string;
  readonly detailExampleTag: string;
  readonly detailSource: string;
  readonly detailCategory: string;
  readonly detailMaintainer: string;
  readonly detailTags: string;
  readonly detailLicense: string;
  readonly detailCovers: string;
  readonly detailUpstream: string;
  readonly detailAgentNote: string;
  readonly detailTraction: string;
  readonly detailRepo: string;
  readonly detailStars: string;

  /* Install module. Shell commands live in the data, never in these strings. */
  readonly installHeading: string;
  readonly installRunInAgent: string;
  readonly installRestart: string;
  readonly installClone: string;
  readonly installPoint: string;
  readonly installThenUse: string;

  readonly installNote: string;
  readonly installNoteCta: string;
  readonly detailMoreOnList: string;
  readonly detailRelated: string;
  readonly finalEyebrow: string;
  readonly detailCloserHeading: string;
  readonly detailCloserBody: string;

  /* Per-skill prose, keyed by slug. */
  readonly skills: Readonly<Record<string, CuratedSkillCopy>>;
}

/** Locale override: any chrome subset, plus per-skill prose subsets. */
export type CuratedCopyOverrideOf<Copy extends CuratedCopyBase> = Partial<
  Omit<Copy, 'skills'>
> & {
  readonly skills?: Readonly<Record<string, Partial<CuratedSkillCopy>>>;
};

/**
 * Everything the shared collection-hub and skill-detail components need to
 * render one collection. Each collection module exports one binding.
 */
export interface CuratedBinding {
  /** Display name used in titles, breadcrumbs and JSON-LD, e.g. "Codex design". */
  readonly collectionName: string;
  /** Hub route, e.g. '/plugins/codex-design/'. */
  readonly hubPath: string;
  /** The public curated list / upstream repo the star CTA points at. */
  readonly listUrl: string;
  readonly downloadUrl: string;
  readonly collection: CuratedCollectionContent;
  readonly skills: readonly CuratedSkill[];
  readonly getCopy: (locale: LandingLocaleCode) => CuratedCopyBase;
  /** Optional <title> builder for the hub page; defaults to eyebrow · heading. */
  readonly hubTitle?: (copy: CuratedCopyBase) => string;
  /** Internal guide route for the hero's secondary CTA; falls back to the star link. */
  readonly heroGuideHref?: string;
  readonly skillCopy: (copy: CuratedCopyBase, slug: string) => CuratedSkillCopy;
  readonly categoryLabel: (copy: CuratedCopyBase, category: string) => string;
}

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
export function mergeCuratedCopy<Copy extends CuratedCopyBase>(
  en: Copy,
  override: CuratedCopyOverrideOf<Copy> | undefined,
): Copy {
  if (!override) return en;
  const skills: Record<string, CuratedSkillCopy> = { ...en.skills };
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
 * Prose for one skill. Every catalogued slug is present in the English
 * baseline by construction, so a miss means two files drifted — surface it
 * as a build failure instead of rendering blanks.
 */
export function curatedSkillCopy(
  collectionName: string,
  copy: CuratedCopyBase,
  slug: string,
): CuratedSkillCopy {
  const entry = copy.skills[slug];
  if (!entry) throw new Error(`No ${collectionName} skill copy for slug "${slug}".`);
  return entry;
}

/**
 * Fails the build if two curated collections, or a curated collection and the
 * bundled-plugin catalogue, ever claim the same flat `/plugins/<slug>/` route.
 */
export function assertNoCuratedSlugCollision(
  collectionName: string,
  skills: readonly CuratedSkill[],
  takenSlugs: readonly string[],
): void {
  const taken = new Set(takenSlugs);
  for (const s of skills) {
    if (taken.has(s.slug)) {
      throw new Error(
        `${collectionName} slug "${s.slug}" collides with another /plugins/ route. ` +
          'Rename the curated slug: the flat routes must stay unique.',
      );
    }
  }
}
