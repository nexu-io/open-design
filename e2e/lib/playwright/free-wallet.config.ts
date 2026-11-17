import base from './funding.config.ts';

// This lane owns separate traces for both real Owner browser contexts.
export default { ...base, testMatch: 'workspace-free-wallet-sandbox.test.ts',
  use: { ...base.use, trace: 'off' as const } };
