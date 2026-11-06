// Plan §3.M3 + §3.M4 — bundled atoms roster contract.
//
// The repo's plugins/_official/atoms/ directory is the v1 source of
// truth for first-party atom SKILL.md fragments. This test pins the
// roster so a future PR can't accidentally drop an atom (or rename
// its folder) without touching the spec §10 / §21 / §23 tables in
// the same patch.
//
// We assert the on-disk inventory rather than the FIRST_PARTY_ATOMS
// catalog — the latter is the daemon-side metadata, the former is
// the publishable plugin substrate spec §23 reserves.

import path from 'node:path';
import url from 'node:url';
import { readdir, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const atomsRoot = path.join(repoRoot, 'plugins', '_official', 'atoms');

// Per spec §10 and §21 — implemented atoms (Phase 4 default)
const PHASE_4_ATOMS = [
  'discovery-question-form',
  'direction-picker',
  'todo-write',
  'critique-theater',
];

// Phase 6 (figma-migration native, spec §21.4)
const PHASE_6_ATOMS = ['figma-extract', 'token-map'];

// Phase 7 (code-migration native, spec §21.4)
const PHASE_7_ATOMS = [
  'code-import',
  'design-extract',
  'rewrite-plan',
  'patch-edit',
  'diff-review',
  'build-test',
];

// Phase 8 (production code delivery, spec §21.4)
const PHASE_8_ATOMS = ['handoff'];

const EXPECTED_ATOMS = [
  ...PHASE_4_ATOMS,
  ...PHASE_6_ATOMS,
  ...PHASE_7_ATOMS,
  ...PHASE_8_ATOMS,
].sort();

describe('plugins/_official/atoms roster', () => {
  it('contains exactly the spec §10 / §21 / §23 reserved ids', async () => {
    const entries = await readdir(atomsRoot, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
    expect(dirs).toEqual(EXPECTED_ATOMS);
  });

  it('every atom folder ships SKILL.md + open-design.json (the spec §3 cross-catalog floor)', async () => {
    for (const id of EXPECTED_ATOMS) {
      const folder = path.join(atomsRoot, id);
      const skill = await stat(path.join(folder, 'SKILL.md'));
      const manifest = await stat(path.join(folder, 'open-design.json'));
      expect(skill.isFile()).toBe(true);
      expect(manifest.isFile()).toBe(true);
    }
  });
});
