import { createHash } from "node:crypto";

import {
  createClosureDistributionManifest,
  type ClosureDigest,
  type ClosureDistributionManifest,
  type ClosureDistributionManifestDraft,
} from "@open-design/closure-proto";

function sha256CanonicalManifest(value: string): ClosureDigest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

/** Seal tools-pack inputs into the shell-neutral, target-complete wire manifest. */
export function sealClosureDistributionManifest(
  draft: ClosureDistributionManifestDraft,
): ClosureDistributionManifest {
  return createClosureDistributionManifest(draft, sha256CanonicalManifest);
}
