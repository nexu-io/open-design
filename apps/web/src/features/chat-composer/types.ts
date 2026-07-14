// UI-facing types for the chat-composer slice: the design-toolbox resource
// index/union the composer searches over, and the i18n translate-function
// shape the pure rules take as a parameter (never read from a closure). No
// React, no transport (ADR 0002).
import type {
  AppliedPluginSnapshot,
  ChatAnalyticsEntryFrom,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
  ResearchOptions,
  RunContextSelection,
} from '@open-design/contracts';
import type { Dict } from '../../i18n/types';
import type { IconName } from '../../components/Icon';
import type { ChatAttachment, ProjectFile, SkillSummary } from '../../types';

export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/**
 * Per-send metadata the orchestrator's `onSend`/`restoreDraft`/imperative
 * handle carry alongside a prompt: run-context selection (skills/plugins/
 * mcp/connectors/workspace items picked for the turn), the applied-plugin
 * snapshot, analytics entry-from tagging, and a one-shot session-mode
 * override. Defined here (not in the orchestrator) so `rules.ts`/`actions.ts`
 * can reference it too; the orchestrator re-exports this type from its own
 * module (`export type { ChatSendMeta } from '../features/chat-composer'`)
 * so its existing external consumers (ProjectView, SideChatTab) are
 * unaffected.
 */
export interface ChatSendMeta {
  queueOnly?: boolean;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  appliedPluginSnapshotId?: string;
  inlineAppliedPlugin?: {
    pluginId: string;
    label: string;
  };
  // Per-turn skill ids picked via the @-mention popover. The chat layer
  // forwards these to the daemon's `skillIds` field so the system prompt
  // for this run only is composed with the extra skill bodies, without
  // touching the project's persistent `skillId`.
  skillIds?: string[];
  /** Overrides the run_created / run_finished `entry_from` analytics prop for
   *  this send (e.g. 'mark' when the turn is sent from the Mark draw overlay).
   *  Behavior never depends on it; it only shapes PostHog props. */
  entryFrom?: ChatAnalyticsEntryFrom;
  /** One-shot run mode override for seeded follow-ups before parent state catches up. */
  sessionMode?: ChatSessionMode;
}

export type DesignToolboxResourceKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'mcp-template'
  | 'connector'
  | 'file';

export interface DesignToolboxResourceIndex {
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
}

export type DesignToolboxResourceBase = {
  key: string;
  kind: DesignToolboxResourceKind;
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: IconName;
  searchText: string;
};

export type DesignToolboxResource =
  | (DesignToolboxResourceBase & { kind: 'skill'; skill: SkillSummary })
  | (DesignToolboxResourceBase & { kind: 'plugin'; plugin: InstalledPluginRecord })
  | (DesignToolboxResourceBase & { kind: 'mcp'; server: McpServerConfig })
  | (DesignToolboxResourceBase & { kind: 'mcp-template'; template: McpTemplate })
  | (DesignToolboxResourceBase & { kind: 'connector'; connector: ConnectorDetail })
  | (DesignToolboxResourceBase & { kind: 'file'; file: ProjectFile });

/** The `@`-mention popover's tab filter. */
export type MentionTab = 'all' | 'tabs' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

/** One `/`-command entry in the slash popover. */
export interface SlashCommand {
  id: string;
  /** Visible label, e.g. `/hatch`. Shown in the popover row. */
  label: string;
  /**
   * Text inserted into the draft when the user picks the entry. The cursor is
   * positioned at the end of `insert`, so a trailing space is the difference
   * between a "ready for argument" command and a "submit immediately" one.
   */
  insert: string;
  /** i18n key of the short description shown next to the label. */
  descKey: keyof Dict;
  /** Optional argument hint shown after the description. */
  argHint?: string;
  /** Icon glyph from the project Icon set. */
  icon: 'sparkles' | 'eye' | 'sliders';
}

/**
 * Viewport size the design-toolbox hover-detail positioning needs. Defined
 * in-slice (not imported from `providers/dom`) because the boundary guard is
 * AST-level and rejects a `providers/` import from any feature file other
 * than `dependencies.ts` — including `import type`. `dependencies.ts` binds
 * the real provider's return value structurally against this shape.
 */
export interface ViewportSize {
  width: number;
  height: number;
}

/** Tracks a workspace-context dir that was added to `linkedDirs` on the
 *  context's behalf, so it can be dropped again if the dir is later promoted
 *  to the project's primary working dir. */
export interface TrackedWorkspaceLinkedDir {
  dir: string;
  previousLinkedDirs: string[];
}

/**
 * Per-file failure reported by the project-files upload transport. Defined
 * in-slice (not imported from `providers/registry`) because the boundary
 * guard is AST-level and rejects a `providers/` import from any feature file
 * other than `dependencies.ts` — including `import type`. The attachment
 * cluster's `UploadActionDeps.uploadProjectFiles` binds the real provider's
 * return value against this shape structurally.
 */
export interface UploadFilesFailure {
  name: string;
  code?: string;
  error?: string;
}

/** Result of a project-files upload batch; see {@link UploadFilesFailure}. */
export interface UploadFilesResult {
  uploaded: ChatAttachment[];
  failed: UploadFilesFailure[];
  error?: string;
}
