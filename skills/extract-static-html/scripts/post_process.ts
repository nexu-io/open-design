#!/usr/bin/env npx tsx
/**
 * post_process.ts — Inline local images as base64 in extracted HTML files.
 *
 * Scans HTML files for local image references (src attributes and CSS url()
 * values) and replaces them with inline base64 data URIs. Uses a robust
 * character-by-character CSS url() parser instead of regex.
 *
 * Usage:
 *   npx tsx post_process.ts .stitch/home.html --base-dir my-app
 *   npx tsx post_process.ts .stitch/page1.html .stitch/page2.html --base-dir .
 *   npx tsx post_process.ts .stitch/*.html --base-dir . --json
 *
 * Flags:
 *   --base-dir   Base directory for resolving relative paths
 *   --json       Output machine-readable JSON stats
 *   --dry-run    Report what would be inlined without modifying files
 *   --max-size   Max file size to inline in bytes (default: 5242880 / 5MB)
 */

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// MIME type mapping
// ---------------------------------------------------------------------------
const MIME_MAP: Record<string, string> = {
  '.svg': 'image/svg+xml',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.apng': 'image/apng',
  '.cur': 'image/x-icon',
};

function getMime(filePath: string): string {
  return MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Opts {
  files: string[];
  baseDir: string;
  json: boolean;
  dryRun: boolean;
  maxSize: number;
}

interface CssUrlRef {
  url: string;
  fullMatch: string;
  start: number;
  end: number;
}

interface InlineStats {
  srcInlined: number;
  urlInlined: number;
  skippedTooLarge: Array<{ path: string; size: number }>;
  skippedNotFound: string[];
}

interface FileStats {
  file: string;
  srcInlined: number;
  urlInlined: number;
  skippedNotFound: number;
  skippedTooLarge: number;
  sizeBytes: number;
}

interface AllStats {
  files: FileStats[];
  totalSrcInlined: number;
  totalUrlInlined: number;
  totalSkippedNotFound: number;
  totalSkippedTooLarge: number;
}

// ---------------------------------------------------------------------------
// Argument parsing & validation
// ---------------------------------------------------------------------------
function parseArgs(): Opts {
  const args = process.argv.slice(2);
  const opts: Opts = {
    files: [],
    baseDir: '',
    json: false,
    dryRun: false,
    maxSize: 5 * 1024 * 1024, // 5MB
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base-dir':
        opts.baseDir = args[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--max-size':
        opts.maxSize = parseInt(args[++i], 10);
        break;
      case '--help':
        console.log(`
Usage: npx tsx post_process.ts <html_file> [...] [options]

Options:
  --base-dir   Base directory for resolving relative paths
  --json       Output machine-readable JSON stats
  --dry-run    Report what would be inlined without modifying files
  --max-size   Max file size to inline in bytes (default: 5242880 / 5MB)
`);
        process.exit(0);
      default:
        opts.files.push(args[i]);
    }
  }

  return opts;
}

function validateOpts(opts: Opts): void {
  const errors: string[] = [];

  if (opts.files.length === 0) {
    errors.push('No HTML files specified');
  }

  if (opts.baseDir && !fs.existsSync(opts.baseDir)) {
    errors.push(`Base directory not found: ${opts.baseDir}`);
  }

  if (isNaN(opts.maxSize) || opts.maxSize < 1) {
    errors.push('--max-size must be a positive integer');
  }

  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Robust CSS url() parser — character-by-character (no regex)
// ---------------------------------------------------------------------------
function extractCssUrls(text: string): CssUrlRef[] {
  const results: CssUrlRef[] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    if (
      i + 3 < len &&
      text[i].toLowerCase() === 'u' &&
      text[i + 1].toLowerCase() === 'r' &&
      text[i + 2].toLowerCase() === 'l' &&
      text[i + 3] === '('
    ) {
      const urlStart = i;
      i += 4;

      // Skip whitespace
      while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;

      let quote: string | null = null;
      if (i < len && (text[i] === '"' || text[i] === "'")) {
        quote = text[i];
        i++;
      }

      let url = '';
      if (quote) {
        while (i < len && text[i] !== quote) {
          if (text[i] === '\\' && i + 1 < len) {
            i++;
            url += text[i];
          } else {
            url += text[i];
          }
          i++;
        }
        if (i < len) i++;
      } else {
        while (i < len && text[i] !== ')' && text[i] !== ' ' && text[i] !== '\t' && text[i] !== '\n') {
          url += text[i];
          i++;
        }
      }

      while (i < len && (text[i] === ' ' || text[i] === '\t' || text[i] === '\n' || text[i] === '\r')) i++;

      if (i < len && text[i] === ')') {
        const fullMatch = text.substring(urlStart, i + 1);
        results.push({ url: url.trim(), fullMatch, start: urlStart, end: i + 1 });
        i++;
      } else {
        i = urlStart + 1;
      }
    } else {
      i++;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Local path resolution
// ---------------------------------------------------------------------------
function resolveLocalFile(localPath: string, baseDir: string): string | null {
  const candidates = [localPath];
  if (baseDir) {
    candidates.push(path.join(baseDir, localPath.replace(/^\//, '')));
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Permission errors, etc. — skip
    }
  }
  return null;
}

/**
 * Atomically open, stat, and read a file using a file descriptor.
 * Eliminates TOCTOU race conditions by performing all operations on the
 * same fd, ensuring the file cannot change between the size check and read.
 * Returns null if the file cannot be opened (e.g., deleted between resolve and open).
 */
function readFileAtomic(
  filePath: string,
  maxSize: number,
): { size: number; mime: string; b64: string } | { size: number; tooLarge: true } | null {
  let fd: number;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch {
    // File was removed or became inaccessible between resolve and open
    return null;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (stat.size > maxSize) {
      return { size: stat.size, tooLarge: true };
    }
    const mime = getMime(filePath);
    const b64 = fs.readFileSync(fd).toString('base64');
    return { size: stat.size, mime, b64 };
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Check if a path is a local (non-remote, non-data) reference.
 */
function isLocalPath(url: string): boolean {
  return (
    !!url &&
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    !url.startsWith('data:') &&
    !url.startsWith('//')
  );
}

// ---------------------------------------------------------------------------
// Inline images in HTML
// ---------------------------------------------------------------------------
function inlineImages(
  html: string,
  baseDir: string,
  maxSize: number,
  dryRun: boolean,
): { html: string; stats: InlineStats } {
  const stats: InlineStats = {
    srcInlined: 0,
    urlInlined: 0,
    skippedTooLarge: [],
    skippedNotFound: [],
  };

  // --- Inline src="<local_path>" attributes ---
  // Handle src, poster, data attributes
  const srcAttrs = ['src', 'poster', 'data'];
  for (const attr of srcAttrs) {
    const regex = new RegExp(`${attr}="((?!https?:\\/\\/|data:|\\/\\/)[^"]+)"`, 'g');
    html = html.replace(regex, (match: string, localPath: string) => {
      const resolved = resolveLocalFile(localPath, baseDir);
      if (!resolved) {
        if (!localPath.endsWith('.js') && !localPath.endsWith('.css')) {
          stats.skippedNotFound.push(localPath);
        }
        return match;
      }

      const result = readFileAtomic(resolved, maxSize);
      if (!result) {
        stats.skippedNotFound.push(localPath);
        return match;
      }
      if ('tooLarge' in result) {
        stats.skippedTooLarge.push({ path: localPath, size: result.size });
        return match;
      }

      if (dryRun) {
        stats.srcInlined++;
        return match;
      }

      stats.srcInlined++;
      return `${attr}="data:${result.mime};base64,${result.b64}"`;
    });
  }

  // --- Inline CSS url() with local paths (using robust parser) ---
  const urlRefs = extractCssUrls(html);
  const localUrlRefs = urlRefs.filter((ref) => isLocalPath(ref.url));

  // Process from end to preserve indices
  const sorted = [...localUrlRefs].sort((a, b) => b.start - a.start);
  for (const ref of sorted) {
    const resolved = resolveLocalFile(ref.url, baseDir);
    if (!resolved) {
      stats.skippedNotFound.push(ref.url);
      continue;
    }

    const result = readFileAtomic(resolved, maxSize);
    if (!result) {
      stats.skippedNotFound.push(ref.url);
      continue;
    }
    if ('tooLarge' in result) {
      stats.skippedTooLarge.push({ path: ref.url, size: result.size });
      continue;
    }

    if (dryRun) {
      stats.urlInlined++;
      continue;
    }

    html =
      html.substring(0, ref.start) +
      `url('data:${result.mime};base64,${result.b64}')` +
      html.substring(ref.end);
    stats.urlInlined++;
  }

  // --- Inline SVG <image href="..."> and xlink:href ---
  const svgHrefRegex = /(href|xlink:href)="((?!https?:\/\/|data:|\/\/)[^"]+)"/g;
  html = html.replace(svgHrefRegex, (match: string, attrName: string, localPath: string) => {
    // Skip non-image hrefs (like <a href>)
    if (!localPath.match(/\.(svg|png|jpg|jpeg|gif|webp|avif|bmp|ico)$/i)) {
      return match;
    }

    const resolved = resolveLocalFile(localPath, baseDir);
    if (!resolved) {
      stats.skippedNotFound.push(localPath);
      return match;
    }

    const result = readFileAtomic(resolved, maxSize);
    if (!result) {
      stats.skippedNotFound.push(localPath);
      return match;
    }
    if ('tooLarge' in result) {
      stats.skippedTooLarge.push({ path: localPath, size: result.size });
      return match;
    }

    if (dryRun) {
      stats.srcInlined++;
      return match;
    }

    stats.srcInlined++;
    return `${attrName}="data:${result.mime};base64,${result.b64}"`;
  });

  return { html, stats };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): void {
  const opts = parseArgs();
  validateOpts(opts);

  const allStats: AllStats = {
    files: [],
    totalSrcInlined: 0,
    totalUrlInlined: 0,
    totalSkippedNotFound: 0,
    totalSkippedTooLarge: 0,
  };

  if (opts.dryRun) {
    console.log('🔍 DRY RUN — no files will be modified\n');
  }

  for (const file of opts.files) {
    // Open file once with r+ to eliminate TOCTOU race between read and write.
    // A single fd is used for both operations, so the file cannot be swapped
    // between the read and write phases.
    let fd: number;
    try {
      fd = fs.openSync(file, opts.dryRun ? 'r' : 'r+');
    } catch {
      console.warn(`⚠️  File not found, skipping: ${file}`);
      continue;
    }

    let processed: string = '';
    let stats: InlineStats = { srcInlined: 0, urlInlined: 0, skippedTooLarge: [], skippedNotFound: [] };
    try {
      const html = fs.readFileSync(fd, 'utf-8');

      const result = inlineImages(html, opts.baseDir, opts.maxSize, opts.dryRun);
      processed = result.html;
      stats = result.stats;

      if (!opts.dryRun) {
        // Truncate and rewrite using the same fd — no second path-based open
        fs.ftruncateSync(fd);
        fs.writeSync(fd, processed, 0, 'utf-8');
      }
    } finally {
      fs.closeSync(fd);
    }

    const totalInlined = stats.srcInlined + stats.urlInlined;
    const label = opts.dryRun ? 'would inline' : 'inlined';
    console.log(
      `${file}: ${label} ${totalInlined} resources ` +
        `(${stats.srcInlined} src, ${stats.urlInlined} url()) ` +
        `— ${processed.length.toLocaleString()} bytes`,
    );

    if (stats.skippedTooLarge.length > 0) {
      for (const s of stats.skippedTooLarge) {
        console.log(
          `   ⚠️  Skipped (too large: ${(s.size / 1024).toFixed(1)} KB): ${s.path}`,
        );
      }
    }

    allStats.files.push({
      file,
      srcInlined: stats.srcInlined,
      urlInlined: stats.urlInlined,
      skippedNotFound: stats.skippedNotFound.length,
      skippedTooLarge: stats.skippedTooLarge.length,
      sizeBytes: processed.length,
    });
    allStats.totalSrcInlined += stats.srcInlined;
    allStats.totalUrlInlined += stats.urlInlined;
    allStats.totalSkippedNotFound += stats.skippedNotFound.length;
    allStats.totalSkippedTooLarge += stats.skippedTooLarge.length;
  }

  const totalInlined = allStats.totalSrcInlined + allStats.totalUrlInlined;
  console.log(`\n✅ Total: ${totalInlined} resources inlined across ${allStats.files.length} file(s)`);

  if (allStats.totalSkippedTooLarge > 0) {
    console.log(`   ⚠️  ${allStats.totalSkippedTooLarge} skipped (exceeded ${(opts.maxSize / 1024 / 1024).toFixed(1)} MB limit)`);
  }

  if (opts.json) {
    console.log('\n--- JSON Stats ---');
    console.log(JSON.stringify(allStats, null, 2));
  }
}

main();
