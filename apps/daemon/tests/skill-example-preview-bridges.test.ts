import express from 'express';
import type http from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import { registerStaticResourceRoutes } from '../src/routes/static-resource.js';

/**
 * A skill example is a document a user actually looks at, so the preview
 * surface navigates a frame straight at this route instead of rebuilding the
 * fetched HTML into a srcdoc copy. srcdoc used to carry the opaque-origin
 * storage shim, the redirect guard, and the snapshot bridge with it; on the
 * URL transport only the daemon can install them, and only when the
 * navigation asks for them by name.
 */

const SANDBOX_SHIM_MARKER = 'data-od-sandbox-shim';
const REDIRECT_GUARD_MARKER = 'data-od-preview-redirect-guard';
const SNAPSHOT_BRIDGE_MARKER = 'data-od-url-snapshot-bridge';

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

function context(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceName: workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: null,
    providerMode: 'platform_credits',
    seatSummary: {
      seatLimit: 5,
      usedSeats: 1,
      availableSeats: 4,
      isSeatFull: false,
    },
    permissions: {
      canManageMembers: false,
      canManageBilling: false,
      canInviteMembers: false,
      canManageAutoRecharge: false,
      canShareProjects: true,
      canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true,
      canManageSharedResources: false,
    },
  } as WorkspaceCollabContext;
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-skill-preview-bridges-'));
  roots.push(root);
  const dir = path.join(root, 'skill');
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'example.html'),
    '<!doctype html><html><head><title>Example</title></head><body><p>hi</p></body></html>',
  );
  const entry = {
    id: 'bridged-skill',
    name: 'Bridged skill',
    description: 'example',
    body: '# example',
    dir,
    source: 'user' as const,
  };

  const app = express();
  const paths = {
    ARTIFACTS_DIR: path.join(root, 'artifacts'),
    BRANDS_DIR: path.join(root, 'brands'),
    BUNDLED_PETS_DIR: path.join(root, 'pets'),
    CRAFT_DIR: path.join(root, 'craft'),
    DESIGN_SYSTEMS_DIR: path.join(root, 'design-systems'),
    DESIGN_TEMPLATES_DIR: path.join(root, 'design-templates'),
    LIBRARY_DIR: path.join(root, 'library'),
    OD_BIN: path.join(root, 'od'),
    PROJECT_ROOT: root,
    PROJECTS_DIR: path.join(root, 'projects'),
    PROMPT_TEMPLATES_DIR: path.join(root, 'prompt-templates'),
    RUNTIME_DATA_DIR: path.join(root, 'data'),
    RUNTIME_DATA_DIR_CANONICAL: path.join(root, 'data'),
    SKILLS_DIR: path.join(root, 'skills'),
    USER_DESIGN_SYSTEMS_DIR: path.join(root, 'user-design-systems'),
    USER_DESIGN_TEMPLATES_DIR: path.join(root, 'user-design-templates'),
    USER_SKILLS_DIR: path.join(root, 'user-skills'),
  };
  registerStaticResourceRoutes(app, {
    db: {} as never,
    verifyWorkspaceRequestAuthority: async (req: any) => ({
      ok: true,
      context: context(
        req.get('x-od-workspace-id')?.trim(),
        req.get('x-od-workspace-member-id')?.trim(),
      ),
    }),
    http: {
      createSseResponse: () => undefined,
      getPublicBaseUrl: () => '',
      isLocalSameOrigin: () => true,
      requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
      resolvedPortRef: { current: 0 },
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
        options?: { retryable?: boolean },
      ) =>
        res.status(status).json({
          error: code,
          message,
          ...(options?.retryable ? { retryable: true } : {}),
        }),
      sendLiveArtifactRouteError: () => undefined,
      sendMulterError: () => undefined,
    },
    paths,
    resources: {
      listAllDesignSystems: async () => [],
      resolveWorkspaceScope: async () => null,
      listAllSkills: async () => [],
      listAllDesignTemplates: async () => [],
      listAllSkillLikeEntries: (async () => [entry]) as never,
      mimeFor: () => 'text/plain',
    },
  });
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

describe('skill example preview bridges', () => {
  // Control input: the same three markers, on the request shape that must
  // never receive them. Green before and after, so a green reading on the
  // bridged case cannot be a marker that is simply always present.
  it('injects nothing when the navigation asks for no bridges', async () => {
    const baseUrl = await fixture();
    const response = await fetch(`${baseUrl}/api/skills/bridged-skill/example`);

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).not.toContain(SANDBOX_SHIM_MARKER);
    expect(html).not.toContain(REDIRECT_GUARD_MARKER);
    expect(html).not.toContain(SNAPSHOT_BRIDGE_MARKER);
  });

  it('installs the bridges the navigation asks for by name', async () => {
    const baseUrl = await fixture();
    const response = await fetch(
      `${baseUrl}/api/skills/bridged-skill/example`
        + '?odPreviewBridge=sandbox&odPreviewBridge=redirect&odPreviewBridge=snapshot',
    );

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(SANDBOX_SHIM_MARKER);
    expect(html).toContain(REDIRECT_GUARD_MARKER);
    expect(html).toContain(SNAPSHOT_BRIDGE_MARKER);
    // The authored document must survive the injection.
    expect(html).toContain('<p>hi</p>');
  });

  it('installs only the named bridges', async () => {
    const baseUrl = await fixture();
    const response = await fetch(
      `${baseUrl}/api/skills/bridged-skill/example?odPreviewBridge=snapshot`,
    );

    const html = await response.text();
    expect(html).toContain(SNAPSHOT_BRIDGE_MARKER);
    expect(html).not.toContain(SANDBOX_SHIM_MARKER);
    expect(html).not.toContain(REDIRECT_GUARD_MARKER);
  });
});
