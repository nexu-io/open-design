import { expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildWorkspacePermissions,
	buildWorkspaceSeatSummary,
	type WorkspaceCollabContext,
} from "@open-design/contracts";
import {
	closeDatabase,
	openDatabase,
	insertProject,
	insertConversation,
	upsertPreviewComment,
	getWorkspaceProjectByProjectId,
	getConversation,
	getProjectPreviewComment,
	getPreviewComment,
	listProjectPreviewComments,
	listPreviewComments,
	deletePreviewComment,
	updatePreviewCommentStatus,
	updatePreviewCommentAnchor,
	reorderPreviewComment,
	updateProject,
} from "../src/db.js";
import { createCollabRuntime } from "../src/collab/runtime.js";
import { registerCollabSyncRoutes } from "../src/routes/collab-sync.js";
import { registerProjectCommentRoutes, registerCommentSyncStateRoutes } from "../src/routes/project/comments.js";
import { createCommentSyncStateService } from "../src/collab/comment-sync-state.js";
import { createPublicFilePublicationRecorder } from "../src/collab/public-file-publication-recording.js";
import {
	createSqlitePublicFilePublicationStore,
	migratePublicFilePublications,
} from "../src/collab/public-file-publication-store.js";
import { enqueuePublishedFileComments } from "../src/collab/published-file-comment-backfill.js";
import {
	createCommentRelayOutboxStore,
	commentRelayLocalBindingMatches,
} from "../src/collab/comment-relay-outbox.js";
import { createCollabCloudService } from "../src/collab/collab-cloud-service.js";
import { createPersonalPublishedCommentMutationHandler } from "../src/server.js";
import { createVelaCliCollabClient } from "../src/collab/vela-cli-collab-client.js";
import { commentRelayScope } from "../src/collab/comment-relay-scope.js";
import { runVelaResourceCommand } from "../src/collab/vela-cli-resource-adapter.js";
import { readVelaControlApiContext } from "../src/integrations/vela.js";
import {
	createPublicSharePublishingFixture,
	fixtureShareSlug,
} from "./public-share-publishing-fixture.js";

vi.mock(
	"../src/collab/vela-cli-resource-adapter.js",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("../src/collab/vela-cli-resource-adapter.js")
		>()),
		runVelaResourceCommand: vi.fn(),
	}),
);
vi.mock("../src/integrations/vela.js", () => ({
	readVelaControlApiContext: vi.fn(),
}));

it("server-wired mutation callback resolves the production recorder import", () => {
	const handler = createPersonalPublishedCommentMutationHandler({} as any);
	expect(handler({} as any, null, false)).toBe(true);
});

it.each([false, true])(
	"production publish HTTP uses real comment transaction; second enqueue fails=%s",
	async (fail) => {
		const root = await mkdtemp(join(tmpdir(), "od-publish-http-backfill-"));
		const db = openDatabase(root);
		const context: WorkspaceCollabContext = {
			workspaceId: "w",
			workspaceMemberId: "owner",
			workspaceType: "personal",
			role: "owner",
			memberStatus: "active",
			lifecycleState: "active",
			billingState: "active",
			planId: null,
			providerMode: "platform_credits",
			seatSummary: buildWorkspaceSeatSummary({ seatLimit: 1, usedSeats: 1 }),
			permissions: buildWorkspacePermissions({
				role: "owner",
				lifecycleState: "active",
			}),
		};
		const runtime = createCollabRuntime({
			workspaceContext: { current: async () => context },
		});
		const app = express();
		app.use(express.json());
		const server = createServer(app);
		try {
			await mkdir(join(root, "pages"));
			await writeFile(
				join(root, "pages", "local.html"),
				'<h1 data-od-id="hero">Published</h1>',
			);
			insertProject(db, {
				id: "p",
				name: "Project",
				createdAt: 1,
				updatedAt: 1,
			});
			for (const id of ["a", "b"])
				insertConversation(db, {
					id,
					projectId: "p",
					title: id,
					createdAt: 1,
					updatedAt: 1,
				});
			db.prepare(`INSERT INTO workspace_projects(project_id,workspace_id,visibility,resource_state,created_by_workspace_member_id,created_at,updated_at)
      VALUES('p','w','personal','active','owner',1,1)`).run();
			for (const [id, conversationId, filePath] of [
				["first", "a", "pages/local.html"],
				["second", "b", "pages/local.html"],
				["private", "a", "private.html"],
			]) {
				upsertPreviewComment(db, "p", conversationId!, {
					id: id!,
					note: id!,
					authorMemberId: "original-author",
					target: {
						filePath: filePath!,
						elementId: "hero",
						selector: "h1",
						label: "Hero",
						position: { x: 0, y: 0, width: 1, height: 1 },
					},
				});
			}
			migratePublicFilePublications(db);
			const store = createSqlitePublicFilePublicationStore(db);
			const queue = createCommentRelayOutboxStore(db);
			const routeRelay = createCollabCloudService({
				client: {} as any,
				commentOutbox: queue,
				listProjectIds: () => [],
				resolveLocalProjectRelayBinding: (projectId) => {
					const binding = getWorkspaceProjectByProjectId(db, projectId);
					return binding
						? {
								workspaceId: binding.workspaceId,
								ownerMemberId: binding.createdByWorkspaceMemberId,
							}
						: null;
				},
				commentRelayScope: (projectId, filePath, relayContext) =>
					commentRelayScope({
						projectId,
						filePath,
						context: relayContext,
						binding: getWorkspaceProjectByProjectId(db, projectId),
						publications: store,
					}),
				resolveLocalConversationId: () => "a",
				mergeComment: () => "unchanged",
			});
			if (fail)
				db.exec(
					"CREATE TRIGGER fail_second BEFORE INSERT ON comment_relay_outbox WHEN NEW.comment_id='second' BEGIN SELECT RAISE(ABORT,'injected queue failure'); END",
				);
			vi.mocked(readVelaControlApiContext).mockReturnValue({
				profile: "test",
				apiUrl: "https://hub.example.test",
				controlKey: "synthetic",
				user: null,
				configMtimeMs: null,
			});
			vi.mocked(runVelaResourceCommand).mockReset();
			vi.mocked(runVelaResourceCommand).mockImplementation(async (args) =>
				JSON.stringify(
					args[0] === "snapshot"
						? {
								slug: "stable-alias",
								name: "local.html",
								kind: "project",
								versionId: "v1",
								createdAt: new Date(1).toISOString(),
							}
						: { id: "v1", version: 1 },
				),
			);
			const publicationCommands: string[][] = [];
			let markStopStarted!: () => void;
			const stopStarted = new Promise<void>((resolve) => {
				markStopStarted = resolve;
			});
			let releaseStop!: () => void;
			let pauseStop = false;
			const stopGate = new Promise<void>((resolve) => {
				releaseStop = resolve;
			});
			registerCollabSyncRoutes(app, {
				collab: runtime,
				publicFilePublicationStore: store,
				...createPublicSharePublishingFixture(
					db,
					store,
					runVelaResourceCommand,
					enqueuePublishedFileComments,
					{
						commands: publicationCommands,
						beforeStop: async () => {
							if (pauseStop) {
								markStopStarted();
								await stopGate;
							}
						},
					},
				),
				recordPublicFilePublication: createPublicFilePublicationRecorder(
					db,
					store,
					enqueuePublishedFileComments,
				),
				verifyWorkspaceRequest: async (req) =>
					req.get("x-od-workspace-id") === "w" &&
					req.get("x-od-workspace-member-id") === "owner"
						? context
						: null,
				resolveSharedProject: async (projectId) => ({
					projectId,
					ownerMemberId: "owner",
					sharedAt: new Date(1).toISOString(),
				}),
				resolveSharedProjectOwner: async () => "owner",
				resolveProjectDir: () => root,
			});
			registerProjectCommentRoutes(app, {
				db,
				projectStore: { updateProject, getWorkspaceProjectByProjectId } as any,
				conversations: {
					getConversation,
					getProjectPreviewComment,
					listProjectPreviewComments,
					listPreviewComments,
					getPreviewComment,
					deletePreviewComment,
					updatePreviewCommentStatus,
					updatePreviewCommentAnchor,
					reorderPreviewComment,
					upsertPreviewComment,
				} as any,
				resolveWorkspaceContext: async () => ({ ok: true, context }),
				resolveProjectOwnerMemberId: async () => "owner",
				resolveAuthorMemberId: async () => "owner",
				isSharedProject: async () => true,
				isCommentRelayEligible: (projectId, filePath, relayContext) =>
					Boolean(
						commentRelayScope({
							projectId,
							filePath,
							context: relayContext,
							binding: getWorkspaceProjectByProjectId(db, projectId),
							publications: store,
						}),
					),
				onCommentUpdated: (comment, relayContext) =>
					relayContext
						? routeRelay.enqueueComment(comment, relayContext)
						: undefined,
				onCommentDeleted: (comment, relayContext) =>
					relayContext
						? routeRelay.enqueueCommentDeletion(comment, relayContext)
						: undefined,
				onPublishedCommentMutation:
					createPersonalPublishedCommentMutationHandler(db),
			});
			registerCommentSyncStateRoutes(app, {
				db, service: createCommentSyncStateService(db, async () => true),
				authorize: async () => ({ ok: true, context }),
			});
			await new Promise<void>((resolve) =>
				server.listen(0, "127.0.0.1", resolve),
			);
			const address = server.address();
			if (!address || typeof address === "string")
				throw new Error("HTTP listener unavailable");
			const response = await fetch(
				`http://127.0.0.1:${address.port}/api/projects/p/files/pages/local.html/publish-public`,
				{
					method: "POST",
					headers: {
						"x-od-workspace-id": "w",
						"x-od-workspace-member-id": "owner",
					},
				},
			);
			const body = (await response.json()) as Record<string, unknown>;
			expect(response.status).toBe(fail ? 502 : 200);
			expect(db.inTransaction).toBe(false);
			const commands = vi.mocked(runVelaResourceCommand).mock.calls;
			expect(commands.map((call) => call[0][0])).toEqual(["push"]);
			expect(publicationCommands.map((args) => args.slice(0, 2))).toEqual(
				fail
					? [
							["resource", "push"],
							["share", "publish"],
							["share", "stop"],
						]
					: [
							["resource", "push"],
							["share", "publish"],
						],
			);
			expect(commands.every((call) => call[1] === "w")).toBe(true);
			const scope = {
				resourceTeamId: "w",
				ownerMemberId: "owner",
				projectId: "p",
				filePath: "pages/local.html",
			};
			if (fail) {
				expect(body).toMatchObject({
					error: "PUBLIC_FILE_PUBLISH_UNAVAILABLE",
				});
				expect(store.get(scope)).toBeNull();
				expect(queue.count()).toBe(0);
				expect(
					db.prepare("SELECT * FROM comment_relay_publication_mappings").all(),
				).toEqual([]);
			} else {
				expect(body).toMatchObject({
					status: "published",
					receipt: { slug: fixtureShareSlug },
				});
				const originalRows = queue.listDue(Date.now());
				expect(originalRows.map((row) => row.comment.id)).toEqual([
					"first",
					"second",
				]);
				const remoteComments = new Map<string, any>();
				const initialDelivered: unknown[] = [];
				const initialKeys: string[] = [];
				let failFirstPush = true;
				const syncUrl = `http://127.0.0.1:${address.port}/api/projects/p/comment-sync-state?filePath=pages%2Flocal.html`;
				const readSync = async () => (await fetch(syncUrl, { headers: { "x-od-workspace-id": "w", "x-od-workspace-member-id": "owner" } })).json();
				expect(await readSync()).toMatchObject({ backfill: { state: "pending", filePath: scope.filePath } });
				const preStopRelay = createCollabCloudService({
					client: {
						isConfigured: () => true,
						listMembers: async () => [],
						registerMember: async () => ({ memberId: "owner" }),
						pushComment: async (
							_team: string,
							_project: string,
							comment: any,
							key: string,
						) => {
							if (failFirstPush) { failFirstPush = false; throw new Error("transient comment relay failure"); }
							initialDelivered.push(comment);
							initialKeys.push(key);
							if (comment.deleted) remoteComments.delete(comment.id);
							else remoteComments.set(comment.id, comment);
							return { seq: remoteComments.size + 1 };
						},
					} as any,
					commentOutbox: queue,
					listProjectIds: () => [],
					retryDelayMs: () => 0,
					resolveCommentRelayWorkspaceContext: async () => context,
					listRemoteProjectRelayBindings: async () => [
						{ projectId: "p", ownerMemberId: "owner" },
					],
					validateCommentRelayProjectBinding: (record) =>
						commentRelayLocalBindingMatches(
							record,
							getWorkspaceProjectByProjectId(db, record.projectId),
						),
					commentRelayScope: (projectId, filePath, ctx) =>
						commentRelayScope({
							projectId,
							filePath,
							context: ctx,
							binding: getWorkspaceProjectByProjectId(db, projectId),
							publications: store,
						}),
					resolveLocalConversationId: () => "a",
					mergeComment: () => "unchanged",
				});
				await preStopRelay.flushPendingComments();
				// K2: delivery failure is independent of the already committed URL. The
				// daemon background drain retries; no second publication is needed.
				expect(await readSync()).toMatchObject({ backfill: { state: "failed", retryable: true, reopened: false } });
				expect(store.get(scope)).toMatchObject({ slug: fixtureShareSlug });
				expect(publicationCommands.filter(args => args[0] === "share" && args[1] === "publish")).toHaveLength(1);
				await preStopRelay.flushPendingComments();
				expect(await readSync()).toMatchObject({ backfill: { state: "succeeded", retryable: false } });
				expect(
					[...remoteComments.values()].map((comment) => comment.id).sort(),
				).toEqual(["first", "second"]);
				const commentHeaders = {
					"x-od-workspace-id": "w",
					"x-od-workspace-member-id": "owner",
					authorization: "Bearer owner",
					"content-type": "application/json",
				};
				const activeResolve = await fetch(
					"http://127.0.0.1:" +
						address.port +
						"/api/projects/p/conversations/b/comments/second",
					{
						method: "PATCH",
						headers: commentHeaders,
						body: JSON.stringify({ status: "resolved" }),
					},
				);
				expect(activeResolve.status).toBe(200);
				await preStopRelay.flushPendingComments();
				expect(remoteComments.get("second")).toMatchObject({
					status: "resolved",
				});
				expect(
					db
						.prepare("SELECT comment_id FROM published_comment_mutations")
						.all(),
				).toEqual([]);
				preStopRelay.dispose();
				for (const row of originalRows) {
					expect(row.comment).toMatchObject({
						filePath: scope.filePath,
						memberId: "original-author",
					});
					expect(row.publication).toEqual({
						...store.getRevision(scope),
						publicFilePath: "index.html",
					});
				}
				// K3/K4: stop makes the old revision ineligible. Comments added while
				// stopped remain local; explicit no-upload resume requeues ALL of this
				// file's comments under the original slug with a fresh local witness.
				const shareUrl = `http://127.0.0.1:${address.port}/api/projects/p/files/pages/local.html/publish-public`;
				const headers = {
					"x-od-workspace-id": "w",
					"x-od-workspace-member-id": "owner",
					"content-type": "application/json",
				};
				pauseStop = true;
				const stopRequest = fetch(shareUrl, {
					method: "DELETE",
					headers,
					body: JSON.stringify({ slug: fixtureShareSlug }),
				});
				await stopStarted;
				// The ordinary outbox row is cancelled when this in-flight stop commits;
				// the durable publication-scoped journal must retain the tombstone.
				const deleteDuringStop = await fetch(
					"http://127.0.0.1:" +
						address.port +
						"/api/projects/p/conversations/a/comments/first",
					{ method: "DELETE", headers: commentHeaders },
				);
				expect(deleteDuringStop.status).toBe(200);
				releaseStop();
				expect((await stopRequest).status).toBe(200);
				expect(store.get(scope)).toBeNull();
				expect(
					originalRows.every((row) => !queue.isPublicationCurrent!(row)),
				).toBe(true);
				const resolveStopped = await fetch(
					"http://127.0.0.1:" +
						address.port +
						"/api/projects/p/conversations/b/comments/second",
					{
						method: "PATCH",
						headers: commentHeaders,
						body: JSON.stringify({ status: "open" }),
					},
				);
				expect(resolveStopped.status).toBe(200);
				const resolvePrivate = await fetch(
					"http://127.0.0.1:" +
						address.port +
						"/api/projects/p/conversations/a/comments/private",
					{
						method: "PATCH",
						headers: commentHeaders,
						body: JSON.stringify({ status: "resolved" }),
					},
				);
				expect(resolvePrivate.status).toBe(200);
				expect(
					db
						.prepare(
							"SELECT comment_id, file_path AS filePath FROM published_comment_mutations ORDER BY comment_id",
						)
						.all(),
				).toEqual([
					{ comment_id: "first", filePath: "pages/local.html" },
					{ comment_id: "second", filePath: "pages/local.html" },
				]);
				expect(queue.count()).toBe(0); // No stopped mutation is sent or queued against the revoked witness.
				upsertPreviewComment(db, "p", "b", {
					id: "while-stopped",
					note: "while-stopped",
					authorMemberId: "original-author",
					target: {
						filePath: scope.filePath,
						elementId: "hero",
						selector: "h1",
						label: "Hero",
						position: { x: 0, y: 0, width: 1, height: 1 },
					},
				});
				const resumed = await fetch(shareUrl, {
					method: "POST",
					headers,
					body: JSON.stringify({ mode: "resume" }),
				});
				expect(resumed.status).toBe(200);
				expect(await resumed.json()).toMatchObject({
					status: "published",
					receipt: body.receipt,
				});
				// Only the remotely verified stop→resume path may label this revision reopened.
				expect(await readSync()).toMatchObject({ backfill: { state: "pending", reopened: true } });
				expect(
					vi
						.mocked(runVelaResourceCommand)
						.mock.calls.map((call) => call[0][0]),
				).toEqual(["push"]);
				expect(publicationCommands.map((args) => args.slice(0, 2))).toEqual([
					["resource", "push"],
					["share", "publish"],
					["share", "stop"],
					["share", "resume-existing"],
				]);
				let rows = queue.listDue(Date.now());
				expect(rows.map((row) => row.comment.id).sort()).toEqual([
					"first",
					"second",
					"while-stopped",
				]);
				expect(
					rows.find((row) => row.comment.id === "first")?.comment.deleted,
				).toBe(true);
				expect(
					rows.find((row) => row.comment.id === "second")?.comment.status,
				).toBe("open");
				let revision = store.getRevision(scope);
				expect(revision?.slug).toBe(fixtureShareSlug);
				expect(revision?.token).not.toBe(originalRows[0]?.publication?.token);
				expect(
					rows.every(
						(row) =>
							row.publication?.token === revision?.token &&
							row.publication?.publicFilePath === "index.html",
					),
				).toBe(true);
				const firstResumeKeys = new Map(
					rows.map((row) => [row.comment.id, { key: row.eventKey, payload: JSON.stringify(row.comment) }]),
				);
				// A second stop before the offline relay succeeds cancels the first
				// resumed outbox. The journal must still remember tombstones that no
				// longer have a local preview_comments row to reconstruct from.
				expect(
					db
						.prepare(
							"SELECT comment_id FROM published_comment_mutations ORDER BY comment_id",
						)
						.all(),
				).toEqual([{ comment_id: "first" }, { comment_id: "second" }]);
				const secondStop = await fetch(shareUrl, {
					method: "DELETE",
					headers,
					body: JSON.stringify({ slug: fixtureShareSlug }),
				});
				expect(secondStop.status).toBe(200);
				expect(store.get(scope)).toBeNull();
				expect(queue.count()).toBe(0);
				expect(
					db
						.prepare(
							"SELECT comment_id FROM published_comment_mutations ORDER BY comment_id",
						)
						.all(),
				).toEqual([{ comment_id: "first" }, { comment_id: "second" }]);
				const secondResume = await fetch(shareUrl, {
					method: "POST",
					headers,
					body: JSON.stringify({ mode: "resume" }),
				});
				expect(secondResume.status).toBe(200);
				expect(await secondResume.json()).toMatchObject({
					status: "published",
					receipt: body.receipt,
				});
				expect(
					vi
						.mocked(runVelaResourceCommand)
						.mock.calls.map((call) => call[0][0]),
				).toEqual(["push"]);
				expect(publicationCommands.map((args) => args.slice(0, 2))).toEqual([
					["resource", "push"],
					["share", "publish"],
					["share", "stop"],
					["share", "resume-existing"],
					["share", "stop"],
					["share", "resume-existing"],
				]);
				rows = queue.listDue(Date.now());
				revision = store.getRevision(scope);
				expect(revision?.token).not.toBe(originalRows[0]?.publication?.token);
				expect(rows.map((row) => row.comment.id).sort()).toEqual([
					"first",
					"second",
					"while-stopped",
				]);
				expect(
					rows.find((row) => row.comment.id === "first")?.comment.deleted,
				).toBe(true);
				expect(
					rows.find((row) => row.comment.id === "second")?.comment.status,
				).toBe("open");
				expect(
					rows.every(
						(row) =>
							row.publication?.token === revision?.token &&
							row.publication?.publicFilePath === "index.html",
					),
				).toBe(true);
				expect(rows.map(row => ({ id: row.comment.id, sameKey: row.eventKey === firstResumeKeys.get(row.comment.id)?.key, samePayload: JSON.stringify(row.comment) === firstResumeKeys.get(row.comment.id)?.payload }))).toEqual(rows.map(row => ({ id: row.comment.id, sameKey: true, samePayload: true })));
				// Discard publisher objects before creating a fresh delivery service.
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
				runtime.dispose();
				closeDatabase();
				const reopened = openDatabase(root);
				const recoveredQueue = createCommentRelayOutboxStore(reopened);
				const recoveredStore = createSqlitePublicFilePublicationStore(reopened);
				expect(recoveredQueue.listDue(Date.now())).toEqual(rows);
				expect(
					recoveredQueue
						.listDue(Date.now())
						.every((row) => recoveredQueue.isPublicationCurrent!(row)),
				).toBe(true);
				let offline = true;
				const delivered: unknown[] = [];
				const deliveredKeys: string[] = [];
				const seenRemoteKeys = new Map<string, number>();
				const attempts: string[] = [];
				let loseSecondAck = true;
				const relay = createCollabCloudService({
					client: createVelaCliCollabClient({
						run: async (args, workspaceId, options) => {
							expect(args).toEqual([
								"comment",
								"push",
								"p",
								"--comment-file",
								"-",
								"--idempotency-key",
								expect.stringMatching(/^[a-f0-9-]{36}$/),
								"--historical-author-member-id",
								"original-author",
							]);
							expect(workspaceId).toBe("w");
							if (offline) throw new Error("simulated transport offline");
							if (typeof options?.input !== "string")
								throw new Error("expected serialized comment on stdin");
							const comment = JSON.parse(options.input) as any;
							const eventKey = args[6]!;
							attempts.push(eventKey);
							let seq = seenRemoteKeys.get(eventKey);
							if (seq === undefined) {
								seq = seenRemoteKeys.size + 1;
								seenRemoteKeys.set(eventKey, seq);
								delivered.push(comment);
								deliveredKeys.push(eventKey);
								if (comment.deleted) remoteComments.delete(comment.id);
								else remoteComments.set(comment.id, comment);
							}
							if (comment.id === "second" && loseSecondAck) {
								loseSecondAck = false;
								throw new Error("remote committed but ACK was lost");
							}
							return JSON.stringify({ seq });
						},
					}),
					commentOutbox: recoveredQueue,
					listProjectIds: () => [],
					retryDelayMs: () => 0,
					resolveCommentRelayWorkspaceContext: async () => context,
					listRemoteProjectRelayBindings: async () => [
						{ projectId: "p", ownerMemberId: "owner" },
					],
					validateCommentRelayProjectBinding: (record) =>
						commentRelayLocalBindingMatches(
							record,
							getWorkspaceProjectByProjectId(reopened, record.projectId),
						),
					commentRelayScope: (projectId, filePath, ctx) =>
						commentRelayScope({
							projectId,
							filePath,
							context: ctx,
							binding: getWorkspaceProjectByProjectId(reopened, projectId),
							publications: recoveredStore,
						}),
					resolveLocalConversationId: () => "a",
					mergeComment: () => "unchanged",
				});
				try {
					await relay.flushPendingComments();
					expect(delivered).toEqual([]);
					expect(recoveredQueue.count()).toBe(3);
					expect(recoveredStore.getRevision(scope)).toEqual(revision);
					offline = false;
					await relay.flushPendingComments();
					expect(delivered).toHaveLength(3);
					expect(recoveredQueue.listDue(Date.now()).map(row => row.comment.id)).toEqual(["second"]);
					await relay.flushPendingComments();
					expect(attempts.filter(key => key === deliveredKeys.find((_, i) => (delivered[i] as { id: string }).id === "second"))).toHaveLength(2);
					expect(delivered).toHaveLength(3); // Remote saw one logical event per key despite replay.
					expect(
						delivered.find((comment: any) => comment.id === "first"),
					).toMatchObject({
						id: "first",
						deleted: true,
						memberId: "original-author",
						filePath: "index.html",
						publicationSlug: fixtureShareSlug,
					});
					expect(
						delivered.find((comment: any) => comment.id === "second"),
					).toMatchObject({
						id: "second",
						status: "open",
						memberId: "original-author",
						filePath: "index.html",
						publicationSlug: fixtureShareSlug,
					});
					expect(
						delivered.find((comment: any) => comment.id === "while-stopped"),
					).toMatchObject({
						id: "while-stopped",
						memberId: "original-author",
						filePath: "index.html",
					});
					expect(remoteComments.has("first")).toBe(false);
					expect(remoteComments.get("second")).toMatchObject({
						status: "open",
						memberId: "original-author",
						filePath: "index.html",
						publicationSlug: fixtureShareSlug,
					});
					expect(remoteComments.size).toBe(2);
					expect(recoveredQueue.count()).toBe(0);
					expect(
						reopened
							.prepare("SELECT comment_id FROM published_comment_mutations")
							.all(),
					).toEqual([]);
					await relay.flushPendingComments();
					expect(delivered).toHaveLength(3);
					if (process.env.OD_K4_CAPTURE_FILE) {
						await writeFile(
							process.env.OD_K4_CAPTURE_FILE,
							JSON.stringify({
								slug: fixtureShareSlug,
								projectId: "p",
								initial: initialDelivered,
								initialKeys,
								delivered,
								deliveredKeys,
							}),
						);
					}
				} finally {
					relay.dispose();
				}
			}
		} finally {
			if (server.listening)
				await new Promise<void>((resolve, reject) =>
					server.close((error) => (error ? reject(error) : resolve())),
				);
			runtime.dispose();
			closeDatabase();
			await rm(root, { recursive: true, force: true });
			vi.clearAllMocks();
		}
	},
);
