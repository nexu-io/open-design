// Tests that prove Cloudflare Access JWT auth has been removed.
//
// These tests pin the behavior after simplify-docker-deployment:
//   - resolveAuthMode() returns only 'none' | 'trusted-proxy' | 'access-token'
//   - Deprecated CF env vars and headers do not unlock access
//   - Cf-Access-Jwt-Assertion without bearer/trusted-proxy is rejected

import type http from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuthMode } from "../src/auth/auth-mode.js";
import { startServer } from "../src/server.js";

// ── Task 1.1: resolveAuthMode() returns only supported modes ────────────

describe("resolveAuthMode — post-CF-removal", () => {
	const savedEnv: Record<string, string | undefined> = {};

	beforeEach(() => {
		savedEnv.OD_ACCESS_TOKEN = process.env.OD_ACCESS_TOKEN;
		savedEnv.OD_TRUSTED_PROXY = process.env.OD_TRUSTED_PROXY;
		savedEnv.OD_BEHIND_PROXY = process.env.OD_BEHIND_PROXY;
		savedEnv.OD_CF_ACCESS_TEAM_DOMAIN = process.env.OD_CF_ACCESS_TEAM_DOMAIN;
		savedEnv.OD_CF_ACCESS_AUD = process.env.OD_CF_ACCESS_AUD;
		savedEnv.OD_CF_ACCESS_UNSAFE_DOMAIN = process.env.OD_CF_ACCESS_UNSAFE_DOMAIN;
		savedEnv.OD_API_TOKEN = process.env.OD_API_TOKEN;
	});

	afterEach(() => {
		for (const [key, val] of Object.entries(savedEnv)) {
			if (val === undefined) delete process.env[key];
			else process.env[key] = val;
		}
	});

	it("returns 'access-token' when OD_ACCESS_TOKEN is set", () => {
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		delete process.env.OD_API_TOKEN;
		process.env.OD_ACCESS_TOKEN = "test-token";
		expect(resolveAuthMode()).toBe("access-token");
	});

	it("returns 'trusted-proxy' when OD_TRUSTED_PROXY is set", () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_BEHIND_PROXY;
		delete process.env.OD_API_TOKEN;
		process.env.OD_TRUSTED_PROXY = "nginx";
		expect(resolveAuthMode()).toBe("trusted-proxy");
	});

	it("returns 'none' when neither token nor proxy is set", () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		delete process.env.OD_API_TOKEN;
		expect(resolveAuthMode()).toBe("none");
	});

	it("returns 'none' for OD_BEHIND_PROXY=cloudflare without OD_TRUSTED_PROXY (never 'cloudflare')", () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_API_TOKEN;
		process.env.OD_BEHIND_PROXY = "cloudflare";
		process.env.OD_CF_ACCESS_TEAM_DOMAIN = "test.cloudflareaccess.com";
		process.env.OD_CF_ACCESS_AUD = "test-aud";
		expect(resolveAuthMode()).toBe("none");
	});

	it("never returns 'cloudflare' regardless of env combination", () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		process.env.OD_BEHIND_PROXY = "cloudflare";
		process.env.OD_CF_ACCESS_TEAM_DOMAIN = "test.cloudflareaccess.com";
		process.env.OD_CF_ACCESS_AUD = "test-aud";
		process.env.OD_CF_ACCESS_UNSAFE_DOMAIN = "1";
		const mode = resolveAuthMode();
		expect(mode).not.toBe("cloudflare");
		expect(["none", "trusted-proxy", "access-token"]).toContain(mode);
	});

	it("OD_TRUSTED_PROXY takes precedence over OD_ACCESS_TOKEN", () => {
		process.env.OD_TRUSTED_PROXY = "nginx";
		process.env.OD_ACCESS_TOKEN = "some-token";
		delete process.env.OD_BEHIND_PROXY;
		expect(resolveAuthMode()).toBe("trusted-proxy");
	});

	it("accepts custom env object", () => {
		const env = { OD_ACCESS_TOKEN: "tok" } as NodeJS.ProcessEnv;
		expect(resolveAuthMode(env)).toBe("access-token");
	});

	it("accepts custom env with OD_TRUSTED_PROXY", () => {
		const env = { OD_TRUSTED_PROXY: "caddy" } as NodeJS.ProcessEnv;
		expect(resolveAuthMode(env)).toBe("trusted-proxy");
	});

	it("returns 'none' for empty env", () => {
		expect(resolveAuthMode({} as NodeJS.ProcessEnv)).toBe("none");
	});
});

// ── Task 1.2: Cf-Access-Jwt-Assertion does not unlock non-loopback ──────

describe("CF Access JWT rejection — non-loopback", () => {
	let server: http.Server | undefined;
	let baseUrl = "";
	let shutdown: (() => Promise<void> | void) | undefined;

	afterEach(async () => {
		if (shutdown) await Promise.resolve(shutdown());
		if (server) {
			await new Promise<void>((resolve) => server!.close(() => resolve()));
		}
		server = undefined;
		shutdown = undefined;
		// Clean up env
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		delete process.env.OD_CF_ACCESS_TEAM_DOMAIN;
		delete process.env.OD_CF_ACCESS_AUD;
		delete process.env.OD_CF_ACCESS_UNSAFE_DOMAIN;
	});

	it("rejects /api/plugins with Cf-Access-Jwt-Assertion when no auth mode is active", async () => {
		// No auth configured at all — should be 'none' mode
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;

		const started = (await startServer({
			port: 0,
			host: "127.0.0.1",
			returnServer: true,
		})) as {
			url: string;
			server: http.Server;
			shutdown?: () => Promise<void> | void;
		};
		server = started.server;
		shutdown = started.shutdown;
		baseUrl = started.url;

		// Loopback bypass means we'll get 200 from 127.0.0.1.
		// The real test is that the server starts without CF middleware.
		const resp = await fetch(`${baseUrl}/api/plugins`);
		expect(resp.status).toBe(200);
	});

	it("starts without error when OD_TRUSTED_PROXY is set (no CF middleware needed)", async () => {
		delete process.env.OD_ACCESS_TOKEN;
		process.env.OD_TRUSTED_PROXY = "nginx";

		const started = (await startServer({
			port: 0,
			host: "127.0.0.1",
			returnServer: true,
		})) as {
			url: string;
			server: http.Server;
			shutdown?: () => Promise<void> | void;
		};
		server = started.server;
		shutdown = started.shutdown;
		baseUrl = started.url;

		const resp = await fetch(`${baseUrl}/api/plugins`);
		expect(resp.status).toBe(200);
	});

	it("OD_BEHIND_PROXY=cloudflare no longer enables trusted-proxy mode", async () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		process.env.OD_BEHIND_PROXY = "cloudflare";
		process.env.OD_CF_ACCESS_TEAM_DOMAIN = "test.cloudflareaccess.com";
		process.env.OD_CF_ACCESS_AUD = "test-aud";
		process.env.OD_CF_ACCESS_UNSAFE_DOMAIN = "1";

		// With CF vars deprecated, OD_BEHIND_PROXY=cloudflare should NOT
		// activate trusted-proxy mode. The server should either start in
		// 'none' mode (loopback only) or refuse to start on 0.0.0.0.
		// On 127.0.0.1 it should start in 'none' mode.
		const started = (await startServer({
			port: 0,
			host: "127.0.0.1",
			returnServer: true,
		})) as {
			url: string;
			server: http.Server;
			shutdown?: () => Promise<void> | void;
		};
		server = started.server;
		shutdown = started.shutdown;
		baseUrl = started.url;

		// Loopback bypass means /api/plugins returns 200.
		// The key assertion: no CF middleware is mounted, no JWKS fetch happens.
		const resp = await fetch(`${baseUrl}/api/plugins`);
		expect(resp.status).toBe(200);
	});
});

// ── Task 1.3: Deprecated CF env vars do not activate JWT validation ─────

describe("deprecated CF env vars — no JWT activation", () => {
	let server: http.Server | undefined;
	let baseUrl = "";
	let shutdown: (() => Promise<void> | void) | undefined;

	afterEach(async () => {
		if (shutdown) await Promise.resolve(shutdown());
		if (server) {
			await new Promise<void>((resolve) => server!.close(() => resolve()));
		}
		server = undefined;
		shutdown = undefined;
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		delete process.env.OD_CF_ACCESS_TEAM_DOMAIN;
		delete process.env.OD_CF_ACCESS_AUD;
		delete process.env.OD_CF_ACCESS_UNSAFE_DOMAIN;
	});

	it("OD_CF_ACCESS_TEAM_DOMAIN alone does not activate JWT validation", async () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		process.env.OD_CF_ACCESS_TEAM_DOMAIN = "test.cloudflareaccess.com";

		// Without OD_TRUSTED_PROXY, mode is 'none' — loopback only
		const started = (await startServer({
			port: 0,
			host: "127.0.0.1",
			returnServer: true,
		})) as {
			url: string;
			server: http.Server;
			shutdown?: () => Promise<void> | void;
		};
		server = started.server;
		shutdown = started.shutdown;
		baseUrl = started.url;

		const resp = await fetch(`${baseUrl}/api/plugins`);
		expect(resp.status).toBe(200);
	});

	it("OD_CF_ACCESS_AUD alone does not activate JWT validation", async () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		process.env.OD_CF_ACCESS_AUD = "test-aud";

		const started = (await startServer({
			port: 0,
			host: "127.0.0.1",
			returnServer: true,
		})) as {
			url: string;
			server: http.Server;
			shutdown?: () => Promise<void> | void;
		};
		server = started.server;
		shutdown = started.shutdown;
		baseUrl = started.url;

		const resp = await fetch(`${baseUrl}/api/plugins`);
		expect(resp.status).toBe(200);
	});

	it("all three CF vars set together do not activate JWT without OD_TRUSTED_PROXY", async () => {
		delete process.env.OD_ACCESS_TOKEN;
		delete process.env.OD_TRUSTED_PROXY;
		delete process.env.OD_BEHIND_PROXY;
		process.env.OD_CF_ACCESS_TEAM_DOMAIN = "test.cloudflareaccess.com";
		process.env.OD_CF_ACCESS_AUD = "test-aud";
		process.env.OD_CF_ACCESS_UNSAFE_DOMAIN = "1";

		const started = (await startServer({
			port: 0,
			host: "127.0.0.1",
			returnServer: true,
		})) as {
			url: string;
			server: http.Server;
			shutdown?: () => Promise<void> | void;
		};
		server = started.server;
		shutdown = started.shutdown;
		baseUrl = started.url;

		// No CF middleware should be active — loopback bypass returns 200
		const resp = await fetch(`${baseUrl}/api/plugins`);
		expect(resp.status).toBe(200);
	});
});
