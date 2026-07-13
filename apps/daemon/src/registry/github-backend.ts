import type { MarketplaceManifest } from '@open-design/contracts';
import type {
  RegistryPublishOutcome,
  RegistryPublishRequest,
  RegistryYankOutcome,
} from '@open-design/registry-protocol';
import { StaticRegistryBackend } from './static-backend.js';

export interface GithubRegistryClient {
  readMarketplace(owner: string, repo: string, ref: string, path: string): Promise<MarketplaceManifest>;
  createPublishPullRequest?(request: GithubPublishMutation): Promise<{ url: string }>;
}

export interface GithubPublishMutation {
  owner: string;
  repo: string;
  baseRef: string;
  branchName: string;
  title: string;
  body: string;
  files: Array<{ path: string; content: string }>;
}

export interface GithubRegistryBackendOptions {
  id: string;
  owner: string;
  repo: string;
  ref?: string;
  marketplacePath?: string;
  client: GithubRegistryClient;
}

export class GithubRegistryBackend extends StaticRegistryBackend {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string;
  readonly marketplacePath: string;
  readonly client: GithubRegistryClient;

  private constructor(options: GithubRegistryBackendOptions & { manifest: MarketplaceManifest }) {
    super({
      id: options.id,
      kind: 'github',
      trust: 'official',
      manifest: options.manifest,
    });
    this.owner = options.owner;
    this.repo = options.repo;
    this.ref = options.ref ?? 'main';
    this.marketplacePath = options.marketplacePath ?? 'plugins/registry/official/open-design-marketplace.json';
    this.client = options.client;
  }

  static async create(options: GithubRegistryBackendOptions): Promise<GithubRegistryBackend> {
    const ref = options.ref ?? 'main';
    const marketplacePath = options.marketplacePath ?? 'plugins/registry/official/open-design-marketplace.json';
    const manifest = await options.client.readMarketplace(
      options.owner,
      options.repo,
      ref,
      marketplacePath,
    );
    return new GithubRegistryBackend({ ...options, ref, marketplacePath, manifest });
  }

  async publish(request: RegistryPublishRequest): Promise<RegistryPublishOutcome> {
    const [vendor, name] = request.entry.name.split('/');
    const version = request.entry.version;
    const root = `plugins/${vendor}/${name}`;
    const files = [
      {
        path: `${root}/entry.json`,
        content: JSON.stringify(request.entry, null, 2) + '\n',
      },
      {
        path: `${root}/versions/${version}.json`,
        content: JSON.stringify({
          ...request.entry,
          publishedAt: new Date().toISOString(),
          tag: request.tag ?? 'latest',
        }, null, 2) + '\n',
      },
    ];

    if (request.dryRun || !this.client.createPublishPullRequest) {
      return {
        ok: true,
        dryRun: true,
        changedFiles: files.map((file) => file.path),
        warnings: this.client.createPublishPullRequest
          ? []
          : ['github mutation client unavailable; emitted dry-run payload only'],
      };
    }

    const mutation: GithubPublishMutation = {
      owner: this.owner,
      repo: this.repo,
      baseRef: this.ref,
      branchName: `publish/${vendor}-${name}-${version}`,
      title: `Add ${request.entry.name}@${version}`,
      body: renderPublishBody(request),
      files,
    };
    const pr = await this.client.createPublishPullRequest(mutation);
    return {
      ok: true,
      dryRun: false,
      pullRequestUrl: pr.url,
      changedFiles: files.map((file) => file.path),
      warnings: [],
    };
  }

  async yank(name: string, version: string, reason: string): Promise<RegistryYankOutcome> {
    const [vendor, pluginName] = name.split('/');
    const path = `plugins/${vendor}/${pluginName}/versions/${version}.json`;
    if (!this.client.createPublishPullRequest) {
      return {
        ok: true,
        name,
        version,
        reason,
        warnings: ['github mutation client unavailable; emitted dry-run yank only'],
      };
    }
    const mutation: GithubPublishMutation = {
      owner: this.owner,
      repo: this.repo,
      baseRef: this.ref,
      branchName: `yank/${vendor}-${pluginName}-${version}`,
      title: `Yank ${name}@${version}`,
      body: `Yank ${name}@${version}\n\nReason: ${reason}\n`,
      files: [
        {
          path,
          content: JSON.stringify({
            name,
            version,
            yanked: true,
            yankedAt: new Date().toISOString(),
            yankReason: reason,
          }, null, 2) + '\n',
        },
      ],
    };
    const pr = await this.client.createPublishPullRequest(mutation);
    return { ok: true, name, version, reason, pullRequestUrl: pr.url, warnings: [] };
  }
}

function renderPublishBody(request: RegistryPublishRequest): string {
  return [
    `Publish ${request.entry.name}@${request.entry.version}`,
    '',
    request.entry.description ?? '',
    '',
    '## Registry metadata',
    '',
    `- source: ${request.entry.source}`,
    `- integrity: ${request.entry.integrity ?? request.entry.dist?.integrity ?? '(pending)'}`,
    `- manifestDigest: ${request.entry.manifestDigest ?? request.entry.dist?.manifestDigest ?? '(pending)'}`,
    `- capabilities: ${(request.entry.capabilitiesSummary ?? []).join(', ') || '(none declared)'}`,
    request.changelog ? `\n## Changelog\n\n${request.changelog}` : '',
  ].filter(Boolean).join('\n');
}
