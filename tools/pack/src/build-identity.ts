import { fileURLToPath } from "node:url";

import {
  readContentIdentityRegistry,
  resolveContentIdentity,
  resolveContentIdentityDeclaration,
  type ContentIdentityResult,
} from "@open-design/metatool";

export async function resolveDeclaredBuildIdentity(input: Readonly<{
  id: string;
  parameters: Readonly<Record<string, unknown>>;
  workspaceRoot: string;
}>): Promise<ContentIdentityResult> {
  const registry = await readContentIdentityRegistry(fileURLToPath(
    new URL("../resources/build-identities.json", import.meta.url),
  ));
  const resolved = resolveContentIdentityDeclaration(registry, input.id);
  const expected = [...resolved.declaration.parameters].sort();
  const actual = Object.keys(input.parameters).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(`build identity ${input.id} parameters must be exactly: ${expected.join(", ")}`);
  }
  return await resolveContentIdentity({
    id: input.id,
    parameters: { declaration: resolved.declaration, values: input.parameters },
    root: input.workspaceRoot,
    schemaVersion: resolved.declaration.schemaVersion,
    sources: resolved.sources,
  });
}
