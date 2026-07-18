# Design System Inspired by NVIDIA

> Category: Mídia & Consumidor
> Computação GPU. Energia verde-preta, estética de poder técnico.

## 1. Visual Theme & Atmosphere

O site da NVIDIA é uma experiência de alto contraste e visão tecnológica que comunica poder computacional bruto por meio da contenção no design. A página é construída sobre uma base de preto (`#000000`) e branco (`#ffffff`), pontuada pelo verde característico da NVIDIA (`#76b900`) -- uma cor tão específica que funciona como uma impressão digital de marca. Este não é o verde exuberante da natureza; é o verde elétrico e deslocado para o lima da luz renderizada pela GPU, uma cor que fica entre o chartreuse e o kelly green e imediatamente sinaliza "NVIDIA" para qualquer pessoa no setor de tecnologia.

A família tipográfica personalizada NVIDIA-EMEA (com fallbacks para Arial e Helvetica) cria uma voz tipográfica limpa e industrial. Títulos em 36px negrito com line-height compacto de 1.25 geram blocos de texto densos e autoritativos. A fonte não tem a vivacidade geométrica das sans-serifs do Vale do Silício -- é europeia, pragmática e voltada para engenharia. O corpo de texto fica entre 15-16px, confortável para leitura, mas sem excessos, mantendo a sensação de que o espaço de tela é otimizado como memória de GPU.

O que distingue o design da NVIDIA de outros sites de tecnologia com fundo escuro é o uso disciplinado do destaque em verde. O `#76b900` aparece em bordas (`2px solid #76b900`), sublinhados de links (`underline 2px rgb(118, 185, 0)`) e CTAs -- mas nunca como fundo ou em grandes áreas de superfície no conteúdo principal. O verde é um sinal, não uma superfície. Combinado com um sistema de sombra profunda (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) e border radius mínimo (1-2px), o efeito geral é de hardware de engenharia de precisão renderizado em pixels.

**Características Principais:**
- NVIDIA Green (`#76b900`) como destaque puro -- apenas bordas, sublinhados e realces interativos
- Black (`#000000`) como fundo dominante com texto branco (`#ffffff`) nas seções escuras
- Fonte personalizada NVIDIA-EMEA com fallback Arial/Helvetica -- industrial, europeia, limpa
- Line-heights compactos (1.25 para títulos) criando blocos de texto densos e autoritativos
- Border radius mínimo (1-2px) -- cantos afiados e projetados em todo o layout
- Botões com borda verde (`2px solid #76b900`) como padrão interativo principal
- Sistema de ícones Font Awesome 6 Pro/Sharp com weight 900 para iconografia nítida
- Arquitetura multi-framework (PrimeReact, Fluent UI, Element Plus) habilitando componentes interativos ricos

## 2. Color Palette & Roles

### Primary Brand
- **NVIDIA Green** (`#76b900`): A assinatura -- bordas, sublinhados de links, contornos de CTA, indicadores ativos. Nunca usado como preenchimento de grandes superfícies.
- **True Black** (`#000000`): Fundo principal da página, texto em superfícies claras, tom dominante.
- **Pure White** (`#ffffff`): Texto em fundos escuros, fundos de seções claras, superfícies de cards.

### Extended Brand Palette
- **NVIDIA Green Light** (`#bff230`): Destaque lima brilhante para realces e estados de hover.
- **Orange 400** (`#df6500`): Destaque quente para alertas, badges em destaque ou contextos relacionados a energia.
- **Yellow 300** (`#ef9100`): Destaque quente secundário, realces de categoria de produto.
- **Yellow 050** (`#feeeb2`): Superfície quente clara para fundos de callout.

### Status & Semantic
- **Red 500** (`#e52020`): Estados de erro, ações destrutivas, alertas críticos.
- **Red 800** (`#650b0b`): Vermelho escuro para fundos de avisos graves.
- **Green 500** (`#3f8500`): Estados de sucesso, indicadores positivos (mais escuro que o verde da marca).
- **Blue 700** (`#0046a4`): Destaques informativos, alternativa de hover para links.

### Decorative
- **Purple 800** (`#4d1368`): Roxo profundo para finais de gradiente, contextos premium/IA.
- **Purple 100** (`#f9d4ff`): Tonalidade de superfície roxa clara.
- **Fuchsia 700** (`#8c1c55`): Destaque rico para promoções especiais ou conteúdo em evidência.

### Neutral Scale
- **Gray 300** (`#a7a7a7`): Texto atenuado, rótulos desabilitados.
- **Gray 400** (`#898989`): Texto secundário, metadados.
- **Gray 500** (`#757575`): Texto terciário, placeholders, rodapés.
- **Gray Border** (`#5e5e5e`): Bordas sutis, linhas divisórias.
- **Near Black** (`#1a1a1a`): Superfícies escuras, fundos de cards em páginas pretas.

### Interactive States
- **Link Default (dark bg)** (`#ffffff`): Links brancos em fundos escuros.
- **Link Default (light bg)** (`#000000`): Links pretos com sublinhado verde em fundos claros.
- **Link Hover** (`#3860be`): Deslocamento para azul ao passar o mouse em todas as variantes de link.
- **Button Hover** (`#1eaedb`): Realce teal para estados de hover de botão.
- **Button Active** (`#007fff`): Azul brilhante para estados ativos/pressionados de botão.
- **Focus Ring** (`#000000 solid 2px`): Contorno preto para foco via teclado.

### Shadows & Depth
- **Card Shadow** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Sombra ambiente sutil para cards elevados.

## 3. Typography Rules

### Font Family
- **Primary**: `NVIDIA-EMEA`, com fallbacks: `Arial, Helvetica, sans-serif`
- **Icon Font**: `Font Awesome 6 Pro` (weight 900 para ícones sólidos, 700 para regulares)
- **Icon Sharp**: `Font Awesome 6 Sharp` (weight 300 para ícones leves, 400 para regulares)

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (tight) | normal | Títulos de impacto máximo |
| Section Heading | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (tight) | normal | Títulos de seção, cabeçalhos de cards |
| Sub-heading | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (relaxed) | normal | Descrições de funcionalidades, subtítulos |
| Card Title | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (tight) | normal | Cabeçalhos de cards e módulos |
| Body Large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (relaxed) | normal | Corpo enfatizado, parágrafos de destaque |
| Body | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Texto de leitura padrão |
| Body Bold | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Rótulos em destaque, itens de navegação |
| Body Small | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (relaxed) | normal | Conteúdo secundário, descrições |
| Body Small Bold | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Conteúdo secundário enfatizado |
| Button Large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (tight) | normal | Botões CTA primários |
| Button | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (tight) | normal | Botões padrão |
| Button Compact | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (tight) | 0.144px | Botões pequenos/compactos |
| Link | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Links de navegação |
| Link Uppercase | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, rótulos de navegação |
| Caption | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Metadados, timestamps |
| Caption Small | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (tight) | normal | Letra miúda, textos legais |
| Micro Label | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, badges minúsculos |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (tight) | normal | Menor texto de UI |

### Principles
- **Negrito como voz padrão**: A NVIDIA usa intensamente o weight 700 para títulos, botões, links e rótulos. O weight 400 é reservado para corpo de texto e descrições -- todo o restante é negrito, projetando confiança e autoridade.
- **Títulos compactos, corpo relaxado**: O line-height dos títulos é consistentemente 1.25 (compacto), enquanto o corpo de texto relaxa para 1.50-1.67. Esse contraste cria densidade visual no topo dos blocos de conteúdo e leitura confortável nos parágrafos.
- **Maiúsculas na navegação**: Os rótulos de links usam `text-transform: uppercase` com weight 700, criando uma voz de navegação que se lê como rótulos de especificação técnica de hardware.
- **Sem rastreamento decorativo**: O letter-spacing é normal em todo o layout, exceto nos botões compactos (0.144px). A própria fonte carrega o caráter industrial sem manipulação.

## 4. Component Stylings

### Buttons

**Primary (Green Border)**
- Background: `transparent`
- Text: `#000000`
- Padding: 11px 13px
- Border: `2px solid #76b900`
- Radius: 2px
- Font: 16px weight 700
- Hover: background `#1eaedb`, text `#ffffff`
- Active: background `#007fff`, text `#ffffff`, border `1px solid #003eff`, scale(1)
- Focus: background `#1eaedb`, text `#ffffff`, outline `#000000 solid 2px`, opacity 0.9
- Use: CTA primário ("Learn More", "Explore Solutions")

**Secondary (Green Border Thin)**
- Background: transparent
- Border: `1px solid #76b900`
- Radius: 2px
- Use: Ações secundárias, CTAs alternativos

**Compact / Inline**
- Font: 14.4px weight 700
- Letter-spacing: 0.144px
- Line-height: 1.00
- Use: CTAs inline, navegação compacta

### Cards & Containers
- Background: `#ffffff` (claro) ou `#1a1a1a` (seções escuras)
- Border: nenhuma (bordas limpas) ou `1px solid #5e5e5e`
- Radius: 2px
- Shadow: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` para cards elevados
- Hover: intensificação da sombra
- Padding: 16-24px interno

### Links
- **Em Fundo Escuro**: `#ffffff`, sem sublinhado, hover muda para `#3860be`
- **Em Fundo Claro**: `#000000` ou `#1a1a1a`, sublinhado `2px solid #76b900`, hover muda para `#3860be`, sublinhado removido
- **Links Verdes**: `#76b900`, hover muda para `#3860be`
- **Links Atenuados**: `#666666`, hover muda para `#3860be`

### Navigation
- Fundo preto escuro (`#000000`)
- Logo alinhado à esquerda, wordmark NVIDIA proeminente
- Links: NVIDIA-EMEA 14px weight 700 uppercase, `#ffffff`
- Hover: mudança de cor, sem alteração do sublinhado
- Mega-menus dropdown para categorias de produtos
- Fixo ao rolar com backdrop

### Image Treatment
- Renderizações de produtos/GPUs como imagens hero, frequentemente em largura total
- Imagens de screenshot com sombra sutil para profundidade
- Sobreposições de gradiente verde em seções hero escuras
- Containers de avatar circulares com radius 50%

### Distinctive Components

**Product Cards**
- Card branco ou escuro limpo com radius mínimo (2px)
- Borda de destaque verde ou sublinhado no título
- Padrão de título em negrito + descrição mais leve
- CTA com borda verde na parte inferior

**Tech Spec Tables**
- Layouts de grade industrial
- Fundos de linhas alternados (deslocamento sutil de cinza)
- Rótulos em negrito, valores regulares
- Destaques verdes para métricas principais

**Cookie/Consent Banner**
- Posicionamento fixo na parte inferior
- Botões arredondados (radius 2px)
- Tratamentos de borda cinza

## 5. Layout Principles

### Spacing System
- Unidade base: 8px
- Escala: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Valores de padding primários: 8px, 11px, 13px, 16px, 24px, 32px
- Espaçamento de seção: 48-80px de padding vertical

### Grid & Container
- Largura máxima de conteúdo: aproximadamente 1200px (contido)
- Seções hero em largura total com texto contido
- Seções de funcionalidades: grades de 2-3 colunas para cards de produto
- Coluna única para conteúdo de artigo/blog
- Layouts com barra lateral para documentação

### Whitespace Philosophy
- **Densidade proposital**: A NVIDIA usa espaçamento mais compacto do que sites SaaS típicos, refletindo a densidade do conteúdo técnico. O espaço em branco existe para separar conceitos, não para criar vazio de luxo.
- **Ritmo de seção**: Seções escuras se alternam com seções brancas, usando a cor de fundo (não apenas espaçamento) para separar blocos de conteúdo.
- **Densidade de cards**: Os cards de produto ficam próximos entre si com gaps de 16-20px, criando uma sensação de catálogo e não de galeria.

### Border Radius Scale
- Micro (1px): Spans inline, elementos minúsculos
- Standard (2px): Botões, cards, containers, inputs -- o padrão para praticamente tudo
- Circle (50%): Imagens de avatar, indicadores de abas circulares

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (Level 0) | Sem sombra | Fundos de página, texto inline |
| Subtle (Level 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Cards padrão, modais |
| Border (Level 1b) | `1px solid #5e5e5e` | Divisores de conteúdo, bordas de seção |
| Green accent (Level 2) | `2px solid #76b900` | Elementos ativos, CTAs, itens selecionados |
| Focus (Accessibility) | `2px solid #000000` outline | Anel de foco via teclado |

**Filosofia de Sombra**: O sistema de profundidade da NVIDIA é mínimo e utilitário. Há essencialmente um único valor de sombra -- um desfoque ambiente de 5px com 30% de opacidade -- usado com parcimônia em cards e modais. O sinal de profundidade principal não é a sombra, mas o _contraste de cores_: fundos pretos ao lado de seções brancas, bordas verdes em superfícies pretas. Isso cria uma camada visual semelhante ao hardware, onde a profundidade vem da diferença de material, não de luz simulada.

### Decorative Depth
- Lavagens de gradiente verde por trás do conteúdo hero
- Gradientes do escuro ao mais escuro (preto para quase-preto) em transições de seção
- Sem glassmorphism ou efeitos de desfoque -- clareza acima de atmosfera

## 7. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile Small | <375px | Coluna única compacta, padding reduzido |
| Mobile | 375-425px | Layout mobile padrão |
| Mobile Large | 425-600px | Mobile mais largo, algumas indicações de 2 colunas |
| Tablet Small | 600-768px | Grades de 2 colunas começam |
| Tablet | 768-1024px | Grades de cards completas, navegação expandida |
| Desktop | 1024-1350px | Layout desktop padrão |
| Large Desktop | >1350px | Largura máxima de conteúdo, margens generosas |

### Touch Targets
- Botões usam padding de 11px 13px para alvos de toque confortáveis
- Links de navegação em 14px uppercase com espaçamento adequado
- Botões com borda verde fornecem alvos de toque de alto contraste em fundos escuros
- Mobile: recolhimento do menu hamburger com sobreposição em tela cheia

### Collapsing Strategy
- Hero: título de 36px escala proporcionalmente para baixo
- Navegação: nav horizontal completa se recolhe ao menu hamburger em ~1024px
- Cards de produto: de 3 colunas para 2 colunas para coluna única empilhada
- Rodapé: grade de múltiplas colunas se recolhe para coluna única empilhada
- Espaçamento de seção: 64-80px reduz para 32-48px no mobile
- Imagens: mantêm proporção, escalam para a largura do container

### Image Behavior
- Renderizações de GPU/produto mantêm alta resolução em todos os tamanhos
- Imagens hero escalam proporcionalmente com o viewport
- Imagens de card usam proporções consistentes
- Seções escuras em largura total mantêm tratamento de borda a borda

## 8. Responsive Behavior (Extended)

### Typography Scaling
- Display de 36px escala para ~24px no mobile
- Títulos de seção de 24px escalam para ~20px no mobile
- O corpo de texto mantém 15-16px em todos os breakpoints
- O texto dos botões mantém 16px para alvos de toque consistentes

### Dark/Light Section Strategy
- Seções escuras (fundo preto, texto branco) se alternam com seções claras (fundo branco, texto preto)
- O destaque verde permanece consistente em ambos os tipos de superfície
- No escuro: links são brancos, sublinhados são verdes
- No claro: links são pretos, sublinhados são verdes
- Essa alternância cria um ritmo de rolagem natural e agrupamento de conteúdo

## 9. Agent Prompt Guide

### Quick Color Reference
- Destaque primário: NVIDIA Green (`#76b900`)
- Fundo escuro: True Black (`#000000`)
- Fundo claro: Pure White (`#ffffff`)
- Texto de título (fundo escuro): White (`#ffffff`)
- Texto de título (fundo claro): Black (`#000000`)
- Corpo de texto (fundo claro): Black (`#000000`) ou Near Black (`#1a1a1a`)
- Corpo de texto (fundo escuro): White (`#ffffff`) ou Gray 300 (`#a7a7a7`)
- Hover de link: Blue (`#3860be`)
- Borda de destaque: `2px solid #76b900`
- Hover de botão: Teal (`#1eaedb`)

### Example Component Prompts
- "Create a hero section on black background. Headline at 36px NVIDIA-EMEA weight 700, line-height 1.25, color #ffffff. Subtitle at 18px weight 400, line-height 1.67, color #a7a7a7. CTA button with transparent background, 2px solid #76b900 border, 2px radius, 11px 13px padding, text #ffffff. Hover: background #1eaedb, text white."
- "Design a product card: white background, 2px border-radius, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Title at 20px NVIDIA-EMEA weight 700, line-height 1.25, color #000000. Body at 15px weight 400, line-height 1.67, color #757575. Green underline accent on title: border-bottom 2px solid #76b900."
- "Build a navigation bar: #000000 background, sticky top. NVIDIA logo left-aligned. Links at 14px NVIDIA-EMEA weight 700 uppercase, color #ffffff. Hover: color #3860be. Green-bordered CTA button right-aligned."
- "Create a dark feature section: #000000 background. Section label at 14px weight 700 uppercase, color #76b900. Heading at 24px weight 700, color #ffffff. Description at 16px weight 400, color #a7a7a7. Three product cards in a row with 20px gap."
- "Design a footer: #000000 background. Multi-column layout with link groups. Links at 14px weight 400, color #a7a7a7. Hover: color #76b900. Bottom bar with legal text at 12px, color #757575."

### Iteration Guide
1. Sempre use `#76b900` como destaque, nunca como preenchimento de fundo -- é uma cor de sinal para bordas, sublinhados e realces
2. Botões são transparentes com bordas verdes por padrão -- fundos preenchidos aparecem apenas nos estados hover/active
3. Weight 700 é a voz dominante para todos os elementos interativos e títulos; 400 é apenas para parágrafos de corpo
4. Border radius é 2px para tudo -- esse arredondamento afiado e mínimo é central para a estética industrial
5. Seções escuras usam texto branco; seções claras usam texto preto -- o destaque verde funciona de forma idêntica em ambos
6. O hover de link é sempre `#3860be` (azul) independentemente da cor padrão do link
7. Line-height 1.25 para títulos, 1.50-1.67 para corpo de texto -- mantenha esse contraste para a hierarquia visual
8. A navegação usa 14px bold uppercase -- essa tipografia de rótulo de hardware faz parte da voz da marca
