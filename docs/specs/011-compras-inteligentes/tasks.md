# Tasks: Compras inteligentes — o que comprar hoje, por fornecedor e filial

**Plan:** `plan.md` · **Data:** 2026-09-16

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir à base (S2)** = arquivo que a base da onda 4 monta antes do fan-out.

## Backend

- [x] **T-001** — **Pedir à base (S2)**: `SGC_PARAMETRO_COMPRA` e `SGC_VENDA_DESCONSIDERADA` no `setup-backend.mjs`, com as colunas, os `UNIQUE KEY` (`UK_SGC_PARAMETRO_COMPRA (CODFORNEC, CODFILIAL, CODPROD)`, `UK_SGC_VENDA_DESCONSIDERADA (NUMTRANSITEM)`) e os índices (`IX_SGC_PARAMETRO_COMPRA_FORN (CODFORNEC, CODFILIAL)`, `IX_SGC_VENDA_DESCONSIDERADA_PROD (CODFILIAL, CODPROD)`) da seção *Modelo de dados* do plan. `SGC_PEDIDO.ORIGEM` **não muda de tipo**: só o comentário ganha o valor `compras_inteligentes` (R-091/R-098) → `backend/setup-backend.mjs`
- [x] **T-002** — Criar `add-013-compras-inteligentes.mjs` com o esqueleto padrão do projeto (`definitions` exportado, `isEntrypoint()` resolvendo o `jdbcId` do WinThor por nome com `jdbcIdWinthor`, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`, `guarda(personas)` copiada literal de `add-006-itens.mjs:50-62`) → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-003** — `sgcWintRessuprimento` (SQL Oracle, 8101): a consulta completa do plan — `PRODUTOS_BASE` com estoque líquido e trânsito (R-085), `RESSUPRIMENTO_PRODUTO` com `TRUNC(M.DTMOV - O.DTEMISSAO)` e janela de 12 meses, `DIAS` com o gerador de calendário, `VENDAS_DIA` com `{{excluir}}`, `M.QT > 0` e a coluna pública segregada (R-084/R-087), `DEMANDA_DIA` com o peso `POWER(0.85, DIAS_ATE_FIM)` e `METRICAS` com os dois consumos e a volatilidade por `AVG`/`SQRT`. **Sem `LIMIT/OFFSET`** (D-006) → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-004** `[P]` — `sgcWintProdutoHistorico` (8102), `sgcWintProdutoUltimasCompras` (8103) e `sgcWintProdutoEstoqueFiliais` (8104) — as três do detalhe do SKU, com `ROWNUM` literal dentro da subconsulta ordenada → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-005** `[P]` — `sgcWintProdutoVendas` (8105): as vendas da janela com `NUMTRANSITEM`, maiores primeiro, teto 50 → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-006** `[P]` — `sgcParametrosCompraListar` (8106) e `sgcVendasDesconsideradasListar` (8107), as duas paginadas → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-007** `[P]` — `sgcPedidoAbertoDoFornecedor` (8108): `SGC_PEDIDO` × `KB_CARD` × `SGC_FASE` nas fases `analise`, `tecnica`, `diretoria` e `envio`, fase sempre por `CHAVE` → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-008** `[P]` — `sgcEficienciaComprador` (8109): a faixa de ±20 % sobre `QT_SUGERIDA`, recortada por `ORIGEM = 'compras_inteligentes'`, comprador, fornecedor e período → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-009** — Escritas de parâmetro: `sgcEscParametroCompraSalvar` (8150), `sgcEscParametroCompraSilenciar` (8151) e `sgcEscParametroCompraRestaurar` (8152) — uma instrução por SF, todas com `:VAR_USER` + guarda `admin`/`gestor`; os dois upserts tocam **colunas disjuntas** (D-014) e todo `INSERT … SELECT … WHERE` leva `FROM DUAL` → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-010** `[P]` — Escritas de venda: `sgcEscVendaDesconsiderar` (8153, idempotente por `NUMTRANSITEM`, motivo obrigatório) e `sgcEscVendaReconsiderar` (8154), as duas com `:VAR_USER` + guarda `admin`/`analista`/`gestor` → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-011** — Conferir que **nenhuma** definição desta spec é `JAVASCRIPT` e que nenhuma tem `cron` (contrato da onda 4, R-081) → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-012** — **Pedir à base (S2)**: `add-013-compras-inteligentes.mjs` no `PUBLISH_ORDER`, depois do `add-012` (009) e antes do `add-014` (012); `add-002` continua por último e fora dele (R-081) → `backend/simulator/config.mjs`
- [x] **T-013** — **Pedir à base (S2)** (R-106): `sgcEscPedidoCriar` (7250) passa a receber `{{origem}}` com lista fechada, no lugar do literal `'manual'` de `add-005-quadro-compras.mjs:396`. São **três pontos no mesmo commit** — parâmetro ausente vira string vazia no runtime do simulador, e a SQL sozinha derruba a suíte 002 inteira:

  1. a SQL (`add-005-quadro-compras.mjs:390-400`), duas linhas:

     ```sql
     SELECT {{cardId}}, {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}',
       '{{periodoInicio}}', '{{periodoFim}}', '{{origem}}', 0, :VAR_USER, '{{agora}}', '{{agora}}'
     FROM DUAL
     WHERE TRIM('{{fornecedor}}') <> '' AND TRIM('{{filial}}') <> ''
       AND '{{origem}}' IN ('manual', 'compras_inteligentes')
       AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO EX WHERE EX.ID_CARD = {{cardId}})
       AND <guardaPersona('admin', 'analista', 'gestor')>
     ```

  2. a tela (`frontend/src/pages/pedidos/NovoPedidoPage.tsx:128`), uma chave a mais no `input` do `sgcEscPedidoCriar`: `origem: 'manual'`;
  3. o smoke da 002 (`backend/simulator/smoke/002-quadro.mjs`), o mesmo `origem: 'manual'` no `input` do helper `criarPedido()` — é ele que prova que a lista fechada não fechou a porta do caminho antigo.

  → `backend/add-005-quadro-compras.mjs`, `frontend/src/pages/pedidos/NovoPedidoPage.tsx`, `backend/simulator/smoke/002-quadro.mjs`
- [x] **T-014** — **Pedir à base (S2)** (R-110): `curvaAbc()` de `frontend/src/lib/compras.ts` passa a aceitar o recorte que ela realmente lê, para a 011 reusar a régua única de R-088 sem duplicar o tipo da 003 (`MedidaRessuprimento` não tem `ESTOQUE`/`TRANSITO`/`VENDA_LICITACAO`, e `tsc -b` recusaria):

  ```ts
  export function curvaAbc(
    linhas: Pick<LinhaAnalise, 'CODPROD' | 'VENDA_PERIODO' | 'CUSTO_ULT_ENTRADA'>[],
  ): Map<number, CurvaAbc>
  ```

  Só a assinatura muda; o corpo e todos os chamadores atuais continuam válidos (alargamento de tipo) → `frontend/src/lib/compras.ts`
- [x] **T-015** — **Pedir à base (S2)** (R-107): registrar o seed e a suíte da 011 com **stub vazio**, como a onda 3 fez — suíte não registrada é `npm test` verde sem a feature:

  ```js
  // backend/simulator/seed.mjs, ao lado de seed007/008/009
  import { seed011 } from './seed/011-compras-inteligentes.mjs';
  // …
  seed011(db);

  // backend/simulator/smoke.mjs, junto dos outros imports de suíte
  import { suite as comprasInteligentes } from './smoke/011-compras-inteligentes.mjs';
  // …
  await indicadores(ctx);
  await comprasInteligentes(ctx);
  ```

  Os dois arquivos nascem com o esqueleto vazio (`export function seed011() {}`, `export async function suite() {}`); T-023 e T-080..T-088 os preenchem → `backend/simulator/seed.mjs`, `backend/simulator/smoke.mjs`

## Simulador

- [x] **T-020** — **Pedir à base (S2)**: `QTBLOQUEADA`, `QTINDENIZ` e `QTRESERV` (`DECIMAL(15,3)`) no `CREATE TABLE IF NOT EXISTS PCEST` (R-096). Nenhuma tabela nova → `backend/simulator/schema-winthor.mjs`
- [x] **T-021** — **Pedir à base (S2)**: os shims de dialeto da seção *Dialeto* do plan — escalares `POWER`, `SQRT` e `ADD_MONTHS` em `registerMysqlFunctions` (`mysql-dialect.mjs:171-172`), e a reescrita `reescreverCalendarioOracle` + `fimDoBlocoForaDeAspas` + `comDataDoNivel`. Dentro de `toSqlite()` (`:422-428`) a nova reescrita entra como **elo mais externo** da cadeia que a onda 3 já montou, **sem tirar nenhuma** (R-113): `reescreverCalendarioOracle(reescreverGeradorConnectBy(reescreverUpsert(reescreverJsonUnquote(reescreverDateAddComExpressao(String(sql))))))`, e o `mapOutsideStrings` roda sobre esse resultado. O código completo está no plan; `INSTR` e `STDDEV_POP` de R-096 **não** entram (D-005) → `backend/simulator/mysql-dialect.mjs`
- [x] **T-022** — **Pedir à base (S2)**: um `teste()` do gerador de calendário no smoke do dialeto, nas **duas** formas, as duas com 153 linhas, primeira linha `DIA` = `dataInicio` e `DIAS_ATE_FIM` 152, última `DIA` = `dataFim` e `DIAS_ATE_FIM` 0:
  - dentro de `WITH DIAS AS ( … )` **precedido de duas outras CTEs** com `SELECT` próprio — é o caso que pega a regex gulosa (o casamento não pode começar num `SELECT` anterior e atravessar as CTEs até o `FROM DUAL`);
  - **solto**, sem parêntese envolvente, terminando em `;` — é o caso que prova que o fim da instrução conta como fim do bloco (sem isso o `CONNECT BY` cru chegaria ao SQLite, já sem o `FROM DUAL`).

  → `backend/simulator/smoke/000-dialeto.mjs`
- [x] **T-023** — Seed `011-compras-inteligentes.mjs`, **só INSERT**: 20 produtos 5401–5420 do fornecedor **1042** (5419 inativo, 5420 do departamento 4), `PCEST` da filial 1 com as parcelas de estoque de RN-002 e das filiais 2 e 3 para o 5403, `PCESTTRANSITO` do 5404, vendas com `NUMTRANSITEM` ≥ 960001 (inclusive as três linhas da janela de 2 dias de C-008, a venda de 60 de C-013, a venda pública de RN-011 e a **devolução do 5410 com `QT = -5`** dentro da janela), clientes 9301–9305, `PCPEDIDO` `NUMPED` ≥ 970001 com `PRAZO1 = 0` e as entradas casadas do lead medido, duas linhas de `SGC_PARAMETRO_COMPRA` e os dois cards próprios (`CARDS_011`). Fornecedores, filiais e personas vêm dos seeds 001 e 002 (R-017) → `backend/simulator/seed/011-compras-inteligentes.mjs`
- [x] **T-024** — **Pedir à base (S2)**: `CHECK_INPUT` ganha a seção 011 com **só** as chaves novas — `diasPeriodo: '153'`, `excluir: '0'`, `meses: '12'`, `compradorId: '0'`, `numtransitem: '960001'` (D-17: nenhuma repetida, nenhum valor existente alterado). É base, e não integrador: sem a chave o `sim:check` da própria base já falha ao varrer o `add-013` → `backend/simulator/config.mjs`

## Frontend

- [x] **T-030** `[P]` — `lib/ressuprimento.ts`: constantes, `resolverParametros`, `estaSilenciado`, `dataDeSilencio`, `calcularRessuprimento`, `motivoDaSugestao`, `coberturaFuturaComCompra`, `aderenteASugestao`, `montarRessuprimento`, `aComprar`, `agruparCarrinho`, `COLUNAS_CSV` e `linhaCsv`, com as assinaturas da seção *Regra pura* do plan. Reusa `curvaAbc`/`arredondarPorCaixa`/`unidadesPorCaixa` da 003 (nenhuma régua reimplementada) e **não importa `lib/cobertura.ts`** (R-111): o alvo por curva chega por injeção, no parâmetro `alvoDaCurvaDias: (alvo, curva) => number` → `frontend/src/lib/ressuprimento.ts`
- [x] **T-031** `[P]` — Bloco 81xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (8101–8109 e 8150–8154), no formato rígido do arquivo → `frontend/src/lib/server-functions.ts`
- [x] **T-032** — **Pedir à base (S2)**: `verComprasInteligentes` (admin, analista, gestor, diretoria; **não** zerada por `READ_ONLY`, como `verCoberturas`), `operarComprasInteligentes` (admin, analista, gestor; zerada) e `parametrizarCompras` (admin, gestor; zerada) em `Permissoes`/`MATRIZ`/`permissoesDe`, mais o item de menu `{ grupo: 'Compras', to: '/compras-inteligentes', label: 'Compras inteligentes', exige: 'verComprasInteligentes' }` **depois** de "Novo pedido" (R-095) → `frontend/src/lib/permissoes.ts`
- [x] **T-033** — `ComprasInteligentesPage`: porteiro de rota por `sessao.permissoes.verComprasInteligentes` (substitui o stub de T-037), seleção de fornecedor e filial (`sgcFornecedorListar` + `sgcFornecedorCarregar`, o mesmo caminho de `/pedidos/novo`), `api.boardCarregar({ slug: 'compras' })` **uma vez** na carga da página (é o `boardId` que o carrinho usa, C-1), carga em paralelo dos parâmetros, das vendas desconsideradas, das coberturas e do pedido aberto, **uma** chamada de `sgcWintRessuprimento` com `diasPeriodo` 153 e `excluir`, e os KPIs em `GradeKpi` com quatro `Kpi` (`page.tsx:1026-1066`) → `frontend/src/pages/compras-inteligentes/ComprasInteligentesPage.tsx`
- [x] **T-034** — `grid.tsx`: abas `Tabs` (A comprar · Todos com `SelectMenu` de situação · Em trânsito), grid do design (§9.1) com `Code`/`RowTitle`/`RowMeta`/`numeric`/`Dash`/`Status`/`Badge`, seletor "desconsiderar licitação" em `CheckRow`, edição da sugestão com arredondamento por caixa, ordenação e paginação **locais** (RNF-005) e exportação por `textoCsv`/`baixarCsv`. Arquivo próprio para a página não estourar o `max-lines` de 800 → `frontend/src/pages/compras-inteligentes/grid.tsx`
- [x] **T-035** — `dialogos.tsx`: `DetalheSku` (3 consultas, uma execução cada, só ao abrir), `ParametrosDialogo` (fornecedor e SKU, `0` = herda no `title`), `SilenciarDialogo` (`DatePicker` do projeto pré-carregado com hoje + 30 e motivo obrigatório) e `VendasDialogo` (`sgcWintProdutoVendas` + desconsiderar/reconsiderar, **relendo `sgcVendasDesconsideradasListar` depois de gravar** e remontando `{{excluir}}` do que voltou — D-03) → `frontend/src/pages/compras-inteligentes/dialogos.tsx`
- [x] **T-036** — `Carrinho.tsx`: agrupamento por `agruparCarrinho`, coluna "Por que comprar" por `motivoDaSugestao`, cobertura futura por `coberturaFuturaComCompra`, bloqueio por pedido aberto com `Alert` citando título e fase, e "Criar pedido" = `api.cardCriar` (`boardId` vindo da página, `valor_total` nos valores) → `sgcEscPedidoCriar` (`origem: 'compras_inteligentes'`) → `sgcItensGravar`, **três execuções por grupo**. Cada item vai como o `ItemPedido` **inteiro** de `lib/compras.ts` (R-112), com `coberturaDias` já calculada com a quantidade do carrinho e `coberturaLimite` resolvido — campo que nascer zerado fica zerado para sempre (RN-017) → `frontend/src/pages/compras-inteligentes/Carrinho.tsx`
- [x] **T-037** — **Pedir à base (S2)**: rota `/compras-inteligentes` em `App.tsx` apontando para uma **página-stub** com porteiro, no padrão do commit `99e87a5` (`SolicitacoesPage.tsx`): comentário `STUB DA BASE (S2)`, `usePersona()`, `Alert tone="error"` para quem não tem `verComprasInteligentes` e `EmptyState title="Em construção — spec 011"` para quem tem. T-033 troca o corpo, não a rota → `frontend/src/App.tsx`, `frontend/src/pages/compras-inteligentes/ComprasInteligentesPage.tsx`
- [x] **T-038** — Na página, injetar o alvo por curva em `montarRessuprimento`: `alvoDaCurvaDias: (alvo, curva) => limiteDeCobertura(coberturas, alvo, curva).alvoDias` (R-089/R-111) — **uma linha**, e a única que conhece a 012. Enquanto a 012 não integrar, `() => 35` → `frontend/src/pages/compras-inteligentes/ComprasInteligentesPage.tsx`

## Testes

Cada id da seção **Testes** do `plan.md` aparece em exatamente uma task abaixo.

- [x] **T-080** — `teste('C-001 …')` e `teste('RN-014 …')` em `backend/simulator/smoke/011-compras-inteligentes.mjs`: `sgcWintRessuprimento` do 1042 na filial 1 devolve contagem > 0 e exatamente 18 dos `CODPROD` 5401–5420; nenhuma linha com `CODEPTO` 4 ou 7; 5419 e 5420 ausentes; e o `VENDA_PERIODO` do **5410** soma **só as vendas positivas** — a devolução de `QT = -5` do seed não desconta nada
- [x] **T-081** — `teste('C-008 …')` e `teste('RN-001 …')`: com `dataInicio` = ontem, `dataFim` = hoje e `diasPeriodo` 2, os produtos 5405/5406/5407 devolvem `VENDA_PERIODO` 20 e `CONSUMO_DIARIO` 10 / 9,1892 / 10,8108, com `VOLATILIDADE_DIARIA` 0 / 10 / 10
- [x] **T-082** — `teste('RN-002 …')` e `teste('C-009 …')` (parte servidor): 5401 → total 100 e disponível 80; 5402 → disponível 0; 5404 → trânsito 10; `LEAD_TIME_MEDIDO` 5 no 5403, 1 no 5416 e 0 no 5410
- [x] **T-083** — `teste('C-013 …')`, `teste('RN-012 …')` e `teste('RN-011 …')` (parte servidor): 5408 com `excluir: '0'` → venda 90; `sgcEscVendaDesconsiderar` grava, **`sgcVendasDesconsideradasListar` (`codprod: 0`) devolve o `NUMTRANSITEM`** e a consulta com ele em `excluir` → venda 30 com consumo menor, sem a venda em nenhuma coluna; `sgcEscVendaReconsiderar` grava e a mesma listagem volta **sem** o `NUMTRANSITEM`, devolvendo os 90 (é a releitura que a tela faz — escrita guardada recusada devolve 0 linhas e nenhum erro, D-03); 5409 devolve `VENDA_PERIODO` 18 com `VENDA_PUBLICA` 6 e `CONSUMO_DIARIO_PUBLICO` entre zero e `CONSUMO_DIARIO`
- [x] **T-084** — `teste('C-012 …')` (parte servidor) e `teste('C-023 …')` (parte servidor): `sgcEscParametroCompraSilenciar` como `gil` grava `SILENCIADO_ATE` e o motivo e `sgcParametrosCompraListar` os devolve; como `ana` e como `leo` não grava nada; `sgcEscParametroCompraRestaurar` limpa; `sgcEscParametroCompraSalvar` grava os três números sem apagar o silenciamento
- [x] **T-085** — `teste('C-021 …')`: `sgcWintProdutoHistorico`, `sgcWintProdutoUltimasCompras` e `sgcWintProdutoEstoqueFiliais` do 5403 devolvem contagem > 0, com ≤ 12 meses, ≥ 1 compra e ≥ 2 filiais
- [x] **T-086** — `teste('C-018 …')`, `teste('C-020 …')` e `teste('RN-017 …')`: com um contador de execuções em volta do transporte, `api.boardCarregar` **uma vez** e depois `kbCardCriar` + `sgcEscPedidoCriar` (`origem: 'compras_inteligentes'`) + `sgcItensGravar` — **3 execuções por grupo**, nenhuma releitura de quadro no meio (RNF-002, C-1). Os 3 itens gravados deixam 1 card em `analise`, `SGC_PEDIDO.ORIGEM` certa, período igual à janela, prioridade `alta` nos valores do card, `VL_TOTAL` igual à soma, e cada item com `QT_PEDIDA`/`QT_SUGERIDA`/`PRECO_CUSTO`/`CURVA_ABC`, **`DESCRICAO <> ''` e `COBERTURA_LIMITE > 0`** (R-112). Em seguida, gravar em lote **só os produtos novos** (o que a aba Itens da 003 manda ao montar a análise, `Itens.tsx:107-109`) e reler: o 5403 continua com `QT_PEDIDA` 24 e os campos do carrinho intactos; os novos entram com 0
- [x] **T-087** — `teste('C-019 …')` e `teste('RN-016 …')`: `sgcPedidoAbertoDoFornecedor` devolve 1 linha com `TITULO` e `FASE_CHAVE` para a filial 1 (card em `analise`) e 0 para a filial 2 (card em `enviado`); movendo o card para `tecnica`, continua devolvendo 1
- [x] **T-088** — `teste('C-022 …')` (parte servidor): `sgcEficienciaComprador` recortada por `codfornec: 1042` e pelo comprador devolve `ITENS` 5, `ADERENTES` 3 e `PERC_ADERENCIA` 60,0 — sem literal absoluto sobre listagem global (R-045)
- [x] **T-089** `[P]` — `test('C-002 …')` a `test('C-007 …')` e `test('C-025 …')` em `frontend/tests/ressuprimento.test.mjs`: as linhas 1 a 7 da tabela de casos numéricos, campo a campo. O `alvoDaCurvaDias` dos testes é um *stub* de três linhas (`{ A: 20, B: 35, C: 50 }`), sem nenhum import da 012 (R-111)
- [x] **T-090** `[P]` — `test('C-009 …')` (parte tela), `test('C-010 …')`, `test('C-011 …')`, `test('C-016 …')`, `test('RN-003 …')`, `test('RN-004 …')` e `test('RN-005 …')`: as linhas 8 a 14 da tabela e as quatro combinações de cada eixo de precedência
- [x] **T-091** `[P]` — `test('C-014 …')`, `test('RN-011 …')` (parte tela), `test('RN-006 …')`, `test('RN-007 …')`, `test('RN-008 …')` e `test('RN-009 …')`: as linhas 15 a 19 da tabela e a ordem de avaliação do status
- [x] **T-092** `[P]` — `test('C-015 …')`, `test('RN-010 …')`, `test('C-017 …')`, `test('RN-018 …')` e `test('C-022 …')` (parte tela): curva 500/250/150/70/30, lista vazia e custo zero, arredondamento por caixa (50 → 60, 48 → 48, 0 → 0) e a faixa de ±20 % nos seis pares
- [x] **T-093** `[P]` — `test('C-012 …')` (parte tela), `test('RN-013 …')`, `test('RN-015 …')` e `test('C-024 …')`: silenciamento, agrupamento do carrinho com prioridade, o `ItemPedido` completo de cada item do grupo (R-112) e as colunas do CSV
- [x] **T-094** `[P]` — `test('C-023 …')` (parte tela) e `test('RN-019 …')` em `frontend/tests/permissoes.test.mjs`: as três chaves novas, persona a persona e nível a nível, e o item de menu

## Verificação

- [x] **T-095** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); nenhuma consulta Oracle com 0 linha
- [x] **T-096** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-097** — Verificação manual no simulador: C-001 (lista grande rolando), C-002..C-006 (situação com ponto e texto), C-012 (silenciado marcado na aba "todos"), C-018 (o pedido criado abre no quadro com os itens dentro), C-023 (controles desabilitados com motivo para quem só lê)
- [ ] **T-098** — Tema claro e tema escuro sem cor quebrada na tela e nos quatro diálogos

> T-097 e T-098 continuam abertas: a S3 não sobe servidor (o smoke roda em banco
> descartável). Ficam para quem abrir o simulador na integração.

## Layout legado — Opção A (R-117, 2026-10-30)

- [x] **T-040** — `sgcWintResumoFornecedores` (8110) e `sgcItensEmPedidoAberto` (8111) em `add-013`; `CODFAB` e `CUSTO_ATUAL` em `sgcWintRessuprimento`; `WINTHOR` ganha o resumo → `backend/add-013-compras-inteligentes.mjs`
- [x] **T-041** — `CUSTOFIN` em `PCEST` do simulador; seed 011 com `CODFAB` e custos atuais (5401, 5403); `codfornecs` no `CHECK_INPUT` → `backend/simulator/schema-winthor.mjs`, `seed/011-compras-inteligentes.mjs`, `config.mjs`
- [x] **T-042** — Mapa 8110/8111 em `SERVER_FUNCTION_NAMES`/`SERVER_FUNCTIONS` → `frontend/src/lib/server-functions.ts`
- [x] **T-043** `[P]` — Visões, completar compra, ordem, movimentação, nível, referência e `FiltrosLista` → `frontend/src/lib/ressuprimento.ts`
- [x] **T-044** `[P]` — `lib/ressuprimento-detalhe.ts` (série, rodapé, filiais com excesso, simulação, `DadosDoSku`) → novo
- [x] **T-045** `[P]` — `lib/carrinho.ts` (persistência, resumo, mínimo, variação, economia, busca, arquivo WinThor) e `baixarTexto` em `lib/csv.ts` → novo / `lib/csv.ts`
- [x] **T-046** — §8.8 do `page.tsx` (`CardVisao`, `GradeVisoes`, `ChipContagem`, `Disclosure`, `AlternaOpcoes`) e reexport de `ComposedChart`/`LabelList` → `frontend/src/components/page.tsx`
- [x] **T-047** — `grid.tsx` → `ListaProdutos` com chips, linha selecionável e botão do carrinho
- [x] **T-048** — `grafico.tsx` → `GraficoComprasVendas` com `LabelList` em toda marca (R-116)
- [x] **T-049** — `painel-detalhe.tsx` → `PainelDetalhe` (KPIs, gráfico, seis seções)
- [x] **T-050** — `Carrinho.tsx` → `CarrinhoDialogo` (cabeçalho, busca, mínimo por grupo, colunas do legado, descartar com confirmação, arquivo WinThor, criar N pedidos)
- [x] **T-051** — `ComprasInteligentesPage.tsx` reescrita (ações do cabeçalho, barra de recorte, aviso de carrinho salvo, cards, duas colunas, cache do SKU, `localStorage`)
- [x] **T-052** — R-116 nos gráficos existentes: `LabelList` em `pages/analises/blocos.tsx` → `frontend/src/pages/analises/blocos.tsx`
- [x] **T-099** — Testes: `tests/ressuprimento.test.mjs` (C-026, C-027, RN-020, C-038, C-031, C-037), `tests/ressuprimento-detalhe.test.mjs` (C-032, C-033, C-034, RN-025), `tests/carrinho.test.mjs` (C-028, C-029, C-030, C-039, RN-021..RN-023, RN-027), `smoke/011` (C-035, C-036, C-039)
- [x] **T-100** — `npm test` verde nos dois lados; `npm run build` e `npm run lint` limpos
- [x] **T-101** — Verificação manual no simulador (VPS, WinThor real, Coloplast × filial 1): cards de visão, seleção e painel compacto, gráfico com rótulos, carrinho com mínimo, variação e arquivo, retomada do carrinho salvo — nos dois temas
- [x] **T-102** — *(R-120)* `sgcCustoUnidadesPorCaixa` uma vez por carga (lotes de 1000) → `Map` de `montarRessuprimento`; `origemCaixa` na linha (`origemUnidadesPorCaixa` em `lib/compras.ts`) e no painel; simulador roda a INTEGRATION (`gestao-custos.mjs`: SQLite por padrão, plataforma com `SIMULATOR_GESTAO_CUSTOS=mitra`); testes em `tests/compras.test.mjs`, `tests/ressuprimento.test.mjs` e `smoke/000-gestao-custos.mjs`; checagem ao vivo `npm run sim:gestao-custos` → `frontend/src/pages/compras-inteligentes/ComprasInteligentesPage.tsx`, `lib/compras.ts`, `lib/ressuprimento.ts`, `backend/simulator/gestao-custos.mjs`
- [x] **T-103** — *(R-122)* curvas de faturamento e de rentabilidade e a pior das duas: `FATURAMENTO_PERIODO` e `RENTABILIDADE_PERIODO` em `sgcWintRessuprimento` (PCMOV `PUNIT`/`CUSTOFIN`; `CUSTOFIN` no esquema e no seed do simulador); `curvaPorValor`/`piorCurva` em `lib/compras.ts`, `curvasDoRessuprimento` em `lib/ressuprimento.ts` (`curva` = a pior; `curvaFaturamento`, `curvaRentabilidade`; CSV com 12 colunas); duas colunas na grade com a que vale em destaque e as letras no painel; `test('C-015 …')` reescrito, `test('RN-010 …')`, `test('R-122 …')` e `teste('C-040 …')` → `backend/add-013-compras-inteligentes.mjs`, `frontend/src/lib/compras.ts`, `lib/ressuprimento.ts`, `pages/compras-inteligentes/grid.tsx`
- [x] **T-104** — *(R-123)* a janela "Análise do Produto" (`pages/compras-inteligentes/analise-produto.tsx`) no lugar do detalhe do SKU: a versão expandida do painel sobre o mesmo cache (`dados`), aba Análise e aba Vendas (`VendasDoProduto` em `dialogos.tsx`, reaproveitado pela janela de vendas); `GraficoComprasVendas` com `expandido` (Caixas/Unidades, série Desconsideradas, legenda que esconde, aviso de histórico curto); `MiniCartao`/`GradeMini` em `page.tsx`; `sgcWintProdutoUltimasCompras` com `NUMPED`/`DT_SOLICITACAO`/`DT_PREVISAO` e `sgcWintProdutoVendas` com `CODUSUR`/`VENDEDOR` (PCPEDIDO.DTPREVENT, PCMOV.CODUSUR e PCUSUARI no esquema e no seed); regra pura em `lib/ressuprimento-detalhe.ts`; `teste('C-041 …')`, C-021 estendido e `test('C-042 …')` ×3 → `frontend/src/pages/compras-inteligentes/analise-produto.tsx`, `dialogos.tsx`, `grafico.tsx`, `lib/ressuprimento-detalhe.ts`, `backend/add-013-compras-inteligentes.mjs`
- [x] **T-105** — *(C-012, retorno do usuário)* silenciados visíveis pelo chip: `alternarSilenciados`/`escolherVisao` em `lib/ressuprimento.ts` (o chip leva a lista para "todos" e volta; card desliga; chip inerte com 0) e `BlocoSilenciado` (data, motivo, "Devolver à fila") no painel e na Análise do Produto; `test('C-012 (chip) …')` → `frontend/src/pages/compras-inteligentes/ComprasInteligentesPage.tsx`, `grid.tsx`, `painel-detalhe.tsx`, `analise-produto.tsx`, `lib/ressuprimento.ts`
- [x] **T-106** — *(R-124)* previsão de venda com escolha de modelo: `lib/previsao.ts` (série fechada, cap de outliers, MMS/MMP/SE/Holt/Holt-Winters, métricas, Best Fit, sugestão projetada) e `tests/previsao.test.mjs`; `AnaliseVendaFutura` (`pages/compras-inteligentes/previsao-ui.tsx`) no painel (seção nova) e na Análise do Produto; `GraficoComprasVendas`/`serieComprasVendas`/`totaisDoRodape` com `projecaoMes`; a linha selecionada, o simulador e o carrinho do produto aberto partem da sugestão projetada (`sugestaoProjetada` na grade) → `frontend/src/lib/previsao.ts`, `pages/compras-inteligentes/previsao-ui.tsx`, `painel-detalhe.tsx`, `analise-produto.tsx`, `grid.tsx`, `ComprasInteligentesPage.tsx`
- [x] **T-107** — *(R-125)* oportunidades com custo especial: `sgcCustoEspeciaisProdutos` (INTEGRATION gestao-de-custos) e `sgcWintVendasClientesProdutos` no add-013; adaptador do simulador com o executor SQLite e a emulação REST das políticas (`custosEspeciaisDeRegistros`), tabelas e seed; `lib/custo-especial.ts` e `tests/custo-especial.test.mjs`; `OportunidadeEspecial` (`custo-especial-ui.tsx`) no painel e na Análise do Produto; selo na linha; linha especial do carrinho (`chaveDaEntrada`, `custoDaEntrada`, `itemDoCarrinho` com tipo especial) → `backend/add-013-compras-inteligentes.mjs`, `simulator/gestao-custos.mjs`, `frontend/src/lib/custo-especial.ts`, `pages/compras-inteligentes/custo-especial-ui.tsx`, `Carrinho.tsx`, `ComprasInteligentesPage.tsx`
- [x] **T-108** — *(C-049)* grade própria da visão Em trânsito (Estoque, Em trânsito em destaque com "N dias com o trânsito" ou "Sem consumo", Preço compra, Sugestão só leitura); `coberturaComTransito` e `precoDeCompra` em `lib/ressuprimento.ts` com `test('C-049 …')` → `frontend/src/pages/compras-inteligentes/grid.tsx`, `lib/ressuprimento.ts`
- [x] **T-109** — *(R-126)* `SecaoRecolhivel` no vocabulário (nasce recolhida, resumo de uma linha, cabeçalho-botão com `aria-expanded`, `extra`); as seções da Análise do Produto e a Oportunidade com preço especial (painel e janela) passam a usá-la, recolhendo ao trocar de produto; "Análise de venda futura" em dois blocos com rótulo, números limpos (`numeroPt` em `lib/formato.ts`) e fatos em pílulas; `resumoVendaFutura` em `lib/previsao.ts` com teste; `MiniCartao` ganha `title` e `GradeMini` a coluna única → `frontend/src/components/page.tsx`, `pages/compras-inteligentes/previsao-ui.tsx`, `analise-produto.tsx`, `custo-especial-ui.tsx`, `lib/formato.ts`, `lib/previsao.ts`
- [x] **T-110** — *(R-128)* custo de compra = custo padrão do Gestão de Custos: `sgcCustoPadraoAtual` (INTEGRATION) no add-013, tabela `CUSTOPRODUTO` no esquema e no seed, emulação REST `custoPadraoDeRegistros` e checagem ao vivo; `custoPadraoDe`/`mapaDeCustoPadrao`/`rotuloSemCusto` em `lib/compras.ts`, `carregarCustoPadrao` (lotes de 500); a linha ganha `custo`; lista, Em trânsito, painel, janela, simulação, sugestão em R$, carrinho (total, mínimo, variação, economia, arquivo do WinThor), custo especial e a montagem do pedido (003) usam o custo padrão; testes C-050, G-008, R-128 → `backend/add-013-compras-inteligentes.mjs`, `simulator/gestao-custos.mjs`, `frontend/src/lib/compras.ts`, `lib/ressuprimento.ts`, `lib/custo-padrao-carga.ts`, `pages/compras-inteligentes/*`, `pages/quadros/abas/Itens.tsx`
- [x] **T-111** — *(R-129)* lista e painel com altura fixa e rolagem própria (cabeçalho das colunas fixo, quantidade e ações presas à direita, paginação dentro da rolagem; topo do painel fixo em tela com mais de 760 px, volta ao topo ao trocar de produto); largura do painel em 4 opções com −/+ e Alt+←/→, por usuário no navegador; "Curvas F/R" com o painel largo; cards de visão e margens compactos em tela baixa; teste RN-036 → `frontend/src/lib/largura-painel.ts`, `tests/largura-painel.test.mjs`, `pages/compras-inteligentes/{ComprasInteligentesPage,grid,painel-detalhe,grafico}.tsx`, `components/page.tsx`, `components/AdminLayout.tsx`
- [x] **T-112** — *(R-130)* avisos de excesso e de bloqueio: `sgcWintEstoqueFiliaisProdutos` (lista, lotes de 500, no mesmo Promise.all do custo padrão) e `sgcWintBloqueiosProduto` (SQL do legado, só ao abrir produto com bloqueio) no add-013 e no mapa (8115, 8116); esquema e seed do simulador (PCLOTE com saldo e observações, PCTABDEV, PCEMPR, PCMOVBLOQUEIO, PCBLOQUEIOEST, PCLOTELOG; PCMOV e PCEST com CODDEVOL), shims `REGEXP_LIKE` e `TO_CHAR(numero)`; smokes C-051/C-052 e `npm run sim:winthor` no WinThor real; selos e chips na lista, faixa de alerta com detalhe no painel e na janela (`avisos-ui.tsx`, `use-lotes-bloqueados.ts`), o aviso antigo e a seção "Filiais com excesso" saem; testes RN-037/RN-038 → `backend/add-013-compras-inteligentes.mjs`, `simulator/{schema-winthor,mysql-dialect,winthor-checar}.mjs`, `simulator/seed/011-*.mjs`, `simulator/smoke/011-*.mjs`, `frontend/src/lib/{avisos-produto,avisos-carga}.ts`, `pages/compras-inteligentes/*`, `components/page.tsx` (Alert com ícone)
- [x] **T-113** — *(C-048, decisão do usuário)* a aba "Preço especial" abre a seção "Oportunidade com preço especial" expandida; trocar de produto volta ao padrão; teste em `tests/custo-especial.test.mjs` → `frontend/src/lib/custo-especial.ts` (`secaoEspecialAberta`), `pages/compras-inteligentes/{custo-especial-ui,painel-detalhe,analise-produto}.tsx`

## Dependências

```
base (S2): T-001 · T-012 · T-013 · T-014 · T-015 · T-020 · T-021 · T-022 · T-024 · T-032 · T-037
T-002 → T-003 · T-004 · T-005 · T-006 · T-007 · T-008 · T-009 · T-010 → T-011
T-015 → T-023 → T-080 … T-088   (seed e suíte registrados antes de terem conteúdo)
T-013 → T-086   ·   T-014 → T-030   ·   T-021 + T-022 → T-003 rodar no simulador
T-030 · T-031 [P] independentes do backend · T-032 + T-037 → T-033
T-031 + T-033 → T-034 · T-035 · T-036 → T-038
T-023 + T-003..T-010 → T-080 … T-088
T-030 + T-032 → T-089 … T-094
tudo → T-095 · T-096 → T-097 · T-098
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001 | T-003, T-023, T-033 | T-080 |
| RF-002 / RN-002 | T-003, T-020, T-023 | T-082 |
| RF-003 / RN-014 | T-003, T-023 | T-080 |
| RF-004 / C-008, RN-001 | T-003, T-021, T-022, T-023 | T-081 |
| RF-005 / C-009, RN-003 | T-003, T-023, T-030 | T-082, T-090 |
| RF-006 / C-002..C-006, RN-006, RN-008 | T-030 | T-089, T-091 |
| RF-007 / C-007, C-025, RN-007 | T-030 | T-089, T-091 |
| RF-008 / RN-009 | T-030 | T-089, T-091 |
| RF-009 / C-015, C-040, RN-010 | T-014, T-030, T-103 | T-092, T-103 |
| RF-010 / C-010, C-011, C-016, RN-004, RN-005 | T-006, T-009, T-030 | T-084, T-090 |
| RF-011 / C-012, RN-013 | T-009, T-030, T-035, T-105 | T-084, T-093, T-105 |
| RF-012 / C-013, RN-012 | T-005, T-010, T-035 | T-083 |
| RF-013 / C-014, RN-011 | T-003, T-030, T-034 | T-083, T-091 |
| RF-014 / C-007, C-012 | T-030, T-034 | T-089, T-093 |
| RF-015 | T-030, T-034 | T-090 |
| RF-016 / C-017 | T-030, T-034 | T-092 |
| RF-017 / C-018, RN-015 | T-013, T-030, T-036 | T-086, T-093 |
| RF-018 / C-019, RN-016 | T-007, T-036 | T-087 |
| RF-019 / C-020, RN-017 | T-023, T-036 | T-086 |
| RF-020 / C-021, C-041, C-042 | T-004, T-035, T-104 | T-085, T-104 |
| RF-033 / C-043, C-044, C-045, RN-029, RN-030, RN-031 | T-106 | T-106 |
| RF-034 / C-046, C-047, C-048, RN-032, RN-033, RN-034 | T-107 | T-107 |
| RF-021 / C-049 | T-108 | T-108 |
| RF-021 / C-022, RN-018 | T-008, T-030 | T-088, T-092 |
| RF-022 / C-023, RN-019 | T-009, T-010, T-032, T-033, T-037 | T-084, T-094 |
| RF-023 / C-024 | T-030, T-034 | T-093 |
| RNF-001, RNF-003, RNF-005 | T-033, T-034, T-035 | T-086, T-097 |
| RNF-002 | T-036 | T-086 |
| RNF-004, RNF-006 | T-003, T-023 | T-080, T-095 |
