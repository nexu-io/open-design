import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { detectAvailability } from '../src/claude-code/reader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES = path.join(__dirname, 'fixtures');

describe('detectAvailability', () => {
  it('returns false when the home dir does not exist', () => {
    expect(detectAvailability(path.join(FIXTURES, 'claude-home-does-not-exist'))).toBe(false);
  });

  it('returns true when the home dir exists', () => {
    expect(detectAvailability(path.join(FIXTURES, 'claude-home-empty'))).toBe(true);
  });
});
