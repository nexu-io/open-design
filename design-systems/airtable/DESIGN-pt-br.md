# Sistema de design inspirado no Airtable

> Category: Design & Criativo
> Híbrido de planilha e banco de dados. Estética colorida, amigável e de dados estruturados.

## 1. Tema visual e atmosfera

O site do Airtable é uma plataforma limpa e adequada para empresas que transmite "simplicidade sofisticada" por meio de uma tela branca com texto azul-marinho profundo (`#181d26`) e Airtable Blue (`#1b61c9`) como acento interativo principal. A família tipográfica Haas (variantes display e text) cria um sistema tipográfico de precisão suíça com espaçamento positivo entre letras em todo o site.

**Características principais:**
- Tela branca com texto azul-marinho profundo (`#181d26`)
- Airtable Blue (`#1b61c9`) como cor principal de CTA e links
- Sistema de fonte dupla Haas + Haas Groot Disp
- Espaçamento positivo entre letras no corpo do texto (0.08px–0.28px)
- Raio de 12px nos botões, 16px–32px nos cards
- Sombra multicamada com tom azul: `rgba(45,127,249,0.28) 0px 1px 3px`
- Tokens de tema semânticos: nomenclatura de variáveis CSS `--theme_*`

## 2. Paleta de cores e papéis

### Primário
- **Azul-marinho profundo** (`#181d26`): Texto principal
- **Airtable Blue** (`#1b61c9`): Botões CTA, links
- **Branco** (`#ffffff`): Superfície principal
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Semântico
- **Verde sucesso** (`#006400`): `--theme_success-text`
- **Texto fraco** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Secundário ativo** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Neutro
- **Cinza escuro** (`#333333`): Texto secundário
- **Azul médio** (`#254fad`): Variante de azul para links/destaque
- **Borda** (`#e0e2e6`): Bordas de card
- **Superfície clara** (`#f8fafc`): Superfície sutil

### Sombras
- **Tom azul** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Suave** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Regras tipográficas

### Famílias de fontes
- **Principal**: `Haas`, fallbacks: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, fallback: `Haas`

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de linha | Espaçamento |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Negrito | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Título de seção | Haas | 40px | 400 | 1.25 | normal |
| Subtítulo | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Título do card | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Destaque | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Corpo | Haas | 18px | 400 | 1.35 | 0.18px |
| Corpo Médio | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Botão | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Legenda | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Estilos de componentes

### Botões
- **Azul principal**: `#1b61c9`, texto branco, padding 16px 24px, raio 12px
- **Branco**: fundo branco, texto `#181d26`, raio 12px, borda branca 1px
- **Consentimento de cookies**: fundo `#1b61c9`, raio 2px (afiado)

### Cards: `1px solid #e0e2e6`, raio 16px–24px
### Inputs: Estilo Haas padrão

## 5. Layout
- Espaçamento: 1–48px (base 8px)
- Raio: 2px (pequeno), 12px (botões), 16px (cards), 24px (seções), 32px (grande), 50% (círculos)

## 6. Profundidade
- Sistema de sombra multicamada com tom azul
- Ambiente suave: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. O que fazer e não fazer
### Fazer: Usar Airtable Blue para CTAs, Haas com tracking positivo, botões com raio 12px
### Não fazer: Omitir o espaçamento positivo entre letras, usar sombras pesadas

## 8. Comportamento responsivo
Breakpoints: 425–1664px (23 breakpoints)

## 9. Guia de prompt para Agent
- Texto: Azul-marinho profundo (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Fundo: Branco (`#ffffff`)
- Borda: `#e0e2e6`
