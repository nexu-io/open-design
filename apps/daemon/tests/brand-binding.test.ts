import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PluginManifestSchema } from '@marketing-ax/contracts';

import { pickBrandBinding } from '../src/plugins/apply.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const examples = path.resolve(here, '../../../plugins/_official/examples');

async function manifestOf(id: string) {
  const raw = await fs.readFile(path.join(examples, id, 'open-design.json'), 'utf8');
  return PluginManifestSchema.parse(JSON.parse(raw));
}

describe('plugin manifest brand binding', () => {
  it('reads brand ref + deliverable from all three bodoc scenario plugins', async () => {
    expect(pickBrandBinding(await manifestOf('braze-iam'))).toEqual({ brandId: 'bodoc', deliverable: 'iam' });
    expect(pickBrandBinding(await manifestOf('cardnews-instagram'))).toEqual({ brandId: 'bodoc', deliverable: 'cardnews' });
    expect(pickBrandBinding(await manifestOf('naver-blog'))).toEqual({ brandId: 'bodoc', deliverable: 'blog' });
  });
  it('returns empty binding when od.context.brand is absent', () => {
    const manifest = PluginManifestSchema.parse({ id: 'x', name: 'x', version: '1.0.0' });
    expect(pickBrandBinding(manifest)).toEqual({});
  });
});
