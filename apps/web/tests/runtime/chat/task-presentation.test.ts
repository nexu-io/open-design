import { expect, it } from 'vitest';
import type { ChatMessage, TaskDisplayProjection } from '@open-design/contracts';
import { automaticTaskProse, newerTaskDisplay, taskDisplayElapsed, taskRecordParts, withTaskPresentation } from '../../../src/runtime/chat/task-presentation';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';

const projection: TaskDisplayProjection = { id: 'task', revision: 3, currentRunId: 'answer-run',
  runIds: ['question-run', 'answer-run'], state: 'running', elapsedMs: 27_000, observedAt: 500_000, ticking: true };

it('keeps question answers in their own turn without new waiting or continuation rows', () => {
  const messages: ChatMessage[] = [
    { id: 'question', role: 'assistant', runId: 'question-run', runStatus: 'succeeded', strategyTaskExecutionId: 'question-task',
      taskDisplay: {...projection,id:'question-task',runIds:['question-run'],currentRunId:'question-run',state:'waiting'}, content: '<question-form id="q">Choose a direction.</question-form>',
      events: [{ kind: 'thinking', text: 'Plan' }, { kind: 'text', text: '<question-form id="q">Choose a direction.</question-form>' }] },
    { id: 'answer', role: 'user', content: 'Green' },
    { id: 'result', role: 'assistant', runId: 'answer-run', runStatus: 'running', strategyTaskExecutionId: 'answer-task',
      taskDisplay: projection, content: '', events: [{ kind: 'tool_use', id: 'write', name: 'Write', input: { file_path: 'index.html', content: 'Site' } }] },
  ];
  const displayed = withTaskPresentation(messages);
  expect(displayed.map(m => m.id)).toEqual(['question','answer','result']);
  expect(displayed.filter(m => m.taskPresentation?.owner).map(m => m.id)).toEqual(['question','result']);
  const parts = taskRecordParts(displayed[0]!.taskPresentation!.messages);
  expect(parts.filter(p => 'shell' in p)).toHaveLength(1);
  expect(parts.some(p => 'marker' in p)).toBe(false);
  expect(parts.some(p => 'text' in p && p.text.includes('question-form'))).toBe(false);
});

it('rejects older state snapshots without blocking authoritative clock correction', () => {
  expect(newerTaskDisplay(projection,{...projection, revision:2,state:'waiting',elapsedMs:18_000})).toBe(projection);
  expect(newerTaskDisplay(projection,{...projection, revision:4,state:'completed',elapsedMs:26_000})).toMatchObject({state:'completed',elapsedMs:26_000});
  expect(taskDisplayElapsed(projection,502_000)).toBe(29_000);
  expect(taskDisplayElapsed({...projection,state:'waiting',ticking:false},502_000)).toBe(27_000);
  expect(taskDisplayElapsed({...projection,elapsedMs:null},502_000)).toBeNull();
  const current: ChatMessage = {id:'current',role:'assistant',runId:'answer-run',content:'',taskDisplay:projection};
  const previous = withTaskPresentation([current]);
  const stale = withTaskPresentation([{...current,taskDisplay:{...projection,revision:2,state:'waiting'}}],previous);
  expect(stale[0]?.taskPresentation?.display).toMatchObject({revision:3,state:'running'});
});

it('gives an ordinary new request its own state and record', () => {
  const old: ChatMessage = { id:'old',role:'assistant',runId:'question-run',taskDisplay:{...projection,state:'completed'},content:'Done' };
  const next: ChatMessage = { id:'new',role:'assistant',runId:'new-run',taskDisplay:{...projection,id:'new-task',runIds:['new-run'],currentRunId:'new-run'},content:'' };
  expect(withTaskPresentation([old,next]).filter(m=>m.taskPresentation?.owner)).toHaveLength(2);
});

it('retains delivery and recovery updates when the process content has not changed', () => {
  const message: ChatMessage = { id:'result', role:'assistant', runId:'answer-run', taskDisplay:projection,
    content:'Site', resultDeliveryState:'delivered' };
  const previous = withTaskPresentation([message]);
  const next = withTaskPresentation([{...message, resultDeliveryState:'delivery_failed', resumable:true}], previous);
  expect(next[0]).toMatchObject({resultDeliveryState:'delivery_failed', resumable:true});
});

it('includes pending media from every physical Run in the one execution record', () => {
  const messages: ChatMessage[] = [{id:'result',role:'assistant',runId:'answer-run',runStatus:'running',content:''}];
  const parts = taskRecordParts(messages, undefined, {
    mediaTasksByRunId: new Map([['answer-run', [{taskId:'image',runId:'answer-run',status:'running',surface:'image',
      startedAt:100,endedAt:null,elapsed:0,progress:[],progressCount:0}]]]),
  });
  expect(parts.filter(p => 'shell' in p).flatMap(p => 'shell' in p ? p.shell.items : []).filter(item => item.kind === 'image')).toHaveLength(1);
});

it('keeps a formal conclusion outside the record when the same Run continues with tools', () => {
  const message: ChatMessage = { id: 'production', role: 'assistant', runId: 'answer-run', runStatus: 'running',
    strategyTaskExecutionId: 'task', content: '', events: [
      { kind: 'done_key', key: 'aaaaaaaaaaaaaaaa' },
      { kind: 'text', text: '<od-done key="aaaaaaaaaaaaaaaa"/>Please confirm this design proposal.' },
      { kind: 'tool_use', id: 'todo', name: 'TodoWrite', input: { todos: [{ content: 'Check layout', status: 'in_progress' }] } },
    ] };
  const blocks = buildTurnBlocks({ events: message.events!, runStatus: 'running' });
  const index = blocks.findIndex(b => b.kind === 'prose');
  expect(index).toBeGreaterThanOrEqual(0);
  expect(automaticTaskProse(blocks, index, message, [message])).toBe(false);
  expect(taskRecordParts([message]).some(part => 'text' in part && part.text.includes('confirm'))).toBe(false);
});

it.each([true, false])('preserves chronological planning and production blocks (planning done: %s)', explicitDone => {
  const message: ChatMessage = { id: 'folded', role: 'assistant', runId: 'answer-run', runStatus: 'succeeded',
    strategyTaskExecutionId: 'task', strategyTaskPrefixEventCount: 3, content: '', events: [
      {kind: 'done_key', key: 'aaaaaaaaaaaaaaaa', runStartedAt: 1000, runEndedAt: 6000},
      {kind: 'thinking', text: 'Planning'},
      {kind: 'text', text: `${explicitDone ? '<od-done key="aaaaaaaaaaaaaaaa"/>' : ''}Plan ready.`},
      {kind: 'done_key', key: 'bbbbbbbbbbbbbbbb', runStartedAt: 10_000, runEndedAt: 15_000},
      {kind: 'tool_use', id: 'write', name: 'Write', input: {file_path: 'index.html'}},
      {kind: 'text', text: '<od-done key="bbbbbbbbbbbbbbbb"/>Final result.'},
    ] };
  const parts = taskRecordParts([message]);
  expect(parts.map(part => 'text' in part ? part.text : part.shell.items.map(item =>
    item.kind === 'text' ? item.text : item.kind === 'tool' ? item.id : item.kind))).toEqual([
    ['Planning'], 'Plan ready.', ['write'],
  ]);
  const shells = parts.flatMap(part => 'shell' in part ? [part.shell] : []);
  expect(shells.map(shell => shell.elapsedMs)).toEqual([5000, 5000]);
});

it.each(['no_result', 'delivery_failed'] as const)('keeps the Run verdict independent of %s in the aggregated process', resultDeliveryState => {
  const message: ChatMessage = { id: 'result', role: 'assistant', runId: 'answer-run', runStatus: 'succeeded',
    taskDisplay: { ...projection, state: 'completed', ticking: false },
    resultDeliveryState, content: '', events: [{ kind: 'thinking', text: 'Checking the page' }] };
  const shells = taskRecordParts([message]).flatMap(part => 'shell' in part ? [part.shell] : []);
  expect(shells).toHaveLength(1);
  expect(shells[0]!.status).toBe('done');
  expect(withTaskPresentation([message])[0]!.taskPresentation!.display.state).toBe('completed');
});

it('keeps the current Run active until its new delivery verdict arrives', () => {
  const message: ChatMessage = { id: 'result', role: 'assistant', runId: 'answer-run', runStatus: 'running',
    taskDisplay: projection, resultDeliveryState: 'delivery_failed', content: '',
    events: [{ kind: 'thinking', text: 'Checking the updated page' }] };
  const shells = taskRecordParts([message]).flatMap(part => 'shell' in part ? [part.shell] : []);
  expect(shells[0]!.status).toBe('running');
  expect(withTaskPresentation([message])[0]!.taskPresentation!.display.state).toBe('running');
});

it.each([
  { explicitDone: true, runStatus: 'running' }, { explicitDone: false, runStatus: 'running' },
  { explicitDone: true, runStatus: 'failed' }, { explicitDone: true, runStatus: 'canceled' },
] as const)('keeps automatic planning in the record (done: $explicitDone, successor: $runStatus)', ({ explicitDone, runStatus }) => {
  const message: ChatMessage = { id: 'folded', role: 'assistant', runId: 'answer-run', runStatus,
    strategyTaskExecutionId: 'task', strategyTaskRunIndex: 1, strategyTaskPrefixEventCount: 2,
    content: '', events: [
      { kind: 'done_key', key: 'aaaaaaaaaaaaaaaa' },
      { kind: 'text', text: `${explicitDone ? '<od-done key="aaaaaaaaaaaaaaaa"/>' : ''}The automatic plan is ready.` },
      { kind: 'status', label: 'running' },
      { kind: 'done_key', key: 'bbbbbbbbbbbbbbbb' },
      { kind: 'text', text: '<od-done key="bbbbbbbbbbbbbbbb"/>Please confirm the produced design.' },
      { kind: 'tool_use', id: 'todo', name: 'TodoWrite', input: { todos: [{ content: 'Check layout', status: 'in_progress' }] } },
    ] };
  const parts = taskRecordParts([message]);
  expect(parts.some(part => 'text' in part && part.text.includes('automatic plan'))).toBe(true);
  expect(parts.some(part => 'text' in part && part.text.includes('confirm'))).toBe(false);
});


it('does not restart a settled planning record while its automatic successor starts', () => {
  const plan: ChatMessage = { id: 'plan', role: 'assistant', runId: 'question-run', runStatus: 'succeeded',
    startedAt: 1000, endedAt: 6000, content: '', events: [{kind: 'thinking', text: 'Planning'}],
    taskDisplay: {...projection, currentRunId: 'question-run', runIds: ['question-run'], revision: 2} };
  const production: ChatMessage = {id: 'production', role: 'assistant', runId: 'answer-run',
    runStatus: 'running', content: '', events: [], taskDisplay: projection};
  const task = withTaskPresentation([plan, production])[0]!.taskPresentation!;
  const earlier = taskRecordParts(task.messages, 10_000);
  const later = taskRecordParts(task.messages, 15_000);
  expect(earlier).toEqual(later);
  expect(earlier[0]).toMatchObject({shell: {status: 'done', elapsedMs: 5000}});
});


it.each(['canceled', 'failed'] as const)('freezes a local %s verdict until authoritative timing arrives', runStatus => {
  const message: ChatMessage = {id: 'current', role: 'assistant', runId: 'answer-run', content: '',
    startedAt: 480_000, endedAt: 502_000, runStatus, taskDisplay: projection};
  const stopped = withTaskPresentation([message]);
  const display = stopped[0]!.taskPresentation!.display;
  expect(display).toMatchObject({state: runStatus, ticking: false, elapsedMs: 29_000, revision: 3});
  expect(taskDisplayElapsed(display, 510_000)).toBe(29_000);
  const stale = withTaskPresentation([{...message, taskDisplay: {...projection, observedAt: 503_000, elapsedMs: 30_000}}], stopped);
  expect(stale[0]!.taskPresentation!.display).toMatchObject({state: runStatus, ticking: false, elapsedMs: 29_000});
  const authoritative = withTaskPresentation([{...message, taskDisplay: {...projection, revision: 4,
    state: runStatus, ticking: false, elapsedMs: 28_500, observedAt: 504_000}}], stale);
  expect(authoritative[0]!.taskPresentation!.display.elapsedMs).toBe(28_500);
  const resumed = withTaskPresentation([{...message, runStatus: 'running', endedAt: undefined,
    taskDisplay: {...projection, revision: 5, observedAt: 510_000}}], authoritative);
  expect(resumed[0]!.taskPresentation!.display).toMatchObject({state: 'running', ticking: true, revision: 5});
});

it('does not invent an empty task record when no process content has arrived', () => {
  const message: ChatMessage = {id: 'empty', role: 'assistant', runId: 'answer-run', runStatus: 'running',
    content: '', events: [], startedAt: 1000, taskDisplay: projection};
  expect(taskRecordParts([message], 90_000)).toEqual([]);
});
