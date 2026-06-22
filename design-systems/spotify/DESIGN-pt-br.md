# Design System Inspirado no Spotify

> Category: Mídia & Consumidor
> Streaming de música. Verde vibrante sobre fundo escuro, tipografia marcante, guiado pela arte dos álbuns.

## 1. Tema Visual & Atmosfera

A interface web do Spotify é um player de música escuro e imersivo que envolve os ouvintes em um casulo quase negro (`#121212`, `#181818`, `#1f1f1f`), onde a arte dos álbuns e o conteúdo se tornam a principal fonte de cor. A filosofia de design é "escuridão com o conteúdo em primeiro lugar" — a UI recua para as sombras para que a música, os podcasts e as playlists possam brilhar. Cada superfície é um tom de carvão, criando um ambiente semelhante a um cinema onde a única cor real vem do icônico Spotify Green (`#1ed760`) e da própria arte dos álbuns.

A tipografia usa SpotifyMixUI e SpotifyMixUITitle — fontes proprietárias da família CircularSp (Circular da Lineto, personalizada para o Spotify) com uma ampla pilha de fallback que inclui fontes árabes, hebraicas, cirílicas, gregas, devanágaris e CJK, refletindo o alcance global do Spotify. O sistema tipográfico é compacto e funcional: 700 (bold) para ênfase e navegação, 600 (semibold) para ênfase secundária e 400 (regular) para o corpo. Os botões usam maiúsculas com espaçamento positivo entre letras (1.4px–2px) para uma qualidade sistemática e semelhante a rótulos.

O que distingue o Spotify é sua geometria de pílulas e círculos. Os botões primários usam raio de 500px–9999px (pílula completa), os botões circulares de play usam raio de 50% e os campos de busca são pílulas de 500px. Combinados com sombras pesadas (`rgba(0,0,0,0.5) 0px 8px 24px`) em elementos elevados e uma combinação única de inset border-shadow (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), o resultado é uma interface que parece um dispositivo de áudio premium — tátil, arredondada e construída para o toque.

**Características Principais:**
- Tema escuro e imersivo quase negro (`#121212`–`#1f1f1f`) — a UI desaparece atrás do conteúdo
- Spotify Green (`#1ed760`) como único destaque da marca — nunca decorativo, sempre funcional
- Família de fontes SpotifyMixUI/CircularSp com suporte a scripts globais
- Botões em pílula (500px–9999px) e controles circulares (50%) — arredondados, otimizados para toque
- Rótulos de botões em maiúsculas com espaçamento amplo entre letras (1.4px–2px)
- Sombras pesadas em elementos elevados (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Cores semânticas: vermelho negativo (`#f3727f`), laranja de aviso (`#ffa42b`), azul de anúncio (`#539df5`)
- Arte dos álbuns como fonte primária de cor — a UI é acromática por design

## 2. Paleta de Cores & Funções

### Marca Principal
- **Spotify Green** (`#1ed760`): Destaque principal da marca — botões de play, estados ativos, CTAs
- **Near Black** (`#121212`): Superfície de fundo mais profunda
- **Dark Surface** (`#181818`): Cards, contêineres, superfícies elevadas
- **Mid Dark** (`#1f1f1f`): Fundos de botões, superfícies interativas

### Texto
- **White** (`#ffffff`): `--text-base`, texto principal
- **Silver** (`#b3b3b3`): Texto secundário, rótulos silenciados, navegação inativa
- **Near White** (`#cbcbcb`): Texto secundário ligeiramente mais brilhante
- **Light** (`#fdfdfd`): Quase branco puro para ênfase máxima

### Semântico
- **Negative Red** (`#f3727f`): `--text-negative`, estados de erro
- **Warning Orange** (`#ffa42b`): `--text-warning`, estados de aviso
- **Announcement Blue** (`#539df5`): `--text-announcement`, estados informativos

### Superfície & Borda
- **Dark Card** (`#252525`): Superfície de card elevado
- **Mid Card** (`#272727`): Superfície alternativa de card
- **Border Gray** (`#4d4d4d`): Bordas de botões sobre fundo escuro
- **Light Border** (`#7c7c7c`): Bordas de botões com contorno, links silenciados
- **Separator** (`#b3b3b3`): Linhas divisórias
- **Light Surface** (`#eeeeee`): Botões em modo claro (uso raro)
- **Spotify Green Border** (`#1db954`): Variante de borda com destaque verde

### Sombras
- **Heavy** (`rgba(0,0,0,0.5) 0px 8px 24px`): Diálogos, menus, painéis elevados
- **Medium** (`rgba(0,0,0,0.3) 0px 8px 8px`): Cards, dropdowns
- **Inset Border** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Combinação de borda e sombra para inputs

## 3. Regras de Tipografia

### Famílias de Fontes
- **Título**: `SpotifyMixUITitle`, fallbacks: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Corpo**: `SpotifyMixUI`, mesma pilha de fallback

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento de Letras | Observações |
|------|------|------|--------|-------------|----------------|-------|
| Título de Seção | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Peso bold para título |
| Cabeçalho de Destaque | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (compacto) | normal | Cabeçalhos de seção semibold |
| Corpo Bold | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Texto enfatizado |
| Corpo | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Corpo padrão |
| Botão Maiúsculas | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (compacto) | 1.4px–2px | `text-transform: uppercase` |
| Botão | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Botão padrão |
| Link de Nav Bold | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Navegação |
| Link de Nav | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Nav inativa |
| Legenda Bold | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Metadados em bold |
| Legenda | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadados |
| Pequeno Bold | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Tags, contagens |
| Pequeno | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Letras miúdas |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Texto mínimo |

### Princípios
- **Binário bold/regular**: A maior parte do texto é 700 (bold) ou 400 (regular), com 600 usado com moderação. Isso cria uma hierarquia visual clara por contraste de peso, não por variação de tamanho.
- **Botões em maiúsculas como sistema**: Rótulos de botões usam maiúsculas + espaçamento amplo entre letras (1.4px–2px), criando uma "voz de rótulo" sistemática, distinta do texto de conteúdo.
- **Tamanho compacto**: O intervalo é de 10px–24px — mais estreito do que a maioria dos sistemas. A tipografia do Spotify é compacta e funcional, projetada para percorrer playlists, não para ler artigos.
- **Suporte a scripts globais**: A ampla pilha de fallback (árabe, hebraico, cirílico, grego, devanágari, CJK) reflete o alcance do Spotify em mais de 180 mercados.

## 4. Estilos de Componentes

### Botões

**Dark Pill**
- Background: `#1f1f1f`
- Text: `#ffffff` or `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (pílula completa)
- Uso: Pílulas de navegação, ações secundárias

**Dark Large Pill**
- Background: `#181818`
- Text: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Uso: Botões de navegação principal do app

**Light Pill**
- Background: `#eeeeee`
- Text: `#181818`
- Radius: 500px
- Uso: CTAs em modo claro (consentimento de cookies, marketing)

**Outlined Pill**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (assimétrico para ícone)
- Radius: 9999px
- Uso: Botões de seguir, ações secundárias

**Circular Play**
- Background: `#1f1f1f`
- Text: `#ffffff`
- Padding: 12px
- Radius: 50% (círculo)
- Uso: Controles de play/pause

### Cards & Contêineres
- Background: `#181818` or `#1f1f1f`
- Radius: 6px–8px
- Sem bordas visíveis na maioria dos cards
- Hover: leve clareamento do background
- Shadow: `rgba(0,0,0,0.3) 0px 8px 8px` nos elevados

### Inputs
- Input de busca: background `#1f1f1f`, texto `#ffffff`
- Radius: 500px (pílula)
- Padding: 12px 96px 12px 48px (considerando ícone)
- Focus: borda se torna `#000000`, outline `1px solid`

### Navegação
- Sidebar escura com SpotifyMixUI 14px peso 700 para ativo, 400 para inativo
- Cor silenciada `#b3b3b3` para itens inativos, `#ffffff` para ativos
- Botões de ícone circulares (raio 50%)
- Logo do Spotify no canto superior esquerdo em verde

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Grade & Contêiner
- Sidebar (fixa) + área de conteúdo principal
- Cards de álbuns/playlists em grade
- Barra de reprodução atual em largura total na parte inferior
- Área de conteúdo responsiva preenche o espaço restante

### Filosofia de Espaço em Branco
- **Compressão escura**: O Spotify empacota o conteúdo de forma densa — grades de playlists, listas de faixas e navegação têm espaçamento apertado. O fundo escuro proporciona descanso visual entre os elementos sem precisar de grandes espaços.
- **Densidade de conteúdo em vez de respiro**: Este é um app, não um site de marketing. Cada pixel serve à experiência de escuta.

### Escala de Border Radius
- Mínimo (2px): Badges, tags explícitas
- Sutil (4px): Inputs, elementos pequenos
- Padrão (6px): Contêineres de arte de álbum, cards
- Confortável (8px): Seções, diálogos
- Médio (10px–20px): Painéis, elementos de overlay
- Grande (100px): Botões grandes em pílula
- Pílula (500px): Botões primários, input de busca
- Pílula Completa (9999px): Pílulas de navegação, busca
- Círculo (50%): Botões de play, avatares, ícones

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Base (Nível 0) | Background `#121212` | Camada mais profunda, fundo da página |
| Superfície (Nível 1) | `#181818` or `#1f1f1f` | Cards, sidebar, contêineres |
| Elevado (Nível 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Menus dropdown, hover cards |
| Diálogo (Nível 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modais, overlays, menus |
| Inset (Borda) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Bordas de inputs |

**Filosofia de Sombras**: O Spotify usa sombras notavelmente pesadas para um app com tema escuro. A sombra de opacidade 0.5 com blur de 24px cria um efeito dramático de "flutuando na escuridão" para diálogos e menus, enquanto a opacidade 0.3 com blur de 8px proporciona uma elevação mais sutil para cards. A combinação única de inset border-shadow nos inputs cria uma qualidade entalhada e tátil.

## 7. O Que Fazer e Não Fazer

### Faça
- Use fundos quase negros (`#121212`–`#1f1f1f`) — profundidade por variação de tonalidade
- Aplique Spotify Green (`#1ed760`) apenas em controles de play, estados ativos e CTAs primários
- Use o formato pílula (500px–9999px) em todos os botões — circular (50%) para controles de play
- Aplique maiúsculas + espaçamento amplo entre letras (1.4px–2px) nos rótulos de botões
- Mantenha a tipografia compacta (intervalo de 10px–24px) — isto é um app, não uma revista
- Use sombras pesadas (`opacidade 0.3–0.5`) para elementos elevados em fundos escuros
- Deixe a arte dos álbuns fornecer cor — a UI em si é acromática

### Não Faça
- Não use Spotify Green decorativamente ou em fundos — ele é apenas funcional
- Não use fundos claros para superfícies primárias — a imersão no escuro é essencial
- Não ignore a geometria de pílula/círculo nos botões — botões quadrados quebram a identidade
- Não use sombras finas/sutis — em fundos escuros, as sombras precisam ser pesadas para serem visíveis
- Não adicione cores de marca adicionais — verde + cinzas acromáticos é a paleta completa
- Não use alturas de linha relaxadas — a tipografia do Spotify é compacta e densa
- Não exponha bordas cinzas brutas — use bordas baseadas em sombra ou inset em vez disso

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Principais Mudanças |
|------|-------|-------------|
| Mobile Small | <425px | Layout mobile compacto |
| Mobile | 425–576px | Mobile padrão |
| Tablet | 576–768px | Grade de 2 colunas |
| Tablet Large | 768–896px | Layout expandido |
| Desktop Small | 896–1024px | Sidebar visível |
| Desktop | 1024–1280px | Layout desktop completo |
| Large Desktop | >1280px | Grade expandida |

### Estratégia de Colapso
- Sidebar: completa → recolhida → oculta
- Grade de álbuns: 5 colunas → 3 → 2 → 1
- Barra de reprodução atual: mantida em todos os tamanhos
- Busca: input em pílula mantido, largura se ajusta
- Navegação: sidebar → barra inferior no mobile

## 9. Guia de Prompts para Agentes

### Referência Rápida de Cores
- Background: Near Black (`#121212`)
- Surface: Dark Card (`#181818`)
- Text: White (`#ffffff`)
- Texto secundário: Silver (`#b3b3b3`)
- Destaque: Spotify Green (`#1ed760`)
- Border: `#4d4d4d`
- Erro: Negative Red (`#f3727f`)

### Exemplos de Prompts de Componentes
- "Crie um card escuro: background #181818, raio 8px. Título em 16px SpotifyMixUI peso 700, texto branco. Subtítulo em 14px peso 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px no hover."
- "Crie um botão pílula: background #1f1f1f, texto branco, raio 9999px, padding 8px 16px. 14px SpotifyMixUI peso 700, maiúsculas, letter-spacing 1.4px."
- "Crie um botão circular de play: background Spotify Green (#1ed760), ícone #000000, raio 50%, padding 12px."
- "Crie um input de busca: background #1f1f1f, texto branco, raio 500px, padding 12px 48px. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Crie uma sidebar de navegação: background #121212. Itens ativos: 14px peso 700, branco. Inativos: 14px peso 400, #b3b3b3."

### Guia de Iteração
1. Comece com #121212 — tudo vive na escuridão quase negra
2. Spotify Green apenas para destaques funcionais (play, ativo, CTA)
3. Tudo em pílula — 500px para grandes, 9999px para pequenos, 50% para circulares
4. Maiúsculas + rastreamento amplo nos botões — a voz sistemática de rótulo
5. Sombras pesadas (opacidade 0.3–0.5) para elevação — sombras leves são invisíveis no escuro
6. A arte dos álbuns fornece toda a cor — a UI permanece acromática
