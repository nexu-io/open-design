import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { enforceSiteOutputPolicy, validateSiteOutput } from '../src/site-output/enforce.js';

const roots: string[] = [];

async function fixture(): Promise<{ dataRoot: string; projectRoot: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-site-output-'));
  roots.push(root);
  const dataRoot = path.join(root, 'data');
  const projectRoot = path.join(root, 'project');
  await mkdir(dataRoot, { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  return { dataRoot, projectRoot };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('site output enforcement', () => {
  it('normalizes a website to one self-contained index.html while preserving hidden internals', async () => {
    const { dataRoot, projectRoot } = await fixture();
    await mkdir(path.join(projectRoot, 'assets'), { recursive: true });
    await mkdir(path.join(projectRoot, '.od'), { recursive: true });
    await writeFile(path.join(projectRoot, '.od', 'state.json'), '{}');
    await writeFile(path.join(projectRoot, 'page.html'), [
      '<!doctype html><html><head><link rel="stylesheet" href="styles.css"></head>',
      '<body><img src="assets/pixel.svg"><script type="module" src="app.js"></script></body></html>',
    ].join(''));
    await writeFile(path.join(projectRoot, 'styles.css'), 'body{background-image:url("assets/pixel.svg")}');
    await writeFile(path.join(projectRoot, 'app.js'), 'import { ready } from "./module.js"; document.body.dataset.ready = ready;');
    await writeFile(path.join(projectRoot, 'module.js'), 'export const ready = "yes";');
    await writeFile(path.join(projectRoot, 'assets', 'pixel.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');

    const result = await enforceSiteOutputPolicy({
      dataRoot,
      mode: 'single-html',
      projectRoot,
      runId: 'run-single',
    });

    expect(result).toMatchObject({ mode: 'single-html', validation: 'passed', entryFile: 'index.html' });
    expect(result.warnings).toEqual([]);
    expect((await readdir(projectRoot)).sort()).toEqual(['.od', 'index.html']);
    expect(await readFile(path.join(projectRoot, '.od', 'state.json'), 'utf8')).toBe('{}');
    const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
    expect(html).toContain('<style>');
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain('data:text/javascript;base64,');
    expect(html).not.toContain('src="app.js"');
    await expect(validateSiteOutput(projectRoot, 'single-html')).resolves.toBeUndefined();
  });

  it('normalizes a website to the multi-file layout and creates an empty assets directory', async () => {
    const { dataRoot, projectRoot } = await fixture();
    await writeFile(path.join(projectRoot, 'landing.htm'), [
      '<!doctype html><html><head><style>body{color:red}</style></head>',
      '<body style="margin:0"><h1>Hello</h1><script>document.body.dataset.ready="yes"</script></body></html>',
    ].join(''));

    const result = await enforceSiteOutputPolicy({
      dataRoot,
      mode: 'multi-file',
      projectRoot,
      runId: 'run-multi',
    });

    expect(result).toMatchObject({ mode: 'multi-file', validation: 'passed', entryFile: 'index.html' });
    expect((await readdir(projectRoot)).sort()).toEqual(['assets', 'index.html', 'script.js', 'styles.css']);
    expect(await readdir(path.join(projectRoot, 'assets'))).toEqual([]);
    expect(await readFile(path.join(projectRoot, 'styles.css'), 'utf8')).toContain('body{color:red}');
    expect(await readFile(path.join(projectRoot, 'script.js'), 'utf8')).toContain('document.body.dataset.ready');
    await expect(validateSiteOutput(projectRoot, 'multi-file')).resolves.toBeUndefined();
  });

  it('promotes content-bearing numbered files over empty canonical placeholders', async () => {
    const { dataRoot, projectRoot } = await fixture();
    await mkdir(path.join(projectRoot, 'assets'), { recursive: true });
    await writeFile(path.join(projectRoot, 'index.html'), [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="styles.css">',
      '<link rel="stylesheet" href="styles-1.css">',
      '</head><body><h1>Hello</h1>',
      '<script src="script.js"></script>',
      '<script src="script-1.js"></script>',
      '</body></html>',
    ].join(''));
    await writeFile(path.join(projectRoot, 'styles.css'), '');
    await writeFile(path.join(projectRoot, 'styles-1.css'), 'body{color:rebeccapurple}');
    await writeFile(path.join(projectRoot, 'script.js'), '');
    await writeFile(path.join(projectRoot, 'script-1.js'), 'document.body.dataset.ready="yes";');

    await enforceSiteOutputPolicy({
      dataRoot,
      mode: 'multi-file',
      projectRoot,
      runId: 'run-promote-canonical',
    });

    expect((await readdir(projectRoot)).sort()).toEqual(['assets', 'index.html', 'script.js', 'styles.css']);
    expect(await readFile(path.join(projectRoot, 'styles.css'), 'utf8')).toContain('body{color:rebeccapurple}');
    expect(await readFile(path.join(projectRoot, 'script.js'), 'utf8')).toContain('document.body.dataset.ready');
    const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
    expect(html.match(/href="styles\.css"/g)).toHaveLength(1);
    expect(html.match(/src="script\.js"/g)).toHaveLength(1);
    expect(html).not.toContain('styles-1.css');
    expect(html).not.toContain('script-1.js');
    await expect(validateSiteOutput(projectRoot, 'multi-file')).resolves.toBeUndefined();
  });

  it('uses the first referenced content files as canonical and keeps additional meaningful files', async () => {
    const { dataRoot, projectRoot } = await fixture();
    await writeFile(path.join(projectRoot, 'index.html'), [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="theme.css">',
      '<link rel="stylesheet" href="print.css">',
      '</head><body>',
      '<script src="app.js"></script>',
      '<script src="analytics.js"></script>',
      '</body></html>',
    ].join(''));
    await writeFile(path.join(projectRoot, 'theme.css'), 'body{color:navy}');
    await writeFile(path.join(projectRoot, 'print.css'), '@media print{body{color:black}}');
    await writeFile(path.join(projectRoot, 'app.js'), 'document.body.dataset.app="ready";');
    await writeFile(path.join(projectRoot, 'analytics.js'), 'globalThis.analyticsReady=true;');

    await enforceSiteOutputPolicy({
      dataRoot,
      mode: 'multi-file',
      projectRoot,
      runId: 'run-meaningful-extras',
    });

    expect((await readdir(projectRoot)).sort()).toEqual([
      'analytics.js',
      'assets',
      'index.html',
      'print.css',
      'script.js',
      'styles.css',
    ]);
    expect(await readFile(path.join(projectRoot, 'styles.css'), 'utf8')).toContain('body{color:navy}');
    expect(await readFile(path.join(projectRoot, 'script.js'), 'utf8')).toContain('dataset.app');
    expect(await readFile(path.join(projectRoot, 'print.css'), 'utf8')).toContain('@media print');
    expect(await readFile(path.join(projectRoot, 'analytics.js'), 'utf8')).toContain('analyticsReady');
    const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
    expect(html).toContain('href="styles.css"');
    expect(html).toContain('href="print.css"');
    expect(html).toContain('src="script.js"');
    expect(html).toContain('src="analytics.js"');
    expect(html).not.toContain('theme.css');
    expect(html).not.toContain('app.js');
    await expect(validateSiteOutput(projectRoot, 'multi-file')).resolves.toBeUndefined();
  });

  it('rejects multi-file output that substitutes non-canonical CSS and JavaScript names', async () => {
    const { projectRoot } = await fixture();
    await mkdir(path.join(projectRoot, 'assets'), { recursive: true });
    await writeFile(path.join(projectRoot, 'index.html'), [
      '<!doctype html><html><head><link rel="stylesheet" href="theme.css"></head>',
      '<body><script src="app.js"></script></body></html>',
    ].join(''));
    await writeFile(path.join(projectRoot, 'theme.css'), 'body{color:navy}');
    await writeFile(path.join(projectRoot, 'app.js'), 'document.body.dataset.ready="yes";');

    await expect(validateSiteOutput(projectRoot, 'multi-file')).rejects.toThrow('styles.css is missing');
  });

  it('leaves the project unchanged when repair cannot find an HTML entry', async () => {
    const { dataRoot, projectRoot } = await fixture();
    await writeFile(path.join(projectRoot, 'notes.txt'), 'keep me');

    await expect(enforceSiteOutputPolicy({
      dataRoot,
      mode: 'single-html',
      projectRoot,
      runId: 'run-fail',
    })).rejects.toThrow('requires at least one generated HTML file');

    expect(await readFile(path.join(projectRoot, 'notes.txt'), 'utf8')).toBe('keep me');
  });

  it('honors project metadata entry selection and extracts data URLs in multi-file mode', async () => {
    const { dataRoot, projectRoot } = await fixture();
    await writeFile(path.join(projectRoot, 'index.html'), '<!doctype html><html><body>Old</body></html>');
    await writeFile(path.join(projectRoot, 'chosen.html'), [
      '<!doctype html><html><body>Chosen',
      '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=">',
      '</body></html>',
    ].join(''));

    await enforceSiteOutputPolicy({
      dataRoot,
      entryFile: 'chosen.html',
      mode: 'multi-file',
      projectRoot,
      runId: 'run-entry',
    });

    const html = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
    expect(html).toContain('Chosen');
    expect(html).not.toContain('data:image');
    expect((await readdir(path.join(projectRoot, 'assets'))).length).toBe(1);
  });
});
