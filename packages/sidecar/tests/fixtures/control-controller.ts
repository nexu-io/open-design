import {
  bootstrapControlPlane,
  type SidecarControlPlane,
  type SidecarControlRoots,
  type SidecarControlScope,
} from "../../src/control/index.js";

export type DemoMethods = {
  echo: {
    input: { value: string };
    output: { value: string };
  };
};

export function createDemoController(
  scope: SidecarControlScope,
  roots: SidecarControlRoots,
): SidecarControlPlane {
  return bootstrapControlPlane({ roots, scope });
}
