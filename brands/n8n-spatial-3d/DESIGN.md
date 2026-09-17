# Design System: Spatial 3D Dark Glassmorphism (n8n-spatial-3d)

> **Brand Identifier:** `n8n-spatial-3d`  
> **Author:** Fábrica de Sites Supervisionada (n8ncriator.site)  
> **Description:** Visual design system para dashboards espaciais 3D e landing pages de altíssima conversão para negócios locais (clínicas odontológicas, spas, harmonização facial). Inspirado em VisionOS, glassmorphism escuro e arquitetura de interiores de luxo.

---

## 🎨 Visual Identity & Color Tokens

### 1. Palette & Gradients
- **Ambient Room Backdrop:** `#0D0F14` com textura de estúdio de arquitetura (parede ripada de madeira nobre à esquerda, fita LED dourada/âmbar, concreto escuro charcoal).
- **Glass Panel Surface:** `rgba(22, 26, 35, 0.70)`
- **Glass Card Inner Surface:** `rgba(35, 40, 52, 0.60)`
- **Frosted Border Highlight:** `1px solid rgba(255, 255, 255, 0.12)` com `inset 0 1px 1px rgba(255, 255, 255, 0.20)`
- **Accent Primary (Electric Blue):** `#007AFF` / `rgb(0, 122, 255)`
- **Accent Secondary (Neon Cyan):** `#00C6FF` / `rgb(0, 198, 255)`
- **Text Main:** `#FFFFFF` (100% contraste)
- **Text Muted / Sub:** `#94A3B8` / `rgba(255, 255, 255, 0.65)`
- **Status OK:** `#30D158` (Verde Neon)
- **Status Error / Fail:** `#FF453A` (Vermelho Neon)

---

## 📐 Geometry, Spacing & Elevation

- **Border Radius:**
  - Outer Glass Panels: `28px`
  - Inner Cards & Viewports: `24px`
  - Action Buttons: `18px`
  - Floating Pill Bars & Capsules: `100px` (Full Rounded)
- **Blur & Glass Effects:**
  - `backdrop-filter: blur(20px) saturate(160%)`
  - `-webkit-backdrop-filter: blur(20px) saturate(160%)`
- **Depth Shadows:**
  - Ambient Glow: `0 30px 60px rgba(0, 0, 0, 0.60)`
  - Active Button Glow: `0 0 20px rgba(0, 198, 255, 0.35)`

---

## 🧩 Key Component Guidelines

### 1. Dial Circular 3D (Gauge Meter)
- Anel de progresso em SVG circular com gradiente contínuo de `#007AFF` a `#00C6FF`.
- Valor central em tipografia em negrito de 42px com gradiente de texto `linear-gradient(180deg, #FFFFFF, #00C6FF)`.
- Botões de alternância inferiores em pílula (`[ PASS ]`, `[ ERRORS ]`, `[ RE-AUDIT ]`).

### 2. Floating Vertical Pill Menu (Esquerda)
- Pílula flutuante vertical com fundo `rgba(28, 34, 46, 0.80)`.
- Ícones circulares de 52px x 52px com transição suave ao passar o mouse (`hover: scale(1.05)`).
- Indicador ativo com borda ciano e brilho neon.

### 3. Lead Hunter Lite Drawer (Gaveta de Nicho Customizado)
- Modal lateral deslizante para entrada de qualquer nicho de mercado (`[ Nicho ]` + `[ Cidade/UF ]`).
- Botão de disparo neon com gradiente azul/ciano.

### 4. Card Unificado de Prova Social Instagram
- Moldura de `24px` com sticker oficial animado do Instagram.
- Trilho bidirecional de fotos reais rolando à direita e depoimentos rolando à esquerda.

### 5. Tabela Transparente de 3 Colunas
- Colunas com backdrop de vidro translúcido.
- Botões WhatsApp pré-formatados com RFC 3986 sem necessidade de digitação pelo usuário.

---

## 💻 Integration Specifications
- **Framework Compatibility:** HTML5 Nativo, Tailwind CSS, Web Components, React, Vue.
- **CDN Policy:** Zero dependências externas de CDN em tempo de execução; assets locais e SVG embutidos.
