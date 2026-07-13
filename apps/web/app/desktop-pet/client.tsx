'use client';

import dynamic from 'next/dynamic';

const DesktopPetSurface = dynamic(
  () => import('../../src/components/pet/DesktopPetSurface').then((m) => m.DesktopPetSurface),
  { ssr: false },
);

export function DesktopPetClient() {
  return <DesktopPetSurface />;
}
