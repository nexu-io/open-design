import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';

// Explicit opt-in RED diagnostic. Not in the normal focused/CI test lane and
// never reported as GREEN acceptance. Run from apps/daemon with this config.
export default defineConfig({ ...base, test: { ...base.test,
  include: ['tests/comment-file-agent-lifetime.witness.ts'],
} });
