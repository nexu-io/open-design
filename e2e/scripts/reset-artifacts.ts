import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(__dirname, '..');

const targets = [
  path.join(e2eDir, '.od-data'),
  path.join(e2eDir, 'test-results'),
  path.join(e2eDir, 'reports', 'test-results'),
  path.join(e2eDir, 'reports', 'html'),
  path.join(e2eDir, 'reports', 'playwright-html-report'),
  path.join(e2eDir, 'reports', 'results.json'),
  path.join(e2eDir, 'reports', 'junit.xml'),
  path.join(e2eDir, 'reports', 'latest.md'),
  path.join(e2eDir, '.DS_Store'),
];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
}

await mkdir(path.join(e2eDir, 'reports'), { recursive: true });

// Recreate runtime roots so local inspection stays predictable even before
// Playwright or the daemon materializes them.
await mkdir(path.join(e2eDir, '.od-data'), { recursive: true });
await mkdir(path.join(e2eDir, 'reports', 'test-results'), {
  recursive: true,
});

// Best-effort removal of accidental empty directories directly under the
// test data root. This keeps old project ids from piling up across runs.
const projectsRoot = path.join(e2eDir, '.od-data', 'projects');
try {
  const entries = await readdir(projectsRoot, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        rm(path.join(projectsRoot, entry.name), {
          recursive: true,
          force: true,
        }),
      ),
  );
} catch (error) {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  if (code !== 'ENOENT') {
    console.warn('Failed to clean stale e2e project dirs:', error);
  }
}
