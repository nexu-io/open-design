import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  installPackagedIsolatedAmrState,
  installPackagedSyntheticIdentity,
  seedPackagedOnboardingComplete,
} from '@/vitest/packaged-initial-state';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('packaged synthetic initial state', () => {
  it('declares its proof boundary and persists the validated projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-packaged-state-'));
    roots.push(root);
    const evidence = await seedPackagedOnboardingComplete(root);
    expect(evidence).toMatchObject({
      boundary: 'landing',
      doesNotProve: ['real account authentication'],
      state: 'synthetic-completed-local-state',
    });
    expect(JSON.parse(await readFile(evidence.path, 'utf8'))).toEqual({
      agentId: 'codex',
      mode: 'daemon',
      onboardingCompleted: true,
    });
  });

  it('isolates local execution from a host AMR login without inventing auth', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-packaged-amr-isolated-'));
    roots.push(root);
    const previousHome = process.env.AMR_HOME;
    const state = await installPackagedIsolatedAmrState(root);
    try {
      expect(process.env.AMR_HOME).toBe(root);
      expect(process.env.OPEN_DESIGN_AMR_PROFILE).toBe('test');
      expect(await readFile(join(root, 'config.json'), 'utf8').catch(() => null)).toBeNull();
      expect(state).toMatchObject({
        boundary: 'auth',
        doesNotProve: ['real AMR authentication'],
        state: 'isolated-amr-signed-out',
      });
    } finally {
      state.restore();
    }
    expect(process.env.AMR_HOME).toBe(previousHome);
  });

  it('scopes a fake signed-in projection transactionally and declares what it cannot prove', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-packaged-identity-'));
    roots.push(root);
    const previousHome = process.env.AMR_HOME;
    const previousAmrProfile = process.env.OPEN_DESIGN_AMR_PROFILE;
    const previousProfile = process.env.VELA_PROFILE;
    const identity = await installPackagedSyntheticIdentity(root);
    try {
      expect(process.env.AMR_HOME).toBe(root);
      expect(process.env.OPEN_DESIGN_AMR_PROFILE).toBe('test');
      expect(process.env.VELA_PROFILE).toBe('test');
      if (process.platform !== 'win32') {
        expect((await stat(join(root, 'config.json'))).mode & 0o777).toBe(0o600);
      }
      expect(identity).toMatchObject({
        boundary: 'auth',
        doesNotProve: ['real AMR authentication'],
        state: 'synthetic-amr-session',
      });
    } finally {
      identity.restore();
    }
    expect(process.env.AMR_HOME).toBe(previousHome);
    expect(process.env.OPEN_DESIGN_AMR_PROFILE).toBe(previousAmrProfile);
    expect(process.env.VELA_PROFILE).toBe(previousProfile);
  });
});
