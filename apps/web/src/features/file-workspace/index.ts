// Public barrel for the file-workspace slice (ADR-0002 vertical-slice
// decomposition of `components/FileWorkspace.tsx`). This is the ONLY import
// path other slices and the orchestrator may use — deep imports into
// `features/file-workspace/**` are rejected by `scripts/check-web-slice-boundaries.ts`.
export { Tab } from './components/Tab';
export { DesignSystemProjectLoading } from './components/DesignSystemProjectLoading';
export { DesignSystemInlinePreview } from './components/DesignSystemInlinePreview';
export { DesignSystemReviewCard } from './components/DesignSystemReviewCard';
export { useWiredDesignSystemCardManifest } from './hooks/useDesignSystemCardManifest.hooks';
export {
  useWiredDesignSystemKitActions,
  type DesignKitActionFeedbackTone,
  type DesignSystemKitActionsController,
} from './hooks/useDesignSystemKitActions.hooks';
export {
  useDesignSystemReviewCards,
  type DesignSystemReviewCardsController,
} from './hooks/useDesignSystemReviewCards.hooks';
export {
  useWiredSketches,
  type SketchesController,
  type UseSketchesParams,
} from './hooks/useSketches.hooks';
export {
  useWorkspaceContextTracking,
  type WorkspaceContextTrackingController,
  type WorkspaceContextTrackingParams,
} from './hooks/useWorkspaceContextTracking.hooks';
export * from './rules';
export * from './constants';
export type * from './types';
