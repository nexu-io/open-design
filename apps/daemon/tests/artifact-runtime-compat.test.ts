import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { normalizeArtifactRuntimeImports } from '../src/artifact-runtime-compat.js';
import { writeProjectFile } from '../src/projects.js';

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
});
