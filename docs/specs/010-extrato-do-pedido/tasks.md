# Tasks: Extrato do pedido

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir ao integrador** = arquivo compartilhado; esta feature não o edita.

## Backend

- Nenhuma task. R-051: a 010 não tem script nem SF — lê `sgcPedidoCarregar` (002/003) e
  `sgcNfListar` (005), já publicadas. O único pedido de mudança em arquivo alheio
  (`CRIADOR_NOME` em `sgcPedidoCarregar`, D-001 do `plan.md`) já foi resolvido na revisão
  cruzada da S1 como **R-068**: entrega da base (S2), fora desta lista.

## Frontend

- [x] **T-001** — `lib/extrato.ts`: tipo `PedidoParaExtrato` (interseção sobre `PedidoCapa`
      de `lib/pedido.ts` mais os campos de faturamento e `CRIADOR_NOME` que
      `sgcPedidoCarregar` já devolve, este último a partir de R-068 — D-001, D-002), tipo
      `ModeloExtrato` (cabeçalho — com `criador` —, marca, assinaturas, prazo, itens, total,
      decisões, faturamento, nome do arquivo), `FASES_DECISAO` (`analise`, `tecnica`,
      `diretoria`) → `frontend/src/lib/extrato.ts`
- [x] **T-002** — `montarExtrato(pedido, itensBrutos, fase, nfsBrutas, agora?)` em
      `lib/extrato.ts`: marca/assinaturas por `FASES_DECISAO`/`cancelado` (RN-001..004),
      prazo via `compararPrazo` (RN-005), itens via `itemDeLinha` filtrados por
      `qtPedida > 0` (RN-006), total = `pedido.VL_TOTAL` (D-003, RN-007), faturamento a
      partir de `nfsBrutas` (RN-008), `numeroWinthor` só com `DT_ENVIO` (RN-009), `criador`
      = `pedido.CRIADOR_NOME` ou `''` quando ausente (RF-010, D-001), nome do arquivo
      `extrato-pedido-<idCard>` (RN-010), `geradoEm` em hora local a partir de `agora`
      (RN-011) → `frontend/src/lib/extrato.ts`
- [x] **T-003** `[P]` — `linhasCsvExtrato(modelo)` em `lib/extrato.ts`: cabeçalho e linhas
      de item na mesma ordem de `modelo.itens` (RN-012) → `frontend/src/lib/extrato.ts`
- [x] **T-004** `[P]` — `popupFoiBloqueado(janela)` em `lib/extrato.ts`: `janela === null`
      (RN-013) → `frontend/src/lib/extrato.ts`
- [x] **T-005** — `pages/quadros/extrato-html.ts`: import da logo com
      `@/assets/logo-benenutri.png?inline` (D-007), `extratoHtml(modelo)` monta o documento
      completo — retrato, monocromático, marca d'água fixa em todas as páginas quando
      `modelo.marca` não é nulo, três linhas de assinatura quando `modelo.assinaturas`,
      cabeçalho, prazo, tabela de itens, decisões, faturamento, `window.print()` ao
      carregar; ≤ 800 linhas → `frontend/src/pages/quadros/extrato-html.ts`
- [x] **T-006** — Botões e handlers em `AcoesDoPedido.tsx`: importa `Alert`; estado
      `avisoPopup`; `extratoPdf` (abre a janela antes do `await` — D-005 —, busca
      `sgcPedidoCarregar` + `sgcNfListar` em paralelo — D-004 —, chama `montarExtrato` e
      `extratoHtml`, ou `popupFoiBloqueado` → `setAvisoPopup(true)`); `extratoCsv`
      (mesma busca, `linhasCsvExtrato` + `textoCsv` + `baixarCsv`); wrapper de execução
      próprio sem `recarregarPedido()` (D-006); dois itens em `acoes` com
      `permitido: permissoes.verQuadro`; `Alert` de pop-up bloqueado abaixo da lista de
      botões → `frontend/src/pages/quadros/AcoesDoPedido.tsx`
- [x] **T-094** — R-153: `falta` em `FaturamentoExtrato` e a linha do saldo no HTML → `frontend/src/lib/extrato.ts`, `frontend/src/pages/quadros/extrato-html.ts`

## Testes

Obrigatório: uma task por linha da seção **Testes** do `plan.md`. Feature sem estas tasks
concluídas não está pronta.

- [x] **T-080** — `test('C-001 …')`, `test('C-002 …')`, `test('C-003 …')` e `test('C-004 …')`
      em `frontend/tests/extrato.test.mjs`: marca e assinaturas nas dez fases, inclusive o
      caso de `TEC_EM` preenchido com o pedido de volta na Análise (RN-001)
- [x] **T-081** `[P]` — `test('C-005 …')`, `test('C-006 …')` e `test('C-007 …')`: prazo
      igual, divergente com justificativa e divergente sem justificativa ainda
- [x] **T-082** `[P]` — `test('C-008 …')` e `test('C-009 …')`: item de quantidade zero fora
      da lista; total igual a `VL_TOTAL`, não à soma recalculada
- [x] **T-083** `[P]` — `test('C-010 …')` e `test('C-011 …')`: seção de faturamento com e
      sem nota vinculada
- [x] **T-084** `[P]` — `test('C-012 …')`: número do pedido no fornecedor só com envio
      registrado; `criador` preenchido quando `CRIADOR_NOME` vem na linha (R-068) e vazio
      quando não vem, sem quebrar o resto do modelo
- [x] **T-085** `[P]` — `test('C-013 …')`: `popupFoiBloqueado`
- [x] **T-086** `[P]` — `test('C-014 …')`: `linhasCsvExtrato` bate com `modelo.itens`
- [x] **T-087** `[P]` — `test('C-015 …')` e `test('C-016 …')`: nome do arquivo; emissão em
      hora local com `agora` injetado
- [x] **T-088** — Conferir que `frontend/tests/permissoes.test.mjs` (002) já cobre C-017
      (`verQuadro` por persona); nenhuma linha nova a escrever ali

## Verificação

- [x] **T-090** — `cd frontend && npm test` verde
- [x] **T-091** — `cd frontend && npm run build && npm run lint` limpos
- [ ] **T-092** — Verificação manual no simulador: abrir o extrato em cada uma das dez
      fases; nas de decisão e em Canceladas, imprimir de verdade (Ctrl+P) e conferir marca
      d'água, assinaturas e paginação em A4 retrato, monocromático; testar com pop-up
      bloqueado de propósito na configuração do navegador; abrir o CSV baixado e conferir
      acentuação
- [ ] **T-093** — Tema claro e escuro do **app** sem cor quebrada nos dois botões e no
      `Alert` de aviso (o documento impresso em si é sempre claro, por regra — R-060, sem
      verificação de tema)

## Dependências

```
T-001 → T-002 → T-003 · T-004
T-001 · T-002 → T-005
T-002 · T-003 · T-004 · T-005 → T-006
T-002 → T-080 … T-084 · T-003 → T-086 · T-004 → T-085
T-006 → T-092 · T-093
tudo → T-090 · T-091 → T-092 · T-093
```

## Rastreabilidade

Toda task existe por causa de um requisito. Requisito sem task é escopo perdido; cenário
sem task de teste é cenário não entregue.

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-017 | T-006 | T-088 |
| RF-002 / C-002, RN-001 | T-002 | T-080 |
| RF-003 / C-001, RN-002 | T-002 | T-080 |
| RF-004 / C-003, RN-003 | T-002 | T-080 |
| RF-005 / C-004, RN-004 | T-002 | T-080 |
| RF-006 / C-005, C-006, C-007, RN-005 | T-002 | T-081 |
| RF-007 / C-008, RN-006 | T-002 | T-082 |
| RF-008 / C-009, RN-007 | T-002 | T-082 |
| RF-009 / C-010, C-011, RN-008 | T-002 | T-083 |
| RF-010 / C-012, RN-009 | T-001, T-002 | T-084 |
| RF-011 / C-013, RN-013 | T-004, T-006 | T-085 |
| RF-012 / C-014, RN-012 | T-003 | T-086 |
| RF-013 / C-015, RN-010 | T-002 | T-087 |
| RF-014 / C-016, RN-011 | T-002 | T-087 |
| RNF-001 | T-006 | T-091 (revisão: nenhuma SF nova; R-077 confirma 2 execuções por clique dentro do teto) |
| RNF-002 | T-005 | T-092 |
