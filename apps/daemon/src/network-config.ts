import fs from "node:fs/promises";
import path from "node:path";

export interface NetworkConfig {
  bindHost: string;
  port: number;
  allowedHosts: string[];
}

const FILE_NAME = "network-config.json";

function configFile(dataDir: string): string {
  return path.join(dataDir, FILE_NAME);
}

export async function readNetworkConfig(dataDir: string): Promise<NetworkConfig | null> {
  try {
    const raw = await fs.readFile(configFile(dataDir), "utf8");
    return JSON.parse(raw) as NetworkConfig;
  } catch {
    return null;
  }
}

export async function writeNetworkConfig(dataDir: string, config: NetworkConfig): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(configFile(dataDir), JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function mergeWithEnv(config: NetworkConfig | null): NetworkConfig {
  return {
    bindHost: process.env.OD_BIND_HOST ?? config?.bindHost ?? "127.0.0.1",
    port: Number(process.env.OD_PORT) || config?.port || 7456,
    allowedHosts: process.env.OD_ALLOWED_HOSTS
      ? parseAllowedHosts(process.env.OD_ALLOWED_HOSTS)
      : (config?.allowedHosts ?? []),
  };
}

export function parseAllowedHosts(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isNetworkExposed(bindHost: string): boolean {
  return bindHost !== "127.0.0.1" && bindHost !== "::1" && bindHost !== "localhost";
}
