import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { managedYtDlpPath, resolveYtDlp, YT_DLP_VERSION, ytDlpBuild } from '../../src/media/yt-dlp.js';

describe('pinned yt-dlp', () => {
  const dirs: string[] = [];
  const savedPath = process.env.PATH, savedOverride = process.env.OD_YTDLP_PATH;
  afterAll(async () => {
    process.env.PATH = savedPath;
    if (savedOverride === undefined) delete process.env.OD_YTDLP_PATH; else process.env.OD_YTDLP_PATH = savedOverride;
    for (const d of dirs) await rm(d, { recursive: true, force: true });
  });

  it('pins an official release asset for each supported platform', () => {
    expect(ytDlpBuild('darwin', 'arm64')?.url).toBe(`https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_macos`);
    expect(ytDlpBuild('win32', 'x64')?.asset).toBe('yt-dlp.exe');
    expect(ytDlpBuild('linux', 'arm64')?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ytDlpBuild('freebsd', 'x64')).toBeNull();
    expect(managedYtDlpPath('/data/tools', 'darwin')).toBe(`/data/tools/yt-dlp/${YT_DLP_VERSION}/yt-dlp`);
  });

  it('prefers OD_YTDLP_PATH', async () => {
    process.env.OD_YTDLP_PATH = '/opt/custom/yt-dlp';
    expect(await resolveYtDlp(null)).toBe('/opt/custom/yt-dlp');
    delete process.env.OD_YTDLP_PATH;
  });

  it('refuses a download whose checksum does not match, and returns null', async () => {
    process.env.PATH = path.dirname(process.execPath);
    const tools = await mkdtemp(path.join(os.tmpdir(), 'ytdlp-')); dirs.push(tools);
    const fake = Buffer.from('not the real binary');
    expect(createHash('sha256').update(fake).digest('hex')).not.toBe(ytDlpBuild()?.sha256);
    const fetcher = (async () => new Response(fake, { status: 200 })) as typeof fetch;
    expect(await resolveYtDlp(tools, fetcher)).toBeNull();
  });

  it('returns null with no tools dir and none installed', async () => {
    process.env.PATH = path.dirname(process.execPath);
    expect(await resolveYtDlp(null)).toBeNull();
  });
});
