import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Catalogs the daemon resolves from DAEMON_RESOURCE_ROOT (see the
 * `resolveDaemonResourceDir` calls in `apps/daemon/src/server.ts`). In a
 * container the resource root is `/app`, so every one of these has to be
 * copied into the runtime image — otherwise the directory is simply absent
 * and the corresponding catalog reads as empty at runtime, with no error.
 *
 * `design-templates` was missing here, which is why `/api/design-templates`
 * returned `[]` on every Docker install while desktop installs were fine.
 */
const RESOURCE_CATALOGS = [
  'skills',
  'design-systems',
  'design-templates',
  'craft',
  'prompt-templates',
  'assets/frames',
  'assets/community-pets',
  'plugins/_official',
];

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');

function runtimeStage(dockerfile: string): string {
  // The runtime stage is the last `FROM` in the file; everything the image
  // actually ships is copied after it.
  const lastFrom = dockerfile.lastIndexOf('\nFROM ');
  expect(lastFrom).toBeGreaterThan(-1);
  return dockerfile.slice(lastFrom);
}

describe('deploy/Dockerfile', () => {
  const dockerfile = fs.readFileSync(path.join(REPO_ROOT, 'deploy', 'Dockerfile'), 'utf8');

  it.each(RESOURCE_CATALOGS)('ships %s into the runtime image', (catalog) => {
    const stage = runtimeStage(dockerfile);
    const copiesCatalog = stage
      .split('\n')
      .some((line) => line.startsWith('COPY ') && line.trimEnd().endsWith(`./${catalog}`));

    expect(copiesCatalog, `deploy/Dockerfile never copies ${catalog} into the runtime image`).toBe(
      true,
    );
  });
});
