import { detectAcpModels, DEFAULT_MODEL_OPTION } from "./shared.js";
import type { RuntimeAgentDef } from "../types.js";

export const kimchiAgentDef = {
  id: "kimchi",
  name: "Kimchi",
  bin: "kimchi",
  versionArgs: ["--version"],
  fallbackModels: [
    DEFAULT_MODEL_OPTION,
    { id: "kimi-k2.6", label: "kimi-k2.6" },
    { id: "minimax-m3", label: "minimax-m3" },
    { id: "deepseek-v4-flash", label: "deepseek-v4-flash" },
  ],
  fetchModels: async (resolvedBin, env) =>
    detectAcpModels({
      bin: resolvedBin,
      args: ["--mode", "acp"],
      env,
      timeoutMs: 15_000,
      defaultModelOption: DEFAULT_MODEL_OPTION,
    }),
  buildArgs: () => ["--mode", "acp"],
  streamFormat: "acp-json-rpc",
  installUrl: "https://kimchi.dev",
  docsUrl: "https://docs.kimchi.dev",
} satisfies RuntimeAgentDef;
