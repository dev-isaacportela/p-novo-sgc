# Tasks: Quadro de compras

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **(integrador)** = arquivo compartilhado; esta feature não o edita: abre o
> pedido para o integrador com o texto exato a acrescentar.

## Backend

- [x] **T-001** — **(integrador)** pedir as quatro tabelas desta spec no `setup-backend.mjs`, um `CREATE TABLE IF NOT EXISTS` por template literal, com as colunas do `plan.md` › *Modelo de dados*: `SGC_FASE`, `SGC_USUARIO_PERSONA`, `SGC_PEDIDO`, `SGC_COMUNICACAO` → `backend/setup-backend.mjs`
- [x] **T-002** — criar `add-005-quadro-compras.mjs` com o esqueleto do projeto (sem `configureSdkMitra` fora do `isEntrypoint()`, `export const definitions`, aviso de "não rode daqui") e a parte do **quadro**: upsert do quadro `compras` por slug, as 10 fases na ordem de F-01 (cor da rampa de dados, `concluido` tipo `sucesso`, `cancelado` tipo `cancelado`) e a linha correspondente em `SGC_FASE` por chave — idempotente nas duas pontas → `backend/add-005-quadro-compras.mjs`
- [x] **T-003** — no `add-005`, os **6 campos** do quadro (`fornecedor`, `filial`, `valor_total`, `prioridade` com as 3 opções, `alertas_pendentes`, `motivo_cancelamento`), todos com `OBRIGATORIO = FALSE` e sem `FASE_ID`; `NO_CARD` nos quatro primeiros e `CAPA_JSON` das fases `analise` e `cancelado` para os dois últimos → `backend/add-005-quadro-compras.mjs`
- [x] **T-004** — no `add-005`, as **11 automações** de e-mail da tabela do `plan.md` (gatilho `card_movido` por `faseId`, ação `enviar_email`, cópia fixa `compras@benenutri.com` nas dez primeiras, `{{anexos}}` na décima primeira), idempotentes por nome → `backend/add-005-quadro-compras.mjs`
- [x] **T-005** `[P]` — no `add-005`, as leituras: `sgcPersonaAtual`, `sgcPersonasListar`, `sgcPersonasListarTotal`, `sgcFasesListar`, `sgcComunicacoesListar`, `sgcNotificacoesListar`, `sgcNotificacoesListarTotal` (todas paginadas onde listam, filtro desligado `''`/`0`) → `backend/add-005-quadro-compras.mjs`
- [x] **T-006** — no `add-005`, as **regras ligadas** (os ids que vão para `KB_META` saem do helper do integrador `backend/ids-do-mapa.mjs`, nunca do `lerIdsDoMapa` da lib, que só devolve as `kbEsc*` — B-08): `sgcPodeMover` e `sgcPodeExcluir` no contrato da spec 013 (`{{usuarioId}}`, `{{cardId}}`, `{{boardId}}`, `{{faseId}}` → uma linha `PODE`/`MOTIVO`), com o `CASE` na ordem do `plan.md` e o bloco `PENDENCIAS` isolado e comentado como reserva da spec 003 → `backend/add-005-quadro-compras.mjs`
- [x] **T-007** — no `add-005`, as **escritas**, uma instrução cada. Guardadas por `:VAR_USER` (chamadas da tela), com a guarda de persona e a de fase: `sgcEscPedidoCriar`, `sgcEscPedidoTecnicaAprovar`, `sgcEscPedidoTecnicaReprovar`, `sgcEscPedidoDiretoriaAprovar`, `sgcEscPedidoDiretoriaReprovar`, `sgcEscPedidoCancelar`, `sgcEscPersonaSalvar`. Chamadas **por id**, com `{{usuarioId}}` e sem `:VAR_USER`: `sgcEscPedidoReprovacoesLimpar` (R-011, chamada pelo `sgcAnaliseSair` da 003 dentro do `antesDeMover`; input só `usuarioId` e `idCard`), `sgcEscPedidoCapaInserir` (R-010, para o cron da 004; `ORIGEM`/`ID_AGENDA`, idempotente por `ID_CARD`), `sgcEscPedidoEnvio` e `sgcEscComunicacaoInserir` → `backend/add-005-quadro-compras.mjs`
- [x] **T-008** — no `add-005`, `sgcPedidoCarregar` (JAVASCRIPT: capa + itens + alertas numa execução, nas colunas fechadas com a 003 — alerta por `CODPROD`, sem `ID_ITEM`) e `sgcEnvioIndustriaRegistrar` (JAVASCRIPT: persona e fase numa consulta com `:VAR_USER` → `sendEmailMitra` com a cópia fixa → comunicação → capa → `sgcEscAgendaEnvio` (004, id 7458, `{ idCard, dtEnvio }` com a data em `AAAA-MM-DD`) quando `ID_AGENDA > 0` → `kbNotaRegistrar`; a situação dos itens NÃO é gravada aqui: `sgcEscItemStatusFase` é `:VAR_USER` e sai da tela, na T-035) → `backend/add-005-quadro-compras.mjs`
- [x] **T-009** — bloco 002 do mapa: 22 nomes em `SERVER_FUNCTION_NAMES` e os ids locais `7201…7211` e `7250…7260` em `SERVER_FUNCTIONS`, no formato rígido (uma linha por entrada, sem comentário dentro do bloco) → `frontend/src/lib/server-functions.ts`
- [x] **T-010** — **(integrador)** pedir `instalar({ sdk, projectId, mapaFrontend: MAPA, ganchos: { podeMover: 'sgcPodeMover', podeExcluir: 'sgcPodeExcluir' } })` → `backend/add-001-kanban.mjs`
- [x] **T-011** — **(integrador)** pedir `add-005-quadro-compras.mjs` no `PUBLISH_ORDER` (depois do `add-004-fornecedores.mjs`) e as chaves novas do `CHECK_INPUT` listadas no `plan.md` › *Simulador* → `backend/simulator/config.mjs`

## Simulador

- [x] **T-020** — `seed002(db, CENARIO, { completo })`: `SGC_FASE` (10 chaves), `SGC_USUARIO_PERSONA` (admin 1, ana 2 analista, gil 3 gestor, dora 4 diretoria, leo 5 **comercial**) + 1 usuário sem persona, os 6 campos, as 11 automações, `KB_META` com os dois ganchos apontando para 7206/7207 (ids lidos por `backend/ids-do-mapa.mjs`, B-08), e os 6 pedidos (`analise`, `tecnica`, `diretoria`, `envio` sem envio, `enviado` com envio + 1 comunicação, `cancelado` com motivo); com `completo`, mais 2 alertas não lidos no P1 e 2 anexos no P5 → `backend/simulator/seed/002-quadro.mjs`
- [x] **T-021** — **(integrador)** pedir a chamada de `seed002` no `seedDatabase`, depois das fases → `backend/simulator/seed.mjs`
- [x] **T-022** — conferir no `sim:check` se `INSERT … ON DUPLICATE KEY UPDATE` (o upsert de `sgcEscPersonaSalvar`) traduz para SQLite; se não, abrir o shim ao integrador → `backend/simulator/mysql-dialect.mjs` **(integrador, se necessário)**

## Frontend

- [x] **T-030** `[P]` — `permissoes.ts`: `Persona` (`admin`, `analista`, `gestor`, `diretoria`, `comercial`), `NivelAcesso`, `personaDe` (sem persona → nível da plataforma: ADMIN→admin, MEMBER→analista, RESTRICTED→comercial; falha→analista) e `permissoesDe` com a matriz do `plan.md` (porte de `getPermissions`), `comercial` com `verQuadro` falso, `agendar` (admin, analista, gestor — R-005) e `cancelarAgendamento` (admin, gestor, diretoria — P-10) para a spec 004 consumir (B-02), `READ_ONLY` zerando a operação e `RESTRICTED` ligando `somenteProprios` → `frontend/src/lib/permissoes.ts`
- [x] **T-031** `[P]` — `transicoes.ts`: `FASES`, `TRANSICOES` (22 pares), `MOTIVOS` com os textos de recusa e `motivoDeDestino` na mesma ordem do `CASE` da SQL → `frontend/src/lib/transicoes.ts`
- [x] **T-032** `[P]` — `pedido.ts`: `tituloDoPedido`, `periodoPadrao` (45 dias), `validarNovoPedido`, `validarMotivo`, `validarEnvio`, `PRIORIDADES` → `frontend/src/lib/pedido.ts`
- [x] **T-033** — `persona.ts`: lê `sgcPersonaAtual` uma vez por sessão, guarda em memória, limpa no logout e devolve `{ persona, acesso, usuarioId, permissoes }` → `frontend/src/lib/persona.ts`
- [x] **T-034** — `lib/quadro.ts` ganha `ROTULO_NOVO_PEDIDO`, `ROTA_NOVO_PEDIDO` e `ATUALIZAR_A_CADA_MS` (é o que o teste lê); `QuadroPage`: `novoCard` ("Novo pedido" → `/pedidos/novo`), `atualizarACadaMs`, `podeMover` (sobre `motivoDeDestino`), `antesDeMover` (saída da Análise: `sgcAnaliseSair` da 003 — uma chamada que verifica e, passando, arruma; `{ ok: false, erro }` recusa sem gravar), `podeExcluir` (espelho de `permissoesDe`) e `acoesExtras` → `frontend/src/lib/quadro.ts`, `frontend/src/pages/quadro/QuadroPage.tsx`
- [x] **T-035** — `AcoesDoPedido`: os 7 botões por fase e persona, desabilitados com o motivo no `title` quando falta permissão; aprovar na diretoria e registrar envio chamam `sgcEscItemStatusFase` (003) com `status: 'aprovado'`/`'enviado'` antes do `ctx.mover` (F-07, C-03), e os diálogos de motivo (reprovação técnica com produtos, reprovação da diretoria, cancelamento) e de envio (canal, contato, data no `DatePicker` da spec 004, número do pedido, observação), no padrão §9.5 → `frontend/src/pages/quadro/AcoesDoPedido.tsx`
- [x] **T-036** `[P]` — guardas de persona: em `QuadroAdminPage`, sem `administrarQuadro` → `Alert` com o motivo e link para `/quadro`, sem renderizar o `BoardAdmin`; em `QuadroPage`, sem `verQuadro` (persona comercial) → `Alert` "Seu perfil não tem acesso ao quadro de compras." e nada de `KanbanBoard` (RN-021) → `frontend/src/pages/quadro/QuadroAdminPage.tsx`, `frontend/src/pages/quadro/QuadroPage.tsx`
- [x] **T-037** — `NovoPedidoPage`: fornecedor por `sgcFornecedorListar({ ativo: 1 })` (nunca `sgcWintFornecedores` — R-002/C-08) e filial por `sgcFornecedorCarregar(codfornec).filiais` (única fonte, C-09), período com o padrão de 45 dias no `DatePicker` da spec 004 (UI-03 B), prioridade e título em pré-visualização; grava com `api.cardCriar` (`valores` com fornecedor, filial e prioridade) + `sgcEscPedidoCriar` e navega para `/quadro?card=<id>` → `frontend/src/pages/pedidos/NovoPedidoPage.tsx`
- [x] **T-038** `[P]` — `NotificacoesPage`: `sgcNotificacoesListar` + `…Total`, páginas de 25, `Badge` por tipo, link para o pedido, `EmptyState` "Tudo em dia" → `frontend/src/pages/notificacoes/NotificacoesPage.tsx`
- [x] **T-039** `[P]` — `SegurancaPage`: busca, tabela de usuários com `SelectMenu` de persona por linha (`sgcEscPersonaSalvar`), paginação, e recusa visível para quem não é admin nem diretoria → `frontend/src/pages/seguranca/SegurancaPage.tsx`
- [x] **T-040** — **(integrador)** pedir as rotas `/pedidos/novo`, `/notificacoes` e `/seguranca` e os itens de menu correspondentes, filtrados por permissão: a persona comercial não vê Quadro, Agenda nem Fornecedores (P-03, RN-021) → `frontend/src/App.tsx`, `frontend/src/components/AdminLayout.tsx`
- [x] **T-094** — R-141: capa do pedido no topo de toda fase depois da Análise (`lib/capa-do-pedido.ts`, `abas/CapaDoPedido.tsx`; a capa do `PedidoProvider` ganha aprovações, envio, faturado e cancelamento do mesmo `sgcPedidoCarregar`) → `frontend/src/pages/quadros/abas/`
- [x] **T-095** — R-141: "Análise para aprovação" nas fases Técnica e Diretoria (`lib/aprovacao.ts`, `abas/Aprovacao.tsx`), antes do bloco Itens → `frontend/src/pages/quadros/abas/Aprovacao.tsx`
- [x] **T-096** — R-141: bloco Envio (resumo para a indústria, Copiar itens, Arquivo WinThor, itens em cartões, Registrar envio) e bloco Enviado (envio registrado, próximo movimento, itens recolhidos); `registrarEnvio` sai do `AcoesDoPedido` para `registrar-envio.ts`, usado pelos dois → `frontend/src/pages/quadros/`
- [x] **T-097** — R-141: Cancelado mostra os itens só de consulta (`abas/ItensDoPedido.tsx`) em vez do bloco Itens editável da Análise → `frontend/src/lib/conteudo-da-fase.ts`
- [x] **T-098** — R-147 (P-1): seção "Compras × vendas do fornecedor" na aprovação, recolhida, que lê `sgcWintComprasVsVendas` (009) só ao abrir → `frontend/src/pages/quadros/abas/Aprovacao.tsx`, `frontend/src/lib/aprovacao.ts`

## Testes

Obrigatório: uma task por linha da seção **Testes** do `plan.md` — agrupadas
por arquivo e bloco, com os ids de cada `teste()`/`test()` explícitos.

Todos os `teste()` do backend ficam em `backend/simulator/smoke/002-quadro.mjs`,
com o id no título.

- [x] **T-080** — criação do pedido: `C-001` (card na `analise`, título gerado, criador e responsável, 1 linha em `SGC_PEDIDO` com `ORIGEM = manual`) e a variante do cron, `sgcEscPedidoCapaInserir` com `origem: agenda` e `idAgenda` (R-010)
- [x] **T-081** — movimentação: `C-004`, `C-005`, `C-006`, `C-007`, `C-012`, `C-021`, `RN-004`, `RN-011`, `RN-020` — cada um com o par de fases, a persona e o `MOTIVO` esperado
- [x] **T-082** — personas e acessos: `C-008` (READ_ONLY), `C-009` (RESTRICTED), `C-010`, `C-011` (gancho em `KB_META` e chamada direta), `C-044` e `RN-021` (comercial recusada em mover e excluir), `RN-001` pelo servidor
- [x] **T-083** — aprovação técnica e da diretoria: `C-013`, `C-014`, `C-015`, `C-016`, `C-017`, `C-018`, `C-019`, `C-020`, `RN-009`, `RN-010`
- [x] **T-084** — cancelamento: `C-022`, `C-024`, `C-025`, `RN-006`, `RN-007`
- [x] **T-085** — envio à indústria: `C-027`, `C-028`, `C-029`, `C-030`, `C-031`, `RN-013`
- [x] **T-086** — e-mails e histórico: `C-032`, `C-033`, `C-034`, `C-043`, `RN-019`
- [x] **T-087** — quadro, exclusão, notificações e segurança: `C-035`, `C-038`, `C-039`, `C-041`, `C-042`, `RN-015`, `RN-017`, `RN-018`, `RNF-003`
- [x] **T-088** — orçamento e equivalência: `RNF-001` (abrir pedido = 2 execuções), `RNF-004` (1 linha) e `RNF-005` (500 combinações de `motivoDeDestino` × `sgcPodeMover` sem divergência)
- [x] **T-089** `[P]` — testes de tela (`node --test`), um arquivo por módulo puro: `permissoes.test.mjs` (`RN-001`, `RN-002`, `RN-016`, `RN-021`, `C-038`, `C-040`, `C-044`), `transicoes.test.mjs` (`RN-003`, `RN-004`, `RN-005`, `RN-008`, `C-008`, `C-023`, `C-026`) e `pedido.test.mjs` (`C-002`, `C-003`, `C-036`, `C-037`, `RN-012`, `RN-014`, `RNF-002`) → `frontend/tests/`

## Verificação

- [x] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`), com o `002-quadro.mjs` na suíte
- [x] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-092** — verificação manual no simulador, com os 5 logins do seed: C-035 (a capa do cartão), C-040 (ação desabilitada com o motivo), C-023 (destino apagado ao lado da ação "Cancelar compra"), C-041 e C-042 (as duas telas novas)
- [ ] **T-093** — as quatro telas nos dois temas (claro e escuro), sem cor literal e sem `style={{}}`

- [x] **T-034b** — *(2026-10-30, R-118)* `NovoPedidoPage` vira `NovoPedidoDialogo` (janela sobre o quadro, estado na URL `?novo=1`); `QuadroPage` abre a janela no `novoCard` e remonta o quadro ao criar; `/pedidos/novo` redireciona para `/quadro?novo=1`; item de menu, ícone e `ROTA_NOVO_PEDIDO` saem; testes C-036 e do menu ajustados → `frontend/src/pages/pedidos/NovoPedidoDialogo.tsx`, `pages/quadros/QuadroPage.tsx`, `App.tsx`, `lib/permissoes.ts`, `components/AdminLayout.tsx`, `lib/quadro.ts`
- [x] **T-034c** — *(2026-10-30, R-119)* `lib/data.ts` ganha `diasRelativos`, `resolverRelativo` e `diasEntre` (testes em `tests/data.test.mjs`, C-045); `DatePicker` ganha a prop opcional `relativo` (sem ela, idêntico ao de hoje); a janela "Novo pedido" usa a prop nos dois campos do período e mostra "Período de N dias" → `frontend/src/lib/data.ts`, `components/DatePicker.tsx`, `pages/pedidos/NovoPedidoDialogo.tsx`

## Dependências

```
T-001 → T-002 → T-003 · T-004 · T-005 · T-006 · T-007 → T-008
T-002 → T-009 → T-010 · T-011 · T-020
T-020 → T-021 → T-080…T-088
T-030 [P] · T-031 [P] · T-032 [P] → T-033 → T-034 → T-035
T-009 → T-037 · T-038 · T-039 → T-040
T-030 · T-031 · T-032 · T-034 → T-089
T-080…T-089 → T-090 · T-091 → T-092 → T-093
```

Fora desta feature: a spec 001 precisa estar publicada para T-037 (fornecedor
e filial) e para o diálogo de envio de T-035; a spec 003 entra depois, no
bloco `PENDENCIAS` de T-006 e nas `abasExtras` de T-034.

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001, C-002 | T-001, T-007, T-032, T-037 | T-080, T-089 |
| RF-001 (R-010, capa pelo cron) | T-007 | T-080 |
| RF-002, RF-003 / C-003 | T-032, T-037 | T-089 |
| RF-004 / C-001 | T-037 | T-080 |
| RF-005 / RN-020 | T-002 | T-081 |
| RF-006 / C-035 | T-003, T-020 | T-087 |
| RF-007 / C-037 | T-034 | T-089 |
| RF-008 / C-036 | T-034 | T-089 |
| RF-009, RF-010 / C-004…C-007, C-012, C-021, RN-003, RN-004, RN-005, RN-008, RN-011 | T-006, T-031, T-034 | T-081, T-089 |
| RF-011 / C-011 | T-006, T-010 | T-082, T-088 |
| RF-012 / C-008, C-009, C-010, RN-001, RN-002 | T-005, T-030, T-033 | T-082, T-089 |
| RF-033 / C-044, RN-021 | T-006, T-030, T-036, T-040 | T-082, T-089 |
| RF-013, RF-014 / C-013, C-014, C-015, C-017, RN-009 | T-007, T-035 | T-083 |
| RF-015 / C-016, RN-010 (R-011: quem chama é a 003) | T-007, T-034 | T-083 |
| RF-016, RF-017, RF-018 / C-018, C-019, C-020 | T-007, T-035 | T-083 |
| RF-019 / C-022, C-023, C-024, C-025, RN-006, RN-007 | T-003, T-007, T-031, T-035 | T-084, T-089 |
| RF-020, RF-021 / C-027, C-028, C-030, RN-012 | T-008, T-032, T-035 | T-085, T-089 |
| RF-022 / C-029, RN-013 | T-006 | T-085 |
| RF-023 / C-027, C-030 | T-005, T-007, T-008 | T-085 |
| RF-024 / C-031 | T-008 | T-085 |
| RF-025, RF-026 / C-032, C-033, C-034 | T-004 | T-086 |
| RF-027 / C-039, RN-015 | T-006, T-034 | T-087 |
| RF-028 / C-038, RN-016 | T-030, T-036 | T-087, T-089 |
| RF-029 / C-041 | T-005, T-038 | T-087 |
| RF-030 / C-042 | T-005, T-007, T-039 | T-087 |
| RF-031 / C-043, RN-019 | T-008, T-035 | T-086 |
| RF-032 / C-040 | T-035 | T-089 |
| RN-017 | T-003 | T-087 |
| RN-018 | T-003, T-007 | T-087 |
| RNF-001, RNF-004, RNF-005 | T-006, T-008, T-031 | T-088 |
| RNF-002 | T-034 | T-089 |
| RNF-003 | T-005, T-038, T-039 | T-087 |
