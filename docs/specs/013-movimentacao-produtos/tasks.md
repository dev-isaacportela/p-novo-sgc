# Tasks: Movimentação de produtos

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · Branch `feature/013-movimentacao` (de `develop`), sem merge até o OK do usuário.

Ordem: spec → backend → simulador → regra pura → telas → verificação. Cada task só fecha
com `npm test` verde no lado que ela toca.

## Spec

- [x] T-001 `spec.md`, `plan.md`, `tasks.md`; linha da spec e R-133 no 000; commit antes de codar

## Backend

- [x] T-010 `add-013`: `export` em `VENDA_VALIDA`, `PUBLICO` e `REMESSA_FUTURA` (nada mais)
- [x] T-011 `add-015-movimentacao.mjs`: as nove `sgcWint*` (8301–8309), lista `WINTHOR`, `isEntrypoint` como o `add-013`
- [x] T-012 `add-015`: `sgcMovPlanosListar`, `sgcMovPlanosResumo` (8310–8311) e as escritas guardadas `sgcEscMovPlanoSalvar`, `sgcEscMovPlanoExcluir` (8350–8351)
- [x] T-013 `setup-backend.mjs`: `DDL_013` com `SGC_MOV_PLANO` (integrador — escrito, não executado)
- [x] T-014 `PUBLISH_ORDER` (`add-015` depois do `add-014`), `publish:015` no `package.json`, `CHECK_INPUT` só com chaves novas

## Simulador

- [x] T-020 `schema-winthor.mjs`: `PCLOTE.DTEXCLUSAO`, `PCMOV.CUSTOREAL`, `PCMOV.CODFORNEC`
- [x] T-021 `seed/013-movimentacao.mjs` (produtos 5701–5734 do fornecedor 1088, clientes 9401–9405, `NUMTRANSITEM`/`NUMTRANSVENDA` ≥ 985001) e registro em `seed.mjs`
- [x] T-022 `smoke/013-movimentacao.mjs`: os cenários de regra de negócio e o bloco do WinThor real; registro em `smoke.mjs`

## Regra pura

- [x] T-030 `frontend/src/lib/movimentacao.ts` (tabela do plan)
- [x] T-031 `frontend/tests/movimentacao.test.mjs`, um `test()` por cenário/regra de tela

## Telas

- [x] T-040 bloco 83xx em `server-functions.ts` (nomes e ids locais)
- [x] T-041 `permissoes.ts`: `verMovimentacao`, `registrarPlanoAcao`, item de menu; teste de permissões atualizado
- [x] T-042 `pages/movimentacao/*` (casca, cinco abas, plano, linha do tempo, gráfico por filial)
- [x] T-043 rota no `App.tsx` e ícone no `AdminLayout.tsx`

## Verificação

- [x] T-050 `npm test` nos dois lados; `npm run build` e `npm run lint` no frontend
- [x] T-051 simulador com o WinThor real (porta 3112, front 5182): as cinco abas nos dois temas, screenshots
- [x] T-052 relatório: arquivos do integrador, perguntas P-01..P-08 (propostas aprovadas em 2026-11-03), commits, testes

## Rastreabilidade

| Cenário/regra | Teste |
|---|---|
| C-001..C-003, C-012, C-015, C-032, RN-004..RN-006, RN-008, RN-010, RN-017, RN-018, RN-020 | `frontend/tests/movimentacao.test.mjs` |
| C-004..C-011, C-013, C-014, C-016..C-031, C-033..C-037, RN-001..RN-003, RN-007, RN-011..RN-016, RN-019 | `backend/simulator/smoke/013-movimentacao.mjs` |
| contagem > 0 no WinThor real | bloco "WinThor real" do mesmo smoke |

## Resultado (2026-11-03)

- Backend: 335 verificações (`npm test`: check + smoke), 36 novas da 013, entre elas a das nove
  `sgcWint*` no WinThor real (filial 1): departamentos 9 linhas, sem venda 50, excedentes 187, a
  vencer 50, ruptura 50, ruptura por filial 5, perdas 14, perdas por filial 3, linha do tempo 89 —
  a mais lenta, o resumo de perdas, em 1,3 s.
- Frontend: 345 testes (22 novos em `movimentacao.test.mjs`), `tsc -b`, `vite build` e `eslint` limpos.
- Telas conferidas no simulador com o WinThor real nos dois temas; a pergunta P-08 nasceu daí
  (Saxenda e Novorapid "sem venda" pelo recorte sem público).
