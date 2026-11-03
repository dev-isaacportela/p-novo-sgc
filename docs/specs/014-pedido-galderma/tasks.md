# Tasks: Pedido Galderma

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`. `[P]` = paralelizável.
>
> As perguntas P-01..P-14 da spec têm padrão provisório; trocar qualquer uma é uma
> task nova aqui, não uma mudança silenciosa.

## Backend

- [x] **T-001** — bloco `DDL_014` com as sete `SGC_GALD_*` → `backend/setup-backend.mjs` (só escrever; nunca rodar daqui)
- [x] **T-002** — `backend/venda-valida.mjs`, byte a byte o da `feature/003-analise-legado` (`PUBLICO`, `VENDA_VALIDA`)
- [x] **T-003** — `backend/add-016-galderma.mjs`: `WINTHOR`, `guarda`, `OPERAR`, as 15 leituras (8401–8415) e as 18 escritas (8450–8467) do plan, `definitions`, `isEntrypoint()` com `jdbcIdWinthor` para as `sgcWint*`
- [x] **T-004** `[P]` — bloco 84xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` → `frontend/src/lib/server-functions.ts`
- [x] **T-005** — `add-016-galderma.mjs` no `PUBLISH_ORDER` e as chaves novas do `CHECK_INPUT` → `backend/simulator/config.mjs`

## Simulador e seed

- [x] **T-010** — `backend/simulator/seed/014-galderma.mjs` (fornecedor 1541, produtos 5801–5806, filiais 1/2/6, posição, movimentos 2026-05..2026-09, custo padrão e caixa, negociações de 2026-08 convertida e 2026-09 aberta) e o registro `seed014` em `seed.mjs`
- [x] **T-011** — `npm run sim:check` verde com as leituras novas

## Regra pura

- [x] **T-020** — `frontend/src/lib/galderma.ts`: períodos, linha da filial, grupo, semáforo, caixa, valores (RN-001..RN-006)
- [x] **T-021** — mesa: `montarMesa`, `montarPedidosPorFilial`, `itemDoPedidoGalderma`, cabeçalho padrão e validação, `listaDeCodigos`
- [x] **T-022** — planilha: `parsearPlanilha`, `numeroDaPlanilha`, `textoDoModelo`; CSV e extrato
- [x] **T-023** — acompanhamento e composição: `juntarAcompanhamento`, meta, semáforo, totais, série, divergência de estoque, `montarComposicao`, `valorizarEstoque`
- [x] **T-024** — `verGalderma`/`operarGalderma` em `permissoes.ts` e o item de menu

## Telas

- [x] **T-030** — `pages/galderma/abas.tsx` (navegação entre as três telas, porteiro)
- [x] **T-031** — `PedidoGaldermaPage.tsx` + `mesa.tsx` + `dialogos.tsx`: lista, cabeçalho, KPIs, valores, tabela do grupo e da filial, simulação e confirmação, item, importação, modelo, histórico, extrato, CSV, gerar pedidos
- [x] **T-032** — `AcompanhamentoGaldermaPage.tsx`: filtros, KPIs, gráficos (valor em cada marca), tabela com blocos, lançamento e histórico do sell-out
- [x] **T-033** — `ComposicaoGaldermaPage.tsx`: filtros, barras de sell-in e vendas com valor e participação, estoque a custo padrão
- [x] **T-034** — rotas em `App.tsx`; ícone em `AdminLayout.tsx`

## Testes

- [x] **T-080** — `frontend/tests/galderma.test.mjs`: um `test()` por C-0NN/RN-0NN de regra de tela da tabela do plan
- [x] **T-081** — `backend/simulator/smoke/014-galderma.mjs` e o registro em `smoke.mjs`: um `teste()` por C-0NN/RN-0NN de regra de negócio
- [x] **T-082** — `backend/simulator/smoke/014-galderma-winthor.mjs`: as seis `sgcWint*Gald*` no WinThor real com contagem > 0
- [x] **T-083** — `frontend/tests/permissoes.test.mjs`: C-031 e o menu com "Pedido Galderma"

## Verificação

- [x] **T-090** — `npm test` nos dois lados, `npm run build` e `npm run lint`
- [x] **T-091** — simulador na porta 3113 (2026-11-03: mesa, geração de 3 pedidos, acompanhamento e composição com WinThor real e Gestão de Custos 60574) com `SIMULATOR_WINTHOR=oracle` e `SIMULATOR_GESTAO_CUSTOS=mitra`; front na 5183; as três telas nos dois temas, com screenshots
- [x] **T-092** — `000` e índice das specs atualizados; spec/plan/tasks marcados
