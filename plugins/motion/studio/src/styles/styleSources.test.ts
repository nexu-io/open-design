import { describe, expect, it } from "vitest";
import { listSourceFiles, toPosixPath } from "./styleSources";

describe("style source paths", () => {
  it("turns a Windows-style relative path into the forward-slash form the baseline uses", () => {
    expect(toPosixPath("packages\\studio\\src\\App.tsx")).toBe("packages/studio/src/App.tsx");
  });

  it("leaves a forward-slash path alone", () => {
    expect(toPosixPath("packages/studio/src/App.tsx")).toBe("packages/studio/src/App.tsx");
  });

  it("hands the keep filter and the map key the same forward-slash path", () => {
    const seen: string[] = [];
    const files = listSourceFiles((file) => (seen.push(file), file.endsWith("styleSources.ts")));

    expect([...files.keys()]).toEqual(["styles/styleSources.ts"]);
    expect(seen.every((file) => !file.includes("\\"))).toBe(true);
  });
});
