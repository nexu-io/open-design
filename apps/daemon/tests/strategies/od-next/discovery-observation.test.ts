import { describe, expect, it } from 'vitest';
import { discoveryObservation, discoveryObservationForRun, observeDiscoveryEvent } from '../../../src/strategies/od-next/discovery-observation.js';
const skillRoot = '/bundle/scenarios/od-next-strategy/assets/task-profiles';
const policy = { event: 'diagnostic', data: { type: 'skill_discovery_policy', injected: true, skillRoot } };
const read = (id: string, skill: string, extra = {}) => ({ event: 'agent', data: { type: 'tool_use', name: 'Read', id, input: { file_path: `${skillRoot}/${skill}.md`, ...extra } } });
const result = (id: string, content = 'Complete Skill body', isError = false) => ({ event: 'agent', data: { type: 'tool_result', toolUseId: id, content, isError } });

describe('Discovery observation is evidence, not selection or completion', () => {
  it('counts successful known reads once and separates injection from loading', () => {
    expect(discoveryObservation([policy])).toMatchObject({ skill_discovery_policy_injected: true, skill_ids_loaded: [] });
    const data = discoveryObservation([policy, read('a', 'ppt'), result('a'), read('b', 'document'), result('b'), read('c', 'ppt'), result('c')]);
    expect(data.skill_ids_loaded).toEqual(['document', 'ppt']);
    expect(data).not.toHaveProperty('deliverable_skill_mapping');
    expect(JSON.stringify(data)).not.toContain('Complete Skill body');
  });
  it('does not count failed, partial, missing or untrusted reads as loaded', () => {
    const fake = read('fake', 'ppt'); fake.data.input.file_path = `/user${fake.data.input.file_path}`;
    const data = discoveryObservation([policy, read('a', 'audio'), result('a', 'failed', true), read('b', 'ppt', { limit: 10 }), result('b'), read('c', 'video'), fake, result('fake')]);
    expect(data.skill_ids_loaded).toEqual([]);
    expect(data.skill_observation_status).toBe('partial');
    expect(data.skill_load_events).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'failed' }), expect.objectContaining({ status: 'unknown' })]));
  });
  it('records a successful native read even when its telemetry copy is truncated', () => {
    const data = discoveryObservation([policy, read('a', 'prototype'), result('a', 'body …[truncated]')]);
    expect(data.skill_ids_loaded).toEqual(['prototype']);
    expect(data.skill_load_events).toEqual([expect.objectContaining({ status: 'loaded', content_coverage: 'unknown' })]);
  });
  it('retains bounded observations after event-ring truncation without storing a body', () => {
    const run = { events: [] }; [policy, read('a', 'prototype'), result('a')].forEach(e => observeDiscoveryEvent(run, e));
    expect(discoveryObservationForRun(run)).toMatchObject({ skill_ids_loaded: ['prototype'], skill_discovery_policy_injected: true });
  });
  it('does not infer a reuse or new load merely from native continuation', () => {
    expect(discoveryObservation([{ ...policy, data: { ...policy.data, injected: false } }])).toMatchObject({ skill_discovery_enabled: true, skill_discovery_policy_injected: false, skill_ids_loaded: [] });
  });
});
