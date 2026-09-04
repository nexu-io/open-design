import { resolve } from "node:path";

import { bootstrapSidecarProcess, handoffCurrentSidecarGeneration } from "@open-design/sidecar";

const CONFIG_ENV = "OD_TERMINAL_SIDECAR_CONFIG_V1";
const serialized = process.env[CONFIG_ENV];
if (serialized == null) throw new Error(`${CONFIG_ENV} is required`);
const config = JSON.parse(serialized);
if (
  config?.schemaVersion !== 1
  || typeof config.storeRoot !== "string"
  || typeof config.runtimeRoot !== "string"
  || typeof config.sidecarHost !== "string"
  || !/^[a-z0-9]{1,12}$/.test(config.channel)
  || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(config.namespace)
) throw new Error("Terminal Sidecar bootstrap configuration is invalid");

const stamp = Object.freeze({
  channel: config.channel,
  namespace: config.namespace,
  source: "standalone",
  mode: "runtime",
  app: "standalone",
});
const resources = Object.freeze({
  dataRoot: resolve(config.storeRoot),
  ownerPid: null,
  port: 0,
  runtimeRoot: resolve(config.runtimeRoot),
});

if (await bootstrapSidecarProcess(stamp, resources)) process.exit(0);

await handoffCurrentSidecarGeneration({
  args: [resolve(config.sidecarHost)],
  command: process.execPath,
  cwd: process.cwd(),
  env: { ...process.env, OD_TERMINAL_BOOTSTRAP_PID: String(process.pid) },
});
