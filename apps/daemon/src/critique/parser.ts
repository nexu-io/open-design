import type { PanelEvent } from '@open-design/contracts/critique';
import { parseV1 } from './parsers/v1.js';

/**
 * Side-channel payload the parser hands the orchestrator when a SHIP block
 * carries an `<ARTIFACT>`. The body and mime intentionally do NOT travel on
 * the SHIP `PanelEvent` (which is also the SSE wire shape) so artifact bytes
 * never broadcast to clients; the orchestrator persists them to disk and
 * the web layer fetches via the dedicated artifact endpoint.
 */
export interface ShipArtifactPayload {
  /** Round the SHIP closed against. Matches the round on the ship event. */
  round: number;
  /** `mime` attribute from `<ARTIFACT mime="…">`; empty string if omitted. */
  mime: string;
  /** Decoded artifact body. CDATA wrappers are stripped before delivery. */
  body: string;
}

export type ShipArtifactCallback = (payload: ShipArtifactPayload) => void;

export interface ParserOptions {
  runId: string;
  adapter: string;
  parserMaxBlockBytes: number;
  /** Project identity threaded into ship event artifactRef. */
  projectId?: string;
  /** Artifact identity threaded into ship event artifactRef. */
  artifactId?: string;
  /**
   * Side-channel for the SHIP artifact body. Invoked synchronously inside
   * the parser right before the corresponding ship `PanelEvent` is yielded,
   * so the orchestrator can write the bytes to disk and persist a path on
   * the row before any consumer of the ship event reacts to it.
   */
  onArtifact?: ShipArtifactCallback;
}

export async function* parseCritiqueStream(
  source: AsyncIterable<string>,
  opts: ParserOptions,
): AsyncIterable<PanelEvent> {
  // For v1, the version is detected from <CRITIQUE_RUN version="1"> in the first chunk.
  // Only v1 exists currently so we always dispatch to parsers/v1.
  yield* parseV1(source, opts);
}
