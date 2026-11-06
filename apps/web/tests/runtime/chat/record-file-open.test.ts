/**
 * 执行记录里的文件名:**哪一个才允许做成「打开」的入口**。
 *
 * 产品 2026-08-27:「这些文件不要变成可点击的.. 因为读的不一定是我们项目文件夹下的文件....」
 * 截图里是三行 `读取 template.html` / `读取 checklist.md` / `读取 layouts.md`,
 * 三个文件都来自 `.od-skills`(daemon 在开跑前把当前技能拷进
 * `<项目 cwd>/.od-skills/<folder>/`,见 `apps/daemon/src/cwd-aliases.ts`)。
 *
 * ## 为什么不是「路径在项目根之内就放行」
 *
 * 绝对路径**是**到得了前端的(`fileOf()` 直接取 agent 的 `file_path` 入参),
 * 项目根也到得了(`GET /api/projects/:id` 的 `resolvedDir`),所以包含关系判得出来。
 * 但它**判不开这一例**:`.od-skills/` 就在项目根**里面**,包含检查会说「是自己的文件」,
 * 截图里那三行照旧可点。而它们又不在项目文件列表里(`listFiles()` 跳过点开头的条目),
 * 右侧工作区根本打不开 —— 点了要么没反应,要么更糟:按同名去猜,开出另一个文件。
 *
 * 所以规则按**操作**分,不按路径分:
 *   · 读 —— 一律不做链接。agent 可以读任何地方的任何东西,这一档没有可靠的边界。
 *   · 写 / 改 —— 仍然可点,但要**正面证明**这个路径属于当前项目
 *     (沿用 markdown 链接那条同一个判官 `resolveChatFileLink`),
 *     并且交给打开回调的是**项目相对路径**,不是 agent 给的那个绝对路径。
 */
import { describe, expect, it } from 'vitest';
import { openableRecordFilePath } from '../../../src/runtime/chat/record-file-open';
import type { ToolRow } from '../../../src/runtime/chat/contract';

const PROJECT_DIR = '/Users/me/.od/projects/p1';
const SCOPE = {
  projectId: 'p1',
  projectResolvedDir: PROJECT_DIR,
  projectFileNames: new Set(['index.html', 'checklist.md', 'sub/hero.html']),
};

function row(over: Partial<ToolRow> = {}): ToolRow {
  return {
    kind: 'tool',
    id: 't1',
    tool: 'read',
    name: 'Read',
    title: '读取',
    rawTitle: false,
    /* 没回来的调用才是 pending —— 这几份 fixture 造的都是**已经回来**的行 */
    pending: false,
    file: null,
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: null,
    failed: false,
    failReason: null,
    command: null,
    terminal: null,
    ...over,
  };
}

const file = (path: string) => ({ path, label: path.split('/').pop() ?? path });

describe('读:一律不做链接', () => {
  it('技能资源(项目根里的 .od-skills)不可点 —— 这就是产品截图里那三行', () => {
    const r = row({ tool: 'read', file: file(`${PROJECT_DIR}/.od-skills/deck/template.html`) });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });

  it('项目根之外的文件不可点', () => {
    const r = row({ tool: 'read', file: file('/Users/me/Documents/别人的/layouts.md') });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });

  it('哪怕读的**就是**项目自己的文件,也不做链接 —— 这一档不留例外', () => {
    // 留例外就等于回到「按名字猜」:同名文件在别处被读到时,判据完全一样
    const r = row({ tool: 'read', file: file(`${PROJECT_DIR}/index.html`) });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });

  it('同名陷阱:别处的 checklist.md 不许因为项目里也有一个同名文件而可点', () => {
    const r = row({ tool: 'read', file: file('/tmp/somewhere/checklist.md') });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });
});

describe('写 / 改:项目内的仍然可点', () => {
  it('写在项目根下 —— 可点,而且交出去的是项目相对路径', () => {
    const r = row({ tool: 'write', name: 'Write', file: file(`${PROJECT_DIR}/index.html`) });
    expect(openableRecordFilePath(r, SCOPE)).toBe('index.html');
  });

  it('改子目录里的文件 —— 可点,相对路径带上子目录', () => {
    const r = row({ tool: 'edit', name: 'Edit', file: file(`${PROJECT_DIR}/sub/hero.html`) });
    expect(openableRecordFilePath(r, SCOPE)).toBe('sub/hero.html');
  });

  it('agent 给的是相对路径时照样认(codex 常这么写)', () => {
    const r = row({ tool: 'write', name: 'Write', file: file('index.html') });
    expect(openableRecordFilePath(r, SCOPE)).toBe('index.html');
  });

  it('写到项目根之外 —— 不可点(点了也开不出来)', () => {
    const r = row({ tool: 'write', name: 'Write', file: file('/Users/me/Desktop/out.html') });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });

  it('写进项目里的 .od-skills —— 不可点:项目文件面板本来就不列点开头的目录', () => {
    const r = row({ tool: 'write', name: 'Write', file: file(`${PROJECT_DIR}/.od-skills/deck/x.html`) });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });

  it('同名陷阱:别处的绝对路径不许因为项目里有同名文件就被判成自己的', () => {
    // `resolveChatFileLink` 拿不到前缀证据时会退到「按文件名尾段匹配」——
    // 那样点开的是项目里那个同名文件,不是 agent 真写过的那个。这一条堵的就是它。
    const r = row({ tool: 'write', name: 'Write', file: file('/tmp/别处/checklist.md') });
    expect(openableRecordFilePath(r, SCOPE)).toBeNull();
  });

  it('拿不到项目根时,绝对路径不靠同名去猜', () => {
    const r = row({ tool: 'write', name: 'Write', file: file('/somewhere/else/checklist.md') });
    expect(
      openableRecordFilePath(r, { projectId: 'p1', projectFileNames: SCOPE.projectFileNames }),
    ).toBeNull();
  });
});

describe('其余几档', () => {
  it('没有文件的行(搜索 / 执行 / 元工具)自然没有链接', () => {
    expect(openableRecordFilePath(row({ tool: 'search', pattern: 'gap' }), SCOPE)).toBeNull();
    expect(openableRecordFilePath(row({ tool: 'exec', command: 'ls -la' }), SCOPE)).toBeNull();
    expect(openableRecordFilePath(row({ tool: 'other', name: 'ToolSearch' }), SCOPE)).toBeNull();
  });

  it('完全没有作用域时不会抛,只是不做链接', () => {
    const r = row({ tool: 'write', name: 'Write', file: file(`${PROJECT_DIR}/index.html`) });
    expect(openableRecordFilePath(r, undefined)).toBeNull();
  });
});
