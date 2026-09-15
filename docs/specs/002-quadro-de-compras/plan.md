# Plan: Quadro de compras

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` aprovada, zero `[NEEDS CLARIFICATION]` |
| Backend escrito local, executado no sandbox | sim | `add-005-quadro-compras.mjs` (novo, desta spec) e duas linhas em arquivos do integrador: as quatro tabelas no `setup-backend.mjs` e `ganchos` no `add-001-kanban.mjs`. Nada roda `mitra-sdk` da máquina local |
| Migrations append-only | sim | nenhum arquivo de `backend/migrations/` é criado, editado ou adicionado ao commit; o sandbox materializa |
| Leitura e escrita por Server Function | sim | 11 leituras/JS (72xx) e 10 escritas SQL guardadas por `:VAR_USER` (725x); zero CRUD REST em tela de usuário final; o quadro fala com o motor pelo transporte `linhas`/`acao` |
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
| Persona | `SGC_USUARIO_PERSONA` | `ID`, `USUARIO_ID`, `PERSONA`, `ATUALIZADO_POR`, `ATUALIZADO_EM` | 1:1 com `INT_USER`; `UNIQUE (USUARIO_ID)`; `PERSONA` ∈ `admin`, `analista`, `gestor`, `diretoria`, `leitura` |
| Pedido de compra | `SGC_PEDIDO` | ver abaixo | 1:1 com `KB_CARD`, `UNIQUE (ID_CARD)` |
| Comunicação | `SGC_COMUNICACAO` | `ID`, `ID_CARD`, `TIPO`, `PARA`, `CC`, `ASSUNTO`, `CORPO`, `ENVIADO_POR`, `ENVIADO_EM` | `TIPO` ∈ `email`, `plataforma`; índice em `ID_CARD` |

`SGC_PEDIDO`, coluna a coluna:

```sql
CREATE TABLE IF NOT EXISTS SGC_PEDIDO (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_CARD INT NOT NULL,
  CODFORNEC VARCHAR(20),
  FORNECEDOR VARCHAR(180),
  CODFILIAL VARCHAR(10),
  FILIAL VARCHAR(120),
  PERIODO_INICIO VARCHAR(10),
  PERIODO_FIM VARCHAR(10),
  VL_TOTAL DECIMAL(15,2) DEFAULT 0,
  PRIORIDADE VARCHAR(20) DEFAULT 'normal',
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
- `ENVIO_OBS`, `ENVIO_POR` e `ENVIO_EM` completam o registro do envio de EN-03 (o `000` cita as outras quatro colunas do bloco).
- `PRIORIDADE` nasce `normal` e **não é reescrita depois**: o valor vivo é o do campo do quadro (D-010).

Campos do quadro `compras` (`KB_CAMPO`, criados pelo `add-005`, chave estável):

| Chave | Tipo | Onde aparece | Quem escreve |
|---|---|---|---|
| `fornecedor` | `texto` | capa de todas as fases (`NO_CARD`) | 002, na criação |
| `filial` | `texto` | capa de todas as fases | 002, na criação |
| `valor_total` | `moeda` | capa de todas as fases | 003, ao gravar itens |
| `prioridade` | `selecao` (`normal`, `alta`, `urgente`) | capa de todas as fases | a pessoa, no card aberto |
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
| `sgcPedidoCarregar` | 7205 | JAVASCRIPT | `cardId` | `{ ok, pedido, itens, alertas }` numa execução | RF-006, RNF-001 |
| `sgcPodeMover` | 7206 | SQL (gancho) | `usuarioId`, `cardId`, `boardId`, `faseId` | 1 linha: `PODE` (1/0), `MOTIVO` | RF-009, RF-011, RNF-004 |
| `sgcPodeExcluir` | 7207 | SQL (gancho) | `usuarioId`, `cardId`, `boardId`, `faseId` (`0`) | 1 linha: `PODE`, `MOTIVO` | RF-027 |
| `sgcComunicacoesListar` | 7208 | SQL | `cardId`, `limite`, `offset` | `ID, TIPO, PARA, CC, ASSUNTO, ENVIADO_POR, ENVIADO_NOME, ENVIADO_EM` | RF-023 |
| `sgcNotificacoesListar` | 7209 | SQL | `limite`, `offset` (`:VAR_USER`) | `TIPO, CARD_ID, TITULO, QUEM, TEXTO, QUANDO` | RF-029 |
| `sgcNotificacoesListarTotal` | 7210 | SQL | — (`:VAR_USER`) | `TOTAL` | RF-029, RNF-003 |
| `sgcEnvioIndustriaRegistrar` | 7211 | JAVASCRIPT | `cardId`, `canal`, `para`, `assunto`, `corpo`, `dtEnvio`, `numped`, `obs` | `{ ok, error?, comunicacaoId, destinatarios }` | RF-020, RF-021, RF-023, RF-024 |
| `sgcEscPedidoCriar` | 7250 | SQL | `cardId`, `codfornec`, `fornecedor`, `codfilial`, `filial`, `periodoInicio`, `periodoFim`, `prioridade`, `agora` | — | RF-001 |
| `sgcEscPedidoTecnicaAprovar` | 7251 | SQL | `cardId`, `agora` | — | RF-013 |
| `sgcEscPedidoTecnicaReprovar` | 7252 | SQL | `cardId`, `motivo`, `produtos`, `agora` | — | RF-014 |
| `sgcEscPedidoDiretoriaAprovar` | 7253 | SQL | `cardId`, `agora` | — | RF-016 |
| `sgcEscPedidoDiretoriaReprovar` | 7254 | SQL | `cardId`, `motivo`, `agora` | — | RF-017 |
| `sgcEscPedidoCancelar` | 7255 | SQL | `cardId`, `motivo`, `agora` | — | RF-019 |
| `sgcEscPedidoReenviar` | 7256 | SQL | `cardId`, `agora` | — | RF-015 |
| `sgcEscPedidoEnvio` | 7257 | SQL | `cardId`, `canal`, `email`, `dtEnvio`, `numped`, `obs`, `enviadoPor`, `agora` | — | RF-020 |
| `sgcEscComunicacaoInserir` | 7258 | SQL | `cardId`, `tipo`, `para`, `cc`, `assunto`, `corpo`, `enviadoPor`, `enviadoEm` | — | RF-023 |
| `sgcEscPersonaSalvar` | 7259 | SQL | `usuarioAlvo`, `persona`, `agora` | — | RF-030 |

Regras da casa: filtro desligado é `''` no texto e `0` no numérico; toda
listagem tem `LIMIT/OFFSET`; uma instrução por escrita; escrita de usuário
carrega a guarda de persona no próprio `WHERE`.

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
                               WHEN 'RESTRICTED' THEN 'leitura'
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
               WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL AND F.CHAVE NOT IN ('concluido','cancelado'))

-- sgcEscPersonaSalvar (P-13): uma instrução, upsert.
INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{usuarioAlvo}}, '{{persona}}', :VAR_USER, '{{agora}}'
WHERE '{{persona}}' IN ('admin','analista','gestor','diretoria','leitura')
  AND EXISTS (<guarda de persona: 'admin','diretoria'>)
ON DUPLICATE KEY UPDATE PERSONA = VALUES(PERSONA), ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)
```

`sgcEscPedidoEnvio` e `sgcEscComunicacaoInserir` são **chamadas pelo
JAVASCRIPT** `sgcEnvioIndustriaRegistrar` (chamada aninhada) e por isso
recebem `enviadoPor` como parâmetro, em vez de `:VAR_USER` — a propagação da
sessão em chamada aninhada não é garantida (a mesma razão do gancho, D-076 da
lib). A guarda de persona e de fase acontece uma vez, no JS, antes de qualquer
escrita (D-008).

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
    WHEN T.PERSONA = 'leitura' OR T.ACESSO = 'READ_ONLY'                            THEN 0
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
  CASE
    WHEN T.PERSONA = 'leitura' OR T.ACESSO = 'READ_ONLY'
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
      THEN 'Há pendências na Análise: leia os alertas e justifique os itens antes de enviar para a Aprovação Técnica.'
    ELSE ''
  END AS MOTIVO
FROM (
  SELECT
    COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                           WHEN 'ADMIN' THEN 'admin'
                           WHEN 'RESTRICTED' THEN 'leitura'
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
       Hoje: alerta não lido. A 003 substitui ESTA subconsulta (e só ela) pela
       soma de alertas não lidos + itens alertados sem justificativa + itens
       acima do limite de cobertura sem justificativa + prazo divergente sem
       justificativa (AL-04, AL-05, AL-06, PZ-03). A tela chama a SF irmã
       `sgcAnaliseSaidaVerificar` (003) no `antesDeMover` para a mensagem
       detalhada; aqui basta o número. */
    (SELECT COUNT(*) FROM SGC_ALERTA A WHERE A.ID_CARD = C.ID AND A.LIDO = FALSE) AS PENDENCIAS
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
`CASE` de três linhas — P-09/P-11: o gancho **substitui** a regra "criador ou
administrador" do motor, então gestor e diretoria excluem qualquer pedido e
analista não exclui nem o próprio:

```sql
CASE
  WHEN T.ACESSO = 'READ_ONLY'                             THEN 0
  WHEN T.PERSONA IN ('admin','gestor','diretoria')        THEN 1
  ELSE 0
END AS PODE,
CASE
  WHEN T.ACESSO = 'READ_ONLY' THEN 'Seu acesso é somente leitura.'
  WHEN T.PERSONA NOT IN ('admin','gestor','diretoria')
    THEN 'Excluir pedido é da gerência, da diretoria ou do administrador. Para encerrar um pedido, use "Cancelar compra".'
  ELSE ''
END AS MOTIVO
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
5. `ID_AGENDA > 0` → chama a escrita da spec 004 que leva a data real ao
   agendamento (EN-05); ausente o id no mapa, o passo é ignorado e o resultado
   traz `agendaSincronizada: false` (a 002 não depende da 004 para fechar).
6. `kbNotaRegistrar` (SF da lib) grava no histórico "Pedido enviado por e-mail
   para `<contato>`" ou "Pedido enviado pela plataforma do fornecedor".

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
| `/quadro` | `KanbanBoard slug="compras"` com `novoCard` ("Novo pedido" → `/pedidos/novo`), `atualizarACadaMs={60000}`, `podeMover`, `antesDeMover`, `podeExcluir`, `acoesExtras`; `abasExtras` são da 003 (o integrador junta) | `KanbanBoard` da lib | `pages/quadro/QuadroPage.tsx` (já existe, ganha as props), `pages/quadro/AcoesDoPedido.tsx` |
| `/quadro/admin` | `BoardAdmin`; a rota só renderiza para a persona admin, e quem chega sem permissão vê um `Alert` com o motivo e o caminho de volta | `BoardAdmin` da lib, `Alert` | guarda em `pages/quadro/QuadroAdminPage.tsx` |
| `/pedidos/novo` | criação manual: fornecedor, filial e período; título e responsável são automáticos | `PageHeader`, `Panel`, `LabelledField`, `SelectMenu` (fornecedor e filial), `Button`, `Alert` | `pages/pedidos/NovoPedidoPage.tsx` |
| `/notificacoes` | feed paginado de responsável novo, pedido movido e mensagem nova | `PageHeader`, `Panel`, `PanelHeader`, `Table`/`Tr`/`Td`/`RowTitle`/`RowMeta`, `Badge`, `Pagination`, `EmptyState` | `pages/notificacoes/NotificacoesPage.tsx` |
| `/seguranca` | persona por usuário (admin e diretoria) | `PageHeader`, `Panel`, `Toolbar`, `SearchInput`, `Table`, `SelectMenu`, `Pagination`, `Alert` | `pages/seguranca/SegurancaPage.tsx` |

Ações extras do card (`acoesExtras`, na coluna de "Mover para", acima do
Excluir). Botão sem permissão fica **desabilitado com o motivo no `title`**,
nunca some (RF-032, §8 do design):

| Ação | Fase | Persona | O que faz |
|---|---|---|---|
| Aprovar tecnicamente | `tecnica` | admin, gestor | `sgcEscPedidoTecnicaAprovar` → `kbNotaRegistrar` → `ctx.mover(diretoria)` |
| Reprovar | `tecnica` | admin, gestor | diálogo (motivo + produtos) → `sgcEscPedidoTecnicaReprovar` → nota → `ctx.mover(analise)` |
| Aprovar | `diretoria` | admin, diretoria | `sgcEscPedidoDiretoriaAprovar` → nota → `ctx.mover(envio)` |
| Reprovar | `diretoria` | admin, diretoria | diálogo (motivo) → `sgcEscPedidoDiretoriaReprovar` → nota → `ctx.mover(analise)` |
| Devolver à Aprovação Técnica | `diretoria` | admin, diretoria | `ctx.mover(tecnica)` direto (AT-05 A: sem motivo) |
| Registrar envio | `envio` | admin, analista, gestor | diálogo (canal, contato, data, número do pedido, observação) → `sgcEnvioIndustriaRegistrar` → `ctx.recarregar()` |
| Cancelar compra | toda fase ativa | admin, analista, gestor, diretoria (com a mesma regra de movimento) | diálogo (motivo) → `sgcEscPedidoCancelar` → `kbCardAtualizar` (espelha `motivo_cancelamento`) → nota → `ctx.mover(cancelado)` |

Os diálogos seguem §9.5: `max-h-[90vh]`, `flex-col`, só o miolo rola, rodapé
`flex-col-reverse sm:flex-row sm:justify-end`. Sem toast (UI-02 A): o
resultado aparece pelo `ctx.avisar()` da lib, na faixa de aviso do card.

## Regras puras (`frontend/src/lib/`)

Nenhuma delas conhece React nem o transporte — é o que `node --test` executa.

```ts
// permissoes.ts — porte fiel de getPermissions (usePersona.ts do p-45547)
export type Persona = 'admin' | 'analista' | 'gestor' | 'diretoria' | 'leitura';
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
}
export function permissoesDe(persona: Persona, acesso: NivelAcesso): Permissoes;
```

| | admin | analista | gestor | diretoria | leitura |
|---|---|---|---|---|---|
| criar/editar pedido (P-04) | sim | sim | sim | não | não |
| aprovação técnica (P-05) | sim | não | sim | não | não |
| aprovação da diretoria (P-06) | sim | não | não | sim | não |
| cancelar (CA-01 + P-07) | sim | sim | sim | só na fase dela | não |
| registrar envio (EN-03) | sim | sim | sim | não | não |
| excluir pedido (P-09/P-11) | sim | não | sim | sim | não |
| administrar o quadro (P-11 A) | sim | não | não | não | não |
| ver Segurança (P-13) | sim | não | não | sim | não |

`acesso === 'READ_ONLY'` zera tudo menos `verQuadro`; `acesso === 'RESTRICTED'`
liga `somenteProprios` (P-08 B).

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

**Criar pedido** (`/pedidos/novo`) — duas chamadas, nunca uma JS aninhada:

1. A tela valida com `validarNovoPedido` e monta o título com `tituloDoPedido`.
2. `kbCardCriar` (SF da lib, com sessão): `boardId`, `titulo`, `valoresJson`
   com `fornecedor`, `filial` e `prioridade`, `responsaveisIds` = quem cria.
   Devolve `{ ok, id }`. É o motor que dá ordem, texto de busca, movimento
   inicial e automação de "card criado" — por isso nunca `kbEscCardInserir`.
3. `sgcEscPedidoCriar` com o `cardId` devolvido grava a capa em `SGC_PEDIDO`.
4. A tela navega para `/quadro?card=<id>`.

O passo 2 **não** pode virar uma JS do SGC que chame `kbCardCriar` por dentro:
chamada aninhada não propaga `:VAR_USER` com garantia, e o card nasceria sem
criador (D-007).

**Mover um pedido** — a mesma regra, três vezes, de propósito:

1. `podeMover` (tela, síncrono): `motivoDeDestino(...)` desabilita o destino
   com o motivo, antes de qualquer clique.
2. `antesDeMover` (tela, assíncrono, no clique): para `analise → tecnica`
   chama `sgcAnaliseSaidaVerificar` (003) e devolve a mensagem detalhada; para
   `analise → tecnica` também chama `sgcEscPedidoReenviar` quando a verificação
   passa (AT-04, D-009).
3. `sgcPodeMover` (servidor, o gancho): o motor pergunta antes de gravar.
   Quem chamar `kbCardMover` por fora da tela bate aqui (RF-011).

**Decidir** (aprovar, reprovar, cancelar): diálogo → escrita SQL guardada →
`kbNotaRegistrar` → `ctx.mover(fase)`. A escrita vem **antes** do movimento
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
    → `admin`, `analista`, `gestor`, `diretoria`, `leitura`. O `leo` também é o
    caso de `READ_ONLY`; um sexto usuário sem linha de persona cobre C-010.
  - `KB_CAMPO`: os 6 campos do quadro, com as opções de `prioridade` e a capa
    por fase (`KB_FASE.CAPA_JSON` com `alertas_pendentes` na `analise` e
    `motivo_cancelamento` no `cancelado`).
  - `KB_AUTOMACAO`: as 11 automações de e-mail.
  - `KB_META`: `gancho:podeMover` → `7206` e `gancho:podeExcluir` → `7207` (os
    ids locais do mapa do frontend; no sandbox, `instalar({ ganchos })` grava
    os reais).
  - 6 pedidos (`KB_CARD` + `SGC_PEDIDO`), um por situação: P1 em `analise`
    (criado pela ana), P2 em `tecnica`, P3 em `diretoria`, P4 em `envio` sem
    envio registrado, P5 em `enviado` com envio registrado e 1 linha em
    `SGC_COMUNICACAO`, P6 em `cancelado` com motivo. P4 tem 2 responsáveis
    (ana e gil) para o e-mail e as notificações.
- **`CHECK_INPUT`** (o `sim:check` executa cada SQL com este objeto): acrescentar
  `usuarioId: '1'`, `cardId: '1'`, `boardId: '1'`, `faseId: '2'`,
  `usuarioAlvo: '2'`, `persona: 'gestor'`, `agora: '2026-09-15T12:00:00'`,
  `motivo: 'teste'`, `produtos: ''`, `codfornec: '1'`, `fornecedor: 'X'`,
  `codfilial: '1'`, `filial: 'Y'`, `periodoInicio: '2026-08-01'`,
  `periodoFim: '2026-09-15'`, `prioridade: 'normal'`, `canal: 'email'`,
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
| C-001 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardCriar` + `sgcEscPedidoCriar` como ana: 1 card na fase `analise`, `TITULO = '1 — MATRIZ · NUTRILATINA'`, `CRIADO_POR = 2`, 1 linha em `SGC_PEDIDO` |
| C-002 | `frontend/tests/pedido.test.mjs` | `validarNovoPedido({codfilial: ''})` → `ok: false` e `erros.filial` contém "filial" |
| C-003 | `frontend/tests/pedido.test.mjs` | `periodoPadrao(new Date('2026-09-15'))` → `{ inicio: '2026-08-01', fim: '2026-09-15' }` |
| C-004 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P1, tecnica)` como ana: `ok: true`, card na fase 2, 1 linha em `KB_MOVIMENTO` |
| C-005 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover(ana, P1, diretoria)` → `PODE = 0` e `MOTIVO` igual ao texto de F-04; `kbCardMover` devolve o mesmo motivo e o card não sai da fase 1 |
| C-006 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P2, diretoria)` como dora → recusa citando "Aprovação da Diretoria"; `kbCardMover(P3, envio)` como dora → ok |
| C-007 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover` como gil nas fases 5→6 e 6→7: ok nas duas |
| C-008 | `frontend/tests/transicoes.test.mjs` + smoke | leitura: `motivoDeDestino` devolve texto em 10×10 destinos; `sgcPodeMover(leo, …)` → `PODE = 0` |
| C-009 | `backend/simulator/smoke/002-quadro.mjs` | com `ACCESS_LEVEL = 'RESTRICTED'`: card de outro → `PODE = 0`; card próprio → `PODE = 1` |
| C-010 | `backend/simulator/smoke/002-quadro.mjs` | usuário 6 (sem linha de persona, `MEMBER`): `sgcPersonaAtual` devolve `analista` e `kbCardMover(P1, tecnica)` passa |
| C-011 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover` chamada direta (sem tela) devolve `PODE = 0` e o motivo de C-006; `KB_META` tem os dois ganchos gravados |
| C-012 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardMover(P5, transito)` como gil sem nenhum dado de NF: ok |
| C-013 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoTecnicaAprovar` como gil: `TEC_POR = 3`, `TEC_EM` preenchido, `TEC_MOTIVO = ''`; 1 `KB_LOG` de nota com "Aprovado tecnicamente" |
| C-014 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoTecnicaReprovar` com `motivo: ''` → 0 linhas afetadas, `TEC_MOTIVO` continua vazio; `kbCardMover(P2, analise)` recusado |
| C-015 | `backend/simulator/smoke/002-quadro.mjs` | reprovar com motivo e `produtos: '1024,2088'` → colunas gravadas; `kbCardMover(P2, analise)` passa |
| C-016 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPedidoReenviar` zera `TEC_MOTIVO`, `TEC_PRODUTOS_REPROVADOS` e `DIR_MOTIVO` |
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
| C-036 | `frontend/tests/pedido.test.mjs` | `lib/quadro.ts` exporta `ROTULO_NOVO_PEDIDO === 'Novo pedido'` e `ROTA_NOVO_PEDIDO === '/pedidos/novo'` |
| C-037 | `frontend/tests/pedido.test.mjs` | `lib/quadro.ts` exporta `ATUALIZAR_A_CADA_MS === 60000` |
| C-038 | `frontend/tests/permissoes.test.mjs` | `permissoesDe('admin', …).administrarQuadro` = true; as outras 4 personas = false |
| C-039 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeExcluir` com ana → 0 e motivo citando "Cancelar compra"; com gil e dora → 1; `kbCardExcluir` como ana recusado |
| C-040 | `frontend/tests/permissoes.test.mjs` | `permissoesDe('analista', 'MEMBER').aprovarTecnica` = false (a tela desabilita, não esconde — verificação manual fecha o visual) |
| C-041 | `backend/simulator/smoke/002-quadro.mjs` | `sgcNotificacoesListar` como ana devolve 3 linhas (`responsavel`, `movimento`, `mensagem`) em ordem decrescente e `sgcNotificacoesListarTotal` = 3 |
| C-042 | `backend/simulator/smoke/002-quadro.mjs` | `sgcEscPersonaSalvar` como admin muda a persona do gil; como ana, 0 linhas |
| C-043 | `backend/simulator/smoke/002-quadro.mjs` | depois das 4 decisões, `KB_LOG` do card tem 4 eventos `nota` com autor e instante |
| RN-001 | `frontend/tests/permissoes.test.mjs` | `personaDe(null)` → analista; `{ACCESS_LEVEL:'ADMIN'}` → admin; `{ACCESS_LEVEL:'RESTRICTED'}` → leitura |
| RN-002 | `frontend/tests/permissoes.test.mjs` | `READ_ONLY` zera as 10 permissões de operação; `RESTRICTED` liga `somenteProprios` |
| RN-003 | `frontend/tests/transicoes.test.mjs` | a soma dos destinos de `TRANSICOES` é 22 pares: 14 do fluxo e 8 para `cancelado` |
| RN-004 | `frontend/tests/transicoes.test.mjs` + smoke | `motivoDeDestino(…, 'analise', 'diretoria')` = texto de F-04, igual ao `MOTIVO` da SQL |
| RN-005 | `frontend/tests/transicoes.test.mjs` | 5 personas × 10 fases: diretoria só livre na fase 3; leitura, nenhuma |
| RN-006 | `backend/simulator/smoke/002-quadro.mjs` | destino `cancelado` sem `CANC_MOTIVO` → `PODE = 0` |
| RN-007 | `backend/simulator/smoke/002-quadro.mjs` | cancelar P1 com pendências: ok |
| RN-008 | `frontend/tests/transicoes.test.mjs` | fases 9 e 10 sem destino para qualquer persona |
| RN-009 | `backend/simulator/smoke/002-quadro.mjs` | reprovação sem motivo recusada na escrita e no gancho |
| RN-010 | `backend/simulator/smoke/002-quadro.mjs` | depois de `sgcEscPedidoReenviar`, os 3 campos vazios |
| RN-011 | `backend/simulator/smoke/002-quadro.mjs` | entrar na fase 3 vindo da 2 e da 4: ok; da 1: recusado |
| RN-012 | `frontend/tests/pedido.test.mjs` | `validarEnvio` recusa contato fora de `contatos` e exige data e número |
| RN-013 | `backend/simulator/smoke/002-quadro.mjs` | `envio → enviado` com e sem `DT_ENVIO` |
| RN-014 | `frontend/tests/pedido.test.mjs` | `tituloDoPedido('1 — Matriz', 'Nutrilatina')` = `'1 — MATRIZ · NUTRILATINA'` |
| RN-015 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeExcluir` para as 5 personas: 1,0,1,1,0 |
| RN-016 | `frontend/tests/permissoes.test.mjs` | `administrarQuadro` só para admin |
| RN-017 | `backend/simulator/smoke/002-quadro.mjs` | `SELECT COUNT(*) FROM KB_CAMPO WHERE OBRIGATORIO = TRUE` = 0 no quadro `compras` |
| RN-018 | `backend/simulator/smoke/002-quadro.mjs` | `kbCardAtualizar` aceita `alta` e recusa `altíssima`; o pedido nasce `normal` |
| RN-019 | `backend/simulator/smoke/002-quadro.mjs` | as 7 ações geram 7 registros (`nota` e `movimento`) |
| RN-020 | `backend/simulator/smoke/002-quadro.mjs` | nas fases 5 a 8 a única recusa possível é de persona (leitura) |
| RNF-001 | `backend/simulator/smoke/002-quadro.mjs` | contador de execuções ao abrir o pedido = 2 |
| RNF-002 | `frontend/tests/pedido.test.mjs` | `ATUALIZAR_A_CADA_MS === 60000` (a pausa com a aba escondida é da lib; verificação manual fecha o visual) |
| RNF-003 | `backend/simulator/smoke/002-quadro.mjs` | `sgcNotificacoesListar` com `limite: 25` e 60 registros devolve 25 linhas e `…Total` = 60 |
| RNF-004 | `backend/simulator/smoke/002-quadro.mjs` | `sgcPodeMover` devolve exatamente 1 linha |
| RNF-005 | `backend/simulator/smoke/002-quadro.mjs` | 5 personas × 10 fases × 10 destinos: `motivoDeDestino` e `sgcPodeMover` concordam em 500 combinações |

- **Backend:** `backend/simulator/smoke/002-quadro.mjs` executa as SFs reais
  (SQL e JAVASCRIPT) num banco descartável, com o gancho registrado em
  `KB_META` e resolvido pelo `byId` do runner. Título de cada `teste()` começa
  pelo id do cenário/regra.
- **Frontend:** `node --test` sobre `permissoes.ts`, `transicoes.ts` e
  `pedido.ts`. Nenhuma tela é testada aqui.
- **Seed extra para o smoke:** o 6º usuário sem persona (C-010), 2 alertas não
  lidos no P1 (C-025, RN-007) e 2 anexos no P5 (C-033). Tudo dentro do
  `seed/002-quadro.mjs`, atrás de um parâmetro `{ completo: true }` para o
  simulador de tela não nascer com lixo.

## Dependências entre specs

**Consome da 001 (fornecedores):**

- `sgcWintFornecedores` e `sgcWintFiliais` (ou `sgcFornecedorListar`) para os
  dois seletores de `/pedidos/novo`. A 002 só precisa de `CODFORNEC`, nome,
  `CODFILIAL` e nome da filial.
- `sgcFornecedorCarregar` para o diálogo de envio: **os contatos de envio da
  linha de produto** (nome + e-mail) e o **link da plataforma** (EN-01, EN-02 A).
  Enquanto a 001 não entregar, o diálogo mostra a lista vazia e o aviso "o
  fornecedor não tem contato de envio cadastrado" — o pedido não sai por
  e-mail, e é assim mesmo que deve ser.

**Fornece à 003 (itens e análise):**

- `sgcPedidoCarregar`: a 002 devolve `{ ok, pedido, itens: [], alertas: [] }`; a
  003 preenche as duas listas **dentro da mesma SF** (RNF-001: abrir card = 2
  execuções).
- O bloco `PENDENCIAS` de `sgcPodeMover`: subconsulta única, marcada no código,
  que a 003 substitui pela contagem completa (AL-04, AL-05, AL-06, PZ-03).
  A 003 publica também `sgcAnaliseSaidaVerificar` (SQL, `cardId`, devolve
  `PODE`/`MOTIVO` com a mensagem detalhada), que a 002 chama no `antesDeMover`
  do destino `tecnica`.
- As colunas `VL_TOTAL`, `PRAZO_PADRAO`, `PRAZO_ACORDADO` e
  `PRAZO_JUSTIFICATIVA` de `SGC_PEDIDO`, e o campo do quadro
  `alertas_pendentes`: criados aqui, escritos lá.
- A lista de produtos do diálogo "Reprovar" (técnica) sai dos itens da 003; a
  002 grava só os códigos em `TEC_PRODUTOS_REPROVADOS`.

**Fornece à 004 (agenda):**

- O formato de `SGC_PEDIDO` com `ORIGEM = 'agenda'` e `ID_AGENDA`, e o contrato
  de criação: `kbCardCriar` com `origem: 'sistema'` e `criadoPor` (spec 013 da
  lib), seguido da gravação da capa. Como o cron **não tem sessão**,
  `sgcEscPedidoCriar` (guardada por `:VAR_USER`) não serve: a 004 publica a sua
  própria escrita equivalente, recebendo `criadoPor` como parâmetro, e preenche
  as mesmas colunas.
- **A 004 precisa expor** uma escrita `sgcEscAgendaRegistrarEnvio` (`cardId` ou
  `agendaId`, `dtEnvioReal`) que guarde a data planejada original e passe a
  mostrar a real (EN-05 A). `sgcEnvioIndustriaRegistrar` a chama por id quando
  `ID_AGENDA > 0`; o passo é opcional e não derruba o envio se o id ainda não
  existir no mapa.

**Do integrador (arquivos compartilhados):**

- `backend/setup-backend.mjs`: as quatro tabelas desta spec.
- `backend/add-001-kanban.mjs`: `ganchos: { podeMover: 'sgcPodeMover', podeExcluir: 'sgcPodeExcluir' }`.
- `backend/simulator/config.mjs`: `add-005` no `PUBLISH_ORDER` e o `CHECK_INPUT`.
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
| D-002 | A ordem do `CASE` da SQL é a mesma ordem do `if` da regra pura | cada lado na ordem que ficar melhor | duas respostas diferentes para o mesmo caso ("é leitura" × "transição não existe") confundem mais do que barram |
| D-003 | O gancho recusa `→ cancelado` enquanto o motivo não estiver gravado | confiar no diálogo da tela | é isso que faz "não existe cancelamento silencioso" (CA-02) valer fora da tela, sem o motor precisar conhecer formulário nenhum |
| D-004 | Os campos do quadro são espelho de mão única (pedido → quadro) | gravar nos dois sentidos | dois donos do mesmo dado divergem; a regra lê sempre o pedido, e o campo do quadro só existe para a capa e a busca não custarem SF por cartão (DS-01 A) |
| D-005 | O quadro tem 6 campos: os 4 do `000` mais `alertas_pendentes` e `motivo_cancelamento` | só os 4 | C-06 pede os alertas na capa da Análise e CA-04 pede o motivo na capa de Canceladas; sem campo, cada cartão custaria uma consulta |
| D-006 | Uma automação de e-mail por fase (11 no total) | uma só, sem `faseId` | EM-01 A pede "por fase" justamente para o administrador ajustar o texto de uma etapa sem tocar em código; o custo é 11 linhas no instalador |
| D-007 | `/pedidos/novo` chama `kbCardCriar` e depois a escrita da capa, da tela | uma JS do SGC que chame `kbCardCriar` por dentro | chamada aninhada não propaga `:VAR_USER` com garantia: o card nasceria sem criador e sem responsável |
| D-008 | `sgcEnvioIndustriaRegistrar` confere persona e fase **no próprio JS**, e as duas escritas que ele chama recebem `enviadoPor` como parâmetro | `:VAR_USER` nas escritas do envio | a chamada é aninhada (mesma razão de D-076 da lib). A conferência acontece uma vez, antes do e-mail — que é a parte irreversível |
| D-009 | `sgcEscPedidoReenviar` é chamada no `antesDeMover` do destino `tecnica` | uma ação extra "Enviar para aprovação técnica" | a ação extra obrigaria a desabilitar o "Mover para" normal e inventaria um segundo caminho para o que já é uma transição. Risco assumido: se o motor recusar o movimento depois, as reprovações antigas já terão sido apagadas — texto informativo, não decisão |
| D-010 | `SGC_PEDIDO.PRIORIDADE` guarda o valor inicial; o valor vivo é o campo do quadro | manter os dois sincronizados | prioridade é o único dos campos que a **pessoa** edita direto no card (C-07 B); sincronizar de volta custaria uma escrita por edição de campo, e o motor não avisa o consumidor quando um campo muda |
| D-011 | Cancelar segue a mesma regra de movimento: quem não move aquele card não o cancela (a diretoria cancela na fase dela) | diretoria cancela de qualquer fase | CA-01 libera a fase de origem, P-07 limita a persona; juntas, cancelar é um movimento como os outros, e o gancho não precisa de exceção |
| D-012 | Nenhum campo do quadro é obrigatório | marcar os campos da fase como obrigatórios | o motor cobra obrigatório em qualquer direção e barraria cancelar e voltar (F-05 A) |
| D-013 | A persona é lida uma vez por sessão (`sgcPersonaAtual`) e guardada em memória | consultar a cada tela | teto de 300 execuções/min; a persona muda raramente e a mudança vale na sessão seguinte (C-042) |
| D-014 | A tela de segurança lista **todos** os usuários ativos da plataforma, com a persona vazia quando não há linha | cadastrar usuário no SGC | P-13: usuários vêm do cadastro da plataforma, sem cadastro próprio |
| D-015 | As notificações saem de uma SQL sobre `KB_LOG`, `KB_MOVIMENTO` e `KB_MENSAGEM`, restritas aos cards em que a pessoa é responsável | uma tabela de notificações própria | é o feed de UI-07 B sem nenhuma tabela, escrita ou gatilho novo; o custo é uma consulta com `UNION ALL` paginada |
| D-016 | O corpo do e-mail do pedido é montado na tela e chega pronto ao JS | montar no servidor | a lista de itens é da 003 e já está carregada na tela; montá-la de novo no servidor seria a segunda implementação da mesma tabela |
| D-017 | A persona `leitura` ocupa o lugar que o SGC antigo dava a `comercial` | trazer `comercial` na onda 1 | o `000` fecha a onda 1 com cinco personas e `comercial` só faz sentido com as solicitações do comercial (onda 3) |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O card nasce e a gravação da capa falha (rede, sessão) | pedido sem fornecedor/filial no quadro | a tela avisa e oferece repetir a gravação; o smoke cobre o caminho feliz e o `sgcPedidoCarregar` devolve `pedido: null` sem quebrar a tela |
| A tela e a SQL divergirem depois de uma mudança de regra | botão habilitado que o servidor recusa | o teste de 500 combinações (RNF-005) roda no `npm test` dos dois lados e quebra na primeira divergência |
| `:VAR_USER` não propagar dentro do JAVASCRIPT do envio | envio recusado para todo mundo | o JS resolve o usuário numa consulta só, no primeiro passo, e devolve `{ ok: false, error: 'Sessão inválida.' }` — falha fechada e visível, nunca envio em nome errado; o smoke prova com os 5 usuários |
| A 003 mexer no bloco `PENDENCIAS` e quebrar as outras transições | pedido travado na Análise | o bloco é uma subconsulta isolada, com o comentário do contrato; os testes C-004, C-005 e C-025 da 002 continuam valendo depois da troca |
| Mudança de nome de fase pelo administrador | regra procurando nome | nenhuma regra usa nome: tudo passa por `SGC_FASE.CHAVE` (RF-005), e o smoke renomeia uma fase antes de repetir C-004 |

## Complexity Tracking

Vazio: nenhuma violação de princípio. A duplicação da matriz de permissões
(tela + SQL) é exigência da regra P-12 e do contrato de ganchos da lib, não
abstração nova — e está coberta por teste que prova a equivalência.
