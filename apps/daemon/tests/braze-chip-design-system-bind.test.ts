import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PluginManifestSchema } from '@open-design/contracts';

import { pickDesignSystemId } from '../src/plugins/apply.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const chipPath = path.resolve(
  here,
  '../../../plugins/_official/examples/braze-iam/open-design.json',
);

describe('braze chip design-system binding', () => {
  it('binds the bodoc design system by ref', async () => {
    const raw = JSON.parse(await readFile(chipPath, 'utf8'));
    const manifest = PluginManifestSchema.parse(raw);

    // No active-project design system passed: ref must win on its own.
    expect(pickDesignSystemId(manifest)).toBe('bodoc');
  });
});
