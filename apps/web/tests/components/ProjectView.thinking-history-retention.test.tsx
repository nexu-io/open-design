// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import assert from 'node:assert/strict';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import recording from '../fixtures/chat/amr-thinking-todo.turn0.json';
import { createBufferedTextUpdates, mergeServerMessagesIntoConversation } from '../../src/components/ProjectView';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage, AgentEvent } from '../../src/types';
// Excerpt grounded in the ticket, controlled sequence rather than original 45 events.
const HEAD = 'First logical block: display: 「端侧词预测，';
const TAIL = '= 6 incl comma; 5 glyph 750px? fine) plus newline.';
const show = (message: ChatMessage) => <I18nProvider initial="en"><AssistantMessage message={message} streaming={message.runStatus === 'running'} isLast projectId="p" conversationId="c"/></I18nProvider>;
const allThinking = () => screen.queryAllByTestId('thinking-markdown').map(el => el.textContent).join('\n');
const reveal = () => {
    for (const el of document.querySelectorAll('summary')) {
        const detail = el.closest('details');
        if (detail && !detail.open)
            fireEvent.click(el);
    }
};
const buffers: ReturnType<typeof createBufferedTextUpdates>[] = [];
function makeBuffer(initial?: ChatMessage) {
    let message: ChatMessage = initial ?? { id: 'm', role: 'assistant', content: '', runId: 'run-original', runStatus: 'running', startedAt: 1000, events: [] };
    const buffer = createBufferedTextUpdates({ updateMessage: fn => { message = fn(message); }, persistSoon: () => undefined });
    buffers.push(buffer);
    return { buffer, value: () => message, append: (ev: AgentEvent) => { buffer.appendEvent(ev); buffer.flush(); } };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => { for (const b of buffers.splice(0))
    b.cancel(); cleanup(); vi.useRealTimers(); });
describe('2746 ad907 data retention diagnostic', () => {
    it('does not erase displayed thinking suffix when equal-count older history arrives', async () => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD });
        const olderResponse = structuredClone(state.value()); // GET snapshot captured before next SSE delta.
        state.append({ kind: 'thinking', text: TAIL });
        expect(state.value().events).toHaveLength(1);
        expect(olderResponse.events).toHaveLength(1);
        const view = render(show(state.value()));
        expect(allThinking()).toBe(HEAD + TAIL);
        const merged = mergeServerMessagesIntoConversation([state.value()], [olderResponse])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        view.rerender(show(merged));
        await act(async () => { await vi.advanceTimersByTimeAsync(100); });
        expect(allThinking()).toBe(HEAD + TAIL);
    });
    it.each([
        { label: 'different run', runId: 'run-new' },
        { label: 'missing run identity', runId: undefined },
    ])('does not borrow local thinking for $label', ({ runId }) => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD });
        const fresh: ChatMessage = { ...structuredClone(state.value()) };
        if (runId)
            fresh.runId = runId;
        else
            delete fresh.runId;
        state.append({ kind: 'thinking', text: TAIL });
        const merged = mergeServerMessagesIntoConversation([state.value()], [fresh])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        expect(merged.events).toEqual(fresh.events);
    });
    it.each(['succeeded', 'failed', 'canceled'] as const)('retains a terminal %s server snapshot', (runStatus) => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD });
        const terminal = { ...structuredClone(state.value()), runStatus };
        state.append({ kind: 'thinking', text: TAIL });
        const merged = mergeServerMessagesIntoConversation([state.value()], [terminal])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        expect(merged.events).toEqual(terminal.events);
        expect(merged.runStatus).toBe(runStatus);
    });
    it('does not preserve a trailing prefix when an earlier tool event changed', () => {
        const state = makeBuffer();
        state.append({ kind: 'tool_use', id: 'read', name: 'Read', input: { file_path: 'before.txt' } });
        state.append({ kind: 'thinking', text: HEAD });
        const server = structuredClone(state.value());
        server.events![0] = { kind: 'tool_use', id: 'read', name: 'Read', input: { file_path: 'after.txt' } };
        state.append({ kind: 'thinking', text: TAIL });
        const merged = mergeServerMessagesIntoConversation([state.value()], [server])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        expect(merged.events).toEqual(server.events);
    });
    it('does not retain thinking absorbed from a later run of the same strategy task', () => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD });
        const server = { ...structuredClone(state.value()), strategyTaskExecutionId: 'task', strategyTaskRunIndex: 0 };
        state.append({ kind: 'thinking', text: TAIL });
        const successor: ChatMessage = { id: 'next', role: 'assistant', content: 'Production result', runId: 'run-next', runStatus: 'succeeded', strategyTaskExecutionId: 'task', strategyTaskRunIndex: 1 };
        const merged = mergeServerMessagesIntoConversation([state.value()], [server, successor]);
        assert.ok(merged[0], 'the history merge must retain the assistant message');
        expect(merged[0].events).toEqual(server.events);
        expect(merged[1]).toEqual(successor);
    });
    it('keeps a same-run server correction that is not a prefix of local text', () => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD + TAIL });
        const corrected = { ...structuredClone(state.value()), events: [{ kind: 'thinking' as const, text: 'Corrected upstream reasoning.' }] };
        const merged = mergeServerMessagesIntoConversation([state.value()], [corrected])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        expect(merged.events).toEqual(corrected.events);
    });
    it('accepts the newer authoritative same-count server thinking suffix', () => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD });
        const earlierLocal = structuredClone(state.value());
        state.append({ kind: 'thinking', text: TAIL });
        const merged = mergeServerMessagesIntoConversation([earlierLocal], [state.value()])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        render(show(merged));
        expect(allThinking()).toBe(HEAD + TAIL);
    });
    it('retains old logical block when a tool and second thinking create more local events', () => {
        const state = makeBuffer();
        state.append({ kind: 'thinking', text: HEAD });
        const olderResponse = structuredClone(state.value());
        state.append({ kind: 'tool_use', id: 'read', name: 'Read', input: { file_path: 'SKILL.md' } });
        state.append({ kind: 'tool_result', toolUseId: 'read', content: 'Skill read.', isError: false });
        state.append({ kind: 'thinking', text: 'Second complete block.' });
        const merged = mergeServerMessagesIntoConversation([state.value()], [olderResponse])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        render(show(merged));
        reveal();
        expect(allThinking()).toContain(HEAD);
        expect(allThinking()).toContain('Second complete block.');
    });
    it('preserves all actual AMR recorded thinking through buffering and exact history merge', () => {
        const state = makeBuffer();
        for (const event of recording.events)
            state.append(event as AgentEvent);
        const originalText = recording.events.filter((e: any) => e.kind === 'thinking').map((e: any) => e.text).join('');
        const bufferedText = (state.value().events ?? []).filter(e => e.kind === 'thinking').map((e: any) => e.text).join('');
        expect(bufferedText).toBe(originalText);
        expect([...originalText].length).toBe(42666);
        const view = render(show(state.value()));
        reveal();
        const before = allThinking();
        expect(before.length).toBeGreaterThan(10000);
        const history = JSON.parse(JSON.stringify({ ...state.value(), runStatus: 'canceled' }));
        const merged = mergeServerMessagesIntoConversation([state.value()], [history])[0];
        assert.ok(merged, 'the history merge must retain the assistant message');
        view.rerender(show(merged));
        reveal();
        expect(allThinking()).toBe(before);
    });
});
