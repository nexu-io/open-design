type QuitEvent = Readonly<{ preventDefault(): void }>;

/** Normal quit ownership starts only after the carrier has committed startup. */
export function createCommittedQuitHandler(input: Readonly<{
  committed(): boolean;
  waitForHandoff(): Promise<void>;
  close(): Promise<void>;
  report(error: unknown): void;
  finish(): void;
}>) {
  let requested = false;
  return (event: QuitEvent) => {
    if (!input.committed()) return;
    event.preventDefault();
    if (requested) return;
    // Claim synchronously, before either handoff or cleanup can yield.
    requested = true;
    void input.waitForHandoff().catch(input.report).then(input.close).catch(input.report).finally(input.finish);
  };
}
