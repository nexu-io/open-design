// @ts-nocheck
// CWD-relative aliases for resource roots that live outside the agent's
// working directory.
//
// Background. The daemon spawns each code-agent CLI with `cwd` pinned to
// `.od/projects/<id>/`, but skill bodies and design-system specs live in
// repository-level folders (`<repo>/skills/`, `<repo>/design-systems/`).
// The legacy approach was to inject absolute paths into the skill body and
// rely on every agent CLI exposing an "extra allowed directory" flag
// (Claude Code's / Copilot's `--add-dir`). That contract is fragile:
//
//   1. Most agents (codex, gemini, opencode, cursor-agent, qwen, pi,
//      hermes, kimi) have no equivalent flag, so absolute paths simply
//      fail with a directory-access policy error (issue #430).
//   2. Claude Code itself can refuse the path under specific permission
//      / trust configurations even with `--add-dir` set.
//
// Fix. Before composing the prompt, the daemon stages a directory link
// inside the project cwd for every resource root the prompt references.
// On POSIX we use a symbolic link; on Windows a directory junction (which
// does not require the SeCreateSymbolicLinkPrivilege). The skill preamble
// then refers to resources via the alias (`.od-skills/<id>/...`), which
// is a path inside the agent's cwd and therefore works for every CLI.
// `--add-dir` is still passed for Claude/Copilot as a belt-and-suspenders
// fallback in case junction/symlink creation fails.
//
// The function is idempotent: running it on every chat turn is cheap, and
// it self-heals when the alias is missing or repoints if the target
// moved. It refuses to overwrite a pre-existing non-symlink entry under
// the same name to avoid clobbering user data.

import { lstat, readlink, realpath, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';

export const SKILLS_CWD_ALIAS = '.od-skills';
export const DESIGN_SYSTEMS_CWD_ALIAS = '.od-design-systems';

export interface CwdAliasSpec {
  name: string;
  target: string;
}

export type CwdAliasLogger = (message: string) => void;

export async function ensureCwdAliases(
  cwd: string,
  specs: CwdAliasSpec[],
  log: CwdAliasLogger = () => {},
): Promise<void> {
  if (!cwd || !Array.isArray(specs)) return;
  for (const spec of specs) {
    if (!spec || typeof spec.name !== 'string' || typeof spec.target !== 'string') {
      continue;
    }
    try {
      await ensureOne(cwd, spec, log);
    } catch (err) {
      log(
        `[od] cwd-alias failed: ${spec.name} -> ${spec.target}: ${
          (err && err.message) || String(err)
        }`,
      );
    }
  }
}

async function ensureOne(cwd, spec, log) {
  const linkPath = path.join(cwd, spec.name);
  const targetAbs = path.resolve(spec.target);

  // The source must exist as a directory; otherwise the alias would point
  // at nothing. Skip silently — this matches how the chat handler already
  // filters `extraAllowedDirs` with `fs.existsSync`.
  try {
    const targetStat = await lstat(targetAbs);
    if (!targetStat.isDirectory()) return;
  } catch {
    return;
  }

  let linkStat;
  try {
    linkStat = await lstat(linkPath);
  } catch {
    await createDirLink(linkPath, targetAbs);
    return;
  }

  // On Windows, fs.symlink('junction') still reports isSymbolicLink() === true
  // through Node's lstat (see node/fs docs), so a single branch covers both
  // POSIX symlinks and Windows directory junctions.
  if (linkStat.isSymbolicLink()) {
    if (await pointsAt(linkPath, targetAbs)) return;
    try {
      await unlink(linkPath);
    } catch (err) {
      log(`[od] cwd-alias: failed to refresh ${linkPath}: ${err.message}`);
      return;
    }
    await createDirLink(linkPath, targetAbs);
    return;
  }

  // A real file or directory is sitting under the reserved alias name.
  // Refuse to overwrite — that would destroy user data we did not create.
  log(
    `[od] cwd-alias: ${linkPath} exists and is not a symlink; leaving it alone (skill resources will fall back to --add-dir paths)`,
  );
}

async function createDirLink(linkPath, target) {
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  await symlink(target, linkPath, type);
}

async function pointsAt(linkPath, target) {
  try {
    const resolved = await realpath(linkPath);
    return pathsEqual(resolved, target);
  } catch {
    // Dangling link — let the caller refresh it.
    try {
      const raw = await readlink(linkPath);
      const abs = path.isAbsolute(raw)
        ? raw
        : path.resolve(path.dirname(linkPath), raw);
      return pathsEqual(abs, target);
    } catch {
      return false;
    }
  }
}

function pathsEqual(a, b) {
  const la = path.resolve(a);
  const lb = path.resolve(b);
  if (process.platform === 'win32') return la.toLowerCase() === lb.toLowerCase();
  return la === lb;
}
