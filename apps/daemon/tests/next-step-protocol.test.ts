/**
 * 下一步引导的**协议侧**:标记进来,事件出去,正文里什么都不留。
 *
 * 三件事必须成立:
 *   1. `next_steps` 事件能落库 —— 刷新之后那三行还在,和实时看到的一样;
 *   2. 没有这个事件的老消息**原样不动** —— 旧会话不出这一行是设计,不是缺陷;
 *   3. 标记不进 `content` —— `content` 是复制 / 导出 / 旧渲染路径读的东西。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendMessageAgentEvent,
  closeDatabase,
  finalizeMessageAgentEvents,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { daemonAgentPayloadToPersistedAgentEvent } from '../src/runtimes/chat-run-messages.js';
import {
  parseNextStepSuggestions,
  parseNextStepMarkerValue,
  renderNextStepMarkerExample,
  stripNextStepMarkers,
} from '@open-design/contracts';

const KEY = 'a7f3c91ed2b40561';
const THREE = ['再加一页订单列表', '把商品卡换成两列布局', '补一套深色模式'];

describe('next-step marker · 契约形状', () => {
  it('提示词里的例子和解析器读的是同一份格式', () => {
    const rendered = renderNextStepMarkerExample(KEY, THREE);
    const markers = rendered.split('\n');
    expect(markers).toHaveLength(3);
    expect(markers[0]).toBe(`<od-next key="${KEY}" value="再加一页订单列表"/>`);
    expect(markers.every((marker) => marker.endsWith('/>'))).toBe(true);
    // 例子必须能被自己的解析器读回来 —— 两边各写一份迟早会分家
    expect(markers.map((marker) => parseNextStepMarkerValue(marker))).toEqual(THREE);
  });

  it('剥离整块,连没写 key 的、闭合歪了的也一起吃掉', () => {
    expect(stripNextStepMarkers(`好了。${renderNextStepMarkerExample(KEY, THREE)}`)).toBe('好了。');
    expect(stripNextStepMarkers('好了。<od-next>\n把首页删掉\n</od-next>')).toBe('好了。');
    // 孤立的开 / 闭标签也是协议噪音
    expect(stripNextStepMarkers('好了。</od-next>')).toBe('好了。');
    expect(stripNextStepMarkers('没有标记的正文')).toBe('没有标记的正文');
  });

  it('只移除包住整句的引号,保留句子内部成对中文引号', () => {
    expect(parseNextStepSuggestions('“整句被引住”')).toEqual(['整句被引住']);
    expect(parseNextStepSuggestions('把副标题改为中文“直接编辑验证完成”')).toEqual([
      '把副标题改为中文“直接编辑验证完成”',
    ]);
  });
});

describe('next-step 事件 · 落库与回放', () => {
  it('把 next_steps 载荷翻成可落库的事件', () => {
    expect(
      daemonAgentPayloadToPersistedAgentEvent({ type: 'next_steps', suggestions: THREE }),
    ).toEqual({ kind: 'next_steps', suggestions: THREE });
  });

  it('多于三条时截断 —— 界面固定三行', () => {
    expect(
      daemonAgentPayloadToPersistedAgentEvent({
        type: 'next_steps',
        suggestions: [...THREE, '第四条'],
      }),
    ).toEqual({ kind: 'next_steps', suggestions: THREE });
  });

  it('空的 / 全是空白的载荷不落库 —— 空壳不如不出', () => {
    expect(
      daemonAgentPayloadToPersistedAgentEvent({ type: 'next_steps', suggestions: [] }),
    ).toBeNull();
    expect(
      daemonAgentPayloadToPersistedAgentEvent({ type: 'next_steps', suggestions: ['  ', ''] }),
    ).toBeNull();
    expect(daemonAgentPayloadToPersistedAgentEvent({ type: 'next_steps' })).toBeNull();
  });

  describe('落库', () => {
    let tempDir: string;
    beforeEach(() => {
      tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-next-step-'));
    });
    afterEach(() => {
      closeDatabase();
      rmSync(tempDir, { recursive: true, force: true });
    });

    function seed(db: ReturnType<typeof openDatabase>) {
      const now = Date.now();
      insertProject(db, { id: 'p1', name: 'P', createdAt: now, updatedAt: now });
      insertConversation(db, { id: 'c1', projectId: 'p1', title: 'T', createdAt: now, updatedAt: now });
      upsertMessage(db, 'c1', { id: 'm1', role: 'assistant', content: '', runId: 'r1' });
    }

    it('事件跟着这一轮存下来,刷新之后那三行还在', () => {
      const db = openDatabase(tempDir, { dataDir: tempDir });
      seed(db);
      appendMessageAgentEvent(db, 'm1', { kind: 'text', text: '两页都做完了。' });
      appendMessageAgentEvent(db, 'm1', { kind: 'next_steps', suggestions: THREE });
      finalizeMessageAgentEvents(db, 'm1');

      const message = listMessages(db, 'c1').find((m) => m.id === 'm1');
      expect(message?.content).toBe('两页都做完了。');
      expect(message?.events ?? []).toContainEqual({ kind: 'next_steps', suggestions: THREE });
    });

    /**
     * 旧会话兼容(产品硬要求)。改动之前的消息里没有这个事件,回放出来必须
     * 和改动前**逐字一致** —— 不许因为「没有建议」就动正文,也不许补一个默认值。
     */
    it('没有这个事件的老消息原样回放', () => {
      const db = openDatabase(tempDir, { dataDir: tempDir });
      seed(db);
      appendMessageAgentEvent(db, 'm1', { kind: 'text', text: '两页都做完了。' });
      finalizeMessageAgentEvents(db, 'm1');

      const message = listMessages(db, 'c1').find((m) => m.id === 'm1');
      expect(message?.content).toBe('两页都做完了。');
      expect((message?.events ?? []).some((e) => e.kind === 'next_steps')).toBe(false);
    });

    /**
     * 兜底:流式那一层已经把标记剥掉了,所以正常路径下 text 事件里不会有它。
     * 这条守的是「万一有别的路径绕过了剥离器」—— `content` 是复制 / 导出读的东西,
     * 那里出现一枚协议标签就是线上事故(`<od-title>` 已经这样翻过一次车)。
     */
    it('万一标记混进了 text 事件,也不进 content', () => {
      const db = openDatabase(tempDir, { dataDir: tempDir });
      seed(db);
      appendMessageAgentEvent(db, 'm1', { kind: 'text', text: '两页都做完了。' });
      appendMessageAgentEvent(db, 'm1', {
        kind: 'text',
        text: renderNextStepMarkerExample(KEY, THREE),
      });
      finalizeMessageAgentEvents(db, 'm1');

      const message = listMessages(db, 'c1').find((m) => m.id === 'm1');
      expect(message?.content).toBe('两页都做完了。');
      expect(message?.content).not.toContain('od-next');
      expect(message?.content).not.toContain('再加一页订单列表');
    });
  });
});
