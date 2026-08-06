import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { VelaCredentialRevision } from '../../src/integrations/vela.js';
import {
  amrCredentialIdentityFromRevision,
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

test('buildAmrRememberedLiveModelScope partitions by workspace and credential', () => {
  const personal = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: null,
    credentialIdentity: 'user:alice',
  });
  const teamA = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-team-a',
    credentialIdentity: 'user:alice',
  });
  const teamB = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-team-b',
    credentialIdentity: 'user:alice',
  });
  const teamAOtherUser = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-team-a',
    credentialIdentity: 'user:bob',
  });

  assert.notEqual(personal, teamA);
  assert.notEqual(teamA, teamB);
  assert.notEqual(teamA, teamAOtherUser);
  assert.match(teamA, /ws=ws-team-a/);
  assert.match(teamA, /cred=user:alice/);
  assert.equal(
    buildAmrRememberedLiveModelScope({
      profile: 'prod',
      workspaceId: '  ws-team-a  ',
      credentialIdentity: ' user:alice ',
    }),
    teamA,
  );
});

test('amrCredentialIdentityFromRevision prefers userId then env fingerprint', () => {
  assert.equal(
    amrCredentialIdentityFromRevision({
      authSource: 'file',
      userId: 'user-1',
      credentialFingerprint: 'fp-ignored',
      configMtimeMs: 1,
    }),
    'user:user-1',
  );
  assert.equal(
    amrCredentialIdentityFromRevision({
      authSource: 'env',
      userId: '',
      credentialFingerprint: 'abc123',
      configMtimeMs: 1,
    }),
    'env:abc123',
  );
  assert.equal(
    amrCredentialIdentityFromRevision({
      authSource: 'none',
      userId: '',
      credentialFingerprint: '',
      configMtimeMs: null,
    }),
    '',
  );
});

test('amrCredentialIdentityFromRevision partitions file auth by config mtime when user is absent', () => {
  // Supported file config makes `user` optional. Without mtime in the
  // identity, every such account collapses to `auth:file` and a later
  // rewrite under the same profile/workspace can reuse the prior catalog.
  const beforeRewrite = amrCredentialIdentityFromRevision({
    authSource: 'file',
    userId: '',
    credentialFingerprint: '',
    configMtimeMs: 100,
  });
  const afterRewrite = amrCredentialIdentityFromRevision({
    authSource: 'file',
    userId: '',
    credentialFingerprint: '',
    configMtimeMs: 200,
  });
  const missingMtime = amrCredentialIdentityFromRevision({
    authSource: 'file',
    userId: '',
    credentialFingerprint: '',
    configMtimeMs: null,
  });

  assert.equal(beforeRewrite, 'auth:file:mtime=100');
  assert.equal(afterRewrite, 'auth:file:mtime=200');
  assert.notEqual(beforeRewrite, afterRewrite);
  assert.equal(missingMtime, 'auth:file');

  const scopeBefore = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-team',
    credentialIdentity: beforeRewrite,
  });
  const scopeAfter = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-team',
    credentialIdentity: afterRewrite,
  });
  assert.notEqual(scopeBefore, scopeAfter);
});

test('remembered AMR live models do not fall back across workspaces', () => {
  const scopeA = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-a',
    credentialIdentity: 'user:alice',
  });
  const scopeB = buildAmrRememberedLiveModelScope({
    profile: 'prod',
    workspaceId: 'ws-b',
    credentialIdentity: 'user:alice',
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
        credentialIdentity: 'user:alice',
      }),
    ),
    [],
  );
});
