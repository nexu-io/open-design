import { describe, expect, it } from 'vitest';
import { discoveryObservation, discoveryObservationForRun, observeDiscoveryEvent, preserveDiscoveryObservation } from '../../../src/strategies/od-next/discovery-observation.js';
import { singleSkillShellRead } from '../../../src/strategies/od-next/skill-shell-read.js';
const skillRoot = '/bundle/scenarios/od-next-strategy/assets/task-profiles';
const policy = { event: 'diagnostic', data: { type: 'skill_discovery_policy', injected: true, skillRoot } };
const read = (id: string, skill: string, extra = {}) => ({ event: 'agent', data: { type: 'tool_use', name: 'Read', id, input: { file_path: `${skillRoot}/${skill}.md`, ...extra } } });
const result = (id: string, content = 'Complete Skill body', isError = false) => ({ event: 'agent', data: { type: 'tool_result', toolUseId: id, content, isError } });

describe('Discovery observation is evidence, not selection or completion', () => {
  it('handles literal spaces and quoting but rejects shell substitutions and compound commands', () => {
    expect(singleSkillShellRead('cat -- "/bundle with spaces/document.md"')).toBe('/bundle with spaces/document.md');
    expect(singleSkillShellRead("/bin/zsh -lc 'cat -- \"/bundle with spaces/document.md\"'")).toBe('/bundle with spaces/document.md');
    for (const command of ['cat "$ROOT/document.md"', 'cat $(pwd)/document.md', 'cat /tmp/*.md',
      '/tmp/cat /bundle/document.md', 'cat /bundle/document.md > /tmp/result',
      "cat '/bundle/document.md", 'cat /bundle/document.md && true', 'cat /bundle/document.md\ntrue']) {
      expect(singleSkillShellRead(command)).toBeUndefined();
    }
  });
  it('observes a successful single-file cat from Codex without inferring arbitrary shell reads', () => {
    const shell = (id: string, command: string) => ({ event: 'agent', data: { type: 'tool_use', name: 'Bash', id, input: { command } } });
    const command = `/bin/zsh -lc 'cat "${skillRoot}/document.md"'`;
    expect(discoveryObservation([policy, shell('a', command), result('a')])).toMatchObject({
      skill_ids_loaded: ['document'], skill_load_events: [expect.objectContaining({ source: 'shell_read', status: 'loaded' })],
    });
    for (const command of [
      `echo 'cat ${skillRoot}/document.md'`,
      `cat ${skillRoot}/document.md; echo done`,
      `cat ${skillRoot}/document.md | head`,
      `sed -n '1,20p' ${skillRoot}/document.md`,
      `cat /user${skillRoot}/document.md`,
      `cat ${skillRoot}/document.md ${skillRoot}/ppt.md`,
    ]) expect(discoveryObservation([policy, shell('b', command), result('b')]).skill_ids_loaded).toEqual([]);
    expect(discoveryObservation([policy, shell('c', command), result('c', 'not found', true)]).skill_ids_loaded).toEqual([]);
  });
  it('recognizes native Windows paths only under the trusted skill root', () => {
    const windowsRoot = 'C:\\bundle\\scenarios\\od-next-strategy\\assets\\task-profiles';
    const windowsPolicy = { ...policy, data: { ...policy.data, skillRoot: windowsRoot } };
    const windowsRead = read('a', 'document', { file_path: `${windowsRoot}\\document.md` });
    expect(discoveryObservation([windowsPolicy, windowsRead, result('a')]).skill_ids_loaded).toEqual(['document']);
    const fake = read('b', 'ppt', { file_path: `D:\\user\\scenarios\\od-next-strategy\\assets\\task-profiles\\ppt.md` });
    expect(discoveryObservation([windowsPolicy, fake, result('b')]).skill_ids_loaded).toEqual([]);
  });
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
  it('preserves real evidence when task export normalizes a Run after its event ring is trimmed', () => {
    const run = { events: [] };
    [policy, read('a', 'ppt'), result('a'), read('b', 'document'), result('b')].forEach(e => observeDiscoveryEvent(run, e));
    const normalized = preserveDiscoveryObservation(run, { ...run, events: [] });
    expect(discoveryObservationForRun(normalized)).toMatchObject({
      skill_discovery_enabled: true, skill_ids_loaded: ['document', 'ppt'], skill_observation_status: 'complete',
    });
    expect(JSON.stringify(normalized)).not.toContain('Complete Skill body');
  });
  it('does not infer a reuse or new load merely from native continuation', () => {
    expect(discoveryObservation([{ ...policy, data: { ...policy.data, injected: false } }])).toMatchObject({ skill_discovery_enabled: true, skill_discovery_policy_injected: false, skill_ids_loaded: [] });
  });
});
