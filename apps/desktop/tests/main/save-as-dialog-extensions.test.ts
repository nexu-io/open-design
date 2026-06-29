import { describe, expect, test } from 'vitest';

import { saveAsDialogOptionsForFilename } from '../../src/main/runtime.js';

// Every programmatic export that streams a download must trigger the native
// Save As dialog — including the screenshot PDF, which is the default Export PDF
// flow. A previous version only intercepted .pptx + images, so PDF silently
// landed in the OS Downloads folder.
describe('saveAsDialogOptionsForFilename', () => {
  test('screenshot PDF download prompts Save As with a PDF filter', () => {
    const opts = saveAsDialogOptionsForFilename('My Deck.pdf');
    expect(opts).not.toBeNull();
    expect(opts!.defaultPath).toBe('My Deck.pdf');
    expect(opts!.filters[0]).toEqual({ name: 'PDF Document', extensions: ['pdf'] });
  });

  test('PPTX still prompts with a PowerPoint filter', () => {
    const opts = saveAsDialogOptionsForFilename('deck.pptx');
    expect(opts!.filters[0]).toEqual({ name: 'PowerPoint Presentation', extensions: ['pptx'] });
  });

  test('images prompt with an image filter', () => {
    for (const name of ['a.png', 'a.jpg', 'a.jpeg', 'a.webp']) {
      const opts = saveAsDialogOptionsForFilename(name);
      expect(opts!.filters[0].name).toBe('Images');
    }
  });

  test('uppercase extension is matched', () => {
    expect(saveAsDialogOptionsForFilename('DECK.PDF')).not.toBeNull();
  });

  test('non-intercepted extensions return null (write straight to Downloads)', () => {
    expect(saveAsDialogOptionsForFilename('notes.txt')).toBeNull();
    expect(saveAsDialogOptionsForFilename('noext')).toBeNull();
  });
});
