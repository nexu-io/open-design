// Task 1.1 / 1.3 — POST /api/projects/:id/working-dir validation and success tests.
//
// Tests that:
//   - missing / invalid baseDir → 400
//   - non-existent, non-directory, root, and data-dir paths → 400
//   - valid existing directory → 200 with project metadata.baseDir set
//   - POST /api/projects still rejects direct metadata.baseDir writes

import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startServer } from "../src/server.js";

type StartedServer = { server: import("node:http").Server; url: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "../../..");

let server: import("node:http").Server | undefined;
let baseUrl: string;
let testDir: string;
let projectId: string;

beforeEach(async () => {
	testDir = await mkdtemp(path.join(os.tmpdir(), "od-working-dir-test-"));
	await mkdir(path.join(testDir, "subdir"), { recursive: true });
	await writeFile(path.join(testDir, "file.txt"), "content");

	const started = (await startServer({
		port: 0,
		returnServer: true,
	})) as StartedServer;
	server = started.server;
	baseUrl = started.url;

	// Create a project to test against
	const tmpId = `wd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	const createResp = await fetch(`${baseUrl}/api/projects`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			id: tmpId,
			name: "working-dir-test",
			metadata: { kind: "prototype" },
		}),
	});
	if (createResp.status !== 200) {
		const errBody = await createResp.text();
		throw new Error(
			`POST /api/projects failed: ${createResp.status} ${errBody}`,
		);
	}
	const created = (await createResp.json()) as { project: { id: string } };
	projectId = created.project.id;
});

afterEach(async () => {
	await new Promise<void>((resolve, reject) => {
		if (!server) return resolve();
		server.close((error?: Error) => (error ? reject(error) : resolve()));
	});
});

// ── Task 1.1: RED — invalid paths ─────────────────────────────────────────

describe("POST /api/projects/:id/working-dir — invalid paths", () => {
	it("rejects missing baseDir", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			},
		);
		expect(resp.status).toBe(400);
		const body = (await resp.json()) as { error?: { message?: string } };
		const msg = body.error?.message ?? JSON.stringify(body);
		expect(msg).toMatch(/baseDir/i);
	});

	it("rejects non-string baseDir", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: 123 }),
			},
		);
		expect(resp.status).toBe(400);
	});

	it("rejects empty baseDir", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: "   " }),
			},
		);
		expect(resp.status).toBe(400);
	});

	it("rejects non-existent path", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: "/tmp/does-not-exist-12345" }),
			},
		);
		expect(resp.status).toBe(400);
		const body = (await resp.json()) as { error?: { message?: string } };
		const msg = body.error?.message ?? JSON.stringify(body);
		expect(msg).toMatch(/folder not found/i);
	});

	it("rejects a file path (not a directory)", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: path.join(testDir, "file.txt") }),
			},
		);
		expect(resp.status).toBe(400);
		const body = (await resp.json()) as { error?: { message?: string } };
		const msg = body.error?.message ?? JSON.stringify(body);
		expect(msg).toMatch(/directory/i);
	});

	it("rejects filesystem root", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: "/" }),
			},
		);
		expect(resp.status).toBe(400);
		const body = (await resp.json()) as { error?: { message?: string } };
		const msg = body.error?.message ?? JSON.stringify(body);
		expect(msg).toMatch(/root/i);
	});

	it("rejects daemon data directory", async () => {
		const dataDir = process.env.OD_DATA_DIR
			? path.resolve(projectRoot, process.env.OD_DATA_DIR)
			: path.join(projectRoot, ".od");
		let canonical: string;
		try {
			canonical = await realpath(dataDir);
		} catch {
			canonical = dataDir;
		}
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: canonical }),
			},
		);
		expect(resp.status).toBe(400);
		const body = (await resp.json()) as { error?: { message?: string } };
		const msg = body.error?.message ?? JSON.stringify(body);
		expect(msg).toMatch(/data.?dir/i);
	});
});

// ── Task 1.3: GREEN — success without token ──────────────────────────────

describe("POST /api/projects/:id/working-dir — success", () => {
	it("accepts a valid existing directory without any desktop token", async () => {
		const resp = await fetch(
			`${baseUrl}/api/projects/${projectId}/working-dir`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ baseDir: testDir }),
			},
		);
		expect(resp.status).toBe(200);
		const body = (await resp.json()) as {
			project?: { metadata?: Record<string, unknown> };
			baseDir?: string;
		};
		expect(body.baseDir).toBe(testDir);
		expect(body.project?.metadata?.baseDir).toBe(testDir);
	});

	it("still rejects POST /api/projects with direct metadata.baseDir", async () => {
		const resp = await fetch(`${baseUrl}/api/projects`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				id: `should-fail-${Date.now()}`,
				name: "should-fail",
				metadata: { kind: "prototype", baseDir: "/tmp" },
			}),
		});
		expect(resp.status).toBe(400);
		const body = (await resp.json()) as { error?: { message?: string } };
		const msg = body.error?.message ?? JSON.stringify(body);
		expect(msg).toMatch(/baseDir/i);
	});
});
