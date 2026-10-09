import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeBasePath } from '@open-design/path-config';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const basePath = normalizeBasePath(process.env.OD_WEB_BASE_PATH);
const manifest = JSON.stringify({ basePath, schemaVersion: 1 }, null, 2) + '\n';

for (const outputDir of ['out', '.next']) {
  const directory = join(webRoot, outputDir);
  if (!existsSync(directory)) continue;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, '.open-design-build.json'), manifest, 'utf8');
}
