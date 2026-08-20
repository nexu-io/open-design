# Market research → scene3d decisions (condensed)

Source: user-provided research, 2026-08-18 ("What AI 3D Tools Still Get
Wrong"). This is the condensed, decision-shaping version; hold these theses
while extending the compiler. The full text lives with the user.

## The strategic thesis (verbatim spirit)

Generation is commoditizing (Meshy/Tripo now ship remesh, quad, rig,
animate, print-repair, MCP as line items). The durable layer is not "best
text-to-chair" — it is: **generators know what an object should look like;
scene3d knows what the object has to DO.** Fit a hand, contact the floor,
deform, hit a budget, hold exact proportions, belong to its scene, follow
studio conventions. Be the 3D technical-artist agent, not another
generator. Users' core complaint: "appearance I like, structure I cannot
trust" — they don't know an asset is unusable until the pipeline damages
it downstream.

## Findings → what scene3d already is (keep leaning in)

- "Truth panel, not glamour render" → the census + digest + claims:
  measured wireframe-level facts (manifold, tris, UV coverage/overlap,
  texel density, grounding, contacts, symmetry error, density allocation,
  proof-frame stats) returned by the ONE compile call. Bad builds fail
  loudly (S3D codes, E-701 claims).
- "Scene-aware, not isolated-object" → the relation solver: parts are
  placed by relations in a persistent scene; footprint/contact/clearance
  are the language itself.
- "Asset recipe/history, not slot machine" → scene.json is the recipe;
  provenance maps every issue to the authored line; the stage cache makes
  each step reproducible.
- "Target profiles" → scene3d.json contract (budgets, UV policy, texture
  policy, geometry hygiene, export formats). `allowOpenMeshes` is the
  first inspection-posture knob for ingested third-party assets.
- "Ingest the winner, don't compete on reconstruction" → the `mesh`
  source kind and `file` parts: any downloaded GLB/OBJ/FBX compiles
  through the same gates, and can be composed declaratively.

## Findings → not built yet (ranked; pull from here)

1. **Production-readiness score** — one derived roll-up from facts the
   census already measures (geometry/UV/materials/budget/staging as
   pass/warn/fail categories + a number). Cheap; high leverage; purely
   derived, never authored.
2. **Constraint locks / localized semantic edits** — "change X, nothing
   else". The spec language is already the foundation (edit one relation,
   re-solve); next: region-level locks for file-backed parts.
3. **Scene-consistency QA** — flag parts anomalous vs the scene (scale,
   texel density, tri density, palette, bevel language). `triDensity`
   spread in the digest is the first step.
4. **Engine target profiles** — named export profiles (Unity/Unreal/
   Godot/web/print) configuring axes, units, budgets, naming, validation
   in one word instead of many knobs.
5. **Print gate** — watertight (have), min wall thickness (need raycast
   measurement), overhangs, self-intersections. A niche with very
   specific, checkable requirements.
6. **Batch + tournament** — N variants in, QA gates + claims filter, rank
   survivors. The claims system is the filter already; needs orchestration.
7. **Staged texture pipeline** — geometry edits must not destroy baked
   textures: keep bake as a late, re-runnable stage.

## Anti-goals (explicitly commoditized; do not build as differentiators)

Text/image→3D itself, generic auto-remesh/quad/low-poly, canned
auto-rigging, 4K texture generation, MCP wrapper features, generic DCC
bridges. Integrate them as replaceable stages when needed; never compete
on them.
