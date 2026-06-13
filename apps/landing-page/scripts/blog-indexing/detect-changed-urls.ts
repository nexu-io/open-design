/*
 * detect-changed-urls — emit canonical URLs for blog posts ADDED or
 * MODIFIED in `${BASE}..${HEAD}`.
 *
 *   Usage: tsx detect-changed-urls.ts --base <sha> [--head <sha>] [--out file.json]
 *   Default base: `${HEAD}^`. Default head: HEAD. Default out: stdout.
 *
 * Output JSON shape:
 *
 *   {
 *     "head": "<sha>",
 *     "base": "<sha>",
 *     "addedUrls": ["https://open-design.ai/blog/foo/"],
 *     "modifiedUrls": ["https://open-design.ai/blog/bar/"]
 *   }
 *
 * Underscore-prefixed files (e.g. `_topics.md`) are excluded — they
 * never become routes.
 */
import { writeFileSync } from 'node:fs';
import {
  assertSafeGitRef,
  blogSlugToUrl,
  fileToSlug,
  git,
  isPostFile,
} from './lib.ts';

interface Args {
  base?: string;
  head: string;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { head: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') args.base = argv[++i];
    else if (a === '--head') args.head = argv[++i];
    else if (a === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const { base: baseArg, head, out } = parseArgs(process.argv.slice(2));
  const safeHead = assertSafeGitRef(head, 'head');
  const base = assertSafeGitRef(baseArg ?? `${safeHead}^`, 'base');

  // git diff --name-status emits lines like:
  //   A\tapps/landing-page/app/content/blog/foo.md
  //   M\tapps/landing-page/app/content/blog/bar.md
  //   D\tapps/landing-page/app/content/blog/old.md
  //   R100\tapps/landing-page/app/content/blog/old.md\tapps/landing-page/app/content/blog/new.md
  const raw = git(
    `diff --name-status ${base} ${safeHead} -- apps/landing-page/app/content/blog/`,
  );
  const added: string[] = [];
  const modified: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const [status, file, newFile] = line.split('\t');
    const targetFile = status?.startsWith('R') ? newFile : file;
    if (!status || !targetFile || !isPostFile(targetFile)) continue;
    const url = blogSlugToUrl(fileToSlug(targetFile));
    if (status === 'A' || status.startsWith('R')) added.push(url);
    else if (status === 'M') modified.push(url);
  }

  const result = {
    head: git(`rev-parse ${safeHead}`),
    base: git(`rev-parse ${base}`),
    addedUrls: added,
    modifiedUrls: modified,
  };
  const json = JSON.stringify(result, null, 2);
  if (out) writeFileSync(out, json + '\n');
  else process.stdout.write(json + '\n');
}

main();
