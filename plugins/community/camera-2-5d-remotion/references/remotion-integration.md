# Integração com Remotion (React)

Este guia fornece a implementação completa de referência para consumir um arquivo `scene.json` gerado pelo OpenDesign dentro de um projeto Remotion.

---

## 1. Instalação e Requisitos do Remotion

Dentro do seu projeto Remotion:
```bash
npm install remotion @remotion/paths
```

---

## 2. Componente de Câmera 2.5D Reutilizável (`Camera25DRig.tsx`)

```tsx
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';

export interface CameraKeyframe {
  frame: number;
  position: [number, number, number];
  rotation: [number, number, number];
  easing?: string;
}

export interface LayerData {
  id: string;
  type: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  opacity: number;
  content?: React.ReactNode;
}

export interface SceneData {
  canvas: { width: number; height: number };
  camera: {
    perspective: number;
    keyframes: CameraKeyframe[];
  };
  layers: LayerData[];
}

function resolveEasing(name?: string) {
  switch (name) {
    case 'linear': return Easing.linear;
    case 'easeIn': return Easing.in(Easing.quad);
    case 'easeOut': return Easing.out(Easing.quad);
    case 'easeInOut':
    default:
      return Easing.inOut(Easing.cubic);
  }
}

export const Camera25DRig: React.FC<{ scene: SceneData; childrenMap: Record<string, React.ReactNode> }> = ({
  scene,
  childrenMap
}) => {
  const frame = useCurrentFrame();
  const { camera, canvas, layers } = scene;
  const kfs = camera.keyframes;

  // Encontra o segmento de keyframe ativo
  let segmentIndex = 0;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (frame >= kfs[i].frame && frame <= kfs[i + 1].frame) {
      segmentIndex = i;
      break;
    }
    if (frame > kfs[i + 1].frame) {
      segmentIndex = i;
    }
  }

  const kfStart = kfs[segmentIndex];
  const kfEnd = kfs[segmentIndex + 1] || kfStart;

  const progressRange = [kfStart.frame, Math.max(kfStart.frame + 1, kfEnd.frame)];
  const easingFn = resolveEasing(kfStart.easing);

  const camX = interpolate(frame, progressRange, [kfStart.position[0], kfEnd.position[0]], {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const camY = interpolate(frame, progressRange, [kfStart.position[1], kfEnd.position[1]], {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const camZ = interpolate(frame, progressRange, [kfStart.position[2], kfEnd.position[2]], {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  const rotX = interpolate(frame, progressRange, [kfStart.rotation[0], kfEnd.rotation[0]], {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const rotY = interpolate(frame, progressRange, [kfStart.rotation[1], kfEnd.rotation[1]], {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const rotZ = interpolate(frame, progressRange, [kfStart.rotation[2], kfEnd.rotation[2]], {
    easing: easingFn,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  // Base Z de calibração para manter perspectiva coerente
  const baseZ = 900;
  const worldTransform = `translate3d(${-camX}px, ${-camY}px, ${baseZ - camZ}px) rotateZ(${-rotZ}deg) rotateY(${-rotY}deg) rotateX(${-rotX}deg)`;

  return (
    <div
      style={{
        width: canvas.width,
        height: canvas.height,
        position: 'relative',
        overflow: 'hidden',
        perspective: `${camera.perspective}px`,
        perspectiveOrigin: '50% 50%',
        backgroundColor: '#07090e'
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          transformStyle: 'preserve-3d',
          transform: worldTransform
        }}
      >
        {layers.map(layer => {
          const [lx, ly, lz] = layer.position;
          const [rx, ry, rz] = layer.rotation;
          const layerTransform = `translate3d(${lx}px, ${ly}px, ${lz}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${layer.scale})`;

          return (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: `translate(-50%, -50%) ${layerTransform}`,
                transformStyle: 'preserve-3d',
                opacity: layer.opacity,
                pointerEvents: 'none'
              }}
            >
              {childrenMap[layer.id] || null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

---

## 3. Registro no `Root.tsx` do Remotion

```tsx
import { Composition } from 'remotion';
import sceneData from './scene.json';
import { MyParallaxVideo } from './MyParallaxVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Camera25DParallax"
      component={MyParallaxVideo}
      durationInFrames={sceneData.durationInFrames}
      fps={sceneData.fps}
      width={sceneData.canvas.width}
      height={sceneData.canvas.height}
      defaultProps={{ scene: sceneData }}
    />
  );
};
```
