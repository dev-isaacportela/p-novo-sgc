# Tasks: [NOME DA FEATURE]

**Plan:** `plan.md` · **Data:** AAAA-MM-DD

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).

## Backend

- [ ] **T-001** — [ação concreta] → `backend/[arquivo]`
- [ ] **T-002** `[P]` — …

## Frontend

- [ ] **T-010** — [ação concreta] → `frontend/src/[arquivo]`
- [ ] **T-011** `[P]` — …

## Testes

Obrigatório: uma task por linha da seção **Testes** do `plan.md`. Feature sem
estas tasks concluídas não está pronta.

- [ ] **T-080** — `teste('C-001: …')` em `backend/simulator/smoke.mjs`: [o que o assert verifica]
- [ ] **T-081** — `teste('C-002: …')` em `backend/simulator/smoke.mjs`: [o que o assert verifica]
- [ ] **T-082** `[P]` — `test('RN-001: …')` em `frontend/tests/<slug>.test.mjs`: [entrada → saída]

## Verificação

- [ ] **T-090** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`)
- [ ] **T-091** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-092** — Verificação manual da spec reproduzida no simulador: [ex: C-003 — resultado esperado]
- [ ] **T-093** — Tema claro (`.theme-light`) sem cor quebrada

## Dependências

```
T-001 → T-002 → T-010
T-011 [P] independente
T-002 → T-080 · T-010 → T-082
```

## Rastreabilidade

Toda task existe por causa de um requisito. Requisito sem task é escopo perdido;
cenário sem task de teste é cenário não entregue.

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / C-001 | T-001, T-010 | T-080 |
| RN-001 | T-011 | T-082 |
