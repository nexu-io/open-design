let active = null;

function createBody(request) {
  let state = "running";
  const attachments = new Set();
  let resolveTerminal;
  const terminal = new Promise((resolve) => { resolveTerminal = resolve; });
  const status = () => ({
    bindingDigest: request.binding.digest,
    generationId: request.binding.generationId,
    instanceId: `terminal-fixture-${request.binding.digest.slice(0, 16)}`,
    references: attachments.size,
    state,
  });
  return {
    bindingDigest: request.binding.digest,
    generationId: request.binding.generationId,
    attach(attachmentId) {
      if (state !== "running") throw new Error("Terminal fixture generation is stopped");
      attachments.add(attachmentId);
      let closed = false;
      return {
        readStatus: async () => status(),
        invoke: async (command) => ({
          requestId: command.requestId,
          attachmentId: command.attachmentId,
          bindingDigest: request.binding.digest,
          outcome: "unsupported",
          error: { code: "terminal-fixture-command-unavailable" },
        }),
        close: async () => {
          if (!closed) {
            closed = true;
            attachments.delete(attachmentId);
            if (attachments.size === 0) {
              state = "stopped";
              resolveTerminal(status());
            }
          }
          return { ...status(), state: "stopped" };
        },
        waitForTerminal: async () => terminal,
      };
    },
  };
}

export async function standaloneGenerationHandoff(request) {
  active ??= createBody(request);
  if (active.bindingDigest !== request.binding.digest || active.generationId !== request.binding.generationId) {
    throw new Error("Terminal fixture generation binding changed");
  }
  return active.attach(request.attachment.id);
}
