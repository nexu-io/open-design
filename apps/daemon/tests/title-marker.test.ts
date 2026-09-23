import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createAgentTitleMarkerStripper } from '../src/title-marker.js';

function createStripper() {
  const titles: string[] = [];
  const stripper = createAgentTitleMarkerStripper({
    enabled: true,
    emitTitle: (title) => titles.push(title),
  });
  return { stripper, titles };
}

test('title marker stripper parses prefix marker and answer from one delta', () => {
  const { stripper, titles } = createStripper();

  const visible = stripper.strip('\n<od-title>Foo</od-title>\nAnswer');

  assert.equal(visible, '\n\nAnswer');
  assert.deepEqual(titles, ['Foo']);
  assert.equal(stripper.flush(), '');
});

test('title marker stripper parses markers split across deltas', () => {
  const { stripper, titles } = createStripper();

  assert.equal(stripper.strip('Before <od-'), 'Before ');
  assert.equal(stripper.strip('title>Split Title</od-title> After'), ' After');

  assert.deepEqual(titles, ['Split Title']);
  assert.equal(stripper.flush(), '');
});

test('title marker stripper drops malformed marker content without throwing', () => {
  const { stripper, titles } = createStripper();

  assert.equal(stripper.strip('Lead <od-title>unfinished'), 'Lead ');
  assert.equal(stripper.flush(), '');
  assert.deepEqual(titles, []);
});

/*
 * 红测:**没请求生成标题时,标记也不许漏进正文**。
 *
 * 线上量到的:`<od-title>编辑级羊皮纸单页</od-title>` 原样出现在聊天正文第一行。
 * 真因是调用点写的 `enabled: Boolean(titleGenerationRequested)` —— 不请求标题就把
 * 剥离器整个关掉;而模型是按系统提示词吐这个标记的,它并不知道这一轮我们要不要标题。
 *
 * 「要不要拿它命名会话」和「它能不能出现在正文里」是两件事:后者永远是否。
 */
test('title marker never leaks into visible text, even when no title was requested', () => {
  const titles: string[] = [];
  const stripper = createAgentTitleMarkerStripper({
    enabled: false,
    emitTitle: (title) => titles.push(title),
  });

  assert.equal(stripper.strip('<od-title>Foo</od-title>Answer'), 'Answer');
  assert.equal(stripper.flush(), '');
  // 没请求标题就不该往上报,但正文必须干净
  assert.deepEqual(titles, []);
});

// A Run that never asked for a title still has to consume the marker: the
// directive lives in the agent's own session history, so a resumed CLI can
// repeat it on a later turn. server.ts therefore keeps `enabled` on for every
// Run and only swaps the announce callback.
test('title marker stripper consumes the marker without announcing a title', () => {
  const titles: string[] = [];
  const stripper = createAgentTitleMarkerStripper({
    enabled: true,
    emitTitle: () => {},
  });

  assert.equal(
    stripper.strip('Lead in\n<od-title>Leaked Title</od-title>\nReal answer'),
    'Lead in\n\nReal answer',
  );
  assert.equal(stripper.flush(), '');
  assert.deepEqual(titles, []);
});
