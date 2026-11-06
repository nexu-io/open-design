import {
  captureStampedProcessSnapshot,
  captureStampedProcessSetSnapshot,
  collectProcessTreePids,
  readProcessStampFromCommand,
  type ProcessSnapshot,
  type StampedProcessInvocationSnapshot,
} from "@open-design/platform";

import {
  isSidecarLauncherCommand,
  sidecarStampKey,
  SIDECAR_STAMP_CONTRACT,
  SIDECAR_ADOPT_PARENT_ARG,
  type SidecarStamp,
} from "./stamp.js";

/** Capture stamped generation roots while excluding uncommitted launcher contenders. */
export async function captureSidecarGenerationSnapshot(
  stamp: SidecarStamp,
): Promise<StampedProcessInvocationSnapshot> {
  const snapshot = await captureStampedProcessSnapshot(stamp, SIDECAR_STAMP_CONTRACT);
  const matches = snapshot.matches.filter(({ command }) => !isSidecarLauncherCommand(command));
  const matchedPids = new Set(matches.map(({ pid }) => pid));
  return {
    matches,
    processes: snapshot.processes,
    roots: matches.filter(({ ppid }) => !matchedPids.has(ppid)),
  };
}

/** Capture several sidecar resources against one OS process-table boundary. */
export async function captureSidecarGenerationSetSnapshot(
  stamps: readonly SidecarStamp[],
): Promise<Array<StampedProcessInvocationSnapshot & { stamp: SidecarStamp }>> {
  const snapshot = await captureStampedProcessSetSnapshot(stamps, SIDECAR_STAMP_CONTRACT);
  return snapshot.entries.map((entry) => {
    const matches = entry.matches.filter(({ command }) => !isSidecarLauncherCommand(command));
    const matchedPids = new Set(matches.map(({ pid }) => pid));
    return {
      matches,
      processes: snapshot.processes,
      roots: matches.filter(({ ppid }) => !matchedPids.has(ppid)),
      stamp: entry.criteria,
    };
  });
}

/**
 * Collect one sidecar generation without crossing into a descendant resource.
 *
 * The generation owns ordinary descendants, including targets whose visible
 * argv is later rewritten. A descendant carrying a different complete
 * five-field stamp is another sidecar resource root and owns its own subtree.
 */
export function collectSidecarGenerationPids(
  processes: ProcessSnapshot[],
  rootPids: Array<number | null | undefined>,
  stampInput: SidecarStamp,
): number[] {
  const stampKey = sidecarStampKey(stampInput);
  const roots = new Set(rootPids.filter((pid): pid is number => typeof pid === "number"));
  // In adoption mode the stamped supervisor is a child of the OS-owned app.
  // Add only its actual, explicitly declared parent, never an arbitrary PID.
  for (const root of processes.filter(p => roots.has(p.pid))) {
    const marker = `${SIDECAR_ADOPT_PARENT_ARG}=${root.ppid}`;
    if (root.ppid > 1 && root.command.split(/\s+/).includes(marker) && processes.some(p => p.pid === root.ppid)) roots.add(root.ppid);
  }
  const ownedProcesses = processes.filter((processInfo) => {
    if (roots.has(processInfo.pid)) return true;
    const nestedStamp = readProcessStampFromCommand(processInfo.command, SIDECAR_STAMP_CONTRACT);
    return nestedStamp == null || sidecarStampKey(nestedStamp) === stampKey;
  });
  return collectProcessTreePids(ownedProcesses, [...roots]);
}
