// Role: Drift guard — design-templates/naver-blog mirror must match the canonical
//       examples/naver-blog folder byte-for-byte on the shared subset.
// Key Features: shared-subset byte-identical (SKILL.md, example.html, references/**);
//               open-design.json excluded (canonical-only).
// Dependencies: node:fs, node:path, vitest
// Notes: Braze already drifted (SKILL.md body) with no guard — this prevents the same here.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const canonical = path.join(repoRoot, 'plugins', '_official', 'examples', 'naver-blog');
const mirror = path.join(repoRoot, 'design-templates', 'naver-blog');

// Files shared by both catalogs. open-design.json is canonical-only and excluded.
const SHARED = [
  'SKILL.md',
  'example.html',
  'references/blog-structure.md',
  'references/worked-example.md',
  'references/research-subagent.md',
  'references/review-subagent.md',
];

describe('naver-blog catalog mirror is in sync', () => {
  for (const rel of SHARED) {
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
    // Byte-equality above only checks the 4 known files; this catches a stray
    // file added to one side only. open-design.json is canonical-only → excluded.
    const listRel = (root: string): string[] => {
      const out: string[] = [];
      const walk = (dir: string, prefix: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (rel === 'open-design.json') continue;
          if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
          else out.push(rel);
        }
      };
      walk(root, '');
      return out.sort();
    };
    expect(listRel(mirror)).toEqual(listRel(canonical));
  });
});
