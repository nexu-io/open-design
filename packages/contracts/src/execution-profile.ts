export type ExecutionProfile = 'filesystem' | 'text_artifact';

export function executionProfileFromStreamFormat(
  streamFormat: string | null | undefined,
): ExecutionProfile {
  return streamFormat === 'plain' ? 'text_artifact' : 'filesystem';
}
