import {
  attachSidecar,
  type AttachedSidecar,
  type SidecarControlContext,
} from "../../src/control/index.js";

import type { DemoMethods } from "./control-controller.js";

export async function attachDemoBody(
  observeContext: (context: SidecarControlContext) => void,
): Promise<AttachedSidecar> {
  return await attachSidecar<DemoMethods>({
    handlers: {
      echo(input, context) {
        observeContext(context);
        return { value: input.value };
      },
    },
  });
}
