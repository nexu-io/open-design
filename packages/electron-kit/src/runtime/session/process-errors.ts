export type ElectronProcessErrorEvent = Readonly<{
  classification: "fatal" | "ignored-platform-error";
  error: unknown;
  source: "uncaught-exception" | "unhandled-rejection";
}>;

export type ElectronProcessErrorLease = Readonly<{
  dispose(): void;
}>;

export function isHarmlessElectronSocketOptionError(value: unknown): boolean {
  if (!(value instanceof Error) || typeof value.message !== "string" || !value.message.includes("setTypeOfService")) return false;
  const code = (value as NodeJS.ErrnoException).code;
  return typeof code === "string" && code.length > 0 ? code === "EINVAL" : value.message.includes("EINVAL");
}

export function attachElectronProcessErrorHandlers(
  observe: (event: ElectronProcessErrorEvent) => void,
): ElectronProcessErrorLease {
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    process.removeListener("uncaughtException", onUncaughtException);
    process.removeListener("unhandledRejection", onUnhandledRejection);
  };
  const handle = (source: ElectronProcessErrorEvent["source"], error: unknown) => {
    if (isHarmlessElectronSocketOptionError(error)) {
      observe({ classification: "ignored-platform-error", error, source });
      return;
    }
    observe({ classification: "fatal", error, source });
    dispose();
    setImmediate(() => { throw error; });
  };
  function onUncaughtException(error: unknown): void { handle("uncaught-exception", error); }
  function onUnhandledRejection(reason: unknown): void { handle("unhandled-rejection", reason); }
  process.on("uncaughtException", onUncaughtException);
  process.on("unhandledRejection", onUnhandledRejection);
  return Object.freeze({ dispose });
}
