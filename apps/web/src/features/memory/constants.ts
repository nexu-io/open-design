// Static constants for the memory slice: the manual-editor type list and
// starters, the field-label style, and the connector app catalogue. No state,
// no transport — pure module-level data shared by the slice's components.
import type { CSSProperties } from 'react';
import type { MemoryType } from '@open-design/contracts';
import type { DraftEntry } from './types';

// All manually-selectable memory types. `profile` (the structured singleton)
// and `rule` (verified checks the POST loop enforces) join the original four
// so the editor type-picker and the saved-memory filter pills surface them.
export const TYPES: MemoryType[] = [
  'profile',
  'user',
  'feedback',
  'project',
  'reference',
  'rule',
];

export const EMPTY_DRAFT: DraftEntry = {
  name: '',
  description: '',
  type: 'user',
  body: '',
};

// Small uppercase caption used above each form field. Centralised so
// every field renders with the same color/letter-spacing/baseline; this
// is what gives the editor a Settings-form rhythm rather than a stack
// of unlabelled inputs.
export const FIELD_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--text-muted, #888)',
  marginBottom: 4,
};

// Click-to-prefill examples shown above the editor when creating a new
// memory. Three starters cover the most common reasons a person writes
// a memory by hand: tell the assistant about themselves, lock in a
// repeated UI/output preference, or pin the current project. The
// strings live behind i18n keys so each chip stays localized.
export const STARTERS: ReadonlyArray<{
  type: MemoryType;
  nameKey: 'settings.memoryStarterUserName' | 'settings.memoryStarterFeedbackName' | 'settings.memoryStarterProjectName';
  descKey: 'settings.memoryStarterUserDesc' | 'settings.memoryStarterFeedbackDesc' | 'settings.memoryStarterProjectDesc';
  bodyKey: 'settings.memoryStarterUserBody' | 'settings.memoryStarterFeedbackBody' | 'settings.memoryStarterProjectBody';
}> = [
  {
    type: 'user',
    nameKey: 'settings.memoryStarterUserName',
    descKey: 'settings.memoryStarterUserDesc',
    bodyKey: 'settings.memoryStarterUserBody',
  },
  {
    type: 'feedback',
    nameKey: 'settings.memoryStarterFeedbackName',
    descKey: 'settings.memoryStarterFeedbackDesc',
    bodyKey: 'settings.memoryStarterFeedbackBody',
  },
  {
    type: 'project',
    nameKey: 'settings.memoryStarterProjectName',
    descKey: 'settings.memoryStarterProjectDesc',
    bodyKey: 'settings.memoryStarterProjectBody',
  },
];

export const MEMORY_CONNECTOR_APP_IDS = [
  'notion',
  'figma',
  'linear',
  'google_drive',
  'github',
  'slack',
] as const;

// Keyed by the id union itself (not a general `Record<string, string>`) so
// adding an id above without a label here is a type error, not a silent
// runtime fallback — this is what makes the `?? id` guard callers used to
// need provably unnecessary.
export const MEMORY_CONNECTOR_APP_LABELS: Record<(typeof MEMORY_CONNECTOR_APP_IDS)[number], string> = {
  notion: 'Notion',
  figma: 'Figma',
  linear: 'Linear',
  google_drive: 'Google Drive',
  github: 'GitHub',
  slack: 'Slack',
};

/** Looks up a label for a connector id that ISN'T statically known to be one
 *  of `MEMORY_CONNECTOR_APP_IDS` — e.g. a `connectorId` string arriving from
 *  an API response. Returns undefined for an id this app doesn't recognize,
 *  unlike `MEMORY_CONNECTOR_APP_LABELS[id]` directly, which requires (and is
 *  typed to guarantee) a known id. */
export function connectorAppLabel(connectorId: string): string | undefined {
  return (MEMORY_CONNECTOR_APP_LABELS as Record<string, string | undefined>)[connectorId];
}

export const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'open-design:connector-connected';
