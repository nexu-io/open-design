import { runPinnedVelaCommand } from '../../src/collab/vela-pinned-command.js';
process.on('message', () => {}); // Keep the owned fixture alive until the test kills it.
await runPinnedVelaCommand({
  args: ['fixture'], dataRoot: process.argv[2]!, workspaceId: 'fixture',
  session: { profile: 'test', apiUrl: 'https://fixture.invalid', controlKey: 'synthetic-only', user: null, configMtimeMs: null },
}, async (_args, options) => {
  process.send?.({ home: options?.configuredEnv?.AMR_HOME });
  return new Promise<string>(() => {});
});
