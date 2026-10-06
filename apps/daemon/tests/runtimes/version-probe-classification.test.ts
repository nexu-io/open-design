import { describe, expect, it } from 'vitest';
import { classifyVersionProbeFailure } from '../../src/runtimes/detection.js';

/**
 * Build the rejection shape `promisify(execFile)` produces, which is what
 * `probeVersionAtPath` actually catches: an `Error` carrying `code` (a string
 * for an OS-level rejection, the exit status for a process that ran) plus the
 * captured `stdout` / `stderr`.
 */
function execFileError(code: string | number | undefined, stderr = ''): Error {
  const err = new Error('Command failed') as Error & {
    code?: string | number;
    stdout: string;
    stderr: string;
  };
  if (code !== undefined) err.code = code;
  err.stdout = '';
  err.stderr = stderr;
  return err;
}

// The spawn-level cases already have end-to-end coverage in
// `executable-fallback.test.ts`, which writes real shims and runs them. This
// suite exists for the half that no fixture can reach on the machines this
// suite runs on: the launcher vocabulary and exit status that only ever appear
// on Windows.
//
// A POSIX shell cannot produce them. Exit statuses are masked to 8 bits there,
// so `exit 9009` arrives as 49, and cmd.exe / PowerShell's wording is never
// spoken by /bin/sh. Driving the classifier directly is therefore the only way
// the merge gate — which runs the daemon suite on Linux only — can catch a
// typo in a signature the fix depends on for the platform the bug came from.
describe('version probe failure classification', () => {
  describe('the OS rejected the spawn', () => {
    it.each([
      ['ENOENT', 'missing-target'],
      ['ENOTDIR', 'missing-target'],
      ['EACCES', 'not-executable'],
    ] as const)('treats %s as %s', (code, cause) => {
      expect(classifyVersionProbeFailure(execFileError(code))).toEqual({
        kind: 'not-invocable',
        cause,
      });
    });
  });

  describe('the launcher ran but never reached its target', () => {
    it('treats POSIX 126 as a permission failure, not a missing target', () => {
      expect(classifyVersionProbeFailure(execFileError(126))).toEqual({
        kind: 'not-invocable',
        cause: 'not-executable',
      });
    });

    it('treats POSIX 127 as a missing target', () => {
      expect(classifyVersionProbeFailure(execFileError(127))).toEqual({
        kind: 'not-invocable',
        cause: 'missing-target',
      });
    });

    // cmd.exe's analogue of 127. Unreachable from a POSIX fixture: exit
    // statuses are masked to 8 bits, so a shell asked for 9009 yields 49.
    it('treats cmd.exe 9009 as a missing target', () => {
      expect(classifyVersionProbeFailure(execFileError(9009))).toEqual({
        kind: 'not-invocable',
        cause: 'missing-target',
      });
    });

    // Each of these is a real launcher saying it could not reach the program
    // the wrapper names, while exiting 1 like any ordinary failure. This is
    // the field failure ivy-ting reported on native Windows: without matching
    // the wording there is nothing to separate them from a healthy CLI.
    it.each([
      [
        'node, package uninstalled behind an npm wrapper',
        "Error: Cannot find module 'C:\\Users\\1\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh-cmdline\\bin\\dsh.js'\n  code: 'MODULE_NOT_FOUND'\n",
      ],
      [
        'cmd.exe, command missing',
        "'dsh' is not recognized as an internal or external command,\noperable program or batch file.\n",
      ],
      [
        'cmd.exe, path missing',
        'The system cannot find the path specified.\n',
      ],
      [
        'cmd.exe, file missing',
        'The system cannot find the file specified.\n',
      ],
      [
        'PowerShell, cmdlet missing',
        "dsh : The term 'dsh' is not recognized as the name of a cmdlet, function, script file, or operable program.\n",
      ],
      [
        'PowerShell, typed exception',
        'CategoryInfo : ObjectNotFound: (dsh:String) [], CommandNotFoundException\n',
      ],
    ])('treats exit 1 with %s as a missing target', (_label, stderr) => {
      expect(classifyVersionProbeFailure(execFileError(1, stderr))).toEqual({
        kind: 'not-invocable',
        cause: 'missing-target',
      });
    });
  });

  // The constraint ivy-ting asked for by name: "without treating every exit
  // code 1 as broken". A CLI that runs its own code and rejects its arguments
  // is a real answer from the right binary. Abandoning it would send a user
  // with a perfectly good install to some other copy of the same CLI.
  describe('the binary ran and answered for itself', () => {
    it.each([
      ['an ordinary argument complaint', "dsh: unknown flag '--version'\n"],
      ['no stderr at all', ''],
      [
        'wording that belongs to run-failure telemetry, not resolution',
        'dsh is not installed. Run the installer and try again.\n',
      ],
    ])('treats exit 1 with %s as spawned', (_label, stderr) => {
      expect(classifyVersionProbeFailure(execFileError(1, stderr))).toEqual({
        kind: 'spawned',
        version: null,
      });
    });

    it('does not read a non-string stderr as launcher output', () => {
      const err = new Error('Command failed') as Error & {
        code: number;
        stderr: unknown;
      };
      err.code = 1;
      err.stderr = Buffer.from('MODULE_NOT_FOUND');
      expect(classifyVersionProbeFailure(err)).toEqual({
        kind: 'spawned',
        version: null,
      });
    });

    it('treats a timeout kill, which carries no exit status, as spawned', () => {
      expect(classifyVersionProbeFailure(execFileError(undefined))).toEqual({
        kind: 'spawned',
        version: null,
      });
    });
  });
});
