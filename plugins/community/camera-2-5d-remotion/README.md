# camera-2-5d-remotion

Plugin oficial para OpenDesign que implementa um fluxo completo de **Câmera 2.5D no estilo After Effects**, com profundidade espacial por camadas, animação por keyframes, presets reutilizáveis e exportação de dados estruturados (`scene.json`) compatíveis nativamente com **Remotion** (React).

---

## 🎯 Objetivo & Filosofia

- **Elementos 100% Editáveis:** Camadas continuam sendo elementos web e React nativos (HTML, CSS, SVG, Cartões, Tipografia). Não convertemos texto ou UI em malhas WebGL fechadas.
- **Base CSS 3D Transforms:** Utiliza propriedades nativas do navegador (`perspective`, `transform-style: preserve-3d`, `translate3d`, `rotateX/Y/Z`).
- **Contrato Portável:** Todo o movimento da câmera, profundidade de camadas e curvas de aceleração são serializados em um `scene.json` sem dependência de runtimes externos ou Three.js.
- **Fidelidade no Remotion:** Reprodução quadro a quadro no Remotion através do hook `useCurrentFrame()` e da função `interpolate()`.

---

## 📁 Estrutura do Plugin

```text
camera-2-5d-remotion/
├── SKILL.md                          # Instruções comportamentais do agente OpenDesign
├── open-design.json                  # Manifesto do plugin (especificação OpenDesign v1)
├── README.md                         # Documentação geral e guia rápido
├── references/
│   ├── camera-presets.md             # Catálogo de 13 presets cinematográficos de câmera
│   ├── scene-spec.md                 # Especificação técnica do esquema scene.json
│   └── remotion-integration.md       # Guia e templates de código React + Remotion
├── examples/
│   └── basic-parallax/
│       ├── index.html                # Protótipo interativo completo com rig de câmera e controles
│       ├── scene.json                # Dados da cena exportados para o Remotion
│       └── README.md                 # Documentação específica do exemplo
└── assets/
    └── preview-card.svg              # Asset visual para identificação do plugin
```

---

## 🚀 Como Usar no OpenDesign

Quando o plugin estiver ativo, você pode solicitar comandos em linguagem natural:

- *"Adicione uma câmera 2.5D com paralaxe suave."*
- *"Aproxime a câmera com o preset push-in."*
- *"Coloque o título no primeiro plano (Z = +100) e o fundo distante (Z = -300)."*
- *"Crie uma órbita sutil para a direita focada no cartão principal."*
- *"Gere o arquivo scene.json para eu renderizar no Remotion."*

---

## 📐 Estratégia de Profundidade Padrão (Conservative Depth)

Para garantir um visual premium e manter a legibilidade dos textos:

| Plano | Coordenada Z | Elementos Recomendados |
|---|---|---|
| **Foreground** | `+100` | Títulos, badges, micro-interações |
| **Middle** | `0` | Cartão principal, UI hero, mockup de produto |
| **Supporting** | `-100` a `-200` | Cards de suporte, ilustrações secundárias |
| **Background** | `-300` a `-500` | Grids de fundo, gradientes, texturas |

---

## 🎥 Presets de Câmera Disponíveis

1. `push-in` (aproximação frontal Z)
2. `pull-out` (afastamento gradual Z)
3. `pan-left` (deslocamento lateral para a esquerda)
4. `pan-right` (deslocamento lateral para a direita)
5. `tilt-up` (inclinação vertical para cima)
6. `tilt-down` (inclinação vertical para baixo)
7. `orbit-left` (órbita orbital para a esquerda)
8. `orbit-right` (órbita orbital para a direita)
9. `dolly-in` (deslocamento rápido no eixo Z)
10. `dolly-out` (deslocamento rápido de recuo)
11. `parallax-push` (aproximação em ângulo oblíquo)
12. `parallax-pull` (afastamento em ângulo oblíquo)
13. `subtle-drift` (flutuação contínua cinematográfica)

---

## 📦 Instalação Local

No OpenDesign:
1. Abra **My plugins** (Meus plugins).
2. Adicione a pasta `camera-2-5d-remotion` ou execute:
```bash
od plugin install --source ./camera-2-5d-remotion
```
3. O plugin fica imediatamente disponível para novas composições e projetos existentes!
