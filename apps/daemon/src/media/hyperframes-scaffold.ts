import { lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const COMPOSITION_ROOTS = new Set(['.hyperframes-cache', 'motion-source']);
const COMPOSITION_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const HYPERFRAMES_CONFIG = `${JSON.stringify({
  $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
  paths: {
    blocks: 'compositions',
    components: 'compositions/components',
    assets: 'assets',
  },
  media: { autoProxy: true },
}, null, 2)}\n`;

const BLANK_COMPOSITION_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: 1920px;
        height: 1080px;
        overflow: hidden;
        background: #000;
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="10"
      data-width="1920"
      data-height="1080"
    ></div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

export interface HyperFramesScaffoldResult {
  compositionDir: string;
  files: ['hyperframes.json', 'meta.json', 'index.html'];
}

export async function scaffoldHyperFramesComposition(input: {
  projectDir: string;
  compositionDir: string;
  now?: Date;
}): Promise<HyperFramesScaffoldResult> {
  if (!path.isAbsolute(input.projectDir)) {
    throw new Error('projectDir must be absolute');
  }
  const requested = input.compositionDir.trim();
  const normalized = path.normalize(requested);
  const parts = normalized.split(path.sep);
  const compositionId = parts[1] ?? '';
  if (
    parts.length !== 2
    || !COMPOSITION_ROOTS.has(parts[0] ?? '')
    || !COMPOSITION_ID_RE.test(compositionId)
  ) {
    throw new Error('compositionDir must be inside .hyperframes-cache or motion-source as <root>/<id>');
  }
  const compositionRoot = parts[0]!;
  const cacheDir = path.join(input.projectDir, compositionRoot);
  await mkdir(cacheDir, { recursive: true });
  const cacheStat = await lstat(cacheDir);
  if (!cacheStat.isDirectory() || cacheStat.isSymbolicLink()) {
    throw new Error(`${compositionRoot} must be a real directory inside the project`);
  }

  const targetDir = path.join(cacheDir, compositionId);
  try {
    await lstat(targetDir);
    throw new Error(`composition already exists: ${compositionRoot}/${compositionId}`);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }

  await mkdir(targetDir);
  const files = ['hyperframes.json', 'meta.json', 'index.html'] as const;
  try {
    const createdAt = (input.now ?? new Date()).toISOString();
    const metadata = `${JSON.stringify({
      id: compositionId,
      name: compositionId,
      createdAt,
    }, null, 2)}\n`;
    await Promise.all([
      writeFile(path.join(targetDir, files[0]), HYPERFRAMES_CONFIG, { encoding: 'utf8', flag: 'wx' }),
      writeFile(path.join(targetDir, files[1]), metadata, { encoding: 'utf8', flag: 'wx' }),
      writeFile(path.join(targetDir, files[2]), BLANK_COMPOSITION_HTML, { encoding: 'utf8', flag: 'wx' }),
    ]);
  } catch (error) {
    await rm(targetDir, { recursive: true, force: true });
    throw error;
  }

  return {
    compositionDir: `${compositionRoot}/${compositionId}`,
    files: [...files],
  };
}
