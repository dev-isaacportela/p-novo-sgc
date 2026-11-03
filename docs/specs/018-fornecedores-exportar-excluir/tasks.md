# Tasks: 018 — Fornecedores: exportar e excluir com cópia

**Plan:** `plan.md` · **Data:** 2026-11-03

> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).

## Backend

- [x] **T-001** — `DDL_018` (`SGC_FORNECEDOR_EXCLUSAO`) no fim do array → `backend/setup-backend.mjs`
- [x] **T-002** — `sgcFornecedorExportar` (8980) e as 7 escritas 8950–8956 com `GUARDA` + `COPIA`; `definitions` exportadas, entrypoint só no sandbox → `backend/add-020-fornecedores-exportar-excluir.mjs`
- [x] **T-003** — `add-020` no `PUBLISH_ORDER` → `backend/simulator/config.mjs` (o `package.json` não tem `publish:` das 016+; fica com o integrador)
- [x] **T-004** `[P]` — nomes e ids locais no bloco 89xx → `frontend/src/lib/server-functions.ts`

## Frontend

- [x] **T-010** — regra pura da planilha e da exclusão → `frontend/src/lib/fornecedor-planilha.ts`
- [x] **T-011** — orquestração (exportar em blocos, excluir na ordem, reler) → `frontend/src/pages/fornecedores/exportar-excluir.ts`
- [x] **T-012** — **Exportar planilha** na lista → `frontend/src/pages/fornecedores/FornecedoresPage.tsx`
- [x] **T-013** — **Exportar** e **Excluir parametrização** com confirmação → `frontend/src/pages/fornecedores/FornecedorPage.tsx`

## Testes

- [x] **T-080** — `teste('C-001 …')`, `teste('C-002 …')` em `backend/simulator/smoke/018-fornecedores-exportar-excluir.mjs`
- [x] **T-081** — `teste('C-006 …')`, `teste('C-007 …')` (recusas antes de qualquer exclusão)
- [x] **T-082** — `teste('C-005 …')`, `teste('C-010 …')` (1099 com pedido e agendamento)
- [x] **T-083** — `teste('C-008 …')`, `teste('C-009 …')`
- [x] **T-084** `[P]` — `test('C-002/C-003/C-004/RN-002/RN-003/RF-010/C-006/C-010 …')` em `frontend/tests/fornecedores-exportar-excluir.test.mjs`

## Verificação

- [x] **T-090** — `cd backend && npm test` verde
- [x] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [x] **T-092** — simulador (3112) + Vite (5182): exportar na lista e na parametrização, excluir como gestor, botão desabilitado como analista
- [x] **T-093** — temas claro e escuro
- [x] **T-094** — R-190..R-191 no `000-visao-geral/README.md`; linha 018 em `docs/specs/README.md`

## Dependências

```
T-001 → T-002 → T-003 → T-080..T-083 → T-090
T-004 [P] → T-010 → T-011 → T-012, T-013 → T-084 → T-091 → T-092
```
