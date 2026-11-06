# Design System Inspired by Vercel

> Category: Ferramentas para Desenvolvedores
> Implantação de frontend. Precisão em preto e branco, fonte Geist.

## 1. Tema Visual & Atmosfera

O site da Vercel é a tese visual de infraestrutura para desenvolvedores tornada invisível — um design system tão contido que beira o filosófico. A página é predominantemente branca (`#ffffff`) com texto quase-preto (`#171717`), criando um vazio de galeria onde cada elemento merece seu pixel. Isso não é minimalismo como decoração; é minimalismo como princípio de engenharia. O design system Geist trata a interface como um compilador trata o código — cada token desnecessário é removido até restar apenas estrutura.

A família de fontes Geist personalizada é a joia da coroa. Geist Sans utiliza espaçamento entre letras negativamente agressivo (-2,4px a -2,88px em tamanhos de exibição), criando títulos que parecem comprimidos, urgentes e engenheirados — como código que foi minificado para produção. Em tamanhos de corpo, o espaçamento relaxa, mas a precisão geométrica persiste. Geist Mono completa o sistema como a fonte monoespaçada para código, saída de terminal e rótulos técnicos. Ambas as fontes habilitam OpenType `"liga"` (ligaduras) globalmente, adicionando uma camada de sofisticação tipográfica que recompensa uma leitura atenta.

O que distingue a Vercel de outros design systems monocromáticos é sua filosofia de sombra-como-borda. Em vez de bordas CSS tradicionais, a Vercel usa `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — uma sombra de deslocamento zero, desfoque zero e espalhamento de 1px que cria uma linha semelhante a uma borda sem as implicações do modelo de caixa. Essa técnica permite que bordas existam na camada de sombra, possibilitando transições mais suaves, cantos arredondados sem recorte e um peso visual mais sutil do que bordas tradicionais. Todo o sistema de profundidade é construído sobre pilhas de sombras em múltiplas camadas, onde cada camada serve a um propósito específico: uma para a borda, outra para elevação suave e outra para profundidade ambiente.

**Características Principais:**
- Geist Sans com espaçamento entre letras extremamente negativo (-2,4px a -2,88px no tamanho de exibição) — texto como infraestrutura comprimida
- Geist Mono para código e rótulos técnicos com OpenType `"liga"` globalmente
- Técnica de sombra-como-borda: `box-shadow 0px 0px 0px 1px` substitui bordas tradicionais em todo o sistema
- Pilhas de sombras em múltiplas camadas para profundidade refinada (borda + elevação + ambiente em declarações únicas)
- Tela quase-branca pura com texto `#171717` — não completamente preto, criando uma suavidade de micro-contraste
- Cores de destaque específicas para fluxo de trabalho: Vermelho Ship (`#ff5b4f`), Rosa Preview (`#de1d8d`), Azul Develop (`#0a72ef`)
- Sistema de anel de foco usando `hsla(212, 100%, 48%, 1)` — um azul saturado para acessibilidade
- Emblemas pílula (9999px) com fundos matizados para indicadores de status

## 2. Paleta de Cores & Funções

### Primária
- **Vercel Black** (`#171717`): Texto primário, títulos, fundos de superfícies escuras. Não é preto puro — o leve calor previne a dureza.
- **Branco Puro** (`#ffffff`): Fundo da página, superfícies de cartões, texto de botões em escuro.
- **Preto Verdadeiro** (`#000000`): Uso secundário, `--geist-console-text-color-default`, usado em contextos específicos de console/código.

### Cores de Destaque para Fluxo de Trabalho
- **Vermelho Ship** (`#ff5b4f`): `--ship-text`, a etapa de fluxo de trabalho "enviar para produção" — coral-vermelho quente e urgente.
- **Rosa Preview** (`#de1d8d`): `--preview-text`, o fluxo de trabalho de implantação em preview — magenta-rosa vívido.
- **Azul Develop** (`#0a72ef`): `--develop-text`, o fluxo de trabalho de desenvolvimento — azul brilhante e focado.

### Cores do Console / Código
- **Azul Console** (`#0070f3`): `--geist-console-text-color-blue`, azul de realce de sintaxe.
- **Roxo Console** (`#7928ca`): `--geist-console-text-color-purple`, roxo de realce de sintaxe.
- **Rosa Console** (`#eb367f`): `--geist-console-text-color-pink`, rosa de realce de sintaxe.

### Interativo
- **Azul Link** (`#0072f5`): Cor primária de link com decoração de sublinhado.
- **Azul Foco** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, anel de foco em elementos interativos.
- **Azul Anel** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, utilitário de anel do Tailwind.

### Escala de Neutros
- **Cinza 900** (`#171717`): Texto primário, títulos, texto de navegação.
- **Cinza 600** (`#4d4d4d`): Texto secundário, texto descritivo.
- **Cinza 500** (`#666666`): Texto terciário, links discretos.
- **Cinza 400** (`#808080`): Texto de placeholder, estados desabilitados.
- **Cinza 100** (`#ebebeb`): Bordas, contornos de cartões, divisores.
- **Cinza 50** (`#fafafa`): Matiz sutil de superfície, destaque de sombra interna.

### Superfície & Sobreposição
- **Fundo de Sobreposição** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, fundo de modal/diálogo.
- **Texto de Seleção** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, destaque de seleção de texto.
- **Fundo Azul do Emblema** (`#ebf5ff`): Fundo do emblema pílula, superfície azul matizada.
- **Texto Azul do Emblema** (`#0068d6`): Texto do emblema pílula, azul mais escuro para legibilidade.

### Sombras & Profundidade
- **Sombra de Borda** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): A assinatura — substitui bordas tradicionais.
- **Elevação Sutil** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Elevação mínima para cartões.
- **Pilha de Cartão** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Sombra de cartão completa em múltiplas camadas.
- **Borda de Anel** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Anel-borda cinza claro para abas e imagens.

## 3. Regras Tipográficas

### Família de Fonte
- **Primária**: `Geist`, com fallbacks: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monoespaçada**: `Geist Mono`, com fallbacks: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Recursos OpenType**: `"liga"` habilitado globalmente em todo texto Geist; `"tnum"` para números tabulares em legendas específicas.

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento entre Letras | Observações |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3,00rem) | 600 | 1,00–1,17 (compacto) | -2,4px a -2,88px | Compressão máxima, impacto de outdoor |
| Título de Seção | Geist | 40px (2,50rem) | 600 | 1,20 (compacto) | -2,4px | Títulos de seções de funcionalidades |
| Subtítulo Grande | Geist | 32px (2,00rem) | 600 | 1,25 (compacto) | -1,28px | Títulos de cartões, subseções |
| Subtítulo | Geist | 32px (2,00rem) | 400 | 1,50 | -1,28px | Subtítulos mais leves |
| Título de Cartão | Geist | 24px (1,50rem) | 600 | 1,33 | -0,96px | Cartões de funcionalidades |
| Título de Cartão Leve | Geist | 24px (1,50rem) | 500 | 1,33 | -0,96px | Títulos de cartões secundários |
| Corpo Grande | Geist | 20px (1,25rem) | 400 | 1,80 (relaxado) | normal | Introduções, descrições de funcionalidades |
| Corpo | Geist | 18px (1,13rem) | 400 | 1,56 | normal | Texto de leitura padrão |
| Corpo Pequeno | Geist | 16px (1,00rem) | 400 | 1,50 | normal | Texto de interface padrão |
| Corpo Médio | Geist | 16px (1,00rem) | 500 | 1,50 | normal | Navegação, texto enfatizado |
| Corpo Seminegrito | Geist | 16px (1,00rem) | 600 | 1,50 | -0,32px | Rótulos fortes, estados ativos |
| Botão / Link | Geist | 14px (0,88rem) | 500 | 1,43 | normal | Botões, links, legendas |
| Botão Pequeno | Geist | 14px (0,88rem) | 400 | 1,00 (compacto) | normal | Botões compactos |
| Legenda | Geist | 12px (0,75rem) | 400–500 | 1,33 | normal | Metadados, tags |
| Mono Corpo | Geist Mono | 16px (1,00rem) | 400 | 1,50 | normal | Blocos de código |
| Mono Legenda | Geist Mono | 13px (0,81rem) | 500 | 1,54 | normal | Rótulos de código |
| Mono Pequeno | Geist Mono | 12px (0,75rem) | 500 | 1,00 (compacto) | normal | `text-transform: uppercase`, rótulos técnicos |
| Micro Emblema | Geist | 7px (0,44rem) | 700 | 1,00 (compacto) | normal | `text-transform: uppercase`, emblemas minúsculos |

### Princípios
- **Compressão como identidade**: Geist Sans em tamanhos de exibição usa espaçamento entre letras de -2,4px a -2,88px — o espaçamento negativo mais agressivo de qualquer design system importante. Isso cria um texto que parece _minificado_, como código otimizado para produção. O espaçamento relaxa progressivamente conforme o tamanho diminui: -1,28px em 32px, -0,96px em 24px, -0,32px em 16px, e normal em 14px.
- **Ligaduras em toda parte**: Cada elemento de texto Geist habilita OpenType `"liga"`. Ligaduras não são decorativas — são estruturais, criando combinações de glifos mais compactas e eficientes.
- **Três pesos, funções estritas**: 400 (corpo/leitura), 500 (interface/interativo), 600 (títulos/ênfase). Sem negrito (700), exceto para micro-emblemas minúsculos. Essa faixa estreita de pesos cria hierarquia através de tamanho e espaçamento, não de peso.
- **Mono como identidade**: Geist Mono em maiúsculas com `"tnum"` ou `"liga"` serve como a voz do "console de desenvolvedor" — rótulos técnicos compactos que conectam o site de marketing ao produto.

## 4. Estilização de Componentes

### Botões

**Branco Primário (Com borda por sombra)**
- Fundo: `#ffffff`
- Texto: `#171717`
- Padding: 0px 6px (mínimo — largura guiada pelo conteúdo)
- Raio: 6px (levemente arredondado)
- Sombra: `rgb(235, 235, 235) 0px 0px 0px 1px` (borda de anel)
- Hover: fundo muda para `var(--ds-gray-1000)` (escuro)
- Foco: contorno `2px solid var(--ds-focus-color)` + sombra `var(--ds-focus-ring)`
- Uso: Botão secundário padrão

**Escuro Primário (Inferido do sistema Geist)**
- Fundo: `#171717`
- Texto: `#ffffff`
- Padding: 8px 16px
- Raio: 6px
- Uso: CTA principal ("Start Deploying", "Get Started")

**Botão Pílula / Emblema**
- Fundo: `#ebf5ff` (azul matizado)
- Texto: `#0068d6`
- Padding: 0px 10px
- Raio: 9999px (pílula completa)
- Fonte: 12px peso 500
- Uso: Emblemas de status, tags, rótulos de funcionalidades

**Pílula Grande (Navegação)**
- Fundo: transparente ou `#171717`
- Raio: 64px–100px
- Uso: Navegação por abas, seletores de seção

### Cartões & Contêineres
- Fundo: `#ffffff`
- Borda: via sombra — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Raio: 8px (padrão), 12px (cartões em destaque/imagem)
- Pilha de sombras: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Cartões de imagem: `1px solid #ebebeb` com raio superior de 12px
- Hover: intensificação sutil da sombra

### Entradas & Formulários
- Rádio: estilização padrão com fundo `var(--ds-gray-200)` no foco
- Sombra de foco: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Contorno de foco: `2px solid var(--ds-focus-color)` — anel de foco azul consistente
- Borda: via técnica de sombra, não borda tradicional

### Navegação
- Navegação horizontal limpa em branco, fixa
- Logotipo Vercel alinhado à esquerda, 262x52px
- Links: Geist 14px peso 500, texto `#171717`
- Ativo: peso 600 ou sublinhado
- CTA: botões pílula escuros ("Start Deploying", "Contact Sales")
- Mobile: menu hamburguer recolhível
- Dropdowns de produtos com menus de múltiplos níveis

### Tratamento de Imagens
- Capturas de tela do produto com borda `1px solid #ebebeb`
- Imagens com topo arredondado: raio `12px 12px 0px 0px`
- Capturas de tela de painel/visualização de código dominam seções de funcionalidades
- Fundos com gradiente suave atrás de imagens de herói (multi-cor pastel)

### Componentes Distintos

**Pipeline de Fluxo de Trabalho**
- Pipeline horizontal em três etapas: Develop → Preview → Ship
- Cada etapa tem sua própria cor de destaque: Azul → Rosa → Vermelho
- Conectados com linhas/setas
- A metáfora visual para a proposta de valor central da Vercel

**Barra de Confiança / Grade de Logos**
- Logos de empresas (Perplexity, ChatGPT, Cursor, etc.) em escala de cinza
- Rolagem horizontal ou layout em grade
- Separação sutil com borda `#ebebeb`

**Cartões de Métricas**
- Exibição de números grandes (ex.: "10x mais rápido")
- Geist 48px peso 600 para a métrica
- Descrição abaixo em texto cinza de corpo
- Contêiner de cartão com borda de sombra

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Salto notável: pula de 16px para 32px — sem 20px ou 24px na escala primária

### Grade & Contêiner
- Largura máxima do conteúdo: aproximadamente 1200px
- Herói: coluna única centralizada com padding superior generoso
- Seções de funcionalidades: grades de 2–3 colunas para cartões
- Divisores de largura total usando `border-bottom: 1px solid #171717`
- Capturas de tela de código/painel em largura total ou contidas com borda

### Filosofia de Espaçamento em Branco
- **Vazio de galeria**: Padding vertical massivo entre seções (80px–120px+). O espaço em branco É o design — ele comunica que a Vercel não tem nada a provar nem a esconder.
- **Texto comprimido, espaço expandido**: O espaçamento entre letras negativamente agressivo nos títulos é contrabalançado por espaçamento em branco generoso ao redor. O texto é denso; o espaço ao seu redor é vasto.
- **Ritmo de seção**: Seções brancas alternam com seções brancas — não há variação de cor entre as seções. A separação vem apenas de bordas (sombras-borda) e espaçamento.

### Escala de Raio de Borda
- Micro (2px): Trechos de código inline, pequenos spans
- Sutil (4px): Pequenos contêineres
- Padrão (6px): Botões, links, elementos funcionais
- Confortável (8px): Cartões, itens de lista
- Imagem (12px): Cartões em destaque, contêineres de imagem (arredondados no topo)
- Grande (64px): Pílulas de navegação por abas
- XL (100px): Links de navegação grandes
- Pílula Completa (9999px): Emblemas, pílulas de status, tags
- Círculo (50%): Alternador de menu, contêineres de avatar

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Plano (Nível 0) | Sem sombra | Fundo da página, blocos de texto |
| Anel (Nível 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Sombra-como-borda para a maioria dos elementos |
| Anel Claro (Nível 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Anel mais claro para abas, imagens |
| Cartão Sutil (Nível 2) | Anel + `rgba(0,0,0,0.04) 0px 2px 2px` | Cartões padrão com elevação mínima |
| Cartão Completo (Nível 3) | Anel + Sutil + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + anel `#fafafa` interno | Cartões em destaque, painéis realçados |
| Foco (Acessibilidade) | Contorno `2px solid hsla(212, 100%, 48%, 1)` | Foco do teclado em todos os elementos interativos |

**Filosofia de Sombras**: A Vercel tem indiscutivelmente o sistema de sombras mais sofisticado no design web moderno. Em vez de usar sombras para elevação no sentido tradicional do Material Design, a Vercel usa pilhas de sombras com múltiplos valores, onde cada camada tem um propósito arquitetônico distinto: uma cria a "borda" (0px de espalhamento, 1px), outra adiciona suavidade ambiente (2px de desfoque), outra cuida da profundidade à distância (8px de desfoque com espalhamento negativo) e um anel interno (`#fafafa`) cria o destaque sutil que faz o cartão "brilhar" por dentro. Essa abordagem em camadas faz com que os cartões pareçam construídos, não flutuando.

### Profundidade Decorativa
- Gradiente do herói: lavagem de gradiente suave e multi-cor pastel atrás do conteúdo do herói (quase invisível, atmosférico)
- Bordas de seção: `1px solid #171717` (linha escura completa) entre seções principais
- Sem variação de cor de fundo — a profundidade vem inteiramente do empilhamento de sombras e do contraste de bordas

## 7. Faça e Não Faça

### Faça
- Use Geist Sans com espaçamento entre letras negativamente agressivo em tamanhos de exibição (-2,4px a -2,88px em 48px)
- Use sombra-como-borda (`0px 0px 0px 1px rgba(0,0,0,0.08)`) em vez de bordas CSS tradicionais
- Habilite `"liga"` em todo o texto Geist — ligaduras são estruturais, não opcionais
- Use o sistema de três pesos: 400 (corpo), 500 (interface), 600 (títulos)
- Aplique cores de destaque de fluxo de trabalho (Vermelho/Rosa/Azul) apenas no contexto do respectivo fluxo
- Use pilhas de sombras em múltiplas camadas para cartões (borda + elevação + ambiente + destaque interno)
- Mantenha a paleta de cores acromática — os cinzas de `#171717` a `#ffffff` são o sistema
- Use `#171717` em vez de `#000000` para texto primário — o micro-calor importa

### Não Faça
- Não use espaçamento entre letras positivo no Geist Sans — ele é sempre negativo ou zero
- Não use peso 700 (negrito) em texto de corpo — 600 é o máximo, usado apenas para títulos
- Não use `border` CSS tradicional em cartões — use a técnica de sombra-borda
- Não introduza cores quentes (laranjas, amarelos, verdes) no cromo da interface
- Não aplique as cores de destaque de fluxo de trabalho (Vermelho Ship, Rosa Preview, Azul Develop) de forma decorativa
- Não use sombras pesadas (> 0,1 de opacidade) — o sistema de sombras é no nível de sussurro
- Não aumente o espaçamento entre letras do texto de corpo — Geist foi projetado para ser compacto
- Não use raio pílula (9999px) em botões de ação primários — pílulas são apenas para emblemas/tags
- Não omita o anel `#fafafa` interno nas sombras de cartão — é o brilho que faz o sistema funcionar

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Principais Mudanças |
|------|-------|-------------|
| Mobile Pequeno | <400px | Coluna única compacta, padding mínimo |
| Mobile | 400–600px | Mobile padrão, layout empilhado |
| Tablet Pequeno | 600–768px | Grades de 2 colunas começam |
| Tablet | 768–1024px | Grades completas de cartões, padding expandido |
| Desktop Pequeno | 1024–1200px | Layout de desktop padrão |
| Desktop | 1200–1400px | Layout completo, largura máxima de conteúdo |
| Desktop Grande | >1400px | Centralizado, margens generosas |

### Alvos de Toque
- Botões usam padding confortável (8px–16px vertical)
- Links de navegação em 14px com espaçamento adequado
- Emblemas pílula têm 10px de padding horizontal para alvos de toque
- Alternador de menu mobile usa botão circular com raio de 50%

### Estratégia de Colapso
- Herói: display 48px → escala para baixo, mantendo o espaçamento negativo proporcionalmente
- Navegação: links horizontais + CTAs → menu hamburguer
- Cartões de funcionalidades: 3 colunas → 2 colunas → coluna única empilhada
- Capturas de tela de código: mantêm proporção, podem rolar horizontalmente
- Logos da barra de confiança: grade → rolagem horizontal
- Rodapé: múltiplas colunas → coluna única empilhada
- Espaçamento de seção: 80px+ → 48px no mobile

### Comportamento de Imagens
- Capturas de tela do painel mantêm tratamento de borda em todos os tamanhos
- Gradiente do herói suaviza/simplifica no mobile
- Capturas de tela do produto usam imagens responsivas com raio de borda consistente
- Seções de largura total mantêm tratamento de borda a borda

## 9. Guia de Prompt para Agente

### Referência Rápida de Cores
- CTA Primário: Vercel Black (`#171717`)
- Fundo: Branco Puro (`#ffffff`)
- Texto de título: Vercel Black (`#171717`)
- Texto de corpo: Cinza 600 (`#4d4d4d`)
- Borda (sombra): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Link: Azul Link (`#0072f5`)
- Anel de foco: Azul Foco (`hsla(212, 100%, 48%, 1)`)

### Exemplos de Prompts de Componentes
- "Crie uma seção de herói em fundo branco. Título em 48px Geist peso 600, line-height 1,00, letter-spacing -2,4px, cor #171717. Subtítulo em 20px Geist peso 400, line-height 1,80, cor #4d4d4d. Botão CTA escuro (#171717, raio 6px, padding 8px 16px) e botão fantasma (branco, sombra-borda rgba(0,0,0,0.08) 0px 0px 0px 1px, raio 6px)."
- "Projete um cartão: fundo branco, sem borda CSS. Use pilha de sombras: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Raio 8px. Título em 24px Geist peso 600, letter-spacing -0,96px. Corpo em 16px peso 400, #4d4d4d."
- "Construa um emblema pílula: fundo #ebf5ff, texto #0068d6, raio 9999px, padding 0px 10px, Geist 12px peso 500."
- "Crie navegação: cabeçalho fixo branco. Geist 14px peso 500 para links, texto #171717. CTA pílula escuro 'Start Deploying' alinhado à direita. Sombra-borda na parte inferior: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Projete uma seção de fluxo de trabalho mostrando três etapas: Develop (cor de texto #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Cada etapa: rótulo Geist Mono 14px maiúsculas + título 24px Geist peso 600 + descrição 16px peso 400 em #4d4d4d."

### Guia de Iteração
1. Sempre use sombra-como-borda em vez de borda CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` é a base
2. O espaçamento entre letras escala com o tamanho da fonte: -2,4px em 48px, -1,28px em 32px, -0,96px em 24px, normal em 14px
3. Apenas três pesos: 400 (leitura), 500 (interação), 600 (anúncio)
4. A cor é funcional, nunca decorativa — cores de fluxo de trabalho (Vermelho/Rosa/Azul) marcam apenas etapas do pipeline
5. O anel `#fafafa` interno nas sombras de cartão é o que dá aos cartões Vercel seu brilho interno sutil
6. Geist Mono maiúsculas para rótulos técnicos, Geist Sans para todo o resto
