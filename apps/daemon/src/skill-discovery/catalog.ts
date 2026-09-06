import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  type Stats,
} from 'node:fs';
import path from 'node:path';

import {
  OFFICIAL_SKILL_DISCOVERY_ATTESTATION_SCHEMA_V1,
  OFFICIAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1,
  OFFICIAL_SKILL_DISCOVERY_LOAD_SCHEMA_V1,
  OFFICIAL_SKILL_DISCOVERY_MAX_SEARCH_RESULTS_V1,
  OFFICIAL_SKILL_DISCOVERY_SEARCH_SCHEMA_V1,
  OfficialFunctionalSkillDiscoveryCatalogFileV1Schema,
  OfficialSkillDiscoveryCandidateV1Schema,
  OfficialSkillDiscoveryCatalogFileV1Schema,
  OfficialSkillDiscoveryCatalogV1Schema,
  OfficialSkillDiscoveryLoadRequestV1Schema,
  OfficialSkillDiscoveryLoadResponseV1Schema,
  OfficialSkillDiscoveryRoutingMetadataV1Schema,
  OfficialSkillDiscoverySearchRequestV1Schema,
  OfficialSkillDiscoverySearchResponseV1Schema,
  type AppliedStrategyBindingV2,
  type InstalledPluginRecord,
  type OfficialSkillDiscoveryCandidateV1,
  type OfficialSkillDiscoveryCatalogV1,
  type OfficialSkillDiscoveryLoadedOrchestrationV1,
  type OfficialSkillDiscoveryLoadRequestV1,
  type OfficialSkillDiscoveryLoadResponseV1,
  type OfficialSkillDiscoverySearchRequestV1,
  type OfficialSkillDiscoverySearchResponseV1,
  type OfficialFunctionalSkillDiscoveryDeclarationV1,
  type OfficialTaskProfileDiscoveryDeclarationV1,
} from '@open-design/contracts';

import { parseFrontmatter, type FrontmatterObject } from '../design-systems/frontmatter.js';
import {
  createBundledStrategyBindingV2,
  loadBundledStrategyPromptAssetsV2,
} from '../plugins/strategy-package.js';

const DISCOVERY_CATALOG_RELATIVE_PATH = 'agent-discovery/catalog.json';
const DISCOVERY_FUNCTIONAL_CATALOG_RELATIVE_PATH =
  'agent-discovery/functional-catalog.json';
const DISCOVERY_BOOTSTRAP_RELATIVE_PATH = 'agent-discovery/SKILL.md';
const DISCOVERY_ORDINARY_ORCHESTRATION_RELATIVE_PATH =
  'agent-discovery/ordinary-orchestration.md';
const DISCOVERY_TASK_PROFILE_ROOT = 'agent-discovery/task-profiles';
const SKILL_MANIFEST = 'SKILL.md';
const MAX_CATALOG_BYTES = 256 * 1024;
const MAX_SKILL_MANIFEST_BYTES = 256 * 1024;
// Official template previews reach 417,378 bytes; retain bounded per-file reads.
const MAX_RESOURCE_BYTES = 512 * 1024;
const MAX_RESOURCE_COUNT = 32;
const MAX_RESOURCE_PACKAGE_BYTES = 2 * 1024 * 1024;
const CANONICAL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const REQUIRED_TASK_PROFILES = ['prototype', 'ppt', 'marketing', 'hyperframes'] as const;
const CJK_SPAN = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u;
const SEARCH_SPAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu;
const CJK_BIGRAM_STOP_WORDS = new Set([
  '一个',
  '一下',
  '这个',
  '那个',
  '帮我',
  '给我',
  '可以',
  '需要',
  '请你',
  '进行',
]);
const LEXICAL_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'build',
  'create',
  'design',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'make',
  'me',
  'my',
  'new',
  'of',
  'on',
  'or',
  'our',
  'product',
  'the',
  'this',
  'to',
  'turn',
  'use',
  'with',
]);

export interface OfficialSkillDiscoveryCatalogSourcesV1 {
  bundledStrategyPlugin: InstalledPluginRecord;
  /** The product-owned built-in functional Skill root, never a merged/user-first root. */
  builtInFunctionalSkillsRoot: string;
  /** Product-owned templates only; never the user's merged template catalog. */
  builtInDesignTemplatesRoot?: string;
}

type InternalCandidate = InternalTaskProfileCandidate | InternalFunctionalCandidate;

interface InternalTaskProfileCandidate {
  kind: 'task-profile';
  candidate: OfficialSkillDiscoveryCandidateV1;
  binding: AppliedStrategyBindingV2;
  profileMarkdown: string;
  generalOrchestration: OfficialSkillDiscoveryLoadedOrchestrationV1;
  resourceSourceRoot: string;
  resources: InternalResourceBytes[];
}

interface InternalFunctionalCandidate {
  kind: 'functional';
  candidate: OfficialSkillDiscoveryCandidateV1;
  profileMarkdown: string;
  skillRoot: string;
  resources: InternalResourceDescriptor[];
}

interface InternalResourceDescriptor {
  relativePath: string;
  digest: string;
  size: number;
  mode: number;
}

interface InternalResourceBytes extends InternalResourceDescriptor {
  bytes: Buffer;
}

interface BuiltCatalog {
  catalog: OfficialSkillDiscoveryCatalogV1;
  entries: Map<string, InternalCandidate>;
  bootstrapMarkdown: string;
}

export interface OfficialSkillDiscoveryPromptContextV1 {
  catalog: OfficialSkillDiscoveryCatalogV1;
  policyMarkdown: string;
  catalogMarkdown: string;
}

export interface OfficialSkillDiscoveryResourceBundleFileV1 {
  relativePath: string;
  digest: string;
  size: number;
  mode: number;
  bytes: Buffer;
}

/**
 * Daemon-internal verified bytes for a short-lived prepare response.
 * `sourceRoot` is authority-bearing and must never be serialized; `bytes` may
 * cross only into the CLI's in-memory materializer and must not reach stdout.
 */
export interface OfficialSkillDiscoveryResourceBundleV1 {
  skillId: string;
  candidateDigest: string;
  sourceRoot: string;
  files: OfficialSkillDiscoveryResourceBundleFileV1[];
}

export class OfficialSkillDiscoveryCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficialSkillDiscoveryCatalogError';
  }
}

/**
 * Build a fresh official-only catalog. Functional Skills are read directly
 * from the product-owned built-in root; this module deliberately never calls
 * the user-first `listSkills`/`listAllSkills` catalog.
 */
export function readOfficialSkillDiscoveryCatalogV1(
  sources: OfficialSkillDiscoveryCatalogSourcesV1,
): OfficialSkillDiscoveryCatalogV1 {
  return buildOfficialCatalog(sources).catalog;
}

/**
 * Read one pinned catalog snapshot and render the Agent-visible decision
 * context from that exact snapshot. The policy and candidate metadata share
 * the catalog revision used by subsequent load validation.
 */
export function readOfficialSkillDiscoveryPromptContextV1(
  sources: OfficialSkillDiscoveryCatalogSourcesV1,
): OfficialSkillDiscoveryPromptContextV1 {
  const built = buildOfficialCatalog(sources);
  return {
    catalog: built.catalog,
    policyMarkdown: built.bootstrapMarkdown,
    catalogMarkdown: renderOfficialSkillDiscoveryCatalogMarkdownV1(built.catalog),
  };
}

/** Read the product-owned discovery Skill body through the same fenced path. */
export function readOfficialSkillDiscoveryBootstrapV1(
  sources: Pick<OfficialSkillDiscoveryCatalogSourcesV1, 'bundledStrategyPlugin'>,
): string {
  assertBundledOfficialStrategy(sources.bundledStrategyPlugin);
  const pluginRoot = resolveDirectoryRoot(
    sources.bundledStrategyPlugin.fsPath,
    'Bundled strategy root',
    false,
  );
  const bytes = readControlledFile({
    root: pluginRoot,
    relativePath: DISCOVERY_BOOTSTRAP_RELATIVE_PATH,
    maxBytes: MAX_SKILL_MANIFEST_BYTES,
    label: 'Official Skill Discovery bootstrap',
  });
  return parseDiscoveryBootstrapMarkdown(bytes);
}

/**
 * Render every auto-selectable official candidate as compact decision
 * metadata. Full Skill bodies and resources remain excluded and are returned
 * only by the pinned load flow.
 */
export function renderOfficialSkillDiscoveryCatalogMarkdownV1(
  catalog: OfficialSkillDiscoveryCatalogV1,
): string {
  const parsedCatalog = parseOrThrow(
    OfficialSkillDiscoveryCatalogV1Schema,
    catalog,
    'Official Skill Discovery prompt catalog failed validation.',
  );
  const candidates = [...parsedCatalog.candidates]
    .sort((left, right) => {
      const roleOrder = roleSortOrder(left.role) - roleSortOrder(right.role);
      return roleOrder || compareText(left.id, right.id);
    })
    .map((candidate) => JSON.stringify({
      id: candidate.id,
      role: candidate.role,
      allowedRoles: candidate.role === 'either'
        ? ['primary', 'auxiliary']
        : [candidate.role],
      name: candidate.name,
      description: candidate.description,
      ...(candidate.routingMetadata ? { routingMetadata: candidate.routingMetadata } : {}),
      outputKinds: candidate.outputKinds,
      useWhen: candidate.positiveExamples.slice(0, 2),
      avoidWhen: candidate.negativeExamples.slice(0, 2),
      conflictsWith: candidate.conflictsWith,
      version: candidate.version,
      candidateDigest: candidate.candidateDigest,
    }));

  return [
    '# Official Skill metadata catalog',
    '',
    `- Schema: \`${parsedCatalog.schema}\``,
    `- Catalog version: \`${parsedCatalog.version}\``,
    `- Catalog revision: \`${parsedCatalog.revision}\``,
    `- Candidate count: ${candidates.length}`,
    '- Scope: every record below is an official, auto-selectable candidate available to this turn.',
    '- Selection: compare the user request with all records semantically. Search ranking is not required.',
    '- Loading: copy `id`, `candidateDigest`, and the catalog revision above; choose exactly one resolved role from `allowedRoles` for the pinned load command.',
    '',
    '## Candidate records',
    '',
    ...candidates.map((candidate) => `    ${candidate}`),
  ].join('\n');
}

function parseDiscoveryBootstrapMarkdown(bytes: Buffer): string {
  let parsed;
  try {
    parsed = parseFrontmatter(decodeUtf8(bytes, 'Official Skill Discovery bootstrap'));
  } catch {
    throw new OfficialSkillDiscoveryCatalogError(
      'Official Skill Discovery bootstrap frontmatter is invalid.',
    );
  }
  if (
    parsed.data['name'] !== 'agent-skill-discovery'
    || typeof parsed.data['description'] !== 'string'
    || parsed.data['description'].trim() === ''
    || parsed.body.trim() === ''
  ) {
    throw new OfficialSkillDiscoveryCatalogError(
      'Official Skill Discovery bootstrap identity is invalid.',
    );
  }
  return parsed.body.trim();
}

function roleSortOrder(role: OfficialSkillDiscoveryCandidateV1['role']): number {
  if (role === 'primary') return 0;
  if (role === 'either') return 1;
  return 2;
}

/** Deterministic metadata-only lexical retrieval, capped at five summaries. */
export function searchOfficialSkillDiscoveryCatalogV1(input: OfficialSkillDiscoveryCatalogSourcesV1 & {
  request: OfficialSkillDiscoverySearchRequestV1;
}): OfficialSkillDiscoverySearchResponseV1 {
  const catalog = buildOfficialCatalog(input).catalog;
  const request = parseOrThrow(
    OfficialSkillDiscoverySearchRequestV1Schema,
    input.request,
    'Official Skill Discovery search request is invalid.',
  );
  const scored = catalog.candidates
    .filter((candidate) => roleAllows(candidate.role, request.role))
    .filter((candidate) => !request.outputKind || candidate.outputKinds.includes(request.outputKind))
    .map((candidate) => scoreCandidate(candidate, request.query))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.score - left.score || compareText(left.id, right.id))
    .slice(0, request.limit ?? OFFICIAL_SKILL_DISCOVERY_MAX_SEARCH_RESULTS_V1);

  return parseOrThrow(
    OfficialSkillDiscoverySearchResponseV1Schema,
    {
      schema: OFFICIAL_SKILL_DISCOVERY_SEARCH_SCHEMA_V1,
      catalogVersion: catalog.version,
      revision: catalog.revision,
      candidates: scored,
    },
    'Official Skill Discovery search response failed validation.',
  );
}

/**
 * Rebuild and re-hash the official sources before returning any Skill body.
 * A stale revision or candidate digest fails closed; no content is written to
 * the workspace by this resolver.
 */
export function resolveOfficialSkillDiscoveryLoadV1(
  input: OfficialSkillDiscoveryCatalogSourcesV1 & {
    request: OfficialSkillDiscoveryLoadRequestV1;
  },
): OfficialSkillDiscoveryLoadResponseV1 {
  const { built, entry, request } = resolvePinnedOfficialSkillEntry(input);

  return parseOrThrow(
    OfficialSkillDiscoveryLoadResponseV1Schema,
    {
      schema: OFFICIAL_SKILL_DISCOVERY_LOAD_SCHEMA_V1,
      catalogVersion: built.catalog.version,
      revision: built.catalog.revision,
      candidate: entry.candidate,
      resolvedRole: request.role,
      profileMarkdown: entry.profileMarkdown,
      profileDigest: entry.candidate.contentDigest,
      generalOrchestration: entry.kind === 'task-profile'
        ? entry.generalOrchestration
        : null,
      materialization: {
        materializedRoot: null,
        resources: entry.resources.map(({ relativePath, digest, size }) => ({
          relativePath,
          digest,
          size,
        })),
      },
      attestation: {
        schema: OFFICIAL_SKILL_DISCOVERY_ATTESTATION_SCHEMA_V1,
        catalogRevision: built.catalog.revision,
        candidateDigest: entry.candidate.candidateDigest,
        profileDigest: entry.candidate.contentDigest,
        resourceRosterDigest: entry.candidate.resourceRosterDigest,
      },
    },
    'Official Skill Discovery load response failed validation.',
  );
}

/**
 * Resolve selected resource bytes only after the caller has selected a pinned
 * load. Search/catalog construction retains descriptors, not bytes; this
 * second fenced read verifies every size and digest again before prepare.
 */
export function resolveOfficialSkillDiscoveryResourceBundleV1(
  input: OfficialSkillDiscoveryCatalogSourcesV1 & {
    request: OfficialSkillDiscoveryLoadRequestV1;
  },
): OfficialSkillDiscoveryResourceBundleV1 {
  const { entry } = resolvePinnedOfficialSkillEntry(input);
  const sourceRoot = entry.kind === 'functional'
    ? entry.skillRoot
    : entry.resourceSourceRoot;
  const files = entry.kind === 'functional'
    ? captureFunctionalResourceBytes({
      skillRoot: entry.skillRoot,
      skillId: entry.candidate.id,
      resources: entry.resources,
    })
    : entry.resources;
  return {
    skillId: entry.candidate.id,
    candidateDigest: entry.candidate.candidateDigest,
    sourceRoot,
    files: files.map((file) => ({
      relativePath: file.relativePath,
      digest: file.digest,
      size: file.size,
      bytes: file.bytes,
      mode: file.mode,
    })),
  };
}

function resolvePinnedOfficialSkillEntry(
  input: OfficialSkillDiscoveryCatalogSourcesV1 & {
    request: OfficialSkillDiscoveryLoadRequestV1;
  },
): {
  built: BuiltCatalog;
  entry: InternalCandidate;
  request: OfficialSkillDiscoveryLoadRequestV1;
} {
  const request = parseOrThrow(
    OfficialSkillDiscoveryLoadRequestV1Schema,
    input.request,
    'Official Skill Discovery load request is invalid.',
  );
  const built = buildOfficialCatalog(input);
  if (built.catalog.revision !== request.revision) {
    throw new OfficialSkillDiscoveryCatalogError(
      'Official Skill Discovery catalog revision changed before load.',
    );
  }
  const entry = built.entries.get(request.id);
  if (!entry) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Official Skill ${request.id} is unavailable in the pinned catalog revision.`,
    );
  }
  if (entry.candidate.candidateDigest !== request.candidateDigest) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Official Skill ${request.id} digest changed before load.`,
    );
  }
  if (!roleAllows(entry.candidate.role, request.role)) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Official Skill ${request.id} does not allow the requested ${request.role} role.`,
    );
  }
  return { built, entry, request };
}

function buildOfficialCatalog(sources: OfficialSkillDiscoveryCatalogSourcesV1): BuiltCatalog {
  assertBundledOfficialStrategy(sources.bundledStrategyPlugin);
  const pluginRoot = resolveDirectoryRoot(
    sources.bundledStrategyPlugin.fsPath,
    'Bundled strategy root',
    false,
  );
  const catalogDeclaration = readCatalogDeclaration(pluginRoot);
  const functionalCatalogDeclaration = readFunctionalCatalogDeclaration(pluginRoot);
  const bootstrapBytes = readControlledFile({
    root: pluginRoot,
    relativePath: DISCOVERY_BOOTSTRAP_RELATIVE_PATH,
    maxBytes: MAX_SKILL_MANIFEST_BYTES,
    label: 'Official Skill Discovery bootstrap',
  });
  const bootstrapDigest = digestBytes(bootstrapBytes);
  const bootstrapMarkdown = parseDiscoveryBootstrapMarkdown(bootstrapBytes);
  const ordinaryOrchestrationBytes = readControlledFile({
    root: pluginRoot,
    relativePath: DISCOVERY_ORDINARY_ORCHESTRATION_RELATIVE_PATH,
    maxBytes: MAX_SKILL_MANIFEST_BYTES,
    label: 'Official ordinary Agent-turn orchestration',
  });
  const ordinaryOrchestrationMarkdown = decodeUtf8(
    ordinaryOrchestrationBytes,
    'Official ordinary Agent-turn orchestration',
  ).trim();
  if (ordinaryOrchestrationMarkdown === '') {
    throw new OfficialSkillDiscoveryCatalogError(
      'Official ordinary Agent-turn orchestration is empty.',
    );
  }
  if (functionalCatalogDeclaration.version !== catalogDeclaration.version) {
    throw new OfficialSkillDiscoveryCatalogError(
      'Official task-profile and functional Skill discovery catalog versions differ.',
    );
  }
  const entries = [
    ...buildTaskProfileCandidates({
      plugin: sources.bundledStrategyPlugin,
      declaration: catalogDeclaration,
      pluginRoot,
      ordinaryOrchestrationMarkdown,
      ordinaryOrchestrationDigest: digestText(ordinaryOrchestrationMarkdown),
    }),
    ...buildFunctionalCandidates({
      root: sources.builtInFunctionalSkillsRoot,
      catalogVersion: catalogDeclaration.version,
      declarations: functionalCatalogDeclaration.skills.filter(
        (declaration) => (declaration.source ?? 'skills') === 'skills',
      ),
    }),
    ...buildDesignTemplateCandidates({
      root: sources.builtInDesignTemplatesRoot,
      catalogVersion: catalogDeclaration.version,
      declarations: functionalCatalogDeclaration.skills.filter(
        (declaration) => declaration.source === 'design-templates',
      ),
    }),
  ];
  const entryMap = new Map<string, InternalCandidate>();
  for (const entry of entries) {
    if (entryMap.has(entry.candidate.id)) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Official Skill Discovery catalog contains duplicate id ${entry.candidate.id}.`,
      );
    }
    entryMap.set(entry.candidate.id, entry);
  }
  validateConflicts(entryMap);

  const candidates = Array.from(entryMap.values(), (entry) => entry.candidate)
    .sort((left, right) => compareText(left.id, right.id));
  const revision = digestCanonical({
    schema: OFFICIAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1,
    version: catalogDeclaration.version,
    bootstrapDigest,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      candidateDigest: candidate.candidateDigest,
    })),
  });
  const catalog = parseOrThrow(
    OfficialSkillDiscoveryCatalogV1Schema,
    {
      schema: OFFICIAL_SKILL_DISCOVERY_CATALOG_SCHEMA_V1,
      version: catalogDeclaration.version,
      revision,
      candidates,
    },
    'Official Skill Discovery catalog failed validation.',
  );
  return { catalog, entries: entryMap, bootstrapMarkdown };
}

function assertBundledOfficialStrategy(plugin: InstalledPluginRecord): void {
  if (
    plugin.id !== 'od-next-strategy'
    || plugin.sourceKind !== 'bundled'
    || plugin.trust !== 'bundled'
  ) {
    throw new OfficialSkillDiscoveryCatalogError(
      'Official Skill Discovery task profiles require the bundled official strategy record.',
    );
  }
}

function readCatalogDeclaration(pluginRoot: string) {
  const bytes = readControlledFile({
    root: pluginRoot,
    relativePath: DISCOVERY_CATALOG_RELATIVE_PATH,
    maxBytes: MAX_CATALOG_BYTES,
    label: 'Official Skill Discovery catalog declaration',
  });
  let value: unknown;
  try {
    value = JSON.parse(decodeUtf8(bytes, 'Official Skill Discovery catalog declaration'));
  } catch (error) {
    if (error instanceof OfficialSkillDiscoveryCatalogError) throw error;
    throw new OfficialSkillDiscoveryCatalogError(
      'Official Skill Discovery catalog declaration is not valid JSON.',
    );
  }
  const declaration = parseOrThrow(
    OfficialSkillDiscoveryCatalogFileV1Schema,
    value,
    'Official Skill Discovery catalog declaration failed metadata validation.',
  );
  const declaredTaskTypes = new Set(declaration.taskProfiles.map((profile) => profile.taskType));
  for (const taskType of REQUIRED_TASK_PROFILES) {
    if (!declaredTaskTypes.has(taskType)) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Official Skill Discovery catalog is missing task profile ${taskType}.`,
      );
    }
  }
  for (const profile of declaration.taskProfiles) {
    if (profile.id !== profile.taskType) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Official task profile ${profile.id} must use its task type as canonical id.`,
      );
    }
  }
  return declaration;
}

function readFunctionalCatalogDeclaration(pluginRoot: string) {
  const bytes = readControlledFile({
    root: pluginRoot,
    relativePath: DISCOVERY_FUNCTIONAL_CATALOG_RELATIVE_PATH,
    maxBytes: MAX_CATALOG_BYTES,
    label: 'Official functional Skill Discovery catalog declaration',
  });
  let value: unknown;
  try {
    value = JSON.parse(
      decodeUtf8(bytes, 'Official functional Skill Discovery catalog declaration'),
    );
  } catch (error) {
    if (error instanceof OfficialSkillDiscoveryCatalogError) throw error;
    throw new OfficialSkillDiscoveryCatalogError(
      'Official functional Skill Discovery catalog declaration is not valid JSON.',
    );
  }
  return parseOrThrow(
    OfficialFunctionalSkillDiscoveryCatalogFileV1Schema,
    value,
    'Official functional Skill Discovery catalog declaration failed metadata validation.',
  );
}

function buildTaskProfileCandidates(input: {
  plugin: InstalledPluginRecord;
  declaration: { version: string; taskProfiles: OfficialTaskProfileDiscoveryDeclarationV1[] };
  pluginRoot: string;
  ordinaryOrchestrationMarkdown: string;
  ordinaryOrchestrationDigest: string;
}): InternalTaskProfileCandidate[] {
  return input.declaration.taskProfiles.map((metadata) => {
    let binding: AppliedStrategyBindingV2;
    let loaded: ReturnType<typeof loadBundledStrategyPromptAssetsV2>;
    try {
      binding = createBundledStrategyBindingV2({
        plugin: input.plugin,
        taskType: metadata.taskType,
      });
      loaded = loadBundledStrategyPromptAssetsV2({ plugin: input.plugin, binding });
    } catch {
      throw new OfficialSkillDiscoveryCatalogError(
        `Official task profile ${metadata.id} failed bundled identity validation.`,
      );
    }

    const v2ProfileDigest = digestText(loaded.taskSkill);
    if (v2ProfileDigest !== prefixDigest(binding.selectedTaskProfile.sha256)) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Official task profile ${metadata.id} body digest does not match its binding.`,
      );
    }
    const adapterRelativePath = `${DISCOVERY_TASK_PROFILE_ROOT}/${metadata.taskType}.md`;
    const adapterBytes = readControlledFile({
      root: input.pluginRoot,
      relativePath: adapterRelativePath,
      maxBytes: MAX_SKILL_MANIFEST_BYTES,
      label: `Official task profile ${metadata.id} ordinary adapter`,
    });
    const profileMarkdown = decodeUtf8(
      adapterBytes,
      `Official task profile ${metadata.id} ordinary adapter`,
    ).trim();
    if (profileMarkdown === '') {
      throw new OfficialSkillDiscoveryCatalogError(
        `Official task profile ${metadata.id} ordinary adapter is empty.`,
      );
    }
    const profileDigest = digestText(profileMarkdown);
    const generalOrchestration: OfficialSkillDiscoveryLoadedOrchestrationV1 = {
      markdown: input.ordinaryOrchestrationMarkdown,
      digest: input.ordinaryOrchestrationDigest,
    };
    const sourceResourcePrefix = `assets/task-profiles/${metadata.taskType}/`;
    const resources = loaded.taskResources.map((resource) => {
      const sourceRelativePath = normalizeOutputRelativePath(resource.path);
      if (!sourceRelativePath.startsWith(sourceResourcePrefix)) {
        throw new OfficialSkillDiscoveryCatalogError(
          `Official task profile ${metadata.id} resource is outside its profile package.`,
        );
      }
      const relativePath = normalizeOutputRelativePath(
        sourceRelativePath.slice(sourceResourcePrefix.length),
      );
      const bytes = Buffer.from(resource.text, 'utf8');
      const digest = digestBytes(bytes);
      const inspected = digestControlledFile({
        root: input.pluginRoot,
        relativePath: sourceRelativePath,
        maxBytes: MAX_RESOURCE_BYTES,
        label: `Official task profile ${metadata.id} resource ${relativePath}`,
      });
      const declaredDigest = binding.assetDigests.find(
        (asset) => asset.path === resource.path,
      )?.sha256;
      if (
        !declaredDigest
        || prefixDigest(declaredDigest) !== digest
        || inspected.digest !== digest
        || inspected.size !== bytes.byteLength
      ) {
        throw new OfficialSkillDiscoveryCatalogError(
          `Official task profile ${metadata.id} resource roster changed during validation.`,
        );
      }
      return {
        relativePath,
        digest,
        size: bytes.byteLength,
        mode: inspected.mode,
        bytes,
      };
    });
    const resourceRosterDigest = digestResourceRoster(
      generalOrchestration,
      resources,
    );
    const candidate = createCandidate({
      catalogVersion: input.declaration.version,
      metadata,
      origin: { kind: 'bundled-task-profile', taskType: metadata.taskType },
      version: binding.selectedTaskProfile.version,
      contentDigest: profileDigest,
      resourceRosterDigest,
      sourceIdentity: digestCanonical({
        packageHash: prefixDigest(binding.packageHash),
        v2ProfileDigest,
      }),
    });
    return {
      kind: 'task-profile',
      candidate,
      binding,
      profileMarkdown,
      generalOrchestration,
      resourceSourceRoot: resources.length === 0
        ? input.pluginRoot
        : resolveDirectoryRoot(
          path.join(input.pluginRoot, sourceResourcePrefix),
          `Official task profile ${metadata.id} resource root`,
          true,
        ),
      resources,
    };
  });
}

function buildDesignTemplateCandidates(input: {
  root: string | undefined;
  catalogVersion: string;
  declarations: OfficialFunctionalSkillDiscoveryDeclarationV1[];
}): InternalFunctionalCandidate[] {
  if (!input.root) {
    if (input.declarations.length === 0) return [];
    throw new OfficialSkillDiscoveryCatalogError(
      'Built-in design template root is required for its discovery declarations.',
    );
  }
  return buildFunctionalCandidates({ ...input, root: input.root, designTemplates: true });
}

function buildFunctionalCandidates(input: {
  root: string;
  catalogVersion: string;
  declarations: OfficialFunctionalSkillDiscoveryDeclarationV1[];
  designTemplates?: boolean;
}): InternalFunctionalCandidate[] {
  const root = resolveDirectoryRoot(input.root, 'Built-in functional Skill root', true);
  let directoryEntries;
  try {
    directoryEntries = readdirSync(root, { withFileTypes: true })
      .sort((left, right) => compareText(left.name, right.name));
  } catch {
    throw new OfficialSkillDiscoveryCatalogError(
      'Built-in functional Skill root is unavailable.',
    );
  }

  const discoveredFolders: string[] = [];
  for (const entry of directoryEntries) {
    if (entry.isSymbolicLink()) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill root entry ${entry.name} may not be symbolic.`,
      );
    }
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(root, entry.name, SKILL_MANIFEST);
    let manifestStats: Stats;
    try {
      manifestStats = lstatSync(manifestPath);
    } catch {
      continue;
    }
    if (!CANONICAL_ID.test(entry.name)) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill source folder ${entry.name} is not canonical.`,
      );
    }
    if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${entry.name} manifest is invalid.`,
      );
    }
    discoveredFolders.push(entry.name);
  }

  const declarationsByFolder = new Map(
    input.declarations.map((declaration) => [declaration.sourceFolder, declaration]),
  );
  for (const sourceFolder of discoveredFolders) {
    if (!declarationsByFolder.has(sourceFolder)) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${sourceFolder} is missing its discovery declaration.`,
      );
    }
  }
  for (const declaration of input.declarations) {
    if (!discoveredFolders.includes(declaration.sourceFolder)) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Functional Skill discovery declaration ${declaration.sourceFolder} has no official SKILL.md.`,
      );
    }
  }

  const candidates: InternalFunctionalCandidate[] = [];
  for (const metadata of input.declarations) {
    const skillRoot = resolveBuiltInSkillRoot(root, metadata.sourceFolder);
    const manifestPath = path.join(skillRoot, SKILL_MANIFEST);
    let manifestStats: Stats;
    try {
      manifestStats = lstatSync(manifestPath);
    } catch {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${metadata.sourceFolder} manifest is unavailable.`,
      );
    }
    if (manifestStats.isSymbolicLink()) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${metadata.sourceFolder} manifest may not be symbolic.`,
      );
    }
    if (!manifestStats.isFile()) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${metadata.sourceFolder} manifest is invalid.`,
      );
    }

    const manifestBytes = readControlledFile({
      root: skillRoot,
      relativePath: SKILL_MANIFEST,
      maxBytes: MAX_SKILL_MANIFEST_BYTES,
      label: `Built-in functional Skill ${metadata.sourceFolder} manifest`,
    });
    const raw = decodeUtf8(
      manifestBytes,
      `Built-in functional Skill ${metadata.sourceFolder} manifest`,
    );
    let parsed;
    try {
      parsed = parseFrontmatter(raw);
    } catch {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${metadata.sourceFolder} frontmatter is invalid.`,
      );
    }
    const name = parsed.data['name'];
    const description = parsed.data['description'];
    if (
      typeof name !== 'string'
      || name !== metadata.id
      || typeof description !== 'string'
      || description.trim() === ''
    ) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${metadata.sourceFolder} identity metadata is invalid.`,
      );
    }
    const discoveredResources = listFunctionalResourcePaths({
      skillRoot,
      skillId: metadata.id,
    });
    validateFunctionalResourceDeclaration({
      skillId: metadata.id,
      discoveredResources,
      declaredResources: metadata.resources,
    });
    const resources = inspectFunctionalResources({
      skillRoot,
      skillId: metadata.id,
      relativePaths: metadata.resources,
    });
    const contentDigest = digestText(parsed.body);
    const resourceRosterDigest = digestResourceRoster(null, resources);
    const candidate = createCandidate({
      catalogVersion: input.catalogVersion,
      metadata: {
        id: metadata.id,
        name,
        description,
        ...(input.designTemplates
          ? { routingMetadata: readTemplateRoutingMetadata(parsed.data, metadata.id) }
          : {}),
        autoSelectable: metadata.autoSelectable,
        role: metadata.role,
        outputKinds: metadata.outputKinds,
        positiveExamples: metadata.positiveExamples,
        negativeExamples: metadata.negativeExamples,
        conflictsWith: metadata.conflictsWith,
      },
      origin: { kind: input.designTemplates ? 'built-in-design-template' : 'built-in-functional' },
      version: metadata.version,
      contentDigest,
      resourceRosterDigest,
      sourceIdentity: digestBytes(manifestBytes),
    });
    candidates.push({
      kind: 'functional',
      candidate,
      profileMarkdown: parsed.body,
      skillRoot,
      resources,
    });
  }
  return candidates;
}

function readTemplateRoutingMetadata(
  data: FrontmatterObject,
  skillId: string,
): OfficialSkillDiscoveryCandidateV1['routingMetadata'] {
  const od = data['od'];
  if (od === null || typeof od !== 'object' || Array.isArray(od)) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Built-in design template ${skillId} routing metadata is invalid.`,
    );
  }
  return parseOrThrow(
    OfficialSkillDiscoveryRoutingMetadataV1Schema,
    {
      enName: data['en_name'],
      zhName: data['zh_name'],
      zhDescription: data['zh_description'],
      taskType: od['task_type'],
      platform: od['platform'],
      scenario: od['scenario'],
      category: od['category'],
      examplePrompt: od['example_prompt'],
    },
    `Built-in design template ${skillId} routing metadata is invalid.`,
  );
}

function inspectFunctionalResources(input: {
  skillRoot: string;
  skillId: string;
  relativePaths: string[];
}): InternalResourceDescriptor[] {
  if (input.relativePaths.length > MAX_RESOURCE_COUNT) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Built-in functional Skill ${input.skillId} references too many side files.`,
    );
  }
  let packageBytes = 0;
  return input.relativePaths.map((relativePath) => {
    const inspected = digestControlledFile({
      root: input.skillRoot,
      relativePath,
      maxBytes: MAX_RESOURCE_BYTES,
      label: `Built-in functional Skill ${input.skillId} resource ${relativePath}`,
    });
    packageBytes += inspected.size;
    if (packageBytes > MAX_RESOURCE_PACKAGE_BYTES) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${input.skillId} resource package is too large.`,
      );
    }
    return {
      relativePath,
      digest: inspected.digest,
      size: inspected.size,
      mode: inspected.mode,
    };
  });
}

function captureFunctionalResourceBytes(input: {
  skillRoot: string;
  skillId: string;
  resources: InternalResourceDescriptor[];
}): InternalResourceBytes[] {
  let packageBytes = 0;
  return input.resources.map((resource) => {
    const captured = readControlledFileDetails({
      root: input.skillRoot,
      relativePath: resource.relativePath,
      maxBytes: MAX_RESOURCE_BYTES,
      label: `Built-in functional Skill ${input.skillId} resource ${resource.relativePath}`,
    });
    const { bytes } = captured;
    packageBytes += bytes.byteLength;
    if (packageBytes > MAX_RESOURCE_PACKAGE_BYTES) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${input.skillId} resource package is too large.`,
      );
    }
    const digest = digestBytes(bytes);
    if (
      bytes.byteLength !== resource.size
      || digest !== resource.digest
      || captured.mode !== resource.mode
    ) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${input.skillId} resource changed before materialization.`,
      );
    }
    return {
      relativePath: resource.relativePath,
      digest,
      size: bytes.byteLength,
      mode: captured.mode,
      bytes,
    };
  });
}

function validateFunctionalResourceDeclaration(input: {
  skillId: string;
  discoveredResources: string[];
  declaredResources: string[];
}): void {
  const discovered = [...input.discoveredResources].sort(compareText);
  const declared = [...input.declaredResources].sort(compareText);
  if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Built-in functional Skill ${input.skillId} resource declaration is stale.`,
    );
  }
}

function listFunctionalResourcePaths(input: {
  skillRoot: string;
  skillId: string;
}): string[] {
  const resources: string[] = [];

  const visit = (directory: string, relativeDirectory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true })
        .sort((left, right) => compareText(left.name, right.name));
    } catch {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${input.skillId} resource directory is unavailable.`,
      );
    }
    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      const normalized = normalizeControlledRelativePath(
        relativePath,
        `Built-in functional Skill ${input.skillId} resource`,
      );
      const candidate = path.resolve(input.skillRoot, ...normalized.split('/'));
      assertInsideRoot(input.skillRoot, candidate);
      let stats: Stats;
      try {
        stats = lstatSync(candidate);
      } catch {
        throw new OfficialSkillDiscoveryCatalogError(
          `Built-in functional Skill ${input.skillId} resource changed during traversal.`,
        );
      }
      if (entry.isSymbolicLink() || stats.isSymbolicLink()) {
        throw new OfficialSkillDiscoveryCatalogError(
          `Built-in functional Skill ${input.skillId} resource may not be symbolic.`,
        );
      }
      if (entry.isDirectory() && stats.isDirectory()) {
        visit(candidate, normalized);
        continue;
      }
      if (entry.isFile() && stats.isFile()) {
        if (normalized !== SKILL_MANIFEST) resources.push(normalized);
        continue;
      }
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${input.skillId} resource is not a regular file or directory.`,
      );
    }
  };

  visit(input.skillRoot, '');
  if (resources.length > MAX_RESOURCE_COUNT) {
    throw new OfficialSkillDiscoveryCatalogError(
      `Built-in functional Skill ${input.skillId} contains too many resource files.`,
    );
  }
  return resources;
}

function createCandidate(input: {
  catalogVersion: string;
  metadata: {
    id: string;
    name: string;
    description: string;
    routingMetadata?: OfficialSkillDiscoveryCandidateV1['routingMetadata'];
    autoSelectable: true;
    role: 'primary' | 'auxiliary' | 'either';
    outputKinds: string[];
    positiveExamples: string[];
    negativeExamples: string[];
    conflictsWith: string[];
  };
  origin:
    | { kind: 'bundled-task-profile'; taskType: 'prototype' | 'ppt' | 'marketing' | 'hyperframes' }
    | { kind: 'built-in-functional' | 'built-in-design-template' };
  version: string;
  contentDigest: string;
  resourceRosterDigest: string;
  sourceIdentity: string;
}): OfficialSkillDiscoveryCandidateV1 {
  const candidateWithoutDigest = {
    id: input.metadata.id,
    name: input.metadata.name,
    description: input.metadata.description,
    ...(input.metadata.routingMetadata ? { routingMetadata: input.metadata.routingMetadata } : {}),
    autoSelectable: input.metadata.autoSelectable,
    role: input.metadata.role,
    outputKinds: [...input.metadata.outputKinds],
    positiveExamples: [...input.metadata.positiveExamples],
    negativeExamples: [...input.metadata.negativeExamples],
    conflictsWith: [...input.metadata.conflictsWith],
    origin: input.origin,
    version: input.version,
    catalogVersion: input.catalogVersion,
    contentDigest: input.contentDigest,
    resourceRosterDigest: input.resourceRosterDigest,
  };
  return parseOrThrow(
    OfficialSkillDiscoveryCandidateV1Schema,
    {
      ...candidateWithoutDigest,
      candidateDigest: digestCanonical({
        ...candidateWithoutDigest,
        sourceIdentity: input.sourceIdentity,
      }),
    },
    `Official Skill ${input.metadata.id} candidate metadata is invalid.`,
  );
}

function validateConflicts(entries: Map<string, InternalCandidate>): void {
  for (const entry of entries.values()) {
    for (const conflictId of entry.candidate.conflictsWith) {
      if (conflictId === entry.candidate.id) {
        throw new OfficialSkillDiscoveryCatalogError(
          `Official Skill ${entry.candidate.id} may not conflict with itself.`,
        );
      }
      const peer = entries.get(conflictId);
      if (!peer) {
        throw new OfficialSkillDiscoveryCatalogError(
          `Official Skill ${entry.candidate.id} declares unknown conflict ${conflictId}.`,
        );
      }
      if (!peer.candidate.conflictsWith.includes(entry.candidate.id)) {
        throw new OfficialSkillDiscoveryCatalogError(
          `Official Skill conflict ${entry.candidate.id}/${conflictId} must be symmetric.`,
        );
      }
    }
  }
}

function scoreCandidate(
  candidate: OfficialSkillDiscoveryCandidateV1,
  query: string,
) {
  const normalizedQuery = normalizeSearchText(query);
  if (
    explicitlyExcludesCandidate(normalizedQuery, candidate)
    || (hasNonExecutionIntent(normalizedQuery) && !hasExecutionIntent(normalizedQuery))
  ) {
    return null;
  }
  const queryTokens = querySearchTokens(normalizedQuery);
  const matchedPositiveExamples: string[] = [];
  const matchedNegativeExamples: string[] = [];
  let score = 0;

  for (const example of candidate.negativeExamples) {
    const normalized = normalizeSearchText(example);
    const evidence = evidenceScore(normalizedQuery, queryTokens, normalized);
    if (normalized === normalizedQuery || normalizedQuery.includes(normalized)) return null;
    if (hasNonExecutionIntent(normalizedQuery) && evidence > 0) {
      matchedNegativeExamples.push(example);
      score -= evidence * 6;
    }
  }
  for (const example of candidate.positiveExamples) {
    const normalized = normalizeSearchText(example);
    const evidence = evidenceScore(normalizedQuery, queryTokens, normalized);
    if (evidence > 0) matchedPositiveExamples.push(example);
    score += evidence * 8;
  }

  const id = normalizeSearchText(candidate.id);
  const name = normalizeSearchText(candidate.name);
  const description = normalizeSearchText(candidate.description);
  if (normalizedQuery === id || normalizedQuery === name) score += 1_000;
  if (normalizedQuery.includes(id) || id.includes(normalizedQuery)) score += 200;
  if (normalizedQuery.includes(name) || name.includes(normalizedQuery)) score += 200;
  score += tokenOverlap(queryTokens, tokenize(name)) * 40;
  score += tokenOverlap(queryTokens, tokenize(description)) * 8;
  for (const outputKind of candidate.outputKinds) {
    const normalized = normalizeSearchText(outputKind.replaceAll('-', ' '));
    if (normalizedQuery.includes(normalized) || normalized.includes(normalizedQuery)) score += 80;
    score += tokenOverlap(queryTokens, tokenize(normalized)) * 12;
  }
  if (score <= 0) return null;
  return {
    ...candidate,
    score: Math.round(score),
    matchedPositiveExamples,
    matchedNegativeExamples,
  };
}

function explicitlyExcludesCandidate(
  normalizedQuery: string,
  candidate: OfficialSkillDiscoveryCandidateV1,
): boolean {
  const identities = new Set([
    normalizeSearchText(candidate.id),
    normalizeSearchText(candidate.name),
  ]);
  for (const identity of identities) {
    if (
      normalizedQuery.includes(`do not use the ${identity} skill`)
      || normalizedQuery.includes(`do not use ${identity}`)
      || normalizedQuery.includes(`don't use the ${identity} skill`)
      || normalizedQuery.includes(`don't use ${identity}`)
      || normalizedQuery.includes(`不要使用 ${identity}`)
      || normalizedQuery.includes(`不要使用${identity}`)
      || normalizedQuery.includes(`别用 ${identity}`)
      || normalizedQuery.includes(`别用${identity}`)
      || (
        normalizedQuery.includes(identity)
        && normalizedQuery.includes("not open design's official")
      )
    ) {
      return true;
    }
  }
  return false;
}

function hasNonExecutionIntent(normalizedQuery: string): boolean {
  return /(?:\bwhat (?:is|does)\b|\bexplain\b|\bdefine\b|\bcompare\b|\bdoes\b.+\bsupport\b|\bis\b.+\?(?:\s|$)|\bsummarize\b|\bcreate nothing\b|\bdo not (?:write|create|make|perform|start)\b|\bno images?\b|什么是|是什么意思|解释(?:一下)?|分析|只解释|总结(?:一下|成)?|先聊聊|不要(?:改|做|制作|生成|开始|设计|写)|不用继续)/iu.test(normalizedQuery);
}

function hasExecutionIntent(normalizedQuery: string): boolean {
  const affirmativeClauses = normalizedQuery
    .replace(/\bcreate nothing\b[^.;]*/giu, '')
    .replace(/\bdo not (?:write|create|make|perform|start)\b[^.;]*/giu, '')
    .replace(/不要(?:改|做|制作|生成|开始|设计|写)[^，。；]*/gu, '')
    .replace(/先聊聊[^，。；]*/gu, '');
  return /(?:\bbuild\b|(?:^|[.!?]\s*)create\b|(?:^|[.!?]\s*)design\b|\bimplement\b|\bgenerate\b|\bmake\b|\bturn\b|\bclone\b|\bcapture\b|\bexport\b|\bredesign\b|做(?:一个|一份|一套|一张|一支|个)?|制作|设计并|实现|生成|创建|重做|换成|整理成)/iu.test(affirmativeClauses);
}

function querySearchTokens(normalizedQuery: string): Set<string> {
  const tokens = tokenize(normalizedQuery);
  if (!hasExecutionIntent(normalizedQuery)) return tokens;
  const aliases: string[] = [];
  if (/(?:官网|网站|网页|web\s*(?:site|app)|website|landing\s*page)/iu.test(normalizedQuery)) {
    aliases.push('website prototype frontend web design landing page');
  }
  if (/(?:仪表盘|dashboard)/iu.test(normalizedQuery)) {
    aliases.push('dashboard design frontend');
  }
  if (/(?:重做|redesign|improve current ui)/iu.test(normalizedQuery)) {
    aliases.push('redesign existing project premium redesign');
  }
  if (/(?:figma).*(?:实现|implement|code)|(?:实现|implement).*(?:figma)/iu.test(normalizedQuery)) {
    aliases.push('figma to code implement figma');
  }
  if (/(?:clone|复刻|仿站).*(?:website|site|网站)|(?:website|site|网站).*(?:clone|复刻|仿站)/iu.test(normalizedQuery)) {
    aliases.push('clone website reproduce site web clone');
  }
  if (/(?:pptx?|powerpoint|幻灯片|keynote|slide(?:s|\s*deck)?|presentation\s*deck|路演)/iu.test(normalizedQuery)) {
    aliases.push('pptx powerpoint slide deck create slides html slides interactive deck');
  }
  if (/(?:营销海报|广告|social\s+ads?|campaign\s+(?:card|asset)|投放素材)/iu.test(normalizedQuery)) {
    aliases.push('ad creative paid social ad campaign visual');
  }
  if (/(?:电商|商品图|产品图|ecommerce|commerce\s+image)/iu.test(normalizedQuery)) {
    aliases.push('ecommerce product images product image set product main image');
  }
  if (/(?:xiaohongshu|小红书)/iu.test(normalizedQuery)) {
    aliases.push('xiaohongshu card');
  }
  if (/(?:视频|动画|动态|animated|motion|scene\s+structure|sequence)/iu.test(normalizedQuery)) {
    aliases.push('video hyperframes remotion motion graphics video composition');
  }
  if (/(?:watercolor|illustration|插画|绘制)/iu.test(normalizedQuery)) {
    aliases.push('generate image image gen');
  }
  if (/(?:背景换|换.*背景|background\s+(?:removal|replace|change)|remove\s+(?:the\s+)?background)/iu.test(normalizedQuery)) {
    aliases.push('fal image edit background removal');
  }
  if (/(?:full[- ]page screenshot|整页截图|长截图)/iu.test(normalizedQuery)) {
    aliases.push('full page screenshot web capture');
  }
  for (const alias of aliases) {
    for (const token of tokenize(alias)) tokens.add(token);
  }
  return tokens;
}

function evidenceScore(
  query: string,
  queryTokens: Set<string>,
  evidence: string,
): number {
  if (query === evidence) return 300;
  if (query.includes(evidence) || evidence.includes(query)) return 120;
  return tokenOverlap(queryTokens, tokenize(evidence)) * 10;
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/g, ' ');
}

function tokenize(value: string): Set<string> {
  const tokens = new Set<string>();
  for (const span of value.match(SEARCH_SPAN) ?? []) {
    if (!CJK_SPAN.test(span)) {
      if (!LEXICAL_STOP_WORDS.has(span)) tokens.add(stemLatinToken(span));
      continue;
    }
    const characters = Array.from(span);
    for (let index = 0; index + 1 < characters.length; index++) {
      const bigram = `${characters[index]}${characters[index + 1]}`;
      if (!CJK_BIGRAM_STOP_WORDS.has(bigram)) tokens.add(`cjk2:${bigram}`);
    }
    for (let index = 0; index + 2 < characters.length; index++) {
      tokens.add(`cjk3:${characters[index]}${characters[index + 1]}${characters[index + 2]}`);
    }
  }
  return tokens;
}

function stemLatinToken(token: string): string {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenOverlap(left: Set<string>, right: Set<string>): number {
  let lexicalMatches = 0;
  let cjkMatches = 0;
  for (const token of left) {
    if (!right.has(token)) continue;
    if (token.startsWith('cjk2:') || token.startsWith('cjk3:')) cjkMatches++;
    else lexicalMatches++;
  }
  // One shared CJK n-gram is commonly incidental. Require two independent
  // fragments unless an exact/substring match already returned above.
  return lexicalMatches + (cjkMatches >= 2 ? cjkMatches : 0);
}

function roleAllows(
  candidateRole: 'primary' | 'auxiliary' | 'either',
  requestedRole: 'primary' | 'auxiliary' | undefined,
): boolean {
  return requestedRole === undefined
    || candidateRole === 'either'
    || candidateRole === requestedRole;
}

function resolveDirectoryRoot(
  candidate: string,
  label: string,
  rejectRootSymlink: boolean,
): string {
  try {
    const link = lstatSync(candidate);
    if (rejectRootSymlink && link.isSymbolicLink()) {
      throw new OfficialSkillDiscoveryCatalogError(`${label} may not be symbolic.`);
    }
    if (!link.isDirectory()) {
      throw new OfficialSkillDiscoveryCatalogError(`${label} is not a directory.`);
    }
    return realpathSync(candidate);
  } catch (error) {
    if (error instanceof OfficialSkillDiscoveryCatalogError) throw error;
    throw new OfficialSkillDiscoveryCatalogError(`${label} is unavailable.`);
  }
}

function resolveBuiltInSkillRoot(root: string, skillId: string): string {
  try {
    const candidate = path.join(root, skillId);
    const link = lstatSync(candidate);
    if (link.isSymbolicLink() || !link.isDirectory()) {
      throw new OfficialSkillDiscoveryCatalogError(
        `Built-in functional Skill ${skillId} root is invalid.`,
      );
    }
    const resolved = realpathSync(candidate);
    assertInsideRoot(root, resolved);
    return resolved;
  } catch (error) {
    if (error instanceof OfficialSkillDiscoveryCatalogError) throw error;
    throw new OfficialSkillDiscoveryCatalogError(
      `Built-in functional Skill ${skillId} root is unavailable.`,
    );
  }
}

function readControlledFile(input: {
  root: string;
  relativePath: string;
  maxBytes: number;
  label: string;
}): Buffer {
  return readControlledFileDetails(input).bytes;
}

function readControlledFileDetails(input: {
  root: string;
  relativePath: string;
  maxBytes: number;
  label: string;
}): { bytes: Buffer; mode: number } {
  const relativePath = normalizeControlledRelativePath(input.relativePath, input.label);
  const candidate = path.resolve(input.root, ...relativePath.split('/'));
  let descriptor: number | undefined;
  try {
    assertInsideRoot(input.root, candidate);
    let current = input.root;
    for (const segment of relativePath.split('/')) {
      current = path.join(current, segment);
      const link = lstatSync(current);
      if (link.isSymbolicLink()) {
        throw new OfficialSkillDiscoveryCatalogError(`${input.label} may not cross a symbolic link.`);
      }
    }
    const realCandidate = realpathSync(candidate);
    assertInsideRoot(input.root, realCandidate);
    if (!statSync(realCandidate).isFile()) {
      throw new OfficialSkillDiscoveryCatalogError(`${input.label} is not a regular file.`);
    }
    descriptor = openSync(
      realCandidate,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > input.maxBytes) {
      throw new OfficialSkillDiscoveryCatalogError(`${input.label} is invalid or too large.`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const verifiedCandidate = realpathSync(candidate);
    assertInsideRoot(input.root, verifiedCandidate);
    const verified = statSync(verifiedCandidate);
    if (
      bytes.byteLength > input.maxBytes
      || !sameFileIdentity(before, after)
      || !sameFileIdentity(after, verified)
    ) {
      throw new OfficialSkillDiscoveryCatalogError(`${input.label} changed while it was read.`);
    }
    return { bytes, mode: before.mode & 0o777 };
  } catch (error) {
    if (error instanceof OfficialSkillDiscoveryCatalogError) throw error;
    throw new OfficialSkillDiscoveryCatalogError(`${input.label} is unavailable.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function digestControlledFile(input: {
  root: string;
  relativePath: string;
  maxBytes: number;
  label: string;
}): { digest: string; size: number; mode: number } {
  const relativePath = normalizeControlledRelativePath(input.relativePath, input.label);
  const candidate = path.resolve(input.root, ...relativePath.split('/'));
  let descriptor: number | undefined;
  try {
    assertInsideRoot(input.root, candidate);
    let current = input.root;
    for (const segment of relativePath.split('/')) {
      current = path.join(current, segment);
      const link = lstatSync(current);
      if (link.isSymbolicLink()) {
        throw new OfficialSkillDiscoveryCatalogError(`${input.label} may not cross a symbolic link.`);
      }
    }
    const realCandidate = realpathSync(candidate);
    assertInsideRoot(input.root, realCandidate);
    if (!statSync(realCandidate).isFile()) {
      throw new OfficialSkillDiscoveryCatalogError(`${input.label} is not a regular file.`);
    }
    descriptor = openSync(
      realCandidate,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size > input.maxBytes) {
      throw new OfficialSkillDiscoveryCatalogError(`${input.label} is invalid or too large.`);
    }
    const hash = createHash('sha256');
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, input.maxBytes));
    let size = 0;
    while (true) {
      const bytesRead = readSync(descriptor, chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > input.maxBytes) {
        throw new OfficialSkillDiscoveryCatalogError(`${input.label} is invalid or too large.`);
      }
      hash.update(chunk.subarray(0, bytesRead));
    }
    const after = fstatSync(descriptor);
    const verifiedCandidate = realpathSync(candidate);
    assertInsideRoot(input.root, verifiedCandidate);
    const verified = statSync(verifiedCandidate);
    if (
      size !== before.size
      || !sameFileIdentity(before, after)
      || !sameFileIdentity(after, verified)
    ) {
      throw new OfficialSkillDiscoveryCatalogError(`${input.label} changed while it was hashed.`);
    }
    return {
      digest: `sha256:${hash.digest('hex')}`,
      size,
      mode: before.mode & 0o777,
    };
  } catch (error) {
    if (error instanceof OfficialSkillDiscoveryCatalogError) throw error;
    throw new OfficialSkillDiscoveryCatalogError(`${input.label} is unavailable.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function normalizeControlledRelativePath(value: string, label: string): string {
  if (
    !value
    || path.isAbsolute(value)
    || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value)
  ) {
    throw new OfficialSkillDiscoveryCatalogError(`${label} has an invalid relative path.`);
  }
  return value;
}

function normalizeOutputRelativePath(value: string): string {
  const withoutPrefix = value.startsWith('./') ? value.slice(2) : value;
  return normalizeControlledRelativePath(withoutPrefix, 'Official Skill resource');
}

function assertInsideRoot(root: string, candidate: string): void {
  const relative = path.relative(root, candidate);
  if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) return;
  throw new OfficialSkillDiscoveryCatalogError('Official Skill resource escapes its authority root.');
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  const decoded = decodeUtf8IfPossible(bytes);
  if (decoded === null) {
    throw new OfficialSkillDiscoveryCatalogError(`${label} is not valid UTF-8.`);
  }
  return decoded;
}

function decodeUtf8IfPossible(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function digestResourceRoster(
  orchestration: OfficialSkillDiscoveryLoadedOrchestrationV1 | null,
  resources: readonly InternalResourceDescriptor[],
): string {
  return digestCanonical({
    orchestrationDigest: orchestration?.digest ?? null,
    resources: resources.map((resource) => ({
      relativePath: resource.relativePath,
      digest: resource.digest,
      size: resource.size,
      mode: resource.mode,
    })),
  });
}

function digestText(value: string): string {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function digestBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function prefixDigest(value: string): string {
  return value.startsWith('sha256:') ? value : `sha256:${value}`;
}

function digestCanonical(value: unknown): string {
  return digestText(JSON.stringify(canonicalize(value)));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseOrThrow<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
  message: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new OfficialSkillDiscoveryCatalogError(message);
  return parsed.data;
}
