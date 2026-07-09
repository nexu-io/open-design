import path from "node:path";
import {
  DEFAULT_MODEL_OPTION,
  execAgentFile,
  parsePiModels,
} from "./shared.js";
import type { RuntimeAgentDef } from "../types.js";

export const kimchiAgentDef = {
  id: "kimchi",
  name: "Kimchi",
  bin: "kimchi",
  versionArgs: ["--version"],
  // Kimchi is built on the pi-mono SDK (same engine as pi), so it inherits
  // pi's `--mode rpc` JSON-RPC-over-stdio transport, `--list-models` TSV
  // output, `--thinking` levels, and `--append-system-prompt` for extra
  // directories. Using pi-rpc instead of ACP gives us multimodal image
  // support, reasoning levels, richer event stream, and avoids the ACP
  // `mcpServers` rejection issue.
  versionProbeTimeoutMs: 15_000,
  fetchModels: async (resolvedBin, env) => {
    try {
      // Unlike pi (which prints to stderr), kimchi outputs the TSV table
      // to stdout. Stderr carries config permission warnings only.
      const { stdout } = await execAgentFile(resolvedBin, ["--list-models"], {
        env,
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const parsed = parsePiModels(stdout);
      if (!parsed || parsed.length === 0) return null;
      return parsed;
    } catch {
      return null;
    }
  },
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: "kimi-k2.7", label: "kimi-k2.7" },
    { id: "minimax-m3", label: "minimax-m3" },
    { id: "deepseek-v4-flash", label: "deepseek-v4-flash" },
  ],
  reasoningOptions: [
    { id: "default", label: "Default" },
    { id: "off", label: "Off" },
    { id: "minimal", label: "Minimal" },
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High" },
    { id: "xhigh", label: "XHigh" },
  ],
  buildArgs: (_prompt, _imagePaths, extraAllowedDirs = [], options = {}) => {
    const args = ["--mode", "rpc"];
    if (options.model && options.model !== "default") {
      args.push("--model", options.model);
    }
    if (options.reasoning && options.reasoning !== "default") {
      args.push("--thinking", options.reasoning);
    }
    const dirs = (extraAllowedDirs || []).filter(
      (d) => typeof d === "string" && path.isAbsolute(d),
    );
    for (const d of dirs) {
      args.push("--append-system-prompt", d);
    }
    return args;
  },
  promptViaStdin: true,
  streamFormat: "pi-rpc",
  supportsImagePaths: true,
  installUrl: "https://kimchi.dev",
  docsUrl: "https://docs.kimchi.dev",
} satisfies RuntimeAgentDef;
