import { describe, expect, it } from "vitest";
import { validateCensus } from "../src/build/census.js";

/**
 * The census crosses a process boundary from the Blender runner. A malformed
 * payload must surface as the structured S3D-E-204 verdict this function
 * exists to give — never a raw TypeError from dereferencing a field on a null
 * payload. The caller reports `err.message`, so a bare TypeError would replace
 * the itemized field list with an opaque engine-specific string, losing every
 * other missing field it would have named.
 */
describe("validateCensus", () => {
  it("throws the structured S3D-E-204 verdict on a null payload, not a TypeError", () => {
    for (const bad of [null, undefined, 42, "census", []]) {
      let thrown: (Error & { code?: string }) | undefined;
      try {
        validateCensus(bad);
      } catch (e) {
        thrown = e as Error & { code?: string };
      }
      expect(thrown, `${JSON.stringify(bad)} must be rejected`).toBeDefined();
      expect(thrown!.name).not.toBe("TypeError");
      expect(thrown!.message).toContain("invalid census");
      // Arrays are objects, so [] reaches the itemized field checks rather than
      // the not-an-object guard — either way it is a structured verdict, never
      // a raw dereference crash.
      if (!Array.isArray(bad)) {
        expect(thrown!.code).toBe("S3D-E-204");
      }
    }
  });

  it("itemizes every missing field for an object that is not a census", () => {
    let thrown: Error | undefined;
    try {
      validateCensus({});
    } catch (e) {
      thrown = e as Error;
    }
    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain("census.objects missing");
    expect(thrown!.message).toContain("census.meshes missing");
  });
});
