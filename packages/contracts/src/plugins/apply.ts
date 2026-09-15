import { z } from 'zod';
import { ContextItemSchema, ResolvedContextSchema, type ContextItem } from './context.js';
import {
  GenUISurfaceSpecSchema,
  InputFieldSchema,
  McpServerSpecSchema,
  PluginConnectorRefSchema,
  PluginPipelineSchema,
  type GenUISurfaceSpec,
  type InputField,
  type McpServerSpec,
  type PluginConnectorRef,
  type PluginPipeline,
} from './manifest.js';
import { AppliedStrategyBindingV2Schema } from './strategy-v2.js';

// Apply-time refs to staged assets. `stageAt` defaults to `'run-start'` to
// keep `POST /api/projects` from accidentally turning into a staging endpoint
// (plan §5 invariant I2 / F4). Clients must never default to 'project-create'.
export const PluginAssetRefSchema = z.object({
  path:    z.string(),
  src:     z.string(),
  mime:    z.string().optional(),
  stageAt: z.enum(['project-create', 'run-start']).default('run-start'),
});

export type PluginAssetRef = z.infer<typeof PluginAssetRefSchema>;

export const InputFieldSpecSchema = InputFieldSchema;
export type InputFieldSpec = InputField;

export const PluginConnectorBindingSchema = PluginConnectorRefSchema.extend({
  accountLabel: z.string().optional(),
  status:       z.enum(['connected', 'pending', 'unavailable']),
});

export type PluginConnectorBinding = z.infer<typeof PluginConnectorBindingSchema>;

// Immutable snapshot — the contract between "plugin" and "run" (spec §8.2.1).
// Runs are addressed by snapshotId, not pluginId, so plugin upgrades never
// pollute historical reproducibility.
export const AppliedPluginSnapshotSchema = z.object({
  snapshotId:           z.string(),
  pluginId:             z.string(),
  pluginSpecVersion:    z.string().optional(),
  pluginVersion:        z.string(),
  manifestSourceDigest: z.string(),
  sourceMarketplaceId:  z.string().optional(),
  sourceMarketplaceEntryName:    z.string().optional(),
  sourceMarketplaceEntryVersion: z.string().optional(),
  marketplaceTrust:              z.enum(['official', 'trusted', 'restricted']).optional(),
  resolvedSource:                z.string().optional(),
  resolvedRef:                   z.string().optional(),
  archiveIntegrity:              z.string().optional(),
  pinnedRef:            z.string().optional(),
  inputs:               z.record(z.union([z.string(), z.number(), z.boolean()])),
  resolvedContext:      ResolvedContextSchema,
  craftRequires:        z.array(z.string()).optional(),
  capabilitiesGranted:  z.array(z.string()),
  capabilitiesRequired: z.array(z.string()),
  assetsStaged:         z.array(PluginAssetRefSchema),
  taskKind: z.enum(['new-generation', 'code-migration', 'figma-migration', 'tune-collab']),
  appliedAt:            z.number(),
  // Frozen views of apply-time external state so replay survives upgrades.
  connectorsRequired:   z.array(PluginConnectorRefSchema),
  connectorsResolved:   z.array(PluginConnectorBindingSchema),
  mcpServers:           z.array(McpServerSpecSchema),
  pipeline:             PluginPipelineSchema.optional(),
  genuiSurfaces:        z.array(GenUISurfaceSpecSchema).optional(),
  // Plugin-supplied display metadata, materialized at apply time so prompt
  // composers can render the ## Active plugin block without re-reading the
  // live manifest.
  pluginTitle:          z.string().optional(),
  pluginDescription:    z.string().optional(),
  query:                z.string().optional(),
  // Internal, nullable strategy content identity. Legacy and ordinary plugin
  // snapshots omit this field; daemon persistence stores SQL NULL.
  strategy:             AppliedStrategyBindingV2Schema.nullable().optional(),
  // Apply-pipeline status — flips to 'stale' when `od plugin doctor` detects
  // a digest drift after an upgrade. Snapshots are never rewritten in place.
  status: z.enum(['fresh', 'stale']).default('fresh'),
});

export type AppliedPluginSnapshot = z.infer<typeof AppliedPluginSnapshotSchema>;

// Subset of project metadata the daemon may pre-fill from a plugin apply.
// Intentionally narrow — the project create endpoint owns the full shape.
export const PluginProjectMetadataPatchSchema = z.object({
  name:           z.string().optional(),
  skillId:        z.string().optional(),
  designSystemId: z.string().optional(),
  craftRequires:  z.array(z.string()).optional(),
  taskKind: z.enum(['new-generation', 'code-migration', 'figma-migration', 'tune-collab']).optional(),
}).passthrough();

export type PluginProjectMetadataPatch = z.infer<typeof PluginProjectMetadataPatchSchema>;

export const PLUGIN_APPLY_ERROR_CONTRACT_HEADER = 'x-od-plugin-apply-error-contract';
export const PLUGIN_APPLY_ERROR_CONTRACT_VERSION = '2';

export const PluginApplyInputNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/u);

// Shared HTTP error contract for both plugin apply routes. Messages are
// literals and details are closed so the daemon can log raw paths/stacks while
// the browser only accepts these bounded, user-safe diagnoses.
export const PluginApplyErrorSchema = z.discriminatedUnion('code', [
  z.object({
    code: z.literal('PLUGIN_INPUTS_MISSING'),
    message: z.literal('Missing required plugin inputs.'),
    details: z.object({
      kind: z.literal('missing_inputs'),
      fields: z.array(PluginApplyInputNameSchema).min(1).max(10),
    }).strict(),
  }).strict(),
  z.object({
    code: z.literal('PLUGIN_CONFIGURATION_INVALID'),
    message: z.literal('Plugin configuration is invalid. Reinstall or update the plugin and try again.'),
    details: z.object({
      reason: z.enum(['manifest_invalid', 'internal_strategy_invalid']),
    }).strict(),
  }).strict(),
  z.object({
    code: z.literal('PLUGIN_RESOURCE_UNAVAILABLE'),
    message: z.literal('A required plugin resource is unavailable. Reinstall or update the plugin and try again.'),
    details: z.object({
      reason: z.literal('required_resource_missing'),
    }).strict(),
  }).strict(),
  z.object({
    code: z.literal('PLUGIN_APPLY_FAILED'),
    message: z.literal('Plugin application failed. Try again.'),
  }).strict(),
]);

export const PluginApplyErrorResponseSchema = z.object({
  error: PluginApplyErrorSchema,
}).strict();

export type PluginApplyErrorResponse = z.infer<typeof PluginApplyErrorResponseSchema>;

// Plugin apply routes share workspace-authority middleware with other daemon
// endpoints. Keep its only user-actionable boundary failure closed here rather
// than accepting arbitrary messages from the broader ApiErrorResponse shape.
export const PluginApplyWorkspaceContextErrorResponseSchema = z.object({
  error: z.object({
    code: z.literal('WORKSPACE_CONTEXT_INCOMPLETE'),
    message: z.literal('both workspace and member identity are required'),
  }).strict(),
}).strict();

export type PluginApplyWorkspaceContextErrorResponse = z.infer<
  typeof PluginApplyWorkspaceContextErrorResponseSchema
>;

// Rolling upgrades can leave a browser talking to an older daemon. Keep the
// previous bounded shapes explicit so compatibility never becomes a reason to
// accept arbitrary daemon error strings.
export const LegacyPluginApplyErrorResponseSchema = z.discriminatedUnion('error', [
  z.object({
    error: z.literal('missing_inputs'),
    fields: z.array(PluginApplyInputNameSchema).min(1).max(10),
  }).strict(),
  z.object({ error: z.literal('plugin_apply_failed') }).strict(),
  z.object({ error: z.literal('plugin not found') }).strict(),
]);

export type LegacyPluginApplyErrorResponse = z.infer<typeof LegacyPluginApplyErrorResponseSchema>;

export const ApplyResultSchema = z.object({
  query:         z.string(),
  contextItems:  z.array(ContextItemSchema),
  inputs:        z.array(InputFieldSpecSchema),
  assets:        z.array(PluginAssetRefSchema),
  mcpServers:    z.array(McpServerSpecSchema),
  pipeline:      PluginPipelineSchema.optional(),
  genuiSurfaces: z.array(GenUISurfaceSpecSchema).optional(),
  projectMetadata:      PluginProjectMetadataPatchSchema,
  trust:                z.enum(['trusted', 'restricted']),
  capabilitiesGranted:  z.array(z.string()),
  capabilitiesRequired: z.array(z.string()),
  appliedPlugin:        AppliedPluginSnapshotSchema,
});

export type ApplyResult = z.infer<typeof ApplyResultSchema>;

// Re-exports so downstream files can import everything from one module.
export type { ContextItem, GenUISurfaceSpec, InputField, McpServerSpec, PluginConnectorRef, PluginPipeline };
