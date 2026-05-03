import { describe, expect, it } from 'vitest';
import { kindFor, mimeFor } from '../src/projects.js';

// `kindFor` and `mimeFor` are the daemon's two file-classifier helpers.
// `kindFor` returns the coarse bucket the frontend dispatches to a viewer
// in `apps/web/src/components/FileViewer.tsx`; `mimeFor` is the
// Content-Type the daemon writes when serving the file directly. Both
// were uncovered until this file landed even though `kindFor` is called
// from `projects.ts`, `media.ts`, and `document-preview.ts`. These tests
// pin the contracts so future bucket extensions (e.g. issue #61's `.py`
// addition, or upcoming `.yaml` / `.toml` / `.sh`) can be made safely.

describe('kindFor', () => {
  it('classifies .sketch.json as sketch (compound extension wins over .json)', () => {
    // `kindFor` checks the compound suffix before extracting `path.extname`,
    // otherwise editable sketches would slot into the 'code' bucket along
    // with regular JSON files and the sketch viewer would never render.
    expect(kindFor('drawing.sketch.json')).toBe('sketch');
    expect(kindFor('nested/path/board.sketch.json')).toBe('sketch');
  });

  it('classifies HTML files as html', () => {
    expect(kindFor('index.html')).toBe('html');
    expect(kindFor('legacy.htm')).toBe('html');
  });

  it('classifies .svg as sketch (viewer renders SVG inline like a board)', () => {
    expect(kindFor('logo.svg')).toBe('sketch');
  });

  it('classifies image extensions as image when not sketch-prefixed', () => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']) {
      expect(kindFor(`photo${ext}`)).toBe('image');
    }
  });

  it('classifies sketch-prefixed images as sketch (heuristic for sketch attachments)', () => {
    // Files emitted by the sketch tool are saved with a `sketch-` prefix
    // so they slot into the sketch viewer instead of the gallery image
    // viewer. The heuristic only applies to the raster image extensions.
    expect(kindFor('sketch-001.png')).toBe('sketch');
    expect(kindFor('sketch-final.jpg')).toBe('sketch');
    expect(kindFor('sketch-board.webp')).toBe('sketch');
  });

  it('classifies video extensions as video', () => {
    for (const ext of ['.mp4', '.mov', '.webm']) {
      expect(kindFor(`clip${ext}`)).toBe('video');
    }
  });

  it('classifies audio extensions as audio', () => {
    for (const ext of ['.mp3', '.wav', '.m4a']) {
      expect(kindFor(`track${ext}`)).toBe('audio');
    }
  });

  it('classifies markdown and plain text as text', () => {
    expect(kindFor('readme.md')).toBe('text');
    expect(kindFor('notes.txt')).toBe('text');
  });

  it('classifies code-like extensions as code (incl. .py from issue #61)', () => {
    for (const ext of ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.css', '.py']) {
      expect(kindFor(`module${ext}`)).toBe('code');
    }
  });

  it('classifies office document extensions to their respective buckets', () => {
    expect(kindFor('report.pdf')).toBe('pdf');
    expect(kindFor('memo.docx')).toBe('document');
    expect(kindFor('deck.pptx')).toBe('presentation');
    expect(kindFor('budget.xlsx')).toBe('spreadsheet');
  });

  it('falls back to binary for unmapped extensions and extensionless names', () => {
    expect(kindFor('app.exe')).toBe('binary');
    expect(kindFor('archive.tar.gz')).toBe('binary');
    expect(kindFor('Makefile')).toBe('binary');
    expect(kindFor('LICENSE')).toBe('binary');
  });

  it('is case-insensitive on the extension', () => {
    expect(kindFor('IMG.PNG')).toBe('image');
    expect(kindFor('SCRIPT.PY')).toBe('code');
    expect(kindFor('PAGE.HTML')).toBe('html');
    expect(kindFor('REPORT.PDF')).toBe('pdf');
  });
});

describe('mimeFor', () => {
  it('returns the mapped Content-Type for known extensions', () => {
    // Web/text formats — verify the charset suffix lands so browsers
    // don't second-guess encoding.
    expect(mimeFor('a.html')).toBe('text/html; charset=utf-8');
    expect(mimeFor('a.htm')).toBe('text/html; charset=utf-8');
    expect(mimeFor('a.css')).toBe('text/css; charset=utf-8');
    expect(mimeFor('a.js')).toBe('text/javascript; charset=utf-8');
    expect(mimeFor('a.mjs')).toBe('text/javascript; charset=utf-8');
    expect(mimeFor('a.cjs')).toBe('text/javascript; charset=utf-8');
    // `.jsx` and `.tsx` are served to browsers running Babel-standalone
    // (multi-file React prototypes), so they need a JS-family MIME — see
    // issue #336. `.ts` stays as `text/typescript` because it has no
    // browser-execution path; tooling reads it as TS source.
    expect(mimeFor('a.jsx')).toBe('text/javascript; charset=utf-8');
    expect(mimeFor('a.tsx')).toBe('text/javascript; charset=utf-8');
    expect(mimeFor('a.ts')).toBe('text/typescript; charset=utf-8');
    expect(mimeFor('a.json')).toBe('application/json; charset=utf-8');
    expect(mimeFor('a.md')).toBe('text/markdown; charset=utf-8');
    expect(mimeFor('a.txt')).toBe('text/plain; charset=utf-8');

    // Office / PDF — opaque application types.
    expect(mimeFor('a.pdf')).toBe('application/pdf');
    expect(mimeFor('a.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(mimeFor('a.pptx')).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(mimeFor('a.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    // Image / video / audio — verify the IANA-canonical types so
    // browsers preview inline instead of forcing a download.
    expect(mimeFor('a.svg')).toBe('image/svg+xml');
    expect(mimeFor('a.png')).toBe('image/png');
    expect(mimeFor('a.jpg')).toBe('image/jpeg');
    expect(mimeFor('a.jpeg')).toBe('image/jpeg');
    expect(mimeFor('a.gif')).toBe('image/gif');
    expect(mimeFor('a.webp')).toBe('image/webp');
    expect(mimeFor('a.avif')).toBe('image/avif');
    expect(mimeFor('a.mp4')).toBe('video/mp4');
    expect(mimeFor('a.mov')).toBe('video/quicktime');
    expect(mimeFor('a.webm')).toBe('video/webm');
    expect(mimeFor('a.mp3')).toBe('audio/mpeg');
    expect(mimeFor('a.wav')).toBe('audio/wav');
    expect(mimeFor('a.m4a')).toBe('audio/mp4');
  });

  it('falls back to application/octet-stream for unmapped extensions', () => {
    // Anything outside EXT_MIME — covers extensionless names, archives,
    // and binaries the daemon doesn't know about. Browsers receiving
    // octet-stream typically force a download, which is the safe default.
    expect(mimeFor('app.exe')).toBe('application/octet-stream');
    expect(mimeFor('archive.tar.gz')).toBe('application/octet-stream');
    expect(mimeFor('Makefile')).toBe('application/octet-stream');
    expect(mimeFor('image.bmp')).toBe('application/octet-stream');
  });

  it('is case-insensitive on the extension', () => {
    expect(mimeFor('IMG.PNG')).toBe('image/png');
    expect(mimeFor('PAGE.HTML')).toBe('text/html; charset=utf-8');
    expect(mimeFor('FOO.JSON')).toBe('application/json; charset=utf-8');
  });
});
