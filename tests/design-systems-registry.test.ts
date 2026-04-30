import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listDesignSystems } from '../daemon/design-systems.js';

describe('design-system registry', () => {
  it('registers the iOS 26 Liquid Glass system with its reference asset', async () => {
    const systems = await listDesignSystems(path.join(process.cwd(), 'design-systems'));
    const system = systems.find((entry) => entry.id === 'ios-26-liquid-glass');

    expect(system).toMatchObject({
      title: 'iOS 26 Liquid Glass',
      category: 'Mobile & OS',
    });
    expect(system?.summary).toContain("James's iOS 26 Liquid Glass system");
    expect(system?.swatches).toContain('#007aff');

    const asset = await readFile(
      path.join(
        process.cwd(),
        'design-systems',
        'ios-26-liquid-glass',
        'assets',
        'reference-prototype.html',
      ),
      'utf8',
    );
    expect(asset).toContain('iOS 26 Liquid Glass Reference Prototype');
    expect(asset).toContain('Reduce Bright Effects');
  });
});
