/*
 * generate-selected — turns a maintainer-approved set of YouTube videos into
 * tutorial entries. Run after a human picks numbers from the Feishu digest
 * produced by `notify-candidates.ts`.
 *
 * Usage:
 *   tsx scripts/youtube-tutorials/generate-selected.ts <id|url> [<id|url> ...]
 *
 * Accepts raw 11-char video ids or any YouTube URL. Already-present videos are
 * skipped. The relevance gate is intentionally skipped here — selection is the
 * human review step. Requires YOUTUBE_API_KEY + ANTHROPIC_* (copy generation).
 */
import {
  extractYouTubeId,
  readExistingSlugs,
  readExistingVideoIds,
  writeTutorial,
} from './lib.ts';
import { fetchByIds, loadYoutubeKey } from './youtube.ts';

function extractId(arg: string): string | null {
  const trimmed = arg.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  return extractYouTubeId(trimmed);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length === 0) {
    console.error('Usage: tsx generate-selected.ts <id|url> [<id|url> ...]');
    process.exit(1);
  }

  // Keep unparseable args visible — a pasted typo must not silently disappear.
  const unparseable = args.filter((a) => !extractId(a));
  const ids = [...new Set(args.map(extractId).filter((v): v is string => Boolean(v)))];

  const key = await loadYoutubeKey();
  const existingIds = await readExistingVideoIds();
  const takenSlugs = await readExistingSlugs();

  const fresh = ids.filter((id) => !existingIds.has(id));
  const skipped = ids.filter((id) => existingIds.has(id));
  if (skipped.length) console.log(`Already in catalogue (ok, skipped): ${skipped.join(', ')}`);

  const videos = await fetchByIds(key, fresh);
  // Videos requested but not returned (deleted, private, region-locked, or a bad
  // id) — these are approved selections that would otherwise vanish silently.
  const returnedIds = new Set(videos.map((v) => v.videoId));
  const notFound = fresh.filter((id) => !returnedIds.has(id));

  console.log(`Generating ${videos.length} entr(y/ies)`);
  let ok = 0;
  const writeFailed: string[] = [];
  for (const v of videos) {
    try {
      const slug = await writeTutorial(v, takenSlugs);
      ok++;
      console.log(`  + ${slug} <- ${v.videoId} (${v.author})`);
    } catch (e) {
      writeFailed.push(v.videoId);
      console.error(`  ! write failed ${v.videoId}: ${(e as Error).message}`);
    }
  }

  console.log(`Done: ${ok} written, ${skipped.length} already present`);
  const problems: string[] = [];
  if (unparseable.length) problems.push(`unparseable args: ${unparseable.join(', ')}`);
  if (notFound.length) problems.push(`not found on YouTube: ${notFound.join(', ')}`);
  if (writeFailed.length) problems.push(`write failed: ${writeFailed.join(', ')}`);
  if (problems.length) {
    console.error(`\nNot generated — ${problems.join(' | ')}`);
    process.exitCode = 2;
  }
}

void main();
