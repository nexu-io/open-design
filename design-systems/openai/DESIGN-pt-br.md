# Sistema de Design Inspirado na OpenAI

> Category: IA e LLM
> Sistema calmo e quase monocromático, ancorado em preto-azulado profundo com amplo espaço em branco e tipografia editorial.

## 1. Tema Visual e Atmosfera

A superfície de produto da OpenAI remete a um laboratório de pesquisa preparado para o público — clínica, contida, deliberadamente silenciosa. O fundo da página é um branco puro (`#ffffff`) sobreposto a uma tinta quase preta (`#0d0d0d`) com sutil subtom azul-esverdeado, de modo que até o texto parece levemente resfriado, em vez de agressivamente escuro. O resultado é uma neutralidade cromática que coloca a saída do modelo, o código e a prosa em evidência — e não o entorno visual.

O traço marcante é o uso da **Söhne** (ou sua substituta de sistema `inter`) em pesos contidos — 400 para corpo, 500 para navegação e rótulos, 600 para ênfase — combinada com a **Signifier**, uma serifa contemporânea usada para exibição editorial. Enquanto a maioria das marcas de IA aposta no futurismo, os títulos com serifa da OpenAI conferem ao produto um tom sutilmente literário, como se cada anúncio fosse um ensaio.

O sistema de formas é uniformemente suave: raios de 8px a 12px, pílulas de 9999px para tags e chips, sem cantos abruptos em nenhum lugar. As transições entre seções são marcadas por espaço em branco, e não por divisores; quando bordas aparecem, são hairlines `#e5e5e5` que transmitem ausência de cor, não presença.

**Características Principais:**
- Tela em branco puro (`#ffffff`) com tinta preto-azulada profunda (`#0d0d0d`)
- Söhne / Inter em pesos modestos (400, 500, 600) — contenção acima de afirmação
- Serifa Signifier para títulos editoriais de exibição
- Raios suaves de 8–12px em todo lugar; pílulas de 9999px para chips
- Bordas hairline (`#e5e5e5`) usadas com parcimônia; espaço em branco como divisor primário
- Ilustrações em cor única em preto-azulado profundo — sem gradientes nas marcas
- Altura de linha generosa (1.55–1.65) e rastreamento próximo de zero

## 2. Paleta de Cores e Funções

### Primárias
- **Branco Puro** (`#ffffff`): Fundo principal, superfície de card, fundo de botão.
- **Preto Tinta** (`#0d0d0d`): Texto principal, marca, CTA primária.
- **Preto Suave** (`#1a1a1a`): Título secundário, tinta alternativa para texto não crítico.

### Superfície e Fundo
- **Névoa** (`#fafafa`): Fundo de quebra de seção, superfície de rodapé.
- **Pérola** (`#f5f5f5`): Superfície de card, painel elevado.
- **Nuvem** (`#ececec`): Fundo desabilitado, tom de divisor.

### Destaque de Marca
- **OpenAI Teal** (`#10a37f`): Primária da marca, link, badge de destaque — a única cor em um sistema caso contrário neutro.
- **Teal Deep** (`#0a7a5e`): Estado de hover e pressionado para a cor da marca.
- **Teal Soft** (`#e8f5f0`): Tom de superfície para badges de sucesso, callouts de destaque.

### Neutros e Texto
- **Grafite** (`#3c3c3c`): Texto de corpo, cor padrão de leitura.
- **Ardósia** (`#6e6e6e`): Texto secundário, legendas, metadados.
- **Cinza** (`#9b9b9b`): Texto terciário, placeholder, rótulo desabilitado.
- **Pedra** (`#c4c4c4`): Divisores decorativos, ícones sutis.

### Semânticas e Borda
- **Borda Hairline** (`#e5e5e5`): Separador hairline padrão.
- **Borda Suave** (`#ededed`): Contorno de card sobre superfície branca.
- **Erro** (`#ef4146`): Validação, ação destrutiva.
- **Aviso** (`#f5a623`): Âmbar suave para estados de alerta.
- **Informação** (`#2563eb`): Tom de link informacional (usado com parcimônia; teal ainda prevalece).

## 3. Regras Tipográficas

### Família Tipográfica
- **Display / Editorial**: `Signifier`, com fallback: `'Source Serif Pro', Georgia, serif`
- **Corpo / UI**: `Söhne`, com fallback: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Código / Mono**: `Söhne Mono`, com fallback: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Hero editorial, títulos de anúncio |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Título de página |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Título de seção |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Subseção |
| Corpo Grande | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Parágrafos de abertura |
| Corpo | Söhne | 16px (1rem) | 400 | 1.65 | normal | Texto de leitura padrão |
| Corpo Pequeno | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Corpo de card, UI densa |
| Legenda | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadados, badges |
| Rótulo | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Eyebrow, links de navegação em maiúsculas |
| Código | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Blocos de código, saída de terminal |

### Princípios
- **Contenção como identidade**: os pesos são limitados a 600; 700+ destoa da marca. A hierarquia vem do tamanho e da cor, não do peso.
- **Serifa para a alma, sans-serif para o sistema**: a Signifier aparece apenas em momentos editoriais de exibição. A UI do produto é exclusivamente sans-serif.
- **Rastreamento negativo no display**: -0.02em em tamanhos de display; o rastreamento retorna a zero em 16px.

## 4. Estilização de Componentes

### Botões

**Primário**
- Fundo: `#0d0d0d`
- Texto: `#ffffff`
- Padding: 10px 18px
- Raio: 9999px (pílula completa) em chips, 12px em CTAs retangulares
- Hover: fundo `#1a1a1a`
- Uso: CTA principal, "Experimente o ChatGPT", "Entrar"

**Secundário**
- Fundo: `#ffffff`
- Texto: `#0d0d0d`
- Borda: 1px solid `#e5e5e5`
- Padding: 10px 18px
- Raio: 12px
- Hover: fundo `#fafafa`, borda `#d4d4d4`

**Destaque de Marca**
- Fundo: `#10a37f`
- Texto: `#ffffff`
- Padding: 10px 18px
- Raio: 12px
- Hover: `#0a7a5e`
- Uso: CTA de upgrade em destaque, caminho de sucesso

### Cards
- Fundo: `#ffffff`
- Borda: 1px solid `#ededed`
- Raio: 16px
- Padding: 24px–32px
- Sombra: nenhuma por padrão; no hover `0 4px 16px rgba(13,13,13,0.06)`

### Inputs
- Fundo: `#ffffff`
- Borda: 1px solid `#e5e5e5`
- Raio: 12px
- Padding: 12px 14px
- Foco: borda `#10a37f`, anel `0 0 0 3px rgba(16,163,127,0.12)`

### Pílulas e Tags
- Fundo: `#f5f5f5`
- Texto: `#3c3c3c`
- Padding: 4px 10px
- Raio: 9999px
- Fonte: 12px / 500

## 5. Espaçamento e Layout

- **Unidade base**: 4px. Escala: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Container**: largura máxima 1200px, gutter de 24px no mobile, 48px no desktop.
- **Ritmo de seção**: 96–128px verticais entre seções principais; 64px no mobile.
- **Grid**: 12 colunas no desktop, 4 colunas no mobile, gap de 24px.

## 6. Movimento

- **Duração**: 150–220ms para hover; 280–360ms para transições de layout.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (saída suave) para entradas.
- **Contenção**: sem parallax, sem scroll-jacking. Apenas fade e translate sutis.

## 7. Diretrizes de Uso

- Preserve juntos a contenção editorial neutra, o raio suave e o uso esparso de destaque; acentos em verde sozinhos não criam uma superfície no estilo da OpenAI.
- Use momentos de display no estilo Signifier apenas para hierarquias editoriais ou de anúncio, mantendo os controles de produto no sistema sans-serif.
- Evite movimentos ornamentais, sombras pesadas e cards decorativos superdimensionados; o sistema deve transmitir calma, legibilidade e deliberação.
