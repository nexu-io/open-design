// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { artifactCardLiveUrl } from '../../src/components/FileOpsSummary';

const PROJECT_ID = 'project-1';
const ARTIFACT = 'proposal.html';

/**
 * OPEND-2769 red spec: the HTML fallback is an already-mounted iframe. When
 * the same project-relative file is overwritten, its URL must carry the file
 * revision (or an equivalent cache identity) so the browser cannot keep the
 * old document until a full page refresh.
 */
describe('OPEND-2769 artifact card cache identity', () => {
  it('gives the live HTML fallback a revision/cache identity', () => {
    const src = artifactCardLiveUrl(`/api/projects/${PROJECT_ID}/raw/${ARTIFACT}`, 1234);

    expect(src).toMatch(/[?&](?:v|mtime|revision|rev)=/);
  });
});
