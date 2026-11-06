/**
 * Public API for dom editing — re-exports from focused sub-modules.
 * Import from this file to avoid breaking existing import paths.
 */

// Types
export type {
  DomEditCapabilities,
  DomEditContextOptions,
  DomEditLayerItem,
  DomEditSelection,
  DomEditTextField,
  DomEditViewport,
  TimelineElementDomTarget,
  TimelineElementDomTargetOptions,
} from "./domEditingTypes";

// Element finders, visibility, visual scoring, raster detection
export {
  findElementForSelection,
  findElementForTimelineElement,
  isLargeRasterDomEditSelection,
  resolveVisualDomEditSelectionTarget,
} from "./domEditingElement";

// Layers, text fields, capabilities, selection, patch ops
export {
  buildDefaultDomEditTextField,
  buildDomEditPatchTarget,
  buildDomEditRichTextPatchOperation,
  buildDomEditStylePatchOperation,
  buildDomEditTextPatchOperation,
  collectDomEditLayerItems,
  countDomEditChildLayers,
  buildTextFieldChildLocator,
  getDomEditLayerKey,
  getDomEditNonEditableReason,
  getDomEditTargetKey,
  isTextEditableSelection,
  liveLayerElement,
  readHfId,
  refreshDomEditSelection,
  resolveDomEditCapabilities,
  resolveDomEditSelection,
  serializeDomEditTextFields,
} from "./domEditingLayers";

// Agent prompt
export {
  buildElementAgentPrompt,
  buildAgentContextPreview,
  buildPickerAgentPrompt,
  buildPickerAgentContextPreview,
} from "./domEditingAgentPrompt";
export type { AgentPromptElementInfo } from "./domEditingAgentPrompt";
