import { access } from "node:fs/promises";

import { isWindowsNamedPipePath } from "../ipc-path.js";
import {
  createPrivateRequest,
  createPrivateLaunchMetadata,
  installPrivateLaunchMetadata,
  privateControlPaths,
  type PrivateLaunchMetadata,
  type PrivateControlOperation,
  type PrivateControlResponse,
} from "./private-protocol.js";
import { requestJsonIpc } from "../json-ipc.js";
import type {
  SidecarControlIdentity,
  SidecarControlProjection,
  SidecarControlRoots,
  SidecarControlScope,
} from "./public-types.js";

export function createPrivateLaunchForTest(input: {
  projection: SidecarControlProjection;
  roots: SidecarControlRoots;
  scope: SidecarControlScope;
  service: string;
}): PrivateLaunchMetadata {
  return createPrivateLaunchMetadata(input);
}

export function installPrivateLaunchForTest(metadata: PrivateLaunchMetadata): () => void {
  return installPrivateLaunchMetadata(metadata);
}

export async function sendPrivateRequestForTest(
  metadata: PrivateLaunchMetadata,
  input: {
    identity?: SidecarControlIdentity;
    operation: PrivateControlOperation;
  },
): Promise<PrivateControlResponse> {
  const request = {
    ...createPrivateRequest(metadata, input.operation),
    identity: input.identity ?? metadata.identity,
  };
  return await requestJsonIpc<PrivateControlResponse>(metadata.endpointPath, request);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function privateLaunchStateForTest(metadata: PrivateLaunchMetadata): Promise<{
  descriptorExists: boolean;
  endpointExists: boolean;
}> {
  const paths = privateControlPaths(metadata.identity, metadata.roots);
  return {
    descriptorExists: await pathExists(paths.descriptorPath),
    endpointExists: isWindowsNamedPipePath(paths.endpointPath)
      ? false
      : await pathExists(paths.endpointPath),
  };
}
