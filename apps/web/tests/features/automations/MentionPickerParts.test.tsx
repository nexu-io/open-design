// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MentionItem, MentionSection } from '../../../src/features/automations/components/MentionPickerParts';

afterEach(() => cleanup());

describe('MentionSection', () => {
  it('renders the label and its children', () => {
    render(
      <MentionSection label="Skills">
        <span>child</span>
      </MentionSection>,
    );
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });
});

describe('MentionItem', () => {
  it('shows the plain icon and fires onPick when not yet selected', () => {
    const onPick = vi.fn();
    render(<MentionItem icon="file" label="Skill One" meta="Skill" selected={false} onPick={onPick} />);
    const option = screen.getByRole('option', { name: /Skill One/ });
    expect(option.getAttribute('aria-selected')).toBe('false');
    expect(option.className).not.toContain('is-selected');

    fireEvent.mouseDown(option);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('shows a checkmark and the selected class when already selected', () => {
    render(<MentionItem icon="file" label="Skill One" meta="Skill" selected onPick={vi.fn()} />);
    const option = screen.getByRole('option', { name: /Skill One/ });
    expect(option.getAttribute('aria-selected')).toBe('true');
    expect(option.className).toContain('is-selected');
  });
});
