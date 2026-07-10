// BYOK runs stream client-side and never reach the daemon, so without a
// client emit they produce no run_created / run_finished and stay invisible to
// the run funnel. These pin the prop builders that back that client emit.

import { describe, expect, it } from 'vitest';
import {
  byokAgentProviderId,
  byokSessionModeForTracking,
  buildByokRunCreatedProps,
  buildByokRunFinishedProps,
  type ByokRunBaseInput,
} from '../src/analytics/byok-run';

const BASE: ByokRunBaseInput = {
  projectId: 'proj_1',
  conversationId: 'conv_1',
  runId: 'run_1',
  projectKind: 'prototype',
  hasAttachment: false,
  userQueryTokens: 12,
  model: 'claude-opus-4-8',
  apiProtocol: 'anthropic',
  skillId: null,
  sessionMode: 'design',
};

describe('byokAgentProviderId', () => {
  it('maps each BYOK protocol to its tracking provider', () => {
    expect(byokAgentProviderId('anthropic')).toBe('anthropic');
    expect(byokAgentProviderId('openai')).toBe('openai');
    expect(byokAgentProviderId('azure')).toBe('azure_openai');
    expect(byokAgentProviderId('google')).toBe('google_gemini');
    expect(byokAgentProviderId('ollama')).toBe('ollama_cloud');
    expect(byokAgentProviderId('senseaudio')).toBe('senseaudio');
  });

  it('tracks the aggregator separately and folds unknown protocols into other', () => {
    expect(byokAgentProviderId('aihubmix')).toBe('aihubmix');
    expect(byokAgentProviderId(undefined)).toBe('other');
  });
});

describe('buildByokRunCreatedProps', () => {
  it('emits the chat_composer create shape with required fields', () => {
    const props = buildByokRunCreatedProps(BASE);
    expect(props).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_composer',
      project_id: 'proj_1',
      conversation_id: 'conv_1',
      run_id: 'run_1',
      design_system_source: 'not_applicable',
      agent_provider_id: 'anthropic',
      model_id: 'claude-opus-4-8',
      mcp_id: null,
      token_count_source: 'unknown',
      session_mode: 'design',
    });
    // runtime_type is stamped on the event itself (not left to the mutable
    // super-property) so a mid-stream mode switch can't split the run.
    expect(props.runtime_type).toBe('byok');
  });

  it('buckets a missing model into "default"', () => {
    expect(buildByokRunCreatedProps({ ...BASE, model: null }).model_id).toBe('default');
    expect(buildByokRunCreatedProps({ ...BASE, model: '   ' }).model_id).toBe('default');
  });

  it('preserves Plan mode from BYOK run props', () => {
    const props = buildByokRunCreatedProps({
      ...BASE,
      sessionMode: byokSessionModeForTracking('plan'),
    });
    expect(props.session_mode).toBe('plan');
  });
});

describe('buildByokRunFinishedProps', () => {
  it('carries result / artifact_count / asked_user_question / duration', () => {
    const props = buildByokRunFinishedProps({
      ...BASE,
      result: 'success',
      artifactCount: 1,
      askedUserQuestion: false,
      totalDurationMs: 8421,
    });
    expect(props).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_panel',
      run_id: 'run_1',
      result: 'success',
      artifact_count: 1,
      asked_user_question: false,
      total_duration_ms: 8421,
      agent_provider_id: 'anthropic',
      runtime_type: 'byok',
    });
  });

  it('preserves Plan mode on finished BYOK run props', () => {
    const props = buildByokRunFinishedProps({
      ...BASE,
      sessionMode: byokSessionModeForTracking('plan'),
      result: 'success',
      artifactCount: 0,
      askedUserQuestion: false,
      totalDurationMs: 42,
    });
    expect(props.session_mode).toBe('plan');
  });
});
