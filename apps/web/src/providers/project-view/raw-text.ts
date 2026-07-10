// Transport adapter for reading a project file's raw text
// (`GET` of `projectRawUrl(projectId, filePath)`).
//
// The project-view slice reaches this only through its port binding; callers
// never talk to `fetch` directly. Best-effort by contract: a non-ok response or
// a network error resolves to `null` so the caller can cache the miss and move
// on (issue #2744 auto-open module check).
import { projectRawUrl } from '../registry';

export async function fetchProjectRawText(
  projectId: string,
  filePath: string,
): Promise<string | null> {
  try {
    const response = await fetch(projectRawUrl(projectId, filePath));
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}
