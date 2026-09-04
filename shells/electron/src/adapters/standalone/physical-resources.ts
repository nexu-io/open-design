import {
  normalizeSidecarStamp,
  type SidecarStamp,
} from "@open-design/sidecar";
import type { StandaloneGenerationBinding } from "@open-design/standalone";

export const ELECTRON_PHYSICAL_RESOURCE_SET_SCHEMA_VERSION = 1 as const;

export type ElectronPhysicalResourceDeclaration = Readonly<{
  id: string;
  stamp: Readonly<Pick<SidecarStamp, "app" | "mode" | "source">>;
}>;

export type ElectronPhysicalResourceSetDeclaration = Readonly<{
  schemaVersion: typeof ELECTRON_PHYSICAL_RESOURCE_SET_SCHEMA_VERSION;
  resources: readonly ElectronPhysicalResourceDeclaration[];
}>;

export type ElectronBoundPhysicalResourceSet = Readonly<{
  schemaVersion: typeof ELECTRON_PHYSICAL_RESOURCE_SET_SCHEMA_VERSION;
  binding: StandaloneGenerationBinding;
  resources: readonly Readonly<{
    id: string;
    stamp: SidecarStamp;
  }>[];
}>;

const resourceId = /^[a-z][a-z0-9.-]{0,127}$/u;

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields must be exactly ${wanted.join(",")}`);
  }
}

export function validateElectronPhysicalResourceSet(
  input: unknown,
): ElectronPhysicalResourceSetDeclaration {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Electron physical resource set must be an object");
  }
  const value = input as Record<string, unknown>;
  exactKeys(value, ["resources", "schemaVersion"], "Electron physical resource set");
  if (value.schemaVersion !== ELECTRON_PHYSICAL_RESOURCE_SET_SCHEMA_VERSION) {
    throw new Error("unsupported Electron physical resource set schema");
  }
  if (!Array.isArray(value.resources) || value.resources.length === 0 || value.resources.length > 16) {
    throw new Error("Electron physical resource set must contain between 1 and 16 resources");
  }
  const ids = new Set<string>();
  const identities = new Set<string>();
  const resources = value.resources.map((candidate, index): ElectronPhysicalResourceDeclaration => {
    if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error(`Electron physical resource ${index} must be an object`);
    }
    const resource = candidate as Record<string, unknown>;
    exactKeys(resource, ["id", "stamp"], `Electron physical resource ${index}`);
    if (typeof resource.id !== "string" || !resourceId.test(resource.id) || ids.has(resource.id)) {
      throw new Error(`Electron physical resource ${index} has an invalid or duplicate id`);
    }
    if (resource.stamp == null || typeof resource.stamp !== "object" || Array.isArray(resource.stamp)) {
      throw new Error(`Electron physical resource ${resource.id} stamp must be an object`);
    }
    const stamp = resource.stamp as Record<string, unknown>;
    exactKeys(stamp, ["app", "mode", "source"], `Electron physical resource ${resource.id} stamp`);
    const normalized = normalizeSidecarStamp({
      app: stamp.app,
      channel: "validation",
      mode: stamp.mode,
      namespace: "validation",
      source: stamp.source,
    });
    const identity = JSON.stringify([normalized.source, normalized.mode, normalized.app]);
    if (identities.has(identity)) throw new Error(`Electron physical resource ${resource.id} has a duplicate stamp identity`);
    ids.add(resource.id);
    identities.add(identity);
    return Object.freeze({
      id: resource.id,
      stamp: Object.freeze({ app: normalized.app, mode: normalized.mode, source: normalized.source }),
    });
  });
  return Object.freeze({ schemaVersion: ELECTRON_PHYSICAL_RESOURCE_SET_SCHEMA_VERSION, resources: Object.freeze(resources) });
}

export function bindElectronPhysicalResourceSet(
  declaration: ElectronPhysicalResourceSetDeclaration,
  binding: StandaloneGenerationBinding,
): ElectronBoundPhysicalResourceSet {
  const validated = validateElectronPhysicalResourceSet(declaration);
  const resources = validated.resources.map((resource) => Object.freeze({
    id: resource.id,
    stamp: Object.freeze(normalizeSidecarStamp({
      ...resource.stamp,
      channel: binding.scope.channel,
      namespace: binding.scope.namespace,
    })),
  }));
  return Object.freeze({
    schemaVersion: ELECTRON_PHYSICAL_RESOURCE_SET_SCHEMA_VERSION,
    binding,
    resources: Object.freeze(resources),
  });
}
