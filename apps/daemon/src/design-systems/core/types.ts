/** Rendering target surface for a design system. */
export type DesignSystemSurface = 'web' | 'image' | 'video' | 'audio';

/** Origin of a design system entry in the registry. */
export type DesignSystemSource = 'built-in' | 'installed' | 'user';

/** Publication state of a user-owned design system. */
export type DesignSystemStatus = 'draft' | 'published';

/** Review state of a proposed design-system revision. */
export type DesignSystemRevisionStatus = 'pending' | 'accepted' | 'rejected';

/**
 * Controls who is responsible for the generated artifact layer.
 * `generated` — the daemon writes derived files (README, previews, ui_kit) from DESIGN.md.
 * `agent-managed` — the agent writes directly; the daemon skips all derived-file generation.
 */
export type DesignSystemArtifactMode = 'generated' | 'agent-managed';

/** Lightweight summary returned by `listDesignSystems`. */
export type DesignSystemSummary = {
  id: string;
  title: string;
  category: string;
  summary: string;
  /** Up to 4 hex color values extracted from DESIGN.md for catalog swatches. */
  swatches: string[];
  surface: DesignSystemSurface;
  /** Raw DESIGN.md content. */
  body: string;
  source: DesignSystemSource;
  status: DesignSystemStatus;
  isEditable: boolean;
  createdAt?: string;
  updatedAt?: string;
  provenance?: DesignSystemProvenance;
  /** Project ID this design system is linked to, if any. */
  projectId?: string;
};

/** Category tag used to classify a file inside a design-system package. */
export type DesignSystemFileKind =
  | 'folder'
  | 'page'
  | 'stylesheet'
  | 'document'
  | 'image'
  | 'data'
  | 'asset';

/** Metadata row for a single file in a user design-system package. */
export type DesignSystemFileSummary = {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size?: number;
  updatedAt?: string;
};

/** Full file record including UTF-8 content. */
export type DesignSystemFileDetail = DesignSystemFileSummary & {
  content: string;
};

/** File returned through the design-system pull-file API, with encoding info. */
export type DesignSystemPullFileDetail = {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size: number;
  updatedAt: string;
  /** `utf8` for text files, `base64` for binary assets. */
  encoding: 'utf8' | 'base64';
  content: string;
};

export type DesignSystemStaticFileDetail = {
  path: string;
  name: string;
  kind: DesignSystemFileKind;
  size: number;
  updatedAt: string;
  contentType: string;
  bytes: Buffer;
};

/** Aggregated package metadata returned by `readDesignSystemPackageInfo`. */
export type DesignSystemPackageInfo = {
  manifest?: DesignSystemProjectManifest;
  availableFiles?: string[];
  sourceEvidence?: {
    scannedFileCount?: number;
    tokenCount?: number;
    snippetCount?: number;
    confidence?: Record<string, string | number>;
    evidenceExcerpt?: string;
    tokenContract?: {
      contract?: string;
      grade?: 'excellent' | 'usable' | 'needs-review' | 'needs-rebuild';
      score?: number;
      recommendRebuild?: boolean;
      sourceBackedA1?: number;
      requiredA1?: number;
      fallbackTokens?: number;
      selfCheckOk?: boolean;
    };
  };
};

/** A proposed change to DESIGN.md, optionally bundled with file-level changes. */
export type DesignSystemRevision = {
  id: string;
  designSystemId: string;
  status: DesignSystemRevisionStatus;
  /** Human-readable explanation of why this revision was proposed. */
  feedback: string;
  /** Content of DESIGN.md before the revision. */
  baseBody: string;
  /** Proposed replacement for DESIGN.md. */
  proposedBody: string;
  createdAt: string;
  updatedAt: string;
  /** Optional section heading the revision targets within DESIGN.md. */
  sectionTitle?: string;
  /** Agent job that produced this revision, for correlation. */
  jobId?: string;
  fileChanges?: DesignSystemRevisionFileChange[];
};

/** A single file path included in a revision's proposed changeset. */
export type DesignSystemRevisionFileChange = {
  path: string;
  baseContent: string;
  proposedContent: string;
};

/** A single named color token. */
export type ColorToken = { name: string; value: string };

/**
 * Result of `pickSwatchRow`.
 * `values` is a 4-element `[background, border, foreground, accent]` hex array.
 * `filledAllSlots` is true when all four slots were matched by semantic hints.
 */
export type SwatchRow = { values: string[]; filledAllSlots: boolean };

/**
 * Machine-readable manifest for an installed design-system package (`manifest.json`).
 * The schema version must be `od-design-system-project/v1`.
 */
export type DesignSystemProjectManifest = {
  schemaVersion: 'od-design-system-project/v1';
  id: string;
  name: string;
  category: string;
  description?: string;
  /** Required file declarations. `design` and `tokens` are always present. */
  files: {
    design: 'DESIGN.md';
    tokens: 'tokens.css';
    designTokens?: 'design-tokens.json';
    tailwind?: 'tailwind-v4.css';
    components?: 'components.html';
  };
  assetsDir?: 'assets';
  previewDir?: 'preview';
  /** Relative path to a USAGE.md or equivalent. */
  usage?: string;
  /** Relative path to a `components.manifest.json`. */
  componentsManifest?: string;
  fonts?: Array<{
    family: string;
    file: string;
    weight?: number | string;
    style?: string;
  }>;
  preview?: {
    dir: string;
    pages: Array<{
      path: string;
      role?: string;
      title?: string;
    }>;
  };
  /** Source-file references captured during import. */
  sourceFiles?: {
    scanned?: string;
    evidence?: string;
    tokens?: string;
    report?: string;
    snippets?: string;
  };
  /** How the agent should interpret tokens from this package. */
  importMode?: 'normalized' | 'hybrid' | 'verbatim';
  craft?: {
    applies?: string[];
    suggested?: string[];
    exemptions?: string[];
  };
};

/** Source context captured when a user design system was created. */
export type DesignSystemProvenance = {
  sourceUrls?: string[];
  companyBlurb?: string;
  githubUrls?: string[];
  localCodeFiles?: string[];
  figFiles?: string[];
  assetFiles?: string[];
  notes?: string;
  sourceNotes?: string;
};

/** Persisted metadata stored in `<dir>/metadata.json` for user-owned design systems. */
export type UserDesignSystemMetadata = {
  title?: string;
  category?: string;
  surface?: DesignSystemSurface;
  status?: DesignSystemStatus;
  artifactMode?: DesignSystemArtifactMode;
  createdAt?: string;
  updatedAt?: string;
  provenance?: DesignSystemProvenance;
  /** Project ID this design system is linked to. */
  projectId?: string;
};

/** A single file write queued for atomic commit. */
export type AtomicTextFileWrite = {
  /** Absolute target path. */
  targetPath: string;
  content: string;
};

/** Pre-write snapshot taken before an atomic write sequence, used for rollback. */
export type AtomicTextFileSnapshot =
  | { existed: true; content: string }
  | { existed: false };

/**
 * Legacy artifact paths replaced during `migrateLegacyDesignSystemPackage`.
 * Each entry declares the old path, its replacement(s), and whether the legacy
 * path is a directory that needs recursive removal.
 */
export const LEGACY_DESIGN_SYSTEM_ARTIFACTS = [
  {
    legacyPath: 'preview/colors-ui-palette.html',
    replacementPaths: ['preview/colors-primary.html'],
  },
  {
    legacyPath: 'preview/colors-node-types.html',
    replacementPaths: ['preview/colors-theme-light.html', 'preview/colors-theme-dark.html'],
  },
  {
    legacyPath: 'preview/typography-scale.html',
    replacementPaths: ['preview/typography-specimens.html'],
  },
  {
    legacyPath: 'preview/spacing-system.html',
    replacementPaths: ['preview/spacing-tokens.html', 'preview/spacing-radius.html', 'preview/spacing-shadows.html'],
  },
  {
    legacyPath: 'preview/logo-variants.html',
    replacementPaths: ['preview/brand-assets.html'],
  },
  {
    legacyPath: 'ui_kits/generated_interface',
    replacementPaths: ['ui_kits/app/index.html'],
    removeDirectory: true,
  },
] as const;

/** Input accepted by `createUserDesignSystem` and `updateUserDesignSystem`. */
export type UserDesignSystemInput = {
  title?: string;
  summary?: string;
  category?: string;
  surface?: DesignSystemSurface;
  status?: DesignSystemStatus;
  artifactMode?: DesignSystemArtifactMode;
  /** Full DESIGN.md body. When omitted a draft scaffold is generated. */
  body?: string;
  sourceNotes?: string;
  provenance?: DesignSystemProvenance;
};

/** Input accepted by `createUserDesignSystemRevision`. */
export type UserDesignSystemRevisionInput = {
  feedback: string;
  baseBody: string;
  proposedBody: string;
  sectionTitle?: string;
  jobId?: string;
  fileChanges?: DesignSystemRevisionFileChange[];
};

/** Options for `listDesignSystems`. */
export type DesignSystemListOptions = {
  /** String to prepend to every directory name when building entry `id`. */
  idPrefix?: string;
  source?: DesignSystemSource;
  isEditable?: boolean;
  defaultStatus?: DesignSystemStatus;
};

/** Runtime assets resolved for a design system (tokens, fixtures, pull index). */
export type DesignSystemAssets = {
  usageMd?: string | undefined;
  tokensCss?: string | undefined;
  fixtureHtml?: string | undefined;
  componentsManifest?: string | undefined;
  pullIndex?: string | undefined;
  importMode?: 'normalized' | 'hybrid' | 'verbatim' | undefined;
  craftApplies?: string[] | undefined;
  craftExemptions?: string[] | undefined;
};

/** A single `##`-level section extracted from a DESIGN.md body. */
export type MarkdownSection = {
  title: string;
  body: string;
};

/** Resolved color palette used when generating HTML preview files and CSS tokens. */
export type GeneratedPalette = {
  background: string;
  border: string;
  foreground: string;
  accent: string;
  muted: string;
  success: string;
};
