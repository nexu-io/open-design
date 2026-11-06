import { describe, expect, it } from 'vitest';

import { formatMediaTaskDiagnostic } from '../../src/media/diagnostics.js';

describe('formatMediaTaskDiagnostic', () => {
  it('keeps correlation and routing context while redacting secrets', () => {
    const line = formatMediaTaskDiagnostic({
      event: 'failed',
      taskId: 'media-task-123',
      runId: 'run-456',
      projectId: 'project-789',
      surface: 'image',
      model: 'vela/gpt-image-2',
      providerId: 'vela',
      status: 503,
      code: 'provider_error',
      elapsedMs: 1_234.4,
      referenceImageCount: 2,
      hasCompositionDir: false,
      error: 'upstream rejected Authorization: Bearer abcdefghijklmnop',
    });

    expect(line).toContain('"task_id":"media-task-123"');
    expect(line).toContain('"run_id":"run-456"');
    expect(line).toContain('"model_id":"vela/gpt-image-2"');
    expect(line).toContain('"provider_id":"vela"');
    expect(line).toContain('"code":"provider_error"');
    expect(line).toContain('"elapsed_ms":1234');
    expect(line).toContain('"reference_image_count":2');
    expect(line).toContain('"has_composition_dir":false');
    expect(line).toContain('[REDACTED:');
    expect(line).not.toContain('abcdefghijklmnop');
  });
});
