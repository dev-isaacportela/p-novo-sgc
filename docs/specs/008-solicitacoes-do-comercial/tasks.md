# Tasks: Solicitações do comercial — registro, avaliação, vínculo ao pedido e rastreio

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir à base / ao integrador** = arquivo compartilhado; esta feature não o edita.

## Backend

- [x] **T-001** — **Pedir à BASE (S2), antes do fan-out**: `SGC_SOLICITACAO` e
  `SGC_SOLICITACAO_HISTORICO` com as colunas e os 5 índices da seção *Modelo de dados*, e a
  coluna `SGC_PEDIDO_ITEM.ID_SOLICITACAO INT DEFAULT 0` — tudo **no `CREATE`**, sem `ALTER`
  (a onda 3 edita o `CREATE`; nada foi publicado) → `backend/setup-backend.mjs`
- [x] **T-002** — **Pedir à base (S2)**: `backend/lib/fragmentos.mjs` com `fragmento(nome)`
  — o `fragmentoDePendencias()` do `add-005` movido para lá, com o `add-005` passando a
  consumi-lo (R-074). É pré-requisito de T-003 → `backend/lib/fragmentos.mjs`,
  `backend/add-005-quadro-compras.mjs`
- [x] **T-003** — Criar `backend/sql/situacao-solicitacao.sql` (R-070/R-075): cabeçalho em
  `--` com o **contrato de composição** (aliases `S`, `C`, `SF`, `I` e os três `LEFT JOIN`
  obrigatórios, no formato de `backend/sql/pendencias-transito.sql`) e o corpo com o `CASE`
  escalar da régua. É o arquivo que o `add-012` da 009 também compõe →
  `backend/sql/situacao-solicitacao.sql`
- [x] **T-004** — Criar `add-011-solicitacoes.mjs` com o esqueleto padrão (`definitions`
  exportado, preâmbulo JS do `add-006` com `chamar`/`desembrulhar`/`linhasDe`/`consultar`/
  `texto`/`inteiro`/`numero`/`agora`/`persona`/`pedidoEmAnalise`/`FORA_DA_ANALISE`,
  `__SGC_IDS__` com as SFs chamadas por id, `isEntrypoint()` resolvendo o `jdbcId` do
  WinThor por nome, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`),
  mais as constantes do módulo: a guarda R-013 (`REGISTRAR`, `AVALIAR`, `HISTORICO`) com o
  trecho `faseEDono` de C-12, `const SITUACAO = fragmento('situacao-solicitacao.sql')`, o
  `RECORTE_COMERCIAL` e a função `selectSolicitacoes(filtros, whereExtra)` de C-11 →
  `backend/add-011-solicitacoes.mjs`
- [x] **T-005** `[P]` — `sgcWintClienteBuscar` (7801): `PCCLIENT` por `CODCLI`, por parte do
  nome e por CNPJ sem pontuação, `ROWNUM <= 20` → `backend/add-011-solicitacoes.mjs`
- [x] **T-006** `[P]` — `sgcWintRastreioSolicitacoes` (7802): o porte da consulta do
  p-45547, com `{{pares}}` explodido por `CONNECT BY`, o giro de 90 dias por
  `PCEST.QTVENDMES/1/2`, `QT_VENDIDA_CLIENTE_GERAL` sem filtro de filial e `DTCANCEL IS
  NULL` nos dois lugares → `backend/add-011-solicitacoes.mjs`
- [x] **T-007** — `sgcSolicitacoesListar` (7803) e `sgcSolicitacoesListarTotal` (7804) por
  `selectSolicitacoes(FILTROS_PUBLICADOS)`: as 26 colunas, os 7 filtros desligáveis, os três
  `LEFT JOIN` com os aliases `C`/`SF`/`I` de R-075, a coluna e o filtro de `SITUACAO` pelo
  mesmo `${SITUACAO}`, o `RECORTE_COMERCIAL` e `LIMIT/OFFSET` →
  `backend/add-011-solicitacoes.mjs`
- [x] **T-008** `[P]` — `sgcSolicitacoesDaMontagem` (7805): ativas do mesmo fornecedor e
  filial do `{{cardId}}`, `QT_NO_PEDIDO`, ordem `FIELD(prioridade)` + `CRIADO_EM`, teto de
  100 → `backend/add-011-solicitacoes.mjs`
- [x] **T-009** — Escritas de tela: `sgcEscSolicitacaoInserir` (7850, validações de RN-001
  no `WHERE` + `FROM DUAL`), `sgcEscSolicitacaoAvaliar` (7851), `sgcEscSolicitacaoCancelar`
  (7852, só o autor e só pendente), `sgcEscSolicitacaoDesvincular` (7854, critério "não
  existe item vivo") e `sgcEscSolicitacaoHistoricoInserir` (7855, `{{id}}` OU o critério do
  card) — todas com `:VAR_USER` + a guarda R-013 copiada literal; e, nas duas que recebem
  card (7854 e 7855), o trecho de **fase e dono** de C-12 dentro do mesmo `EXISTS`
  (`SF.CHAVE = 'analise'` + `C.CRIADO_POR = :VAR_USER` quando `RESTRICTED`), condicionado a
  `{{idCard}} = 0 OR …` em 7855 → `backend/add-011-solicitacoes.mjs`
- [x] **T-010** — Escritas internas: `sgcEscSolicitacaoVincular` (7853, exige `ID_CARD = 0`
  e **não** reescreve `AVALIADO_EM` já preenchido), `sgcEscItemDeSolicitacaoInserir` (7856,
  upsert com a cláusula `ON DUPLICATE KEY UPDATE` **na ordem de B-4**: todo `VALUES()` antes
  do único literal, que fica na última atribuição) e `sgcEscSolicitacaoHistoricoRegistrar`
  (7857) — todas com `{{usuarioId}}` e a **mesma** guarda (A1) →
  `backend/add-011-solicitacoes.mjs`
- [x] **T-011** — `sgcSolicitacaoCarregar` (7806, JAVASCRIPT): a linha por
  `selectSolicitacoes('', 'AND S.ID = ' + inteiro(event.id))` — **sem marcador de filtro**,
  C-11 —, o histórico, e a linha `criada` **derivada** de `CRIADO_POR`/`CRIADO_EM` na frente
  da lista (D-003); uma execução → `backend/add-011-solicitacoes.mjs`
- [x] **T-012** — `sgcSolicitacaoIncluirNoPedido` (7807, JAVASCRIPT): persona →
  `pedidoEmAnalise` → conferência de status, vínculo existente, fornecedor e filial →
  histórico `aprovada` (se pendente) → item → **releitura do item** (A-2) → vínculo →
  **releitura da solicitação** → histórico `vinculada` → `kbNotaRegistrar` em `try/catch`
  (D-07); no máximo 5 execuções aninhadas → `backend/add-011-solicitacoes.mjs`
- [x] **T-013** — **Pedir ao integrador**: `add-011-solicitacoes.mjs` no `PUBLISH_ORDER`,
  depois do `add-010` → `backend/simulator/config.mjs`

## Simulador

- [x] **T-020** — **Pedir ao integrador**: `PCCLIENT.CGCENT VARCHAR(20)` e
  `PCMOV.DTCANCEL VARCHAR(10)` (R-062) → `backend/simulator/schema-winthor.mjs`
- [x] **T-021** — **Pedir ao integrador**: shim escalar `REGEXP_SUBSTR(texto, padrao,
  inicio, ocorrencia)` (só as formas `'[^,]+'` e `'[^:]+'`, `null` fora da ocorrência) e a
  reescrita textual do gerador `SELECT <expr(LEVEL)> FROM DUAL CONNECT BY <expr(LEVEL)> IS
  NOT NULL` para a CTE `WITH RECURSIVE NIVEL(LVL) …` de 200 níveis, com a fusão do `WITH
  PARES AS` (texto exato na seção *Dialeto* do plan) →
  `backend/simulator/mysql-dialect.mjs`
- [x] **T-022** — Seed `008-solicitacoes.mjs`, **só INSERT**: os 5 produtos 5301–5305 do
  fornecedor 1042 (`NESTLE BRASIL LTDA`, o nome exato do seed da 001 — C-1), os 5 clientes
  9201–9205 com `CGCENT`, as linhas de `PCEST` da **filial 3** com datas relativas a hoje,
  as 5 linhas de `PCMOV` a partir de `NUMTRANSITEM` **950001** (incluindo a entrada e a
  venda anterior à referência, que são controle), os **3 cards próprios** de `CARDS_008`
  (R-073; todos com `DT_ENVIO` vazio, sem `SGC_NF` e sem `SGC_BO_ITEM` — R-045), o item
  5301 do card `vinculado` com `ID_SOLICITACAO`, as **15 linhas** de `SGC_SOLICITACAO`
  exportadas em `SOLICITACOES_008` — incluindo a `pendenteMesmoProduto` que C-013/RN-009
  exigem (C-2) — e as 5 linhas de histórico. Nenhum fornecedor, filial, persona ou produto
  de outra spec (R-017) → `backend/simulator/seed/008-solicitacoes.mjs`
- [x] **T-023** — **Pedir ao integrador**: `seed008` na cadeia do `seedDatabase`, depois do
  `seed007` → `backend/simulator/seed.mjs`
- [x] **T-024** — **Pedir ao integrador**: a seção 008 do `CHECK_INPUT` com **quatro chaves
  novas e nenhuma repetida** (D-17): `codcli: '0'`, `pares: '5301:3:2026-08-01:9201'`,
  `minhas: '0'`, `vendedor: '0'` → `backend/simulator/config.mjs`

## Frontend

- [x] **T-030** `[P]` — **Pedir à base (S2)**: as chaves `verSolicitacoes` (todas as
  personas, não zera com `READ_ONLY`), `criarSolicitacao` (admin, comercial) e
  `avaliarSolicitacao` (admin, analista, gestor) em `lib/permissoes.ts`, mais o item de
  menu `{ grupo: 'Compras', to: '/solicitacoes', label: 'Solicitações', exige:
  'verSolicitacoes' }` **antes** de "Produtos em B.O." → `frontend/src/lib/permissoes.ts`
- [x] **T-031** `[P]` — `lib/solicitacoes.ts`: `LIMITES_PADRAO`, `PARES_POR_LOTE`,
  `RASTREIO_MAX_CARACTERES`, `prioridadeDe`, `ordemDaPrioridade`, `rotuloSituacao`,
  `rotuloStatus`, `rotuloVenda`, `rotuloEstoque`, `validarSolicitacao`, `buscaDeCliente`,
  `chaveRastreio`, `dataReferencia`, `montarPares`, `lotesDePares`, `classificarRastreio`,
  `indexarRastreio`, `resumoRastreio`, `colunasDoCsv`, `linhaDoCsv` →
  `frontend/src/lib/solicitacoes.ts`
- [x] **T-032** — Bloco 78xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (7801–7807 e
  7850–7857), no formato rígido do arquivo, e a faixa citada no cabeçalho →
  `frontend/src/lib/server-functions.ts`
- [x] **T-033** — `SolicitacoesPage`: porteiro de rota por `verSolicitacoes`, lista
  paginada por `sgcSolicitacoesListar`/`Total`, filtros (status, situação, fornecedor,
  filial, "minhas", busca), colunas de status **e** de situação separadas, controles
  desabilitados com o motivo no `title` para quem não opera →
  `frontend/src/pages/solicitacoes/SolicitacoesPage.tsx`
- [x] **T-034** — Diálogos: `NovaSolicitacaoDialogo` (busca de produto pelo
  `abas/BuscarProduto.tsx` da 003, nome do fornecedor por `sgcWintFornecedores`, filiais
  por `sgcWintFiliais`, busca de cliente por `sgcWintClienteBuscar`, validação por
  `validarSolicitacao` antes de chamar, formulário preservado no erro), `AvaliarDialogo`
  (aprovar / recusar com contador de 10 caracteres) e `DetalheSolicitacaoDialogo`
  (`sgcSolicitacaoCarregar`, histórico em linha do tempo) →
  `frontend/src/pages/solicitacoes/solicitacoes-dialogos.tsx`
- [x] **T-035** — `RastreioPainel`: monta os pares das aprovadas da página, fatia em lotes
  de 120, chama `sgcWintRastreioSolicitacoes` por lote com `Promise.allSettled` (lote que
  falha vira `sem_dado` e vira `Alert`), desenha os **dois eixos em colunas separadas**,
  os três limites como campos que reclassificam em memória, e a exportação por
  `textoCsv`/`baixarCsv` → `frontend/src/pages/solicitacoes/RastreioPainel.tsx`
- [x] **T-036** — `BlocoSolicitacoes(ctx: ExtensaoContexto)` — **a entrega desta spec em
  S3 é o componente** (C-3): **uma** chamada de
  `sgcSolicitacoesDaMontagem` ao abrir, aviso quando `QT_NO_PEDIDO > 0`, ações "Incluir no
  pedido" (`sgcSolicitacaoIncluirNoPedido` → `ctx.recarregar()` + `pedido.recarregar`) e
  "Recusar" (`sgcEscSolicitacaoAvaliar` + `sgcEscSolicitacaoHistoricoInserir`), tudo
  desabilitado sem `podeEditar` do `usePedido()` →
  `frontend/src/pages/quadros/abas/Solicitacoes.tsx`
- [ ] **T-037** — **Pedir ao integrador (S4)** — é integração, não entrega da 008 em S3
  (C-3 da revisão cruzada): ligar o bloco ao card. O trecho vai pronto:
  `frontend/src/lib/conteudo-da-fase.ts` ganha `'solicitacoes'` no tipo `Bloco` e
  `analise: ['solicitacoes', 'itens', 'alertas']` (R-054: antes de Itens; `tecnica` e
  `diretoria` continuam `['itens', 'alertas']`); `ConteudoDaFase.tsx` ganha
  `case 'solicitacoes': return <BlocoSolicitacoes {...ctx} />;`; `App.tsx` ganha a rota
  `/solicitacoes`; e **`frontend/tests/conteudo-da-fase.test.mjs:18`** passa a esperar
  `['solicitacoes', 'itens', 'alertas']` para `analise`, mantendo `['itens', 'alertas']`
  para `tecnica` e `diretoria` (hoje o laço cobre as três de uma vez) →
  `frontend/src/lib/conteudo-da-fase.ts`, `frontend/src/pages/quadros/abas/ConteudoDaFase.tsx`,
  `frontend/src/App.tsx`, `frontend/tests/conteudo-da-fase.test.mjs`
- [ ] **T-038** — **Da base (S2), por R-068** — não é pedido à 002/003 (C-4 da revisão
  cruzada): `sgcPedidoCarregar` passa a devolver `CRIADOR_NOME` na capa (010) e
  `ID_SOLICITACAO` + `SOLICITACAO_VENDEDOR` nos itens, sem execução a mais. Desta spec
  ficam os consumidores: `itemDeLinha` de `lib/compras.ts` lê os dois campos e a aba Itens
  mostra a etiqueta "Solicitação de &lt;vendedor&gt;" (RF-022) →
  `backend/add-005-quadro-compras.mjs` (base), `frontend/src/lib/compras.ts`,
  `frontend/src/pages/quadros/abas/Itens.tsx`
- [ ] **T-039** — **Pedir ao integrador (R-063)**: o par do desvínculo, **nesta ordem**
  (histórico primeiro, que precisa do `ID_CARD` ainda preenchido) — em `remover()` de
  `Itens.tsx`, depois de `sgcEscItemRemover`; e em `verificar-saida.ts`/`QuadroPage`,
  depois de `sgcAnaliseSair` devolver `ok`:
  `sgcEscSolicitacaoHistoricoInserir({ id: 0, idCard, evento: 'desvinculada', detalhe, em })`
  e `sgcEscSolicitacaoDesvincular({ idCard, atualizadoEm })`, mais `kbNotaRegistrar` em
  `try/catch` quando o item removido tinha `ID_SOLICITACAO > 0` (a nota de desvínculo de
  R-063) →
  `frontend/src/pages/quadros/abas/Itens.tsx`,
  `frontend/src/pages/quadros/abas/verificar-saida.ts`

## Testes

Cada id da seção **Testes** do `plan.md` aparece em exatamente uma task abaixo.

- [x] **T-080** — `teste('C-001 …')`, `teste('C-002 …')`, `teste('C-003 …')`,
  `teste('RN-001 …')`, `teste('RN-002 …')` e `teste('RN-004 …')` em
  `backend/simulator/smoke/008-solicitacoes.mjs`: o registro grava vendedor, fornecedor do
  produto, cliente com CNPJ e `AVALIADO_EM` vazio; sem cliente grava `CODCLI = 0`;
  quantidade 0 e justificativa de 9 caracteres não gravam (contagem medida no próprio
  teste, antes e depois)
- [x] **T-081** — `teste('C-004 …')`, `teste('C-005 …')`, `teste('C-006 …')`,
  `teste('RN-005 …')`, `teste('RN-006 …')` e `teste('RN-007 …')`: aprovar deixa `ID_CARD =
  0` e não cria card nem item (contagens iguais antes e depois); recusar exige 10
  caracteres; cancelar só a própria e só pendente
- [x] **T-082** — `teste('C-007 …')`, `teste('C-012 …')`, `teste('RN-012 …')`,
  `teste('RN-017 …')` e `teste('RNF-001 …')`: o bloco devolve 4 linhas na ordem
  urgente/alta/normal antiga/normal nova em **uma** chamada, sem a de outra filial, sem a de outro fornecedor
  e sem recusada/cancelada/vinculada
- [x] **T-083** — `teste('C-008 …')`, `teste('C-013 …')`, `teste('RN-009 …')`,
  `teste('RN-010 …')` e `teste('RNF-002 …')`: incluir cria o item com quantidade 24 e
  `ID_SOLICITACAO`, aprova a pendente, grava as duas linhas de histórico e a nota com
  "Leo"; incluir de novo é recusado; ao incluir a 2ª do 5301 (`pendenteMesmoProduto`) sobre o item já em `QT_PEDIDA = 24`, a quantidade é
  preservada, a `ID_SOLICITACAO` nova é gravada e o card continua com 1 item
- [x] **T-084** — `teste('C-009 …')`, `teste('C-010 …')` e `teste('RN-011 …')`: o par
  histórico + desvincular não mexe em solicitação de item vivo; com o item removido e com o
  item zerado, devolve **as duas** solicitações ligadas ao item à fila e o bloco volta a 4;
  recusar pelo bloco deixa `recusada` e o bloco em 3
- [x] **T-085** — `teste('C-011 …')` e `teste('RN-008 …')`: mover o card `vinculado` pelas
  10 fases devolve as 10 situações na ordem; item em `bo` na fase B.O. devolve
  `nao_atendida`; `ID_CARD = 0` devolve `sem_pedido`; o card e o item voltam ao estado
  original ao fim do teste
- [x] **T-086** — `teste('C-014 …')`, `teste('C-015 …')` e `teste('RN-015 …')` (parte
  servidor): `sgcWintRastreioSolicitacoes` com os 6 pares devolve **6 linhas (> 0)**, com
  `QT_VENDIDA_CLIENTE` 12 na primeira, `QT_VENDIDA_CLIENTE_GERAL` 8 e `QT_VENDIDA_CLIENTE`
  0 na segunda, `QT_VENDIDA_POS` 30 na quarta, `QT_VENDA_90D` 90 no 5304 e `QT_ESTOQUE`
  0/20/40/300 onde o seed manda; a venda de hoje−70 e a entrada `CODOPER='E'` ficam fora
- [x] **T-087** — `teste('C-018 …')`: `sgcWintClienteBuscar` pelas três formas devolve, cada
  uma, **≥ 1 linha (> 0)** com `CODCLI = 9201`, `CLIENTE` e `CNPJ`, e no máximo 20 linhas
- [x] **T-088** — `teste('C-019 …')` e `teste('RN-018 …')` (parte servidor): registrar como
  `ana`/`gil` não grava; avaliar como `leo`/`dora` não muda; incluir no pedido como `leo`,
  `dora`, `READ_ONLY` e analista `RESTRICTED` em card alheio devolve `ok: false` com a frase
  certa; como `gil`, grava; e desvincular/registrar histórico sobre o card `vinculado`
  (fase `enviado`) não grava linha nenhuma — a guarda de fase e dono de C-12 vale nas duas
- [x] **T-089** — `teste('C-020 …')`, `teste('C-021 …')` e `teste('C-022 …')`: a listagem
  recortada por `SOLICITACOES_008` devolve 15, com 5 pendentes e 1 recusada, a busca por
  "BEBIDA LACTEA" recorta e o total bate com o `COUNT` do próprio teste (R-045: nenhum
  literal absoluto); como `leo` só vêm as dele; `sgcSolicitacaoCarregar` de solicitação
  alheia como `leo` devolve `ok: false`; o histórico da `vinculada` tem as 5 linhas na ordem
- [x] **T-090** `[P]` — `test('C-002 …')`, `test('C-014 …')`, `test('C-015 …')`,
  `test('C-016 …')`, `test('C-017 …')`, `test('RN-003 …')`, `test('RN-013 …')` e
  `test('RN-014 …')` em `frontend/tests/solicitacoes.test.mjs`: `classificarRastreio` nos
  dois eixos, linha ausente → `sem_dado` nos dois, e a reclassificação por limite sem
  entrada nova
- [x] **T-091** `[P]` — `test('C-003 …')`, `test('C-018 …')`, `test('C-023 …')`,
  `test('RN-001 …')`, `test('RN-016 …')`, `test('RN-017 …')` e `test('RNF-003 …')` em
  `frontend/tests/solicitacoes.test.mjs`: `validarSolicitacao`, `buscaDeCliente`,
  `montarPares`/`lotesDePares` (120 → 1 lote, 121 → 2, teto de 4000 caracteres, alvo sem
  `AVALIADO_EM` fora), `prioridadeDe`/`ordemDaPrioridade`, `colunasDoCsv`/`linhaDoCsv`
- [x] **T-092** `[P]` — `test('C-019 …')` e `test('RN-018 …')` (parte tela) em
  `frontend/tests/permissoes.test.mjs` (**arquivo da 002**): as três chaves novas por
  persona e por nível de acesso, e `menuParaPersona` devolvendo exatamente 2 itens para o
  comercial (`/solicitacoes` e `/bo`)

## Verificação

- [x] **T-095** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); as duas
  consultas ao WinThor com contagem > 0
- [x] **T-096** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-097** — Verificação manual no simulador: C-001 (o formulário com as duas buscas),
  C-007 (o bloco acima dos itens na montagem), C-014/C-015 (os dois eixos lado a lado),
  C-019 (controles desabilitados, nunca escondidos), C-021 (o menu do comercial com dois
  itens)
- [ ] **T-098** — Tema claro e tema escuro sem cor quebrada na tela, nos diálogos, no
  painel de rastreio e no bloco do card

### O que ficou aberto na entrega da S3 (2026-09-16)

- **T-037, T-038 (consumidores), T-039** são integração (S4): ligar o bloco em
  `BLOCOS_POR_FASE.analise`/`ConteudoDaFase.tsx`, a etiqueta de origem na aba Itens e o par
  `HistoricoInserir('desvinculada')` + `Desvincular` depois de `sgcEscItemRemover` e de
  `sgcAnaliseSair`. Os trechos prontos vão no relatório da feature.
- **T-097 e T-098** (simulador no navegador, dois temas) não foram feitas: a S3 não sobe
  servidor. O que teste cobre está verde; o ensaio de tela fica para a S4.
- Dois arquivos compartilhados precisaram de mudança mínima, cada uma em commit
  `chore(integração)` próprio: o shim `TO_NUMBER` em `simulator/mysql-dialect.mjs` (o
  rastreio usa `TO_NUMBER(REGEXP_SUBSTR(...))` e o SQLite não tem a função) e a asserção de
  `S0-014` em `smoke/000-dialeto.mjs`, que exigia `SGC_SOLICITACAO` vazia.
- A metade de tela de C-019/RN-018 ficou em `tests/solicitacoes.test.mjs`, e não em
  `tests/permissoes.test.mjs` (arquivo da 002), para a 008 não disputar o mesmo arquivo com
  a 009 no fan-out.

## Dependências

```
T-001 · T-002 → T-003 → T-004 → T-005 · T-006 · T-007 · T-008 · T-009 · T-010
T-009 + T-010 → T-011 · T-012
T-004 → T-013
T-020 · T-021 → T-022 → T-023 · T-024
T-030 · T-031 · T-032 [P] independentes do backend
T-032 + T-007 → T-033 → T-034 · T-035
T-032 + T-008 + T-012 → T-036 → T-037
T-038 → T-039
T-022 + T-005..T-012 → T-080 … T-089
T-031 + T-030 → T-090 · T-091 · T-092
tudo → T-095 · T-096 → T-097 · T-098
```

`T-002` (loader `fragmento`) e `T-003` (o arquivo da régua) abrem a fila: sem os dois o
`add-011` não compõe `SITUACAO`, e o `add-012` da 009 depende do mesmo arquivo (R-070).

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001, RF-004 / C-001, C-002, C-003, RN-001 | T-001, T-009, T-031, T-034 | T-080, T-091 |
| RF-002 / C-001, RN-002, RN-004 | T-009, T-034 | T-080 |
| RF-003 / C-018 | T-005, T-031, T-034 | T-087, T-091 |
| RF-005, RF-006 / C-004, C-005, RN-005, RN-006 | T-009, T-033, T-034 | T-081 |
| RF-007 / C-006, RN-007 | T-009, T-033 | T-081 |
| RF-008 / C-007, C-012, RN-012, RN-017 | T-008, T-022, T-036 | T-082, T-091 |
| RF-009 / C-008, RN-010 | T-010, T-012, T-036 | T-083 |
| RF-010 / C-013, RN-009 | T-010, T-012, T-022 | T-083 |
| RF-011 / C-009, RN-011 | T-009, T-039 | T-084 |
| RF-012 / C-011, RN-008 | T-002, T-003, T-007 | T-085 |
| RF-013 / C-022 | T-009, T-010, T-011 | T-089 |
| RF-014, RF-015 / C-014, C-015, RN-013, RN-014, RN-015 | T-006, T-022, T-031, T-035 | T-086, T-090 |
| RF-016 / C-017 | T-031, T-035 | T-090 |
| RF-017 / C-016, RN-016 | T-031, T-035 | T-090, T-091 |
| RF-018 / C-020 | T-007, T-033 | T-089 |
| RF-019 / C-021 | T-007 | T-089 |
| RF-020 / C-019, RN-018 | T-009, T-010, T-012, T-030, T-033, T-036 | T-088, T-092 |
| RF-021 / C-023 | T-031, T-035 | T-091 |
| RF-022 / C-008 | T-010, T-038 | T-083 |
| RNF-001 | T-008, T-036 | T-082 |
| RNF-002 | T-012 | T-083 |
| RNF-003, RNF-004 | T-031, T-035 | T-090, T-091 |
| RNF-005 | T-007, T-033 | T-089 |
| RNF-006 | T-005, T-006 | T-086, T-087 |
