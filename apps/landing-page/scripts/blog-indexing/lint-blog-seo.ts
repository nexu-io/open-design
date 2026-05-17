/*
 * lint-blog-seo — source + rendered SEO checks for Open Design blog posts.
 *
 * Usage:
 *   tsx lint-blog-seo.ts [--base <sha> --head <sha>] [--files file1,file2]
 *                        [--rendered-out ../../apps/landing-page/out]
 *
 * Rules are intentionally split into:
 *   - errors: technical/indexability blockers that fail CI
 *   - warnings: editorial quality signals that should be reviewed but
 *     should not block shipping by themselves
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  BLOG_DIR,
  REPO_ROOT,
  assertSafeGitRef,
  fileToSlug,
  git,
  isPostFile,
} from './lib.ts';

interface Args {
  base?: string;
  head: string;
  files?: string[];
  renderedOut?: string;
}

interface Finding {
  file: string;
  level: 'error' | 'warning';
  message: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { head: 'HEAD' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') args.base = argv[++i];
    else if (a === '--head') args.head = argv[++i];
    else if (a === '--files') {
      args.files = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--rendered-out') args.renderedOut = argv[++i];
  }
  return args;
}

function changedFiles(base: string, head: string): string[] {
  const safeBase = assertSafeGitRef(base, 'base');
  const safeHead = assertSafeGitRef(head, 'head');
  const raw = git(`diff --name-only --diff-filter=AM ${safeBase} ${safeHead} -- apps/landing-page/app/content/blog/`);
  return raw.split('\n').filter(Boolean).filter(isPostFile);
}

function allPostFiles(): string[] {
  return readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => `apps/landing-page/app/content/blog/${f}`);
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    data[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: match[2] };
}

function markdownLinks(body: string): Array<{ text: string; href: string }> {
  return Array.from(body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)).map((m) => ({
    text: m[1],
    href: m[2],
  }));
}

function checkRendered(slug: string, renderedOut: string, file: string): Finding[] {
  const htmlPath = path.join(REPO_ROOT, renderedOut, 'blog', slug, 'index.html');
  if (!existsSync(htmlPath)) return [];
  const html = readFileSync(htmlPath, 'utf8');
  const findings: Finding[] = [];
  if (!/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'][^"']+["']/i.test(html)) {
    findings.push({ file, level: 'error', message: 'rendered page has no canonical link' });
  }
  if (!/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>/i.test(html)) {
    findings.push({ file, level: 'error', message: 'rendered page has no Article JSON-LD' });
  }
  if (!/<meta\b[^>]*property=["']og:image["'][^>]*content=["'][^"']+["']/i.test(html)) {
    findings.push({ file, level: 'error', message: 'rendered page has no og:image' });
  }
  if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(html)) {
    findings.push({ file, level: 'error', message: 'rendered page is noindex' });
  }
  return findings;
}

function lintFile(file: string, renderedOut?: string): Finding[] {
  const abs = path.join(REPO_ROOT, file);
  const raw = readFileSync(abs, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  const findings: Finding[] = [];
  const title = data.title ?? '';
  const summary = data.summary ?? '';
  const required = ['title', 'date', 'category', 'readingTime', 'summary'];
  for (const key of required) {
    if (!data[key]) findings.push({ file, level: 'error', message: `missing frontmatter: ${key}` });
  }
  if (title && (title.length < 40 || title.length > 65)) {
    findings.push({
      file,
      level: 'warning',
      message: `title length ${title.length}; target is 40-65 characters`,
    });
  }
  if (summary && (summary.length < 120 || summary.length > 200)) {
    findings.push({
      file,
      level: 'warning',
      message: `summary length ${summary.length}; target is 120-200 characters`,
    });
  }
  const links = markdownLinks(body);
  const internal = links.filter((l) => l.href.startsWith('/blog/') || l.href.startsWith('/skills/') || l.href.startsWith('/systems/') || l.href.startsWith('/craft/'));
  const external = links.filter((l) => /^https?:\/\//.test(l.href));
  if (internal.length < 2) {
    findings.push({
      file,
      level: 'warning',
      message: `only ${internal.length} internal links; target is at least 2`,
    });
  }
  if (external.length < 1) {
    findings.push({ file, level: 'warning', message: 'no external authoritative links found' });
  }
  if (/^#\s+/m.test(body)) {
    findings.push({
      file,
      level: 'error',
      message: 'markdown body contains an H1; route already renders frontmatter title as H1',
    });
  }
  if (/\b(the future of design|AI is replacing designers|unlock your creativity)\b/i.test(body)) {
    findings.push({
      file,
      level: 'warning',
      message: 'body contains a generic/banned blog-factory phrase',
    });
  }
  if (renderedOut) {
    findings.push(...checkRendered(fileToSlug(file), renderedOut, file));
  }
  return findings;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.files
    ? args.files.filter(isPostFile)
    : args.base
      ? changedFiles(args.base, args.head)
      : allPostFiles();

  if (files.length === 0) {
    console.log('No changed blog posts to lint.');
    return;
  }

  const findings = files.flatMap((file) => lintFile(file, args.renderedOut));
  for (const finding of findings) {
    console.log(`${finding.level.toUpperCase()}: ${finding.file}: ${finding.message}`);
  }
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  console.log(
    `Blog SEO lint checked ${files.length} post(s): ${errors.length} error(s), ${warnings.length} warning(s).`,
  );
  if (errors.length > 0) process.exitCode = 1;
}

main();
