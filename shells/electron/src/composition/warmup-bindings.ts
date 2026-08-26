import {
  ELECTRON_WARMUP_ATOMS,
  type ElectronWarmupExecutor,
  type ElectronWarmupTopology,
} from "@open-design/electron-kit/runtime";

export function assertShellWarmupBindings(
  topology: ElectronWarmupTopology,
  bindings: Readonly<Record<string, ElectronWarmupExecutor>>,
): Readonly<Record<string, ElectronWarmupExecutor>> {
  const builtIns = new Set<string>(Object.values(ELECTRON_WARMUP_ATOMS));
  const declared = [...new Set(
    topology.nodes.map((node) => node.executor).filter((executor) => !builtIns.has(executor)),
  )].sort();
  const bound = Object.keys(bindings).sort();
  if (JSON.stringify(declared) !== JSON.stringify(bound)) {
    throw new Error(
      `Electron Shell warmup bindings do not match its topology: declared=${declared.join(",")} bound=${bound.join(",")}`,
    );
  }
  return bindings;
}
