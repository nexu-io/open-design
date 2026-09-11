/** Launch selects a logical namespace, never an independent filesystem root. */
export function resolveElectronLaunchNamespace(defaultNamespace: string, argv: readonly string[] = process.argv.slice(1)): string {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]!;
    if (argument === "--") break;
    const name = argument.split("=", 1)[0]!.toLowerCase();
    if (name === "--user-data-dir") throw new Error("Electron user-data-dir overrides are forbidden; select --namespace instead");
    if (name !== "--namespace") continue;
    if (argument.includes("=")) values.push(argument.slice(argument.indexOf("=") + 1));
    else {
      const value = argv[++index];
      if (value == null || value.startsWith("--")) throw new Error("Electron --namespace requires a value");
      values.push(value);
    }
  }
  if (values.length > 1) throw new Error("Electron --namespace must be specified once");
  const namespace = values[0] ?? defaultNamespace;
  if (!/^[a-z][a-z0-9.-]{1,127}$/u.test(namespace) || namespace.includes("..")) throw new Error("invalid Electron launch namespace");
  return namespace;
}

/** Bind tool launch arguments to the same logical scope as lifecycle discovery. */
export function bindElectronLaunchNamespace(namespace: string, argv: readonly string[]): readonly string[] {
  if (resolveElectronLaunchNamespace(namespace, argv) !== namespace) throw new Error("Electron launch namespace conflicts with its lifecycle scope");
  const delimiter = argv.indexOf("--");
  const options = delimiter < 0 ? argv : argv.slice(0, delimiter);
  if (options.some((argument) => argument.split("=", 1)[0]!.toLowerCase() === "--namespace")) return Object.freeze([...argv]);
  const insertion = delimiter < 0 ? argv.length : delimiter;
  return Object.freeze([...argv.slice(0, insertion), `--namespace=${namespace}`, ...argv.slice(insertion)]);
}
