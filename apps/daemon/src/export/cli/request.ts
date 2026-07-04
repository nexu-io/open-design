/** @module export/cli/request
 * Pure `od export` request helpers: resolve deck-vs-page mode, shape the daemon
 * request body, and build the machine-readable result envelope. No daemon-internal
 * imports — kept side-effect-free so cli.ts can unit-test it without argv dispatch.
 */
import type { ExportFormat, ExportImageFormat, ExportResult } from "@open-design/contracts";

/** Options describing one `od export` invocation: target file, format, and optional deck/image/title modifiers. */
export interface ExportCliRequestOptions {
  fileName: string;
  format: ExportFormat;
  deck?: boolean;
  imageFormat?: ExportImageFormat;
  title?: string;
}

/** Inputs to {@link resolveExportCliDeckMode}: the format plus the mutually-exclusive --deck / --page / --no-deck flags. */
export interface ExportCliDeckModeOptions {
  format: ExportFormat;
  deck?: boolean;
  page?: boolean;
  noDeck?: boolean;
}

/**
 * Resolves the effective deck flag from the user's --deck / --page / --no-deck choices.
 * @returns `true` (deck), `false` (page), or `undefined` to let the daemon auto-detect.
 * @throws Error on contradictory flags, or --page/--no-deck combined with pptx.
 */
export function resolveExportCliDeckMode(options: ExportCliDeckModeOptions): boolean | undefined {
  const explicitDeck = options.deck === true;
  const explicitPage = options.page === true || options.noDeck === true;
  if (explicitDeck && explicitPage) {
    throw new Error('--deck cannot be combined with --page or --no-deck');
  }
  if (options.format === "pptx") {
    if (explicitPage) throw new Error('--page/--no-deck is not valid with --format pptx');
    return true;
  }
  if (explicitDeck) return true;
  if (explicitPage) return false;
  return undefined;
}

/**
 * Builds the JSON body POSTed to the daemon export route. PPTX forces deck mode; for
 * pdf/image `deck` is omitted unless explicitly chosen so the daemon can auto-detect.
 * @returns the request body object.
 */
export function buildExportCliRequestBody(options: ExportCliRequestOptions): Record<string, unknown> {
  const deck = options.format === "pptx" ? true : options.deck;
  return {
    fileName: options.fileName,
    // PPTX is deck-only. For PDF/image, omit `deck` unless the caller explicitly
    // chooses deck/page mode so the daemon can still auto-detect by default.
    ...(deck !== undefined ? { deck } : {}),
    ...(options.format === "image" && options.imageFormat ? { imageFormat: options.imageFormat } : {}),
    ...(options.title ? { title: options.title } : {}),
  };
}

/** Builds the machine-readable {@link ExportResult} envelope printed by `od export --json` on success. */
export function buildExportCliResultEnvelope(options: {
  bytes: number;
  format: ExportFormat;
  path: string;
}): ExportResult {
  return {
    ok: true,
    path: options.path,
    out: options.path,
    bytes: options.bytes,
    format: options.format,
  };
}
