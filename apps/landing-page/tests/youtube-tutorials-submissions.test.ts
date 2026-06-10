import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  fetchContributionPRs,
  fetchSubmissionIssues,
} from '../scripts/youtube-tutorials/github-submissions.ts';

const realFetch = globalThis.fetch;

function stub(items: unknown[]) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

const ISSUE = {
  number: 12,
  title: '[Tutorial]: My OD walkthrough',
  html_url: 'https://github.com/nexu-io/open-design/issues/12',
  user: { login: 'alice' },
  body: 'YouTube video URL\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nCategory\nTutorial',
};
const PR = {
  number: 34,
  title: 'content(landing): add my tutorial',
  html_url: 'https://github.com/nexu-io/open-design/pull/34',
  user: { login: 'bob' },
  pull_request: { url: 'x' },
};

describe('github-submissions', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fetchSubmissionIssues keeps issues only and extracts the video URL', async () => {
    stub([ISSUE, PR]);
    const issues = await fetchSubmissionIssues('tok', 'nexu-io/open-design');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].number, 12);
    assert.equal(issues[0].author, 'alice');
    assert.equal(issues[0].videoUrl, 'https://youtu.be/dQw4w9WgXcQ');
  });

  it('fetchSubmissionIssues leaves videoUrl undefined when none in body', async () => {
    stub([{ ...ISSUE, body: 'no link here' }]);
    const issues = await fetchSubmissionIssues('tok', 'nexu-io/open-design');
    assert.equal(issues[0].videoUrl, undefined);
  });

  it('extracts shorts and mobile-watch URLs (canonicalized to youtu.be)', async () => {
    stub([
      { ...ISSUE, number: 1, body: 'link: https://www.youtube.com/shorts/dQw4w9WgXcQ' },
      { ...ISSUE, number: 2, body: 'link: https://m.youtube.com/watch?v=abcdef12345' },
    ]);
    const issues = await fetchSubmissionIssues('tok', 'nexu-io/open-design');
    assert.equal(issues.find((i) => i.number === 1)?.videoUrl, 'https://youtu.be/dQw4w9WgXcQ');
    assert.equal(issues.find((i) => i.number === 2)?.videoUrl, 'https://youtu.be/abcdef12345');
  });

  it('ignores non-YouTube and lookalike hosts (substring spoofing)', async () => {
    for (const body of [
      'link: https://example.com/watch?v=dQw4w9WgXcQ',
      'link: https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'link: https://evil-youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      stub([{ ...ISSUE, body }]);
      const issues = await fetchSubmissionIssues('tok', 'nexu-io/open-design');
      assert.equal(issues[0].videoUrl, undefined, body);
    }
  });

  it('propagates (does not swallow) a failed search so the caller can abort', async () => {
    globalThis.fetch = (async () =>
      new Response('rate limited', { status: 403 })) as typeof fetch;
    await assert.rejects(() => fetchSubmissionIssues('tok', 'nexu-io/open-design'), /HTTP 403/);
  });

  it('paginates: full first page then a partial page (no silent truncation)', async () => {
    const issue = (n: number) => ({ ...ISSUE, number: n, body: 'no link' });
    globalThis.fetch = (async (input: string | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      const page = Number(new URL(url).searchParams.get('page'));
      const items = page === 1 ? Array.from({ length: 100 }, (_, i) => issue(i + 1)) : [issue(101)];
      return new Response(JSON.stringify({ items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const issues = await fetchSubmissionIssues('tok', 'nexu-io/open-design');
    assert.equal(issues.length, 101);
  });

  it('fetchContributionPRs keeps PRs only', async () => {
    stub([ISSUE, PR]);
    const prs = await fetchContributionPRs('tok', 'nexu-io/open-design');
    assert.equal(prs.length, 1);
    assert.equal(prs[0].number, 34);
    assert.equal(prs[0].author, 'bob');
  });
});
