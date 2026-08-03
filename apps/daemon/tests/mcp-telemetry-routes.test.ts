import { describe, expect, it, vi } from 'vitest';

import {
  resolveMcpAnalyticsContext,
  resolveTrustedMcpEventContext,
  sanitizeMcpAnalyticsProperties,
  validateMcpAnalyticsEventProperties,
} from '../src/routes/telemetry.js';

describe('local MCP telemetry privacy boundary', () => {
  it('reuses the Open Design installation id and creates it only for opted-in headless use', async () => {
    const writeAppConfig = vi.fn(async (_dataDir: string, patch: Record<string, unknown>) => ({
      telemetry: { metrics: true },
      installationId: patch.installationId,
    }));

    await expect(resolveMcpAnalyticsContext({
      dataDir: '/isolated',
      readAppConfig: vi.fn(async () => ({
        telemetry: { metrics: true },
        installationId: 'existing-installation',
      })) as never,
      writeAppConfig: writeAppConfig as never,
    })).resolves.toEqual({
      enabled: true,
      deviceId: 'existing-installation',
      locale: 'en',
    });
    expect(writeAppConfig).not.toHaveBeenCalled();

    const created = await resolveMcpAnalyticsContext({
      dataDir: '/isolated',
      readAppConfig: vi.fn(async () => ({
        telemetry: { metrics: true },
      })) as never,
      writeAppConfig: writeAppConfig as never,
    });
    expect(created.enabled).toBe(true);
    expect(created.deviceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(writeAppConfig).toHaveBeenCalledTimes(1);
  });

  it('does not create or expose an identity after explicit telemetry opt-out', async () => {
    const writeAppConfig = vi.fn();
    await expect(resolveMcpAnalyticsContext({
      dataDir: '/isolated',
      readAppConfig: vi.fn(async () => ({
        telemetry: { metrics: false },
        installationId: 'must-not-be-exposed',
      })) as never,
      writeAppConfig: writeAppConfig as never,
    })).resolves.toEqual({
      enabled: false,
      deviceId: null,
      locale: 'en',
    });
    expect(writeAppConfig).not.toHaveBeenCalled();
  });

  it('accepts MCP events only when their device id matches the opted-in installation', async () => {
    const readConfig = vi.fn(async () => ({
      telemetry: { metrics: true },
      installationId: 'trusted-installation',
    }));
    const deps = {
      dataDir: '/isolated',
      readAppConfig: readConfig as never,
      writeAppConfig: vi.fn() as never,
    };
    const baseContext = {
      deviceId: 'trusted-installation',
      sessionId: 'session-1',
      clientType: 'external_mcp' as const,
      locale: 'en',
      requestId: null,
    };

    await expect(
      resolveTrustedMcpEventContext(deps, baseContext),
    ).resolves.toEqual(baseContext);
    await expect(
      resolveTrustedMcpEventContext(deps, {
        ...baseContext,
        deviceId: 'caller-controlled-installation',
      }),
    ).resolves.toBeNull();

    readConfig.mockResolvedValue({
      telemetry: { metrics: false },
      installationId: 'trusted-installation',
    });
    await expect(
      resolveTrustedMcpEventContext(deps, baseContext),
    ).resolves.toBeNull();
  });

  it('keeps only the bounded MCP analytics allowlist and drops content or credentials', () => {
    expect(sanitizeMcpAnalyticsProperties({
      tool_name: 'start_run',
      result: 'failed',
      error_code: 'DAEMON_UNREACHABLE',
      duration_ms: 123,
      retryable: true,
      prompt: 'private user prompt',
      api_key: 'secret',
      error_message: 'raw upstream text',
    })).toEqual({
      tool_name: 'start_run',
      result: 'failed',
      error_code: 'DAEMON_UNREACHABLE',
      duration_ms: 123,
      retryable: true,
    });
  });

  it('validates MCP event-specific required fields and bounded enum values', () => {
    expect(validateMcpAnalyticsEventProperties('mcp_tool_finished', {
      mcp_session_id: '018f6f2e-1111-7111-8111-111111111111',
      host_product: 'codex_unknown',
      tool_name: 'start_run',
      tool_attempt_id: '018f6f2e-2222-7222-8222-222222222222',
      attempt_number: 1,
      result: 'failed',
      duration_ms: 123,
      error_code: 'DAEMON_UNREACHABLE',
      failure_stage: 'run_accept',
      failure_source: 'open_design_daemon',
      failure_category: 'availability',
      retryable: true,
      user_action: 'start_open_design',
    })).toMatchObject({
      result: 'failed',
      duration_ms: 123,
    });

    expect(() => validateMcpAnalyticsEventProperties('mcp_tool_finished', {
      mcp_session_id: '018f6f2e-1111-7111-8111-111111111111',
      host_product: 'invented-host',
      tool_name: 'start_run',
      tool_attempt_id: '018f6f2e-2222-7222-8222-222222222222',
      attempt_number: 1,
      result: 'invented-result',
      duration_ms: -1,
    })).toThrow(/invalid MCP analytics/u);

    expect(sanitizeMcpAnalyticsProperties({
      client_name: 'raw-high-cardinality-client',
      client_version: 'raw-version',
      host_product: 'codex_unknown',
    })).toEqual({
      host_product: 'codex_unknown',
    });
  });
});
