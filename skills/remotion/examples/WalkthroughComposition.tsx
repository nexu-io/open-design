import {Composition} from 'remotion';
import {Sequence} from 'remotion';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {TransitionSeries} from '@remotion/transitions';
import {ScreenSlide} from './ScreenSlide';
import screensManifest from '../screens.json';

// Calculate total duration in frames
const calculateDuration = () => {
  const totalSeconds = screensManifest.screens.reduce(
    (sum, screen) => sum + screen.duration,
    0
  );
  return totalSeconds * screensManifest.videoConfig.fps;
};

export const WalkthroughComposition: React.FC = () => {
  const {fps, width, height} = screensManifest.videoConfig;

  return (
    <TransitionSeries>
      {screensManifest.screens.map((screen, index) => {
        const durationInFrames = screen.duration * fps;
        
        // Select transition based on screen config
        const transition =
          screen.transitionType === 'slide'
            ? slide()
            : screen.transitionType === 'zoom'
            ? fade() // Can customize with zoom effect
            : fade();

        return (
          <TransitionSeries.Sequence
            key={screen.id}
            durationInFrames={durationInFrames}
          >
            <ScreenSlide
              imageSrc={screen.imagePath}
              title={screen.title}
              description={screen.description}
              width={screen.width}
              height={screen.height}
            />
            {index < screensManifest.screens.length - 1 && (
              <TransitionSeries.Transition
                presentation={transition}
                timing={{
                  durationInFrames: 20, // 20 frames for transition
                }}
              />
            )}
          </TransitionSeries.Sequence>
        );
      })}
    </TransitionSeries>
  );
};

// Register composition
export const RemotionRoot: React.FC = () => {
  const {fps, width, height} = screensManifest.videoConfig;
  const durationInFrames = calculateDuration();

  return (
    <>
      <Composition
        id="WalkthroughComposition"
        component={WalkthroughComposition}
        durationInFrames={durationInFrames}
        fps={fps}
        width={width}
        height={height}
      />
    </>
  );
};
