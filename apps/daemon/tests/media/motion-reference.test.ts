import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildMotionReference,
  isDownloaderHost,
  MotionReferenceError,
  parseCuts,
  parseProbe,
  pickFrameTimes,
} from '../../src/media/motion-reference.js';

const PROBE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'ref.mp4':
  Duration: 00:00:15.03, start: 0.000000, bitrate: 2102 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080, 1984 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 128 kb/s (default)`;

describe('motion reference parsing', () => {
  it('reads duration, size, fps and audio from the ffmpeg banner', () => {
    expect(parseProbe(PROBE)).toEqual({ durationSec: 15.03, width: 1920, height: 1080, fps: 30, hasAudio: true, hasVideo: true });
    expect(parseProbe(PROBE.replace(/\n.*Audio:.*$/m, '')).hasAudio).toBe(false);
  });

  it('does not take a text file that an older ffmpeg opens as tty for a video', () => {
    const tty = `Input #0, tty, from 'notes.txt':\n  Duration: 00:00:00.04, bitrate: 2 kb/s\n  Stream #0:0: Video: ansi, pal8, 640x400, 25 fps, 25 tbr`;
    expect(parseProbe(tty).hasVideo).toBe(false);
  });

  it('keeps cuts inside the film, drops near-duplicates', () => {
    const log = ['pts_time:0.02', 'pts_time:2.5', 'pts_time:2.6', 'pts_time:6.25', 'pts_time:14.99'].map((t) => `[Parsed_showinfo_1] n:0 ${t} pos`).join('\n');
    expect(parseCuts(log, 15)).toEqual([2.5, 6.25]);
  });

  it('frames every shot and an even grid, never more than 24, all inside the film', () => {
    const times = pickFrameTimes([2.5, 6.25], 15);
    expect(times[0]).toBeLessThanOrEqual(0.3);
    expect(times.some((t) => t >= 2.5 && t < 3)).toBe(true);
    expect(times.some((t) => t >= 6.25 && t < 6.8)).toBe(true);
    expect(Math.max(...times)).toBeLessThan(15);
    expect(pickFrameTimes([], 170).length).toBeLessThanOrEqual(24);
  });
});

describe('buildMotionReference', () => {
  let project = '';
  let server: http.Server;
  let base = '';
  const savedYtDlp = process.env.OD_YTDLP_PATH;
  const savedPath = process.env.PATH;

  // The production fetcher refuses loopback on purpose (SSRF guard); these
  // fixtures serve a video from 127.0.0.1, so they inject a plain fetch.
  const loopbackFetch: import('../../src/media/motion-reference.js').LinkFetcher =
    (url, init) => fetch(url, { ...init, redirect: 'follow' });

  beforeAll(async () => {
    project = await mkdtemp(path.join(os.tmpdir(), 'motion-ref-'));
    // Two 2-second colour shots with a hard cut and a tone: a measurable reference.
    const made = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=red:s=640x360:d=2:r=30',
      '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:d=2:r=30',
      '-f', 'lavfi', '-i', 'sine=f=440:d=4',
      '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(project, 'ref.mp4')]);
    expect(made.status).toBe(0);
    await writeFile(path.join(project, 'notes.txt'), 'not a video');
    server = http.createServer((req, res) => {
      if (req.url === '/clip.mp4') { void readFile(path.join(project, 'ref.mp4')).then((b) => { res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(b); }); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>a post page</html>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // Exercise the no-downloader path: yt-dlp is out of reach.
    delete process.env.OD_YTDLP_PATH;
    process.env.PATH = path.dirname(process.execPath);
  });

  afterAll(async () => {
    if (savedYtDlp === undefined) delete process.env.OD_YTDLP_PATH; else process.env.OD_YTDLP_PATH = savedYtDlp;
    process.env.PATH = savedPath;
    server?.close();
    await rm(project, { recursive: true, force: true });
  });

  it('measures an attached project file into facts, frames and a contact sheet', async () => {
    const r = await buildMotionReference({ projectDir: project, source: 'ref.mp4', id: 'a' });
    expect(r.dir).toBe('.motion-reference/a');
    expect(r.source).toEqual({ kind: 'file', value: 'ref.mp4' });
    expect(r.durationSec).toBeCloseTo(4, 0);
    expect([r.width, r.height, r.fps, r.hasAudio]).toEqual([640, 360, 30, true]);
    expect(r.cuts.some((t) => Math.abs(t - 2) < 0.15)).toBe(true);
    expect(r.frames.length).toBeGreaterThan(2);
    const facts = JSON.parse(await readFile(path.join(project, r.facts), 'utf8'));
    expect(facts.cuts).toEqual(r.cuts);
    expect((await readFile(path.join(project, r.contactSheet))).length).toBeGreaterThan(1000);
    expect(r.audio).toBe('.motion-reference/a/audio.wav');
    expect((await readFile(path.join(project, r.audio!))).length).toBeGreaterThan(100_000);
  });

  it('leaves audio empty for a silent reference', async () => {
    const silent = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=green:s=320x180:d=2:r=30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(project, 'silent.mp4')]);
    expect(silent.status).toBe(0);
    const r = await buildMotionReference({ projectDir: project, source: 'silent.mp4', id: 'g' });
    expect(r.hasAudio).toBe(false);
    expect(r.audio).toBeNull();
  });

  it('downloads a direct video link without a downloader', async () => {
    const r = await buildMotionReference({ projectDir: project, source: `${base}/clip.mp4`, id: 'b', fetchLink: loopbackFetch });
    expect(r.source.kind).toBe('url');
    expect(r.durationSec).toBeCloseTo(4, 0);
  });

  it('still takes a direct video link when a downloader is installed but filters it out', async () => {
    // A direct file link has no page metadata, so yt-dlp rejects it before
    // writing anything. The plain fetch has to pick it up rather than telling
    // the user to upload a file they already linked.
    const fake = path.join(project, 'fake-ytdlp.sh');
    await writeFile(fake, '#!/bin/sh\necho "does not pass filter" >&2\nexit 1\n', { mode: 0o755 });
    process.env.OD_YTDLP_PATH = fake;
    try {
      const r = await buildMotionReference({ projectDir: project, source: `${base}/clip.mp4`, id: 'g2', fetchLink: loopbackFetch });
      expect(r.durationSec).toBeCloseTo(4, 0);
    } finally {
      delete process.env.OD_YTDLP_PATH;
    }
  });

  it('asks for an upload when the link is a web page and no downloader exists', async () => {
    await expect(buildMotionReference({ projectDir: project, source: `${base}/post/1`, id: 'c', fetchLink: loopbackFetch }))
      .rejects.toMatchObject({ code: 'NEEDS_UPLOAD' });
  });

  it('refuses a link that redirects into loopback instead of following it', async () => {
    // The default fetcher is the shared public-address guard: a public URL must
    // not be able to steer the daemon at a host-local service.
    const made = await buildMotionReference({ projectDir: project, source: `${base}/clip.mp4`, id: 'ssrf' })
      .then(() => null, (err: { code?: string }) => err.code ?? 'unknown');
    expect(made).toBe('NEEDS_UPLOAD');
  });

  it('never hands a private or non-video-site link to the downloader', async () => {
    // yt-dlp makes its own requests outside the public-address guard, so a
    // loopback target or an arbitrary page must not reach it at all.
    const marker = path.join(project, 'ytdlp-called');
    const fake = path.join(project, 'spy-ytdlp.sh');
    await writeFile(fake, `#!/bin/sh\ntouch "${marker}"\nexit 1\n`, { mode: 0o755 });
    process.env.OD_YTDLP_PATH = fake;
    try {
      for (const [source, id] of [[`${base}/clip.mp4`, 'p1'], ['http://127.0.0.1:1/watch', 'p2'], ['https://x.com.evil.example/post', 'p3']] as const) {
        await buildMotionReference({ projectDir: project, source, id }).catch(() => null);
      }
      expect(await readFile(marker).then(() => true, () => false)).toBe(false);
    } finally {
      delete process.env.OD_YTDLP_PATH;
    }
    expect(isDownloaderHost('https://x.com/a/status/1')).toBe(true);
    expect(isDownloaderHost('https://www.youtube.com/watch?v=1')).toBe(true);
    expect(isDownloaderHost('https://x.com.evil.example/post')).toBe(false);
    expect(isDownloaderHost('http://127.0.0.1/clip')).toBe(false);
  });

  it('denies the downloader a loopback destination and passes it the proxy', async () => {
    // QA, 2026-10-29: the host allowlist only vetted the entry URL; yt-dlp then
    // followed redirects itself, so a local sink could receive a request before
    // the run ended in NEEDS_UPLOAD. Every downloader connection now goes
    // through an egress proxy that applies the public-address policy.
    let sinkHits = 0;
    const sink = http.createServer((_req, res) => { sinkHits += 1; res.writeHead(200, { 'content-type': 'video/mp4' }); res.end('x'); });
    await new Promise<void>((resolve) => sink.listen(0, '127.0.0.1', resolve));
    const sinkPort = (sink.address() as AddressInfo).port;
    const argsFile = path.join(project, 'ytdlp-args.txt');
    const fake = path.join(project, 'args-ytdlp.sh');
    await writeFile(fake, `#!/bin/sh\nfor a in "$@"; do echo "$a"; done > "${argsFile}"\nexit 1\n`, { mode: 0o755 });
    const { startEgressProxy } = await import('../../src/media/egress-proxy.js');
    const proxy = await startEgressProxy();
    try {
      // CONNECT to a loopback address is refused, and the sink stays untouched.
      const verdict = await new Promise<string>((resolve) => {
        const socket = connect(Number(new URL(proxy.url).port), '127.0.0.1', () => {
          socket.write(`CONNECT 127.0.0.1:${sinkPort} HTTP/1.1\r\nHost: 127.0.0.1:${sinkPort}\r\n\r\n`);
        });
        let reply = '';
        socket.on('data', (chunk) => { reply += chunk.toString('latin1'); });
        socket.on('close', () => resolve(/\b403\b/.test(reply) ? 'blocked' : reply ? 'allowed' : 'closed'));
        socket.on('error', () => resolve('closed'));
        setTimeout(() => { socket.destroy(); resolve(/\b403\b/.test(reply) ? 'blocked' : 'timeout'); }, 3000);
      });
      expect(verdict).toBe('blocked');
      expect(sinkHits).toBe(0);

      // The real download path hands the downloader the proxy, not a bare URL.
      process.env.OD_YTDLP_PATH = fake;
      await buildMotionReference({ projectDir: project, source: 'https://x.com/a/status/1', id: 'sink' }).catch(() => null);
      const args = await readFile(argsFile, 'utf8');
      expect(args).toContain('--proxy');
      // The downloader gets a loopback proxy (its own instance per run), never a
      // bare connection to the caller's URL.
      expect(args).toMatch(/--proxy\nhttp:\/\/127\.0\.0\.1:\d+\n/);
    } finally {
      delete process.env.OD_YTDLP_PATH;
      await proxy.close();
      sink.close();
    }
  });

  it('refuses paths outside the project and non-video files', async () => {
    await expect(buildMotionReference({ projectDir: project, source: '../etc/passwd', id: 'd' })).rejects.toBeInstanceOf(MotionReferenceError);
    await expect(buildMotionReference({ projectDir: project, source: 'notes.txt', id: 'e' })).rejects.toMatchObject({ code: 'NOT_VIDEO' });
  });

  it('works in a brand-new project whose folder does not exist yet', async () => {
    const fresh = path.join(project, 'not-created-yet');
    const r = await buildMotionReference({ projectDir: fresh, source: `${base}/clip.mp4`, id: 'f', fetchLink: loopbackFetch });
    expect(r.durationSec).toBeCloseTo(4, 0);
  });
});
