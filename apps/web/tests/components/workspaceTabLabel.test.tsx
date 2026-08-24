// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { splitTabLabel, TabLabel } from '../../src/components/workspaceTabLabel';

afterEach(() => {
  cleanup();
});

describe('splitTabLabel', () => {
  it.each([
    ['index.html', 'index', '.html'],
    ['config.settings.json', 'config.settings', '.json'],
    ['scene.v2.usda', 'scene.v2', '.usda'],
    ['song.mp3', 'song', '.mp3'],
    ['model.3dm', 'model', '.3dm'],
    ['video.h264', 'video', '.h264'],
    ['clip.x265', 'clip', '.x265'],
    ['设计文件.tsx', '设计文件', '.tsx'],
    ['ホーム.html', 'ホーム', '.html'],
    ['app.beta3', 'app', '.beta3'],
  ])('splits %s as stem/ext', (title, stem, ext) => {
    expect(splitTabLabel(title)).toEqual({ stem, ext });
  });

  it.each([
    'Design Files', 'kit', '', '.gitignore', '.env', '.eslintrc', '文档.文档',
    'v1.2', 'app.v2', 'flow.b3', 'report.summary', 'song.a', 'trailing.',
    'component.svelte', 'README.markdown', 'build.gradle', 'report.doc-1', 'note. txt',
  ])('keeps non-extension title %j whole', (title) => {
    expect(splitTabLabel(title)).toEqual({ stem: title, ext: null });
  });

  it.each([
    '', '.', '..', 'name..', ' name ', 'line\nname',
    'a'.repeat(240), `${'a'.repeat(240)}.html`, '.gitignore',
    '设计文件.tsx', 'مشروع.json',
  ])('preserves representative title %j', (title) => {
    const { stem, ext } = splitTabLabel(title);
    expect(stem + (ext ?? '')).toBe(title);
    if (ext !== null) expect(stem).not.toBe('');
  });
});

describe('TabLabel', () => {
  it.each([
    ['index.html', ' •'],
    ['Design Files', undefined],
    ['مشروع.json', ' *'],
    ['foo.sketch.json', ' •'],
  ])('preserves text and span order for %j', (title, dirtyMark) => {
    const { container } = render(<TabLabel title={title} dirtyMark={dirtyMark} />);
    const root = container.querySelector('.ws-tab-label');
    expect(root?.textContent).toBe(title + (dirtyMark ?? ''));
    const spans = Array.from(root?.querySelectorAll('span') ?? []).map(
      (span) => span.className,
    );
    const { ext } = splitTabLabel(title);
    expect(spans).toEqual([
      'ws-tab-label-stem',
      ...(ext ? ['ws-tab-label-ext'] : []),
      ...(dirtyMark ? ['ws-tab-label-dirty'] : []),
    ]);
  });
});
