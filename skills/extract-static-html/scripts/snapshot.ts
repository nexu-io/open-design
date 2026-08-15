#!/usr/bin/env npx tsx
/**
 * snapshot.ts — Production-grade Puppeteer-based full-page HTML snapshot
 *
 * Captures the fully rendered DOM from a running web application and produces
 * a self-contained HTML file with all CSS inlined and images converted to
 * base64 data URIs. Works with any framework (React, Vue, Svelte, Angular,
 * plain HTML, etc.) — no MockPage.jsx needed.
 *
 * Usage:
 *   npx tsx snapshot.ts --url http://localhost:5173 --output .stitch/home.html
 *   npx tsx snapshot.ts --url http://localhost:3000/pricing --output .stitch/pricing.html --html-class dark
 *   npx tsx snapshot.ts --url http://localhost:5173 --output .stitch/page.html --wait 5000 --viewport 1440x900
 *
 * Flags:
 *   --url           URL to capture (required)
 *   --output        Output file path (required)
 *   --wait          Extra wait time in ms after network idle (default: 1000)
 *   --viewport      Viewport size as WIDTHxHEIGHT (default: 1280x800)
 *   --html-class    Class(es) to add to <html> element (e.g., "dark")
 *   --remove-fixed  Remove fixed/sticky positioned elements (e.g., cookie banners)
 *   --full-height   Capture full scrollable content by resizing viewport to scrollHeight
 *   --title         Override the page title
 *   --timeout       Global timeout in ms (default: 60000)
 *   --concurrency   Max concurrent resource fetches (default: 6)
 *   --json          Output machine-readable JSON stats to stdout
 */

import puppeteer, { type Browser } from 'puppeteer';
import path from 'node:path';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Opts {
  url: string | null;
  output: string | null;
  wait: number;
  viewport: string;
  htmlClass: string | null;
  removeFixed: boolean;
  fullHeight: boolean;
  title: string | null;
  authScript: string | null;
  inlineCanvas: boolean;
  timeout: number;
  concurrency: number;
  json: boolean;
  inlineFonts: boolean;
  removeSelectors: string | null;
  click: string | null;
}

interface Stats {
  url: string | null;
  output: string | null;
  sizeBytes: number;
  stylesheets: number;
  images: number;
  cssUrls: number;
  svgImages: number;
  videoPoster: number;
  favicons: number;
  scriptsRemoved: number;
  warnings: string[];
  durationMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------
function parseArgs(): Opts {
  const args = process.argv.slice(2);
  const opts: Opts = {
    url: null,
    output: null,
    wait: 1000,
    viewport: '1280x800',
    htmlClass: null,
    removeFixed: false,
    fullHeight: false,
    title: null,
    authScript: null,
    inlineCanvas: false,
    timeout: 60000,
    concurrency: 6,
    json: false,
    inlineFonts: false,
    removeSelectors: null,
    click: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        opts.url = args[++i];
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--wait':
        opts.wait = parseInt(args[++i], 10);
        break;
      case '--viewport':
        opts.viewport = args[++i];
        break;
      case '--html-class':
        opts.htmlClass = args[++i];
        break;
      case '--remove-fixed':
        opts.removeFixed = true;
        break;
      case '--full-height':
        opts.fullHeight = true;
        break;
      case '--title':
        opts.title = args[++i];
        break;
      case '--auth-script':
        opts.authScript = args[++i];
        break;
      case '--inline-canvas':
        opts.inlineCanvas = true;
        break;
      case '--timeout':
        opts.timeout = parseInt(args[++i], 10);
        break;
      case '--concurrency':
        opts.concurrency = parseInt(args[++i], 10);
        break;
      case '--json':
        opts.json = true;
        break;
      case '--inline-fonts':
        opts.inlineFonts = true;
        break;
      case '--remove-selectors':
        opts.removeSelectors = args[++i];
        break;
      case '--click':
        opts.click = args[++i];
        break;
      case '--help':
        console.log(`
Usage: npx tsx snapshot.ts --url <URL> --output <FILE> [options]

Options:
  --url           URL to capture (required)
  --output        Output file path (required)
  --wait          Extra wait time in ms after network idle (default: 1000)
  --viewport      Viewport size as WIDTHxHEIGHT (default: 1280x800)
  --html-class    Class(es) to add to <html> element (e.g., "dark")
  --remove-fixed  Remove fixed/sticky positioned elements (cookie banners, etc.)
  --full-height   Resize viewport to capture full scrollable content
  --title         Override the page title
  --auth-script   Path to JS/TS script exporting an async function to authenticate before capture
  --inline-canvas Convert <canvas> elements (charts, graphs) to base64 images
  --timeout       Global timeout in ms (default: 60000)
  --concurrency   Max concurrent resource fetches (default: 6)
  --json          Output machine-readable JSON stats
`);
        process.exit(0);
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
function validateOpts(opts: Opts): void {
  const errors: string[] = [];

  if (!opts.url) errors.push('--url is required');
  if (!opts.output) errors.push('--output is required');

  if (opts.url) {
    try {
      new URL(opts.url);
    } catch {
      errors.push(
        `Invalid URL: "${opts.url}". Must be a valid URL (e.g., http://localhost:5173)`,
      );
    }
  }

  if (opts.viewport) {
    const vpMatch = opts.viewport.match(/^(\d+)x(\d+)$/);
    if (!vpMatch) {
      errors.push(
        `Invalid viewport: "${opts.viewport}". Must be WIDTHxHEIGHT (e.g., 1280x800)`,
      );
    } else {
      const w = Number(vpMatch[1]);
      const h = Number(vpMatch[2]);
      if (w < 1 || h < 1) {
        errors.push('Viewport dimensions must be positive integers');
      }
      if (w > 7680 || h > 4320) {
        errors.push('Viewport too large: max 7680x4320');
      }
    }
  }

  if (isNaN(opts.wait) || opts.wait < 0) {
    errors.push('--wait must be a non-negative integer');
  }

  if (isNaN(opts.timeout) || opts.timeout < 1000) {
    errors.push('--timeout must be at least 1000ms');
  }

  if (isNaN(opts.concurrency) || opts.concurrency < 1 || opts.concurrency > 20) {
    errors.push('--concurrency must be between 1 and 20');
  }

  if (opts.output) {
    const outputDir = path.dirname(path.resolve(opts.output));
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      fs.accessSync(outputDir, fs.constants.W_OK);
    } catch (e: unknown) {
      errors.push(`Cannot write to output directory: ${(e as Error).message}`);
    }
  }

  if (errors.length > 0) {
    console.error('❌ Validation errors:');
    errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main snapshot logic
// ---------------------------------------------------------------------------
async function snapshot(opts: Opts): Promise<void> {
  const [, widthStr, heightStr] = opts.viewport.match(/^(\d+)x(\d+)$/)!;
  const width = Number(widthStr);
  const height = Number(heightStr);

  let browser: Browser | undefined;
  let globalTimer: ReturnType<typeof setTimeout> | undefined;

  // Stats tracking
  const stats: Stats = {
    url: opts.url,
    output: null,
    sizeBytes: 0,
    stylesheets: 0,
    images: 0,
    cssUrls: 0,
    svgImages: 0,
    videoPoster: 0,
    favicons: 0,
    scriptsRemoved: 0,
    warnings: [],
    durationMs: 0,
  };
  const startTime = Date.now();

  try {
    // Global timeout safety net — prevents zombie browser processes
    globalTimer = setTimeout(() => {
      const msg = `Global timeout of ${opts.timeout}ms exceeded — aborting`;
      console.error(`⏰ ${msg}`);
      stats.warnings.push(msg);
      if (browser) browser.close().catch(() => {});
      if (opts.json) {
        stats.durationMs = Date.now() - startTime;
        stats.error = msg;
        console.log(JSON.stringify(stats, null, 2));
      }
      process.exit(2);
    }, opts.timeout);

    // ----- Launch browser -----
    console.log('🚀 Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--window-size=${width},${height}`,
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height });

    // Forward browser console logs to Node.js
    page.on('console', (msg) => {
      const type = msg.type().toString();
      if (type === 'warning' || type === 'error') {
        console.log(`   [Browser ${type.toUpperCase()}] ${msg.text()}`);
      }
    });

    // ----- Navigate and wait for network idle -----
    console.log(`📄 Navigating to ${opts.url}...`);
    try {
      await page.goto(opts.url!, {
        waitUntil: 'networkidle0',
        timeout: 10000,
      });
    } catch {
      const msg = 'networkidle0 timed out, falling back to networkidle2';
      console.warn(`⚠️  ${msg}...`);
      stats.warnings.push(msg);
      try {
        await page.goto(opts.url!, {
          waitUntil: 'networkidle2',
          timeout: 10000,
        });
      } catch {
        const msg2 = 'networkidle2 timed out, falling back to domcontentloaded';
        console.warn(`⚠️  ${msg2}...`);
        stats.warnings.push(msg2);
        await page.goto(opts.url!, {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
      }
    }

    // Extra wait for JS-rendered content (animations, lazy loading, etc.)
    if (opts.wait > 0) {
      console.log(`⏳ Waiting ${opts.wait}ms for rendering to settle...`);
      await new Promise((r) => setTimeout(r, opts.wait));
    }

    // Execute authentication script if provided
    if (opts.authScript) {
      console.log(`🔐 Running authentication script from ${opts.authScript}...`);
      try {
        const path = await import('path');
        const authPath = path.resolve(process.cwd(), opts.authScript);
        const authModule = await import(authPath);
        const authFn = authModule.default || authModule;
        if (typeof authFn === 'function') {
          await authFn(page);
          console.log('   ✅ Auth script executed, re-navigating to target URL...');
          await page.goto(opts.url!, {
            waitUntil: 'networkidle2',
            timeout: Math.min(30000, opts.timeout),
          });
          if (opts.wait > 0) {
            await new Promise((r) => setTimeout(r, opts.wait));
          }
        } else {
          console.warn(`⚠️  --auth-script (${opts.authScript}) did not export a function`);
        }
      } catch (err: any) {
        console.warn(`⚠️  Failed to execute --auth-script: ${err.message}`);
        stats.warnings.push(`auth-script error: ${err.message}`);
      }
    }

    // Perform click interaction if specified
    if (opts.click) {
      console.log(`🖱️ Clicking element "${opts.click}"...`);
      try {
        let element = await page.$(opts.click);
        if (!element) {
          // Search in child frames recursively!
          for (const frame of page.frames()) {
            const childElement = await frame.$(opts.click);
            if (childElement) {
              element = childElement;
              console.log(`   Found element inside child frame: ${frame.url()}`);
              break;
            }
          }
        }

        if (element) {
          await element.click();
          // wait an extra 2 seconds for animation or modal loading to settle
          console.log(`   Click succeeded! Waiting 2000ms for click action to settle...`);
          await new Promise((r) => setTimeout(r, 2000));
        } else {
          throw new Error(`Selector "${opts.click}" not found in main document or child frames.`);
        }
      } catch (clickErr: any) {
        console.error(`⚠️ Click action failed:`, clickErr);
        stats.warnings.push(`Click action failed: ${clickErr.message || clickErr}`);
      }
    }

    // ----- Pre-processing options -----

    // Add class to <html> (e.g., dark mode)
    if (opts.htmlClass) {
      console.log(`🎨 Adding class "${opts.htmlClass}" to <html>...`);
      await page.evaluate((cls: string) => {
        document.documentElement.classList.add(...cls.split(/\s+/));
        if (cls.includes('dark')) {
          document.documentElement.setAttribute('data-theme', 'dark');
        } else if (cls.includes('light')) {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      }, opts.htmlClass);
      await new Promise((r) => setTimeout(r, 500));
    }

    // Remove fixed/sticky elements
    if (opts.removeFixed) {
      console.log('🧹 Removing fixed/sticky positioned elements...');
      await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const style = getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') {
            const rect = el.getBoundingClientRect();
            if (rect.top > 100 || rect.height < 50) {
              el.remove();
            }
          }
        }
      });
    }

    // Remove custom selectors
    if (opts.removeSelectors) {
      console.log(`🧹 Removing custom selectors: "${opts.removeSelectors}"...`);
      await page.evaluate((selectors: string) => {
        const items = selectors.split(',').map((s) => s.trim()).filter(Boolean);
        for (const selector of items) {
          try {
            document.querySelectorAll(selector).forEach((el) => el.remove());
          } catch (e) {
            console.warn(`Invalid selector "${selector}":`, e);
          }
        }
      }, opts.removeSelectors);
    }



    // Override title
    if (opts.title) {
      await page.evaluate((t: string) => {
        document.title = t;
      }, opts.title);
    }

    // ----- Inject shared browser-side helpers (deduplication) -----
    // Mock __name to prevent esbuild generated code from failing in browser
    await page.evaluate(() => {
      (window as any).__name = (fn: any, name: string) => fn;
    });

    await page.evaluate((concurrency: number) => {
      (window as any).__snapshot = {
        CONCURRENCY: concurrency,

        toDataUri: async (url: string): Promise<string | null> => {
          try {
            const resp = await fetch(url, {
              mode: 'cors',
              credentials: 'same-origin',
            });
            if (!resp.ok) return null;
            const blob = await resp.blob();
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            });
          } catch {
            return null;
          }
        },

        processInBatches: async <T, R>(
          items: T[],
          batchSize: number,
          fn: (item: T) => Promise<R>,
        ): Promise<(R | null)[]> => {
          const results: (R | null)[] = [];
          for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(batch.map(fn));
            results.push(
              ...batchResults.map((r) =>
                r.status === 'fulfilled' ? r.value : null,
              ),
            );
          }
          return results;
        },

        /**
         * Robust CSS url() parser — character-by-character parsing instead of regex.
         * Handles: quoted/unquoted values, escaped characters, whitespace,
         * data URIs, and malformed url() tokens.
         *
         * Returns: Array of { url, fullMatch, start, end }
         */
        extractCssUrls: (cssText: string) => {
          const results: Array<{ url: string; fullMatch: string; start: number; end: number }> = [];
          let i = 0;
          const len = cssText.length;

          while (i < len) {
            // Look for 'url(' — case insensitive
            if (
              i + 3 < len &&
              cssText[i].toLowerCase() === 'u' &&
              cssText[i + 1].toLowerCase() === 'r' &&
              cssText[i + 2].toLowerCase() === 'l' &&
              cssText[i + 3] === '('
            ) {
              const urlStart = i;
              i += 4; // skip 'url('

              // Skip whitespace
              while (
                i < len &&
                (cssText[i] === ' ' ||
                  cssText[i] === '\t' ||
                  cssText[i] === '\n' ||
                  cssText[i] === '\r')
              ) {
                i++;
              }

              // Check for quote
              let quote: string | null = null;
              if (i < len && (cssText[i] === '"' || cssText[i] === "'")) {
                quote = cssText[i];
                i++;
              }

              // Read the URL value
              let url = '';
              if (quote) {
                // Quoted: read until matching unescaped quote
                while (i < len && cssText[i] !== quote) {
                  if (cssText[i] === '\\' && i + 1 < len) {
                    i++; // skip backslash
                    url += cssText[i]; // include next char literally
                  } else {
                    url += cssText[i];
                  }
                  i++;
                }
                if (i < len) i++; // skip closing quote
              } else {
                // Unquoted: stop at ) or whitespace (per CSS spec)
                while (
                  i < len &&
                  cssText[i] !== ')' &&
                  cssText[i] !== ' ' &&
                  cssText[i] !== '\t' &&
                  cssText[i] !== '\n' &&
                  cssText[i] !== '\r'
                ) {
                  url += cssText[i];
                  i++;
                }
              }

              // Skip trailing whitespace before ')'
              while (
                i < len &&
                (cssText[i] === ' ' ||
                  cssText[i] === '\t' ||
                  cssText[i] === '\n' ||
                  cssText[i] === '\r')
              ) {
                i++;
              }

              if (i < len && cssText[i] === ')') {
                const fullMatch = cssText.substring(urlStart, i + 1);
                results.push({
                  url: url.trim(),
                  fullMatch,
                  start: urlStart,
                  end: i + 1,
                });
                i++;
              } else {
                // Malformed url() — skip past 'url(' and try again
                i = urlStart + 1;
              }
            } else {
              i++;
            }
          }

          return results;
        },

        /**
         * Replace CSS url() references using pre-computed positions.
         * Replaces from end-to-start to preserve earlier indices.
         */
        replaceCssUrls: (
          cssText: string,
          replacements: Array<{ start: number; end: number; dataUri: string }>,
        ): string => {
          const sorted = [...replacements].sort((a, b) => b.start - a.start);
          for (const r of sorted) {
            cssText =
              cssText.substring(0, r.start) +
              "url('" +
              r.dataUri +
              "')" +
              cssText.substring(r.end);
          }
          return cssText;
        },
      };
    }, opts.concurrency);

    // -----------------------------------------------------------------------
    // -2. Remove dev-overlay / screenshot-ignore elements (e.g. VeloUI)
    // -----------------------------------------------------------------------
    const removedCount = await page.evaluate(() => {
      let count = 0;
      // Remove any element explicitly marked as screenshot-ignore
      document.querySelectorAll('[data-screenshot-ignore="true"]').forEach(el => {
        el.parentNode?.removeChild(el); count++;
      });
      // Remove VeloUI overlay elements (pause overlay, probe, root container, etc.)
      const veloSelectors = [
        '[data-veloui-pause-overlay]',
        '[data-veloui-probe]',
        '[data-veloui-extractor]',
        '[data-veloui-scan]',
        '.veloui-root',
        '.veloui-liquid-glass',
      ];
      for (const sel of veloSelectors) {
        document.querySelectorAll(sel).forEach(el => {
          el.parentNode?.removeChild(el); count++;
        });
      }
      return count;
    });
    if (removedCount > 0) {
      console.log(`🧹 Removed ${removedCount} dev-overlay / screenshot-ignore element(s) from the DOM.`);
    }

    // -----------------------------------------------------------------------
    // -1. Inline local iframes (e.g., companion-app test iframe)
    // -----------------------------------------------------------------------
    const iframesCount = await page.evaluate(() => document.querySelectorAll('iframe').length);
    if (iframesCount > 0) {
      console.log(`🔍 Found ${iframesCount} iframe(s) in the main page. Extracting content natively...`);

      // First, recursively inline all same-origin and srcDoc iframes browser-side
      console.log('🔍 Inlining same-origin and srcDoc iframes recursively...');
      await page.evaluate(() => {
        const inlineSameOriginIframes = (root: Document | HTMLElement) => {
          const iframes = Array.from(root.querySelectorAll('iframe'));
          for (const iframe of iframes) {
            if (
              iframe.getAttribute('data-screenshot-ignore') === 'true' ||
              iframe.getAttribute('data-veloui-scan') === 'true' ||
              iframe.getAttribute('data-veloui-probe') === 'true' ||
              iframe.hasAttribute('data-veloui-extractor')
            ) {
              // Remove the hidden crawler/scan iframes completely from DOM
              try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch { }
              continue;
            }
            try {
              const doc = iframe.contentDocument || iframe.contentWindow?.document;
              if (doc && doc.body) {
                // Recursively inline same-origin iframes inside this child frame first
                inlineSameOriginIframes(doc);

                const bodyHtml = doc.body.innerHTML;

                const styles: string[] = [];
                doc.querySelectorAll('style').forEach(s => styles.push(s.outerHTML));
                doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => styles.push((l as HTMLLinkElement).outerHTML));

                styles.forEach(styleHtml => {
                  const temp = document.createElement('div');
                  temp.innerHTML = styleHtml;
                  document.head.appendChild(temp.firstChild!);
                });

                const wrapper = document.createElement('div');
                wrapper.className = 'ac-iframe-inlined-wrapper';

                // Apply child body's classes and attributes to same-origin wrapper
                for (const attr of Array.from(doc.body.attributes)) {
                  if (attr.name === 'class') {
                    wrapper.classList.add(...attr.value.split(/\s+/).filter(Boolean));
                  } else if (attr.name !== 'style') {
                    wrapper.setAttribute(attr.name, attr.value);
                  }
                }

                wrapper.style.position = 'absolute';
                wrapper.style.top = '0';
                wrapper.style.left = '0';
                wrapper.style.width = '100%';
                wrapper.style.height = '100%';
                wrapper.style.overflow = 'hidden';
                wrapper.innerHTML = bodyHtml;

                iframe.parentNode!.replaceChild(wrapper, iframe);
              }
            } catch (e) {
              // Ignore cross-origin iframes; the Puppeteer frame loop will process them
            }
          }
        };
        inlineSameOriginIframes(document);
      });

      const childFrames = page.frames()
        .filter(f => f !== page.mainFrame())
        .map(f => {
          let depth = 0;
          let p = f.parentFrame();
          while (p) {
            depth++;
            p = p.parentFrame();
          }
          return { frame: f, depth };
        })
        .sort((a, b) => b.depth - a.depth);

      for (const { frame } of childFrames) {
        try {
          const frameUrl = frame.url();
          const cleanUrl = frameUrl.split('?')[0].split('#')[0];
          console.log(`📦 Extracting frame content from: ${cleanUrl} (depth: ${frame.parentFrame() ? 'nested' : 'root'})`);

          // Inject __name mock to prevent esbuild helper ReferenceError in child frame
          await frame.evaluate(() => {
            (window as any).__name = (fn: any) => fn;
          });

          // Resolve all relative assets inside the frame to absolute URLs relative to the frame's URL
          await frame.evaluate((base) => {
            const resolveAttr = (el: Element, attr: string) => {
              const val = el.getAttribute(attr);
              if (val && !val.startsWith('data:') && !val.startsWith('http:') && !val.startsWith('https:') && !val.startsWith('//')) {
                try {
                  const abs = new URL(val, base).href;
                  el.setAttribute(attr, abs);
                } catch (e) { }
              }
            };
            document.querySelectorAll('img[src]').forEach(img => resolveAttr(img, 'src'));
            document.querySelectorAll('img[srcset]').forEach(img => resolveAttr(img, 'srcset'));
            document.querySelectorAll('source[srcset]').forEach(src => resolveAttr(src, 'srcset'));
            document.querySelectorAll('link[rel="stylesheet"]').forEach(link => resolveAttr(link, 'href'));

            // Resolve relative url() references in inline <style> tags
            document.querySelectorAll('style').forEach((styleEl) => {
              if (styleEl.textContent) {
                styleEl.textContent = styleEl.textContent.replace(/url\(['"]?([^'")\s]+)['"]?\)/gi, (match, url) => {
                  if (
                    url.startsWith('data:') ||
                    url.startsWith('http:') ||
                    url.startsWith('https:') ||
                    url.startsWith('//')
                  ) {
                    return match;
                  }
                  try {
                    return `url('${new URL(url, base).href}')`;
                  } catch {
                    return match;
                  }
                });
              }
            });
          }, frameUrl);

          const frameStyles = await frame.evaluate(() => {
            const stylesList: string[] = [];
            document.querySelectorAll('style').forEach(s => stylesList.push(s.outerHTML));
            document.querySelectorAll('link[rel="stylesheet"]').forEach(l => stylesList.push((l as HTMLLinkElement).outerHTML));
            return stylesList;
          });

          const frameBodyHtml = await frame.evaluate(() => document.body.innerHTML);
          const frameBodyAttrs = await frame.evaluate(() => {
            const attrs: Record<string, string> = {};
            for (const attr of Array.from(document.body.attributes)) {
              attrs[attr.name] = attr.value;
            }
            return attrs;
          });
          const frameHtmlAttrs = await frame.evaluate(() => {
            const attrs: Record<string, string> = {};
            for (const attr of Array.from(document.documentElement.attributes)) {
              attrs[attr.name] = attr.value;
            }
            return attrs;
          });

          const parent = frame.parentFrame();
          if (parent) {
            await parent.evaluate((url, bodyHtml, styles, bodyAttrs, htmlAttrs) => {
              styles.forEach(styleHtml => {
                const temp = document.createElement('div');
                temp.innerHTML = styleHtml;
                document.head.appendChild(temp.firstChild!);
              });

              // Apply child html attributes to parent documentElement (e.g., data-theme)
              for (const [name, val] of Object.entries(htmlAttrs)) {
                if (name !== 'style') {
                  document.documentElement.setAttribute(name, val);
                }
              }

              const iframes = Array.from(document.querySelectorAll('iframe'));
              for (const iframe of iframes) {
                if (
                  iframe.getAttribute('data-screenshot-ignore') === 'true' ||
                  iframe.getAttribute('data-veloui-scan') === 'true' ||
                  iframe.getAttribute('data-veloui-probe') === 'true' ||
                  iframe.hasAttribute('data-veloui-extractor')
                ) {
                  try { iframe.parentNode && iframe.parentNode.removeChild(iframe); } catch { }
                  continue;
                }
                const cleanIframeSrc = iframe.src.split('?')[0].split('#')[0];
                if (cleanIframeSrc && (url.includes(cleanIframeSrc) || cleanIframeSrc.includes(url))) {
                  const wrapper = document.createElement('div');
                  wrapper.className = 'ac-iframe-inlined-wrapper';

                  // Apply child body's classes and attributes to the wrapper
                  for (const [name, val] of Object.entries(bodyAttrs)) {
                    if (name === 'class') {
                      wrapper.classList.add(...val.split(/\s+/).filter(Boolean));
                    } else if (name !== 'style') {
                      wrapper.setAttribute(name, val);
                    }
                  }

                  wrapper.style.position = 'absolute';
                  wrapper.style.top = '0';
                  wrapper.style.left = '0';
                  wrapper.style.width = '100%';
                  wrapper.style.height = '100%';
                  wrapper.style.overflow = 'hidden';
                  wrapper.innerHTML = bodyHtml;
                  iframe.parentNode!.replaceChild(wrapper, iframe);
                  break;
                }
              }
            }, cleanUrl, frameBodyHtml, frameStyles, frameBodyAttrs, frameHtmlAttrs);
          }

        } catch (frameErr) {
          console.warn('Failed to extract child frame content:', frameErr);
        }
      }
    }

    // Resize viewport to full scroll height (executed after iframe contents are natively merged)
    if (opts.fullHeight) {
      console.log('📐 Scanning DOM for maximum scrollable container height...');

      const maxScrollHeight = await page.evaluate(() => {
        let maxVal = document.documentElement.scrollHeight;
        const all = document.querySelectorAll('*');
        for (const el of all) {
          const style = getComputedStyle(el);
          if (style.overflow === 'auto' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflowY === 'scroll') {
            if (el.scrollHeight > maxVal) {
              maxVal = el.scrollHeight;
            }
          }
        }
        return maxVal;
      });

      // Resize viewport to the true maximum scroll height (plus 120px buffer for safety)
      const finalViewportHeight = maxScrollHeight + 120;
      console.log(`📐 Resizing viewport to maximum content height: ${finalViewportHeight}px`);
      await page.setViewport({ width, height: finalViewportHeight });

      // Force layout wrappers and scrollable containers to unlock their heights
      await page.evaluate(() => {
        document.documentElement.style.setProperty('height', 'auto', 'important');
        document.documentElement.style.setProperty('overflow', 'visible', 'important');
        document.body.style.setProperty('height', 'auto', 'important');
        document.body.style.setProperty('overflow', 'visible', 'important');

        const elements = document.querySelectorAll('*');
        for (const el of elements) {
          const style = getComputedStyle(el);
          const hasViewportHeight = style.height.includes('vh') ||
            style.height.includes('svh') ||
            style.height === '100%' ||
            style.height === '100vh' ||
            style.height === '100svh' ||
            style.maxHeight.includes('vh') ||
            style.maxHeight.includes('svh') ||
            style.maxHeight === '100%' ||
            el.classList.contains('h-svh') ||
            el.classList.contains('h-screen') ||
            el.classList.contains('ac-iframe-inlined-wrapper') ||
            el.classList.contains('ac-iframe');

          if (hasViewportHeight) {
            (el as HTMLElement).style.setProperty('height', 'auto', 'important');
            (el as HTMLElement).style.setProperty('min-height', '0', 'important');
            (el as HTMLElement).style.setProperty('max-height', 'none', 'important');
          }

          if (style.overflow === 'auto' || style.overflowY === 'auto' || style.overflow === 'scroll' || style.overflowY === 'scroll') {
            (el as HTMLElement).style.setProperty('height', 'auto', 'important');
            (el as HTMLElement).style.setProperty('max-height', 'none', 'important');
            (el as HTMLElement).style.setProperty('overflow', 'visible', 'important');
            (el as HTMLElement).style.setProperty('position', 'relative', 'important');
          }
        }
      });

      await new Promise((r) => setTimeout(r, 1000));
    }



    if (opts.inlineCanvas) {
      console.log('📊 Converting <canvas> elements to base64 images...');
      const canvasCount = await page.evaluate(() => {
        let count = 0;
        document.querySelectorAll('canvas').forEach((canvas) => {
          try {
            const dataUrl = canvas.toDataURL('image/png');
            const img = document.createElement('img');
            img.src = dataUrl;
            img.className = canvas.className;
            img.style.cssText = canvas.style.cssText;
            if (canvas.id) img.id = canvas.id;
            canvas.replaceWith(img);
            count++;
          } catch (e) {
            // Tainted canvas or security error
          }
        });
        return count;
      });
      console.log(`   ✅ Converted ${canvasCount} canvas element(s)`);
    }

    // -----------------------------------------------------------------------
    // 0. Materialize all rules from document.styleSheets into DOM
    // -----------------------------------------------------------------------
    // In modern dev servers (e.g. Vite dev mode with Tailwind) and CSS-in-JS
    // libraries, stylesheets are injected dynamically into CSSOM without being
    // serialized as clean text in <style> textContent. Additionally, Vite HMR
    // injects <style> tags containing JS client import syntax that break CSS
    // parsers. This step extracts all rules across all document.styleSheets,
    // cleans up dev HMR style tags, and injects a unified style bundle.
    console.log('🎨 Capturing all CSSOM rules from document.styleSheets...');
    const cssomCount = await page.evaluate(() => {
      let totalRules = 0;
      let extraCssText = '/* --- EXTRACTED CSSOM BUNDLE --- */\n';
      const extractedNodes = new Set<Node>();
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          let sheetCss = '';
          for (const rule of Array.from(sheet.cssRules)) {
            sheetCss += rule.cssText + '\n';
            totalRules++;
          }
          if (sheetCss.trim().length > 0) {
            extraCssText += sheetCss + '\n';
            if (sheet.ownerNode) {
              extractedNodes.add(sheet.ownerNode);
            }
          }
        } catch (e) {
          // Ignore cross-origin stylesheet security errors
        }
      }
      if (extraCssText.trim().length > 0) {
        // Only remove <style data-vite-dev-id> and <link rel="stylesheet"> whose CSSOM rules we successfully captured
        document.querySelectorAll('style[data-vite-dev-id], link[rel="stylesheet"]').forEach(el => {
          if (extractedNodes.has(el) || el.hasAttribute('data-vite-dev-id')) {
            el.remove();
          }
        });
        // Remove any <style> tag containing Vite HMR client syntax (createHotContext / import.meta.hot)
        document.querySelectorAll('style').forEach(el => {
          if (el.textContent && (el.textContent.includes('createHotContext') || el.textContent.includes('import.meta.hot'))) {
            el.remove();
          }
        });
        // Remove relative font preload links that cause 404 errors in static viewers
        document.querySelectorAll('link[rel="preload"][as="font"]').forEach(el => el.remove());
        const combinedStyle = document.createElement('style');
        combinedStyle.id = 'extracted-cssom-bundle';
        combinedStyle.textContent = extraCssText;
        document.head.appendChild(combinedStyle);
      }
      return totalRules;
    });
    console.log(`   ✅ Captured ${cssomCount} rules from document.styleSheets`);

    // -----------------------------------------------------------------------
    // 1. Inline all external stylesheets as <style> blocks
    // -----------------------------------------------------------------------
    console.log('🎨 Inlining external stylesheets...');
    stats.stylesheets = await page.evaluate(async () => {
      const { toDataUri, extractCssUrls, replaceCssUrls } = (window as any).__snapshot;
      let count = 0;
      const links = Array.from(
        document.querySelectorAll('link[rel="stylesheet"]'),
      ) as HTMLLinkElement[];

      for (const link of links) {
        try {
          const href = link.href;
          if (!href) continue;

          const resp = await fetch(href);
          if (!resp.ok) continue;

          let cssText = await resp.text();

          // Resolve relative url() references to absolute URLs using the parser
          const baseUrl = new URL(href);
          const urlRefs = extractCssUrls(cssText);
          const replacements: Array<{ start: number; end: number; dataUri: string }> = [];

          for (const ref of urlRefs) {
            // Skip absolute URLs, data URIs, and protocol-relative URLs
            if (
              ref.url.startsWith('data:') ||
              ref.url.startsWith('http:') ||
              ref.url.startsWith('https:') ||
              ref.url.startsWith('//')
            ) {
              continue;
            }
            try {
              const absUrl = new URL(ref.url, baseUrl).href;
              replacements.push({
                start: ref.start,
                end: ref.end,
                dataUri: absUrl, // Not a data URI yet — just resolved to absolute
              });
            } catch {
              // Malformed URL — skip
            }
          }

          if (replacements.length > 0) {
            cssText = replaceCssUrls(cssText, replacements);
          }

          const style = document.createElement('style');
          style.textContent = cssText;
          if (link.media && link.media !== 'all') {
            style.setAttribute('media', link.media);
          }
          link.parentNode!.replaceChild(style, link);
          count++;
        } catch (e) {
          console.warn(`Failed to inline stylesheet: ${link.href}`, e);
        }
      }
      return count;
    });
    console.log(`   ✅ Inlined ${stats.stylesheets} stylesheets`);

    // -----------------------------------------------------------------------
    // 2. Inline images with concurrency (img, srcset, source, background-image)
    // -----------------------------------------------------------------------
    console.log('🖼️  Inlining images as base64...');
    stats.images = await page.evaluate(async () => {
      const { toDataUri, processInBatches, CONCURRENCY } = (window as any).__snapshot;
      let count = 0;

      // --- <img src="..."> ---
      const images = Array.from(document.querySelectorAll('img[src]')) as HTMLImageElement[];
      await processInBatches(images, CONCURRENCY, async (img: HTMLImageElement) => {
        const src = img.src;
        if (!src || src.startsWith('data:')) return;
        const dataUri = await toDataUri(src);
        if (dataUri) {
          img.setAttribute('src', dataUri);
          count++;
        }
      });

      // --- <img srcset="..."> ---
      const imgsWithSrcset = Array.from(
        document.querySelectorAll('img[srcset]'),
      ) as HTMLImageElement[];
      for (const img of imgsWithSrcset) {
        const srcset = img.getAttribute('srcset');
        if (!srcset) continue;
        const parts = srcset.split(',').map((s: string) => s.trim());
        const newParts: string[] = [];

        await processInBatches(parts, CONCURRENCY, async (part: string) => {
          const [url, ...descriptors] = part.split(/\s+/);
          if (url.startsWith('data:')) {
            newParts.push(part);
            return;
          }
          const dataUri = await toDataUri(url);
          if (dataUri) {
            newParts.push([dataUri, ...descriptors].join(' '));
            count++;
          }
          // If fetch fails, drop — inlined src is the fallback
        });

        if (newParts.length > 0) {
          img.setAttribute('srcset', newParts.join(', '));
        } else {
          img.removeAttribute('srcset');
        }
      }

      // --- <source srcset="..."> ---
      const sources = Array.from(
        document.querySelectorAll('source[srcset]'),
      ) as HTMLSourceElement[];
      for (const source of sources) {
        const srcset = source.getAttribute('srcset');
        if (!srcset || srcset.startsWith('data:')) continue;
        const parts = srcset.split(',').map((s: string) => s.trim());
        const newParts: string[] = [];

        await processInBatches(parts, CONCURRENCY, async (part: string) => {
          const [url, ...descriptors] = part.split(/\s+/);
          if (url.startsWith('data:')) {
            newParts.push(part);
            return;
          }
          const dataUri = await toDataUri(url);
          if (dataUri) {
            newParts.push([dataUri, ...descriptors].join(' '));
            count++;
          }
        });

        if (newParts.length > 0) {
          source.setAttribute('srcset', newParts.join(', '));
        } else {
          source.remove();
        }
      }

      // --- Inline ALL background-image url() in inline styles (handles multiple) ---
      const styledElements = Array.from(
        document.querySelectorAll('[style]'),
      ) as HTMLElement[];
      for (const el of styledElements) {
        const style = el.getAttribute('style');
        if (!style || !style.includes('url(')) continue;

        // Use matchAll to handle multiple url() references
        const urlPattern =
          /url\(['"]?(https?:\/\/[^'"\)\s]+)['"]?\)/g;
        const matches = [...style.matchAll(urlPattern)];
        if (matches.length === 0) continue;

        let newStyle = style;
        // Process in reverse order to preserve string positions
        for (let i = matches.length - 1; i >= 0; i--) {
          const m = matches[i];
          const dataUri = await toDataUri(m[1]);
          if (dataUri) {
            newStyle =
              newStyle.substring(0, m.index!) +
              "url('" +
              dataUri +
              "')" +
              newStyle.substring(m.index! + m[0].length);
            count++;
          }
        }
        el.setAttribute('style', newStyle);
      }

      return count;
    });
    console.log(`   ✅ Inlined ${stats.images} images`);

    // -----------------------------------------------------------------------
    // 3. Inline CSS url() references in <style> blocks (using parser)
    // -----------------------------------------------------------------------
    console.log('🔗 Inlining CSS url() references in <style> blocks...');
    stats.cssUrls = await page.evaluate(async (inlineFonts) => {
      const {
        toDataUri,
        processInBatches,
        extractCssUrls,
        replaceCssUrls,
        CONCURRENCY,
      } = (window as any).__snapshot;
      let count = 0;

      /** Check if a URL points to a font file (skip external fonts — too large, not visual) */
      const isFontFile = (url: string): boolean => {
        const isSameOrigin = url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith(window.location.origin);
        if (isSameOrigin) return false;
        return /\.(woff2?|ttf|eot|otf)(\?|$)/i.test(url);
      }

      const styles = Array.from(document.querySelectorAll('style')) as HTMLStyleElement[];
      for (const styleEl of styles) {
        let css = styleEl.textContent!;
        const urlRefs = extractCssUrls(css);

        // Filter to http(s), same-origin, or relative URLs that aren't external fonts
        const toInline = urlRefs.filter(
          (ref: any) =>
            (ref.url.startsWith('http://') ||
              ref.url.startsWith('https://') ||
              ref.url.startsWith('/') ||
              ref.url.startsWith('./') ||
              ref.url.startsWith('../')) &&
            (!isFontFile(ref.url) || inlineFonts),
        );

        if (toInline.length === 0) continue;

        // Fetch all URLs concurrently
        const fetched: Array<{ start: number; end: number; dataUri: string }> = [];
        await processInBatches(toInline, CONCURRENCY, async (ref: any) => {
          const dataUri = await toDataUri(ref.url);
          if (dataUri) {
            fetched.push({ start: ref.start, end: ref.end, dataUri });
            count++;
          }
        });

        if (fetched.length > 0) {
          css = replaceCssUrls(css, fetched);
          styleEl.textContent = css;
        }
      }
      return count;
    }, opts.inlineFonts);
    console.log(`   ✅ Inlined ${stats.cssUrls} CSS url() references`);

    // -----------------------------------------------------------------------
    // 4. Inline additional resource types (SVG, video, favicons)
    // -----------------------------------------------------------------------
    console.log('🔗 Inlining additional resources (SVG, video, favicons)...');
    const additionalStats = await page.evaluate(async () => {
      const { toDataUri, processInBatches, CONCURRENCY } = (window as any).__snapshot;
      const stats = { svgImages: 0, videoPoster: 0, favicons: 0 };

      // --- SVG <image href="..."> and <image xlink:href="..."> ---
      const svgImages = Array.from(document.querySelectorAll('image')) as SVGImageElement[];
      await processInBatches(svgImages, CONCURRENCY, async (img: SVGImageElement) => {
        // Check both href and xlink:href
        const href =
          img.getAttribute('href') ||
          img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
        if (!href || href.startsWith('data:')) return;
        const dataUri = await toDataUri(href);
        if (dataUri) {
          // Set both for compatibility
          if (img.hasAttribute('href')) img.setAttribute('href', dataUri);
          if (
            img.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')
          ) {
            img.setAttributeNS(
              'http://www.w3.org/1999/xlink',
              'href',
              dataUri,
            );
          }
          stats.svgImages++;
        }
      });

      // --- <video poster="..."> ---
      const videos = Array.from(
        document.querySelectorAll('video[poster]'),
      ) as HTMLVideoElement[];
      await processInBatches(videos, CONCURRENCY, async (video: HTMLVideoElement) => {
        const poster = video.getAttribute('poster');
        if (!poster || poster.startsWith('data:')) return;
        const dataUri = await toDataUri(poster);
        if (dataUri) {
          video.setAttribute('poster', dataUri);
          stats.videoPoster++;
        }
      });

      // --- <link rel="icon"> and <link rel="apple-touch-icon"> favicons ---
      const favicons = Array.from(
        document.querySelectorAll(
          'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
        ),
      ) as HTMLLinkElement[];
      await processInBatches(favicons, CONCURRENCY, async (link: HTMLLinkElement) => {
        const href = link.href;
        if (!href || href.startsWith('data:')) return;
        const dataUri = await toDataUri(href);
        if (dataUri) {
          link.setAttribute('href', dataUri);
          stats.favicons++;
        }
      });

      // --- <object data="..."> ---
      const objects = Array.from(
        document.querySelectorAll('object[data]'),
      ) as HTMLObjectElement[];
      await processInBatches(objects, CONCURRENCY, async (obj: HTMLObjectElement) => {
        const data = obj.getAttribute('data');
        if (!data || data.startsWith('data:')) return;
        // Only inline small objects (SVGs, etc.) — skip large ones
        try {
          const resp = await fetch(data);
          if (!resp.ok) return;
          const contentLength = resp.headers.get('content-length');
          if (contentLength && Number(contentLength) > 500000) return; // Skip >500KB
          const blob = await resp.blob();
          const dataUri: string | null = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
          if (dataUri) {
            obj.setAttribute('data', dataUri);
          }
        } catch {
          // Skip failed objects
        }
      });

      return stats;
    });

    stats.svgImages = additionalStats.svgImages;
    stats.videoPoster = additionalStats.videoPoster;
    stats.favicons = additionalStats.favicons;

    const additionalTotal =
      stats.svgImages + stats.videoPoster + stats.favicons;
    console.log(
      `   ✅ Inlined ${additionalTotal} additional resources ` +
        `(${stats.svgImages} SVG, ${stats.videoPoster} video posters, ${stats.favicons} favicons)`,
    );

    // -----------------------------------------------------------------------
    // 5. Remove all <script> tags and dev-tool overlays
    // -----------------------------------------------------------------------
    console.log('🗑️  Removing <script> tags and dev overlays...');
    stats.scriptsRemoved = await page.evaluate(() => {
      // Remove all scripts
      const scripts = Array.from(document.querySelectorAll('script'));
      scripts.forEach((s) => s.remove());

      // Remove framework-specific dev overlays
      const devSelectors = [
        // Vite
        'vite-error-overlay',
        // Next.js
        '[data-nextjs-dialog-overlay]',
        'nextjs-portal',
        // Webpack/CRA
        '#webpack-dev-server-client-overlay',
        '#webpack-dev-server-client-overlay-div',
        // Parcel
        '[data-parcel-error-overlay]',
        // Nuxt
        '[data-v-inspector]',
      ];

      for (const selector of devSelectors) {
        document
          .querySelectorAll(selector)
          .forEach((el) => el.remove());
      }

      // Remove noscript tags
      document.querySelectorAll('noscript').forEach((el) => el.remove());

      return scripts.length;
    });
    console.log(`   ✅ Removed ${stats.scriptsRemoved} scripts`);

    // -----------------------------------------------------------------------
    // 6. Clean up injected helpers
    // -----------------------------------------------------------------------
    await page.evaluate(() => {
      delete (window as any).__snapshot;
    });

    // -----------------------------------------------------------------------
    // 7. Extract the final HTML and write output
    // -----------------------------------------------------------------------
    console.log('📦 Extracting final HTML...');
    const html = await page.evaluate(
      () => '<!DOCTYPE html>\n' + document.documentElement.outerHTML,
    );

    // Write output
    const outputPath = path.resolve(opts.output!);
    const outputDir = path.dirname(outputPath);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, html, 'utf-8');

    stats.output = outputPath;
    stats.sizeBytes = Buffer.byteLength(html);
    stats.durationMs = Date.now() - startTime;

    const sizeKB = (stats.sizeBytes / 1024).toFixed(1);
    console.log(`\n✅ Snapshot saved to ${outputPath} (${sizeKB} KB)`);
    console.log(
      `   ${stats.stylesheets} stylesheets, ${stats.images} images, ${stats.cssUrls} CSS urls inlined`,
    );
    console.log(
      `   ${additionalTotal} additional resources (SVG/video/favicon)`,
    );
    console.log(`   ${stats.scriptsRemoved} scripts removed`);
    console.log(`   Completed in ${stats.durationMs}ms`);

    if (stats.warnings.length > 0) {
      console.log(`\n⚠️  ${stats.warnings.length} warning(s):`);
      stats.warnings.forEach((w) => console.log(`   • ${w}`));
    }

    // JSON output for CI/CD integration
    if (opts.json) {
      console.log('\n--- JSON Stats ---');
      console.log(JSON.stringify(stats, null, 2));
    }
  } finally {
    // Guaranteed browser cleanup — prevents zombie Chrome processes
    if (globalTimer) clearTimeout(globalTimer);
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Browser may already be closed by timeout handler
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const opts = parseArgs();
validateOpts(opts);

snapshot(opts).catch((err: Error) => {
  console.error('❌ Snapshot failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});