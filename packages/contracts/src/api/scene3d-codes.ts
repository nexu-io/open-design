/**
 * Human titles for the stable `S3D-*` issue codes.
 *
 * The compiler's codes are the contract between the pipeline, the agent,
 * and the test corpus — but a bare `S3D-W-323` chip in the UI asks the
 * user to memorise a taxonomy. This catalog gives every code a short
 * human phrase for chrome that has the code but not the full message
 * (stored manifests keep `issueCodes` only; live compiles carry prose).
 *
 * Source of truth for the code SET is `packages/scene3d/src/errors.ts`;
 * a daemon test asserts every code defined there has a title here, so
 * the two cannot drift silently. Titles are compiler vocabulary (like
 * the messages themselves) and are deliberately not localised.
 */
export const SCENE3D_ISSUE_TITLES: Readonly<Record<string, string>> = {
  /* parse */
  'S3D-E-101': 'No scene sources found',
  'S3D-E-102': 'Multiple scene sources conflict',
  'S3D-E-103': 'USDA failed to parse',
  'S3D-E-104': 'Invalid scene3d.json contract',
  'S3D-E-105': 'scene.json fails validation',
  'S3D-E-106': 'Layout constraints unsolvable',
  'S3D-W-106': 'Authored offset auto-adjusted',
  'S3D-W-107': 'Generated instances intersect',

  /* build */
  'S3D-E-201': 'Blender not found',
  'S3D-E-202': 'Blender build failed',
  'S3D-E-203': 'Build stage timed out',
  'S3D-E-204': 'Scene census invalid',
  'S3D-E-205': 'Export failed',
  'S3D-W-205': 'Export format unavailable',
  'S3D-E-206': 'Proof render failed',
  'S3D-W-207': 'Imported file degraded',
  'S3D-W-208': 'Viewer edits ignored',

  /* lint: naming */
  'S3D-E-301': 'Default object name',
  'S3D-E-302': 'Name violates pattern',
  'S3D-E-303': 'Missing name prefix',
  'S3D-E-304': 'Default collection name',
  'S3D-E-305': 'Collection name violates pattern',
  'S3D-E-306': 'Hierarchy too deep',
  'S3D-W-301': 'Default object name',

  /* lint: topology + engine hygiene */
  'S3D-E-321': 'Non-manifold mesh',
  'S3D-E-322': 'NaN in transform',
  'S3D-E-323': 'Degenerate scale',
  'S3D-E-324': 'Z-fighting between faces',
  'S3D-W-321': 'N-gon faces',
  'S3D-W-322': 'Zero-area faces',
  'S3D-W-323': 'Z-fighting check incomplete',
  'S3D-E-327': 'Negative scale',
  'S3D-W-327': 'Loose geometry',
  'S3D-W-328': 'Duplicate vertices',
  'S3D-W-329': 'Inconsistent face winding',
  'S3D-W-330': 'Unapplied object scale',
  'S3D-W-331': 'Duplicate-vertex check skipped',
  'S3D-W-332': 'Hidden mesh still exports',
  'S3D-W-333': 'Unsupported print overhang',
  'S3D-W-335': 'Triangle budget approximated',
  'S3D-W-334': 'Wall too thin to print',

  /* lint: world placement + budgets */
  'S3D-W-325': 'Part floats above support',
  'S3D-E-325': 'Part sunk below ground',
  'S3D-E-326': 'Mesh over triangle budget',
  'S3D-W-326': 'Scene over triangle budget',

  /* lint: pbr + textures */
  'S3D-E-341': 'Metallic outside convention',
  'S3D-E-342': 'Roughness out of range',
  'S3D-W-341': 'Untouched default material',
  'S3D-W-342': 'IOR out of range',
  'S3D-W-343': 'Texture without UVs',
  'S3D-W-344': 'Unused material',
  'S3D-W-345': 'Object without material',
  'S3D-E-346': 'Texture file missing',
  'S3D-W-346': 'Texture not power-of-two',
  'S3D-W-347': 'Texture oversized',
  'S3D-W-348': 'Duplicate materials',
  'S3D-W-349': 'Faces without material',
  'S3D-W-350': 'Unrealistic dark metal',

  /* lint: units */
  'S3D-E-361': 'Scene units mismatch',
  'S3D-E-362': 'Up-axis mismatch',
  'S3D-W-361': 'Non-uniform scale',

  /* lint: integrity + proof */
  'S3D-E-381': 'No camera',
  'S3D-W-381': 'No lights',
  'S3D-E-382': 'Empty mesh',
  'S3D-W-382': 'Part off camera',
  'S3D-E-383': 'Proof render empty',
  'S3D-W-383': 'Proof render sparse',
  'S3D-W-384': 'Turntable shows no motion',
  'S3D-W-385': 'Proof overexposed',
  'S3D-W-386': 'Some proof angles empty',

  /* lint: uv */
  'S3D-E-441': 'UVs missing',
  'S3D-W-441': 'Overlapping UV islands',
  'S3D-W-442': 'Flipped UVs',
  'S3D-W-443': 'UVs outside the 0–1 tile',
  'S3D-W-444': 'Uneven texel density',
  'S3D-W-445': 'Texel density off target',
  'S3D-W-446': 'UV check incomplete',
  'S3D-W-447': 'UV stretch too high',

  /* lint: exported stage */
  'S3D-E-401': 'Stage prim missing kind',
  'S3D-E-402': 'Stage up-axis mismatch',
  'S3D-E-403': 'Stage units mismatch',
  'S3D-E-404': 'Stage prim default name',
  'S3D-E-405': 'No default prim',
  'S3D-W-401': 'No assetInfo authored',
  'S3D-W-402': 'Missing extent',
  'S3D-W-403': 'Prim name mismatch',
  'S3D-W-404': 'Proof rig not marked guide',
  'S3D-W-405': 'Model hierarchy inconsistent',

  /* info */
  'S3D-I-501': 'Stage skipped',
  'S3D-I-502': 'Minecraft model imported',

  /* lint: 2D sheets */
  'S3D-E-601': 'Sheet file missing',
  'S3D-E-602': 'Sheet unreadable',
  'S3D-E-603': 'Sheet not power-of-two',
  'S3D-E-604': 'Sheet oversized',
  'S3D-E-605': 'Sheet empty',
  'S3D-E-606': 'No fully opaque pixels',
  'S3D-E-607': 'Tintable sheet carries hue',
  'S3D-E-608': 'Grid does not match cells',
  'S3D-E-609': 'Blank flipbook frames',
  'S3D-E-610': 'Cell bleeds into neighbour',
  'S3D-E-611': 'Art touches sheet border',
  'S3D-E-612': 'Sheet not tileable',
  'S3D-E-613': 'Art touches strip long edge',
  'S3D-E-614': 'Skybox not opaque',
  'S3D-E-615': 'Skybox seam break',
  'S3D-E-616': 'Cubemap faces incomplete',
  'S3D-W-601': 'Flipbook frames identical',
  'S3D-W-602': 'Skybox highlights clipped',
  'S3D-W-603': 'Sheet mostly empty',
  'S3D-W-604': 'Flipbook cells not power-of-two',
  'S3D-W-605': 'Additive sheet has a bright border',

  /* lint: claims */
  'S3D-E-701': 'Authored claim failed',
  'S3D-W-701': 'Claim could not be checked',

  /* shaders */
  'S3D-E-801': 'Shader source invalid',
  'S3D-E-802': 'Driver rejected shader',
  'S3D-E-803': 'Shader bake failed',
  'S3D-E-804': 'Shader produced NaN/Inf',
  'S3D-W-801': 'Shader never referenced',
  'S3D-W-804': 'Non-finite pixel oracle unchecked',

  /* master parity */
  'S3D-E-501': 'glTF failed Khronos validation',
  'S3D-W-501': 'glTF validation warning',
  'S3D-E-502': 'USD stage does not compose',
  'S3D-W-502': 'USD binding resolves to nothing',
  'S3D-W-508': 'USD conformance unchecked',
  'S3D-W-509': 'glTF conformance unchecked',
  'S3D-E-901': 'Master stage lost content',
  'S3D-W-901': 'Master parity unchecked',
  'S3D-W-902': 'Joint/morph order drifted in lowering',
  'S3D-W-903': 'Material capability lost in lowering',

  /* intent budgets */
  'S3D-W-951': 'Part over its role triangle share',
  'S3D-W-952': 'Hero less detailed than background',
  'S3D-W-953': 'Part over its role texture budget',
  'S3D-W-954': 'Part scale incoherent with the scene',
  'S3D-W-955': 'Sliver triangles for the role',
  'S3D-W-956': 'Under-textured for the role',
  'S3D-I-952': 'Size outlier — verify units',
  'S3D-I-951': 'Triangle-density outlier',

  /* voxel / minecraft */
  'S3D-W-970': 'Vertices off the voxel grid',
  'S3D-W-971': 'Not a single cuboid element',
  'S3D-W-972': 'Rotation not allowed in this format',
  'S3D-W-973': 'Outside the model element bounds',
  'S3D-I-970': 'Multi-block structure, not one element',
};

/** The human phrase for a code, or null for a code this build predates. */
export function scene3dIssueTitle(code: string): string | null {
  return SCENE3D_ISSUE_TITLES[code] ?? null;
}
