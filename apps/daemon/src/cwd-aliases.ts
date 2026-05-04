// Stage the active skill into the agent's project cwd so its side files
// (assets/, references/) are reachable through a cwd-relative path
// (`.od-skills/<folder>/...`). The chat handler invokes
// `stageActiveSkill()` once per turn before spawning the agent; the
// skill preamble emitted by `withSkillRootPreamble()` advertises both
// the cwd-relative alias path (primary) and the absolute repo path
// (fallback) so agents work whether or not staging succeeds.
//
// Why a per-project copy and not a symlink/junction
// -------------------------------------------------
// An earlier draft of this fix (PR #435 round 1) created a directory
// link pointing at the repository's live `skills/` tree. Reviewers
// flagged that as a write-amplification vulnerability: agents have
// write access to their cwd, and a `Write`/`Edit`/`Bash` call against
// `.od-skills/<id>/SKILL.md` resolves through the symlink and mutates
// the shipped resource itself. Per-project copies eliminate that
// channel — every byte under `.od-skills/` is a private working copy,
// and corrupting it has no effect on other projects or on the source.
//
// Cost. We only stage the *active* skill, not the entire SKILLS_DIR;
// individual skills are typically 1–3 MB. On APFS / btrfs / ReFS
// `fs.cp` uses copy-on-write where available, so the steady-state cost
// is a few syscalls.
//
// Source symlinks. We `dereference: true` so the staged copy is fully
// self-contained — nothing inside it can write back to a real file
// outside the project. We also call `stat()` (not `lstat()`) on the
// source root so an environment that puts `skills/` itself behind a
// symlink (e.g. a content-addressable mount) is followed correctly.

import { cp, lstat, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const SKILLS_CWD_ALIAS = '.od-skills';

export type SkillStagingLogger = (message: string) => void;

export interface SkillStagingResult {
  /** True when a usable copy of the source is sitting at `stagedPath`. */
  staged: boolean;
  /** Absolute path of the staged directory if staging succeeded. */
  stagedPath?: string;
  /** Populated when staging was skipped or failed; never thrown. */
  reason?: string;
}

/**
 * Copy `<sourceDir>` to `<cwd>/.od-skills/<folderName>/` so an agent can
 * reach skill side files via a cwd-relative path. Idempotent and
 * non-throwing — failures are logged and surfaced via the result so the
 * caller falls back to absolute-path delivery (`--add-dir` for
 * Claude/Copilot, embedded absolute path in the preamble for others).
 *
 * The previous-turn copy is replaced wholesale on every call, which is
 * the simplest correct way to handle skill-source updates (e.g. the
 * user just edited a `references/*.md` mid-session).
 */
export async function stageActiveSkill(
  cwd: string | null | undefined,
  folderName: string,
  sourceDir: string,
  log: SkillStagingLogger = () => {},
): Promise<SkillStagingResult> {
  if (!cwd) {
    return { staged: false, reason: 'no project cwd' };
  }
  if (!isSafeAliasSegment(folderName)) {
    return { staged: false, reason: `unsafe folder name "${folderName}"` };
  }

  // `stat()` follows symlinks so a symlinked SKILLS_DIR or a symlinked
  // skill folder is treated as the directory it points at, not skipped.
  let sourceStat;
  try {
    sourceStat = await stat(sourceDir);
  } catch (err) {
    return {
      staged: false,
      reason: `source missing: ${(err as Error).message}`,
    };
  }
  if (!sourceStat.isDirectory()) {
    return { staged: false, reason: 'source is not a directory' };
  }

  const aliasRoot = path.join(cwd, SKILLS_CWD_ALIAS);
  const stagedPath = path.join(aliasRoot, folderName);

  // The alias root is OD-reserved. If the user (or some unrelated tool)
  // has put a real file under that name, refuse to clobber it. A
  // legacy symlink left by an earlier daemon version is replaced with
  // a real directory so we own the writable namespace.
  try {
    const aliasStat = await lstat(aliasRoot);
    if (aliasStat.isSymbolicLink()) {
      log(
        `[od] skill-stage: replacing legacy symlink at ${aliasRoot} with a real directory`,
      );
      await rm(aliasRoot, { recursive: true, force: true });
    } else if (!aliasStat.isDirectory()) {
      log(
        `[od] skill-stage: ${aliasRoot} exists and is not a directory; refusing to stage`,
      );
      return {
        staged: false,
        reason: 'alias root taken by a non-directory entry',
      };
    }
  } catch {
    // does not exist — created by `cp` below
  }

  try {
    // Wipe a stale per-skill copy first so a removed source file is
    // reflected and a partially-failed previous run cannot leave junk
    // behind.
    await rm(stagedPath, { recursive: true, force: true });
    await cp(sourceDir, stagedPath, {
      recursive: true,
      // Resolve every symlink we find inside the skill so the staged
      // copy is a fully self-contained set of regular files. This is
      // what makes the copy a true write barrier — no entry under
      // `.od-skills/...` can resolve back to a real file outside the
      // project cwd.
      dereference: true,
      preserveTimestamps: true,
    });
    return { staged: true, stagedPath };
  } catch (err) {
    log(`[od] skill-stage failed: ${(err as Error).message}`);
    return { staged: false, reason: (err as Error).message };
  }
}

const UNSAFE_ALIAS_RE = /[\\/]|\0/;

/**
 * Returns true if `name` is safe to use as a single path segment under
 * the alias root. Rejects empty strings, dot-segments (`.`/`..`), path
 * separators (`/`, `\`), null bytes, and absolute paths so a malformed
 * caller cannot escape the alias root.
 */
function isSafeAliasSegment(name: unknown): name is string {
  if (typeof name !== 'string') return false;
  if (name.length === 0) return false;
  if (name === '.' || name === '..') return false;
  if (UNSAFE_ALIAS_RE.test(name)) return false;
  if (path.isAbsolute(name)) return false;
  return true;
}
