/** @module tools-connectors-cli
 * Public surface of the connectors / design-audit CLI: the `od tools connectors`
 * dispatcher (`runConnectorsToolCli`) and the design-system package-audit engine
 * (`auditDesignSystemPackage`) plus its scoring predicates. Structured as a
 * capability barrel — core/ foundation + intake/ + audit/ + evidence/ concerns.
 */
export type {
  DesignSystemAuditSeverity,
  DesignSystemAuditIssue,
  DesignSystemPackageAudit,
} from './core/index.js';
export { scoreDesignFile, shouldSkipRepoPath, isTextSnapshotPath } from './core/index.js';
export { auditDesignSystemPackage } from './audit/index.js';
export { runConnectorsToolCli } from './commands.js';
