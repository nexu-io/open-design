import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type CollabCloudFixtureServer,
  startCollabCloudFixtureServer,
} from "../src/collab-cloud-fixture.js";

const TOKEN = "dev-internal-token";

let server: CollabCloudFixtureServer | null = null;

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await toClose.close();
  }
});

function headers(token: string | null = TOKEN): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (token != null) h.authorization = `Bearer ${token}`;
  return h;
}

async function call(
  method: string,
  path: string,
  body?: unknown,
  token: string | null = TOKEN,
  extra?: Record<string, string>,
): Promise<{ status: number; json: any; etag: string | null }> {
  const res = await fetch(`${server!.info.origin}${path}`, {
    method,
    headers: { ...headers(token), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {}, etag: res.headers.get("etag") };
}

function comment(id: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    projectId: "p1",
    conversationId: "conv-a",
    memberId: "m-author",
    seq: 0,
    note: `note ${id}`,
    filePath: "index.html",
    elementId: "hero",
    selector: '[data-od-id="hero"]',
    label: "h1.hero",
    text: "Hero",
    htmlHint: "<h1>",
    position: { x: 1, y: 2, width: 3, height: 4 },
    status: "open",
    createdAt: 100,
    updatedAt: 100,
    ...patch,
  };
}

describe("collab-cloud fixture", () => {
  it("rejects a request with no / wrong bearer token", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    const none = await call("GET", "/teams/t1/members", undefined, null);
    expect(none.status).toBe(401);
    const wrong = await call("GET", "/teams/t1/members", undefined, "nope");
    expect(wrong.status).toBe(401);
  });

  it("upserts + lists member directory entries with role", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    const put = await call("PUT", "/teams/t1/members/m1", { displayName: "琼羽", role: "owner" });
    expect(put.status).toBe(200);
    expect(put.json.member).toEqual({ memberId: "m1", displayName: "琼羽", role: "owner" });

    // Idempotent update: same member id, new name.
    await call("PUT", "/teams/t1/members/m1", { displayName: "琼羽 II", role: "owner" });
    await call("PUT", "/teams/t1/members/m2", { displayName: "麻薯", role: "member" });

    const list = await call("GET", "/teams/t1/members");
    expect(list.status).toBe(200);
    expect(list.json.members).toEqual(
      expect.arrayContaining([
        { memberId: "m1", displayName: "琼羽 II", role: "owner" },
        { memberId: "m2", displayName: "麻薯", role: "member" },
      ]),
    );
    expect(list.json.members).toHaveLength(2);
  });

  it("defaults displayName to the id and role to member", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    await call("PUT", "/teams/t1/members/m9", {});
    const list = await call("GET", "/teams/t1/members");
    expect(list.json.members).toEqual([{ memberId: "m9", displayName: "m9", role: "member" }]);
  });

  it("assigns a monotonic seq and pulls incrementally by sinceSeq", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    const a = await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1") });
    const b = await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c2") });
    expect(a.json.seq).toBe(1);
    expect(b.json.seq).toBe(2);

    const all = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=0");
    expect(all.json.latestSeq).toBe(2);
    expect(all.json.comments.map((c: any) => c.id)).toEqual(["c1", "c2"]);
    // Author id survives the round-trip (who wrote it, for cross-member display).
    expect(all.json.comments[0].memberId).toBe("m-author");

    const incremental = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=1");
    expect(incremental.json.comments.map((c: any) => c.id)).toEqual(["c2"]);
    expect(incremental.json.latestSeq).toBe(2);
  });

  it("upserts by comment id: a re-push replaces the payload at a fresh head seq", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    const first = await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1") });
    const again = await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1", { note: "edited" }) });
    expect(first.json.seq).toBe(1);
    // The edit re-stamps the record at a new head seq so pollers re-pull it.
    expect(again.json.seq).toBe(2);
    const all = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=0");
    // Still one record per id — the edit overwrote, it did not duplicate.
    expect(all.json.comments).toHaveLength(1);
    expect(all.json.comments[0].note).toBe("edited");
    expect(all.json.comments[0].seq).toBe(2);

    // A poller that already saw seq 1 re-pulls the edited record at seq 2.
    const incremental = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=1");
    expect(incremental.json.comments.map((c: any) => c.id)).toEqual(["c1"]);
    expect(incremental.json.comments[0].note).toBe("edited");
  });

  it("carries a delete tombstone (deleted: true) through as an updated record", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1") });
    const tomb = await call("POST", "/teams/t1/projects/p1/comments", {
      comment: comment("c1", { deleted: true }),
    });
    expect(tomb.json.seq).toBe(2);
    const all = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=0");
    expect(all.json.comments).toHaveLength(1);
    expect(all.json.comments[0].deleted).toBe(true);
    // A poller past the create still receives the tombstone.
    const incremental = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=1");
    expect(incremental.json.comments.map((c: any) => c.id)).toEqual(["c1"]);
    expect(incremental.json.comments[0].deleted).toBe(true);
  });

  it("carries the anchor payload + drift-ladder fields opaquely", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    await call("POST", "/teams/t1/projects/p1/comments", {
      comment: comment("c1", {
        anchorState: "reanchored",
        anchoredVersion: 7,
        lastGoodPosition: { x: 5, y: 6, width: 7, height: 8 },
        style: { color: "#f00" },
      }),
    });
    const all = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=0");
    const c = all.json.comments[0];
    expect(c.anchorState).toBe("reanchored");
    expect(c.anchoredVersion).toBe(7);
    expect(c.lastGoodPosition).toEqual({ x: 5, y: 6, width: 7, height: 8 });
    expect(c.style).toEqual({ color: "#f00" });
  });

  it("isolates comments + members by team", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1") });
    await call("PUT", "/teams/t1/members/m1", { displayName: "A", role: "owner" });

    const otherComments = await call("GET", "/teams/t2/projects/p1/comments?sinceSeq=0");
    expect(otherComments.json.comments).toEqual([]);
    expect(otherComments.json.latestSeq).toBe(0);
    const otherMembers = await call("GET", "/teams/t2/members");
    expect(otherMembers.json.members).toEqual([]);
  });

  it("supports ETag / If-None-Match → 304 when nothing changed", async () => {
    server = await startCollabCloudFixtureServer({ token: TOKEN });
    await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1") });
    const first = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=0");
    expect(first.etag).toBeTruthy();

    // Poller caught up (sinceSeq === latestSeq) and presents the ETag → 304.
    const notModified = await call(
      "GET",
      "/teams/t1/projects/p1/comments?sinceSeq=1",
      undefined,
      TOKEN,
      { "if-none-match": first.etag! },
    );
    expect(notModified.status).toBe(304);

    // A new comment moves the head → the same ETag no longer matches.
    await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c2") });
    const moved = await call(
      "GET",
      "/teams/t1/projects/p1/comments?sinceSeq=1",
      undefined,
      TOKEN,
      { "if-none-match": first.etag! },
    );
    expect(moved.status).toBe(200);
    expect(moved.json.comments.map((c: any) => c.id)).toEqual(["c2"]);
  });

  it("persists to a store file and reloads it on restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "od-collab-store-"));
    const storePath = join(dir, "collab-cloud.json");
    try {
      // First run: seed a member + a comment, then shut down.
      server = await startCollabCloudFixtureServer({ token: TOKEN, store: storePath });
      await call("PUT", "/teams/t1/members/m1", { displayName: "琼羽", role: "owner" });
      await call("POST", "/teams/t1/projects/p1/comments", { comment: comment("c1") });
      // The state landed on disk as JSON.
      const persisted = JSON.parse(readFileSync(storePath, "utf8"));
      expect(persisted.teams.t1.members[0].memberId).toBe("m1");
      expect(persisted.teams.t1.projects.p1.comments[0].id).toBe("c1");
      await server.close();
      server = null;

      // Second run against the same store: the seeded data is still there.
      server = await startCollabCloudFixtureServer({ token: TOKEN, store: storePath });
      const members = await call("GET", "/teams/t1/members");
      expect(members.json.members).toEqual([{ memberId: "m1", displayName: "琼羽", role: "owner" }]);
      const comments = await call("GET", "/teams/t1/projects/p1/comments?sinceSeq=0");
      expect(comments.json.comments.map((c: any) => c.id)).toEqual(["c1"]);
      expect(comments.json.latestSeq).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
