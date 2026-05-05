# Relatórios de testes de UI

Este diretório guarda os resultados de execução e relatórios legíveis dos testes automatizados de UI.

## O que cada item é

- `latest.md`: relatório resumido em Markdown da última execução
- `ui-test-report.html`: ponto de entrada HTML do relatório, pensado para abrir direto
- `playwright-html-report/`: diretório do relatório HTML nativo do Playwright; o entrypoint interno continua sendo `index.html`
- `results.json`: resultado bruto em JSON do Playwright
- `junit.xml`: resultado em JUnit, prático para integrar com CI
- `test-results/`: anexos brutos dos casos com falha (screenshots, traces, error-context)

Antes de cada execução de `pnpm -C e2e test:ui`, o sistema limpa automaticamente:

- `e2e/.od-data/`
- `e2e/reports/test-results/`
- `e2e/reports/playwright-html-report/`
- `e2e/reports/results.json`
- `e2e/reports/junit.xml`
- `e2e/reports/latest.md`

Assim, por padrão, os relatórios e dados de teste refletem apenas a última execução, sem mistura com resíduos anteriores.

## Como ler

Para responder rapidamente "o que foi testado e passou?", comece por:

- [latest.md](latest.md)
- [ui-test-report.html](ui-test-report.html)

Eles incluem:

- Horário da execução
- Total de casos, aprovados e falhos
- Resultado, duração e número de retries por caso
- Resumo do erro e caminhos dos anexos quando falha

Para um contexto mais detalhado das falhas, consulte:

- `e2e/reports/playwright-html-report/`
- `e2e/reports/test-results/`

## Relação com a biblioteca de casos

- `e2e/cases/`: define "o que deveria ser testado"
- `e2e/reports/`: registra "o que foi testado e qual foi o resultado"

Com essas duas camadas separadas, dá para inspecionar o desenho da cobertura e o resultado real da execução.
