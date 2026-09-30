import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { VelaCredentialRevision } from '../../src/integrations/vela.js';
import {
  buildAmrModelCacheKey,
  buildAmrRememberedLiveModelScope,
  withVelaModelListWorkspaceScope,
} from '../../src/runtimes/amr-model-probe.js';
import {
  getRememberedLiveModels,
  preferFreshLiveModels,
  rememberLiveModels,
} from '../../src/runtimes/models.js';

const CREDENTIAL_REVISION: VelaCredentialRevision = {
  authSource: 'file',
  profile: 'test',
  loggedIn: true,
  userId: 'user-1',
  userEmail: 'user@example.com',
  configMtimeMs: 1,
  credentialFingerprint: '',
};

test('withVelaModelListWorkspaceScope sets VELA_WORKSPACE_ID for Path A discovery', () => {
  const env = withVelaModelListWorkspaceScope(
    { HOME: '/tmp/home', VELA_PROFILE: 'test' },
    '  ws-team-pro  ',
  );
  assert.equal(env.VELA_WORKSPACE_ID, 'ws-team-pro');
  assert.equal(env.HOME, '/tmp/home');
});

test('withVelaModelListWorkspaceScope leaves env unscoped for blank workspace ids', () => {
  const env = withVelaModelListWorkspaceScope(
    { HOME: '/tmp/home' },
    '   ',
  );
  assert.equal('VELA_WORKSPACE_ID' in env, false);
});

test('buildAmrModelCacheKey partitions catalogs by workspace id', () => {
  const base = {
    launchPath: '/bin/vela',
    credentialRevision: CREDENTIAL_REVISION,
  };
  const personal = buildAmrModelCacheKey({
    ...base,
    env: { HOME: '/tmp/home', VELA_PROFILE: 'test' },
  });
  const team = buildAmrModelCacheKey({
    ...base,
    env: {
      HOME: '/tmp/home',
      VELA_PROFILE: 'test',
      VELA_WORKSPACE_ID: 'ws-team-pro',
    },
  });
  const teamAgain = buildAmrModelCacheKey({
    ...base,
    env: {
      HOME: '/tmp/home',
      VELA_PROFILE: 'test',
      VELA_WORKSPACE_ID: 'ws-team-pro',
    },
  });

  assert.notEqual(personal, team);
  assert.equal(team, teamAgain);
  assert.match(team, /ws-team-pro/);
});

test('remembered AMR live models do not fall back across workspaces', () => {
  const scopeA = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-a',
  });
  const scopeB = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-b',
  });

  rememberLiveModels('amr', [
    { id: 'model-from-a', label: 'A default', enabled: true, default: true },
  ], scopeA);
  rememberLiveModels('amr', [
    { id: 'model-from-b', label: 'B default', enabled: true, default: true },
  ], scopeB);

  // Probe failure path: empty fresh catalog must only reuse the same-workspace
  // remembered list, never the sibling workspace under the same profile.
  assert.deepEqual(
    preferFreshLiveModels([], getRememberedLiveModels('amr', scopeA)),
    [{ id: 'model-from-a', label: 'A default', enabled: true, default: true }],
  );
  assert.deepEqual(
    preferFreshLiveModels([], getRememberedLiveModels('amr', scopeB)),
    [{ id: 'model-from-b', label: 'B default', enabled: true, default: true }],
  );
  assert.deepEqual(
    getRememberedLiveModels(
      'amr',
      buildAmrRememberedLiveModelScope({
        profile: 'prod',
        workspaceId: 'ws-c',
      }),
    ),
    [],
  );
});
