import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '@open-design/plugin-runtime';

// The pitch-deck example's prompt instructs the agent to "confirm three
// things first" — name + one-line pitch, key traction numbers, ask + use
// of funds — but until #2215 those facts existed only as English prose
// inside the prompt. The platform's required-input gate at apply time
// (apps/daemon/src/plugins/apply.ts:validateInputs) has nothing structured
// to enforce in that shape, so an agent could route through od-default
// and start generating with no facts collected. This test pins the three
// facts as structured `od.inputs` fields so the gate fires before any
// HTML/deck artifact is written.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const manifestPath = path.join(
  repoRoot,
  'plugins/_official/examples/html-ppt-pitch-deck/open-design.json',
);

describe('html-ppt-pitch-deck manifest inputs', () => {
  it('declares the financing facts the example prompt says must be confirmed first', async () => {
    const parsed = parseManifest(await readFile(manifestPath, 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const inputs = parsed.manifest.od?.inputs ?? [];
    const requiredNames = inputs
      .filter((input) => input.required === true)
      .map((input) => input.name);

    expect(requiredNames).toEqual(
      expect.arrayContaining([
        'one_line_pitch',
        'key_traction_numbers',
        'ask_and_use_of_funds',
      ]),
    );

    for (const name of [
      'one_line_pitch',
      'key_traction_numbers',
      'ask_and_use_of_funds',
    ]) {
      const input = inputs.find((candidate) => candidate.name === name);
      expect(input).toMatchObject({
        type: 'text',
        required: true,
      });
      expect(input?.label).toEqual(expect.any(String));
      expect(input?.label?.trim()).not.toBe('');
    }
  });
});
