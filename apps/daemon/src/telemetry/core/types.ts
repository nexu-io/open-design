/** @module core/types
 * Shared prompt-stack telemetry type definitions — the vocabulary every other
 * subdirectory (and external importer) speaks. Imports only the sibling-free
 * constants module for the redaction-version literal; imports no concern subdirectory.
 */
import { PROMPT_STACK_REDACTION_VERSION } from './constants.js';

export type PromptTelemetrySectionKind =
  | 'formOverride'
  | 'daemonSystemPrompt'
  | 'runtimeToolPrompt'
  | 'researchCommandContract'
  | 'runContextPrompt'
  | 'clientSystemPrompt'
  | 'echoGuard'
  | 'userRequest'
  | 'skillPrompt'
  | 'designSystemPrompt'
  | 'pluginStagePrompt'
  | 'cwdHint'
  | 'linkedDirsHint'
  | 'attachments'
  | 'commentAttachments'
  | 'promptImagePaths';

export interface PromptTelemetryInputSection {
  kind: PromptTelemetrySectionKind;
  content?: string | null;
  captureContent?: boolean;
  metadata?: unknown;
}

export interface PromptTelemetrySection {
  kind: PromptTelemetrySectionKind;
  ordinal: number;
  present: boolean;
  contentMode: 'redacted-section-content' | 'metadata-only';
  rawBytes: number;
  redactedBytes: number;
  fingerprint: string;
  truncated: boolean;
  truncationReason?: 'section_byte_limit' | 'total_budget_exceeded';
  redactedContent?: string;
  metadata?: Record<string, unknown>;
}

export interface PromptStackTelemetry {
  redactionVersion: typeof PROMPT_STACK_REDACTION_VERSION;
  promptFingerprint: string;
  stackFingerprint: string;
  rawBytes: number;
  redactedBytes: number;
  sectionCount: number;
  redactedContentBytes: number;
  redactedContentBudgetBytes: number;
  sections: PromptTelemetrySection[];
}

export interface StructuredPromptStackInput {
  type: 'open-design.prompt-stack';
  redactionVersion: typeof PROMPT_STACK_REDACTION_VERSION;
  promptFingerprint: string;
  stackFingerprint: string;
  sectionCount: number;
  redactedContentBytes: number;
  redactedContentBudgetBytes: number;
  sections: Array<{
    kind: PromptTelemetrySectionKind;
    ordinal: number;
    contentMode: PromptTelemetrySection['contentMode'];
    rawBytes: number;
    redactedBytes: number;
    fingerprint: string;
    truncated: boolean;
    truncationReason?: PromptTelemetrySection['truncationReason'];
    redactedContent?: string;
    metadata?: Record<string, unknown>;
  }>;
}
