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
});
