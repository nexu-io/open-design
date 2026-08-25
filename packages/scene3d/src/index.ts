/**
 * scene3d — deterministic scene compilation for the Open Design fork.
 *
 * A scene project is treated like a code project: sources are text (bpy
 * build scripts or USDA layers), compilation is deterministic (headless
 * Blender + pure-TS structure linting), and every result carries stable
 * issue codes the agent learns once.
 */

export * from "./types.js";
export { ISSUE_CODES, summarize } from "./errors.js";
export { DEFAULT_CONTRACT, normalizeContract, validateContract, BLENDER_DEFAULT_NAMES } from "./contract.js";
export { compile } from "./pipeline.js";
export { renderAgentReport } from "./report.js";
export { buildManifest, writeManifest, writeViewer, writeProjectKit } from "./manifest.js";
export { renderKitHtml, type KitEntry, type KitPage } from "./viewer/kit.js";
export { XRAY_MODES, XRAY_GHOST_MODES, type XrayModeEntry } from "./viewer/xray-modes.js";
export { parseUsda, UsdaParseError, walkPrims, primByPath, primPath } from "./parse/usda.js";
export { discoverSources } from "./parse/sources.js";
export { probeBlender, clearProbeCache, scriptsDir, runnerPath, resolveScriptsDir } from "./build/blender.js";
export { validateCensus } from "./build/census.js";
export { runLint } from "./lint/rules.js";
export * from "./solve/types.js";
export { solveScene, findCoplanarFaces } from "./solve/solver.js";
export { emitBlenderScript, frameScene, type EmitOptions } from "./solve/emit-bpy.js";
export { validateSceneSpec, specDeclarationLines } from "./solve/validate.js";
export { lintClaims } from "./lint/claims.js";
export * from "./shade/types.js";
export { validateShaderSpec, validateKernelText } from "./shade/validate.js";
export {
  assembleShaderJob,
  assembleBakeFragment,
  assembleWebgl2Fragment,
  BAKE_VERTEX_SOURCE,
} from "./shade/emit.js";
export { SHADER_STDLIB, STDLIB_NAMES } from "./shade/stdlib.js";
export { lintProof } from "./lint/proof.js";
export { lintWorld } from "./lint/world.js";
export { lintExportedStage } from "./lint/stage.js";
export { decodePng, encodePng, PngDecodeError, type DecodedImage } from "./sheet/png.js";
export { measureSheet, edgeOf, edgeDifference, type SheetMeasurement } from "./sheet/measure.js";
export { collectSheets, type CollectedSheets } from "./sheet/collect.js";
export { lintSheets, type SheetSpec, type SheetKind, type SheetLintInput } from "./lint/sheet.js";export { describeScene } from "./read/describe.js";
export { changeImpact, formatImpact } from "./read/impact.js";
export { renderOrthoSvg, orthoDimensions } from "./read/ortho.js";
export {
  renderAsciiFrame,
  formatAsciiFrame,
  type AsciiFrame,
  type AsciiOptions,
} from "./read/ascii.js";
