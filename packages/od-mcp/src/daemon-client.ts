/**
 * Thin HTTP client wrapping the Open Design daemon REST API.
 *
 * Only the endpoints needed by the MCP tools are exposed here. The daemon
 * URL is discovered once at startup via daemon-discovery.ts.
 *
 * API response shapes verified against a live daemon (2026-06-10).
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { findProjectRoot } from "./daemon-discovery.js";

// ── Constants ──

const DEFAULT_SKILL_ID = "canvas-design";
const DEFAULT_AGENT_ID = "claude";

// ── API response shapes (unwrapped) ──

export interface DesignSystemItem {
  id: string;
  title: string;
}

interface ProjectCreateResponse {
  project: {
    id: string;
    name: string;
    skillId: string;
    designSystemId: string;
  };
  conversationId: string;
}

export interface ProjectFile {
  path: string;
  size: number;
}

// ── Helpers ──

function projectDir(projectId: string): string {
  const root = findProjectRoot();
  return join(root, ".od", "projects", projectId);
}

async function throwOnErrorResponse(
  resp: Response,
  context: string,
): Promise<never> {
  const payload = await resp.json().catch(() => ({}));
  const err = (payload as { error?: { message?: string } })?.error;
  throw new Error(err?.message ?? `${context}: HTTP ${resp.status}`);
}

// ── Client ──

export class DaemonClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let resp: Response;
    try {
      resp = await fetch(this.url(path), {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot reach Open Design daemon at ${this.baseUrl} (${message}). ` +
          `Start it with: pnpm tools-dev start --prod`,
      );
    }

    if (!resp.ok) {
      await throwOnErrorResponse(resp, `${method} ${path}`);
    }

    return resp.json() as Promise<T>;
  }

  // ── Design systems ──

  async listDesignSystems(): Promise<DesignSystemItem[]> {
    const raw = await this.request<{
      designSystems: DesignSystemItem[];
    }>("GET", "/api/design-systems");
    return raw.designSystems;
  }

  // ── Projects ──

  /**
   * Create a new project with the given design system and skill.
   * The daemon requires a client-generated id.
   */
  async createProject(params: {
    name: string;
    designSystemId: string;
    skillId?: string;
  }): Promise<{
    projectId: string;
    projectDir: string;
    conversationId: string;
  }> {
    const id = `od-mcp-${randomUUID().split("-")[0]}`;
    const raw = await this.request<ProjectCreateResponse>(
      "POST",
      "/api/projects",
      {
        id,
        name: params.name,
        designSystemId: params.designSystemId,
        skillId: params.skillId ?? DEFAULT_SKILL_ID,
      },
    );
    return {
      projectId: raw.project.id,
      projectDir: projectDir(raw.project.id),
      conversationId: raw.conversationId,
    };
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const raw = await this.request<{ files: ProjectFile[] }>(
      "GET",
      `/api/projects/${encodeURIComponent(projectId)}/files`,
    );
    return raw.files;
  }

  // ── Design agent run ──

  /**
   * Launch a design agent and wait for it to complete.
   *
   * POSTs to /api/chat and consumes the SSE response until the stream
   * ends or the deadline expires. Each read is individually gated by a
   * timeout so a hung daemon doesn't block indefinitely.
   */
  async runDesignAgent(
    projectId: string,
    conversationId: string,
    prompt: string,
    options?: {
      agentId?: string;
      maxWaitSeconds?: number;
    },
  ): Promise<ProjectFile[]> {
    const agentId = options?.agentId ?? DEFAULT_AGENT_ID;
    const maxWaitSeconds = options?.maxWaitSeconds ?? 180;
    const deadline = Date.now() + maxWaitSeconds * 1000;

    const resp = await fetch(this.url("/api/chat"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        conversationId,
        agentId,
        message: prompt,
      }),
    });

    if (!resp.ok) {
      await throwOnErrorResponse(resp, "Design agent launch");
    }

    if (!resp.body) {
      throw new Error("Design agent returned no response body");
    }

    // Consume SSE stream until the daemon closes it or the deadline fires.
    // Each read is individually gated via Promise.race so a hung daemon
    // doesn't cause this method to block past the deadline.
    const reader = resp.body
      .pipeThrough(new TextDecoderStream())
      .getReader();

    try {
      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        const done: boolean = await Promise.race([
          reader.read().then((r) => r.done ?? false),
          new Promise<boolean>((_, reject) =>
            setTimeout(
              () => reject(new Error("SSE read timed out")),
              Math.max(remaining, 1),
            ),
          ),
        ]);
        if (done) break;
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message === "SSE read timed out"
      ) {
        throw new Error(
          `Design agent did not complete within ${maxWaitSeconds}s`,
        );
      }
      throw err;
    } finally {
      reader.cancel();
    }

    return this.getProjectFiles(projectId);
  }
}
