// Role: Drift guard — design-templates/cardnews-instagram mirror must match the
//       canonical examples/cardnews-instagram folder byte-for-byte on the shared subset.
// Key Features: walk-bound byte-identical checks (every shared file, list derived from
//               the canonical walk); open-design.json excluded (canonical-only);
//               .DS_Store excluded (gitignored macOS noise, never checked into either side).
// Dependencies: node:fs, node:path, vitest
// Notes: same guard shape as naver-blog-catalog-sync.test.ts — keep the two in step.
//        Walk-bound (not list-bound): a file added to BOTH catalogs with divergent
//        content is still byte-compared — a hardcoded list silently skipped it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const canonical = path.join(repoRoot, 'plugins', '_official', 'examples', 'cardnews-instagram');
const mirror = path.join(repoRoot, 'design-templates', 'cardnews-instagram');

// Shared files = everything in the catalog except canonical-only open-design.json.
const listRel = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (rel === 'open-design.json') continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
};

const sharedFiles = listRel(canonical);

describe('cardnews-instagram catalog mirror is in sync', () => {
  it('canonical walk found the catalog (guard is not vacuous)', () => {
    expect(sharedFiles).toContain('SKILL.md');
    expect(sharedFiles).toContain('scripts/compose_cards.py');
  });

  for (const rel of sharedFiles) {
    it(`${rel} is byte-identical between canonical and mirror`, () => {
      const a = fs.readFileSync(path.join(canonical, rel));
      const b = fs.readFileSync(path.join(mirror, rel));
      expect(b.equals(a)).toBe(true);
    });
  }

  it('mirror does NOT contain open-design.json (canonical-only)', () => {
    expect(fs.existsSync(path.join(mirror, 'open-design.json'))).toBe(false);
  });

  it('both catalogs hold the same shared file set (no extra/dropped files beyond open-design.json)', () => {
    // Byte-equality above walks the canonical side; this direction catches a
    // stray file that exists in the mirror only.
    expect(listRel(mirror)).toEqual(sharedFiles);
  });
});
