// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module shell/commands
 * Buffered subprocess execution and POSIX login-shell command assembly.
 *
 * `execFileBuffered` runs a child process and resolves a never-rejecting
 * `{ ok, code, stdout, stderr, error }` result. The `build*ShellCommand`
 * helpers quote and assemble a command line, and `buildLoginShellCommand`
 * re-exports the daemon's PATH so agent wrappers and test fakes stay visible
 * inside a `sh -c` invocation. `execGhBuffered` / `execCommandViaLoginShell`
 * route through that login-shell wrapper on POSIX (and run the binary directly
 * on win32) so `gh` and other tools resolve the same PATH the daemon sees.
 *
 * Extracted verbatim from apps/daemon/src/server.ts (strangler-fig slice 2).
 * server.ts imports `execCommandViaLoginShell` back for its route deps and one
 * inline plugin-share route. NOTE: `cli.ts` keeps its own independent copies of
 * these helpers; deduping the two onto this module is a separate follow-up.
 */

import { execFile } from 'node:child_process';

/**
 * Run a child process to completion, buffering stdout/stderr, and resolve a
 * never-rejecting result. Defaults: 120s timeout, 1 MiB max buffer.
 * @param command Executable to run.
 * @param args Argument vector.
 * @param opts Overrides merged onto the default `execFile` options.
 * @returns `{ ok, code, stdout, stderr, error }` — `ok` is false on any error;
 *   stdout/stderr are trimmed strings.
 */
function execFileBuffered(command, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 120_000, maxBuffer: 1024 * 1024, ...opts }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code,
        stdout: String(stdout ?? '').trim(),
        stderr: String(stderr ?? '').trim(),
        error,
      });
    });
  });
}

/** Single-quote a value for safe inclusion in a POSIX shell command line. */
function quotePosixShellArg(value) {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/** Assemble a quoted `gh <args...>` command line. */
function buildGhShellCommand(args) {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

/** Assemble a quoted `<command> <args...>` command line. */
function buildCommandShellCommand(command, args) {
  return [command, ...args].map(quotePosixShellArg).join(' ');
}

/**
 * Wrap an inner shell command so it runs with the daemon's PATH re-exported.
 * @param innerCommand Already-quoted command line to run.
 * @returns A `sh -c`-ready command string that restores PATH first.
 */
function buildLoginShellCommand(innerCommand) {
  // Use a non-login shell and re-export PATH so test fakes and agent wrappers
  // remain visible; login shells often reset PATH from profile scripts.
  return `export PATH=${quotePosixShellArg(process.env.PATH ?? '')}; ${innerCommand}`;
}

/**
 * Run `gh <args...>` buffered. On POSIX, routes through the login-shell PATH
 * wrapper; on win32, invokes `gh` directly.
 * @param args Arguments passed to `gh`.
 * @param opts `execFileBuffered` option overrides.
 * @returns Buffered `{ ok, code, stdout, stderr, error }` result.
 */
function execGhBuffered(args, opts = {}) {
  if (process.platform === 'win32') return execFileBuffered('gh', args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
    ...opts,
  });
}

/**
 * Run an arbitrary `<command> <args...>` buffered through the login-shell PATH
 * wrapper on POSIX (direct invocation on win32).
 * @param command Executable to run.
 * @param args Argument vector.
 * @param opts `execFileBuffered` option overrides.
 * @returns Buffered `{ ok, code, stdout, stderr, error }` result.
 */
function execCommandViaLoginShell(command, args, opts = {}) {
  if (process.platform === 'win32') return execFileBuffered(command, args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildCommandShellCommand(command, args))], {
    env: process.env,
    ...opts,
  });
}

/**
 * Probe that the GitHub CLI is installed and authenticated for github.com.
 * @returns `{ ok: true, log }` when ready, or `{ ok: false, code, message,
 *   url, log }` describing the remediation step.
 * @remarks Currently has no callers in the daemon (cli.ts performs its own
 *   inline gh-readiness checks); retained through this move and flagged for a
 *   follow-up dead-code removal.
 */
async function ensureGhReady() {
  const version = await execGhBuffered(['--version'], { timeout: 10_000 });
  if (!version.ok) {
    return {
      ok: false,
      code: 'gh-not-installed',
      message: 'GitHub CLI is not installed. Install it, then click this action again.',
      url: 'https://cli.github.com/',
      log: [version.stderr || version.stdout || 'gh --version failed'],
    };
  }
  const auth = await execGhBuffered(['auth', 'status', '--hostname', 'github.com'], { timeout: 10_000 });
  if (!auth.ok) {
    return {
      ok: false,
      code: 'gh-not-authenticated',
      message: 'GitHub CLI is installed but not authenticated. Run `gh auth login --web`, finish browser authorization, then click this action again.',
      url: 'https://github.com/login/device',
      log: [auth.stderr || auth.stdout || 'gh auth status failed'],
    };
  }
  return { ok: true, log: [version.stdout, auth.stderr || auth.stdout].filter(Boolean) };
}

export {
  buildCommandShellCommand,
  buildGhShellCommand,
  buildLoginShellCommand,
  ensureGhReady,
  execCommandViaLoginShell,
  execFileBuffered,
  execGhBuffered,
  quotePosixShellArg,
};
