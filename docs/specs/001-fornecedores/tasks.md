# Tasks: Fornecedores — cadastro do ERP e parametrização de compra

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[INT]` = arquivo compartilhado: **pedir ao integrador**, não editar aqui.

## Backend

- [x] **T-001** `[INT]` — DDL das 7 tabelas em `backend/setup-backend.mjs`, um template literal `CREATE TABLE IF NOT EXISTS NOME (` por tabela, com as colunas exatas da seção **Modelo de dados** do `plan.md`: `SGC_FORNECEDOR` (`ID`, `CODFORNEC`, `FORNECEDOR`, `CNPJ`, `CNPJ_FORMATADO`, `PRAZO_ENTREGA_DIAS`, `PRAZO_ENTREGA_TIPO`, `PEDIDO_MINIMO`, `FECHAMENTO_DIA_INICIO`, `FECHAMENTO_DIA_FIM`, `LINK_PLATAFORMA`, `VALIDADE_MINIMA_DIAS`, `SLA_ANALISE_DIAS`, `SLA_FATURAMENTO_DIAS`, `ATIVO`, `CRIADO_POR`, `CRIADO_EM`, `ATUALIZADO_POR`, `ATUALIZADO_EM`) · `SGC_FORNECEDOR_FILIAL` (`ID`, `FORNECEDOR_ID`, `CODFILIAL`, `FILIAL`) · `SGC_FORNECEDOR_LINHA` (`ID`, `FORNECEDOR_ID`, `NOME`, `ORDEM`) · `SGC_FORNECEDOR_LINHA_CONTATO` (`ID`, `LINHA_ID`, `NOME`, `EMAIL`) · `SGC_FORNECEDOR_FAIXA_PRAZO` (`ID`, `LINHA_ID`, `VALOR_DE`, `VALOR_ATE`, `ROTULO`, `PARCELAS`, `ORDEM`) · `SGC_FORNECEDOR_DOCUMENTO` (`ID`, `FORNECEDOR_ID`, `TIPO`, `NOME`, `ENDERECO`, `VENCIMENTO`, `CRIADO_POR`, `CRIADO_EM`) · `SGC_FORNECEDOR_LOG` (`ID`, `FORNECEDOR_ID`, `CAMPO`, `DE`, `PARA`, `POR`, `EM`). Índice único em `SGC_FORNECEDOR(CODFORNEC)`. **As tabelas `PC*` do WinThor não entram aqui** (D-006)
- [x] **T-002** — `backend/add-004-fornecedores.mjs`: esqueleto do script — `export const definitions` com as 19 SFs, publicação só dentro de `isEntrypoint()`, `jdbcId` do WinThor resolvido **por nome** na publicação (as duas `sgcWint*` recebem esse id; as demais ficam no JDBC interno)
- [x] **T-003** — `sgcFornecedorListar` e `sgcFornecedorListarTotal` (SQL) em `add-004-fornecedores.mjs`: filtros `busca` (nome, CNPJ ou código via `CONCAT('', CODFORNEC)`), `codfilial` (por `EXISTS` em `SGC_FORNECEDOR_FILIAL`), `ativo` (`0` todos · `1` ativos · `2` inativos), `LIMIT {{limite}} OFFSET {{offset}}`, `ORDER BY FORNECEDOR`; colunas de saída e `QT_FILIAIS`/`QT_LINHAS` por subconsulta → RF-001, RF-002, RF-003
- [x] **T-004** `[P]` — `sgcWintFornecedores` (filtro `busca`, descarta `CODFORNEC = 999999`) e `sgcWintFiliais` (descarta `CODIGO = '99'`), SQL no `jdbcId` do WinThor, exatamente como no `plan.md` → RF-004, RF-006, C-008
- [x] **T-005** — as 13 escritas SQL `sgcEscFornecedor*` (7150–7162), **uma instrução por SF**, todas com a guarda de persona sobre `{{usuarioId}}` (`COALESCE` da persona gravada com o mapa de `ACCESS_LEVEL` de P-02 B) → RF-005..RF-012, RN-012
- [x] **T-006** — `sgcFornecedorCarregar` (JAVASCRIPT, 7103): `runQueryMitra` do pai por `CODFORNEC` e das 6 filhas por `FORNECEDOR_ID`/`LINHA_ID`, log com `LEFT JOIN INT_USER` (`POR_NOME`) limitado a 20, `ORDER BY ID DESC`; `fornecedor: null` quando não parametrizado → RF-004, RF-012, RNF-002
- [x] **T-007** — `sgcFornecedorSalvar` (JAVASCRIPT, 7106): persona por `runQueryMitra` com `:VAR_USER` (D-005) → validação completa com as mensagens de RF-016 → fotografia anterior → inserir/atualizar o pai → limpar contatos, faixas, linhas, filiais e documentos → inserir as filhas (relendo o `ID` de cada linha) → comparar fotografias e inserir uma linha de log por campo alterado → `{ ok, error?, fornecedorId, codfornec, alteracoes }`. Chama as `sgcEsc*` **por id**, passando `usuarioId` explícito → RF-011, RF-013, RF-016

## Simulador

- [x] **T-010** — `backend/simulator/seed/001-fornecedores.mjs`: **só `INSERT`**, nenhuma criação de tabela (D-006, B-05). Linhas de `PCFORNEC` (1015, 1042, 1088 e o genérico `999999`) e de `PCFILIAL` (`1` Benenutri Matriz, `2` Benenutri Filial Norte, `3` Benenutri Filial Sul e `99`) — é a fonte única do cadastro simulado, que a 003 e a 004 reaproveitam (B-04, B-06); personas dos 5 usuários de `CENARIO.usuarios` (`admin`, `analista`, `gestor`, `diretoria`, `comercial` — R-001) gravadas **só se `SGC_USUARIO_PERSONA` estiver vazia**; os 3 fornecedores (1015, 1042, 1088), filiais atendidas, 3 linhas, 4 contatos, 6 faixas e 1 documento, exatamente com os números da seção **Simulador** do `plan.md`
- [x] **T-011** `[INT]` — `backend/simulator/schema-winthor.mjs` com o DDL das `PC*` (união das colunas de 001 e 003: `PCFORNEC` `CODFORNEC`, `FORNECEDOR`, `FANTASIA`, `CGC`, `EMAIL`, `UF`; `PCFILIAL` `CODIGO`, `RAZAOSOCIAL`, `CGC`, `UF` + as da 003) e a entrada correspondente em `DDL_SOURCES` — B-05; `backend/simulator/config.mjs`: `add-004-fornecedores.mjs` em `PUBLISH_ORDER` (depois do `add-003-jdbc-winthor.mjs`) e `CHECK_INPUT` com `codfornec: '0'`, `codfilial: ''`, `ativo: '0'`; `simulator/seed.mjs` chamando `seed/001-fornecedores.mjs`; `simulator/smoke.mjs` carregando `smoke/001-fornecedores.mjs`
- [x] **T-012** — `cd backend && npm run sim:check` sem `FALHOU` (as 4 SFs SQL de leitura rodam com o `CHECK_INPUT`)

## Frontend

- [x] **T-020** `[P]` — `frontend/src/lib/fornecedor.ts` com as **12** funções puras da seção **Regra pura** do `plan.md` (`normalizarCnpj`, `cnpjValido`, `formatarCnpj`, `janelaFechamentoValida` — dois dias de 1 a 31 **em qualquer ordem**, R-003 —, `slaEfetivo`, `rotuloPrazoEntrega`, `emailValido`, `validarFaixas`, `faixaDoValor`, `rotuloFaixa`, `documentoVencido`, `validarParametrizacao`). O formato das parcelas vem de `src/lib/prazo-pagamento.ts` da spec 003 (`parcelasDoPrazo`, `textoDeParcelas`) — **não reimplementar** (C-10) → RN-002, RN-004..RN-010, RN-014, RF-014, RF-015, RF-016, RF-017
- [x] **T-021** `[INT]` — bloco 71xx em `frontend/src/lib/server-functions.ts`: as 19 entradas em `SERVER_FUNCTION_NAMES` e em `SERVER_FUNCTIONS` (7101–7106, 7150–7162), no formato rígido (uma linha `chave: 'valor',`, sem comentário dentro do bloco)
- [x] **T-022** — `frontend/src/pages/fornecedores/FornecedoresPage.tsx`: `PageHeader` + `Panel` + `Toolbar` (`SearchInput`, `SelectMenu` de filial vindo de `sgcWintFiliais`, `SelectMenu` de situação), `FilterChip`, `Table` com `Code`/`RowTitle`/`RowMeta`/`Status`/`Dash` e colunas `numeric`, `Pagination` de 20, `EmptyState`; ação primária "Parametrizar fornecedor" abrindo o `Dialog` com o `SelectMenu` de `sgcWintFornecedores` → RF-001, RF-002, RF-003, RF-004
- [x] **T-023** — `frontend/src/pages/fornecedores/FornecedorPage.tsx`: uma chamada a `sgcFornecedorCarregar`, os 5 `Panel` (Identificação e prazos · Filiais atendidas · Linhas de produto · Documentos · Histórico), `Alert` de erro e de "Salvo às HH:MM", modo leitura para quem não parametriza, "Salvar" chamando `validarParametrizacao` antes de `sgcFornecedorSalvar` → RF-005, RF-006, RF-011, RF-012, RF-013, RF-015
- [x] **T-024** — diálogo "Linha de produto" na mesma pasta (§9.5: `max-h-[90vh]`, só o miolo rola): nome, contatos (nome + e-mail) e faixas (de, até, rótulo, parcelas) na mesma folha, sem diálogo dentro de diálogo → RF-007, RF-008, RF-009
- [x] **T-025** — diálogo "Documento": `uploadFilePublicMitra({ file })` guardando só `publicUrl`, tipo (`Documento` | `Modelo de envio de pedido`), nome e vencimento (no `DatePicker` da spec 004), com o `Alert` `tone="info"` avisando que o arquivo fica em endereço público (UI-06) **antes** do envio; a lista de documentos marca `Status tone="alert"` "vencido" por `documentoVencido` → RF-010, RF-017, RN-011, RN-014
- [x] **T-026** `[INT]` — rota `/fornecedores` e `/fornecedores/:codfornec` em `App.tsx` e item de menu "Fornecedores" em `AdminLayout.tsx`, filtrado por permissão antes de renderizar (§10 do `design.md`): a persona `comercial` **não** vê o módulo (P-03, R-001) → RF-013. **Parcial**: rota e item de menu já existem no `App.tsx`/`AdminLayout.tsx` da base (não editados por esta spec); falta o filtro por persona, que depende de `menuParaPersona`/`permissoesDe` de `lib/permissoes.ts` da spec 002 (ainda não publicada neste worktree) — pendência para o integrador
- [x] **T-027** — usar `src/components/DatePicker.tsx` (spec 004, UI-03 B, R-006) no vencimento do documento. Nenhuma tela do 001 escreve controle de data próprio nem `<input type="date">`; a task espera a 004 entregar o componente
- [ ] **T-028** — conferir no sandbox que as 19 SFs da 001 (7101–7106 e 7150–7162) estão no perfil business: o `add-002-perfil-acesso.mjs` já libera todas, como a lib faz com as `kbEsc*` (R-007, R-04). Nada a alterar no script; se a conferência mostrar que chamada aninhada dispensa o perfil, as 13 `sgcEsc*` saem dele — aí sim vira pedido ao integrador. **Bloqueada**: exige o sandbox real, fora do alcance deste worktree local

## Testes

Obrigatório: uma task por linha da seção **Testes** do `plan.md`. Feature sem
estas tasks concluídas não está pronta.

- [x] **T-080** — `teste('C-001: parametrização nova do fornecedor do ERP é gravada inteira')` em `backend/simulator/smoke/001-fornecedores.mjs`: salvar o 1088 como usuário 3 devolve `ok: true`; a releitura traz `PEDIDO_MINIMO` 5000, 2 filiais, 1 linha, 1 contato, 1 faixa `30/60/90` e ≥ 1 linha de log com `POR === 3` (C-001, RN-001)
- [x] **T-081** — `teste('C-002: listagem com busca, filtro de filial e situação')`: sem filtro 3 linhas e `TOTAL` 3; `codfilial: '2'` → 2 (1015 e 1042) e total 2; `ativo: 1` → 2 sem o 1088; `ativo: 2` → 1 (o 1088); `busca: 'fresenius'` → 1 com `QT_FILIAIS` 2 e `QT_LINHAS` 2; `limite: 2, offset: 2` → 1 (C-002, RN-013)
- [x] **T-082** — `teste('C-003: analista não parametriza; gestor parametriza')`: `userId` 2 devolve `ok: false` com `/gestor/i`, mantém `PEDIDO_MINIMO` 5000 e não cria log; `userId` 3 devolve `ok: true`; `sgcEscFornecedorAtualizar` chamada com `usuarioId: 2` não altera linha (C-003, RN-012)
- [x] **T-083** — `teste('C-004: pedido mínimo zero é recusado e nada é gravado')`: `ok: false` com `/pedido mínimo/i`; depois, 5000, 2 filiais e 2 linhas intactas (C-004, RN-003)
- [x] **T-084** — `teste('C-005: salvar substitui a parametrização inteira')`: sem a linha "Nutrição Parenteral" restam 1 linha, 2 contatos e 1 faixa, e nenhum contato `lauanda…`
- [x] **T-085** — `teste('C-006: log campo a campo')`: pedido mínimo 5000→8000 e validade 120→90 pelo usuário 4 devolvem `alteracoes: 2`, com `CAMPO`/`DE`/`PARA`/`POR` conferidos; salvar de novo sem mudança devolve `alteracoes: 0`
- [x] **T-086** — `teste('C-007: documento com endereço, tipo e vencimento')`: 1 documento na releitura com os quatro valores; `tipo: 'Planilha'` vira `'Documento'` (C-007, RN-011)
- [x] **T-087** — `teste('C-008: consultas do ERP')`: `sgcWintFornecedores` devolve `length > 0` sem `999999`, `busca: 'nestle'` devolve 1; `sgcWintFiliais` devolve `length > 0` sem `'99'` — **contagem > 0 é obrigatória; vazio não é verde**
- [x] **T-088** `[P]` — em `frontend/tests/fornecedor.test.mjs`: `test('RN-002: CNPJ válido e inválido')`, `test('RN-004: janela de fechamento entre 1 e 31, podendo virar o mês')` (`(7,15)` e `(28,5)` true; `(0,15)` e `(7,32)` false), `test('RN-005: SLA vazio vale 1 e 5 dias úteis')`, `test('RN-006: rótulo do prazo de entrega')`, `test('RN-014: documento vencido')` (`('2027-03-31','2027-04-01')` true; `('2027-03-31','2027-03-31')` e `('', …)` false) — com as entradas e saídas da linha correspondente do `plan.md`
- [x] **T-089** `[P]` — em `frontend/tests/fornecedor.test.mjs`: `test('RN-007: e-mail do contato de envio')`, `test('RN-008: faixas sem sobreposição')`, `test('RN-009: opção de prazo recusada quando não vira parcelas válidas')` — sobre `validarParametrizacao` (`'0/30'` e `'trinta'` recusados citando a linha, `'30/60/90'` aceito); os asserts de `parcelasDoPrazo`/`textoDeParcelas` ficam em `tests/prazo-pagamento.test.mjs` da 003 (C-10) —, `test('RN-010: faixa aplicável ao valor do pedido')` — com as entradas e saídas da linha correspondente do `plan.md`. **4 `test()`; com os 5 da T-088, 9 no arquivo** (R-09)

## Verificação

- [x] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`) e `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos em `frontend/`
- [ ] **T-091** — No simulador, nos temas claro e escuro e a 400 px: lista com busca, filtros e paginação (C-002); diálogo de linha de produto abrindo, rolando só no miolo e cabendo no celular (C-001); aviso de endereço público antes do envio e marca "vencido" na lista de documentos (C-007, RF-017); tela em modo leitura para a analista e módulo ausente do menu para o comercial (C-003, RF-013). No sandbox, as duas consultas Oracle reexecutadas contra o WinThor real com contagem > 0 e a conferência do perfil de acesso da T-028 (R-007). **Bloqueada**: o brief desta tarefa proíbe subir servidor local (`Não suba servidor`); fica para quem tiver o simulador/sandbox no ar

## Dependências

```
T-001 → T-002 → T-003 · T-004 · T-005 → T-006 → T-007
T-010 → T-011 → T-012 → T-080…T-087
T-020 depende de lib/prazo-pagamento.ts (spec 003) → T-088 · T-089
T-021 → T-022 · T-023
T-023 → T-024 · T-025
T-007 · T-012 → T-080…T-087
T-080…T-089 → T-090 → T-091
T-026 · T-028 [INT] em paralelo, antes da T-091
T-027 espera o DatePicker da spec 004 → T-025
```

## Rastreabilidade

Toda task existe por causa de um requisito. Requisito sem task é escopo perdido;
cenário sem task de teste é cenário não entregue.

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001, RF-003 / C-002 | T-001, T-003, T-022 | T-081 |
| RF-002 / C-002 | T-003, T-022 | T-081 |
| RF-004 / C-008 | T-004, T-006, T-022 | T-087 |
| RF-005 / C-001 | T-001, T-005, T-007, T-023 | T-080 |
| RF-006 / C-001 | T-004, T-005, T-007, T-023 | T-080 |
| RF-007, RF-008, RF-009 / C-001, C-005 | T-005, T-007, T-024 | T-080, T-084 |
| RF-010 / C-007 | T-005, T-007, T-025 | T-086 |
| RF-011 / C-004, C-005 | T-005, T-007, T-023 | T-083, T-084 |
| RF-012 / C-006 | T-005, T-006, T-007, T-023 | T-085 |
| RF-013 / C-003 | T-005, T-007, T-023, T-028 | T-082 |
| RF-014 | T-020 | T-089 |
| RF-015 | T-020, T-023 | T-088 |
| RF-016 / C-004 | T-007, T-020 | T-083, T-088, T-089 |
| RF-017 / RN-014 | T-020, T-025 | T-088, T-091 |
| RF-018 / RN-013 | T-001, T-003, T-022, T-023 | T-081 |
| RN-001 | T-001, T-004, T-007 | T-080 |
| RN-002, RN-004, RN-005, RN-006 | T-020, T-007 | T-088 |
| RN-003 | T-007, T-020 | T-083 |
| RN-007, RN-008, RN-009, RN-010 | T-020, T-007 | T-089 |
| RN-011 | T-005, T-007, T-025 | T-086 |
| RN-012 | T-005, T-007, T-026, T-028 | T-082, T-091 |
| RNF-001, RNF-002, RNF-003 | T-003, T-006, T-007 | T-081, T-080 |
| RNF-004, RNF-005 | T-004, T-022, T-023 | T-091 |
