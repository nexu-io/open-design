// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UserAvatars } from '../../src/components/ui/user-avatars';

const users = [
  { id: 1, name: 'Alice', image: '/alice.jpg' },
  { id: 2, name: 'Bob', image: '/bob.jpg' },
  { id: 3, name: 'Charlie', image: '/charlie.jpg' },
];

afterEach(cleanup);

describe('UserAvatars', () => {
  it('counts hidden people without loading their images and exposes their names', () => {
    const { container } = render(<UserAvatars users={users} maxVisible={1} />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    const overflow = screen.getByRole('img', { name: '+2: Bob, Charlie' });
    fireEvent.focus(overflow);
    expect(screen.getByRole('tooltip').textContent).toBe('Bob, Charlie');
  });

  it('shows names on hover and keyboard focus, with Escape dismissal', () => {
    render(<UserAvatars users={users} />);
    const alice = screen.getByRole('img', { name: 'Alice' });
    fireEvent.mouseEnter(alice);
    expect(screen.getByRole('tooltip').textContent).toBe('Alice');
    fireEvent.mouseLeave(alice);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(alice);
    expect(screen.getByRole('tooltip').id).toBe(alice.getAttribute('aria-describedby'));
    fireEvent.keyDown(alice, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('falls back to initials when a portrait fails to load', () => {
    const { container } = render(<UserAvatars users={users.slice(0, 1)} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('img', { name: 'Alice' }).textContent).toBe('A');
  });

  it('omits the overflow bubble when everyone fits and renders nothing for an empty list', () => {
    const { container, rerender } = render(<UserAvatars users={users} maxVisible={3} />);
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.queryByText(/^\+/)).toBeNull();
    rerender(<UserAvatars users={[]} />);
    expect(container.childElementCount).toBe(0);
  });
});
