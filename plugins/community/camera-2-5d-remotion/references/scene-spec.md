# Especificação Técnica do Formato scene.json (v1.0.0)

O arquivo `scene.json` é o contrato universal de dados entre a composição visual no OpenDesign e o renderizador Remotion. Ele encapsula todas as propriedades dimensionais, posições Z, rotações e keyframes da câmera e camadas.

---

## Estrutura Raiz do Documento

```typescript
interface SceneSpecV1 {
  schemaVersion: "1.0.0";
  canvas: {
    width: number;           // Ex: 1080
    height: number;          // Ex: 1920
    aspectRatio?: string;    // Ex: "9:16"
  };
  fps: number;               // Ex: 30 ou 60
  durationInFrames: number;  // Ex: 90
  camera: CameraSpec;
  layers: LayerSpec[];
  assets?: AssetSpec[];
}
```

---

## 1. Especificação da Câmera (`CameraSpec`)

```typescript
interface CameraSpec {
  perspective: number;           // Valor de perspectiva em pixels (padrão: 1200)
  initialPosition: [x: number, y: number, z: number]; // Posição padrão em frame 0
  initialRotation: [rx: number, ry: number, rz: number]; // Graus
  keyframes: CameraKeyframe[];
}

interface CameraKeyframe {
  frame: number;                 // Frame exato da timeline (0 <= frame <= durationInFrames)
  position: [x: number, y: number, z: number]; // Vetor [x, y, z]
  rotation: [rx: number, ry: number, rz: number]; // Vetor em graus [rotX, rotY, rotZ]
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | string; // Curva de aceleração
}
```

---

## 2. Especificação de Camadas (`LayerSpec`)

```typescript
interface LayerSpec {
  id: string;                    // Identificador único (kebab-case)
  name?: string;                 // Nome legível da camada
  type: "text" | "container" | "image" | "video" | "background" | "vector";
  position: [x: number, y: number, z: number]; // [x, y, z] em pixels relativo ao centro
  rotation: [rx: number, ry: number, rz: number]; // Graus
  scale: number;                 // Multiplicador (padrão: 1.0)
  anchorPoint?: [ax: number, ay: number]; // Ponto de ancoragem normalizado (0.0 a 1.0, padrão [0.5, 0.5])
  opacity: number;               // 0.0 a 1.0
  keyframes?: LayerKeyframe[];   // Keyframes opcionais de propriedades da camada
}

interface LayerKeyframe {
  frame: number;
  property: "position" | "rotation" | "scale" | "opacity";
  value: number | [number, number, number];
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | string;
}
```

---

## 3. Especificação de Recursos de Mídia (`AssetSpec`)

```typescript
interface AssetSpec {
  id: string;
  type: "image" | "video" | "font" | "audio";
  src: string;                   // Caminho relativo ao projeto ou data URI
}
```

---

## 4. Mapeamento Matemático CSS vs. Remotion

### CSS Viewport
```css
transform: translate3d(${-camX}px, ${-camY}px, ${baseZ - camZ}px) 
           rotateZ(${-camRotZ}deg) 
           rotateY(${-camRotY}deg) 
           rotateX(${-camRotX}deg);
```

### Remotion Hook
```tsx
const x = interpolate(frame, [kfStart.frame, kfEnd.frame], [kfStart.position[0], kfEnd.position[0]], {
  easing: getRemotionEasing(kfStart.easing),
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp'
});
```
