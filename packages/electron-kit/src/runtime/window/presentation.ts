export type ElectronPresentationMode = "headless" | "interactive";

export type ElectronFocusReason =
  | "app-activate"
  | "deep-link"
  | "initial-reveal"
  | "second-instance";

export type ElectronWindowTarget = Readonly<{
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
  show(): void;
  focus(): void;
}>;

export function resolveElectronPresentationMode(input: Readonly<{
  explicitHeadless?: boolean;
  argv?: readonly string[];
  env?: Readonly<Record<string, string | undefined>>;
}> = {}): ElectronPresentationMode {
  if (input.explicitHeadless != null) return input.explicitHeadless ? "headless" : "interactive";
  const argv = input.argv ?? process.argv.slice(1);
  const env = input.env ?? process.env;
  return argv.includes("--headless")
    || env.ELECTRON_KIT_HEADLESS === "1"
    || env.OD_PACKAGED_E2E_HEADLESS === "1"
    ? "headless"
    : "interactive";
}

export function focusElectronWindow(
  window: ElectronWindowTarget | null,
  mode: ElectronPresentationMode,
  _reason: ElectronFocusReason,
): boolean {
  if (mode === "headless" || window == null || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return true;
}
