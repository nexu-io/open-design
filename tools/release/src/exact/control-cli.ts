import { resolve } from "node:path";

import { readObject } from "./control-common.ts";
import { executeExactReleaseControl, selfCheckExactReleaseControl } from "./control-release.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

if (process.argv.includes("--self-check")) selfCheckExactReleaseControl();
else {
  const request = await readObject(argument("--request"));
  const receipt = argument("--receipt");
  await executeExactReleaseControl(request, receipt);
}
