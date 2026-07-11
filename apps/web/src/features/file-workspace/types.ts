// UI-local types for the file-workspace slice. Not wire DTOs — those stay in
// `packages/contracts`. Moved out of `components/FileWorkspace.tsx` as part of
// the ADR-0002 vertical-slice decomposition; the orchestrator imports these
// back through the slice barrel instead of redeclaring them.
import type { ProjectBrowserWorkspaceTab, ProjectFile, ProjectMetadata } from '../../types';
import type { Dict } from '../../i18n/types';
import type { TodoItem } from '../../runtime/todos';
import type { ExcalidrawSketchScene, SketchItem } from '../../components/sketch-model';

export type TabDropEdge = 'before' | 'after';

export interface BrowserOpenRequest {
  tabId?: string;
  url: string;
  nonce: number;
  /** Request a transient in-tab affordance after opening/focusing. */
  attentionAction?: 'download-page';
  /** Only foreground an EXISTING browser tab — do not navigate it. Used to wake
   *  a background-throttled webview before reading its DOM (brand browser
   *  assist) WITHOUT reloading the page and re-triggering an anti-bot wall. */
  focusOnly?: boolean;
}

export interface BrowserAttentionRequest {
  action: 'download-page';
  nonce: number;
}

export interface SketchState {
  version: number;
  rawItems: unknown[];
  discardRawItemsOnSave: boolean;
  items: SketchItem[];
  scene: ExcalidrawSketchScene;
  sourceKey?: string;
  dirty: boolean;
  persisted: boolean;
  loaded: boolean;
  saving: boolean;
  savedAt?: number;
}

export interface SaveSketchOptions {
  activate?: boolean;
  refreshFiles?: boolean;
  showSaving?: boolean;
}

export interface PendingSketchSave {
  scene: ExcalidrawSketchScene;
  revision: number;
  options: SaveSketchOptions;
  resolvers: Array<(value: boolean | undefined) => void>;
}

export interface QueuedSketchAutosave {
  scene: ExcalidrawSketchScene;
  revision: number;
  options: SaveSketchOptions;
}

export type WorkspaceToastTone = 'default' | 'success' | 'error' | 'loading';

export interface WorkspaceActionToast {
  actionLabel?: string | null;
  className?: string;
  details?: string | null;
  message: string;
  onAction?: () => void;
  role?: 'status' | 'alert';
  tone?: WorkspaceToastTone;
  ttlMs?: number;
}

export type BrowserWorkspaceTab = ProjectBrowserWorkspaceTab;

export type WorkspaceOrderedTab =
  | { id: string; kind: 'browser'; browserTab: BrowserWorkspaceTab }
  | { id: string; kind: 'file'; name: string };

export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export type DesignSystemReviewDecision =
  NonNullable<ProjectMetadata['designSystemReview']>[string]['decision'];
export type DesignSystemReviewEntry = NonNullable<ProjectMetadata['designSystemReview']>[string];
export type DesignSystemReviewAgentTask = NonNullable<DesignSystemReviewEntry['agentTask']>;
export interface DesignSystemReviewDetails {
  feedback?: string;
  files?: string[];
  agentTask?: DesignSystemReviewAgentTask;
}
export type DesignSystemSectionStatus =
  | 'missing'
  | 'planned'
  | 'running'
  | 'needs-review'
  | 'approved'
  | 'needs-work'
  | 'updated';
export type DesignSystemReviewCategory = 'Type' | 'Colors' | 'Spacing' | 'Components' | 'Brand';
export interface DesignSystemProjectSection {
  title: string;
  subtitle: string;
  files: string[];
  category: DesignSystemReviewCategory;
  requiredFile?: string;
}

export type DesignSystemSectionActivityPhase =
  | 'idle'
  | 'planned'
  | 'reading'
  | 'writing'
  | 'updated'
  | 'error';
export interface DesignSystemSectionActivity {
  running: boolean;
  mutated: boolean;
  errored: boolean;
  phase: DesignSystemSectionActivityPhase;
  touchedFiles: string[];
  todoText?: string;
  todoStatus?: TodoItem['status'];
}

export type DesignSystemReviewPreviewDisplay = 'specimen' | 'ui-kit' | 'asset';
export interface DesignSystemProjectSectionReview {
  section: DesignSystemProjectSection;
  previewFile: ProjectFile | null;
  previewDisplay: DesignSystemReviewPreviewDisplay;
  reviewEntry: DesignSystemReviewEntry | undefined;
  sectionActivity: DesignSystemSectionActivity;
  changedAfterFeedback: boolean;
  sectionStatus: DesignSystemSectionStatus;
  sectionStatusLabel: string;
  reviewTimeLabel: string | null;
}
export interface DesignSystemCardManifestEntry {
  path: string;
  group?: string;
  name?: string;
  subtitle?: string;
  viewport?: string;
}
export type DesignSystemCardManifestMap = Map<string, DesignSystemCardManifestEntry>;

export type DesignSystemGenerationStepStatus = 'pending' | 'running' | 'succeeded';
export interface DesignSystemGenerationStep {
  id: string;
  title: string;
  detail: string;
  status: DesignSystemGenerationStepStatus;
}

/** A design-system preview asset ref resolved relative to its owning file. */
export interface DesignSystemPreviewAssetPath {
  filePath: string;
  suffix: string;
}
