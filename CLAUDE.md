# Project: p-novo-sgc — SGC 2 (Sistema de Gestão de Compras da Benenutri)

App que roda dentro da plataforma **Mitra**: React 19 + TypeScript + Vite 7 +
Tailwind 4 no frontend; backend composto por tabelas e Server Functions que
vivem na plataforma, provisionadas pelos scripts de `backend/` com `mitra-sdk`.
Este clone é para **desenvolvimento local**: o backend é escrito aqui e
executado no sandbox do Mitra; o frontend roda aqui contra o simulador.

O kanban (fases, campos, movimentos, chat, tarefas, anexos, automações) é da
biblioteca `@benenutri/mitra-kanban`, instalada nos dois lados. O SGC 2 só tem
tabelas `SGC_*` de domínio e telas de domínio; a lib não se edita daqui.

## Leia antes de escrever a primeira linha

1. `docs/constitution.md` — o processo. `docs/design.md` — o sistema visual; é normativo.
2. `docs/specs/000-visao-geral/README.md` — o sistema, as personas, as 10 fases, as decisões de negócio fechadas (`regras.md`) e o mapa das ondas.
3. A spec da feature: `docs/specs/NNN-slug/spec.md`, depois `plan.md`, depois `tasks.md`.
4. `README.md` da lib em `node_modules/@benenutri/mitra-kanban` (props do `KanbanBoard`, pontos de extensão, regras ligadas).

## Estrutura

```
frontend/                 React. Build SEMPRE daqui: cd frontend && npm run build
  src/lib/mitra-auth.ts     sessão e init do SDK (modo local x Mitra real); porta do simulador 3109
  src/lib/mitra-api.ts      transporte único: linhas()/acao() sobre executeServerFunctionMitra
  src/lib/server-functions.ts  contrato NOMES + IDS: bloco da lib (kb*, 80xx/90xx) + funções do projeto (sgc*, 71xx–74xx)
  src/lib/quadro.ts         slug do quadro de compras
  src/lib/*.ts              regra pura de tela (formato, transições, permissões, compras…) — é o que se testa
  src/components/ui/        primitivos do design system (não rode `shadcn add` por cima)
  src/components/page.tsx   vocabulário do produto; tela não escreve classe Tailwind solta
  src/components/AdminLayout.tsx  layout (§10 do design.md): módulos e rotas do SGC 2
  src/pages/                uma pasta por módulo (quadros, pedidos, fornecedores, agenda)
  tests/*.test.mjs          testes do frontend (node --test), um por cenário/regra da spec
backend/                  scripts de provisionamento via mitra-sdk (.env vazio localmente)
  setup-backend.mjs         schema SGC_* (CREATE TABLE IF NOT EXISTS) — todo o DDL da onda
  add-001-kanban.mjs        instala a lib (instalar({ ganchos }))
  add-002-perfil-acesso.mjs perfil business; roda por último no sandbox; FORA do PUBLISH_ORDER
  add-003…007-*.mjs         Server Functions por spec, exportam `definitions`
  sync-server-function-map.mjs  leva os ids reais ao frontend após publicar
  simulator/                Mitra local em SQLite: executa as MESMAS definitions; tabelas PC* do WinThor simuladas
  simulator/smoke.mjs       suíte de testes do backend: SFs reais + assert por cenário da spec (um arquivo por feature em smoke/)
  migrations/               GERADO PELO SISTEMA — não toque
docs/specs/               000 (visão geral) · spec.md (o quê) · plan.md (como) · tasks.md (ordem)
```

## Como rodar

```bash
cd backend && npm test            # sim:check (o SQL roda?) + sim:smoke (o fluxo faz a coisa certa?)
cd frontend && npm test           # node --test sobre a regra pura de src/lib/
cd backend && npm run sim         # simulador em http://localhost:3109 (senha mitra123)
cd frontend && npm run dev -- --port 5179   # sem VITE_MITRA_AUTH_URL entra no simulador
cd frontend && npm run build && npm run lint  # obrigatório antes de subir
```

Ou tudo junto pelo painel: `node ../mitra-hub/server.mjs`.

## Git flow

`main` é espelho da plataforma (só recebe `release/*`; migrations do sandbox
chegam por `git pull`). Trabalho em `develop` e `feature/<slug>` (um worktree
por feature em `../p-novo-sgc-<slug>`), merge `--no-ff`. Uma feature possui
os seus arquivos (`add-00N`, `seed/00N`, `smoke/00N`, `pages/<módulo>`,
`lib/<módulo>.ts`, o seu bloco do mapa); arquivo compartilhado (`setup-backend`,
`config.mjs`, `App.tsx`, menu) é do integrador.

## Regras que quebram produção se ignoradas

1. **Não existe staging.** Com `VITE_MITRA_AUTH_URL` preenchido, toda Server
   Function chamada do `localhost` bate no banco de produção. Localmente,
   trabalhe no simulador.
2. **Nunca execute `setup-backend.mjs`, `add-*.mjs` ou qualquer escrita do
   `mitra-sdk` da máquina local** sem decisão explícita do usuário. Rodar daqui
   aplica DDL/SF em produção **sem gerar migration**. Os scripts são escritos e
   commitados aqui; a execução acontece no sandbox.
3. **Não crie, edite nem `git add` em `backend/migrations/` ou
   `migrations.yaml`.** Append-only, gerado pelo sistema.
4. **`.env` nunca é commitado.** Credenciais do WinThor (Oracle) só no `.env`
   do sandbox; `add-003-jdbc-winthor.mjs` lê de lá. Token no frontend é falha
   de segurança (toda `VITE_*` vai para o bundle).
5. **Alteração mínima.** Não mude tela, fluxo ou componente que não foi pedido.
6. **Commit sem assinatura de agente.** Nunca `Co-Authored-By: Claude …` nem
   outro trailer de IA: a autoria é de quem publica.
7. **Sem teste não está pronto.** Cada cenário C-00N e regra RN-00N da spec
   tem um `teste()` em `backend/simulator/smoke/` (SF real, banco descartável)
   ou um `test()` em `frontend/tests/` (função pura de `src/lib/`), com o id
   no título. `npm test` verde nos dois lados antes de marcar task ou publicar.
   Consulta ao WinThor no smoke prova contagem > 0 (vazio não é verde).

## Regras do domínio (lições do SGC anterior)

- **Card nasce sempre por `kbCardCriar`** (ordem, busca, movimento, automação); nunca por `kbEscCardInserir` solto. O cron da agenda cria com `origem: 'sistema'` e `criadoPor`.
- **Nenhum campo de fase obrigatório** no quadro `compras`: o motor valida obrigatórios em qualquer direção e barraria cancelar/voltar. Pré-requisito de saída vive em `antesDeMover`/`podeMover` (tela) e na regra ligada `sgcPodeMover`/`sgcPodeExcluir` (servidor, `KB_META`).
- **Escrita de usuário só por SF SQL guardada por `:VAR_USER`**, chamada direto da tela; uma instrução por SF. JS só para orquestração, e-mail e cron.
- **Persona é dado** (`SGC_USUARIO_PERSONA`); não resolvida → analista. `READ_ONLY` não move; `RESTRICTED` só os próprios.
- **Fase por chave estável** (`SGC_FASE.CHAVE` → `KB_FASE.ID`); regra nunca depende de id nem de nome de fase.
- **`KB_BOARD.CONFIG_JSON` não guarda nada do SGC** (a aba Geral apaga).
- **Teto de 300 execuções/min**: abrir card = `kbCardDetalhe` + `sgcPedidoCarregar`; quadro a cada 60 s; capa sem SF extra; itens editados em lote.
- **Teto de 800 linhas por arquivo** (ESLint `max-lines`), regra crítica fora do JSX, zero `style={{}}`, cor só por token.

## Como o frontend fala com o backend

- Frontend importa **`mitra-interactions-sdk`**. Nunca `mitra-sdk` (backend)
  e nunca `fetch`/`axios` replicando o SDK.
- Usuário final é `userType=business`: CRUD REST retorna **403**. Toda
  leitura e escrita vai por Server Function, via `linhas()`/`acao()` de
  `src/lib/mitra-api.ts`; a lib recebe esse transporte pelo `KanbanProvider`.
- Parâmetro é **`input:`**, não `params:`. SF SQL recebe `{{nome}}` (string
  com aspas manuais: `'{{nome}}'`); `:VAR_USER` é o ID de quem chama.
- Retorno vem com **colunas em UPPERCASE** (`row.NOME`). Toda listagem é
  paginada (`LIMIT/OFFSET`). Filtro desligado é `''` no texto e `0` no número.
- Datas em `VARCHAR(10)`/`VARCHAR(19)`, preenchidas no código.
- Nome novo de Server Function: entra em `add-NNN-*.mjs` **e** em
  `SERVER_FUNCTION_NAMES`; o id local em `SERVER_FUNCTIONS` na faixa da spec
  até o `sync:function-map` trazer o real.

## Como subir para o Mitra

Ver `README.md` (seção "Como subir"): testes verdes, merge da release em `main`,
push, prompt do sandbox com a ordem dos `add-*` (perfil por último), `git pull`.

## Armadilhas de build

- `verbatimModuleSyntax`: importe tipos com `import type`.
- `npm run build` roda `tsc -b`: erro de tipo derruba o build.
- `base: './'` no `vite.config.ts` faz o app funcionar em subpath. Não mexa.
- `resolve.dedupe` e `server.fs.allow` (vite) e o `paths` de `react`/`react-dom` (`tsconfig.app.json`) existem para a lib linkada de `../../mitra-kanban` (`npm link`, enquanto a 1.4.0 não está no registry); no sandbox são inertes.

## Antes de dizer que terminou

- [ ] `npm test` verde em `backend/` (check + smoke) e em `frontend/`; todo cenário da spec citado no título de um teste
- [ ] `npm run build` e `npm run lint` limpos em `frontend/`
- [ ] O que teste não cobre (layout, tema, navegação) aberto no simulador, nos dois temas
- [ ] Nenhum CRUD REST em tela de usuário final; nenhuma cor literal; nenhum `style={{}}`
- [ ] `backend/migrations/` intocado; `.env` fora do commit
- [ ] Spec/plan/tasks atualizados; prompt original relido item a item
