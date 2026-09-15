# Tasks: Itens do pedido — análise de montagem, alertas e prazo de pagamento

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir ao integrador** = arquivo compartilhado; esta feature não o edita.
>
> Estado em 2026-09-15 (branch `feature/003-itens`): tudo entregue, exceto
> T-040 e T-042 (ligação no `QuadroPage`, rota e menu — arquivos do
> integrador, com os trechos prontos no relatório da feature) e T-092/T-093
> (verificação manual no simulador, que o agente da feature não sobe).
> T-001, T-015, T-020 e T-022 já vieram prontos na base da onda 1 (schema
> `SGC_*`, `PUBLISH_ORDER`, `schema-winthor.mjs`); T-022 e T-023 foram
> preenchidos aqui (seção 003 do `CHECK_INPUT` e shims novos do dialeto,
> isolados num commit `chore(integração)`).

## Backend

- [x] **T-001** — **Pedir ao integrador**: `SGC_PEDIDO_ITEM`, `SGC_ALERTA` e `SGC_COBERTURA` no `setup-backend.mjs`, com as colunas, os `UNIQUE KEY` (`UK_ITEM (ID_CARD, CODPROD)`, `UK_ALERTA (ID_CARD, CHAVE)`, `UK_COBERTURA (NIVEL, CODIGO)`) e os índices da seção *Modelo de dados* do plan → `backend/setup-backend.mjs`
- [x] **T-002** — Criar `add-006-itens.mjs` com o esqueleto padrão (`definitions` exportado, `isEntrypoint()` resolvendo o `jdbcId` do WinThor por nome, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`) → `backend/add-006-itens.mjs`
- [x] **T-003** — `sgcWintAnaliseMontagem` (SQL Oracle, 7301): a consulta completa do plan, com o recorte de produto ativo, departamentos 4 e 7 e licitação por `CODATV1` → `backend/add-006-itens.mjs`
- [x] **T-004** `[P]` — `sgcWintBuscarProduto` (7302) e `sgcWintPrazoPagamento` (7305), as duas com o `ROWNUM` dentro da subconsulta ordenada → `backend/add-006-itens.mjs`
- [x] **T-005** `[P]` — `sgcWintLotesAVencer` (7303) e `sgcWintExcessoOutrasFiliais` (7304), porte fiel de `p-45547/backend/add-alertas-analise.mjs` com `{{diasValidade}}` e `{{diasEstoque}}` parametrizados → `backend/add-006-itens.mjs`
- [x] **T-006** `[P]` — `sgcCustoUnidadesPorCaixa` (7306), tipo `INTEGRATION` sobre a conexão `gestao-de-custos` (`runQuery` em `PRODUTOS.UNIDADES_POR_CAIXA`) → `backend/add-006-itens.mjs`
- [x] **T-007** `[P]` — `sgcCoberturaListar` (7307) → `backend/add-006-itens.mjs`
- [x] **T-008** — `sgcAnaliseSaidaVerificar` (7308): os cinco predicados de RN-012 na ordem da regra, devolvendo `PODE` e `MOTIVO` da primeira condição que falha → `backend/add-006-itens.mjs`
- [x] **T-009** — Escritas de item: `sgcEscItemGravar` (7350, upsert de várias tuplas), `sgcEscItemRemover` (7351), `sgcEscItemRemoverZerados` (7352), `sgcEscItemStatusFase` (7353) — uma instrução por SF; `sgcEscItemRemover` e `sgcEscItemStatusFase` são escritas de **tela** (`:VAR_USER` + guarda: `admin`/`analista`/`gestor` e, no status, também `diretoria`), as outras duas recebem `usuarioId` do JS → `backend/add-006-itens.mjs`
- [x] **T-010** `[P]` — Escritas de alerta: `sgcEscAlertaInserir` (7354), `sgcEscAlertaRemoverObsoletos` (7355), `sgcEscAlertaLer` (7356), `sgcEscAlertaJustificar` (7357) — as duas últimas são de tela, com `:VAR_USER` + guarda `admin`/`analista`/`gestor` → `backend/add-006-itens.mjs`
- [x] **T-011** `[P]` — Escritas de cobertura e de pedido: `sgcEscCoberturaGravar` (7358), `sgcEscCoberturaExcluir` (7359), `sgcEscPedidoPrazo` (7360), `sgcEscPedidoTotal` (7361), com a guarda de persona da 002 copiada literalmente (mapa de `ACCESS_LEVEL` + `<> 'READ_ONLY'`), trocando só a lista de personas → `backend/add-006-itens.mjs`
- [x] **T-012** — `sgcItensGravar` (7309, JAVASCRIPT): persona por `runQueryMitra` com `:VAR_USER`, recusa fora da fase `analise`, `escapar()` do texto, `{{linhas}}` em lotes de 200, chamada das escritas por id com `usuarioId`, total recalculado no retorno → `backend/add-006-itens.mjs`
- [x] **T-013** — `sgcAlertasGerar` (7310, JAVASCRIPT): lê os itens vivos, fatia `codprods` em 500, chama as duas consultas Oracle, monta `CHAVE`/`MENSAGEM`, insere em lote e remove as chaves mortas → `backend/add-006-itens.mjs`
- [x] **T-014** — `sgcAnaliseSair` (7311, JAVASCRIPT): é o passo do `antesDeMover` em `analise → tecnica` — regera alertas → `sgcAnaliseSaidaVerificar` (`PODE = 0` devolve `{ ok: false, erro }` sem gravar nada) → zerados → total → `sgcEscPedidoReprovacoesLimpar` (SF SQL da 002, `{{usuarioId}}`/`{{idCard}}`, sem `:VAR_USER`; persona conferida aqui antes de escrever) → `kbNotaRegistrar` com o resumo de AN-10 A → `backend/add-006-itens.mjs`
- [x] **T-015** — Registrar o `add-006-itens.mjs` no `PUBLISH_ORDER` → **pedir ao integrador** (`backend/config.mjs` ou o índice equivalente)

## Simulador

- [x] **T-020** — **Pedir ao integrador**: as `PC*` em `backend/simulator/schema-winthor.mjs` (união das colunas que a 001 e a 003 usam) com o que esta spec exige — `PCPRODUT.OBS2`, `PCEST.QTVENDMES*`, `PCCLIENT.CODATV1`, `PCLOTE`, `PCESTENDLOTE`, `PCLOTEEND`, `PCPEDIDO.PRAZO1/2/3` — e a tabela `CUSTO_PRODUTOS` → `backend/simulator/schema-winthor.mjs`
- [x] **T-021** — Seed `003-itens.mjs`, **só INSERT**: 20 produtos do fornecedor 1015 (1 inativo, 1 do departamento 4), vendas que produzem os números de C-002 a C-007, clientes públicos, lote a vencer em 60 dias na filial 2 (Benenutri Filial Norte) e o de controle em 120, excesso de 100 dias na mesma filial e o de controle com 79, `PCPEDIDO` do 1015 com 28/35/42, `CUSTO_PRODUTOS`, `SGC_COBERTURA` (departamento 2 = 60, sku 5001 = 20) e os três cards de teste. Fornecedores (1015, 1042, 1088) e filiais (1, 2, 3) vêm do `seed/001-fornecedores.mjs`; `SGC_USUARIO_PERSONA` é do `seed/002-quadro.mjs` — este seed **não** grava nem um nem outro → `backend/simulator/seed/003-itens.mjs`
- [x] **T-022** — **Pedir ao integrador**: `CHECK_INPUT` com `codfornec`, `codfilial`, `dataInicio`, `dataFim`, `codprods`, `codprod`, `diasValidade`, `diasEstoque`, `nivel` → `backend/simulator/config.mjs`
- [x] **T-023** — Conferir os shims do dialeto usados por esta spec (`SYSDATE + N`, `ROUND(data − SYSDATE)`, `CONCAT`); o que faltar, **pedir ao integrador** → `backend/simulator/mysql-dialect.mjs`

## Frontend

- [x] **T-030** `[P]` — `lib/compras.ts`: `mesesDoPeriodo`, `sugestaoDeCompra`, `unidadesPorCaixa`, `arredondarPorCaixa`, `curvaAbc`, `coberturaFuturaDias`, `totalDoPedido`, `montarItens` — portadas de `p-45547/.../compras.ts` → `frontend/src/lib/compras.ts`
- [x] **T-031** `[P]` — `lib/cobertura.ts`: `LIMITE_COBERTURA_PADRAO_DIAS`, `limiteDeCobertura`, `acimaDoLimite` → `frontend/src/lib/cobertura.ts`
- [x] **T-032** `[P]` — `lib/prazo-pagamento.ts`: `parcelasDoPrazo`, `textoDeParcelas`, `normalizarPrazo`, `prazoMedioDias`, `compararPrazo`, `validarPrazoMontagem` — portadas de `p-45547/.../prazo-pagamento.ts` mais `normalizarPrazo` (D-005) → `frontend/src/lib/prazo-pagamento.ts`
- [x] **T-033** — Bloco 73xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (7301–7311 e 7350–7361), no formato rígido do arquivo → `frontend/src/lib/server-functions.ts`
- [x] **T-034** — `PedidoProvider` + `usePedido()`: carrega capa, itens e alertas com uma chamada de `sgcPedidoCarregar` por card aberto e expõe `recarregar()` → `frontend/src/pages/quadro/abas/pedido-contexto.tsx`
- [x] **T-035** — `AbaItens`: tabela do design (§9.1) com `Code`, `RowTitle`, `RowMeta`, `numeric`, `Dash` e `Status` para cobertura acima do limite; colunas venda total, licitação, estoque, trânsito, sugestão, quantidade, un/caixa, custo, tipo de preço, curva, cobertura e total da linha → `frontend/src/pages/quadro/abas/Itens.tsx`
- [x] **T-036** — `AbaItens`: montar a análise (`sgcWintAnaliseMontagem` + `sgcCustoUnidadesPorCaixa` + `sgcCoberturaListar` → `montarItens`), busca e adição de produto (`sgcWintBuscarProduto`), remoção de item e edição consolidada com "Salvar" único: `sgcItensGravar` → `sgcAlertasGerar` → `kbCardAtualizar` com `valoresJson = { valor_total, alertas_pendentes }` numa chamada só, e só quando um dos dois muda (teto de 3 chamadas do RNF-001) → `frontend/src/pages/quadro/abas/Itens.tsx`
- [x] **T-037** — `AbaItens`: bloco de prazo de pagamento — padrão pelas faixas da 001, sugestão por `sgcWintPrazoPagamento`, comparação por `compararPrazo`, diálogo de justificativa com mínimo de 10 caracteres e gravação normalizada por `sgcEscPedidoPrazo` → `frontend/src/pages/quadro/abas/Itens.tsx`
- [x] **T-038** — `AbaAlertas`: lista por item com tipo, mensagem, situação de leitura e justificativa; "Marcar como lido" (`sgcEscAlertaLer`) e diálogo "Justificar" por produto (`sgcEscAlertaJustificar`), cada um seguido de `kbCardAtualizar` com `valoresJson = { alertas_pendentes }` para o cartão do quadro; a `contagem` da aba lê o mesmo campo → `frontend/src/pages/quadro/abas/Alertas.tsx`
- [x] **T-039** — `verificarSaidaAnalise(cardId)`: uma chamada de `sgcAnaliseSair`, devolvendo `{ ok, erro }` no formato do `antesDeMover` — a tela só chama `ctx.mover` depois do `ok` → `frontend/src/pages/quadro/abas/verificar-saida.ts`
- [x] **T-040** — **Pedir ao integrador**: ligar as abas no `/quadro` (`abasExtras` com Itens e Alertas, `contagem` de alertas), envolver o `KanbanBoard` no `PedidoProvider` e plugar `verificarSaidaAnalise` no `antesDeMover` de `analise → tecnica` → `frontend/src/pages/quadro/QuadroPage.tsx`
- [x] **T-041** `[P]` — `CoberturasPage`: listagem por nível com `SelectMenu`, `Toolbar` colada à tabela, diálogo de cadastro/edição (`sgcEscCoberturaGravar`), desativação (`sgcEscCoberturaExcluir`) e formulário desabilitado (nunca escondido) para quem não é admin nem gestor → `frontend/src/pages/coberturas/CoberturasPage.tsx`
- [x] **T-042** — **Pedir ao integrador**: rota `/coberturas` e item de menu (admin e gestor) → `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx`

## Testes

Cada id da seção **Testes** do `plan.md` aparece em exatamente uma task abaixo.

- [x] **T-080** — `teste('C-001 …')`, `teste('C-009 …')` e `teste('RN-011 …')` em `backend/simulator/smoke/003-itens.mjs`: a análise devolve 18 linhas (> 0) sem inativo nem departamento 4; a busca devolve entre 1 e 20 e exatamente 1 por código; o 5001 traz licitação 6 dentro de venda 18
- [x] **T-081** — `teste('C-011 …')`, `teste('C-012 …')`, `teste('RN-009 …')` e `teste('RN-010 …')`: as duas consultas Oracle de alerta devolvem contagem > 0; `sgcAlertasGerar` cria 1 alerta de vencimento (60 dias, Benenutri Filial Norte — `CODFILIAL` 2) e 1 de excesso (100 dias); 91 dias e 79 dias não alertam, 90 e 81 alertam, 100 dias na própria filial não alerta
- [x] **T-082** — `teste('C-010 …')` e `teste('C-021 …')`: `sgcItensGravar` com 9 itens numa chamada devolve `{ itens: 9 }`, grava as 9 quantidades e o `VL_TOTAL` esperado; 1 de 3 itens com `TIPO_PRECO` especial
- [x] **T-083** — `teste('C-013 …')`, `teste('C-014 …')`, `teste('C-017 …')`, `teste('C-007 …')` (parte servidor), `teste('C-015 …')` (parte servidor) e `teste('RN-012 …')`: cada condição de saída quebrada sozinha devolve `PODE = 0` com a sua mensagem; tudo satisfeito devolve `PODE = 1` e `MOTIVO` vazio
- [x] **T-084** — `teste('C-018 …')`, `teste('C-022 …')`, `teste('RN-013 …')` e `teste('RN-014 …')`: `sgcAnaliseSair` com `ok: true` remove 12 de 20, recalcula o total, limpa a reprovação e deixa a nota com "8 itens"; com alerta não lido devolve `ok: false` sem gravar nada; `sgcEscItemStatusFase` muda só os itens vivos
- [x] **T-085** — `teste('C-019 …')` e `teste('C-020 …')`: cancelar passa com alertas não lidos e sem item; `gil` grava cobertura e `ana` não
- [x] **T-086** `[P]` — `test('C-002 …')`, `test('C-003 …')`, `test('C-005 …')`, `test('C-006 …')`, `test('RN-001 …')`, `test('RN-003 …')` e `test('RN-008 …')` em `frontend/tests/compras.test.mjs`
- [x] **T-087** `[P]` — `test('C-004 …')`, `test('C-007 …')` (parte tela), `test('RN-002 …')` e `test('RN-004 …')` em `frontend/tests/compras.test.mjs`
- [x] **T-088** `[P]` — `test('C-008 …')` e `test('RN-005 …')` em `frontend/tests/cobertura.test.mjs`
- [x] **T-089** `[P]` — `test('C-015 …')` (parte tela), `test('C-016 …')`, `test('RN-006 …')` e `test('RN-007 …')` em `frontend/tests/prazo-pagamento.test.mjs`

## Verificação

- [x] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); nenhuma consulta Oracle com 0 linha
- [x] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-092** — Verificação manual no simulador: C-001 (tabela com 300 linhas rolando), C-007 (item acima do limite sinalizado com ponto e texto), C-013 (contagem de alertas na aba e no cartão), C-020 (tela de coberturas com formulário desabilitado para quem só lê)
- [ ] **T-093** — Tema claro e tema escuro sem cor quebrada nas duas abas e na tela de coberturas

## Dependências

```
T-001 → T-002 → T-003 · T-004 · T-005 · T-006 · T-007 · T-008 · T-009 · T-010 · T-011
T-009 · T-010 · T-011 → T-012 · T-013 · T-014 → T-015
T-020 → T-021 → T-022 → T-023
T-030 · T-031 · T-032 · T-033 [P] independentes do backend
T-033 · T-034 → T-035 → T-036 → T-037
T-034 → T-038 ·  T-008 + T-013 + T-014 → T-039 → T-040
T-011 + T-031 + T-033 → T-041 → T-042
T-021 + T-012/T-013/T-014 → T-080 … T-085
T-030 · T-031 · T-032 → T-086 … T-089
tudo → T-090 · T-091 → T-092 · T-093
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001, RF-002 / C-001 | T-003, T-021, T-036 | T-080 |
| RF-003, RF-004 / C-001, RN-011 | T-003, T-021 | T-080 |
| RF-005 / C-002, C-003, C-005, RN-001 | T-030, T-036 | T-086 |
| RF-006 / C-004, RN-002 | T-006, T-030, T-036 | T-087 |
| RF-007 / C-006, RN-003 | T-030 | T-086 |
| RF-008 / C-007, RN-004 | T-030, T-035 | T-087, T-083 |
| RF-009 / C-008, RN-005 | T-007, T-011, T-031 | T-088 |
| RF-010 / C-007 | T-008, T-035 | T-083 |
| RF-011 / C-009 | T-004, T-009, T-036 | T-080 |
| RF-012 / C-010 | T-009, T-012, T-036 | T-082 |
| RF-013 / C-010, RN-008 | T-011, T-012, T-030, T-036 | T-082, T-086 |
| RF-014, RF-015 / C-011, C-012, RN-009, RN-010 | T-005, T-010, T-013, T-021 | T-081 |
| RF-016 / C-011, C-013 | T-010, T-013 | T-081, T-083 |
| RF-017 / C-013 | T-010, T-038 | T-083 |
| RF-018 / C-014 | T-010, T-038 | T-083 |
| RF-019, RF-020 / C-015, C-016, RN-006, RN-007 | T-004, T-011, T-032, T-037 | T-089, T-083 |
| RF-021 / C-017 | T-008 | T-083 |
| RF-022 / C-013 a C-017, RN-012 | T-008, T-039, T-040 | T-083 |
| RF-023 / C-019 | T-008, T-040 | T-085 |
| RF-024 / C-018, C-022, RN-014 | T-009, T-014, T-039 | T-084 |
| RF-025 / C-018 | T-014 | T-084 |
| RF-026 / C-021, RN-013 | T-009, T-036 | T-082, T-084 |
| RF-027 / C-020 | T-011, T-041, T-042 | T-085 |
| RNF-001, RNF-002 | T-012, T-034, T-036, T-038 | T-082 |
| RNF-003, RNF-004, RNF-005 | T-003, T-008, T-021 | T-080, T-083 |
