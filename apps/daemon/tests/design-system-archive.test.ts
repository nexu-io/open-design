import { mkdtempSync, rmSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  buildDesignSystemSkillsMarkdown,
  buildUserDesignSystemArchive,
} from '../src/design-systems/index.js';

const DESIGN_MD = `# Acme Brand

## Identity
Acme is a bold, friendly developer-tools brand.

## Palette
- Background: #ffffff
- Foreground: #111111
- Accent: #ff5a36
- Border: #e6e1d8
`;

describe('buildUserDesignSystemArchive', () => {
  let root = '';
  const dirId = 'acme-brand';

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'od-ds-archive-'));
    const dir = path.join(root, dirId);
    await mkdir(path.join(dir, 'system'), { recursive: true });
    await writeFile(path.join(dir, 'DESIGN.md'), DESIGN_MD);
    await writeFile(
      path.join(dir, 'metadata.json'),
      JSON.stringify({
        title: 'Acme Brand',
        category: 'Developer Tools',
        surface: 'web',
        status: 'published',
        provenance: { sourceUrls: ['https://acme.example'] },
      }),
    );
    await writeFile(path.join(dir, 'system', 'kit.html'), '<!doctype html><h1>Kit</h1>');
  });

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  it('packs every design-system file and injects a generated SKILLS.md', async () => {
    const archive = await buildUserDesignSystemArchive(root, `user:${dirId}`);
    expect(archive).not.toBeNull();
    expect(archive!.title).toBe('Acme Brand');

    const zip = await JSZip.loadAsync(archive!.buffer);
    const names = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .map((entry) => entry.name);

    // Real on-disk content is packed (DESIGN.md + nested system/ file)...
    expect(names).toContain('DESIGN.md');
    expect(names).toContain('system/kit.html');
    // ...plus the injected usage guide...
    expect(names).toContain('SKILLS.md');
    // ...but never the internal metadata.json sidecar.
    expect(names).not.toContain('metadata.json');

    const skills = await zip.file('SKILLS.md')!.async('string');
    expect(skills).toContain('Acme Brand');
    expect(skills).toContain('https://github.com/nexu-io/open-design');
    // Palette quick reference carries the real hex values.
    expect(skills).toContain('#ff5a36');
    // Provenance source link surfaces in the guide.
    expect(skills).toContain('https://acme.example');
  });

  it('returns null for non-user ids (presets are not downloadable here)', async () => {
    expect(await buildUserDesignSystemArchive(root, 'airbnb')).toBeNull();
    expect(await buildUserDesignSystemArchive(root, 'user:does-not-exist')).toBeNull();
  });

  it('never follows a symlink out of the design-system root into the ZIP', async () => {
    // A crafted package drops a symlink that points at a daemon-readable file
    // outside its own directory. The archive must not follow it — otherwise the
    // download becomes an arbitrary-file-read exfiltration path.
    const secret = path.join(root, 'outside-secret.txt');
    await writeFile(secret, 'TOP SECRET DAEMON FILE');
    await symlink(secret, path.join(root, dirId, 'leak.txt'));

    const archive = await buildUserDesignSystemArchive(root, `user:${dirId}`);
    expect(archive).not.toBeNull();

    const zip = await JSZip.loadAsync(archive!.buffer);
    const entries = Object.values(zip.files).filter((entry) => !entry.dir);
    const names = entries.map((entry) => entry.name);

    // The symlink entry itself is excluded...
    expect(names).not.toContain('leak.txt');
    // ...and the secret it pointed at never leaks into any archived file.
    for (const entry of entries) {
      const content = await entry.async('string');
      expect(content).not.toContain('TOP SECRET DAEMON FILE');
    }
  });

  it('does not overwrite a design system that already ships its own SKILLS.md', async () => {
    await writeFile(path.join(root, dirId, 'SKILLS.md'), 'CUSTOM GUIDE');
    const archive = await buildUserDesignSystemArchive(root, `user:${dirId}`);
    const zip = await JSZip.loadAsync(archive!.buffer);
    const skills = await zip.file('SKILLS.md')!.async('string');
    expect(skills).toBe('CUSTOM GUIDE');
  });
});

describe('buildDesignSystemSkillsMarkdown', () => {
  const palette = {
    background: '#ffffff',
    border: '#e6e1d8',
    foreground: '#111111',
    accent: '#ff5a36',
    muted: '#706b65',
    success: '#5d8f5a',
  };

  it('produces an attributed usage guide for the web surface', () => {
    const md = buildDesignSystemSkillsMarkdown({
      title: 'Acme Brand',
      summary: 'A bold developer-tools brand.',
      category: 'Developer Tools',
      surface: 'web',
      palette,
    });
    expect(md).toContain('# How to use the Acme Brand design system');
    expect(md).toContain('A bold developer-tools brand.');
    expect(md).toContain('DESIGN.md');
    expect(md).toContain('landing pages'); // web deliverables framing
    expect(md).toContain('#ff5a36');
    expect(md).toContain('https://github.com/nexu-io/open-design');
  });

  it('frames non-web surfaces with their own deliverables', () => {
    const md = buildDesignSystemSkillsMarkdown({
      title: 'Sonic',
      summary: '',
      category: 'Media',
      surface: 'audio',
      palette,
    });
    expect(md).toContain('audio');
    expect(md).toContain('https://github.com/nexu-io/open-design');
  });
});
