/** @module import/index
 * Public surface for design system import flows: local project scan, GitHub shallow clone, and shadcn registry fetch.
 * All three importers delegate to importLocalDesignSystemProject after materializing a source directory.
 */
export type {
  DesignSystemProjectSource,
  LocalDesignSystemImportOptions,
  LocalDesignSystemImportResult,
} from './import.js';
export { LocalDesignSystemImportError, importLocalDesignSystemProject } from './import.js';

export type { GitHubDesignSystemImportOptions, ParsedGitHubRepoUrl } from './github-import.js';
export { importGitHubDesignSystemProject, parseGitHubRepoUrl } from './github-import.js';

export type {
  ParsedShadcnReference,
  ShadcnDesignSystemImportOptions,
  ShadcnFetch,
  ShadcnFetchResponse,
} from './shadcn-import.js';
export {
  importShadcnDesignSystemProject,
  parseShadcnReference,
  renderShadcnSourceCss,
  wrapShadcnColorValue,
} from './shadcn-import.js';
