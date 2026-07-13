import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildAssistantMessageUpdate,
  cancelTimedOutRun,
  createRunTimeoutError,
  dedupeDesignSystemIds,
  resolveDryRunDesignSystems,
  validateExplicitDesignSystemIds,
} from "./batch-design-system-test.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

test("dedupeDesignSystemIds trims and preserves first-seen order", () => {
  assert.deepEqual(dedupeDesignSystemIds([" default ", "kami", "default", "", "kami "]), ["default", "kami"]);
});

test("validateExplicitDesignSystemIds rejects unknown design system ids", () => {
  assert.throws(
    () => validateExplicitDesignSystemIds(["default", "typo"], ["default", "kami"]),
    /unknown design system id\(s\): typo/,
  );
});

test("validateExplicitDesignSystemIds returns the normalized explicit ids when all exist", () => {
  assert.deepEqual(validateExplicitDesignSystemIds([" default ", "kami", "default"], ["default", "kami"]), ["default", "kami"]);
});

test("resolveDryRunDesignSystems normalizes explicit ids without daemon access", () => {
  assert.deepEqual(resolveDryRunDesignSystems({ designSystems: [" default ", "kami", "default"] }), ["default", "kami"]);
});

test("resolveDryRunDesignSystems rejects --all-design-systems in dry-run mode", () => {
  assert.throws(
    () => resolveDryRunDesignSystems({ allDesignSystems: true }),
    /dry-run with --all-design-systems still requires daemon access/,
  );
});

test("buildAssistantMessageUpdate persists the daemon run id on queued assistant rows", () => {
  assert.deepEqual(
    buildAssistantMessageUpdate({
      agentId: "claude",
      runId: "run-123",
      runStatus: "queued",
      createdAt: 123,
    }),
    {
      role: "assistant",
      content: "",
      agentId: "claude",
      agentName: "claude",
      runId: "run-123",
      runStatus: "queued",
      startedAt: 123,
      createdAt: 123,
    },
  );
});

test("buildAssistantMessageUpdate keeps the daemon run id on final assistant updates", () => {
  assert.deepEqual(
    buildAssistantMessageUpdate({
      agentId: "claude",
      runId: "run-123",
      runStatus: "succeeded",
      createdAt: 123,
      content: "done",
      endedAt: 456,
      producedFiles: [{ path: "index.html" }],
    }),
    {
      role: "assistant",
      content: "done",
      agentId: "claude",
      agentName: "claude",
      runId: "run-123",
      runStatus: "succeeded",
      startedAt: 123,
      createdAt: 123,
      endedAt: 456,
      producedFiles: [{ path: "index.html" }],
    },
  );
});

test("cancelTimedOutRun posts to the daemon cancel endpoint for timeout errors", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const canceled = await cancelTimedOutRun("http://127.0.0.1:4321", createRunTimeoutError("run-123", 5000, "running"));
    assert.equal(canceled, true);
    assert.deepEqual(calls, [
      {
        url: "http://127.0.0.1:4321/api/runs/run-123/cancel",
        init: {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cancelTimedOutRun ignores non-timeout errors", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not be called");
  }) as typeof fetch;

  try {
    const canceled = await cancelTimedOutRun("http://127.0.0.1:4321", new Error("not a timeout"));
    assert.equal(canceled, false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CLI dry-run with explicit design systems succeeds without daemon discovery", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      path.join(HERE, "batch-design-system-test.ts"),
      "--prompt",
      "Test prompt",
      "--design-systems",
      "default,kami",
      "--dry-run",
    ],
    {
      cwd: path.resolve(HERE, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        OD_DAEMON_URL: "",
        OD_PORT: "",
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /design systems \(2\): default, kami/);
  assert.doesNotMatch(result.stdout + result.stderr, /cannot determine daemon URL/);
});
