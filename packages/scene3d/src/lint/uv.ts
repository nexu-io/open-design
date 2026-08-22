import { Issue, Census, CensusMesh } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { LintContext } from "./naming.js";

/**
 * UV discipline — the thing game assets live or die on, judged from
 * measurements the census already made. Every threshold comes from
 * `conventions.uv` in the contract; this module contains policy application
 * only, never policy invention.
 *
 * The split of duties:
 *   - runner.py measures (coverage, overlap, flipped winding, texel density)
 *   - the contract decides what counts as broken
 *   - this file maps the comparison onto stable codes
 */
export function lintUv(ctx: LintContext, issues: Issue[]): void {
  const census = ctx.census;
  const rules = ctx.contract.uv;
  if (!census || rules.require === "off") return;

  const textured = texturedObjects(census);
  const densities: Array<{ object: string; min: number; max: number }> = [];
  // An imported mesh owns its own unwrap (or deliberately has none — vertex-
  // coloured, or a shader that needs no UVs). That is handled by provenance
  // reclassification after the fact, not by skipping the measurement here.

  for (const mesh of census.meshes) {
    const hasUv = mesh.uvLayers.length > 0;
    const needsUv = rules.require === "all" || textured.has(mesh.object);

    if (!hasUv) {
      if (needsUv) {
        issues.push({
          code: ISSUE_CODES.UV_MISSING,
          severity: "error",
          message:
            rules.require === "all"
              ? `mesh '${mesh.object}' has no UV layer and the contract requires UVs on every mesh`
              : `mesh '${mesh.object}' uses textured materials but has no UV layer`,
          hint: "unwrap the mesh (smart UV project is an acceptable floor) before texturing",
          target: mesh.object,
        });
      }
      continue;
    }

    // Absent block = census from an older runner: not measured, no verdict.
    const uv = mesh.uv;
    if (uv === undefined || uv === null) continue;

    // Quality verdicts scope exactly like `require`: a mirrored island or a
    // 2x-dense patch on a flat-colour prop changes nothing on screen —
    // Blender's own factory cylinder ships a mirrored bottom cap — so under
    // "textured" the quality rules judge textured meshes only. "all" judges
    // everything; the census still records the measurements either way.
    if (!needsUv) continue;

    if (!uv.sampled) {
      // Silence past the raster cap is not evidence — same discipline as
      // Z_FIGHTING_UNCHECKED.
      issues.push({
        code: ISSUE_CODES.UV_UNCHECKED,
        severity: "warning",
        message: `mesh '${mesh.object}' exceeded the UV raster budget; overlap/coverage were not measured`,
        target: mesh.object,
      });
    } else if (
      uv.overlapFraction !== null &&
      uv.overlapFraction > rules.maxOverlapFraction
    ) {
      issues.push({
        code: ISSUE_CODES.UV_OVERLAP,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${percent(uv.overlapFraction)} overlapping UV area (limit ${percent(rules.maxOverlapFraction)})`,
        hint: "separate the overlapping islands, or raise conventions.uv.maxOverlapFraction if the overlap is deliberate mirroring",
        target: mesh.object,
        detail: { overlapFraction: uv.overlapFraction, limit: rules.maxOverlapFraction },
      });
    }

    if (!rules.allowFlipped && uv.flippedFaces > 0) {
      issues.push({
        code: ISSUE_CODES.UV_FLIPPED,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${uv.flippedFaces} face(s) with mirrored UV winding`,
        hint: "flip the islands, or set conventions.uv.allowFlipped when mirroring is intentional",
        target: mesh.object,
        detail: { flippedFaces: uv.flippedFaces },
      });
    }

    if (uv.outOfBoundsFraction > rules.maxOutOfBoundsFraction) {
      issues.push({
        code: ISSUE_CODES.UV_OUT_OF_BOUNDS,
        severity: "warning",
        message: `mesh '${mesh.object}' has ${percent(uv.outOfBoundsFraction)} of UVs outside 0-1 (limit ${percent(rules.maxOutOfBoundsFraction)})`,
        hint: "pack islands into the 0-1 tile, or raise conventions.uv.maxOutOfBoundsFraction for tiling materials",
        target: mesh.object,
        detail: { outOfBoundsFraction: uv.outOfBoundsFraction },
      });
    }

    if (rules.maxStretch !== null && uv.stretch && uv.stretch.max > rules.maxStretch) {
      issues.push({
        code: ISSUE_CODES.UV_STRETCH,
        severity: "warning",
        message: `mesh '${mesh.object}' UV stretch reaches ${uv.stretch.max.toFixed(1)}x (mean ${uv.stretch.mean.toFixed(1)}x) — beyond the ${rules.maxStretch}x limit; the texture smears along the stretched axis`,
        hint: "relax the parameterization on the stretched faces, or raise conventions.uv.maxStretch if the distortion is acceptable",
        target: mesh.object,
        detail: { stretch: uv.stretch, limit: rules.maxStretch },
      });
    }

    if (uv.texelDensity) {
      densities.push({ object: mesh.object, min: uv.texelDensity.min, max: uv.texelDensity.max });
      if (
        rules.texelDensityTarget !== null &&
        (uv.texelDensity.max > rules.texelDensityTarget * rules.texelDensityMaxRatio ||
          uv.texelDensity.min < rules.texelDensityTarget / rules.texelDensityMaxRatio)
      ) {
        issues.push({
          code: ISSUE_CODES.TEXEL_DENSITY_TARGET,
          severity: "warning",
          message: `mesh '${mesh.object}' texel density ${formatDensity(uv.texelDensity.min)}-${formatDensity(uv.texelDensity.max)} px/m misses the ${formatDensity(rules.texelDensityTarget)} px/m target (x${rules.texelDensityMaxRatio} band)`,
          hint: "rescale the UV islands or resize the texture toward the project's density target",
          target: mesh.object,
          detail: { density: uv.texelDensity, target: rules.texelDensityTarget },
        });
      }
    }
  }

  // Scene-wide density spread: two textured parts standing next to each
  // other with wildly different px/m read as different levels of detail no
  // matter how good each texture is alone.
  //
  // Over the AUTHORED meshes only. This is a coherence statistic about a
  // decision — "did I texture my own parts consistently" — and a downloaded
  // asset's texel budget was somebody else's decision, made before this scene
  // existed. Folding one in produced a x189 warning naming the author's floor
  // as the offender against a 2K hero's 9882 px/m, which cannot be acted on in
  // either direction. Unlike the per-mesh rules there is no single subject to
  // reclassify, so the honest move is to state the population.
  const authored = densities.filter((d) => !(ctx.imported?.has(d.object) ?? false));
  const excluded = densities.length - authored.length;
  if (authored.length > 1) {
    const min = authored.reduce((a, b) => (a.min <= b.min ? a : b));
    const max = authored.reduce((a, b) => (a.max >= b.max ? a : b));
    if (min.min > 0 && max.max / min.min > rules.texelDensityMaxRatio) {
      const over = excluded > 0 ? ` (${excluded} imported mesh(es) excluded)` : "";
      issues.push({
        code: ISSUE_CODES.TEXEL_DENSITY_SPREAD,
        severity: "warning",
        message: `texel density varies x${(max.max / min.min).toFixed(1)} across the scene's authored parts${over} ('${min.object}' ${formatDensity(min.min)} px/m vs '${max.object}' ${formatDensity(max.max)} px/m; limit x${rules.texelDensityMaxRatio})`,
        hint: "even out UV scale or texture resolution so neighbouring parts read at one level of detail",
        detail: {
          min: { object: min.object, density: min.min },
          max: { object: max.object, density: max.max },
          ...(excluded > 0 ? { importedExcluded: excluded } : {}),
        },
      });
    }
  }
}

/**
 * Objects with at least one image-textured material bound.
 *
 * "Textured" is the RUNNER'S measured fact (`principled.hasTexture` — an
 * image wired into the shading graph), never re-derived here from
 * `textureNames`: a disconnected TEX_IMAGE node samples nothing, so
 * counting it would demand UVs no shader reads. `textureNames` stays what
 * it is — inventory for the duplicate-material fingerprint and labels.
 */
function texturedObjects(census: Census): Set<string> {
  const texturedMaterials = new Set(
    census.materials.filter((mat) => mat.principled.hasTexture).map((mat) => mat.name),
  );
  const result = new Set<string>();
  for (const mesh of census.meshes) {
    if (mesh.materials?.some((name) => texturedMaterials.has(name))) result.add(mesh.object);
  }
  // Censuses from an older runner carry no per-mesh material list; the one
  // textured-object fact they do record is the no-UV list, so honour it
  // rather than reporting nothing.
  for (const name of census.uvObjectsWithoutLayers) result.add(name);
  return result;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function formatDensity(value: number): string {
  return value >= 100 ? String(Math.round(value)) : value.toFixed(1);
}

/** Exported for the mesh-level callers and tests. */
export function meshHasUv(mesh: CensusMesh): boolean {
  return mesh.uvLayers.length > 0;
}
