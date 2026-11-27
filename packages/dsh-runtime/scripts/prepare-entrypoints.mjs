import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: pkgRoot,
    env: process.env,
    shell: true,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return result.status ?? 1;
}

// Always build on prepare/prepack so git and tarball consumers receive dist/*
// entrypoints instead of only TypeScript sources.
const buildStatus = run('npm', ['run', 'build']);
if (buildStatus !== 0) {
  console.error('@open-design/dsh-runtime: build failed during prepare/prepack');
  process.exit(buildStatus);
}

const smokeStatus = run('node', [path.join(pkgRoot, 'scripts', 'smoke-entrypoints.mjs')]);
process.exit(smokeStatus);
