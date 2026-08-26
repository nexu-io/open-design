export const ELECTRON_SHORTCUT_SCHEMA_VERSION = 1 as const;

export type ElectronShortcutDeclaration = Readonly<{
  id: string;
  accelerators: Readonly<{
    darwin: string;
    win32: string;
  }>;
  required: boolean;
}>;

export type ElectronShortcutTopology = Readonly<{
  schemaVersion: typeof ELECTRON_SHORTCUT_SCHEMA_VERSION;
  shortcuts: readonly ElectronShortcutDeclaration[];
}>;

const identifier = /^[a-z][a-z0-9.-]{0,127}$/u;
const accelerator = /^[\x20-\x7e]{1,128}$/u;

export function validateElectronShortcutTopology(value: ElectronShortcutTopology): ElectronShortcutTopology {
  if (value.schemaVersion !== ELECTRON_SHORTCUT_SCHEMA_VERSION) throw new Error("unsupported Electron shortcut schema");
  if (!Array.isArray(value.shortcuts) || value.shortcuts.length === 0 || value.shortcuts.length > 64) {
    throw new Error("Electron shortcut topology must declare between 1 and 64 shortcuts");
  }
  const ids = new Set<string>();
  const accelerators = { darwin: new Set<string>(), win32: new Set<string>() };
  for (const shortcut of value.shortcuts) {
    if (!identifier.test(shortcut.id) || ids.has(shortcut.id)) throw new Error("invalid or duplicate Electron shortcut id");
    ids.add(shortcut.id);
    if (typeof shortcut.required !== "boolean") throw new Error(`invalid Electron shortcut requirement: ${shortcut.id}`);
    for (const platform of ["darwin", "win32"] as const) {
      const candidate = shortcut.accelerators[platform];
      if (!accelerator.test(candidate) || candidate.trim() !== candidate || accelerators[platform].has(candidate)) {
        throw new Error(`invalid or duplicate Electron ${platform} accelerator`);
      }
      accelerators[platform].add(candidate);
    }
  }
  return structuredClone(value);
}
