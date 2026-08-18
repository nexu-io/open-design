// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GroundedPptxViewer } from '../../src/components/GroundedPptxViewer';

const grounded = {
  manifest: {
    currentRevisionId: 'r0002',
    source: { originalFilename: 'enterprise.pptx', projectFilePath: 'enterprise.pptx' },
  },
  structure: {
    slideCount: 2,
    slides: [
      { index: 0, title: 'Cover', text: 'Cover', layout: { name: 'Title Slide', type: 'title', partName: '/layout1.xml' } },
      { index: 1, title: 'Architecture', text: 'Architecture', layout: { name: 'Three Column', type: 'threeObj', partName: '/layout2.xml' } },
    ],
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GroundedPptxViewer', () => {
  it('shows native source-slide patterns and switches the selected preview', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(grounded), { status: 200 })));

    render(<GroundedPptxViewer projectId="deck 1" fileName="enterprise.pptx" fallback={<div>fallback</div>} />);

    expect(await screen.findByText('Template patterns')).toBeTruthy();
    expect(screen.getByText('Native PPTX is the source of truth')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Architecture.*Three Column/i }));
    expect(screen.getByAltText('Slide 2: Architecture').getAttribute('src')).toContain(
      '/revisions/r0002/slides/1/preview',
    );
  });

  it('grounds an ordinary project PPTX from the fallback viewer', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not grounded' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...grounded,
        manifest: { ...grounded.manifest, source: { originalFilename: 'source.pptx', projectFilePath: 'uploads/source.pptx' } },
      }), { status: 201 }));
    vi.stubGlobal('fetch', request);

    render(<GroundedPptxViewer projectId="deck-1" fileName="uploads/source.pptx" fallback={<div>ordinary preview</div>} />);

    expect(await screen.findByText('ordinary preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use as grounded PowerPoint' }));

    await waitFor(() => expect(screen.getByText('Template patterns')).toBeTruthy());
    expect(request).toHaveBeenLastCalledWith(
      '/api/projects/deck-1/pptx/import-file',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ fileName: 'uploads/source.pptx' }),
      }),
    );
  });

  it('falls back when the selected file is not the grounded source file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(grounded), { status: 200 })));
    render(<GroundedPptxViewer projectId="deck-1" fileName="other.pptx" fallback={<div>other preview</div>} />);
    expect(await screen.findByText('other preview')).toBeTruthy();
    expect(screen.queryByText('Template patterns')).toBeNull();
  });

  it('resets selection when project data changes to a shorter deck', async () => {
    const shorter = {
      ...grounded,
      manifest: { ...grounded.manifest, source: { originalFilename: 'short.pptx', projectFilePath: 'short.pptx' } },
      structure: { slideCount: 1, slides: grounded.structure.slides.slice(0, 1) },
    };
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(grounded), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(shorter), { status: 200 }));
    vi.stubGlobal('fetch', request);
    const view = render(<GroundedPptxViewer projectId="deck-1" fileName="enterprise.pptx" fallback={<div>fallback</div>} />);
    fireEvent.click(await screen.findByRole('button', { name: /Architecture/i }));
    view.rerender(<GroundedPptxViewer projectId="deck-2" fileName="short.pptx" fallback={<div>fallback</div>} />);
    expect(await screen.findByAltText('Slide 1: Cover')).toBeTruthy();
  });

  it('ignores an import response after navigating to another project', async () => {
    let resolveImport!: (response: Response) => void;
    const importResponse = new Promise<Response>((resolve) => { resolveImport = resolve; });
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not grounded' }), { status: 404 }))
      .mockReturnValueOnce(importResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'not grounded' }), { status: 404 }));
    vi.stubGlobal('fetch', request);
    const view = render(<GroundedPptxViewer projectId="deck-1" fileName="enterprise.pptx" fallback={<div>first fallback</div>} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use as grounded PowerPoint' }));
    view.rerender(<GroundedPptxViewer projectId="deck-2" fileName="short.pptx" fallback={<div>second fallback</div>} />);
    resolveImport(new Response(JSON.stringify(grounded), { status: 201 }));
    expect(await screen.findByText('second fallback')).toBeTruthy();
    expect(screen.queryByText('Template patterns')).toBeNull();
  });

  it('does not associate an upload-only source by duplicate basename', async () => {
    const uploadedOnly = { ...grounded, manifest: { ...grounded.manifest, source: { originalFilename: 'enterprise.pptx' } } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(uploadedOnly), { status: 200 })));
    render(<GroundedPptxViewer projectId="deck-1" fileName="enterprise.pptx" fallback={<div>safe fallback</div>} />);
    expect(await screen.findByText('safe fallback')).toBeTruthy();
    expect(screen.queryByText('Template patterns')).toBeNull();
  });

  it('offers an explicit viewer mode for an upload-grounded source', async () => {
    const uploadedOnly = { ...grounded, manifest: { ...grounded.manifest, source: { originalFilename: 'cli-upload.pptx' } } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(uploadedOnly), { status: 200 })));
    render(<GroundedPptxViewer projectId="deck-1" fileName="enterprise.pptx" fallback={<div>ordinary preview</div>} />);
    expect(await screen.findByText('ordinary preview')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'View uploaded grounded PowerPoint' }));
    expect(await screen.findByText('Template patterns')).toBeTruthy();
    expect(screen.getByText('cli-upload.pptx')).toBeTruthy();
  });

  it('announces a zero-slide import rejection as a terminal error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'PPTX must contain at least one slide' }), { status: 400 },
    )));
    render(<GroundedPptxViewer projectId="deck-1" fileName="empty.pptx" fallback={<div>fallback</div>} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('at least one slide');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders only a bounded preview window for a large deck', async () => {
    const slides = Array.from({ length: 500 }, (_, index) => ({
      index, title: `Slide ${index + 1}`, text: '', layout: null,
    }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ...grounded, structure: { slideCount: slides.length, slides },
    }), { status: 200 })));
    const { container } = render(<GroundedPptxViewer projectId="deck-1" fileName="enterprise.pptx" fallback={<div>fallback</div>} />);
    await screen.findByText('500 source slides');
    expect(container.querySelectorAll('aside img').length).toBeLessThanOrEqual(9);
    expect(screen.queryByRole('button', { name: /Slide 500/i })).toBeNull();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Slide number' }), {
      target: { value: '500' },
    });
    expect(screen.getByAltText('Slide 500: Slide 500')).toBeTruthy();
    expect(container.querySelectorAll('aside img').length).toBeLessThanOrEqual(9);
    expect(screen.getByRole('button', { name: /Slide 500/i })).toBeTruthy();
  });

  it('announces loading and fallback import failures', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const request = vi.fn().mockReturnValueOnce(pending)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'bad import' }), { status: 400 }));
    vi.stubGlobal('fetch', request);
    const view = render(<GroundedPptxViewer projectId="deck-1" fileName="enterprise.pptx" fallback={<div>fallback</div>} />);
    expect(screen.getByRole('status')).toBeTruthy();
    resolve(new Response(JSON.stringify({ error: 'missing' }), { status: 404 }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use as grounded PowerPoint' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('bad import');
    view.unmount();
  });
});
