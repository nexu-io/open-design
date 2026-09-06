import { runElectronCdpContractControl } from "../cdp/control.js";

function argument(name: string): string {
  const index = process.argv.indexOf(name), value = index < 0 ? undefined : process.argv[index + 1];
  if (value == null || value.startsWith("--")) throw new Error(`${name} is required`);
  return value;
}

await runElectronCdpContractControl(argument("--request"), argument("--receipt"));
