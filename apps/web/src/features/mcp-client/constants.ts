// Static configuration for the MCP client slice: id validation and the picker
// category display order.
import type { McpTemplate } from '@open-design/contracts';

/** A valid MCP server id: starts with a letter/digit, then letters/digits/dash/
 * underscore, up to 64 chars total. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/**
 * Picker grouping. Mirrors `McpTemplateCategory` in `packages/contracts`. The
 * order here is the *display* order in the picker — keep it intentional so the
 * most useful categories for Open Design (visual generation, then editing, then
 * publishing surfaces) sit at the top.
 */
export const CATEGORY_ORDER: ReadonlyArray<{
  id: NonNullable<McpTemplate['category']>;
  label: string;
  hint: string;
}> = [
  {
    id: 'image-generation',
    label: 'Image generation',
    hint: 'Models that produce raster, vector or video assets.',
  },
  {
    id: 'image-editing',
    label: 'Image editing',
    hint: 'Local post-processing, OCR and CV-driven edits.',
  },
  {
    id: 'web-capture',
    label: 'Web capture',
    hint: 'Render a URL into an image so the agent can see what it built.',
  },
  {
    id: 'design-systems',
    label: 'Design systems',
    hint: 'Figma read/write, design-token translation, brand inspiration.',
  },
  {
    id: 'ui-components',
    label: 'UI components',
    hint: 'Designer-grade components, blocks and landing-page material.',
  },
  {
    id: 'data-viz',
    label: 'Data viz',
    hint: 'Charts and diagrams as proper image artifacts.',
  },
  {
    id: 'publishing',
    label: 'Publishing',
    hint: 'Push generated artifacts to a public URL.',
  },
  {
    id: 'utilities',
    label: 'Utilities',
    hint: 'Filesystem, fetch, GitHub and similar generic tools.',
  },
];

/** Categories that render expanded by default (the visual-asset pipeline most
 * users land here for). Any active query forces every visible group open. */
export const DEFAULT_OPEN_CATEGORIES: ReadonlySet<
  NonNullable<McpTemplate['category']>
> = new Set(['image-generation', 'image-editing', 'web-capture']);
