# Tasks: Agenda de análises

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).

## Backend

- [x] **T-001** — Pedir ao integrador as duas tabelas no DDL da onda: `SGC_AGENDA` e `SGC_AGENDA_PARTICIPANTE` com as colunas exatas do `plan.md` → `backend/setup-backend.mjs` (arquivo compartilhado; a feature não edita)
- [x] **T-002** — Criar `backend/add-007-agenda.mjs` com o esqueleto do padrão: `export const definitions`, ids vindos do helper do integrador `backend/ids-do-mapa.mjs` (nome → id de todos os blocos de `server-functions.ts`; o `lerIdsDoMapa` da lib só devolve as `kbEsc*`, B-08), `isEntrypoint()` guardando o `configureSdkMitra` por `if (process.env.MITRA_BASE_URL)` e a publicação resolvendo os nomes por `listServerFunctionsMitra` → `backend/add-007-agenda.mjs`
- [x] **T-003** — `sgcAgendaListar` (SQL, 7401): filtros `codfornec`/`codfilial`/`dataInicio`/`dataFim`/`situacao`/`hoje`, `LIMIT/OFFSET`, `GROUP_CONCAT` dos participantes, `CASE` da situação (RF-014, RF-015) → `backend/add-007-agenda.mjs`
- [x] **T-004** `[P]` — `sgcAgendaListarTotal` (SQL, 7402) com os mesmos filtros (RF-015) → `backend/add-007-agenda.mjs`
- [x] **T-005** `[P]` — `sgcAgendaCarregar` (SQL, 7403) por `id`, mesmas colunas (RF-001) → `backend/add-007-agenda.mjs`
- [x] **T-006** — Escritas da tela, guardadas por `:VAR_USER` e persona, uma instrução cada: `sgcEscAgendaInserir` (7450, personas `admin`/`analista`/`gestor` **e** fornecedor ativo), `sgcEscAgendaAtualizar` (7451, mesmas personas, sem checar fornecedor), `sgcEscAgendaCancelar` (7452, `admin`/`gestor`/`diretoria`, só não processado e ativo), `sgcEscAgendaParticipanteLimpar` (7453), `sgcEscAgendaParticipanteInserir` (7454) (RF-001, RF-005, RF-013, RF-017, RF-020) → `backend/add-007-agenda.mjs`
- [x] **T-007** — Escritas internas (sem sessão), uma instrução cada: `sgcEscAgendaProcessada` (7455, com `AND PROCESSADO_EM IS NULL`), `sgcEscAgendaProximaInserir` (7456), `sgcEscAgendaParticipanteCopiar` (7457, `INSERT ... SELECT`), `sgcEscAgendaEnvio` (7458, planejado × real) (RF-008, RF-009, RF-016) → `backend/add-007-agenda.mjs`
- [x] **T-008** — Rotina compartilhada do processamento como string (`ROTINA`): seleção do lote, `kbCardCriar` por id, capa por `sgcEscPedidoCapaInserir` (7260, parâmetros da dona: `usuarioId`, `cardId`, `codfornec`, `fornecedor`, `codfilial`, `filial`, `periodoInicio`, `periodoFim`, `origem`, `idAgenda`, `agora` — sem `:VAR_USER`, B-01), título em maiúsculas pela RN-014 da 002 (B-09), marcação, próxima ocorrência com período recalculado, cópia de participantes, coleta de erros (RF-006 a RF-010, RNF-001, RNF-004) → `backend/add-007-agenda.mjs`
- [x] **T-009** — `sgcAgendaProcessar` (JAVASCRIPT, 7404, `cronExpression '0 */30 * * * *'`): dia em Brasília, `DATA_ANALISE <= hoje`, teto de 30 por rodada, sem sessão (RF-006, RNF-002, RNF-006, RN-013) → `backend/add-007-agenda.mjs`
- [x] **T-010** — `sgcAgendaProcessarManual` (JAVASCRIPT, 7405): persona por `runQueryMitra` com `:VAR_USER` (sem linha = analista; aceita `admin`, `analista` e `gestor`), os quatro recortes, padrão mês vigente, intervalo invertido recusado (RF-011, RF-012, RF-019, C-012) → `backend/add-007-agenda.mjs`
- [ ] **T-011** — Pedir ao integrador `add-007-agenda.mjs` no `PUBLISH_ORDER` (depois do `add-005`) e **conferir no sandbox** que as 14 SFs da agenda saíram liberadas no perfil business — o `add-002-perfil-acesso.mjs` já libera todas as SFs do projeto, nada a acrescentar lá (R-04) → `backend/simulator/config.mjs` (arquivo compartilhado)

## Simulador

- [x] **T-020** — Seed da feature: **só** os 6 agendamentos (2 atrasados recorrentes, 2 pendentes — um deles do fornecedor inativo `1088`, com data-limite —, 1 cancelado, 1 processado com `SGC_PEDIDO`) e os participantes do id 1, apontando para os fornecedores `1015`/`1042`/`1088` e as filiais `1`/`2`/`3` do seed da 001; **não** insere fornecedor (B-06) nem `SGC_USUARIO_PERSONA` (B-07: dono é `seed/002-quadro.mjs`, que traz `admin` 1, `ana` 2, `gil` 3, `dora` 4, `leo` 5) → `backend/simulator/seed/004-agenda.mjs`
- [x] **T-021** `[P]` — Pedir ao integrador as chaves novas do `CHECK_INPUT` (`codfornec`, `codfilial`, `dataInicio`, `dataFim`, `situacao`, `hoje`, `id`, `idAgenda`) → `backend/simulator/config.mjs` (arquivo compartilhado)

## Frontend

- [x] **T-030** — `lib/agenda.ts`: `proximaOcorrencia`, `situacao`, `periodoPadrao`, `periodoDaOcorrencia`, `validarAgendamento`, `recorte`, `diaNoFuso` — aritmética em texto ISO com `Date.UTC`, sem ler o relógio dentro das funções (RN-001 a RN-006, RN-008, RN-013) → `frontend/src/lib/agenda.ts`
- [x] **T-031** `[P]` — `components/DatePicker.tsx`: campo com máscara `dd/mm/aaaa` + `ui/popover` com a grade do mês, contrato de props, teclado (setas, PageUp/PageDown, Home/End, Enter, Esc) e ARIA (`role="grid"`, `aria-selected`, `aria-label` por extenso), só tokens nos dois temas (RF-018) → `frontend/src/components/DatePicker.tsx`
- [x] **T-032** — Bloco 74xx no mapa de server functions: os 14 nomes em `SERVER_FUNCTION_NAMES` e os ids locais 7401–7405 e 7450–7458 em `SERVER_FUNCTIONS` → `frontend/src/lib/server-functions.ts`
- [x] **T-033** — `AgendaPage.tsx`: `PageHeader` com contagens e ações por permissão, `Toolbar` de filtros (fornecedor, filial, de/até com `DatePicker`, situação), `FilterChip`, `Table` com situação em `Status`, envio planejado × real, link do pedido em `Code`, `EmptyState` e `Pagination` de 50 (RF-014, RF-015) → `frontend/src/pages/agenda/AgendaPage.tsx`
- [x] **T-034** — `AgendaDialogo.tsx`: novo/editar com fornecedor (`sgcFornecedorListar`, `ativo: 1`, RF-020) e filial vinda de `sgcFornecedorCarregar(codfornec).filiais` (C-09), data e período (padrão 45 dias), recorrência e data-limite, participantes por `kbUsuariosListar`, observação; validação por `validarAgendamento` e erro em `Alert`; gravação por inserir/atualizar + limpar/inserir participantes (RF-001 a RF-005) → `frontend/src/pages/agenda/AgendaDialogo.tsx`
- [x] **T-035** `[P]` — `ProcessarDialogo.tsx`: os quatro recortes com `hint`, campos por recorte, botão travado durante o processamento e resultado em `Alert` (RF-011, RF-012, RF-019) → `frontend/src/pages/agenda/ProcessarDialogo.tsx`
- [x] **T-036** `[P]` — Confirmação de cancelamento (fornecedor, filial e data no texto) e recarga da lista, sem aviso passageiro (RF-013) → `frontend/src/pages/agenda/AgendaPage.tsx`
- [x] **T-037** — Consumir de `permissoesDe(persona, acesso)` os campos `agendar` (`admin`, `analista`, `gestor`) e `cancelarAgendamento` (`admin`, `gestor`, `diretoria`) que a 002 acrescenta à interface `Permissoes`; a agenda não define matriz própria (B-02, RF-017, RN-011) → consome `frontend/src/lib/permissoes.ts` (arquivo da 002)
- [x] **T-038** — Pedir ao integrador: rota `/agenda` e item de menu "Agenda" no módulo Compras, escondido para `comercial` conforme P-03 → `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx` (arquivos compartilhados)
- [ ] **T-039** — A integração já fez `sgcEnvioIndustriaRegistrar` chamar `sgcEscAgendaEnvio` por id com `{ idCard, dtEnvio }` (`backend/add-005-quadro-compras.mjs:~588`). Pendente (A1 da revisão adversarial): `sgcEscAgendaEnvio` passou a exigir `{{usuarioId}}` (guarda de persona — antes qualquer perfil business gravava direto); falta acrescentar `usuarioId: inteiro(ctx.USUARIO_ID)` nesse `escrever(...)`, mesmo valor que a 002 já resolve para `kbNotaRegistrar` duas linhas abaixo. Sem isso a sincronização da agenda ao registrar envio fica sempre recusada pela guarda (falha silenciosa: `agendaSincronizada = false`, o envio em si continua ok) → `backend/add-005-quadro-compras.mjs` (arquivo da 002)

## Testes

Obrigatório: uma task por linha da seção **Testes** do `plan.md`. Feature sem
estas tasks concluídas não está pronta.

- [x] **T-080** — `teste('C-018: lista filtrada por situação …')` e `teste('C-001: agendamento gravado com o período padrão …')` em `backend/simulator/smoke/004-agenda.mjs`: 2 atrasados e `TOTAL: 2`; período 45 dias gravado
- [x] **T-081** — `teste('C-006: … 2 cards, 2 marcações e 2 ocorrências')`, `teste('C-007: rodar de novo não duplica')` e `teste('C-019: o pedido nasce em nome de quem agendou')` em `backend/simulator/smoke/004-agenda.mjs`: cron com `userId = 0`; `KB_CARD.CRIADO_POR`, `KB_MOVIMENTO.ORIGEM = 'sistema'`, `SGC_PEDIDO.ORIGEM = 'agenda'`, próximas em hoje+6 e hoje+13
- [x] **T-082** — `teste('C-008 …')`, `teste('C-009 …')`, `teste('C-010 …')` e `teste('C-011 …')` em `backend/simulator/smoke/004-agenda.mjs`: um recorte por teste, conferindo os ids que entraram e os que ficaram de fora
- [x] **T-083** — `teste('C-012 …')`, `teste('C-013 …')` e `teste('C-014 …')` em `backend/simulator/smoke/004-agenda.mjs`: comercial recusado no processamento e gestor aceito; gestor cancela; analista não cancela
- [x] **T-084** — `teste('C-016 …')` e `teste('RN-012 …')` em `backend/simulator/smoke/004-agenda.mjs`: `sgcEscAgendaEnvio` grava real, guarda a planejada original uma vez só e move a data da análise
- [x] **T-085** — `teste('C-017 …')` em `backend/simulator/smoke/004-agenda.mjs`: participantes limpos e reinseridos (3 → 2) e herdados pela ocorrência seguinte
- [x] **T-086** — `teste('C-020 …')`, `teste('RN-004 …')`, `teste('RN-007 …')`, `teste('C-021 …')` e `teste('RN-015 …')` em `backend/simulator/smoke/004-agenda.mjs`: erro isolado no lote; cancelar processado recusado; agendamento com pedido não gera o segundo; inserir com fornecedor inativo não grava, editar o agendamento antigo dele grava, e o recorrente dele segue gerando ocorrência
- [x] **T-087** — `teste('RNF-001: custo por agendamento')` em `backend/simulator/smoke/004-agenda.mjs`: contador de execuções do runner em 3 sem recorrência e 5 com recorrência e participantes
- [x] **T-088** `[P]` — `test('C-004 …')`, `test('C-005 …')`, `test('RN-001 …')`, `test('RN-002 …')` e `test('RN-003 …')` em `frontend/tests/agenda.test.mjs`: `proximaOcorrencia` com os números da spec (31/01→28/02→28/03; 31/01/2028→29/02/2028; quinzenal com limite)
- [x] **T-089** `[P]` — `test('C-002 …')`, `test('C-003 …')`, `test('C-015 …')`, `test('RN-005 …')`, `test('RN-006 …')`, `test('RN-008 …')`, `test('RN-011 …')` e `test('RN-013 …')` em `frontend/tests/agenda.test.mjs`: validação, situação, período padrão e da ocorrência, os campos `agendar`/`cancelarAgendamento` lidos de `permissoesDe` (a matriz é testada pela 002) e o dia no fuso

## Verificação

- [x] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`)
- [x] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-092** — Verificação manual no simulador: C-001 (seletor de data só pelo teclado: Tab, setas, PageUp/PageDown, Enter, Esc), C-011 (diálogo com os quatro recortes e os hints), C-013 (confirmação e resultado no fluxo da tela, sem aviso passageiro)
- [ ] **T-093** — C-018 nos dois temas: as quatro situações legíveis, sempre com texto ao lado do ponto, e o calendário do `DatePicker` sem cor quebrada

## Dependências

```
T-001 → T-003 · T-020
T-002 → T-003 → T-004 · T-005 · T-006 · T-007 → T-008 → T-009 · T-010
T-032 → T-008 (a rotina resolve as escritas pelos ids do mapa)
T-020 · T-009 · T-010 → T-080 … T-087 → T-090
T-030 [P] → T-033 · T-034 · T-088 · T-089
T-031 [P] → T-033 · T-034
T-037 → T-033 · T-036
T-038 · T-039 · T-011 · T-021 · T-001: pedidos a outro dono — não bloqueiam o
código da feature, bloqueiam a publicação
T-088 · T-089 → T-091 → T-092 → T-093
```

## Rastreabilidade

Toda task existe por causa de um requisito. Requisito sem task é escopo perdido;
cenário sem task de teste é cenário não entregue.

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001 | T-001, T-002, T-005, T-006, T-034 | T-080 |
| RF-002 / C-001 | T-030, T-034 | T-089 (RN-006) |
| RF-003 / C-002, C-003 | T-030, T-034 | T-089 |
| RF-004 / C-004, C-005 | T-030, T-034 | T-088 |
| RF-005 / C-017 | T-006, T-007, T-034 | T-085 |
| RF-006 / C-006 | T-008, T-009 | T-081 |
| RF-007 / C-019 | T-008 | T-081 |
| RF-008 / C-006 | T-007, T-008 | T-081 |
| RF-009 / C-005, C-017 | T-007, T-008 | T-081, T-085 |
| RF-010 / C-007 | T-007, T-008 | T-081, T-086 |
| RF-011 / C-008 a C-011 | T-010, T-035 | T-082 |
| RF-012 / C-010 | T-010, T-030, T-035 | T-082 |
| RF-013 / C-013 | T-006, T-036 | T-083 |
| RF-014 / C-015 | T-003, T-030, T-033 | T-080, T-089 |
| RF-015 / C-018 | T-003, T-004, T-033 | T-080 |
| RF-016 / C-016 | T-007, T-039 | T-084 |
| RF-017 / C-012, C-014 | T-006, T-010, T-037 | T-083, T-089 |
| RF-018 | T-031 | T-092 (manual) |
| RF-019 / C-020 | T-010, T-035 | T-086 |
| RF-020 / C-021 | T-006, T-020, T-034 | T-086 |
| RNF-001 | T-008 | T-087 |
| RNF-002 | T-009 | T-081 |
| RNF-003 / C-007 | T-007, T-008 | T-081 |
| RNF-004 / C-020 | T-008 | T-086 |
| RNF-005 | T-003, T-004, T-033 | T-080 |
| RNF-006 / RN-013 | T-009, T-030 | T-089 |
| RN-001 a RN-003 | T-030 | T-088 |
| RN-004 | T-006 | T-086 |
| RN-005 | T-003, T-030 | T-080, T-089 |
| RN-006, RN-008 | T-030 | T-089 |
| RN-007 | T-008, T-009 | T-086 |
| RN-009, RN-010 | T-008 | T-081, T-085 |
| RN-011 | T-006, T-010, T-037 | T-083, T-089 |
| RN-012 | T-007, T-039 | T-084 |
| RN-014 | T-009, T-010 | T-081, T-082 |
| RN-015 | T-006, T-020, T-034 | T-086 |
