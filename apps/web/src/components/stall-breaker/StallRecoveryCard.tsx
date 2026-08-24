import { useEffect, useRef, useState } from 'react';
import { Button } from '@open-design/components';

import { Icon } from '../Icon';
import { SearchableModelSelect } from '../modelOptions';
import type { StallBreakerPaneProps } from './types';
import styles from './StallRecoveryCard.module.css';

/**
 * 熔断终态 + 恢复引导卡片（R3 / R7 / R8 / R9）。
 *
 * 视觉语言对齐 UserActionCard（run 失败恢复卡）：琥珀警示徽章 +
 * panel 底 + 紧凑布局，让用户一眼识别「系统异常、需要决策」，并与
 * composer / 消息气泡的形态区分。信息保持减法后的三层：一句话终态、
 * 推荐路径（「换个模型重试」label + 预选 chip + 立即重试）、次级按钮
 * 行。挂载时滚动进视口，避免与「回到最新」浮钮重叠。
 *
 * demo 阶段文案为硬编码中文；产品化前需按 i18n 规范补全 19 个 locale。
 */
export function StallRecoveryCard({
  secondBreak,
  retriesUsed,
  failedModelId,
  failedModelStallCount,
  modelOptions,
  onAction,
}: Pick<
  StallBreakerPaneProps,
  | 'secondBreak'
  | 'retriesUsed'
  | 'failedModelId'
  | 'failedModelStallCount'
  | 'modelOptions'
  | 'onAction'
>) {
  const models = modelOptions.map((option) =>
    option.id === failedModelId ? { ...option, enabled: false } : option,
  );
  // 预选推荐模型：跳过卡死通道，优先取目录标记的 default，否则取
  // 第一个可用项。用户可通过 chip 改选，执行前不发起任何请求。
  const recommended =
    models.find((m) => m.enabled !== false && m.default) ??
    models.find((m) => m.enabled !== false);
  const [selectedModelId, setSelectedModelId] = useState(recommended?.id ?? '');

  // 熔断卡片是当下最重要的决策点：出现时滚进视口，既保证用户看到，
  // 也让 chat-log 的「回到最新」浮钮（未到底部才显示）自然隐藏。
  const cardRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    cardRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, []);

  const title = secondBreak ? '又卡住了' : '生成卡住了';
  const detail = secondBreak
    ? `${failedModelId} 本会话已卡住 ${failedModelStallCount} 次，建议换个模型；已完成的内容已保留。`
    : retriesUsed > 0
      ? `自动重试 ${retriesUsed} 次仍无响应，已停止；已完成的内容已保留。`
      : '通道长时间无响应，已自动停止；已完成的内容已保留。';

  return (
    <section className={styles.card} ref={cardRef} role="group" aria-label="生成卡住恢复引导">
      <div className={styles.head}>
        <span className={styles.iconBadge} aria-hidden>
          <Icon name="alert-triangle" size={16} />
        </span>
        <div className={styles.headText}>
          <strong className={styles.title}>{title}</strong>
          <p className={styles.detail}>{detail}</p>
        </div>
      </div>

      <div className={styles.recommendBlock}>
        <span className={styles.recommendLabel}>
          换个模型重试 <em className={styles.recommendPill}>推荐</em>
        </span>
        <div className={styles.switchRow}>
          <SearchableModelSelect
            className={styles.modelChip}
            models={models}
            value={selectedModelId}
            onChange={setSelectedModelId}
            searchPlaceholder="搜索模型…"
            minSearchableOptions={1}
            popoverMinWidth={320}
            disabledOptionHint={() => `本会话已卡住 ${failedModelStallCount} 次`}
          />
          <Button
            variant="primary"
            disabled={!selectedModelId}
            onClick={() => onAction('switch-model', { modelId: selectedModelId })}
          >
            立即重试
          </Button>
        </div>
      </div>

      <div className={styles.secondary}>
        <Button onClick={() => onAction('new-session')}>新开会话继续</Button>
        <Button
          className={secondBreak ? styles.secondaryDemoted : undefined}
          onClick={() => onAction('same-retry')}
        >
          原样重试{secondBreak ? `（已失败 ${failedModelStallCount} 次）` : ''}
        </Button>
      </div>
    </section>
  );
}
