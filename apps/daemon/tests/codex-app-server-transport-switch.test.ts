import { describe, expect, it } from 'vitest';
import {
  CODEX_APP_SERVER_MIN_VERSION,
  CODEX_APP_SERVER_STREAM_FORMAT,
  codexAgentDef,
  codexAppServerSupportsVersion,
  codexTransportPreference,
  resolveCodexTransport,
  withCodexTransport,
} from '../src/runtimes/defs/codex.js';

/**
 * The app-server transport ships behind a runtime switch. Two properties are
 * load-bearing and are asserted here rather than argued in a PR body:
 *
 *  1. With the switch forced off the codex runtime definition is the SAME OBJECT the
 *     registry has always exported — not a copy that happens to hold equal
 *     fields. Object identity is the strongest available proof that no code
 *     path downstream of the def can observe a difference.
 *  2. The switch is resolved from the process environment at run time. The
 *     app-server transport is the shipping default; an operator can roll back
 *     with `OD_CODEX_TRANSPORT=exec-json` and a daemon restart — no rebuild or
 *     code edit, and both transports stay reachable.
 */
describe('codex transport switch', () => {
  describe('codexTransportPreference', () => {
    it('defaults to app-server when unset or empty', () => {
      expect(codexTransportPreference({})).toBe('app-server');
      expect(codexTransportPreference({ OD_CODEX_TRANSPORT: '' })).toBe('app-server');
    });

    it('reads the three supported values', () => {
      expect(codexTransportPreference({ OD_CODEX_TRANSPORT: 'app-server' })).toBe('app-server');
      expect(codexTransportPreference({ OD_CODEX_TRANSPORT: 'exec-json' })).toBe('exec-json');
      expect(codexTransportPreference({ OD_CODEX_TRANSPORT: 'auto' })).toBe('auto');
    });

    it('is case- and whitespace-tolerant', () => {
      expect(codexTransportPreference({ OD_CODEX_TRANSPORT: '  App-Server ' })).toBe('app-server');
    });

    it('falls back to exec-json for an unrecognised value', () => {
      expect(codexTransportPreference({ OD_CODEX_TRANSPORT: 'grpc' })).toBe('exec-json');
    });
  });

  describe('codexAppServerSupportsVersion', () => {
    it('accepts the floor and anything above it', () => {
      expect(codexAppServerSupportsVersion(CODEX_APP_SERVER_MIN_VERSION)).toBe(true);
      expect(codexAppServerSupportsVersion('0.149.1')).toBe(true);
      expect(codexAppServerSupportsVersion('codex-cli 0.149.1')).toBe(true);
    });

    it('rejects versions below the floor', () => {
      // rust-v0.64.0 is where `thread/tokenUsage/updated` starts being emitted
      // and rust-v0.59.0 where `item/agentMessage/delta` does, but the floor
      // sits at the release where `initialize` first accepts a `capabilities`
      // object — see CODEX_APP_SERVER_MIN_VERSION for why.
      expect(codexAppServerSupportsVersion('0.94.0')).toBe(false);
      expect(codexAppServerSupportsVersion('0.64.0')).toBe(false);
      expect(codexAppServerSupportsVersion('0.58.0')).toBe(false);
      expect(codexAppServerSupportsVersion('0.42.0')).toBe(false);
    });

    it('compares numerically, not lexically', () => {
      // '0.100.0' sorts BEFORE '0.95.0' as a string; a naive comparison would
      // reject every modern codex.
      expect(codexAppServerSupportsVersion('0.100.0')).toBe(true);
      expect(codexAppServerSupportsVersion('1.0.0')).toBe(true);
      expect(codexAppServerSupportsVersion('0.9.0')).toBe(false);
    });

    it('rejects an unknown version rather than guessing', () => {
      expect(codexAppServerSupportsVersion(null)).toBe(false);
      expect(codexAppServerSupportsVersion('')).toBe(false);
      expect(codexAppServerSupportsVersion('nightly')).toBe(false);
    });
  });

  describe('resolveCodexTransport', () => {
    it('uses app-server by default', () => {
      expect(resolveCodexTransport({ env: {}, version: '0.149.1' })).toBe('app-server');
    });

    it('auto upgrades only when the installed codex is new enough', () => {
      const env = { OD_CODEX_TRANSPORT: 'auto' };
      expect(resolveCodexTransport({ env, version: '0.149.1' })).toBe('app-server');
      expect(resolveCodexTransport({ env, version: '0.64.0' })).toBe('exec-json');
      expect(resolveCodexTransport({ env, version: '0.58.0' })).toBe('exec-json');
      expect(resolveCodexTransport({ env, version: null })).toBe('exec-json');
    });

    it('honours an explicit force even when the version probe says no', () => {
      expect(
        resolveCodexTransport({ env: { OD_CODEX_TRANSPORT: 'app-server' }, version: '0.42.0' }),
      ).toBe('app-server');
      expect(
        resolveCodexTransport({ env: { OD_CODEX_TRANSPORT: 'app-server' }, version: null }),
      ).toBe('app-server');
    });

    it('honours an explicit force-off on a new codex', () => {
      expect(
        resolveCodexTransport({ env: { OD_CODEX_TRANSPORT: 'exec-json' }, version: '0.149.1' }),
      ).toBe('exec-json');
    });
  });

  describe('withCodexTransport', () => {
    it('returns the identical def object when the transport is exec-json', () => {
      expect(withCodexTransport(codexAgentDef, 'exec-json')).toBe(codexAgentDef);
    });

    it('never mutates the shared def when overriding', () => {
      const before = {
        streamFormat: codexAgentDef.streamFormat,
        promptViaStdin: codexAgentDef.promptViaStdin,
        args: codexAgentDef.buildArgs('p', [], [], {}, { cwd: '/w' }),
      };
      withCodexTransport(codexAgentDef, 'app-server');
      expect(codexAgentDef.streamFormat).toBe(before.streamFormat);
      expect(codexAgentDef.promptViaStdin).toBe(before.promptViaStdin);
      expect(codexAgentDef.buildArgs('p', [], [], {}, { cwd: '/w' })).toEqual(before.args);
    });

    it('swaps streamFormat and drops stdin prompt delivery under app-server', () => {
      const overridden = withCodexTransport(codexAgentDef, 'app-server');
      expect(overridden).not.toBe(codexAgentDef);
      expect(overridden.id).toBe('codex');
      expect(overridden.streamFormat).toBe(CODEX_APP_SERVER_STREAM_FORMAT);
      // The prompt travels as a `turn/start` param, not on stdin.
      expect(overridden.promptViaStdin).toBe(false);
      // Capture-style resume still applies: the thread id comes off the stream.
      expect(overridden.capturesSessionIdFromStream).toBe(true);
      expect(overridden.resumesSessionViaCli).toBe(true);
    });

    it('launches the app-server subcommand instead of exec', () => {
      const overridden = withCodexTransport(codexAgentDef, 'app-server');
      const args = overridden.buildArgs('prompt', [], [], {}, { cwd: '/workspace' });
      expect(args[0]).toBe('app-server');
      expect(args).not.toContain('exec');
      expect(args).not.toContain('--json');
      // Model / reasoning / sandbox travel over JSON-RPC, not argv.
      expect(args).not.toContain('--sandbox');
      expect(args).not.toContain('-C');
    });

    it('keeps the OpenDesign shell-environment overrides on argv', () => {
      const overridden = withCodexTransport(codexAgentDef, 'app-server');
      const args = overridden.buildArgs('prompt', [], [], {}, { cwd: '/workspace' });
      const execArgs = codexAgentDef.buildArgs('prompt', [], [], {}, { cwd: '/workspace' });
      const shellPolicyArgs = execArgs.filter((a) => a.startsWith('shell_environment_policy'));
      expect(shellPolicyArgs.length).toBeGreaterThan(0);
      for (const arg of shellPolicyArgs) expect(args).toContain(arg);
    });

    it('reproduces --sandbox network access and --add-dir as config overrides', () => {
      const overridden = withCodexTransport(codexAgentDef, 'app-server');
      const args = overridden.buildArgs('p', [], ['/extra/one', '/extra/two'], {}, { cwd: '/w' });
      expect(args).toContain('sandbox_workspace_write.network_access=true');
      expect(args).toContain(
        'sandbox_workspace_write.writable_roots=["/extra/one","/extra/two"]',
      );
    });

    it('omits the writable-roots override when no extra dirs were granted', () => {
      const overridden = withCodexTransport(codexAgentDef, 'app-server');
      const args = overridden.buildArgs('p', [], [], {}, { cwd: '/w' });
      expect(args.some((a) => a.startsWith('sandbox_workspace_write.writable_roots'))).toBe(false);
    });

    it('still forwards the plugin isolation flag', () => {
      const overridden = withCodexTransport(codexAgentDef, 'app-server');
      const args = overridden.buildArgs('p', [], [], {}, { cwd: '/w', disablePlugins: true });
      expect(args).toContain('--disable');
      expect(args).toContain('plugins');
    });

    it('leaves a non-codex def untouched under either transport', () => {
      const other = { ...codexAgentDef, id: 'not-codex' };
      expect(withCodexTransport(other, 'app-server')).toBe(other);
      expect(withCodexTransport(other, 'exec-json')).toBe(other);
    });
  });
});
