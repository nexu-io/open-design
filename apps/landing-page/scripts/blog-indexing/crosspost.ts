/*
 * crosspost — token-gated scaffold for publishing canonical copies to
 * high-discovery platforms when a post stalls or needs distribution.
 *
 * Dry-run by default. It only sends network writes when BOTH are true:
 *   - --publish is passed
 *   - platform token exists (DEVTO_API_KEY / HASHNODE_TOKEN)
 *
 * Usage:
 *   tsx crosspost.ts --url https://open-design.ai/blog/foo/ --platform devto
 *   tsx crosspost.ts --url https://open-design.ai/blog/foo/ --platform devto --publish
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BLOG_DIR, SITE, fetchWithRetry, slugFromUrl } from './lib.ts';

interface Args {
  url: string;
  platform: 'devto' | 'hashnode';
  publish: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { platform: 'devto', publish: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--platform') args.platform = argv[++i] as Args['platform'];
    else if (argv[i] === '--publish') args.publish = true;
  }
  if (!args.url) throw new Error('--url is required');
  if (!['devto', 'hashnode'].includes(args.platform!)) {
    throw new Error('--platform must be devto or hashnode');
  }
  return args as Args;
}

function parsePost(url: string): { title: string; summary: string; body: string; tags: string[] } {
  const slug = slugFromUrl(url);
  const raw = readFileSync(path.join(BLOG_DIR, `${slug}.md`), 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`No frontmatter for ${slug}`);
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return {
    title: data.title ?? slug,
    summary: data.summary ?? '',
    body: match[2].replace(/\]\(\//g, `](${SITE}/`),
    tags: ['ai', 'design', 'opensource', 'agents'],
  };
}

async function publishDevTo(url: string, post: ReturnType<typeof parsePost>, publish: boolean) {
  const token = process.env.DEVTO_API_KEY;
  const payload = {
    article: {
      title: post.title,
      body_markdown: `${post.body}\n\n---\n\nOriginally published at ${url}`,
      published: publish,
      canonical_url: url,
      description: post.summary,
      tags: post.tags,
    },
  };
  if (!publish || !token) return { dryRun: true, platform: 'devto', payload };
  const res = await fetchWithRetry('https://dev.to/api/articles', {
    method: 'POST',
    headers: {
      'api-key': token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return { dryRun: false, platform: 'devto', status: res.status, body: await res.text() };
}

async function publishHashnode(url: string, post: ReturnType<typeof parsePost>, publish: boolean) {
  const token = process.env.HASHNODE_TOKEN;
  const publicationId = process.env.HASHNODE_PUBLICATION_ID;
  const mutation = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) { post { id url } }
    }
  `;
  const variables = {
    input: {
      publicationId,
      title: post.title,
      contentMarkdown: `${post.body}\n\n---\n\nOriginally published at ${url}`,
      tags: post.tags.map((name) => ({ name, slug: name })),
      originalArticleURL: url,
    },
  };
  if (!publish || !token || !publicationId) {
    return { dryRun: true, platform: 'hashnode', mutation, variables };
  }
  const res = await fetchWithRetry('https://gql.hashnode.com/', {
    method: 'POST',
    headers: {
      authorization: token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query: mutation, variables }),
  });
  return { dryRun: false, platform: 'hashnode', status: res.status, body: await res.text() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url.startsWith(`${SITE}/blog/`)) {
    throw new Error(`Refusing to cross-post off-site URL: ${args.url}`);
  }
  const post = parsePost(args.url);
  const result =
    args.platform === 'devto'
      ? await publishDevTo(args.url, post, args.publish)
      : await publishHashnode(args.url, post, args.publish);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
