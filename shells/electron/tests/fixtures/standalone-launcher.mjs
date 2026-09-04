export function createStandaloneGenerationBootloader(startBody) {
  let body = null;
  return async (request) => {
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
      return await startBody(request);
    })();
    return await body;
  };
}
