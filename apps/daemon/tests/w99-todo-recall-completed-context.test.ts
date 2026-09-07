/**
 * W99 · 召回块要带上「上一轮已经做完的那几条」—— daemon 这一半。
 *
 * 现场:用户中止了一轮 4 步的活(前 2 步已完成),问了个无关问题,再说「继续之前的
 * 设计」。agent 确实接上了那两条没做完的,但它重发的新清单**只有 2 步** —— 上一轮
 * 做完的两条整个消失了,于是输入框上那枚药丸说「第 3/4 步」、流水里的卡说「2 步」。
 *
 * 根因不在模型:已完成那几条是 daemon 在**建提示词之前**就过滤掉的,agent 从头到尾
 * 没见过它们。所以这一组钉的是「召回块里到底有什么」,不是措辞好不好。
 *
 * 四件事:
 *  ① 正向 —— 被中止的轮次里 2 完成 + 2 未完成,四条**都在块里**,已完成的标成完成;
 *  ② 防重做 —— 块里必须一眼看出那两条是**既成事实**,不是待办;
 *  ③ 反向 —— 全做完仍旧一条都不注入(闸门没被拆);成功结束的轮次表现不变;
 *     没发过清单的会话正文**逐字节**不变;
 *  ④ 回看窗口仍然是 8 条。
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
  recalledTodosFromTodoWriteInput,
  renderUnfinishedTodoRecall,
} from '@open-design/contracts';

const TODO_WRITE = (todos: Array<{ content: string; status: string }>, id = 'tw-1') => ({
  kind: 'tool_use' as const,
  id,
  name: 'TodoWrite',
  input: { todos },
});

/** 票上那一轮:4 步,中止时前两步已经做完 */
const ABORTED_TURN = [
  { content: '搭定价区', status: 'completed' },
  { content: '补 FAQ', status: 'completed' },
  { content: '过一遍响应式', status: 'in_progress' },
  { content: '出交付稿', status: 'pending' },
];

describe('W99 · 被中止那一轮的清单:四条都要回到 agent 眼前', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-w99-todo-recall-'));
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

  /** 从库里走完整条路:选出上一轮的清单 → 渲染成召回块 */
  function recallBlockFor(db: ReturnType<typeof seed>): string {
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    return renderUnfinishedTodoRecall(recalledTodosFromTodoWriteInput(input)) ?? '';
  }

  it('① 中止轮次的四条全在块里,已完成的两条一条都没少', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    const block = recallBlockFor(db);
    for (const todo of ABORTED_TURN) {
      expect({ content: todo.content, inBlock: block.includes(todo.content) })
        .toEqual({ content: todo.content, inBlock: true });
    }
  });

  it('① 已完成的两条被**标成已完成**,不是混在未完成里', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    const block = recallBlockFor(db);
    // 每一条自己那一行上就写着状态 —— agent 不需要去别处对照
    expect(block).toMatch(/\[completed\][^\n]*搭定价区/);
    expect(block).toMatch(/\[completed\][^\n]*补 FAQ/);
    expect(block).toMatch(/\[in_progress\][^\n]*过一遍响应式/);
    expect(block).toMatch(/\[pending\][^\n]*出交付稿/);
  });

  it('② 防重做:块里明说那几条是既成事实,不要再做一遍', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    const block = recallBlockFor(db);
    expect(block).toMatch(/already (finished|done)/i);
    expect(block).toMatch(/\bdo not (redo|repeat|run that work again)\b/i);
    // 决定权仍旧交出去 —— 防重做不能顺手变成「必须接着做」
    expect(block).toMatch(/not an instruction/i);
    expect(block).toMatch(/\byou decide\b/i);
    expect(block).not.toMatch(/\byou must\b/i);
  });

  it('② 让它重发时把已完成的按已完成重发,清单才不会缩水', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    const block = recallBlockFor(db);
    expect(block).toMatch(/list (the whole|all of|every)/i);
    expect(block).toMatch(/still marked completed|keep(ing)? .*completed/i);
  });

  it('① 召回块真的进了本轮 user 正文(续跑 / 非续跑两条分支都进)', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    const todos = recalledTodosFromTodoWriteInput(
      latestTodoWriteInputForConversation(db, 'conv-1', 'a-current'),
    );
    const plain = composeChatUserRequestForAgent('## user\n继续之前的设计', '继续之前的设计', {
      previousTurnTaskList: todos,
    });
    const resumed = composeChatUserRequestForAgent('## user\n继续之前的设计', '继续之前的设计', {
      skipTranscript: true,
      previousTurnTaskList: todos,
    });
    for (const body of [plain, resumed]) {
      expect(body).toContain('搭定价区');
      expect(body).toContain('出交付稿');
    }
  });

  it('③ 反向:上一轮全做完 → 一条都不注入(闸门没被拆)', () => {
    const db = seed();
    seedAssistant(db, 'a1', [
      TODO_WRITE([
        { content: '搭定价区', status: 'completed' },
        { content: '补 FAQ', status: 'completed' },
      ]),
    ], 'canceled');
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(renderUnfinishedTodoRecall(recalledTodosFromTodoWriteInput(input))).toBeNull();
  });

  it('③ 反向:成功结束的轮次,块的形态和中止轮次一模一样', () => {
    const db = seed();
    seedAssistant(db, 'a1', [TODO_WRITE(ABORTED_TURN)], 'succeeded');
    const succeeded = recallBlockFor(db);
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-w99-todo-recall-'));
    const db2 = seed();
    seedAssistant(db2, 'a1', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    expect(succeeded).toBe(recallBlockFor(db2));
  });

  it('③ 反向:这条会话没发过清单 → 正文与从前逐字节相同', () => {
    const db = seed();
    seedAssistant(db, 'a1', [{ kind: 'text', text: '纯文字回答' }]);
    const input = latestTodoWriteInputForConversation(db, 'conv-1', 'a-current');
    expect(input).toBeNull();
    expect(recalledTodosFromTodoWriteInput(input)).toEqual([]);

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

  it('④ 反向:回看窗口仍然是 8 条 —— 第 9 条之外的清单不召回', () => {
    const db = seed();
    seedAssistant(db, 'a0', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    for (let i = 1; i <= 8; i += 1) {
      seedAssistant(db, `a${i}`, [{ kind: 'text', text: `第 ${i} 条纯文字` }]);
    }
    expect(latestTodoWriteInputForConversation(db, 'conv-1', 'a-current')).toBeNull();
  });

  it('④ 正向对照:同样的会话只隔 7 条纯文字时,仍然召回得到', () => {
    const db = seed();
    seedAssistant(db, 'a0', [TODO_WRITE(ABORTED_TURN)], 'canceled');
    for (let i = 1; i <= 7; i += 1) {
      seedAssistant(db, `a${i}`, [{ kind: 'text', text: `第 ${i} 条纯文字` }]);
    }
    expect(recallBlockFor(db)).toContain('搭定价区');
  });
});
