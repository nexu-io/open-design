// The data-report template ships twice: skills/data-report/ (the skill the
// agent reads mid-task) and plugins/_official/examples/data-report/ (the
// Community gallery mirror). The two copies must stay byte-for-byte identical
// for SKILL.md and example.html — the migration generator must NOT be re-run
// to sync them, because it rebuilds open-design.json and drops the mirror's
// hand-added i18n fields.
//
// example.html is also the visual anchor for the wide-table pinned-column
// contract (issue nexu-io/open-design#417, internal #691): a horizontal
// scroll container, a sticky first column with a z-index ladder, and opaque
// td-level zebra backgrounds. The load-bearing properties must live in the
// example's own <style> block (not only in CDN Tailwind classes) so the
// contract survives offline. The behavioral proof lives in
// e2e/ui/data-report-sticky-column.test.ts; this spec pins the static shape
// against future drift.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const skillDir = path.join(repoRoot, 'skills', 'data-report');
const mirrorDir = path.join(repoRoot, 'plugins', '_official', 'examples', 'data-report');

describe('data-report template', () => {
  it('[P2] skills/ and plugins/ mirror copies are byte-for-byte identical', async () => {
    for (const file of ['SKILL.md', 'example.html']) {
      const [skill, mirror] = await Promise.all([
        readFile(path.join(skillDir, file), 'utf8'),
        readFile(path.join(mirrorDir, file), 'utf8'),
      ]);
      expect(mirror, `${file} drifted between skills/data-report and plugins mirror`).toBe(skill);
    }
  });

  it('[P2] example.html carries the pinned-column contract in its own <style> block', async () => {
    const html = await readFile(path.join(skillDir, 'example.html'), 'utf8');
    const styleBlock = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
    expect(styleBlock, 'example.html must have an inline <style> block').toBeTruthy();
    const css = styleBlock ?? '';

    // Horizontal scroll container (not overflow:hidden clipping).
    expect(css).toMatch(/\.table-scroll\s*\{[^}]*overflow-x\s*:\s*auto/);
    // Sticky pinned first column with its z-index step above dynamic cells.
    expect(css).toMatch(/th:first-child,\s*td:first-child\s*\{[^}]*position\s*:\s*sticky/);
    expect(css).toMatch(/tbody td:first-child\s*\{[^}]*z-index\s*:\s*1/);
    // Header above data cells; top-left crossing cell above everything.
    expect(css).toMatch(/thead th\s*\{[^}]*z-index\s*:\s*2/);
    expect(css).toMatch(/thead th:first-child\s*\{[^}]*z-index\s*:\s*3/);
    // Opaque td-level backgrounds: base, zebra stripe, and hover must target
    // td (row-level backgrounds do not participate in sticky layering).
    expect(css).toMatch(/tbody td\s*\{[^}]*background\s*:\s*#/);
    expect(css).toMatch(/tbody tr:nth-child\(even\)\s+td\s*\{[^}]*background/);
    expect(css).toMatch(/tbody tr:hover\s+td\s*\{[^}]*background/);

    // The detail table must be wired through the scroll container.
    expect(html).toContain('class="table-scroll"');
  });

  it('[P2] SKILL.md spells out the wide-table pinned-column contract', async () => {
    const skillMd = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
    expect(skillMd).toContain('overflow-x:auto');
    expect(skillMd).toContain('position:sticky; left:0;');
    expect(skillMd).toContain('z-index:3');
    expect(skillMd).toContain('tbody tr:nth-child(even) td');
  });
});
