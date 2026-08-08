import { Readable } from 'node:stream';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { c as createTar } from 'tar';
import { afterEach, describe, expect, it } from 'vitest';

import {
  installSkillFromRemoteSource,
  isSafeSkillArchivePath,
  type SkillArchiveFetcher,
} from '../src/services/skill-installation.js';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

async function archiveFrom(
  setup: (root: string) => Promise<void>,
  entries: string[],
): Promise<Buffer> {
  const root = await tempRoot('od-skill-archive-source-');
  await setup(root);
  const archiveRoot = await tempRoot('od-skill-archive-file-');
  const archivePath = path.join(archiveRoot, 'skill.tgz');
  await createTar({ cwd: root, file: archivePath, gzip: true }, entries);
  return readFile(archivePath);
}

function archiveFetcher(
  archive: Buffer,
  capturedUrls: string[] = [],
): SkillArchiveFetcher {
  return async (url) => {
    capturedUrls.push(url);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      body: Readable.from(archive),
    };
  };
}

async function skillArchive(wrapper = 'repo-main'): Promise<Buffer> {
  return archiveFrom(async (root) => {
    const skillRoot = wrapper ? path.join(root, wrapper) : root;
    await mkdir(path.join(skillRoot, 'assets'), { recursive: true });
    await writeFile(
      path.join(skillRoot, 'SKILL.md'),
      '---\nname: remote-skill\ndescription: Remote fixture\n---\n\n# Workflow\n',
    );
    await writeFile(path.join(skillRoot, 'assets', 'fixture.txt'), 'asset');
  }, wrapper ? [wrapper] : ['SKILL.md', 'assets']);
}

describe('installSkillFromRemoteSource', () => {
  it('installs github:owner/repo through the codeload archive path', async () => {
    const userSkillsRoot = await tempRoot('od-user-skills-');
    const urls: string[] = [];
    const result = await installSkillFromRemoteSource(
      userSkillsRoot,
      'github:owner/skill-repo',
      { fetcher: archiveFetcher(await skillArchive(), urls) },
    );

    expect(result).toMatchObject({ ok: true, id: 'remote-skill' });
    expect(urls).toEqual(['https://codeload.github.com/owner/skill-repo/tar.gz/HEAD']);
    expect(
      await readFile(path.join(userSkillsRoot, 'remote-skill', 'assets', 'fixture.txt'), 'utf8'),
    ).toBe('asset');
  });

  it('installs a browser GitHub URL from the repo-named skill in a multi-skill repository', async () => {
    const archive = await archiveFrom(async (root) => {
      const repositoryRoot = path.join(root, 'taste-skill-main');
      const defaultSkillRoot = path.join(repositoryRoot, 'skills', 'taste-skill');
      const siblingSkillRoot = path.join(repositoryRoot, 'skills', 'other-skill');
      await mkdir(path.join(defaultSkillRoot, 'assets'), { recursive: true });
      await mkdir(siblingSkillRoot, { recursive: true });
      await writeFile(
        path.join(defaultSkillRoot, 'SKILL.md'),
        '---\nname: design-taste-frontend\ndescription: Default taste skill\n---\n\n# Workflow\n',
      );
      await writeFile(path.join(defaultSkillRoot, 'assets', 'fixture.txt'), 'default asset');
      await writeFile(
        path.join(siblingSkillRoot, 'SKILL.md'),
        '---\nname: other-skill\ndescription: Sibling fixture\n---\n\n# Other workflow\n',
      );
    }, ['taste-skill-main']);
    const userSkillsRoot = await tempRoot('od-user-skills-');
    const urls: string[] = [];

    const result = await installSkillFromRemoteSource(
      userSkillsRoot,
      'https://github.com/leonxlnx/taste-skill',
      { fetcher: archiveFetcher(archive, urls) },
    );

    expect(result).toMatchObject({ ok: true, id: 'design-taste-frontend' });
    expect(urls).toEqual([
      'https://codeload.github.com/leonxlnx/taste-skill/tar.gz/HEAD',
    ]);
    await expect(
      readFile(
        path.join(userSkillsRoot, 'design-taste-frontend', 'assets', 'fixture.txt'),
        'utf8',
      ),
    ).resolves.toBe('default asset');
  });

  it('fails closed when a multi-skill repository has no unique repo-named default', async () => {
    const archive = await archiveFrom(async (root) => {
      for (const name of ['alpha-skill', 'beta-skill']) {
        const skillRoot = path.join(root, 'collection-main', 'skills', name);
        await mkdir(skillRoot, { recursive: true });
        await writeFile(
          path.join(skillRoot, 'SKILL.md'),
          `---\nname: ${name}\ndescription: fixture\n---\n\n# Workflow\n`,
        );
      }
    }, ['collection-main']);

    const result = await installSkillFromRemoteSource(
      await tempRoot('od-user-skills-'),
      'https://github.com/owner/collection',
      { fetcher: archiveFetcher(archive) },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_MANIFEST',
      error: expect.stringContaining('skills/collection/SKILL.md'),
    });
  });

  it('installs an HTTPS .tar.gz archive with SKILL.md at its root', async () => {
    const userSkillsRoot = await tempRoot('od-user-skills-');
    const result = await installSkillFromRemoteSource(
      userSkillsRoot,
      'https://downloads.example/remote-skill.tar.gz',
      { fetcher: archiveFetcher(await skillArchive('')) },
    );

    expect(result).toMatchObject({ ok: true, id: 'remote-skill' });
  });

  it.each([
    'file:///tmp/skill.tgz',
    'http://downloads.example/skill.tgz',
    'https://downloads.example/skill.zip',
    'github:owner/../repo',
    'https://github.com/owner/repo/issues',
    'https://owner@github.com/owner/repo',
    'https://github.com/owner/repo?tab=readme',
    'https://github.com.evil/owner/repo',
  ])('rejects an unsafe or unsupported source: %s', async (source) => {
    const result = await installSkillFromRemoteSource(
      await tempRoot('od-user-skills-'),
      source,
      { fetcher: archiveFetcher(await skillArchive()) },
    );

    expect(result).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('surfaces an understandable network failure', async () => {
    const result = await installSkillFromRemoteSource(
      await tempRoot('od-user-skills-'),
      'https://downloads.example/missing.tgz',
      {
        fetcher: async () => ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          body: null,
        }),
      },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'FETCH_FAILED',
      error: expect.stringContaining('404 Not Found'),
    });
  });

  it('reuses the plugin downloader SSRF guard for private archive addresses', async () => {
    const result = await installSkillFromRemoteSource(
      await tempRoot('od-user-skills-'),
      'https://127.0.0.1/internal-skill.tgz',
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'FETCH_FAILED',
      error: expect.stringMatching(/private address/i),
    });
  });

  it('rejects an archive without SKILL.md', async () => {
    const archive = await archiveFrom(async (root) => {
      await mkdir(path.join(root, 'repo-main'), { recursive: true });
      await writeFile(path.join(root, 'repo-main', 'README.md'), '# no manifest');
    }, ['repo-main']);
    const result = await installSkillFromRemoteSource(
      await tempRoot('od-user-skills-'),
      'https://downloads.example/no-manifest.tgz',
      { fetcher: archiveFetcher(archive) },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_MANIFEST',
      error: expect.stringContaining('SKILL.md'),
    });
  });

  it('refuses a duplicate skill id instead of overwriting it', async () => {
    const userSkillsRoot = await tempRoot('od-user-skills-');
    const archive = await skillArchive();
    const first = await installSkillFromRemoteSource(
      userSkillsRoot,
      'https://downloads.example/remote-skill.tgz',
      { fetcher: archiveFetcher(archive) },
    );
    const second = await installSkillFromRemoteSource(
      userSkillsRoot,
      'https://downloads.example/remote-skill.tgz',
      { fetcher: archiveFetcher(archive) },
    );

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      error: expect.stringContaining('already installed'),
    });
  });

  it('detects a duplicate id even when a legacy install uses a different folder name', async () => {
    const userSkillsRoot = await tempRoot('od-user-skills-');
    const legacyRoot = path.join(userSkillsRoot, 'legacy-repository-name');
    await mkdir(legacyRoot, { recursive: true });
    await writeFile(
      path.join(legacyRoot, 'SKILL.md'),
      '---\nname: remote-skill\ndescription: Existing fixture\n---\n\n# Existing\n',
    );

    const result = await installSkillFromRemoteSource(
      userSkillsRoot,
      'https://downloads.example/remote-skill.tgz',
      { fetcher: archiveFetcher(await skillArchive()) },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      error: expect.stringContaining('already installed'),
    });
  });

  it('rejects archives containing symbolic links', async () => {
    const archive = await archiveFrom(async (root) => {
      const skillRoot = path.join(root, 'repo-main');
      await mkdir(skillRoot, { recursive: true });
      await writeFile(
        path.join(skillRoot, 'SKILL.md'),
        '---\nname: linked-skill\ndescription: fixture\n---\nbody\n',
      );
      await symlink('/etc/hosts', path.join(skillRoot, 'escape'));
    }, ['repo-main']);
    const result = await installSkillFromRemoteSource(
      await tempRoot('od-user-skills-'),
      'https://downloads.example/linked-skill.tgz',
      { fetcher: archiveFetcher(archive) },
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'INVALID_ARCHIVE',
      error: expect.stringContaining('link'),
    });
  });
});

describe('isSafeSkillArchivePath', () => {
  it.each(['../escape', '/absolute', 'safe/../../escape', 'safe\\..\\escape'])(
    'rejects traversal path %s',
    (entry) => {
      expect(isSafeSkillArchivePath(entry)).toBe(false);
    },
  );

  it('accepts a normal nested archive path', () => {
    expect(isSafeSkillArchivePath('repo-main/assets/example.txt')).toBe(true);
  });
});
