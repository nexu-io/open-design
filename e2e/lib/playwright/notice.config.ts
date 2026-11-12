import base from './funding.config.ts';

// Actual VIEW-020 role fixtures use the same canonical owner runner/lifecycle.
export default { ...base, testMatch: 'workspace-notice-sandbox.test.ts' };
