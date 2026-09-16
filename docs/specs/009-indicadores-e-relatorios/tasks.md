# Tasks: Indicadores e relatórios — o painel de gestão de compras

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir à base / ao integrador** = arquivo compartilhado; esta feature não o edita.

## Backend

- [ ] **T-001** — **Pedir à BASE (S2), antes do fan-out**: `SGC_RELATORIO` no `setup-backend.mjs`, com as colunas da seção *Modelo de dados* (`TITULO VARCHAR(180) NOT NULL`, `DESCRICAO VARCHAR(500)`, `CONFIG_JSON TEXT`, `COMPARTILHADO BOOLEAN NOT NULL DEFAULT FALSE`, `CRIADO_POR`, `CRIADO_EM`, `ATUALIZADO_POR`, `ATUALIZADO_EM`) e o `INDEX IX_SGC_RELATORIO_DONO (CRIADO_POR, ID)`, **no `CREATE`**, sem `ALTER` → `backend/setup-backend.mjs`
- [ ] **T-002** — **Entrega da BASE (S2), R-080** — a 009 **consome, não cria**: `recharts` no `package.json`, `npx shadcn add chart` em `components/ui/chart.tsx` e o bloco §8.7 de `page.tsx` (`corDeSerie`, `GradeKpi`, `Kpi`, `GradeGraficos`, `PainelGrafico`, `AlternaVisao` e os primitivos do recharts reexportados), mais a §8.7 do `design.md`. A seção *Superfície de interação* do `plan.md` é a especificação que a base segue; `page.tsx` é arquivo compartilhado → `frontend/package.json`, `frontend/src/components/ui/chart.tsx`, `frontend/src/components/page.tsx`, `docs/design.md`
- [ ] **T-003** — Criar `add-012-indicadores.mjs` com o esqueleto padrão do `add-008` (`definitions` exportado, `isEntrypoint()` resolvendo o `jdbcId` do WinThor por nome, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`), a constante `HOJE` (`COALESCE(NULLIF('{{hoje}}',''), CURDATE())`), a `guarda(personas)` da 002 copiada literal (R-013), o fragmento `RECORTE_RESTRITO` (sobre **`C.CRIADO_POR`**), o `import { diasUteisEntre, somarDiasUteis, somarDiasCorridos } from './lib/dias-uteis.mjs'` e o `import { fragmento } from './lib/fragmentos.mjs'` (R-074) → `backend/add-012-indicadores.mjs`
- [ ] **T-004** — `pedidosCte()`: as quatro CTEs (`PED`, `DIAS`, `CLASS`, `FINAL`) do plan, com os três marcos de fim de RN-001, os sete estados por etapa (RN-002), o SLA do pedido (RN-005), a nota com `100.0` (RN-006), a aderência à agenda (RN-008), `cancelado` fora (RN-007), o período **obrigatório** (`BETWEEN` seco — D-014) e o recorte `RESTRICTED` por `C.CRIADO_POR` (RN-015) → `backend/add-012-indicadores.mjs`
- [ ] **T-005** — `sgcSlaPedidosKpis` (7908), `sgcSlaPedidosListar` (7909) e `sgcSlaPedidosListarTotal` (7910) sobre `pedidosCte()`: os oito KPIs, as 33 colunas da listagem (marcos + metas + estados), os filtros `fase`/`soVencidos` **fora** da CTE e a ordenação por `FIELD(SLA_STATUS, …)` → `backend/add-012-indicadores.mjs`
- [ ] **T-006** `[P]` — `sgcSlaPedidoFases` (7911): passagens de `KB_MOVIMENTO` de um card, com a próxima por `MIN(M2.ID) … M2.ID > M.ID` (D-006) e `DIAS_NA_FASE` em dias corridos até a saída ou até hoje → `backend/add-012-indicadores.mjs`
- [ ] **T-007** — `sgcIndResumo` (7901) e `sgcIndPedidosPorFase` (7902): a linha dos sete números, com `CONDICAO_ABERTO` e `CONDICAO_AGENDA_ATRASADA` escritas **uma vez** no arquivo, e a linha por fase (as 10, inclusive vazias) → `backend/add-012-indicadores.mjs`
- [ ] **T-008** `[P]` — `sgcIndAgendaAtrasos` (7903) reusando `CONDICAO_AGENDA_ATRASADA`, e `sgcIndProdutosBo` (7904) agregando `SGC_BO_ITEM` aberto por fornecedor — o `VL_PENDENTE` é `SUM(B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0))` pelo `LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD` (C-9: `SGC_BO_ITEM` não tem preço); os dois com `{{limite}}` (D-008) → `backend/add-012-indicadores.mjs`
- [ ] **T-009** — `sgcIndPerfilFornecedor` (7905) sobre `pedidosCte()` agrupado por fornecedor, e `sgcIndLeadTime` (7906) sobre `KB_MOVIMENTO` com a subconsulta de D-006 → `backend/add-012-indicadores.mjs`
- [ ] **T-010** `[P]` — `sgcWintComprasVsVendas` (7907, Oracle): a consulta do plan por `PCPRODUT.CODFORNEC`, filial **obrigatória** (sem `OR ''`), licitação por `CODATV1 IN (11,12,13,14,15,20)` em coluna própria (D-004) e `ROWNUM <= {{limite}}` → `backend/add-012-indicadores.mjs`
- [ ] **T-011** — `solicitacoesCte()` + `sgcSolicitacoesFunil` (7912) e `sgcSolicitacoesPorVendedor` (7913) carregando a régua por `fragmento('situacao-solicitacao.sql')` (R-074), **nunca** reescrevendo o `CASE` (RN-010). A CTE declara os quatro aliases do contrato R-075 — `S` (solicitação), `C` (`KB_CARD`, `EXCLUIDO_EM IS NULL`), `SF` (`SGC_FASE` por `BOARD_ID`+`FASE_ID`) e `I` (`SGC_PEDIDO_ITEM` com `STATUS <> 'removido'`) — com os três `LEFT JOIN` obrigatórios. O funil agrupa por **`S.STATUS, SITUACAO`** (B-3: a régua devolve `sem_pedido` para pendente/recusada/cancelada/aprovada-sem-pedido, então uma dimensão só não separa) e devolve `STATUS, SITUACAO, QTD, QTD_AVALIADAS, TEMPO_MEDIO_AVALIACAO_DIAS`; vendedor = `INT_USER.NOME` de `CRIADO_POR`; `ADERENCIA_PCT` com `100.0`; nenhuma coluna de valor → `backend/add-012-indicadores.mjs`
- [ ] **T-012** — `sgcRelatoriosListar` (7914) com `COMPARTILHADO = 1 OR CRIADO_POR = :VAR_USER` e a coluna `PODE_EDITAR` (dono ou admin) → `backend/add-012-indicadores.mjs`
- [ ] **T-013** — `sgcRelatorioPedidos` (7915), `sgcRelatorioPedidosTotal` (7916) e `sgcRelatorioAgregar` (7917): consulta **fixa** com os seis filtros desligáveis — o período na forma de **dois ramos** (`'{{dataInicio}}' = '' OR …`, idem `dataFim`), nunca `BETWEEN` seco, porque aqui ele é opcional (D-014/B-5) —, `RESPONSAVEL` por subconsulta `ORDER BY R.ORDEM, R.ID LIMIT 1`, `PRIORIDADE` por `JSON_UNQUOTE(JSON_EXTRACT(C.VALORES_JSON, '$.prioridade'))` (D-011), `DIAS_NA_FASE` por `FASE_DESDE` e o agrupamento por `CASE '{{campoAgrupar}}'` sobre domínio fechado (R-059: nenhum SQL montado na tela) → `backend/add-012-indicadores.mjs`
- [ ] **T-014** — As três escritas `sgcEscRelatorioInserir` (7950), `sgcEscRelatorioAtualizar` (7951) e `sgcEscRelatorioExcluir` (7952): uma instrução cada, `:VAR_USER` + guarda de persona (`admin`, `analista`, `gestor`) + `<dono>` nas duas últimas, `INSERT … SELECT … FROM DUAL WHERE TRIM('{{titulo}}') <> ''` → `backend/add-012-indicadores.mjs`
- [ ] **T-015** — **Pedir ao integrador**: `add-012-indicadores.mjs` no `PUBLISH_ORDER`, depois do `add-011` da 008 → `backend/simulator/config.mjs`

## Simulador

- [ ] **T-020** — **Pedir ao integrador**: a reescrita `JSON_UNQUOTE(JSON_EXTRACT(a, b))` → `json_extract(a, b)` no dialeto (D-011) → `backend/simulator/mysql-dialect.mjs`
- [ ] **T-021** — **Entrega da 008 / da BASE**: `backend/sql/situacao-solicitacao.sql` (R-070), uma expressão `CASE` escalar devolvendo `SITUACAO` sobre o contrato de aliases **fixado pela R-075** — `S` solicitação, `C` card, `SF` fase, `I` item —, e `backend/lib/fragmentos.mjs` exportando `fragmento(nome)` (R-074). A 009 **compõe** o arquivo, nunca o reescreve nem inventa alias (RN-010) → `backend/sql/situacao-solicitacao.sql`, `backend/lib/fragmentos.mjs`
- [ ] **T-022** — Seed `009-indicadores.mjs`, **só `SGC_RELATORIO`**: os quatro relatórios da tabela do plan (dois compartilhados, um privado da `ana`, um "antigo" do `admin` com `CONFIG_JSON` sem `visao` e com chave desconhecida) e o `export const RELATORIOS_009` com os quatro ids, para o smoke recortar (R-045). **Nenhum** card, pedido, NF, agendamento, item de B.O. ou solicitação (R-062) → `backend/simulator/seed/009-indicadores.mjs`
- [ ] **T-023** — **Pedir ao integrador**: registrar `seed009` em `backend/simulator/seed.mjs` e acrescentar a seção 009 do `CHECK_INPUT` com **só as cinco chaves novas** (`fase`, `soVencidos`, `campoAgrupar`, `responsavelId`, `prioridade`) — nenhuma chave repetida e nenhum valor de chave existente alterado (D-17) → `backend/simulator/seed.mjs`, `backend/simulator/config.mjs`

## Frontend

- [ ] **T-030** `[P]` — **Pedir à base (S2)**: as chaves `verAnalises`, `verRelatorios` (não zeram com `READ_ONLY`) e `salvarRelatorio` (admin, gestor, analista; zera com `READ_ONLY`) em `lib/permissoes.ts`, mais os dois itens do grupo **Gestão** no `MENU` (R-061, R-063) → `frontend/src/lib/permissoes.ts`
- [ ] **T-031** `[P]` — `lib/sla.ts`: tipos dos sete/cinco/cinco estados, `diasDaEtapa`, `classificarEtapa`, `slaDoPedido`, `notaDoPedido` (o espelho declarado da SQL, sobre `lib/dias-uteis.ts`), `rotulo*`/`tom*`, `percentualDaMeta`, `rotuloConsumo`, `faixaDoScore`, `COLUNAS_CSV_SLA`, `linhasCsvSla` → `frontend/src/lib/sla.ts`
- [ ] **T-032** `[P]` — `lib/analises.ts`: `listarPeriodos`, `periodoCorrente`, `periodoRange`, `intervaloPadrao`, `filialDoRecorte`, `resultadosDosBlocos`, `serieSimples`, `serieComparativa`, `FunilRow`, `serieDoFunil` e `resumoSolicitacoes` — as duas últimas lendo as **duas** dimensões do funil (`STATUS` para a decisão, `SITUACAO` para o atendimento), porque `pendentes`/`recusadas` não saem da situação (B-3) → `frontend/src/lib/analises.ts`
- [ ] **T-033** `[P]` — `lib/relatorio.ts`: `COLUNAS`, `CAMPOS_AGRUPAVEIS`, `MEDIDAS`, `configPadrao`, `lerConfig` (tolerante), `escreverConfig`, `filtrosDaConfig`, `podeEditar`, `serieDoAgregado`, `colunasCsvRelatorio`, `linhasCsvRelatorio` → `frontend/src/lib/relatorio.ts`
- [ ] **T-034** — Bloco 79xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (7901–7917 e 7950–7952), no formato rígido do arquivo → `frontend/src/lib/server-functions.ts`
- [ ] **T-035** — `AnalisesPage`: porteiro `verAnalises` (bloco de `SegurancaPage`/`NotasFiscaisPage`, A-8), abas por `?aba=`, filtro de filial no cabeçalho a partir de `sgcWintFiliais`, período por aba → `frontend/src/pages/analises/AnalisesPage.tsx`
- [ ] **T-036** — `IndicadoresTab`: os cinco blocos num `Promise.allSettled` por `resultadosDosBlocos`, quatro `Kpi` na `GradeKpi` (os outros dois números no `hint` dos painéis), `PainelGrafico` com `AlternaVisao` e tabela alternativa em todos, `DatePicker` no intervalo livre → `frontend/src/pages/analises/IndicadoresTab.tsx`
- [ ] **T-037** `[P]` — `ComprasVendasTab`: seletor de mês/trimestre de `listarPeriodos`, filial assumida por `filialDoRecorte` com o aviso no subtítulo (RN-012), gráfico comparativo + tabela com a coluna de licitação → `frontend/src/pages/analises/ComprasVendasTab.tsx`
- [ ] **T-038** — `PedidosSlaTab`: KPIs, lista paginada com as três etapas em `Status` + barra de consumo, filtros `fase`/`soVencidos`/busca, pedido expandido desenhando as etapas por `classificarEtapa` (D-010) e a linha do tempo por `sgcSlaPedidoFases`, painel de perfil por fornecedor → `frontend/src/pages/analises/PedidosSlaTab.tsx`
- [ ] **T-039** `[P]` — `SolicitacoesTab`: funil, as duas aderências e o tempo médio por `resumoSolicitacoes`, ranking por vendedor em tabela, gráfico do funil com alternativa em tabela → `frontend/src/pages/analises/SolicitacoesTab.tsx`
- [ ] **T-040** — `RelatoriosPage`: porteiro `verRelatorios`, galeria (`sgcRelatoriosListar`) com `PODE_EDITAR` desabilitando (nunca escondendo) editar/excluir, construtor de filtros/colunas/agrupamento/gráfico, tabela paginada, `AlternaVisao`, exportar por `textoCsv`/`baixarCsv` → `frontend/src/pages/relatorios/RelatoriosPage.tsx`
- [ ] **T-041** — `relatorio-dialogos.tsx`: salvar, editar (título, descrição, compartilhado) e excluir, cada um seguido da **releitura** da galeria (D-03) e com erro em `Alert`, nunca toast → `frontend/src/pages/relatorios/relatorio-dialogos.tsx`
- [ ] **T-042** — **Pedir ao integrador**: rotas `/analises` e `/relatorios` no `App.tsx` e o grupo **Gestão** no `AdminLayout` (o ícone; os itens já vêm do `MENU` de `permissoes.ts`) → `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx`

## Testes

Cada id da seção **Testes** do `plan.md` aparece abaixo; os que têm evidência nas duas
camadas aparecem em duas tasks, marcadas *(parte servidor)* e *(parte tela)*.

- [ ] **T-080** — `teste('C-001 …')` e `teste('C-003 …')` em `backend/simulator/smoke/009-indicadores.mjs`: os sete números de `sgcIndResumo` conferidos contra sete contagens feitas no próprio teste; `sgcIndPedidosPorFase` com 10 linhas e soma igual à contagem; filial `1` × `2` com números diferentes e coerentes (R-045: nenhum literal absoluto)
- [ ] **T-081** — `teste('C-006 …')` e `teste('RN-012 …')`: `sgcWintComprasVsVendas` da filial `1` devolve **contagem > 0** com quantidades > 0 e as colunas de licitação; com `codfilial: ''`, zero linhas
- [ ] **T-082** — `teste('C-007 …')`, `teste('C-008 …')`, `teste('C-009 …')` e `teste('C-011 …')` (parte servidor): o teste arranja os marcos num pedido existente (e desfaz no fim) e lê `DIAS_*`, `STATUS_*`, `SLA_STATUS` e `SLA_SCORE` de `sgcSlaPedidosListar` — 1/1 `ok`, 3/1 `estourou`, 7/5 `vencida` + `atrasado_fornecedor`, 5/5 `atencao`, notas 75 e 90
- [ ] **T-083** — `teste('C-010 …')`, `teste('RN-004 …')` e `teste('RN-001 …')` (parte servidor): fornecedor sem prazo de entrega → `sem_meta` fora da nota — o arranjo é `UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 0 WHERE CODFORNEC = 1042` feito e desfeito **dentro do próprio `teste()`**, porque os três fornecedores do seed 001 têm prazo (7/10/5) e a R-017 proíbe mexer nele (C-10); sem SLA cadastrado → metas 1 e 5; pedido concluído sem nota mede o Faturamento até a conclusão e o número não muda quando `hoje` avança
- [ ] **T-084** — `teste('C-012 …')` e `teste('RN-007 …')`: o pedido cancelado do seed 002 não aparece na listagem, nos KPIs, no total nem no perfil por fornecedor
- [ ] **T-085** — `teste('C-013 …')`: `sgcSlaPedidosKpis.TOTAL` = `sgcSlaPedidosListarTotal` sem filtro, e `ATRASADOS_COMPRAS + ATRASADOS_FORNECEDOR` = total com `soVencidos`, em dois períodos diferentes
- [ ] **T-086** — `teste('C-014 …')` e `teste('RN-008 …')` (parte servidor): pedido ligado a agendamento 4 dias antes do envio → `enviada_com_atraso` e 4; data igual → `no_planejado` e 0; sem agendamento → `sem_agenda` e `NULL`
- [ ] **T-087** — `teste('C-015 …')` e `teste('C-027 …')`: a linha do tempo de um card com N passagens devolve N linhas na ordem, só a última sem saída; `sgcIndLeadTime` com `SUM(PASSAGENS)` igual à contagem de `KB_MOVIMENTO` do recorte, contada no teste
- [ ] **T-088** — `teste('C-017 …')` e `teste('RN-010 …')`: o ranking devolve uma linha por vendedor do período (contado no teste), sem coluna de valor; o funil vem em **duas dimensões** (`STATUS` × `SITUACAO`), sua soma bate com a contagem de `SGC_SOLICITACAO` do período e, **situação a situação e status a status**, com `sgcSolicitacoesListar` da 008 — inclusive o caso em que pendente, recusada e cancelada caem todas em `sem_pedido` (B-3)
- [ ] **T-089** — `teste('C-018 …')`, `teste('C-019 …')`, `teste('C-020 …')` e `teste('RN-013 …')`: criar devolve o relatório na galeria com o `CONFIG_JSON` idêntico; alterar/excluir o alheio não muda nada e o próprio (ou como admin) muda; o privado não aparece para o colega; título vazio não grava — tudo recortado por `RELATORIOS_009`
- [ ] **T-090** — `teste('C-021 …')`, `teste('C-022 …')` e `teste('RN-014 …')`: consulta com **todos** os filtros desligados (inclusive o par `dataInicio`/`dataFim` em branco) devolvendo o **mesmo** total que a contagem de pedidos feita no próprio teste — não reduz, não zera (B-5); cada filtro isolado reduz; a 2ª página não repete `ID_CARD`; `sgcRelatorioAgregar` por fase e por fornecedor com `SUM(QTD)` igual ao total; os quatro blocos top-N respeitam `limite`
- [ ] **T-091** — `teste('C-025 …')` (parte servidor), `teste('C-026 …')` e `teste('RN-015 …')`: gravar como `dora` e como `leo` não cria relatório; `sgcIndResumo` e `sgcSlaPedidosListar` como usuário `RESTRICTED` contam só os pedidos dele; `sgcIndPerfilFornecedor` com uma linha por fornecedor do período e `PERC_NO_PRAZO` entre 0 e 100
- [ ] **T-092** — `teste('RN-003 …')` e `teste('RN-016 …')`: um `SELECT` com o fragmento de dias úteis entre `2026-08-24` e `2026-09-14` devolve 15; e, para **cada** linha de `sgcSlaPedidosListar`, `classificarEtapa`/`notaDoPedido` de `frontend/src/lib/sla.ts` (importado direto pelo smoke) reproduzem os três estados e o `SLA_SCORE` do servidor
- [ ] **T-093** `[P]` — `test('C-007 …')`, `test('C-008 …')`, `test('C-009 …')`, `test('C-010 …')`, `test('C-011 …')`, `test('RN-001 …')`, `test('RN-002 …')`, `test('RN-005 …')` e `test('RN-006 …')` em `frontend/tests/sla.test.mjs`: a régua pura nos dois sentidos, os sete rótulos e os quatro tons, a precedência do SLA e a nota (75, 90, 0, sem divisão por zero)
- [ ] **T-094** `[P]` — `test('RN-003 …')` e `test('RN-008 …')` (parte tela) em `frontend/tests/sla.test.mjs`: dias úteis (24/08 + 15 = 14/09, sex→seg 1, seg→sáb 4, mesmo dia 0) e as cinco situações de agenda, com 0 dias no envio antecipado
- [ ] **T-095** `[P]` — `test('C-002 …')`, `test('C-004 …')`, `test('C-005 …')`, `test('C-016 …')`, `test('C-024 …')`, `test('RN-009 …')` e `test('RN-011 …')` em `frontend/tests/analises.test.mjs`: blocos em `allSettled` (ok/vazio/erro), períodos derivados em duas datas, filial assumida com aviso, resumo do funil a partir das **duas** dimensões (8 atendidas, 4 esperando avaliação e 2 recusadas lidas da decisão, 6 em fluxo lidas da situação → 40,0 e 57,1; vazio → `null`), séries iguais às da tabela alternativa e intervalo padrão de 90 dias
- [ ] **T-096** `[P]` — `test('C-018 …')` (parte tela), `test('C-022 …')` (parte tela) e `test('C-023 …')` em `frontend/tests/relatorio.test.mjs`: `lerConfig` tolerante (chave desconhecida descartada, `visao` no padrão), `serieDoAgregado` por medida, e cabeçalho/linhas do CSV na ordem das colunas escolhidas
- [ ] **T-097** `[P]` — `test('C-025 …')` (parte tela) em `frontend/tests/permissoes.test.mjs` (**arquivo da 002**): `verAnalises`, `verRelatorios` e `salvarRelatorio` por persona, comercial falso nas três, diretoria sem a terceira, `READ_ONLY` zerando só a terceira

## Verificação

- [ ] **T-098** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); as 17 SQL de leitura executam e a consulta Oracle não volta com 0 linha
- [ ] **T-099** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos (nenhum arquivo acima de 800 linhas)
- [ ] **T-100** — Verificação manual no simulador: C-001 (as três alturas do painel), C-002 (um bloco com erro ao lado dos demais), C-024 (o par Gráfico/Tabela em cada painel e a legenda a partir de duas séries), C-019/C-025 (botões desabilitados com o motivo), C-022 (o construtor: colunas, agrupamento, medida e tipo de gráfico)
- [ ] **T-101** — Tema claro e tema escuro sem cor quebrada nas duas telas; cor de série só de `--data-*` e nenhum estado sinalizado só por cor

## Dependências

```
T-001 · T-002 → T-003 → T-004 → T-005 · T-006 · T-007 · T-008 · T-009 · T-010 · T-012 · T-013 · T-014
T-021 → T-011
T-003 → T-015 ·  T-013 → T-020
T-022 → T-023
T-030 · T-031 · T-032 · T-033 · T-034 [P] independentes do backend
T-034 + T-035 → T-036 · T-037 · T-038 · T-039 ·  T-034 + T-033 → T-040 → T-041 → T-042
T-031 → T-038 (o expandido consome classificarEtapa)
T-005..T-014 + T-022 → T-080 … T-092
T-031 · T-032 · T-033 · T-030 → T-093 … T-097
tudo → T-098 · T-099 → T-100 · T-101
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001, C-003 | T-007, T-036 | T-080 |
| RF-002 / C-002 | T-032, T-036 | T-095 |
| RF-003 / C-002 | T-032, T-036 | T-095 |
| RF-004 / C-003 | T-004, T-035 | T-080 |
| RF-005 / C-004, RN-011 | T-032, T-037 | T-095 |
| RF-006 / C-005, C-006, RN-012 | T-010, T-032, T-037 | T-081, T-095 |
| RF-007 / C-007, C-008, RN-001, RN-003, RN-004 | T-004, T-005, T-031 | T-082, T-083, T-092, T-093, T-094 |
| RF-008 / C-009, C-010, RN-002 | T-004, T-031 | T-082, T-083, T-093 |
| RF-009 / C-008, RN-005 | T-004, T-031 | T-082, T-093 |
| RF-010 / C-011, RN-006 | T-004, T-031 | T-082, T-093 |
| RF-011 / C-012, RN-007 | T-004 | T-084 |
| RF-012 / C-013 | T-004, T-005 | T-085 |
| RF-013 / C-014, RN-008 | T-004, T-008, T-031 | T-086, T-094 |
| RF-014 / C-015 | T-006, T-038 | T-087 |
| RF-015 / C-016, RN-009, RN-010 | T-011, T-021, T-032, T-039 | T-088, T-095 |
| RF-016 / C-017 | T-011, T-039 | T-088 |
| RF-017 / C-018, C-020 | T-012, T-014, T-022, T-033, T-040, T-041 | T-089, T-096 |
| RF-018 / C-019, RN-013 | T-012, T-014, T-040 | T-089 |
| RF-019 / C-021, RN-014 | T-013, T-040 | T-090 |
| RF-020 / C-022 | T-013, T-033, T-040 | T-090, T-096 |
| RF-021 / C-023 | T-033, T-040 | T-096 |
| RF-022 / C-024 | T-002, T-032, T-036, T-037, T-039, T-040 | T-095 |
| RF-023 / C-025 | T-030, T-014, T-035, T-040 | T-091, T-097 |
| RF-024 / C-025, RN-015 | T-004, T-013 | T-091 |
| RF-025 / C-026, C-027 | T-008, T-009, T-036, T-038 | T-087, T-091 |
| RNF-001 | T-036, T-038, T-039, T-040 | T-100 |
| RNF-002 | T-005, T-013 | T-085, T-090 |
| RNF-003 | T-004..T-013 | T-098 |
| RNF-004 / RN-016 | T-031, T-038 | T-092 |
| RNF-005 | T-013, T-033 | T-090 |
| RNF-006 | T-002, T-036..T-040 | T-101 |
