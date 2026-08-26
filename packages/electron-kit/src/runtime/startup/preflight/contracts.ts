export const ELECTRON_PREFLIGHT_SCHEMA_VERSION = 1 as const;

export const ELECTRON_PREFLIGHT_ATOMS = Object.freeze({
  PREFERRED_LANGUAGE: "electron.preferred-language",
  CONNECTION_LIMIT_EXEMPTIONS: "electron.connection-limit-exemptions",
} as const);

export type ElectronPreflightAtom =
  | Readonly<{
      id: string;
      executor: typeof ELECTRON_PREFLIGHT_ATOMS.PREFERRED_LANGUAGE;
    }>
  | Readonly<{
      id: string;
      executor: typeof ELECTRON_PREFLIGHT_ATOMS.CONNECTION_LIMIT_EXEMPTIONS;
      hosts: readonly string[];
    }>;

export type ElectronPreflightTopology = Readonly<{
  schemaVersion: typeof ELECTRON_PREFLIGHT_SCHEMA_VERSION;
  atoms: readonly ElectronPreflightAtom[];
}>;

export type ElectronPreflightResult = Readonly<{
  appliedAtomIds: readonly string[];
  preferredLanguage: string | null;
}>;

const atomId = /^[a-z][a-z0-9.-]{1,127}$/u;
const host = /^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?)$/u;

export function validateElectronPreflightTopology(value: ElectronPreflightTopology): ElectronPreflightTopology {
  if (value.schemaVersion !== ELECTRON_PREFLIGHT_SCHEMA_VERSION) throw new Error("unsupported Electron preflight schema");
  if (!Array.isArray(value.atoms) || value.atoms.length > Object.keys(ELECTRON_PREFLIGHT_ATOMS).length) {
    throw new Error("Electron preflight must contain a finite atom set");
  }
  const ids = new Set<string>();
  const executors = new Set<string>();
  for (const atom of value.atoms) {
    if (!atomId.test(atom.id) || ids.has(atom.id)) throw new Error("invalid or duplicate Electron preflight atom id");
    ids.add(atom.id);
    if (!(Object.values(ELECTRON_PREFLIGHT_ATOMS) as readonly string[]).includes(atom.executor) || executors.has(atom.executor)) {
      throw new Error("unknown or duplicate Electron preflight executor");
    }
    executors.add(atom.executor);
    if (atom.executor === ELECTRON_PREFLIGHT_ATOMS.CONNECTION_LIMIT_EXEMPTIONS) {
      if (!Array.isArray(atom.hosts) || atom.hosts.length === 0 || atom.hosts.length > 32 || new Set(atom.hosts).size !== atom.hosts.length) {
        throw new Error("Electron connection-limit exemptions require unique hosts");
      }
      if (atom.hosts.some((candidate: unknown) => typeof candidate !== "string" || !host.test(candidate))) {
        throw new Error("invalid Electron connection-limit exemption host");
      }
    } else if ("hosts" in atom) {
      throw new Error("preferred-language preflight does not accept hosts");
    }
  }
  return structuredClone(value);
}
