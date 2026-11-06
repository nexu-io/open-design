import { describe, expect, it } from 'vitest';
import type {
  AnalyticsEventPayload,
  MediaGenerationResultProps,
} from '../src/analytics/events.js';

describe('analytics media_generation_result contract', () => {
  it('accepts a successful generation without a retry', () => {
    const props = {
      page_name: 'studio',
      area: 'media_generation',
      project_id: 'project-1',
      task_id: 'task-1',
      run_id: 'run-1',
      surface: 'image',
      provider_id: 'custom-image',
      model_id: 'custom-image',
      result: 'success',
      initial_response_status: 200,
      response_status: 200,
      attempt_count: 1,
      retry_count: 0,
      retry_final_result: 'not_attempted',
      duration_ms: 120,
      used_stub_fallback: false,
    } satisfies MediaGenerationResultProps;
    const payload = {
      event: 'media_generation_result',
      props,
    } satisfies Extract<AnalyticsEventPayload, { event: 'media_generation_result' }>;

    expect(payload.props.result).toBe('success');
    expect(payload.props.retry_count).toBe(0);
  });

  it('accepts retry and bounded-wait outcome fields', () => {
    const payload = {
      event: 'media_generation_result',
      props: {
        page_name: 'studio',
        area: 'media_generation',
        project_id: 'project-1',
        task_id: 'task-2',
        surface: 'image',
        provider_id: 'nanobanana',
        model_id: 'gemini-3.1-flash-image-preview',
        result: 'failed',
        initial_response_status: 429,
        response_status: 429,
        attempt_count: 1,
        retry_count: 0,
        retry_reason: 'rate_limit_429',
        retry_after_ms: 61_000,
        retry_final_result: 'skipped_retry_after_budget',
        duration_ms: 25,
        used_stub_fallback: false,
      },
    } satisfies Extract<AnalyticsEventPayload, { event: 'media_generation_result' }>;

    expect(payload.props.retry_final_result).toBe('skipped_retry_after_budget');
  });
});
