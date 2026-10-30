# Simulador local do Mitra — p-novo-sgc (SGC 2, Gestão de Compras)

Ambiente de teste deste projeto, com banco SQLite próprio e dados simulados
(`node:sqlite`, Node 22.5+). Vai no git; só `simulator/data/` e
`simulator/uploads/` ficam de fora (`.gitignore` da raiz).

**Não existe handler reimplementado.** O simulador carrega as `definitions` de
cada `backend/add-00N-*.mjs` do `PUBLISH_ORDER` (`config.mjs`) — `add-001-kanban.mjs`
reexporta as server functions da lib `@benenutri/mitra-kanban` com os ids do
`frontend/src/lib/server-functions.ts` deste projeto; `add-004..007` publicam
as `sgc*` da onda 1, `add-008..010` as da onda 2 (005 notas fiscais, 006
trânsito, 007 B.O.), `add-011`/`add-012` as da onda 3 (008 solicitações do
comercial, 009 indicadores e relatórios — ainda stub, `definitions = []`, até
cada feature chegar; a 010, o extrato, não tem script) e
`add-013`/`add-014` as da onda 4 (011 compras inteligentes, 012 coberturas por
curva — stub da base, R-113)
— e executa o SQL e o JavaScript literais. O schema é lido de três fontes
(`DDL_SOURCES`, sem execução: leitura de texto por `schema.mjs`): as tabelas
`SGC_*` de `backend/setup-backend.mjs` (ondas 1 a 4, R-026/R-051 — as ondas
novas editam o `CREATE` das tabelas existentes em vez de `ALTER`, porque nada
foi publicado ainda: é assim que `SGC_PEDIDO_ITEM.ID_SOLICITACAO` entrou; a
onda 4 acrescentou `SGC_PARAMETRO_COMPRA`, `SGC_VENDA_DESCONSIDERADA` e
`SGC_COBERTURA_LOG`), o
`schema.mjs` da lib instalada em `node_modules` e as tabelas `PC*`
do WinThor em `backend/simulator/schema-winthor.mjs` (`PCNFENT`/`PCLANC`
novas e colunas novas em `PCMOV`/`PCPRODUT`, R-027; onda 3, R-069:
`PCCLIENT.CGCENT` e `PCMOV.DTCANCEL`; onda 4, R-096:
`PCEST.QTBLOQUEADA`/`QTINDENIZ`/`QTRESERV`, que entram no estoque líquido de
R-085 — só simulador; a
plataforma usa o Oracle real, pelo `jdbcId` de `add-003-jdbc-winthor.mjs`).
Dias úteis (R-025/R-038): `backend/lib/dias-uteis.mjs` exporta os fragmentos
SQL (`somarDiasUteis`, `somarDiasCorridos`, `diasUteisEntre`), que rodam sem
alteração no dialeto abaixo — `mysql-dialect.mjs` ganhou `FLOOR`/`MOD` como
função registrada e `DATE_ADD(col, INTERVAL <expressão> DAY)` como reescrita
(antes só literal).

## Fragmentos SQL compartilhados (`backend/sql/`, R-070/R-074)

`backend/lib/fragmentos.mjs` exporta `fragmento(nome)`: lê `backend/sql/<nome>`
(o `.sql` é opcional), tira as linhas de comentário e devolve o texto. É por ele
que os blocos de pendência do gancho (`pendencias-*.sql`, R-030/R-044) e a régua
única de situação da solicitação (`situacao-solicitacao.sql`, R-075 — o
cabeçalho declara os aliases `S`/`C`/`SF`/`I` e os três `LEFT JOIN` que quem
compõe precisa repetir) chegam ao `add-005`, ao `add-011` e ao `add-012`. A
vírgula entre colunas **não** é do carregador: é convenção dos blocos de
pendência e vive no `add-005` (`colunasDePendencia`), porque a régua de situação
é uma expressão escalar e uma vírgula no fim a quebraria.

## Shims novos do dialeto na onda 3 (`mysql-dialect.mjs`)

- **`REGEXP_SUBSTR(texto, padrão, 1, n)`** (R-064) como função registrada: só as
  formas `'[^,]+'` e `'[^:]+'` que os plans usam; qualquer outra **lança**, em
  vez de devolver um pedaço plausível.
- **O gerador de linhas do Oracle** (R-064) `SELECT <x(LEVEL)> … FROM DUAL
  CONNECT BY <x(LEVEL)> IS NOT NULL` vira `WITH RECURSIVE NIVEL(LVL) …` (teto de
  200), fundido com o `WITH` que já abria a consulta. É o que faz o
  `sgcWintRastreioSolicitacoes` da 008 rodar aqui com o MESMO texto Oracle.
- **`JSON_UNQUOTE(JSON_EXTRACT(col, '$.k'))` → `json_extract(col, '$.k')`**
  (R-071): a prioridade vive em `KB_CARD.VALORES_JSON` (R-009).
- **`VALUES(col)` → `excluded.col` até o fim da INSTRUÇÃO** (R-079), e não até o
  fim do trecho fora de literal: um `'texto'` no meio do `ON DUPLICATE KEY
  UPDATE` deixava crus todos os `VALUES()` seguintes.

Os quatro estão provados, um a um, em `smoke/000-dialeto.mjs` (S0-010..S0-013),
que também carrega a régua de situação (S0-014).

## Shims novos do dialeto na onda 4 (`mysql-dialect.mjs`, R-096/R-100/R-113)

Nenhuma reescrita da onda 3 saiu: a nova entra no **fim** da cadeia de
`toSqlite()`, antes do `mapOutsideStrings`.

- **`POWER(base, expoente)`** e **`SQRT(valor)`** como função registrada (a
  mesma flag de compilação que já obrigou `FLOOR`/`CEIL`): o peso por recência
  `0,85^dias` e a volatilidade `SQRT(AVG(x²) − AVG(x)²)` da 011.
- **`ADD_MONTHS(data, n)`** do Oracle: mesmo dia, `n` meses depois (negativo
  volta); dia que não existe no mês de destino cai no último dia do mês
  (31/03 − 1 mês = 28/02). É a janela de 12 meses do lead time medido.
- **O gerador de calendário do Oracle** `SELECT … FROM DUAL CONNECT BY LEVEL
  <= n` vira `WITH RECURSIVE CALENDARIO(LEVEL) …` (`CALENDARIO`, e não
  `NIVEL(LVL)` de R-064: as duas reescritas convivem). É o que dá uma linha por
  dia do período — o denominador do consumo ponderado da 011 — inclusive nos
  dias sem venda. O regex não atravessa outro `SELECT` (senão apagaria as CTEs
  anteriores) e, sem parêntese envolvente, o fim da instrução conta como fim de
  bloco (o gerador solto). `CONNECT BY` em qualquer outra forma segue **sem**
  tradução, de propósito.
- **`INSTR` e `STDDEV_POP` ficaram de fora** (R-100): nenhuma SQL da onda usa
  `INSTR` e a volatilidade é `AVG`/`SQRT`, não o agregado.

Os shims estão provados em `smoke/000-dialeto.mjs` (S0-015) e o gerador, nas
duas formas (dentro de uma CTE precedida de outras duas, e solto), em S0-016.

## Seed e smoke, um arquivo por spec

- `simulator/seed.mjs` cria o schema, os 5 usuários, o quadro e as 10 fases, e
  chama `simulator/seed/00N-*.mjs` nesta ordem: `001-fornecedores`,
  `002-quadro`, `003-itens`, `004-agenda`, `005-notas-fiscais`, `006-transito`,
  `007-bo`, `008-solicitacoes`, `009-indicadores`, `011-compras-inteligentes`.
  Cada um exporta
  `seed00N(db, cenario)`; 001-007 já semeiam as ondas 1 e 2; 008-009 e 011 são
  stub até cada feature preencher (o cabeçalho de cada um diz o que o plan
  pede). A 010 não semeia nada, e a 012 também não tem arquivo próprio: nesta
  onda ela é dona das linhas de `SGC_COBERTURA` do `seed/003-itens.mjs`
  (R-096).
- `simulator/smoke.mjs` é o orquestrador: abre **um** banco descartável
  (`smoke/base.mjs`, `abrirContexto()`) e roda, na ordem, `smoke/000-esqueleto.mjs`
  (o esqueleto do projeto — S0-001..S0-006), `smoke/000-dias-uteis.mjs`
  (S0-007..S0-009 — prova o fragmento SQL de `lib/dias-uteis.mjs` contra o
  dialeto do simulador), `smoke/000-dialeto.mjs` (S0-010..S0-016 — os shims das
  ondas 3 e 4 e o carregador de `backend/sql/`) e `smoke/00N-*.mjs` de cada
  spec. A ordem das suítes de spec não é a numérica: a `012-coberturas` vem
  logo depois de `003-itens` (ela revalida o smoke da 003 e é dona do
  `SGC_COBERTURA` do seed dela) e a `011-compras-inteligentes` vem depois de
  `009-indicadores` (R-107).
  Cada um exporta `suite(ctx)`, com `ctx.chamar`/`ctx.teste` prontos; 001-007 já
  têm os cenários das ondas 1 e 2; 008-009, 011 e 012 são stub (`suite(ctx) {}`)
  — o
  `teste()` de cada cenário C-00N/RN-00N do plan entra lá. R-045 (revisão
  cruzada): como o banco é um só para todas as suítes, nenhuma pode assumir
  total absoluto de listagem — conta pelo banco, por diferença, ou recorta pelos
  próprios cards (`CARDS_00N`).

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

## WinThor real no simulador (`winthor-oracle.mjs`, opcional)

Por padrão as `sgcWint*` rodam sobre as tabelas PC* imitadas em SQLite
(`schema-winthor.mjs` + seeds): determinístico, sem rede, e é assim que
`npm test` (check + smoke) sempre roda. Numa máquina com acesso ao Oracle do
ERP (a VPS liberada no firewall), `SIMULATOR_WINTHOR=oracle` no `backend/.env`
faz o `server.mjs` entregar um executor externo ao `createRunner`: toda
definition `type: 'SQL'` de nome `sgcWint*` roda o seu SQL Oracle, literal
(sem o dialeto SQLite), no WinThor real, com `WINTHOR_JDBC_URL/USER/PASSWORD`
— as mesmas chaves que `add-003-jdbc-winthor.mjs` lê. Tudo o mais (banco do
projeto, `JAVASCRIPT`, `INTEGRATION`) continua no SQLite; uma `JAVASCRIPT` que
chama uma `sgcWint*` por id também cai no Oracle. O executor só aceita
`SELECT`/`WITH`.

Pré-requisitos na máquina: `oracledb` (devDependency, já no `npm install`) e o
**Oracle Instant Client** em modo thick — o usuário do WinThor só tem
verificador de senha 10G e o modo thin recusa o login (`NJS-116`). Na VPS ele
está em `/opt/oracle/instantclient_19_26`, registrado em
`/etc/ld.so.conf.d/oracle-instantclient.conf`; em outra máquina, aponte
`ORACLE_CLIENT_LIB_DIR` para a pasta. `GET /health` mostra `winthor:` com a
versão do servidor e o modo (`thick`/`thin`), ou `sqlite (PC* do seed)`.

Atenção: os dados `SGC_*` continuam os do seed; só a leitura do ERP é real. E
uma `JAVASCRIPT` que mande SQL com PC* por `runQueryMitra` (banco do projeto)
não chega ao Oracle — nem aqui nem em produção. O smoke barra isso em dois
pontos: `S0-018` (`000-esqueleto.mjs`) varre o código de toda `JAVASCRIPT`
publicada, e `D-016` (`005-notas-fiscais.mjs`) roda `sgcNfDetectar` e
`sgcNfVincular` com as `sgcWint*` desviadas para um executor externo e confere,
por `onQuery`, que nada do que foi por `runQueryMitra` cita tabela PC*.

Testes: `smoke/000-winthor-real.mjs` (W-001..W-004) prova o roteamento com um
executor falso, sem rede.

## Diagnóstico e voltar ao Mitra real

Iguais ao kit da skill `mitra-escopo` (`GET /health`, `VITE_MITRA_AUTH_URL` no
`frontend/.env` para apontar para produção — sem alteração de código, e
lembrando que aí toda chamada bate em produção).
