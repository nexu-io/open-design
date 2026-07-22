#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_SCOPES = [
  'opendesign.account.read',
  'opendesign.projects.read',
  'opendesign.projects.write',
  'opendesign.runs.read',
  'opendesign.runs.write',
  'opendesign.versions.write',
  'opendesign.exports.read',
] as const;

const EXPECTED_TOOLS = [
  'cancel_run',
  'collect_brief',
  'create_project',
  'export_project',
  'get_cloud_account',
  'get_run',
  'list_versions',
  'restore_version',
  'start_run',
] as const;

interface JsonRpcResponse {
  error?: { message?: string };
  result?: Record<string, unknown>;
}

interface CheckResult {
  detail: string;
  name: string;
  status: 'passed' | 'skipped';
}

interface Options {
  accessTokenEnv: string;
  expectedIssuer: string | null;
  json: boolean;
  mcpUrl: string;
  requireAppId: boolean;
}

function parseArgs(argv: string[]): Options {
  let mcpUrl = '';
  let expectedIssuer: string | null = null;
  let accessTokenEnv = 'OD_CHATGPT_TEST_ACCESS_TOKEN';
  let json = false;
  let requireAppId = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      return value;
    };
    if (argument === '--mcp-url') mcpUrl = next();
    else if (argument === '--issuer') expectedIssuer = next();
    else if (argument === '--access-token-env') accessTokenEnv = next();
    else if (argument === '--require-app-id') requireAppId = true;
    else if (argument === '--json') json = true;
    else if (argument === '--help' || argument === '-h') {
      process.stdout.write([
        'Usage: pnpm exec tsx plugins/open-design/scripts/verify-production.ts --mcp-url <https-url> [options]',
        '',
        'Options:',
        '  --issuer <url>             Require this exact OAuth issuer',
        '  --access-token-env <name>  Read a real user token from this env var',
        '                             (default: OD_CHATGPT_TEST_ACCESS_TOKEN)',
        '  --require-app-id           Require an asdk_app id in .app.json',
        '  --json                     Print one machine-readable result',
        '',
      ].join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!mcpUrl) throw new Error('--mcp-url is required');
  const parsed = new URL(mcpUrl);
  if (parsed.protocol !== 'https:') throw new Error('production MCP URL must use HTTPS');
  if (parsed.hash) throw new Error('production MCP URL must not include a fragment');
  return { accessTokenEnv, expectedIssuer, json, mcpUrl: parsed.toString(), requireAppId };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function parseMcpBody(text: string, contentType: string): JsonRpcResponse {
  if (contentType.includes('application/json')) return JSON.parse(text) as JsonRpcResponse;
  const messages = text
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()) as JsonRpcResponse);
  const message = messages.find((item) => item.result || item.error);
  if (!message) throw new Error('MCP response did not contain a JSON-RPC result');
  return message;
}

async function jsonResponse(url: string): Promise<{ body: Record<string, unknown>; response: Response }> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  assert(!response.headers.get('location'), `${url} must not redirect`);
  return { body: await response.json() as Record<string, unknown>, response };
}

async function rpc(mcpUrl: string, id: number, method: string, params: Record<string, unknown>, accessToken?: string): Promise<Record<string, unknown>> {
  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = parseMcpBody(await response.text(), response.headers.get('content-type') ?? '');
  if (!response.ok || body.error) throw new Error(body.error?.message || `MCP ${method} returned HTTP ${response.status}`);
  assert(body.result, `MCP ${method} response is missing result`);
  return body.result;
}

function oauthMetadataUrl(issuer: string): string {
  const url = new URL(issuer);
  const issuerPath = url.pathname.replace(/\/+$/u, '');
  return new URL(`/.well-known/oauth-authorization-server${issuerPath}`, url.origin).toString();
}

function add(checks: CheckResult[], name: string, detail: string, status: 'passed' | 'skipped' = 'passed'): void {
  checks.push({ detail, name, status });
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: unknown; hostname?: unknown; message?: unknown } | undefined;
  if (!cause) return error.message;
  const detail = [
    typeof cause.code === 'string' ? cause.code : null,
    typeof cause.hostname === 'string' ? cause.hostname : null,
    typeof cause.message === 'string' ? cause.message : null,
  ].filter(Boolean).join(' · ');
  return detail ? `${error.message} (${detail})` : error.message;
}

async function verifyAppId(checks: CheckResult[], requireAppId: boolean): Promise<void> {
  const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const manifest = JSON.parse(await readFile(resolve(pluginRoot, '.app.json'), 'utf8')) as { apps?: Record<string, { id?: unknown; required?: unknown }> };
  const app = Object.values(manifest.apps ?? {}).find((value) => typeof value?.id === 'string' && /^asdk_app_/u.test(value.id));
  if (!app) {
    assert(!requireAppId, '.app.json does not contain the ChatGPT-assigned asdk_app id');
    add(checks, 'ChatGPT app id', 'pending Developer Mode registration', 'skipped');
    return;
  }
  assert(app.required === true, 'the registered ChatGPT app must be required');
  add(checks, 'ChatGPT app id', String(app.id));
}

async function verify(options: Options): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  await verifyAppId(checks, options.requireAppId);

  const resourceUrl = new URL('/.well-known/oauth-protected-resource/mcp', options.mcpUrl).toString();
  const { body: resourceMetadata, response: resourceResponse } = await jsonResponse(resourceUrl);
  assert(resourceResponse.url.startsWith('https://'), 'protected-resource metadata was not served over HTTPS');
  assert(resourceMetadata.resource === options.mcpUrl, `resource metadata audience must exactly equal ${options.mcpUrl}`);
  const issuers = stringArray(resourceMetadata.authorization_servers);
  assert(issuers.length === 1, 'resource metadata must advertise exactly one authorization server');
  const issuer = issuers[0];
  assert(issuer, 'resource metadata is missing an OAuth issuer');
  if (options.expectedIssuer) assert(issuer === options.expectedIssuer, `OAuth issuer must exactly equal ${options.expectedIssuer}`);
  for (const scope of REQUIRED_SCOPES) assert(stringArray(resourceMetadata.scopes_supported).includes(scope), `resource metadata is missing scope ${scope}`);
  add(checks, 'Protected resource', `${options.mcpUrl} -> ${issuer}`);

  const { body: oauth } = await jsonResponse(oauthMetadataUrl(issuer));
  assert(oauth.issuer === issuer, 'OAuth metadata issuer does not match the protected resource');
  for (const field of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'jwks_uri']) {
    assert(typeof oauth[field] === 'string' && String(oauth[field]).startsWith('https://'), `OAuth metadata is missing HTTPS ${field}`);
  }
  assert(stringArray(oauth.grant_types_supported).includes('authorization_code'), 'OAuth server must support authorization_code');
  assert(stringArray(oauth.grant_types_supported).includes('refresh_token'), 'OAuth server must support refresh_token');
  assert(stringArray(oauth.code_challenge_methods_supported).includes('S256'), 'OAuth server must advertise PKCE S256');
  assert(stringArray(oauth.token_endpoint_auth_methods_supported).includes('none'), 'OAuth server must allow a public client');
  for (const scope of REQUIRED_SCOPES) assert(stringArray(oauth.scopes_supported).includes(scope), `OAuth metadata is missing scope ${scope}`);
  add(checks, 'OAuth discovery', 'authorization code + refresh + PKCE S256 + public registration');

  const publicInitialized = await rpc(options.mcpUrl, 1, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'open-design-public-verifier', version: '1.0.0' },
  });
  assert((publicInitialized.serverInfo as Record<string, unknown>)?.name === 'open-design', 'anonymous endpoint is not Open Design');
  const publicTools = await rpc(options.mcpUrl, 2, 'tools/list', {});
  const publicToolList = publicTools.tools as Array<Record<string, unknown>> | undefined;
  assert(Array.isArray(publicToolList), 'anonymous tools/list did not return tools');
  const publicBrief = publicToolList.find((tool) => tool.name === 'collect_brief');
  const publicBriefMeta = publicBrief?._meta as Record<string, unknown> | undefined;
  const publicBriefSchemes = publicBriefMeta?.securitySchemes as Array<Record<string, unknown>> | undefined;
  assert(publicBriefSchemes?.[0]?.type === 'noauth', 'collect_brief is not published as an anonymous tool');
  const publicBriefCall = await rpc(options.mcpUrl, 3, 'tools/call', {
    name: 'collect_brief',
    arguments: {
      artifactType: 'website',
      projectTitle: 'Production verification',
      knownAnswers: { audience: 'Open Design production verifier' },
      questionForm: {
        id: 'production-website-brief',
        title: 'Confirm the production website direction',
        description: 'These choices are specific to this verification request.',
        lang: 'en',
        submitLabel: 'Confirm and continue',
        questions: [
          {
            id: 'primaryCta',
            label: 'What should the primary action be?',
            type: 'radio',
            required: true,
            allowCustom: false,
            defaultValue: 'inspect-plugin',
            options: [
              { label: 'Inspect the plugin', value: 'inspect-plugin' },
              { label: 'Open the generated site', value: 'open-site' },
            ],
          },
        ],
      },
    },
  });
  const publicBriefOutput = publicBriefCall.structuredContent as Record<string, unknown> | undefined;
  assert(publicBriefOutput?.view === 'brief-form', 'anonymous collect_brief did not return the Custom UI state');
  assert((publicBriefOutput?.questionForm as Record<string, unknown> | undefined)?.id === 'production-website-brief', 'anonymous collect_brief did not preserve the dynamic QuestionForm');
  const publicWidgetUri = String(publicBriefMeta?.['openai/outputTemplate'] ?? '');
  assert(publicWidgetUri.startsWith('ui://open-design/artifact-card-'), 'collect_brief is missing its widget URI');
  const publicWidget = await rpc(options.mcpUrl, 4, 'resources/read', { uri: publicWidgetUri });
  const publicWidgetContents = publicWidget.contents as Array<Record<string, unknown>> | undefined;
  assert(publicWidgetContents?.[0]?.mimeType === 'text/html;profile=mcp-app', 'anonymous widget resource is unavailable');
  add(checks, 'Public brief UI', 'tools/list, collect_brief, and widget resource are anonymous');

  const protectedCall = await fetch(options.mcpUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'get_cloud_account', arguments: {} },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  assert(protectedCall.status === 401, `unauthenticated protected tool must return 401, got ${protectedCall.status}`);
  const challenge = protectedCall.headers.get('www-authenticate') ?? '';
  assert(/^Bearer\b/iu.test(challenge), 'unauthenticated MCP response is missing a Bearer challenge');
  assert(challenge.includes('resource_metadata='), 'Bearer challenge is missing resource_metadata');
  add(checks, 'OAuth challenge', 'protected tools fail closed with resource metadata');

  const accessToken = process.env[options.accessTokenEnv]?.trim() ?? '';
  if (!accessToken) {
    add(checks, 'User OAuth flow', `set ${options.accessTokenEnv} to verify personal account and tools`, 'skipped');
    return checks;
  }

  const initialized = await rpc(options.mcpUrl, 6, 'initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'open-design-production-verifier', version: '1.0.0' },
  }, accessToken);
  assert((initialized.serverInfo as Record<string, unknown>)?.name === 'open-design', 'authenticated endpoint is not Open Design');
  const listed = await rpc(options.mcpUrl, 7, 'tools/list', {}, accessToken);
  const tools = listed.tools as Array<Record<string, unknown>> | undefined;
  assert(Array.isArray(tools), 'authenticated tools/list did not return tools');
  const names = tools.map((tool) => String(tool.name)).sort();
  assert(JSON.stringify(names) === JSON.stringify([...EXPECTED_TOOLS].sort()), `unexpected production tools: ${names.join(', ')}`);
  const accountCall = await rpc(options.mcpUrl, 8, 'tools/call', { name: 'get_cloud_account', arguments: {} }, accessToken);
  const account = accountCall.structuredContent as Record<string, unknown> | undefined;
  assert(account?.loggedIn === true, 'production token did not resolve to a signed-in Open Design user');
  assert(typeof account.balanceStatus === 'string', 'production account did not return wallet status');
  add(checks, 'User OAuth flow', `signed in · wallet ${String(account.balanceStatus)} · nine V1 tools`);
  return checks;
}

const options = parseArgs(process.argv.slice(2));
verify(options).then((checks) => {
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, mcpUrl: options.mcpUrl, checks })}\n`);
    return;
  }
  for (const check of checks) process.stdout.write(`${check.status === 'passed' ? 'PASS' : 'SKIP'}  ${check.name}: ${check.detail}\n`);
  process.stdout.write('Production Open Design ChatGPT boundary verified.\n');
}).catch((error) => {
  const message = errorMessage(error);
  if (options.json) process.stdout.write(`${JSON.stringify({ ok: false, mcpUrl: options.mcpUrl, error: message })}\n`);
  else process.stderr.write(`Production verification failed: ${message}\n`);
  process.exitCode = 1;
});
