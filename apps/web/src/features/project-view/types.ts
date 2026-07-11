// UI-only / helper types owned by the project-view slice. Wire DTOs live in
// `@open-design/contracts`; these are small local shapes the slice's pure
// helpers produce or consume.
import type { CSSProperties } from 'react';
import type { ChatMessage } from '../../types';

/** Normalized parts of a brand-extraction source URL, for source-vs-snapshot
 *  comparison. Produced by `browserExtractionUrlParts` in `rules.ts`. */
export interface BrowserExtractionUrlParts {
  host: string;
  pathname: string;
  search: string;
}

/** Inline style for the project split container, with the CSS custom properties
 *  the split layout reads. Produced by `projectSplitStyle` in `rules.ts`. */
export type ProjectSplitStyle = CSSProperties & {
  '--project-chat-panel-width': string;
  '--project-workspace-panel-track': string;
};

/** Resolved retry target for a failed assistant message. Produced by
 *  `resolveRetryTarget` in `rules.ts`. */
export interface RetryTarget {
  failedAssistant: ChatMessage;
  userMsg: ChatMessage;
  priorMessages: ChatMessage[];
  preservedAttempts: ChatMessage[];
}
