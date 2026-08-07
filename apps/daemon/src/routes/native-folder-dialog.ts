import type { Express, Request } from 'express';
import { isLoopbackHostname, isLoopbackPeerAddress } from '../http/local-daemon-request.js';
import { parseHostHeader } from '../origin-validation.js';

export interface NativeFolderDialogRouteDeps {
  http: {
    isLocalSameOrigin: (req: Request, port: number) => boolean;
    resolvedPortRef: { current: number };
  };
  nativeDialogs: {
    openNativeFolderDialog: () => Promise<string | null>;
  };
  isLocalBrowserRequest?: (req: Request) => boolean;
}

function defaultIsLocalBrowserRequest(req: Request): boolean {
  const peerIsLoopback = isLoopbackPeerAddress(req.socket.remoteAddress);
  const authority = parseHostHeader(req.headers.host);
  const originHeader = req.headers.origin;
  if (!peerIsLoopback || authority === null || !isLoopbackHostname(authority.hostname)) return false;
  if (typeof originHeader !== 'string' || !originHeader) return false;
  try {
    const origin = new URL(originHeader);
    return (origin.protocol === 'http:' || origin.protocol === 'https:')
      && isLoopbackHostname(origin.hostname);
  } catch {
    return false;
  }
}

export function registerNativeFolderDialogRoute(
  app: Express,
  deps: NativeFolderDialogRouteDeps,
): void {
  app.post('/api/dialog/open-folder', async (req, res) => {
    if (!deps.http.isLocalSameOrigin(req, deps.http.resolvedPortRef.current)) {
      res.status(403).json({ error: 'cross-origin request rejected' });
      return;
    }

    const isLocalBrowser = deps.isLocalBrowserRequest ?? defaultIsLocalBrowserRequest;
    if (!isLocalBrowser(req)) {
      res.status(403).json({
        code: 'NATIVE_FOLDER_DIALOG_REMOTE',
        message: 'Native folder picker is unavailable to a remote browser',
        fallback: 'server-directory-picker',
      });
      return;
    }

    try {
      const selected = await deps.nativeDialogs.openNativeFolderDialog();
      res.json({ path: selected });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      res.status(503).json({
        code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE',
        message: `Could not open folder picker: ${detail}`,
        fallback: 'server-directory-picker',
      });
    }
  });
}
