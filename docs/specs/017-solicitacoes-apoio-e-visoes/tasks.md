# Tasks: 017 — Solicitações: apoio à avaliação e visões agrupadas

**Plan:** [`plan.md`](plan.md) · uma feature, uma sessão (`claude/017-solicitacoes-apoio-00a9a7`); os arquivos do integrador tocados estão marcados (I).

| # | Task | Arquivos | Pronto quando |
|---|---|---|---|
| T-001 | Spec, plan, tasks; linha no README das specs e R-180..R-181 no 000 | `docs/specs/017-solicitacoes-apoio-e-visoes/*`, `docs/specs/README.md` (I), `docs/specs/000-visao-geral/README.md` (I) | commitado |
| T-002 | Exportar `RECORTE_COMERCIAL`, `JUNCOES_SOLICITACAO`, `FILTROS_PUBLICADOS` | `backend/add-011-solicitacoes.mjs` | smoke da 008 verde |
| T-003 | `add-019-solicitacoes-apoio.mjs`: `sgcSolicitacoesAgrupar` e `…Total` | `backend/add-019-solicitacoes-apoio.mjs` | `sim:check` roda as duas |
| T-004 | Mapa de ids 8801–8802 | `frontend/src/lib/server-functions.ts` (I) | build |
| T-005 | Seed WinThor do 5311, `PUBLISH_ORDER`, `CHECK_INPUT` | `backend/simulator/seed/017-solicitacoes-apoio.mjs`, `seed.mjs` (I), `config.mjs` (I) | `npm run sim:seed` |
| T-006 | Smoke C-01..C-05 e C-08..C-13 | `backend/simulator/smoke/017-solicitacoes-apoio.mjs`, `smoke.mjs` (I) | `npm test` verde em `backend/` |
| T-007 | Regra pura e testes | `frontend/src/lib/solicitacoes-apoio.ts`, `frontend/src/lib/solicitacoes-visoes.ts`, `frontend/tests/solicitacoes-apoio.test.mjs`, `frontend/tests/solicitacoes-visoes.test.mjs` | `npm test` verde em `frontend/` |
| T-008 | Apoio na janela Avaliar | `frontend/src/pages/solicitacoes/ApoioAvaliacao.tsx`, `solicitacoes-dialogos.tsx` | C-01..C-07 no simulador |
| T-009 | Alternador, quadro agrupado e ficha do grupo | `frontend/src/pages/solicitacoes/VisoesAgrupadas.tsx`, `SolicitacoesPage.tsx` | C-08..C-12 no simulador |
| T-010 | Verificação: build, lint, testes, simulador (3111/5181) nos dois temas, `git ls-files --eol` sem CRLF | — | checklist do CLAUDE.md |
