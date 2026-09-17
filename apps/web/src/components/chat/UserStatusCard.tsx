import type { ReactElement } from 'react';

import { PaletteIcon } from './primitives/icons';
import styles from './UserStatusCard.module.css';

/**
 * 用户消息位上的**状态卡** —— 今天只有一个实例:「设计系统工作区 · 自动创建」。
 *
 * 稿子 `729fa43ce7:docs/design/chat-panel/src/body-components.html:45-53`。
 * 它替代写进对话的那一整段内部 prompt,只留下用户需要认出来的标题与说明;
 * 仍然坐在用户消息那一列里,和普通气泡共用右对齐边界。
 *
 * ## 这张卡有过两次相反的决定
 *
 * 先被主动删过一次(改走「类型化语言字典 + 标准用户气泡」,并在
 * `tests/components/ChatPane.streaming.test.tsx` 留了一条「必须不存在」的断言);
 * **2026-09-02 用户裁决**要求按稿子 1:1 实现,于是加回来、那条断言翻转。
 * 判据在 `tests/components/chat/w88-design-system-status-card.test.tsx`。
 *
 * ⚠️ 稿子那句注释「尺寸、层级和图标与**产品里的** `user-status-card` 保持一致」
 * 在本仓库**没有参照物** —— `apps/web/src` 里 `user-status-card` 零命中,唯一命中
 * 就是上面那条断言它不存在的测试。所以一切按稿子自己的声明值做,别去找那个「产品里的」。
 */
export function UserStatusCard({
  title,
  description,
}: {
  title: string;
  description: string;
}): ReactElement {
  return (
    <div className={styles.card} data-testid="design-system-generation-status">
      {/* 图标是装饰性的,不进辅助技术的可访问名称(design-qa.md「关键实现」) */}
      <span
        className={styles.icon}
        data-testid="design-system-generation-status-icon"
        aria-hidden="true"
      >
        <PaletteIcon />
      </span>
      <span className={styles.copy} data-testid="design-system-generation-status-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </span>
    </div>
  );
}
