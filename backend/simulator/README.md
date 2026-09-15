# Simulador local do Mitra — p-novo-sgc (SGC 2, Gestão de Compras)

Ambiente de teste deste projeto, com banco SQLite próprio e dados simulados
(`node:sqlite`, Node 22.5+). Vai no git; só `simulator/data/` e
`simulator/uploads/` ficam de fora (`.gitignore` da raiz).

**Não existe handler reimplementado.** O simulador carrega as `definitions` de
cada `backend/add-00N-*.mjs` do `PUBLISH_ORDER` (`config.mjs`) — `add-001-kanban.mjs`
reexporta as server functions da lib `@benenutri/mitra-kanban` com os ids do
`frontend/src/lib/server-functions.ts` deste projeto; `add-004..007` publicam
as `sgc*` da onda 1 — e executa o SQL e o JavaScript literais. O schema é lido
de três fontes (`DDL_SOURCES`, sem execução: leitura de texto por
`schema.mjs`): as 16 tabelas `SGC_*` de `backend/setup-backend.mjs`, o
`schema.mjs` da lib instalada em `node_modules` e as tabelas `PC*` do WinThor
em `backend/simulator/schema-winthor.mjs` (só simulador — a plataforma usa o
Oracle real, pelo `jdbcId` de `add-003-jdbc-winthor.mjs`).

## Seed e smoke, um arquivo por spec

- `simulator/seed.mjs` cria o schema, os 5 usuários, o quadro e as 10 fases, e
  chama `simulator/seed/00N-*.mjs` nesta ordem: `001-fornecedores`,
  `002-quadro`, `003-itens`, `004-agenda`. Cada um exporta `seed00N(db, cenario)`;
  hoje só a 002 grava algo (as personas de `SGC_USUARIO_PERSONA`) — as demais
  são stub até a feature preencher (fornecedores, itens/alertas/cobertura,
  agendamentos).
- `simulator/smoke.mjs` é o orquestrador: abre **um** banco descartável
  (`smoke/base.mjs`, `abrirContexto()`) e roda, na ordem, `smoke/000-esqueleto.mjs`
  (o esqueleto do projeto — S0-001..S0-006) e `smoke/00N-*.mjs` de cada spec.
  Cada um exporta `suite(ctx)`, com `ctx.chamar`/`ctx.teste` prontos; hoje as
  quatro suítes de spec são stub (`suite(ctx) {}`) — o `teste()` de cada
  cenário C-00N/RN-00N do plan entra lá.

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
| `leo@sgc.local` | Leo Comercial | MEMBER |

Persona (`admin`/`analista`/`gestor`/`diretoria`/`comercial`, P-01) é dado do
SGC (`SGC_USUARIO_PERSONA`), gravada pelo `seed/002-quadro.mjs`: admin→admin,
ana→analista, gil→gestor, dora→diretoria, leo→comercial.

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
