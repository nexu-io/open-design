/**
 * 把「哪种产物有格式可选」钉在它真正的事实源上。
 *
 * 事实源不是一张手抄的后缀表,而是 **viewer 路由**:格式菜单只长在
 * `HtmlViewer` 上,而 `FileViewer` 也只把 `downloadRequest` 转给那一支
 * (renderer id `html` / `deck-html`)。别的 renderer 收不到这个信号 ——
 * 所以对它们来说「导出」只有一种可能:把原件下载下来。
 *
 * 这一条测试直接问 `artifactRendererRegistry`,而不是复述后缀:哪天有人给
 * markdown 也接上导出菜单、或者把 `.htm` 挪去别的 renderer,这里当场红。
 */
import { describe, expect, it } from 'vitest';

import {
  artifactExportFormats,
  artifactExportNeedsFormatChoice,
} from '../../../src/runtime/chat/artifact-export';
import { artifactRendererRegistry } from '../../../src/artifacts/renderer-registry';
import type { ProjectFile } from '../../../src/types';

/** 最小的真实记录形状 —— 走 `inferLegacyManifest` 那条推断,和产物卡拿到的一样。 */
function file(name: string, kind: ProjectFile['kind']): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 1024,
    mtime: 1787794097356,
    kind,
    mime: 'application/octet-stream',
  } as ProjectFile;
}

/** 这份文件会被交给哪个 renderer —— `FileViewer` 的分派判据。 */
function rendererIdFor(name: string, kind: ProjectFile['kind']): string | null {
  return artifactRendererRegistry.resolve({ file: file(name, kind), isDeckHint: false })
    ?.renderer.id ?? null;
}

const SAMPLES: Array<[string, ProjectFile['kind']]> = [
  ['landing.html', 'html'],
  ['page.htm', 'html'],
  ['notes.md', 'text'],
  ['poster.png', 'image'],
  ['logo.svg', 'image'],
  ['reveal.mp4', 'video'],
  ['theme.mp3', 'audio'],
  ['data.csv', 'text'],
  ['tokens.json', 'text'],
];

describe('artifactExportFormats 与 viewer 路由一致', () => {
  it('只有走 HtmlViewer 的那一支才有格式可选', () => {
    for (const [name, kind] of SAMPLES) {
      const rendererId = rendererIdFor(name, kind);
      const routesToHtmlViewer = rendererId === 'html' || rendererId === 'deck-html';
      expect(
        artifactExportNeedsFormatChoice(name),
        `${name}(renderer=${rendererId})的判据和 viewer 路由对不上`,
      ).toBe(routesToHtmlViewer);
    }
  });

  it('正反两面都真的出现过 —— 否则上面那条循环可能空过', () => {
    const withChoice = SAMPLES.filter(([name]) => artifactExportNeedsFormatChoice(name));
    const withoutChoice = SAMPLES.filter(([name]) => !artifactExportNeedsFormatChoice(name));
    expect(withChoice.map(([n]) => n)).toEqual(['landing.html', 'page.htm']);
    expect(withoutChoice.length).toBeGreaterThan(0);
  });

  it('HTML 的格式表就是预览区导出菜单里那几条,顺序一致', () => {
    expect(artifactExportFormats('landing.html')).toEqual(['pdf', 'image', 'zip', 'html']);
  });

  it('单格式产物给空表 —— 调用方据此直接下载原件', () => {
    expect(artifactExportFormats('notes.md')).toEqual([]);
    expect(artifactExportFormats('poster.png')).toEqual([]);
    expect(artifactExportFormats('reveal.mp4')).toEqual([]);
  });
});
