import { readJsonFile, removeFile, writeJsonFile } from "../json-file.js";
import { createJsonIpcServer } from "../json-ipc.js";
import { SidecarControlError } from "./error.js";
import {
  privateControlPaths,
  privateResponse,
  readPrivateLaunchMetadata,
  sameControlIdentity,
  type PrivateControlRequest,
  type PrivateControlResponse,
  type PrivateLaunchMetadata,
  type PrivateReadyDescriptor,
} from "./private-protocol.js";
import type {
  AttachedSidecar,
  AttachSidecarOptions,
  SidecarControlContext,
  SidecarMethodHandlers,
  SidecarProbeResult,
  SidecarStopResult,
} from "./public-types.js";

function requestFailure(
  request: PrivateControlRequest,
  metadata: PrivateLaunchMetadata,
  code: "method-unavailable" | "peer-mismatch" | "request-failed",
  message: string,
): PrivateControlResponse {
  return privateResponse(request, metadata, { error: { code, message }, status: "error" });
}

function normalizeIncomingRequest(value: unknown): PrivateControlRequest | null {
  if (typeof value !== "object" || value == null) return null;
  const request = value as Partial<PrivateControlRequest>;
  if (
    request.schemaVersion !== 1 ||
    typeof request.requestId !== "string" ||
    typeof request.incarnation !== "string" ||
    typeof request.operation !== "object" ||
    request.operation == null
  ) {
    return null;
  }
  return request as PrivateControlRequest;
}

export async function attachSidecar<TMethods>({
  handlers,
  initialize,
  onStopRequested,
}: AttachSidecarOptions<TMethods>): Promise<AttachedSidecar> {
  const metadata = readPrivateLaunchMetadata();
  const context: SidecarControlContext = Object.freeze({
    identity: metadata.identity,
    projection: metadata.projection,
    roots: metadata.roots,
  });
  let closing: Promise<void> | null = null;
  let stopRequested = false;
  let closeServerAndDescriptor: () => Promise<void> = async () => undefined;

  try {
    await initialize?.(context);
  } catch (error) {
    await Promise.resolve().then(() => onStopRequested?.()).catch(() => undefined);
    throw error;
  }

  const server = await createJsonIpcServer({
    socketPath: metadata.endpointPath,
    async handler(value) {
      const request = normalizeIncomingRequest(value);
      if (request == null) {
        throw new SidecarControlError("invalid-input", "invalid sidecar control request");
      }
      if (
        !sameControlIdentity(request.identity, metadata.identity) ||
        request.incarnation !== metadata.incarnation
      ) {
        return requestFailure(
          request,
          metadata,
          "peer-mismatch",
          "stale sidecar peer rejected by control fencing",
        );
      }

      if (request.operation.kind === "probe") {
        return privateResponse(request, metadata, {
          result: {
            identity: metadata.identity,
            projection: metadata.projection,
          } satisfies SidecarProbeResult,
          status: "ok",
        });
      }

      if (request.operation.kind === "request-stop") {
        if (!stopRequested) {
          stopRequested = true;
          queueMicrotask(() => {
            void Promise.resolve()
              .then(() => onStopRequested?.())
              .catch(() => undefined)
              .finally(() => closeServerAndDescriptor());
          });
        }
        return privateResponse(request, metadata, {
          result: { accepted: true } satisfies SidecarStopResult,
          status: "ok",
        });
      }

      const method = request.operation.method as keyof TMethods;
      const handler = (handlers as SidecarMethodHandlers<TMethods>)[method];
      if (typeof handler !== "function") {
        return requestFailure(
          request,
          metadata,
          "method-unavailable",
          `sidecar method is unavailable: ${request.operation.method}`,
        );
      }
      try {
        const result = await handler(request.operation.input as never, context);
        return privateResponse(request, metadata, { result, status: "ok" });
      } catch (error) {
        return requestFailure(
          request,
          metadata,
          "request-failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  }).catch(async (error: unknown) => {
    await Promise.resolve().then(() => onStopRequested?.()).catch(() => undefined);
    throw error;
  });

  const { descriptorPath } = privateControlPaths(metadata.identity, metadata.roots);
  closeServerAndDescriptor = async () => {
    if (closing != null) return await closing;
    closing = (async () => {
      await server.close();
      const current = await readJsonFile<Partial<PrivateReadyDescriptor>>(descriptorPath);
      if (current?.incarnation === metadata.incarnation) await removeFile(descriptorPath);
    })();
    return await closing;
  };
  try {
    await writeJsonFile(descriptorPath, metadata);
  } catch (error) {
    await server.close();
    await Promise.resolve().then(() => onStopRequested?.()).catch(() => undefined);
    throw error;
  }

  return Object.freeze({
    async close() {
      await closeServerAndDescriptor();
    },
    context,
  });
}
