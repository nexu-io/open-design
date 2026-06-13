import { z } from 'zod';

// ContextItem union — typed chips that hydrate the ContextChipStrip above
// the brief input. Pure shape, no runtime deps. See docs/plugins-spec.md §5.2.
export const ContextItemSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('skill'),         id: z.string(), label: z.string() }),
  z.object({ kind: z.literal('design-system'), id: z.string(), label: z.string(), primary: z.boolean().optional() }),
  z.object({ kind: z.literal('craft'),         id: z.string(), label: z.string() }),
  z.object({ kind: z.literal('asset'),         path: z.string(), label: z.string(), mime: z.string().optional() }),
  z.object({ kind: z.literal('mcp'),           name: z.string(), label: z.string(), command: z.string().optional() }),
  z.object({ kind: z.literal('claude-plugin'), id: z.string(), label: z.string() }),
  z.object({ kind: z.literal('atom'),          id: z.string(), label: z.string() }),
  z.object({ kind: z.literal('plugin'),        id: z.string(), label: z.string() }),
]);

export type ContextItem = z.infer<typeof ContextItemSchema>;

export type ContextItemKind = ContextItem['kind'];

// Resolved context — the apply-time materialization of od.context.* refs.
// Lives on the AppliedPluginSnapshot so prompt reconstruction is not coupled
// to the live registry state.
export const ResolvedContextSchema = z.object({
  items: z.array(ContextItemSchema),
  // Materialized prompt fragments keyed by ContextItem identity. Daemon-side
  // composeSystemPrompt() reads from here when building the ## Active plugin
  // block; web fallback mode never sees this map (plugin runs are 409'd in v1
  // per spec §11.8).
  promptFragments: z.record(z.string(), z.string()).optional(),
  // Atom ids the plugin asked for, preserved for chip rendering even when the
  // pipeline does not explicitly enumerate them.
  atoms: z.array(z.string()).optional(),
});

export type ResolvedContext = z.infer<typeof ResolvedContextSchema>;
