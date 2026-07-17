/** @module core/types
 * Shared types, interfaces, and tuning constants used across all tools-connectors-cli submodules.
 */

/** A plain JSON-serializable object keyed by string. */
export type JsonObject = Record<string, unknown>;

/** Normalized error shape returned from CLI failures and daemon API errors. */
export interface CliError {
  code?: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  requestId?: string;
}

/** Return value from any top-level CLI handler, carrying the process exit code. */
export interface ToolCliResult {
  exitCode: number;
}

/** Parsed CLI options produced by `parseOptions`; used by every subcommand handler. */
export interface ParsedOptions {
  command: string | undefined;
  connectorId?: string;
  toolName?: string;
  inputPath?: string;
  localPath?: string;
  repo?: string;
  ref?: string;
  outputPath?: string;
  maxFiles?: number;
  requireConnector?: boolean;
  referencePackage?: boolean;
  failOnWarnings?: boolean;
  useCase?: 'personal_daily_digest';
  format: 'compact' | 'json';
  help: boolean;
}

/** Usage text printed when `od tools connectors` is run without a recognized subcommand or with `--help`. */
export const CONNECTORS_USAGE = `Usage:
  od tools connectors list [--use-case personal_daily_digest] [--format compact]
  od tools connectors execute --connector <id> --tool <name> --input input.json
  od tools connectors github-design-context --repo owner/repo [--ref main] [--output context/github/owner-repo.md] [--max-files 48] [--require-connector]
  od tools connectors local-design-context --path /path/to/project [--output context/local-code/project.md] [--max-files 48]
  od tools connectors design-system-package-audit --path /path/to/project [--reference-package] [--fail-on-warnings]

Environment:
  OD_NODE_BIN     Node-compatible runtime for agent wrapper invocations
  OD_BIN          Open Design CLI script for agent wrapper invocations
  OD_DAEMON_URL   Daemon base URL injected into agent runs
  OD_TOOL_TOKEN   Bearer token injected into agent runs

Agent runtime invocation:
  "$OD_NODE_BIN" "$OD_BIN" tools connectors list --use-case personal_daily_digest --format compact
`;

/** Connector identifier for the GitHub connector in the daemon's connector registry. */
export const GITHUB_CONNECTOR_ID = 'github';
/** Connector tool name that fetches GitHub repository metadata. */
export const GITHUB_GET_REPOSITORY_TOOL = 'github.github_get_a_repository';
/** Connector tool name that fetches the repository file tree. */
export const GITHUB_GET_TREE_TOOL = 'github.github_get_a_tree';
/** Connector tool name that fetches a repository's README. */
export const GITHUB_GET_README_TOOL = 'github.github_get_a_repository_readme';
/** Connector tool name that fetches raw file content from a repository. */
export const GITHUB_GET_RAW_CONTENT_TOOL = 'github.github_get_raw_repository_content';
/** Connector tool name that lists repository directory contents. */
export const GITHUB_GET_REPOSITORY_CONTENT_TOOL = 'github.github_get_repository_content';

/** Default maximum number of design files to include in a GitHub context snapshot. */
export const DEFAULT_GITHUB_CONTEXT_MAX_FILES = 48;
/** Hard upper bound on files included in a GitHub context snapshot regardless of `--max-files`. */
export const MAX_GITHUB_CONTEXT_FILES = 80;
/** Default maximum number of design files to include in a local context snapshot. */
export const DEFAULT_LOCAL_CONTEXT_MAX_FILES = 64;
/** Hard upper bound on files included in a local context snapshot regardless of `--max-files`. */
export const MAX_LOCAL_CONTEXT_FILES = 120;
/** Maximum bytes of text content read from a single snapshot file. */
export const MAX_CONTEXT_FILE_BYTES = 120_000;
/** Maximum bytes of a binary asset (e.g. logo PNG) included in a snapshot. */
export const MAX_CONTEXT_ASSET_BYTES = 1_500_000;
/** Maximum characters of a text file included verbatim in the markdown evidence report. */
export const MAX_MARKDOWN_EXCERPT_CHARS = 2_400;
/** Maximum number of repository directories visited during bounded connector directory browsing. */
export const MAX_CONNECTOR_DIRECTORY_SCAN_DIRS = 48;
/** Timeout in milliseconds for a `git clone` or `gh repo clone` operation. */
export const GITHUB_CLONE_TIMEOUT_MS = 120_000;
/** Timeout in milliseconds for the `gh auth status` check. */
export const GH_AUTH_TIMEOUT_MS = 10_000;
/** Maximum characters retained from a single child-process stdout/stderr stream. */
export const MAX_PROCESS_OUTPUT_CHARS = 8_000;
/** Guidance lines injected into the evidence markdown for Claude-style UI-kit entry skeletons. */
export const UI_KIT_ENTRY_GUIDANCE = [
  '- Claude-style UI-kit entry skeleton for direct JSX kits:',
  '  - `<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>`',
  '  - `<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>`',
  '  - `<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>`',
  '  - `<link rel="stylesheet" href="../../colors_and_type.css">`',
  '  - `<div id="root"></div>`',
  '  - Load role components from `components/*.jsx` with `<script type="text/babel" src="components/ComponentName.jsx"></script>`.',
  '  - Mount with `const { App } = window; const root = ReactDOM.createRoot(document.getElementById("root")); root.render(<App />);`.',
];

/** Parsed owner and repo name derived from a `--repo` CLI argument. */
export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  source: string;
}

/** A single file collected during a GitHub or local design-context snapshot. */
export interface GithubSnapshotFile {
  repoPath: string;
  outputPath?: string;
  content: string | Buffer;
  bytes: number;
  source: 'connector' | 'git-clone' | 'local-folder';
  binary?: boolean;
}

/** Full design evidence gathered from a GitHub repository, including metadata, README, and snapshot files. */
export interface GithubDesignEvidence {
  repo: ParsedGitHubRepo;
  ref?: string;
  resolvedRef?: string;
  method: 'connector' | 'git-clone';
  localCloneMethod?: 'git' | 'gh-cli';
  repositoryMetadata?: JsonObject;
  readme?: { path: string; content: string };
  treePaths: string[];
  files: GithubSnapshotFile[];
  materializedFiles?: string[];
  warnings: string[];
}

/** Category label used to group snapshot files in the evidence inventory. */
export type GithubEvidenceInventoryCategory =
  | 'Product docs and manifests'
  | 'Brand assets and icons'
  | 'Fonts'
  | 'Theme, tokens, and styling'
  | 'App shell and navigation'
  | 'Chat and input surfaces'
  | 'Reusable components'
  | 'Other design evidence';

/** One category section in the evidence inventory, with its files and a usage description. */
export interface GithubEvidenceInventorySection {
  title: GithubEvidenceInventoryCategory;
  description: string;
  files: GithubSnapshotFile[];
}

/** Design evidence collected from a local folder path rather than a GitHub repository. */
export interface LocalDesignEvidence {
  sourcePath: string;
  sourceName: string;
  method: 'local-folder';
  treePaths: string[];
  files: GithubSnapshotFile[];
  materializedFiles?: string[];
  readme?: { path: string; content: string };
  warnings: string[];
}

/** Severity level of a single design-system audit issue. */
export type DesignSystemAuditSeverity = 'error' | 'warning';

/** A single finding from a design-system package audit, with a severity, code, and human-readable message. */
export interface DesignSystemAuditIssue {
  severity: DesignSystemAuditSeverity;
  code: string;
  message: string;
  path?: string;
}

/** Aggregate result of `auditDesignSystemPackage`, including all errors and warnings found. */
export interface DesignSystemPackageAudit {
  ok: boolean;
  projectPath: string;
  filesInspected: number;
  errors: DesignSystemAuditIssue[];
  warnings: DesignSystemAuditIssue[];
}

/** Result of a buffered child-process execution, including stdout, stderr, and exit information. */
export interface ProcessRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code?: number | null;
  timedOut?: boolean;
  error?: string;
}

/** Result of a local GitHub repository clone, indicating which clone method succeeded. */
export interface LocalGitHubCloneResult {
  method: 'git' | 'gh-cli';
  warnings: string[];
}
