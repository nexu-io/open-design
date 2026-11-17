import { describe, expect, it } from 'vitest';
import { CollabClient } from '../src/collab/collab-client';
import { workspaceContextFixture } from './helpers/workspace-context';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const update = (state = 'up_to_date') => ({
  state, latestVersion: 2, localVersion: state === 'up_to_date' ? 2 : 1,
  promptSuppressedUntil: null, updatedAt: 1,
});
const response = (body: unknown) => ({ ok: true, json: async () => body }) as Response;
const workspaceContext = workspaceContextFixture({ workspaceId: 'workspace', workspaceMemberId: 'owner' });

describe('owner content replacement admission (OPEND-4492)', () => {
  it('blocks from acceptance until its response, even when status still reports old content', async () => {
    const accepted = deferred<Response>();
    const client = new CollabClient({
      projectId: 'owner-project', member: null, workspaceContext,
      fetch: (async (_input, init) => init?.method === 'POST'
        ? accepted.promise : response({ ownedContentUpdate: update('confirmation_required') })) as typeof fetch,
    });
    const pending = client.requestContentUpdate({ action: 'accept', version: 2 });
    expect(client.getSnapshot().contentUpdatePending).toBe(true);
    await client.pollStatus();
    expect(client.getSnapshot().contentUpdatePending).toBe(true);
    accepted.resolve(response({ update: update() }));
    await pending;
    expect(client.getSnapshot().contentUpdatePending).toBe(false);
    expect(client.getSnapshot().ownedContentUpdate?.state).toBe('up_to_date');
  });

  it('releases the local gate after failure so the explicit sync action can retry', async () => {
    const accepted = deferred<Response>();
    const client = new CollabClient({
      projectId: 'owner-project', member: null, workspaceContext,
      fetch: (async () => accepted.promise) as typeof fetch,
    });
    const pending = client.requestContentUpdate({ action: 'accept', version: 2 });
    const failed = expect(pending).rejects.toThrow('sync disconnected');
    expect(client.getSnapshot().contentUpdatePending).toBe(true);
    accepted.reject(new Error('sync disconnected'));
    await failed;
    expect(client.getSnapshot().contentUpdatePending).toBe(false);
  });

  it('does not block editing for a check that only offers replacement', async () => {
    const checked = deferred<Response>();
    const client = new CollabClient({
      projectId: 'owner-project', member: null, workspaceContext,
      fetch: (async () => checked.promise) as typeof fetch,
    });
    const pending = client.requestContentUpdate({ action: 'check', manual: true });
    expect(client.getSnapshot().contentUpdatePending ?? false).toBe(false);
    checked.resolve(response({ update: update('confirmation_required') }));
    await pending;
    expect(client.getSnapshot().contentUpdatePending ?? false).toBe(false);
  });

  it('keeps the gate until all accepted requests settle', async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    let requests = 0;
    const client = new CollabClient({
      projectId: 'owner-project', member: null, workspaceContext,
      fetch: (async () => ++requests === 1 ? first.promise : second.promise) as typeof fetch,
    });
    const one = client.requestContentUpdate({ action: 'accept', version: 2 });
    const two = client.requestContentUpdate({ action: 'accept', version: 2 });
    first.resolve(response({ update: update() }));
    await one;
    expect(client.getSnapshot().contentUpdatePending).toBe(true);
    second.resolve(response({ update: update() }));
    await two;
    expect(client.getSnapshot().contentUpdatePending).toBe(false);
  });
});
