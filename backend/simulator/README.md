# Simulador local do Mitra — p-novo-sgc (SGC 2, Gestão de Compras)

Ambiente de teste deste projeto, com banco SQLite próprio e dados simulados
(`node:sqlite`, Node 22.5+). Vai no git; só `simulator/data/` e
`simulator/uploads/` ficam de fora (`.gitignore` da raiz).

**Não existe handler reimplementado.** O simulador carrega as `definitions` de
`backend/add-001-kanban.mjs` — que reexporta as server functions da lib
`@benenutri/mitra-kanban` com os ids do `frontend/src/lib/server-functions.ts`
deste projeto — e executa o SQL e o JavaScript literais. O schema é lido do
`schema.mjs` da lib instalada em `node_modules` (este projeto ainda não tem
tabelas `SGC_*` próprias — ver `backend/setup-backend.mjs`).

```bash
cd backend && npm test            # sim:check + sim:smoke
cd backend && npm run sim:seed    # regera o banco
cd backend && npm run sim         # http://localhost:3109
```

## Logins (senha única: `mitra123`)

| E-mail | Nome | Nível |
|---|---|---|
| `admin@sgc.local` | Admin SGC | ADMIN (admin do quadro Compras) |
| `ana@sgc.local` | Ana Analista | MEMBER |
| `gil@sgc.local` | Gil Gestor | MEMBER |
| `dora@sgc.local` | Dora Diretora | MEMBER |
| `leo@sgc.local` | Leo Leitura | MEMBER |

Persona (analista/gestor/diretoria/leitura) é dado do SGC (`SGC_USUARIO_PERSONA`),
que entra na spec 002 — aqui os 5 usuários existem só em `INT_USER`.

## Quadro do seed

Um quadro, `Compras` (slug `compras`), com as 10 fases da onda 1, nesta ordem
(regra F-01: mesmos nomes e mesma ordem do SGC anterior):

| # | Fase | Tipo |
|---|---|---|
| 1 | Análise/Montagem de Pedido | comum |
| 2 | Aprovação Técnica | comum |
| 3 | Aprovação da Diretoria | comum |
| 4 | Envio para Indústria | comum |
| 5 | Enviado para Indústria | comum |
| 6 | Em Trânsito para BN | comum |
| 7 | Faturamento em Andamento | comum |
| 8 | Produtos em B.O. | comum |
| 9 | Compras Concluídas | sucesso |
| 10 | Compras Canceladas | cancelado |

Nenhum campo (`KB_CAMPO`) e nenhum card ainda — chegam com as specs seguintes
da onda 1. As chaves de `CENARIO.fases` (`analise`, `tecnica`, `diretoria`,
`envio`, `enviado`, `transito`, `faturamento`, `bo`, `concluido`, `cancelado`)
são o contrato que as próximas specs usam; os nomes exibidos podem mudar.

## Portas

| | Porta |
|---|---|
| Simulador (`npm run sim`) | `3109` |
| Frontend (`npm run dev`) | ver `frontend/vite.config.ts` / `CLAUDE.md` do projeto |

## Diagnóstico e voltar ao Mitra real

Iguais ao kit da skill `mitra-escopo` (`GET /health`, `VITE_MITRA_AUTH_URL` no
`frontend/.env` para apontar para produção — sem alteração de código, e
lembrando que aí toda chamada bate em produção).
