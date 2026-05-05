import type { PanelEvent } from '@open-design/contracts/critique';
import { parseV1 } from './parsers/v1.js';

export interface ParserOptions {
  runId: string;
  adapter: string;
  parserMaxBlockBytes: number;
}

export async function* parseCritiqueStream(
  source: AsyncIterable<string>,
  opts: ParserOptions,
): AsyncIterable<PanelEvent> {
  // For v1, the version is detected from <CRITIQUE_RUN version="1"> in the first chunk.
  // Only v1 exists currently so we always dispatch to parsers/v1.
  yield* parseV1(source, opts);
}
