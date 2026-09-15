import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Bootstrap from source: platform's dist is one of the outputs rebuilt below.
import { createPackageManagerInvocation } from '../../../packages/platform/src/command.ts';
import { cleanSourceIdentity, writeSourceBuildReceipt } from '../src/runtimes/execution-source-receipt.ts';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../..');
const before = cleanSourceIdentity(repoRoot);
const require = createRequire(import.meta.url);
// Rebuild the runtime dependency graph inside the same source snapshot. An
// old contracts/platform dist must never inherit the new checkout's identity.
if (!process.env.npm_execpath) throw new Error('Run the daemon build through pnpm.');
const pnpm = createPackageManagerInvocation(['--filter', '@open-design/daemon^...', '--workspace-concurrency=4', '--if-present', 'run', 'build']);
const dependencies = spawnSync(pnpm.command, pnpm.args, {
  cwd: repoRoot,
  stdio: 'inherit',
  ...(pnpm.windowsVerbatimArguments ? { windowsVerbatimArguments: true } : {}),
});
if (dependencies.error) throw dependencies.error;
if (dependencies.status !== 0) process.exit(dependencies.status ?? 1);
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(packageRoot, 'tsconfig.json')], { cwd: packageRoot, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
writeSourceBuildReceipt(repoRoot, before);
