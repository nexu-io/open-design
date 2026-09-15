import { describe, expect, it } from 'vitest';
import { createCodexAppServerNormalizer } from '../src/agent-protocol/codex-app-server/normalize.js';

const change = (path: string, type = 'add', diff = 'hello\n') => ({ path, kind: { type }, diff });
function harness() {
  const events: Record<string, any>[] = [];
  const normalizer = createCodexAppServerNormalizer(event => events.push(event), () => 1000, '/w');
  const patch = (changes: unknown, itemId = 'patch-1') => normalizer.handleNotification('item/fileChange/patchUpdated', { itemId, changes });
  const item = (method: string, changes: unknown, status = 'completed') => normalizer.handleNotification(method, { item: { id: 'patch-1', type: 'fileChange', changes, status } });
  return { events, normalizer, patch, item };
}

describe('official Codex patch generation events', () => {
  it('pairs relative previews with absolute final paths (official CLI 0.149.1)', () => {
    const { events, patch, item } = harness();
    patch([change('./page.html')]);
    const preview = events[0];
    item('item/completed', [change('/w/page.html')]);
    expect(preview?.input.file_path).toBe('/w/page.html');
    expect(events.find(e => e.type === 'tool_use')?.id).toBe(preview?.id);
    expect(events.find(e => e.type === 'tool_result')?.toolUseId).toBe(preview?.id);
  });
  it('shows a real file target before item/started and keeps patch text out of events', () => {
    const { events, patch } = harness();
    patch([change('/w/page.html', 'add', 'x'.repeat(100_000))]);
    expect(events).toEqual([expect.objectContaining({ type: 'tool_in_flight', name: 'Write', input: { file_path: '/w/page.html' }, startedAt: 1000 })]);
    expect(JSON.stringify(events).length).toBeLessThan(500);
  });

  it('publishes each file once despite repeated growing snapshots', () => {
    const { events, patch } = harness();
    for (let i = 0; i < 500; i++) patch([change('/w/z.html', 'add', 'x'.repeat(i + 1))]);
    patch([change('/w/a.css', 'update'), change('/w/z.html')]);
    expect(events.filter(e => e.type === 'tool_in_flight')).toHaveLength(2);
    expect(events.map(e => e.name)).toEqual(['Write', 'Edit']);
  });

  it('keeps file identities when later snapshots and the final item reorder files', () => {
    const { events, patch, item } = harness();
    patch([change('/w/z.html')]);
    patch([change('/w/a.css', 'update'), change('/w/z.html')]);
    const early = events.slice();
    const final = [change('/w/a.css', 'update', '@@ -1 +1 @@\n-old\n+new\n'), change('/w/z.html')];
    item('item/started', final, 'inProgress');
    expect(events.filter(e => e.type === 'tool_use')).toHaveLength(0);
    item('item/completed', final);
    item('item/completed', final);
    const settled = events.filter(e => e.type === 'tool_use');
    expect(settled).toHaveLength(2);
    for(const preview of early) expect(settled.find(e => e.input.file_path === preview.input.file_path)?.id).toBe(preview.id);
    expect(settled.find(e => e.name === 'Edit')?.input.od_diff_stat).toEqual({ added: 1, removed: 1 });
    expect(events.filter(e => e.type === 'tool_result')).toHaveLength(2);
  });

  it('retains legacy completion-only file mapping when no patch events exist', () => {
    const { events, patch, item } = harness();
    item('item/completed', [change('/w/old.html')]);
    expect(events.filter(e => e.type === 'tool_use')).toEqual([expect.objectContaining({ id: 'patch-1#0', name: 'Write' })]);
    patch([change('/w/old.html')]);
    expect(events.filter(e => e.type === 'tool_in_flight')).toHaveLength(0);
  });

  it('preserves failed execution and rejects late snapshots after completion', () => {
    const { events, patch, item } = harness();
    patch([change('/w/fail.html')]);
    item('item/completed', [change('/w/fail.html')], 'failed');
    const count = events.length;
    patch([change('/w/late.html')]);
    expect(events).toHaveLength(count);
    expect(events.find(e => e.type === 'tool_result')?.isError).toBe(true);
  });

  it.each(['completed', 'interrupted', 'failed'])('ignores late patch generation after a %s turn', status => {
    const { events, normalizer, patch } = harness();
    patch([change('/w/start.html')]);
    normalizer.handleNotification('turn/completed', { turn: { status } });
    const count = events.length;
    patch([change('/w/late.html')], 'patch-late');
    expect(events).toHaveLength(count);
  });

  it('ignores malformed targets and never calls a deletion Write or Edit', () => {
    const { events, patch } = harness();
    for(const changes of [null, {}, [], [null], [{path: '',kind:{type:'add'}}], [change('/w/deleted', 'delete')]]) patch(changes);
    patch([change('/w/ignored')], '');
    expect(events).toEqual([]);
  });
});
