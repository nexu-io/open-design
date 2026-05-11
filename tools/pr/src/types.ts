/**
 * Shared types for tools-pr.
 *
 * Lanes mirror docs/code-review-guidelines.md §4 (default / contract /
 * design-system / skill / craft). Buckets are triage-state derived from
 * review decision + merge state + staleness.
 */

export type Lane =
  | "skill"
  | "design-system"
  | "craft"
  | "contract"
  | "docs"
  | "default"
  | "multi"
  | "unknown";

export type Bucket =
  | "merge-ready"
  | "approved-blocked"
  | "changes-requested"
  | "needs-rebase"
  | "new"
  | "draft"
  | "stale";

export type ForbiddenHit =
  | "restores-apps/nextjs"
  | "restores-packages/shared";

// --- gh `pr list --json` chunked shapes ----------------------------------

export type GhMeta = {
  number: number;
  title: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  reviewDecision: "" | "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "COMMENTED";
  labels: { name: string }[];
  maintainerCanModify: boolean;
  assignees: { login: string }[];
};

export type GhStats = {
  number: number;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus:
    | "CLEAN"
    | "BLOCKED"
    | "BEHIND"
    | "DIRTY"
    | "UNKNOWN"
    | "UNSTABLE"
    | "HAS_HOOKS"
    | "DRAFT";
};

export type GhFiles = {
  number: number;
  files: { path: string; additions: number; deletions: number }[];
};

export type GhReviewsLite = {
  number: number;
  /**
   * Full review history (every state transition by every reviewer). Use
   * `reduceLatestReviewsByAuthor` to collapse to the per-reviewer current
   * state. The full history is needed because `gh pr list --json
   * latestReviews` strips `commit.oid`, while `--json reviews` preserves
   * it — that field is load-bearing for the `stale-approval` tag.
   */
  reviews: {
    author: { login: string } | null;
    body: string;
    state: string;
    submittedAt: string;
    commit?: { oid: string } | null;
  }[];
};

export type GhCommitsLite = {
  number: number;
  commits: {
    oid: string;
    committedDate: string;
    authors: { login: string | null }[];
  }[];
};

export type GhCommentsLite = {
  number: number;
  comments: {
    author: { login: string } | null;
    body: string;
    createdAt: string;
  }[];
};

/**
 * Per-PR ASSIGNED_EVENT / UNASSIGNED_EVENT timeline entries fetched via
 * `gh api graphql` (the only path that exposes `assignedAt` / `actor` for
 * assignment lifecycle on a PR). `kind` distinguishes the two event types
 * after the GraphQL union has been narrowed; `assignee` is the user the
 * event targets (other actor types like Bot / Mannequin are filtered to
 * null at fetch time).
 */
export type GhAssignmentEvent = {
  kind: "ASSIGNED" | "UNASSIGNED";
  createdAt: string;
  actor: { login: string } | null;
  assignee: { login: string } | null;
};

export type GhAssignmentTimeline = {
  number: number;
  events: GhAssignmentEvent[];
};

// --- gh `pr view --json` shape -------------------------------------------

export type GhFile = { path: string; additions: number; deletions: number; changeType: string };

export type GhReview = {
  author: { login: string } | null;
  authorAssociation: string;
  body: string;
  state: string;
  submittedAt: string;
  commit?: { oid: string } | null;
};

export type GhComment = {
  author: { login: string } | null;
  authorAssociation: string;
  body: string;
  createdAt: string;
};

export type GhCheck = {
  __typename: string;
  name?: string;
  workflowName?: string;
  conclusion?: string | null;
  status?: string;
  state?: string;
  context?: string;
};

export type GhView = {
  url: string;
  title: string;
  body: string;
  isDraft: boolean;
  reviewDecision: GhMeta["reviewDecision"];
  mergeStateStatus: GhStats["mergeStateStatus"];
  state: string;
  author: { login: string };
  createdAt: string;
  updatedAt: string;
  labels: { name: string }[];
  additions: number;
  deletions: number;
  changedFiles: number;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  maintainerCanModify: boolean;
  assignees: { login: string }[];
  files: GhFile[];
  statusCheckRollup: GhCheck[];
  reviews: GhReview[];
  comments: GhComment[];
  commits: {
    oid: string;
    committedDate: string;
    authors: { login: string | null }[];
  }[];
};

// --- triage / brief composites -------------------------------------------

export type Pr = {
  number: number;
  title: string;
  author: string;
  ageDays: number;
  staleDays: number;
  isDraft: boolean;
  reviewDecision: GhMeta["reviewDecision"];
  mergeStateStatus: GhStats["mergeStateStatus"];
  size: string | null;
  risk: string | null;
  type: string | null;
  changedFiles: number;
  additions: number;
  deletions: number;
  headRefName: string;
  baseRefName: string;
  lane: Lane;
  laneHits: Set<Lane>;
  forbidden: ForbiddenHit[];
  bucket: Bucket;
  botOnlyApproval: boolean;
};

export type ValidationCommand = { command: string; reason: string };

// --- classify ------------------------------------------------------------

/**
 * A single tag emitted by classify. Each tag carries a script-stable name,
 * a factual reason string (no judgment language), and a source token
 * identifying which data field or rule produced it.
 *
 * `awaitingHours` is set only by the three `awaiting-*` tags; it reports
 * the integer hour count between the awaiting-window start and the
 * classify-run moment. Downstream consumers can floor-divide by 24 to get
 * days, or use it as a sort key to prioritise the longest-waiting PRs
 * inside an awaiting bucket.
 */
export type Tag = {
  name: string;
  reason: string;
  source: string;
  awaitingHours?: number;
};

/**
 * Distilled per-PR facts consumed by tag detectors. Built from either the
 * list-mode chunked fetch or the single-PR `gh pr view` fetch — both
 * representations converge here so detectors stay agnostic.
 */
export type PrFacts = {
  number: number;
  author: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  reviewDecision: GhMeta["reviewDecision"];
  mergeStateStatus: GhStats["mergeStateStatus"];
  maintainerCanModify: boolean;
  isOrgMember: boolean;
  headRefOid: string;
  assignees: string[];
  labels: { name: string }[];
  filePaths: string[];
  reviews: {
    author: { login: string } | null;
    body: string;
    state: string;
    submittedAt: string;
    commit?: { oid: string } | null;
  }[];
  comments: {
    author: { login: string } | null;
    body: string;
    createdAt: string;
  }[];
  commits: {
    committedDate: string;
    authorLogin: string | null;
  }[];
};

/**
 * Cross-PR context passed to detectors that need to look beyond a single
 * PR (e.g. duplicate-title needs the full open-queue title index).
 */
export type ClassifyContext = {
  /** Map of `${author}\0${title}` to PR numbers that share it. */
  titleIndexByAuthor: Map<string, number[]>;
};

export type ClassifyReport = {
  generatedAt: string;
  openPrTotal: number;
  classifiedCount: number;
  byTag: Record<string, number[]>;
  byNumber: Record<string, Tag[]>;
  rate: {
    /** GraphQL points remaining before the fetch started. */
    before: { remaining: number; limit: number; resetAt: string };
    /** GraphQL points remaining after the fetch finished. */
    after: { remaining: number; limit: number; resetAt: string };
    /**
     * Computed delta = before.remaining - after.remaining, *only* when both
     * snapshots fell in the same reset window. `null` when the window rolled
     * over between snapshots and the delta is no longer meaningful.
     */
    cost: number | null;
  };
};

export type Brief = {
  number: number;
  url: string;
  title: string;
  state: string;
  reviewDecision: GhMeta["reviewDecision"];
  mergeStateStatus: GhStats["mergeStateStatus"];
  isDraft: boolean;
  author: string;
  branch: { head: string; base: string };
  age: { createdAt: string; updatedAt: string; ageDays: number; staleDays: number };
  labels: { size: string | null; risk: string | null; type: string | null; all: string[] };
  diff: { additions: number; deletions: number; changedFiles: number };
  lane: Lane;
  laneHits: Lane[];
  forbidden: ForbiddenHit[];
  seamsTouched: string[];
  topFiles: { path: string; additions: number; deletions: number; changeType: string }[];
  filterSuppressedFileCount: number;
  laneRules: string[];
  validation: ValidationCommand[];
  reviews: { author: string; state: string; submittedAt: string; body: string }[];
  reviewCountTotal: number;
  botOnlyApproval: boolean;
  comments: { author: string; createdAt: string; body: string }[];
  commentCountTotal: number;
  checks: { workflow: string; passing: number; failing: number; pending: number; total: number }[];
  bodyPreview: string;
  bodyChars: number;
};
