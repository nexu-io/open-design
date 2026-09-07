/**
 * `<od-focus …/>` 的**流式那一半**:标记进来,事件出去,正文里什么都不留。
 *
 * 三件事必须成立,少一件这个功能就不能上:
 *   1. 标记**一个字符都不许上屏** —— 包括被 SSE 切成两半的时候;
 *   2. 标记**不许让 host 读到项目外的文件** —— 声明的路径是不可信输入;
 *   3. 文件还空着的时候**不许开预览** —— 空白页在用户眼里就是 bug。
 *
 * 分片样本不是编的:真实录制 `.od/runs/*'/events.jsonl` 里 `<od-done>` 就是这么
 * 断的 —— `{"type":"text_delta","delta":"<od-done"}` 单独一帧,
 * `"<od-done key=\"89a"` 又是一帧,`"<od-done key=\"8"` 再一帧。
 * `<od-focus` 走同一条流,断法完全一样。
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createArtifactFocusMarkerStripper,
  resolveArtifactFocusProjectPath,
} from '../src/artifact-focus-marker.js';
import type { ArtifactFocusSelection } from '@open-design/contracts';

/** 真实录制里的 done_key 就是 16 位十六进制,`<od-focus>` 复用同一枚 */
const KEY = 'c07a83a9bc73cbd6';

function makeProject(): { root: string; cleanup: () => void } {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'od-focus-')));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

interface Harness {
  strip: (delta: string) => string;
  settle: () => Promise<boolean>;
  flush: () => string;
  emitted: ArtifactFocusSelection[];
  probed: string[];
}

function harness(
  root: string | null,
  opts: { key?: string | null } = {},
): Harness {
  const emitted: ArtifactFocusSelection[] = [];
  const probed: string[] = [];
  const stripper = createArtifactFocusMarkerStripper({
    key: opts.key === undefined ? KEY : opts.key,
    projectRoot: root,
    emit: (selection) => emitted.push(selection),
    probeFile: async (absolutePath) => {
      probed.push(absolutePath);
      const fs = await import('node:fs');
      try {
        const real = fs.realpathSync(absolutePath);
        if (!root) return null;
        const rel = path.relative(realpathSync(root), real);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
        const st = fs.statSync(real);
        return st.isFile() ? { size: st.size } : null;
      } catch {
        return null;
      }
    },
  });
  return { ...stripper, emitted, probed };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1. 标记不许上屏
 * ──────────────────────────────────────────────────────────────────────── */

describe('标记一个字符都不许进正文', () => {
  it('一帧里的完整标记,连同属性一起吃掉', () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), '<!doctype html><body>hi</body>');
    const h = harness(p.root);
    const out = h.strip(`已完成。<od-focus key="${KEY}" open="index.html" show="index.html"/>\n文件已保存。`);
    expect(out).not.toContain('od-focus');
    expect(out).not.toContain('key=');
    expect(out).not.toContain(KEY);
    expect(out).toBe('已完成。\n文件已保存。');
    expect(h.flush()).toBe('');
    p.cleanup();
  });

  it('被切成两半:半截标签一个字都不许露出来', () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), 'x'.repeat(100));
    const h = harness(p.root);
    // 真实录制里 `<od-done` 就是这样单独成帧的
    expect(h.strip('先说一句。<od-focus')).toBe('先说一句。');
    expect(h.strip(` key="${KEY}`)).toBe('');
    expect(h.strip('" open="index.html"/>收工。')).toBe('收工。');
    expect(h.flush()).toBe('');
    p.cleanup();
  });

  it('切在最刁钻的位置(尖括号后第一个字符)也不闪', () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'a.html'), 'content');
    const h = harness(p.root);
    const whole = `前。<od-focus key="${KEY}" open="a.html"/>后。`;
    for (let cut = 1; cut < whole.length; cut += 1) {
      const one = harness(p.root);
      const first = one.strip(whole.slice(0, cut));
      const second = one.strip(whole.slice(cut));
      const tail = one.flush();
      const shown = first + second + tail;
      expect(shown, `切在第 ${cut} 个字符时漏了`).not.toContain('od-focus');
      expect(shown).toBe('前。后。');
    }
    expect(h.flush()).toBe('');
    p.cleanup();
  });

  it('key 不对 / 没写 key / 没闭合,照样吃掉 —— 剥离不看 key', () => {
    const p = makeProject();
    const h = harness(p.root);
    for (const marker of [
      '<od-focus key="not-this-turns-key" open="index.html"/>',
      '<od-focus open="index.html"/>',
      '<od-focus>',
      '</od-focus>',
    ]) {
      const one = harness(p.root);
      expect(one.strip(`前。${marker}后。`), `${marker} 漏了`).toBe('前。后。');
      expect(one.emitted).toEqual([]);
    }
    expect(h.flush()).toBe('');
    p.cleanup();
  });

  it('流结束时还卡着半个标记 —— 丢掉标记,不是打在屏幕上', () => {
    const p = makeProject();
    const h = harness(p.root);
    expect(h.strip(`结论在这里。<od-focus key="${KEY}" open="ind`)).toBe('结论在这里。');
    expect(h.flush()).toBe('');
    p.cleanup();
  });

  /*
   * 正面对照 —— 防的是「凡是尖括号一律删掉」这种糊弄式修法。
   * 少了这一条,把匹配换成 `/<[^>]*>/g` 也能让上面几条全绿。
   */
  it('长得像但不是的东西,一个字都不许动', () => {
    const p = makeProject();
    const h = harness(p.root);
    const innocent = [
      '普通 HTML:<div class="x">hi</div> 和 <span>y</span>。',
      '多一截的 <od-focused> / 复数的 <od-focuses> 都不是这个标记。',
      '别的协议标记 <od-done key="x"/> 不归这里管。',
      '正文里裸写 od-focus 这个词(没有尖括号)要留着。',
      '数学写法 a<b 和 5 < 7 也要留着。',
    ].join('\n');
    expect(h.strip(innocent)).toBe(innocent);
    expect(h.flush()).toBe('');
    p.cleanup();
  });

  it('攒着的半截最终是人话时,flush 原样吐回去 —— 不吞用户的字', () => {
    const p = makeProject();
    const h = harness(p.root);
    expect(h.strip('这里有个孤立的 <')).toBe('这里有个孤立的 ');
    expect(h.flush()).toBe('<');
    const two = harness(p.root);
    expect(two.strip('半截 <od')).toBe('半截 ');
    expect(two.flush()).toBe('<od');
    p.cleanup();
  });

  it('孤立的 `<` 后面跟上普通字符就立刻放行,不把回答憋住', () => {
    const p = makeProject();
    const h = harness(p.root);
    expect(h.strip('比较 5 <')).toBe('比较 5 ');
    expect(h.strip(' 7 的时候')).toBe('< 7 的时候');
    expect(h.flush()).toBe('');
    p.cleanup();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 2. 路径安全 —— 声明的路径是不可信输入
 * ──────────────────────────────────────────────────────────────────────── */

describe('resolveArtifactFocusProjectPath', () => {
  it('把项目内的绝对路径折回相对路径(真实 Write 给的就是绝对路径)', () => {
    expect(resolveArtifactFocusProjectPath('/proj/site/index.html', '/proj')).toBe(
      'site/index.html',
    );
  });

  it('项目外的绝对路径一律拒绝', () => {
    for (const hostile of [
      '/etc/passwd',
      '/proj/../etc/passwd',
      '/Users/elian/.ssh/id_rsa',
      '/projX/index.html',
      '//evil-host/share/x',
      'C:/Windows/System32/config/SAM',
    ]) {
      expect(
        resolveArtifactFocusProjectPath(hostile, '/proj'),
        `${hostile} 必须拒绝`,
      ).toBeNull();
    }
  });

  it('相对路径里的 `..` 一律拒绝,不管在第几段', () => {
    expect(resolveArtifactFocusProjectPath('../secrets.env', '/proj')).toBeNull();
    expect(resolveArtifactFocusProjectPath('a/../../b', '/proj')).toBeNull();
  });

  it('没有项目根时,绝对路径无从校验,拒绝', () => {
    expect(resolveArtifactFocusProjectPath('/proj/index.html', null)).toBeNull();
    // 相对路径不需要根就能判安全,照常通过
    expect(resolveArtifactFocusProjectPath('index.html', null)).toBe('index.html');
  });
});

describe('标记不许让 host 读到项目外的文件', () => {
  it('穿越路径不 probe、不发事件', async () => {
    const p = makeProject();
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="../../../etc/passwd"/>`);
    await h.settle();
    expect(h.emitted).toEqual([]);
    // 关键:根本没去碰文件系统 —— 拒绝发生在 stat 之前
    expect(h.probed).toEqual([]);
    p.cleanup();
  });

  it('项目外的绝对路径不 probe、不发事件', async () => {
    const p = makeProject();
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="/etc/passwd"/>`);
    await h.settle();
    expect(h.emitted).toEqual([]);
    expect(h.probed).toEqual([]);
    p.cleanup();
  });

  /*
   * 字符串校验挡得住 `../`,挡不住软链 —— `assets/logo.png` 可以是指向
   * `~/.ssh/id_rsa` 的软链。所以 probe 里还要再按 realpath 判一次归属。
   */
  it('项目内的软链指向项目外时,probe 之后仍然拒绝', async () => {
    const p = makeProject();
    const outside = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'od-outside-')));
    const secret = path.join(outside, 'secret.txt');
    writeFileSync(secret, 'TOP SECRET');
    symlinkSync(secret, path.join(p.root, 'leak.html'));

    const root = p.root;
    const h = harness(root);
    h.strip(`<od-focus key="${KEY}" open="leak.html"/>`);
    await h.settle();
    // 路径本身合法,所以确实去碰了文件系统(和上面两条「压根不 probe」相反),
    // 但 realpath 之后判出界 —— 一次事件都不发
    expect(h.probed.length).toBeGreaterThan(0);
    expect(h.probed.every((p) => p.startsWith(path.join(root, path.sep)))).toBe(true);
    expect(h.emitted).toEqual([]);

    // 正面对照:同一个项目里的真文件必须放行,否则上面那条可能只是「什么都拒绝」
    writeFileSync(path.join(p.root, 'real.html'), 'hello');
    const ok = harness(p.root);
    ok.strip(`<od-focus key="${KEY}" open="real.html"/>`);
    await ok.settle();
    expect(ok.emitted).toEqual([{ open: 'real.html' }]);

    rmSync(outside, { recursive: true, force: true });
    p.cleanup();
  });

  it('show 里的越界路径被逐条丢掉,好路径留下', () => {
    const p = makeProject();
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" show="index.html, ../../etc/passwd, report.md"/>`);
    expect(h.emitted).toEqual([{ show: ['index.html', 'report.md'] }]);
    p.cleanup();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 3. 空文件不许开预览
 * ──────────────────────────────────────────────────────────────────────── */

describe('空的时候不开,有内容了才开', () => {
  it('文件还不存在时不发事件 —— 但标记留着,等字节', async () => {
    const p = makeProject();
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="index.html"/>`);
    await h.settle();
    expect(h.emitted).toEqual([]);

    // 字节落盘之后,settle 才把它放出来
    writeFileSync(path.join(p.root, 'index.html'), '<!doctype html><body>ok</body>');
    expect(await h.settle()).toBe(true);
    expect(h.emitted).toEqual([{ open: 'index.html' }]);
    p.cleanup();
  });

  it('0 字节的文件不算「有内容」', async () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), '');
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="index.html"/>`);
    await h.settle();
    expect(h.emitted).toEqual([]);

    writeFileSync(path.join(p.root, 'index.html'), '<!doctype html>');
    await h.settle();
    expect(h.emitted).toEqual([{ open: 'index.html' }]);
    p.cleanup();
  });

  it('文件已经有内容时,标记一到就发 —— 不等回合结束', async () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), '<!doctype html><body>done</body>');
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="index.html"/>`);
    // 不调 settle:标记那一刻就该发出去
    await vi.waitFor(() => expect(h.emitted).toEqual([{ open: 'index.html' }]));
    p.cleanup();
  });

  it('目录不是产物 —— 指向目录不发事件', async () => {
    const p = makeProject();
    mkdirSync(path.join(p.root, 'assets'));
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="assets"/>`);
    await h.settle();
    expect(h.emitted).toEqual([]);
    p.cleanup();
  });

  it('settle 幂等:放行之后再调不会重复发', async () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), 'x');
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="index.html"/>`);
    await h.settle();
    expect(await h.settle()).toBe(false);
    expect(await h.settle()).toBe(false);
    expect(h.emitted).toEqual([{ open: 'index.html' }]);
    p.cleanup();
  });

  /*
   * show 走的是另一条路:它只**收窄** host 自己算出来的清单,不会让 host 去
   * 读任何文件,所以不需要 stat 门。这条钉住这个区别 —— 否则有人「顺手统一」
   * 成两边都 stat,show 就会在文件还没落盘时被丢掉。
   */
  it('show 不受空文件门约束:文件不存在也照样下发', () => {
    const p = makeProject();
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" show="index.html"/>`);
    expect(h.emitted).toEqual([{ show: ['index.html'] }]);
    expect(h.probed).toEqual([]);
    p.cleanup();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * 4. key 与幂等
 * ──────────────────────────────────────────────────────────────────────── */

describe('只认这一轮的 key', () => {
  it('key 不匹配不发事件,但正文照样干净', async () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), 'x');
    const h = harness(p.root);
    expect(h.strip(`<od-focus key="deadbeefdeadbeef" open="index.html"/>好了。`)).toBe('好了。');
    await h.settle();
    expect(h.emitted).toEqual([]);
    p.cleanup();
  });

  it('这一轮压根没有 key 时,所有标记都只剥不认', async () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'index.html'), 'x');
    const h = harness(p.root, { key: null });
    expect(h.strip(`<od-focus key="${KEY}" open="index.html"/>好了。`)).toBe('好了。');
    await h.settle();
    expect(h.emitted).toEqual([]);
    p.cleanup();
  });

  it('一轮里发了好几枚:各字段分别以最后一枚为准', async () => {
    const p = makeProject();
    writeFileSync(path.join(p.root, 'a.html'), 'a');
    writeFileSync(path.join(p.root, 'b.html'), 'b');
    const h = harness(p.root);
    h.strip(`<od-focus key="${KEY}" open="a.html"/>`);
    await vi.waitFor(() => expect(h.emitted).toHaveLength(1));
    h.strip(`<od-focus key="${KEY}" open="b.html" show="b.html"/>`);
    await vi.waitFor(() => expect(h.emitted).toHaveLength(3));
    // 折叠留给消费者(contracts 的 foldArtifactFocusSelections);daemon 只如实上报
    expect(h.emitted).toEqual([
      { open: 'a.html' },
      { show: ['b.html'] },
      { open: 'b.html' },
    ]);
    p.cleanup();
  });
});
