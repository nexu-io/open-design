# Catálogo de Presets de Câmera 2.5D

Este documento define a parametrização formal dos 13 presets de câmera suportados pelo plugin `camera-2-5d-remotion`. Cada preset pode ser instanciado em qualquer duração (em frames) e gera keyframes determinísticos em `scene.json`.

---

## Convenções de Sistema de Coordenadas

- **Eixo X**: Horizontal (+X move a câmera para a direita; a cena aparenta mover-se para a esquerda).
- **Eixo Y**: Vertical (+Y move a câmera para baixo; a cena aparenta mover-se para cima).
- **Eixo Z**: Profundidade (+Z afasta a câmera dos objetos no plano zero; diminuir Z aproxima a câmera).
- **Rotação X (Tilt/Pitch)**: Inclinação em torno do eixo X (graus).
- **Rotação Y (Pan/Yaw)**: Rotação lateral em torno do eixo vertical Y (graus).
- **Rotação Z (Roll)**: Inclinação angular da imagem no plano (graus).
- **Perspective**: 1200px padrão (equivalente a uma lente de aproximadamente 50mm em filme 35mm).
- **Posição Inicial Padrão da Câmera**: `[0, 0, 900]`, Rotação `[0, 0, 0]`.

---

## Tabela de Presets (Duração Base: 60 frames a 30 FPS)

### 1. `push-in` (Aproximação Suave)
- **Objetivo**: Foco crescente no sujeito principal sem distorcer o enquadramento.
- **Keyframe 0**: Pos `[0, 0, 900]`, Rot `[0, 0, 0]`.
- **Keyframe 60**: Pos `[0, 0, 580]`, Rot `[0, 0, 0]`.
- **Easing**: `easeInOut`.

### 2. `pull-out` (Afastamento Gradual)
- **Objetivo**: Revelar elementos secundários e ambientação ao redor do sujeito central.
- **Keyframe 0**: Pos `[0, 0, 600]`, Rot `[0, 0, 0]`.
- **Keyframe 60**: Pos `[0, 0, 960]`, Rot `[0, 0, 0]`.
- **Easing**: `easeOut`.

### 3. `pan-left` (Deslocamento Lateral Esquerda)
- **Objetivo**: Efeito de passagem horizontal evidenciando a paralaxe entre tipografia e fundo.
- **Keyframe 0**: Pos `[-120, 0, 900]`, Rot `[0, 2, 0]`.
- **Keyframe 60**: Pos `[120, 0, 900]`, Rot `[0, -2, 0]`.
- **Easing**: `easeInOut`.

### 4. `pan-right` (Deslocamento Lateral Direita)
- **Objetivo**: Translação lateral em sentido oposto.
- **Keyframe 0**: Pos `[120, 0, 900]`, Rot `[0, -2, 0]`.
- **Keyframe 60**: Pos `[-120, 0, 900]`, Rot `[0, 2, 0]`.
- **Easing**: `easeInOut`.

### 5. `tilt-up` (Inclinação Vertical Ascendente)
- **Objetivo**: Câmera começa apontando ligeiramente para baixo e sobe revelando o topo do layout.
- **Keyframe 0**: Pos `[0, 80, 900]`, Rot `[-3.5, 0, 0]`.
- **Keyframe 60**: Pos `[0, -60, 900]`, Rot `[2.5, 0, 0]`.
- **Easing**: `easeInOut`.

### 6. `tilt-down` (Inclinação Vertical Descendente)
- **Objetivo**: Efeito descendente cinematográfico.
- **Keyframe 0**: Pos `[0, -70, 900]`, Rot `[3, 0, 0]`.
- **Keyframe 60**: Pos `[0, 70, 900]`, Rot `[-3, 0, 0]`.
- **Easing**: `easeInOut`.

### 7. `orbit-left` (Órbita Lateral Esquerda)
- **Objetivo**: Rotação tridimensional em torno do centro focal, destacando o relevo do cartão intermediário.
- **Keyframe 0**: Pos `[-80, 0, 900]`, Rot `[0, -4.5, 0]`.
- **Keyframe 60**: Pos `[80, 0, 870]`, Rot `[0, 4.5, 0]`.
- **Easing**: `easeInOut`.

### 8. `orbit-right` (Órbita Lateral Direita)
- **Objetivo**: Órbita tridimensional no sentido inverso.
- **Keyframe 0**: Pos `[80, 0, 870]`, Rot `[0, 4.5, 0]`.
- **Keyframe 60**: Pos `[-80, 0, 900]`, Rot `[0, -4.5, 0]`.
- **Easing**: `easeInOut`.

### 9. `dolly-in` (Dolly Rápido com Frenagem)
- **Objetivo**: Dinâmica enérgica para anúncios ou teasers rápidos de produto.
- **Keyframe 0**: Pos `[0, 0, 1050]`, Rot `[0, 0, 0]`.
- **Keyframe 45**: Pos `[0, 0, 520]`, Rot `[0, 0, 0]`.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (expo out).

### 10. `dolly-out` (Dolly de Recuo Elegante)
- **Objetivo**: Transição de saída e encerramento de cena.
- **Keyframe 0**: Pos `[0, 0, 520]`, Rot `[0, 0, 0]`.
- **Keyframe 60**: Pos `[0, 0, 1050]`, Rot `[0, 0, 0]`.
- **Easing**: `easeInOut`.

### 11. `parallax-push` (Preset Recomendado para Demonstrações)
- **Objetivo**: Combina aproximação Z com leve ângulo oblíquo nos eixos Y e Z, gerando máxima separação ótica entre planos sem perder a elegância.
- **Keyframe 0**: Pos `[0, 0, 900]`, Rot `[0, 0, 0]`.
- **Keyframe 60**: Pos `[100, -40, 550]`, Rot `[0, -4, 1]`.
- **Keyframe 90**: Pos `[108, -43, 535]`, Rot `[0, -4.2, 1.1]` (drift suave de assentamento).
- **Easing**: `easeInOut`.

### 12. `parallax-pull` (Afastamento Oblíquo)
- **Objetivo**: Saída suave com ângulo dimensional.
- **Keyframe 0**: Pos `[90, -35, 560]`, Rot `[0, -3.5, 0.8]`.
- **Keyframe 60**: Pos `[-20, 10, 920]`, Rot `[0, 1.2, -0.4]`.
- **Easing**: `easeInOut`.

### 13. `subtle-drift` (Flutuação Contínua)
- **Objetivo**: Movimento perpétuo orgânico simulando operação com Steadicam.
- **Keyframe 0**: Pos `[0, 0, 900]`, Rot `[0, 0, 0]`.
- **Keyframe 45**: Pos `[18, -12, 880]`, Rot `[-0.4, 0.8, 0.2]`.
- **Keyframe 90**: Pos `[-14, 10, 865]`, Rot `[0.3, -0.6, -0.2]`.
- **Keyframe 135**: Pos `[0, 0, 900]`, Rot `[0, 0, 0]`.
- **Easing**: `easeInOut`.
