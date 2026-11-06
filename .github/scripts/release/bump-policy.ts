import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = 'nexu-io/open-design';
const BOT = 'open-design-release-bot[bot]';
const manifestPath = /^(?:package\.json|e2e\/package\.json|(?:apps|packages|tools)\/[^/]+\/package\.json)$/;
type Entry = { mode: string; type: string; oid: string; path: string };
type Pull = {
  number: number; node_id: string; state: string; draft: boolean; user: { login: string };
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { sha: string; ref: string; repo: { full_name: string } };
  labels: Array<{ name: string }>;
};

function command(bin: string, args: string[]): string {
  return execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 60_000 });
}
function api<T>(path: string): T { return JSON.parse(command('gh', ['api', path])) as T; }
function git(...args: string[]): string { return command('git', args); }
function sha(value: string): string {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error('Invalid commit SHA');
  return value;
}
export function nextPatch(version: string): string {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Invalid stable version');
  const [major, minor, patch] = version.split('.');
  return `${major}.${minor}.${BigInt(patch!) + 1n}`;
}
export function eligibleIdentity(pr: Pull, version: string): boolean {
  return pr.state === 'open' && !pr.draft && pr.user.login === BOT
    && pr.base.ref === 'main' && pr.base.repo.full_name === REPO && pr.head.repo?.full_name === REPO
    && pr.head.ref === `release-bot/bump-main-v${nextPatch(version)}`
    && !pr.labels.some(({ name }) => /^(hold|do-not-merge|blocked)$/i.test(name));
}
function tree(ref: string): Map<string, Entry> {
  return new Map(git('ls-tree', '-r', '-z', ref).split('\0').filter(Boolean).map(line => {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/.exec(line);
    if (!match) throw new Error('Invalid tree entry');
    const entry = { mode: match[1]!, type: match[2]!, oid: match[3]!, path: match[4]! };
    return [entry.path, entry];
  }));
}
function blob(entry: Entry | undefined): string {
  if (!entry || entry.type !== 'blob' || entry.mode !== '100644') throw new Error('Expected regular manifest');
  return git('cat-file', 'blob', entry.oid);
}

/** Compare whole Git trees and exact npm output, never execute anything from the PR. */
export function validateBumpTree(base: string, head: string, version: string): number {
  const before = tree(sha(base));
  const after = tree(sha(head));
  if (JSON.parse(blob(before.get('package.json'))).version !== version
    || JSON.parse(blob(before.get('apps/packaged/package.json'))).version !== version) {
    throw new Error('Base versions do not match the published stable');
  }
  const next = nextPatch(version);
  const expected = new Set<string>();
  for (const [path, entry] of before) {
    if (!manifestPath.test(path)) continue;
    const source = JSON.parse(blob(entry)) as Record<string, unknown>;
    if (source.version !== version) continue;
    expected.add(path);
    source.version = next;
    if (blob(after.get(path)) !== `${JSON.stringify(source, null, 2)}\n`) {
      throw new Error(`Not an exact version-only bump: ${path}`);
    }
  }
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter(path => {
    const a = before.get(path), b = after.get(path);
    return a?.oid !== b?.oid || a?.mode !== b?.mode || a?.type !== b?.type;
  });
  if (changed.length !== expected.size || changed.some(path => !expected.has(path))) {
    throw new Error('Changed tree includes files outside the synchronized version bump');
  }
  return expected.size;
}

type Review = { reviewDecision: string; mergeable: string; mergeQueueEntry: { position: number } | null;
  timelineItems?: { nodes: Array<{ beforeCommit: { oid: string } | null; reason: string | null }> };
  reviewThreads: { nodes: Array<{ isResolved: boolean }>; pageInfo: { hasNextPage: boolean } };
  commits: { nodes: Array<{ commit: { statusCheckRollup: { contexts: {
    nodes: Array<{ name?: string; status?: string; conclusion?: string; state?: string }>;
    pageInfo: { hasNextPage: boolean };
  } } | null } }> };
};
export function validationBlocker(review: Review): string | null {
  if (review.timelineItems?.nodes.length) return '曾被移出合并队列，需要人工检查失败或移除原因后再入队';
  if (review.reviewDecision === 'CHANGES_REQUESTED') return '等待处理审查意见';
  if (review.mergeable !== 'MERGEABLE') return '等待确认合并冲突状态';
  if (review.reviewThreads.pageInfo.hasNextPage || review.reviewThreads.nodes.some(t => !t.isResolved)) return '等待解决审查讨论';
  const contexts = review.commits.nodes[0]?.commit.statusCheckRollup?.contexts;
  if (!contexts || contexts.pageInfo.hasNextPage) return '检查结果不完整';
  if (!contexts.nodes.some(c => c.name === 'Validate workspace' && c.status === 'COMPLETED' && c.conclusion === 'SUCCESS')) return '等待 Validate workspace 通过';
  if (contexts.nodes.some(c => c.state ? c.state !== 'SUCCESS' : c.status !== 'COMPLETED' || !['SUCCESS', 'SKIPPED', 'NEUTRAL'].includes(c.conclusion ?? ''))) return '等待 CI 通过；失败由发布助手诊断，禁止跳过';
  return null;
}
function review(number: number): Review {
  const query = `query { repository(owner:"nexu-io",name:"open-design") { pullRequest(number:${number}) {
    reviewDecision mergeable mergeQueueEntry { position }
    timelineItems(last:100,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT]) {
      nodes { ... on RemovedFromMergeQueueEvent { beforeCommit { oid } reason } }
    }
    reviewThreads(first:100) { nodes { isResolved } pageInfo { hasNextPage } }
    commits(last:1) { nodes { commit { statusCheckRollup { contexts(first:100) {
      nodes { ... on CheckRun { name status conclusion } ... on StatusContext { state } }
      pageInfo { hasNextPage }
    } } } } }
  } } }`;
  const result = JSON.parse(command('gh', ['api', 'graphql', '-f', `query=${query}`]));
  if (result.errors) throw new Error('Could not read review/check state');
  return result.data.repository.pullRequest;
}

export function followBump(apply: boolean): void {
  const release = api<{ tag_name: string; draft: boolean; prerelease: boolean }>(`repos/${REPO}/releases/latest`);
  if (release.draft || release.prerelease || !release.tag_name.startsWith('open-design-v')) throw new Error('No published stable');
  const version = release.tag_name.slice('open-design-v'.length);
  const branch = `release-bot/bump-main-v${nextPatch(version)}`;
  const prs = api<Pull[]>(`repos/${REPO}/pulls?state=open&base=main&head=nexu-io:${encodeURIComponent(branch)}&per_page=100`);
  if (!prs.length) { console.log('No open bump PR; nothing to do.'); return; }
  if (prs.length !== 1) throw new Error('Expected one exact bump PR');
  const pr = api<Pull>(`repos/${REPO}/pulls/${prs[0]!.number}`);
  if (!eligibleIdentity(pr, version)) throw new Error('Not an eligible release bot bump PR');
  const state = review(pr.number);
  if (state.mergeQueueEntry) { console.log(`Already queued at ${state.mergeQueueEntry.position}`); return; }
  git('fetch', '--no-tags', 'origin', sha(pr.base.sha), sha(pr.head.sha));
  const base = git('merge-base', sha(pr.base.sha), sha(pr.head.sha)).trim();
  const count = validateBumpTree(base, pr.head.sha, version);
  // A different release may already have advanced main since the PR was opened.
  const current = tree(pr.base.sha);
  for (const path of ['package.json', 'apps/packaged/package.json']) {
    if (JSON.parse(blob(current.get(path))).version !== version) throw new Error('Main has already advanced; human reconciliation required');
  }
  const blocker = validationBlocker(state);
  console.log(JSON.stringify({ pr: pr.number, head: pr.head.sha, manifests: count, pureVersionBump: true, blocker, apply }));
  if (blocker || !apply) return;
  // Pin both the live policy inputs and the queue mutation to the inspected head.
  const fresh = api<Pull>(`repos/${REPO}/pulls/${pr.number}`);
  if (!eligibleIdentity(fresh, version) || fresh.head.sha !== pr.head.sha || fresh.base.sha !== pr.base.sha) throw new Error('PR changed during validation');
  const latest = api<{ tag_name: string }>(`repos/${REPO}/releases/latest`);
  if (latest.tag_name !== release.tag_name) throw new Error('Stable advanced during validation');
  const finalState = review(pr.number);
  if (finalState.mergeQueueEntry) return;
  const finalBlocker = validationBlocker(finalState);
  if (finalBlocker) throw new Error(finalBlocker);
  const query = 'mutation($id:ID!,$head:GitObjectID!){enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$head,jump:false}){mergeQueueEntry{position}}}';
  if (!process.env.BUMP_QUEUE_TOKEN) throw new Error('Dedicated release App token is required to enqueue');
  const queued = JSON.parse(execFileSync('gh', ['api', 'graphql', '-f', `query=${query}`, '-f', `id=${pr.node_id}`, '-f', `head=${pr.head.sha}`], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, GH_TOKEN: process.env.BUMP_QUEUE_TOKEN },
  }));
  if (queued.errors || !queued.data?.enqueuePullRequest?.mergeQueueEntry) throw new Error('Enqueue failed; no direct-merge fallback');
  console.log(JSON.stringify({ pr: pr.number, queued: queued.data.enqueuePullRequest.mergeQueueEntry }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) followBump(process.argv.includes('--apply'));
