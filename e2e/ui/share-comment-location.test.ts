import { expect, test } from '@/playwright/suite';
import { mockAmrPersonalWorkspace, AMR_PERSONAL_WORKSPACE_CONTEXT } from '../lib/playwright/amr.js';
import { T } from '@/timeouts';
for (const forceInline of [false, true])
    test(`[P1] Owner locates an old H2 again after scrolling away (srcdoc=${forceInline})`, async ({ page }) => {
        test.setTimeout(T.xlong * 2);
        const team = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, workspaceId: 'ws-ui-audit-team', workspaceName: 'UI audit team', workspaceType: 'team' as const, workspaceMemberId: 'mem-ui-audit-team', seatSummary: { seatLimit: 5, usedSeats: 1, availableSeats: 4, isSeatFull: false }, teamId: 'team-ui-audit', teamName: 'UI audit team', role: 'owner' as const };
        await page.addInitScript(() => {
            localStorage.setItem('open-design:locale', 'zh-CN');
            localStorage.setItem('open-design:locale-source', 'manual');
            // Observe the same real-document handshake that enables URL-mode
            // comments. Opening comments before it arrives selects srcDoc.
            if (window !== window.top) return;
            window.addEventListener('message', event => {
                const iframe = document.querySelector<HTMLIFrameElement>('iframe[data-od-render-mode="url-load"][data-od-active="true"]');
                if (!iframe || event.source !== iframe.contentWindow || event.origin !== 'null') return;
                const src = iframe.getAttribute('src');
                if (src && event.data?.type === 'od:url-selection-bridge-ready'
                    && event.data.href === new URL(src, window.location.href).href) {
                    Reflect.set(window, 'commentLocationReadyUrl', event.data.href);
                }
            });
        });
        await mockAmrPersonalWorkspace(page);
        await page.route('**/api/workspace/directory', r => r.fulfill({ json: { items: [team], activeWorkspaceId: team.workspaceId } }));
        await page.route('**/api/workspace/context', r => r.fulfill({ json: { context: team } }));
        const projectId = `ui-audit-team-${Date.now()}`;
        await page.route('**/api/projects/*/workspace-scope', r => r.fulfill({ json: { scope: { kind: 'team', projectId, workspaceId: team.workspaceId, teamId: team.teamId, visibility: 'private', context: team } } }));
        const create = await page.request.post('/api/projects', { data: { id: projectId, name: 'Team UI audit local fixture', skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
        expect(create.ok(), await create.text()).toBeTruthy();
        const { conversationId } = await create.json() as {
            conversationId: string;
        };
        const content = '<!doctype html><html lang="zh-CN"><body>' + (forceInline ? '<img src="/location-marker.svg" style="display:none">' : '') + '<main data-od-id="old-cloud-id"><h1>Location fixture</h1><section style="padding-top:1400px;padding-bottom:500px"><h2>评论定位目标</h2></section></main></body></html>';
        if (forceInline) {
            const asset = await page.request.post(`/api/projects/${projectId}/files`, { data: { name: 'location-marker.svg', content: '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>' } });
            expect(asset.ok()).toBeTruthy();
        }
        const file = await page.request.post(`/api/projects/${projectId}/files`, { data: { name: 'index.html', content, artifactManifest: { version: 1, kind: 'html', title: 'index.html', entry: 'index.html', renderer: 'html', exports: ['html'] } } });
        expect(file.ok(), await file.text()).toBeTruthy();
        await page.route(`**/api/projects/${projectId}/files/index.html/share-plan`, r => r.request().method() === 'POST' ? r.fulfill({ json: { fileCount: 1, totalBytes: content.length, exceedsSizeLimit: false, exclusions: [] } }) : r.fallback());
        const projectResponse = await page.request.get(`/api/projects/${projectId}`);
        expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy();
        const localProject = (await projectResponse.json() as {
            project: Record<string, unknown>;
        }).project;
        const teamProject = { ...localProject, workspaceId: team.workspaceId, workspaceVisibility: 'private' };
        await page.route(`**/api/workspaces/${team.workspaceId}/projects?*`, r => r.fulfill({ json: { projects: [{ project: teamProject, workspaceId: team.workspaceId, visibility: 'private', resourceState: 'active', createdByWorkspaceMemberId: team.workspaceMemberId, updatedByWorkspaceMemberId: team.workspaceMemberId, currentUserAccess: { canOpen: true, canRename: true, canDelete: true, canDuplicate: true, canMoveToTeam: false, canMoveToPersonal: true, canExport: true, canSendTo: true, canRestoreVersion: true } }] } }));
        await page.route(`**/api/projects/${projectId}`, r => r.request().method() === 'GET' ? r.fulfill({ json: { project: teamProject } }) : r.fallback());
        await page.route(`**/api/projects/${projectId}/collab/status`, r => r.fulfill({ json: { publishedVersion: 2, materializedVersion: 2, awaitingFirstMaterialization: false, syncState: 'synced', ownerMemberId: team.workspaceMemberId, ownerDisplayName: 'Fixture Owner', ownerRole: 'owner', contentTransferState: null } }));
        const now = Date.now();
        const comment = { id: 'old-h2-comment', projectId, conversationId, filePath: 'index.html', elementId: 'old-cloud-id', selector: 'body > main > section > h2', label: 'h2', text: '评论定位目标', htmlHint: '<h2>', position: { x: 0, y: 0, width: 752, height: 38 }, note: '旧版本 H2 定位评论', status: 'open', anchorState: 'lost', anchoredVersion: 1, authorKind: 'user', authorKey: 'fixture-location-author', createdAt: now, updatedAt: now };
        await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments`, r => r.request().method() === 'GET' ? r.fulfill({ json: { comments: [comment] } }) : r.fallback());
        await page.route(`**/api/projects/${projectId}/conversations/${conversationId}/comments/lost-anchors`, r => r.fulfill({ json: { updated: 0 } }));
        await page.goto(`/projects/${projectId}${forceInline ? '?forceInline=1' : ''}`);
        await page.getByTestId('file-workspace').getByText('index.html', { exact: true }).first().click();
        if (!forceInline) {
            const preview = page.getByTestId('artifact-preview-frame');
            await expect(preview).toHaveAttribute('data-od-render-mode', 'url-load');
            await expect.poll(async () => {
                const src = await preview.getAttribute('src');
                const readyUrl = await page.evaluate(() => Reflect.get(window, 'commentLocationReadyUrl'));
                return !!src && readyUrl === new URL(src, page.url()).href;
            }, { message: 'URL preview comment bridge must be ready before opening comments' }).toBe(true);
        }
        await page.getByTestId('comment-panel-toggle').click();
        const row = page.getByTestId('comment-side-item').filter({ hasText: comment.note });
        await expect(row).toBeVisible();
        await row.click();
        const active = page.getByTestId('artifact-preview-frame');
        await expect(active).toHaveAttribute('data-od-active', 'true');
        await expect(active).toHaveAttribute('data-od-render-mode', forceInline ? 'srcdoc' : 'url-load');
        const frame = await (await active.elementHandle())!.contentFrame();
        if (!frame)
            throw new Error('Preview frame missing');
        const target = frame.locator('h2');
        // Both transports carry the comment bridge. Check the active iframe's
        // navigation, not bridge source text, to prove which path is exercised.
        if (forceInline) {
            await expect(active).toHaveAttribute('srcdoc', /[\s\S]+/);
            await expect.poll(() => frame.url()).toBe('about:srcdoc');
            await expect(target).toHaveAttribute('data-od-id', /^path-/);
        } else {
            await expect(active).not.toHaveAttribute('srcdoc', /[\s\S]*/);
            await expect(active).toHaveAttribute('src', new RegExp(`/api/projects/${projectId}/`));
            const src = await active.getAttribute('src');
            if (!src) throw new Error('URL preview source missing');
            await expect.poll(() => frame.url()).toBe(new URL(src, page.url()).href);
        }
        await expect(target).toBeInViewport();
        const overlay = page.getByTestId('comment-target-overlay').last();
        await expect(overlay).toBeVisible();
        await expect.poll(async () => {
            const actual = await overlay.boundingBox();
            const expected = await target.boundingBox();
            return actual && expected ? Math.max(Math.abs(actual.y - expected.y), Math.abs(actual.height - expected.height)) : 999;
        }).toBeLessThan(3);
        await frame.evaluate(() => window.scrollTo(0, 0));
        await expect(target).not.toBeInViewport();
        await row.click();
        await expect(target).toBeInViewport();
        await expect.poll(async () => {
            const actual = await overlay.boundingBox();
            const expected = await target.boundingBox();
            return actual && expected ? Math.max(Math.abs(actual.y - expected.y), Math.abs(actual.height - expected.height)) : 999;
        }).toBeLessThan(3);
        // The original target can disappear while its old annotation id is
        // still attached to the root. Neither transport may select that root.
        await target.evaluate(element => element.remove());
        const scrollBeforeMissing = await frame.evaluate(() => window.scrollY);
        await page.evaluate(() => {
            const replies: unknown[] = [];
            Reflect.set(window, 'missingLocationReplies', replies);
            window.addEventListener('message', event => {
                if (event.data?.type === 'od:comment-location-missing'
                    || (event.data?.type === 'od:comment-active-target-update' && event.data.elementId === 'old-cloud-id')) replies.push(event.data);
            });
        });
        await row.click();
        await expect.poll(() => page.evaluate(() => (Reflect.get(window, 'missingLocationReplies') as unknown[]).length)).toBeGreaterThan(0);
        await expect(page.getByTestId('comment-active-pin')).toHaveCount(0);
        await expect(page.getByTestId('comment-target-overlay')).toHaveCount(0);
        expect(await frame.evaluate(() => window.scrollY)).toBe(scrollBeforeMissing);
    });
