import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  resolveContentIdentityDeclaration,
  type ContentIdentitySource,
} from "@open-design/metatool";

import { parseIdentityRegistry, type IdentityDeclaration, type IdentityRegistry } from "./schema.ts";

export type ResolvedIdentityDeclaration = Readonly<{
  declaration: IdentityDeclaration;
  id: string;
  sources: readonly ContentIdentitySource[];
}>;

export async function readIdentityRegistry(workspaceRoot: string): Promise<IdentityRegistry> {
  const path = join(resolve(workspaceRoot), "tools", "release", "resources", "identities.json");
  return parseIdentityRegistry(JSON.parse(await readFile(path, "utf8")) as unknown);
}

export function resolveIdentityDeclaration(registry: IdentityRegistry, id: string): ResolvedIdentityDeclaration {
  return resolveContentIdentityDeclaration(registry, id);
}
