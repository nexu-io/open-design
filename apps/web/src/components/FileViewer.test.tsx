import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FileViewer, SvgViewer } from './FileViewer';
import type { ProjectFile } from '../types';

function baseFile(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'asset.png',
    path: 'asset.png',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'image',
    mime: 'image/png',
    ...overrides,
  };
}

describe('FileViewer SVG artifacts', () => {
  it('routes SVG artifacts to the SVG viewer instead of the generic image viewer', () => {
    const file = baseFile({
      name: 'diagram.svg',
      path: 'diagram.svg',
      mime: 'image/svg+xml',
      artifactManifest: {
        version: 1,
        kind: 'svg',
        title: 'Diagram',
        entry: 'diagram.svg',
        renderer: 'svg',
        exports: ['svg'],
      },
    });

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" file={file} />);

    expect(markup).toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer image-viewer"');
    expect(markup).toContain('Preview');
    expect(markup).toContain('Source');
    expect(markup).toContain('src="/api/projects/project-1/raw/diagram.svg?v=1710000000&amp;r=0"');
  });

  it('keeps normal image artifacts on the existing image viewer path', () => {
    const file = baseFile({ name: 'photo.png', path: 'photo.png' });

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" file={file} />);

    expect(markup).toContain('class="viewer image-viewer"');
    expect(markup).not.toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer-tabs"');
  });

  it('marks preview and source modes through the SVG viewer toggle controls', () => {
    const file = baseFile({ name: 'diagram.svg', path: 'diagram.svg', mime: 'image/svg+xml' });

    const previewMarkup = renderToStaticMarkup(
      <SvgViewer projectId="project-1" file={file} initialMode="preview" />,
    );
    const sourceMarkup = renderToStaticMarkup(
      <SvgViewer
        projectId="project-1"
        file={file}
        initialMode="source"
        initialSource="<svg><title>Diagram</title></svg>"
      />,
    );

    expect(previewMarkup).toContain('class="viewer-tab active" aria-pressed="true">Preview</button>');
    expect(previewMarkup).toContain('aria-pressed="false">Source</button>');
    expect(previewMarkup).toContain('<img');

    expect(sourceMarkup).toContain('aria-pressed="false">Preview</button>');
    expect(sourceMarkup).toContain('class="viewer-tab active" aria-pressed="true">Source</button>');
    expect(sourceMarkup).toContain('class="viewer-source"');
    expect(sourceMarkup).not.toContain('<img');
  });

  it('renders unsafe SVG source as escaped text instead of executable markup', () => {
    const file = baseFile({ name: 'unsafe.svg', path: 'unsafe.svg', mime: 'image/svg+xml' });
    const unsafeSource = [
      '<svg onload="alert(1)"><script>alert(2)</script><text>Logo</text></svg>',
      '<svg><![CDATA[<script>alert(3)</script>]]></svg>',
    ].join('\n');

    const markup = renderToStaticMarkup(
      <SvgViewer
        projectId="project-1"
        file={file}
        initialMode="source"
        initialSource={unsafeSource}
      />,
    );

    expect(markup).toContain('&lt;svg onload=&quot;alert(1)&quot;&gt;');
    expect(markup).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(markup).toContain('&lt;![CDATA[&lt;script&gt;alert(3)&lt;/script&gt;]]&gt;');
    expect(markup).not.toContain('<svg onload');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<![CDATA[');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });
});
