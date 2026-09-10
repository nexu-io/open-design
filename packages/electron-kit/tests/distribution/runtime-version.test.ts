import { expect, it } from "vitest";
import { electronRuntimeVersion, readElectronRuntimeVersion } from "@/distribution/runtime-version.js";

it("resolves the exact host contract from the owning package", async () => {
  expect(await readElectronRuntimeVersion()).toMatch(/^\d+\.\d+\.\d+$/u);
  expect(electronRuntimeVersion({ peerDependencies: { electron: "41.3.0" }, devDependencies: { electron: "41.3.0" } })).toBe("41.3.0");
});
it("refuses floating, absent and contradictory runtime declarations", () => {
  for (const peer of [undefined, "latest", "^41.3.0", "41.x", "41.3.1"]) {
    expect(() => electronRuntimeVersion({ peerDependencies: { electron: peer }, devDependencies: { electron: "41.3.0" } })).toThrow("matching exact");
  }
});
