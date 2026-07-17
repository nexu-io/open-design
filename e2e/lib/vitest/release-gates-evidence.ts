import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/**
 * Machine-readable release-gate evidence for the packaged desktop smoke.
 *
 * This module is intentionally platform-agnostic and side-effect free except
 * for hashing files. It is exercised directly by focused unit tests so the
 * evidence structure stays correct without a real Windows/macOS runner.
 *
 * Integrity rules (enforced here, never mocked):
 *  - G7 (dataRoot/backups content preserved across upgrade) requires a REAL
 *    before/after content fingerprint measurement. `dataRootPreserved: null`
 *    is NOT a PASS — it is BLOCKED until measured.
 *  - G8/G9 failure paths are BLOCKED unless the scenario was actually exercised
 *    with a real failure (bad payload / checksum mismatch / metadata
 *    unreachable). They can never be asserted PASS without execution.
 */

export type ReleaseGateStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'N/A';

export type ReleaseGateEvidence = {
  id: string;
  title: string;
  status: ReleaseGateStatus;
  reason?: string;
  evidence?: Record<string, unknown>;
};

export type ReleaseArtifactHash = {
  name: string;
  path: string;
  sha256: string;
  bytes: number;
};

export type ReleaseGatesEvidence = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  platform: 'mac' | 'win';
  channel: string | null;
  releaseVersion: string | null;
  commit: string | null;
  githubRunId: string | null;
  githubRunAttempt: string | null;
  namespace: string;
  profile: string | null;
  reportPath: string;
  artifacts: ReleaseArtifactHash[];
  gates: Record<string, ReleaseGateEvidence>;
};

export const RELEASE_GATE_DEFINITIONS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'G6', title: 'cold-start install success' },
  { id: 'G7', title: 'dataRoot + backups/creator content-identical across upgrade (measured)' },
  { id: 'G8', title: 'payload/checksum failure -> process-level rollback to prior version, data intact' },
  { id: 'G9', title: 'metadata unreachable -> installed app still offline-starts, data untouched' },
  { id: 'G10', title: 'smoke report records artifact SHA-256 / version / commit / platform / profile' },
];

export const RELEASE_GATES_EVIDENCE_FILE = 'release-gates-evidence.json';
export const RELEASE_GATES_PARTIAL_FILE = 'release-gates-partial.json';

/** Subdirs of the isolated temp dataRoot that must stay content-identical across an upgrade. */
export const DATA_ROOT_CONTENT_SUBDIRS = [
  'creator-workbench',
  'creator-media',
  'creator-content',
  'creator-release',
  'creator-performance',
] as const;

/** Creator backup root, a sibling of `data` under the namespace root (per CW-09 path model). */
export const BACKUPS_CREATOR_RELATIVE = 'backups/creator';

/** Resolve the 6 paths that G7 fingerprints before/after an upgrade. */
export function resolveDataRootFingerprintPaths(dataRoot: string, namespaceRoot: string): string[] {
  const contentPaths = DATA_ROOT_CONTENT_SUBDIRS.map((name) => join(dataRoot, name));
  const backupsCreator = join(namespaceRoot, BACKUPS_CREATOR_RELATIVE);
  return [...contentPaths, backupsCreator];
}

export type ContentFingerprint = {
  algorithm: 'sha256-content-tree-v1';
  /** Stable across traversal order, absolute path, and mtime. Depends only on
   *  (relative path, size, file content sha256) of every file under each root. */
  fingerprint: string;
  rootCount: number;
  dirCount: number;
  fileCount: number;
  /** Roots that did not exist at measurement time. */
  missing: string[];
};

/**
 * Compute a stable, order-independent, path-independent, mtime-independent
 * content fingerprint over each provided root. Only CI temp namespaces should
 * be passed. Nonexistent roots are recorded in `missing` rather than throwing.
 */
export async function computeContentFingerprint(roots: string[]): Promise<ContentFingerprint> {
  const combined = createHash('sha256');
  let rootCount = 0;
  let dirCount = 0;
  let fileCount = 0;
  const missing: string[] = [];

  for (const [index, root] of roots.entries()) {
    if (!existsSync(root)) {
      missing.push(root);
      continue;
    }
    const entries: Array<{ rel: string; size: number; contentSha: string }> = [];
    await walkContent(root, root, entries);
    // Order-independent within a tree: sort by relative path.
    entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    const rootHash = createHash('sha256');
    for (const entry of entries) {
      rootHash.update(entry.rel);
      rootHash.update('\0');
      rootHash.update(String(entry.size));
      rootHash.update('\0');
      rootHash.update(entry.contentSha);
      rootHash.update('\0');
      if (entry.rel.endsWith('/')) dirCount += 1;
      else fileCount += 1;
    }
    rootCount += 1;
    // Root-stable: include the index so two roots with colliding relative paths
    // cannot merge. The index is constant across before/after measurements.
    combined.update(String(index));
    combined.update('\0');
    combined.update(rootHash.digest('hex'));
    combined.update('\0');
  }

  return {
    algorithm: 'sha256-content-tree-v1',
    fingerprint: combined.digest('hex'),
    rootCount,
    dirCount,
    fileCount,
    missing,
  };
}

async function walkContent(root: string, base: string, out: Array<{ rel: string; size: number; contentSha: string }>): Promise<void> {
  const info = await stat(root);
  if (info.isDirectory()) {
    const names = await readdir(root);
    for (const name of names) {
      await walkContent(join(root, name), base, out);
    }
  } else if (info.isFile()) {
    // Relative path inside the root -> path-independent across machines.
    const rel = relative(base, root).split(sepSafe()).join('/');
    out.push({ rel, size: info.size, contentSha: await computeFileSha256(root) });
  }
}

function sepSafe(): RegExp | string {
  return process.platform === 'win32' ? /[\\/]/ : '/';
}

/** Stream a file's SHA-256 so large installers/payloads never load fully into memory. */
export function computeFileSha256(path: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveHash(hash.digest('hex')));
    stream.on('error', rejectHash);
  });
}

/** Size on disk only — never reads the file body (P2: avoid loading large artifacts into memory). */
function byteLengthOf(path: string): number {
  try {
    const info = statSync(path);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Read the tools-pack build JSON and produce SHA-256 for every artifact path it
 * references (installer / payload / portableZip). Missing files are skipped so
 * a dry-run or partial build never throws. Sizes come from stat, never a full read.
 */
export async function collectArtifactHashes(
  buildJsonPath: string | undefined,
): Promise<ReleaseArtifactHash[]> {
  if (buildJsonPath == null || buildJsonPath === '') return [];
  const resolved = isAbsolute(buildJsonPath) ? buildJsonPath : resolve(buildJsonPath);
  if (!existsSync(resolved)) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(resolved, 'utf8')) as Record<string, unknown>;
  } catch {
    return [];
  }

  const candidates: Array<[string, unknown]> = [
    ['installer', parsed.installerPath],
    ['payload', parsed.payloadPath],
    ['portableZip', parsed.portableZipPath],
  ];

  const hashes: ReleaseArtifactHash[] = [];
  for (const [name, value] of candidates) {
    if (typeof value !== 'string') continue;
    const filePath = isAbsolute(value) ? value : resolve(dirname(resolved), value);
    if (!existsSync(filePath)) continue;
    hashes.push({
      name,
      path: filePath,
      sha256: await computeFileSha256(filePath),
      bytes: byteLengthOf(filePath),
    });
  }
  return hashes;
}

// ---- Real measurement signals (never guessed) ----

export type DataRootIntegrity = {
  /** Whether before/after fingerprints were actually computed. */
  measured: boolean;
  /** Fingerprints equal across upgrade. */
  consistent: boolean;
  before?: ContentFingerprint | undefined;
  after?: ContentFingerprint | undefined;
  /** Per-subdir before/after fingerprints and whether each stayed consistent. */
  dirs: Array<{ name: string; before?: string | undefined; after?: string | undefined; consistent: boolean }>;
};

export type RollbackEvidence = {
  exercised: boolean;
  /** Old version stayed healthy and data fingerprint unchanged. */
  ok: boolean;
  scenario?: 'bad-payload' | 'checksum-mismatch';
  oldVersion?: string;
  newVersion?: string;
  failureCode?: string;
  beforeFingerprint?: string;
  afterFingerprint?: string;
};

export type OfflineEvidence = {
  exercised: boolean;
  ok: boolean;
  metadataUnreachable: boolean;
  beforeFingerprint?: string;
  afterFingerprint?: string;
};

export type PackagedSmokeSignals = {
  platform: 'mac' | 'win';
  installOk: boolean;
  startOk: boolean;
  /** G7: real before/after content-fingerprint measurement across upgrade. */
  dataRootIntegrity?: DataRootIntegrity | undefined;
  /** G8: real bad-payload / checksum-mismatch rollback scenario. */
  rollback?: RollbackEvidence | undefined;
  /** G9: real metadata-unreachable offline-start scenario. */
  offline?: OfflineEvidence | undefined;
  evidence?: Record<string, unknown>;
};

function gate(id: string, status: ReleaseGateStatus, reason?: string, evidence?: Record<string, unknown>): ReleaseGateEvidence {
  const def = RELEASE_GATE_DEFINITIONS.find((d) => d.id === id);
  return { id, title: def?.title ?? id, status, ...(reason != null ? { reason } : {}), ...(evidence != null ? { evidence } : {}) };
}

/**
 * Map real smoke signals to G6–G9. G10 (artifact hashes/metadata) is filled in
 * by the orchestrator, so it is intentionally omitted here.
 *
 * Failure-path gates (G8/G9) and the data-preservation gate (G7) are honestly
 * BLOCKED unless the corresponding evidence was actually produced — we never
 * mock a PASS.
 */
export function summarizePackagedReleaseGates(signals: PackagedSmokeSignals): Record<string, ReleaseGateEvidence> {
  const gates: Record<string, ReleaseGateEvidence> = {};

  gates.G6 = signals.installOk && signals.startOk
    ? gate('G6', 'PASS', undefined, signals.evidence)
    : gate('G6', 'FAIL', 'install or start did not succeed', signals.evidence);

  const integrity = signals.dataRootIntegrity;
  if (!integrity || !integrity.measured) {
    // Not measured -> BLOCKED. Crucially this is NOT a PASS (P0 fix).
    gates.G7 = gate('G7', 'BLOCKED', 'dataRoot + backups/creator content-integrity not measured across upgrade in this profile', signals.evidence);
  } else if (integrity.consistent) {
    gates.G7 = gate('G7', 'PASS', undefined, {
      ...signals.evidence,
      measured: true,
      consistent: true,
      beforeFingerprint: integrity.before?.fingerprint,
      afterFingerprint: integrity.after?.fingerprint,
      dirs: integrity.dirs,
    });
  } else {
    gates.G7 = gate('G7', 'FAIL', 'dataRoot or backups/creator content diverged across upgrade', {
      ...signals.evidence,
      measured: true,
      consistent: false,
      beforeFingerprint: integrity.before?.fingerprint,
      afterFingerprint: integrity.after?.fingerprint,
      dirs: integrity.dirs,
    });
  }

  const rollback = signals.rollback;
  if (!rollback || !rollback.exercised) {
    gates.G8 = gate('G8', 'BLOCKED', 'failure-path (bad-payload/checksum-mismatch) scenario not exercised in this profile', signals.evidence);
  } else if (rollback.ok) {
    gates.G8 = gate('G8', 'PASS', undefined, {
      ...signals.evidence,
      scenario: rollback.scenario,
      oldVersion: rollback.oldVersion,
      newVersion: rollback.newVersion,
      failureCode: rollback.failureCode,
      beforeFingerprint: rollback.beforeFingerprint,
      afterFingerprint: rollback.afterFingerprint,
    });
  } else {
    gates.G8 = gate('G8', 'FAIL', 'payload/checksum failure did not roll back to prior version with data intact', {
      ...signals.evidence,
      scenario: rollback.scenario,
      oldVersion: rollback.oldVersion,
      newVersion: rollback.newVersion,
      failureCode: rollback.failureCode,
      beforeFingerprint: rollback.beforeFingerprint,
      afterFingerprint: rollback.afterFingerprint,
    });
  }

  const offline = signals.offline;
  if (!offline || !offline.exercised) {
    gates.G9 = gate('G9', 'BLOCKED', 'metadata-unreachable scenario not exercised in this profile', signals.evidence);
  } else if (offline.ok) {
    gates.G9 = gate('G9', 'PASS', undefined, {
      ...signals.evidence,
      metadataUnreachable: offline.metadataUnreachable,
      beforeFingerprint: offline.beforeFingerprint,
      afterFingerprint: offline.afterFingerprint,
    });
  } else {
    gates.G9 = gate('G9', 'FAIL', 'installed app did not offline-start when metadata was unreachable', {
      ...signals.evidence,
      metadataUnreachable: offline.metadataUnreachable,
      beforeFingerprint: offline.beforeFingerprint,
      afterFingerprint: offline.afterFingerprint,
    });
  }

  return gates;
}

/**
 * Build the final evidence object. The orchestrator supplies metadata + the
 * artifact hashes (G10), and optionally a partial gate map the spec produced.
 */
export function buildReleaseGatesEvidence(input: {
  platform: 'mac' | 'win';
  channel: string | null;
  releaseVersion: string | null;
  commit: string | null;
  githubRunId: string | null;
  githubRunAttempt: string | null;
  namespace: string;
  profile: string | null;
  reportPath: string;
  artifacts: ReleaseArtifactHash[];
  partialGates?: Record<string, ReleaseGateEvidence> | null;
  /** reason used when the platform smoke was skipped entirely */
  skipReason?: string;
}): ReleaseGatesEvidence {
  const hasArtifacts = input.artifacts.length > 0;
  const gates: Record<string, ReleaseGateEvidence> = {};

  if (input.partialGates && Object.keys(input.partialGates).length > 0) {
    for (const def of RELEASE_GATE_DEFINITIONS) {
      if (def.id === 'G10') continue;
      gates[def.id] = input.partialGates[def.id] ?? gate(def.id, 'BLOCKED', 'not reported by smoke');
    }
  } else {
    const reason = input.skipReason ?? 'platform smoke not executed in this environment';
    for (const def of RELEASE_GATE_DEFINITIONS) {
      if (def.id === 'G10') continue;
      gates[def.id] = gate(def.id, 'BLOCKED', reason);
    }
  }

  // G10 is always derived from the orchestrator's artifact hashes + metadata.
  gates.G10 = hasArtifacts
    ? gate('G10', 'PASS', undefined, {
        artifactCount: input.artifacts.length,
        artifacts: input.artifacts.map((a) => ({ name: a.name, sha256: a.sha256, bytes: a.bytes })),
        releaseVersion: input.releaseVersion,
        commit: input.commit,
        platform: input.platform,
        profile: input.profile,
      })
    : gate('G10', 'BLOCKED', 'no release artifact hashes available (build JSON absent or dry run)');

  return {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    platform: input.platform,
    channel: input.channel,
    releaseVersion: input.releaseVersion,
    commit: input.commit,
    githubRunId: input.githubRunId,
    githubRunAttempt: input.githubRunAttempt,
    namespace: input.namespace,
    profile: input.profile,
    reportPath: input.reportPath,
    artifacts: input.artifacts,
    gates,
  };
}
