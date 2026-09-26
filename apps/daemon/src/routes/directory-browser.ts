import type { Express } from 'express';
import { canonicalBrowseRoots, listBrowseDirectories } from '../filesystem/directory-browser.js';

export function registerDirectoryBrowserRoutes(app: Express): void {
  app.get('/api/directories/browse', async (req, res) => {
    try {
      if (req.query.path === undefined) {
        const roots = await canonicalBrowseRoots();
        const listings = await Promise.all(roots.map((path) => listBrowseDirectories(path, roots).catch(() => null)));
        return res.json({ roots: listings.filter((entry): entry is NonNullable<typeof entry> => entry !== null).map(({ path, directories }) => ({ path, name: path, directories })) });
      }
      return res.json(await listBrowseDirectories(req.query.path));
    } catch (error) {
      const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 500;
      return res.status(status).json({ error: status === 403 ? 'Directory is outside allowed roots' : (error as Error).message });
    }
  });
}
