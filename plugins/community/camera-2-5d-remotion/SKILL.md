---
name: camera-2-5d-remotion
title: Camera 2.5D Remotion
en_name: Camera 2.5D Remotion
pt_name: Câmera 2.5D Remotion
description: After Effects-style 2.5D camera rig, spatial depth layers, and parallax keyframes with portable scene.json export for Remotion.
en_description: After Effects-style 2.5D camera rig, spatial depth layers, and parallax keyframes with portable scene.json export for Remotion.
pt_description: Adiciona fluxo de câmera 2.5D estilo After Effects com camadas espaciais, keyframes e exportação estruturada de scene.json para Remotion.
tags:
  - motion
  - camera-2.5d
  - remotion
  - parallax
  - after-effects
  - keyframes
  - depth
  - video
od:
  mode: motion
  scenario: camera-2.5d
  surface: web
---

# Camera 2.5D Remotion

Guia operacional e especificação técnica para adicionar profundidade espacial, camadas 2.5D e animação de câmera estilo After Effects a composições no OpenDesign, com exportação portável estruturada (`scene.json`) para renderização nativa no Remotion (React).

---

## 1. Princípio Fundamental de Design

Normal OpenDesign elements (texto, cartões, imagens, UI components, vetores SVG, formas) permanecem elementos HTML/CSS/React normais e editáveis.
- **NUNCA** converta tipografia ou cartões UI em malhas WebGL fechadas apenas para obter profundidade.
- A implementação base do visualizador no navegador utiliza CSS 3D Transforms nativos (`perspective`, `transform-style: preserve-3d`, `translate3d`, `rotateX`, `rotateY`, `rotateZ`).
- O estado de cena canônico (`scene.json`) é agnóstico a bibliotecas e plataformas, servindo como contrato compartilhado entre o preview web e o player/renderizador Remotion.

---

## 2. Quando Usar vs. Quando NÃO Usar

### Quando Usar
- Composições de motion design (stories 9:16, teasers, reels de produto, cards de anúncio, hero banners dinâmicos).
- Quando o usuário pede: "adicione profundidade", "coloque uma câmera 3D estilo After Effects", "crie um push-in suave", "faça um efeito de paralaxe entre o texto e o fundo", "prepare essa animação para Remotion".
- Quando há clara hierarquia entre primeiro plano (foreground), objeto central (middle) e plano de fundo (background).

### Quando NÃO Usar
- Interfaces puramente operacionais/dashboards estáticos onde distorção de perspectiva prejudica o uso.
- Documentos densos de texto (manuais, relatórios paginados, decks de texto corrido).
- Projetos que exigem 3D volumétrico complexo (geometrias PBR, iluminação Phong/raytracing, modelos GLTF) — para esses casos, use Three.js / WebGL dedicado.

---

## 3. Modelo de Camadas (Layers)

Cada elemento da composição que participa do espaço 2.5D recebe propriedades espaciais relativas à origem do mundo:

```json
{
  "id": "headline",
  "name": "Título Principal",
  "type": "text",
  "position": [0, -250, 100],
  "rotation": [0, 0, 0],
  "scale": 1,
  "anchorPoint": [0.5, 0.5],
  "opacity": 1
}
```

### Estratégia Padrão de Profundidade (Conservative Depth)
Quando o usuário não especificar coordenadas Z explícitas, adote profundidade conservadora para evitar aberração visual ou clipping:

| Camada | Posição Z Típica | Função |
|---|---|---|
| **Foreground (Primeiro Plano)** | `+80` a `+150` | Tipografia de impacto, badges, partículas frontais, micro-copy |
| **Middle (Sujeito Principal)** | `0` | Cartão principal, mockup de smartphone, avatar, produto |
| **Supporting (Elementos de Apoio)** | `-80` a `-180` | Sombras, decorações geométricas, cards secundários |
| **Background (Fundo)** | `-300` a `-500` | Grids, gradientes, ilustrações de ambiente, texturas |

---

## 4. Modelo de Câmera e Rig CSS

A composição possui uma instância de **CameraRig**. No HTML/CSS, a câmera é representada por um container com `perspective: <camera.perspective>px` e um container `world` com `transform-style: preserve-3d`.

### Transformação Relativa da Câmera
Para simular a visão da câmera no CSS, a matriz inversa da câmera é aplicada ao container do mundo:

```css
.camera-viewport {
  perspective: 1200px;
  perspective-origin: 50% 50%;
  width: 1080px;
  height: 1920px;
  overflow: hidden;
  position: relative;
}

.camera-world {
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
  /* Aplicado via JS/Interpolação de Keyframes: */
  /* transform: translate3d(-camX, -camY, camZ_base - camZ) rotateZ(-rotZ) rotateY(-rotY) rotateX(-rotX); */
}

.layer-element {
  position: absolute;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  /* transform: translate3d(posX, posY, posZ) rotateX(rotX) rotateY(rotY) rotateZ(rotZ) scale(scale); */
}
```

---

## 5. Biblioteca Canônica de Presets de Câmera

Cada preset resolve para keyframes estruturados com tempos, valores de câmera e curvas de aceleração:

1. **`push-in`**: Aproximação frontal ao longo do eixo Z (dolly suave em direção ao sujeito).
2. **`pull-out`**: Afastamento gradual no eixo Z, revelando o contexto completo da cena.
3. **`pan-left`**: Câmera translada para a direita em X (a cena se desloca para a esquerda com paralaxe).
4. **`pan-right`**: Câmera translada para a esquerda em X (a cena se desloca para a direita).
5. **`tilt-up`**: Rotação no eixo X olhando para cima acompanhada de leve descida vertical.
6. **`tilt-down`**: Rotação no eixo X olhando para baixo acompanhada de leve subida.
7. **`orbit-left`**: Rotação no eixo Y com translação combinada em X/Z mantendo o ponto focal no centro.
8. **`orbit-right`**: Rotação simétrica no eixo Y para o lado direito.
9. **`dolly-in`**: Deslocamento linear rápido de aproximação Z com aceleração cinematográfica.
10. **`dolly-out`**: Deslocamento linear de recuo Z.
11. **`parallax-push`**: Push-in combinado com leve ângulo oblíquo (Y -3° a -5°, Z 1°) para maximizar a disparidade perceptual entre camadas.
12. **`parallax-pull`**: Pull-out em ângulo oblíquo revelando os planos traseiros com grande profundidade.
13. **`subtle-drift`**: Movimento perpétuo e flutuante contínuo (drift lento em X, Y, Z e micro-rotações < 1°).

---

## 6. Especificação Portável de Dados: `scene.json`

Todo projeto e composição compatível deve manter um arquivo estruturado `scene.json`:

```json
{
  "$schema": "./references/scene-spec.md",
  "schemaVersion": "1.0.0",
  "canvas": {
    "width": 1080,
    "height": 1920
  },
  "fps": 30,
  "durationInFrames": 90,
  "camera": {
    "perspective": 1200,
    "initialPosition": [0, 0, 900],
    "initialRotation": [0, 0, 0],
    "keyframes": [
      {
        "frame": 0,
        "position": [0, 0, 900],
        "rotation": [0, 0, 0],
        "easing": "easeInOut"
      },
      {
        "frame": 60,
        "position": [100, -40, 550],
        "rotation": [0, -4, 1],
        "easing": "easeInOut"
      },
      {
        "frame": 90,
        "position": [108, -43, 535],
        "rotation": [0, -4.2, 1.1],
        "easing": "easeOut"
      }
    ]
  },
  "layers": [
    {
      "id": "headline",
      "type": "text",
      "position": [0, -260, 100],
      "rotation": [0, 0, 0],
      "scale": 1,
      "opacity": 1,
      "keyframes": []
    },
    {
      "id": "main-card",
      "type": "container",
      "position": [0, 60, 0],
      "rotation": [0, 0, 0],
      "scale": 1,
      "opacity": 1,
      "keyframes": []
    },
    {
      "id": "bg-elements",
      "type": "background",
      "position": [0, 0, -300],
      "rotation": [0, 0, 0],
      "scale": 1,
      "opacity": 1,
      "keyframes": []
    }
  ]
}
```

---

## 7. Integração Direta com Remotion (React)

No ecossistema Remotion, use a função nativa `interpolate()` com `Easing.bezier` ou curvas padrão (`Easing.inOut(Easing.ease)`). A cena lê `scene.json` e avalia em tempo de execução:

```tsx
import { useCurrentFrame, interpolate, Easing } from 'remotion';
import sceneData from './scene.json';

export const CameraComposition: React.FC = () => {
  const frame = useCurrentFrame();
  const { camera, layers, canvas } = sceneData;

  // Interpolação dos keyframes da câmera
  const kf0 = camera.keyframes[0];
  const kf1 = camera.keyframes[1];

  const camX = interpolate(frame, [kf0.frame, kf1.frame], [kf0.position[0], kf1.position[0]], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.42, 0, 0.58, 1)
  });
  const camY = interpolate(frame, [kf0.frame, kf1.frame], [kf0.position[1], kf1.position[1]], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.42, 0, 0.58, 1)
  });
  const camZ = interpolate(frame, [kf0.frame, kf1.frame], [kf0.position[2], kf1.position[2]], {
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.42, 0, 0.58, 1)
  });
  const rotY = interpolate(frame, [kf0.frame, kf1.frame], [kf0.rotation[1], kf1.rotation[1]], {
    extrapolateRight: 'clamp'
  });

  const worldTransform = `translate3d(${-camX}px, ${-camY}px, ${900 - camZ}px) rotateY(${-rotY}deg)`;

  return (
    <div style={{ width: canvas.width, height: canvas.height, perspective: `${camera.perspective}px` }}>
      <div style={{ width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: worldTransform }}>
        {layers.map(layer => (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              transformStyle: 'preserve-3d',
              transform: `translate3d(${layer.position[0]}px, ${layer.position[1]}px, ${layer.position[2]}px) scale(${layer.scale})`
            }}
          >
            {/* Componente React da camada */}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## 8. Protocolo Operacional do Agente OpenDesign

Ao receber qualquer comando relacionado a câmera, profundidade ou paralaxe:
1. **Inspecione a composição existente** sem alterar fontes, paleta ou identidade visual já aprovada.
2. **Identifique as camadas** semânticas (texto, cartões, fundos, detalhes).
3. **Atribua Z conservador** aos planos identificados.
4. **Aplique o CameraRig** e configure o preset ou os keyframes solicitados.
5. **Gere/Atualize o `scene.json`** no projeto.
6. **Valide a legibilidade do texto** em todos os frames de movimento.
