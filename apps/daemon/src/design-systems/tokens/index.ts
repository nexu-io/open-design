/** @module tokens/index
 * Public surface for design token extraction, contract building, and rebuild preparation.
 * Token evidence lives in token-evidence, schema mapping in token-contract, quality assessment in token-contract-rebuild.
 */
export type {
  DesignTokenBinding,
  DesignTokenContract,
  DesignTokenContractReport,
  DesignTokenEvidenceConfidence,
  SourceDesignToken,
} from './token-contract.js';
export {
  buildDesignTokenContract,
  buildReportWithSelfCheck,
  renderDesignTokenContractCss,
  validateDesignTokenOutputs,
} from './token-contract.js';

export type {
  CssCustomPropertyEvidence,
  DesignExtractReport,
  DesignTokenEntry,
  DesignTokenEvidenceCollector,
  DesignTokenKind,
} from './token-evidence.js';
export {
  createDesignTokenEvidenceCollector,
  extractCssCustomProperties,
  lineNumberAt,
} from './token-evidence.js';

export type { DesignTokenContractRebuildPreparation } from './token-contract-rebuild.js';
export { prepareDesignTokenContractRebuild } from './token-contract-rebuild.js';
