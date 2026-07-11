// Transport home for reading a project file's text with cache-bust support
// (the brand-browser-assist snapshot IO cluster reads freshly-written
// manifest/HTML/CSS files and needs to bypass the browser cache).
import { fetchProjectFileText as fetchProjectFileTextTransport } from '../registry';

/** Read a project file as text. Best-effort: resolves `null` on a non-ok
 *  response or a network error. */
export async function fetchProjectFileText(
  projectId: string,
  name: string,
  options?: { cache?: RequestCache; cacheBustKey?: string | number },
): Promise<string | null> {
  return fetchProjectFileTextTransport(projectId, name, options);
}
