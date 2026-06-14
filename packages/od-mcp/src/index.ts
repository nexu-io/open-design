#!/usr/bin/env node
/**
 * od-mcp — MCP server bridging Claude Code to Open Design.
 *
 * Implements the Model Context Protocol over stdio (JSON-RPC 2.0).
 * Uses Node's built-in readline for line-oriented JSON parsing.
 *
 * Registration:
 *   claude mcp add od-design -- npx @open-design/od-mcp
 */

import { createInterface } from "node:readline";
import { discoverDaemonUrl } from "./daemon-discovery.js";
import { DaemonClient } from "./daemon-client.js";
import { tools, handleToolCall } from "./tools.js";

// ── JSON-RPC 2.0 standard error codes ──

const ERR_PARSE = -32700;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

// ── Types ──

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Lazy daemon client (promise-guarded so concurrent calls don't
//     race on discovery + construction) ──

let clientPromise: Promise<DaemonClient> | null = null;

function getClient(): Promise<DaemonClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const url = await discoverDaemonUrl();
      process.stderr.write(`[od-mcp] connected to ${url}\n`);
      return new DaemonClient(url);
    })();
  }
  return clientPromise;
}

// ── Response helpers ──

function respond(response: JsonRpcResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function errorResponse(
  id: number | string,
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRequest(req: JsonRpcRequest): Promise<void> {
  try {
    switch (req.method) {
      case "initialize":
        respond({
          jsonrpc: "2.0",
          id: req.id,
          result: {
            protocolVersion: "2025-03-26",
            serverInfo: { name: "od-mcp", version: "0.1.0" },
            capabilities: { tools: {} },
          },
        });
        break;

      case "tools/list": {
        respond({
          jsonrpc: "2.0",
          id: req.id,
          result: { tools },
        });
        break;
      }

      case "tools/call": {
        const params = req.params as {
          name: string;
          arguments?: Record<string, unknown>;
        };
        if (!params?.name) {
          respond(
            errorResponse(req.id, ERR_INVALID_PARAMS, "Missing tool name"),
          );
          return;
        }
        const client = await getClient();
        const result = await handleToolCall(
          params.name,
          params.arguments ?? {},
          client,
        );
        respond({ jsonrpc: "2.0", id: req.id, result });
        break;
      }

      case "notifications/initialized":
        // Notification — no response
        break;

      default:
        respond(
          errorResponse(
            req.id,
            ERR_METHOD_NOT_FOUND,
            `Unknown method: ${req.method}`,
          ),
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    respond(errorResponse(req.id ?? 0, ERR_INTERNAL, message));
  }
}

// ── Main loop (readline-based, canonical Node.js pattern) ──

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

process.stderr.write("[od-mcp] server started\n");

for await (const line of rl) {
  const trimmed = line.trim();
  if (!trimmed) continue;
  try {
    const req = JSON.parse(trimmed) as JsonRpcRequest;
    await handleRequest(req);
  } catch {
    process.stderr.write(`[od-mcp] failed to parse: ${trimmed}\n`);
  }
}

process.stderr.write("[od-mcp] stdin closed, exiting\n");
process.exit(0);
