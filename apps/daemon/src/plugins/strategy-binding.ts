import type {
  ProjectMetadata,
  ProjectScenarioTaskProfile,
  ProjectStrategyBinding,
} from '@open-design/contracts';
import { automaticStrategyTaskProfileForProjectMetadata } from '@open-design/contracts';

const TASK_PROFILES = new Set<ProjectScenarioTaskProfile>([
  'prototype',
  'ppt',
  'marketing',
  'hyperframes',
]);

export function createAutomaticProjectStrategyBinding(input: {
  metadata: ProjectMetadata | null | undefined;
  taskProfile: ProjectScenarioTaskProfile;
  boundAt?: number;
}): ProjectStrategyBinding | null {
  if (
    automaticStrategyTaskProfileForProjectMetadata(input.metadata)
    !== input.taskProfile
  ) return null;
  return {
    schemaVersion: 1,
    provenance: 'automatic_default',
    taskProfile: input.taskProfile,
    boundAt: input.boundAt ?? Date.now(),
  };
}

export function readVerifiedProjectStrategyBinding(
  metadata: ProjectMetadata | null | undefined,
): ProjectStrategyBinding | null {
  const binding = metadata?.strategyBinding;
  if (!binding || typeof binding !== 'object') return null;
  if (
    binding.schemaVersion !== 1
    || binding.provenance !== 'automatic_default'
    || !TASK_PROFILES.has(binding.taskProfile)
    || typeof binding.boundAt !== 'number'
    || !Number.isFinite(binding.boundAt)
  ) return null;
  return automaticStrategyTaskProfileForProjectMetadata(metadata) === binding.taskProfile
    ? binding
    : null;
}
