import type { PluginShareAction } from '../plugins/share-actions.js';

export type SkillPluginCandidateSourceKind = 'file' | 'url';
export type SkillPluginCandidateStatus = 'active' | 'dismissed';

export interface SkillPluginCandidateSourceRef {
  kind: SkillPluginCandidateSourceKind;
  value: string;
  label?: string;
  content?: string;
  size?: number;
  copied?: boolean;
  reason?: string;
}

export interface SkillPluginCandidate {
  id: string;
  projectId: string;
  runId?: string | null;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  title: string;
  description: string;
  confidence: number;
  status: SkillPluginCandidateStatus;
  sourceRefs: SkillPluginCandidateSourceRef[];
  provenance: {
    summary: string;
    detectedAt: number;
  };
  draftPath?: string | null;
  createdAt: number;
  updatedAt: number;
  dismissedAt?: number | null;
}

export interface SkillPluginCandidateListResponse {
  candidates: SkillPluginCandidate[];
}

export interface SkillPluginCandidateDismissResponse {
  ok: true;
  candidate: SkillPluginCandidate;
}

export interface SkillPluginDraftValidationDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface SkillPluginDraftResult {
  ok: boolean;
  candidate: SkillPluginCandidate;
  draftPath: string;
  folder: string;
  validation: {
    ok: boolean;
    diagnostics: SkillPluginDraftValidationDiagnostic[];
  };
}

export interface SkillPluginCandidateDraftResponse extends SkillPluginDraftResult {}

export interface SkillPluginCandidateShareTaskResponse {
  taskId: string;
  action: PluginShareAction;
  path: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  startedAt: number;
  draft: SkillPluginDraftResult;
}
