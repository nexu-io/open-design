# Sistema de design inspirado no Duolingo

> Category: Produtividade & SaaS
> Plataforma de aprendizado de idiomas. Verde coruja brilhante, sombras grossas, alegria gamificada.

## 1. Tema visual e atmosfera

O Duolingo é a gamificação expressa como linguagem visual. A interface é descaradamente brilhante, com o **verde coruja** (`#58cc02`) como cor primária da marca e uma sombra grossa de 4px na parte inferior de cada elemento interativo, que parece um botão 3D esperando para ser pressionado. A página é branca (`#ffffff`) com bordas grossas de 2–3px em cinza escuro (`#e5e5e5`), e o sistema inteiro lembra um aplicativo iOS de 2015 renascido com melhor hierarquia.

A tipografia usa **Feather Bold** (uma sans-serif arredondada personalizada) para o chrome e **Mona Sans** (ou Inter) para o corpo do texto. Os tamanhos de exibição são grandes e confiantes — o Duolingo nunca sussurra. Os títulos frequentemente têm o traço de sublinhado verde ou ficam sobre uma pílula verde, e o mascote Duo (uma coruja verde) aparece como um personagem de ilustração ativo, não como um logotipo estático.

A linguagem de formas é amigável: raios de 16–20px nos cartões, 12px nos botões, 9999px nos chips e barras de progresso. A iconografia é preenchida, arredondada e codificada por cor de acordo com a habilidade — cada superfície de lição tem um par de cores instantaneamente identificável.

**Características principais:**
- Verde coruja (`#58cc02`) como cor de marca dominante, usada em mais de 30% da superfície
- Sombra inferior grossa de 4px em cada botão (a affordance de "pressão tátil")
- Bordas sólidas de 2–3px, nunca linhas finas
- Feather Bold (display arredondado) + Mona Sans (corpo)
- Texto grande e confiante — os tamanhos de exibição começam em 48px e crescem
- Mascote como personagem: a coruja Duo aparece no onboarding, erros, sequências
- Laranja de sequência (`#ff9600`) e rosa gema (`#ce82ff`) como cores de marca secundárias

## 2. Paleta de cores e papéis

### Primário
- **Verde coruja** (`#58cc02`): Primário da marca, CTA principal, resposta correta.
- **Verde coruja escuro** (`#58a700`): Cor de pressionamento/sombra para botões verdes.
- **Verde coruja claro** (`#89e219`): Hover, preenchimentos suaves.
- **Verde coruja pálido** (`#dbf8c5`): Superfície suave, banner de sucesso.

### Acentos secundários
- **Laranja de sequência** (`#ff9600`): Contador de sequência, ícone de chama, energia premium.
- **Laranja de sequência escuro** (`#cc7a00`): Laranja pressionado.
- **Rosa gema** (`#ce82ff`): Moeda gema, Super Duolingo.
- **Azul enguia** (`#1cb0f6`): Botão de dica, link de informação.
- **Vermelho cardeal** (`#ff4b4b`): Resposta errada, vida perdida.
- **Amarelo abelha** (`#ffc800`): Distintivo pro, conquista.

### Superfície
- **Neve** (`#ffffff`): Fundo principal.
- **Enguia** (`#f7f7f7`): Separação de seção, superfície secundária.
- **Cisne** (`#e5e5e5`): Fundo desativado, bloco embutido.
- **Lobo** (`#777777`): Divisor escuro, texto secundário.

### Tinta e texto
- **Preto enguia** (`#3c3c3c`): Texto principal.
- **Lobo** (`#777777`): Texto secundário, legendas.
- **Lebre** (`#afafaf`): Desativado, espaço reservado.

### Borda
- **Cisne** (`#e5e5e5`): Borda padrão de 2px.
- **Lebre** (`#afafaf`): Borda enfatizada ao passar o cursor.

## 3. Regras tipográficas

### Família de fontes
- **Display / UI / Títulos**: `Feather Bold`, com fallback: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Corpo / Texto longo**: `Mona Sans`, com fallback: `'Helvetica Neue', system-ui, sans-serif`
- **Código (raro, escolas/admin)**: `JetBrains Mono`, com fallback: `ui-monospace, Menlo, monospace`

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de linha | Espaçamento | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Herói de onboarding |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Título da página |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Cabeçalho de seção |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Título do cartão, linha de lição |
| Corpo grande | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Prompt de lição, instrução |
| Corpo | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Prosa padrão |
| Legenda | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Contador de XP, metadados |
| Botão | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Rótulo padrão de botão |
| Sequência | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Número de sequência, na chama |

### Princípios
- **800 é o padrão**: O Feather Bold usa peso 800 em títulos e botões. 700 parece fraco neste sistema.
- **Texto grande**: os tamanhos de título são 25–40% maiores do que marcas de produtos típicas — confiança como identidade.
- **Formas de letras arredondadas**: cada glifo tem terminações suaves; serifas afiadas quebrariam o contrato de amizade.

## 4. Estilização de componentes

### Botões

**Primário (Verde coruja)**
- Fundo: `#58cc02`
- Texto: `#ffffff`
- Preenchimento: 14px 24px
- Raio: 16px
- Border-bottom: 4px solid `#58a700` (a sombra grossa)
- Hover: fundo `#89e219`
- Ativo: translate-y 4px, border-bottom 0 (o botão "pressiona")
- Uso: "Continuar", "Verificar", CTA principal.

**Secundário (Branco com sombra inferior)**
- Fundo: `#ffffff`
- Texto: `#777777`
- Borda: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Raio: 16px
- Preenchimento: 14px 24px
- Hover: texto `#3c3c3c`, borda `#afafaf`

**Laranja de sequência**
- Fundo: `#ff9600`
- Texto: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Uso: meta de sequência, "Iniciar sequência"

**Erro (Vermelho cardeal)**
- Fundo: `#ff4b4b`
- Texto: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Uso: feedback de resposta errada.

### Cartões / Blocos de lição
- Fundo: `#ffffff`
- Borda: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Raio: 16px
- Preenchimento: 16px
- Hover: elevar 2px, sombra `0 4px 0 #d7d7d7`

### Nó da árvore de habilidades (Bolha de lição)
- Tamanho: 80×72px
- Fundo: tonalidade da cor da habilidade (verde para ativo, cinza para bloqueado)
- Border-bottom: 6px solid variante mais escura
- Raio: 50% (circular)
- Ativo: pulsa 1.0 → 1.05 a cada 1.6s

### Entradas
- Fundo: `#ffffff`
- Borda: 2px solid `#e5e5e5`
- Raio: 12px
- Preenchimento: 12px 16px
- Foco: borda `#1cb0f6` (azul enguia), anel `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Barra de progresso
- Trilha: `#e5e5e5`
- Preenchimento: `#58cc02` (ou `#ff9600` para sequência)
- Raio: 9999px
- Altura: 16px
- Preenchimento animado: 320ms ease-out ao incrementar.

## 5. Espaçamento e layout

- **Unidade base**: 4px. Escala: 4, 8, 12, 16, 24, 32, 48, 64.
- **Contêiner**: máx. 1080px, calha de 24px.
- **Coluna da árvore de lições**: 320px de largura; centralizada no desktop.

## 6. Movimento

- **Duração**: 180ms para pressionar botão; 320ms para desbloqueio de nó de habilidade; 1.6s para pulso do nó ativo.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, leve ultrapassagem) para desbloqueios.
- **Mascote**: Duo pisca a cada 4–6s, pula em marcos de sequência (480ms ease-out mola).

## 7. Diretrizes de uso

- Mantenha juntos o verde coruja de alta saturação, as sombras inferiores grossas e a geometria arredondada das lições; botões verdes planos sozinhos não transmitem a identidade do Duolingo.
- Reserve o texto em negrito de tamanho grande para momentos de lição, sequência e progresso onde o produto precisa de encorajamento ou feedback.
- Use movimento lúdico com moderação em torno de mudanças de estado de progresso, evitando animações genéricas de quique em cada controle.
