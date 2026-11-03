# Tasks: 015 — Quadro de empenhos

**Plan:** [`plan.md`](plan.md) · uma feature, uma sessão (`feature/015-empenhos`); os arquivos do integrador tocados estão marcados (I).

| # | Task | Arquivos | Pronto quando |
|---|---|---|---|
| T-001 | Spec, plan, tasks; linha no README das specs e R-160..R-161 no 000 | `docs/specs/015-quadro-de-empenhos/*`, `docs/specs/README.md` (I), `docs/specs/000-visao-geral/README.md` (I) | commitado antes do código |
| T-002 | `DDL_015` com as cinco tabelas `SGC_EMP_*` | `backend/setup-backend.mjs` (I) | `sim:check` cria as tabelas |
| T-003 | `add-017-empenhos.mjs`: quadro (fases, campos), SFs 86xx, ramos do gancho, publicação | `backend/add-017-empenhos.mjs` | `sim:check` roda todas as leituras |
| T-004 | Ramo do gancho no `add-005` | `backend/add-005-quadro-compras.mjs` (I) | smoke da 002 verde e C-003 |
| T-005 | Mapa de ids 86xx | `frontend/src/lib/server-functions.ts` (I) | build |
| T-006 | Seed e `PUBLISH_ORDER`/`CHECK_INPUT` | `backend/simulator/seed/015-empenhos.mjs`, `seed.mjs` (I), `config.mjs` (I) | `npm run sim:seed` |
| T-007 | Smoke do fluxo e do WinThor real | `backend/simulator/smoke/015-empenhos*.mjs`, `smoke.mjs` (I) | `npm test` verde; WinThor real com contagem > 0 |
| T-008 | Regra pura e testes | `frontend/src/lib/empenhos.ts`, `frontend/tests/empenhos.test.mjs` | `npm test` verde |
| T-009 | Permissões, menu e rotas | `lib/permissoes.ts` (I), `components/AdminLayout.tsx` (I), `App.tsx` (I), `lib/quadro.ts` (I) | C-001 |
| T-010 | Quadro, novo empenho, análise, aprovações, pedidos, aba Pregão | `frontend/src/pages/empenhos/*` | fluxo no simulador |
| T-011 | Pregões e indicadores | `pages/empenhos/PregoesPage.tsx`, `IndicadoresEmpenhosPage.tsx` | C-006, C-036 |
| T-012 | Verificação: build, lint, testes, simulador com WinThor real nos dois temas, screenshots | — | checklist do CLAUDE.md |
