import { describe, expect, it, vi } from 'vitest';
import { runShare, type ShareCliDeps } from '../src/share/cli.js';

function deps(response: Response): ShareCliDeps & { fetch: ReturnType<typeof vi.fn> } {
  return {
    resolveDaemonBaseUrl: vi.fn(async () => 'http://daemon/'),
    fetch: vi.fn(async () => response),
    structuredHttpFailure: vi.fn(async () => { throw new Error('structured failure'); }),
    writeStdout: vi.fn(),
    writeStderr: vi.fn(),
    log: vi.fn(),
    printHelp: vi.fn(),
    exit: vi.fn((code: number): never => { throw new Error(`exit:${code}`); }),
  };
}

describe('share CLI boundary', () => {
  it('posts an Open Design share request and renders all targets', async () => {
    const request = new Response(JSON.stringify({
      copyText: 'Share Open Design',
      platforms: [
        { platform: 'x', shareUrl: 'https://x.example/share' },
        { platform: 'instagram', entryUrl: 'https://instagram.example' },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    const injected = deps(request);

    await runShare(['open-design', '--locale', 'en'], injected);

    expect(injected.fetch).toHaveBeenCalledWith('http://daemon/api/social-share', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ kind: 'open-design-repo', locale: 'en' }),
    }));
    expect(injected.log).toHaveBeenNthCalledWith(1, 'Share Open Design');
    expect(injected.log).toHaveBeenNthCalledWith(2, 'x\thttps://x.example/share');
    expect(injected.log).toHaveBeenNthCalledWith(3, 'instagram\thttps://instagram.example');
  });

  it('supports project URLs and JSON platform selection', async () => {
    const request = new Response(JSON.stringify({
      copyText: 'copy',
      platforms: [{ platform: 'linkedin', shareUrl: 'https://linkedin.example/share' }],
    }), { status: 200 });
    const injected = deps(request);

    await runShare(['url', 'https://example.com/project.html', '--platform', 'linkedin', '--json'], injected);

    expect(injected.fetch).toHaveBeenCalledWith('http://daemon/api/social-share', expect.objectContaining({
      body: JSON.stringify({ kind: 'project-html', url: 'https://example.com/project.html' }),
    }));
    expect(injected.writeStdout).toHaveBeenCalledWith(expect.stringContaining('linkedin'));
    expect(injected.log).not.toHaveBeenCalled();
  });
});
