import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncAuthorityDirectory, TouchpointReplayAuthority, writeAuthorityFile } from '../../src/storage/touchpoint-replay-authority.js';

let directory: string;
const owners: TouchpointReplayAuthority[] = [];
const open = () => { const owner = new TouchpointReplayAuthority(directory); owners.push(owner); return owner; };
const journal = () => JSON.parse(fs.readFileSync(path.join(directory, 'replay-authority.json'), 'utf8'));
beforeEach(() => { directory = fs.mkdtempSync(path.join(tmpdir(), 'replay-journal-')); });
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;
afterEach(() => { Object.defineProperty(process, 'platform', platformDescriptor); vi.restoreAllMocks(); for (const owner of owners.splice(0)) owner.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const failure = () => { throw Object.assign(new Error('injected durable authority failure'), { code: 'EIO' }); };
type Fault = 'write' | 'rename' | 'file-fsync' | 'directory-fsync';
function inject(fault: Fault) {
  if (fault === 'write') vi.spyOn(fs, 'writeFileSync').mockImplementation(failure);
  else if (fault === 'rename') vi.spyOn(fs, 'renameSync').mockImplementation(failure);
  else {
    const original = fs.fsyncSync;
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      if (fs.fstatSync(fd).isDirectory() === (fault === 'directory-fsync')) failure();
      original(fd);
    });
  }
}
const faults: Fault[] = process.platform === 'win32'
  ? ['write', 'rename', 'file-fsync']
  : ['write', 'rename', 'file-fsync', 'directory-fsync'];

describe('platform-specific journal synchronization', () => {
  const platform = (value: NodeJS.Platform) => Object.defineProperty(process, 'platform', { ...platformDescriptor, value });

  it('Windows uses the process-crash contract without opening directories', () => {
    platform('win32');
    const openDirectory = vi.spyOn(fs, 'openSync').mockImplementation(failure);
    expect(() => syncAuthorityDirectory(directory)).not.toThrow();
    expect(openDirectory).not.toHaveBeenCalled();
  });

  it('Windows flushes a writable file before rename without requiring directory handles', () => {
    platform('win32');
    const originalOpen = fs.openSync;
    const originalSync = fs.fsyncSync;
    const flagsByFd = new Map<number, fs.OpenMode>();
    const flushed: number[] = [];
    vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) failure();
      const fd = originalOpen(file, flags, mode);
      flagsByFd.set(fd, flags);
      return fd;
    });
    vi.spyOn(fs, 'fsyncSync').mockImplementation(fd => {
      // Models FlushFileBuffers requiring write access, not a Windows kernel run.
      expect(flagsByFd.get(fd)).toBe('r+');
      originalSync(fd);
      flushed.push(fd);
    });
    const file = path.join(directory, 'nested', 'journal.json');
    writeAuthorityFile(file, '{"pending":["operation"]}');
    expect(flushed).toHaveLength(1);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"pending":["operation"]}');
    expect(fs.readdirSync(path.dirname(file))).toEqual(['journal.json']);
  });

  it('Windows file fsync errors still propagate and cannot complete a write', () => {
    platform('win32');
    vi.spyOn(fs, 'fsyncSync').mockImplementation(failure);
    const file = path.join(directory, 'journal.json');
    expect(() => writeAuthorityFile(file, '{}')).toThrow('injected durable authority failure');
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it.each(['darwin', 'linux'] as const)('%s does not ignore directory open or sync I/O errors', host => {
    platform(host);
    const openDirectory = vi.spyOn(fs, 'openSync').mockImplementation(failure);
    expect(() => syncAuthorityDirectory(directory)).toThrow('injected durable authority failure');
    // A modeled POSIX descriptor keeps this branch test runnable on Windows.
    openDirectory.mockReturnValue(12345);
    const closeDirectory = vi.spyOn(fs, 'closeSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'fsyncSync').mockImplementation(failure);
    expect(() => syncAuthorityDirectory(directory)).toThrow('injected durable authority failure');
    expect(closeDirectory).toHaveBeenCalledExactlyOnceWith(12345);
  });
});

describe('durable account journal and exclusive native ownership', () => {
  it('retains simultaneous tokens independently; clean settled restart keeps the generation', () => {
    const owner = open(); const generation = owner.generation;
    const first = owner.begin()!; const second = owner.begin()!;
    expect(journal().pending).toEqual([first, second]);
    expect(owner.settle(second)).toBe(true); expect(journal().pending).toEqual([first]);
    expect(owner.settle(first)).toBe(true); owner.close();
    expect(open().generation).toBe(generation); expect(journal().pending).toEqual([]);
  });
  it('an unresolved operation advances generation only after durable recovery', () => {
    const owner = open(); const generation = owner.generation; owner.begin(); owner.close();
    expect(open().generation).not.toBe(generation); expect(journal().pending).toEqual([]);
  });
  it.each(['missing', 'corrupt'])('fails old generation closed with %s provenance', kind => {
    const owner = open(); const generation = owner.generation; owner.close();
    if (kind === 'missing') fs.rmSync(path.join(directory, 'replay-authority.json'));
    else fs.writeFileSync(path.join(directory, 'replay-authority.json'), '{bad');
    expect(open().generation).not.toBe(generation);
  });
  it('a contender cannot recover, begin, settle or change the owner journal', () => {
    const owner = open(); const token = owner.begin()!; const before = journal();
    const contender = open(); expect(contender.generation).toBeNull();
    expect(contender.begin()).toBeNull(); expect(contender.settle(token)).toBe(false);
    expect(journal()).toEqual(before); expect(owner.settle(token)).toBe(true);
  });
  it('different account directories have independent native ownership', () => {
    const first = open(); const other = new TouchpointReplayAuthority(path.join(directory, 'another-account')); owners.push(other);
    expect(first.begin()).not.toBeNull(); expect(other.begin()).not.toBeNull();
  });
  it('a native lock initialization failure is fail closed', () => {
    fs.mkdirSync(path.join(directory, 'replay-owner.sqlite'));
    const owner = open(); expect(owner.generation).toBeNull(); expect(owner.begin()).toBeNull();
    expect(fs.existsSync(path.join(directory, 'replay-authority.json'))).toBe(false);
  });
  it.each(faults)('pre-marker %s failure cannot authorize dispatch', fault => {
    const owner = open(); inject(fault);
    expect(owner.begin()).toBeNull(); expect(owner.generation).toBeNull();
    vi.restoreAllMocks(); expect(owner.begin()).toBeNull();
  });
  it.each(faults)('settlement %s failure cannot erase the in-memory unresolved token', fault => {
    const owner = open(); const token = owner.begin()!; inject(fault);
    expect(owner.settle(token)).toBe(false);
    vi.restoreAllMocks(); expect(owner.settle(token)).toBe(true); expect(journal().pending).toEqual([]);
  });
  it.each(faults)('recovery %s failure refuses ownership and never authorizes dispatch', fault => {
    const owner = open(); owner.begin(); owner.close(); inject(fault);
    const successor = open(); expect(successor.generation).toBeNull(); expect(successor.begin()).toBeNull();
    vi.restoreAllMocks(); expect(successor.begin()).toBeNull();
  });
  it('shutdown keeps unresolved evidence and closes idempotently', () => {
    const owner = open(); owner.begin(); const before = journal(); owner.close(); owner.close();
    expect(journal()).toEqual(before); expect(owner.begin()).toBeNull();
  });
});
