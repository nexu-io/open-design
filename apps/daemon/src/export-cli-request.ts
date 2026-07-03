import type { ExportFormat, ExportImageFormat, ExportResult } from "@open-design/contracts";

export interface ExportCliRequestOptions {
  fileName: string;
  format: ExportFormat;
  deck?: boolean;
  imageFormat?: ExportImageFormat;
  title?: string;
}

export interface ExportCliDeckModeOptions {
  format: ExportFormat;
  deck?: boolean;
  page?: boolean;
  noDeck?: boolean;
}

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
