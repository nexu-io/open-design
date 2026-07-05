/** @module core/index
 * Foundational layer: all shared types, YAML front-matter parsing, SwiftUI color parsing, DESIGN.md body utilities, metadata read primitives, and CLI argument parsers.
 * This is the kernel every other subdirectory may depend on directly; core itself never imports from a sibling subdirectory.
 */
export type {
  AtomicTextFileSnapshot,
  AtomicTextFileWrite,
  ColorToken,
  DesignSystemArtifactMode,
  DesignSystemAssets,
  DesignSystemFileDetail,
  DesignSystemFileKind,
  DesignSystemFileSummary,
  DesignSystemListOptions,
  DesignSystemPackageInfo,
  DesignSystemProjectManifest,
  DesignSystemProvenance,
  DesignSystemPullFileDetail,
  DesignSystemRevision,
  DesignSystemRevisionFileChange,
  DesignSystemRevisionStatus,
  DesignSystemSource,
  DesignSystemStaticFileDetail,
  DesignSystemStatus,
  DesignSystemSummary,
  DesignSystemSurface,
  GeneratedPalette,
  MarkdownSection,
  SwatchRow,
  UserDesignSystemInput,
  UserDesignSystemMetadata,
  UserDesignSystemRevisionInput,
} from './types.js';
export { LEGACY_DESIGN_SYSTEM_ARTIFACTS } from './types.js';
export * from './frontmatter.js';
export * from './swift-colors.js';
export * from './rename-args.js';
export * from './metadata.js';
