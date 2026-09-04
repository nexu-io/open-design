export function createStandaloneGenerationBootloader(startBody) {
  let body = null;
  return async (request) => {
    body ??= startBody(request);
    return await body;
  };
}
