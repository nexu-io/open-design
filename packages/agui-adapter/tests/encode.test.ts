// AG-UI encoder unit test.

import { describe, expect, it } from 'vitest';
import { encodeOdEventForAgui } from '../src/encode.js';

const RUN_ID = 'run-1';
const NOW = 1_700_000_000_000;

describe('encodeOdEventForAgui', () => {
  it('maps message_chunk to agent.message + carries done', () => {
    const out = encodeOdEventForAgui(
      { kind: 'message_chunk', text: 'hello', done: true },
      { runId: RUN_ID, now: NOW },
    );
    expect(out).toEqual({
      kind: 'agent.message',
      runId: RUN_ID,
      ts: NOW,
      text: 'hello',
      done: true,
    });
  });

  it('maps tool_call with status + result', () => {
    const out = encodeOdEventForAgui(
      {
        kind: 'tool_call',
        toolName: 'live-artifacts.create',
        args: { name: 'index.html' },
        callId: 'tc-1',
        status: 'completed',
        result: { ok: true },
      },
      { runId: RUN_ID, now: NOW, seq: 7 },
    );
    expect(out).toEqual({
      kind: 'tool_call',
      runId: RUN_ID,
      ts: NOW,
      seq: 7,
      toolName: 'live-artifacts.create',
      args: { name: 'index.html' },
      callId: 'tc-1',
      status: 'completed',
      result: { ok: true },
    });
  });

  it('maps run lifecycle: run_started → started, end → completed/failed/cancelled', () => {
    expect(encodeOdEventForAgui({ kind: 'run_started' }, { runId: RUN_ID, now: NOW })).toEqual({
      kind: 'run.lifecycle',
      runId: RUN_ID,
      ts: NOW,
      status: 'started',
    });
    expect(encodeOdEventForAgui({ kind: 'end', status: 'succeeded' }, { runId: RUN_ID, now: NOW }))
      .toMatchObject({ status: 'completed' });
    expect(encodeOdEventForAgui({ kind: 'end', status: 'failed' }, { runId: RUN_ID, now: NOW }))
      .toMatchObject({ status: 'failed' });
    expect(encodeOdEventForAgui({ kind: 'end', status: 'canceled' }, { runId: RUN_ID, now: NOW }))
      .toMatchObject({ status: 'cancelled' });
  });

  it('maps pipeline_stage_started/completed onto run.lifecycle stage events', () => {
    const startedEvt = encodeOdEventForAgui(
      {
        kind: 'pipeline_stage_started',
        runId: RUN_ID,
        snapshotId: 'snap-1',
        stageId: 'discovery',
        iteration: 0,
        startedAt: NOW,
      },
      { runId: RUN_ID, now: NOW },
    );
    expect(startedEvt).toMatchObject({
      kind: 'run.lifecycle',
      status: 'pipeline_stage_started',
      stageId: 'discovery',
      iteration: 0,
    });
    const completedEvt = encodeOdEventForAgui(
      {
        kind: 'pipeline_stage_completed',
        runId: RUN_ID,
        snapshotId: 'snap-1',
        stageId: 'discovery',
        iteration: 0,
        completedAt: NOW,
      },
      { runId: RUN_ID, now: NOW },
    );
    expect(completedEvt).toMatchObject({
      kind: 'run.lifecycle',
      status: 'pipeline_stage_completed',
    });
  });

  it('maps genui_surface_request → ui.surface_requested with derived surface kind', () => {
    const out = encodeOdEventForAgui(
      {
        kind: 'genui_surface_request',
        runId: RUN_ID,
        surfaceId: 'audience-clarify',
        payload: { kind: 'form', schema: { type: 'object' } },
        requestedAt: NOW,
      },
      { runId: RUN_ID, now: NOW },
    );
    expect(out).toMatchObject({
      kind: 'ui.surface_requested',
      surfaceId: 'audience-clarify',
      surfaceKind: 'form',
    });
  });

  it('maps genui_surface_response → ui.surface_responded preserving respondedBy', () => {
    const out = encodeOdEventForAgui(
      {
        kind: 'genui_surface_response',
        runId: RUN_ID,
        surfaceId: 'audience-clarify',
        value: { audience: 'VC' },
        respondedAt: NOW,
        respondedBy: 'cache',
      },
      { runId: RUN_ID, now: NOW },
    );
    expect(out).toMatchObject({
      kind: 'ui.surface_responded',
      surfaceId: 'audience-clarify',
      value: { audience: 'VC' },
      respondedBy: 'cache',
    });
  });

  it('maps genui_surface_timeout to a surface_responded with the resolution payload', () => {
    const out = encodeOdEventForAgui(
      {
        kind: 'genui_surface_timeout',
        runId: RUN_ID,
        surfaceId: 'media-spend-approval',
        resolution: 'abort',
      },
      { runId: RUN_ID, now: NOW },
    );
    expect(out).toMatchObject({
      kind: 'ui.surface_responded',
      surfaceId: 'media-spend-approval',
      respondedBy: 'auto',
      value: { resolution: 'abort' },
    });
  });

  it('maps genui_state_synced → state_update', () => {
    const out = encodeOdEventForAgui(
      {
        kind: 'genui_state_synced',
        runId: RUN_ID,
        surfaceId: 'figma-oauth',
        persistTier: 'project',
      },
      { runId: RUN_ID, now: NOW },
    );
    expect(out).toEqual({
      kind: 'state_update',
      runId: RUN_ID,
      ts: NOW,
      path: 'genui.figma-oauth',
      value: { persistTier: 'project' },
    });
  });

  it('drops events the encoder does not understand', () => {
    const out = encodeOdEventForAgui(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { kind: 'mystery' as any },
      { runId: RUN_ID, now: NOW },
    );
    expect(out).toBeNull();
  });
});
