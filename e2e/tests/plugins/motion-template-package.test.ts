import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { expect, test } from 'vitest';
import { isMotionVideoComposition, MOTION_AUDIO_SYNC_RUNTIME } from '@open-design/contracts/runtime/motion-source-player';

import {
  captureFrozenSkillPackageFromSources,
  materializeFrozenSkillPackage,
} from '../../../apps/daemon/src/strategies/od-next/frozen-skill-package.js';

const examples = fileURLToPath(new URL('../../../plugins/_official/examples/', import.meta.url));

async function expectSameAsset(reference: string, source: string, relative: string): Promise<void> {
  const [actual, expected] = await Promise.all([
    readFile(path.join(reference, relative)),
    readFile(path.join(source, relative)),
  ]);
  // Compare every byte without a costly generic deep traversal of large buffers.
  expect(actual.equals(expected), `${relative}: frozen asset must match source byte-for-byte`).toBe(true);
}

test.each(['showreel', 'ui-morph', 'future', 'product-promo', 'visual-lesson'])(
  '[P1] motion-%s carries its offline scripts, font and license through the frozen reference package',
  async (name) => {
    const source = path.join(examples, `motion-${name}`);
    const frozen = await captureFrozenSkillPackageFromSources({ sources: [{ dir: source, name: `Motion ${name}` }] });
    const project = await mkdtemp(path.join(tmpdir(), 'motion-reference-'));
    try {
      const [relativeRoot] = await materializeFrozenSkillPackage({ frozen, cwd: project });
      const reference = path.join(project, relativeRoot!);
      const html = await readFile(path.join(reference, 'example.html'), 'utf8');
      expect(isMotionVideoComposition(html)).toBe(true);
      expect(html).toContain(MOTION_AUDIO_SYNC_RUNTIME);
      const skill = await readFile(path.join(reference, 'SKILL.md'), 'utf8');
      // Follow the template's documented offline preparation step for Three.js.
      if (name === 'future') {
        expect(skill).toContain('gzip -dc');
        const bytes = gunzipSync(await readFile(path.join(reference, 'assets/three.min.js.gz')));
        await writeFile(path.join(reference, 'assets/three.min.js'), bytes);
      }
      const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)];
      expect(scripts.length).toBeGreaterThan(0);
      for (const [, src] of scripts) {
        expect(src).not.toMatch(/^https?:/);
        const relative = src!.replace(/^\.\//, '');
        await expectSameAsset(reference, source, relative);
      }
      // Rendering must retain the same font when the reference is copied offline.
      const fonts = [...html.matchAll(/url\(["']?(assets\/[^)"']+\.(?:ttf|woff2?))["']?\)/g)];
      expect(fonts.length).toBeGreaterThan(0);
      for (const [, font] of fonts) {
        await expectSameAsset(reference, source, font!);
        // Each bundled font travels with its SIL Open Font License.
        const family = font!.replace(/^assets\//, '').replace(/-(?:subset|black|bold|medium|regular|semibold|extrabold|italic|expanded-black|condensed-black)+\.ttf$/, '').replace(/-(?:expanded|condensed)$/, '');
        expect(await readFile(path.join(reference, `assets/${family}-OFL.txt`), 'utf8')).toContain('SIL OPEN FONT LICENSE');
      }
      expect(html).toContain('src="assets/soundtrack.mp3"');
      await expectSameAsset(reference, source, 'assets/soundtrack.mp3');
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  },
);
