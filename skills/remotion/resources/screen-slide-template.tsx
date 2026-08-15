import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Img} from 'remotion';

interface ScreenSlideProps {
  imageSrc: string;
  title: string;
  description?: string;
  width: number;
  height: number;
}

export const ScreenSlide: React.FC<ScreenSlideProps> = ({
  imageSrc,
  title,
  description,
  width,
  height,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Zoom in animation
  const zoom = spring({
    frame,
    fps,
    from: 0.95,
    to: 1,
    config: {
      damping: 12,
      stiffness: 80,
    },
  });

  // Fade in animation
  const opacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 10,
    },
  });

  // Text overlay fade in (delayed)
  const textOpacity = spring({
    frame: frame - 15, // Delay by 15 frames
    fps,
    from: 0,
    to: 1,
    config: {
      damping: 10,
    },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* Screen Image */}
      <div
        style={{
          transform: `scale(${zoom})`,
          opacity,
          maxWidth: '90%',
          maxHeight: '80%',
          position: 'relative',
        }}
      >
        <Img
          src={imageSrc}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: '8px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>

      {/* Text Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          opacity: textOpacity,
          width: '80%',
        }}
      >
        <h1
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            color: '#fff',
            margin: '0 0 12px 0',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              fontSize: '24px',
              color: '#ddd',
              margin: 0,
              textShadow: '0 1px 5px rgba(0, 0, 0, 0.5)',
            }}
          >
            {description}
          </p>
        )}
      </div>
    </AbsoluteFill>
  );
};
