import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleMcpToolCall, TOOL_DEFS } from '../src/mcp.js';

const originalToken = process.env.OD_TOOL_TOKEN;
afterEach(() => {
  vi.restoreAllMocks();
  if (originalToken == null) delete process.env.OD_TOOL_TOKEN;
  else process.env.OD_TOOL_TOKEN = originalToken;
});

describe('capture_design_jury_viewports MCP tool', () => {
  it('returns actual image blocks and host geometry, then acknowledges delivery', async () => {
    process.env.OD_TOOL_TOKEN = 'run-token';
    const payload = {
      ok: true,
      receipt: 'capture-receipt',
      artifactPath: 'index.html',
      revision: 'sha256-revision',
      captures: [390, 1024, 1280].map((width) => ({
        width,
        height: width === 390 ? 844 : width === 1024 ? 768 : 800,
        evidencePath: `visual-evidence/${width}.png`,
        geometry: { viewport: { width }, document: { horizontalOverflow: false }, landmarks: [], controls: [] },
        image: Buffer.from(`png-${width}`).toString('base64'),
        mimeType: 'image/png',
      })),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tools/visual-capture/ack')) {
        expect(JSON.parse(String(init?.body))).toEqual({ receipt: 'capture-receipt' });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      expect(url).toBe('http://127.0.0.1:7456/api/tools/visual-capture');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer run-token' });
      expect(JSON.parse(String(init?.body))).toEqual({ entryFile: 'index.html' });
      return new Response(JSON.stringify(payload), { status: 200 });
    });

    const result = await handleMcpToolCall('http://127.0.0.1:7456', 'capture_design_jury_viewports', { entryFile: 'index.html' });
    expect(TOOL_DEFS.find((tool) => tool.name === 'capture_design_jury_viewports')?.inputSchema).toMatchObject({
      required: ['entryFile'],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.content.filter((part) => part.type === 'image')).toHaveLength(3);
    expect(result.structuredContent).toMatchObject({ imageContentReturned: true, revision: 'sha256-revision' });
  });

  it('does not acknowledge or return a partial viewport set', async () => {
    process.env.OD_TOOL_TOKEN = 'run-token';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true, captures: [] }), { status: 200 }));
    const result = await handleMcpToolCall('http://127.0.0.1:7456', 'capture_design_jury_viewports', { entryFile: 'index.html' });
    expect(result.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
