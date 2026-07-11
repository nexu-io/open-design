// Public barrel for the file-workspace slice (ADR-0002 vertical-slice
// decomposition of `components/FileWorkspace.tsx`). This is the ONLY import
// path other slices and the orchestrator may use — deep imports into
// `features/file-workspace/**` are rejected by `scripts/check-web-slice-boundaries.ts`.
export { Tab } from './components/Tab';
export { DesignSystemProjectLoading } from './components/DesignSystemProjectLoading';
export { DesignSystemInlinePreview } from './components/DesignSystemInlinePreview';
export { useWiredDesignSystemCardManifest } from './hooks/useDesignSystemCardManifest.hooks';
export * from './rules';
export * from './constants';
export type * from './types';
