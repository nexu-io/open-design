import type { ReactNode } from 'react';

import styles from './ChatRoot.module.css';

/**
 * chat 组件树的根:把 `--chat-*` 主题接缝挂到子树上。
 *
 * 所有 chat 组件都假定自己渲染在接缝之内;脱离它,`--chat-*` 变量全部落空,
 * 组件会退化成无色无字号的裸结构 —— **而且不报错**。壳头「进行中」那句用
 * `background-clip: text` + `color: transparent` 上色,渐变里任一变量解析不出来,
 * 整条 `background` 就失效,字变成透明的:页面上像是没渲染,单测一条都不会红。
 *
 * 接缝有两种用法,按「能不能多一层 DOM」选:
 *
 *  · `chatSeam('已有的类名')` —— **产品里用这个**。多一层包裹元素会打断
 *    `.split-chat-slot > .pane` 这类子选择器(全仓 11 条),`display: contents`
 *    去掉的是布局盒、不是选择器树上的那个节点,所以那些规则会集体失配。
 *  · `<ChatRoot>` —— 测试与陈列页用这个:那里需要凭空包一层,`display: contents`
 *    保证它不改排版。
 */
export function ChatRoot({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={className ? `${styles.root} ${className}` : styles.root} data-chat-root="">
      {children}
    </div>
  );
}

/**
 * 把接缝抹在一个**已有**元素上。展开到 JSX 里:`<div {...chatSeam('pane')}>`。
 *
 * `data-chat-root` 和变量类名绑在一起返回,是为了让「有接缝」这件事只有一个出口 ——
 * 回归测试(`tests/components/chat/theme-seam.test.tsx`)就是按这个属性找接缝的。
 *
 * ⚠️ **调用方自己的类名必须走参数,不能写在展开后面。**
 *
 *   ✅ `<div {...chatSeam('chat-composer-fixed-layer')}>`
 *   ❌ `<div {...chatSeam()} className="chat-composer-fixed-layer">`
 *
 * 第二种写法里,后面那个 `className` 把变量类名整个盖掉,而 `data-chat-root` 是
 * **另一个属性**,毫发无损 —— 于是元素上「看起来有接缝」,`--chat-*` 却全部解析成
 * 空字符串(无头 Chrome 实测:`--chat-border` / `--chat-stroke` / `--chat-bg` 全是 `''`,
 * `border: var(--chat-stroke) solid var(--chat-border)` 塌成 `0px none`)。
 * 和本文件开头说的一样,这件事**不报错**。按属性找接缝的测试也照样绿 ——
 * 属性确实在。挡住这一类的是 `tests/components/chat/chat-seam-resolves.test.tsx`:
 * 它问的是「这个元素身上那个类,在 CSS 里到底声不声明 `--chat-*`」。
 */
export function chatSeam(className?: string): { className: string; 'data-chat-root': '' } {
  // CSS Module 的类名映射在类型上是可选的(`Record<string, string | undefined>`),
  // 这里兜一层空串,拿不到类名时不会渲染出 `class="undefined"`
  const seam = styles.vars ?? '';
  return {
    className: className ? `${seam} ${className}` : seam,
    'data-chat-root': '',
  };
}
