# Plan: Quadro de compras

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` aprovada, zero `[NEEDS CLARIFICATION]` |
| Backend escrito local, executado no sandbox | sim | `add-005-quadro-compras.mjs` (novo, desta spec) e duas linhas em arquivos do integrador: as quatro tabelas no `setup-backend.mjs` e `ganchos` no `add-001-kanban.mjs`. Nada roda `mitra-sdk` da máquina local |
| Migrations append-only | sim | nenhum arquivo de `backend/migrations/` é criado, editado ou adicionado ao commit; o sandbox materializa |
| Leitura e escrita por Server Function | sim | 11 leituras/JS (72xx) e 11 escritas SQL (7250–7260): 7 guardadas por `:VAR_USER` (chamadas da tela) e 4 por `{{usuarioId}}`, chamadas **só por id** de dentro de um JS ou do cron (exceção registrada no `000`: chamada aninhada não propaga a sessão). Zero CRUD REST em tela de usuário final; o quadro fala com o motor pelo transporte `linhas`/`acao` |
| Simulador cobre a feature | sim | `simulator/seed/002-quadro.mjs` (personas, fases, campos, automações, ganchos e 6 pedidos), `CHECK_INPUT` estendido, `add-005` no `PUBLISH_ORDER` |
| Testes automatizados obrigatórios | sim | cada linha da seção **Testes** da spec vira `teste()` em `backend/simulator/smoke/002-quadro.mjs` ou `test()` em `frontend/tests/{permissoes,transicoes,pedido}.test.mjs` |
| Design tokens, sem cor literal | sim | telas só com o vocabulário de `components/page.tsx` e os primitivos de `components/ui/`; cor de fase e de opção sai da rampa de dados do motor (`data-1…8`), nunca hex |
| Simplicidade | sim | nenhuma abstração com uma implementação só; a matriz de permissões existe duas vezes porque as duas camadas são exigência da regra (P-12 e o gancho da lib), e o teste prova que concordam; dependência nova: nenhuma |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk` · `@benenutri/mitra-kanban` 1.3.0
- **Backend:** tabelas `SGC_*` e Server Functions `sgc*` na plataforma, provisionadas por `backend/add-005-quadro-compras.mjs` com `mitra-sdk`; o motor (tabelas `KB_*` e 27 SFs `kb*`) vem da lib pelo `add-001-kanban.mjs`
- **Reuso identificado:** o card aberto, o chat, as tarefas, os anexos, as alterações, as automações com `enviar_email`, `kbNotaRegistrar`, `kbCardCriar`/`kbCardMover`/`kbCardExcluir` e o `BoardAdmin` são da lib — nada disso se reimplementa. Os pontos de extensão (`abasExtras`, `acoesExtras`, `podeMover`, `antesDeMover`, `podeExcluir`, `novoCard`, `atualizarACadaMs`) e as regras ligadas (`KB_META` → `gancho:podeMover` / `gancho:podeExcluir`) são o contrato da spec 013 da lib
- **Dependência nova:** nenhuma

## Modelo de dados

As quatro tabelas desta spec entram no `setup-backend.mjs` (arquivo do
integrador) junto com as das specs 001, 003 e 004, antes do fan-out. Datas em
`VARCHAR(10)`/`VARCHAR(19)`, colunas em UPPERCASE, sem `FOREIGN KEY`.

| Entidade (spec) | Tabela | Campos-chave | Observação |
|---|---|---|---|
| Etapa | `SGC_FASE` | `ID`, `BOARD_ID`, `CHAVE`, `FASE_ID`, `ORDEM` | tradutor chave estável ↔ `KB_FASE.ID`; `UNIQUE (BOARD_ID, CHAVE)` e índice em `FASE_ID` (o gancho traduz nos dois sentidos a cada movimento) |
| Persona | `SGC_USUARIO_PERSONA` | `ID`, `USUARIO_ID`, `PERSONA`, `ATUALIZADO_POR`, `ATUALIZADO_EM` | 1:1 com `INT_USER`; `UNIQUE (USUARIO_ID)`; `PERSONA` ∈ `admin`, `analista`, `gestor`, `diretoria`, `comercial` (P-01) |
| Pedido de compra | `SGC_PEDIDO` | ver abaixo | 1:1 com `KB_CARD`, `UNIQUE (ID_CARD)` |
| Comunicação | `SGC_COMUNICACAO` | `ID`, `ID_CARD`, `TIPO`, `PARA`, `CC`, `ASSUNTO`, `CORPO`, `ENVIADO_POR`, `ENVIADO_EM` | `TIPO` ∈ `email`, `plataforma`; índice em `ID_CARD` |

`SGC_PEDIDO`, coluna a coluna:

```sql
CREATE TABLE IF NOT EXISTS SGC_PEDIDO (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_CARD INT NOT NULL,
  CODFORNEC INT,
  FORNECEDOR VARCHAR(200),
  CODFILIAL VARCHAR(10),
  FILIAL VARCHAR(200),
  PERIODO_INICIO VARCHAR(10),
  PERIODO_FIM VARCHAR(10),
  VL_TOTAL DECIMAL(15,2) DEFAULT 0,
  PRAZO_PADRAO VARCHAR(120),
  PRAZO_ACORDADO VARCHAR(120),
  PRAZO_JUSTIFICATIVA TEXT,
  TEC_POR INT,
  TEC_EM VARCHAR(19),
  TEC_MOTIVO TEXT,
  TEC_PRODUTOS_REPROVADOS TEXT,
  DIR_POR INT,
  DIR_EM VARCHAR(19),
  DIR_MOTIVO TEXT,
  DT_ENVIO VARCHAR(10),
  CANAL VARCHAR(20),
  EMAIL_ENVIO VARCHAR(255),
  NUMPED_WINTHOR VARCHAR(30),
  ENVIO_OBS TEXT,
  ENVIO_POR INT,
  ENVIO_EM VARCHAR(19),
  CANC_MOTIVO TEXT,
  CANC_POR INT,
  CANC_EM VARCHAR(19),
  ORIGEM VARCHAR(20) NOT NULL DEFAULT 'manual',
  ID_AGENDA INT DEFAULT 0,
  CRIADO_POR INT,
  CRIADO_EM VARCHAR(19),
  ATUALIZADO_EM VARCHAR(19),
  UNIQUE KEY UK_SGC_PEDIDO_CARD (ID_CARD)
)
```

- `VL_TOTAL`, `PRAZO_PADRAO`, `PRAZO_ACORDADO` e `PRAZO_JUSTIFICATIVA` são **gravados pela spec 003** (AN-12, PZ-01): a 002 cria as colunas, nunca escreve nelas.
- `TEC_PRODUTOS_REPROVADOS` guarda os códigos separados por vírgula (`"1024,2088"`), no mesmo formato que a lib usa para `responsaveisIds`. A lista de produtos para marcar vem da 003.
- `ENVIO_OBS`, `ENVIO_POR` e `ENVIO_EM` completam o registro do envio de EN-03.
- **Não existe coluna `PRIORIDADE`** (R-009): prioridade vive só no campo do quadro, que é
  onde a pessoa a edita; a janela "Novo pedido" a informa nos `valores` de `api.cardCriar`.

Campos do quadro `compras` (`KB_CAMPO`, criados pelo `add-005`, chave estável):

| Chave | Tipo | Onde aparece | Quem escreve |
|---|---|---|---|
| `fornecedor` | `texto` | capa de todas as fases (`NO_CARD`) | 002, na criação |
| `filial` | `texto` | capa de todas as fases | 002, na criação |
| `valor_total` | `moeda` | capa de todas as fases | 003, ao gravar itens |
| `prioridade` | `selecao` (`normal`, `alta`, `urgente`) | capa de todas as fases | a pessoa, no card aberto — **dono único** do valor (R-009); nasce `normal` na criação |
| `alertas_pendentes` | `numero` | capa só da fase `analise` (`CAPA_JSON`) | 003, ao gerar alertas |
| `motivo_cancelamento` | `texto_longo` | capa só da fase `cancelado` (`CAPA_JSON`) | 002, ao cancelar |

Nenhum campo é obrigatório e nenhum tem `FASE_ID` (RN-017; F-05 A): o motor
cobra obrigatório em qualquer direção e barraria cancelar e voltar.

## Contratos de backend

Faixa desta spec: **72xx** — `7201…` leituras e JAVASCRIPT, `7250…` escritas.
Todo nome entra em `SERVER_FUNCTION_NAMES` e o id local em `SERVER_FUNCTIONS`
(`frontend/src/lib/server-functions.ts`, bloco 002) até o
`sync-server-function-map.mjs` trazer os reais.

| Nome (`add-005`) | Id local | Tipo | Entrada (`{{param}}`) | Saída | Atende |
|---|---|---|---|---|---|
| `sgcPersonaAtual` | 7201 | SQL | — (`:VAR_USER`) | 1 linha: `USUARIO_ID, NOME, EMAIL, ACCESS_LEVEL, PERSONA` | RF-012 |
| `sgcPersonasListar` | 7202 | SQL | `busca` (`''`), `limite`, `offset` | `USUARIO_ID, NOME, EMAIL, ACCESS_LEVEL, PERSONA` | RF-030 |
| `sgcPersonasListarTotal` | 7203 | SQL | `busca` (`''`) | `TOTAL` | RF-030, RNF-003 |
| `sgcFasesListar` | 7204 | SQL | `boardId` (`0` = todos) | `CHAVE, FASE_ID, NOME, ORDEM, TIPO, COR` | RF-005 |
| `sgcPedidoCarregar` | 7205 | JAVASCRIPT | `cardId` | `{ ok, pedido, itens, alertas }` numa execução — ver as colunas fechadas com a 003 abaixo | RF-006, RNF-001 |
| `sgcPodeMover` | 7206 | SQL (gancho) | `usuarioId`, `cardId`, `boardId`, `faseId` | 1 linha: `PODE` (1/0), `MOTIVO` | RF-009, RF-011, RNF-004 |
| `sgcPodeExcluir` | 7207 | SQL (gancho) | `usuarioId`, `cardId`, `boardId`, `faseId` (`0`) | 1 linha: `PODE`, `MOTIVO` | RF-027 |
| `sgcComunicacoesListar` | 7208 | SQL | `cardId`, `limite`, `offset` | `ID, TIPO, PARA, CC, ASSUNTO, ENVIADO_POR, ENVIADO_NOME, ENVIADO_EM` | RF-023 |
| `sgcNotificacoesListar` | 7209 | SQL | `limite`, `offset` (`:VAR_USER`) | `TIPO, CARD_ID, TITULO, QUEM, TEXTO, QUANDO` | RF-029 |
| `sgcNotificacoesListarTotal` | 7210 | SQL | — (`:VAR_USER`) | `TOTAL` | RF-029, RNF-003 |
| `sgcEnvioIndustriaRegistrar` | 7211 | JAVASCRIPT | `cardId`, `canal`, `para`, `assunto`, `corpo`, `dtEnvio`, `numped`, `obs` | `{ ok, error?, comunicacaoId, destinatarios }` | RF-020, RF-021, RF-023, RF-024 |
| `sgcEscPedidoCriar` | 7250 | SQL | `cardId`, `codfornec`, `fornecedor`, `codfilial`, `filial`, `periodoInicio`, `periodoFim`, `agora` | — | RF-001 (a prioridade não passa por aqui: R-009) |
| `sgcEscPedidoTecnicaAprovar` | 7251 | SQL | `cardId`, `agora` | — | RF-013 |
| `sgcEscPedidoTecnicaReprovar` | 7252 | SQL | `cardId`, `motivo`, `produtos`, `agora` | — | RF-014 |
| `sgcEscPedidoDiretoriaAprovar` | 7253 | SQL | `cardId`, `agora` | — | RF-016 |
| `sgcEscPedidoDiretoriaReprovar` | 7254 | SQL | `cardId`, `motivo`, `agora` | — | RF-017 |
| `sgcEscPedidoCancelar` | 7255 | SQL | `cardId`, `motivo`, `agora` | — | RF-019 |
| `sgcEscPedidoReprovacoesLimpar` | 7256 | SQL **por id** (`{{usuarioId}}`, sem `:VAR_USER`) | `usuarioId`, `idCard` | — | RF-015 (R-011) |
| `sgcEscPedidoEnvio` | 7257 | SQL **por id** (`{{usuarioId}}`) | `cardId`, `canal`, `email`, `dtEnvio` (`AAAA-MM-DD`), `numped`, `obs`, `enviadoPor`, `agora` | — | RF-020 |
| `sgcEscComunicacaoInserir` | 7258 | SQL **por id** (`{{usuarioId}}`) | `cardId`, `tipo`, `para`, `cc`, `assunto`, `corpo`, `enviadoPor`, `enviadoEm` | — | RF-023 |
| `sgcEscPersonaSalvar` | 7259 | SQL | `usuarioAlvo`, `persona`, `agora` | — | RF-030 |
| `sgcEscPedidoCapaInserir` | 7260 | SQL **por id** (`{{usuarioId}}`, sem `:VAR_USER`) | `usuarioId`, `cardId`, `codfornec`, `fornecedor`, `codfilial`, `filial`, `periodoInicio`, `periodoFim`, `origem`, `idAgenda`, `agora` | — | RF-001 (R-010) |

Regras da casa: filtro desligado é `''` no texto e `0` no numérico; toda
listagem tem `LIMIT/OFFSET`; uma instrução por escrita; escrita chamada da
**tela** carrega a guarda de persona no próprio `WHERE`, com `:VAR_USER`.

**As quatro escritas "por id"** (`sgcEscPedidoReprovacoesLimpar`,
`sgcEscPedidoEnvio`, `sgcEscComunicacaoInserir`, `sgcEscPedidoCapaInserir`) são
a exceção registrada no `000`: nascem para ser chamadas de dentro de um
JAVASCRIPT ou do cron, onde `:VAR_USER` não chega (chamada aninhada não
propaga a sessão). Recebem `{{usuarioId}}` cru, e quem confere a persona é o JS
que as chama, **antes** de escrever:

| Escrita | Quem chama | Quem confere a persona |
|---|---|---|
| `sgcEscPedidoCapaInserir` | `sgcAgendaProcessar` (004, cron sem sessão) | ninguém: o cron roda com o token do projeto e grava em nome de quem agendou (`criadoPor`) |
| `sgcEscPedidoReprovacoesLimpar` | `sgcAnaliseSair` (003), no `antesDeMover` de `analise → tecnica` | o próprio `sgcAnaliseSair`, por `runQueryMitra` com `:VAR_USER` |
| `sgcEscPedidoEnvio`, `sgcEscComunicacaoInserir` | `sgcEnvioIndustriaRegistrar` (002) | o próprio JS, no passo 1 |

`sgcEscPedidoCapaInserir` grava as mesmas colunas de `sgcEscPedidoCriar`, com
`ORIGEM = '{{origem}}'` (`agenda`) e `ID_AGENDA = {{idAgenda}}`, e é
idempotente pelo `UNIQUE (ID_CARD)`.

### A guarda de persona, escrita uma vez

Todas as escritas de usuário repetem este fragmento, trocando só a lista de
personas. É ele que faz a regra valer também para quem chama por fora da tela
(P-12):

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

E a guarda de fase, para as decisões que só existem numa etapa:

```sql
AND EXISTS (
  SELECT 1 FROM KB_CARD C
  JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
  WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL AND F.CHAVE = '<chave>'
)
```

Escrita recusada não devolve erro: o `UPDATE` casa 0 linhas. **Isso não abre
buraco**, porque a escrita e o gancho compartilham a mesma matriz — sem o
motivo gravado, o `sgcPodeMover` recusa o movimento que viria em seguida (o
smoke prova o par). A tela não lê "deu certo" da resposta: ela recarrega o
pedido, que já faz parte do `ctx.mover()` da lib.

### Exemplos das escritas

```sql
-- sgcEscPedidoTecnicaAprovar (AT-02): grava quem/quando e limpa a reprovação anterior.
UPDATE SGC_PEDIDO SET
  TEC_POR = :VAR_USER, TEC_EM = '{{agora}}',
  TEC_MOTIVO = '', TEC_PRODUTOS_REPROVADOS = '',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}}
  AND EXISTS (<guarda de persona: 'admin','gestor'>)
  AND EXISTS (<guarda de fase: 'tecnica'>)

-- sgcEscPedidoTecnicaReprovar (AT-03): motivo obrigatório no próprio WHERE.
UPDATE SGC_PEDIDO SET
  TEC_MOTIVO = '{{motivo}}', TEC_PRODUTOS_REPROVADOS = '{{produtos}}',
  TEC_POR = NULL, TEC_EM = '',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND TRIM('{{motivo}}') <> ''
  AND EXISTS (<guarda de persona: 'admin','gestor'>)
  AND EXISTS (<guarda de fase: 'tecnica'>)

-- sgcEscPedidoCancelar (CA-02): de qualquer fase ativa, motivo obrigatório.
UPDATE SGC_PEDIDO SET
  CANC_MOTIVO = '{{motivo}}', CANC_POR = :VAR_USER, CANC_EM = '{{agora}}',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND TRIM('{{motivo}}') <> ''
  AND EXISTS (<guarda de persona: 'admin','analista','gestor','diretoria'>)
  AND EXISTS (SELECT 1 FROM KB_CARD C JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
               WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL AND F.CHAVE NOT IN ('concluido','cancelado')
                 -- R-03/D-011: cancelar é movimento; a diretoria só move na fase dela
                 AND (F.CHAVE = 'diretoria' OR NOT EXISTS (SELECT 1 FROM SGC_USUARIO_PERSONA UD
                                                            WHERE UD.USUARIO_ID = :VAR_USER AND UD.PERSONA = 'diretoria')))

-- sgcEscPersonaSalvar (P-13): uma instrução, upsert.
INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{usuarioAlvo}}, '{{persona}}', :VAR_USER, '{{agora}}'
WHERE '{{persona}}' IN ('admin','analista','gestor','diretoria','comercial')
  AND EXISTS (<guarda de persona: 'admin','diretoria'>)
ON DUPLICATE KEY UPDATE PERSONA = VALUES(PERSONA), ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
```

### O contrato de `sgcPedidoCarregar` com a 003

Uma execução, três consultas internas, três listas no retorno (fechado com a
spec 003; nenhuma coluna a mais para a tela não pagar o que não usa):

- `pedido`: todas as colunas de `SGC_PEDIDO` mais `TEC_NOME`, `DIR_NOME`,
  `CANC_NOME` e `ENVIO_NOME` (lidos de `INT_USER`, para a tela não consultar
  usuário de novo); `null` quando o card ainda não tem capa.
- `itens` (003 preenche; a 002 cria a consulta): `ID`, `CODPROD`, `DESCRICAO`,
  `EMBALAGEM`, `UNIDADE`, `CODEPTO`, `CODSEC`, `UN_POR_CAIXA`,
  `QT_VENDA_TOTAL`, `QT_VENDA_LICITACAO`, `QT_ESTOQUE`, `QT_TRANSITO`,
  `QT_SUGERIDA`, `QT_PEDIDA`, `PRECO_CUSTO`, `TIPO_PRECO`, `CURVA_ABC`,
  `COBERTURA_DIAS`, `COBERTURA_LIMITE`, `COBERTURA_JUSTIFICATIVA`,
  `OBSERVACAO`, `STATUS` — só os vivos (`STATUS <> 'removido'`).
- `alertas`: `ID`, `CODPROD`, `TIPO`, `MENSAGEM`, `LIDO`, `LIDO_POR`,
  `LIDO_EM`, `JUSTIFICATIVA`. O alerta liga ao item por `(ID_CARD, CODPROD)` —
  **não** existe `ID_ITEM` (a 003 trocou a chave: o upsert em lote não devolve
  ids e o item pode sair e voltar).

### As regras ligadas (ganchos)

Contrato da lib (spec 013): entrada `{{usuarioId}}`, `{{cardId}}`,
`{{boardId}}`, `{{faseId}}` (0 no excluir); saída **uma linha** com `PODE`
(1/0) e `MOTIVO` (vazio quando pode). Sem linha ou com erro, o motor recusa
com "Regra do sistema indisponível." — fecha, em vez de abrir. Ligação por
`instalar({ ganchos: { podeMover: 'sgcPodeMover', podeExcluir: 'sgcPodeExcluir' } })`
no `add-001-kanban.mjs`, que grava `KB_META.gancho:podeMover` e
`gancho:podeExcluir` com os ids reais.

`sgcPodeMover` — uma subconsulta traduz tudo para chaves e o `CASE` decide na
ordem em que a regra recusa (esqueleto real; as listas ficam numa linha só no
arquivo):

```sql
SELECT
  CASE
    WHEN T.PERSONA = 'comercial'                                                    THEN 0
    WHEN T.ACESSO = 'READ_ONLY'                                                     THEN 0
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}                   THEN 0
    WHEN T.PERSONA = 'diretoria' AND T.ORIGEM <> 'diretoria'                         THEN 0
    WHEN T.PAR NOT IN ('analise>tecnica','tecnica>diretoria','tecnica>analise',
                       'diretoria>envio','diretoria>tecnica','diretoria>analise',
                       'envio>enviado','envio>diretoria','enviado>transito',
                       'transito>faturamento','faturamento>bo','faturamento>concluido',
                       'bo>faturamento','bo>concluido',
                       'analise>cancelado','tecnica>cancelado','diretoria>cancelado',
                       'envio>cancelado','enviado>cancelado','transito>cancelado',
                       'faturamento>cancelado','bo>cancelado')                       THEN 0
    WHEN T.DESTINO = 'cancelado'      AND T.CANC_MOTIVO = ''                         THEN 0
    WHEN T.PAR = 'tecnica>analise'    AND T.TEC_MOTIVO = ''                          THEN 0
    WHEN T.PAR = 'diretoria>analise'  AND T.DIR_MOTIVO = ''                          THEN 0
    WHEN T.PAR = 'envio>enviado'      AND (T.DT_ENVIO = '' OR T.NUMPED = '')          THEN 0
    WHEN T.PAR = 'analise>tecnica'    AND T.PENDENCIAS > 0                           THEN 0
    ELSE 1
  END AS PODE,
  -- C-06: o contrato da lib exige MOTIVO vazio quando PODE = 1, e a regra de
  -- tela compara com `null`. Por isso o CASE inteiro vive dentro da guarda
  -- `<expressão do PODE> = 1 THEN ''` — sem ela, um destino liberado sairia
  -- com a frase do último ramo (ex.: `analise>tecnica` sem pendência).
  CASE WHEN (<a mesma expressão do PODE>) = 1 THEN '' ELSE CASE
    WHEN T.PERSONA = 'comercial'
      THEN 'Seu perfil não tem acesso ao quadro de compras.'
    WHEN T.ACESSO = 'READ_ONLY'
      THEN 'Seu acesso é somente leitura.'
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}
      THEN 'Seu acesso permite operar apenas os pedidos que você criou.'
    WHEN T.PERSONA = 'diretoria' AND T.ORIGEM <> 'diretoria'
      THEN 'Você só movimenta pedidos na fase Aprovação da Diretoria.'
    WHEN T.PAR IN ('analise>diretoria')
      THEN 'O pedido precisa passar pela Aprovação Técnica antes de ir para a Aprovação da Diretoria.'
    WHEN T.PAR NOT IN (<a mesma lista de 22 pares>)
      THEN 'Esta transição não existe no fluxo de compras.'
    WHEN T.DESTINO = 'cancelado' AND T.CANC_MOTIVO = ''
      THEN 'Use a ação "Cancelar compra" para informar o motivo.'
    WHEN T.PAR IN ('tecnica>analise','diretoria>analise')
      THEN 'Para devolver o pedido para análise, use a ação Reprovar e informe o motivo.'
    WHEN T.PAR = 'envio>enviado'
      THEN 'Registre o envio do pedido (plataforma ou e-mail) antes de mover para Enviado para Indústria.'
    WHEN T.PAR = 'analise>tecnica'
      THEN T.PENDENCIAS_MOTIVO
    ELSE ''
  END END AS MOTIVO
FROM (
  SELECT
    COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                           WHEN 'ADMIN' THEN 'admin'
                           WHEN 'RESTRICTED' THEN 'comercial'
                           ELSE 'analista' END)                    AS PERSONA,
    COALESCE(IU.ACCESS_LEVEL, 'MEMBER')                            AS ACESSO,
    COALESCE(C.CRIADO_POR, 0)                                      AS CRIADO_POR,
    COALESCE(FO.CHAVE, '')                                         AS ORIGEM,
    COALESCE(FD.CHAVE, '')                                         AS DESTINO,
    CONCAT(COALESCE(FO.CHAVE, ''), '>', COALESCE(FD.CHAVE, ''))    AS PAR,
    COALESCE(P.CANC_MOTIVO, '')                                    AS CANC_MOTIVO,
    COALESCE(P.TEC_MOTIVO, '')                                     AS TEC_MOTIVO,
    COALESCE(P.DIR_MOTIVO, '')                                     AS DIR_MOTIVO,
    COALESCE(P.DT_ENVIO, '')                                       AS DT_ENVIO,
    COALESCE(P.NUMPED_WINTHOR, '')                                 AS NUMPED,
    /* ── saída da Análise — bloco reservado à spec 003 ──────────────────────
       Duas colunas, uma subconsulta cada. Hoje: alerta não lido e uma frase
       genérica. A 003 substitui ESTE bloco (e só ele) pelo corpo de
       `sgcAnaliseSaidaVerificar` com `{{cardId}} = C.ID`: `PODE = 0` vira
       `PENDENCIAS = 1` e a coluna `MOTIVO` de lá vira `PENDENCIAS_MOTIVO`
       aqui — alertas lidos, justificativa de item alertado, cobertura acima do
       limite, prazo divergente e pelo menos um item com quantidade (AL-04,
       AL-05, AL-06, PZ-03, R-008). A tela chama a mesma SF pelo
       `antesDeMover` (dentro do `sgcAnaliseSair`), então a frase é a mesma nos
       dois lugares. */
    (SELECT COUNT(*) FROM SGC_ALERTA A WHERE A.ID_CARD = C.ID AND A.LIDO = FALSE) AS PENDENCIAS,
    'Há pendências na Análise: leia os alertas e justifique os itens antes de enviar para a Aprovação Técnica.' AS PENDENCIAS_MOTIVO
  FROM KB_CARD C
  LEFT JOIN INT_USER IU              ON IU.ID = {{usuarioId}}
  LEFT JOIN SGC_USUARIO_PERSONA UP   ON UP.USUARIO_ID = {{usuarioId}}
  LEFT JOIN SGC_FASE FO              ON FO.BOARD_ID = C.BOARD_ID AND FO.FASE_ID = C.FASE_ID
  LEFT JOIN SGC_FASE FD              ON FD.BOARD_ID = {{boardId}} AND FD.FASE_ID = {{faseId}}
  LEFT JOIN SGC_PEDIDO P             ON P.ID_CARD = C.ID
  WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL
) T
```

`sgcPodeExcluir` usa a mesma subconsulta (sem `FD`, sem `PENDENCIAS`) e um
`CASE` de quatro linhas, com o mesmo envelope de `MOTIVO` (C-06) e com o
`RESTRICTED` valendo como vale no mover (P-08 B, R-02). P-09/P-11: o gancho
**substitui** a regra "criador ou administrador" do motor, então gestor e
diretoria excluem qualquer pedido e analista não exclui nem o próprio:

```sql
CASE
  WHEN T.PERSONA = 'comercial'                                      THEN 0
  WHEN T.ACESSO = 'READ_ONLY'                                       THEN 0
  WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}     THEN 0
  WHEN T.PERSONA IN ('admin','gestor','diretoria')                  THEN 1
  ELSE 0
END AS PODE,
CASE WHEN (<a mesma expressão do PODE>) = 1 THEN '' ELSE CASE
  WHEN T.PERSONA = 'comercial' THEN 'Seu perfil não tem acesso ao quadro de compras.'
  WHEN T.ACESSO = 'READ_ONLY' THEN 'Seu acesso é somente leitura.'
  WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}}
    THEN 'Seu acesso permite operar apenas os pedidos que você criou.'
  WHEN T.PERSONA NOT IN ('admin','gestor','diretoria')
    THEN 'Excluir pedido é da gerência, da diretoria ou do administrador. Para encerrar um pedido, use "Cancelar compra".'
  ELSE ''
END END AS MOTIVO
```

`{{faseId}}` chega `0` no excluir e não é citado pela SQL.

### O JAVASCRIPT do envio

`sgcEnvioIndustriaRegistrar` (EN-01 a EN-06) é a única ação com orquestração:

1. `runQueryMitra` com `:VAR_USER` resolve **numa consulta** o usuário, a
   persona efetiva, a chave da fase do card, o `ID_AGENDA` e o `BOARD_ID`.
   Persona fora de `admin`, `analista`, `gestor`, fase diferente de `envio`,
   `dtEnvio` vazio ou `numped` vazio → `{ ok: false, error }`, sem enviar nada.
2. `canal = 'email'`: `sendEmailMitra({ to: [<contato>, 'compras@benenutri.com'], subject, body })`.
   A cópia é acrescentada aqui e removida do `to` se já estiver lá (EM-02).
   `canal = 'plataforma'`: nenhum e-mail.
3. `sgcEscComunicacaoInserir` (por id) grava `TIPO`, `PARA`, `CC`, `ASSUNTO`,
   `CORPO`, `ENVIADO_POR`, `ENVIADO_EM` (EN-06 B).
4. `sgcEscPedidoEnvio` (por id) grava `DT_ENVIO`, `CANAL`, `EMAIL_ENVIO`,
   `NUMPED_WINTHOR`, `ENVIO_OBS`, `ENVIO_POR`, `ENVIO_EM`.
5. `ID_AGENDA > 0` → `sgcEscAgendaEnvio` (spec 004, id 7458, por id, input
   `{ idCard, dtEnvio }` — `dtEnvio` em `AAAA-MM-DD`) leva a data real ao agendamento, que guarda a
   planejada original (EN-05 A, R-012); ausente o id no mapa, o passo é
   ignorado e o resultado traz `agendaSincronizada: false` — a 002 não depende
   da 004 para fechar.
6. `kbNotaRegistrar` (SF da lib) grava no histórico "Pedido enviado por e-mail
   para `<contato>`" ou "Pedido enviado pela plataforma do fornecedor".

O que o JS **não** faz: gravar a situação dos itens. `sgcEscItemStatusFase`
(003) é guardada por `:VAR_USER` e por isso é a tela que a chama, logo depois
de o envio voltar `ok: true` (C-03).

O corpo e o assunto do e-mail do pedido são montados **na tela** (é lá que
estão os itens, spec 003) e chegam prontos em `assunto`/`corpo`: o JS só
envia, grava e registra. Assim o texto do pedido não vira uma segunda
implementação da lista de itens no servidor.

## Automações de e-mail (`KB_AUTOMACAO`, criadas pelo `add-005`)

Gatilho `card_movido` com `faseId` da fase de destino — uma por fase (EM-01 A),
para o administrador poder ajustar o texto de uma etapa sem tocar em código.
Ação `enviar_email`. Marcadores disponíveis: `{{titulo}}`, `{{fase}}`,
`{{prazo}}`, `{{campo.<chave>}}` e `{{anexos}}`.

| # | Nome | Gatilho (fase) | Destinatários | Assunto |
|---|---|---|---|---|
| 1 | `E-mail: entrada em Análise/Montagem` | `analise` | `$responsavel`, compras@benenutri.com | `[SGC] Pedido em {{fase}}: {{titulo}}` |
| 2 | `E-mail: entrada em Aprovação Técnica` | `tecnica` | idem | idem |
| 3 | `E-mail: entrada em Aprovação da Diretoria` | `diretoria` | idem | idem |
| 4 | `E-mail: entrada em Envio para Indústria` | `envio` | idem | idem |
| 5 | `E-mail: entrada em Enviado para Indústria` | `enviado` | idem | idem |
| 6 | `E-mail: entrada em Em Trânsito para BN` | `transito` | idem | idem |
| 7 | `E-mail: entrada em Faturamento em Andamento` | `faturamento` | idem | idem |
| 8 | `E-mail: entrada em Produtos em B.O.` | `bo` | idem | idem |
| 9 | `E-mail: pedido concluído` | `concluido` | idem | `[SGC] Pedido concluído: {{titulo}}` |
| 10 | `E-mail: pedido cancelado` | `cancelado` | idem | `[SGC] Pedido cancelado: {{titulo}}` |
| 11 | `E-mail: anexos ao criador` | `concluido` | `$criador` | `[SGC] Anexos do pedido concluído: {{titulo}}` |

Corpo das automações 1 a 9 (o mesmo texto, porte do
`upsert-email-automations.mjs` sem o HTML de 38px do original):

```html
<p>O pedido <strong>{{titulo}}</strong> entrou na fase <strong>{{fase}}</strong>.</p>
<p>Fornecedor: {{campo.fornecedor}}<br>Filial: {{campo.filial}}<br>
   Valor total: {{campo.valor_total}}<br>Prioridade: {{campo.prioridade}}</p>
<p>Esta é uma mensagem automática do SGC — por favor não responda.</p>
```

Corpo da 10 acrescenta `<p>Motivo do cancelamento: {{campo.motivo_cancelamento}}</p>`.
Corpo da 11 (EM-03 B, `{{anexos}}` da spec 013 — "Nenhum anexo" quando não há):

```html
<p>O pedido <strong>{{titulo}}</strong> foi concluído. Anexos do pedido:</p>
<pre>{{anexos}}</pre>
```

A cópia para `compras@benenutri.com` é destinatário fixo das dez primeiras
(EM-02). A 11 vai só ao criador — é entrega de arquivo, não aviso de fase.

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/quadro` | `KanbanBoard slug="compras"` com `novoCard` ("Novo pedido" → janela `NovoPedidoDialogo` sobre o quadro, `?novo=1` na URL, R-118), `atualizarACadaMs={60000}`, `podeMover`, `antesDeMover`, `podeExcluir`, `acoesExtras`; `abasExtras` são da 003 (o integrador junta). Persona `comercial` não passa da guarda: `Alert` com "Seu perfil não tem acesso ao quadro de compras." e nada de `KanbanBoard` (RN-021) | `KanbanBoard` da lib, `Alert` | `pages/quadro/QuadroPage.tsx` (já existe, ganha as props), `pages/quadro/AcoesDoPedido.tsx` |
| `/quadro/admin` | `BoardAdmin`; a rota só renderiza para a persona admin, e quem chega sem permissão vê um `Alert` com o motivo e o caminho de volta | `BoardAdmin` da lib, `Alert` | guarda em `pages/quadro/QuadroAdminPage.tsx` |
| `/quadro?novo=1` (R-118; `/pedidos/novo` redireciona para cá) | criação manual numa janela sobre o quadro: fornecedor, filial, período e prioridade; título e responsável são automáticos; fornecedores carregados só ao abrir | `Dialog`, `Field`, `SelectMenu` (fornecedor, filial e prioridade), `DatePicker` (spec 004, UI-03 B), `Button`, `Alert` | `pages/pedidos/NovoPedidoDialogo.tsx` |
| `/notificacoes` | feed paginado de responsável novo, pedido movido e mensagem nova | `PageHeader`, `Panel`, `PanelHeader`, `Table`/`Tr`/`Td`/`RowTitle`/`RowMeta`, `Badge`, `Pagination`, `EmptyState` | `pages/notificacoes/NotificacoesPage.tsx` |
| `/seguranca` | persona por usuário (admin e diretoria) | `PageHeader`, `Panel`, `Toolbar`, `SearchInput`, `Table`, `SelectMenu`, `Pagination`, `Alert` | `pages/seguranca/SegurancaPage.tsx` |

Ações extras do card (`acoesExtras`, na coluna de "Mover para", acima do
Excluir). Botão sem permissão fica **desabilitado com o motivo no `title`**,
nunca some (RF-032, §8 do design):

| Ação | Fase | Persona | O que faz |
|---|---|---|---|
| Aprovar tecnicamente | `tecnica` | admin, gestor | `sgcEscPedidoTecnicaAprovar` → `kbNotaRegistrar` → `ctx.mover(diretoria)` |
| Reprovar | `tecnica` | admin, gestor | diálogo (motivo + produtos) → `sgcEscPedidoTecnicaReprovar` → nota → `ctx.mover(analise)` |
| Aprovar | `diretoria` | admin, diretoria | `sgcEscPedidoDiretoriaAprovar` → `sgcEscItemStatusFase` (003, `{ idCard, status: 'aprovado', atualizadoEm }`, F-07) → nota → `ctx.mover(envio)` |
| Reprovar | `diretoria` | admin, diretoria | diálogo (motivo) → `sgcEscPedidoDiretoriaReprovar` → nota → `ctx.mover(analise)` |
| Devolver à Aprovação Técnica | `diretoria` | admin, diretoria | `ctx.mover(tecnica)` direto (AT-05 A: sem motivo) |
| Registrar envio | `envio` | admin, analista, gestor | diálogo (canal, contato, data, número do pedido, observação) → `sgcEnvioIndustriaRegistrar` → `sgcEscItemStatusFase` (003, `status: 'enviado'`, F-07) → `ctx.recarregar()` |
| Cancelar compra | toda fase ativa | admin, analista, gestor, diretoria (com a mesma regra de movimento) | diálogo (motivo) → `sgcEscPedidoCancelar` → `kbCardAtualizar` (espelha `motivo_cancelamento`) → nota → `ctx.mover(cancelado)` |

Todo campo de data — período na criação, data do envio — é o `DatePicker` do
projeto (`src/components/DatePicker.tsx`, spec 004; UI-03 B e a emenda do
`design.md` §1.4/§9.2). O controle nativo de data não entra em tela.

Os diálogos seguem §9.5: `max-h-[90vh]`, `flex-col`, só o miolo rola, rodapé
`flex-col-reverse sm:flex-row sm:justify-end`. Sem toast (UI-02 A): o
resultado aparece pelo `ctx.avisar()` da lib, na faixa de aviso do card.

### O card depois da Análise (R-141)

`lib/conteudo-da-fase.ts` monta cada fase depois da Análise como o legado:
`resumo` primeiro, depois o bloco de assunto da fase e os blocos de trabalho.

| Fase | Blocos |
|---|---|
| Técnica, Diretoria | resumo · aprovacao · itens · alertas |
| Envio | resumo · envio |
| Enviado | resumo · enviado · notas-fiscais · recebimento |
| Trânsito | resumo · acompanhamento · recebimento · notas-fiscais |
| Faturamento | resumo · notas-fiscais · conclusao · bo |
| B.O. | resumo · bo · conclusao · notas-fiscais |
| Concluído | resumo · concluido · bo (só com item) |
| Cancelado | resumo · itens-pedido |

Custo por abertura (RNF-001, teto de 300/min): continua `kbCardDetalhe` +
`sgcPedidoCarregar`; o resumo, a aprovação, o envio, o enviado e o
acompanhamento não chamam nada. Conclusão e concluído leem o mesmo
`sgcNfListar`/`sgcBoCarregar` dos blocos Notas fiscais e B.O. por
`abas/carga-do-card.ts` (promessa única por card durante 15 s; quem grava pede
`forcar` e avisa os outros). O resumo só volta ao `sgcPedidoCarregar` quando o
card muda de fase aberto. Regra pura: `resumo-do-pedido.ts`, `aprovacao.ts`,
`envio-industria.ts`, `acompanhamento.ts`, `conclusao.ts` e `topoDoBo` em
`bo.ts`, com teste em `frontend/tests/`.

## Regras puras (`frontend/src/lib/`)

Nenhuma delas conhece React nem o transporte — é o que `node --test` executa.

```ts
// permissoes.ts — porte fiel de getPermissions (usePersona.ts do p-45547)
export type Persona = 'admin' | 'analista' | 'gestor' | 'diretoria' | 'comercial';
export type NivelAcesso = 'ADMIN' | 'MEMBER' | 'RESTRICTED' | 'READ_ONLY';
export const PERSONAS: readonly Persona[];
/** Linha de `sgcPersonaAtual`; ausente ou inválida → analista (P-02 B). */
export function personaDe(linha: { PERSONA?: string; ACCESS_LEVEL?: string } | null):
  { persona: Persona; acesso: NivelAcesso };
export interface Permissoes {
  verQuadro: boolean; criarPedido: boolean; editarPedido: boolean;
  aprovarTecnica: boolean; aprovarDiretoria: boolean; cancelar: boolean;
  registrarEnvio: boolean; excluirPedido: boolean; administrarQuadro: boolean;
  verSeguranca: boolean; somenteProprios: boolean; somenteLeitura: boolean;
  // consumidas pela spec 004 (B-02): a agenda não tem matriz própria
  agendar: boolean; cancelarAgendamento: boolean;
}
export function permissoesDe(persona: Persona, acesso: NivelAcesso): Permissoes;
```

| | admin | analista | gestor | diretoria | comercial |
|---|---|---|---|---|---|
| ver o Quadro, a Agenda e os Fornecedores (P-03) | sim | sim | sim | sim | **não** |
| criar/editar pedido (P-04) | sim | sim | sim | não | não |
| aprovação técnica (P-05) | sim | não | sim | não | não |
| aprovação da diretoria (P-06) | sim | não | não | sim | não |
| cancelar (CA-01 + P-07) | sim | sim | sim | só na fase dela | não |
| registrar envio (EN-03) | sim | sim | sim | não | não |
| excluir pedido (P-09/P-11) | sim | não | sim | sim | não |
| administrar o quadro (P-11 A) | sim | não | não | não | não |
| ver Segurança (P-13) | sim | não | não | sim | não |
| criar/editar agendamento — `agendar` (R-005) | sim | sim | sim | não | não |
| cancelar agendamento — `cancelarAgendamento` (P-10) | sim | não | sim | sim | não |

As duas últimas linhas existem para a spec 004 (B-02): a agenda consome
`podeAgendar`/`podeCancelarAgendamento` daqui, para a matriz de personas viver
num lugar só.

A persona `comercial` é a única com `verQuadro` falso: ela não vê o Quadro, a
Agenda nem os Fornecedores no menu e a rota a recusa (P-03, R-001).
`acesso === 'READ_ONLY'` zera tudo menos `verQuadro`; `acesso === 'RESTRICTED'`
liga `somenteProprios` (P-08 B) — os dois valem **além** da persona.

```ts
// transicoes.ts — a tabela F-03 e o motivo de cada recusa, espelho da SQL ligada
export type ChaveFase = 'analise' | 'tecnica' | 'diretoria' | 'envio' | 'enviado'
  | 'transito' | 'faturamento' | 'bo' | 'concluido' | 'cancelado';
export const FASES: readonly ChaveFase[];                    // ordem do funil
export const TRANSICOES: Readonly<Record<ChaveFase, readonly ChaveFase[]>>;
export interface EstadoPedido {
  souCriador: boolean; temMotivoCancelamento: boolean;
  temMotivoTecnico: boolean; temMotivoDiretoria: boolean; envioRegistrado: boolean;
}
export const MOTIVOS: Readonly<Record<string, string>>;      // os textos de recusa
/** null = destino livre; texto = destino desabilitado com esse motivo. */
export function motivoDeDestino(
  persona: Persona, acesso: NivelAcesso,
  origem: ChaveFase, destino: ChaveFase, pedido: EstadoPedido,
): string | null;
```

`motivoDeDestino` decide **na mesma ordem** do `CASE` da SQL — é essa ordem que
faz a tela e o servidor darem a mesma resposta, e é o que o teste de
5 personas × 10 fases × 10 destinos compara.

```ts
// pedido.ts — o que a criação e os formulários calculam
export const PRIORIDADES: readonly ['normal', 'alta', 'urgente'];
export const PERIODO_PADRAO_DIAS = 45;                                   // AN-11
export function tituloDoPedido(filial: string, fornecedor: string): string;   // "FILIAL · FORNECEDOR", C-02 A
export function periodoPadrao(hoje?: Date): { inicio: string; fim: string };  // AAAA-MM-DD
export function validarNovoPedido(form: { codfornec: string; codfilial: string; inicio: string; fim: string }):
  { ok: boolean; erros: Partial<Record<'fornecedor' | 'filial' | 'periodo', string>> };
export function validarMotivo(texto: string): string | null;             // vazio → mensagem; > 1000 → mensagem
export function validarEnvio(
  form: { canal: 'email' | 'plataforma'; contato: string; data: string; numped: string },
  contatos: readonly string[],                                            // EN-02 A: só os cadastrados
): { ok: boolean; erros: Partial<Record<'canal' | 'contato' | 'data' | 'numped', string>> };
```

## Fluxo

**Criar pedido** (janela "Novo pedido" do quadro, R-118) — duas chamadas, nunca uma JS aninhada:

1. A tela valida com `validarNovoPedido` e monta o título com `tituloDoPedido`.
2. `api.cardCriar({ boardId, titulo, valores, responsaveisIds })` (transporte da
   lib sobre `kbCardCriar`, com sessão): `valores` leva `fornecedor`, `filial`
   e `prioridade` (R-009: a prioridade nasce aqui e só vive no campo).
   Devolve `{ ok, id }`. É o motor que dá ordem, texto de busca, movimento
   inicial e automação de "card criado" — por isso nunca `kbEscCardInserir`.
3. `sgcEscPedidoCriar` com o `cardId` devolvido grava a capa em `SGC_PEDIDO`.
4. A tela navega para `/quadro?card=<id>`.

O passo 2 **não** pode virar uma JS do SGC que chame `kbCardCriar` por dentro:
chamada aninhada não propaga `:VAR_USER` com garantia, e o card nasceria sem
criador (D-007). O cron da agenda (004) é o caminho espelhado: sem sessão, ele
chama `kbCardCriar` com `origem: 'sistema'`/`criadoPor` e depois
`sgcEscPedidoCapaInserir` por id (R-010).

**Mover um pedido** — a mesma regra, três vezes, de propósito:

1. `podeMover` (tela, síncrono): `motivoDeDestino(...)` desabilita o destino
   com o motivo, antes de qualquer clique.
2. `antesDeMover` (tela, assíncrono, no clique): para `analise → tecnica` chama
   **`sgcAnaliseSair` (003), e só ele** — uma execução que regera os alertas,
   consulta `sgcAnaliseSaidaVerificar` e, com `PODE = 0`, devolve
   `{ ok: false, erro }` **sem gravar nada**; passando, remove os itens zerados,
   recalcula o total, chama `sgcEscPedidoReprovacoesLimpar` (002, por id) e
   registra a nota do resumo (AT-04, R-011, D-009). Não existe um
   **server function** `verificarSaidaAnalise` separada (o adaptador de tela da
   003, `pages/quadro/abas/verificar-saida.ts`, continua existindo e é ele que
   a `QuadroPage` chama).
3. `sgcPodeMover` (servidor, o gancho): o motor reconfere pelo bloco
   `PENDENCIAS` antes de gravar. Quem chamar `kbCardMover` por fora da tela
   bate aqui (RF-011).

**Decidir** (aprovar, reprovar, cancelar): diálogo → escrita SQL guardada →
`kbNotaRegistrar` → `ctx.mover(fase)`. Duas decisões levam junto a situação dos
itens (F-07, C-03): aprovar na diretoria chama `sgcEscItemStatusFase` (003) com
`status: 'aprovado'` e o envio registrado, com `status: 'enviado'` — sempre
antes do `ctx.mover`, e sempre da tela, porque a SF é guardada por `:VAR_USER`. A escrita vem **antes** do movimento
porque é ela que satisfaz a condição que o gancho vai conferir (motivo do
cancelamento, motivo da reprovação).

**Abrir um pedido**: `kbCardDetalhe` (lib) + `sgcPedidoCarregar` (002) = 2
execuções (RNF-001). A capa do cartão no quadro não custa nada: fornecedor,
filial, valor e prioridade são campos do quadro, já carregados com a lista.

## Simulador

- **Seed:** `backend/simulator/seed/002-quadro.mjs`, exportando
  `seed002(db, CENARIO)` — o `seed.mjs` (arquivo do integrador) chama depois de
  criar usuários, quadro e fases. Grava:
  - `SGC_FASE`: as 10 chaves de `CENARIO.fases` → `FASE_ID` (o tradutor de que
    todas as regras dependem).
  - `SGC_USUARIO_PERSONA`: `CENARIO.usuarios` = `{ admin: 1, ana: 2, gil: 3, dora: 4, leo: 5 }`
    → `admin`, `analista`, `gestor`, `diretoria`, `comercial` (o `leo` é o
    comercial do seed do `develop`); um sexto usuário sem linha de persona cobre
    C-010. `READ_ONLY` e `RESTRICTED` são testados mudando o `ACCESS_LEVEL` de
    um usuário existente dentro do smoke (C-008 e C-009), sem mais um seed.
  - `KB_CAMPO`: os 6 campos do quadro, com as opções de `prioridade` e a capa
    por fase (`KB_FASE.CAPA_JSON` com `alertas_pendentes` na `analise` e
    `motivo_cancelamento` no `cancelado`).
  - `KB_AUTOMACAO`: as 11 automações de e-mail.
  - `KB_META`: `gancho:podeMover` → `7206` e `gancho:podeExcluir` → `7207`,
    lidos pelo helper do integrador **`backend/ids-do-mapa.mjs`** (nome → id de
    *todos* os blocos de `server-functions.ts`). O `lerIdsDoMapa` da lib não
    serve: ele só devolve os ids das escritas `kbEsc*` (B-08). No sandbox,
    `instalar({ ganchos })` grava os ids reais.
  - 6 pedidos (`KB_CARD` + `SGC_PEDIDO`), um por situação: P1 em `analise`
    (criado pela ana), P2 em `tecnica`, P3 em `diretoria`, P4 em `envio` sem
    envio registrado, P5 em `enviado` com envio registrado e 1 linha em
    `SGC_COMUNICACAO`, P6 em `cancelado` com motivo. P4 tem 2 responsáveis
    (ana e gil) para o e-mail e as notificações.
- **`CHECK_INPUT`** (o `sim:check` executa cada SQL com este objeto): acrescentar
  `usuarioId: '1'`, `cardId: '1'`, `idCard: '1'`, `boardId: '1'`, `faseId: '2'`,
  `origem: 'agenda'`, `idAgenda: '1'`,
  `usuarioAlvo: '2'`, `persona: 'gestor'`, `agora: '2026-09-15T12:00:00'`,
  `motivo: 'teste'`, `produtos: ''`, `codfornec: '1'`, `fornecedor: 'X'`,
  `codfilial: '1'`, `filial: 'Y'`, `periodoInicio: '2026-08-01'`,
  `periodoFim: '2026-09-15'`, `canal: 'email'`,
  `email: 'a@b.com'`, `dtEnvio: '2026-09-15'`, `numped: '1'`, `obs: ''`,
  `enviadoPor: '2'`, `enviadoEm: '2026-09-15T12:00:00'`, `tipo: 'email'`,
  `para: 'a@b.com'`, `cc: 'compras@benenutri.com'`, `assunto: 'x'`, `corpo: 'x'`
  (os já existentes `busca`, `limite` e `offset` continuam valendo).
- **`PUBLISH_ORDER`:** acrescentar `add-005-quadro-compras.mjs` depois do
  `add-004-fornecedores.mjs` (a criação de pedido lê fornecedor e filial da 001).
- **Dialeto:** o SQL usa `CONCAT`, `COALESCE`, `TRIM`, `LEFT`, `CASE`, `EXISTS`
  e `INSERT … ON DUPLICATE KEY UPDATE`. Os cinco primeiros o
  `mysql-dialect.mjs` já traduz; o upsert precisa virar
  `INSERT … ON CONFLICT(USUARIO_ID) DO UPDATE` no SQLite — **shim novo**, a
  conferir na T-002 (se o dialeto ainda não cobre, entra lá).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardCriar` + `sgcEscPedidoCriar` como ana: 1 card na fase `analise`, `TITULO = '1 — MATRIZ · NUTRILATINA'`, `CRIADO_POR = 2`, 1 linha em `SGC_PEDIDO` com `ORIGEM = 'manual'` e `valores.prioridade = 'normal'` no card |
| C-001 (R-010) | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoCapaInserir({ usuarioId: 2, cardId, origem: 'agenda', idAgenda: 7, … })` grava a capa com `ORIGEM = 'agenda'` e `ID_AGENDA = 7`, sem sessão; chamada duas vezes, continua 1 linha |
| C-002 | `frontend/tests/pedido.test.mjs` | `validarNovoPedido({codfilial: ''})` → `ok: false` e `erros.filial` contém "filial" |
| C-003 | `frontend/tests/pedido.test.mjs` | `periodoPadrao(new Date('2026-09-15'))` → `{ inicio: '2026-08-01', fim: '2026-09-15' }` |
| C-004 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P1, tecnica)` como ana: `ok: true`, card na fase 2, 1 linha em `KB_MOVIMENTO` |
| C-005 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover(ana, P1, diretoria)` → `PODE = 0` e `MOTIVO` igual ao texto de F-04; `kbCardMover` devolve o mesmo motivo e o card não sai da fase 1 |
| C-006 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P2, diretoria)` como dora → recusa citando "Aprovação da Diretoria"; `kbCardMover(P3, envio)` como dora → ok |
| C-007 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover` como gil nas fases 5→6 e 6→7: ok nas duas |
| C-008 | `frontend/tests/transicoes.test.mjs` + smoke | gestor com `ACCESS_LEVEL = READ_ONLY`: `motivoDeDestino` devolve texto em 10×10 destinos e `sgcPodeMover` → `PODE = 0` com "somente leitura" |
| C-044 | `backend/simulator/smoke/002-quadro.mjs` + `frontend/tests/permissoes.test.mjs` | `permissoesDe('comercial', 'MEMBER').verQuadro` = false; `sgcPodeMover` e `sgcPodeExcluir` com o leo → `PODE = 0` e `MOTIVO` = "Seu perfil não tem acesso ao quadro de compras." |
| C-009 | `backend/simulator/smoke/002-quadro.mjs` | com `ACCESS_LEVEL = 'RESTRICTED'`: card de outro → `PODE = 0`; card próprio → `PODE = 1` |
| C-010 | `backend/simulator/smoke/002-quadro.mjs` | usuário 6 (sem linha de persona, `MEMBER`): `sgcPersonaAtual` devolve `analista` e `kbCardMover(P1, tecnica)` passa |
| C-011 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover` chamada direta (sem tela) devolve `PODE = 0` e o motivo de C-006; `KB_META` tem os dois ganchos gravados |
| C-012 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P5, transito)` como gil sem nenhum dado de NF: ok |
| C-013 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoTecnicaAprovar` como gil: `TEC_POR = 3`, `TEC_EM` preenchido, `TEC_MOTIVO = ''`; 1 `KB_LOG` de nota com "Aprovado tecnicamente" |
| C-014 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoTecnicaReprovar` com `motivo: ''` → 0 linhas afetadas, `TEC_MOTIVO` continua vazio; `kbCardMover(P2, analise)` recusado |
| C-015 | `backend/simulator/smoke/002-quadro.mjs` | reprovar com motivo e `produtos: '1024,2088'` → colunas gravadas; `kbCardMover(P2, analise)` passa |
| C-016 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoReprovacoesLimpar({ usuarioId: 2, idCard })` zera `TEC_MOTIVO`, `TEC_PRODUTOS_REPROVADOS` e `DIR_MOTIVO` (quem a chama é o `sgcAnaliseSair` da 003, testado lá) |
| C-017 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover(gil, P2, analise)` sem motivo gravado → motivo cita "Reprovar" |
| C-018 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoDiretoriaAprovar` como dora: `DIR_POR = 4`; `kbCardMover(P3, envio)` ok |
| C-019 | `backend/simulator/smoke/002-quadro.mjs` | depois de reprovar na diretoria, `DIR_MOTIVO` = o texto novo e `TEC_MOTIVO` antigo intacto |
| C-020 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P3, tecnica)` como dora sem motivo: ok |
| C-021 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover(…, P4, diretoria)` → 1; `sgcPodeMover(…, P1, diretoria)` → 0 |
| C-022 | `backend/simulator/smoke/002-quadro.mjs` | cancelar da fase 7: `CANC_MOTIVO/POR/EM` gravados e `kbCardMover(…, cancelado)` leva o card à fase 10 |
| C-023 | `frontend/tests/transicoes.test.mjs` | `motivoDeDestino(…, 'cancelado', { temMotivoCancelamento: false })` = 'Use a ação "Cancelar compra"…' nas 8 fases ativas |
| C-024 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoCancelar` com motivo vazio: 0 linhas e `sgcPodeMover(…, cancelado)` → 0 |
| C-025 | `backend/simulator/smoke/002-quadro.mjs` | P1 com 2 alertas não lidos cancela mesmo assim (`PODE = 1` para `cancelado`) |
| C-026 | `frontend/tests/transicoes.test.mjs` | `TRANSICOES.concluido` e `TRANSICOES.cancelado` têm comprimento 0 |
| C-027 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEnvioIndustriaRegistrar` canal e-mail: `ok: true`, `destinatarios` = contato + compras@, 1 linha em `SGC_COMUNICACAO`, `DT_ENVIO`/`CANAL`/`NUMPED_WINTHOR` gravados |
| C-028 | `backend/simulator/smoke/002-quadro.mjs` | `numped: ''` → `ok: false` citando "número do pedido"; 0 comunicações |
| C-029 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover(ana, P4, enviado)` → 0 com a mensagem de EN-04; depois do envio, → 1 |
| C-030 | `backend/simulator/smoke/002-quadro.mjs` | canal plataforma: 0 e-mails, 1 comunicação `TIPO = 'plataforma'` |
| C-031 | `backend/simulator/smoke/002-quadro.mjs` | com `ID_AGENDA = 0` o resultado traz `agendaSincronizada: false` e nada quebra (a sincronia real é teste da 004) |
| C-032 | `backend/simulator/smoke/002-quadro.mjs` | mover P1 para `tecnica` executa a automação 2 e o resultado lista 3 destinatários (2 responsáveis + compras@) |
| C-033 | `backend/simulator/smoke/002-quadro.mjs` | com 2 anexos, o corpo do e-mail da automação 11 tem 2 linhas "nome — url"; sem anexos, "Nenhum anexo" |
| C-034 | `backend/simulator/smoke/002-quadro.mjs` | mover para `cancelado` dispara a automação 10 e o assunto contém "cancelado" |
| C-035 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardsListar` devolve `valores.fornecedor`, `filial`, `valor_total`, `prioridade`; `KB_FASE.CAPA_JSON` da `analise` cita `alertas_pendentes` |
| C-036 | `frontend/tests/pedido.test.mjs` | `lib/quadro.ts` exporta `ROTULO_NOVO_PEDIDO === 'Novo pedido'` e `menuParaPersona` não tem `/pedidos/novo` para persona nenhuma (R-118) |
| C-037 | `frontend/tests/pedido.test.mjs` | `lib/quadro.ts` exporta `ATUALIZAR_A_CADA_MS === 60000` |
| C-038 | `frontend/tests/permissoes.test.mjs` | `permissoesDe('admin', …).administrarQuadro` = true; as outras 4 personas = false |
| C-039 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeExcluir` com ana → 0 e motivo citando "Cancelar compra"; com gil e dora → 1; `kbCardExcluir` como ana recusado |
| C-040 | `frontend/tests/permissoes.test.mjs` | `permissoesDe('analista', 'MEMBER').aprovarTecnica` = false (a tela desabilita, não esconde — verificação manual fecha o visual) |
| C-041 | `backend/simulator/smoke/002-quadro.mjs` | `sgcNotificacoesListar` como ana devolve 3 linhas (`responsavel`, `movimento`, `mensagem`) em ordem decrescente e `sgcNotificacoesListarTotal` = 3 |
| C-042 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPersonaSalvar` como admin muda a persona do gil; como ana, 0 linhas |
| C-043 | `backend/simulator/smoke/002-quadro.mjs` | depois das 4 decisões, `KB_LOG` do card tem 4 eventos `nota` com autor e instante |
| RN-001 | `frontend/tests/permissoes.test.mjs` | `personaDe(null)` → analista; `{ACCESS_LEVEL:'ADMIN'}` → admin; `{ACCESS_LEVEL:'RESTRICTED'}` → comercial |
| RN-002 | `frontend/tests/permissoes.test.mjs` | `READ_ONLY` zera as 10 permissões de operação; `RESTRICTED` liga `somenteProprios` |
| RN-003 | `frontend/tests/transicoes.test.mjs` | a soma dos destinos de `TRANSICOES` é 22 pares: 14 do fluxo e 8 para `cancelado` |
| RN-004 | `frontend/tests/transicoes.test.mjs` + smoke | `motivoDeDestino(…, 'analise', 'diretoria')` = texto de F-04, igual ao `MOTIVO` da SQL |
| RN-005 | `frontend/tests/transicoes.test.mjs` | 5 personas × 10 fases: diretoria só livre na fase 3; comercial, nenhuma |
| RN-006 | `backend/simulator/smoke/002-quadro.mjs` | destino `cancelado` sem `CANC_MOTIVO` → `PODE = 0` |
| RN-007 | `backend/simulator/smoke/002-quadro.mjs` | cancelar P1 com pendências: ok |
| RN-008 | `frontend/tests/transicoes.test.mjs` | fases 9 e 10 sem destino para qualquer persona |
| RN-009 | `backend/simulator/smoke/002-quadro.mjs` | reprovação sem motivo recusada na escrita e no gancho |
| RN-010 | `backend/simulator/smoke/002-quadro.mjs` | depois de `sgcEscPedidoReprovacoesLimpar`, os 3 campos vazios |
| RN-011 | `backend/simulator/smoke/002-quadro.mjs` | entrar na fase 3 vindo da 2 e da 4: ok; da 1: recusado |
| RN-012 | `frontend/tests/pedido.test.mjs` | `validarEnvio` recusa contato fora de `contatos` e exige data e número |
| RN-013 | `backend/simulator/smoke/002-quadro.mjs` | `envio → enviado` com e sem `DT_ENVIO` |
| RN-014 | `frontend/tests/pedido.test.mjs` | `tituloDoPedido('1 — Matriz', 'Nutrilatina')` = `'1 — MATRIZ · NUTRILATINA'` |
| RN-015 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeExcluir` para as 5 personas (admin, analista, gestor, diretoria, comercial): 1,0,1,1,0 |
| RN-016 | `frontend/tests/permissoes.test.mjs` | `administrarQuadro` só para admin; e, para a 004 (B-02), `agendar` = admin/analista/gestor e `cancelarAgendamento` = admin/gestor/diretoria |
| RN-017 | `backend/simulator/smoke/002-quadro.mjs` | `SELECT COUNT(*) FROM KB_CAMPO WHERE OBRIGATORIO = TRUE` = 0 no quadro `compras` |
| RN-018 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardAtualizar` aceita `alta` e recusa `altíssima`; o pedido nasce `normal` |
| RN-019 | `backend/simulator/smoke/002-quadro.mjs` | as 7 ações geram 7 registros (`nota` e `movimento`) |
| RN-020 | `backend/simulator/smoke/002-quadro.mjs` | nas fases 5 a 8 a única recusa possível é de persona (comercial ou diretoria fora da fase dela) |
| RN-021 | `backend/simulator/smoke/002-quadro.mjs` | ver C-044 |
| RNF-001 | `backend/simulator/smoke/002-quadro.mjs` | contador de execuções ao abrir o pedido = 2 |
| RNF-002 | `frontend/tests/pedido.test.mjs` | `ATUALIZAR_A_CADA_MS === 60000` (a pausa com a aba escondida é da lib; verificação manual fecha o visual) |
| RNF-003 | `backend/simulator/smoke/002-quadro.mjs` | `sgcNotificacoesListar` com `limite: 25` e 60 registros devolve 25 linhas e `…Total` = 60 |
| RNF-004 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover` devolve exatamente 1 linha |
| RNF-005 | `backend/simulator/smoke/002-quadro.mjs` | 5 personas × 10 fases × 10 destinos: `motivoDeDestino` e `sgcPodeMover` concordam em 500 combinações — `PODE = 1` exige `MOTIVO` vazio dos dois lados (`null` na tela, `''` na SQL; C-06) |

- **Backend:** `backend/simulator/smoke/002-quadro.mjs` executa as SFs reais
  (SQL e JAVASCRIPT) num banco descartável, com o gancho registrado em
  `KB_META` e resolvido pelo `resolveById` do runner — o `byId` do smoke é
  montado com `backend/ids-do-mapa.mjs` (todos os blocos), não com o
  `lerIdsDoMapa` da lib, que só conhece as `kbEsc*` (B-08). Título de cada `teste()` começa
  pelo id do cenário/regra.
- **Frontend:** `node --test` sobre `permissoes.ts`, `transicoes.ts` e
  `pedido.ts`. Nenhuma tela é testada aqui.
- **Seed extra para o smoke:** o 6º usuário sem persona (C-010), 2 alertas não
  lidos no P1 (C-025, RN-007) e 2 anexos no P5 (C-033). Tudo dentro do
  `seed/002-quadro.mjs`, atrás de um parâmetro `{ completo: true }` para o
  simulador de tela não nascer com lixo.

## Dependências entre specs

**Consome da 001 (fornecedores):**

- `sgcFornecedorListar({ ativo: 1 })` é a **única** origem do seletor de
  fornecedor da janela "Novo pedido" (R-002: fornecedor inativo não é oferecido);
  `sgcWintFornecedores` nunca aparece em tela de pedido — é da parametrização.
- As filiais atendidas vêm de `sgcFornecedorCarregar(codfornec).filiais`, a
  única fonte (C-09): o seletor de filial só abre depois do fornecedor
  escolhido e lista o que aquele fornecedor atende.
- `sgcFornecedorCarregar` para o diálogo de envio: **os contatos de envio da
  linha de produto** (nome + e-mail) e o **link da plataforma** (EN-01, EN-02 A).
  Enquanto a 001 não entregar, o diálogo mostra a lista vazia e o aviso "o
  fornecedor não tem contato de envio cadastrado" — o pedido não sai por
  e-mail, e é assim mesmo que deve ser.

**Fornece à 003 (itens e análise):**

- `sgcPedidoCarregar`: a 002 monta as três consultas e devolve
  `{ ok, pedido, itens, alertas }` numa execução, com **as colunas fechadas na
  seção de contratos** (o alerta liga por `CODPROD`, não por `ID_ITEM`).
- O bloco `PENDENCIAS`/`PENDENCIAS_MOTIVO` de `sgcPodeMover`: duas subconsultas
  marcadas no código, que a 003 substitui pelo corpo de
  `sgcAnaliseSaidaVerificar` (SQL, `cardId`, devolve `PODE`/`MOTIVO`), com
  `{{cardId}} = C.ID`. A mesma SF é chamada pela tela, dentro de
  `sgcAnaliseSair` (003), que é o `antesDeMover` do destino `tecnica`.
- `sgcEscPedidoReprovacoesLimpar` (002, id 7256, `{{usuarioId}}` + `{{idCard}}`):
  quem a chama é o `sgcAnaliseSair` da 003, dentro do `antesDeMover`, depois de
  a verificação passar e antes do movimento (AT-04, R-011).
  Não existem as **server functions** `sgcEscPedidoReenviar` nem
  `verificarSaidaAnalise` — o adaptador de tela `verificar-saida.ts` da 003 é
  que chama `sgcAnaliseSair`.
- As colunas `VL_TOTAL`, `PRAZO_PADRAO`, `PRAZO_ACORDADO` e
  `PRAZO_JUSTIFICATIVA` de `SGC_PEDIDO`, e o campo do quadro
  `alertas_pendentes`: criados aqui, escritos lá.
- A lista de produtos do diálogo "Reprovar" (técnica) sai dos itens da 003; a
  002 grava só os códigos em `TEC_PRODUTOS_REPROVADOS`.
- `sgcEscItemStatusFase` (003, escrita de tela guardada por `:VAR_USER`, input
  `{ idCard, status, atualizadoEm }`): **quem chama é a tela da 002**, logo
  depois da aprovação da diretoria (`status: 'aprovado'`) e logo depois do
  envio registrado (`status: 'enviado'`) — F-07, C-03 da revisão cruzada.

**Fornece à 004 (agenda):**

- `sgcEscPedidoCapaInserir` (002, id 7260, `{{usuarioId}}`, sem `:VAR_USER`):
  é a capa do pedido criado pelo cron (R-010). O `sgcAgendaProcessar` chama
  `kbCardCriar` com `origem: 'sistema'` e `criadoPor` (spec 013 da lib) e, em
  seguida, esta escrita por id, com `origem: 'agenda'` e `idAgenda`. A tela
  continua em `sgcEscPedidoCriar` (`:VAR_USER`).
- **A 002 depende de** `sgcEscAgendaEnvio` (004, id 7458, input
  `{ idCard, dtEnvio }`): o `sgcEnvioIndustriaRegistrar` a chama por id quando
  `ID_AGENDA > 0`, e a agenda guarda planejado × real (EN-05 A, R-012). O passo
  é opcional e não derruba o envio se o id ainda não existir no mapa.

**Do integrador (arquivos compartilhados):**

- `backend/setup-backend.mjs`: as quatro tabelas desta spec.
- `backend/add-001-kanban.mjs`: `ganchos: { podeMover: 'sgcPodeMover', podeExcluir: 'sgcPodeExcluir' }`.
- `backend/simulator/config.mjs`: `add-005` no `PUBLISH_ORDER` e o `CHECK_INPUT`.
- `backend/ids-do-mapa.mjs`: o helper nome → id de todos os blocos do mapa, que
  o seed e o smoke desta spec usam para resolver os ganchos (B-08).
- `backend/simulator/seed.mjs`: a chamada de `seed002`.
- `frontend/src/App.tsx` e `components/AdminLayout.tsx`: as rotas
  `/pedidos/novo`, `/notificacoes` e `/seguranca` e os itens de menu, filtrados
  por permissão (P-03).
- `frontend/src/pages/quadro/QuadroPage.tsx`: a junção das `abasExtras` da 003
  com as props desta spec.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | A matriz de permissões e a tabela de transições existem duas vezes: `lib/transicoes.ts` (tela) e `sgcPodeMover` (servidor) | uma só, na tela | o motor não conhece persona e só pergunta por SQL (spec 013, D-074); a tela precisa desabilitar o botão **antes** do clique. O teste de 500 combinações é o que impede as duas de divergirem |
| D-002 | A ordem do `CASE` da SQL é a mesma ordem do `if` da regra pura | cada lado na ordem que ficar melhor | duas respostas diferentes para o mesmo caso ("é comercial" × "transição não existe") confundem mais do que barram |
| D-003 | O gancho recusa `→ cancelado` enquanto o motivo não estiver gravado | confiar no diálogo da tela | é isso que faz "não existe cancelamento silencioso" (CA-02) valer fora da tela, sem o motor precisar conhecer formulário nenhum |
| D-004 | Os campos do quadro são espelho de mão única (pedido → quadro) | gravar nos dois sentidos | dois donos do mesmo dado divergem; a regra lê sempre o pedido, e o campo do quadro só existe para a capa e a busca não custarem SF por cartão (DS-01 A) |
| D-005 | O quadro tem 6 campos (confirmados no `000` revisado): `fornecedor`, `filial`, `valor_total`, `prioridade`, `alertas_pendentes`, `motivo_cancelamento` | só os 4 primeiros | C-06 pede os alertas na capa da Análise e CA-04 pede o motivo na capa de Canceladas; sem campo, cada cartão custaria uma consulta |
| D-006 | Uma automação de e-mail por fase (11 no total) | uma só, sem `faseId` | EM-01 A pede "por fase" justamente para o administrador ajustar o texto de uma etapa sem tocar em código; o custo é 11 linhas no instalador |
| D-007 | a janela "Novo pedido" chama `kbCardCriar` e depois a escrita da capa, da tela | uma JS do SGC que chame `kbCardCriar` por dentro | chamada aninhada não propaga `:VAR_USER` com garantia: o card nasceria sem criador e sem responsável |
| D-008 | `sgcEnvioIndustriaRegistrar` confere persona e fase **no próprio JS**, e as duas escritas que ele chama recebem `enviadoPor` como parâmetro | `:VAR_USER` nas escritas do envio | a chamada é aninhada (mesma razão de D-076 da lib). A conferência acontece uma vez, antes do e-mail — que é a parte irreversível |
| D-009 | `sgcAnaliseSair` (003) **é** o `antesDeMover` de `analise → tecnica`: verificar e arrumar acontecem na mesma execução, antes do `ctx.mover` (R-011) | verificar numa JS e arrumar em outra, depois do movimento | arrumar depois deixa o card em Técnica com itens zerados e reprovações velhas se a segunda chamada falhar — pior que o inverso. Verificar antes e recusar sem gravar é a mesma chamada, uma JS a menos por saída, e o gancho `sgcPodeMover` reconfere no servidor. **Risco aceito**: se o motor recusar o movimento depois da arrumação, as escritas já feitas não são destrutivas (o zerado sairia de qualquer jeito; a reprovação some com o card ainda em Análise), a persona já foi barrada pelo `podeMover` síncrono e o quadro não tem campo obrigatório |
| D-010 | Prioridade vive **só** no campo do quadro; `SGC_PEDIDO` não tem a coluna (R-009) | guardar nas duas pontas e sincronizar | prioridade é o único dos campos que a **pessoa** edita direto no card (C-07 B); sincronizar de volta custaria uma escrita por edição de campo, e o motor não avisa o consumidor quando um campo muda. a janela "Novo pedido" passa o valor inicial nos `valores` de `api.cardCriar` |
| D-011 | Cancelar segue a mesma regra de movimento: quem não move aquele card não o cancela (a diretoria cancela na fase dela) | diretoria cancela de qualquer fase | CA-01 libera a fase de origem, P-07 limita a persona; juntas, cancelar é um movimento como os outros, e o gancho não precisa de exceção |
| D-012 | Nenhum campo do quadro é obrigatório | marcar os campos da fase como obrigatórios | o motor cobra obrigatório em qualquer direção e barraria cancelar e voltar (F-05 A) |
| D-013 | A persona é lida uma vez por sessão (`sgcPersonaAtual`) e guardada em memória | consultar a cada tela | teto de 300 execuções/min; a persona muda raramente e a mudança vale na sessão seguinte (C-042) |
| D-014 | A tela de segurança lista **todos** os usuários ativos da plataforma, com a persona vazia quando não há linha | cadastrar usuário no SGC | P-13: usuários vêm do cadastro da plataforma, sem cadastro próprio |
| D-015 | As notificações saem de uma SQL sobre `KB_LOG`, `KB_MOVIMENTO` e `KB_MENSAGEM`, restritas aos cards em que a pessoa é responsável | uma tabela de notificações própria | é o feed de UI-07 B sem nenhuma tabela, escrita ou gatilho novo; o custo é uma consulta com `UNION ALL` paginada |
| D-016 | O corpo do e-mail do pedido é montado na tela e chega pronto ao JS | montar no servidor | a lista de itens é da 003 e já está carregada na tela; montá-la de novo no servidor seria a segunda implementação da mesma tabela |
| D-017 | A quinta persona é `comercial` (P-01, R-001), e ela é a **única** sem acesso ao quadro: fora do menu, fora da rota e recusada no servidor | uma persona `leitura` que vê o quadro sem mover | P-03 é explícito, e quem precisa "ver e não operar" já tem o `READ_ONLY` da plataforma (P-08 B) — duas formas de dizer a mesma coisa é uma a mais |
| D-018 | As escritas chamadas por id (`…CapaInserir`, `…ReprovacoesLimpar`, `…Envio`, `…ComunicacaoInserir`) recebem `{{usuarioId}}` e não `:VAR_USER` | guardar todas por `:VAR_USER` | chamada aninhada e cron não propagam sessão; a persona é conferida pelo JS que chama, antes de escrever (exceção registrada no `000`, R-007/R-010/R-011) |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O card nasce e a gravação da capa falha (rede, sessão) | pedido sem fornecedor/filial no quadro | a tela avisa e oferece repetir a gravação; o smoke cobre o caminho feliz e o `sgcPedidoCarregar` devolve `pedido: null` sem quebrar a tela |
| A tela e a SQL divergirem depois de uma mudança de regra | botão habilitado que o servidor recusa | o teste de 500 combinações (RNF-005) roda no `npm test` dos dois lados e quebra na primeira divergência |
| `:VAR_USER` não propagar dentro do JAVASCRIPT do envio | envio recusado para todo mundo | o JS resolve o usuário numa consulta só, no primeiro passo, e devolve `{ ok: false, error: 'Sessão inválida.' }` — falha fechada e visível, nunca envio em nome errado; o smoke prova com os 5 usuários |
| A 003 mexer no bloco `PENDENCIAS` e quebrar as outras transições | pedido travado na Análise | o bloco é uma subconsulta isolada, com o comentário do contrato; os testes C-004, C-005 e C-025 da 002 continuam valendo depois da troca |
| Mudança de nome de fase pelo administrador | regra procurando nome | nenhuma regra usa nome: tudo passa por `SGC_FASE.CHAVE` (RF-005), e o smoke renomeia uma fase antes de repetir C-004 |
| As quatro escritas chamadas por id aceitam qualquer `{{usuarioId}}` | quem chamar a SF direto escreve em nome de outro | elas só existem para cron e JS, e o perfil business pode deixar de liberá-las (R-007, verificação da onda 1); nenhuma delas decide nada — gravam o que o JS já conferiu, e as decisões com regra (aprovar, reprovar, cancelar) continuam guardadas por `:VAR_USER` |

## Complexity Tracking

Vazio: nenhuma violação de princípio. A duplicação da matriz de permissões
(tela + SQL) é exigência da regra P-12 e do contrato de ganchos da lib, não
abstração nova — e está coberta por teste que prova a equivalência.
