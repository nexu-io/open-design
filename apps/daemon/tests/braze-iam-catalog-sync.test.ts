// Role: Drift guard — design-templates/braze-iam mirror must match the canonical
//       examples/braze-iam folder byte-for-byte on the shared subset.
// Key Features: walk-bound byte-identical checks (every shared file, list derived from
//               the canonical walk); open-design.json excluded (canonical-only); .DS_Store
//               excluded (macOS filesystem noise, gitignored, never present in canonical).
// Dependencies: node:fs, node:path, vitest
// Notes: same guard shape as naver-blog-catalog-sync.test.ts / cardnews-instagram-catalog-sync.test.ts
//        — keep the three in step. Braze was the one catalog with no guard (see naver-blog test's
//        note: "Braze already drifted (SKILL.md body) with no guard"); this closes that gap.
//        Walk-bound (not list-bound): a file added to BOTH catalogs with divergent
//        content is still byte-compared — a hardcoded list silently skipped it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const canonical = path.join(repoRoot, 'plugins', '_official', 'examples', 'braze-iam');
const mirror = path.join(repoRoot, 'design-templates', 'braze-iam');

// Shared files = everything in the catalog except canonical-only open-design.json
// and macOS .DS_Store noise (gitignored, never checked into either side).
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

describe('braze-iam catalog mirror is in sync', () => {
  it('canonical walk found the catalog (guard is not vacuous)', () => {
    expect(sharedFiles).toContain('SKILL.md');
    expect(sharedFiles).toContain('example.html');
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
