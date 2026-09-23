import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECEIPT_FILE = 'execution-source-receipt.json';
export interface ExecutionSourceReceipt {
  schemaVersion: 'od-execution-source-v1';
  sourceSha: string | null;
  buildSha256: string | null;
  processId: number;
  observedAt: number;
  incompleteReason: string | null;
}
interface SourceBuildReceipt {
  schemaVersion: 'od-source-build-v1';
  sourceSha: string | null;
  outputRoots: string[];
  buildSha256: string;
  incompleteReason: string | null;
}

/** Only a clean, unchanged checkout can attribute a build to a commit. */
export function cleanSourceIdentity(repoRoot: string): string | null {
  try {
    const options = { cwd: repoRoot, encoding: 'utf8' as const, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] as ['ignore', 'pipe', 'pipe'] };
    if (execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], options).trim()) return null;
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
    return /^[a-f0-9]{40}$/.test(sha) ? sha : null;
  } catch { return null; }
}

/** Hash the actual runtime tree, not a version environment variable. */
export function hashRuntimeOutputs(repoRoot: string, outputRoots: string[]): string {
  const hash = createHash('sha256');
  const visit = (relative: string): void => {
    const absolute = path.join(repoRoot, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error('runtime_output_symlink');
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) {
        if (entry !== RECEIPT_FILE) visit(`${relative}/${entry}`);
      }
    } else if (stat.isFile()) {
      hash.update(JSON.stringify(relative)); hash.update('\0');
      hash.update(createHash('sha256').update(fs.readFileSync(absolute)).digest());
    }
  };
  for (const root of [...outputRoots].sort()) {
    if (!/^(apps\/daemon|packages\/[a-z0-9-]+)\/dist$/.test(root)) throw new Error('invalid_runtime_output_root');
    visit(root);
  }
  return hash.digest('hex');
}

function workspaceRuntimeOutputRoots(repoRoot: string): string[] {
  const packages = new Map<string, { root: string; dependencies: Record<string, string> }>();
  for (const name of fs.readdirSync(path.join(repoRoot, 'packages'))) {
    const root = `packages/${name}`;
    const file = path.join(repoRoot, root, 'package.json');
    if (!fs.existsSync(file)) continue;
    const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
    packages.set(metadata.name, { root, dependencies: metadata.dependencies ?? {} });
  }
  const roots = new Set<string>(['apps/daemon/dist']);
  const visit = (dependencies: Record<string, string>): void => {
    for (const [name, spec] of Object.entries(dependencies)) {
      if (!spec.startsWith('workspace:')) continue;
      const dependency = packages.get(name);
      if (!dependency) throw new Error('workspace_dependency_missing');
      if (roots.has(`${dependency.root}/dist`)) continue;
      roots.add(`${dependency.root}/dist`); visit(dependency.dependencies);
    }
  };
  visit(JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/daemon/package.json'), 'utf8')).dependencies ?? {});
  return [...roots].sort();
}

export function writeSourceBuildReceipt(repoRoot: string, before: string | null): SourceBuildReceipt {
  const after = cleanSourceIdentity(repoRoot);
  const outputRoots = workspaceRuntimeOutputRoots(repoRoot);
  const receipt: SourceBuildReceipt = {
    schemaVersion: 'od-source-build-v1', sourceSha: before && before === after ? before : null,
    outputRoots, buildSha256: hashRuntimeOutputs(repoRoot, outputRoots),
    incompleteReason: before && before === after ? null : 'source_dirty_or_changed_during_build',
  };
  fs.writeFileSync(path.join(repoRoot, 'apps/daemon/dist', RECEIPT_FILE), JSON.stringify(receipt) + '\n');
  return receipt;
}

export function readExecutionSourceReceipt(daemonPackageRoot: string): ExecutionSourceReceipt {
  const base: ExecutionSourceReceipt = { schemaVersion: 'od-execution-source-v1', sourceSha: null, buildSha256: null,
    processId: process.pid, observedAt: Date.now(), incompleteReason: 'source_build_receipt_unavailable' };
  try {
    const repoRoot = path.resolve(daemonPackageRoot, '../..');
    const receipt = JSON.parse(fs.readFileSync(path.join(daemonPackageRoot, 'dist', RECEIPT_FILE), 'utf8')) as SourceBuildReceipt;
    if (receipt.schemaVersion !== 'od-source-build-v1' || !Array.isArray(receipt.outputRoots)
      || !receipt.outputRoots.includes('apps/daemon/dist') || typeof receipt.buildSha256 !== 'string') return base;
    if (JSON.stringify([...receipt.outputRoots].sort()) !== JSON.stringify(workspaceRuntimeOutputRoots(repoRoot))) return base;
    const actual = hashRuntimeOutputs(repoRoot, receipt.outputRoots);
    base.buildSha256 = actual;
    if (actual !== receipt.buildSha256) return { ...base, incompleteReason: 'runtime_output_changed_after_build' };
    if (!receipt.sourceSha || cleanSourceIdentity(repoRoot) !== receipt.sourceSha) return { ...base, incompleteReason: receipt.incompleteReason ?? 'source_changed_after_build' };
    return { ...base, sourceSha: receipt.sourceSha, incompleteReason: null };
  } catch { return base; }
}

function runningDaemonPackageRoot(): string | null {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (directory !== path.dirname(directory)) {
    try {
      if (JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8')).name === '@open-design/daemon') return directory;
    } catch { /* continue to the owning package */ }
    directory = path.dirname(directory);
  }
  return null;
}

// Captured when this module is loaded by the daemon process, before any Run.
// Do not refresh from Git during GET: a subsequent checkout cannot rewrite
// the identity of an already running process or a historical Run.
const daemonPackageRoot = runningDaemonPackageRoot();
const processReceipt = daemonPackageRoot ? readExecutionSourceReceipt(daemonPackageRoot) : null;
export function executionSourceReceiptForNewRun(): ExecutionSourceReceipt | null {
  if (!processReceipt) return null;
  if (!processReceipt.sourceSha || !daemonPackageRoot) return { ...processReceipt };
  const current = readExecutionSourceReceipt(daemonPackageRoot);
  return current.sourceSha === processReceipt.sourceSha && current.buildSha256 === processReceipt.buildSha256
    ? { ...processReceipt }
    : { ...processReceipt, sourceSha: null, incompleteReason: 'execution_tree_changed_since_process_start' };
}
