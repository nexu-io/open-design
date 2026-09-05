let body = null;

export async function standaloneGenerationHandoff(request) {
  body ??= (async () => {
    const updater = await request.capabilities.invoke({
      requestId: "closure-shell-updater-read",
      attachmentId: request.attachment.id,
      bindingDigest: request.binding.digest,
      capability: "standalone-shell-updater-v3",
      input: { schemaVersion: 1, operation: "read", shellType: request.attachment.shell.type },
    });
    if (
      updater.outcome !== "accepted"
      || updater.output?.schemaVersion !== 1
      || updater.output?.operation !== "read"
      || updater.output?.snapshot?.shellType !== request.attachment.shell.type
    ) throw new Error("Closure fixture could not reach its typed Shell updater");
    const layout = await request.capabilities.invoke({
      requestId: "closure-runtime-layout-read",
      attachmentId: request.attachment.id,
      bindingDigest: request.binding.digest,
      capability: "standalone-runtime-layout-v1",
      input: { schemaVersion: 1, operation: "read", scope: request.binding.scope },
    });
    if (
      layout.outcome !== "accepted"
      || layout.output?.schemaVersion !== 1
      || layout.output?.operation !== "read"
      || layout.output?.scope?.channel !== request.binding.scope.channel
      || !layout.output?.layout?.runtimeRoot
    ) throw new Error("Closure fixture could not reach its scoped Shell runtime layout");
    let state = "running";
    let resolveTerminal;
    const terminal = new Promise((resolve) => { resolveTerminal = resolve; });
    const status = () => ({
      bindingDigest: request.binding.digest,
      generationId: request.binding.generationId,
      instanceId: `electron-fixture-${request.binding.digest.slice(0, 16)}`,
      references: state === "running" ? 1 : 0,
      state,
    });
    return {
      readStatus: async () => status(),
      invoke: async (command) => ({
        requestId: command.requestId,
        attachmentId: command.attachmentId,
        bindingDigest: request.binding.digest,
        outcome: "unsupported",
        error: { code: "closure-fixture-command-unavailable" },
      }),
      close: async () => {
        if (state === "running") {
          state = "stopped";
          resolveTerminal(status());
        }
        return status();
      },
      waitForTerminal: async () => terminal,
    };
  })();
  return await body;
}
