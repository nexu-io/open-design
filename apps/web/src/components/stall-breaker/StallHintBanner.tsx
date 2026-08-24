import { useState } from 'react';
import { Button } from '@open-design/components';

import { SearchableModelSelect } from '../modelOptions';
import type { StallBreakerPaneProps } from './types';
import styles from './StallHintBanner.module.css';

/**
 * 卡顿提示（R2）：距最后一次可见输出 3 分钟时出现在 composer 上方，
 * 不打断生成。与恢复引导卡片同构的「默认推荐 + 可改 + 显式执行」：
 * 模型 chip 预选推荐模型（popover 为产品统一选择器，选中只改选择），
 * 「换模型重试」主按钮执行；另有新开会话 / 原样重试 / 继续等待。
 *
 * 常驻挂载 + 类切换驱动出入场（repo 动画规范：进 200ms / 出 140ms）。
 */
export function StallHintBanner({
  visible,
  silenceLabel,
  failedModelId,
  failedModelStallCount,
  modelOptions,
  onKeepWaiting,
  onAction,
}: Pick<
  StallBreakerPaneProps,
  | 'silenceLabel'
  | 'failedModelId'
  | 'failedModelStallCount'
  | 'modelOptions'
  | 'onKeepWaiting'
  | 'onAction'
> & { visible: boolean }) {
  const models = modelOptions.map((option) =>
    option.id === failedModelId ? { ...option, enabled: false } : option,
  );
  const recommended =
    models.find((m) => m.enabled !== false && m.default) ??
    models.find((m) => m.enabled !== false);
  const [selectedModelId, setSelectedModelId] = useState(recommended?.id ?? '');

  return (
    <div
      className={`${styles.banner} ${visible ? styles.bannerVisible : ''}`}
      aria-hidden={!visible}
    >
      <div className={styles.text}>
        <span className={styles.pulse} aria-hidden />
        <div>
          <strong>生成似乎卡住了</strong>
          <p>已 {silenceLabel} 没有新进展。可以继续等待，或立即换个方式重试。</p>
        </div>
      </div>
      <div className={styles.actions}>
        <SearchableModelSelect
          className={styles.modelChip}
          models={models}
          value={selectedModelId}
          onChange={setSelectedModelId}
          searchPlaceholder="搜索模型…"
          minSearchableOptions={1}
          popoverMinWidth={320}
          disabledOptionHint={() => `本会话已卡死 ${failedModelStallCount} 次`}
          tabIndex={visible ? 0 : -1}
        />
        <Button
          variant="primary"
          disabled={!selectedModelId}
          onClick={() => onAction('switch-model', { modelId: selectedModelId, fromHint: true })}
          tabIndex={visible ? 0 : -1}
        >
          换模型重试
        </Button>
        <Button
          onClick={() => onAction('new-session', { fromHint: true })}
          tabIndex={visible ? 0 : -1}
        >
          新开会话
        </Button>
        <Button
          onClick={() => onAction('same-retry', { fromHint: true })}
          tabIndex={visible ? 0 : -1}
        >
          原样重试
        </Button>
        <Button variant="subtle" onClick={onKeepWaiting} tabIndex={visible ? 0 : -1}>
          继续等待
        </Button>
      </div>
    </div>
  );
}
