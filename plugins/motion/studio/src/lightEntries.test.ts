// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

const packageDir = resolve(import.meta.dirname, "..");
const { subpaths } = JSON.parse(readFileSync(resolve(packageDir, "package-subpaths.json"), "utf8"));

function refuse(name: string): never {
  throw new Error(`a light entry loaded ${name}`);
}
vi.mock("@hyperframes/core", () => refuse("@hyperframes/core"));
vi.mock("@hyperframes/shader-transitions", () => refuse("@hyperframes/shader-transitions"));
vi.mock("@codemirror/view", () => refuse("@codemirror/view"));
vi.mock("@codemirror/state", () => refuse("@codemirror/state"));
vi.mock("mediabunny", () => refuse("mediabunny"));
vi.mock("gsap", () => refuse("gsap"));
vi.mock("@hyperframes/parsers", () => refuse("@hyperframes/parsers"));
vi.mock("@hyperframes/parsers/hf-ids", () => refuse("@hyperframes/parsers/hf-ids"));
vi.mock("@hyperframes/sdk", () => refuse("@hyperframes/sdk"));
vi.mock("dockview-react", () => refuse("dockview-react"));

describe("entries a host imports for its first screen", () => {
  it.each(["./ui", "./player"])(
    "%s loads without the editor, the parsers, gsap or media decoding",
    async (entry) => {
      await expect(import(resolve(packageDir, subpaths[entry].source))).resolves.toBeDefined();
    },
    // The icon set alone is thousands of modules to transform on a cold run.
    30_000,
  );
});
