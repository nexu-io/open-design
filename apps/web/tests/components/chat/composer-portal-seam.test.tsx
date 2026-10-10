// @vitest-environment jsdom
/**
 * 输入框被 portal 出去时,必须**自带 `--chat-*` 接缝**。
 *
 * 真机复现(2026-08-27):注释芯片(`QuotedRefs`)的边框、底色、关闭键的圆圈
 * 全都没出来。样式表本身是对的 —— 量到:
 *
 *   inSeam: false                   最近的 [data-chat-root] 祖先:没有
 *   --chat-border: (empty)          --chat-stroke: (empty)
 *   border: 0px none                background: rgba(0,0,0,0)
 *   border-radius: 50%              ← 唯一活下来的,因为它是**字面量**不是变量
 *
 * 那个 50% 正好反证了机制:凡是走 `var(--chat-*)` 的声明全部解析失败,
 * 只有不带变量的活着。
 *
 * 机制:`ChatPane` 在窄布局下把整个输入框 `createPortal` 到 `<body>`
 * (真机祖先链 `composer-shell → composer → chat-composer-fixed-layer → body`),
 * 而自定义属性按 **DOM 树**继承 —— 于是它落在整页唯一那个接缝之外,
 * **输入框里每一个消费 `--chat-*` 的组件同时失效**,而且**不报错**。
 *
 * `ChatRoot.tsx` 的文件注释逐字预言过:「脱离它,`--chat-*` 变量全部落空,
 * 组件会退化成无色无字号的裸结构 —— **而且不报错**」。
 * 今天这是第三次:联系支持弹窗、产物卡浮层、现在是输入框。
 *
 * 判据用 `data-chat-root`(和 `theme-seam.test.tsx` 同一个出口),不查类名 ——
 * CSS Module 的类名带哈希,查它等于查编译产物。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const chatPane = readFileSync(
  resolve(__dirname, '../../../src/components/ChatPane.tsx'),
  'utf8',
);

/**
 * 取 `chat-composer-fixed-layer` 那个元素的整段 JSX 开标签。
 *
 * 类名可能以两种形态出现:字面量 `className="chat-composer-fixed-layer"`,
 * 或经由 `chatSeam('chat-composer-fixed-layer')` 展开 —— 后者正是这条要求的形态,
 * 所以按**类名字符串**定位,不按 `className=` 定位(第一版就是这么写死的,
 * 实现改对之后测试反而找不到了)。
 */
function portalLayerTag(): string {
  const i = chatPane.indexOf("'chat-composer-fixed-layer'") >= 0
    ? chatPane.indexOf("'chat-composer-fixed-layer'")
    : chatPane.indexOf('"chat-composer-fixed-layer"');
  if (i < 0) throw new Error('portal layer not found — 选择器改名了,断言会空转');
  const start = chatPane.lastIndexOf('<div', i);
  const end = chatPane.indexOf('>', chatPane.indexOf('style={{', i));
  return chatPane.slice(start, end + 1);
}

describe('输入框 portal 出去时自带主题接缝', () => {
  it('那个固定层确实是 portal 出去的 —— 前提不成立就别往下断言', () => {
    expect(chatPane).toMatch(/createPortal\(/);
    expect(chatPane).toMatch(/chat-composer-fixed-layer/);
  });

  it('portal 那一层带 data-chat-root', () => {
    // `chatSeam()` 同时返回 `className` 和 `data-chat-root`,展开即带上
    expect(portalLayerTag()).toMatch(/chatSeam\(|data-chat-root/);
  });

  it('接缝要连变量类名一起带上,不能只有那个属性', () => {
    // `chatSeam()` 同时返回类名和属性;只写属性拿不到变量
    expect(portalLayerTag()).toMatch(/chatSeam\(/);
  });

  it('没 portal 的那一支不重复挂 —— 它本来就在接缝里', () => {
    // 非 portal 分支渲染的是 `{shouldPortalComposer ? null : composerNode}`,
    // 那一段外面不应该再套一层接缝
    const i = chatPane.indexOf('{shouldPortalComposer ? null : composerNode}');
    expect(i).toBeGreaterThan(0);
    const around = chatPane.slice(Math.max(0, i - 400), i);
    expect(around).not.toMatch(/chatSeam\(/);
  });
});
