import { describe, expect, it } from 'vitest';

import { parseProvenance } from '../../src/lib/parse-provenance';

const FRESH = `# DESIGN.md

## Summary

Some content.

## Provenance

- Project ID: 818cf7a8-8399-4220-a507-07802d8842a8
- Design system: alphatrace
- Current artifact: deck.html
- Transcript message count: 42
- Generated UTC timestamp: 2026-05-08T11:55:00Z
`;

describe('parseProvenance', () => {
  it('returns all five fields populated for a happy-path input', () => {
    const result = parseProvenance(FRESH);
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('818cf7a8-8399-4220-a507-07802d8842a8');
    expect(result!.designSystemId).toBe('alphatrace');
    expect(result!.currentArtifact).toBe('deck.html');
    expect(result!.transcriptMessageCount).toBe(42);
    expect(result!.generatedAt).not.toBeNull();
    expect(result!.generatedAt!.toISOString()).toBe('2026-05-08T11:55:00.000Z');
  });

  it('returns null when the Provenance section is missing', () => {
    const text = `# DESIGN.md\n\n## Summary\n\nThis spec has no provenance.\n`;
    expect(parseProvenance(text)).toBeNull();
  });

  it('treats the "none" sentinel for design system as null', () => {
    const text = `## Provenance

- Project ID: abc-123
- Design system: none
- Current artifact: none
- Transcript message count: 7
- Generated UTC timestamp: 2026-05-08T00:00:00Z
`;
    const result = parseProvenance(text);
    expect(result).not.toBeNull();
    expect(result!.designSystemId).toBeNull();
    expect(result!.currentArtifact).toBeNull();
    // Other fields still populated.
    expect(result!.projectId).toBe('abc-123');
    expect(result!.transcriptMessageCount).toBe(7);
  });

  it('returns generatedAt: null when the timestamp is malformed (no throw)', () => {
    const text = `## Provenance

- Project ID: abc-123
- Design system: alphatrace
- Current artifact: deck.html
- Transcript message count: 42
- Generated UTC timestamp: not-a-date
`;
    const result = parseProvenance(text);
    expect(result).not.toBeNull();
    expect(result!.generatedAt).toBeNull();
    // Surrounding fields still populated.
    expect(result!.transcriptMessageCount).toBe(42);
  });

  // Issue #1580: the daemon's synthesis prompt does not pin field-label
  // syntax (finalize-design.ts:560-565), so Claude renders Provenance
  // fields with Markdown-bold labels per Markdown convention. The
  // pre-fix regexes' `[:\s]+` separator stops at the trailing `**`
  // after the colon, leaking `** ` into every captured value and
  // making transcriptMessageCount + generatedAt parse as null.
  it('parses bold-labelled fields with backticked values (live DESIGN.md shape)', () => {
    // Verbatim shape from a finalized DESIGN.md emitted by Claude
    // against the prod synthesis prompt. UUID + filename are
    // illustrative placeholders, not user data.
    const text = `## Provenance

- **Project ID:** \`00000000-0000-0000-0000-000000000000\`
- **Design system:** \`default\` (Neutral Modern — not applied; wireframe overrides all tokens)
- **Current artifact:** \`prototype.html\` (single-file, 1,922 lines, 57KB)
- **Transcript message count:** 4
- **Generated UTC timestamp:** 2026-05-13T12:27:21.499Z
`;
    const result = parseProvenance(text);
    expect(result).not.toBeNull();
    // Backticks may remain in the captured value (out of scope to
    // strip per #1580 spec); the `** ` Markdown-bold prefix must not.
    expect(result!.projectId).toBe('`00000000-0000-0000-0000-000000000000`');
    expect(result!.designSystemId).toBe('`default` (Neutral Modern — not applied; wireframe overrides all tokens)');
    expect(result!.currentArtifact).toBe('`prototype.html` (single-file, 1,922 lines, 57KB)');
    expect(result!.transcriptMessageCount).toBe(4);
    expect(result!.generatedAt).not.toBeNull();
    expect(result!.generatedAt!.toISOString()).toBe('2026-05-13T12:27:21.499Z');
  });

  it('parses bold-labelled fields with plain values and a short "Generated:" label', () => {
    const text = `## Provenance

- **Project ID:** abc-123
- **Design system:** my-system
- **Current artifact:** deck.html
- **Transcript message count:** 12
- **Generated:** 2026-05-08T11:55:00Z
`;
    const result = parseProvenance(text);
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('abc-123');
    expect(result!.designSystemId).toBe('my-system');
    expect(result!.currentArtifact).toBe('deck.html');
    expect(result!.transcriptMessageCount).toBe(12);
    expect(result!.generatedAt).not.toBeNull();
    expect(result!.generatedAt!.toISOString()).toBe('2026-05-08T11:55:00.000Z');
  });

  it('still treats "none" as the null sentinel after the bold-label prefix is stripped', () => {
    const text = `## Provenance

- **Project ID:** abc-123
- **Design system:** none
- **Current artifact:** none
- **Transcript message count:** 7
- **Generated UTC timestamp:** 2026-05-08T00:00:00Z
`;
    const result = parseProvenance(text);
    expect(result).not.toBeNull();
    expect(result!.projectId).toBe('abc-123');
    // NONE_SENTINEL must trip on the value after emphasis is stripped,
    // otherwise "** none" leaks through as a real design-system id.
    expect(result!.designSystemId).toBeNull();
    expect(result!.currentArtifact).toBeNull();
    expect(result!.transcriptMessageCount).toBe(7);
    expect(result!.generatedAt).not.toBeNull();
  });
});
