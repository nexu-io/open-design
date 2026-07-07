import { join } from "node:path";

import type { ToolPackConfig } from "./config.js";

export function domToPptxBundleResource(config: Pick<ToolPackConfig, "workspaceRoot">): { from: string; to: string } {
  return {
    from: join(config.workspaceRoot, "apps", "desktop", "vendor", "dom-to-pptx", "dom-to-pptx.bundle.js.gz"),
    to: "dom-to-pptx.bundle.js.gz",
  };
}
