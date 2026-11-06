# Gate #1 — Roteiro do filme de lançamento · Traço Urbano

Projeto real: `C:\Projects\BragaMarketing\videos\traco-urbano-launch\`
16:9 · pt-BR · ~75s totais · 7 capítulos · voz Matilda (settings do voice-winner, já aprovados).
Grafia abaixo é a oficial (a fonética do TTS está no SCRIPT.md).

| # | Capítulo | Fala |
|---|----------|------|
| 1 | A LEI DA CIDADE | Todo projeto começa na lei da cidade. Recuos, taxa de ocupação, gabarito — espalhados em decretos, mapas e tabelas de zona. Conferir na mão leva horas. E errar não é opção. |
| 2 | A TESE *(punch escuro: "Não adivinha." / "Lê a lei.")* | O Traço Urbano lê a legislação do município de verdade. E calcula o envelope construtivo máximo do seu lote, regra por regra. |
| 3 | REGRA POR REGRA *(prancha SVG gigante, dados de Cafelândia)* | Recuo frontal, laterais, fundos, coeficiente, gabarito. Cada regra vira uma aresta do envelope, calculada de forma determinística. Não é chute de IA: é geometria. |
| 4 | A PROVA *(dossiê + citação; microcopy "a responsabilidade técnica é sua")* | E cada número sai com a citação do lado: lei, artigo, página e data de verificação. Você confere a fonte — e assina sabendo o que está assinando. |
| 5 | DO ENVELOPE AO CAD *(3D + chips DXF/PDF)* | Veja o envelope em 3D, exporte em DXF para o seu CAD, ou gere o dossiê em PDF e entregue ao cliente. |
| 6 | PRÓXIMO HORIZONTE *(mapa PR; selo PLANEJADO nas cidades em curadoria)* | Hoje, Cafelândia está no ar, com curadoria completa. Toledo, Cascavel, Maringá, Londrina e Curitiba vêm a seguir — nada é liberado sem curadoria. |
| 7 | CTA *(escuro; preços só na tela: Grátis 2 projetos · R$ 49/dossiê · R$ 119,99/mês)* | Traço Urbano. O dossiê urbanístico auditável, com o artigo da lei do lado. Comece grátis em tracourbano.ia.br. |

## Correção vs. versão anterior
- O roteiro anterior daria ~8 min (70–80s POR capítulo). A skill braga-video manda ~70–80s TOTAIS — falas enxutas de ~10s.
- Corrigidos: "o mejor" → "o melhor" (fala reescrita), preços tirados do VO (TTS estropia moeda; ficam na tela), domínio validado no código (`tracourbano.ia.br`).

## Claims — todos validados contra o app real (16/07/2026)
Motor determinístico ✅ · citação lei/artigo/página ✅ · 3D + DXF/PDF ✅ · Cafelândia curada ✅ · demais cidades = selo PLANEJADO ✅ · fail-closed ✅ · preços do design-brief (billing OFF → sem prometer checkout) ✅

## Status (16/07/2026) — GATE DE PREVIEW
Pipeline executado: VO Matilda gerado (7 falas) → normalizado −19 LUFS → durações reais fixadas (filme de **88,57s**) → 7 frames HTML → `check` 0 erros/0 warnings → snapshots dos 7 capítulos lidos e aprovados → OCR de redação 0 hits.

**▶ Preview no ar: http://localhost:3006** — assista e responda: **"preview first, or render?"**
(Nunca renderizo sem aprovação; derrubo o preview e confiro `git diff` antes de qualquer render.)

Correção de honestidade aplicada no caminho: recuos/índices vêm da **Lei 1.643/2019 (zoneamento), Anexo I-B — Zona ZR2** (3,00 m frontal · TO 80% · CA 1,5 · 4 pav. · permeab. 10%); a 1.646/2019 é o Código de Obras e aparece só como documento no cap. 1.

## Provenance

Formalized by Open Design from candidate ebd1bd35-7697-44dc-b810-131c3eaac458.
