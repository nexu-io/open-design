// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PetOverlay, type PetTaskCenter } from '../../src/components/pet/PetOverlay';
import type { PetConfig } from '../../src/types';

const pet: PetConfig = {
  adopted: true,
  enabled: true,
  petId: 'custom',
  custom: {
    name: 'YoRHa Sit-2B',
    glyph: 'N',
    accent: '#df6a45',
    greeting: 'Ready.',
  },
};

const recentOnly: PetTaskCenter = {
  running: [],
  queued: [],
  recent: [
    {
      projectId: 'p1',
      projectName: 'Web Prototype',
      status: 'succeeded',
      updatedAt: 100,
    },
  ],
};

function tapPet() {
  const sprite = screen.getByLabelText(/YoRHa Sit-2B/);
  fireEvent.pointerDown(sprite, {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
  });
  fireEvent.pointerUp(sprite, {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerId: 1,
  });
}

beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  cleanup();
});

describe('PetOverlay recent task acknowledgement', () => {
  it('shows recent completions immediately in persistent bubble mode', () => {
    const { container } = render(
      <PetOverlay pet={pet} taskCenter={recentOnly} persistentBubble />,
    );

    expect(container.querySelector('.pet-sprite-status')?.textContent).toBe('1');
    expect(screen.getByText('Recently completed')).not.toBeNull();
    expect(screen.getByText('Web Prototype')).not.toBeNull();
  });

  it('clears the recent completion badge after the user opens it and hides it after closing', () => {
    const { container } = render(<PetOverlay pet={pet} taskCenter={recentOnly} />);

    expect(container.querySelector('.pet-sprite-status')?.textContent).toBe('1');

    tapPet();

    expect(container.querySelector('.pet-sprite-status')).toBeNull();
    expect(screen.getByText('Recently completed')).not.toBeNull();
    expect(screen.getByText('Web Prototype')).not.toBeNull();

    tapPet();
    expect(screen.queryByText('Recently completed')).toBeNull();

    tapPet();
    expect(container.querySelector('.pet-sprite-status')).toBeNull();
    expect(screen.queryByText('Recently completed')).toBeNull();
    expect(screen.queryByText('Web Prototype')).toBeNull();
  });
});
