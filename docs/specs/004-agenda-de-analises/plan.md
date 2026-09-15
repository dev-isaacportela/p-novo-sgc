# Plan: Agenda de análises

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

Preencher **antes** de detalhar o desenho. Falha aqui é replanejamento.

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; 20 cenários e 14 regras com números |
| Backend escrito local, executado no sandbox | sim | colunas de `SGC_AGENDA` e `SGC_AGENDA_PARTICIPANTE` no `setup-backend.mjs` (arquivo do integrador) e as SFs em `backend/add-007-agenda.mjs`; nada do `mitra-sdk` roda daqui — o `add-007` só é executado no sandbox |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL é `CREATE TABLE IF NOT EXISTS` e a plataforma gera a migration ao rodar no sandbox |
| Leitura e escrita por Server Function | sim | a tela usa `linhas()`/`acao()` de `src/lib/mitra-api.ts`; zero `listRecords`/`patchRecord`. Escrita de pessoa é SF SQL guardada por `:VAR_USER`; escrita de processo (cron) é SF SQL interna chamada por id, como as `kbEsc*` do motor |
| Simulador cobre a feature | sim | `add-007-agenda.mjs` entra no `PUBLISH_ORDER`; seed `simulator/seed/004-agenda.mjs` com vencido, futuro, recorrente com limite, cancelado e processado; `CHECK_INPUT` ganha os filtros da agenda; `sim:check` verde |
| Testes automatizados obrigatórios | sim | cada linha da seção **Testes** da spec vira `teste()` em `backend/simulator/smoke/004-agenda.mjs` ou `test()` em `frontend/tests/agenda.test.mjs` |
| Design tokens, sem cor literal | sim | tela montada com o vocabulário de `components/page.tsx`; o `DatePicker` novo usa `--brand-*`, `--card`, `--ink-*`, `--rule-*` nos dois temas, zero hex |
| Simplicidade | sim | nenhuma dependência nova e nenhuma abstração com uma implementação só; o `DatePicker` próprio é o que a emenda do `design.md` §1.4/§9.2 (2026-09-15, UI-03 B) passou a exigir — registrado em **Complexity Tracking** |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`
- **Reuso identificado:**
  - `@benenutri/mitra-kanban` 1.3.0: `kbCardCriar` (com `criadoPor` e `origem: 'sistema'`, que só valem sem sessão) e `kbUsuariosListar` (8003, busca/limite/offset) para escolher participantes — nenhuma SF nova de usuário.
  - Spec 001: `sgcFornecedorListar` (com `ativo: 1`) para as opções de fornecedor e `sgcFornecedorCarregar(codfornec).filiais` para as filiais atendidas — fonte única das filiais, porque o listar só devolve `QT_FILIAIS` (C-09).
  - Spec 002: `sgcEscPedidoCapaInserir` (capa de `SGC_PEDIDO` por id), `sgcPersonaAtual` e `permissoesDe(persona, acesso)` de `frontend/src/lib/permissoes.ts` — a 004 **lê** os campos `agendar` e `cancelarAgendamento` da interface `Permissoes` e não define matriz própria (B-02).
  - `frontend/src/lib/formato.ts`: `fmtData`, `fmtDataHora`, `hojeIso`.
  - `components/page.tsx`: `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `FilterChip`, `SelectMenu`, `Field`, `LabelledField`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Status`, `Badge`, `Alert`, `EmptyState`, `Code`, `Dash`, `Pagination`, `Button`, `IconButton`.
- **Dependência nova:** nenhuma. O `DatePicker` é componente do projeto sobre `ui/popover` e `ui/input`, que já estão instalados.

## Modelo de dados

Entidades da spec → estrutura real. Toda mudança de schema entra em
`setup-backend.mjs` (ou num `add-NNN-*.mjs`) e vira migration gerada pelo
sistema ao rodar no sandbox — nunca escrita à mão.

| Entidade (spec) | Tabela | Campos-chave | Observação |
|---|---|---|---|
| Agendamento de análise | `SGC_AGENDA` | ver abaixo | uma linha por ocorrência; a recorrência cria linhas novas, não expande em memória |
| Participante | `SGC_AGENDA_PARTICIPANTE` | `ID_AGENDA`, `USUARIO_ID` | N:1 com a agenda; `USUARIO_ID` é `INT_USER.ID` |
| Pedido gerado | `SGC_PEDIDO` (spec 002) | `ORIGEM = 'agenda'`, `ID_AGENDA` | escrito pelo processamento pela escrita de capa da 002 |

```sql
CREATE TABLE IF NOT EXISTS SGC_AGENDA (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  CODFORNEC INT,
  FORNECEDOR VARCHAR(200),
  CODFILIAL VARCHAR(10),
  FILIAL VARCHAR(200),
  DATA_ANALISE VARCHAR(10),
  PERIODO_INICIO VARCHAR(10),
  PERIODO_FIM VARCHAR(10),
  RECORRENCIA VARCHAR(10) DEFAULT 'nenhuma',
  DATA_LIMITE_RECORRENCIA VARCHAR(10),
  OBSERVACAO VARCHAR(500),
  ATIVO BOOLEAN DEFAULT TRUE,
  PROCESSADO_EM VARCHAR(19),
  ID_CARD_GERADO INT,
  DATA_ENVIO_REAL VARCHAR(10),
  DATA_PLANEJADA_ORIGINAL VARCHAR(10),
  CANCELADO_EM VARCHAR(19),
  CANCELADO_POR INT,
  CRIADO_POR INT,
  CRIADO_EM VARCHAR(19),
  ATUALIZADO_EM VARCHAR(19)
);

CREATE TABLE IF NOT EXISTS SGC_AGENDA_PARTICIPANTE (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_AGENDA INT,
  USUARIO_ID INT,
  CRIADO_EM VARCHAR(19)
);
```

- Tipos alinhados com `SGC_PEDIDO` e `SGC_FORNECEDOR` (C-14 da revisão cruzada): `CODFORNEC INT`, `CODFILIAL VARCHAR(10)`, `FORNECEDOR VARCHAR(200)`, `FILIAL VARCHAR(200)` — os mesmos valores viajam entre as três tabelas.
- `RECORRENCIA` guarda `nenhuma` | `semanal` | `quinzenal` | `mensal` em minúsculas (nomes novos, sem compatibilidade com o `FREQUENCIA` em caixa alta do p-45547).
- Situação **não é coluna**: sai de `ATIVO`, `PROCESSADO_EM` e `DATA_ANALISE` (RN-005). Gravar situação seria um quarto lugar para desincronizar.
- `DATA_ENVIO_REAL` e `DATA_PLANEJADA_ORIGINAL` existem por EN-05/RN-012 e só são escritas pelo envio da spec 002; as duas são data (`AAAA-MM-DD`), porque o `dtEnvio` que a 002 manda é `'AAAA-MM-DD'` (C-12).
- D-13 (revisão adversarial): `backend/setup-backend.mjs` grava `DATA_ENVIO_REAL` como `VARCHAR(19)` (convenção de instante), não `VARCHAR(10)` como este documento descrevia — divergência entre plan e DDL real, não entre DDL e código: `sgcEscAgendaEnvio` sempre grava os 10 caracteres de `dtEnvio`, então o valor cabe sem truncar e sem hora nenhuma sobrando. Registrado aqui para o integrador decidir se estreita a coluna num ajuste futuro; não é bloqueante e `setup-backend.mjs` não foi tocado por esta correção.
- Datas em `VARCHAR(10)` (`AAAA-MM-DD`) e instantes em `VARCHAR(19)` (`AAAA-MM-DDTHH:MM:SS`), preenchidos no código. Sem `FOREIGN KEY`, por convenção do projeto.
- Índices: nenhum novo — o volume esperado (milhares de linhas) é lido sempre com `LIMIT/OFFSET` e filtro por data.

## Contratos de backend

Uma linha por Server Function. Nome é o contrato com `SERVER_FUNCTION_NAMES`.
Ids locais da faixa da spec: leituras e JS em **7401+**, escritas em **7450+**.

| Nome (`add-007-agenda.mjs`) | Id local | Tipo | Entrada (`{{param}}`) | Saída | Atende |
|---|---|---|---|---|---|
| `sgcAgendaListar` | 7401 | SQL | `codfornec` (0), `codfilial` (''), `dataInicio` (''), `dataFim` (''), `situacao` (''), `hoje`, `limite`, `offset` | `ID, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM, RECORRENCIA, DATA_LIMITE_RECORRENCIA, OBSERVACAO, ATIVO, PROCESSADO_EM, ID_CARD_GERADO, DATA_ENVIO_REAL, DATA_PLANEJADA_ORIGINAL, CANCELADO_EM, CRIADO_POR, CRIADOR_NOME, PARTICIPANTES_IDS, PARTICIPANTES_NOMES` | RF-015, RF-005, RF-014 |
| `sgcAgendaListarTotal` | 7402 | SQL | os mesmos filtros | `TOTAL` | RF-015 |
| `sgcAgendaCarregar` | 7403 | SQL | `id` | uma linha, mesmas colunas do listar | RF-001 (reabrir para editar) |
| `sgcAgendaProcessar` | 7404 | JAVASCRIPT (`cronExpression '0 */30 * * * *'`) | nenhuma | `{ ok, hoje, processados, tentados, resultados: [{ idAgenda, idCard, proxima }], erros: [{ idAgenda, erro }] }` | RF-006 a RF-010 |
| `sgcAgendaProcessarManual` | 7405 | JAVASCRIPT | `modo` (`mes`\|`intervalo`\|`dias`\|`agendamento`), `dataInicio` (''), `dataFim` (''), `dias` (0), `idAgenda` (0) | igual à do cron, mais `filtros` | RF-011, RF-012, RF-019 |
| `sgcEscAgendaInserir` | 7450 | SQL guardada por `:VAR_USER` | `codfornec`, `fornecedor`, `codfilial`, `filial`, `dataAnalise`, `periodoInicio`, `periodoFim`, `recorrencia`, `dataLimiteRecorrencia`, `observacao`, `criadoEm` | — | RF-001, RF-017 |
| `sgcEscAgendaAtualizar` | 7451 | SQL guardada por `:VAR_USER` | `id`, os mesmos campos, `atualizadoEm` | — | RF-001, RF-017 |
| `sgcEscAgendaCancelar` | 7452 | SQL guardada por `:VAR_USER` | `id`, `canceladoEm` | — | RF-013, RF-017 |
| `sgcEscAgendaParticipanteLimpar` | 7453 | SQL guardada por `:VAR_USER` | `idAgenda` | — | RF-005, RN-010 |
| `sgcEscAgendaParticipanteInserir` | 7454 | SQL guardada por `:VAR_USER` | `idAgenda`, `usuarioId`, `criadoEm` | — | RF-005 |
| `sgcEscAgendaProcessada` | 7455 | SQL interna (sem sessão) | `id`, `idCard`, `processadoEm` | — | RF-008, RF-010 |
| `sgcEscAgendaProximaInserir` | 7456 | SQL interna (sem sessão) | `codfornec`, `fornecedor`, `codfilial`, `filial`, `dataAnalise`, `periodoInicio`, `periodoFim`, `recorrencia`, `dataLimiteRecorrencia`, `observacao`, `criadoPor`, `criadoEm` | — | RF-009 |
| `sgcEscAgendaParticipanteCopiar` | 7457 | SQL interna (sem sessão) | `idOrigem`, `idNova`, `criadoEm` | — | RF-009, C-017 |
| `sgcEscAgendaEnvio` | 7458 | SQL interna (sem sessão) | `idCard`, `dtEnvio` (`'AAAA-MM-DD'`, C-12) | — | RF-016, RN-012 |

Regras: filtro desligado é `''` no texto e `0` no numérico; toda listagem tem
`LIMIT/OFFSET`; `:VAR_USER` identifica quem chama; escrita de usuário business
só por SF SQL.

### Por que há escritas "internas" ao lado das guardadas

`:VAR_USER` só existe na chamada de topo feita por uma pessoa. O cron não tem
sessão e uma SF chamada de dentro de outra também não (é o mesmo motivo pelo
qual as regras ligadas do motor recebem `usuarioId` e nunca `:VAR_USER`). Por
isso:

- o que a **tela** grava (inserir, atualizar, cancelar, participantes) é SQL
  guardada: uma instrução, `WHERE ... AND EXISTS (SELECT 1 FROM
  SGC_USUARIO_PERSONA P WHERE P.USUARIO_ID = :VAR_USER AND P.PERSONA IN (...))`,
  e `CRIADO_POR = :VAR_USER` / `CANCELADO_POR = :VAR_USER` — quem chama por fora
  da tela não escapa da persona (P-12);
- o que o **processo** grava (marcar processado, criar a próxima ocorrência,
  copiar participantes, sincronizar envio) é SQL interna sem guarda, chamada
  por id de dentro de uma SF JAVASCRIPT, exatamente como as `kbEsc*` do motor.
  A permissão de quem disparou já foi conferida na SF JS (`sgcAgendaProcessarManual`)
  ou não existe pessoa alguma (cron).

### Guardas por persona nas escritas

| SF | Personas aceitas | Condição extra |
|---|---|---|
| `sgcEscAgendaInserir` | `admin`, `analista`, `gestor` | `AND EXISTS (SELECT 1 FROM SGC_FORNECEDOR F WHERE F.CODFORNEC = {{codfornec}} AND F.ATIVO = TRUE)` (RN-015) |
| `sgcEscAgendaAtualizar`, `sgcEscAgendaParticipante*` | `admin`, `analista`, `gestor` | só com `PROCESSADO_EM IS NULL AND ATIVO = TRUE`; **sem** a checagem de fornecedor ativo (agendamento existente segue editável, RN-015) |
| `sgcEscAgendaCancelar` | `admin`, `gestor`, `diretoria` | `AND PROCESSADO_EM IS NULL AND ATIVO = TRUE` (RN-004) |

A guarda é **a mesma da 002**, literal (B-03 da revisão cruzada), com a lista de
personas da linha acima no lugar de `<personas>`:

```sql
AND EXISTS (
  SELECT 1 FROM INT_USER IU
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
  WHERE IU.ID = :VAR_USER
    AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
    AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                               WHEN 'ADMIN' THEN 'admin'
                               WHEN 'RESTRICTED' THEN 'comercial'
                               ELSE 'analista' END) IN (<personas>)
)
```

O mapa de `ACCESS_LEVEL` e o `<> 'READ_ONLY'` vêm de lá; a agenda não inventa
fallback próprio. A mesma resolução vale na leitura de persona do
`sgcAgendaProcessarManual`.

### Filtro de situação no `sgcAgendaListar`

A situação é derivada e o filtro precisa dela no SQL:

```sql
AND ('{{situacao}}' = '' OR '{{situacao}}' = CASE
      WHEN A.ATIVO = FALSE THEN 'cancelado'
      WHEN A.PROCESSADO_EM IS NOT NULL THEN 'processado'
      WHEN A.DATA_ANALISE < '{{hoje}}' THEN 'atrasado'
      ELSE 'pendente' END)
```

`hoje` vem da tela (`hojeIso()`, dia do **navegador**) para a lista concordar com
o que a pessoa vê — **assimetria registrada (R-10)**: o servidor decide o dia no
fuso fixo de Brasília (`hojeNoFuso()` da lib, `FUSO_MINUTOS = -180`), porque o
cron roda sem ninguém olhando; a tela decide no fuso do navegador, porque ela
mostra a data para uma pessoa. Quem opera fora do fuso do Brasil pode ver, na
virada do dia, um agendamento marcado como atrasado que o cron ainda não pegou
(ou o contrário) — a diferença dura no máximo uma rodada de 30 minutos e nunca
muda o que é gravado. É a mesma regra de `situacao()` em `lib/agenda.ts`, escrita
duas vezes de propósito (espelho tela/servidor, como `podeMover`); os dois
lados são testados com os mesmos números (C-015, C-018, RN-005).

Participantes na listagem, sem segunda chamada por linha:

```sql
LEFT JOIN SGC_AGENDA_PARTICIPANTE P ON P.ID_AGENDA = A.ID
LEFT JOIN INT_USER PU ON PU.ID = P.USUARIO_ID
... GROUP_CONCAT(P.USUARIO_ID ORDER BY P.ID SEPARATOR ',') AS PARTICIPANTES_IDS,
    GROUP_CONCAT(PU.NOME ORDER BY P.ID SEPARATOR ', ') AS PARTICIPANTES_NOMES
GROUP BY A.ID, ...
```

(`GROUP_CONCAT ... SEPARATOR` já tem shim no `mysql-dialect.mjs` do simulador.)

### `sgcAgendaProcessar` — o cron, passo a passo

Sem parâmetros, sem sessão. Preâmbulo igual ao das JS do motor: `runQueryMitra`
para ler, `executeServerFunctionMitra` para gravar, ids injetados na publicação
(`__SGC_IDS__` trocado por `{ kbCardCriar, sgcEscPedidoCapaInserir, sgcEscAgendaProcessada,
sgcEscAgendaProximaInserir, sgcEscAgendaParticipanteCopiar }`). Os ids saem do
helper do integrador **`backend/ids-do-mapa.mjs`** (nome → id de *todos* os
blocos de `server-functions.ts`), e não do `lerIdsDoMapa` da lib, que só devolve
as `kbEsc*` (B-08); na publicação, `listServerFunctionsMitra` resolve os mesmos
nomes para os ids reais.

1. `hoje` = dia em Brasília (`new Date(Date.now() - 180*60000).toISOString().slice(0,10)`, o mesmo `hojeNoFuso()` da lib, `FUSO_MINUTOS = -180`), nunca o dia UTC (RN-013).
2. Uma consulta seleciona o lote (RNF-002):
   ```sql
   SELECT A.*, (SELECT COUNT(*) FROM SGC_AGENDA_PARTICIPANTE P WHERE P.ID_AGENDA = A.ID) AS QT_PARTICIPANTES
   FROM SGC_AGENDA A
   WHERE A.ATIVO = TRUE AND A.PROCESSADO_EM IS NULL
     AND A.DATA_ANALISE <> '' AND A.DATA_ANALISE <= '<hoje>'
     AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO PD WHERE PD.ID_AGENDA = A.ID)
   ORDER BY A.DATA_ANALISE, A.ID LIMIT 30
   ```
   O `NOT EXISTS` é a segunda trava de idempotência (RN-007): mesmo que a
   marcação tenha falhado depois de criar o card, o agendamento não gera outro.
3. Uma consulta resolve o quadro: `SELECT ID FROM KB_BOARD WHERE SLUG = 'compras' LIMIT 1`. A fase de entrada é a primeira comum do quadro (`analise`, F-01): é onde `kbCardCriar` põe o card, sem precisar resolver `SGC_FASE`.
4. Para cada agendamento do lote (nada aqui interrompe o laço — erro vai para `erros[]`, RNF-004):
   1. `titulo = FILIAL.toUpperCase() + ' · ' + FORNECEDOR.toUpperCase()` — a mesma RN-014 da 002 (`tituloDoPedido`, em maiúsculas), sem o sufixo "- Agenda" do legado (C-02 A, B-09).
   2. **`kbCardCriar`** por id: `{ boardId, titulo, valoresJson: JSON.stringify({ fornecedor, filial, prioridade: 'normal' }), responsaveisIds: String(CRIADO_POR), prazo: '', criadoPor: CRIADO_POR, origem: 'sistema' }`. Resposta `{ ok, id }`; `ok !== true` → registra o erro e segue. É o `kbCardCriar` que garante ordem, `TEXTO_BUSCA`, a linha de `KB_MOVIMENTO` com `ORIGEM = 'sistema'` e o disparo das automações `card_criado` do quadro.
   3. **`sgcEscPedidoCapaInserir`** (spec 002, id 7260, SQL "por id" com `{{usuarioId}}` e sem `:VAR_USER`, por isso chamável de dentro do JS) — os parâmetros são os da dona (B-01): `{ usuarioId: CRIADO_POR, cardId, codfornec, fornecedor, codfilial, filial, periodoInicio, periodoFim, origem: 'agenda', idAgenda: ID, agora }`.
   4. **`sgcEscAgendaProcessada`** por id: `{ id, idCard, processadoEm: agora }`.
   5. Recorrência: `proxima = proximaOcorrencia(DATA_ANALISE, RECORRENCIA, DATA_LIMITE_RECORRENCIA)`. Havendo próxima, **`sgcEscAgendaProximaInserir`** com o período recalculado (RN-008: `fim = proxima`, `inicio = proxima - duração`) e `criadoPor = CRIADO_POR`.
   6. `QT_PARTICIPANTES > 0` e próxima criada: uma consulta pega o id novo (`SELECT ID FROM SGC_AGENDA WHERE CRIADO_POR = <x> AND CRIADO_EM = '<agora>' ORDER BY ID DESC LIMIT 1`) e **`sgcEscAgendaParticipanteCopiar`** copia a lista numa instrução (`INSERT ... SELECT`).
5. Devolve `{ ok: true, hoje, tentados, processados, resultados, erros }`.

**Custo (RNF-001):** 3 execuções por agendamento (card + capa + marcação), 4 com
recorrência, 5 com recorrência e participantes. As consultas de leitura são
`runQueryMitra`, que não contam como execução de SF. Com o teto de **30** por
rodada (R-06): no pior caso 150 execuções a cada 30 minutos — metade do teto de
300/min, que é do **projeto inteiro** e divide com o quadro, os itens e as
telas; o que sobrar entra na rodada seguinte.

**Por que o cron não reusa `sgcPedidoCriar` (002):** aquela SF roda com sessão
(é a tela criando pedido). Sem sessão, ela precisaria repassar `criadoPor` e
`origem` por duas camadas e o custo em execuções seria o mesmo. O cron chama
`kbCardCriar` e a escrita de capa direto; da 002 reusa só a escrita.

### `sgcAgendaProcessarManual` — os quatro recortes (AG-06 B)

Mesmo corpo do cron (o `add-007` concatena a mesma string `ROTINA` nas duas
SFs — cada SF da plataforma roda isolada e carrega a própria cópia, como faz o
motor com `motor.mjs`), com duas diferenças:

1. **Persona antes de tudo.** Uma consulta por `runQueryMitra` com a mesma resolução da guarda acima (`INT_USER` + `SGC_USUARIO_PERSONA`, `ACCESS_LEVEL` mapeado, `READ_ONLY` fora): `SELECT COALESCE(UP.PERSONA, CASE … END) AS PERSONA, COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACESSO FROM INT_USER IU LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID WHERE IU.ID = :VAR_USER`. Fora de `admin`/`analista`/`gestor`, ou com `READ_ONLY` → `{ ok: false, error: 'Seu perfil não processa a agenda.' }` sem tocar em nada (C-012).
2. **Seleção pelo recorte**, no lugar de `DATA_ANALISE <= hoje`:

| `modo` | Entrada | `WHERE` |
|---|---|---|
| `agendamento` | `idAgenda` | `A.ID = {{idAgenda}}` (processa mesmo data futura, RN-014) |
| `intervalo` | `dataInicio`, `dataFim` | `A.DATA_ANALISE BETWEEN inicio AND fim`; `inicio > fim` → recusa |
| `dias` | `dias` (1–999) | `BETWEEN hoje AND hoje + (dias - 1)` |
| `mes` (padrão) | — | `BETWEEN` primeiro e último dia do mês de `hoje` |

Modo desconhecido ou vazio cai em `mes` — nunca a base inteira (RF-012).

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/agenda` | lista paginada com filtros e situação, diálogo de novo/editar, diálogo de processamento manual, confirmação de cancelamento | `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `FilterChip`, `SelectMenu`, `SearchInput`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Status`, `Code`, `Dash`, `Alert`, `EmptyState`, `Pagination`, `Button`, `IconButton`, `Field`, `LabelledField`, `ui/dialog`, `ui/textarea` | `pages/agenda/AgendaPage.tsx`, `pages/agenda/AgendaDialogo.tsx`, `pages/agenda/ProcessarDialogo.tsx`, `components/DatePicker.tsx` |

**Cabeçalho.** `PageHeader module="Compras" title="Agenda de análises"`, `meta`
com as contagens (`12 agendamentos · 3 atrasados`, separadas por `MetaDot`) e
`actions` com "Processar agenda" (`secondary`) e "Novo agendamento" (`primary`),
ambos escondidos para quem não pode (RF-017) — permissão some o botão, não o
desabilita em silêncio.

**Filtros** (`Toolbar` colada à tabela, dentro do `Panel`, §9.2): fornecedor
(`SelectMenu`, spec 001), filial (`SelectMenu`), data de/até (dois `DatePicker`)
e situação (`SelectMenu`: todas, pendente, atrasado, processado, cancelado).
Filtro ativo vira `FilterChip` acima da tabela.

**Tabela** (§9.1, linhas compactas, sem fundo alternado): Data da análise
(`RowTitle` com `fmtData`) · Situação (`Status`: `off` pendente, `alert`
atrasado, `live` processado, `off` cancelado — sempre com o texto ao lado, nunca
só cor) · Fornecedor (`RowTitle`) com filial em `RowMeta` · Período (`fmtData` –
`fmtData`) · Recorrência (texto; `Dash()` quando nenhuma) · Participantes (nomes
truncados, `Dash()` quando vazio) · Envio (data real; quando difere da planejada,
`RowMeta` "planejado 20/10") · Pedido (`Code` com o id do card, link para
`/quadro`) · ações (`IconButton` "Editar agendamento" e "Cancelar agendamento",
`tone="danger"`). `EmptyState` quando o filtro não devolve nada;
`Pagination` de 50 em 50.

**Diálogo de novo/editar** (§9.5, `max-h-[90vh]`, só o miolo rola): fornecedor e
filial (`SelectMenu`; só fornecedores **ativos** entre as opções — `ativo: 1`,
RN-015; a filial só se habilita depois do fornecedor e as opções são as de
`sgcFornecedorCarregar(codfornec).filiais`, uma chamada por fornecedor escolhido,
C-09),
data da análise (`DatePicker`), período (campo "dias" que recalcula De/Até, mais
os dois `DatePicker`; padrão 45), recorrência (`SelectMenu`) e data-limite
(`DatePicker`, só aparece com recorrência), participantes (`SelectMenu` sobre
`kbUsuariosListar` + lista de escolhidos com `IconButton` de remover),
observação (`ui/textarea`, opcional). Erro em `Alert tone="error"` dentro do
diálogo; rodapé Cancelar / Salvar.

**Diálogo de processamento**: `SelectMenu` com os quatro recortes (cada um com
`hint` explicando o que processa), os campos do recorte escolhido, e o resultado
em `Alert` ("3 pedidos gerados; 1 agendamento com erro"). Enquanto processa, o
botão fica desabilitado (sem disparo duplo).

**Cancelamento**: diálogo curto de confirmação (fornecedor, filial e data), e o
resultado como `Alert` na tela — sem aviso passageiro (UI-02 A).

### `components/DatePicker.tsx` (UI-03 B)

Primeira tela que precisa dele; nasce aqui e serve às demais.

```tsx
type DatePickerProps = {
  value: string;                      // 'AAAA-MM-DD' ou ''
  onChange: (valor: string) => void;  // devolve 'AAAA-MM-DD' ou ''
  id?: string;
  min?: string;                       // 'AAAA-MM-DD'
  max?: string;
  disabled?: boolean;
  placeholder?: string;               // padrão 'dd/mm/aaaa'
  'aria-label'?: string;              // quando não estiver dentro de um Field/LabelledField
  className?: string;
};
```

**O que faz.** Campo de texto com máscara `dd/mm/aaaa` (digitar é o caminho
rápido) mais um botão de calendário que abre um `ui/popover` com a grade do mês:
cabeçalho com mês/ano e setas de mês, seis linhas de sete dias, dias de outro
mês em `ink-muted`, hoje com anel `--brand-500`, escolhido em `bg-primary
text-primary-foreground`, dia fora de `min`/`max` desabilitado. Texto incompleto
ou data impossível (31/02) não chama `onChange`: o campo fica com o texto e o
`Alert` do formulário cobra o campo ao salvar. Data sempre como **texto ISO** —
o componente nunca devolve `Date` nem cria objeto de data com fuso (o 20/10 do
usuário não pode virar 19/10 por causa de UTC).

**Teclado (obrigatório, RF-018).** `Tab` entra no campo e depois no botão;
`Enter` ou `Espaço` no botão abre a grade e põe o foco no dia atual;
setas movem um dia (esquerda/direita) ou uma semana (cima/baixo); `PageUp`/
`PageDown` mudam o mês; `Home`/`End` vão ao primeiro e ao último dia da semana;
`Enter` escolhe e fecha devolvendo o foco ao campo; `Esc` fecha sem escolher,
também devolvendo o foco. A grade é `role="grid"` com `aria-label` do mês, cada
dia é `role="gridcell"` com `aria-label` por extenso ("20 de outubro de 2026") e
`aria-selected`; o botão tem `aria-haspopup="dialog"` e `aria-expanded`.

**O que não faz** (e por isso continua pequeno): não seleciona intervalo (dois
campos independentes resolvem), não trata hora, não tem fuso, não tem locale
além de pt-BR, não aceita seleção múltipla, não traz dependência nova.

## Fluxo

1. A pessoa abre `/agenda`: a tela chama `sgcAgendaListar` e `sgcAgendaListarTotal` com os filtros (padrão: todas as situações, página 1) e monta a lista; a situação de cada linha sai de `situacao()` em `lib/agenda.ts`.
2. "Novo agendamento": o diálogo carrega fornecedores ativos (`sgcFornecedorListar`, `ativo: 1`) e usuários (`kbUsuariosListar`); escolher o fornecedor dispara `sgcFornecedorCarregar` para as filiais atendidas (C-09); escolher a data preenche o período pelo padrão de 45 dias (`periodoPadrao`).
3. Salvar: `validarAgendamento()` roda na tela; passando, `sgcEscAgendaInserir` (ou `sgcEscAgendaAtualizar`); em seguida `sgcEscAgendaParticipanteLimpar` e um `sgcEscAgendaParticipanteInserir` por pessoa (RN-010). O diálogo fecha e a lista recarrega.
4. A cada 30 minutos a plataforma executa `sgcAgendaProcessar` sem sessão: ele cria os pedidos vencidos, marca os agendamentos e cria as próximas ocorrências (passo a passo acima).
5. "Processar agenda": a tela chama `sgcAgendaProcessarManual` com o recorte; o retorno vira `Alert` e a lista recarrega.
6. Cancelar: `sgcEscAgendaCancelar`; a linha passa a `cancelado` e sai do alcance do processamento.
7. Quando o pedido gerado é enviado à indústria, o `sgcEnvioIndustriaRegistrar` da spec 002 chama `sgcEscAgendaEnvio` por id com `{ idCard, dtEnvio }`; a SQL localiza o agendamento por `ID_CARD_GERADO` e grava `DATA_ENVIO_REAL`, `DATA_PLANEJADA_ORIGINAL` (só quando ainda estiver vazia e a data diferir) e `DATA_ANALISE = dtEnvio` (RN-012).

## Simulador

- **Seed** (`backend/simulator/seed/004-agenda.mjs`, datas relativas a hoje, ids fixos para os testes citarem):

  O seed da 004 **só insere agendamentos e participantes** (B-06/B-07): os
  fornecedores e as filiais são os da 001 (`1015` FRESENIUS KABI e `1042` NESTLE
  ativos, `1088` DANONE inativo; filiais `1` Benenutri Matriz, `2` Benenutri
  Filial Norte, `3` Benenutri Filial Sul), e as personas são do
  `seed/002-quadro.mjs`, dono único de `SGC_USUARIO_PERSONA`.

  | id | Situação semeada | Dados |
  |---|---|---|
  | 1 | atrasado (hoje−1), semanal, sem limite | `1015` FRESENIUS KABI / filial `1`, criado por `ana`, 2 participantes (`gil`, `dora`) — a próxima cai em hoje+6 |
  | 2 | atrasado (hoje−1), quinzenal, sem limite | `1042` NESTLE / filial `2`, criado por `ana` — a próxima cai em hoje+13 |
  | 3 | pendente (hoje+1), sem recorrência | `1042` NESTLE / filial `3`, criado por `gil` |
  | 4 | pendente (hoje+5), quinzenal com `DATA_LIMITE_RECORRENCIA` = hoje+10 | `1088` DANONE (**inativo**) / filial `1`, criado por `ana` — a próxima (hoje+19) passa do limite; é também o agendamento antigo de fornecedor inativo do C-021 |
  | 5 | cancelado (`ATIVO = FALSE`, `CANCELADO_EM`), data hoje−2 | `1015` FRESENIUS KABI / filial `2`, criado por `ana` |
  | 6 | processado (`PROCESSADO_EM`, `ID_CARD_GERADO`) com `SGC_PEDIDO` de `ORIGEM = 'agenda'`, data hoje−3 | `1042` NESTLE / filial `1`, criado por `ana` |

  Assim o seed cobre o C-018 (2 atrasados, 2 pendentes, 1 processado, 1
  cancelado), o C-006 (dois vencidos recorrentes e dois futuros intocados), o
  C-005 do lado do servidor (o id 4 processado à mão não gera próxima) e o
  C-021 (o id 4 é de fornecedor inativo e segue valendo).

  `CENARIO.usuarios = { admin: 1, ana: 2, gil: 3, dora: 4, leo: 5 }` (1 `admin`,
  2 `analista`, 3 `gestor`, 4 `diretoria`, 5 `comercial`, P-01) vem do seed da
  002, que também garante o quadro `compras` com as dez fases — a agenda não
  cria quadro, não grava persona e não cadastra fornecedor.
- **`CHECK_INPUT`**: acrescentar `codfornec: '0'`, `codfilial: ''`, `dataInicio: ''`, `dataFim: ''`, `situacao: ''`, `hoje: '2026-09-15'`, `id: '1'`, `idAgenda: '1'` (arquivo do integrador; a spec só pede as chaves).
- **Dialeto:** nada novo. `GROUP_CONCAT(... SEPARATOR ...)`, `COALESCE`, `CASE` e `NOT EXISTS` já têm tratamento em `mysql-dialect.mjs`.
- **Como o smoke chama o cron:** `execute(definicao, {}, 0)` — `userId = 0` é a ausência de sessão, que é o que habilita `criadoPor`/`origem: 'sistema'` no `kbCardCriar`. Com `userId` de pessoa o mesmo teste falharia (o card nasceria em nome dela), e é justamente essa a garantia do C-019.
- `PUBLISH_ORDER` recebe `add-007-agenda.mjs` depois do `add-005` (quadro) e do `add-006`/`add-004` que a 002 e a 003 publicam — arquivo do integrador.

## Testes

**Obrigatório.** Mapa da seção **Testes** da spec para os arquivos.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `backend/simulator/smoke/004-agenda.mjs` | `sgcEscAgendaInserir` como `ana` + `sgcAgendaListar` devolve a linha com `PERIODO_INICIO = '2026-09-05'`, `PERIODO_FIM = '2026-10-20'`, `PROCESSADO_EM` nulo |
| C-002 | `frontend/tests/agenda.test.mjs` | `validarAgendamento({ periodoInicio: '2026-10-20', periodoFim: '2026-09-05' })` → `ok: false` e `erro` contém "período" |
| C-003 | `frontend/tests/agenda.test.mjs` | `validarAgendamento({ dataAnalise: '2026-10-20', recorrencia: 'semanal', dataLimite: '2026-10-10' })` → `ok: false` e `erro` contém "data-limite" |
| C-004 | `frontend/tests/agenda.test.mjs` | `proximaOcorrencia('2026-01-31','mensal')` → `'2026-02-28'`; de `'2026-02-28'` → `'2026-03-28'`; de `'2028-01-31'` → `'2028-02-29'` |
| C-005 | `frontend/tests/agenda.test.mjs` | `proximaOcorrencia('2026-10-05','quinzenal','2026-10-25')` → `'2026-10-19'`; de `'2026-10-19'` → `null` |
| C-006 | `backend/simulator/smoke/004-agenda.mjs` | `sgcAgendaProcessar` com `userId = 0` → `processados: 2` (ids 1 e 2); `KB_CARD` do quadro `compras` cresce 2 e os dois estão na fase `analise`; `SGC_AGENDA` 1 e 2 com `PROCESSADO_EM` e `ID_CARD_GERADO` preenchidos; duas linhas novas com `DATA_ANALISE` = hoje+6 e hoje+13; ids 3 e 4 com `PROCESSADO_EM` nulo |
| C-007 | `backend/simulator/smoke/004-agenda.mjs` | segunda chamada → `processados: 0`; `SELECT COUNT(*) FROM KB_CARD` igual ao de antes |
| C-008 | `backend/simulator/smoke/004-agenda.mjs` | `sgcAgendaProcessarManual({ modo: 'agendamento', idAgenda: 4 })` como `ana` → `processados: 1` mesmo com data futura (hoje+5); nenhuma linha nova em `SGC_AGENDA` (hoje+19 passa do limite hoje+10 — é o C-005 no servidor); o id 3 segue pendente |
| C-009 | `backend/simulator/smoke/004-agenda.mjs` | o teste insere três agendamentos próprios (hoje+40, hoje+41 e hoje+60) e chama `modo: 'intervalo'` de hoje+40 a hoje+41 → `resultados` traz os dois primeiros ids e não o terceiro |
| C-010 | `backend/simulator/smoke/004-agenda.mjs` | o teste insere um agendamento no dia 1 e outro no último dia do mês de hoje, e um no dia 5 do mês seguinte; `modo: ''` (padrão) → `resultados` traz os dois do mês e não o do mês seguinte |
| C-011 | `backend/simulator/smoke/004-agenda.mjs` | o teste insere agendamentos em hoje−1, hoje+2 e hoje+30; `modo: 'dias', dias: 7` → `resultados` traz só o de hoje+2 |
| C-012 | `backend/simulator/smoke/004-agenda.mjs` | `sgcAgendaProcessarManual` com `userId = leo` (comercial) → `ok: false`, `error` cita perfil; contagem de `KB_CARD` inalterada. O mesmo com `userId = gil` (gestor) → `ok: true` |
| C-013 | `backend/simulator/smoke/004-agenda.mjs` | `sgcEscAgendaCancelar` do id 3 com `userId = gil` → linha com `ATIVO = 0` e `CANCELADO_EM` preenchido; `sgcAgendaProcessarManual({ modo: 'agendamento', idAgenda: 3 })` seguinte → `processados: 0` |
| C-014 | `backend/simulator/smoke/004-agenda.mjs` | antes do C-013, `sgcEscAgendaCancelar` do id 3 com `userId = ana` → `ATIVO` continua 1 (a guarda `:VAR_USER` não deixou passar) |
| C-015 | `frontend/tests/agenda.test.mjs` + smoke | `situacao({ ATIVO: 1, PROCESSADO_EM: null, DATA_ANALISE: '2026-09-14' }, '2026-09-15')` → `'atrasado'`; `sgcAgendaListar({ situacao: 'atrasado' })` traz o id 1 |
| C-016 | `backend/simulator/smoke/004-agenda.mjs` | sobre o agendamento 6 (planejado hoje−3, com card gerado): `sgcEscAgendaEnvio({ idCard, dtEnvio: <hoje−1> })` (data pura, C-12) → `DATA_ENVIO_REAL` = hoje−1, `DATA_PLANEJADA_ORIGINAL` = hoje−3, `DATA_ANALISE` = hoje−1; segunda chamada com hoje mantém `DATA_PLANEJADA_ORIGINAL` em hoje−3 |
| C-017 | `backend/simulator/smoke/004-agenda.mjs` | limpar + inserir 3, depois limpar + inserir 2 → `SELECT COUNT(*)` = 2 com os ids esperados; depois do `sgcAgendaProcessar`, a ocorrência nova do id 1 (hoje+6) tem os mesmos 2 participantes |
| C-018 | `backend/simulator/smoke/004-agenda.mjs` | primeiro teste do arquivo, antes de qualquer processamento: `sgcAgendaListar({ situacao: 'atrasado', hoje })` → 2 linhas (ids 1 e 2) e `sgcAgendaListarTotal` → `TOTAL: 2`; sem filtro → 6 linhas, entre elas a cancelada |
| C-019 | `backend/simulator/smoke/004-agenda.mjs` | do card gerado pelo agendamento 1: `KB_CARD.CRIADO_POR = 2` (ana), `KB_CARD_RESPONSAVEL` com 2, `TITULO = 'BENENUTRI MATRIZ · FRESENIUS KABI BRASIL LTDA'` (RN-014 da 002, em maiúsculas), `KB_MOVIMENTO` (de 0 para a fase `analise`) com `ORIGEM = 'sistema'` e `USUARIO_ID = 2`, e `SGC_PEDIDO` com `ORIGEM = 'agenda'` e `ID_AGENDA = 1` |
| C-020 | `backend/simulator/smoke/004-agenda.mjs` | o teste insere três agendamentos vencidos, o do meio com `CRIADO_POR` de usuário inexistente (o `kbCardCriar` recusa com "Usuário informado em criadoPor não encontrado") → `processados: 2`, `erros.length: 1`, e o agendamento com erro sem `PROCESSADO_EM` e sem linha em `SGC_PEDIDO` |
| C-021 | `backend/simulator/smoke/004-agenda.mjs` | `sgcEscAgendaInserir` como `ana` com `codfornec: 1088` (DANONE, `ATIVO = 0`) → nenhuma linha nova em `SGC_AGENDA`; com `1015` → grava; `sgcEscAgendaAtualizar` do agendamento 4 (que é do 1088) muda a data normalmente |
| RN-001 | `frontend/tests/agenda.test.mjs` | `proximaOcorrencia('2026-01-31','mensal')` → `'2026-02-28'`; `('2026-03-30','mensal')` → `'2026-04-30'` |
| RN-002 | `frontend/tests/agenda.test.mjs` | `('2026-10-20','semanal')` → `'2026-10-27'`; `('2026-10-20','quinzenal')` → `'2026-11-03'` |
| RN-003 | `frontend/tests/agenda.test.mjs` | `('2026-10-20','semanal','2026-10-25')` → `null` |
| RN-004 | `backend/simulator/smoke/004-agenda.mjs` | cancelar o id 6 (já processado) com `userId = gil` → `ATIVO` continua 1; o id cancelado no C-013 continua aparecendo em `sgcAgendaListar` sem filtro |
| RN-005 | `frontend/tests/agenda.test.mjs` | quatro entradas → `'cancelado'`, `'processado'`, `'atrasado'`, `'pendente'` |
| RN-006 | `frontend/tests/agenda.test.mjs` | `periodoPadrao('2026-10-20')` → `{ inicio: '2026-09-05', fim: '2026-10-20' }`; `validarAgendamento` com início > fim → `ok: false` |
| RN-007 | `backend/simulator/smoke/004-agenda.mjs` | apagar `PROCESSADO_EM` do id 6 à mão e rodar o cron → `processados: 0` (o `NOT EXISTS` em `SGC_PEDIDO` segurou) |
| RN-008 | `frontend/tests/agenda.test.mjs` | `periodoDaOcorrencia({ inicio: '2026-08-21', fim: '2026-10-05' }, '2026-10-19')` → `{ inicio: '2026-09-04', fim: '2026-10-19' }` |
| RN-009 | coberto por C-019 | — |
| RN-010 | coberto por C-017 | — |
| RN-011 | `frontend/tests/agenda.test.mjs` + smoke | tela: `permissoesDe(persona, acesso).agendar` verdadeiro para `admin`, `analista` e `gestor` e falso para `diretoria`, `comercial` e qualquer persona com `READ_ONLY`; `.cancelarAgendamento` verdadeiro para `admin`, `gestor` e `diretoria` e falso para os demais (o teste da matriz em si é da 002; aqui se prova que a tela lê esses dois campos); servidor: C-012 e C-014 |
| RN-012 | coberto por C-016 | — |
| RN-013 | `frontend/tests/agenda.test.mjs` | `diaNoFuso(Date.parse('2026-09-16T01:00:00Z'))` → `'2026-09-15'` |
| RN-014 | coberto por C-008 e C-006 | — |
| RN-015 | `backend/simulator/smoke/004-agenda.mjs` | além do C-021: o agendamento 4 (`1088`, inativo) processado pelo manual gera pedido normalmente (C-008); e um agendamento semanal do `1088` vencido, inserido pelo próprio teste direto no banco, gera a ocorrência seguinte — o processamento não consulta a situação do fornecedor |

- **Backend:** `backend/simulator/smoke/004-agenda.mjs` executa as SFs reais
  (SQL e JAVASCRIPT) em banco descartável; cada `teste()` começa com o id do
  cenário. `npm test` em `backend/` = `sim:check` + `sim:smoke`.
- **Frontend:** `node --test` sobre `frontend/src/lib/agenda.ts`. O `DatePicker`
  não se testa aqui (é componente): vai para a verificação manual da spec.
- **Seed extra para o smoke:** os testes dos recortes manuais e da falha criam
  as próprias linhas (datas absolutas calculadas a partir de hoje), para não
  dependerem da ordem em que os testes anteriores processaram o seed: C-009
  (hoje+40, hoje+41, hoje+60), C-010 (dia 1 e último dia do mês corrente, dia 5
  do mês seguinte), C-011 (hoje−1, hoje+2, hoje+30) e C-020 (três vencidos, o do
  meio com `CRIADO_POR` inexistente).

### Regras puras — `frontend/src/lib/agenda.ts`

```ts
export type Recorrencia = 'nenhuma' | 'semanal' | 'quinzenal' | 'mensal';
export type SituacaoAgenda = 'pendente' | 'atrasado' | 'processado' | 'cancelado';
export type ModoProcessamento = 'mes' | 'intervalo' | 'dias' | 'agendamento';

/** Próxima data da recorrência, ou null quando não há ou passa do limite (RN-001..003). */
export function proximaOcorrencia(dataIso: string, recorrencia: Recorrencia, limiteIso?: string): string | null;

/** Situação derivada (RN-005). `hoje` é sempre parâmetro — a função não lê o relógio. */
export function situacao(
  linha: { ATIVO?: unknown; PROCESSADO_EM?: unknown; DATA_ANALISE?: unknown },
  hojeIso: string,
): SituacaoAgenda;

/** Período padrão de 45 dias terminando na data da análise (RN-006). */
export function periodoPadrao(dataAnaliseIso: string, dias?: number): { inicio: string; fim: string };

/** Período da ocorrência seguinte: mesma duração, fim na data nova (RN-008). */
export function periodoDaOcorrencia(atual: { inicio: string; fim: string }, novaDataIso: string): { inicio: string; fim: string };

/** Validação do formulário: obrigatórios, período e data-limite (RF-003). */
export function validarAgendamento(entrada: {
  codfornec: number; codfilial: string; dataAnalise: string;
  periodoInicio: string; periodoFim: string;
  recorrencia: Recorrencia; dataLimite: string;
}): { ok: true } | { ok: false; erro: string };

/** Recorte do processamento manual, já resolvido em datas (RF-011/RF-012). */
export function recorte(
  modo: ModoProcessamento,
  valores: { dataInicio?: string; dataFim?: string; dias?: number; idAgenda?: number },
  hojeIso: string,
): { modo: ModoProcessamento; dataInicio: string; dataFim: string; idAgenda: number } | { erro: string };

/** Dia no fuso de Brasília (UTC−3) a partir de um instante (RN-013). */
export function diaNoFuso(instante: number): string;
```

Aritmética de data em texto ISO com `Date.UTC` (nunca `new Date('...')` local):
somar dias e resolver o mês seguinte com corte no último dia. O mesmo cálculo de
`proximaOcorrencia`, `periodoDaOcorrencia` e `diaNoFuso` existe em ~15 linhas
dentro do corpo JS de `sgcAgendaProcessar` (SF roda isolada, não importa nada do
frontend) — espelho declarado, testado dos dois lados com os mesmos números
(C-004/C-005 na tela, C-006 no servidor).

## Dependências entre specs

| Direção | O quê | De/para |
|---|---|---|
| consome | `sgcFornecedorListar` com `ativo: 1` para as opções de fornecedor do diálogo (RN-015) e `sgcFornecedorCarregar(codfornec).filiais` para as filiais atendidas — fonte única, já que o listar só traz `QT_FILIAIS` (C-09); o filtro da listagem usa `ativo: 0`, porque agendamento antigo de fornecedor inativo continua na lista | **001** |
| consome | `SGC_PEDIDO` com `ORIGEM` e `ID_AGENDA`, e a escrita de capa por id: `sgcEscPedidoCapaInserir` (SQL sem `:VAR_USER`, com `{{usuarioId}}`, `{{origem}}` e `{{idAgenda}}` entre os parâmetros), confirmada na revisão do 000 (R-010) | **002** |
| consome | quadro `compras` com as dez fases (`analise` como fase de entrada) e os campos `fornecedor`, `filial`, `prioridade`; `SGC_USUARIO_PERSONA` e as personas do `seed/002-quadro.mjs` (dono único, B-07); `sgcPersonaAtual`; os campos `agendar` e `cancelarAgendamento` que a 002 acrescenta à interface `Permissoes` de `lib/permissoes.ts` — a matriz mora uma vez só, e é lá (B-02); `tituloDoPedido`/RN-014 como forma do título (B-09) | **002** |
| consome | `kbCardCriar` (8012) e `kbUsuariosListar` (8003) | lib `@benenutri/mitra-kanban` 1.3.0 |
| fornece | `sgcEscAgendaEnvio` (id 7458): o `sgcEnvioIndustriaRegistrar` da 002 chama-a por id com `{ idCard, dtEnvio }` quando o pedido tem `ID_AGENDA > 0`, para a agenda guardar planejado × real (EN-05 A / RN-012, confirmado na revisão do 000, R-012). É a única coisa que a 002 precisa fazer pela agenda | **002** |
| fornece | `components/DatePicker.tsx` — as telas de 001, 002 e 003 passam a usá-lo no lugar de `<input type="date">` | **001, 002, 003** |
| fornece | `SGC_AGENDA.ID_CARD_GERADO` como caminho do card de volta ao agendamento | **002** |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | Mensal = mesmo dia do mês seguinte; dia inexistente cai no último dia do mês, e a contagem seguinte parte do dia gravado (31/01 → 28/02 → 28/03) | Transbordar para 03/03 (comportamento natural de `Date`); guardar o dia-âncora original numa coluna | AG-05 A pede "mesmo dia do mês seguinte"; transbordar joga a análise para o mês errado. A âncora resolveria a deriva, mas custa coluna e código para um caso raro — a deriva é previsível e está escrita na RN-001 |
| D-002 | Título do card = `FILIAL · FORNECEDOR`, sem o sufixo " - Agenda" do legado | Manter o sufixo | C-02 A fixou o título automático; a origem já fica em `KB_MOVIMENTO.ORIGEM = 'sistema'` e `SGC_PEDIDO.ORIGEM = 'agenda'` — o sufixo era o jeito antigo de enxergar isso no título |
| D-003 | Participante é registro: lista de pessoas do sistema no agendamento, sem convite por e-mail e sem virar responsável do card | Enviar convite; marcar participantes como responsáveis do pedido | AG-02 B pede a reunião com participantes, não um sistema de convites; nenhuma regra EM-* fala em convite de agenda, e o legado também só registrava. "Reunião interna sem fornecedor" está fora do SGC 2, então o agendamento **é** a reunião |
| D-004 | O card criado pelo cron nasce com prioridade `normal` fixa | Coluna `PRIORIDADE` na agenda | nenhuma regra manda agendar prioridade; quem precisar muda no card (C-07 B). Coluna para valor que nunca muda é o que o princípio VII proíbe |
| D-005 | O cron chama `kbCardCriar` + a escrita de capa da 002, não o `sgcPedidoCriar` da 002 | Reusar `sgcPedidoCriar` | `sgcPedidoCriar` roda com sessão; sem sessão ele teria de repassar `criadoPor`/`origem` por duas camadas, pelo mesmo custo em execuções |
| D-006 | Idempotência em duas travas: `PROCESSADO_EM IS NULL` **e** `NOT EXISTS (SELECT 1 FROM SGC_PEDIDO WHERE ID_AGENDA = A.ID)` | Só a marcação, como no legado | se o card nascer e a marcação falhar, só a marcação deixaria o agendamento gerando um segundo pedido na rodada seguinte. A segunda trava é uma consulta, que não consome execução de SF |
| D-007 | O processamento manual opera sobre a data dentro do recorte, inclusive futura; o cron só sobre o vencido | Manual também só com vencidos | porte fiel do `update-agenda-processamento-filtrado.mjs`: "processar o mês vigente" inclui o que ainda vai vencer, que é o uso real (antecipar a análise) |
| D-008 | O recorte "dias" é **os próximos N dias a partir de hoje** (hoje … hoje+N−1) | Lista de dias específicos do mês, como o texto de AG-06 sugere | é o que o legado faz (`dias` numérico); lista de dias exigiria outro controle de tela sem pedido de ninguém |
| D-009 | A ocorrência seguinte recalcula o período mantendo a duração | Copiar o período do anterior, como o legado | copiar faria a análise recorrente olhar para sempre a mesma janela de vendas antiga — o defeito só não aparecia porque quase todo agendamento era refeito à mão |
| D-010 | `DatePicker` próprio, sem dependência | `<input type="date">` nativo (a ausência do `design.md` §1.4) | UI-03 decisão **B** do `regras.md`, que é posterior e específica. Ver **Complexity Tracking** |
| D-011 | Participantes escolhidos por `kbUsuariosListar` da lib | SF nova `sgcUsuariosListar` | a lib já publica a listagem de `INT_USER` com busca e paginação; SF nova seria a mesma consulta com outro nome |
| D-012 | Criar, editar e processar: `admin`, `analista` e `gestor`. Cancelar: `admin`, `gestor`, `diretoria` (P-10). `comercial` não opera a agenda (P-03) e `READ_ONLY` não opera nada | Manter só `admin` e `analista` na criação, como o `canEditAgenda` do p-45547 | R-005 da revisão do 000: P-04 foi ajustada para incluir o gestor em criar e editar pedido, e a agenda é o caminho automático do mesmo pedido — simetria. A lista vive nas guardas SQL desta spec e nos campos `agendar`/`cancelarAgendamento` da matriz da 002, nunca numa matriz própria da agenda |
| D-013 | Teto de 30 agendamentos por rodada, com o resto na rodada seguinte (R-06) | Processar tudo o que estiver vencido; teto de 50 | o teto de 300 execuções/min é do projeto inteiro e divide com quadro, itens e telas: 30 × 5 = 150 no pior caso deixa metade da janela livre, e a rodada seguinte vem em 30 minutos |
| D-014 | A situação é derivada em dois lugares (SQL do filtro e `lib/agenda.ts`), com os mesmos números testados | Gravar a situação numa coluna | coluna de estado derivado desincroniza silenciosamente quando o dia vira; o espelho tela/servidor é o padrão já adotado em `podeMover` |
| D-016 | Dia do servidor no fuso fixo de Brasília (`hojeNoFuso`), dia da tela no fuso do navegador (R-10) | Mandar o `hoje` da tela para o cron, ou forçar Brasília também na tela | o cron roda sem ninguém olhando, e o negócio é brasileiro: o dia dele não pode depender de quem abriu o navegador por último. Já a tela mostra data para uma pessoa, e uma tela que diz "atrasado" no dia errado do usuário é pior do que a diferença de uma rodada |
| D-015 | Fornecedor ativo é conferido no `sgcEscAgendaInserir` (e o seletor só oferece ativos); `sgcEscAgendaAtualizar` e o processamento **não** conferem | Conferir também no update e no cron | R-002: "existentes seguem". Conferir no update travaria editar a data de um agendamento legítimo cujo fornecedor foi inativado depois; conferir no cron pararia a agenda em silêncio, que é o oposto de "segue". A trava fica onde o agendamento nasce |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| A regra de recorrência existe em dois idiomas (TS da tela, JS da SF) e pode divergir | agendamento recorrente cai em data diferente da que a tela previu | os dois lados testados com os mesmos números (C-004/C-005 na tela, C-006 no smoke); o cálculo é uma função pequena e isolada em ambos |
| Nome da escrita de capa da 002 (`sgcEscPedidoCapaInserir`) ainda não está fechado | o cron não compila no sandbox se o nome mudar | o nome está em **Dependências entre specs**; o `add-007` resolve por nome no `listServerFunctionsMitra` e falha alto ("Escrita não publicada") em vez de gravar errado |
| Falha no meio do processamento de um agendamento (card criado, capa não) | pedido órfão sem capa | a ordem é card → capa → marcação: sem marcação o agendamento volta na rodada seguinte, e o `NOT EXISTS` em `SGC_PEDIDO` (que só existe se a capa gravou) faz a retentativa completar em vez de duplicar |
| `DatePicker` novo é a primeira peça de acessibilidade escrita à mão do projeto | teclado ou leitor de tela pior que o nativo | contrato de teclado e ARIA fechado acima e na verificação manual da spec; sem intervalo, sem hora e sem locale, o componente cabe em pouco mais de cem linhas |

## Complexity Tracking

Só preencher se houver violação de princípio. Vazio é o estado saudável.

| Princípio violado | Por que é necessário | Por que a alternativa simples não serve |
|---|---|---|
| VII (Simplicidade) / `design.md` §1.4 e §9.2 — "sem date picker; data é `<input type="date">` nativo" | UI-03 do `regras.md` foi decidida com o usuário em 2026-09-15 na opção **B**: seletor de data próprio sobre os tokens. A agenda é a primeira tela com data, então o componente nasce aqui | O nativo muda de altura, largura e formato conforme o sistema operacional — o mesmo motivo que já tirou o `<select>` nativo dos painéis (§9.3) —, e numa linha de filtros com três datas o desalinhamento é visível. A emenda do `design.md` foi **aplicada em 2026-09-15 (§1.4 e §9.2)**, então o conflito de texto não existe mais: fica registrado aqui só como dependência da feature |
