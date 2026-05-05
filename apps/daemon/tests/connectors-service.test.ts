import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  CONNECTOR_RUN_RATE_LIMIT_CALLS,
  CONNECTOR_RUN_LIMIT_TTL_MS,
  CONNECTOR_RUN_TOTAL_CALL_LIMIT,
  ConnectorService,
  ConnectorServiceError,
  ConnectorStatusService,
  FileConnectorCredentialStore,
  InMemoryConnectorCredentialStore,
  type ConnectorExecuteRequest,
  type ConnectorExecutionContext,
} from '../src/connectors/service.js';
import {
  classifyConnectorToolSafety,
  isRefreshEligibleConnectorToolSafety,
  type ConnectorCatalogDefinition,
} from '../src/connectors/catalog.js';
import type { BoundedJsonObject } from '../src/live-artifacts/schema.js';
import { listConnectorTools } from '../src/tools/connectors.js';

function externalConnector(overrides: Partial<ConnectorCatalogDefinition> = {}): ConnectorCatalogDefinition {
  return {
    id: 'external_docs',
    name: 'External docs',
    provider: 'example',
    category: 'docs',
    tools: [],
    allowedToolNames: [],
    ...overrides,
  };
}

class TestConnectorService extends ConnectorService {
  constructor(
    private readonly definition: ConnectorCatalogDefinition,
    statusService: ConnectorStatusService,
  ) {
    super(statusService);
  }

  override async listDefinitions(): Promise<ConnectorCatalogDefinition[]> {
    return [this.definition];
  }

  override async getDefinition(connectorId: string): Promise<ConnectorCatalogDefinition | undefined> {
    return connectorId === this.definition.id ? this.definition : undefined;
  }
}

class OutputTestConnectorService extends TestConnectorService {
  constructor(
    definition: ConnectorCatalogDefinition,
    statusService: ConnectorStatusService,
    private readonly output: BoundedJsonObject = { ok: true },
  ) {
    super(definition, statusService);
  }

  protected override async executeConnectorProviderTool(_request: ConnectorExecuteRequest, _context: ConnectorExecutionContext): Promise<BoundedJsonObject> {
    return this.output;
  }
}

function readOnlyDefinition(): ConnectorCatalogDefinition {
  return externalConnector({
    tools: [{
      name: 'docs.search',
      title: 'Search docs',
      requiredScopes: ['docs:read'],
      safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only docs search' },
      refreshEligible: true,
    }],
    allowedToolNames: ['docs.search'],
    minimumApproval: 'auto',
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('connector status service', () => {
  it('supports available, connected, error, and disabled states', () => {
    const statusService = new ConnectorStatusService();
    const available = externalConnector();
    const disabled = externalConnector({ id: 'disabled_docs', disabled: true });

    expect(statusService.getStatus(available)).toEqual({ status: 'available' });
    expect(statusService.connect(available, 'docs@example.com')).toEqual({
      status: 'connected',
      accountLabel: 'docs@example.com',
    });
    expect(statusService.setError(available, 'OAuth token expired', 'docs@example.com')).toEqual({
      status: 'error',
      accountLabel: 'docs@example.com',
      lastError: 'OAuth token expired',
    });
    expect(statusService.disconnect(available)).toEqual({ status: 'available' });
    expect(statusService.getStatus(disabled)).toEqual({ status: 'disabled' });
  });

  it('stores OAuth credential material in the daemon global store without exposing it in connector details', async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), 'od-connector-credentials-'));
    const credentialStore = new FileConnectorCredentialStore(dataDir);
    const statusService = new ConnectorStatusService({ credentialStore });
    const definition = externalConnector();
    const service = new TestConnectorService(definition, statusService);

    await expect(service.connect('external_docs', {
      accountLabel: 'docs@example.com',
      credentials: { access_token: 'oauth-secret-token', refresh_token: 'oauth-refresh-token' },
    })).resolves.toMatchObject({
      connector: {
        id: 'external_docs',
        status: 'connected',
        accountLabel: 'docs@example.com',
      },
    });

    const serializedDetail = JSON.stringify(service.getConnector('external_docs'));
    expect(serializedDetail).not.toContain('oauth-secret-token');
    expect(serializedDetail).not.toContain('oauth-refresh-token');

    const credentialFile = await readFile(path.join(dataDir, 'connectors', 'credentials.json'), 'utf8');
    expect(credentialFile).toContain('oauth-secret-token');
    expect(credentialFile).toContain('oauth-refresh-token');

    await service.disconnect('external_docs');
    await expect(service.getConnector('external_docs')).resolves.toMatchObject({ status: 'available' });
  });

  it('includes connected dynamically discovered connectors in status snapshots', async () => {
    const statusService = new ConnectorStatusService();
    const definition = externalConnector({ id: 'dynamic_mail', name: 'Dynamic Mail', provider: 'composio' });
    const service = new TestConnectorService(definition, statusService);

    await service.connect('dynamic_mail', {
      accountLabel: 'user@example.com',
      credentials: { providerConnectionId: 'ca_dynamic_mail' },
    });

    expect(service.listFastDefinitions().some((connector) => connector.id === 'dynamic_mail')).toBe(false);
    expect(service.listConnectorStatuses()).toMatchObject({
      dynamic_mail: {
        status: 'connected',
        accountLabel: 'user@example.com',
      },
    });
  });

  it('only clears connected statuses for credentials owned by the reset provider', () => {
    const credentialStore = new InMemoryConnectorCredentialStore();
    const statusService = new ConnectorStatusService({ credentialStore });
    const composioDefinition = externalConnector({ id: 'composio_docs', provider: 'composio' });
    const unrelatedDefinition = externalConnector({ id: 'external_docs', provider: 'example' });

    statusService.connect(composioDefinition, 'composio@example.com', { provider: 'composio', providerConnectionId: 'ca_docs' });
    statusService.connect(unrelatedDefinition, 'docs@example.com', { provider: 'example', token: 'example-token' });

    statusService.deleteCredentialsByProvider('composio');

    expect(statusService.getStatus(composioDefinition)).toEqual({ status: 'available' });
    expect(statusService.getStatus(unrelatedDefinition)).toEqual({ status: 'connected', accountLabel: 'docs@example.com' });
  });
});

describe('connector read-only safety classification', () => {
  it.each([
    ['scope write hint', { name: 'docs.lookup', requiredScopes: ['docs:write'] }, { sideEffect: 'write', approval: 'confirm' }],
    ['name create hint', { name: 'docs.create_page' }, { sideEffect: 'write', approval: 'confirm' }],
    ['name update hint', { name: 'docs.update_page' }, { sideEffect: 'write', approval: 'confirm' }],
    ['name delete hint', { name: 'docs.delete_page' }, { sideEffect: 'write', approval: 'confirm' }],
    ['name admin hint', { name: 'docs.admin_users' }, { sideEffect: 'write', approval: 'confirm' }],
    ['name send hint', { name: 'mail.send_digest' }, { sideEffect: 'write', approval: 'confirm' }],
    ['name post hint', { name: 'chat.post_message' }, { sideEffect: 'write', approval: 'confirm' }],
    ['name manage hint', { name: 'tasks.manage_list' }, { sideEffect: 'write', approval: 'confirm' }],
  ])('classifies %s as write with confirmation', (_label, input, expected) => {
    expect(classifyConnectorToolSafety(input)).toMatchObject(expected);
  });

  it('classifies destructive hints as disabled destructive tools', () => {
    const safety = classifyConnectorToolSafety({
      name: 'database.purge_cache',
      description: 'Destructive maintenance operation.',
    });

    expect(safety).toMatchObject({ sideEffect: 'destructive', approval: 'disabled' });
    expect(isRefreshEligibleConnectorToolSafety(safety)).toBe(false);
  });

  it('classifies explicit read-only hints as auto-approved read tools', () => {
    const safety = classifyConnectorToolSafety({
      name: 'issues.query',
      requiredScopes: ['issues:read'],
    });

    expect(safety).toMatchObject({ sideEffect: 'read', approval: 'auto' });
    expect(isRefreshEligibleConnectorToolSafety(safety)).toBe(true);
  });

  it('fails closed for unknown tools', () => {
    const safety = classifyConnectorToolSafety({ name: 'provider.sync' });

    expect(safety).toMatchObject({ sideEffect: 'write', approval: 'confirm' });
    expect(isRefreshEligibleConnectorToolSafety(safety)).toBe(false);
  });
});

describe('connector execution policy', () => {
  it('omits connected allowed tools that are not auto-approved read-only from agent preview listings', async () => {
    const definition = externalConnector({
      tools: [
        {
          name: 'docs.search',
          title: 'Search docs',
          requiredScopes: ['docs:read'],
          safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only docs search' },
          refreshEligible: true,
        },
        {
          name: 'docs.update_page',
          title: 'Update page',
          requiredScopes: ['docs:write'],
          safety: { sideEffect: 'write', approval: 'confirm', reason: 'write-capable docs update' },
          refreshEligible: false,
        },
      ],
      allowedToolNames: ['docs.search', 'docs.update_page'],
      minimumApproval: 'auto',
    });
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new TestConnectorService(definition, statusService);

    await expect(listConnectorTools({
      grant: {
        token: 'test-token',
        projectId: 'project-a',
        runId: 'run-a',
        allowedEndpoints: [],
        allowedOperations: [],
        issuedAt: '2026-04-30T00:00:00.000Z',
        expiresAt: '2026-04-30T00:15:00.000Z',
      },
      projectsRoot: '/tmp/open-design-test',
      service,
    })).resolves.toEqual([
      expect.objectContaining({
        id: 'external_docs',
        tools: [expect.objectContaining({ name: 'docs.search' })],
      }),
    ]);
  });

  it('rejects connector inputs that no longer match the current tool schema', async () => {
    const definition = externalConnector({
      tools: [{
        name: 'docs.search',
        title: 'Search docs',
        requiredScopes: ['docs:read'],
        inputSchemaJson: { type: 'object', properties: { query: { type: 'string' } }, additionalProperties: false },
        safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only docs search' },
        refreshEligible: true,
      }],
      allowedToolNames: ['docs.search'],
      minimumApproval: 'auto',
    });
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com', { token: 'secret' });
    const service = new OutputTestConnectorService(definition, statusService);

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: { unexpected: true } },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', purpose: 'agent_preview' },
    )).rejects.toMatchObject({ code: 'CONNECTOR_INPUT_SCHEMA_MISMATCH' });
  });

  it('accepts JSON Schema integer connector inputs and rejects fractional values', async () => {
    const definition = externalConnector({
      tools: [{
        name: 'docs.search',
        title: 'Search docs',
        requiredScopes: ['docs:read'],
        inputSchemaJson: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } }, required: ['limit'], additionalProperties: false },
        safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only docs search' },
        refreshEligible: true,
      }],
      allowedToolNames: ['docs.search'],
      minimumApproval: 'auto',
    });
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com', { token: 'secret' });
    const service = new OutputTestConnectorService(definition, statusService);

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: { limit: 25 } },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', purpose: 'agent_preview' },
    )).resolves.toMatchObject({ ok: true });

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: { limit: 1.5 } },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', purpose: 'agent_preview' },
    )).rejects.toMatchObject({ code: 'CONNECTOR_INPUT_SCHEMA_MISMATCH' });
  });

  it('rejects refresh execution when runtime scope classification is not auto read-only', async () => {
    const definition = externalConnector({
      tools: [{
        name: 'docs.search',
        title: 'Search docs',
        requiredScopes: ['docs:write'],
        safety: { sideEffect: 'read', approval: 'auto', reason: 'stale catalog classification' },
        refreshEligible: true,
      }],
      allowedToolNames: ['docs.search'],
      minimumApproval: 'auto',
    });
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new OutputTestConnectorService(definition, statusService, { rows: [] });

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: {} },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', purpose: 'artifact_refresh' },
    )).rejects.toMatchObject({ code: 'CONNECTOR_SAFETY_DENIED' });
  });

  it('rejects connector-backed refresh when the connected account label drifted', async () => {
    const definition = externalConnector({
      tools: [{
        name: 'docs.search',
        title: 'Search docs',
        requiredScopes: ['docs:read'],
        safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only docs search' },
        refreshEligible: true,
      }],
      allowedToolNames: ['docs.search'],
      minimumApproval: 'auto',
    });
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'new-account@example.com');
    const service = new TestConnectorService(definition, statusService);

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: {}, expectedAccountLabel: 'old-account@example.com' },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', purpose: 'artifact_refresh' },
    )).rejects.toMatchObject({ code: 'CONNECTOR_NOT_CONNECTED' });
  });

  it('rejects non-auto connector tools during artifact refresh', async () => {
    const definition = externalConnector({
      tools: [{
        name: 'docs.update_page',
        title: 'Update page',
        requiredScopes: ['docs:write'],
        safety: { sideEffect: 'write', approval: 'confirm', reason: 'write-capable docs update' },
        refreshEligible: false,
      }],
      allowedToolNames: ['docs.update_page'],
      minimumApproval: 'confirm',
    });
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new OutputTestConnectorService(definition, statusService, { updated: true });

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.update_page', input: {} },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', purpose: 'artifact_refresh' },
    )).rejects.toMatchObject({ code: 'CONNECTOR_SAFETY_DENIED' });
  });

  it('redacts credential and provider-envelope fields from connector outputs', async () => {
    const definition = readOnlyDefinition();
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new OutputTestConnectorService(definition, statusService, {
      toolName: 'docs.search',
      count: 1,
      rawResponse: { id: 'provider-envelope' },
      item: {
        title: 'Safe title',
        authorization: 'Bearer secret-token',
        nestedApiToken: 'secret-token',
      },
    });

    const response = await service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: {} },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', runId: 'run-redact', purpose: 'agent_preview' },
    );

    expect(response.output).toMatchObject({
      rawResponse: '[redacted]',
      item: {
        title: 'Safe title',
        authorization: '[redacted]',
        nestedApiToken: '[redacted]',
      },
    });
    expect(response.metadata).toMatchObject({ redacted: true });
    expect(JSON.stringify(response.output)).not.toContain('secret-token');
    expect(JSON.stringify(response.output)).not.toContain('provider-envelope');
  });

  it('rejects connector outputs above the serialized size limit', async () => {
    const definition = readOnlyDefinition();
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new OutputTestConnectorService(definition, statusService, {
      toolName: 'docs.search',
      data: 'x'.repeat(257 * 1024),
    });

    await expect(service.execute(
      { connectorId: 'external_docs', toolName: 'docs.search', input: {} },
      { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', runId: 'run-large', purpose: 'agent_preview' },
    )).rejects.toMatchObject({ code: 'CONNECTOR_OUTPUT_TOO_LARGE', status: 502 });
  });

  it('enforces per-run connector rate and total call limits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
    const definition = readOnlyDefinition();
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new OutputTestConnectorService(definition, statusService, { toolName: 'docs.search', count: 0 });
    const request = { connectorId: 'external_docs', toolName: 'docs.search', input: {} };
    const context = { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', runId: 'run-limits', purpose: 'agent_preview' } as const;

    for (let index = 0; index < CONNECTOR_RUN_RATE_LIMIT_CALLS; index += 1) {
      await expect(service.execute(request, context)).resolves.toMatchObject({ ok: true });
    }
    await expect(service.execute(request, context)).rejects.toMatchObject({ code: 'CONNECTOR_RATE_LIMITED', status: 429 });

    for (let index = CONNECTOR_RUN_RATE_LIMIT_CALLS; index < CONNECTOR_RUN_TOTAL_CALL_LIMIT; index += 1) {
      vi.advanceTimersByTime(60_000);
      await expect(service.execute(request, context)).resolves.toMatchObject({ ok: true });
    }
    vi.advanceTimersByTime(60_000);
    await expect(service.execute(request, context)).rejects.toMatchObject({ code: 'CONNECTOR_RATE_LIMITED', status: 429 });
  });

  it('evicts stale per-run connector rate limit entries', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-30T00:00:00.000Z'));
    const definition = readOnlyDefinition();
    const statusService = new ConnectorStatusService();
    statusService.connect(definition, 'docs@example.com');
    const service = new OutputTestConnectorService(definition, statusService, { toolName: 'docs.search', count: 0 });
    const request = { connectorId: 'external_docs', toolName: 'docs.search', input: {} };
    const context = { projectsRoot: '/tmp/open-design-test', projectId: 'project-a', runId: 'run-stale', purpose: 'agent_preview' } as const;

    for (let index = 0; index < CONNECTOR_RUN_TOTAL_CALL_LIMIT; index += 1) {
      vi.advanceTimersByTime(60_000);
      await expect(service.execute(request, context)).resolves.toMatchObject({ ok: true });
    }
    vi.advanceTimersByTime(60_000);
    await expect(service.execute(request, context)).rejects.toMatchObject({ code: 'CONNECTOR_RATE_LIMITED', status: 429 });

    vi.advanceTimersByTime(CONNECTOR_RUN_LIMIT_TTL_MS);
    await expect(service.execute(request, context)).resolves.toMatchObject({ ok: true });
  });
});
