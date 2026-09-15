# Tasks: Produtos em B.O. — itens indisponíveis, previsão de liberação e impacto no cliente

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir ao integrador** = arquivo compartilhado; esta feature não o edita.
> **pedir à base (S2)** = arquivo que a base da onda 2 monta antes do fan-out.

## Backend

- [ ] **T-001** — **Pedir à base (S2)** (C-4/G-11: a base cria TODAS as tabelas e colunas da onda 2 antes do fan-out): `SGC_BO_ITEM`, `SGC_BO_PREVISAO` e `SGC_BO_DOCUMENTO` (com `ENDERECO VARCHAR(700)`, R-040) no `setup-backend.mjs`, com as colunas, os `UNIQUE KEY` (`UK_SGC_BO_ITEM (ID_CARD, CODPROD)`) e os índices (`IX_SGC_BO_ITEM_CARD (ID_CARD, STATUS)`, `IX_SGC_BO_PREVISAO_CARD`, `IX_SGC_BO_DOCUMENTO_CARD`) da seção *Modelo de dados* do plan; e as colunas `DT_PREVISAO_BO VARCHAR(10)` e `ALERTA_BO_EM VARCHAR(10)` **dentro do `CREATE TABLE` de `SGC_PEDIDO`** (a onda 2 edita o `CREATE`, sem `ALTER` — R-026) → `backend/setup-backend.mjs`
- [ ] **T-002** — Criar `add-010-bo.mjs` com o esqueleto padrão (`definitions` exportado, `isEntrypoint()` resolvendo o `jdbcId` do WinThor por nome com `jdbcIdWinthor`, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`, marcador `__SGC_IDS__`), a guarda de persona da 002 copiada literalmente (`guarda`/`guardaInterna`, R-013) e o preâmbulo JS (`desembrulhar`, `linhasDe`, `consultar`, `chamar`, `lote`, `texto`, `inteiro`, `numero`, `agora`, `persona`) portado de `add-006-itens.mjs` → `backend/add-010-bo.mjs`
- [ ] **T-003** — `sgcWintClientesImpactados` (SQL Oracle, 7706): `PCMOV` com `CODOPER = 'S'`, `QT > 0`, `DTMOV >= TRUNC(SYSDATE) - {{dias}}`, `IN ({{codprods}})`, `COUNT(DISTINCT CODCLI)` e `SUM` — D-003 do plan → `backend/add-010-bo.mjs`
- [ ] **T-004** `[P]` — As três leituras de card (7701 `sgcBoItensCard`, 7702 `sgcBoPrevisoesCard`, 7703 `sgcBoDocumentosCard`), cada uma numa **constante exportada** do módulo, porque o `sgcBoCarregar` as reusa (D-001) → `backend/add-010-bo.mjs`
- [ ] **T-005** `[P]` — `sgcBoPainel` (7704) e `sgcBoPainelTotal` (7705): uma linha por produto em B.O., filtros `busca`/`situacao`/`status`/`hoje` (com a constante `HOJE = COALESCE(NULLIF('{{hoje}}', ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d'))` da 006 — G-6: `hoje` desligado não pode virar "tudo no prazo"), `SITUACAO_PREVISAO`, `CARTA_FALTA_ENDERECO`, ordenação "sem previsão primeiro, depois previsão crescente", `LIMIT/OFFSET`; sem filtro por fase (D-006) → `backend/add-010-bo.mjs`
- [ ] **T-006** — Escritas internas: `sgcEscBoItemInserir` (7750, upsert em lote `SELECT … UNION ALL` dentro de derivada, com o `WHERE <guardaInterna>`), `sgcEscBoItemResolver` (7751), `sgcEscItemStatusBo` (7752) e `sgcEscPedidoAlertaBo` (7756) — todas com a mesma guarda sobre `{{usuarioId}}` (A1) → `backend/add-010-bo.mjs`
- [ ] **T-007** `[P]` — Escritas de tela (`:VAR_USER` + guarda `admin`/`analista`/`gestor`): `sgcEscBoPrevisaoInserir` (7753), `sgcEscPedidoPrevisaoBo` (7754, que **sempre** zera `ALERTA_BO_EM`) e `sgcEscBoDocumentoInserir` (7755, com `{{endereco}}` — R-040, o mesmo nome de coluna da 001); os dois `INSERT … SELECT … WHERE` levam `FROM DUAL` (A6) → `backend/add-010-bo.mjs`
- [ ] **T-008** — `sgcBoCarregar` (7707, JAVASCRIPT): três `runQueryMitra` com os textos exportados de T-004 mais a linha de capa, devolvendo `{ ok, itens, previsoes, documentos, resumo }` numa execução (RNF-001) → `backend/add-010-bo.mjs`
- [ ] **T-009** — `sgcBoMarcar` (7708, JAVASCRIPT): persona por `runQueryMitra` com `:VAR_USER` → `pedidoEmBo(cardId, usuarioId)` (fase `faturamento`/`bo` + `RESTRICTED` só o próprio) → validação de `qtPendente` contra `SGC_PEDIDO_ITEM` (recusa a chamada inteira, sem gravar) → uma `sgcWintClientesImpactados` fatiada em 500 → `sgcEscBoItemInserir` em lotes de 200 → `sgcEscItemStatusBo`; e o ramo de liberação (`sgcEscBoItemResolver` + `sgcEscItemStatusBo` `'enviado'`). Máximo 4 execuções aninhadas (RNF-002) → `backend/add-010-bo.mjs`
- [ ] **T-010** — `sgcBoMonitorar` (7709, JAVASCRIPT, `cronExpression '0 5 11 * * *'`): dia em Brasília, lote de 30, e por card `sgcEscAvisoInserir` (SF da 005, por id, `tipo: 'bo_previsao'`, `chave: 'bo_previsao:<idCard>:<hoje>'`, `paraUsuarioId: 0`, `paraPersona: ''`) → `kbNotaRegistrar` em `try/catch` (D-07) → `sgcEscPedidoAlertaBo`; erro de um card vai para `erros[]` e não interrompe o laço (RNF-004). O texto do aviso é a cópia literal de `textoAvisoBo` (T-030) → `backend/add-010-bo.mjs`
- [ ] **T-011** `[P]` — `backend/sql/pendencias-bo-entrada.sql`: a coluna `PENDENCIAS_BO_ENTRADA` e, no cabeçalho, os dois ramos prontos do `CASE` de `sqlPodeMover` e o texto `boEntrada` para `M` → `backend/sql/pendencias-bo-entrada.sql`
- [ ] **T-012** `[P]` — `backend/sql/pendencias-conclusao-bo.sql`: as colunas `PENDENCIAS_BO_ABERTOS` e `PENDENCIAS_BO_MOTIVO` (com `WHEN COUNT(*) = 0 THEN ''` e o plural certo) e os ramos para `faturamento>concluido` e `bo>concluido` — o de `MOTIVO` **com a própria condição** (`… AND T.PENDENCIAS_BO_ABERTOS > 0 THEN T.PENDENCIAS_BO_MOTIVO`, R-044), encadeado **depois** do bloco de NF da 005 → `backend/sql/pendencias-conclusao-bo.sql`
- [ ] **T-013** — **Pedir ao integrador**: colar os dois fragmentos em `contextoDoCard()`, os quatro ramos em `sqlPodeMover()` (dois de `PODE` e dois de `MOTIVO`, cada um com a sua condição — R-044), o de conclusão depois do da NF da 005 e o texto `boEntrada` em `M` → `backend/add-005-quadro-compras.mjs`
- [ ] **T-014** — **Pedir ao integrador**: `add-010-bo.mjs` no `PUBLISH_ORDER`, depois do `add-008` (005) e do `add-009` (006) → `backend/simulator/config.mjs`

## Simulador

- [ ] **T-020** — Seed `007-bo.mjs`, **só INSERT**: 2 produtos do fornecedor 1042 (`5201`, `5202`) em `PCPRODUT`/`PCEST`, 5 clientes (`PCCLIENT` 9101–9105), as vendas `CODOPER = 'S'` com data relativa e `NUMTRANSITEM` a partir de 900001 (5201 → 4 clientes / 70 un; 5202 → 2 clientes / 10 un; controles em hoje−61 e uma entrada `'E'`), e os 4 cards (`faturamento`, `bo`, `boLimpo`, `boSemPrevisao`), todos com `DT_ENVIO` vazio e sem `SGC_NF` (R-045: o banco do smoke é um só e pedido com envio entraria nos faturamentos pendentes da 005), com itens, `SGC_BO_ITEM`, `SGC_BO_PREVISAO`, `SGC_BO_DOCUMENTO` e as colunas `DT_PREVISAO_BO`/`ALERTA_BO_EM`, exportando `CARDS_007`. Nenhum fornecedor, filial, persona ou nota fiscal: são da 001, da 002, da 005 e da 006 (R-017/R-027) → `backend/simulator/seed/007-bo.mjs`
- [ ] **T-021** — **Pedir ao integrador**: `CHECK_INPUT` com `dias: '60'` e `status: ''` (seção 007) → `backend/simulator/config.mjs`
- [ ] **T-022** — Conferir que os shims do dialeto usados por esta spec (`NVL`, `TRUNC`, `SYSDATE - N`, `CONCAT`, `COUNT(DISTINCT …)`, `ON DUPLICATE KEY UPDATE`) já existem; o que faltar, **pedir ao integrador** → `backend/simulator/mysql-dialect.mjs`

## Frontend

- [ ] **T-030** `[P]` — `lib/bo.ts`: `situacaoDaPrevisao`, `rotuloSituacaoPrevisao`, `validarMarcacaoBo`, `textoAvisoBo`, `resumoBo`, mais o **reexport** de `MOTIVOS.boEntrada` de `transicoes.ts` (G-8: um dono só para a frase). Sem `motivoConclusaoBo`: a frase da conclusão tem contagem e, com R-046, não tem espelho de tela → `frontend/src/lib/bo.ts`
- [ ] **T-031** — Bloco 77xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (7701–7709 e 7750–7756), no formato rígido do arquivo → `frontend/src/lib/server-functions.ts`
- [ ] **T-032** — **Pedir à base (S2)**: `verBo` (todas as personas, **não** zerada por `READ_ONLY`) e `operarBo` (admin, analista, gestor, zerada por `READ_ONLY`) em `Permissoes`/`MATRIZ`/`permissoesDe`, e o item de menu `{ grupo: 'Compras', to: '/bo', label: 'Produtos em B.O.', exige: 'verBo' }` → `frontend/src/lib/permissoes.ts`
- [ ] **T-033** — **Pedir ao integrador**: o texto `boEntrada` em `MOTIVOS`, com o mesmo caractere do `M` do `add-005` → `frontend/src/lib/transicoes.ts`
- [ ] **T-034** — `AbaBo`: os três blocos (itens em B.O., previsões, documentos) a partir de **uma** chamada de `sgcBoCarregar`; tabela do design (§9.1) com `Code`, `RowTitle`, `RowMeta`, `numeric`, `Dash` e `Status` para a situação do item e da previsão; controles desabilitados com o motivo no `title` sem `operarBo` (§9.4) → `frontend/src/pages/quadros/abas/Bo.tsx`
- [ ] **T-035** — `MarcarItensDialogo` (lê os itens do pedido do `usePedido()` da 003, sem SF extra; valida por `validarMarcacaoBo` antes de chamar `sgcBoMarcar`), `PrevisaoDialogo` (`DatePicker` do projeto, nunca controle nativo; grava por `sgcEscBoPrevisaoInserir` + `sgcEscPedidoPrevisaoBo`) e `DocumentoBoDialogo` (`uploadFilePublicMitra` + `sgcEscBoDocumentoInserir`, com o `Alert tone="info"` de endereço público antes da escolha do arquivo) → `frontend/src/pages/quadros/abas/bo-dialogos.tsx`
- [ ] **T-036** — `AbaBo`: ação "Liberar" por linha (`sgcBoMarcar` com `status: 'liberado'`) e "Mover para Produtos em B.O." por `ctx.mover(faseId)` quando há item em aberto; `ctx.recarregar()` depois de cada gravação → `frontend/src/pages/quadros/abas/Bo.tsx`
- [ ] **T-038** — **Pedir ao integrador**: ligar a aba no `/quadro` em `abasExtras`, **sem `contagem`** (R-049) e **sem `antesDeMover` nem `podeMover` novos** (R-046: os pares da onda 2 são recusados só pelo gancho, e a lib mostra a frase na faixa de aviso) → `frontend/src/pages/quadros/QuadroPage.tsx`
- [ ] **T-039** `[P]` — `BoPainelPage`: `PageHeader` + `Panel` com `Toolbar` colada à tabela (`SearchInput`, `SelectMenu` de situação da previsão e de situação do item, `FilterChip`), tabela do §9.1, `Status` com ponto **e** texto, link da carta de falta, `Pagination` sobre `sgcBoPainel`/`sgcBoPainelTotal`, `EmptyState`; sem recorte por persona (D-012) → `frontend/src/pages/bo/BoPainelPage.tsx`
- [ ] **T-040** — **Pedir ao integrador**: rota `/bo` (visível a todas as personas) → `frontend/src/App.tsx`

## Testes

Cada id da seção **Testes** do `plan.md` aparece em exatamente uma task abaixo.

- [ ] **T-080** — `teste('C-002 …')` e `teste('RN-002 …')` em `backend/simulator/smoke/007-bo.mjs`: `sgcWintClientesImpactados` devolve 2 linhas (contagem > 0), 5201 com 4 clientes e 70 un, 5202 com 2 e 10; a venda de hoje−61 e a entrada `'E'` ficam de fora
- [ ] **T-081** — `teste('C-001 …')`, `teste('C-016 …')` e `teste('C-017 …')`: marcar 2 de 4 itens devolve `{ marcados: 2, abertos: 2 }` com a foto de impacto gravada e 2 itens do pedido em `bo`; remarcar o 5201 com 25 deixa 1 registro com 25; marcar no card em `analise` recusa citando a fase sem gravar
- [ ] **T-082** — `teste('C-015 …')`: `sgcBoMarcar` como `leo`, como `dora`, com `READ_ONLY` e com `RESTRICTED` de card alheio recusa e não grava; como `gil` grava
- [ ] **T-083** — `teste('C-003 …')`, `teste('C-008 …')`, `teste('C-009 …')`, `teste('RN-003 …')`, `teste('RN-008 …')` e `teste('RN-012 …')`: os ramos novos de `sgcPodeMover` — entrada sem item marcado recusa com `MOTIVOS.boEntrada` e libera depois de marcar; concluir com 2 abertos recusa com a frase e a contagem (nunca `MOTIVO` vazio, R-044), de `faturamento` e de `bo`, e a frase vira singular com 1 e plural com 3 (RN-008); `bo>faturamento` livre; `enviado>bo` recusa por transição inexistente; cancelar não passa por nenhuma exigência de B.O.
- [ ] **T-084** — `teste('C-004 …')`, `teste('C-005 …')` e `teste('RN-004 …')`: registrar previsão grava o histórico e a vigente; registrar de novo zera `ALERTA_BO_EM` e o cron seguinte não avisa o card
- [ ] **T-085** — `teste('C-006 …')`: anexar documento `carta_falta` aparece na releitura com nome, endereço, autor e data; tipo fora da lista vira `outro`
- [ ] **T-086** — `teste('C-007 …')`: liberar 1 de 2 deixa `abertos: 1`, o registro `liberado` com quem e quando, e o item do pedido de volta em `enviado`
- [ ] **T-087** — `teste('C-010 …')` e `teste('C-011 …')`: o cron avisa 1 card (aviso com a chave do dia, `PARA_USUARIO_ID = 0`, "2 itens" no texto, `ALERTA_BO_EM` = hoje e nota no card), a segunda rodada avisa 0 sem duplicar o aviso, e os cards com previsão futura, sem previsão e fora da fase não são avisados
- [ ] **T-088** — `teste('C-012 …')` e `teste('C-013 …')` (parte servidor), **sem total literal** (R-045): com `limite: 200` e recorte por `ID_CARD IN CARDS_007` no próprio teste, 3 linhas em aberto com a do card sem previsão primeiro, 2 com `situacao: 'vencida'`, 4 com `status: ''`, `CARTA_FALTA_ENDERECO` e `VL_PENDENTE` corretos; `sgcBoPainelTotal` comparado com um `SELECT COUNT(*)` feito no teste; e o painel como `leo` igual ao painel como `gil`
- [ ] **T-089** `[P]` — `test('RN-005 …')`, `test('RN-006 …')` e `test('RN-001 …')` em `frontend/tests/bo.test.mjs`: `situacaoDaPrevisao` nos quatro casos; `textoAvisoBo` com 2 itens, com 1 item e com previsão de hoje; `validarMarcacaoBo` com 0, com 120 sobre 100, com produto fora do pedido e com 40. (RN-008 foi para o smoke, em T-083 — R-046 tirou o espelho de tela)
- [ ] **T-090** `[P]` — `test('C-014 …')` e `test('C-013 …')` (parte tela) em `frontend/tests/bo.test.mjs`: `permissoesDe` para diretoria, gestor, gestor `READ_ONLY` e comercial; `menuParaPersona` do comercial devolve exatamente 1 item, `/bo`

## Verificação

- [ ] **T-095** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); a consulta Oracle desta spec com contagem > 0; nenhum `INSERT … SELECT … WHERE` sem `FROM DUAL`
- [ ] **T-096** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos (nenhum arquivo acima de 800 linhas)
- [ ] **T-097** — Verificação manual no simulador: C-012 (painel com a situação por ponto **e** texto, clientes impactados alinhados à direita), C-013 (o comercial com um item de menu só, sem link morto), C-014 (controles desabilitados com o motivo no `title`), C-006 (aviso de endereço público antes da escolha do arquivo)
- [ ] **T-098** — Tema claro e tema escuro sem cor quebrada na aba B.O., nos três diálogos e no painel `/bo`

## Dependências

```
T-001 → T-002 → T-003 · T-004 · T-005 · T-006 · T-007
T-004 → T-008 ·  T-006 → T-009 · T-010 ·  T-011 · T-012 [P] → T-013
T-002 … T-010 → T-014
T-001 → T-020 → T-021 → T-022
T-030 · T-031 [P] independentes do backend
T-031 + T-032 → T-034 → T-035 → T-036 → T-038
T-030 + T-031 + T-032 → T-039 → T-040 ·  T-011 → T-033
T-020 + T-003…T-010 → T-080 … T-088
T-030 + T-032 → T-089 · T-090
tudo → T-095 · T-096 → T-097 · T-098
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001, C-016 | T-006, T-009, T-034, T-035 | T-081 |
| RF-002 / RN-001 | T-009, T-030, T-035 | T-081, T-089 |
| RF-003 / C-002, RN-002 | T-003, T-009, T-020 | T-080 |
| RF-004 / C-017 | T-009 | T-081 |
| RF-005 / C-003, RN-003 | T-011, T-013, T-030, T-033 | T-083 |
| RF-006 / C-004, RN-004 | T-007, T-035 | T-084 |
| RF-007 / C-005 | T-007, T-035 | T-084 |
| RF-008, RF-009 / C-010, RN-006 | T-006, T-010, T-030 | T-087, T-089 |
| RF-010 / C-011 | T-010 | T-087 |
| RF-011 / C-006, RN-011 | T-004, T-007, T-035 | T-085 |
| RF-012 / C-007, RN-007 | T-006, T-009, T-036 | T-086 |
| RF-013 / C-008, RN-008 | T-012, T-013 | T-083 |
| RF-014 / C-009 | T-012, T-013 | T-083 |
| RF-015, RF-016 / C-012, RN-010 | T-005, T-020, T-039 | T-088 |
| RF-017 / C-012 | T-005, T-039 | T-088 |
| RF-018 / C-013 | T-032, T-039, T-040 | T-088, T-090 |
| RF-019 / C-014, RN-009 | T-032, T-034 | T-090, T-082 |
| RF-020 / C-015 | T-006, T-007, T-009 | T-082 |
| RF-021 / RN-012 | T-012, T-013 | T-083 |
| RF-022 / RN-005 | T-005, T-030, T-039 | T-088, T-089 |
| RNF-001 | T-008, T-034 | T-088 |
| RNF-002, RNF-003 | T-003, T-006, T-009 | T-081 |
| RNF-004 | T-010 | T-087 |
| RNF-005 | T-005, T-039 | T-088 |
| RNF-006 | T-003 | T-080, T-095 |
