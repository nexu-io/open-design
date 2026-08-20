// The asset kind is what the host labels the deliverable with, so getting it
// wrong is user-visible in every surface at once: the badge, the export menu,
// the empty state. These pin the derivation rules rather than the wording.

import { describe, expect, it } from "vitest";
import { deriveAssetKind } from "../src/manifest.js";

type Part = { type: string; parent: string | null; mesh: unknown };

const mesh = (name: string, parent: string | null = null): Part => ({
  type: "MESH",
  parent,
  mesh: { verts: 8, faces: 6 },
});

const base = {
  partTree: [] as Part[],
  keyframedObjects: [] as string[],
  textureCount: 0,
  cameraPresent: false,
  sheets: [] as Array<{ kind: string }>,
};

describe("deriveAssetKind", () => {
  it("calls a single unstaged geometry root a prop", () => {
    expect(deriveAssetKind({ ...base, partTree: [mesh("crate")] })).toBe("prop");
  });

  it("calls several geometry roots a scene", () => {
    expect(
      deriveAssetKind({ ...base, partTree: [mesh("crate"), mesh("ground_slab")] }),
    ).toBe("scene");
  });

  it("excludes every staging type, speakers included", () => {
    // The web fallback (apps/web/src/runtime/scene3d-assets.ts) mirrors
    // this exclusion list; a divergence mislabels old manifests, which is
    // exactly what the review caught once already.
    expect(
      deriveAssetKind({
        ...base,
        partTree: [mesh("crate"), { type: "SPEAKER", parent: null, mesh: null }],
      }),
    ).toBe("prop");
  });

  it("keeps a single root a prop when only staging objects sit beside it", () => {
    // A crate lit by a key light is still a crate. Staging is not geometry.
    expect(
      deriveAssetKind({
        ...base,
        partTree: [mesh("crate"), { type: "LIGHT", parent: null, mesh: null }],
      }),
    ).toBe("prop");
  });

  it("promotes a single root to a scene once it is framed by a camera", () => {
    expect(
      deriveAssetKind({ ...base, partTree: [mesh("crate")], cameraPresent: true }),
    ).toBe("scene");
  });

  it("calls keyframed geometry an animation regardless of root count", () => {
    expect(
      deriveAssetKind({
        ...base,
        partTree: [mesh("rig"), mesh("prop_axe")],
        keyframedObjects: ["rig"],
      }),
    ).toBe("animation");
  });

  it("reads declared sheets when the compile produced no geometry", () => {
    const sheetOnly = (kind: string) => deriveAssetKind({ ...base, sheets: [{ kind }] });
    expect(sheetOnly("sky")).toBe("skybox");
    expect(sheetOnly("particle")).toBe("vfx");
    expect(sheetOnly("beam")).toBe("vfx");
    expect(sheetOnly("flipbook")).toBe("flipbook");
    expect(sheetOnly("sprite")).toBe("sprite");
  });

  it("lets geometry win over a sheet that ships alongside it", () => {
    // A scene that also emits a flipbook is still a scene; the sheet is an
    // extra deliverable, not a reclassification of the whole project.
    expect(
      deriveAssetKind({
        ...base,
        partTree: [mesh("crate"), mesh("lid")],
        sheets: [{ kind: "flipbook" }],
      }),
    ).toBe("scene");
  });

  it("calls image maps with no geometry and no sheets a texture", () => {
    expect(deriveAssetKind({ ...base, textureCount: 3 })).toBe("texture");
  });

  it("falls back to scene when there is nothing to go on", () => {
    expect(deriveAssetKind(base)).toBe("scene");
  });
});
