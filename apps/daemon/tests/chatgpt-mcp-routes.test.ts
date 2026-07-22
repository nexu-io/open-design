import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeChatGptMcpRequest,
  CHATGPT_MCP_SCOPES,
  registerChatGptMcpRoutes,
  resolveChatGptMcpDaemonUrl,
  rewriteManagedChatGptToolResult,
} from '../src/routes/chatgpt-mcp.js';

describe('ChatGPT Streamable HTTP MCP', () => {
  const servers: Array<{ close: (callback: (error?: Error) => void) => void }> = [];

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })));
  });

  it('exposes the Open Design tools and MCP Apps resource over /mcp', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      env: { OD_CHATGPT_WIDGET_FRAME_DOMAINS: 'https://preview.open-design.ai,not-a-url' },
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-mcp-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    await client.connect(transport as unknown as Parameters<typeof client.connect>[0]);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'cancel_run',
        'create_project',
        'export_project',
        'get_cloud_account',
        'get_run',
        'list_versions',
        'restore_version',
        'start_run',
      ]);
      expect(Object.fromEntries(tools.tools.map((tool) => [tool.name, tool._meta?.securitySchemes]))).toMatchObject({
        get_cloud_account: [{ type: 'oauth2', scopes: ['opendesign.account.read'] }],
        create_project: [{ type: 'oauth2', scopes: ['opendesign.projects.write'] }],
        start_run: [{ type: 'oauth2', scopes: ['opendesign.runs.write'] }],
        get_run: [{ type: 'oauth2', scopes: ['opendesign.runs.read'] }],
        cancel_run: [{ type: 'oauth2', scopes: ['opendesign.runs.write'] }],
        list_versions: [{ type: 'oauth2', scopes: ['opendesign.projects.read'] }],
        restore_version: [{ type: 'oauth2', scopes: ['opendesign.versions.write'] }],
        export_project: [{ type: 'oauth2', scopes: ['opendesign.exports.read'] }],
      });
      expect(tools.tools.every((tool) => tool.outputSchema?.type === 'object')).toBe(true);
      expect(tools.tools.every((tool) => (
        (tool._meta as any)?.ui?.visibility?.join(',') === 'model,app'
        && (tool._meta as any)?.['openai/widgetAccessible'] === true
      ))).toBe(true);
      expect((tools.tools.find((tool) => tool.name === 'get_run')?.outputSchema as any)?.properties).toMatchObject({
        status: { enum: ['queued', 'running', 'succeeded', 'failed', 'canceled'] },
        previewUrl: { type: 'string' },
        studioUrl: { type: 'string' },
      });
      expect(tools.tools.map((tool) => tool.name)).not.toEqual(expect.arrayContaining([
        'write_file',
        'delete_file',
        'delete_project',
        'create_artifact',
      ]));
      const startRun = tools.tools.find((tool) => tool.name === 'start_run');
      expect(startRun?._meta?.['openai/outputTemplate']).toBe('ui://open-design/artifact-card-v2.html');
      expect(tools.tools.find((tool) => tool.name === 'get_cloud_account')?._meta?.['openai/outputTemplate']).toBe(
        'ui://open-design/artifact-card-v2.html',
      );
      expect(tools.tools.find((tool) => tool.name === 'get_run')?._meta?.['openai/outputTemplate']).toBeUndefined();
      expect(tools.tools.find((tool) => tool.name === 'list_versions')?._meta?.['openai/outputTemplate']).toBeUndefined();
      expect((startRun?.inputSchema as any).required).toEqual(['project', 'artifactType', 'brief', 'confirmed']);
      expect((startRun?.inputSchema as any).properties.artifactType.enum).toEqual([
        'website',
        'product-prototype',
        'presentation',
        'design-system',
      ]);
      expect((startRun?.inputSchema as any).properties.plugin).toBeUndefined();
      expect((startRun?.inputSchema as any).properties.agent).toBeUndefined();

      const resources = await client.listResources();
      expect(resources.resources).toContainEqual(expect.objectContaining({
        uri: 'ui://open-design/artifact-card-v2.html',
        mimeType: 'text/html;profile=mcp-app',
      }));
      expect(resources.resources.map((resource) => resource.uri)).not.toContain('od://focus/active');
      const widget = await client.readResource({ uri: 'ui://open-design/artifact-card-v2.html' });
      const widgetContent = widget.contents[0];
      expect(widgetContent?.mimeType).toBe('text/html;profile=mcp-app');
      const widgetHtml = widgetContent && 'text' in widgetContent ? widgetContent.text : '';
      expect(widgetHtml).toContain('window.openai');
      expect(widgetHtml).toContain("rpcRequest('ui/initialize'");
      expect(widgetHtml).toContain("rpcRequest('tools/call'");
      expect(widgetHtml).toContain("version: '0.2.3'");
      expect(widgetHtml).toContain("}, 1000);");
      expect(widgetHtml).toContain('window.openai?.toolOutput ?? window.openai?.widgetState');
      expect(widgetHtml).toContain('if (Object.keys(current).length > 0)');
      expect(widgetHtml).toContain('ui/notifications/tool-result');
      expect(widgetHtml).toContain('setTimeout');
      expect((widgetContent as any)?._meta?.ui?.csp?.frameDomains).toEqual([
        'https://open-design.ai',
        'https://preview.open-design.ai',
      ]);
    } finally {
      await client.close();
    }
  });

  it('requires explicit remote auth and accepts the configured development bearer', async () => {
    const remote = (authorization?: string, body: unknown = { method: 'initialize' }) => ({
      headers: authorization ? { authorization } : {},
      socket: { remoteAddress: '203.0.113.10' },
      protocol: 'https',
      body,
      get: (name: string) => name === 'host' ? 'mcp.example.com' : undefined,
    }) as any;

    await expect(authorizeChatGptMcpRequest(remote(), {})).resolves.toMatchObject({
      ok: false,
      status: 503,
      code: 'CHATGPT_MCP_AUTH_NOT_CONFIGURED',
    });
    await expect(authorizeChatGptMcpRequest(remote(), { OD_CHATGPT_MCP_TOKEN: 'secret' })).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    await expect(authorizeChatGptMcpRequest(remote('Bearer secret'), { OD_CHATGPT_MCP_TOKEN: 'secret' })).resolves.toMatchObject({
      ok: true,
      principal: { mode: 'static', subject: 'single-tenant' },
    });
  });

  it('does not treat a public reverse-proxy request as unauthenticated loopback', async () => {
    const request = {
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
      protocol: 'https',
      body: { method: 'initialize' },
      get: (name: string) => name === 'host' ? 'mcp.open-design.ai' : undefined,
    } as any;

    await expect(authorizeChatGptMcpRequest(request, {})).resolves.toMatchObject({
      ok: false,
      status: 503,
      code: 'CHATGPT_MCP_AUTH_NOT_CONFIGURED',
    });
    await expect(authorizeChatGptMcpRequest(
      { ...request, get: (name: string) => name === 'host' ? '127.0.0.1:7456' : undefined },
      {},
    )).resolves.toMatchObject({
      ok: true,
      principal: { mode: 'loopback', subject: 'local' },
    });
    await expect(authorizeChatGptMcpRequest(
      { ...request, get: (name: string) => name === 'host' ? '127.0.0.1:7456' : undefined },
      { OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai' },
    )).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_AUTH_REQUIRED',
    });
  });

  it('publishes OAuth protected-resource metadata', async () => {
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      env: {
        OD_PUBLIC_BASE_URL: 'https://mcp.open-design.ai',
        OD_CHATGPT_MCP_RESOURCE_URL: 'https://mcp.open-design.ai/mcp',
        OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai',
      },
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/.well-known/oauth-protected-resource/mcp`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: 'https://mcp.open-design.ai/mcp',
      authorization_servers: ['https://auth.open-design.ai'],
      scopes_supported: CHATGPT_MCP_SCOPES,
    });
  });

  it('rewrites managed preview URLs and suppresses an unroutable Studio link', () => {
    const result = rewriteManagedChatGptToolResult({
      subject: 'user-a',
      publicBaseUrl: 'https://mcp.open-design.ai',
      rewritePreviewUrl: (internalUrl, publicBaseUrl) =>
        `${publicBaseUrl}/signed/${encodeURIComponent(internalUrl)}`,
      result: {
        structuredContent: {
          projectId: 'project-1',
          conversationId: 'conversation-1',
          previewUrl: 'http://127.0.0.1:4501/api/projects/project-1/raw/index.html',
          studioUrl: 'https://mcp.open-design.ai/projects/project-1',
          hint: 'Artifact ready.',
        },
        content: [{ type: 'text', text: 'old' }],
      },
    });

    expect(result.structuredContent).toMatchObject({
      previewUrl: expect.stringContaining('https://mcp.open-design.ai/signed/'),
      studioAvailable: false,
      hint: expect.stringContaining('tenant-aware Open Design Studio routing'),
    });
    expect(result.structuredContent.studioUrl).toBeUndefined();
    expect(result.content[0].text).toContain('studioAvailable');

    const routed = rewriteManagedChatGptToolResult({
      subject: 'user-a',
      publicBaseUrl: 'https://mcp.open-design.ai',
      rewritePreviewUrl: (url) => url,
      studioUrlTemplate: 'https://studio.open-design.ai/t/{sub}/projects/{projectId}/conversations/{conversationId}',
      result: {
        structuredContent: {
          projectId: 'project-1',
          conversationId: 'conversation-1',
          studioUrl: 'https://wrong.example',
        },
        content: [{ type: 'text', text: 'old' }],
      },
    });
    expect(routed.structuredContent.studioUrl).toBe(
      'https://studio.open-design.ai/t/user-a/projects/project-1/conversations/conversation-1',
    );
  });

  it('streams only preview responses supplied by the managed tenant resolver', async () => {
    const fetchTenantPreview = vi.fn(async () => new Response('<h1>Artifact</h1>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', etag: 'preview-v1' },
    }));
    const app = express();
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:9',
      fetchTenantPreview,
      env: {},
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const response = await fetch(
      `http://127.0.0.1:${port}/chatgpt/preview/capability/api/projects/project-1/raw/site/index.html?theme=dark`,
      { headers: { accept: 'text/html' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('preview-v1');
    expect(await response.text()).toBe('<h1>Artifact</h1>');
    expect(fetchTenantPreview).toHaveBeenCalledWith(
      'capability',
      '/api/projects/project-1/raw/site/index.html?theme=dark',
      expect.any(Headers),
    );
  });

  it('runs only the Cloud V1 workflows and removes daemon-private progress data', async () => {
    const createdBodies: unknown[] = [];
    const runBodies: unknown[] = [];
    let walletBalance = '8.40';
    const daemon = express();
    daemon.use(express.json());
    daemon.get('/api/design-systems', (_request, response) => response.json({ designSystems: [
      { id: 'acme', name: 'Acme' },
    ] }));
    daemon.get('/api/design-systems/acme', (_request, response) => response.json({
      designSystem: { id: 'acme', content: '# Acme Design System\n\nUse cobalt for primary actions.' },
    }));
    daemon.get('/api/integrations/vela/status', (_request, response) => response.json({
      loggedIn: true,
      user: { id: 'user-123', email: 'user@example.com' },
      account: { balanceUsd: walletBalance },
    }));
    daemon.get('/api/integrations/vela/wallet', (_request, response) => response.json({
      status: 'available',
      balanceUsd: walletBalance,
    }));
    daemon.get('/api/projects', (_request, response) => response.json({ projects: [{ id: 'p1', name: 'Launch' }] }));
    daemon.post('/api/projects', (request, response) => {
      createdBodies.push(request.body);
      response.json({ project: { id: 'p1', name: 'Launch' }, conversationId: 'c1' });
    });
    daemon.post('/api/runs', (request, response) => {
      runBodies.push(request.body);
      response.json({ id: 'r1', runId: 'r1', projectId: 'p1', conversationId: 'c1', status: 'queued' });
    });
    daemon.get('/api/runs/r1', (_request, response) => response.json({
      id: 'r1',
      projectId: 'p1',
      conversationId: 'c1',
      status: 'running',
      eventsLogPath: '/private/tenant/user-123/events.jsonl',
      access_token: 'must-not-leak',
      nested: { runtime_key: 'must-not-leak-either', safe: 'visible' },
    }));
    daemon.get('/api/mcp/install-info', (_request, response) => response.json({ webBaseUrl: 'https://studio.open-design.ai' }));
    const daemonServer = daemon.listen(0, '127.0.0.1');
    servers.push(daemonServer);
    await new Promise<void>((resolve) => daemonServer.once('listening', resolve));
    const daemonPort = (daemonServer.address() as AddressInfo).port;

    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => `http://127.0.0.1:${daemonPort}`,
      env: {},
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const client = new Client({ name: 'chatgpt-v1-flow-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)) as any);
    try {
      const resources = await client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain('od://design-systems/acme/DESIGN.md');
      expect(resources.resources.some((resource) => resource.uri.startsWith('od://skills/'))).toBe(false);
      const designSystem = await client.readResource({ uri: 'od://design-systems/acme/DESIGN.md' });
      expect(designSystem.contents[0]).toMatchObject({
        mimeType: 'text/markdown',
        text: expect.stringContaining('Use cobalt for primary actions.'),
      });

      await client.callTool({
        name: 'create_project',
        arguments: { name: 'Launch', designSystem: 'acme' },
      });
      expect(createdBodies).toEqual([expect.objectContaining({
        name: 'Launch',
        designSystemId: 'acme',
        skipDiscoveryBrief: true,
      })]);

      const unconfirmed = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'website',
          brief: {
            audience: 'Prospective teams',
            outcome: 'Explain the product',
            contentAndFlows: 'Hero and CTA',
            visualDirection: 'Use Acme',
            outputFormat: 'Responsive website',
          },
          confirmed: false,
        },
      }) as any;
      expect(unconfirmed).toMatchObject({ isError: true });
      expect(JSON.stringify(unconfirmed.content)).toContain('confirmed:true is required');
      expect(runBodies).toHaveLength(0);

      await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'website',
          brief: {
            audience: 'Prospective teams',
            outcome: 'Explain the product and drive signups',
            contentAndFlows: 'Hero, proof, feature sections, pricing CTA',
            visualDirection: 'Use the attached Acme Design System',
            outputFormat: 'Responsive website',
          },
          confirmed: true,
        },
      });
      expect(runBodies).toEqual([{
        projectId: 'p1',
        message: [
          'Artifact type: website',
          'Audience: Prospective teams',
          'Outcome: Explain the product and drive signups',
          'Content and flows: Hero, proof, feature sections, pricing CTA',
          'Visual direction: Use the attached Acme Design System',
          'Output format: Responsive website',
        ].join('\n'),
        skillId: 'frontend-design',
        agentId: 'amr',
      }]);

      const mappingCases = [
        ['product-prototype', 'Interactive prototype', 'frontend-design'],
        ['presentation', 'Browser deck', 'slides'],
        ['design-system', 'DESIGN.md', 'design-md'],
      ] as const;
      for (const [artifactType, outputFormat, expectedSkill] of mappingCases) {
        await client.callTool({
          name: 'start_run',
          arguments: {
            project: 'p1',
            artifactType,
            brief: {
              audience: 'Product team',
              outcome: `Create the ${artifactType}`,
              contentAndFlows: 'Use the confirmed content and interaction requirements',
              visualDirection: 'Follow the Acme Design System',
              outputFormat,
            },
            confirmed: true,
          },
        });
        expect((runBodies.at(-1) as any)?.skillId).toBe(expectedSkill);
        expect((runBodies.at(-1) as any)?.agentId).toBe('amr');
      }

      const progress = await client.callTool({ name: 'get_run', arguments: { runId: 'r1' } }) as any;
      expect(progress.structuredContent).toMatchObject({ status: 'running', projectId: 'p1' });
      expect(progress.structuredContent.eventsLogPath).toBeUndefined();
      expect(progress.structuredContent.access_token).toBeUndefined();
      expect(progress.structuredContent.nested).toEqual({ safe: 'visible' });
      expect(JSON.stringify(progress.content)).not.toContain('/private/tenant');
      expect(JSON.stringify(progress.content)).not.toContain('must-not-leak');

      const rejected = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'video',
          brief: {
            audience: 'Everyone', outcome: 'Make a video', contentAndFlows: 'Scenes', visualDirection: 'Cinematic', outputFormat: 'MP4',
          },
          confirmed: true,
        },
      }) as any;
      expect(rejected.isError).toBe(true);

      walletBalance = '0.00';
      const recharge = await client.callTool({
        name: 'start_run',
        arguments: {
          project: 'p1',
          artifactType: 'presentation',
          brief: {
            audience: 'Leadership', outcome: 'Approve launch', contentAndFlows: 'Ten-slide narrative', visualDirection: 'Executive', outputFormat: 'Browser deck',
          },
          confirmed: true,
        },
      }) as any;
      expect(recharge).toMatchObject({
        isError: true,
        structuredContent: {
          canUseCloud: false,
          nextAction: 'recharge',
          balanceStatus: 'empty',
        },
      });
      expect(runBodies).toHaveLength(4);
    } finally {
      await client.close();
    }
  });

  it('validates OAuth audience, scopes, subject, and fail-closed tenant routing', async () => {
    const env = {
      OD_CHATGPT_OAUTH_ISSUER: 'https://auth.open-design.ai',
      OD_CHATGPT_OAUTH_INTROSPECTION_URL: 'https://auth.open-design.ai/introspect',
      OD_CHATGPT_MCP_RESOURCE_URL: 'https://mcp.open-design.ai/mcp',
      OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: 'https://{sub}.tenant.open-design.internal',
    };
    const remote = {
      headers: { authorization: 'Bearer user-token' },
      socket: { remoteAddress: '203.0.113.10' },
      protocol: 'https',
      body: { method: 'tools/call', params: { name: 'start_run' } },
      get: (name: string) => name === 'host' ? 'mcp.open-design.ai' : undefined,
    } as any;
    const tokenResponse = (scope: string) => vi.fn(async () => new Response(JSON.stringify({
      active: true,
      sub: 'user-123',
      aud: 'https://mcp.open-design.ai/mcp',
      scope,
    })));

    const authorized = await authorizeChatGptMcpRequest(
      remote,
      env,
      tokenResponse('openid opendesign.runs.write') as any,
    );
    expect(authorized).toMatchObject({ ok: true, principal: { mode: 'oauth', subject: 'user-123' } });
    if (!authorized.ok) throw new Error('expected authorized principal');
    expect(resolveChatGptMcpDaemonUrl('http://127.0.0.1:7456', authorized.principal, env)).toBe(
      'https://user-123.tenant.open-design.internal',
    );

    await expect(authorizeChatGptMcpRequest(
      remote,
      env,
      tokenResponse('openid') as any,
    )).resolves.toMatchObject({
      ok: false,
      status: 403,
      code: 'CHATGPT_MCP_INSUFFICIENT_SCOPE',
    });

    expect(() => resolveChatGptMcpDaemonUrl(
      'http://127.0.0.1:7456',
      authorized.principal,
      { ...env, OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: '' },
    )).toThrow(/shared user storage is refused/u);
  });

  it('validates Vela JWT access tokens through JWKS', async () => {
    const issuer = 'https://vela-api.powerformer.net/api/auth';
    const audience = 'https://mcp.open-design.ai/mcp';
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    const token = await new SignJWT({
      scope: 'openid opendesign.runs.write',
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'vela-test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('vela-user-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const fetchJwks = vi.fn(async () => Response.json({
      keys: [{ ...publicJwk, kid: 'vela-test-key', alg: 'ES256', use: 'sig' }],
    }));
    const remote = {
      headers: { authorization: `Bearer ${token}` },
      socket: { remoteAddress: '203.0.113.10' },
      protocol: 'https',
      body: { method: 'tools/call', params: { name: 'start_run' } },
      get: (name: string) => name === 'host' ? 'mcp.open-design.ai' : undefined,
    } as any;
    const env = {
      OD_CHATGPT_OAUTH_ISSUER: issuer,
      OD_CHATGPT_MCP_RESOURCE_URL: audience,
      OD_CHATGPT_MCP_TENANT_URL_TEMPLATE: 'https://{sub}.tenant.open-design.internal',
    };

    await expect(authorizeChatGptMcpRequest(
      remote,
      env,
      fetchJwks as any,
    )).resolves.toMatchObject({
      ok: true,
      accessToken: token,
      principal: { mode: 'oauth', subject: 'vela-user-123' },
    });
    expect(fetchJwks).toHaveBeenCalledWith(
      `${issuer}/jwks`,
      expect.any(Object),
    );

    await expect(authorizeChatGptMcpRequest(
      remote,
      { ...env, OD_CHATGPT_MCP_RESOURCE_URL: 'https://other.example/mcp' },
      fetchJwks as any,
    )).resolves.toMatchObject({
      ok: false,
      status: 401,
      code: 'CHATGPT_MCP_INVALID_TOKEN',
    });
  });

  it('passes the verified OAuth subject and token to managed tenant routing', async () => {
    const issuer = 'https://vela-api.powerformer.net/api/auth';
    const audience = 'https://mcp.open-design.ai/mcp';
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    const token = await new SignJWT({ scope: 'openid profile' })
      .setProtectedHeader({ alg: 'ES256', kid: 'managed-tenant-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('managed-user-123')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const resolveTenantDaemonUrl = vi.fn(async () => 'http://127.0.0.1:9');
    const app = express();
    app.use(express.json());
    registerChatGptMcpRoutes(app, {
      getDaemonUrl: () => 'http://127.0.0.1:8',
      resolveTenantDaemonUrl,
      env: {
        OD_CHATGPT_OAUTH_ISSUER: issuer,
        OD_CHATGPT_MCP_RESOURCE_URL: audience,
      },
      fetchImpl: vi.fn(async () => Response.json({
        keys: [{ ...publicJwk, kid: 'managed-tenant-key', alg: 'ES256', use: 'sig' }],
      })) as any,
    });
    const httpServer = app.listen(0, '127.0.0.1');
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'managed-tenant-test', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(resolveTenantDaemonUrl).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'oauth', subject: 'managed-user-123' }),
      token,
    );
  });
});
