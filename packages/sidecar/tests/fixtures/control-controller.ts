import { createHash } from "node:crypto";

import {
  bootstrapControlPlane,
  type SidecarControlPlane,
  type SidecarControlRoots,
  type SidecarControlScope,
} from "../../src/control/index.js";

const demoProjectionValue = Object.freeze({ releaseVersion: "0.18.0-beta.4" });
export const demoProjection = Object.freeze({
  digest: `sha256:${createHash("sha256")
    .update(JSON.stringify(demoProjectionValue))
    .digest("hex")}` as const,
  value: demoProjectionValue,
});

export type DemoMethods = {
  context: {
    input: Record<string, never>;
    output: {
      identity: {
        channel: string;
        generation: number;
        namespace: string;
        service: string;
      };
      roots: SidecarControlRoots;
    };
  };
  echo: {
    input: { value: string };
    output: { value: string };
  };
};

export function createDemoController(
  scope: SidecarControlScope,
  roots: SidecarControlRoots,
): SidecarControlPlane {
  return bootstrapControlPlane({ projection: demoProjection, roots, scope });
}
