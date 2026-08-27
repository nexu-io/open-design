// Root — registers the native data-rollup composition. The adapter's render.ts
// overrides width/height/fps/durationInFrames per call via selectComposition()
// and feeds the real data through inputProps. Mirrors bridge/Root.tsx so a 9:16
// or 1:1 frame isn't squashed into 16:9. (RFC-08 Phase 2)
import React from 'react';
import { Composition } from 'remotion';
import { DataRollup, type DataRollupProps } from './DataRollup';

const SAMPLE: DataRollupProps = {
  data: {
    title: 'This week on GitHub',
    unit: '',
    items: [
      { label: 'Mon', value: 1200 },
      { label: 'Tue', value: 2400 },
      { label: 'Wed', value: 1800 },
      { label: 'Thu', value: 4200 },
      { label: 'Fri', value: 3600 },
    ],
  },
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DataRollup"
      component={DataRollup}
      // Placeholder metadata; render.ts overrides all of these at render time.
      durationInFrames={150}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={SAMPLE}
      calculateMetadata={({ props }) => ({
        width: (props as { width?: number }).width ?? 1920,
        height: (props as { height?: number }).height ?? 1080,
      })}
    />
  );
};
