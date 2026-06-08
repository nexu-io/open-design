// Shared types for tools-link-check.

export interface DeadRef {
  /** Relative path to the file that contains the dead reference. */
  file: string;
  /** The target that does not resolve to an existing file. */
  target: string;
  /** 1-based line number where the reference appears. */
  line: number;
}

export interface PrimaryEntry {
  file: string;
  entry: string;
  updatedAt: string;
}

export interface EntryMiss {
  file: string;
  entry: string;
}

export interface SchemaIssue {
  primary: PrimaryEntry[];
  /** By updatedAt, the most-recent primary that should win if forced. */
  current: string | null;
  entryMisses: EntryMiss[];
}

export interface Orphan {
  file: string;
}

export interface ProjectScanResult {
  projectId: string;
  htmlCount: number;
  artifactCount: number;
  uniqueRefCount: number;
  deadRefs: DeadRef[];
  schema: SchemaIssue | null;
  orphans: Orphan[];
}

export interface ScanResult {
  projects: ProjectScanResult[];
  totals: {
    projects: number;
    html: number;
    artifact: number;
    refs: number;
    deadRefs: number;
    schemaProjects: number;
    orphanProjects: number;
  };
}

export type FixReason = "primary" | "mtime";

export interface FixProposal {
  /** Project id (`od/projects/<id>/`). */
  projectId: string;
  /** Relative path of the file that contains the dead reference. */
  file: string;
  /** 1-based line number where the reference appears. */
  line: number;
  /** Current (dead) target string. */
  oldTarget: string;
  /** Replacement target pointing to an existing sibling. */
  newTarget: string;
  /** Which heuristic picked the sibling. */
  reason: FixReason;
}

export interface FixSummary {
  proposals: FixProposal[];
  applied: boolean;
  mutatedFiles: number;
}
