import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readDesignSystem } from '../src/design-systems.js';
import { readPromptTemplate } from '../src/prompt-templates.js';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'od-static-resource-paths-'));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('static resource path guards', () => {
  it('rejects design-system ids that are not single safe path segments', async () => {
    const root = path.join(tempRoot, 'design-systems');
    await mkdir(path.join(root, 'demo'), { recursive: true });
    await writeFile(path.join(root, 'demo', 'DESIGN.md'), '# Demo\n');
    await writeFile(path.join(tempRoot, 'DESIGN.md'), '# Outside\n');

    await expect(readDesignSystem(root, 'demo')).resolves.toBe('# Demo\n');
    await expect(readDesignSystem(root, '..')).resolves.toBeNull();
    await expect(readDesignSystem(root, '...')).resolves.toBeNull();
    await expect(readDesignSystem(root, '../outside')).resolves.toBeNull();
    await expect(readDesignSystem(root, 'nested/demo')).resolves.toBeNull();
  });

  it('rejects prompt-template ids that can traverse out of their surface folder', async () => {
    const root = path.join(tempRoot, 'prompt-templates');
    await mkdir(path.join(root, 'image'), { recursive: true });
    await writeFile(
      path.join(root, 'image', 'demo.json'),
      JSON.stringify({
        id: 'demo',
        surface: 'image',
        title: 'Demo prompt',
        prompt: 'A detailed prompt body long enough to be accepted.',
        source: { repo: 'open-design/test', license: 'MIT' },
      }),
    );
    await writeFile(
      path.join(root, 'secret.json'),
      JSON.stringify({
        id: 'secret',
        surface: 'image',
        title: 'Secret prompt',
        prompt: 'This template lives outside the image folder.',
        source: { repo: 'open-design/test', license: 'MIT' },
      }),
    );

    await expect(readPromptTemplate(root, 'image', 'demo')).resolves.toMatchObject({
      id: 'demo',
    });
    await expect(readPromptTemplate(root, 'image', '../secret')).resolves.toBeNull();
    await expect(readPromptTemplate(root, 'image', '..\\secret')).resolves.toBeNull();
  });
});
