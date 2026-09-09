import {
  normalizePreviewRuntimeCapabilities,
  type PreviewRuntimeCapability,
} from '@open-design/contracts/runtime/preview-runtime';

export interface PreviewRuntimeViewerState {
  deck: boolean;
  comment: boolean;
  inspect: boolean;
  draw: boolean;
  edit: boolean;
}

const BASE_VIEWER_CAPABILITIES: readonly PreviewRuntimeCapability[] = [
  'content_measurement',
  'scroll',
  'snapshot',
  'observability',
  // The existing srcDoc transport installs these bridges while dormant so
  // opening a tool never changes the document. Keep the same product contract
  // in the URL runtime; enable/disable messages still control actual modes.
  'selection',
  'tweaks',
  'palette',
];

/** Map product mode state to the exact runtime modules needed by one frame. */
export function previewRuntimeCapabilitiesForViewer(
  state: PreviewRuntimeViewerState,
): PreviewRuntimeCapability[] {
  return normalizePreviewRuntimeCapabilities([
    ...BASE_VIEWER_CAPABILITIES,
    ...(state.comment ? ['comment' as const] : []),
    ...(state.inspect ? ['inspect' as const] : []),
    ...(state.draw ? ['draw' as const] : []),
    ...(state.deck ? ['deck' as const] : []),
    ...(state.edit ? ['edit' as const] : []),
  ]);
}
