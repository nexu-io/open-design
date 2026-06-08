import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuthenticatedRequest, DaemonUser } from '../src/auth-context.js';
import {
  artifactsDirFor,
  artifactsDirForUser,
  projectsDirFor,
  projectsDirForUser,
  resetPerUserPathCacheForTests,
  runtimeDataDirFor,
  runtimeDataDirForUser,
} from '../src/per-user-paths.js';

function makeUser(dataDir: string, email = 'user@example.com'): DaemonUser {
  return {
    email,
    dirHash: 'abc123def456',
    dataDir,
    source: 'trusted-header',
  };
}

function makeReq(dataDir: string, email = 'user@example.com'): AuthenticatedRequest {
  return { user: makeUser(dataDir, email) } as unknown as AuthenticatedRequest;
}

describe('per-user paths', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-per-user-paths-'));
    resetPerUserPathCacheForTests();
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    resetPerUserPathCacheForTests();
  });

  it('resolves and creates project dirs under the user data dir', () => {
    const dir = projectsDirFor(makeReq(tmpRoot));
    expect(dir).toBe(path.join(tmpRoot, 'projects'));
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('resolves and creates artifact dirs under the user data dir', () => {
    const dir = artifactsDirFor(makeReq(tmpRoot));
    expect(dir).toBe(path.join(tmpRoot, 'artifacts'));
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('resolves and creates the runtime data dir for request-scoped settings', () => {
    const dataDir = path.join(tmpRoot, 'nested', 'user-data');
    const dir = runtimeDataDirFor(makeReq(dataDir));
    expect(dir).toBe(dataDir);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('separates users when auth-context gives each user a distinct dataDir', () => {
    const userA = path.join(tmpRoot, 'users', 'aaaa');
    const userB = path.join(tmpRoot, 'users', 'bbbb');

    expect(projectsDirFor(makeReq(userA, 'a@example.com'))).toBe(path.join(userA, 'projects'));
    expect(projectsDirFor(makeReq(userB, 'b@example.com'))).toBe(path.join(userB, 'projects'));
    expect(projectsDirFor(makeReq(userA, 'a@example.com'))).not.toBe(
      projectsDirFor(makeReq(userB, 'b@example.com')),
    );
  });

  it('preserves single-tenant layout when users share the same dataDir', () => {
    expect(projectsDirFor(makeReq(tmpRoot, 'a@example.com'))).toBe(
      projectsDirFor(makeReq(tmpRoot, 'b@example.com')),
    );
    expect(artifactsDirFor(makeReq(tmpRoot, 'a@example.com'))).toBe(
      artifactsDirFor(makeReq(tmpRoot, 'b@example.com')),
    );
  });

  it('throws a wiring error when request user is missing', () => {
    expect(() => projectsDirFor({} as AuthenticatedRequest)).toThrow(/auth-context/);
    expect(() => artifactsDirFor({} as AuthenticatedRequest)).toThrow(/auth-context/);
  });

  it('exposes user-based variants for async closures without request objects', () => {
    const user = makeUser(tmpRoot);
    expect(projectsDirForUser(user)).toBe(projectsDirFor(makeReq(tmpRoot)));
    expect(artifactsDirForUser(user)).toBe(artifactsDirFor(makeReq(tmpRoot)));
    expect(runtimeDataDirForUser(user)).toBe(runtimeDataDirFor(makeReq(tmpRoot)));
  });

  it('caches mkdir calls for hot paths', () => {
    const req = makeReq(tmpRoot);
    projectsDirFor(req);
    fs.rmSync(path.join(tmpRoot, 'projects'), { recursive: true, force: true });
    projectsDirFor(req);
    expect(fs.existsSync(path.join(tmpRoot, 'projects'))).toBe(false);
  });
});
