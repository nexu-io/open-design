import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface GitCommandGuardInstall {
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
  guardDir?: string;
  realGit?: string;
}

const DISABLED_VALUES = new Set(['', '0', 'false', 'no', 'off']);
const FORCE_PUSH_ARGS = new Set(['-f', '--force']);
const STASH_DESTRUCTIVE_SUBCOMMANDS = new Set(['drop', 'clear']);
const GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE = new Set([
  '-C',
  '-c',
  '--exec-path',
  '--git-dir',
  '--namespace',
  '--object-directory',
  '--super-prefix',
  '--work-tree',
]);

export function isGitCommandGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = String(env.OD_GIT_COMMAND_GUARD ?? '').trim().toLowerCase();
  return !DISABLED_VALUES.has(raw);
}

export function gitCommandBlockedReason(args: readonly string[]): string | null {
  const command = firstGitSubcommand(args);
  if (!command) return null;
  switch (command.value) {
    case 'reset':
      return args.some((arg) => arg === '--hard')
        ? 'git reset --hard discards workspace changes'
        : null;
    case 'clean':
      return gitCleanBlockedReason(args, command.index);
    case 'stash':
      return STASH_DESTRUCTIVE_SUBCOMMANDS.has(String(args[command.index + 1] ?? '').trim().toLowerCase())
        ? 'git stash drop/clear discards saved work'
        : null;
    case 'push':
      return args.slice(command.index + 1).some(isForcePushArg)
        ? 'git push --force can rewrite remote history'
        : null;
    case 'checkout':
      return hasDestructiveCheckoutArg(args, command.index)
        ? 'git checkout can discard workspace changes'
        : null;
    case 'restore':
      return 'git restore can discard workspace changes';
    default:
      return null;
  }
}

function gitCleanBlockedReason(args: readonly string[], commandIndex: number): string | null {
  const cleanArgs = args.slice(commandIndex + 1);
  if (cleanArgs.some(isDryRunCleanArg)) return null;
  return cleanArgs.some(isDestructiveCleanArg)
    ? 'git clean with force/delete flags removes untracked files'
    : null;
}

export function installGitCommandGuard(env: NodeJS.ProcessEnv = process.env): GitCommandGuardInstall {
  if (!isGitCommandGuardEnabled(env)) {
    return { env, cleanup: () => undefined };
  }
  const envPath = readPathEnv(env);
  const realGit = resolveGitBinary(envPath.value);
  if (!realGit) {
    return { env, cleanup: () => undefined };
  }
  const guardDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-git-guard-'));
  fs.writeFileSync(path.join(guardDir, 'git'), POSIX_GIT_GUARD, { mode: 0o755 });
  fs.writeFileSync(path.join(guardDir, 'git.cmd'), WINDOWS_GIT_GUARD);
  return {
    env: {
      ...env,
      OD_REAL_GIT_BIN: realGit,
      [envPath.key]: `${guardDir}${path.delimiter}${envPath.value}`,
    },
    cleanup: () => {
      try {
        fs.rmSync(guardDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; the temp dir is harmless if the OS wins a race.
      }
    },
    guardDir,
    realGit,
  };
}

function firstGitSubcommand(args: readonly string[]): { value: string; index: number } | null {
  for (let index = 0; index < args.length; index += 1) {
    const value = String(args[index] ?? '').trim();
    if (!value) continue;
    if (gitGlobalOptionConsumesSeparateValue(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith('-')) continue;
    return { value: value.toLowerCase(), index };
  }
  return null;
}

function gitGlobalOptionConsumesSeparateValue(value: string): boolean {
  return GIT_GLOBAL_OPTIONS_WITH_SEPARATE_VALUE.has(value);
}

function readPathEnv(env: NodeJS.ProcessEnv): { key: string; value: string } {
  const envPathKey = findPathEnvKey(env);
  if (envPathKey) {
    return { key: envPathKey, value: env[envPathKey] ?? '' };
  }
  const processPathKey = findPathEnvKey(process.env);
  return {
    key: processPathKey ?? 'PATH',
    value: processPathKey ? process.env[processPathKey] ?? '' : '',
  };
}

function findPathEnvKey(env: NodeJS.ProcessEnv): string | null {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? null;
}

function isDestructiveCleanArg(arg: string): boolean {
  if (arg === '--force' || arg === '-f' || arg === '-d' || arg === '-x' || arg === '-X') return true;
  return arg.startsWith('-') && !arg.startsWith('--') && /[dfxX]/.test(arg.slice(1));
}

function isDryRunCleanArg(arg: string): boolean {
  if (arg === '--dry-run' || arg === '-n') return true;
  return arg.startsWith('-') && !arg.startsWith('--') && arg.slice(1).includes('n');
}

function isForcePushArg(arg: string): boolean {
  return FORCE_PUSH_ARGS.has(arg) || arg.startsWith('--force-with-lease') || arg.startsWith('+');
}

function hasDestructiveCheckoutArg(args: readonly string[], commandIndex: number): boolean {
  let checkoutOperandCount = 0;
  let skipNext = false;
  for (let index = commandIndex + 1; index < args.length; index += 1) {
    const arg = String(args[index] ?? '').trim();
    if (!arg) continue;
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg === '-f' || arg === '--force') return true;
    if (arg === '--' && index + 1 < args.length) return true;
    if (checkoutOptionConsumesSeparateValue(arg)) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith('-')) continue;
    checkoutOperandCount += 1;
    if (checkoutOperandCount > 1 || isLikelyCheckoutPathOperand(arg)) return true;
  }
  return false;
}

function checkoutOptionConsumesSeparateValue(arg: string): boolean {
  return arg === '-b' || arg === '-B' || arg === '--orphan' || arg === '--pathspec-from-file';
}

function isLikelyCheckoutPathOperand(arg: string): boolean {
  return arg === '.' || arg === '..' || arg.startsWith('./') || arg.startsWith('../');
}

function resolveGitBinary(pathValue: string): string | null {
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of process.platform === 'win32' ? ['git.exe', 'git.cmd', 'git.bat'] : ['git']) {
      const candidate = path.join(dir, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Keep looking.
      }
    }
  }
  return null;
}

const POSIX_GIT_GUARD = `#!/bin/sh
cmd=""
skip_next=""
option_consumes_next() {
  case "$1" in
    -C|-c|--exec-path|--git-dir|--namespace|--object-directory|--super-prefix|--work-tree) return 0 ;;
    *) return 1 ;;
  esac
}

checkout_option_consumes_next() {
  case "$1" in
    -b|-B|--orphan|--pathspec-from-file) return 0 ;;
    *) return 1 ;;
  esac
}

checkout_operand_is_path() {
  case "$1" in
    .|..|./*|../*) return 0 ;;
    *) return 1 ;;
  esac
}

for arg in "$@"; do
  if [ "$skip_next" = "1" ]; then
    skip_next=""
    continue
  fi
  if option_consumes_next "$arg"; then
    skip_next="1"
    continue
  fi
  case "$arg" in
    -*) continue ;;
    *) cmd="$arg"; break ;;
  esac
done

blocked=""
case "$cmd" in
  reset)
    for arg in "$@"; do [ "$arg" = "--hard" ] && blocked="git reset --hard discards workspace changes"; done
    ;;
  clean)
    seen=""
    dry_run=""
    for arg in "$@"; do
      [ "$seen" = "1" ] || { [ "$arg" = "clean" ] && seen="1"; continue; }
      case "$arg" in
        --dry-run|-n) dry_run="1" ;;
        --*) ;;
        -*) case "\${arg#-}" in *n*) dry_run="1" ;; esac ;;
      esac
    done
    if [ "$dry_run" != "1" ]; then
      seen=""
      for arg in "$@"; do
        [ "$seen" = "1" ] || { [ "$arg" = "clean" ] && seen="1"; continue; }
        case "$arg" in
          --force|-f|-d|-x|-X) blocked="git clean with force/delete flags removes untracked files" ;;
          --*) ;;
          -*) case "\${arg#-}" in *d*|*f*|*x*|*X*) blocked="git clean with force/delete flags removes untracked files" ;; esac ;;
        esac
      done
    fi
    ;;
  stash)
    sub=""
    seen=""
    for arg in "$@"; do
      [ "$seen" = "1" ] && { sub="$arg"; break; }
      [ "$arg" = "stash" ] && seen="1"
    done
    case "$sub" in drop|clear) blocked="git stash drop/clear discards saved work" ;; esac
    ;;
  push)
    seen=""
    for arg in "$@"; do
      [ "$seen" = "1" ] || { [ "$arg" = "push" ] && seen="1"; continue; }
      case "$arg" in -f|--force|--force-with-lease*|+*) blocked="git push --force can rewrite remote history" ;; esac
    done
    ;;
  checkout)
    seen=""
    saw_pathspec_delimiter=""
    skip_checkout_value=""
    checkout_operand_count=0
    for arg in "$@"; do
      [ "$seen" = "1" ] || { [ "$arg" = "checkout" ] && seen="1"; continue; }
      if [ "$skip_checkout_value" = "1" ]; then
        skip_checkout_value=""
        continue
      fi
      if [ "$saw_pathspec_delimiter" = "1" ]; then
        blocked="git checkout can discard workspace changes"
        break
      fi
      case "$arg" in
        -f|--force) blocked="git checkout can discard workspace changes" ;;
        --) saw_pathspec_delimiter="1" ;;
        -*) checkout_option_consumes_next "$arg" && skip_checkout_value="1" ;;
        *)
          checkout_operand_count=$((checkout_operand_count + 1))
          if [ "$checkout_operand_count" -gt 1 ] || checkout_operand_is_path "$arg"; then
            blocked="git checkout can discard workspace changes"
            break
          fi
          ;;
      esac
    done
    ;;
  restore)
    blocked="git restore can discard workspace changes"
    ;;
esac

if [ -n "$blocked" ]; then
  printf 'Open Design git command guard blocked: %s\\n' "$blocked" >&2
  exit 126
fi

exec "$OD_REAL_GIT_BIN" "$@"
`;

const WINDOWS_GIT_GUARD = `@echo off
node -e "process.exit(0)" >NUL 2>NUL
if errorlevel 1 (
  echo Open Design git command guard requires node on PATH. 1>&2
  exit /b 126
)
node -e "const args=process.argv.slice(1); const valueOptions=new Set(['-C','-c','--exec-path','--git-dir','--namespace','--object-directory','--super-prefix','--work-tree']); const checkoutValueOptions=new Set(['-b','-B','--orphan','--pathspec-from-file']); let cmd='',cmdIndex=-1; for(let i=0;i<args.length;i++){const a=args[i]||''; if(valueOptions.has(a)){i++; continue} if(a.startsWith('-')) continue; cmd=a; cmdIndex=i; break} const c=cmd.toLowerCase(); const isClean=a=>a==='--force'||a==='-f'||a==='-d'||a==='-x'||a==='-X'||(a.startsWith('-')&&!a.startsWith('--')&&/[dfxX]/.test(a.slice(1))); const isCleanDryRun=a=>a==='--dry-run'||a==='-n'||(a.startsWith('-')&&!a.startsWith('--')&&a.slice(1).includes('n')); const isPush=a=>a==='-f'||a==='--force'||a.startsWith('--force-with-lease')||a.startsWith('+'); const isCheckoutPath=a=>a==='.'||a==='..'||a.startsWith('./')||a.startsWith('../'); const isCheckout=()=>{let operands=0,skip=false; for(let i=cmdIndex+1;i<args.length;i++){const a=args[i]||''; if(skip){skip=false; continue} if(a==='-f'||a==='--force') return true; if(a==='--'&&i+1<args.length) return true; if(checkoutValueOptions.has(a)){skip=true; continue} if(a.startsWith('-')) continue; operands++; if(operands>1||isCheckoutPath(a)) return true} return false}; const commandArgs=args.slice(cmdIndex+1); const cleanArgs=args.slice(cmdIndex+1); const blocked=(c==='reset'&&args.includes('--hard'))||(c==='clean'&&!cleanArgs.some(isCleanDryRun)&&cleanArgs.some(isClean))||(c==='stash'&&['drop','clear'].includes((args[cmdIndex+1]||'').toLowerCase()))||(c==='push'&&commandArgs.some(isPush))||(c==='checkout'&&isCheckout())||c==='restore'; if(blocked){console.error('Open Design git command guard blocked destructive git command'); process.exit(126)}" %*
if errorlevel 1 exit /b %errorlevel%
"%OD_REAL_GIT_BIN%" %*
`;
