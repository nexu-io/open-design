// @vitest-environment node

import { afterAll } from 'vitest';
import './desktop-settings.spec.js';
import './legacy-migration.spec.js';
import { macFocusWitness } from './lib/context.js';
import './onboarding.spec.js';
import './shell-lifecycle.spec.js';
import './shell-rollback.spec.js';
import './shell-silent-update.spec.js';
import './standalone-closure.spec.js';

afterAll(async () => {
  if (macFocusWitness == null) return;
  try {
    await macFocusWitness.assertNeverFrontmost();
  } finally {
    await macFocusWitness.stop();
  }
}, 10_000);
