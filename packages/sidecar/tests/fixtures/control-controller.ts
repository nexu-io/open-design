import {
  bootstrapControlPlane,
  type SidecarControlPlane,
  type SidecarControlRoots,
  type SidecarControlScope,
} from "../../src/control/index.js";

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
  return bootstrapControlPlane({ roots, scope });
}
