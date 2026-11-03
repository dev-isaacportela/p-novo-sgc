# Tasks: Movimentação de produtos

**Spec:** [spec.md](spec.md) · **Plan:** [plan.md](plan.md) · Branch `feature/013-movimentacao` (de `develop`), sem merge até o OK do usuário.

Ordem: spec → backend → simulador → regra pura → telas → verificação. Cada task só fecha
com `npm test` verde no lado que ela toca.

## Spec

- [x] T-001 `spec.md`, `plan.md`, `tasks.md`; linha da spec e R-133 no 000; commit antes de codar

## Backend

- [ ] T-010 `add-013`: `export` em `VENDA_VALIDA` e `PUBLICO` (nada mais)
- [ ] T-011 `add-015-movimentacao.mjs`: as nove `sgcWint*` (8301–8309), lista `WINTHOR`, `isEntrypoint` como o `add-013`
- [ ] T-012 `add-015`: `sgcMovPlanosListar`, `sgcMovPlanosResumo` (8310–8311) e as escritas guardadas `sgcEscMovPlanoSalvar`, `sgcEscMovPlanoExcluir` (8350–8351)
- [ ] T-013 `setup-backend.mjs`: `DDL_013` com `SGC_MOV_PLANO` (integrador — escrito, não executado)
- [ ] T-014 `PUBLISH_ORDER` (`add-015` depois do `add-014`), `publish:015` no `package.json`, `CHECK_INPUT` só com chaves novas

## Simulador

- [ ] T-020 `schema-winthor.mjs`: `PCLOTE.DTEXCLUSAO`, `PCMOV.CUSTOREAL`, `PCMOV.CODFORNEC`
- [ ] T-021 `seed/013-movimentacao.mjs` (produtos 5701–5730 do fornecedor 1088, clientes 9401–9405, `NUMTRANSITEM`/`NUMTRANSVENDA` ≥ 985001) e registro em `seed.mjs`
- [ ] T-022 `smoke/013-movimentacao.mjs`: os cenários de regra de negócio e o bloco do WinThor real; registro em `smoke.mjs`

## Regra pura

- [ ] T-030 `frontend/src/lib/movimentacao.ts` (tabela do plan)
- [ ] T-031 `frontend/tests/movimentacao.test.mjs`, um `test()` por cenário/regra de tela

## Telas

- [ ] T-040 bloco 83xx em `server-functions.ts` (nomes e ids locais)
- [ ] T-041 `permissoes.ts`: `verMovimentacao`, `registrarPlanoAcao`, item de menu; teste de permissões atualizado
- [ ] T-042 `pages/movimentacao/*` (casca, cinco abas, plano, linha do tempo, gráfico por filial)
- [ ] T-043 rota no `App.tsx` e ícone no `AdminLayout.tsx`

## Verificação

- [ ] T-050 `npm test` nos dois lados; `npm run build` e `npm run lint` no frontend
- [ ] T-051 simulador com o WinThor real (porta 3112, front 5182): as cinco abas nos dois temas, screenshots
- [ ] T-052 relatório: arquivos do integrador, perguntas P-01..P-07, commits, testes

## Rastreabilidade

| Cenário/regra | Teste |
|---|---|
| C-001..C-003, C-012, C-015, C-032, RN-004..RN-006, RN-008, RN-010, RN-017, RN-018, RN-020 | `frontend/tests/movimentacao.test.mjs` |
| C-004..C-011, C-013, C-014, C-016..C-031, C-033..C-037, RN-001..RN-003, RN-007, RN-011..RN-016, RN-019 | `backend/simulator/smoke/013-movimentacao.mjs` |
| contagem > 0 no WinThor real | bloco "WinThor real" do mesmo smoke |
