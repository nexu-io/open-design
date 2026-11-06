import { describe, expect, it } from 'vitest';

import { shouldDefaultCollapseChatForSharedNonOwner } from '../../src/components/ProjectView';

describe('shouldDefaultCollapseChatForSharedNonOwner', () => {
  it('collapses chat only when collab is enabled and the project is a confirmed shared non-owner', () => {
    expect(
      shouldDefaultCollapseChatForSharedNonOwner({
        enabled: true,
        isSharedNonOwner: true,
      }),
    ).toBe(true);
  });

  it('keeps chat open for owners (including catalog-effective owners)', () => {
    expect(
      shouldDefaultCollapseChatForSharedNonOwner({
        enabled: true,
        isSharedNonOwner: false,
      }),
    ).toBe(false);
  });

  it('does not collapse when collab is dormant', () => {
    expect(
      shouldDefaultCollapseChatForSharedNonOwner({
        enabled: false,
        isSharedNonOwner: true,
      }),
    ).toBe(false);
  });
});
