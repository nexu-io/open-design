import { describe, it, expect } from 'vitest';
import { taskRunUsage, projectTaskTrace } from '../../src/observability/task-trace-projection.js';
import { buildSafeRunQualityProjectionV1 } from '../../src/langfuse-trace.js';
import { freezeTraceObjectSources, buildTraceObjectManifests } from '../../src/trace-object-manifest.js';
import { taskObjectDeliveryEnabled } from '../../src/services/evidence-delivery.js';
import { redactPromptText } from '../../src/prompt-telemetry.js';

describe('complete Task trace evidence', () => {
  it('uses current Turn counters for stages without reclassifying cumulative cache counters', () => {
    const provider = { input_tokens: 10000, cache_read_input_tokens: 9000, cache_token_source: 'openai' as const, input_accounting_mode: 'inclusive' as const, token_count_source: 'provider_usage' as const, agent_reported_model: 'm' };
    const usage = taskRunUsage('codex', [{ event: 'agent', data: { type: 'usage', evaluationTurnUsage: { input: 20, output: 3, total: 23, modelCalls: 1 } } }], provider);
    expect(usage).toMatchObject({ input_tokens: 20, output_tokens: 3, total_tokens: 23 });
    expect(usage.cache_read_input_tokens).toBeUndefined();
    expect(taskRunUsage('codex', [], provider).input_tokens).toBeUndefined();
    expect(taskRunUsage('claude', [], provider)).toBe(provider);
  });
  it('uses ordinary consented Task delivery by default and preserves explicit kill switches', () => {
    expect(taskObjectDeliveryEnabled(undefined)).toBe(true);
    expect(taskObjectDeliveryEnabled('send')).toBe(true);
    for (const mode of ['off', 'observe', 'invalid']) expect(taskObjectDeliveryEnabled(mode)).toBe(false);
  });
  it('keeps visible Task I/O, every physical Run metadata and additive per-turn counters', () => {
    const result = projectTaskTrace([
      { runId: 'first', input: 'user request', output: 'intermediate reply', metadata: { model: 'm1', tokens: { total: 10 }, eventsSummary: { toolCalls: 2, errors: 0 }, artifact_manifest: ['a'] } },
      { runId: 'second', input: 'internal production input', output: 'visible final reply', metadata: { model: 'm2', tokens: { total: 20 }, eventsSummary: { toolCalls: 3, errors: 1 }, artifact_manifest: ['b'] } },
    ], 100);
    expect(result).toMatchObject({ input: 'user request', output: 'visible final reply', metadata: { tokens: { total: 30 }, eventsSummary: { toolCalls: 5, errors: 1, durationMs: 100 }, artifact_manifest: ['a', 'b'] } });
    expect(result?.metadata.run_metadata).toHaveLength(2);
    expect(projectTaskTrace([{ runId: 'x', metadata: {} }], 0)?.metadata.tokens).toBeUndefined();
  });
  it('aggregates object counts and does not hide an earlier incomplete stage', () => {
    const stage = (runId: string, status: string) => ({ runId, metadata: {
      manifest_completeness: status === 'ok' ? 'complete' : 'unavailable',
      trace_object_summary: { new_file_count: 1, modified_file_count: 0, recovered_file_count: 0, candidate_file_count: 1 },
      artifact_manifest: [{ artifact_id: runId, status, stored_in_open_design: status === 'ok' }],
    } });
    const incomplete = projectTaskTrace([stage('first', 'unavailable'), stage('last', 'ok')], 1)!;
    expect(incomplete.metadata.manifest_completeness).toBe('unavailable');
    expect(incomplete.metadata.trace_object_summary).toMatchObject({ candidate_file_count: 2, new_file_count: 2, uploaded_file_count: 1, skipped_file_count: 1, skip_reasons: { unavailable: 1 } });
    expect(projectTaskTrace([stage('first', 'ok'), stage('last', 'ok')], 1)?.metadata).toMatchObject({ manifest_completeness: 'complete', trace_object_summary: { candidate_file_count: 2, uploaded_file_count: 2, skipped_file_count: 0, skip_reasons: {} } });
  });
  it('retains policy-redacted output and allowed tools beyond inline limits without weakening tool policy', () => {
    const text = '界'.repeat(40000);
    const quality = buildSafeRunQualityProjectionV1({ prefs: { metrics: true, content: true }, contentStorage: 'object', messageOutput: text,
      tools: [{ id: 'a', name: 'Bash', startedAt: 1, endedAt: 2, output: text }, { id: 'b', name: 'Read', startedAt: 1, endedAt: 2, output: 'private file content' }] });
    expect(quality?.result?.output).toMatchObject({ text, truncated: false });
    expect(quality?.tools?.[0]?.output?.text).toBe(text);
    expect(JSON.stringify(quality)).not.toContain('private file content');
    expect(buildSafeRunQualityProjectionV1({ prefs: { metrics: true, content: false }, contentStorage: 'object', messageOutput: text })?.result?.output).toBeUndefined();
  });
  it('freezes the entire >64 KiB redacted Prompt, with immutable Run identity and explicit oversize failure', async () => {
    const text = redactPromptText('界'.repeat(40000) + ' /Users/private/secrets/file');
    const options = { installationId: 'synthetic', projectId: 'p', runId: 'r', projectsRoot: '/unused', prompt: '', runEvidence: text,
      prefs: { metrics: true, content: true }, env: { OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://telemetry.open-design.ai/api/langfuse' } };
    const sources = await freezeTraceObjectSources(options);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.body?.toString()).toBe(text);
    expect(text.includes('/Users/private')).toBe(false);
    const manifests = await buildTraceObjectManifests({ ...options, frozenSources: sources, uploadMode: 'manifest-only' });
    expect(manifests?.inputTextSnapshotManifest?.[0]).toMatchObject({ redacted: true, truncated: false, size_bytes: Buffer.byteLength(text), run_id: 'r' });
    expect((await freezeTraceObjectSources({ ...options, env: { ...options.env, OPEN_DESIGN_OBJECT_MAX_BYTES: '100' } }))[0]).toMatchObject({ reason: 'object_too_large' });
    expect(await freezeTraceObjectSources({ ...options, prefs: { metrics: true, content: false } })).toEqual([]);
  });
});
