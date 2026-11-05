/**
 * Next's dev-server startup awaits npm dist-tags without a timeout. E2E does
 * not test the dev overlay's update notice, so keep this optional metadata
 * lookup offline. Do not intercept application/provider requests.
 * Loaded only by the e2e-owned tools-dev environment, including its children.
 */
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://registry.npmjs.org/-/package/next/dist-tags') {
    return Promise.resolve(new Response(null, { status: 503 }));
  }
  return originalFetch(input, init);
};

export {};
