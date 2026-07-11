// Slice-wide constants for the chat-composer feature. No React, no transport.
import type { PluginSourceKind } from '@open-design/contracts';
import type { DetailPositionOptions } from './rules';

/** `sourceKind`s the tools panel's "My plugins" tab groups together. */
export const USER_PLUGIN_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

/** Sizing the design-toolbox hover-detail panel clamps against. */
export const DESIGN_TOOLBOX_DETAIL_OPTIONS: DetailPositionOptions = {
  detailWidth: 264,
  gap: 8,
  margin: 8,
  estimatedHeight: 340,
};

/** Hover-out grace period before the design-toolbox detail panel closes. */
export const DESIGN_TOOLBOX_DETAIL_CLOSE_DELAY_MS = 160;
