# Design System Inspired by PlayStation

> Category: Mídia e Consumidor
> Varejo de console de games. Layout de canal com três superfícies, tipografia de exibição com autoridade discreta, escala cyan no hover.

## 1. Visual Theme & Atmosphere

PlayStation.com se porta como o braço de marketing de uma marca premium de eletrônicos de consumo que, por acaso, também vende entretenimento. A página é organizada como um **canal vertical de superfícies alternadas**: um masthead e hero quase pretos, uma sequência de painéis editoriais branco-papel no meio e um rodapé azul-cobalto profundo que ancora toda a experiência. Entre esses modos de superfície, o site aposta pesado em fotografia e renders 3D de produtos — o console PS5, capas de jogos, controles DualSense — deixando o hardware fazer o trabalho emocional enquanto o restante da interface permanece contido.

O movimento tipográfico característico é o **SST Light (peso 300) em tamanhos grandes**. A família SST personalizada da Sony é usada de 22px até 54px no peso 300, conferindo aos títulos de exibição uma qualidade sussurrada e elegante que se aproxima mais de um anúncio de relógio de luxo do que de uma loja de games. Essa "autoridade discreta" é o oposto exato do grito Manuka da The Verge ou da densidade de banca da Wired — PlayStation quer que a tipografia recue e o produto lidere. Corpo e interface apoiam-se nos pesos 500–700, mas a voz de *exibição* é consistentemente fina e calma.

O único lugar onde a contenção se rompe é na **interação**. Todo botão primário tem o mesmo movimento de hover: o preenchimento muda para um cyan elétrico `#1eaedb`, uma borda branca de 2px aparece, um anel externo azul-PlayStation de 2px floresce atrás dele e o botão inteiro **escala 1,2×**. Essa combinação de pop de cor, borda, anel e escala é um movimento característico único da Sony entre as grandes marcas — uma animação miniatura de "ligar" que o site repete centenas de vezes em uma única página.

**Características Principais:**
- Layout de canal com três superfícies: hero quase preto, conteúdo branco-papel, rodapé azul-cobalto — alternando, nunca mesclando
- SST peso 300 de 22–54px para exibição — títulos de "autoridade discreta" que deixam a fotografia do produto liderar
- PlayStation Blue `#0070cc` como âncora da marca; cyan `#1eaedb` reservado exclusivamente para estados de hover/focus
- Todo elemento interativo escala 1,2× no hover — um "power-on" característico exclusivo do PlayStation
- Botões pill com raio total de 999px; artes de cards em retângulos arredondados de 12–24px
- Commerce-orange `#d53b00` usado exclusivamente para CTAs de PlayStation Store / estados de compra
- Cobertura ampla de breakpoints até 2120px — o site escala até contextos de navegação em TVs 4K

## 2. Color Palette & Roles

### Primary (Brand Anchor)
- **PlayStation Blue** (`#0070cc`): A cor âncora da marca. Usada no rodapé principal, links inline, preenchimentos de botão primário em superfícies escuras e em todo marcador "oficial". Trate-a como imutável — é a cor que a marca mais associa na memória do consumidor.
- **Console Black** (`#000000`): Preto puro para o masthead, fundos do hero e zonas de apresentação de produtos. O PlayStation usa o preto para enquadrar o hardware da mesma forma que um museu usa o preto para enquadrar uma escultura.

### Secondary & Accent
- **PlayStation Cyan** (`#1eaedb`): A cor de interação. Aplicada SOMENTE nos estados de hover, focus e active de botões e links. Nunca aparece como fundo padrão ou cor de texto em repouso. Combine com uma borda `#ffffff` de 2px e um anel externo `#0070cc` de 2px no hover para o tratamento característico completo.
- **Link Hover Blue** (`#1883fd`): A variante mais brilhante usada nos hovers de links de texto inline. Distinto do Cyan — esta é a cor de link, Cyan é a cor de botão.
- **Dark Link Blue** (`#0068bd`): A cor do link em repouso em superfícies claras — um primo levemente mais saturado do azul da marca.

### Surface & Background
- **Paper White** (`#ffffff`): Tela de conteúdo principal para painéis editoriais entre o masthead e o rodapé.
- **Ice Mist** (`#f5f7fa`): O ponto de parada atmosférico do gradiente de seção clara. Usado sutilmente atrás de certos painéis para elevá-los do branco puro.
- **Divider Tint** (`#f3f3f3`): A cor discreta de régua horizontal entre linhas de conteúdo.
- **Masthead Black** (`#000000`): Tela da navegação superior e do hero — reservada para zonas centradas no produto.
- **Shadow Black** (`#121314`): A âncora inicial do gradiente de seção escura quando um painel precisa de profundidade atmosférica.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Fundo translúcido usado atrás de barras de filtro fixas — o único momento de "glassmorphism" no site.

### Neutrals & Text
- **Display Ink** (`#000000`): Títulos de exibição principais em superfícies brancas.
- **Deep Charcoal** (`#1f1f1f`): Títulos de corpo e cor de link em repouso — levemente mais suave que o preto puro para reduzir o anel visual em blocos grandes.
- **Body Gray** (`#6b6b6b`): Texto de corpo secundário e metadados.
- **Mute Gray** (`#cccccc`): Rótulos terciários, estados desabilitados.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Texto de placeholder de formulário — 60% preto, não um valor de cinza separado.
- **Inverse White** (`#ffffff`): Texto principal em superfícies escuras e azuis.
- **Dark-Link Blue** (`#53b1ff`): A cor do link em repouso em superfícies escuras/pretas — uma variante mais clara e aérea do PlayStation Blue para legibilidade no preto.

### Semantic & Commerce
- **Commerce Orange** (`#d53b00`): Reservado para CTAs de estado de compra da PlayStation Store, chamadas de preço e badges de "em promoção". A única cor quente no site — use com moderação e nunca fora de um contexto de comércio.
- **Commerce Orange Active** (`#aa2f00`): O estado pressionado/ativo dos botões de comércio.
- **Warning Red** (`#c81b3a`): Erros de formulário e avisos de ações destrutivas.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): O scrim dramático usado atrás de texto de hero sobre fotografia de produto.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Anel de elevação de baixo peso em cards.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Elevação de card extremamente leve — quase invisível, mas separa painéis brancos do fundo branco.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): A sombra mais leve do sistema.

### Gradient System
O PlayStation usa **dois gradientes de seção** e nada mais:
- **Light Section Gradient**: de `#ffffff` → `#f5f7fa` — uma lavagem quase imperceptível que eleva suavemente um painel da tela.
- **Dark Section Gradient**: de `#121314` → `#000000` — uma lavagem vertical curta que dá aos painéis de hero um vinhete sutil sem introduzir qualquer mudança de matiz.

Ambos os gradientes são usados **somente como fundos de seção**, nunca dentro de componentes. Não há botões com gradiente, não há texto com gradiente, não há halos brilhantes. A marca é azul — não azul-para-roxo, não azul-para-cyan.

## 3. Typography Rules

### Font Family
- **SST** / **Playstation SST** (Sony, proprietária) — fallback: `Arial`, `Helvetica`. A tipografia global personalizada da Sony, projetada por Toshi Omagari e Akira Kobayashi. Cobre os pesos 300 / 500 / 600 / 700 na página inicial. O peso **300 de 22–54px** é a assinatura tipográfica do PlayStation.
- **SST (condensed / alternate)** — fallback: `helvetica`, `arial`. Uma variante comprimida usada em alguns módulos de interface onde a largura importa.
- **Arial** — fallback utilitário para a rara variante de botão que renderiza em sans-serif do sistema.

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | O maior momento SST na página — título de luxo com peso discreto |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Títulos de hero secundários |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Títulos de painel de destaque |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Cabeçalhos de seção |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Títulos de módulo — ainda no peso leve 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Subtítulo promocional |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Títulos de interface compactos |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Rótulo de botão primário |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTAs de maior ênfase (comprar, assinar) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Rótulo de botão secundário |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Corpo de leitura padrão |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Texto de link inline |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | Mini CTAs em cards |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Legendas, rótulos de tags |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Metadados padrão |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Legenda enfatizada |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Legenda semi-negrito |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Botão de interface com entrelinha compacta |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Rótulo de tab/pill |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Menor legenda de interface |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Microcópia de rodapé, texto legal |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Microtexto enfatizado |

### Principles
- **Peso 300 em tamanhos grandes é a voz.** O PlayStation é a única grande marca de console que usa um display de peso leve para seus títulos de hero. Resista à tentação de "atualizar" a tipografia de exibição para 500 ou 700 — a discrição é a personalidade.
- **O peso salta na camada de interface.** Abaixo de 18px, o sistema muda para 500–700 para legibilidade. O gradiente de peso de 300 (exibição) → 400 (corpo) → 500 (legendas) → 700 (botões) é a hierarquia.
- **O espaçamento entre letras é quase imperceptível.** A maioria dos valores está entre 0,1–0,45px, positivos ou levemente negativos. O `-0.1px` no hero de 54px aperta a tipografia de exibição o suficiente para parecer "projetada" sem se tornar uma declaração tipográfica.
- **Duas caixas SST.** "SST" e "Playstation SST" são funcionalmente a mesma família com conjuntos de métricas levemente diferentes (Playstation SST é mais compacta em tamanhos pequenos). Trate-as como intercambiáveis para fins externos ao licenciamento interno da Sony.
- **Sem caixa alta.** Ao contrário da The Verge ou da Wired, o PlayStation raramente usa rótulos em MAIÚSCULAS. Kickers e tags permanecem em title case ou sentence case — outro movimento de "autoridade discreta".
- **Sem serifa em lugar algum.** O sistema inteiro é sans-serif. Não há contraponto de voz impressa.

## 4. Component Stylings

### Buttons

**Primary — PlayStation Blue Pill**
- Background: `#0070cc` (PlayStation Blue)
- Text: `#ffffff`, SST 18px / 500 / 0.4px tracking
- Border: nenhuma em repouso
- Border radius: `999px` — pill completo
- Padding: ~`12px 24px` (variável conforme a classe de tamanho)
- Outline: `rgb(255, 255, 255) none 0px` em repouso
- **Hover (movimento característico)**:
  - Background preenchido com `#1eaedb` (PlayStation Cyan)
  - Text permanece `#ffffff`
  - Borda `#ffffff` de 2px aparece
  - Anel externo `#0070cc` de 2px floresce (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — o botão cresce 20% de fato
- Active: `opacity: 0.6` — um escurecimento rápido para sinalizar o pressionamento
- Focus: igual ao hover, mas o anel torna-se `rgb(0, 114, 206) 0px 0px 0px 2px` de focus shadow
- Transition: ~180ms ease em background, transform e shadow

**Secondary — White Outline on Dark**
- Background: `#ffffff`
- Text: `#0172ce` (variante do PlayStation Blue)
- Border: `2px outset #000000` — uma borda `outset` genuína, extremamente rara no CSS moderno
- Radius: variável (frequentemente `999px` ou `36px`)
- Padding: `16px 20px`
- Hover: mesmo preenchimento cyan característico + scale(1.2) + tratamento de anel
- Focus: mesmo tratamento de anel

**Commerce Orange**
- Background: `#d53b00` (Commerce Orange)
- Text: `#ffffff`, SST 18px / 700 / 0.45px tracking
- Border radius: `999px` — pill
- Usado apenas em CTAs de PS Store / Comprar / Subscribe Plus
- Active: background escurece para `#aa2f00`
- Hover: segue a regra de inversão-cyan como todos os outros botões (NÃO um hover específico para laranja)

**Transparent Ghost**
- Background: transparente
- Text: `#1f1f1f` (Deep Charcoal)
- Border: `1px solid #dedede`
- Padding: `0 10px` (compacto, otimizado para navegação)
- Hover: preenchimento cyan, texto branco, borda branca de 2px, scale(1.2)
- Active: texto muda para `#0072ce`, opacity 0.6

**Icon Circle**
- Background: `rgba(0, 0, 0, 0.2)` sobre fotografia; `#ffffff` em superfícies claras
- Border radius: `100%` — círculo perfeito
- Usado para setas prev/next de carrossel e botões de compartilhamento
- Hover: clareia para `var(--color-role-backgrounds-primary-link-hover)` (aproximadamente `#e5e5e5` em superfície clara)

**Mini CTA (In-card)**
- SST 14px / 700 / 0.324px tracking
- Padding ~8px 16px
- Radius: `999px`
- Usado dentro de cards de jogos para mini CTAs de "Comprar Agora" / "Adicionar ao Carrinho"

### Cards & Containers

**Hero Card (Game Feature)**
- Background: fotografia/render — geralmente ancorado no preto
- Border radius: `24px` ou `19px` para cards de destaque
- Padding: 32–48px interior
- Shadow: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — uma sombra dramática usada apenas quando um card se sobrepõe à fotografia do hero
- Hover: transformação de escala sutil, contorno cyan aparece no CTA primário

**Game Cover Tile**
- Background: arte da capa do jogo, sem padding
- Border radius: `12px` ou `13px` (imagens) / `19px` (moldura do card)
- Shadow: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — elevação extremamente leve
- Hover: o CTA primário do card acende em cyan, o card em si pode escalar 1,02×
- Transition: 200ms ease em transform

**Content Panel (White)**
- Background: `#ffffff` ou o gradiente de seção clara `#ffffff → #f5f7fa`
- Border: normalmente nenhuma; separado dos vizinhos por espaçamento e sombras sutis
- Radius: `12px`–`24px` conforme a hierarquia do painel
- Shadow: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — a mais leve do sistema

**Dark Card on Dark**
- Background: `rgba(0, 0, 0, 0.2)` sobre fotografia
- Border radius: `6px` (compacto) ou `24px` (destaque)
- Usado para inserções de "kit de imprensa" ou "bloco de estatísticas" sobre vídeo de hero

### Inputs & Forms
- **Default**: background `#ffffff`, borda `1px solid #cccccc`, border radius `3px` (mais compacto que o restante do sistema — os inputs são o único lugar onde o PlayStation é genuinamente compacto), texto SST 16px em `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Focus**: anel de focus `#0070cc` de 2px via `box-shadow: 0 0 0 2px #0070cc`. Sem mudança de border-color — o anel faz o trabalho.
- **Error**: borda e texto mudam para `#c81b3a` (Warning Red), texto de erro inline abaixo no mesmo vermelho.
- **Transition**: ~180ms ease em border e shadow.

### Navigation

- **Top nav**: faixa full-bleed preta (`#000000`) com o logo do PlayStation (branco) alinhado à esquerda, links de categoria centralizados em SST 14–16px / 500 e um pequeno CTA "Entrar" alinhado à direita.
- **Hover em link de nav**: cor transiciona de `#ffffff` para `#1883fd` (Link Hover Blue), sem sublinhado.
- **Seção ativa**: marcada por um sublinhado sutil de 2px em `#0070cc`.
- **Mobile**: a nav colapsa para um drawer hamburguer. Dentro do drawer, os links se empilham verticalmente com gaps de 16px e padding horizontal de 20px.
- **Comportamento sticky**: a nav permanece fixada no topo durante a rolagem; quando entra em uma zona de superfície clara, ela **não inverte** — permanece com fundo preto em todos os momentos.

### Image Treatment

- **Aspect ratios**: 16:9 vídeo/fotografia de hero, 1:1 renders de console, 3:4 artes de capa de jogo, 4:3 imagens de lifestyle.
- **Corners**: arredondados para `12px`, `13px` ou `24px` conforme o contexto do card. Capas de jogos recebem `6–12px`, imagens de hero recebem `24px`.
- **Full-bleed**: somente no hero do masthead e banners promocionais do rodapé. Todo o restante fica dentro de uma coluna de conteúdo com padding.
- **Shadow**: drop dramático `rgba(0, 0, 0, 0.8) 0 5px 9px 0` nos heroes, pena `rgba(0, 0, 0, 0.06) 0 5px 9px 0` nas tiles de grade.
- **Hover**: a imagem permanece estática, a moldura do card e o CTA primário respondem.
- **Lazy loading**: `loading="lazy"` em tudo abaixo da dobra, `eager` no hero do masthead.

### Game Store Pill (Distinctive)
- Background: `#ffffff`
- Text: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Radius: `9999px` — pill completo
- Uma tag pill neutra que fica ao lado das capas de jogos para identificar a plataforma ("PS5", "PS4", "PSVR2"). Contraste branco-sobre-escuro.

## 5. Layout Principles

### Spacing System
- **Unidade base**: 8px.
- **Escala**: 1, 2, 3, 4,5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Padding de seção**: 48–96px vertical entre painéis principais. Transições de hero para conteúdo usam o limite superior.
- **Padding de card**: 20–32px interior. Cards de hero de destaque podem expandir para 48px.
- **Espaçamento inline**: 8–12px entre título e deck, 12–16px entre deck e CTA.
- **Micro-escala**: Os valores 1/2/3/4,5/5/9/10/12 são usados para padding de pill, espaçamento de legenda e deslocamentos de borda — não para ritmo editorial.

### Grid & Container
- **Largura máxima**: ~1920px (breakpoints detectados pelo dembrandt até 2120px). Limites de container normalmente em torno de `1280–1920px` conforme o painel.
- **Padrões de colunas**: grade responsiva de 12 colunas que se resolve em linhas de tiles de jogos de 3/4/6 colunas conforme a hierarquia. Zonas de hero frequentemente ocupam 12 colunas; tiles em destaque ficam em configurações 6+3+3 ou 4+4+4.
- **Padding externo**: 16px mobile → 48px tablet → 64–96px desktop.
- **Gutters**: 16–24px entre colunas, mais compactos (8–12px) dentro de clusters de tiles.

### Whitespace Philosophy
O PlayStation trata o espaço em branco como uma marca de luxo trata a iluminação da loja — como um sinal premium. Há visivelmente mais espaço de respiro vertical entre módulos do que em qualquer outro grande site de varejo, e os painéis editoriais brancos frequentemente contêm apenas um título + uma imagem + um CTA com padding em escala de hero. O efeito é um "ritmo de galeria" onde cada produto tem seu próprio espaço em vez de competir em uma grade de miniaturas.

### Border Radius Scale
- **2px** — botões de banner de cookies e interface administrativa pequena
- **3px** — inputs de formulário, painéis de tab (mais compactos que tudo o mais — uma indicação deliberada de "interface funcional")
- **6px** — botões compactos e imagens inline
- **12px** — imagens padrão de capa de jogo e imagens de conteúdo
- **13px** — certos wrappers de figura (um deslocamento de 1px em relação a 12px para aninhamento)
- **19px** — cards de destaque
- **20px** — spans de tag inline
- **24px** — cards de hero, molduras de destaque principal
- **36px** — nav pill completo e variantes de botão secundário
- **48px** — botões de destaque grandes
- **999px / 100%** — botões primários pill completo e botões de ícone circulares

Onze valores discretos de raio — um dos sistemas de raio mais ricos entre todos os sites deste catálogo. O intervalo existe porque o PlayStation usa deliberadamente raios diferentes para *hierarquias* diferentes: 3px para utilitário, 12px para mídia, 24px para destaques, 999px para CTAs.

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| 0 | Sem sombra | Conteúdo padrão em `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Elevação levíssima de painel editorial |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Elevação padrão de tile de grade |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Card enfatizado (hover ou active) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Sombra de sobreposição de hero — drop dramático usado sobre fotografia |
| 5 | `0 0 0 2px #0070cc` (focus ring) | Estado de focus do botão primário |
| 6 | `0 0 0 2px #000000` (hover ring) | Anel de hover do botão secundário |
| 7 | Gradiente de seção `#121314 → #000000` | Profundidade atmosférica em painéis de hero escuros |

A filosofia de profundidade do PlayStation é **em camadas, mas contida**. A escala de sombra vai de 0,06 a 0,16 para estados normais, depois salta para 0,8 nos drops de hero — não há meio-termo de 0,2, 0,3, 0,4. O efeito é que a maior parte da página fica quase plana, mas quando um card de hero precisa flutuar sobre a fotografia, ele genuinamente *flutua*. A elevação é ou sussurrada ou gritada, nunca murmurada.

### Decorative Depth
- **Gradientes de seção** (escuro e claro, ambos descritos acima) — usados apenas como fundos de seção
- **Anéis de focus/hover** em 2px, sempre azul ou cyan conforme o estado
- **Sem brilhos, desfocagens ou efeitos atmosféricos** além dos dois gradientes de seção
- **Sem botões ou texto com gradiente** — o sistema visual é de blocos de cor sólida em todos os lugares, exceto nas transições de seção

## 7. Do's and Don'ts

### Do
- **Use** o PlayStation Blue (`#0070cc`) como preenchimento primário de CTA e âncora do rodapé. É a cor âncora da marca.
- **Use** SST peso 300 para todo título de exibição de 22px ou maior. O título de peso discreto é a voz.
- **Aplique** a assinatura completa de hover em todo botão primário: preenchimento cyan + borda branca de 2px + anel azul externo de 2px + `scale(1.2)`.
- **Use** raio pill completo (`999px`) em botões primários e de comércio.
- **Reserve** o PlayStation Cyan (`#1eaedb`) exclusivamente para estados de hover, focus e active — nunca como fundo em repouso.
- **Use** o Commerce Orange (`#d53b00`) apenas em CTAs de PlayStation Store / compra e chamadas de preço.
- **Alterne** painéis de hero escuros com painéis de conteúdo brancos e ancore com um rodapé azul profundo — o layout de canal com três superfícies é o ritmo da página.
- **Use** sombras de drop dramáticas `rgba(0, 0, 0, 0.8)` no hero quando um card se sobrepõe à fotografia do produto.
- **Mantenha** a navegação superior preta em todas as posições de rolagem — ela não inverte para branco sobre painéis claros.

### Don't
- **Não coloque** os títulos de exibição em negrito. Peso 300 de 22–54px é a voz do PlayStation. Tipografia de exibição no peso 700 lê como "mais um varejista de games".
- **Não use** rótulos ou kickers em CAIXA ALTA. O PlayStation raramente usa maiúsculas — é uma marca de autoridade discreta, não uma fita de sinalização de risco.
- **Não use** botões, texto ou fundos com gradiente fora dos dois gradientes de seção declarados.
- **Não introduza** cores quentes além do Commerce Orange. Sem CTAs vermelhos, sem destaques amarelos, sem pills de sucesso verdes.
- **Não use** cantos quadrados em botões ou mídia. O sistema tem onze raios — escolha um, mas nunca `0`.
- **Não omita** o movimento de hover `scale(1.2)` nos botões primários. A escala de elevação é uma assinatura de interação da marca.
- **Não use** tipografia serifada. O sistema é 100% SST sans-serif.
- **Não deixe** o cyan `#1eaedb` aparecer como cor de texto ou fundo em repouso. Ele só existe em movimento.
- **Não projete** painéis que disputem atenção. O ritmo de espaço em branco do PlayStation dá a cada módulo sua própria "sala de galeria".

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Small Mobile | <400px | Coluna única, nav colapsa para hamburguer, hero SST escala para ~28px |
| Mobile | 400–599px | Coluna única, tiles empilham em largura total, padding abre para 16px |
| Large Mobile | 600–767px | Ainda coluna única, mas opção de 2 colunas de tiles em módulos selecionados |
| Tablet Portrait | 768–1023px | Grade de 2 colunas para jogos, nav ainda condensada |
| Tablet Landscape | 1024–1279px | Grade de 3–4 colunas, nav completa restaurada |
| Desktop | 1280–1599px | Grade editorial completa, escala máxima de exibição do hero (44–54px) |
| Large Desktop | 1600–1919px | Container limitado a 1600px, margens expandem |
| 4K / Big-Screen | ≥1920px | Container expande para máximo de 1920px, conteúdo do hero escala para corresponder à distância de visualização da TV |
| Ultra-Wide | ≥2120px | Breakpoint extremo — a página permanece ancorada, margens externas absorvem a largura extra |

O varredura dembrandt detectou 30 breakpoints entre 320px e 2120px — um intervalo responsivo excepcionalmente amplo. O PlayStation sintoniza especificamente para **contextos de tela grande** (1920–2120px) porque os donos de PS5 frequentemente navegam no site em TVs pelo navegador do console ou via cast-to-TV a partir de um celular. A maioria dos sites de varejo para de sintonizar em 1440px; o PlayStation continua sintonizando até 4K.

### Touch Targets
- Os botões pill primários têm ~48–56px de altura (texto SST 18px + ~12–16px de padding vertical) — confortavelmente WCAG AAA.
- Os links de nav são menores (~32–40px de altura) no desktop; no mobile expandem para 48px+ dentro do drawer.
- Os botões de ícone circular têm 40–48px — adequados para toque.

### Collapsing Strategy
- **Nav**: nav completa → condensada → drawer hamburguer à medida que o viewport estreita. O logo permanece fixado à esquerda; o CTA permanece fixado à direita.
- **Grid**: 6 col → 4 col → 3 col → 2 col → 1 col. Os cards de tiles de jogos refluem sem cortar a arte da capa.
- **Spacing**: o padding de seção aperta de 96px → 64px → 48px → 32px → 24px à medida que o viewport estreita.
- **Type**: o hero SST escala de 54px → 44px → 35px → 28px → 22px. O peso leve 300 é preservado em todos os tamanhos.
- **Hero photography**: troca de art-direction — o desktop usa cortes largos 16:9, o mobile usa cortes 4:3 ou 1:1 com o produto centralizado.

### Image Behavior
- Raster responsivo (`srcset` + `<picture>` com art-direction), aspect ratios preservados por breakpoint.
- Pronto para 4K: o site serve imagens de alta densidade a 1920px+ para evitar upscaling na navegação em TV.
- `loading="lazy"` em tudo abaixo da dobra; o hero é `eager` com uma dica de preload.

## 9. Agent Prompt Guide

### Quick Color Reference
- **Primary CTA**: "PlayStation Blue (`#0070cc`)"
- **Hover / Focus Accent**: "PlayStation Cyan (`#1eaedb`)"
- **Background (White Surface)**: "Paper White (`#ffffff`)"
- **Background (Dark Surface)**: "Console Black (`#000000`)"
- **Heading Text on White**: "Display Ink (`#000000`)"
- **Body Text on White**: "Deep Charcoal (`#1f1f1f`)"
- **Body Text on Black**: "Inverse White (`#ffffff`)"
- **Commerce / Buy Accent**: "Commerce Orange (`#d53b00`)"
- **Footer Anchor**: "PlayStation Blue (`#0070cc`)"

### Example Component Prompts
1. *"Crie um botão de CTA primário com preenchimento PlayStation Blue `#0070cc`, texto branco em SST 18px / 500 / 0,4px de tracking, border radius de 999px, padding de 12px × 24px. No hover, o fundo transiciona para `#1eaedb` PlayStation Cyan, uma borda `#ffffff` de 2px aparece, um anel externo `#0070cc` de 2px floresce via box-shadow e o botão inteiro escala 1,2× — tudo em uma transição ease de 180ms."*
2. *"Projete um painel de hero em uma tela Console Black `#000000` com um título SST peso 300 de 54px em `#ffffff` com letter-spacing de -0,1px e line-height de 1,25. Posicione um único CTA primário abaixo com o tratamento de hover padrão do PlayStation. Sem rótulos em MAIÚSCULAS em nenhum lugar."*
3. *"Monte um tile de capa de jogo: imagem em aspect ratio 3:4 com border radius de 12px, sombra de pena `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, um título SST 700 de 14px abaixo, uma tag de plataforma SST 500 de 12px e um mini CTA primário de 14px / 700 / 0,324px de tracking em PlayStation Blue."*
4. *"Crie um botão pill de comércio para uma compra na PlayStation Store: preenchimento Commerce Orange `#d53b00`, texto `#ffffff` em SST 18px / 700 / 0,45px de tracking, raio de 999px, padding de 12px × 28px. O estado active escurece para `#aa2f00`. O hover segue a inversão cyan padrão com escala de 1,2×."*
5. *"Projete um painel de conteúdo branco entre seções de hero escuras: fundo `#ffffff` com o gradiente de seção clara sutil `#ffffff → #f5f7fa`, border radius de 24px, padding interior de 48px, elevação de pena `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, um título SST 300 de 35px, um parágrafo de corpo de 18px e um único CTA primário."*

### Iteration Guide
Ao refinar telas existentes geradas com este design system:
1. **Audite o peso de exibição.** Todo título de 22px ou maior deve ser SST peso 300. Se você vir peso 500 ou 700 na escala de hero, você perdeu a voz do PlayStation.
2. **Audite o tratamento de hover.** Todo botão primário deve escalar 1,2× no hover com a combinação de preenchimento cyan + borda branca + anel azul. Perder qualquer um dos quatro quebra a assinatura de interação.
3. **Audite os cantos.** Todo container e botão deve ter 2, 3, 6, 12, 13, 19, 20, 24, 36, 48 ou 999px / 100%. Cantos quadrados quebram a voz.
4. **Audite a dispersão de cores.** Somente PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`) e os cinzas/pretos/brancos declarados devem aparecer no chrome. Se você vir qualquer outra matiz, corrija-a.
5. **Audite a alternância de superfície.** A página deve alternar hero escuro → conteúdo branco → hero escuro → conteúdo branco → rodapé azul. Se dois painéis de mesma superfície estiverem adjacentes, insira uma transição.
6. **Audite a caixa.** Somente sentence case e title case. Sem rótulos, botões ou kickers em MAIÚSCULAS. Se você vir maiúsculas, converta.
7. **Audite o peso da sombra.** A opacidade da sombra deve ser 0,06 / 0,08 / 0,16 / 0,8 — nada entre esses valores. Se você vir sombras de drop com 0,1, 0,2, 0,3, 0,5, corrija para o nível declarado mais próximo.
8. **Audite o espaço em branco.** Se dois módulos parecerem "competitivos" (disputando atenção), adicione 48–96px de espaço de respiro vertical. O ritmo de galeria do PlayStation é inegociável.
