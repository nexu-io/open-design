import { describe, expect, it } from 'vitest';

import { openCodeSystemTempDirectories } from '../../src/runtimes/opencode-permissions.js';

describe('openCodeSystemTempDirectories', () => {
  it('grants the process temp dir and the literal /tmp agents write to on POSIX', () => {
    expect(openCodeSystemTempDirectories({ TMPDIR: '/var/folders/ab/T' }, 'darwin')).toEqual([
      '/var/folders/ab/T',
      '/tmp',
    ]);
    expect(openCodeSystemTempDirectories({ TMPDIR: '/tmp' }, 'linux')).toEqual(['/tmp']);
  });

  it('uses child temp variable precedence and platform fallbacks', () => {
    expect(openCodeSystemTempDirectories({ TMPDIR: '/custom', TMP: '/second', TEMP: '/third' }, 'linux')).toEqual(['/custom', '/tmp']);
    expect(openCodeSystemTempDirectories({ TMP: '/second', TEMP: '/third' }, 'linux')).toEqual(['/second', '/tmp']);
    expect(openCodeSystemTempDirectories({ TEMP: '/third/' }, 'linux')).toEqual(['/third', '/tmp']);
    expect(openCodeSystemTempDirectories({}, 'linux')).toEqual(['/tmp']);
    expect(openCodeSystemTempDirectories({ TEMP: 'C:\\first', TMP: 'C:\\second' }, 'win32')).toEqual(['C:\\first']);
    expect(openCodeSystemTempDirectories({ Tmp: 'C:\\second\\' }, 'win32')).toEqual(['C:\\second']);
    expect(openCodeSystemTempDirectories({ SystemRoot: 'C:\\Windows' }, 'win32')).toEqual(['C:\\Windows\\temp']);
  });

  it('grants only %TEMP% on Windows', () => {
    expect(
      openCodeSystemTempDirectories({ TEMP: 'C:\\Users\\me\\AppData\\Local\\Temp' }, 'win32'),
    ).toEqual(['C:\\Users\\me\\AppData\\Local\\Temp']);
  });
});
