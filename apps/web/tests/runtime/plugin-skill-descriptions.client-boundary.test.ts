import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('plugin skill description client boundary', () => {
  it('does not pull the Node-oriented plugin-runtime barrel into the Web bundle', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const runtimeSource = readFileSync(
      resolve(process.cwd(), 'src/runtime/plugin-skill-descriptions.ts'),
      'utf8',
    );

    expect(packageJson.dependencies).not.toHaveProperty('@open-design/plugin-runtime');
    expect(runtimeSource).not.toContain("from '@open-design/plugin-runtime'");
  });
});
