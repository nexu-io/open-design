import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { resolveAcceptedShellBaseline } from "./accepted-baseline.js";
import type { ExactTarget } from "./plan.js";

export async function writeAcceptedShellBaselineResolution(options: Readonly<{
  acceptedReceipt?: string;
  acceptedReceiptSha256?: `sha256:${string}`;
  channel: string;
  currentClosureIdentity: `sha256:${string}`;
  output: string;
  target: ExactTarget;
}>): Promise<void> {
  if ((options.acceptedReceipt == null) !== (options.acceptedReceiptSha256 == null)) {
    throw new Error("--accepted-receipt and --accepted-receipt-sha256 must be provided together");
  }
  const acceptedReceipt = options.acceptedReceipt == null
    ? undefined
    : Object.freeze({
        bytes: await readFile(resolve(options.acceptedReceipt)),
        sha256: options.acceptedReceiptSha256!,
      });
  const resolution = resolveAcceptedShellBaseline({
    acceptedReceipt,
    channel: options.channel,
    currentClosureIdentity: options.currentClosureIdentity,
    target: options.target,
  });
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(resolution, null, 2)}\n`, "utf8");
}
