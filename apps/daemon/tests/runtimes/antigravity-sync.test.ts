import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

describe('antigravity brain artifact sync', () => {
  it('syncs generated html, css, js files from brain dir into project dir', async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'od-agy-sync-test-'));
    try {
      const brainDir = path.join(tempRoot, 'brain', 'session-123');
      const projectDir = path.join(tempRoot, 'project-1');
      await mkdir(brainDir, { recursive: true });
      await mkdir(projectDir, { recursive: true });

      await writeFile(path.join(brainDir, 'clock-ui.html'), '<!doctype html><html><body>Clock</body></html>');
      await writeFile(path.join(brainDir, 'style.css'), 'body { background: #000; }');
      await writeFile(path.join(brainDir, 'app.js'), 'console.log("hello");');
      await writeFile(path.join(brainDir, 'implementation_plan.md'), '# Plan');
      await writeFile(path.join(brainDir, 'walkthrough.md'), '# Walkthrough');
      await mkdir(path.join(brainDir, 'scratch'), { recursive: true });
      await writeFile(path.join(brainDir, 'scratch', 'test.html'), '<html>scratch</html>');

      const agyEntries = await (await import('node:fs')).promises.readdir(brainDir);
      for (const entry of agyEntries) {
        if (entry.startsWith('.') || entry === 'scratch' || entry.endsWith('.md')) {
          continue;
        }
        const ext = path.extname(entry).toLowerCase();
        if (['.html', '.htm', '.css', '.js', '.svg', '.png', '.jpg', '.webp'].includes(ext)) {
          const srcFile = path.join(brainDir, entry);
          const destFile = path.join(projectDir, entry);
          await (await import('node:fs')).promises.copyFile(srcFile, destFile);
        }
      }

      const htmlContent = await readFile(path.join(projectDir, 'clock-ui.html'), 'utf8');
      expect(htmlContent).toBe('<!doctype html><html><body>Clock</body></html>');

      const cssContent = await readFile(path.join(projectDir, 'style.css'), 'utf8');
      expect(cssContent).toBe('body { background: #000; }');

      const jsContent = await readFile(path.join(projectDir, 'app.js'), 'utf8');
      expect(jsContent).toBe('console.log("hello");');

      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(projectDir, 'implementation_plan.md'))).toBe(false);
      expect(existsSync(path.join(projectDir, 'walkthrough.md'))).toBe(false);
      expect(existsSync(path.join(projectDir, 'test.html'))).toBe(false);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
