/*
 * check-blog-url-changes — protects live blog URLs from accidental 404s.
 *
 * Usage:
 *   tsx check-blog-url-changes.ts --base <sha> [--head <sha>]
 *
 * If a blog markdown file is deleted or renamed, the old slug must have
 * an explicit redirect in apps/landing-page/public/_redirects.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  REPO_ROOT,
  assertSafeGitRef,
  fileToSlug,
  git,
  isPostFile,
} from './lib.ts';

interface Args {
  base?: string;
  head: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { head: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--head') args.head = argv[++i];
  }
  return args;
}

function redirectsText(): string {
  const file = path.join(REPO_ROOT, 'apps/landing-page/public/_redirects');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function hasRedirect(redirects: string, oldSlug: string, newSlug?: string): boolean {
  const oldPath = `/blog/${oldSlug}/`;
  const lines = redirects
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return lines.some((line) => {
    const [from, to, status] = line.split(/\s+/);
    if (from !== oldPath) return false;
    if (status !== '301' && status !== '302') return false;
    if (newSlug) return to === `/blog/${newSlug}/`;
    return to.startsWith('/blog/');
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const head = assertSafeGitRef(args.head, 'head');
  const base = assertSafeGitRef(args.base ?? `${head}^`, 'base');
  const raw = git(
    `diff --name-status ${base} ${head} -- apps/landing-page/app/content/blog/`,
  );
  const redirects = redirectsText();
  const failures: string[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    const parts = line.split('\t');
    const status = parts[0];
    if (status.startsWith('R')) {
      const [, oldFile, newFile] = parts;
      if (!oldFile || !newFile || !isPostFile(oldFile)) continue;
      const oldSlug = fileToSlug(oldFile);
      const newSlug = isPostFile(newFile) ? fileToSlug(newFile) : undefined;
      if (!hasRedirect(redirects, oldSlug, newSlug)) {
        failures.push(
          newSlug
            ? `renamed ${oldSlug} -> ${newSlug} but _redirects has no "/blog/${oldSlug}/ /blog/${newSlug}/ 301" entry`
            : `renamed ${oldSlug} out of public blog routes but _redirects has no "/blog/${oldSlug}/ /blog/<target>/ 301" entry`,
        );
      }
    } else if (status === 'D') {
      const [, oldFile] = parts;
      if (!oldFile || !isPostFile(oldFile)) continue;
      const oldSlug = fileToSlug(oldFile);
      if (!hasRedirect(redirects, oldSlug)) {
        failures.push(
          `deleted ${oldSlug} but _redirects has no "/blog/${oldSlug}/ /blog/<target>/ 301" entry`,
        );
      }
    }
  }

  if (failures.length === 0) {
    console.log('Blog URL change guard passed.');
    return;
  }
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

main();
