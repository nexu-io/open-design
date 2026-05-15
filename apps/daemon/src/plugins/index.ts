// Daemon plugin module barrel. Re-exports the surface that server.ts and
// cli.ts need so the rest of the daemon never reaches into individual files
// and accidentally bypasses the snapshot writer (spec §8.2.1).
export * from './atoms.js';
export * from './apply.js';
export {
  validatePluginFolder,
  flattenValidationDiagnostics,
  type ValidatePluginFolderInput,
  type ValidatePluginFolderResult,
} from './validate.js';
export {
  packPlugin,
  PackPluginError,
  type PackPluginInput,
  type PackPluginResult,
} from './pack.js';
export {
  searchInstalledPlugins,
  type SearchInstalledPluginsInput,
  type SearchInstalledPluginsResult,
  type SearchInstalledPluginsResultEntry,
} from './search.js';
export {
  diffPlugins,
  type DiffPluginsInput,
  type PluginDiffReport,
  type PluginDiffEntry,
} from './diff.js';
export {
  diffSnapshots,
  type DiffSnapshotsInput,
  type SnapshotDiffReport,
  type SnapshotDiffEntry,
} from './snapshot-diff.js';
export {
  pluginInventoryStats,
  pluginSourceBuckets,
  snapshotInventoryStats,
  type PluginInventoryStats,
  type PluginSourceBucket,
  type PluginSourceBucketsResult,
  type SnapshotInventoryStats,
  type SnapshotStatsRow,
} from './stats.js';
export {
  simulatePipeline,
  parseSignalKv,
  type SimulatePipelineInput,
  type SimulatePipelineResult,
  type SimulateStageOutcome,
  type StageSignalProvider,
} from './simulate.js';
export {
  verifyPlugin,
  type VerifyConfig,
  type VerifyInput,
  type VerifyReport,
  type VerifyCheckOutcome,
  type VerifyCheckId,
} from './verify.js';
export {
  recordPluginEvent,
  pluginEventSnapshot,
  subscribePluginEvents,
  pluginEventBufferSize,
  summarisePluginEvents,
  purgePluginEventBuffer,
  type PluginEvent,
  type PluginEventKind,
  type PluginEventStats,
  type PurgePluginEventBufferResult,
} from './events.js';
export * from './atoms/build-test.js';
export * from './atoms/built-ins.js';
export * from './atoms/code-import.js';
export * from './atoms/design-extract.js';
export * from './atoms/diff-review.js';
export * from './atoms/diff-review-genui-bridge.js';
export * from './atoms/figma-extract.js';
export * from './atoms/handoff.js';
export * from './atoms/patch-edit.js';
export * from './atoms/registry.js';
export * from './atoms/rewrite-plan.js';
export * from './atoms/token-map.js';
export * from './bundled.js';
export * from './connector-gate.js';
export * from './export.js';
export * from './doctor.js';
export * from './installer.js';
export * from './lockfile.js';
export * from './persistence.js';
export * from './marketplaces.js';
export * from './pipeline.js';
export * from './pipeline-runner.js';
export * from './publish.js';
export * from './registry.js';
export * from './scaffold.js';
export * from './gc.js';
export * from './resolve-snapshot.js';
export * from './snapshots.js';
export * from './trust.js';
export * from './until.js';
