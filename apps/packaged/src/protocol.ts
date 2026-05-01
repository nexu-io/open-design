import { protocol } from "electron";

const OD_SCHEME = "od";
const OD_ENTRY_URL = `${OD_SCHEME}://app/`;

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: OD_SCHEME,
  },
]);

function toWebRuntimeUrl(webRuntimeUrl: string, requestUrl: string): string {
  const incoming = new URL(requestUrl);
  const target = new URL(webRuntimeUrl);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  target.hash = incoming.hash;
  return target.toString();
}

export function packagedEntryUrl(): string {
  return OD_ENTRY_URL;
}

export function registerOdProtocol(webRuntimeUrl: string): void {
  protocol.handle(OD_SCHEME, async (request) => {
    const target = toWebRuntimeUrl(webRuntimeUrl, request.url);
    return await fetch(new Request(target, request));
  });
}
