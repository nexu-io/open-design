import { readFile, writeFile } from "node:fs/promises";

import { parseAmrEndpointBinding } from "@open-design/contracts";
import type { ToolPackConfig } from "./index.js";

/** One environment identity wins over the legacy profile and console inputs. */
export function packagedAmrConfigFields(config: Pick<
  ToolPackConfig,
  "amrEndpointBinding" | "amrProfile" | "velaWebUrl" | "velaWebUrls"
>): Record<string, unknown> {
  const binding = parseAmrEndpointBinding(config.amrEndpointBinding);
  if (binding) {
    return {
      amrEndpointBinding: binding,
      amrProfile: binding.profile,
      velaWebUrl: binding.webUrl,
      velaWebUrls: { ...config.velaWebUrls, [binding.profile]: binding.webUrl },
    };
  }
  return {
    ...(config.amrProfile == null ? {} : { amrProfile: config.amrProfile }),
    ...(config.velaWebUrl == null ? {} : { velaWebUrl: config.velaWebUrl }),
    ...(config.velaWebUrls == null ? {} : { velaWebUrls: config.velaWebUrls }),
  };
}

/** Config is stamped on every cache materialization; verify the bytes written. */
export async function writePackagedConfigWithBinding(filePath: string, body: string): Promise<void> {
  await writeFile(filePath, body, "utf8");
  await assertPackagedConfigBinding(filePath, body);
}

export async function assertPackagedConfigBinding(filePath: string, expectedBody: string): Promise<void> {
  const expected = JSON.parse(expectedBody) as Record<string, unknown>;
  const actual = JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;
  const binding = parseAmrEndpointBinding(expected.amrEndpointBinding);
  if (JSON.stringify(parseAmrEndpointBinding(actual.amrEndpointBinding)) !== JSON.stringify(binding)) {
    throw new Error(`Packaged AMR endpoint binding differs from the requested environment: ${filePath}`);
  }
  if (binding && (actual.amrProfile !== binding.profile
    || actual.velaWebUrl !== binding.webUrl
    || (actual.velaWebUrls as Record<string, unknown> | undefined)?.[binding.profile] !== binding.webUrl)) {
    throw new Error(`Packaged AMR profile and console do not match the endpoint binding: ${filePath}`);
  }
}
