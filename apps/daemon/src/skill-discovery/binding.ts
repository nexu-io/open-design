import type {
  ProjectMetadata,
  ProjectSkillDiscovery,
  ProjectSkillDiscoveryBinding,
} from '@open-design/contracts';

export type AgentNativeSkillDiscoveryMode = 'off' | 'observe' | 'canary' | 'active';

export class InvalidProjectSkillDiscoveryError extends Error {
  constructor(message = 'skillDiscovery is invalid') {
    super(message);
    this.name = 'InvalidProjectSkillDiscoveryError';
  }
}

export function parseProjectSkillDiscoveryRequest(
  value: unknown,
): ProjectSkillDiscovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidProjectSkillDiscoveryError();
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== 2
    || record.mode !== 'agent'
    || record.catalog !== 'open-design-official'
  ) {
    throw new InvalidProjectSkillDiscoveryError();
  }
  return { mode: 'agent', catalog: 'open-design-official' };
}

export function createProjectSkillDiscoveryBinding(
  boundAt = Date.now(),
): ProjectSkillDiscoveryBinding {
  if (!Number.isFinite(boundAt) || boundAt < 0) {
    throw new InvalidProjectSkillDiscoveryError('skillDiscovery boundAt is invalid');
  }
  return {
    schemaVersion: 1,
    provenance: 'no_explicit_task_type',
    catalog: 'open-design-official',
    boundAt,
  };
}

export function readVerifiedProjectSkillDiscoveryBinding(
  metadata: ProjectMetadata | null | undefined,
): ProjectSkillDiscoveryBinding | null {
  const value = metadata?.skillDiscoveryBinding;
  if (
    !value
    || value.schemaVersion !== 1
    || value.provenance !== 'no_explicit_task_type'
    || value.catalog !== 'open-design-official'
    || typeof value.boundAt !== 'number'
    || !Number.isFinite(value.boundAt)
    || value.boundAt < 0
  ) return null;
  return {
    schemaVersion: 1,
    provenance: 'no_explicit_task_type',
    catalog: 'open-design-official',
    boundAt: value.boundAt,
  };
}

/**
 * Process override for immediate rollback. Discovery is active by default;
 * operators can still disable it explicitly, while unknown values fail closed
 * to off.
 */
export function readAgentNativeSkillDiscoveryMode(
  env: NodeJS.ProcessEnv,
): AgentNativeSkillDiscoveryMode {
  const raw = env.OD_AGENT_NATIVE_SKILL_DISCOVERY;
  if (raw === undefined || raw.trim() === '') return 'active';
  const mode = raw.trim().toLowerCase();
  if (mode === 'off' || mode === 'observe' || mode === 'canary' || mode === 'active') {
    return mode;
  }
  return 'off';
}

export function agentNativeSkillDiscoveryBehaviorEnabled(
  env: NodeJS.ProcessEnv,
): boolean {
  const mode = readAgentNativeSkillDiscoveryMode(env);
  return mode === 'active' || mode === 'canary';
}
