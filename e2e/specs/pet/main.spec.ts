// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  listCodexPets,
  readCodexPetSpritesheet,
  writeCodexPetFixture,
} from '@/vitest/pets';
import { createSmokeSuite } from '@/vitest/smoke-suite';

const USER_PET_ID = 'qa-inspect-pet';
const USER_PET_NAME = 'QA Inspect Pet';
const USER_PET_DESCRIPTION = 'Seeded by the Pet pure inspect spec.';

describe('pet main spec', () => {
  test('serves deterministic Codex pet registry entries and spritesheets', async () => {
    const suite = await createSmokeSuite('pet-main');

    await suite.with.toolsDev(async ({ runtime, status, webUrl }) => {
      const fixture = await writeCodexPetFixture(suite, {
        description: USER_PET_DESCRIPTION,
        displayName: USER_PET_NAME,
        id: USER_PET_ID,
      });

      const registry = await listCodexPets(webUrl);
      expect(registry.rootDir).toBe(join(suite.codexHomeDir, 'pets'));

      const userPet = registry.pets.find((pet) => pet.id === USER_PET_ID);
      expect(userPet).toEqual(expect.objectContaining({
        bundled: false,
        description: USER_PET_DESCRIPTION,
        displayName: USER_PET_NAME,
        id: USER_PET_ID,
        spritesheetExt: 'png',
        spritesheetUrl: `/api/codex-pets/${USER_PET_ID}/spritesheet`,
      }));

      const bundledPet = registry.pets.find((pet) => pet.id === 'clippit');
      expect(bundledPet).toEqual(expect.objectContaining({
        bundled: true,
        id: 'clippit',
        spritesheetExt: 'webp',
      }));

      const userSheet = await readCodexPetSpritesheet(webUrl, USER_PET_ID);
      expect(userSheet.status).toBe(200);
      expect(userSheet.contentType).toMatch(/^image\/png\b/);
      expect(userSheet.cacheControl).toBe('no-store');
      expect(userSheet.origin).toBe('null');
      expect(userSheet.body.equals(fixture.png)).toBe(true);

      const bundledSheet = await readCodexPetSpritesheet(webUrl, 'clippit');
      expect(bundledSheet.status).toBe(200);
      expect(bundledSheet.contentType).toMatch(/^image\/webp\b/);
      expect(bundledSheet.body.byteLength).toBeGreaterThan(0);

      const escapedSheet = await readCodexPetSpritesheet(webUrl, '../../etc/passwd');
      expect(escapedSheet.status).toBe(404);

      await suite.report.json('summary.json', {
        namespace: suite.namespace,
        registry: {
          bundledCount: registry.pets.filter((pet) => pet.bundled).length,
          rootDir: registry.rootDir,
          userPet,
        },
        runtime: {
          daemonPort: runtime.daemonPort,
          webPort: runtime.webPort,
          webUrl,
        },
        status,
      });
    });
  }, 180_000);
});
