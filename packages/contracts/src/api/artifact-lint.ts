// Artifact lint — the anti-slop linter's wire contract.
//
// The daemon has served POST /api/artifacts/lint (and returned the same
// findings inline from POST /api/artifacts/save) since the linter landed,
// but the shape only ever existed as a private type in
// apps/daemon/src/lint-artifact.ts. This file makes it a shared DTO so the
// CLI (`od lint`) and web surfaces parse one contract instead of
// re-declaring the daemon's internals.

export type ArtifactLintSeverity = 'P0' | 'P1' | 'P2';

export interface ArtifactLintFinding {
  severity: ArtifactLintSeverity;
  /** Stable rule id, e.g. `purple-gradient`, `invented-metric`. */
  id: string;
  message: string;
  /** Actionable remediation, phrased for the generating agent. */
  fix: string;
  /** Offending excerpt when the rule can isolate one. */
  snippet?: string;
}

export interface LintArtifactRequest {
  html: string;
}

export interface LintArtifactResponse {
  findings: ArtifactLintFinding[];
  /**
   * Findings pre-rendered as an `<artifact-lint>` block, formatted to be
   * spliced into the generating agent's next turn for self-correction.
   */
  agentMessage: string;
}

/** Severity threshold for `od lint`'s exit code. `none` never fails. */
export type LintFailOn = 'p0' | 'p1' | 'p2' | 'none';

export interface LintArtifactCliCounts {
  p0: number;
  p1: number;
  p2: number;
}

/** Machine envelope printed by `od lint --json`. */
export interface LintArtifactCliResultEnvelope {
  ok: boolean;
  file: string;
  failOn: LintFailOn;
  counts: LintArtifactCliCounts;
  findings: ArtifactLintFinding[];
  agentMessage: string;
}
