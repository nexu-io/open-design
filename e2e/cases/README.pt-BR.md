# Biblioteca de casos de UI

Este diretório é a biblioteca de origem dos cenários de automação de UI.

## Objetivo

A biblioteca de casos separa estas três camadas:

- Desenho do cenário
- Implementação da automação
- Insumos de teste e dados de execução

Assim, os specs do Playwright não viram aos poucos um amontoado de prompts hardcoded e asserções pontuais.

## Estrutura atual do diretório

- [index.ts](index.ts): definições dos casos
- [types.ts](types.ts): schema dos casos
- [modules/project-and-generation.md](modules/project-and-generation.md): casos de criação de projeto e fluxo de geração
- [modules/conversations.md](modules/conversations.md): casos de ciclo de vida de conversas
- [modules/files.md](modules/files.md): casos de upload de arquivos, mention e restauração de preview
- [../reports/README.pt-BR.md](../reports/README.pt-BR.md): documentação dos resultados e relatórios de teste
- [../specs/app.spec.ts](../specs/app.spec.ts): entrypoint Playwright que executa os casos já automatizados

## Sobre o schema

Cada caso é um `UICase`.

- `id`: identificador estável do caso, usado em specs e relatórios de teste
- `title`: nome legível do caso
- `kind`: tipo de projeto, por exemplo `prototype`, `deck`, `workspace`
- `flow`: ramo de fluxo de automação correspondente no Playwright
- `automated`: se é executado atualmente por `pnpm run test:ui`
- `description`: alvo de cobertura e descrição do cenário
- `create`: entradas necessárias na criação do projeto
- `prompt`: conteúdo principal de entrada
- `secondaryPrompt`: entrada subsequente em fluxos com múltiplos passos
- `mockArtifact`: artifact esperado quando o SSE é mockado
- `notes`: detalhes de implementação ou observações de manutenção

## Flows suportados atualmente

- `standard`: cria projeto, envia prompt, valida o artifact gerado
- `conversation-persistence`: cria várias conversas, restaura após refresh, alterna histórico
- `file-mention`: pré-popula arquivos, seleciona via mention `@` e valida o anexo staged
- `deep-link-preview`: abre o preview pela rota de arquivo e valida a restauração
- `file-upload-send`: passa pelo seletor de arquivos real, valida upload e envio
- `conversation-delete-recovery`: deleta a conversa ativa e valida o fallback

## Regras de divisão da documentação

- `README.pt-BR.md` mantém apenas visão geral, estrutura e regras de manutenção
- A lista detalhada de casos é dividida por módulo no diretório `modules/`
- Um módulo por arquivo Markdown, com possibilidade de subdivisão futura
- Quando um módulo cresce demais, divida-o em submódulos

## Como adicionar um caso

1. Acrescente um `UICase` em [index.ts](index.ts).
2. Descreva o cenário no documento do módulo correspondente; se ainda for só design, mantenha `automated: false`.
3. Reutilize um `flow` existente sempre que possível.
4. Só adicione um novo tipo em [types.ts](types.ts) se realmente precisar de um novo caminho de automação.
5. Implemente o fluxo em [app.spec.ts](../specs/app.spec.ts).
6. Quando o caso estiver estável, troque `automated` para `true`.

## Workflow recomendado

1. Descreva o cenário primeiro em linguagem de produto.
2. Decida em qual documento de módulo ele entra.
3. Avalie se cabe em algum flow de automação existente.
4. Adicione `data-testid` apenas onde for de fato necessário.
5. Prefira mockar o SSE de `/api/chat` para garantir estabilidade.
6. Mantenha caminhos reais para criação de projeto, rotas, persistência e API de arquivos.

## Escopo apropriado

Bom encaixe:

- Fluxo principal de criação de projeto
- Fluxo de geração e preview do artifact
- Fluxo de ciclo de vida de conversa
- Fluxo de upload, mention e reabertura de arquivos
- Fluxo de deep link e restauração após refresh

Evite priorizar:

- Verificações puramente visuais e instáveis
- Avaliação de qualidade de modelo
- Testes fortemente dependentes de CLIs reais de agentes externos

## Como executar

```bash
pnpm -C e2e test:ui
```

Após a execução são gerados automaticamente:

- `e2e/reports/latest.md`
- `e2e/reports/ui-test-report.html`
- `e2e/reports/playwright-html-report/`
- `e2e/reports/results.json`
- `e2e/reports/junit.xml`

Antes de cada execução, dados de runtime e o relatório anterior são limpos automaticamente para evitar:

- Diretórios de projeto vazios acumulados em `.od-data`
- Screenshots antigos de falhas em `e2e/reports/test-results`
- Conteúdo de relatório inconsistente com a execução atual

Para depurar com interface gráfica:

```bash
pnpm run test:ui:headed
```
