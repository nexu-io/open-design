import { z } from 'zod';

import { StrategyTaskTypeV2Schema } from '../plugins/strategy-v2.js';

export const OFFICIAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1 =
  'open-design.official-skill-discovery-catalog/v1' as const;
export const OFFICIAL_FUNCTIONAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1 =
  'open-design.official-functional-skill-discovery-catalog/v1' as const;
export const OFFICIAL_SKILL_DISCOVERY_SEARCH_SCHEMA_V1 =
  'open-design.official-skill-discovery-search/v1' as const;
export const OFFICIAL_SKILL_DISCOVERY_LOAD_SCHEMA_V1 =
  'open-design.official-skill-discovery-load/v1' as const;
export const OFFICIAL_SKILL_DISCOVERY_ATTESTATION_SCHEMA_V1 =
  'open-design.official-skill-discovery-attestation/v1' as const;
export const OFFICIAL_SKILL_DISCOVERY_MAX_SEARCH_RESULTS_V1 = 5 as const;
export const SKILL_DISCOVERY_MAX_SUPERSEDED_V1 = 16 as const;

const canonicalSkillIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const controlledSlugSchema = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const versionSchema = z.string().min(1).max(64);
const boundedTextSchema = z.string().trim().min(1).max(1_000);
const portableRelativePathSchema = z.string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/, {
    message: 'Skill resource paths must be portable relative paths.',
  });

function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export const SkillDiscoveryRoleV1Schema = z.enum(['primary', 'auxiliary', 'either']);
export type SkillDiscoveryRoleV1 = z.infer<typeof SkillDiscoveryRoleV1Schema>;

export const ResolvedSkillDiscoveryRoleV1Schema = z.enum(['primary', 'auxiliary']);
export type ResolvedSkillDiscoveryRoleV1 = z.infer<typeof ResolvedSkillDiscoveryRoleV1Schema>;

const outputKindsSchema = z.array(controlledSlugSchema)
  .min(1)
  .max(16)
  .refine(uniqueStrings, { message: 'Discovery output kinds must be unique.' });
const examplesSchema = z.array(boundedTextSchema)
  .min(1)
  .max(32)
  .refine(uniqueStrings, { message: 'Discovery examples must be unique.' });
const conflictsSchema = z.array(canonicalSkillIdSchema)
  .max(32)
  .refine(uniqueStrings, { message: 'Discovery conflicts must be unique.' });

const discoveryMetadataFields = {
  autoSelectable: z.literal(true),
  role: SkillDiscoveryRoleV1Schema,
  outputKinds: outputKindsSchema,
  positiveExamples: examplesSchema,
  negativeExamples: examplesSchema,
  conflictsWith: conflictsSchema,
};

/** Strict product-owned discovery declaration for one built-in functional Skill. */
export const OfficialFunctionalSkillDiscoveryMetadataV1Schema = z.object({
  autoSelectable: z.literal(true),
  role: z.literal('auxiliary'),
  outputKinds: outputKindsSchema,
  positiveExamples: examplesSchema,
  negativeExamples: examplesSchema,
  conflictsWith: conflictsSchema,
  version: versionSchema,
  resources: z.array(portableRelativePathSchema)
    .max(32)
    .refine(uniqueStrings, { message: 'Discovery resources must be unique.' }),
}).strict();
export type OfficialFunctionalSkillDiscoveryMetadataV1 = z.infer<
  typeof OfficialFunctionalSkillDiscoveryMetadataV1Schema
>;

export const OfficialFunctionalSkillDiscoveryDeclarationV1Schema = z.object({
  source: z.enum(['skills', 'design-templates']).optional(),
  sourceFolder: canonicalSkillIdSchema,
  id: canonicalSkillIdSchema,
  ...OfficialFunctionalSkillDiscoveryMetadataV1Schema.shape,
}).strict();
export type OfficialFunctionalSkillDiscoveryDeclarationV1 = z.infer<
  typeof OfficialFunctionalSkillDiscoveryDeclarationV1Schema
>;

export const OfficialFunctionalSkillDiscoveryCatalogFileV1Schema = z.object({
  schema: z.literal(OFFICIAL_FUNCTIONAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1),
  version: versionSchema,
  skills: z.array(OfficialFunctionalSkillDiscoveryDeclarationV1Schema).min(1),
}).strict().superRefine((value, context) => {
  const sourceFolders = value.skills.map((skill) => `${skill.source ?? 'skills'}/${skill.sourceFolder}`);
  if (!uniqueStrings(sourceFolders)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skills'],
      message: 'Functional Skill discovery source folders must be unique.',
    });
  }
  const ids = value.skills.map((skill) => skill.id);
  if (!uniqueStrings(ids)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['skills'],
      message: 'Functional Skill discovery ids must be unique.',
    });
  }
});
export type OfficialFunctionalSkillDiscoveryCatalogFileV1 = z.infer<
  typeof OfficialFunctionalSkillDiscoveryCatalogFileV1Schema
>;

/** Independent discovery declaration for bundled task profiles. */
export const OfficialTaskProfileDiscoveryDeclarationV1Schema = z.object({
  id: canonicalSkillIdSchema,
  name: boundedTextSchema,
  description: boundedTextSchema,
  taskType: StrategyTaskTypeV2Schema.exclude(['generic']),
  ...discoveryMetadataFields,
  role: z.literal('primary'),
}).strict();
export type OfficialTaskProfileDiscoveryDeclarationV1 = z.infer<
  typeof OfficialTaskProfileDiscoveryDeclarationV1Schema
>;

export const OfficialSkillDiscoveryCatalogFileV1Schema = z.object({
  schema: z.literal(OFFICIAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1),
  version: versionSchema,
  taskProfiles: z.array(OfficialTaskProfileDiscoveryDeclarationV1Schema).min(1),
}).strict().superRefine((value, context) => {
  const ids = value.taskProfiles.map((profile) => profile.id);
  if (!uniqueStrings(ids)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskProfiles'],
      message: 'Discovery task profile ids must be unique.',
    });
  }
  const taskTypes = value.taskProfiles.map((profile) => profile.taskType);
  if (!uniqueStrings(taskTypes)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['taskProfiles'],
      message: 'Discovery task profile task types must be unique.',
    });
  }
});
export type OfficialSkillDiscoveryCatalogFileV1 = z.infer<
  typeof OfficialSkillDiscoveryCatalogFileV1Schema
>;

export const OfficialSkillDiscoveryCandidateOriginV1Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('bundled-task-profile'),
    taskType: StrategyTaskTypeV2Schema.exclude(['generic']),
  }).strict(),
  z.object({
    kind: z.literal('built-in-functional'),
  }).strict(),
  z.object({
    kind: z.literal('built-in-design-template'),
  }).strict(),
]);
export type OfficialSkillDiscoveryCandidateOriginV1 = z.infer<
  typeof OfficialSkillDiscoveryCandidateOriginV1Schema
>;

/** Source-authored routing context; full workflow instructions stay in SKILL.md. */
export const OfficialSkillDiscoveryRoutingMetadataV1Schema = z.object({
  enName: boundedTextSchema.optional(),
  zhName: boundedTextSchema.optional(),
  zhDescription: boundedTextSchema.optional(),
  taskType: controlledSlugSchema.optional(),
  platform: controlledSlugSchema.optional(),
  scenario: controlledSlugSchema.optional(),
  category: controlledSlugSchema.optional(),
  examplePrompt: boundedTextSchema.optional(),
}).strict();

export const OfficialSkillDiscoveryCandidateV1Schema = z.object({
  id: canonicalSkillIdSchema,
  name: boundedTextSchema,
  description: boundedTextSchema,
  routingMetadata: OfficialSkillDiscoveryRoutingMetadataV1Schema.optional(),
  autoSelectable: z.literal(true),
  role: SkillDiscoveryRoleV1Schema,
  outputKinds: outputKindsSchema,
  positiveExamples: examplesSchema,
  negativeExamples: examplesSchema,
  conflictsWith: conflictsSchema,
  origin: OfficialSkillDiscoveryCandidateOriginV1Schema,
  version: versionSchema,
  catalogVersion: versionSchema,
  contentDigest: digestSchema,
  resourceRosterDigest: digestSchema,
  candidateDigest: digestSchema,
}).strict();
export type OfficialSkillDiscoveryCandidateV1 = z.infer<
  typeof OfficialSkillDiscoveryCandidateV1Schema
>;

export const OfficialSkillDiscoveryCatalogV1Schema = z.object({
  schema: z.literal(OFFICIAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1),
  version: versionSchema,
  revision: digestSchema,
  candidates: z.array(OfficialSkillDiscoveryCandidateV1Schema),
}).strict();
export type OfficialSkillDiscoveryCatalogV1 = z.infer<
  typeof OfficialSkillDiscoveryCatalogV1Schema
>;

export const OfficialSkillDiscoverySearchRequestV1Schema = z.object({
  query: z.string().trim().min(1).max(8_000),
  role: ResolvedSkillDiscoveryRoleV1Schema.optional(),
  outputKind: controlledSlugSchema.optional(),
  limit: z.number().int().min(1).max(OFFICIAL_SKILL_DISCOVERY_MAX_SEARCH_RESULTS_V1).optional(),
}).strict();
export type OfficialSkillDiscoverySearchRequestV1 = z.infer<
  typeof OfficialSkillDiscoverySearchRequestV1Schema
>;

export const OfficialSkillDiscoverySearchCandidateV1Schema =
  OfficialSkillDiscoveryCandidateV1Schema.extend({
    score: z.number().int(),
    matchedPositiveExamples: z.array(boundedTextSchema),
    matchedNegativeExamples: z.array(boundedTextSchema),
  }).strict();
export type OfficialSkillDiscoverySearchCandidateV1 = z.infer<
  typeof OfficialSkillDiscoverySearchCandidateV1Schema
>;

export const OfficialSkillDiscoverySearchResponseV1Schema = z.object({
  schema: z.literal(OFFICIAL_SKILL_DISCOVERY_SEARCH_SCHEMA_V1),
  catalogVersion: versionSchema,
  revision: digestSchema,
  candidates: z.array(OfficialSkillDiscoverySearchCandidateV1Schema)
    .max(OFFICIAL_SKILL_DISCOVERY_MAX_SEARCH_RESULTS_V1),
}).strict();
export type OfficialSkillDiscoverySearchResponseV1 = z.infer<
  typeof OfficialSkillDiscoverySearchResponseV1Schema
>;

export const OfficialSkillDiscoveryLoadRequestV1Schema = z.object({
  id: canonicalSkillIdSchema,
  revision: digestSchema,
  candidateDigest: digestSchema,
  role: ResolvedSkillDiscoveryRoleV1Schema,
}).strict();
export type OfficialSkillDiscoveryLoadRequestV1 = z.infer<
  typeof OfficialSkillDiscoveryLoadRequestV1Schema
>;

export const OfficialSkillDiscoveryLoadedResourceV1Schema = z.object({
  relativePath: portableRelativePathSchema,
  digest: digestSchema,
  size: z.number().int().min(0).max(2 * 1024 * 1024),
}).strict();
export type OfficialSkillDiscoveryLoadedResourceV1 = z.infer<
  typeof OfficialSkillDiscoveryLoadedResourceV1Schema
>;

export const OfficialSkillDiscoveryLoadedOrchestrationV1Schema = z.object({
  markdown: z.string(),
  digest: digestSchema,
}).strict();
export type OfficialSkillDiscoveryLoadedOrchestrationV1 = z.infer<
  typeof OfficialSkillDiscoveryLoadedOrchestrationV1Schema
>;

export const OfficialSkillDiscoveryAttestationV1Schema = z.object({
  schema: z.literal(OFFICIAL_SKILL_DISCOVERY_ATTESTATION_SCHEMA_V1),
  catalogRevision: digestSchema,
  candidateDigest: digestSchema,
  profileDigest: digestSchema,
  resourceRosterDigest: digestSchema,
}).strict();
export type OfficialSkillDiscoveryAttestationV1 = z.infer<
  typeof OfficialSkillDiscoveryAttestationV1Schema
>;

export const OfficialSkillDiscoveryMaterializationV1Schema = z.object({
  /** Project-relative Agent-materialized package root. No resource bytes enter model stdout. */
  materializedRoot: portableRelativePathSchema.nullable(),
  resources: z.array(OfficialSkillDiscoveryLoadedResourceV1Schema).max(32),
}).strict();
export type OfficialSkillDiscoveryMaterializationV1 = z.infer<
  typeof OfficialSkillDiscoveryMaterializationV1Schema
>;

export const OfficialSkillDiscoveryLoadResponseV1Schema = z.object({
  schema: z.literal(OFFICIAL_SKILL_DISCOVERY_LOAD_SCHEMA_V1),
  catalogVersion: versionSchema,
  revision: digestSchema,
  candidate: OfficialSkillDiscoveryCandidateV1Schema,
  resolvedRole: ResolvedSkillDiscoveryRoleV1Schema,
  profileMarkdown: z.string(),
  profileDigest: digestSchema,
  generalOrchestration: OfficialSkillDiscoveryLoadedOrchestrationV1Schema.nullable(),
  materialization: OfficialSkillDiscoveryMaterializationV1Schema,
  attestation: OfficialSkillDiscoveryAttestationV1Schema,
}).strict();
export type OfficialSkillDiscoveryLoadResponseV1 = z.infer<
  typeof OfficialSkillDiscoveryLoadResponseV1Schema
>;

const toolDecisionTextSchema = z.string().trim().min(1).max(4_000);

/** HTTP/CLI request contract; the catalog-only resolver request above omits Agent rationale. */
export const SkillDiscoveryToolLoadRequestV1Schema =
  OfficialSkillDiscoveryLoadRequestV1Schema.extend({
    purpose: toolDecisionTextSchema,
    replaceId: canonicalSkillIdSchema.optional(),
  }).strict();
export type SkillDiscoveryToolLoadRequestV1 = z.infer<
  typeof SkillDiscoveryToolLoadRequestV1Schema
>;

const preparedResourceBytesSchema = z.string()
  .max(4 * Math.ceil((512 * 1024) / 3))
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, {
    message: 'Prepared Skill resource bytes must use canonical base64.',
  });

export const SkillDiscoveryPreparedResourceV1Schema =
  OfficialSkillDiscoveryLoadedResourceV1Schema.extend({
    mode: z.number().int().min(0).max(0o7777),
    bytesBase64: preparedResourceBytesSchema,
  }).strict();
export type SkillDiscoveryPreparedResourceV1 = z.infer<
  typeof SkillDiscoveryPreparedResourceV1Schema
>;

export const SkillDiscoveryPreparedLoadV1Schema =
  OfficialSkillDiscoveryLoadResponseV1Schema.omit({ materialization: true });
export type SkillDiscoveryPreparedLoadV1 = z.infer<
  typeof SkillDiscoveryPreparedLoadV1Schema
>;

const skillDiscoveryPendingTokenSchema = z.string()
  .regex(/^odsp_[A-Za-z0-9_-]{43}$/);

/**
 * Transient daemon-to-CLI prepare response. The CLI consumes these verified
 * bytes locally and must never print this object to Agent-visible stdout.
 */
export const SkillDiscoveryToolLoadPrepareResponseV1Schema = z.object({
  pendingToken: skillDiscoveryPendingTokenSchema,
  expiresAt: z.number().int().nonnegative(),
  expectedStateRevision: z.number().int().positive(),
  alias: canonicalSkillIdSchema,
  loaded: SkillDiscoveryPreparedLoadV1Schema,
  resources: z.array(SkillDiscoveryPreparedResourceV1Schema).max(32),
}).strict();
export type SkillDiscoveryToolLoadPrepareResponseV1 = z.infer<
  typeof SkillDiscoveryToolLoadPrepareResponseV1Schema
>;

export const SkillDiscoveryToolLoadCommitRequestV1Schema = z.object({
  pendingToken: skillDiscoveryPendingTokenSchema,
  expectedStateRevision: z.number().int().positive(),
  materialization: OfficialSkillDiscoveryMaterializationV1Schema,
}).strict();
export type SkillDiscoveryToolLoadCommitRequestV1 = z.infer<
  typeof SkillDiscoveryToolLoadCommitRequestV1Schema
>;

export const SkillDiscoveryToolResolveRequestV1Schema = z.object({
  resolution: z.enum(['none', 'clarify']),
  reason: toolDecisionTextSchema,
}).strict();
export type SkillDiscoveryToolResolveRequestV1 = z.infer<
  typeof SkillDiscoveryToolResolveRequestV1Schema
>;

export const SkillDiscoveryToolDeactivateRequestV1Schema = z.object({
  id: canonicalSkillIdSchema,
  reason: toolDecisionTextSchema,
}).strict();
export type SkillDiscoveryToolDeactivateRequestV1 = z.infer<
  typeof SkillDiscoveryToolDeactivateRequestV1Schema
>;

export const LoadedSkillDiscoveryRefV1Schema = z.object({
  id: canonicalSkillIdSchema,
  kind: z.enum(['task-profile', 'functional']),
  role: ResolvedSkillDiscoveryRoleV1Schema,
  version: versionSchema,
  candidateDigest: digestSchema,
  contentDigest: digestSchema,
  catalogRevision: digestSchema,
  purposeDigest: digestSchema,
  loadedAt: z.number().int().nonnegative(),
  runId: z.string().min(1),
}).strict();
export type LoadedSkillDiscoveryRefV1 = z.infer<typeof LoadedSkillDiscoveryRefV1Schema>;

export const PublicSkillDiscoveryStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(['pending', 'resolved_skill', 'resolved_none', 'clarification']),
  catalogRevision: digestSchema,
  activePrimary: LoadedSkillDiscoveryRefV1Schema.nullable(),
  activeAuxiliaries: z.array(LoadedSkillDiscoveryRefV1Schema).max(2),
  superseded: z.array(LoadedSkillDiscoveryRefV1Schema)
    .max(SKILL_DISCOVERY_MAX_SUPERSEDED_V1),
  lastResolution: z.object({
    kind: z.enum(['skill', 'none', 'clarify']),
    runId: z.string().min(1),
    at: z.number().int().nonnegative(),
  }).strict().nullable(),
  revision: z.number().int().positive(),
}).strict();
export type PublicSkillDiscoveryStateV1 = z.infer<typeof PublicSkillDiscoveryStateV1Schema>;

export const SkillDiscoveryToolSearchResponseV1Schema = z.object({
  search: OfficialSkillDiscoverySearchResponseV1Schema,
}).strict();
export type SkillDiscoveryToolSearchResponseV1 = z.infer<
  typeof SkillDiscoveryToolSearchResponseV1Schema
>;
export const SkillDiscoveryToolLoadResponseV1Schema = z.object({
  loaded: OfficialSkillDiscoveryLoadResponseV1Schema,
  state: PublicSkillDiscoveryStateV1Schema,
}).strict();
export type SkillDiscoveryToolLoadResponseV1 = z.infer<
  typeof SkillDiscoveryToolLoadResponseV1Schema
>;
export const SkillDiscoveryToolStateResponseV1Schema = z.object({
  state: PublicSkillDiscoveryStateV1Schema,
}).strict();
export type SkillDiscoveryToolStateResponseV1 = z.infer<
  typeof SkillDiscoveryToolStateResponseV1Schema
>;
export const SkillDiscoveryToolRehydrateRequestV1Schema = z.object({}).strict();
export const SkillDiscoveryToolRehydrateResponseV1Schema = z.object({
  state: PublicSkillDiscoveryStateV1Schema,
  lifecycleCapsule: z.string().min(1),
}).strict();
export type SkillDiscoveryToolRehydrateResponseV1 = z.infer<
  typeof SkillDiscoveryToolRehydrateResponseV1Schema
>;
