/** @module design-systems
 * Main public API for the design-systems module.
 * Re-exports types, catalog reads, user CRUD, import pipeline, token extraction, and job store from domain subdirectories.
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
} from './core/index.js';
export { LEGACY_DESIGN_SYSTEM_ARTIFACTS } from './core/index.js';

export {
  clearDesignSystemAssetsCacheForTests,
  digestDesignSystemContext,
  isDesignTokenChannelEnabled,
  readDesignSystemAssets,
  resolveDesignSystemAssets,
} from './catalog/index.js';

export {
  listDesignSystems,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemPullFile,
  readDesignSystemStaticFile,
} from './catalog/index.js';

export {
  buildDesignSystemSkillsMarkdown,
  buildUserDesignSystemArchive,
  propagateWorkspaceProjectRename,
  workspaceRenameDesignSystemId,
  createUserDesignSystem,
  createUserDesignSystemRevision,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  listUserDesignSystemFiles,
  listUserDesignSystemRevisions,
  readUserDesignSystemFile,
  readUserDesignSystemRevision,
  updateUserDesignSystem,
  updateUserDesignSystemRevisionStatus,
} from './user/index.js';

export type {
  DesignSystemProjectSource,
  GitHubDesignSystemImportOptions,
  LocalDesignSystemImportOptions,
  LocalDesignSystemImportResult,
  ParsedGitHubRepoUrl,
  ParsedShadcnReference,
  ShadcnDesignSystemImportOptions,
  ShadcnFetch,
  ShadcnFetchResponse,
} from './import/index.js';
export {
  LocalDesignSystemImportError,
  importGitHubDesignSystemProject,
  importLocalDesignSystemProject,
  importShadcnDesignSystemProject,
  parseGitHubRepoUrl,
  parseShadcnReference,
  renderShadcnSourceCss,
  wrapShadcnColorValue,
} from './import/index.js';

export type {
  CssCustomPropertyEvidence,
  DesignExtractReport,
  DesignTokenBinding,
  DesignTokenContract,
  DesignTokenContractRebuildPreparation,
  DesignTokenContractReport,
  DesignTokenEntry,
  DesignTokenEvidenceCollector,
  DesignTokenEvidenceConfidence,
  DesignTokenKind,
  SourceDesignToken,
} from './tokens/index.js';
export {
  buildDesignTokenContract,
  buildReportWithSelfCheck,
  createDesignTokenEvidenceCollector,
  extractCssCustomProperties,
  lineNumberAt,
  prepareDesignTokenContractRebuild,
  renderDesignTokenContractCss,
  validateDesignTokenOutputs,
} from './tokens/index.js';

export type {
  DesignSystemGenerationJob,
  DesignSystemGenerationJobStatus,
  DesignSystemGenerationStep,
  DesignSystemGenerationStepStatus,
  DesignSystemRevisionInput,
  DesignSystemTokenContractRebuildInput,
} from './jobs/index.js';
export { createDesignSystemGenerationJobStore } from './jobs/index.js';

// Core utilities surfaced for direct daemon use outside the design-systems module.
export { parseFrontmatter } from './core/index.js';
export { parseDesignSystemRenameArgs } from './core/index.js';
export type { DesignSystemRenameArgs } from './core/index.js';

// Catalog rendering surfaces and source-context helpers surfaced for route + job use.
export { renderDesignSystemPreview } from './catalog/index.js';
export { renderDesignSystemShowcase } from './catalog/index.js';
export { collectDesignSystemSourceContext, mergeSourceContextIntoInput } from './catalog/index.js';
export type { DesignSystemSourceContext } from './catalog/index.js';
