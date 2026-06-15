/*
 * Vendor the top GitHub contributors' avatars into `public/contributors/`.
 *
 * Why: the contributor orbit around the testimonial globe pulled avatars
 * straight from `avatars.githubusercontent.com` at runtime. That host is slow
 * / flaky from some regions (notably mainland China), so the ring frequently
 * rendered empty. Downloading the avatars at build time and serving them from
 * our own origin makes them load instantly and reliably, with zero cross-border
 * runtime fetch.
 *
 * Output:
 *   public/contributors/<login>.<ext>   — the avatar bitmaps
 *   public/contributors/manifest.json   — [{ handle, href, src }]
 *
 * Re-run to refresh (e.g. before a release):  pnpm vendor:contributors
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'nexu-io/open-design';
const MAX = 16;
const AVATAR_SIZE = 144; // crisp on the ~48px chip at up to 3x DPR
const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/contributors');

interface Contributor {
  login: string;
  avatar_url: string;
  html_url: string;
  type: string;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function main() {
  console.log(`[vendor-contributors] fetching contributors for ${REPO}…`);
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contributors?per_page=60`,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'open-design-build' } },
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
  const all = (await res.json()) as Contributor[];

  const picked = all
    .filter(
      (c) =>
        c &&
        typeof c.login === 'string' &&
        typeof c.avatar_url === 'string' &&
        typeof c.html_url === 'string' &&
        c.type !== 'Bot' &&
        !c.login.endsWith('[bot]'),
    )
    .slice(0, MAX);

  if (picked.length === 0) throw new Error('No usable contributors returned');

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const manifest: { handle: string; href: string; src: string }[] = [];
  for (const c of picked) {
    const sep = c.avatar_url.includes('?') ? '&' : '?';
    const url = `${c.avatar_url}${sep}s=${AVATAR_SIZE}`;
    const img = await fetch(url, { headers: { 'User-Agent': 'open-design-build' } });
    if (!img.ok) {
      console.warn(`[vendor-contributors] skip ${c.login}: avatar ${img.status}`);
      continue;
    }
    const ext = EXT_BY_TYPE[img.headers.get('content-type') ?? ''] ?? 'png';
    const bytes = Buffer.from(await img.arrayBuffer());
    const file = `${c.login}.${ext}`;
    await writeFile(resolve(OUT_DIR, file), bytes);
    manifest.push({ handle: c.login, href: c.html_url, src: `/contributors/${file}` });
    console.log(`[vendor-contributors]  ✓ ${c.login} (${(bytes.length / 1024).toFixed(1)} KB)`);
  }

  await writeFile(
    resolve(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(
    `[vendor-contributors] wrote ${manifest.length} avatars + manifest.json → public/contributors/`,
  );
}

main().catch((err) => {
  console.error('[vendor-contributors] failed:', err.message);
  process.exit(1);
});
