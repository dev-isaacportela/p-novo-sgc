# Plan: 019 — Projeção manual

**Spec:** [`spec.md`](spec.md) · **Data:** 2026-11-03 · **Script:** `backend/add-021-projecao-manual.mjs` · **Faixa de id local:** 91xx (leitura 9101, escritas 9150–9151) · **Decisões:** R-200..R-201 no 000

## Constitution Check

| Princípio | Como a 019 atende |
|---|---|
| I. Spec antes de código | spec commitada com o código; P-01..P-09 com proposta implementada, aguardando aprovação do usuário |
| II. Requisito testável | cada C-0NN e RN-0NN tem teste com o id no título (`frontend/tests/projecao-manual.test.mjs`, `backend/simulator/smoke/019-projecao-manual.mjs`) |
| III. Fora de escopo | seção da spec |
| IV. Migrations | nenhuma tocada; DDL em `setup-backend.mjs` (`DDL_019`), executado só no sandbox |
| V. Duas camadas | telas com o vocabulário de `page.tsx` (`Alert`, `Status`, `Dialog`, `LabelledField`, `DatePicker`); nenhum primitivo novo |
| VI. Tokens | nenhuma cor literal; o selo é `Status tone="live"`, o bloco `Alert tone="info"`, sempre com rótulo |
| VII. Simplicidade | nenhuma dependência nova; a regra num módulo puro (`lib/projecao-manual.ts`) e um parâmetro opcional (`fatorProjecao`) nas duas contas que já existem |

## Onde o legado aplica e onde o SGC 2 aplica (P-01)

No legado (`p-60523`), `INFLUENCIA_PROJECAO_PCT/ATE` mora em `PRODUTO_PARAMETROS_COMPRA` e é gravado pela `ci_influenciar_projecao` (SF 485, upsert, chamado **só se pct ≠ 0**, validade padrão hoje + 30). Na página, ele só é lido por `hasActiveProjection` (`pct ≠ 0 ∧ (ATE vazio ∨ ATE ≥ hoje)`), que alimenta o selo "Proj. N%" e o filtro `projecao`. A SF de cálculo e o `buildForecastAnalysis` não o leem: RN-CI-23 diz "não altera o cálculo". A coluna irmã `SUGESTAO_COMPRA.INFLUENCIA_PROJECAO_PCT`, ao lado de `PROJECAO_VENDA_MENSAL`, foi criada e nunca usada.

O ponto que a proposta escolhe é o que a tabela do legado indica, a venda projetada. No SGC 2, a venda projetada existe em dois lugares:

1. **Régua da 011** (`lib/ressuprimento.ts`, `calcularRessuprimento`): o consumo diário ponderado do servidor, depois do seletor de licitação. Ele alimenta ES, PP, máximo, sugestão, cobertura atual, gatilho e situação, e na linha também a chegada do trânsito (`transito.ts`), a cobertura futura (`coberturaFuturaComCompra`), o completar compra, o valor sugerido e as oportunidades especiais (`consumoDiario` da linha). O fator entra **uma vez**, como `opcoes.fatorProjecao` (padrão 1), e tudo isso o herda sem mudança. A linha ganha `consumoMedido` (o de antes do fator) e `fatorProjecao` para o painel mostrar os dois.
2. **Modelos de previsão** (`lib/previsao.ts`, `preverVendas`): a série, o cap de outliers, os erros, MAD, MAPE, TS e o Best Fit continuam sobre a venda real. Depois de ajustados os cinco modelos, a `previsao` de cada um é multiplicada pelo fator, e a de antes fica em `previsaoBase`. Assim `modeloEscolhido`, `sugestaoProjetada` (vendaDiária × alvo, a mesma forma da R-134), `resumoVendaFutura`, a barra de projeção do gráfico e `sugestoesDaLinha` leem o valor ajustado sem mudança. `previsaoDoSku` ganha o parâmetro `fatorProjecao` e repassa.

**Não muda:** `VENDA_PERIODO`, o histórico e as barras do gráfico, as curvas (`curvasDoRessuprimento`, que é passado), as médias 3/6/12, a venda por cliente, o resumo por fornecedor do seletor (`sgcWintResumoFornecedores`, estimativa do servidor) e a fórmula do card (`lib/compras.ts`, R-134, P-08).

## Modelo de dados (`DDL_019` no fim do array do `setup-backend.mjs`)

| Tabela | Conteúdo |
|---|---|
| `SGC_PROJECAO_MANUAL` | `ID`, `CODFORNEC`, `CODFILIAL`, `CODPROD`, `PERCENTUAL DECIMAL(6,1)` (0 = sem ajuste), `VALIDA_ATE VARCHAR(10)`, `MOTIVO VARCHAR(500)`, `ATUALIZADO_POR`, `ATUALIZADO_EM VARCHAR(19)`; `UNIQUE (CODFORNEC, CODFILIAL, CODPROD)` é o alvo do upsert (RN-006) |

A tabela é própria e não ganha colunas em `SGC_PARAMETRO_COMPRA`: `CREATE TABLE IF NOT EXISTS` não acrescenta coluna em tabela existente, e assim a 019 não toca nas SFs nem no DDL da 011.

## Server Functions (`add-021-projecao-manual.mjs`, todas SQL, guardadas por `:VAR_USER`)

| Id | Nome | O quê |
|---|---|---|
| 9101 | `sgcProjecaoManualListar` | ajustes com `PERCENTUAL <> 0` do fornecedor na filial (vencidos inclusive: a tela decide pela data, RN-001). Params: `codfornec`, `codfilial`, `limite`, `offset` |
| 9150 | `sgcEscProjecaoManualSalvar` | `INSERT … SELECT … FROM DUAL WHERE <validação> AND guarda(admin, gestor) ON DUPLICATE KEY UPDATE`. Validação no servidor: produto, fornecedor e filial preenchidos; `percentual` entre −90 e 300 e ≠ 0; `validaAte` com 10 caracteres; motivo com ≥ 5 caracteres. A janela de datas (hoje..hoje + 365) é da tela, porque o "hoje" do servidor tem outro fuso. Params: `codfornec`, `codfilial`, `codprod`, `percentual`, `validaAte`, `motivo`, `atualizadoEm` |
| 9151 | `sgcEscProjecaoManualRemover` | `UPDATE … SET PERCENTUAL = 0, VALIDA_ATE = ''` mais quem e quando, guardado. Params: `codfornec`, `codfilial`, `codprod`, `atualizadoEm` |

A guarda é o texto da 002 (R-013), copiado de `add-013-compras-inteligentes.mjs` como as outras specs fazem, com `['admin', 'gestor']` (RN-007 = `PARAMETRIZAR` da 011). Escrita recusada devolve 0 linhas, e a tela relê o que voltou do banco (D-03 da 011).

## Custo de execução (RNF)

- **Trocar de filial:** 8 → **9** execuções. A `sgcProjecaoManualListar` entra no `Promise.all` das leituras de `carregarRessuprimento`. A Análise do Produto aberta do card (`useAnaliseProduto`) usa a mesma carga e também paga essa execução a mais. Abrir o card continua em `kbCardDetalhe` + `sgcPedidoCarregar`.
- **Gravar ou remover:** 1 escrita + 1 `sgcProjecaoManualListar`. A medida do ERP não é refeita.
- Filtro, selo e recálculo: 0 execuções (regra pura).

## Frontend

| Arquivo | Mudança |
|---|---|
| `src/lib/projecao-manual.ts` (novo) | `projecaoDeLinha`, `projecaoAtiva`, `fatorDaProjecao`, `projecoesAtivas` (mapa por produto), `validadePadrao`, `validarProjecao`, `textoDoSelo`, `previaDaProjecao`, as constantes da RN-004. Puro, sem dependência de `ressuprimento.ts` (evita ciclo) |
| `src/lib/ressuprimento.ts` | `calcularRessuprimento` com `opcoes.fatorProjecao`; `Ressuprimento.consumoMedido/fatorProjecao`; `LinhaRessuprimento.projecao`; `montarRessuprimento` com `opcoes.projecoes`; filtro `projecao`; coluna "Projeção manual (%)" no CSV |
| `src/lib/previsao.ts` | `preverVendas(pontos, fatorProjecao = 1)`, `ResultadoModelo.previsaoBase` |
| `src/lib/analise-sku.ts` | `previsaoDoSku(…, fatorProjecao = 1)` |
| `src/lib/server-functions.ts` (I) | bloco 019 nos dois mapas |
| `pages/compras-inteligentes/carga-ressuprimento.ts` | a leitura nova e `CargaRessuprimento.projecoes` |
| `pages/compras-inteligentes/projecao-manual-ui.tsx` (novo) | `BlocoProjecaoManual` (o bloco do painel e da janela) e `ProjecaoManualDialogo` (percentual, validade, motivo, prévia, Remover) |
| `pages/compras-inteligentes/ComprasInteligentesPage.tsx` | estado dos ajustes, as duas escritas com releitura, o diálogo, o fator na previsão |
| `pages/compras-inteligentes/use-analise-produto.ts` | os ajustes da carga em `montarRessuprimento` e o fator na previsão |
| `pages/compras-inteligentes/painel-detalhe.tsx`, `analise-produto.tsx` | o bloco, o botão "Projeção manual" ao lado de Parâmetros (`onProjecao` opcional; no card ele aparece desabilitado com o motivo, como Parâmetros) e o consumo medido nos parâmetros do cálculo |
| `pages/compras-inteligentes/grid.tsx` | selo "Projeção ±N %" nos avisos da linha |
| `pages/compras-inteligentes/previsao-ui.tsx` | "N pelo modelo · ±N % manual" na projeção mensal; o consumo medido no consumo diário |

## Simulador

- `config.mjs` (I): `add-021-projecao-manual.mjs` no fim do `PUBLISH_ORDER`. O `CHECK_INPUT` não ganha chave: a leitura usa `codfornec`, `codfilial`, `limite` e `offset`, que já existem.
- Sem seed: o smoke grava os próprios ajustes sobre os produtos 5401–5403 do fornecedor 1042 (seed da 011) e limpa a tabela no começo.
- `smoke.mjs` (I): a suíte `smoke/019-projecao-manual.mjs`.

## Testes

- `frontend/tests/projecao-manual.test.mjs`: C-001..C-012, C-015, RN-001..RN-004, RN-008 e RF-009 sobre a regra pura (com a base da 011: consumo 2, lead 9, cobertura 35, caixa 12).
- `backend/simulator/smoke/019-projecao-manual.mjs`: C-005 (recusas no servidor), C-006, C-013, C-014 com as SFs reais.

## Complexity Tracking

Nenhuma violação.
