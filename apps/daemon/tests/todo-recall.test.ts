/**
 * Todo 召回通路 —— daemon 这一半。
 *
 * 全链路在此之前**没有任何通路**把上一轮的 todo 送回给 agent:
 * 历史是 `buildDaemonTranscript` 拼的纯文本,只取 `message.content`,而 `content`
 * 只累加 `kind === 'text'` 的事件 —— TodoWrite 是 `tool_use`,永远进不了。
 *
 * 这一组钉住三件事:
 *  ① 从库里找得到上一轮那份清单(找不到 → 空;全做完 → 渲染成 null,什么都不注入);
 *  ② 渲染出来的那段字是**陈述事实 + 把决定权交出去**,不是命令;
 *  ③ 它进了本轮 user 正文,**续跑(skipTranscript)与非续跑两条分支都进**。
 *    这是唯一同时覆盖两条分支的钥匙孔:续跑的 6 家 runtime 整个 transcript 被丢掉,
 *    只加在 transcript 上等于对它们没做。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  latestTodoWriteInputForConversation,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { composeChatUserRequestForAgent } from '../src/server.js';
import {
  TODO_RECALL_HEADING,
  renderUnfinishedTodoRecall,
  recalledTodosFromTodoWriteInput,
} from '@open-design/contracts';

const TODO_WRITE = (todos: Array<{ content: string; status: string }>, id = 'tw-1') => ({
  kind: 'tool_use' as const,
  id,
  name: 'TodoWrite',
  input: { todos },
});

describe('上一轮未完成 todo:从库里读出来', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-todo-recall-'));
  });
  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seed() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1', projectId: 'proj-1', title: 'C', createdAt: now, updatedAt: now,
    });
    return db;
  }

  function seedAssistant(
    db: ReturnType<typeof seed>,
    id: string,
    events: unknown[] | undefined,
    runStatus: string | null = 'succeeded',
  ) {
    upsertMessage(db, 'conv-1', { id, role: 'assistant', content: '', runStatus, events });
  }

  it('拿到上一轮最后一份清单 —— 整份,已完成那几条也在里面(W99)', () => {
    const db = seed();
    seedAssistant(db, 'a1', [
      TODO_WRITE([
        { content: '搭定价区', status: 'completed' },
        { content: '补 FAQ', status: 'pending' },
        { content: '过一遍响应式', status: 'in_progress' },
      ]),
    ]);
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(recalledTodosFromTodoWriteInput(input)).toEqual([
      { content: '搭定价区', status: 'completed' },
      { content: '补 FAQ', status: 'pending' },
      { content: '过一遍响应式', status: 'in_progress' },
    ]);
  });

  it('同一条消息里发过多份清单时,只认最后那份', () => {
    const db = seed();
    seedAssistant(db, 'a1', [
      TODO_WRITE([{ content: '第一版计划', status: 'pending' }], 'tw-1'),
      TODO_WRITE([{ content: '重新规划后的活', status: 'pending' }], 'tw-2'),
    ]);
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(recalledTodosFromTodoWriteInput(input)).toEqual([
      { content: '重新规划后的活', status: 'pending' },
    ]);
  });

  // 闸门从「读」挪到了「渲染」(W99):读回来的仍是整份清单,
  // 而「一条没干完的都没有 → 什么都不注入」由 `renderUnfinishedTodoRecall` 判。
  it('上一轮全做完 → 一个字都不注入', () => {
    const db = seed();
    seedAssistant(db, 'a1', [
      TODO_WRITE([
        { content: '搭定价区', status: 'completed' },
        { content: '补 FAQ', status: 'completed' },
      ]),
    ]);
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(renderUnfinishedTodoRecall(recalledTodosFromTodoWriteInput(input))).toBeNull();
  });

  it('中间夹着一轮没发清单的回答,仍然往前找得到', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE([{ content: '补 FAQ', status: 'pending' }])]);
    seedAssistant(db, 'a2', [{ kind: 'text', text: '顺手回答了个别的问题' }]);
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(recalledTodosFromTodoWriteInput(input)).toEqual([
      { content: '补 FAQ', status: 'pending' },
    ]);
  });

  it('本轮自己那条在飞的占位消息不算「上一轮」', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE([{ content: '旧的活', status: 'pending' }])]);
    seedAssistant(db, 'a-current', [TODO_WRITE([{ content: '本轮刚发的', status: 'pending' }])], null);
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(recalledTodosFromTodoWriteInput(input)).toEqual([
      { content: '旧的活', status: 'pending' },
    ]);
  });

  it('这条会话从没发过清单 → null', () => {
    const db = seed();
    seedAssistant(db, 'a1', [{ kind: 'text', text: '纯文字回答' }]);
    expect(latestTodoWriteInputForConversation(db, 'conv-1', 'a-current')).toBeNull();
    expect(recalledTodosFromTodoWriteInput(null)).toEqual([]);
  });
});

describe('召回段的措辞:陈述事实,决定权交给 agent', () => {
  const TODOS = [
    { content: '补 FAQ', status: 'pending' },
    { content: '过一遍响应式', status: 'in_progress' },
  ];

  it('列出每一条,原文照抄', () => {
    const block = renderUnfinishedTodoRecall(TODOS);
    expect(block).toContain('补 FAQ');
    expect(block).toContain('过一遍响应式');
    expect(block).toContain(TODO_RECALL_HEADING);
  });

  it('明说这不是指令,三条路(接着做 / 重新规划 / 放着不管)都摆出来', () => {
    const block = renderUnfinishedTodoRecall(TODOS) ?? '';
    // 决定权交出去 —— 不能写成命令
    expect(block).toMatch(/\byou decide\b/i);
    expect(block).toMatch(/not an instruction/i);
    expect(block).toMatch(/\bpick .* back up\b/i);
    expect(block).toMatch(/\breplan\b/i);
    expect(block).toMatch(/asking about something else/i);
    // 命令式的祈使句不许出现
    expect(block).not.toMatch(/\byou must\b/i);
    expect(block).not.toMatch(/\bcontinue these tasks\b/i);
  });

  it('空清单 → 不渲染任何东西', () => {
    expect(renderUnfinishedTodoRecall([])).toBeNull();
  });
});

describe('召回段进本轮 user 正文', () => {
  const TODOS = [{ content: '补 FAQ', status: 'pending' }];

  it('非续跑分支:召回段 + 完整 transcript 都在', () => {
    const prompt = composeChatUserRequestForAgent('## user\n换个配色', '换个配色', {
      previousTurnTaskList: TODOS,
    });
    expect(prompt).toContain('补 FAQ');
    expect(prompt).toContain('## user\n换个配色');
  });

  it('续跑分支(skipTranscript):召回段照样进,本轮那句话也在', () => {
    const prompt = composeChatUserRequestForAgent('## user\n换个配色', '换个配色', {
      skipTranscript: true,
      previousTurnTaskList: TODOS,
    });
    expect(prompt).toContain('补 FAQ');
    expect(prompt).toContain('换个配色');
    // 续跑时上游自带历史,transcript 仍然不许重发
    expect(prompt).not.toContain('## user\n换个配色');
  });

  it('答表单那一轮也带得上(transition 与召回段共存)', () => {
    const answers = '[form answers - discovery]\n- 风格: 极简';
    const prompt = composeChatUserRequestForAgent('## user\n' + answers, answers, {
      skipTranscript: true,
      previousTurnTaskList: TODOS,
    });
    expect(prompt).toContain('补 FAQ');
    expect(prompt).toContain('discovery');
  });

  it('没有未完成的活 → 正文与从前**逐字节相同**', () => {
    const base = composeChatUserRequestForAgent('## user\n换个配色', '换个配色');
    expect(
      composeChatUserRequestForAgent('## user\n换个配色', '换个配色', {
        previousTurnTaskList: [],
      }),
    ).toBe(base);

    const skipBase = composeChatUserRequestForAgent('## user\n换个配色', '换个配色', {
      skipTranscript: true,
    });
    expect(
      composeChatUserRequestForAgent('## user\n换个配色', '换个配色', {
        skipTranscript: true,
        previousTurnTaskList: [],
      }),
    ).toBe(skipBase);
  });
});
