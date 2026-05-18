# PRD: Coolify Publishing Provider

## Overview

Add Coolify as a third publishing provider alongside Vercel and Cloudflare Pages. The user authenticates the GitHub CLI (`gh`) once outside Open Design; Open Design uses it to push the design file bundle to a private GitHub repo, then triggers a Coolify redeploy via its REST API.

This document is self-contained. An implementer should be able to complete the feature by reading only this file plus the source files named below.

---

## Background: how the existing deploy system works

Read these files before touching anything:

- `packages/contracts/src/api/projects.ts` lines 251–441 — all deploy-related TypeScript contracts
- `apps/daemon/src/deploy.ts` — all backend deploy logic; study the Vercel sections as the reference pattern
- `apps/daemon/src/deploy-routes.ts` — HTTP route handlers for `/api/deploy/*` and `/api/projects/:id/deploy*`
- `apps/web/src/providers/registry.ts` lines 47–888 — provider ID constants, web types, API client functions
- `apps/web/src/components/FileViewer.tsx` lines 125–250 (provider option definitions), 3490–3520 (state), 3719–3800 (`syncDeployFormFromConfig`, `buildDeployConfigRequest`), 5012–5145 (`openDeployModal`, `changeDeployProvider`, `deployToSelectedProvider`), 5860–5900 (share menu), 6300–6570 (deploy modal JSX)
- `apps/web/src/i18n/types.ts` lines 1332–1395 — deploy i18n key definitions
- `apps/web/src/i18n/locales/en.ts` — English values for the existing keys

The provider system is additive: each new provider requires parallel changes across contracts, daemon, web registry, FileViewer, and all 18 i18n locale files.

---

## Decisions (non-negotiable)

| Decision | Value |
|---|---|
| Provider ID | `'coolify'` |
| Config file | `~/.open-design/coolify.json` |
| File permissions | `0o600` (same as Vercel/Cloudflare) |
| Token mask | `'saved-coolify-token'` |
| Git host | GitHub only, via authenticated `gh` CLI |
| GitHub repo visibility | Private by default; user can opt into public via checkbox |
| Repo name | Auto-generated: `od-` + kebab-cased project title, max 40 chars, trimmed of leading/trailing hyphens. Stored in config and editable in the form before first deploy. After first deploy the field becomes read-only (reconnect by clearing config). |
| `publish_directory` | Always `"/"` — hardcoded, not user-configurable |
| Deploy polling | Poll `GET {instanceUrl}/api/v1/deployments/{deployment_uuid}` every 3 s, up to 60 retries. Map to Open Design `DeploymentStatus`. Resolve live URL from `GET {instanceUrl}/api/v1/applications/{appUuid}` → `fqdn`. |
| Coolify application creation | Programmatic on first deploy via `POST {instanceUrl}/api/v1/applications/public`. Requires the user to provide server UUID and project UUID in the config form. |

---

## 1. Contracts (`packages/contracts/src/api/projects.ts`)

### 1a. Extend `DeployProviderId`

**Current (line 251):**
```typescript
export type DeployProviderId = 'vercel-self' | 'cloudflare-pages';
```

**Replace with:**
```typescript
export type DeployProviderId = 'vercel-self' | 'cloudflare-pages' | 'coolify';
```

### 1b. Add `CoolifyConfigHints` interface

Add after `CloudflarePagesDeploymentInfo` (after line 344):

```typescript
export interface CoolifyConfigHints {
  instanceUrl?: string;
  appUuid?: string;
  serverUuid?: string;
  projectUuid?: string;
  githubRepo?: string;   // "owner/repo" format; empty string before first deploy
  branch?: string;       // default "main"
  publicRepo?: boolean;  // default false
}
```

### 1c. Extend `DeployConfigResponse`

Add an optional field to the existing interface (after `cloudflarePages?`):

```typescript
coolify?: CoolifyConfigHints;
```

### 1d. Extend `UpdateDeployConfigRequest`

Add an optional field:

```typescript
coolify?: CoolifyConfigHints;
```

### 1e. Extend `DeployProjectFileRequest`

No change needed — `providerId` already covers Coolify.

---

## 2. Daemon config and deploy logic (`apps/daemon/src/deploy.ts`)

### 2a. Add provider constant

After `CLOUDFLARE_PAGES_PROVIDER_ID` (line 10):

```typescript
export const COOLIFY_PROVIDER_ID = 'coolify';
export const SAVED_COOLIFY_TOKEN_MASK = 'saved-coolify-token';
```

### 2b. Extend the local `DeployProviderId` type (line 15)

```typescript
type DeployProviderId =
  | typeof VERCEL_PROVIDER_ID
  | typeof CLOUDFLARE_PAGES_PROVIDER_ID
  | typeof COOLIFY_PROVIDER_ID;
```

### 2c. Extend `DeployConfig` type (starting line 17)

Add optional coolify fields to the existing `DeployConfig` type:

```typescript
type DeployConfig = {
  token: string;
  teamId?: string;
  teamSlug?: string;
  accountId?: string;
  projectName?: string;
  cloudflarePages?: CloudflarePagesConfigHints | undefined;
  // Coolify-specific
  coolify?: {
    instanceUrl: string;
    appUuid: string;
    serverUuid: string;
    projectUuid: string;
    githubRepo: string;   // "owner/repo"; empty string before first deploy
    branch: string;       // default "main"
    publicRepo: boolean;  // default false
  };
};
```

### 2d. Extend `deployConfigPath` (line 71)

```typescript
export function deployConfigPath(providerId: DeployProviderId = VERCEL_PROVIDER_ID) {
  const base = deployConfigDir();
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return path.join(base, 'cloudflare-pages.json');
  if (providerId === COOLIFY_PROVIDER_ID) return path.join(base, 'coolify.json');
  return path.join(base, 'vercel.json');
}
```

### 2e. Add `readCoolifyConfig` and `writeCoolifyConfig`

Model directly on `readVercelConfig` / `writeVercelConfig`. Key differences:

- **`readCoolifyConfig`**: reads `coolify.json`; on `ENOENT` returns empty config with `coolify: { instanceUrl: '', appUuid: '', serverUuid: '', projectUuid: '', githubRepo: '', branch: 'main', publicRepo: false }`.
- **`writeCoolifyConfig(input)`**: merges `input.coolify` into current `coolify.json`; masks `token` as `SAVED_COOLIFY_TOKEN_MASK` before returning the public config.

### 2f. Extend `readDeployConfig` and `writeDeployConfig` dispatch (lines 183, 188)

```typescript
export async function readDeployConfig(providerId: DeployProviderId = VERCEL_PROVIDER_ID) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return readCloudflarePagesConfig();
  if (providerId === COOLIFY_PROVIDER_ID) return readCoolifyConfig();
  return readVercelConfig();
}

export async function writeDeployConfig(
  providerId: DeployProviderId = VERCEL_PROVIDER_ID,
  input: Partial<DeployConfig> = {},
) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return writeCloudflarePagesConfig(input);
  if (providerId === COOLIFY_PROVIDER_ID) return writeCoolifyConfig(input);
  return writeVercelConfig(input);
}
```

### 2g. Extend `publicDeployConfigForProvider` (line 193)

```typescript
export function publicDeployConfigForProvider(
  providerId: DeployProviderId = VERCEL_PROVIDER_ID,
  config: Partial<DeployConfig> = {},
) {
  if (providerId === CLOUDFLARE_PAGES_PROVIDER_ID) return publicCloudflarePagesConfig(config);
  if (providerId === COOLIFY_PROVIDER_ID) return publicCoolifyConfig(config);
  return publicDeployConfig(config);
}
```

Add `publicCoolifyConfig`:

```typescript
export function publicCoolifyConfig(config: Partial<DeployConfig>) {
  return {
    providerId: COOLIFY_PROVIDER_ID,
    configured: Boolean(config.token && config.coolify?.instanceUrl && config.coolify?.appUuid),
    tokenMask: config.token ? SAVED_COOLIFY_TOKEN_MASK : '',
    teamId: '',
    teamSlug: '',
    target: 'preview' as const,
    coolify: {
      instanceUrl: config.coolify?.instanceUrl ?? '',
      appUuid: config.coolify?.appUuid ?? '',
      serverUuid: config.coolify?.serverUuid ?? '',
      projectUuid: config.coolify?.projectUuid ?? '',
      githubRepo: config.coolify?.githubRepo ?? '',
      branch: config.coolify?.branch ?? 'main',
      publicRepo: config.coolify?.publicRepo ?? false,
    },
  };
}
```

### 2h. Add Coolify deploy functions

Add a new section after the Cloudflare Pages section. All functions are internal unless exported.

#### `checkGhAuth(): Promise<void>`

Shells out `gh auth status --hostname github.com`. Throws a descriptive `Error` if exit code is non-zero. Error message: `"GitHub CLI (gh) is not authenticated. Run: gh auth login"`.

Use Node's `child_process.execFile` (promisified) — do not use `exec` to avoid shell injection. Timeout: 10 s.

#### `generateGithubRepoName(projectTitle: string): string`

1. Lowercase the title.
2. Replace any non-alphanumeric characters with `-`.
3. Collapse consecutive hyphens to one.
4. Trim leading and trailing hyphens.
5. Prefix with `od-`.
6. Truncate total length to 40 characters, then re-trim trailing hyphens.
7. If the result after truncation is `od-` or shorter, fall back to `od-project`.

#### `ensureGithubRepo(repoName: string, publicRepo: boolean): Promise<string>`

Checks if the repo already exists with `gh repo view {repoName} --json name`. If it does, returns `repoName` unchanged. If it does not exist (non-zero exit), creates it with:

```
gh repo create {repoName} --{private|public} --description "Open Design deployment repo"
```

Returns `repoName` (format `owner/repo` — `gh repo create` outputs the full name; capture and return it).

Timeout: 30 s per shell call. Throws on failure with the stderr text.

#### `pushFilesToGithub(repo: string, branch: string, files: DeployFile[], tmpDir: string): Promise<void>`

1. Clone the repo into `tmpDir`:
   ```
   gh repo clone {repo} {tmpDir} -- --depth=1 --branch {branch}
   ```
   If clone fails because branch does not exist (first push): clone without branch flag, then `git -C {tmpDir} checkout -b {branch}`.
   If clone fails because repo is empty (no commits yet): `git init {tmpDir}`, `git -C {tmpDir} remote add origin https://github.com/{repo}.git`, then proceed.

2. Delete everything inside `tmpDir` except `.git/`:
   ```
   find {tmpDir} -mindepth 1 -maxdepth 1 -not -name '.git' -exec rm -rf {} +
   ```
   Use `fs.rm` with `{ recursive: true }` in a loop over `fs.readdir` instead of shell for safety.

3. Write each `DeployFile` to `tmpDir/{file.file}`, creating subdirectories as needed. `file.data` is base64-encoded; decode with `Buffer.from(file.data, 'base64')`.

4. Stage, commit, push:
   ```
   git -C {tmpDir} add -A
   git -C {tmpDir} commit -m "od: deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
   git -C {tmpDir} push origin {branch}
   ```
   Use `--set-upstream` on push if first push.

All git calls use `execFile('git', [...])`. Timeout: 60 s per call.

**Temp directory lifecycle:** caller creates `tmpDir` with `fs.mkdtemp(path.join(os.tmpdir(), 'od-coolify-'))` before calling this function and deletes it (with `fs.rm(tmpDir, { recursive: true, force: true })`) in a `finally` block.

#### `createCoolifyApplication(config: Required<DeployConfig['coolify']>, token: string): Promise<string>`

Calls `POST {instanceUrl}/api/v1/applications/public` with:

```json
{
  "project_uuid": "{projectUuid}",
  "server_uuid": "{serverUuid}",
  "environment_name": "production",
  "name": "od-{githubRepo.split('/')[1]}",
  "git_repository": "https://github.com/{githubRepo}.git",
  "git_branch": "{branch}",
  "build_pack": "nixpacks",
  "ports_exposes": "80",
  "publish_directory": "/",
  "instant_deploy": false
}
```

Headers: `{ Authorization: 'Bearer {token}', 'Content-Type': 'application/json' }`.

Returns the `uuid` field from the JSON response. Throws on non-2xx with the response body text as the error message.

#### `triggerCoolifyDeploy(instanceUrl: string, token: string, appUuid: string): Promise<string>`

Calls `GET {instanceUrl}/api/v1/applications/{appUuid}/start`.

Headers: `{ Authorization: 'Bearer {token}' }`.

Returns `deployment_uuid` from the response JSON. Throws on non-2xx.

#### `pollCoolifyDeployment(instanceUrl: string, token: string, deploymentUuid: string): Promise<{ status: 'finished' | 'failed' }>`

Polls `GET {instanceUrl}/api/v1/deployments/{deploymentUuid}` every 3 000 ms, up to 60 retries (3 minutes total).

Coolify `status` field values and their mapping:

| Coolify `status` | action |
|---|---|
| `queued` | continue polling |
| `in_progress` | continue polling |
| `finished` | resolve `{ status: 'finished' }` |
| `failed` | throw `Error('Coolify deployment failed.')` |
| `cancelled` | throw `Error('Coolify deployment was cancelled.')` |
| anything else | continue polling |

If 60 retries are exhausted without resolution, throw `Error('Coolify deployment timed out.')`.

#### `resolveCoolifyUrl(instanceUrl: string, token: string, appUuid: string): Promise<string>`

Calls `GET {instanceUrl}/api/v1/applications/{appUuid}`.

Returns `fqdn` from the response JSON. If `fqdn` is absent or empty, returns `'{instanceUrl}/dashboard'` as a fallback. Normalizes `fqdn` to include `https://` if it has no scheme.

#### `deployCoolify({ config, files, projectId, projectTitle }: { config: DeployConfig; files: DeployFile[]; projectId: string; projectTitle: string }): Promise<{ url: string; deploymentId: string; appUuid: string; githubRepo: string }>`

Orchestrates the full flow:

```
1.  checkGhAuth()
2.  coolifyConfig = config.coolify (required; throw if missing)
3.  githubRepo = coolifyConfig.githubRepo
    if (!githubRepo) {
      repoName = generateGithubRepoName(projectTitle)
      githubRepo = await ensureGithubRepo(repoName, coolifyConfig.publicRepo)
    }
4.  tmpDir = await fs.mkdtemp(...)
    try {
      await pushFilesToGithub(githubRepo, coolifyConfig.branch || 'main', files, tmpDir)
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
5.  appUuid = coolifyConfig.appUuid
    if (!appUuid) {
      appUuid = await createCoolifyApplication({ ...coolifyConfig, githubRepo }, config.token)
    }
6.  deploymentUuid = await triggerCoolifyDeploy(coolifyConfig.instanceUrl, config.token, appUuid)
7.  await pollCoolifyDeployment(coolifyConfig.instanceUrl, config.token, deploymentUuid)
8.  url = await resolveCoolifyUrl(coolifyConfig.instanceUrl, config.token, appUuid)
9.  return { url, deploymentId: deploymentUuid, appUuid, githubRepo }
```

---

## 3. Deploy routes (`apps/daemon/src/deploy-routes.ts`)

### 3a. `GET /api/deploy/config`

Already dispatches by `providerId` query param through `readDeployConfig` → `publicDeployConfigForProvider`. No structural change needed; the new `coolify` field on the response will flow through automatically once the contracts and `publicCoolifyConfig` are in place.

### 3b. `PUT /api/deploy/config`

Already dispatches through `writeDeployConfig`. Ensure the request body `coolify` field is forwarded. Check how the route currently extracts fields from the body and add `coolify: body.coolify` to the input passed to `writeDeployConfig`.

### 3c. `POST /api/projects/:id/deploy`

Find the section that calls `deployToVercel` or `deployToCloudflarePages` based on `providerId`. Add a branch:

```typescript
if (providerId === COOLIFY_PROVIDER_ID) {
  const result = await deployCoolify({
    config,
    files,
    projectId,
    projectTitle: project.title ?? projectId,
  });
  // After deploy, update coolify.json with the resolved appUuid and githubRepo
  // (they may have been created on this call for the first time):
  await writeCoolifyConfig({
    token: config.token,
    coolify: {
      ...config.coolify,
      appUuid: result.appUuid,
      githubRepo: result.githubRepo,
    },
  });
  deploymentUrl = result.url;
  deploymentId = result.deploymentId;
}
```

Follow the exact same upsert-deployment pattern used for Vercel (call `upsertDeployment` with the result).

### 3d. `POST /api/projects/:id/deploy/preflight`

Preflight only builds the file set and analyzes it — it does not actually call the provider. No Coolify-specific logic needed here; the existing `prepareDeployPreflight` function works provider-agnostically. Just ensure `'coolify'` passes the `isDeployProviderId` guard.

### 3e. `isDeployProviderId` (line 198 of `deploy.ts`)

Add `COOLIFY_PROVIDER_ID` to the valid set:

```typescript
export function isDeployProviderId(value: unknown): value is DeployProviderId {
  return (
    value === VERCEL_PROVIDER_ID ||
    value === CLOUDFLARE_PAGES_PROVIDER_ID ||
    value === COOLIFY_PROVIDER_ID
  );
}
```

---

## 4. Web registry (`apps/web/src/providers/registry.ts`)

### 4a. Add provider ID constant and extend the array

After `CLOUDFLARE_PAGES_PROVIDER_ID` (line 48):

```typescript
export const COOLIFY_PROVIDER_ID = 'coolify';
```

Extend `DEPLOY_PROVIDER_IDS` (line 49):

```typescript
export const DEPLOY_PROVIDER_IDS = [
  DEFAULT_DEPLOY_PROVIDER_ID,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  COOLIFY_PROVIDER_ID,
] as const;
```

### 4b. Add `WebCoolifyConfigHints` type

```typescript
export type WebCoolifyConfigHints = {
  instanceUrl?: string;
  appUuid?: string;
  serverUuid?: string;
  projectUuid?: string;
  githubRepo?: string;
  branch?: string;
  publicRepo?: boolean;
};
```

### 4c. Extend `WebUpdateDeployConfigRequest`

The web type mirrors `UpdateDeployConfigRequest` from contracts. Add:

```typescript
coolify?: WebCoolifyConfigHints;
```

---

## 5. FileViewer UI (`apps/web/src/components/FileViewer.tsx`)

### 5a. Import new constants

Add `COOLIFY_PROVIDER_ID` and `WebCoolifyConfigHints` to the import from `../providers/registry`.

### 5b. Extend the provider option descriptor type (around line 131)

The `DeployProviderOption` type uses union literal key strings for i18n. Add Coolify variants:

```typescript
labelKey: 'fileViewer.vercelProvider' | 'fileViewer.cloudflarePagesProvider' | 'fileViewer.coolifyProvider';
tokenLinkKey:
  | 'fileViewer.vercelTokenGetLink'
  | 'fileViewer.cloudflareApiTokenGetLink'
  | 'fileViewer.coolifyTokenGetLink';
tokenPlaceholderKey:
  | 'fileViewer.vercelTokenPlaceholder'
  | 'fileViewer.cloudflareApiTokenPlaceholder'
  | 'fileViewer.coolifyTokenPlaceholder';
tokenReuseHintKey:
  | 'fileViewer.vercelTokenReuseHint'
  | 'fileViewer.cloudflareApiTokenReuseHint'
  | 'fileViewer.coolifyTokenReuseHint';
tokenRequiredKey:
  | 'fileViewer.vercelTokenRequired'
  | 'fileViewer.cloudflareApiTokenRequired'
  | 'fileViewer.coolifyTokenRequired';
previewHintKey:
  | 'fileViewer.vercelPreviewOnly'
  | 'fileViewer.cloudflarePagesPreviewHint'
  | 'fileViewer.coolifyPreviewHint';
tokenLabelKey:
  | 'fileViewer.vercelToken'
  | 'fileViewer.cloudflareApiToken'
  | 'fileViewer.coolifyToken';
```

### 5c. Add Coolify entry to `DEPLOY_PROVIDER_OPTIONS` (around line 226)

```typescript
{
  id: COOLIFY_PROVIDER_ID,
  labelKey: 'fileViewer.coolifyProvider',
  tokenLinkKey: 'fileViewer.coolifyTokenGetLink',
  tokenPlaceholderKey: 'fileViewer.coolifyTokenPlaceholder',
  tokenReuseHintKey: 'fileViewer.coolifyTokenReuseHint',
  tokenRequiredKey: 'fileViewer.coolifyTokenRequired',
  previewHintKey: 'fileViewer.coolifyPreviewHint',
  tokenLabelKey: 'fileViewer.coolifyToken',
},
```

### 5d. New state variables (add alongside existing deploy state ~line 3500)

```typescript
const [coolifyInstanceUrl, setCoolifyInstanceUrl] = useState('');
const [coolifyAppUuid, setCoolifyAppUuid] = useState('');         // read-only after first deploy
const [coolifyServerUuid, setCoolifyServerUuid] = useState('');
const [coolifyProjectUuid, setCoolifyProjectUuid] = useState('');
const [coolifyGithubRepo, setCoolifyGithubRepo] = useState('');   // editable before first deploy
const [coolifyBranch, setCoolifyBranch] = useState('main');
const [coolifyPublicRepo, setCoolifyPublicRepo] = useState(false);
const [coolifyGhAuthError, setCoolifyGhAuthError] = useState<string | null>(null);
```

### 5e. Extend `syncDeployFormFromConfig` (line 3719)

Add Coolify fields after the existing setters:

```typescript
setCoolifyInstanceUrl(matchingConfig?.coolify?.instanceUrl ?? '');
setCoolifyAppUuid(matchingConfig?.coolify?.appUuid ?? '');
setCoolifyServerUuid(matchingConfig?.coolify?.serverUuid ?? '');
setCoolifyProjectUuid(matchingConfig?.coolify?.projectUuid ?? '');
setCoolifyGithubRepo(matchingConfig?.coolify?.githubRepo ?? '');
setCoolifyBranch(matchingConfig?.coolify?.branch ?? 'main');
setCoolifyPublicRepo(matchingConfig?.coolify?.publicRepo ?? false);
setCoolifyGhAuthError(null);
```

### 5f. Extend `buildDeployConfigRequest` (line 3748)

Add a Coolify branch:

```typescript
if (providerId === COOLIFY_PROVIDER_ID) {
  return {
    providerId,
    token: deployToken.trim(),
    coolify: {
      instanceUrl: coolifyInstanceUrl.trim(),
      appUuid: coolifyAppUuid.trim(),
      serverUuid: coolifyServerUuid.trim(),
      projectUuid: coolifyProjectUuid.trim(),
      githubRepo: coolifyGithubRepo.trim(),
      branch: coolifyBranch.trim() || 'main',
      publicRepo: coolifyPublicRepo,
    },
  };
}
```

### 5g. Validation in `changeDeployProvider` (line 5032)

Add a Coolify guard before calling `updateDeployConfig`:

```typescript
if (deployProviderId === COOLIFY_PROVIDER_ID) {
  if (!deployToken.trim()) throw new Error(t('fileViewer.coolifyTokenRequired'));
  if (!coolifyInstanceUrl.trim()) throw new Error(t('fileViewer.coolifyInstanceUrlRequired'));
  if (!coolifyServerUuid.trim()) throw new Error(t('fileViewer.coolifyServerUuidRequired'));
  if (!coolifyProjectUuid.trim()) throw new Error(t('fileViewer.coolifyProjectUuidRequired'));
}
```

### 5h. Deploy form JSX (inside the deploy modal, ~line 6300)

Add a conditional block that renders when `deployProviderId === COOLIFY_PROVIDER_ID`, after the shared token input and before the deploy/save buttons.

Fields to render:

1. **Coolify instance URL** — text input, `value={coolifyInstanceUrl}`, `onChange` → `setCoolifyInstanceUrl`, placeholder `https://coolify.example.com`, label key `fileViewer.coolifyInstanceUrl`

2. **Coolify API token** — password input (same pattern as Vercel token), label key `fileViewer.coolifyToken`, link to token instructions at label key `fileViewer.coolifyTokenGetLink` (value: `"#"` — user navigates their own Coolify instance)

3. **Server UUID** — text input, `value={coolifyServerUuid}`, label key `fileViewer.coolifyServerUuid`, hint key `fileViewer.coolifyServerUuidHint`

4. **Project UUID** — text input, `value={coolifyProjectUuid}`, label key `fileViewer.coolifyProjectUuid`, hint key `fileViewer.coolifyProjectUuidHint`

5. **GitHub repository name** — text input, `value={coolifyGithubRepo}`, disabled if `coolifyAppUuid` is non-empty (already deployed), label key `fileViewer.coolifyGithubRepo`, hint key `fileViewer.coolifyGithubRepoHint`. When disabled, show a small note: `fileViewer.coolifyGithubRepoLocked`.

6. **Branch** — text input, `value={coolifyBranch}`, default `main`, label key `fileViewer.coolifyBranch`

7. **Make repository public** — checkbox, `checked={coolifyPublicRepo}`, disabled if `coolifyAppUuid` is non-empty, label key `fileViewer.coolifyPublicRepo`

8. **GitHub CLI auth error banner** — render only if `coolifyGhAuthError` is set; show error text with instruction to run `gh auth login`.

**App UUID display (read-only):** If `coolifyAppUuid` is non-empty, show it in a read-only field or text block so the user can confirm which Coolify application is linked. Label key `fileViewer.coolifyAppUuid`.

### 5i. Deploy phase labels

The `deployPhase` labels already use `fileViewer.deployingToProvider` with `{provider}` interpolation. No structural change needed — the Coolify `labelKey` value flows through automatically.

### 5j. Share menu (around line 5860)

The share menu iterates `DEPLOY_PROVIDER_OPTIONS` and already renders a menu item per provider using `fileViewer.deployToProvider` / `fileViewer.redeployToProvider`. No structural change needed.

---

## 6. i18n (`apps/web/src/i18n/`)

### 6a. Add keys to `types.ts` (after line 1395)

```typescript
'fileViewer.coolifyProvider': string;
'fileViewer.coolifyToken': string;
'fileViewer.coolifyTokenGetLink': string;
'fileViewer.coolifyTokenPlaceholder': string;
'fileViewer.coolifyTokenReuseHint': string;
'fileViewer.coolifyTokenRequired': string;
'fileViewer.coolifyPreviewHint': string;
'fileViewer.coolifyInstanceUrl': string;
'fileViewer.coolifyInstanceUrlRequired': string;
'fileViewer.coolifyServerUuid': string;
'fileViewer.coolifyServerUuidHint': string;
'fileViewer.coolifyServerUuidRequired': string;
'fileViewer.coolifyProjectUuid': string;
'fileViewer.coolifyProjectUuidHint': string;
'fileViewer.coolifyProjectUuidRequired': string;
'fileViewer.coolifyGithubRepo': string;
'fileViewer.coolifyGithubRepoHint': string;
'fileViewer.coolifyGithubRepoLocked': string;
'fileViewer.coolifyBranch': string;
'fileViewer.coolifyPublicRepo': string;
'fileViewer.coolifyAppUuid': string;
'fileViewer.coolifyGhAuthError': string;
```

### 6b. English values (`locales/en.ts`)

```typescript
'fileViewer.coolifyProvider': 'Coolify',
'fileViewer.coolifyToken': 'Coolify API token',
'fileViewer.coolifyTokenGetLink': 'Get token',
'fileViewer.coolifyTokenPlaceholder': 'Paste your Coolify API token',
'fileViewer.coolifyTokenReuseHint': 'Token already saved',
'fileViewer.coolifyTokenRequired': 'Coolify API token is required',
'fileViewer.coolifyPreviewHint': 'Publishes to your self-hosted Coolify instance.',
'fileViewer.coolifyInstanceUrl': 'Coolify instance URL',
'fileViewer.coolifyInstanceUrlRequired': 'Coolify instance URL is required',
'fileViewer.coolifyServerUuid': 'Server UUID',
'fileViewer.coolifyServerUuidHint': 'Found in your Coolify server settings',
'fileViewer.coolifyServerUuidRequired': 'Server UUID is required',
'fileViewer.coolifyProjectUuid': 'Project UUID',
'fileViewer.coolifyProjectUuidHint': 'Found in your Coolify project settings',
'fileViewer.coolifyProjectUuidRequired': 'Project UUID is required',
'fileViewer.coolifyGithubRepo': 'GitHub repository',
'fileViewer.coolifyGithubRepoHint': 'Auto-generated on first deploy. Edit to use an existing repo (owner/repo).',
'fileViewer.coolifyGithubRepoLocked': 'Linked to this repository. Clear the App UUID above to reconnect.',
'fileViewer.coolifyBranch': 'Branch',
'fileViewer.coolifyPublicRepo': 'Make repository public',
'fileViewer.coolifyAppUuid': 'Linked Coolify application',
'fileViewer.coolifyGhAuthError': 'GitHub CLI is not authenticated. Run: gh auth login',
```

### 6c. All other 17 locale files

Add the same 23 keys to every locale file under `apps/web/src/i18n/locales/`. Use the English string as the value for all non-English locales — the typecheck will pass and a translation pass can follow. The locales are: `ar`, `de`, `es-ES`, `fa`, `fr`, `hu`, `id`, `ja`, `ko`, `pl`, `pt-BR`, `ru`, `th`, `tr`, `uk`, `zh-CN`, `zh-TW`.

---

## 7. Validation checklist before marking ready

Run all of the following and confirm they pass:

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/contracts typecheck
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/daemon build
pnpm --filter @open-design/web build
pnpm --filter @open-design/daemon test
```

---

## 8. Manual smoke test (if a Coolify instance and gh are available)

1. `gh auth login` if not already authenticated.
2. Open a design file in Open Design.
3. Share menu → "Deploy to Coolify".
4. Fill in: instance URL, API token, server UUID, project UUID. Leave GitHub repo blank.
5. Click "Deploy". Confirm:
   - A private GitHub repo is created named `od-{title}`.
   - Files are pushed to `main`.
   - A Coolify application is created.
   - The deploy triggers and the modal shows the polling state.
   - On completion, a live URL appears and is clickable.
6. Click "Deploy" a second time. Confirm:
   - The existing GitHub repo is reused (no new repo created).
   - A fresh commit is pushed.
   - A new Coolify deployment is triggered and resolves.

---

## 9. Out of scope

- Rename support for the GitHub repo after first deploy.
- Support for non-GitHub Git hosts.
- Coolify webhook-based triggering (no API token needed) — defer to a follow-up.
- Translation of the 23 new keys into the 17 non-English locales (English fallbacks are sufficient to ship).
- `check-link` endpoint support for Coolify (Coolify provides URL via the application `fqdn` field; no equivalent to Vercel's deployment protection check is needed).
