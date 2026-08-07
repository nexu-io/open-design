import { attachSidecar } from "../../src/control/index.js";

import type { DemoMethods } from "./control-controller.js";

await attachSidecar<DemoMethods>({
  handlers: {
    echo(input) {
      return { value: input.value };
    },
  },
});
