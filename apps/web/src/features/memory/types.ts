// UI-only types for the memory slice. Wire DTOs live in
// `@open-design/contracts`; these are the view-model shapes the slice's hooks
// and components pass around (drafts, tab identifiers, transient flash state).
import type {
  ConnectorDetail,
  ConnectorMemorySuggestionResponse,
  ConnectorStatusResponse,
  MemoryType,
} from '@open-design/contracts';
import type { IconName } from '../../components/Icon';

/** A memory entry being created or edited in the manual editor form. */
export interface DraftEntry {
  id?: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

/** A human-readable rendering of a failed extraction, ready for the banner.
 *  Every branch of `describeExtractionFailure` supplies a recovery `action`, so
 *  it is required — consumers can render it without a presence check. */
export interface FriendlyExtractionFailure {
  title: string;
  detail: string;
  action: string;
}

/** One connector's read attempt within a connector-memory suggestion run. */
export type ConnectorMemoryAttempt =
  ConnectorMemorySuggestionResponse['connectors'][number];

/** Connector id -> live status, as returned by the connectors status endpoint. */
export type ConnectorStatusMap = ConnectorStatusResponse['statuses'];

/**
 * The subset of a connect-attempt result the connectors hook consumes. Mirrors
 * `providers/registry`'s `ConnectorActionResult` without importing across the
 * slice/provider boundary — `ports.ts` may not import `providers/`, even
 * type-only, so the port speaks this slice-owned shape and `dependencies.ts`
 * binds the wider provider result to it (structurally assignable).
 */
export interface ConnectorConnectResult {
  connector: ConnectorDetail | null;
  auth?: { kind: string } | null;
  error?: string;
}

/** The transient confirmation pill kinds shown after a manual action. */
export type FlashKind =
  | 'created'
  | 'saved'
  | 'deleted'
  | 'indexSaved'
  | 'pathCopied';

/** The source sub-tabs inside the memories view. */
export type MemoryTab = 'profile' | 'manual' | 'chat' | 'connected';

/** One entry in the add-modal source-tab bar (label + caption + glyph). */
export interface MemorySourceTab {
  id: MemoryTab;
  label: string;
  caption: string;
  icon: IconName;
}

/** Props for the MemorySection orchestrator. */
export interface MemorySectionProps {
  onOpenConnectors?: () => void;
  chatAgentId?: string | null;
  chatModel?: string | null;
}
