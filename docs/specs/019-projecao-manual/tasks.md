# Tasks: 019 — Projeção manual

**Plan:** [`plan.md`](plan.md) · uma feature, uma sessão (`claude/019-projecao-manual-33cbfe`); os arquivos do integrador tocados estão marcados (I).

| # | Task | Arquivos | Pronto quando |
|---|---|---|---|
| T-001 | Spec, plan, tasks; linha no README das specs e R-200..R-201 no 000 | `docs/specs/019-projecao-manual/*`, `docs/specs/README.md` (I), `docs/specs/000-visao-geral/README.md` (I) | commitado com o código |
| T-002 | `DDL_019` com `SGC_PROJECAO_MANUAL` no fim do array | `backend/setup-backend.mjs` (I) | `sim:check` cria a tabela |
| T-003 | `add-021-projecao-manual.mjs`: as três SFs 91xx e a publicação | `backend/add-021-projecao-manual.mjs`, `backend/package.json` (I) | `sim:check` roda a leitura |
| T-004 | Mapa de ids 91xx e `PUBLISH_ORDER` | `frontend/src/lib/server-functions.ts` (I), `backend/simulator/config.mjs` (I) | build |
| T-005 | Smoke das escritas e da guarda | `backend/simulator/smoke/019-projecao-manual.mjs`, `smoke.mjs` (I) | `npm test` verde |
| T-006 | Regra pura e o fator na régua e na previsão | `frontend/src/lib/projecao-manual.ts`, `ressuprimento.ts`, `previsao.ts`, `analise-sku.ts`, `frontend/tests/projecao-manual.test.mjs` | `npm test` verde |
| T-007 | Carga, página, painel, janela, lista, diálogo | `frontend/src/pages/compras-inteligentes/*` | C-001, C-007, C-013 no simulador |
| T-008 | Verificação: build, lint, testes, simulador (3113/5183) nos dois temas, `git ls-files --eol` sem CRLF | — | checklist do CLAUDE.md |
