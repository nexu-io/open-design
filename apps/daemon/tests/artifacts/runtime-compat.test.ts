import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeArtifactRuntimeImports } from '../../src/artifacts/runtime-compat.js';
import { writeProjectFile } from '../../src/projects.js';

const brokenReactMotionHtml = `<!doctype html>
<html>
  <head>
    <script src="https://unpkg.com/motion@11.11.13/dist/motion.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      const { motion, useScroll, useTransform } = Motion;
      function App() {
        const { scrollYProgress } = useScroll();
        const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);
        return <motion.div style={{ opacity }}>Hello</motion.div>;
      }
    </script>
  </body>
</html>`;

describe('artifact runtime compatibility normalizer', () => {
  it('rewrites vanilla Motion UMD to Framer Motion UMD when React Motion hooks are used', () => {
    const normalized = normalizeArtifactRuntimeImports('landing.html', brokenReactMotionHtml);

    expect(normalized).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('https://unpkg.com/motion@11.11.13/dist/motion.js');
  });

  it('preserves non-HTML files and HTML that does not use Motion React hooks', () => {
    expect(normalizeArtifactRuntimeImports('notes.md', brokenReactMotionHtml)).toBe(brokenReactMotionHtml);

    const vanillaMotionHtml = '<!doctype html><script src="https://unpkg.com/motion@11.11.13/dist/motion.js"></script><script>Motion.animate("div", { opacity: 1 })</script>';
    expect(normalizeArtifactRuntimeImports('animation.html', vanillaMotionHtml)).toBe(vanillaMotionHtml);
  });

  it('removes stale integrity from rewritten script tags', () => {
    const html = brokenReactMotionHtml.replace(
      'src="https://unpkg.com/motion@11.11.13/dist/motion.js"',
      'src="https://unpkg.com/motion@11.11.13/dist/motion.js" integrity="sha384-stale"',
    );

    const normalized = normalizeArtifactRuntimeImports('landing.html', html) as string;

    expect(normalized).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('sha384-stale');
  });

  it('aliases the FramerMotion global for framer-motion UMD artifacts', () => {
    const html = `<!doctype html>
      <script src="https://unpkg.com/framer-motion@11.11.17/dist/framer-motion.js"></script>
      <script type="text/babel">const { motion, useScroll } = FramerMotion;</script>`;

    const normalized = normalizeArtifactRuntimeImports('landing.html', html) as string;

    expect(normalized).toContain('window.FramerMotion = window.FramerMotion || window.Motion;');
    expect(normalized.indexOf('framer-motion@11.11.17')).toBeLessThan(normalized.indexOf('window.FramerMotion'));
  });

  it('normalizes content before writeProjectFile persists it', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-runtime-compat-'));
    try {
      await writeProjectFile(projectsRoot, 'project-1', 'landing.html', Buffer.from(brokenReactMotionHtml, 'utf8'));

      const saved = await readFile(path.join(projectsRoot, 'project-1', 'landing.html'), 'utf8');
      expect(saved).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
      expect(saved).not.toContain('https://unpkg.com/motion@11.11.13/dist/motion.js');
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  // Port-path regression coverage for orbit-style React prototypes. This pattern leans on
  // the full Motion hook set (useScroll/useTransform/useAnimationFrame/useMotionValue), which only the
  // framer-motion React UMD build exposes. A single-file prototype that reaches for the vanilla
  // motion.js DOM bundle throws `useScroll is not a function` and renders blank — this is the artifact
  // the normalizer must repair at the write boundary.
  const orbitPrototypeHtml = `<!doctype html>
<html>
  <head>
    <script src="https://unpkg.com/motion@11.11.13/dist/motion.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      const { motion, useScroll, useTransform, useAnimationFrame, useMotionValue } = Motion;
      function OrbitImages() {
        const { scrollYProgress } = useScroll({ offset: ['start start', 'end end'] });
        const progress = useMotionValue(0);
        const radius = useTransform(scrollYProgress, [0.15, 0.25], [330, 650]);
        useAnimationFrame(() => progress.set(progress.get() + 0.4));
        return <motion.div style={{ '--r': radius }} />;
      }
    </script>
  </body>
</html>`;

  it('repairs an orbit prototype that uses the full Motion hook set', () => {
    const normalized = normalizeArtifactRuntimeImports('orbit-prototype.html', orbitPrototypeHtml) as string;

    expect(normalized).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('/dist/motion.js');
    // The destructured `Motion` global now resolves to the React build that actually carries the hooks.
    expect(normalized).toContain('useAnimationFrame');
  });

  it('rewrites the minified vanilla Motion bundle as well', () => {
    const html = brokenReactMotionHtml.replace('dist/motion.js', 'dist/motion.min.js');

    const normalized = normalizeArtifactRuntimeImports('landing.html', html) as string;

    expect(normalized).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('/dist/motion.min.js');
  });

  it('repairs a prototype that loads the wrong bundle and reads the FramerMotion global', () => {
    const html = brokenReactMotionHtml.replace('const { motion, useScroll, useTransform } = Motion;', 'const { motion, useScroll, useTransform } = FramerMotion;');

    const normalized = normalizeArtifactRuntimeImports('landing.html', html) as string;

    expect(normalized).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('/dist/motion.js');
    expect(normalized).toContain('window.FramerMotion = window.FramerMotion || window.Motion;');
  });

  it('repairs the right package name but wrong file (framer-motion@.../dist/motion.js)', () => {
    const html = brokenReactMotionHtml.replace(
      'https://unpkg.com/motion@11.11.13/dist/motion.js',
      'https://unpkg.com/framer-motion@11.11.13/dist/motion.js',
    );

    const normalized = normalizeArtifactRuntimeImports('landing.html', html) as string;

    expect(normalized).toContain('https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('/dist/motion.js');
  });

  it('repairs the vanilla bundle served from jsdelivr and preserves the host', () => {
    const html = brokenReactMotionHtml.replace(
      'https://unpkg.com/motion@11.11.13/dist/motion.js',
      'https://cdn.jsdelivr.net/npm/motion@11.11.13/dist/motion.js',
    );

    const normalized = normalizeArtifactRuntimeImports('landing.html', html) as string;

    expect(normalized).toContain('https://cdn.jsdelivr.net/npm/framer-motion@11.11.13/dist/framer-motion.js');
    expect(normalized).not.toContain('/dist/motion.js');
  });

  it('leaves the correct framer-motion.js bundle untouched (no false rewrite)', () => {
    const html = brokenReactMotionHtml.replace(
      'https://unpkg.com/motion@11.11.13/dist/motion.js',
      'https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js',
    );

    // Already correct → returned verbatim (idempotent), the vanilla-file matcher must not touch it.
    expect(normalizeArtifactRuntimeImports('landing.html', html)).toBe(html);
  });
});
