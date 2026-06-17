# Sistema de design inspirado no Slack

> Category: Produtividade e SaaS
> Plataforma de comunicação corporativa. Paleta primária berinjela, paleta multicolorida do logotipo, superfícies claras com barra lateral escura, tom caloroso e acessível.

## 1. Tema visual e atmosfera

A identidade do Slack é construída em torno da ideia de que o trabalho deve parecer humano e até um pouco divertido. A superfície canônica é **clara** — áreas de conteúdo brancas com uma profunda barra lateral berinjela (`#4A154B`) — o oposto das ferramentas com fundo escuro. Esse contraste é intencional: a barra lateral é uma âncora de navegação tranquila e sempre presente, enquanto a área de conteúdo é brilhante e aberta.

A paleta do logotipo — azul, verde, amarelo, vermelho — aparece principalmente no ícone de cerquilha e em contextos de marketing, não espalhada pela interface. No próprio produto, o Slack usa um sistema de cores sóbrio e profissional com o berinjela como única âncora de marca.

**Características principais:**
- Superfícies de conteúdo predominantemente claras: branco `#FFFFFF` e quase branco `#F8F8F8`
- Profunda barra lateral berinjela `#4A154B` — o elemento de interface mais reconhecível da marca
- Quatro cores de destaque do logotipo (azul, verde, amarelo, vermelho) usadas com moderação, apenas como destaques
- Larsseit para títulos (marketing), sans-serif do sistema para a interface
- Arredondado mas não caricato: raio de 4–8px na maioria dos componentes
- Denso mas respirável: linhas de mensagens compactas com hierarquia de threads clara
- Tom caloroso e conversacional — emojis, reações e ilustrações são elementos de primeira classe

---

## 2. Paleta de cores e funções

### Cor primária da marca
| Token | Hex | Função |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Fundo da barra lateral, cor principal da marca |
| `--color-aubergine-dark` | `#350d36` | Estados de hover em superfícies berinjela |
| `--color-aubergine-light` | `#611f69` | Destaque do item ativo na barra lateral |

### Cores de destaque do logotipo (usar com moderação — apenas destaques, ícones, marketing)
| Token | Hex | Nome | Função |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Azul celeste | Ícones de canais, links, estados informativos |
| `--color-green` | `#2EB67D` | Verde-azulado | Status online, estados de sucesso |
| `--color-yellow` | `#ECB22E` | Dourado | Status ausente, avisos, destaques |
| `--color-red` | `#E01E5A` | Rubi | Notificações, erros, distintivo de menções |

### Superfície e fundo
| Token | Hex | Função |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Área principal de mensagens, modais |
| `--bg-secondary` | `#F8F8F8` | Painéis de threads, superfícies secundárias |
| `--bg-tertiary` | `#F1F1F1` | Fundos de campos de entrada, estados de hover |
| `--bg-sidebar` | `#4A154B` | Barra lateral esquerda (berinjela) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover em item da barra lateral |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Item ativo da barra lateral |
| `--bg-message-hover` | `#F8F8F8` | Hover em linha de mensagem |

### Cores de texto
| Token | Hex | Função |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Texto principal do corpo (quase preto) |
| `--text-secondary` | `#616061` | Carimbos de tempo, rótulos atenuados |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Nomes de canais na barra lateral |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Itens inativos da barra lateral |
| `--text-link` | `#1264A3` | Links em linha nas mensagens |
| `--text-mention` | `#1264A3` | Cor do texto das @menções |

### Cores semânticas
| Token | Hex | Função |
|---|---|---|
| `--color-success` | `#2EB67D` | Notificações de sucesso, estados positivos |
| `--color-warning` | `#ECB22E` | Estados de aviso |
| `--color-danger` | `#E01E5A` | Estados de erro, ações destrutivas |
| `--color-info` | `#36C5F0` | Destaques informativos |

### Borda e divisor
| Token | Hex | Função |
|---|---|---|
| `--border-default` | `#DDDDDD` | Divisores padrão, bordas de cartões |
| `--border-subtle` | `#F1F1F1` | Separadores sutis entre linhas |
| `--border-focus` | `#1264A3` | Cor do anel de foco |

---

## 3. Regras tipográficas

### Tipografias
| Função | Oficial | Alternativa web |
|---|---|---|
| Títulos de exibição / Marketing | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| Interface / Corpo / Chrome | Slack Lato (personalizado) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Código / Monoespaçado | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> O Slack usa **Larsseit** para títulos de marketing e uma variante personalizada do Lato para a interface do produto. Para uso web, `system-ui` é a alternativa mais segura.

### Escala tipográfica

| Nível | Tamanho | Peso | Altura de linha | Espaçamento entre letras | Uso |
|---|---|---|---|---|---|
| Exibição XL | 48px | 800 | 1.1 | -1px | Títulos herói de marketing |
| Exibição L | 36px | 700 | 1.15 | -0.5px | Heróis de seção |
| Título 1 | 28px | 700 | 1.25 | normal | Títulos de modais, cabeçalhos de página |
| Título 2 | 22px | 700 | 1.3 | normal | Títulos de cartões, seções de configurações |
| Título 3 | 18px | 700 | 1.35 | normal | Cabeçalhos de subseção |
| Corpo L | 16px | 400 | 1.5 | normal | Texto de mensagens, descrições |
| Corpo | 15px | 400 | 1.46667 | normal | Texto de interface padrão (tamanho base do Slack) |
| Corpo SM | 13px | 400 | 1.38462 | normal | Metadados secundários |
| Legenda | 12px | 400 | 1.33 | normal | Carimbos de tempo, dicas |
| Código | 12px | 400 | 1.5 | normal | Código em linha, blocos de código |

### Regras tipográficas
- O tamanho de corpo base do Slack é **15px** — ligeiramente menor que 16px para maior densidade
- Canais não lidos: peso 700 — o negrito é o principal indicador de não lido
- Carimbos de tempo: 12px `--text-secondary`, exibidos apenas ao passar o cursor
- Blocos de código: fundo `#F8F8F8`, borda `1px solid #DDDDDD`, border-radius 4px
- Nunca usar tamanhos de fonte abaixo de 12px
- Títulos de marketing: espaçamento entre letras `-1px` para tamanhos de exibição grandes

---

## 4. Estilos de componentes

### Botões

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Campos de entrada
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Item de canal na barra lateral
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Distintivo de não lido
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Anexos de mensagem / Cartões
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Reações
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Princípios de layout

### Layout de três colunas
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Sidebar    │        Message Area          │   Thread    │
│   (240px)    │          (flex: 1)           │  (400px)    │
│  #4A154B     │          #FFFFFF             │  optional   │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Sistema de espaçamento (base 4px)
| Token | Valor | Uso |
|---|---|---|
| `--space-1` | 4px | Espaços compactos |
| `--space-2` | 8px | Preenchimento de componente |
| `--space-3` | 12px | Preenchimento de campos de entrada |
| `--space-4` | 16px | Preenchimento padrão |
| `--space-6` | 24px | Preenchimento de cartão |
| `--space-8` | 32px | Espaços entre seções |

### Estrutura da barra lateral
```
[Workspace Name ▼]
────────────────────
Threads
All DMs
Drafts & Sent
────────────────────
▼ Channels
  # general
  # random
  # design  ● (unread)
────────────────────
▼ Direct Messages
  John Doe
  Jane Smith
```

### Compositor de mensagem
- Fixado na parte inferior da área de mensagens
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Barra de ferramentas: emoji, anexar, formatar, botão de envio

---

## 6. Profundidade e elevação

O Slack usa sombras suaves em uma superfície clara:

| Nível | Uso | Sombra |
|---|---|---|
| Plano | Linhas de mensagens, itens da barra lateral | none |
| Baixo | Cartões, campos de entrada | `0 1px 3px rgba(0,0,0,0.08)` |
| Médio | Menus suspensos, popovers | `0 4px 12px rgba(0,0,0,0.12)` |
| Alto | Modais, diálogos | `0 8px 24px rgba(0,0,0,0.15)` |
| Sobreposição | Fundos de modais | `rgba(0,0,0,0.5)` |

---

## 7. O que fazer e o que não fazer

### ✅ Fazer
- Usar berinjela `#4A154B` para a barra lateral — é o elemento de interface mais icônico do Slack
- Manter a área de conteúdo principal branca e clara
- Usar `#1D1C1D` (quase preto) para todo o texto do corpo, não preto puro
- Deixar os nomes de canais em negrito para indicar o status não lido — o peso é o indicador
- Usar as quatro cores de destaque apenas para funções semânticas (sucesso, aviso, perigo, informação)
- Aplicar `border-left: 4px` em anexos e incorporações de mensagens
- Exibir carimbos de tempo apenas ao passar o cursor
- Usar `#1264A3` para links e estados de foco
- Manter os itens da barra lateral compactos: altura 28px, border-radius 6px

### ❌ Não fazer
- Não usar uma área de conteúdo principal escura — o Slack é predominantemente claro
- Não espalhar azul/verde/amarelo/vermelho como acentos decorativos
- Não usar preto puro `#000000` para o texto
- Não usar balões de fala — as mensagens são linhas planas
- Não fazer botões com raio grande — 4px é o padrão
- Não exibir carimbos de tempo permanentemente
- Não usar MAIÚSCULAS para nomes de canais
- Não usar tamanhos de fonte abaixo de 12px

---

## 8. Comportamento responsivo

### Pontos de interrupção
| Ponto de interrupção | Largura | Layout |
|---|---|---|
| Celular | < 768px | Painel único, barra lateral como gaveta esquerda |
| Tablet | 768–1024px | Apenas barra lateral + área de mensagens |
| Desktop | > 1024px | Layout completo de três colunas |

### Adaptações para celular
- Barra lateral: gaveta esquerda, deslizar para a direita para abrir
- Barra de abas inferior: Início, MDs, Atividade, Você
- Painel de thread: sobreposição em tela cheia
- Compositor: fixado acima do teclado
- Itens da lista de canais: altura de alvo de toque 44px
- Barra de cabeçalho berinjela superior mantida no celular

---

## 9. Guia de prompts para agente

Ao gerar designs com estilo Slack, siga esta abordagem:

**Aplicação de cores:**
> Defina `background: #FFFFFF` como tela principal. Use `#4A154B` (berinjela) para a barra lateral. Todo o texto principal é `#1D1C1D`. Links e anéis de foco usam `#1264A3`. As quatro cores do logotipo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — são apenas semânticas: informação, sucesso, aviso, perigo.

**Tipografia:**
> Use `system-ui, -apple-system, sans-serif` para toda a interface. O tamanho base é 15px. Canais não lidos: peso 700. Texto do corpo: peso 400. Carimbos de tempo: 12px `#616061`, apenas ao passar o cursor. Código: `Monaco, Menlo, monospace`, 12px, fundo `#F8F8F8`.

**Layout:**
> Três colunas: barra lateral berinjela de 240px + área de mensagens branca flexível + painel de thread opcional de 400px. Itens da barra lateral: altura 28px, raio 6px, negrito quando não lido. Compositor: fixado abaixo, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Componentes:**
> Botões: raio 4px, altura 36px, berinjela primário. Campos de entrada: borda `1px solid #DDDDDD`, anel de foco `#1264A3`. Linhas de mensagens: planas, sem balões, avatar circular de 36px. Reações: pílula `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Tom:**
> O Slack é caloroso, profissional e humano. Os estados vazios usam ilustrações amigáveis. As chamadas para ação são diretas: "Enviar mensagem", "Começar". As mensagens de erro são claras e úteis. Nunca alarmante.

**Antipadrões a evitar:**
> Sem área de conteúdo escura. Sem balões de fala. Sem texto preto puro. Sem acentos multicoloridos espalhados. Sem nomes de canais em MAIÚSCULAS. Sem fontes abaixo de 12px. Sem raio de botão grande.
