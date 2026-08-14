export const packagedVelaStatusExpression = `
  (async () => {
    const response = await fetch('/api/integrations/vela/status');
    return {
      body: await response.json(),
      status: response.status,
    };
  })()
`;

export function assertPackagedVelaRuntimeStatus(value: unknown): void {
  if (
    typeof value !== 'object'
    || value == null
    || !('status' in value)
    || value.status !== 200
  ) {
    throw new Error(`packaged Vela runtime is unavailable: ${JSON.stringify(value)}`);
  }
}
