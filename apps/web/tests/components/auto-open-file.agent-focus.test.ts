/**
 * `<od-focus open="…">` 落到「开不开这个预览」上的那一步。
 *
 * 产品拍的板(逐字):
 *   「让 agent 只自动打开新创建的文件吧? 并且不要在空的时候打开,不然用户看到
 *     空的会感觉是 bug, 能看到产物有内容了再打开?」
 *   「不发标记要么按现在规则展示?」
 *
 * 「非空」那一半在 daemon 侧(`apps/daemon/src/artifact-focus-marker.ts`,
 * 有独立红测):文件没有内容时事件根本不下发,所以这里拿到 `declaredPath` 就
 * 意味着 daemon 已经证过「在项目里 + 非空」。这个文件钉的是剩下三条:
 * **只开本轮新建的**、**用户的意图优先**、**没有标记时一切照旧**。
 */
import { describe, expect, it } from 'vitest';
import { decideAgentFocusOpen } from '../../src/components/auto-open-file';

/** 形状取自 `ProjectFile`(contracts/api/files.ts):name/path/size/mtime/kind/mime */
function file(name: string, extra: Record<string, unknown> = {}) {
  return {
    name,
    path: name,
    type: 'file' as const,
    size: 4096,
    mtime: 1787787535451,
    kind: name.endsWith('.html') ? 'html' : 'text',
    mime: name.endsWith('.html') ? 'text/html' : 'text/plain',
    ...extra,
  };
}

const PROJECT = [file('index.html'), file('styles.css'), file('old-notes.md')];
/** 本轮开始前就存在的文件名 —— ProjectView 里的 `beforeFileNames` */
const BEFORE = new Set(['old-notes.md', 'styles.css']);

const base = {
  projectFiles: PROJECT,
  preTurnFileNames: BEFORE,
  userTookOverPreview: false,
};

describe('agent 声明的 open', () => {
  it('本轮新建的文件 —— 开', () => {
    expect(decideAgentFocusOpen({ ...base, declaredPath: 'index.html' })).toEqual({
      shouldOpen: true,
      fileName: 'index.html',
    });
  });

  /*
   * 反面 + 正面成对。少了上面那条,下面每一条都可能只是「什么都不开」。
   */
  it('本轮之前就存在的文件 —— 不开(agent 只能开自己这轮造的东西)', () => {
    expect(decideAgentFocusOpen({ ...base, declaredPath: 'old-notes.md' })).toEqual({
      shouldOpen: false,
      fileName: null,
    });
  });

  it('用户这一轮自己开过东西 —— 用户赢,agent 不许抢走', () => {
    expect(
      decideAgentFocusOpen({ ...base, declaredPath: 'index.html', userTookOverPreview: true }),
    ).toEqual({ shouldOpen: false, fileName: null });
  });

  it('没有标记 —— 不表态,让 host 现有的推断照常跑', () => {
    for (const declaredPath of [null, undefined, '']) {
      expect(decideAgentFocusOpen({ ...base, declaredPath })).toEqual({
        shouldOpen: false,
        fileName: null,
      });
    }
  });

  it('文件列表里找不到 —— 不开,免得留一个空壳 tab', () => {
    expect(decideAgentFocusOpen({ ...base, declaredPath: 'never-written.html' })).toEqual({
      shouldOpen: false,
      fileName: null,
    });
  });

  it('没有本轮基线快照时 —— 不开(证不了「新建」就不认)', () => {
    expect(
      decideAgentFocusOpen({ ...base, declaredPath: 'index.html', preTurnFileNames: null }),
    ).toEqual({ shouldOpen: false, fileName: null });
  });

  it('同名歧义 —— 宁可不开,也不开错那一个', () => {
    const ambiguous = [
      file('a/index.html', { name: 'a/index.html', path: 'a/index.html' }),
      file('b/index.html', { name: 'b/index.html', path: 'b/index.html' }),
    ];
    expect(
      decideAgentFocusOpen({
        ...base,
        projectFiles: ambiguous,
        preTurnFileNames: new Set<string>(),
        declaredPath: 'index.html',
      }),
    ).toEqual({ shouldOpen: false, fileName: null });

    // 正面对照:写全路径就不再有歧义,必须开
    expect(
      decideAgentFocusOpen({
        ...base,
        projectFiles: ambiguous,
        preTurnFileNames: new Set<string>(),
        declaredPath: 'a/index.html',
      }),
    ).toEqual({ shouldOpen: true, fileName: 'a/index.html' });
  });

  it('目录不是产物 —— 不开', () => {
    expect(
      decideAgentFocusOpen({
        ...base,
        projectFiles: [file('assets', { type: 'dir' })],
        preTurnFileNames: new Set<string>(),
        declaredPath: 'assets',
      }),
    ).toEqual({ shouldOpen: false, fileName: null });
  });

  it('多文件 React 原型的模块文件 —— 不开(单开是死胡同,#2744)', () => {
    const files = [file('App.jsx', { kind: 'text', mime: 'text/plain' })];
    expect(
      decideAgentFocusOpen({
        ...base,
        projectFiles: files,
        preTurnFileNames: new Set<string>(),
        declaredPath: 'App.jsx',
        moduleFileNames: new Set(['App.jsx']),
      }),
    ).toEqual({ shouldOpen: false, fileName: null });

    // 正面对照:不在模块集合里时照开
    expect(
      decideAgentFocusOpen({
        ...base,
        projectFiles: files,
        preTurnFileNames: new Set<string>(),
        declaredPath: 'App.jsx',
        moduleFileNames: new Set(['Other.jsx']),
      }),
    ).toEqual({ shouldOpen: true, fileName: 'App.jsx' });
  });

  it('Windows 反斜杠写法也认', () => {
    const nested = [file('site/index.html', { name: 'site/index.html', path: 'site/index.html' })];
    expect(
      decideAgentFocusOpen({
        ...base,
        projectFiles: nested,
        preTurnFileNames: new Set<string>(),
        declaredPath: 'site\\index.html',
      }),
    ).toEqual({ shouldOpen: true, fileName: 'site/index.html' });
  });
});
