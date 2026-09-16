import type { Express, Request } from 'express';
import type { NativeFolderDialogSelectionResponse } from '@open-design/contracts';
import { isLoopbackHostname, isLoopbackPeerAddress } from '../http/local-daemon-request.js';
import { parseHostHeader } from '../origin-validation.js';

export interface NativeFolderDialogRouteDeps {
  http: { isLocalSameOrigin: (req: Request, port: number) => boolean; resolvedPortRef: { current: number } };
  nativeDialogs: { openNativeFolderDialog: () => Promise<string | null> };
  isLocalBrowserRequest?: (req: Request) => boolean;
}

function defaultIsLocalBrowserRequest(req: Request): boolean {
  const authority = parseHostHeader(req.headers.host);
  const originHeader = req.headers.origin;
  if (!isLoopbackPeerAddress(req.socket.remoteAddress) || authority === null || !isLoopbackHostname(authority.hostname) || typeof originHeader !== 'string' || !originHeader) return false;
  try {
    const origin = new URL(originHeader);
    return (origin.protocol === 'http:' || origin.protocol === 'https:') && isLoopbackHostname(origin.hostname);
  } catch { return false; }
}

export function registerNativeFolderDialogRoute(app: Express, deps: NativeFolderDialogRouteDeps): void {
  app.post('/api/dialog/open-folder', async (req, res) => {
    if (!deps.http.isLocalSameOrigin(req, deps.http.resolvedPortRef.current)) return void res.status(403).json({ error: 'cross-origin request rejected' });
    if (!(deps.isLocalBrowserRequest ?? defaultIsLocalBrowserRequest)(req)) {
      return void res.status(403).json({ code: 'NATIVE_FOLDER_DIALOG_REMOTE', message: 'Native folder picker is unavailable to a remote browser', fallback: 'server-directory-picker' });
    }
    try {
      const response: NativeFolderDialogSelectionResponse = { path: await deps.nativeDialogs.openNativeFolderDialog() };
      res.json(response);
    } catch {
      res.status(503).json({ code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE', message: 'Could not open folder picker on this host', fallback: 'server-directory-picker' });
    }
  });
}
