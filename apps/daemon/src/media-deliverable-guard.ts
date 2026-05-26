export const MEDIA_PROJECT_DELIVERABLE_KINDS = new Set(['image', 'video', 'audio']);

export function classifyMediaProjectRunCloseStatus(params: {
  status: 'canceled' | 'succeeded' | 'failed';
  projectKind: string | undefined | null;
  hasDeliverableFile: boolean;
}): 'canceled' | 'succeeded' | 'failed' {
  if (params.status !== 'succeeded') return params.status;
  const kind = typeof params.projectKind === 'string' ? params.projectKind : '';
  if (!MEDIA_PROJECT_DELIVERABLE_KINDS.has(kind)) return params.status;
  return params.hasDeliverableFile ? 'succeeded' : 'failed';
}

export function mediaDeliverableMissingMessage(projectKind: string): string {
  return (
    `Agent reported success but no ${projectKind} output file was written to the project. ` +
    'Complete media generation (including `od media wait`) or retry the run.'
  );
}
