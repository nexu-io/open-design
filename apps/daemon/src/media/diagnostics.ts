import { redactSecrets } from '../redact.js';

const MAX_MEDIA_ERROR_LOG_LENGTH = 2_000;

export interface MediaTaskDiagnosticInput {
  code?: string | undefined;
  elapsedMs?: number | undefined;
  error?: string | undefined;
  event: 'queued' | 'done' | 'failed';
  fileSize?: number | undefined;
  hasCompositionDir?: boolean | undefined;
  mime?: string | undefined;
  model: string;
  projectId: string;
  providerId?: string | undefined;
  runId?: string | undefined;
  referenceImageCount?: number | undefined;
  status?: number | string | undefined;
  surface: string;
  taskId: string;
}

export function formatMediaTaskDiagnostic(
  input: MediaTaskDiagnosticInput,
): string {
  const diagnostic = {
    event: input.event,
    task_id: input.taskId,
    run_id: input.runId ?? null,
    project_id: input.projectId,
    surface: input.surface,
    model_id: input.model,
    provider_id: input.providerId ?? null,
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.code ? { code: input.code } : {}),
    ...(input.elapsedMs !== undefined
      ? { elapsed_ms: Math.max(0, Math.round(input.elapsedMs)) }
      : {}),
    ...(input.referenceImageCount !== undefined
      ? { reference_image_count: Math.max(0, Math.round(input.referenceImageCount)) }
      : {}),
    ...(input.hasCompositionDir !== undefined
      ? { has_composition_dir: input.hasCompositionDir }
      : {}),
    ...(input.fileSize !== undefined
      ? { file_size: Math.max(0, Math.round(input.fileSize)) }
      : {}),
    ...(input.mime ? { mime: input.mime } : {}),
    ...(input.error
      ? {
          error: redactSecrets(input.error)
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_MEDIA_ERROR_LOG_LENGTH),
        }
      : {}),
  };
  return `[media] ${JSON.stringify(diagnostic)}`;
}
