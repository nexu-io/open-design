# Exemplo: basic-parallax (Câmera 2.5D Remotion)

Protótipo interativo e cena demonstrativa do plugin `camera-2-5d-remotion`.

---

## 🎯 Especificações Técnicas da Cena

- **Dimensões do Canvas:** 1080 × 1920 (proporção vertical 9:16)
- **Taxa de Quadros (FPS):** 30 fps
- **Duração Total:** 90 frames (3.0 segundos)
- **Câmera:**
  - Perspectiva ótica: `1200px`
  - Frame 0: Posição `[0, 0, 900]`, Rotação `[0, 0, 0]`
  - Frame 60: Posição `[100, -40, 550]`, Rotação `[0, -4, 1]`
  - Frame 90: Posição `[106, -42, 538]`, Rotação `[0, -4.2, 1.05]` (acomodação orgânica)
  - Curva de interpolação: `easeInOut`

---

## 🥞 Camadas e Hierarquia de Profundidade

1. **Camada 1 — Primeiro Plano (Foreground) | `Z = +100`**
   - Tipografia de alto impacto: *"NEXT-GEN MOTION RIG"*, subtítulo e badges de status.
   - Apresenta maior deslocamento relativo à medida que a câmera avança em Z e gira em Y.

2. **Camada 2 — Plano Médio (Middle) | `Z = 0`**
   - Cartão glassmorphism central com métricas, waveform de áudio e visualização de rig.
   - Ponto de âncora visual da composição; texto e micro-gráficos 100% nítidos e editáveis.

3. **Camada 3 — Plano Traseiro (Background) | `Z = -300`**
   - Malha de perspectiva isométrica profunda, orbes gradientes de luz e partículas espaciais.
   - Desloca-se mais lentamente (paralaxe negativa), fornecendo sensação imediata de escala e volume tridimensional.

---

## 🕹️ Recursos do Protótipo `index.html`

- **Scrubber de Timeline:** Arraste ou dê play/pause na animação de 90 frames.
- **Seletor de Presets em Tempo Real:** Alterne dinamicamente entre `parallax-push`, `push-in`, `orbit-left`, `orbit-right` e `subtle-drift`.
- **Modo Debug / Wireframe 3D:** Ative para visualizar a caixa delimitadora e o plano espacial de cada camada em tempo real.
- **Visualizador de `scene.json`:** Inspecione e copie a qualquer momento o payload pronto para o Remotion.
