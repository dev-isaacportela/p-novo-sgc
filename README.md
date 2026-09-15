# p-novo-sgc — SGC 2 (Sistema de Gestão de Compras da Benenutri)

Reconstrução do SGC (p-45547) do zero, como projeto Mitra **novo**, sobre a
biblioteca [`@benenutri/mitra-kanban`](https://www.npmjs.com/package/@benenutri/mitra-kanban)
(motor de quadros: fases, campos, movimentos, chat, tarefas, anexos, automações)
e o design system da Benenutri (`docs/design.md`). O que é kanban genérico vem
da lib; o SGC 2 só tem as tabelas `SGC_*` de domínio (pedido, itens, alertas,
fornecedores, agenda, personas), ligadas ao card por `KB_CARD.ID`.

A pasta chama-se `p-novo-sgc` até o projeto existir na plataforma; aí vira
`p-NNNNN` e ganha o remoto `github.com/mitra-agent-projects/p-NNNNN`. Os dados
do SGC atual **não migram**: o sistema começa vazio e o p-45547 fica de consulta.

## Estado

| Parte | Situação |
|---|---|
| Frontend (Vite 7 + React 19 + Tailwind 4, design system instalado) | esqueleto: login, layout, quadro de compras da lib |
| Backend (kit da `mitra-escopo`, simulador com o schema da lib) | esqueleto em `feature/esqueleto-backend` |
| Onda 1 (fornecedores, quadro de compras, itens e análise WinThor, agenda) | specs em `docs/specs/001`…`004` (a escrever) |

Mapa completo das ondas e decisões de negócio: `docs/specs/000-visao-geral/`.

## Como rodar

```bash
cd backend && npm install && npm test     # sim:check + sim:smoke
cd frontend && npm install && npm test    # node --test sobre a regra pura de src/lib/
cd backend && npm run sim                 # simulador em http://localhost:3109 (senha mitra123)
cd frontend && npm run dev -- --port 5179 # sem VITE_MITRA_AUTH_URL entra no simulador
```

Ou pelo painel: `node ../mitra-hub/server.mjs` → http://localhost:3100.

## Git flow

- `main` — espelho do que está na plataforma. Só recebe merge de `release/*`;
  as migrations que o sandbox commita chegam por `git pull`.
- `develop` — integração da onda em curso.
- `feature/<slug>` — uma por spec (ou por trilho do esqueleto), num worktree
  ao lado (`../p-novo-sgc-<slug>`); merge `--no-ff` em `develop`.
- `release/onda-N` — fechamento: testes, revisão, navegador; merge em `main` e tag.

Commits `tipo: descrição`, em português, **sem trailer de agente**.

## Como subir para o Mitra (quando o p-NNNNN existir)

1. `npm test` verde em `backend/` e `frontend/`; `npm run build` e `npm run lint` limpos.
2. `git fetch origin && git merge origin/main --no-edit`; leia o diff.
3. Merge da release em `main` e `git push origin main` (sem `--force`, sem `--rebase`).
4. No chat do projeto no Mitra: *"sincronize com a main e rode
   `cd backend && npm install && node setup-backend.mjs && node add-001-kanban.mjs && node add-003-jdbc-winthor.mjs && node add-004-fornecedores.mjs && node add-005-quadro-compras.mjs && node add-006-itens.mjs && node add-007-agenda.mjs && node add-001-kanban.mjs && node add-002-perfil-acesso.mjs && node sync-server-function-map.mjs`,
   depois build e share"*. O `add-001` roda duas vezes de propósito: a segunda liga os ganchos
   `podeMover`/`podeExcluir`, cujas SFs (`sgcPodeMover`/`sgcPodeExcluir`) só existem depois do `add-005`.
   O `add-002` (perfil) fica por último. A plataforma materializa as migrations.
5. `git pull` para receber migrations e o mapa de ids reais.

## Regras

- **Nunca execute `setup-backend.mjs` ou `add-*.mjs` da máquina local**: só o sandbox gera migration.
- **A lib não se edita daqui.** Defeito do motor vai para `../mitra-kanban`, com teste no smoke de lá, e chega por versão nova.
- Card nasce **sempre** por `kbCardCriar`; nenhum campo de fase é obrigatório no quadro `compras` (pré-requisito de saída vive em `antesDeMover` na tela e na regra ligada no servidor).
- Escrita de usuário só por SF SQL guardada por `:VAR_USER`; credenciais do WinThor só no `.env` do sandbox.
- `CLAUDE.md` tem as regras de trabalho; `docs/constitution.md`, o processo; `docs/design.md`, o visual.
