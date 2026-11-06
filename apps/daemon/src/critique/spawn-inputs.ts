/**
 * Spawn-input glue for the rollout resolver (Phase 15 wireup).
 *
 * The resolver in `rollout.ts` is exhaustively covered by
 * `tests/critique-rollout.test.ts` against direct
 * `{ phase, skillPolicy, projectOverride, envOverride }` shapes. The
 * spawn-time gate in `server.ts` constructs those four inputs inline
 * from runtime state (env vars, skill frontmatter, the project's
 * metadata blob). This file lifts the metadata-narrowing step out so it
 * can be pinned in isolation; the other three inputs are either pure
 * (`parseRolloutPhase`, `parseEnvEnabled` live in rollout.ts) or
 * already covered (`normalizeCritiquePolicy` is exported from
 * skills.ts).
 *
 * Carved out for PerishCode P3 on PR #1338: the daemon-side glue
 * (boolean narrowing on a free-form JSON blob) was previously inline
 * in the spawn handler and not covered by any test, so a refactor that
 * loosens the `typeof === 'boolean'` guard could silently let a
 * string `'true'` or a `1` accidentally activate the feature.
 */

/**
 * Narrow the `critiqueTheaterEnabled` field on a project's metadata
 * blob to `boolean | null`. The metadata blob round-trips through
 * SQLite as a free-form JSON blob, so callers cannot trust its type
 * at compile time; a boolean wins outright, any other type (missing
 * key, malformed value, string `'true'`, number `1`, `null`, nested
 * object) collapses to `null` so the resolver falls through to the
 * env / phase tiers exactly the way it did when the toggle had never
 * been touched. The fall-through is the load-bearing safety property:
 * a corrupt metadata write must never accidentally activate the
 * feature.
 */
export function narrowProjectCritiqueOverride(
  metadata: unknown,
): boolean | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as { critiqueTheaterEnabled?: unknown })
    .critiqueTheaterEnabled;
  return typeof raw === 'boolean' ? raw : null;
}
