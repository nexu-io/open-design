import {
  ELECTRON_PREFLIGHT_ATOMS,
  validateElectronPreflightTopology,
  type ElectronPreflightResult,
  type ElectronPreflightTopology,
} from "./contracts.js";

export type ElectronPreflightApp = Readonly<{
  isReady(): boolean;
  getPreferredSystemLanguages(): string[];
  commandLine: Readonly<{
    appendSwitch(name: string, value?: string): void;
  }>;
}>;

export function applyElectronPreflight(app: ElectronPreflightApp, topology: ElectronPreflightTopology): ElectronPreflightResult {
  const validated = validateElectronPreflightTopology(topology);
  if (app.isReady()) throw new Error("Electron preflight must run before app readiness");

  const switches: Array<Readonly<{ name: string; value: string }>> = [];
  let preferredLanguage: string | null = null;
  for (const atom of validated.atoms) {
    if (atom.executor === ELECTRON_PREFLIGHT_ATOMS.PREFERRED_LANGUAGE) {
      preferredLanguage = app.getPreferredSystemLanguages()[0] ?? "en";
      switches.push({ name: "lang", value: preferredLanguage });
    } else {
      switches.push({ name: "ignore-connections-limit", value: atom.hosts.join(",") });
    }
  }
  for (const entry of switches) app.commandLine.appendSwitch(entry.name, entry.value);
  const appliedAtomIds = validated.atoms.map((atom) => atom.id);
  return Object.freeze({ appliedAtomIds: Object.freeze(appliedAtomIds), preferredLanguage });
}
