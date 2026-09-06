import { resolve } from "node:path";

import { readObject } from "./control-common.js";
import { executeExactPackControl } from "./control-pack.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return resolve(value);
}

const request = await readObject(argument("--request"));
await executeExactPackControl(request, argument("--receipt"));
