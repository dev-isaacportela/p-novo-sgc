# Tasks: Trânsito e recebimento — previsão, atraso e conclusão do trânsito

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir à base / ao integrador** = arquivo compartilhado; esta feature não o edita.
>
> Esta spec **não** cria tabela nem coluna: quem cria schema antes do fan-out é
> a **base (S2)**, e `SGC_NF.DT_RECEBIMENTO` e `SGC_NF.ALERTA_ATRASO_EM` já
> estão no `CREATE TABLE` da 005 (R-026). O que ela depende de fora está todo
> em T-001.

## Backend

- [x] **T-001** — Conferir, antes da primeira SQL, o que vem de fora: `backend/lib/dias-uteis.mjs` com `somarDiasUteis(col, n)` e `somarDiasCorridos(col, n)` aceitando **coluna** em `n` e devolvendo texto `AAAA-MM-DD` (R-025); `SGC_NF` com `DT_RECEBIMENTO`/`ALERTA_ATRASO_EM`; `sgcEscAvisoInserir` publicada com `{ idCard, tipo, chave, paraUsuarioId, paraPersona, texto, criadoEm }`; `frontend/src/lib/csv.ts` com `textoCsv`/`baixarCsv`. Faltando algo, **pedir à base** antes de seguir → `backend/lib/dias-uteis.mjs`, `backend/setup-backend.mjs`, `backend/add-008-notas-fiscais.mjs`, `frontend/src/lib/csv.ts`
- [x] **T-002** — Criar `add-009-transito.mjs` com o esqueleto padrão (`definitions` exportado, `isEntrypoint()` resolvendo o `jdbcId` do WinThor por nome, ids por `ids-do-mapa.mjs` no módulo e por `listServerFunctionsMitra` na publicação, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`) → `backend/add-009-transito.mjs`
- [x] **T-003** — Os fragmentos compartilhados: `dtPrevisao(nf, fo)`, `HOJE`, `SITUACAO(n)`, `DIAS_ATRASO(n)` e a camada base de `SGC_NF` + `LEFT JOIN SGC_FORNECEDOR` — escritos **uma vez** e usados pelas quatro leituras → `backend/add-009-transito.mjs`
- [x] **T-004** — `sgcNfsRecebimentoCard` (7601): duas camadas, `ORDER BY DT_EMISSAO, NUMNOTA`, params `cardId`/`hoje` → `backend/add-009-transito.mjs`
- [x] **T-005** — `sgcNfsRecebimentoPendente` (7602): junções de `KB_CARD`/`SGC_FASE`/`SGC_PEDIDO`, fases `enviado` e `transito`, `QUEM_PROCESSA` (primeiro responsável, senão criador) e o lote de 30 **pedidos** em subconsulta embrulhada (D-007) → `backend/add-009-transito.mjs`
- [x] **T-006** `[P]` — `sgcNfsEmAtraso` (7603) e `sgcNfsEmAtrasoTotal` (7604): mesmo corpo filtrado por `SITUACAO = 'atrasada'`, com `busca` (nota, fornecedor, pedido no ERP), `faixa` (`ate3`/`4a7`/`mais7`) e, no total, `COUNT(*)` + `SUM(VL_TOTAL)` → `backend/add-009-transito.mjs`
- [x] **T-007** `[P]` — `sgcWintNfEntradasConfirmadas` (7605, SQL Oracle): `PCNFENT` por `CODFORNEC` + `NUMNOTA IN (…)`, com `DTENT IS NOT NULL` e `DTCANCEL IS NULL` → `backend/add-009-transito.mjs`
- [x] **T-008** `[P]` — As duas escritas: `sgcEscNfRecebimento` (7650) e `sgcEscNfAlertaAtraso` (7651), uma instrução cada, chamadas só por id, com a guarda de persona da 002 copiada literal sobre `{{usuarioId}}` (R-013) e a lista `admin`/`analista`/`gestor` → `backend/add-009-transito.mjs`
- [x] **T-009** — `sgcRecebimentoSincronizar` (7606, JAVASCRIPT, cron `0 25 9-23/2 * * *` — UTC, 6h25–20h25 de Brasília, R-035); `sgcNfsRecebimentoPendente` é chamada **por id** (1 execução por rodada, D-015) e as demais leituras por `runQueryMitra`: persona por `runQueryMitra` com `:VAR_USER` quando há sessão (e `RESTRICTED` só nos próprios pedidos), dia em Brasília, notas pendentes, agrupamento por fornecedor com `try/catch` por fornecedor e fatiamento de 500, casamento com desempate pela filial do pedido, gravação do recebimento → `backend/add-009-transito.mjs`
- [x] **T-010** — `sgcRecebimentoSincronizar`, parte dos avisos: nota atrasada sem aviso de hoje → `sgcEscAvisoInserir` (`nf_atrasada`, chave `nf_atrasada:<card>:<dia>:<nf>`, `paraUsuarioId: 0`) + `sgcEscNfAlertaAtraso`; toda escrita com `usuarioId = QUEM_PROCESSA` → `backend/add-009-transito.mjs`
- [x] **T-011** — `sgcRecebimentoSincronizar`, parte do movimento: uma consulta (`runQueryMitra`) varre **todo** pedido na fase `transito` com ≥ 1 nota e zero nota sem recebimento — não só os tocados na rodada, porque nota vinculada depois da entrada nasce recebida (D-012 da 005, D-014) — e para cada um `kbCardMover` com `movidoPor` e `origem: 'sistema'` (R-021) para a `FASE_ID` de `SGC_FASE.CHAVE = 'faturamento'`, mais o aviso `nf_recebida` e o `kbNotaRegistrar` (em `try/catch`, nota que falha não derruba a rodada); com `cardId` informado, a varredura leva `AND C.ID = <cardId>` → `backend/add-009-transito.mjs`
- [x] **T-012** — **Pedir ao integrador**: `add-009-transito.mjs` no `PUBLISH_ORDER`, depois do `add-008` → `backend/simulator/config.mjs`

## Simulador

- [x] **T-020** — Seed `006-transito.mjs`, **só INSERT**: os 7 pedidos da tabela do plan (T1–T4 e T7 em `transito`, E5 em `enviado`, F6 em `faturamento`), as 17 notas em `SGC_NF` (faixa `NUMNOTA` 90001–90017), a ocorrência pendente do F6 e as linhas de `PCNFENT` das notas 90005, 90007 (com `DTCANCEL`) e 90008 (duas filiais). Todo pedido nasce com **`DT_ENVIO` vazio**, para ficar fora de `/faturamentos-pendentes` da 005 (R-045). Exportar `CARDS_006` com os ids dos 7 cards, que é o recorte das asserções. Fornecedores, filiais, o genérico 999999 e as personas vêm dos seeds da 001 e da 002 — este seed **não** os grava → `backend/simulator/seed/006-transito.mjs`
- [x] **T-021** — **Pedir à base**: `CHECK_INPUT` com `faixa`, `idNf`, `numnotas`, `dtRecebimento`, `alertaEm`, `numtransent`, `chavenfe` → `backend/simulator/config.mjs`
- [x] **T-022** — **Pedir à base**: o único shim que a SQL desta spec exige e não existe — `DATE_ADD(col, INTERVAL <expressão> DAY)` (hoje o dialeto só reescreve `INTERVAL <literal> DAY`). `WEEKDAY`, `FLOOR`, `MOD` e `LEAST` são do fragmento `somarDiasUteis` da 005, que pede o que precisar; `CAST(x AS CHAR)` não é usado (a busca usa `CONCAT('', NUMNOTA)`) → `backend/simulator/mysql-dialect.mjs`
- [x] **T-023** — Registrar `seed006` no `seed.mjs` e a suíte `006-transito` no `smoke.mjs` → **pedir ao integrador** (`backend/simulator/seed.mjs`, `backend/simulator/smoke.mjs`)

## Frontend

- [x] **T-030** `[P]` — `lib/recebimento.ts`: `notaDeLinha`, `situacaoDeTexto`, `rotuloSituacao`, `tomSituacao`, `rotuloAtraso`, `faixaDeAtraso`, `resumoRecebimento`, `COLUNAS_CSV_ATRASO` e `linhasCsv` (matriz de valores; o texto é de `lib/csv.ts`) — regra pura, sem React e sem transporte → `frontend/src/lib/recebimento.ts`
- [x] **T-031** — Bloco 76xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (7601–7606 e 7650–7651), no formato rígido do arquivo → `frontend/src/lib/server-functions.ts`
- [x] **T-032** — `AbaRecebimento`: uma chamada de `sgcNfsRecebimentoCard` por abertura; tabela com `Code`, `RowTitle`, `RowMeta`, `numeric`, `Dash` e `Status` (ponto + texto) para a situação; resumo "2 de 3 notas recebidas" dentro da aba; prazo pelo `rotuloPrazoEntrega` da 001; persona e `podeEditar` pelo `usePedido()`. A `AbaExtra` declara só `id`, `rotulo` e `render` — **sem `contagem`** (R-049) → `frontend/src/pages/quadros/abas/Recebimento.tsx`
- [x] **T-033** — `AbaRecebimento`: botão "Verificar entrada no WinThor" (`operarNf`; desabilitado com o motivo no `title` para quem não opera), `sgcRecebimentoSincronizar({ cardId })`, recarga da consulta e `ctx.recarregar()` quando o pedido mudou de fase; confirmação na faixa do painel, erro em `Alert`, sem toast → `frontend/src/pages/quadros/abas/Recebimento.tsx`
- [x] **T-034** `[P]` — `NfsAtrasoPage`: `PageHeader`, total e valor com `Stat`/`MetaDot`, `Toolbar` com `SearchInput` e `SelectMenu` de faixa, `FilterChip` do filtro aplicado, tabela, `Pagination` e `EmptyState`; duas execuções por filtro (`sgcNfsEmAtraso` + `sgcNfsEmAtrasoTotal`) → `frontend/src/pages/nfs-atraso/NfsAtrasoPage.tsx`
- [x] **T-035** — `NfsAtrasoPage`: "Sincronizar com o WinThor" (`operarNf`) e "Exportar" (`baixarCsv(nome, textoCsv(COLUNAS_CSV_ATRASO, linhasCsv(notas)))` sobre as linhas do filtro atual, sem execução nova) → `frontend/src/pages/nfs-atraso/NfsAtrasoPage.tsx`
- [x] **T-036** — **Pedir à base**: `verNfsAtraso` (admin, analista, gestor, diretoria) na matriz de `lib/permissoes.ts` **e** o item `{ grupo: 'Fiscal', to: '/nfs-em-atraso', label: 'NFs em atraso', exige: 'verNfsAtraso' }` na constante `MENU` do mesmo arquivo — é lá que o menu vive; o `AdminLayout` só resolve o ícone por rota. `operarNf` (005) governa "Verificar entrada" e "Sincronizar" e zera com `READ_ONLY` (R-038) → `frontend/src/lib/permissoes.ts`
- [x] **T-037** — **Pedir ao integrador**: ligar a aba Recebimento em `abasExtras` do `/quadro` (R-029, sem `contagem`) e a rota `/nfs-em-atraso` → `frontend/src/pages/quadros/QuadroPage.tsx`, `frontend/src/App.tsx`
- [x] **T-094** — R-150: bloco Acompanhamento no topo do Trânsito (`lib/acompanhamento.ts`, `abas/Acompanhamento.tsx`) e Recebimento em cartões, sem tabela de 7 colunas → `frontend/src/pages/quadros/abas/`
- [x] **T-095** — R-154 (P-4): botão "Produto faturado — ir para Faturamento" no acompanhamento (`ctx.mover`, desabilitado com o motivo de `motivoDeDestino`) e o painel "Notificar gestor" da 005 (R-155) → `frontend/src/pages/quadros/abas/Acompanhamento.tsx`

## Testes

Cada id da seção **Testes** do `plan.md` aparece em exatamente uma task abaixo.

- [x] **T-080** — `teste('C-001 …')`, `teste('C-002 …')`, `teste('C-021 …')` e `teste('RN-001 …')` em `backend/simulator/smoke/006-transito.mjs`: previsões `2026-09-02`, `2026-09-08` e `2026-09-07`; o prazo de 7 para 10 muda a 90001 para `2026-09-07` e o teste devolve o prazo; 24/08/2026 + 15 úteis = `2026-09-14` e sábado + 1 útil = `2026-08-31`
- [x] **T-081** — `teste('C-003 …')`, `teste('C-004 …')`, `teste('C-005 …')`, `teste('C-012 …')`, `teste('RN-002 …')` e `teste('RN-003 …')` (parte servidor): `sem_prazo` por fornecedor não parametrizado e por data de faturamento vazia; a 90011 com `atrasada` e 2 dias; no T1, duas `recebida` ao lado de uma `atrasada`; com `hoje` forçado no parâmetro, previsão hoje−1 → `atrasada`, hoje+2 → `em_transito`, hoje+3 → `dentro_prazo`, e recebimento vence tudo
- [x] **T-082** — `teste('C-006 …')`, `teste('C-007 …')`, `teste('C-008 …')`, `teste('C-022 …')` e `teste('RN-004 …')`: a rodada devolve `recebidas = 2`; `sgcWintNfEntradasConfirmadas(1015, '90005')` devolve > 0 linhas; a 90007 (cancelada no ERP) e a 90006 (sem entrada) continuam pendentes; a 90008 fica com a data da filial do pedido
- [x] **T-083** — `teste('C-009 …')`, `teste('C-010 …')`, `teste('C-023 …')` e `teste('RN-006 …')`: o T2 vai para `faturamento` com `KB_MOVIMENTO.ORIGEM = 'sistema'` e `USUARIO_ID = gil`, 1 aviso `nf_recebida` e 1 nota no histórico; o T7 (todas as notas já recebidas, fora de `sgcNfsRecebimentoPendente`) também vai, pela varredura do passo 6; o T1 continua em `transito` com 2 de 3; a segunda rodada não move nenhum dos dois, e um card em `transito` sem nota nunca move
- [x] **T-084** — `teste('C-011 …')`, `teste('RN-007 …')` e `teste('RN-008 …')`: contando **só** `ID_CARD IN (CARDS_006)` (R-045), 5 avisos `nf_atrasada` na primeira rodada e os mesmos 5 depois da terceira; apagar `ALERTA_ATRASO_EM` e rodar de novo no mesmo dia não cria linha (a `CHAVE` segura); 1 aviso `nf_recebida` com `PARA_USUARIO_ID = 0` por card movido
- [x] **T-085** — `teste('C-013 …')`, `teste('C-014 …')` e `teste('RN-009 …')`: a verificação com `cardId` do T3 não toca o T1; com a definição de `sgcWintNfEntradasConfirmadas` trocada no `byId` por uma que lança para o fornecedor 1042, o 1015 grava e `erros` traz 1 item com 1042; contador de consultas ao ERP = 3 numa rodada com três fornecedores
- [x] **T-086** — `teste('C-015 …')`, `teste('C-016 …')`, `teste('C-017 …')`, `teste('RN-010 …')` e `teste('RN-011 …')`: recortando por `CARDS_006`, a lista traz as 5 notas esperadas e `sgcNfsEmAtrasoTotal` bate com o `COUNT`/`SUM` que o próprio teste faz no banco pela mesma regra (**sem literal**, R-045); as três faixas e as três buscas por presença; 45 pedidos pendentes inseridos pelo próprio teste devolvem notas de exatamente 30 pedidos, e todas as notas de cada um; a 90015 (pedido em `faturamento`) e as notas de um pedido marcado como excluído ficam fora das duas consultas
- [x] **T-087** — `teste('C-020 …')`: `sgcRecebimentoSincronizar` como `leo` (comercial) e como `dora` (diretoria) devolve `ok: false` sem gravar; `sgcEscNfRecebimento` com `usuarioId` do comercial não altera linha nenhuma
- [~] **T-088** (BLOQUEADA pela S4 — o teste existe e confere a pré-condição; a asserção do gancho liga sozinha quando os fragmentos forem compostos) — `teste('C-019 …')` e `teste('RN-013 …')` — **depende da S4** (os fragmentos `pendencias-conclusao-nf.sql` da 005 e `pendencias-conclusao-bo.sql` da 007 compostos no `sgcPodeMover`): com a ocorrência pendente, `sgcPodeMover` do F6 para `concluido` devolve `PODE = 0` com o motivo; decidida a ocorrência, `PODE = 1` e `MOTIVO` vazio
- [x] **T-089** `[P]` — `test('C-018 …')`, `test('RN-005 …')`, `test('RN-003 …')` (parte tela) e `test('RN-012 …')` em `frontend/tests/recebimento.test.mjs`: `linhasCsv` de 3 notas → 3 linhas nas colunas de `COLUNAS_CSV_ATRASO`, e `textoCsv` sobre elas → 4 linhas, vírgula decimal e aspas no campo com `;`; `faixaDeAtraso` nos limites 3/4/7/8; os cinco rótulos e tons de situação mais o valor desconhecido; a matriz de `verNfsAtraso`/`operarNf` por persona e nível

## Verificação

- [x] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); a consulta ao WinThor com contagem > 0
- [x] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-092** (pendente: o brief da onda 2 proíbe subir servidor no worktree — verificação visual fica com o integrador) — Verificação manual no simulador: C-001 (tabela de notas do pedido), C-005 (nota em atraso no meio de notas normais), C-015 (total, valor, faixas e tabela em tela estreita), C-018 (arquivo exportado abrindo no editor de planilha), C-020 (botões desabilitados com o motivo no `title`)
- [ ] **T-093** (pendente pelo mesmo motivo de T-092; a tela só usa tokens e primitivos de page.tsx, zero cor literal e zero style inline) — Tema claro e tema escuro sem cor quebrada na aba e na tela de notas vencidas

## Dependências

```
T-001 → T-002 → T-003 → T-004 · T-005 · T-006 · T-007 · T-008
T-005 + T-007 + T-008 → T-009 → T-010 → T-011 → T-012
T-020 → T-021 · T-022 · T-023
T-030 · T-031 [P] independentes do backend
T-031 + T-032 → T-033 ;  T-031 + T-030 → T-034 → T-035
T-036 → T-037 (rota e menu depois da chave de permissão)
T-020 + T-004…T-011 → T-080 … T-087
S4 (fragmentos da 005 e da 007 no gancho) → T-088
T-030 → T-089 [P]
tudo → T-090 · T-091 → T-092 · T-093
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001, RF-002 / C-001, C-002, RN-001 | T-001, T-003, T-004, T-020 | T-080 |
| RF-003 / C-003, C-004, RN-002 | T-003, T-004, T-020 | T-081 |
| RF-004 / C-021 | T-003 | T-080 |
| RF-005, RF-006 / C-005, C-012, RN-003 | T-003, T-004, T-030, T-032 | T-081, T-089 |
| RF-007 / C-006 | T-005, T-009, T-012 | T-082 |
| RF-008, RF-009 / C-007, C-008, C-022, RN-004 | T-007, T-008, T-009, T-020 | T-082 |
| RF-010, RF-011, RF-012, RF-025 / C-009, C-010, C-023, RN-006 | T-011 | T-083 |
| RF-013, RF-014 / C-011, RN-007, RN-008 | T-008, T-010, T-011 | T-084 |
| RF-015 / C-013 | T-009, T-033 | T-085 |
| RF-016, RF-017 / C-014, RN-009 | T-007, T-009 | T-085 |
| RF-018, RF-019 / C-015, C-016, C-017, RN-011 | T-006, T-020, T-034 | T-086 |
| RF-020 / C-018 | T-030, T-035 | T-089 |
| RF-021 | T-035 | T-085 |
| RF-022 / C-019, RN-013 | T-020 (ocorrência do F6) | T-088 |
| RF-023, RF-024 / C-020, RN-012 | T-008, T-009, T-030, T-033, T-036 | T-087, T-089 |
| RNF-001 | T-004, T-032 | T-080 |
| RNF-002, RNF-006 / RN-009 | T-009 | T-085 |
| RNF-003 / RN-010 | T-005 | T-086 |
| RNF-004 | T-006, T-034 | T-086 |
| RNF-005 | T-007 | T-082 |
