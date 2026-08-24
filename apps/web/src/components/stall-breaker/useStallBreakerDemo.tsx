import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@open-design/components';

import type { AgentEvent, AgentModelOption, ChatMessage } from '../../types';
import type { StallBreakerPaneProps, StallRecoveryAction } from './types';
import styles from './useStallBreakerDemo.module.css';

/**
 * 生成卡死熔断的 demo 驱动。
 *
 * 在真实项目会话页（ProjectView → ChatPane）里叠加一次「会卡死的生成」：
 * 合成的 in-flight assistant 消息走真实的消息渲染管线（thinking 段、
 * ToolCard、streaming 态都是产品现有组件），StallHintBanner /
 * StallRecoveryCard 挂在 ChatPane 的真实插槽上；「新开会话继续」调用
 * ProjectView 真实的会话创建逻辑。
 *
 * 激活方式：项目会话 URL 追加 `?stallDemo=1`。仅 demo 分支存在；正式
 * 集成时 paneProps 改由 daemon 的静默计时与 stall_timeout 终态驱动。
 */

type CaseId = 'first-stall' | 'retry-storm' | 'double-stall';
type Beat = 'idle' | 'generating' | 'stalling' | 'broken' | 'recovering' | 'success';

const CASES: { id: CaseId; label: string; hint: string }[] = [
  { id: 'first-stall', label: '首次卡死', hint: '35 秒后流死掉，完整走提示 → 熔断 → 恢复' },
  { id: 'retry-storm', label: '重试后仍卡死', hint: '自动重试 2 次（可见），预算耗尽后熔断' },
  { id: 'double-stall', label: '二次卡死', hint: '原样重试再次卡死，推荐项降级' },
];

/** 演示时钟：1 真实秒 = 60 演示秒。 */
const CLOCK_RATE = 60;
const HINT_AT = 180;
const BREAK_AT = 300;
const RETRY_BEATS = [60, 150];

const THINKING_LINES = [
  '正在解析参考图的布局结构：顶部导航 + 首屏大图 + 三列特性区……',
  '规划页面骨架：采用响应式栅格，桌面端 1200px 容器，移动端单列堆叠。',
  '开始生成首屏 HTML 与样式……',
];

const FAILED_MODEL = 'grok-4.5';
/** 与产品模型目录同构的演示数据：metadata 驱动统一选择器的成本行与
 *  capability 徽标。正式集成时由 agent def 的真实模型目录提供。 */
const MODEL_OPTIONS: AgentModelOption[] = [
  { id: 'grok-4.5', label: 'grok-4.5', metadata: { capability: 'advanced', cost: 'medium' } },
  { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash', metadata: { capability: 'standard', cost: 'low' } },
  { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro', metadata: { capability: 'advanced', cost: 'medium' } },
  { id: 'claude-fable-5', label: 'claude-fable-5', default: true, metadata: { capability: 'best_quality', cost: 'very_high' } },
  { id: 'claude-opus-4.8', label: 'claude-opus-4.8', metadata: { capability: 'best_quality', cost: 'very_high' } },
  { id: 'claude-sonnet-5', label: 'claude-sonnet-5', metadata: { capability: 'advanced', cost: 'high' } },
];

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function demoUserMessages(prefix: string): ChatMessage[] {
  return [
    {
      id: `${prefix}-user-brief`,
      role: 'user',
      content: '按参考图片生成网站（参考图：reference.png）',
    },
    {
      id: `${prefix}-user-form`,
      role: 'user',
      content:
        '[表单答案 — discovery]\n目标平台：响应式网页 · 还原程度：高还原 · 交付范围：单页',
    },
  ];
}

export interface StallBreakerDemoResult {
  enabled: boolean;
  /** 叠加了演示消息后的列表；未启用时原样返回。 */
  messages: ChatMessage[];
  /** 与真实 streaming 取或，驱动 ChatPane 的流式态。 */
  streamingOverride: boolean;
  paneProps: StallBreakerPaneProps | null;
  controls: ReactNode | null;
}

export function useStallBreakerDemo({
  messages,
  activeConversationId,
  onCreateConversation,
  onSelectConversation,
}: {
  messages: ChatMessage[];
  activeConversationId: string | null;
  onCreateConversation: () => void | Promise<void>;
  onSelectConversation?: ((conversationId: string) => void) | undefined;
}): StallBreakerDemoResult {
  const [enabled] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('stallDemo'),
  );
  const [caseId, setCaseId] = useState<CaseId>('first-stall');
  const [beat, setBeat] = useState<Beat>('idle');
  const [silence, setSilence] = useState(0);
  const [thinkingShown, setThinkingShown] = useState(0);
  const [toolsShown, setToolsShown] = useState(0);
  const [retriesUsed, setRetriesUsed] = useState(0);
  const [stallCount, setStallCount] = useState(0);
  const [recovery, setRecovery] = useState<{
    action: StallRecoveryAction;
    modelId: string;
  } | null>(null);
  const [forkStage, setForkStage] = useState<'none' | 'pending' | 'active'>('none');
  const originConversationRef = useRef<string | null>(null);
  /** 真实创建成功时为新会话 id；fallback 模拟（同会话）时保持 null。 */
  const [forkedConversationId, setForkedConversationId] = useState<string | null>(null);

  const reset = useCallback((next?: CaseId) => {
    if (next) setCaseId(next);
    setBeat('idle');
    setSilence(0);
    setThinkingShown(0);
    setToolsShown(0);
    setRetriesUsed(0);
    setStallCount(0);
    setRecovery(null);
    setForkStage('none');
    setForkedConversationId(null);
    originConversationRef.current = null;
  }, []);

  const start = useCallback(() => {
    setBeat('generating');
    setSilence(0);
    setThinkingShown(0);
    setToolsShown(0);
    setRetriesUsed(0);
    setRecovery(null);
  }, []);

  // 生成阶段：thinking / 工具步骤逐条出现，然后进入静默。
  useEffect(() => {
    if (!enabled || beat !== 'generating') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    THINKING_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setThinkingShown(i + 1), 400 + i * 650));
    });
    timers.push(setTimeout(() => setToolsShown(1), 2400));
    timers.push(setTimeout(() => setToolsShown(2), 3000));
    timers.push(setTimeout(() => setBeat('stalling'), 3700));
    return () => timers.forEach(clearTimeout);
  }, [enabled, beat]);

  // 静默计时（R1 口径：从最后一次有效进展起算）。
  useEffect(() => {
    if (!enabled || beat !== 'stalling') return;
    const iv = setInterval(() => setSilence((s) => s + CLOCK_RATE / 10), 100);
    return () => clearInterval(iv);
  }, [enabled, beat]);

  useEffect(() => {
    if (!enabled || beat !== 'stalling') return;
    if (caseId === 'retry-storm') {
      const due = RETRY_BEATS.filter((t) => silence >= t).length;
      if (due > retriesUsed) setRetriesUsed(due);
    }
    if (silence >= BREAK_AT) {
      setBeat('broken');
      setStallCount((c) => c + 1);
    }
  }, [enabled, beat, silence, caseId, retriesUsed]);

  // 恢复动作 → 重新生成 →（成功 | double-stall 案例原样重试再次卡死）。
  useEffect(() => {
    if (!enabled || beat !== 'recovering') return;
    const failAgain =
      caseId === 'double-stall' && recovery?.action === 'same-retry' && stallCount < 2;
    const timer = setTimeout(() => {
      if (failAgain) {
        setBeat('broken');
        setStallCount((c) => c + 1);
      } else {
        setBeat('success');
      }
    }, 2600);
    return () => clearTimeout(timer);
  }, [enabled, beat, caseId, recovery, stallCount]);

  // 「新开会话继续」：等待真实会话创建完成后进入 forked 视图。
  // ProjectView 的 handleNewConversation 对「当前会话为空」有防抖 guard
  // （demo 会话没有真实消息时会被拦下），800ms 内没切换就退回原会话内
  // 模拟 forked 视图，保证演示闭环。
  useEffect(() => {
    if (!enabled || forkStage !== 'pending') return;
    if (
      activeConversationId &&
      activeConversationId !== originConversationRef.current
    ) {
      setForkedConversationId(activeConversationId);
      setForkStage('active');
      setBeat('recovering');
      return;
    }
    const fallback = setTimeout(() => {
      setForkedConversationId(null);
      setForkStage('active');
      setBeat('recovering');
    }, 800);
    return () => clearTimeout(fallback);
  }, [enabled, forkStage, activeConversationId]);

  const act = useCallback(
    (action: StallRecoveryAction, opts?: { modelId?: string; fromHint?: boolean }) => {
      const modelId = opts?.modelId ?? FAILED_MODEL;
      setRecovery({ action, modelId });
      if (action === 'new-session') {
        originConversationRef.current = activeConversationId;
        setForkStage('pending');
        void onCreateConversation();
        return;
      }
      setBeat('recovering');
    },
    [enabled, activeConversationId, onCreateConversation],
  );

  // ---------- 合成消息 ----------

  // forked 视图绑定新会话 id：真实 fork 后用户可切回原会话查看卡死现场；
  // fallback（同会话模拟）时 forkedConversationId 为 null，视图恒为 forked。
  const inForkedView =
    forkStage === 'active' &&
    (forkedConversationId === null || activeConversationId === forkedConversationId);

  const overlayMessages = useMemo<ChatMessage[]>(() => {
    if (!enabled || beat === 'idle') return messages;

    const forked = inForkedView;
    const originAfterFork = forkStage === 'active' && !forked;
    const base = forked ? [] : messages;
    const prefix = forked ? 'stall-demo-fork' : 'stall-demo';
    const model = recovery?.modelId ?? FAILED_MODEL;

    const out: ChatMessage[] = [...base, ...demoUserMessages(prefix)];

    if (!forked) {
      const events: AgentEvent[] = THINKING_LINES.slice(0, thinkingShown).map(
        (text) => ({ kind: 'thinking', text }),
      );
      if (toolsShown >= 1) {
        events.push({
          kind: 'tool_use',
          id: `${prefix}-tool-read`,
          name: 'Read',
          input: { file_path: 'reference.png' },
        });
        events.push({
          kind: 'tool_result',
          toolUseId: `${prefix}-tool-read`,
          content: '已读取参考图（1440×3200）',
          isError: false,
        });
      }
      if (toolsShown >= 2) {
        events.push({
          kind: 'tool_use',
          id: `${prefix}-tool-write`,
          name: 'Write',
          input: { file_path: 'index.html' },
        });
      }
      const inFlight = beat === 'generating' || beat === 'stalling';
      out.push({
        id: `${prefix}-assistant-stalled`,
        role: 'assistant',
        content: '',
        agentId: 'amr',
        agentName: 'AMR',
        events,
        runStatus: inFlight ? 'running' : 'canceled',
      });
    }

    if ((beat === 'recovering' || beat === 'success') && !originAfterFork) {
      const label =
        recovery?.action === 'switch-model'
          ? `已切换到 ${model}，正在重新生成……`
          : recovery?.action === 'new-session'
            ? '已携带上下文，正在重新生成……'
            : '正在原样重试……';
      out.push({
        id: `${prefix}-assistant-recovery-${stallCount}`,
        role: 'assistant',
        agentId: 'amr',
        agentName: 'AMR',
        content:
          beat === 'success'
            ? '网站已按参考图生成完毕：首屏、三列特性区与页脚均已还原，响应式断点在 768px / 1200px。文件已写入 index.html 与 styles.css，可在右侧预览。'
            : '',
        events: beat === 'success' ? [] : [{ kind: 'thinking', text: label }],
        runStatus: beat === 'success' ? 'succeeded' : 'running',
      });
    }

    return out;
  }, [enabled, beat, messages, forkStage, inForkedView, recovery, thinkingShown, toolsShown, stallCount, activeConversationId]);

  // ---------- ChatPane props ----------

  const streamingOverride =
    enabled && (beat === 'generating' || beat === 'stalling' || beat === 'recovering');

  const paneProps = useMemo<StallBreakerPaneProps | null>(() => {
    if (!enabled || beat === 'idle') return null;
    const phase: StallBreakerPaneProps['phase'] =
      beat === 'broken' ? 'broken' : beat === 'stalling' && silence >= HINT_AT ? 'hint' : 'stalling';
    // 携带数量来自种子数据本身；正式集成时由 fork 端点返回实际复制清单。
    const seeds = demoUserMessages('count');
    const seedAttachments = 1; // reference.png
    const forkNotice = inForkedView
      ? {
          carriedSummary: ` ${seeds.length} 条消息与 ${seedAttachments} 个附件`,
          onBackToOrigin:
            onSelectConversation && forkedConversationId && originConversationRef.current
              ? () => onSelectConversation(originConversationRef.current as string)
              : undefined,
        }
      : null;
    // fork 后回看原会话：只展示卡死现场，不再出恢复卡片（已在新会话处理）。
    const effectivePhase =
      forkStage === 'active' && !inForkedView && phase === 'broken' ? 'stalling' : phase;
    return {
      phase: effectivePhase,
      silenceLabel: formatClock(silence),
      retriesUsed,
      secondBreak: stallCount >= 2,
      failedModelId: FAILED_MODEL,
      failedModelStallCount: stallCount,
      modelOptions: MODEL_OPTIONS,
      forkNotice,
      onKeepWaiting: () => setSilence(BREAK_AT),
      onAction: act,
    };
  }, [enabled, beat, silence, retriesUsed, stallCount, forkStage, inForkedView, forkedConversationId, act, onSelectConversation]);

  // ---------- 演示控制面板 ----------

  const controls: ReactNode = enabled ? (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <strong>熔断 demo</strong>
        <span className={styles.clock} data-live={beat === 'stalling' ? 'true' : 'false'}>
          无有效进展 {beat === 'stalling' ? formatClock(silence) : '—'} <em>60×</em>
        </span>
      </div>
      <div className={styles.cases} role="radiogroup" aria-label="选择熔断 case">
        {CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={caseId === c.id}
            className={`${styles.caseItem} ${caseId === c.id ? styles.caseItemActive : ''}`}
            onClick={() => reset(c.id)}
            title={c.hint}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className={styles.buttons}>
        {beat === 'idle' ? (
          <Button variant="primary" onClick={start}>
            开始演示
          </Button>
        ) : (
          <Button variant="subtle" onClick={() => reset()}>
            重置
          </Button>
        )}
        <Button
          disabled={beat !== 'stalling' || silence >= HINT_AT}
          onClick={() => setSilence(HINT_AT)}
        >
          跳到卡顿提示
        </Button>
        <Button disabled={beat !== 'stalling'} onClick={() => setSilence(BREAK_AT)}>
          跳到熔断
        </Button>
      </div>
    </div>
  ) : null;

  if (!enabled) {
    return { enabled, messages, streamingOverride: false, paneProps: null, controls: null };
  }
  return { enabled, messages: overlayMessages, streamingOverride, paneProps, controls };
}
