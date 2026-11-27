import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, it } from 'vitest';

import {
  startHubEventsSubscriber,
  type HubEventsSubscriber,
} from '../../src/collab/hub-events-subscriber.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function within<T>(promise: Promise<T>, ms = 3_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('subscriber did not make progress')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const servers: Server[] = [];
const timers: ReturnType<typeof setTimeout>[] = [];
let subscriber: HubEventsSubscriber | undefined;

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function publish(response: ServerResponse, workspaceId = 'w1'): void {
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(`event: ready\ndata: ${JSON.stringify({ workspaceId })}\n\n`);
  response.write(`event: workspace-event\ndata: ${JSON.stringify({
    type: 'comment-changed', workspaceId, projectId: 'p1',
  })}\n\n`);
}

afterEach(async () => {
  subscriber?.stop();
  subscriber = undefined;
  for (const timer of timers.splice(0)) clearTimeout(timer);
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

describe('hub event connection deadlines', () => {
  it('aborts a request with no response headers and recovers on the next connection', async () => {
    let requests = 0;
    const firstClosed = deferred();
    const delivered = deferred();
    const errors: unknown[] = [];
    const states: string[] = [];
    const origin = await listen((_request, response) => {
      requests += 1;
      if (requests === 1) {
        response.once('close', firstClosed.resolve);
        return;
      }
      publish(response);
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: `${origin}/events`, headers: {}, workspaceId: 'w1' }),
      onEvent: delivered.resolve,
      onStateChange: (state) => states.push(state),
      onError: (error) => errors.push(error),
      heartbeatTimeoutMs: 200,
      backoffMinMs: 5,
      backoffMaxMs: 5,
      random: () => 0,
    });

    await within(delivered.promise);
    await within(firstClosed.promise);
    assert.equal(requests, 2);
    assert.equal(errors.length, 1);
    assert.equal((errors[0] as Error).name, 'AbortError');
    assert.deepEqual(states, ['connected']);
    assert.equal(subscriber.connected(), true);
  });

  it('starts a fresh idle interval when response headers arrive', async () => {
    const delivered = deferred();
    const errors: unknown[] = [];
    let requests = 0;
    const origin = await listen((_request, response) => {
      requests += 1;
      timers.push(setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.flushHeaders();
        timers.push(setTimeout(() => {
          response.write('event: ready\ndata: {"workspaceId":"w1"}\n\n');
          response.write('event: workspace-event\ndata: {"type":"comment-changed","workspaceId":"w1"}\n\n');
        }, 260));
      }, 260));
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: `${origin}/events`, headers: {}, workspaceId: 'w1' }),
      onEvent: delivered.resolve,
      onError: (error) => errors.push(error),
      heartbeatTimeoutMs: 400,
      backoffMinMs: 1_000,
    });

    await within(delivered.promise);
    assert.equal(requests, 1);
    assert.deepEqual(errors, []);
    assert.equal(subscriber.connected(), true);
  });

  it('stops a pending response without reconnecting or reporting a transport error', async () => {
    const requested = deferred();
    const closed = deferred();
    const errors: unknown[] = [];
    let requests = 0;
    const origin = await listen((_request, response) => {
      requests += 1;
      response.once('close', closed.resolve);
      requested.resolve();
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: `${origin}/events`, headers: {} }),
      onEvent: () => assert.fail('a stopped request must not deliver an event'),
      onError: (error) => errors.push(error),
      heartbeatTimeoutMs: 100,
      backoffMinMs: 1,
      backoffMaxMs: 1,
    });

    await within(requested.promise);
    subscriber.stop();
    await within(closed.promise);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(requests, 1);
    assert.deepEqual(errors, []);
    assert.equal(subscriber.connected(), false);
  });

  it('switches workspace immediately while old response headers are still pending', async () => {
    const requested = deferred();
    const firstClosed = deferred();
    const delivered = deferred();
    const errors: unknown[] = [];
    const events: string[] = [];
    let workspaceId = 'w1';
    const origin = await listen((request, response) => {
      if (request.url?.startsWith('/w1')) {
        response.once('close', firstClosed.resolve);
        requested.resolve();
      } else {
        publish(response, 'w2');
      }
    });

    subscriber = startHubEventsSubscriber({
      resolveEndpoint: async () => ({ url: `${origin}/${workspaceId}`, headers: {}, workspaceId }),
      onEvent: (event) => { events.push(event.workspaceId!); delivered.resolve(); },
      onError: (error) => errors.push(error),
      heartbeatTimeoutMs: 1_000,
      backoffMinMs: 10_000,
    });

    await within(requested.promise);
    workspaceId = 'w2';
    subscriber.refreshEndpoint();
    await within(delivered.promise);
    await within(firstClosed.promise);
    assert.deepEqual(events, ['w2']);
    assert.deepEqual(errors, []);
    assert.equal(subscriber.connected(), true);
  });
});
