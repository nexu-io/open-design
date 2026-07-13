// Phase 8 entry slice / spec §10.3.1 / §21.5 — auto-derived GenUI surfaces
// for first-party atom stages.
//
// Mirrors the connector-gate's auto oauth-prompt pattern: when the
// pipeline contains a `diff-review` stage, the daemon synthesises a
// `choice` GenUI surface (`__auto_diff_review_<stageId>`,
// persist='run') so the user can accept / reject / partial without
// the plugin author having to declare the surface by hand.
// Plugin-author-declared surfaces with the same id win — this helper
// returns the implicit list and `mergeAutoOAuthPrompts` (re-used) does
// the dedupe.
//
// Other atom stages that auto-derive surfaces in the future (e.g.
// `direction-picker` could auto-derive a `choice`) plug in here.

import type {
  GenUISurfaceSpec,
  PluginPipeline,
} from '@open-design/contracts';

export interface AutoAtomSurfaceContext {
  pipeline?: PluginPipeline | undefined;
}

export function deriveAutoAtomSurfaces(
  ctx: AutoAtomSurfaceContext,
): GenUISurfaceSpec[] {
  const out: GenUISurfaceSpec[] = [];
  if (!ctx.pipeline) return out;
  for (const stage of ctx.pipeline.stages) {
    const atoms = stage.atoms ?? [];
    if (atoms.includes('diff-review')) {
      out.push(buildDiffReviewSurface(stage.id));
    }
  }
  return out;
}

function buildDiffReviewSurface(stageId: string): GenUISurfaceSpec {
  return {
    id:      `__auto_diff_review_${stageId}`,
    kind:    'choice',
    persist: 'run',
    trigger: { stageId, atom: 'diff-review' },
    prompt:  'Review the diff and choose how to proceed.',
    schema: {
      type:        'object',
      title:       'Diff review',
      description: 'Accept the patch, reject it, or pick which files to keep.',
      properties: {
        decision: {
          type:  'string',
          enum:  ['accept', 'reject', 'partial'],
          title: 'Decision',
        },
        accepted_files: {
          type:  'array',
          items: { type: 'string' },
          title: 'Files to accept (only required when decision=partial)',
        },
        rejected_files: {
          type:  'array',
          items: { type: 'string' },
          title: 'Files to reject (only required when decision=partial)',
        },
        reason: {
          type:  'string',
          title: 'Notes for the patch author',
        },
      },
      required: ['decision'],
    },
    timeout:    24 * 60 * 60 * 1000, // 24h — diff review may sit overnight
    onTimeout:  'abort',
    capabilitiesRequired: [],
  };
}
