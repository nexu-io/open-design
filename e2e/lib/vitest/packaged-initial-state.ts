import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type PackagedSyntheticStateEvidence = Readonly<{
  boundary: 'landing';
  doesNotProve: readonly ['real account authentication'];
  path: string;
  proves: readonly ['daemon receives a completed local-execution projection'];
  state: 'synthetic-completed-local-state';
}>;

export type PackagedSyntheticIdentity = Readonly<{
  boundary: 'auth';
  doesNotProve: readonly ['real AMR authentication'];
  home: string;
  profile: 'test';
  proves: readonly ['signed-in product paths can run without an external account'];
  restore(): void;
  state: 'synthetic-amr-session';
}>;

export type PackagedIsolatedAmrState = Readonly<{
  boundary: 'auth';
  doesNotProve: readonly ['real AMR authentication'];
  home: string;
  profile: 'test';
  proves: readonly ['local execution paths are independent from the host AMR session'];
  restore(): void;
  state: 'isolated-amr-signed-out';
}>;

/** Hide the host AMR session without manufacturing an authenticated account. */
export async function installPackagedIsolatedAmrState(
  home: string,
): Promise<PackagedIsolatedAmrState> {
  await mkdir(home, { recursive: true });
  const restore = installAmrEnvironment(home, 'test');
  return Object.freeze({
    boundary: 'auth',
    doesNotProve: ['real AMR authentication'] as const,
    home,
    profile: 'test' as const,
    proves: ['local execution paths are independent from the host AMR session'] as const,
    restore,
    state: 'isolated-amr-signed-out',
  });
}

/** Prepare a deterministic post-onboarding local-agent projection, not auth. */
export async function seedPackagedOnboardingComplete(
  dataRoot: string,
): Promise<PackagedSyntheticStateEvidence> {
  const path = join(dataRoot, 'app-config.json');
  const payload = {
    agentId: 'codex',
    mode: 'daemon',
    onboardingCompleted: true,
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const persisted = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  if (
    persisted.agentId !== payload.agentId
    || persisted.mode !== payload.mode
    || persisted.onboardingCompleted !== true
    || Object.keys(persisted).length !== Object.keys(payload).length
  ) {
    throw new Error('synthetic completed local state did not round-trip through its persisted projection');
  }
  return Object.freeze({
    boundary: 'landing',
    doesNotProve: ['real account authentication'] as const,
    path,
    proves: ['daemon receives a completed local-execution projection'] as const,
    state: 'synthetic-completed-local-state',
  });
}

/**
 * Install an isolated fake AMR profile and expose it transactionally to child
 * processes. The keys are shape-valid placeholders and must never be used to
 * prove remote authentication or connectivity.
 */
export async function installPackagedSyntheticIdentity(
  home: string,
): Promise<PackagedSyntheticIdentity> {
  const path = join(home, 'config.json');
  const profile = 'test' as const;
  const payload = {
    profiles: {
      [profile]: {
        apiUrl: 'http://127.0.0.1:9',
        controlKey: 'synthetic-control-key-not-for-network-use',
        linkUrl: 'http://127.0.0.1:9',
        runtimeKey: 'synthetic-runtime-key-not-for-network-use',
        user: {
          email: 'packaged-e2e@example.invalid',
          id: 'packaged-e2e-user',
          name: 'Packaged E2E',
          plan: 'free',
        },
      },
    },
  };
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  // The real AMR binary refuses credential files broader than owner-only.
  // Preserve that production invariant even though these credentials are fake.
  await chmod(path, 0o600);
  const persisted = JSON.parse(await readFile(path, 'utf8')) as typeof payload;
  if (persisted.profiles.test?.user.id !== payload.profiles.test.user.id) {
    throw new Error('synthetic AMR identity did not round-trip through its persisted projection');
  }
  const restore = installAmrEnvironment(home, profile);
  return Object.freeze({
    boundary: 'auth',
    doesNotProve: ['real AMR authentication'] as const,
    home,
    profile,
    proves: ['signed-in product paths can run without an external account'] as const,
    restore,
    state: 'synthetic-amr-session',
  });
}

function installAmrEnvironment(home: string, profile: 'test'): () => void {
  const previousHome = process.env.AMR_HOME;
  const previousAmrProfile = process.env.OPEN_DESIGN_AMR_PROFILE;
  const previousProfile = process.env.VELA_PROFILE;
  process.env.AMR_HOME = home;
  // This is the packaged Shell/daemon authority. VELA_PROFILE remains only
  // the CLI compatibility projection and cannot override a baked selection.
  process.env.OPEN_DESIGN_AMR_PROFILE = profile;
  process.env.VELA_PROFILE = profile;
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (previousHome == null) delete process.env.AMR_HOME;
    else process.env.AMR_HOME = previousHome;
    if (previousAmrProfile == null) delete process.env.OPEN_DESIGN_AMR_PROFILE;
    else process.env.OPEN_DESIGN_AMR_PROFILE = previousAmrProfile;
    if (previousProfile == null) delete process.env.VELA_PROFILE;
    else process.env.VELA_PROFILE = previousProfile;
  };
}
