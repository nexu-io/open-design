import { describe, expect, it } from 'vitest';

import {
  addSuggestionToDraft,
  isSuggestionInDraft,
  normalizeDraftText,
  removeSuggestionFromDraft,
  toggleSuggestionInDraft,
} from '../../../src/runtime/chat/suggestion-draft';

describe('suggestion-draft', () => {
  describe('whole-line matching (review: remove only the inserted occurrence)', () => {
    it('does not treat a suggestion\'s words inside a typed sentence as selected', () => {
      const draft = 'Please do not Add dark mode yet';
      expect(isSuggestionInDraft(draft, 'Add dark mode')).toBe(false);
    });

    it('adds the suggestion as its own line and removes it again without touching the sentence', () => {
      const typed = 'Please do not Add dark mode yet';
      const added = addSuggestionToDraft(typed, 'Add dark mode');
      expect(added).toBe('Please do not Add dark mode yet\nAdd dark mode');
      expect(isSuggestionInDraft(added, 'Add dark mode')).toBe(true);
      expect(removeSuggestionFromDraft(added, 'Add dark mode')).toBe(typed);
    });

    it('removing a suggestion that is not a whole line deletes nothing', () => {
      const typed = 'Please do not Add dark mode yet';
      expect(removeSuggestionFromDraft(typed, 'Add dark mode')).toBe(typed);
    });

    it('does not alter another selected suggestion that contains this one\'s text', () => {
      const draft = 'Add dark mode toggle\nAdd dark mode';
      expect(removeSuggestionFromDraft(draft, 'Add dark mode')).toBe('Add dark mode toggle');
      expect(isSuggestionInDraft('Add dark mode toggle', 'Add dark mode')).toBe(false);
    });

    it('removes a single occurrence only', () => {
      expect(removeSuggestionFromDraft('A\nB\nA', 'A')).toBe('B\nA');
    });
  });

  describe('adding', () => {
    it('uses the suggestion as the whole draft when the draft is empty', () => {
      expect(addSuggestionToDraft('', 'Add a page')).toBe('Add a page');
      expect(addSuggestionToDraft('  \n ', 'Add a page')).toBe('Add a page');
    });

    it('is idempotent: selecting twice never appends a second copy', () => {
      const once = addSuggestionToDraft('hello', 'Add a page');
      expect(addSuggestionToDraft(once, 'Add a page')).toBe(once);
    });

    it('keeps several suggestions as separate lines in click order', () => {
      let draft = '';
      draft = addSuggestionToDraft(draft, 'One');
      draft = addSuggestionToDraft(draft, 'Two');
      expect(draft).toBe('One\nTwo');
      expect(removeSuggestionFromDraft(draft, 'One')).toBe('Two');
      expect(removeSuggestionFromDraft('Two', 'Two')).toBe('');
    });
  });

  describe('image fallback payloads (review: normalize before matching)', () => {
    const payload = 'Make variants\n\nimages/a.png\nimages/b.png';

    it('matches the draft as the editor stores it (blank lines collapsed)', () => {
      const stored = normalizeDraftText(payload);
      expect(stored).toBe('Make variants\nimages/a.png\nimages/b.png');
      expect(isSuggestionInDraft(stored, payload)).toBe(true);
    });

    it('selects, deselects and reselects cleanly', () => {
      let draft = normalizeDraftText(addSuggestionToDraft('', payload));
      expect(isSuggestionInDraft(draft, payload)).toBe(true);
      draft = normalizeDraftText(toggleSuggestionInDraft(draft, payload, false));
      expect(draft).toBe('');
      expect(isSuggestionInDraft(draft, payload)).toBe(false);
      draft = normalizeDraftText(toggleSuggestionInDraft(draft, payload, true));
      expect(draft.match(/Make variants/g)).toHaveLength(1);
    });
  });

  describe('selection follows the draft (review: reconcile when the draft changes)', () => {
    it('is not selected once the draft is cleared or edited by hand', () => {
      const draft = addSuggestionToDraft('', 'Add a page');
      expect(isSuggestionInDraft(draft, 'Add a page')).toBe(true);
      expect(isSuggestionInDraft('', 'Add a page')).toBe(false);
      expect(isSuggestionInDraft('Add a pag', 'Add a page')).toBe(false);
    });
  });
});
