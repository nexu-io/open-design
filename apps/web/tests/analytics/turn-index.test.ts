// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimProjectTurnIndex,
  claimRunTurnIndex,
} from '../../src/analytics/identity';

// `claimRunTurnIndex` is the session-wide run counter (sessionStorage, spans
// all projects, resets each browser session). `claimProjectTurnIndex` is the
// per-project counter (localStorage, project-lifetime per device). These tests
// pin the semantic difference between the two.
describe('run turn index: session-wide vs per-project', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('per-project index starts at 0 and increments within a project', () => {
    expect(claimProjectTurnIndex('proj-a')).toEqual({ projectTurnIndex: 0 });
    expect(claimProjectTurnIndex('proj-a')).toEqual({ projectTurnIndex: 1 });
    expect(claimProjectTurnIndex('proj-a')).toEqual({ projectTurnIndex: 2 });
  });

  it('keeps an independent counter per project id', () => {
    claimProjectTurnIndex('proj-a'); // 0
    claimProjectTurnIndex('proj-a'); // 1
    expect(claimProjectTurnIndex('proj-b')).toEqual({ projectTurnIndex: 0 });
    expect(claimProjectTurnIndex('proj-a')).toEqual({ projectTurnIndex: 2 });
  });

  it('persists across browser sessions (survives a sessionStorage reset)', () => {
    claimProjectTurnIndex('proj-a'); // 0
    claimProjectTurnIndex('proj-a'); // 1
    // A new browser session clears sessionStorage but NOT localStorage.
    window.sessionStorage.clear();
    expect(claimProjectTurnIndex('proj-a')).toEqual({ projectTurnIndex: 2 });
  });

  it('returns null for an empty project id', () => {
    expect(claimProjectTurnIndex('')).toBeNull();
  });

  it('session counter resets on new session while project counters persist', () => {
    expect(claimRunTurnIndex()).toEqual({ turnIndex: 0, isFirstRun: true });
    claimRunTurnIndex(); // turnIndex 1
    claimProjectTurnIndex('proj-a'); // 0
    claimProjectTurnIndex('proj-b'); // 0

    window.sessionStorage.clear(); // simulate a new browser session

    // Session-wide counter starts over…
    expect(claimRunTurnIndex()).toEqual({ turnIndex: 0, isFirstRun: true });
    // …but each project keeps its own place.
    expect(claimProjectTurnIndex('proj-a')).toEqual({ projectTurnIndex: 1 });
    expect(claimProjectTurnIndex('proj-b')).toEqual({ projectTurnIndex: 1 });
  });
});
