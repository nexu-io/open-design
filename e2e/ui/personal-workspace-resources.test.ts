import { mkdir } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { createCollabCluster, type CollabCluster } from '@/playwright/collab-cluster';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { clusterTest as test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';

const WORKSPACE_ID = 'ws-personal-shared-resources';
const OWNER = {
  controlKey: 'personal-resource-owner-key',
  memberId: 'personal-resource-owner',
  name: 'Resource Owner',
  role: 'owner' as const,
};
const MEMBER = {
  controlKey: 'personal-resource-member-key',
  memberId: 'personal-resource-member',
  name: 'Resource Member',
  role: 'member' as const,
};
type Identity = typeof OWNER | typeof MEMBER;

test.describe.configure({ timeout: T.xlong * 8 });

test('[P0] Personal workspace shares, uses, syncs and retracts extensions and design systems', async ({
  browser,
}, testInfo) => {
  const root = testInfo.outputPath('resource-hub');
  await mkdir(root, { recursive: true });
  const hub = await startFakeCollabHub({
    root,
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Personal shared resources',
    workspaceType: 'personal',
    clients: [OWNER, MEMBER],
    includePersonalWorkspace: true,
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('vela'));
  const env = {
    OD_COLLAB_TRANSPORT: 'vela-cli',
    OD_RESOURCE_TRANSPORT: 'vela-cli',
    OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
    VELA_API_URL: hub.url,
    VELA_BIN: velaBin,
  };
  let cluster: CollabCluster | undefined;
  let failed = false;
  try {
    cluster = await createCollabCluster(browser, testInfo, [
      { id: 'resource-owner', env: { ...env, VELA_CONTROL_KEY: OWNER.controlKey } },
      { id: 'resource-member', env: { ...env, VELA_CONTROL_KEY: MEMBER.controlKey } },
    ]);
    const owner = cluster.clients['resource-owner']!.page;
    const member = cluster.clients['resource-member']!.page;
    owner.setDefaultTimeout(T.long);
    member.setDefaultTimeout(T.long);
    await Promise.all([
      applyStandardMocks(owner),
      applyStandardMocks(member),
      pin(owner, OWNER),
      pin(member, MEMBER),
    ]);
    const { pluginId, skillId } = await seedExtensions(owner, OWNER, 'owner');
    const ds = await owner.request.post('/api/design-systems', {
      headers: headers(OWNER),
      data: {
        title: 'Personal Shared Language',
        summary: 'Shared within this workspace only.',
        category: 'Custom',
        status: 'published',
      },
    });
    expect(ds.ok(), await ds.text()).toBeTruthy();
    const dsBody = await ds.json();
    const dsId: string = dsBody.id ?? dsBody.designSystem.id;
    const backing = await owner.request.post(
      `/api/design-systems/${encodeURIComponent(dsId)}/workspace`,
      { headers: headers(OWNER) },
    );
    expect(backing.ok(), await backing.text()).toBeTruthy();
    const backingId = (await backing.json()).project.id;
    const designFile = await owner.request.post(`/api/projects/${backingId}/files`, {
      headers: headers(OWNER),
      data: { name: 'DESIGN.md', content: '# Personal Shared Language\n\nUse green accents.' },
    });
    expect(designFile.ok(), await designFile.text()).toBeTruthy();
    const synced = await owner.request.post(
      `/api/design-systems/${encodeURIComponent(dsId)}/sync-assets`,
      { headers: headers(OWNER) },
    );
    expect(synced.ok(), await synced.text()).toBeTruthy();

    // Browser clicks issue the actual daemon share routes; business APIs are not route-mocked.
    await owner.goto('/plugins');
    await owner.getByTestId('plugins-tab-installed').click();
    await owner.getByTestId(`plugins-card-more-${pluginId}`).click();
    await mutateFromMenu(owner, 'Share with team', 'POST');
    await owner.getByRole('button', { name: 'Skills', exact: true }).click();
    await owner.getByTestId(`plugins-card-more-${skillId}`).click();
    await mutateFromMenu(owner, 'Share with team', 'POST');
    await owner.goto('/design-systems');
    await owner.getByRole('tab', { name: /Your systems/i }).click();
    await owner.getByTestId(`design-system-card-${dsId}`).click();
    await owner.getByTestId('design-kit-more-actions').click();
    await mutateFromMenu(owner, 'Share to team', 'POST');

    await member.goto('/plugins');
    await member.getByRole('button', { name: 'Team', exact: true }).click();
    const memberPlugin = member.getByTestId(`plugins-card-${pluginId}`);
    await expect(memberPlugin).toContainText('Personal Shared Plugin', { timeout: T.xlong });
    // A teammate cannot overwrite or retract another member's source.
    await expect(memberPlugin.getByRole('button', { name: 'Remove from team' })).toHaveCount(0);
    await member.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(member.getByTestId(`plugins-card-${skillId}`)).toBeVisible({ timeout: T.xlong });
    await member.getByTestId(`plugins-card-use-skill-${skillId}`).click();
    await expect(member).toHaveURL(/\/(?:\?.*)?$/);
    await member.getByTestId('home-hero-design-system-trigger').click();
    await member.getByTestId(`project-ds-picker-option-${dsId}`).click();
    await expect(member.getByTestId('home-hero-design-system-trigger')).toContainText(
      'Personal Shared Language',
    );
    const source = await member.request.get(
      `/api/design-systems/${encodeURIComponent(dsId)}/static?path=DESIGN.md`,
      { headers: headers(MEMBER) },
    );
    expect(source.ok(), await source.text()).toBeTruthy();
    expect(await source.text()).toContain('Personal Shared Language');
    await testInfo.attach('personal-shared-design-system', {
      body: await member.screenshot(),
      contentType: 'image/png',
    });

    // Re-publish edited content and observe the other running client's catalog.
    const update = await owner.request.put(`/api/skills/${encodeURIComponent(skillId)}`, {
      headers: headers(OWNER),
      data: {
        name: 'personal-shared-skill-owner',
        description: 'Updated personal workspace skill',
        body: '# Shared skill v2',
      },
    });
    expect(update.ok(), await update.text()).toBeTruthy();
    await owner.goto('/plugins');
    await owner.getByTestId('plugins-tab-installed').click();
    await owner.getByRole('button', { name: 'Skills', exact: true }).click();
    await owner.getByTestId(`plugins-card-more-${skillId}`).click();
    await mutateFromMenu(owner, 'Sync to team', 'POST');
    await member.goto('/plugins');
    await member.getByRole('button', { name: 'Skills', exact: true }).click();
    await member.getByRole('button', { name: 'Team', exact: true }).click();
    await expect(member.getByTestId(`plugins-card-${skillId}`)).toContainText(
      'Updated personal workspace skill',
      { timeout: T.xlong },
    );

    // Switching to a different Personal workspace cannot expose this workspace's shares.
    const switched = await member.request.put('/api/workspace/active', {
      data: {
        workspaceId: `personal-${MEMBER.memberId}`,
        workspaceMemberId: `personal-member-${MEMBER.memberId}`,
      },
    });
    expect(switched.ok(), await switched.text()).toBeTruthy();
    await member.reload();
    await member.getByRole('button', { name: 'Team', exact: true }).click();
    await expect(member.getByTestId(`plugins-card-${skillId}`)).toHaveCount(0);
    await pin(member, MEMBER);
    await member.reload();
    await member.getByRole('button', { name: 'Skills', exact: true }).click();
    await member.getByRole('button', { name: 'Team', exact: true }).click();
    await expect(member.getByTestId(`plugins-card-${skillId}`)).toBeVisible({ timeout: T.xlong });

    await owner.getByTestId(`plugins-card-more-${skillId}`).click();
    await mutateFromMenu(owner, 'Remove from team', 'DELETE');
    await expect(member.getByTestId(`plugins-card-${skillId}`)).toHaveCount(0, {
      timeout: T.xlong,
    });
    await owner.getByRole('button', { name: 'Expert suites', exact: true }).click();
    await owner.getByTestId(`plugins-card-more-${pluginId}`).click();
    await mutateFromMenu(owner, 'Remove from team', 'DELETE');
    await member.getByRole('button', { name: 'Expert suites', exact: true }).click();
    await expect(member.getByTestId(`plugins-card-${pluginId}`)).toHaveCount(0, {
      timeout: T.xlong,
    });
    await owner.goto('/design-systems');
    await owner.getByRole('tab', { name: 'Team', exact: true }).click();
    await owner.getByTestId(`design-system-card-${dsId}`).click();
    await owner.getByTestId('design-kit-more-actions').click();
    await mutateFromMenu(owner, 'Remove from team', 'DELETE');
    await member.goto('/design-systems');
    await member.getByRole('tab', { name: 'Team', exact: true }).click();
    await expect(member.getByTestId(`design-system-card-${dsId}`)).toHaveCount(0);

    // The member's separate shares survive removal, including bytes the Owner never had locally.
    const transferred = await seedExtensions(member, MEMBER, 'member');
    for (const [kind, id] of [
      ['plugins', transferred.pluginId],
      ['skills', transferred.skillId],
    ] as const) {
      const share = await member.request.post(
        `/api/workspace/${kind}/${encodeURIComponent(id)}/share`,
        { headers: headers(MEMBER) },
      );
      expect(share.ok(), await share.text()).toBeTruthy();
    }
    hub.removeMember(MEMBER.memberId);
    await owner.goto('/plugins');
    await owner.getByRole('button', { name: 'Team', exact: true }).click();
    await expect(owner.getByTestId(`plugins-card-${transferred.pluginId}`)).toBeVisible({
      timeout: T.xlong,
    });
    await owner.getByRole('button', { name: 'Skills', exact: true }).click();
    await expect(owner.getByTestId(`plugins-card-${transferred.skillId}`)).toBeVisible({
      timeout: T.xlong,
    });
    await owner.getByTestId(`plugins-card-use-skill-${transferred.skillId}`).click();
    await expect(owner).toHaveURL(/\/(?:\?.*)?$/);
    const revoked = await member.request.get('/api/workspace/plugins/team', {
      headers: headers(MEMBER),
    });
    expect(revoked.ok()).toBeFalsy();
  } catch (error) {
    failed = true;
    for (const client of Object.values(cluster?.clients ?? {})) {
      await testInfo.attach(`${client.id}-failure`, {
        body: await client.page.screenshot(),
        contentType: 'image/png',
      });
    }
    throw error;
  } finally {
    await cluster?.close({ preserve: failed });
    await hub.close();
  }
});

function headers(identity: Identity): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-type': 'personal',
    'x-od-workspace-member-id': identity.memberId,
    'x-od-workspace-role': identity.role,
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
    'x-od-workspace-can-manage-shared-resources': identity.role === 'owner' ? 'true' : 'false',
  };
}
async function pin(page: Page, identity: Identity): Promise<void> {
  const response = await page.request.put('/api/workspace/active', {
    data: { workspaceId: WORKSPACE_ID, workspaceMemberId: identity.memberId },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}
async function seedExtensions(page: Page, identity: Identity, suffix: string) {
  const pluginId = `personal-shared-plugin-${suffix}`;
  const create = await page.request.post('/api/projects', {
    headers: headers(identity),
    data: {
      id: `personal-resource-source-${suffix}`,
      name: `Plugin source ${suffix}`,
      metadata: { kind: 'prototype' },
    },
  });
  expect(create.ok(), await create.text()).toBeTruthy();
  const projectBody = await create.json();
  const projectId = projectBody.id ?? projectBody.project.id;
  for (const [name, content] of [
    [
      'plugin-source/open-design.json',
      JSON.stringify({
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: pluginId,
        title: 'Personal Shared Plugin',
        version: '0.1.0',
        description: 'A workspace-scoped shared plugin.',
        license: 'MIT',
        od: { kind: 'atom', capabilities: ['prompt:inject'] },
      }),
    ],
    [
      'plugin-source/SKILL.md',
      `---\nname: ${pluginId}\ndescription: Personal shared plugin fixture\n---\n# Shared plugin\n`,
    ],
  ]) {
    const written = await page.request.post(`/api/projects/${projectId}/files`, {
      headers: headers(identity),
      data: { name, content },
    });
    expect(written.ok(), await written.text()).toBeTruthy();
  }
  const installed = await page.request.post(`/api/projects/${projectId}/plugins/install-folder`, {
    headers: headers(identity),
    data: { path: 'plugin-source' },
  });
  expect(installed.ok(), await installed.text()).toBeTruthy();
  const imported = await page.request.post('/api/skills/import', {
    headers: headers(identity),
    data: {
      name: `personal-shared-skill-${suffix}`,
      description: 'A workspace-scoped shared skill.',
      body: '# Shared skill\nUse this skill.',
    },
  });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  const skillBody = await imported.json();
  return {
    pluginId,
    skillId: (skillBody.id ??
      skillBody.skill?.id ??
      `user:personal-shared-skill-${suffix}`) as string,
  };
}

async function mutateFromMenu(page: Page, label: string, method: string): Promise<void> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === method && new URL(response.url()).pathname.endsWith('/share'),
  );
  await page.getByRole('menuitem', { name: label, exact: true }).click();
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBeTruthy();
  expect(await response.json()).toMatchObject(
    method === 'POST' ? { shared: true } : { unshared: true },
  );
}
