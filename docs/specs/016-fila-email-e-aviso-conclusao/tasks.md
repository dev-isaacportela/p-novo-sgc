# Tasks: 016 — Fila de e-mail e aviso de pedido pronto para concluir

**Plan:** [`plan.md`](plan.md) · uma sessão (`claude/016-fila-email-aviso-bf5131`); os arquivos do integrador tocados estão marcados (I).

| # | Task | Arquivos | Pronto quando | Situação |
|---|---|---|---|---|
| T-001 | Spec, plan, tasks; linha no README das specs; R-170..R-172 no 000 | `docs/specs/016-fila-email-e-aviso-conclusao/*`, `docs/specs/README.md` (I), `docs/specs/000-visao-geral/README.md` (I) | commitado | feito |
| T-002 | `DDL_016` com `SGC_EMAIL_FILA` no fim do array | `backend/setup-backend.mjs` (I) | `sim:check` cria a tabela | feito |
| T-003 | `add-018`: 4 escritas SQL e 2 rotinas com cron | `backend/add-018-fila-email-conclusao.mjs` | smoke verde | feito |
| T-004 | Mapa de ids 87xx | `frontend/src/lib/server-functions.ts` (I) | build | feito |
| T-005 | Envio e cobrança: fila na falha | `backend/add-005-quadro-compras.mjs` (I), `backend/add-008-notas-fiscais.mjs` | C-001..C-003; smoke da 002 e da 005 verdes | feito |
| T-006 | Texto da tela | `frontend/src/lib/fila-email.ts`, `pages/quadros/registrar-envio.ts`, `pages/quadros/abas/nf-dialogos.tsx` | `tests/fila-email.test.mjs` | feito |
| T-007 | `PUBLISH_ORDER` e smoke por último | `backend/simulator/config.mjs` (I), `backend/simulator/smoke.mjs` (I), `backend/simulator/smoke/016-fila-email.mjs` | `npm test` verde | feito |
| T-008 | Verificação: testes, build, lint, EOL | — | checklist do CLAUDE.md | feito |
| T-009 | Aprovação das P-01..P-09 | — | resposta do usuário | aguardando |
