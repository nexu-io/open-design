import { sha256Hex, type StandaloneComponent } from "@open-design/standalone";

export const CLOSURE_VERSION = "0.1.0";
export const CLOSURE_FIXTURE_COMPONENT = "closure-fixture";

export function createClosureFixtureContribution(input: {
  artifactUrl: string;
  artifactBytes: Uint8Array;
}): StandaloneComponent {
  return {
    name: CLOSURE_FIXTURE_COMPONENT,
    mode: "required",
    artifact: {
      entrypoint: "fixture.mjs",
      sha256: sha256Hex(input.artifactBytes),
      size: input.artifactBytes.byteLength,
      url: input.artifactUrl,
    },
  };
}
