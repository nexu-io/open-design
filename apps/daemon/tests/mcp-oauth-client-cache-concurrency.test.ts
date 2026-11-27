import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'vitest';
import {
  getOrRegisterClient,
  type AuthorizationServerMetadata,
  type RegisteredClient,
} from '../src/mcp-oauth.js';

const redirectUri = 'https://app.example.test/api/mcp/oauth/callback';

function metadata(issuer: string): AuthorizationServerMetadata {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('concurrent MCP OAuth client registration', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-mcp-clients-concurrent-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  async function readClients(): Promise<RegisteredClient[]> {
    const contents = await readFile(path.join(dataDir, 'mcp-oauth-clients.json'), 'utf8');
    return (JSON.parse(contents) as { clients: RegisteredClient[] }).clients;
  }

  it('retains both clients when different issuers register from the same cache snapshot', async () => {
    const first = metadata('https://first.example.test');
    const second = metadata('https://second.example.test');
    const started = [deferred<void>(), deferred<void>()];
    const responses = [deferred<Response>(), deferred<Response>()];
    const fetchImpl: typeof fetch = async (input) => {
      const index = String(input) === first.registration_endpoint ? 0 : 1;
      started[index]!.resolve();
      return responses[index]!.promise;
    };

    const firstCall = getOrRegisterClient(dataDir, first, redirectUri, fetchImpl);
    await started[0]!.promise;
    const secondCall = getOrRegisterClient(dataDir, second, redirectUri, fetchImpl);
    await started[1]!.promise;

    responses[0]!.resolve(Response.json({ client_id: 'client-first', client_secret: 'secret-first' }));
    const firstClient = await firstCall;
    responses[1]!.resolve(Response.json({ client_id: 'client-second' }));
    const secondClient = await secondCall;

    assert.deepEqual((await readClients()).map((client) => client.clientId).sort(), ['client-first', 'client-second']);
    const unexpectedFetch: typeof fetch = async () => { throw new Error('client should be cached'); };
    assert.deepEqual(await getOrRegisterClient(dataDir, first, redirectUri, unexpectedFetch), firstClient);
    assert.deepEqual(await getOrRegisterClient(dataDir, second, redirectUri, unexpectedFetch), secondClient);
  });

  it('returns one registration to simultaneous callers for the same issuer and callback', async () => {
    const authServer = metadata('https://shared.example.test');
    let registrations = 0;
    const fetchImpl: typeof fetch = async () => {
      registrations += 1;
      return Response.json({ client_id: `client-${registrations}` });
    };
    const clients = await Promise.all(Array.from({ length: 20 }, () =>
      getOrRegisterClient(dataDir, authServer, redirectUri, fetchImpl),
    ));

    assert.equal(registrations, 1);
    assert.ok(clients.every((client) => client.clientId === clients[0]!.clientId));
    assert.deepEqual(await readClients(), [clients[0]]);
  });

  it('keeps callback URLs as separate registration identities', async () => {
    const authServer = metadata('https://callback.example.test');
    const alternateRedirect = 'https://other.example.test/api/mcp/oauth/callback';
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { redirect_uris: string[] };
      return Response.json({ client_id: body.redirect_uris[0] === redirectUri ? 'first-callback' : 'second-callback' });
    };
    const clients = await Promise.all([
      getOrRegisterClient(dataDir, authServer, redirectUri, fetchImpl),
      getOrRegisterClient(dataDir, authServer, alternateRedirect, fetchImpl),
    ]);

    assert.deepEqual(clients.map((client) => client.clientId), ['first-callback', 'second-callback']);
    assert.deepEqual((await readClients()).map((client) => client.redirectUri).sort(), [redirectUri, alternateRedirect].sort());
  });

  it('keeps registrations in separate data directories independent', async () => {
    const secondDir = path.join(dataDir, 'another-instance');
    const authServer = metadata('https://independent.example.test');
    const waiting = deferred<void>();
    const response = deferred<Response>();
    const blockedFetch: typeof fetch = async () => {
      waiting.resolve();
      return response.promise;
    };
    const firstCall = getOrRegisterClient(dataDir, authServer, redirectUri, blockedFetch);
    await waiting.promise;
    try {
      const second = await getOrRegisterClient(secondDir, authServer, redirectUri, async () =>
        Response.json({ client_id: 'other-instance' }),
      );
      assert.equal(second.clientId, 'other-instance');
    } finally {
      response.resolve(Response.json({ client_id: 'first-instance' }));
      await firstCall;
    }
    assert.equal((await readClients())[0]!.clientId, 'first-instance');
  });

  it('allows a failed registration to be retried', async () => {
    const authServer = metadata('https://retry.example.test');
    let registrations = 0;
    const fetchImpl: typeof fetch = async () => {
      registrations += 1;
      return registrations === 1
        ? new Response('unavailable', { status: 503 })
        : Response.json({ client_id: 'after-retry' });
    };

    await assert.rejects(getOrRegisterClient(dataDir, authServer, redirectUri, fetchImpl), /HTTP 503/);
    const client = await getOrRegisterClient(dataDir, authServer, redirectUri, fetchImpl);
    assert.equal(registrations, 2);
    assert.equal(client.clientId, 'after-retry');
    assert.deepEqual(await readClients(), [client]);
  });

  it('re-reads persisted registrations after the pending request settles', async () => {
    const authServer = metadata('https://changed.example.test');
    await getOrRegisterClient(dataDir, authServer, redirectUri, async () =>
      Response.json({ client_id: 'original' }),
    );
    const replacement: RegisteredClient = {
      authServerIssuer: authServer.issuer,
      redirectUri,
      clientId: 'replaced-on-disk',
      registeredAt: 1,
    };
    await writeFile(path.join(dataDir, 'mcp-oauth-clients.json'), JSON.stringify({ clients: [replacement] }));

    const client = await getOrRegisterClient(dataDir, authServer, redirectUri, async () => {
      throw new Error('the replacement is already registered');
    });
    assert.deepEqual(client, replacement);
  });
});
