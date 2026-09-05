import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createExactReleasePlanFromRegistryFile } from "./release-plan.js";
import { fetchAcceptedShellBaseline } from "./baseline-acquisition.js";
import type { ExactTarget } from "./plan.js";

export async function writeExactReleasePlan(options: Readonly<{
  acceptedReceipt?: string;
  acceptedReceiptSha256?: `sha256:${string}`;
  acceptedPointerUrl?: string;
  available?: string;
  channel: string;
  output: string;
  registry: string;
  root: string;
  target: ExactTarget;
}>): Promise<void> {
  if ((options.acceptedReceipt == null) !== (options.acceptedReceiptSha256 == null)) {
    throw new Error("--accepted-receipt and --accepted-receipt-sha256 must be provided together");
  }
  if (options.acceptedPointerUrl != null && options.acceptedReceipt != null) throw new Error("accepted pointer and local receipt are mutually exclusive");
  const acceptedReceipt = options.acceptedPointerUrl != null
    ? await fetchAcceptedShellBaseline({ channel: options.channel, pointerUrl: options.acceptedPointerUrl, target: options.target })
    : options.acceptedReceipt == null ? undefined : {
        bytes: await readFile(resolve(options.acceptedReceipt)),
        sha256: options.acceptedReceiptSha256!,
      };
  const availableIdentities = options.available == null
    ? new Set<string>()
    : new Set(JSON.parse(await readFile(resolve(options.available), "utf8")) as string[]);
  const receipt = await createExactReleasePlanFromRegistryFile({
    acceptedReceipt,
    availableIdentities,
    channel: options.channel,
    registryPath: resolve(options.root, options.registry),
    root: resolve(options.root),
    target: options.target,
  });
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}
