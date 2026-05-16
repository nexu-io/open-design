import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { SmokeSuite } from './smoke-suite.ts';
import { requestJson } from './http.ts';

export type CodexPetSummary = {
  bundled?: boolean;
  description: string;
  displayName: string;
  hatchedAt: number;
  id: string;
  spritesheetExt: string;
  spritesheetUrl: string;
};

export type CodexPetsResponse = {
  pets: CodexPetSummary[];
  rootDir: string;
};

export type CodexPetFixture = {
  description: string;
  displayName: string;
  id: string;
  png: Buffer;
};

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

export async function writeCodexPetFixture(
  suite: SmokeSuite,
  input: {
    description: string;
    displayName: string;
    id: string;
  },
): Promise<CodexPetFixture> {
  const petDir = join(suite.codexHomeDir, 'pets', input.id);
  await mkdir(petDir, { recursive: true });
  await writeFile(
    join(petDir, 'pet.json'),
    `${JSON.stringify({
      description: input.description,
      displayName: input.displayName,
      id: input.id,
      spritesheetPath: 'spritesheet.png',
    }, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(petDir, 'spritesheet.png'), ONE_PIXEL_PNG);
  return { ...input, png: ONE_PIXEL_PNG };
}

export async function listCodexPets(baseUrl: string): Promise<CodexPetsResponse> {
  return await requestJson<CodexPetsResponse>(baseUrl, '/api/codex-pets');
}

export async function readCodexPetSpritesheet(
  baseUrl: string,
  petId: string,
): Promise<{
  body: Buffer;
  cacheControl: string | null;
  contentType: string | null;
  origin: string | null;
  status: number;
}> {
  const response = await fetch(
    new URL(`/api/codex-pets/${encodeURIComponent(petId)}/spritesheet`, ensureTrailingSlash(baseUrl)),
    { headers: { origin: 'null' } },
  );
  return {
    body: Buffer.from(await response.arrayBuffer()),
    cacheControl: response.headers.get('cache-control'),
    contentType: response.headers.get('content-type'),
    origin: response.headers.get('access-control-allow-origin'),
    status: response.status,
  };
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
