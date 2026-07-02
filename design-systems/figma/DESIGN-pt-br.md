# Design System Inspirado no Figma

> Category: Design & Criatividade
> Ferramenta de design colaborativo. Multicolorida e vibrante, lúdica mas profissional.

## 1. Tema Visual & Atmosfera

A interface do Figma é a ferramenta de design que se projetou a si mesma — uma aula magistral de sofisticação tipográfica onde uma fonte variável personalizada (figmaSans) modula entre ultrafino (weight 320) e negrito (weight 700), com paradas em intermediários incomuns (330, 340, 450, 480, 540) que a maioria dos sistemas tipográficos jamais explora. Esse controle granular de peso confere a cada elemento de texto um peso visual precisamente calibrado, criando hierarquia por meio de micro-diferenças em vez do instrumento contundente de "regular vs negrito."

A página apresenta uma dualidade fascinante: o cromo da interface é estritamente preto e branco (literalmente apenas `#000000` e `#ffffff` detectados como cores), enquanto a seção hero e as vitrines de produto explodem com gradientes multicoloridos e vibrantes — verdes elétricos, amarelos brilhantes, roxos profundos, rosas intensos. Essa separação significa que o próprio design system é sem cor, tratando a saída colorida do produto como o conteúdo principal. A página de marketing do Figma é essencialmente uma parede de galeria branca exibindo arte colorida.

O que torna o Figma distintivo além da fonte variável é sua geometria de círculos e pílulas. Os botões usam raio de 50px (pílula) ou 50% (círculo perfeito para botões de ícone), criando uma sensação orgânica de paleta de ferramentas. O indicador de foco com contorno tracejado (`dashed 2px`) é uma escolha de design deliberada que ecoa as alças de seleção no próprio editor Figma — a linguagem de UI do site referencia a linguagem de UI do produto.

**Características Principais:**
- Fonte variável personalizada (figmaSans) com paradas de peso incomuns: 320, 330, 340, 450, 480, 540, 700
- Cromo de interface estritamente preto e branco — a cor existe apenas no conteúdo do produto
- figmaMono para rótulos técnicos em maiúsculas com amplo espaçamento entre letras
- Geometria de botões em pílula (50px) e circular (50%)
- Contornos de foco tracejados que ecoam as alças de seleção do editor Figma
- Gradientes hero multicoloridos e vibrantes (verde, amarelo, roxo, rosa)
- Feature OpenType `"kern"` ativado globalmente
- Espaçamento entre letras negativo em todo o site — até o corpo do texto usa de -0.14px a -0.26px

## 2. Paleta de Cores & Papéis

### Primária
- **Preto Puro** (`#000000`): Todo o texto, todos os botões sólidos, todas as bordas. A única "cor" da interface.
- **Branco Puro** (`#ffffff`): Todos os fundos, botões brancos, texto em superfícies escuras. A outra metade do binário.

*Nota: O site de marketing do Figma usa APENAS essas duas cores em sua camada de interface. Todas as cores vibrantes aparecem exclusivamente em capturas de tela do produto, gradientes hero e conteúdo incorporado.*

### Superfície & Fundo
- **Branco Puro** (`#ffffff`): Fundo principal da página e superfícies de cartão.
- **Preto Vidro** (`rgba(0, 0, 0, 0.08)`): Sobreposição escura sutil para botões circulares secundários e efeitos de vidro.
- **Branco Vidro** (`rgba(255, 255, 255, 0.16)`): Sobreposição de vidro fosco para botões em superfícies escuras/coloridas.

### Sistema de Gradientes
- **Gradiente Hero**: Um gradiente multiparada vibrante usando verde elétrico, amarelo brilhante, roxo profundo e rosa intenso. Esse gradiente é a assinatura visual da seção hero — ele representa as possibilidades criativas da ferramenta.
- **Gradientes de Seção do Produto**: Áreas individuais do produto (Design, Dev Mode, Prototipagem) podem usar temas de cores distintos em suas vitrines.

## 3. Regras Tipográficas

### Família de Fontes
- **Primária**: `figmaSans`, com fallbacks: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monoespaçada / Rótulos**: `figmaMono`, com fallbacks: `figmaMono Fallback, SF Mono, menlo`

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento entre Letras | Notas |
|-------|-------|---------|------|-----------------|--------------------------|-------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (compacto) | -1.72px | Impacto máximo, tracking extremo |
| Título de Seção | figmaSans | 64px (4rem) | 400 | 1.10 (compacto) | -0.96px | Títulos de seção de funcionalidade |
| Subtítulo | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Texto de seção enfatizado |
| Subtítulo Leve | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Texto de seção com peso leve |
| Título de Funcionalidade | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Títulos de cartão em negrito |
| Corpo Grande | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px a -0.14px | Descrições, introduções |
| Corpo / Botão | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px a normal | Corpo padrão, nav, botões |
| Corpo Leve | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px a normal | Corpo com peso leve |
| Rótulo Mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (compacto) | 0.54px | Rótulos de seção em maiúsculas |
| Mono Pequeno | figmaMono | 12px (0.75rem) | 400 | 1.00 (compacto) | 0.6px | Tags minúsculas em maiúsculas |

### Princípios
- **Precisão da fonte variável**: figmaSans usa pesos que a maioria dos sistemas jamais toca — 320, 330, 340, 450, 480, 540. Isso cria hierarquia por meio de diferenças sutis de peso em vez de saltos dramáticos. A diferença entre 330 e 340 é quase imperceptível, mas estruturalmente significativa.
- **Leve como base**: A maior parte do corpo do texto usa 320–340 (mais leve que o "regular" típico de 400), criando uma experiência de leitura etérea e arejada que combina com a estética de ferramenta de design.
- **Kern em todo lugar**: Todo elemento de texto ativa a feature OpenType `"kern"` — o kerning não é opcional, é estrutural.
- **Tracking negativo por padrão**: Até o corpo do texto usa -0.1px a -0.26px de espaçamento entre letras, criando texto universalmente compacto. O texto de display comprime ainda mais para -0.96px e -1.72px.
- **Mono para estrutura**: figmaMono em maiúsculas com espaçamento positivo entre letras (0.54px–0.6px) cria rótulos de referência técnica.

## 4. Estilos de Componentes

### Botões

**Sólido Preto (Pílula)**
- Fundo: Preto Puro (`#000000`)
- Texto: Branco Puro (`#ffffff`)
- Raio: círculo (50%) para botões de ícone
- Foco: contorno tracejado 2px
- Ênfase máxima

**Pílula Branca**
- Fundo: Branco Puro (`#ffffff`)
- Texto: Preto Puro (`#000000`)
- Padding: 8px 18px 10px (vertical assimétrico)
- Raio: pílula (50px)
- Foco: contorno tracejado 2px
- CTA padrão em superfícies escuras/coloridas

**Vidro Escuro**
- Fundo: `rgba(0, 0, 0, 0.08)` (sobreposição escura sutil)
- Texto: Preto Puro
- Raio: círculo (50%)
- Foco: contorno tracejado 2px
- Ação secundária em superfícies claras

**Vidro Claro**
- Fundo: `rgba(255, 255, 255, 0.16)` (vidro fosco)
- Texto: Branco Puro
- Raio: círculo (50%)
- Foco: contorno tracejado 2px
- Ação secundária em superfícies escuras/coloridas

### Cartões & Contêineres
- Fundo: Branco Puro
- Borda: nenhuma ou mínima
- Raio: 6px (contêineres pequenos), 8px (imagens, cartões, diálogos)
- Sombra: efeitos de elevação sutis a médios
- Capturas de tela do produto como conteúdo do cartão

### Navegação
- Nav horizontal limpa em branco
- Logo: wordmark do Figma em preto
- Abas de produto: navegação por abas em forma de pílula (50px)
- Links: texto preto, decoração sublinhado 1px
- CTA: botão pílula preto
- Hover: cor do texto via variável CSS

### Componentes Distintivos

**Barra de Abas do Produto**
- Abas horizontais em formato de pílula (raio 50px)
- Cada aba representa uma área do produto Figma (Design, Dev Mode, Prototipagem, etc.)
- Aba ativa destacada

**Seção de Gradiente Hero**
- Fundo com gradiente multicolorido e vibrante de largura total
- Sobreposição de texto branco com título display de 86px
- Capturas de tela do produto flutuando dentro do gradiente

**Indicadores de Foco Tracejados**
- Todos os elementos interativos usam contorno `dashed 2px` no foco
- Referencia as alças de seleção no editor Figma
- Uma escolha de meta-design que conecta o site e o produto

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Grade & Contêiner
- Largura máxima do contêiner: até 1920px
- Hero: gradiente de largura total com conteúdo centralizado
- Seções do produto: vitrines alternadas
- Rodapé: seção escura de largura total
- Responsivo de 559px a 1920px

### Filosofia de Espaço em Branco
- **Ritmo de galeria**: O espaçamento generoso permite que cada seção do produto respire como uma exposição própria.
- **Seções coloridas como respiração visual**: O hero gradiente e as vitrines do produto proporcionam alívio cromático entre as seções monocromáticas da interface.

### Escala de Raio de Borda
- Mínimo (2px): Pequenos elementos de link
- Sutil (6px): Contêineres pequenos, divisores
- Confortável (8px): Cartões, imagens, diálogos
- Pílula (50px): Botões de aba, CTAs
- Círculo (50%): Botões de ícone, elementos circulares

## 6. Profundidade & Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Plano (Nível 0) | Sem sombra | Fundo da página, maior parte do texto |
| Superfície (Nível 1) | Cartão branco em seção gradiente/escura | Cartões, vitrines do produto |
| Elevado (Nível 2) | Sombra sutil | Cartões flutuantes, estados de hover |

**Filosofia de Sombra**: O Figma usa sombras com parcimônia. Os principais mecanismos de profundidade são o **contraste de fundo** (conteúdo branco em seções coloridas/escuras) e a dimensionalidade inerente das próprias capturas de tela do produto.

## 7. O Que Fazer e O Que Evitar

### Faça
- Use figmaSans com pesos variáveis precisos (320–540) — o controle granular de peso É o design
- Mantenha a interface estritamente preto e branco — a cor vem apenas do conteúdo do produto
- Use geometria de pílula (50px) e circular (50%) para todos os elementos interativos
- Aplique contornos de foco tracejados de 2px — o padrão de acessibilidade característico
- Ative a feature `"kern"` em todo o texto
- Use figmaMono em maiúsculas com espaçamento positivo entre letras para rótulos
- Aplique espaçamento negativo entre letras em todo o site (-0.1px a -1.72px)

### Evite
- Não adicione cores à interface — a paleta monocromática é absoluta
- Não use pesos de fonte padrão (400, 500, 600, 700) — use as paradas únicas da fonte variável (320, 330, 340, 450, 480, 540)
- Não use cantos afiados nos botões — apenas geometria de pílula e circular
- Não use contornos de foco sólidos — o tracejado é a assinatura
- Não aumente o peso da fonte do corpo acima de 450 — a estética de peso leve é central
- Não use espaçamento positivo entre letras no corpo do texto — é sempre negativo

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Principais Mudanças |
|------|---------|---------------------|
| Mobile Pequeno | <560px | Layout compacto, empilhado |
| Tablet | 560–768px | Ajustes menores |
| Desktop Pequeno | 768–960px | Layouts em 2 colunas |
| Desktop | 960–1280px | Layout padrão |
| Desktop Grande | 1280–1440px | Expandido |
| Ultra-wide | 1440–1920px | Largura máxima |

### Estratégia de Colapso
- Texto hero: 86px → 64px → 48px
- Abas do produto: scroll horizontal no mobile
- Seções de funcionalidades: coluna única empilhada
- Rodapé: múltiplas colunas → empilhado

## 9. Guia de Prompt para Agentes

### Referência Rápida de Cores
- Tudo: "Preto Puro (#000000)" e "Branco Puro (#ffffff)"
- Vidro Escuro: "rgba(0, 0, 0, 0.08)"
- Vidro Claro: "rgba(255, 255, 255, 0.16)"

### Exemplos de Prompts de Componentes
- "Crie um hero em um gradiente multicolorido e vibrante (verde, amarelo, roxo, rosa). Título em 86px figmaSans weight 400, line-height 1.0, letter-spacing -1.72px. Texto branco. Botão CTA pílula branca (raio 50px, padding 8px 18px)."
- "Projete uma barra de abas de produto com botões em formato de pílula (raio 50px). Ativa: fundo preto, texto branco. Inativa: transparente, texto preto. figmaSans em 20px weight 480."
- "Construa um rótulo de seção: figmaMono 18px, maiúsculas, letter-spacing 0.54px, texto preto. Kern ativado."
- "Crie corpo do texto em 20px figmaSans weight 330, line-height 1.40, letter-spacing -0.14px. Preto Puro sobre branco."

### Guia de Iteração
1. Use as paradas de peso da fonte variável com precisão: 320, 330, 340, 450, 480, 540, 700
2. A interface é sempre preto + branco — nunca adicione cores ao cromo
3. Contornos de foco tracejados, não sólidos
4. O espaçamento entre letras é sempre negativo no corpo, sempre positivo nos rótulos mono
5. Pílula (50px) para botões/abas, círculo (50%) para botões de ícone
