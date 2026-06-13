/**
 * Coverage for the rollout-flag resolver (Phase 15). The orchestrator,
 * the settings endpoint, and the conformance harness all read through
 * `isCritiqueEnabled`, so the resolution order has to be airtight.
 */

import { describe, expect, it } from 'vitest';

import {
  isCritiqueEnabled,
  parseEnvEnabled,
  parseRolloutPhase,
} from '../src/critique/rollout.js';

describe('critique rollout flag resolver (Phase 15)', () => {
  it('skill opt-out always wins, even on M3 global rollout', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M3',
        skillPolicy: 'opt-out',
        projectOverride: true,
        envOverride: true,
      }),
    ).toBe(false);
  });

  it('skill required always wins, even on M0 dark-launch', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M0',
        skillPolicy: 'required',
        projectOverride: false,
        envOverride: false,
      }),
    ).toBe(true);
  });

  it('project override beats env and rollout phase defaults', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M0',
        skillPolicy: null,
        projectOverride: true,
        envOverride: false,
      }),
    ).toBe(true);
    expect(
      isCritiqueEnabled({
        phase: 'M3',
        skillPolicy: null,
        projectOverride: false,
        envOverride: true,
      }),
    ).toBe(false);
  });

  it('env override flips an M0 default when no project override is set', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M0',
        skillPolicy: null,
        projectOverride: null,
        envOverride: true,
      }),
    ).toBe(true);
  });

  it('M0 default is off', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M0',
        skillPolicy: null,
        projectOverride: null,
        envOverride: null,
      }),
    ).toBe(false);
  });

  it('M1 default is off (settings toggle has not been touched yet)', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M1',
        skillPolicy: null,
        projectOverride: null,
        envOverride: null,
      }),
    ).toBe(false);
  });

  it('M2 default is on for opt-in skills only', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M2',
        skillPolicy: 'opt-in',
        projectOverride: null,
        envOverride: null,
      }),
    ).toBe(true);
    expect(
      isCritiqueEnabled({
        phase: 'M2',
        skillPolicy: null,
        projectOverride: null,
        envOverride: null,
      }),
    ).toBe(false);
  });

  it('M3 default is on globally', () => {
    expect(
      isCritiqueEnabled({
        phase: 'M3',
        skillPolicy: null,
        projectOverride: null,
        envOverride: null,
      }),
    ).toBe(true);
  });

  it('parseRolloutPhase recognises every documented phase + falls back to M0', () => {
    expect(parseRolloutPhase('M0')).toBe('M0');
    expect(parseRolloutPhase('m1')).toBe('M1');
    expect(parseRolloutPhase('  M2  ')).toBe('M2');
    expect(parseRolloutPhase('M3')).toBe('M3');
    expect(parseRolloutPhase('')).toBe('M0');
    expect(parseRolloutPhase(undefined)).toBe('M0');
    expect(parseRolloutPhase('M99')).toBe('M0');
  });

  it('parseEnvEnabled distinguishes truthy / falsy / missing', () => {
    expect(parseEnvEnabled('1')).toBe(true);
    expect(parseEnvEnabled('true')).toBe(true);
    expect(parseEnvEnabled('YES')).toBe(true);
    expect(parseEnvEnabled('on')).toBe(true);
    expect(parseEnvEnabled('0')).toBe(false);
    expect(parseEnvEnabled('false')).toBe(false);
    expect(parseEnvEnabled('no')).toBe(false);
    expect(parseEnvEnabled('OFF')).toBe(false);
    expect(parseEnvEnabled(undefined)).toBeNull();
    expect(parseEnvEnabled('')).toBeNull();
    expect(parseEnvEnabled('maybe')).toBeNull();
  });
});
