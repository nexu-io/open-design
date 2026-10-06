/**
 * 历史会话的事件流样本 —— **不带 done 密钥**的那种。
 *
 * done 标记从「裸 `<done/>`」换成「每轮一次性密钥」之后,已经落库的消息里一条
 * `done_key` 事件都没有。这批样本存在的唯一目的,是把「没有 key 的轮次」的落块
 * 结果钉死在改动前的样子:既不能因为查不到 key 就把正文一律吞进折叠的抽屉,
 * 也不能一律甩到壳外。
 *
 * 覆盖面按「历史消息里真的会出现什么」挑,不是按代码分支挑:
 *  · 裸 `<done/>` + 清单还开着(最常见的 D43 主路径)
 *  · 裸 `<done/>` 之前清单已经全关(兜底 (a) 抢先把 doneSeen 置上的那条路)
 *  · 完全没有 done,靠 run 结束时 liftConclusion 提结论
 *  · 隐式 done(`<artifact>` / `<question-form>`)
 *  · 标记写在代码块 / 行内代码里(不算信号)
 *  · 一条 done 都没有、也没有清单的纯聊天轮
 */
import type { PersistedAgentEvent } from '@open-design/contracts';
import type { BuildTurnInput } from '../../../src/runtime/chat/contract';

const todos = (id: string, items: Array<[string, string]>): PersistedAgentEvent => ({
  kind: 'tool_use',
  id,
  name: 'TodoWrite',
  input: { todos: items.map(([content, status]) => ({ content, status })) },
});

const call = (id: string, name: string, input: unknown, at: number): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name, input, startedAt: at },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false, completedAt: at + 1_200 },
]);

export const HISTORICAL_TURN_FIXTURES: Record<string, BuildTurnInput> = {
  /** 主路径:清单还开着的时候发了裸 done,结论要跳出 todo 落到壳外 */
  'bare-done-while-todo-open': {
    events: [
      { kind: 'status', label: 'starting' },
      { kind: 'thinking', text: '先看看现有文件。' },
      ...call('t1', 'Read', { file_path: '/p/index.html' }, 1_000),
      todos('p1', [['改首屏', 'in_progress'], ['补页脚', 'pending']]),
      { kind: 'text', text: '正在改首屏的标题。' },
      ...call('t2', 'Write', { file_path: '/p/index.html' }, 3_000),
      { kind: 'text', text: '<done/>首屏改好了,页脚下轮再说。' },
    ],
    runStatus: 'succeeded',
  },

  /** 清单先全关(兜底 (a) 已经把 doneSeen 置上),裸 done 才到 */
  'bare-done-after-todos-closed': {
    events: [
      { kind: 'status', label: 'starting' },
      todos('p1', [['改首屏', 'in_progress'], ['补页脚', 'pending']]),
      { kind: 'text', text: '正在改首屏的标题。' },
      ...call('t1', 'Write', { file_path: '/p/index.html' }, 3_000),
      todos('p2', [['改首屏', 'completed'], ['补页脚', 'completed']]),
      { kind: 'text', text: '<done/>首屏和页脚都改好了。' },
    ],
    runStatus: 'succeeded',
  },

  /** 整轮没发过 done —— 靠 run 结束那一刻的 liftConclusion 提最后一段 */
  'no-done-lift-conclusion': {
    events: [
      { kind: 'status', label: 'starting' },
      todos('p1', [['整理配色', 'in_progress']]),
      { kind: 'text', text: '把主色统一成品牌绿。' },
      ...call('t1', 'Edit', { file_path: '/p/tokens.css' }, 2_000),
      { kind: 'text', text: '配色统一好了。' },
    ],
    runStatus: 'succeeded',
  },

  /** 隐式 done:产物块 */
  'implicit-done-artifact': {
    events: [
      { kind: 'status', label: 'starting' },
      todos('p1', [['出页面', 'in_progress']]),
      { kind: 'text', text: '正在拼页面。' },
      { kind: 'text', text: '给你:\n<artifact type="text/html">\n<!doctype html>' },
    ],
    runStatus: 'succeeded',
  },

  /** 隐式 done:问答表单 */
  'implicit-done-question-form': {
    events: [
      { kind: 'status', label: 'starting' },
      { kind: 'text', text: '先确认方向。' },
      { kind: 'text', text: '<question-form id="discovery">' },
    ],
    runStatus: 'succeeded',
  },

  /** 标记写在代码里 —— 不算信号,正文继续跟着 todo 走 */
  'marker-inside-code': {
    events: [
      { kind: 'status', label: 'starting' },
      todos('p1', [['写文档', 'in_progress']]),
      { kind: 'text', text: '这个标记写作 `<done/>`,别手打。' },
      { kind: 'text', text: '例子:\n```html\n<artifact type="html">x</artifact>\n```\n继续。' },
    ],
    runStatus: 'succeeded',
  },

  /** 纯聊天:没有清单、没有 done,正文一路落在壳外 */
  'plain-chat-turn': {
    events: [
      { kind: 'status', label: 'starting' },
      { kind: 'text', text: '这是一段普通回答,' },
      { kind: 'text', text: '没有任何标记。' },
    ],
    runStatus: 'succeeded',
  },

  /** 还在流式中途的历史快照(重连回放会走到这条) */
  'streaming-midway': {
    events: [
      { kind: 'status', label: 'starting' },
      todos('p1', [['改首屏', 'in_progress']]),
      { kind: 'text', text: '正在改首屏' },
    ],
    runStatus: 'running',
  },

  /** 手动停止 */
  'canceled-turn': {
    events: [
      { kind: 'status', label: 'starting' },
      todos('p1', [['改首屏', 'in_progress'], ['补页脚', 'pending']]),
      { kind: 'text', text: '正在改首屏。' },
    ],
    runStatus: 'canceled',
  },
};
