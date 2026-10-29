// yt-dlp is not shipped in the installer. When a user first pastes a video
// link, the daemon fetches the official standalone build for this platform,
// verifies its pinned checksum and keeps it under the runtime data dir. Sites
// change often: bump the version and checksums with an Open Design release.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const YT_DLP_VERSION = '2026.10.21';
const BUILDS: Record<string, { asset: string; sha256: string }> = {
  'darwin-arm64': { asset: 'yt-dlp_macos', sha256: '7a6fe71d7d680f1fb0ac18d4949873d77db2859e90017c0f44bd94b23be4ee40' },
  'darwin-x64': { asset: 'yt-dlp_macos', sha256: '7a6fe71d7d680f1fb0ac18d4949873d77db2859e90017c0f44bd94b23be4ee40' },
  'linux-x64': { asset: 'yt-dlp_linux', sha256: 'd8bd33fca9d5b23bd5b9952b3fca36db5c46331933fda9f598a3da14ce2c243f' },
  'linux-arm64': { asset: 'yt-dlp_linux_aarch64', sha256: 'e137c2171b0b8ef648e6136e86aa70c65923e93e434f01c93901d64744b190aa' },
  'win32-x64': { asset: 'yt-dlp.exe', sha256: '33121d192d706e62f684a06f80918e3f3a8ba52ac3a65213b6951c39c7d9f555' },
};
const MAX_BYTES = 120 * 1024 * 1024;

export function ytDlpBuild(platform: string = process.platform, arch: string = process.arch) {
  const build = BUILDS[`${platform}-${arch}`];
  return build ? { ...build, url: `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/${build.asset}` } : null;
}

export function managedYtDlpPath(toolsDir: string, platform: string = process.platform): string {
  return path.join(toolsDir, 'yt-dlp', YT_DLP_VERSION, platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
}

function runs(executable: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(executable, ['--version'], { stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(false); }, 60_000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

let pending: Promise<string | null> | null = null;

/**
 * The yt-dlp to run: OD_YTDLP_PATH, else one on PATH, else the pinned build
 * (downloaded and checksum-verified once). Null when none can be had, so the
 * caller falls back to direct video links and asks the user to upload.
 */
export async function resolveYtDlp(toolsDir: string | null, fetcher: typeof fetch = fetch): Promise<string | null> {
  const configured = process.env.OD_YTDLP_PATH?.trim();
  if (configured) return configured;
  if (await runs('yt-dlp')) return 'yt-dlp';
  if (!toolsDir) return null;
  const target = managedYtDlpPath(toolsDir);
  if (existsSync(target)) return target;
  pending ??= download(target, fetcher).catch(() => null).finally(() => { pending = null; });
  return pending;
}

async function download(target: string, fetcher: typeof fetch): Promise<string | null> {
  const build = ytDlpBuild();
  if (!build) return null;
  const response = await fetcher(build.url, { signal: AbortSignal.timeout(600_000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`yt-dlp download failed (HTTP ${response.status})`);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('yt-dlp download is larger than expected');
    chunks.push(Buffer.from(chunk));
  }
  const bytes = Buffer.concat(chunks);
  if (createHash('sha256').update(bytes).digest('hex') !== build.sha256) throw new Error('yt-dlp checksum mismatch');
  await mkdir(path.dirname(target), { recursive: true });
  const partial = `${target}.${randomUUID()}.partial`;
  try {
    await writeFile(partial, bytes, { mode: 0o755 });
    await chmod(partial, 0o755);
    await rename(partial, target);
  } finally {
    await rm(partial, { force: true });
  }
  return (await runs(target)) ? target : null;
}
