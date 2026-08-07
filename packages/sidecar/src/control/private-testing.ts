import {
  createPrivateRequest,
  createPrivateLaunchMetadata,
  installPrivateLaunchMetadata,
  type PrivateLaunchMetadata,
  type PrivateControlOperation,
  type PrivateControlResponse,
} from "./private-protocol.js";
import { requestJsonIpc } from "../json-ipc.js";
import type {
  SidecarControlIdentity,
  SidecarControlRoots,
  SidecarControlScope,
} from "./public-types.js";

export function createPrivateLaunchForTest(input: {
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
