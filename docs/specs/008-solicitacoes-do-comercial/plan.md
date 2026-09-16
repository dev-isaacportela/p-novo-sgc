# Plan: Solicitações do comercial — registro, avaliação, vínculo ao pedido e rastreio

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; 23 cenários e 18 regras, todos vindos de O3-01, O3-02 e de R-050..R-056, R-062, R-063 |
| Backend escrito local, executado no sandbox | sim | arquivo novo `backend/add-011-solicitacoes.mjs` (R-051). As 2 tabelas novas e a coluna nova de `SGC_PEDIDO_ITEM` entram no `setup-backend.mjs` pela **base da onda 3 (S2)**, **no `CREATE`** (nada foi publicado ainda — R-051/onda 3), antes do fan-out. Nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL vive no `CREATE TABLE` do `setup-backend.mjs` e a migration é gerada pelo sandbox |
| Leitura e escrita por Server Function | sim | tela e bloco usam `linhas()`/`acao()` de `src/lib/mitra-api.ts`; zero `listRecords`/`patchRecord`. Escrita de pessoa é SF SQL guardada por `:VAR_USER` chamada direto da tela; escrita chamada de dentro de um JS recebe `{{usuarioId}}` e leva a **mesma** guarda (R-013, achado A1 da onda 1) mais a checagem de fase e dono (`pedidoEmAnalise`, A2) |
| Simulador cobre a feature | sim | `simulator/seed/008-solicitacoes.mjs` só insere linhas (5 produtos e 5 clientes próprios, vendas com `NUMTRANSITEM ≥ 950001`, 3 cards e 13 solicitações); `PC*` são do integrador (R-017/R-062); `sim:check` roda as 5 SQL de leitura |
| Testes automatizados obrigatórios | sim | 23 cenários e 18 regras mapeados em `backend/simulator/smoke/008-solicitacoes.mjs` e em `frontend/tests/solicitacoes.test.mjs` |
| Design tokens, sem cor literal | sim | tela, diálogos e bloco montados com o vocabulário de `components/page.tsx` (`PageHeader`, `Panel`, `Toolbar`, `FilterChip`, `SearchInput`, `SelectMenu`, `Table`, `Status`, `Code`, `Dash`, `Badge`, `Pagination`, `EmptyState`, `Alert`, `Dialog`, `LabelledField`) e `DatePicker` onde houver data; zero hex, zero `style={{}}`, zero classe Tailwind solta |
| Simplicidade | sim | nenhuma dependência nova; a regra de classificação do rastreio é um módulo puro de ~130 linhas com um consumidor real (o painel); nenhuma abstração com uma implementação só; a situação de atendimento é **uma expressão SQL**, não uma tabela de estado |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`; leitura do WinThor por JDBC Oracle (`jdbcId` resolvido por nome no `isEntrypoint()`, `jdbcIdWinthor` de `add-003-jdbc-winthor.mjs`)
- **Reuso identificado:**
  - `@benenutri/mitra-kanban` (**1.5.0**): `conteudoDaFase` + `ExtensaoContexto` (`ctx.card`, `ctx.recarregar`, `ctx.avisar`, `ctx.travado`) e `kbNotaRegistrar`. **Nenhuma aba nova** (R-050/R-054): o bloco entra em `BLOCOS_POR_FASE.analise`.
  - Spec 002: `PERSONA_EFETIVA`/`guardaPersonaDe` (R-013, copiados literalmente), `SGC_FASE` (chave estável), `SGC_PEDIDO` (fornecedor e filial do pedido), `sgcPedidoCarregar` (ganha duas colunas de origem do item).
  - Spec 003: `SGC_PEDIDO_ITEM` e o upsert `sgcEscItemGravar` (que **preserva** `ID_SOLICITACAO`, porque não a lista no `ON DUPLICATE KEY UPDATE`), `sgcWintBuscarProduto` (a busca de produto é a mesma — R-052), o preâmbulo JS de `add-006-itens.mjs` (`chamar`, `lote`, `texto`, `inteiro`, `numero`, `persona`, `pedidoEmAnalise`, `FORA_DA_ANALISE`), `sgcEscItemRemover` e `sgcAnaliseSair` (os dois pontos onde o desvínculo entra), `PedidoProvider`/`usePedido()` (`podeEditar`, `somenteProprios`).
  - Spec 001: `sgcWintFornecedores` (resolve o nome do fornecedor do produto) e `sgcWintFiliais` (seletor de filial) — os mesmos que a `NovoPedidoPage` da 002 usa.
  - Spec 005/007: `frontend/src/lib/csv.ts` (`textoCsv`, `baixarCsv`, R-037) para a exportação do rastreio; `add-008`/`add-010` como modelo do `desembrulhar`/`chamar` com `executionStatus === 'FAILED'` (D-15).
  - `components/page.tsx`, `components/DatePicker.tsx`, `lib/formato.ts` (`fmtData`, `fmtDataHora`, `moeda`), `lib/permissoes.ts`.
- **Dependência nova:** nenhuma

## Modelo de dados

Duas tabelas novas e uma coluna nova em `SGC_PEDIDO_ITEM`, todas no `setup-backend.mjs`,
criadas pela **base da onda 3 (S2)** antes do fan-out, **no `CREATE`** e sem `ALTER`
(nada foi publicado — abertura do contrato da onda 3). Convenções do 000: colunas em
UPPERCASE, datas em `VARCHAR(10)`, carimbos em `VARCHAR(19)`, sem `FOREIGN KEY`, `ID`
autoincremento, `CODFORNEC INT`, `CODFILIAL VARCHAR(10)`, `FORNECEDOR`/`FILIAL VARCHAR(200)`.

### `SGC_SOLICITACAO`

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `CODPROD` | `INT NOT NULL` | do WinThor, pela busca da 003 |
| `DESCRICAO` | `VARCHAR(200)` | foto do cadastro no registro (RN-004) |
| `EMBALAGEM` | `VARCHAR(60)` | mesmo tipo de `SGC_PEDIDO_ITEM.EMBALAGEM` |
| `UNIDADE` | `VARCHAR(10)` | idem |
| `CODFORNEC` | `INT` | **do produto**, nunca escolhido (RN-004) |
| `FORNECEDOR` | `VARCHAR(200)` | |
| `CODFILIAL` | `VARCHAR(10)` | escolhida pelo vendedor |
| `FILIAL` | `VARCHAR(200)` | |
| `QUANTIDADE` | `DECIMAL(15,3)` | `> 0` (RN-001) |
| `JUSTIFICATIVA` | `VARCHAR(1000)` | ≥ 10 caracteres (RN-001) |
| `CODCLI` | `INT DEFAULT 0` | **0 = sem cliente informado**, nunca "não comprou" (R-052, RN-003) |
| `CLIENTE` | `VARCHAR(200)` | |
| `CNPJ_CLIENTE` | `VARCHAR(20)` | só dígitos, como o vendedor buscou |
| `PRIORIDADE` | `VARCHAR(10) DEFAULT 'normal'` | `normal` \| `alta` \| `urgente` (RN-017) |
| `STATUS` | `VARCHAR(10) DEFAULT 'pendente'` | `pendente` \| `aprovada` \| `recusada` \| `cancelada` — **os únicos gravados** (R-052) |
| `MOTIVO` | `VARCHAR(500)` | motivo da recusa |
| `ID_CARD` | `INT DEFAULT 0` | 0 = sem pedido |
| `ID_ITEM` | `INT DEFAULT 0` | 0 = sem item |
| `AVALIADO_POR` | `INT DEFAULT 0` | |
| `AVALIADO_EM` | `VARCHAR(19)` | **é a data de referência do rastreio** (RN-015) |
| `CRIADO_POR` | `INT` | o vendedor (RN-002) |
| `CRIADO_EM` | `VARCHAR(19)` | |
| `ATUALIZADO_EM` | `VARCHAR(19)` | |

Índices do 000: `IX_SGC_SOLICITACAO_STATUS (STATUS)`,
`IX_SGC_SOLICITACAO_FORNEC (CODFORNEC, CODFILIAL)`, `IX_SGC_SOLICITACAO_CARD (ID_CARD)`,
`IX_SGC_SOLICITACAO_AUTOR (CRIADO_POR)` — os quatro recortes que as consultas fazem
(fila, bloco da montagem, situação derivada, "minhas"). **Nenhuma coluna de situação de
atendimento**: ela é derivada a cada consulta (R-052, D-002).

### `SGC_SOLICITACAO_HISTORICO` (N:1 `SGC_SOLICITACAO`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `ID_SOLICITACAO` | `INT NOT NULL` | |
| `EVENTO` | `VARCHAR(20)` | `criada` \| `aprovada` \| `recusada` \| `vinculada` \| `desvinculada` \| `cancelada` |
| `DETALHE` | `VARCHAR(500)` | motivo da recusa, título do pedido no vínculo |
| `POR` | `INT` | |
| `EM` | `VARCHAR(19)` | |

Índice `IX_SGC_SOLICITACAO_HIST (ID_SOLICITACAO, ID)`. Append-only. A linha **`criada` não
é gravada**: ela é derivada de `CRIADO_POR`/`CRIADO_EM` na leitura (D-003) — a linha da
solicitação já é o registro da criação, e gravar de novo custaria uma releitura só para
descobrir o id recém-criado.

### Coluna nova em `SGC_PEDIDO_ITEM` (R-052, no `CREATE`)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID_SOLICITACAO` | `INT DEFAULT 0` | origem do item; 0 = item montado pela análise |

O upsert `sgcEscItemGravar` (003) **não lista** `ID_SOLICITACAO` no `ON DUPLICATE KEY
UPDATE`, então regravar os itens pela aba preserva a origem. Nada muda no `add-006`.

### Só leitura, de outras specs

`SGC_PEDIDO` (002): `ID_CARD`, `CODFORNEC`, `CODFILIAL`. `SGC_FASE` (002): a `CHAVE` das 10
fases. `KB_CARD` (lib): `TITULO`, `FASE_ID`, `EXCLUIDO_EM`, `CRIADO_POR`.
`SGC_USUARIO_PERSONA` + `INT_USER` (002): a guarda de persona e os nomes.
`SGC_PEDIDO_ITEM` (003): `CODPROD`, `QT_PEDIDA`, `STATUS` (inclusive o valor `bo` da 007,
que é o que faz a situação virar `nao_atendida`).

## Contratos de backend

Tudo em `backend/add-011-solicitacoes.mjs`, que exporta `definitions` (R-051). Ids locais:
**7801–7807** (leituras e JS), **7850–7857** (escritas). Filtro desligado é `''` no texto e
`0` no número; toda listagem tem `LIMIT/OFFSET`; `INSERT … SELECT … WHERE` leva `FROM DUAL`
(achado A6 da onda 1; o `sim:check` acusa).

### A guarda de persona (R-013, copiada literal da 002)

```sql
EXISTS (
  SELECT 1 FROM INT_USER IU
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
  WHERE IU.ID = <:VAR_USER | {{usuarioId}}>
    AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
    AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                               WHEN 'ADMIN' THEN 'admin'
                               WHEN 'RESTRICTED' THEN 'comercial'
                               ELSE 'analista' END) IN (<personas>)
)
```

Três listas: `REGISTRAR = ('admin', 'comercial')` (registrar e cancelar a própria, RN-018),
`AVALIAR = ('admin', 'analista', 'gestor')` (avaliar, vincular, desvincular) e
`HISTORICO = ('admin', 'analista', 'gestor', 'comercial')` (quem pode qualquer uma das
ações acima também pode deixar a linha do histórico dela).

As escritas **internas** (7853, 7856, 7857) levam a **mesma** guarda sobre `{{usuarioId}}`:
o perfil business libera todas as SFs, e "só o JS confere" não protege quem chama a escrita
por fora da tela (achado A1 da onda 1).

### A expressão da situação de atendimento (R-052)

Constante do módulo (`SITUACAO`), usada literalmente em três lugares — a coluna de
`sgcSolicitacoesListar`, o filtro `{{situacao}}` dela e o `sgcSolicitacoesListarTotal` —,
nunca copiada à mão:

```sql
CASE
  WHEN S.ID_CARD = 0 OR C.ID IS NULL       THEN 'sem_pedido'
  WHEN F.CHAVE = 'cancelado'               THEN 'nao_atendida'
  WHEN COALESCE(I.STATUS, '') = 'bo'       THEN 'nao_atendida'
  WHEN F.CHAVE = 'concluido'               THEN 'atendida'
  WHEN F.CHAVE = 'analise'                 THEN 'em_analise'
  WHEN F.CHAVE IN ('tecnica', 'diretoria') THEN 'em_aprovacao'
  WHEN F.CHAVE = 'envio'                   THEN 'em_envio'
  WHEN F.CHAVE = 'enviado'                 THEN 'enviada'
  WHEN F.CHAVE = 'transito'                THEN 'em_transito'
  WHEN F.CHAVE IN ('faturamento', 'bo')    THEN 'em_faturamento'
  ELSE 'sem_pedido'
END
```

`C` é `KB_CARD` (com `EXCLUIDO_EM IS NULL`), `F` é `SGC_FASE` pelo `(BOARD_ID, FASE_ID)` do
card e `I` é o item do pedido pelo par `(ID_CARD, CODPROD)` com `STATUS <> 'removido'`.
Card excluído cai em `sem_pedido` — a solicitação volta a ser demanda em aberto, e não
herda a fase de um card que não existe mais.

### Leituras — WinThor (Oracle, `jdbcId` resolvido por nome)

| Nome | Id | Entrada (`{{param}}`, desligado) | Saída | Atende |
|---|---|---|---|---|
| `sgcWintClienteBuscar` | 7801 | `codcli` (`0`), `busca` (`''`) | `CODCLI, CLIENTE, CNPJ, CODATV1` | RF-003, C-018 |
| `sgcWintRastreioSolicitacoes` | 7802 | `pares` (`''`) | 17 colunas (abaixo) | RF-014, RF-015, RN-013..RN-016 |

```sql
-- sgcWintClienteBuscar (7801) — busca por código, nome ou CNPJ, no máximo 20
SELECT * FROM (
  SELECT C.CODCLI, C.CLIENTE,
         NVL(C.CGCENT, ' ') AS CNPJ,
         NVL(C.CODATV1, 0)  AS CODATV1
  FROM PCCLIENT C
  WHERE ( C.CODCLI = {{codcli}}
       OR ( {{codcli}} = 0
            AND ( UPPER(C.CLIENTE) LIKE '%' || UPPER('{{busca}}') || '%'
               OR REPLACE(REPLACE(REPLACE(NVL(C.CGCENT, ' '), '.', ''), '/', ''), '-', '')
                  LIKE '%{{busca}}%' ) ) )
  ORDER BY C.CLIENTE
) WHERE ROWNUM <= 20
```

A tela manda `codcli` quando o texto digitado é só dígitos com até 7 posições, e `busca`
sempre — **sem pontuação** quando o texto parece CNPJ (a normalização é da regra pura
`buscaDeCliente`, testada). `CODATV1` vem junto só para a tela poder marcar cliente de
órgão público na lista de resultados (AN-03); nada nesta spec depende dele.

```sql
-- sgcWintRastreioSolicitacoes (7802) — UMA execução por lote de 120 pares (R-055)
WITH PARES AS (
  SELECT
    TO_NUMBER(REGEXP_SUBSTR(ITEM, '[^:]+', 1, 1)) AS CODPROD,
    REGEXP_SUBSTR(ITEM, '[^:]+', 1, 2)            AS CODFILIAL,
    TO_DATE(REGEXP_SUBSTR(ITEM, '[^:]+', 1, 3), 'YYYY-MM-DD') AS DT_REF,
    TO_NUMBER(REGEXP_SUBSTR(ITEM, '[^:]+', 1, 4)) AS CODCLI
  FROM (
    SELECT REGEXP_SUBSTR('{{pares}}', '[^,]+', 1, LEVEL) AS ITEM
    FROM DUAL
    CONNECT BY REGEXP_SUBSTR('{{pares}}', '[^,]+', 1, LEVEL) IS NOT NULL
  )
)
SELECT
  P.CODPROD, P.CODFILIAL,
  TO_CHAR(P.DT_REF, 'YYYY-MM-DD') AS DT_REFERENCIA,
  P.CODCLI,
  NVL(MAX(E.QTEST), 0)                          AS QT_ESTOQUE,
  TO_CHAR(MAX(E.DTULTENT),   'YYYY-MM-DD')      AS DT_ULT_ENTRADA,
  TO_CHAR(MAX(E.DTULTSAIDA), 'YYYY-MM-DD')      AS DT_ULT_SAIDA,
  NVL(MAX(E.QTVENDMES), 0) + NVL(MAX(E.QTVENDMES1), 0) + NVL(MAX(E.QTVENDMES2), 0) AS QT_VENDA_90D,
  NVL(SUM(M.QT), 0)                             AS QT_VENDIDA_POS,
  NVL(SUM(M.QT * NVL(M.PUNIT, 0)), 0)           AS VL_VENDIDO_POS,
  COUNT(DISTINCT M.NUMNOTA)                     AS QT_NOTAS_POS,
  TO_CHAR(MAX(M.DTMOV), 'YYYY-MM-DD')           AS DT_VENDA_POS,
  NVL(SUM(CASE WHEN M.CODCLI = P.CODCLI THEN M.QT ELSE 0 END), 0)                     AS QT_VENDIDA_CLIENTE,
  NVL(SUM(CASE WHEN M.CODCLI = P.CODCLI THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END), 0)   AS VL_VENDIDO_CLIENTE,
  COUNT(DISTINCT CASE WHEN M.CODCLI = P.CODCLI THEN M.NUMNOTA END)                    AS QT_NOTAS_CLIENTE,
  TO_CHAR(MAX(CASE WHEN M.CODCLI = P.CODCLI THEN M.DTMOV END), 'YYYY-MM-DD')          AS DT_VENDA_CLIENTE,
  (SELECT NVL(SUM(MG.QT), 0)
     FROM PCMOV MG
    WHERE MG.CODPROD = P.CODPROD
      AND MG.CODCLI  = P.CODCLI
      AND MG.CODOPER = 'S'
      AND MG.QT > 0
      AND MG.DTCANCEL IS NULL
      AND MG.DTMOV >= P.DT_REF) AS QT_VENDIDA_CLIENTE_GERAL
FROM PARES P
LEFT JOIN PCEST E
  ON E.CODPROD = P.CODPROD AND E.CODFILIAL = P.CODFILIAL
LEFT JOIN PCMOV M
  ON M.CODPROD = P.CODPROD AND M.CODFILIAL = P.CODFILIAL
 AND M.CODOPER = 'S' AND M.QT > 0 AND NVL(M.CODCLI, 0) > 0
 AND M.DTCANCEL IS NULL AND M.DTMOV >= P.DT_REF
GROUP BY P.CODPROD, P.CODFILIAL, P.DT_REF, P.CODCLI
```

Porte de `sgc_rastreio_venda_solicitacoes` do p-45547, **sem alteração de forma** (o brief
manda reaproveitá-la) e com duas notas:

- **Uma janela por linha.** Cada solicitação tem o seu cliente e a sua data de aprovação,
  então não há `BETWEEN` global que resolva: é o `CONNECT BY` que explode `{{pares}}` em
  linhas e é ele que faz o rastreio inteiro de uma página custar **uma** execução
  (RNF-003), e não uma por solicitação (teto de 300/min do projeto).
- **`QT_VENDIDA_CLIENTE_GERAL` não filtra filial** de propósito: um cliente atendido por
  outra filial apareceria como "não comprou", que é o falso negativo mais caro deste
  rastreio (RN-013).
- **O giro dos 90 dias vem de `PCEST.QTVENDMES/QTVENDMES1/QTVENDMES2`** (R-055), somados
  na coluna `QT_VENDA_90D`; a regra pura decide como usá-lo (RN-014).

O literal `{{pares}}` não passa de 4000 caracteres — o teto do Oracle para literal de
string. O par mais longo tem ~27 caracteres, e 120 pares dão ~3,2 mil: é de onde sai o
lote de 120 (`PARES_POR_LOTE`), e o teste prova os dois números.

### Leituras — banco interno (SQL)

| Nome | Id | Entrada (desligado) | Saída | Atende |
|---|---|---|---|---|
| `sgcSolicitacoesListar` | 7803 | `status` (`''`), `situacao` (`''`), `codfornec` (`0`), `codfilial` (`''`), `vendedor` (`0`), `minhas` (`0`), `busca` (`''`), `limite` (`20`), `offset` (`0`) | `ID, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, QUANTIDADE, JUSTIFICATIVA, CODCLI, CLIENTE, CNPJ_CLIENTE, PRIORIDADE, STATUS, SITUACAO, MOTIVO, ID_CARD, TITULO_CARD, ID_ITEM, AVALIADO_POR_NOME, AVALIADO_EM, CRIADO_POR, CRIADO_POR_NOME, CRIADO_EM` | RF-012, RF-018, RF-019 |
| `sgcSolicitacoesListarTotal` | 7804 | os mesmos, sem `limite`/`offset` | `TOTAL` | RF-018 |
| `sgcSolicitacoesDaMontagem` | 7805 | `cardId` (`0`) | `ID, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, QUANTIDADE, JUSTIFICATIVA, CODCLI, CLIENTE, PRIORIDADE, STATUS, CRIADO_POR, CRIADO_POR_NOME, CRIADO_EM, QT_NO_PEDIDO` | RF-008, RN-012 |

```sql
-- sgcSolicitacoesListar (7803)
SELECT S.ID, S.CODPROD, S.DESCRICAO, S.EMBALAGEM, S.UNIDADE,
  S.CODFORNEC, S.FORNECEDOR, S.CODFILIAL, S.FILIAL,
  S.QUANTIDADE, COALESCE(S.JUSTIFICATIVA, '') AS JUSTIFICATIVA,
  S.CODCLI, COALESCE(S.CLIENTE, '') AS CLIENTE, COALESCE(S.CNPJ_CLIENTE, '') AS CNPJ_CLIENTE,
  S.PRIORIDADE, S.STATUS, ${SITUACAO} AS SITUACAO, COALESCE(S.MOTIVO, '') AS MOTIVO,
  S.ID_CARD, COALESCE(C.TITULO, '') AS TITULO_CARD, S.ID_ITEM,
  COALESCE(UA.NOME, '') AS AVALIADO_POR_NOME, COALESCE(S.AVALIADO_EM, '') AS AVALIADO_EM,
  S.CRIADO_POR, COALESCE(UC.NOME, '') AS CRIADO_POR_NOME, COALESCE(S.CRIADO_EM, '') AS CRIADO_EM
FROM SGC_SOLICITACAO S
LEFT JOIN KB_CARD C          ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_FASE F         ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
LEFT JOIN SGC_PEDIDO_ITEM I  ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD AND I.STATUS <> 'removido'
LEFT JOIN INT_USER UC        ON UC.ID = S.CRIADO_POR
LEFT JOIN INT_USER UA        ON UA.ID = S.AVALIADO_POR
WHERE ('{{status}}'    = '' OR S.STATUS = '{{status}}')
  AND ('{{situacao}}'  = '' OR '{{situacao}}' = ${SITUACAO})
  AND ({{codfornec}}   = 0  OR S.CODFORNEC = {{codfornec}})
  AND ('{{codfilial}}' = '' OR S.CODFILIAL = '{{codfilial}}')
  AND ({{vendedor}}    = 0  OR S.CRIADO_POR = {{vendedor}})
  AND ({{minhas}}      = 0  OR S.CRIADO_POR = :VAR_USER)
  AND ('{{busca}}'     = '' OR S.DESCRICAO LIKE CONCAT('%', '{{busca}}', '%')
       OR S.CLIENTE    LIKE CONCAT('%', '{{busca}}', '%')
       OR S.FORNECEDOR LIKE CONCAT('%', '{{busca}}', '%'))
  AND ${RECORTE_COMERCIAL}
ORDER BY S.CRIADO_EM DESC, S.ID DESC
LIMIT {{limite}} OFFSET {{offset}}
```

`RECORTE_COMERCIAL` é o único recorte por autoria de uma listagem do projeto (RF-019), e
mora **no servidor** — esconder na tela não é recorte:

```sql
( S.CRIADO_POR = :VAR_USER
  OR EXISTS ( SELECT 1 FROM INT_USER IU
              LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
              WHERE IU.ID = :VAR_USER
                AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                           WHEN 'ADMIN' THEN 'admin'
                                           WHEN 'RESTRICTED' THEN 'comercial'
                                           ELSE 'analista' END) <> 'comercial' ) )
```

`sgcSolicitacoesListarTotal` é o mesmo `FROM`/`WHERE` com `SELECT COUNT(*) AS TOTAL`, sem
`ORDER BY` e sem `LIMIT`.

```sql
-- sgcSolicitacoesDaMontagem (7805) — o bloco da Análise, UMA execução (RNF-001)
SELECT S.ID, S.CODPROD, S.DESCRICAO, S.EMBALAGEM, S.UNIDADE, S.QUANTIDADE,
  COALESCE(S.JUSTIFICATIVA, '') AS JUSTIFICATIVA,
  S.CODCLI, COALESCE(S.CLIENTE, '') AS CLIENTE, S.PRIORIDADE, S.STATUS,
  S.CRIADO_POR, COALESCE(U.NOME, '') AS CRIADO_POR_NOME, COALESCE(S.CRIADO_EM, '') AS CRIADO_EM,
  COALESCE(I.QT_PEDIDA, 0) AS QT_NO_PEDIDO
FROM SGC_PEDIDO P
JOIN SGC_SOLICITACAO S      ON S.CODFORNEC = P.CODFORNEC AND S.CODFILIAL = P.CODFILIAL
LEFT JOIN INT_USER U        ON U.ID = S.CRIADO_POR
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = P.ID_CARD AND I.CODPROD = S.CODPROD AND I.STATUS <> 'removido'
WHERE P.ID_CARD = {{cardId}}
  AND ( S.STATUS = 'pendente' OR (S.STATUS = 'aprovada' AND S.ID_CARD = 0) )
ORDER BY FIELD(S.PRIORIDADE, 'urgente', 'alta', 'normal'), S.CRIADO_EM, S.ID
LIMIT 100
```

`QT_NO_PEDIDO` é o que permite ao bloco avisar "esse produto já está no pedido com 30" e
é a metade de tela de RN-010. O `LIMIT 100` é teto, não paginação: um fornecedor e filial
com mais de 100 solicitações ativas ao mesmo tempo não é caso de operação, e a alternativa
— paginar um bloco de card — custaria uma SF de total e uma segunda execução por abertura
(RNF-001). `FIELD` já tem shim no dialeto do simulador.

O bloco **não filtra por fase**: quem decide que ele só aparece na montagem é
`BLOCOS_POR_FASE.analise` (R-050/R-054), e as escritas conferem a fase no servidor
(`pedidoEmAnalise`). Assim a mesma SF serve ao teste da regra sem depender da tela.

### JavaScript (orquestração)

| Nome | Id | Entrada | Saída | Atende |
|---|---|---|---|---|
| `sgcSolicitacaoCarregar` | 7806 | `id` (`0`) | `{ ok, erro?, solicitacao, historico[] }` | RF-013, C-022 |
| `sgcSolicitacaoIncluirNoPedido` | 7807 | `cardId` (`0`), `id` (`0`) | `{ ok, erro?, idSolicitacao, idItem, quantidade, aprovouAgora }` | RF-009, RF-010, RN-009, RN-010 |

As duas resolvem a persona por `runQueryMitra` com `:VAR_USER` usando **o mesmo mapa** da
guarda SQL (R-013) e chamam as escritas **por id**, passando `usuarioId` explícito:
`:VAR_USER` não se propaga em chamada aninhada. O preâmbulo (`desembrulhar`, `linhasDe`,
`consultar`, `chamar` com a conferência de `executionStatus === 'FAILED'` de D-15,
`inteiro`, `numero`, `texto`, `agora`, `persona`, `pedidoEmAnalise`, `FORA_DA_ANALISE`) é o
do `add-006-itens.mjs`, copiado como o `add-010` copiou o do `add-006`.

**`sgcSolicitacaoCarregar`** — o detalhe em uma execução. Dois `runQueryMitra`: a linha de
`sgcSolicitacoesListar` com `{{id}}` no lugar dos filtros (mesmo texto, mesma constante
`SITUACAO`, mesmo `RECORTE_COMERCIAL` — o comercial não lê a solicitação de outro nem por
id) e o histórico:

```sql
SELECT H.ID, H.EVENTO, COALESCE(H.DETALHE, '') AS DETALHE,
       COALESCE(U.NOME, '') AS POR_NOME, COALESCE(H.EM, '') AS EM
FROM SGC_SOLICITACAO_HISTORICO H
LEFT JOIN INT_USER U ON U.ID = H.POR
WHERE H.ID_SOLICITACAO = <id>
ORDER BY H.EM, H.ID
```

A linha **`criada`** é montada no JS a partir de `CRIADO_POR`/`CRIADO_EM` da própria
solicitação e vai **na frente** da lista (D-003). Consulta de leitura por `runQueryMitra`
não conta como execução de SF — o mesmo desenho de `sgcPedidoCarregar` (002) e
`sgcBoCarregar` (007).

**`sgcSolicitacaoIncluirNoPedido`** — o único caminho que cria o vínculo. Passos:

1. `persona()` — recusa fora de `admin`/`analista`/`gestor` e recusa `READ_ONLY`:
   `'Seu perfil não pode incluir solicitações neste pedido.'`
2. `pedidoEmAnalise(cardId, quem.id)` — o pedido existe, está na fase `analise` e, se o
   acesso for `RESTRICTED`, foi criado por quem chama (A2 da onda 1). Fora disso, a frase
   de `FORA_DA_ANALISE` da 003, reusada literalmente.
3. Uma consulta lê a solicitação e a capa do pedido juntas e recusa, com a frase própria:
   solicitação inexistente; `STATUS` fora de `pendente`/`aprovada`
   (`'A solicitação já foi recusada ou cancelada.'`); `ID_CARD > 0`
   (`'Esta solicitação já está vinculada ao pedido <título>.'` — RN-009/C-013);
   fornecedor ou filial diferentes do pedido
   (`'A solicitação é do fornecedor <X> para a filial <Y> e este pedido é do fornecedor <A> para a filial <B>.'` — RN-012/C-012).
4. Se ainda `pendente`: `sgcEscSolicitacaoHistoricoRegistrar` com `evento: 'aprovada'` e o
   detalhe `'Aprovada ao ser incluída no pedido <título>.'`
5. `sgcEscItemDeSolicitacaoInserir` — cria (ou completa) o item do pedido com
   `ID_SOLICITACAO` e `QT_PEDIDA` = quantidade solicitada (RN-010).
6. Relê o item (`SELECT ID, QT_PEDIDA FROM SGC_PEDIDO_ITEM WHERE ID_CARD = … AND CODPROD = …`)
   — **releitura obrigatória depois de escrita por id** (A-2 da revisão da onda 2): o
   upsert em lote não devolve id, e escrita guardada recusada devolve 0 linhas sem erro
   (D-03). Item não relido ⇒ `{ ok: false, erro: 'O item não foi criado no pedido.' }`,
   sem vincular nada.
7. `sgcEscSolicitacaoVincular` com `idCard`, `idItem` e `usuarioId`; relê a solicitação e
   confere `ID_CARD`/`ID_ITEM` — se não vinculou, devolve `ok: false` **sem** deixar o item
   órfão de origem (o `ID_SOLICITACAO` do item continua apontando, e a próxima tentativa é
   idempotente).
8. `sgcEscSolicitacaoHistoricoRegistrar` com `evento: 'vinculada'` e o detalhe
   `'Incluída no pedido <título> como item <codprod>.'`
9. `kbNotaRegistrar` em `try/catch` (D-07 da onda 1): `'Solicitação de <vendedor> incluída
   no pedido: <descrição> · <quantidade> <unidade> · cliente <código> <nome>.'` — nota que
   falha não desfaz o vínculo.
10. Devolve `{ ok: true, idSolicitacao, idItem, quantidade, aprovouAgora }`.

Custo: 3 `runQueryMitra` (não contam) + no máximo **5** execuções aninhadas (histórico
aprovada, item, vincular, histórico vinculada, nota), qualquer que seja o tamanho do
pedido (RNF-002). O total do pedido **não** é recalculado aqui: o item nasce com custo
zero e o `sgcItensGravar` da 003 recalcula quando a compradora gravar a lista — chamar
`sgcEscPedidoTotal` agora seria uma execução a mais para somar zero (D-006).

### Escritas SQL (uma instrução por SF)

| Nome | Id | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|---|
| `sgcEscSolicitacaoInserir` | 7850 | `:VAR_USER` + `REGISTRAR` | `codprod`, `descricao`, `embalagem`, `unidade`, `codfornec`, `fornecedor`, `codfilial`, `filial`, `quantidade`, `justificativa`, `codcli`, `cliente`, `cnpjCliente`, `prioridade`, `criadoEm` | `INSERT … SELECT … FROM DUAL WHERE` (validações de RN-001 no próprio `WHERE`) | RF-001, RF-004 |
| `sgcEscSolicitacaoAvaliar` | 7851 | `:VAR_USER` + `AVALIAR` | `id`, `status`, `motivo`, `avaliadoEm` | `UPDATE … WHERE ID = {{id}} AND STATUS = 'pendente' AND …` | RF-005, RF-006 |
| `sgcEscSolicitacaoCancelar` | 7852 | `:VAR_USER` + `REGISTRAR` | `id`, `canceladoEm` | `UPDATE … WHERE ID = {{id}} AND STATUS = 'pendente' AND CRIADO_POR = :VAR_USER` | RF-007 |
| `sgcEscSolicitacaoVincular` | 7853 | `{{usuarioId}}` + `AVALIAR` | `id`, `idCard`, `idItem`, `vinculadoEm`, `usuarioId` | `UPDATE … WHERE ID = {{id}} AND ID_CARD = 0 AND STATUS IN ('pendente','aprovada')` | RF-009, RN-009 |
| `sgcEscSolicitacaoDesvincular` | 7854 | `:VAR_USER` + `AVALIAR` | `idCard`, `atualizadoEm` | `UPDATE … WHERE ID_CARD = {{idCard}} AND NOT EXISTS (item vivo)` | RF-011, RN-011 |
| `sgcEscSolicitacaoHistoricoInserir` | 7855 | `:VAR_USER` + `HISTORICO` | `id`, `idCard`, `evento`, `detalhe`, `em` | `INSERT … SELECT … FROM SGC_SOLICITACAO WHERE …` | RF-013 |
| `sgcEscItemDeSolicitacaoInserir` | 7856 | `{{usuarioId}}` + `AVALIAR` | `idCard`, `codprod`, `descricao`, `embalagem`, `unidade`, `quantidade`, `idSolicitacao`, `quando`, `usuarioId` | `INSERT … SELECT … FROM DUAL WHERE … ON DUPLICATE KEY UPDATE` | RF-009, RN-010 |
| `sgcEscSolicitacaoHistoricoRegistrar` | 7857 | `{{usuarioId}}` + `AVALIAR` | `id`, `evento`, `detalhe`, `em`, `usuarioId` | `INSERT … SELECT … FROM SGC_SOLICITACAO WHERE S.ID = {{id}}` | RF-013 |

```sql
-- sgcEscSolicitacaoInserir (7850): as regras de RN-001 moram no WHERE, então
-- registro inválido grava 0 linhas e a tela relê (D-03) em vez de confiar.
INSERT INTO SGC_SOLICITACAO
  (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL,
   QUANTIDADE, JUSTIFICATIVA, CODCLI, CLIENTE, CNPJ_CLIENTE, PRIORIDADE, STATUS,
   MOTIVO, ID_CARD, ID_ITEM, AVALIADO_POR, AVALIADO_EM, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{codprod}}, '{{descricao}}', '{{embalagem}}', '{{unidade}}',
       {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}',
       {{quantidade}}, '{{justificativa}}', {{codcli}}, '{{cliente}}', '{{cnpjCliente}}',
       '{{prioridade}}', 'pendente', '', 0, 0, 0, '', :VAR_USER, '{{criadoEm}}', '{{criadoEm}}'
FROM DUAL
WHERE {{codprod}} > 0 AND {{quantidade}} > 0 AND {{codfornec}} > 0
  AND LENGTH(TRIM('{{justificativa}}')) >= 10
  AND '{{codfilial}}' <> ''
  AND '{{prioridade}}' IN ('normal', 'alta', 'urgente')
  AND <guarda(REGISTRAR)>

-- sgcEscSolicitacaoAvaliar (7851)
UPDATE SGC_SOLICITACAO
SET STATUS = '{{status}}',
    MOTIVO = CASE WHEN '{{status}}' = 'recusada' THEN '{{motivo}}' ELSE '' END,
    AVALIADO_POR = :VAR_USER, AVALIADO_EM = '{{avaliadoEm}}', ATUALIZADO_EM = '{{avaliadoEm}}'
WHERE ID = {{id}} AND STATUS = 'pendente'
  AND '{{status}}' IN ('aprovada', 'recusada')
  AND ('{{status}}' = 'aprovada' OR LENGTH(TRIM('{{motivo}}')) >= 10)
  AND <guarda(AVALIAR)>

-- sgcEscSolicitacaoCancelar (7852): só o autor, só pendente (RN-007)
UPDATE SGC_SOLICITACAO
SET STATUS = 'cancelada', ATUALIZADO_EM = '{{canceladoEm}}'
WHERE ID = {{id}} AND STATUS = 'pendente' AND CRIADO_POR = :VAR_USER
  AND <guarda(REGISTRAR)>

-- sgcEscSolicitacaoVincular (7853): AVALIADO_EM é a referência do rastreio e
-- NÃO se reescreve quando a solicitação já tinha sido aprovada (RN-015).
UPDATE SGC_SOLICITACAO
SET STATUS = 'aprovada', ID_CARD = {{idCard}}, ID_ITEM = {{idItem}}, MOTIVO = '',
    AVALIADO_POR  = CASE WHEN COALESCE(AVALIADO_POR, 0) = 0 THEN {{usuarioId}} ELSE AVALIADO_POR END,
    AVALIADO_EM   = CASE WHEN COALESCE(AVALIADO_EM, '') = '' THEN '{{vinculadoEm}}' ELSE AVALIADO_EM END,
    ATUALIZADO_EM = '{{vinculadoEm}}'
WHERE ID = {{id}} AND ID_CARD = 0 AND STATUS IN ('pendente', 'aprovada')
  AND <guardaInterna(AVALIAR)>

-- sgcEscSolicitacaoDesvincular (7854): o critério é "o item sumiu", e não o
-- CODPROD — assim a MESMA instrução serve à remoção de um item e à remoção dos
-- zerados ao sair da Análise (RN-011), e é idempotente.
UPDATE SGC_SOLICITACAO
SET ID_CARD = 0, ID_ITEM = 0, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID_CARD = {{idCard}} AND {{idCard}} > 0 AND STATUS = 'aprovada'
  AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO_ITEM I
                   WHERE I.ID_CARD  = SGC_SOLICITACAO.ID_CARD
                     AND I.CODPROD  = SGC_SOLICITACAO.CODPROD
                     AND I.STATUS  <> 'removido' AND I.QT_PEDIDA > 0)
  AND <guarda(AVALIAR)>

-- sgcEscSolicitacaoHistoricoInserir (7855): por id (avaliação, cancelamento) OU
-- pelo card, com o mesmo critério do desvínculo — chamada SEMPRE antes dele,
-- porque depois o ID_CARD já é 0. A forma "id OU critério" é a de
-- sgcEscOcorrenciaDecidir da 005 (achado A-3), uma instrução só.
INSERT INTO SGC_SOLICITACAO_HISTORICO (ID_SOLICITACAO, EVENTO, DETALHE, POR, EM)
SELECT S.ID, '{{evento}}', '{{detalhe}}', :VAR_USER, '{{em}}'
FROM SGC_SOLICITACAO S
WHERE '{{evento}}' IN ('aprovada', 'recusada', 'vinculada', 'desvinculada', 'cancelada')
  AND ( ({{id}} > 0 AND S.ID = {{id}})
     OR ({{id}} = 0 AND {{idCard}} > 0 AND S.ID_CARD = {{idCard}}
         AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO_ITEM I
                          WHERE I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD
                            AND I.STATUS <> 'removido' AND I.QT_PEDIDA > 0)) )
  AND <guarda(HISTORICO)>

-- sgcEscItemDeSolicitacaoInserir (7856)
INSERT INTO SGC_PEDIDO_ITEM
  (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA,
   QT_VENDA_TOTAL, QT_VENDA_LICITACAO, QT_ESTOQUE, QT_TRANSITO, QT_SUGERIDA, QT_PEDIDA,
   PRECO_CUSTO, TIPO_PRECO, CURVA_ABC, COBERTURA_DIAS, COBERTURA_LIMITE,
   COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS, ID_SOLICITACAO,
   CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{idCard}}, {{codprod}}, '{{descricao}}', '{{embalagem}}', '{{unidade}}',
       0, 0, 0, 0, 0, 0, 0, 0, {{quantidade}},
       0, 'padrao', 'C', 0, 0, '', '', 'montagem', {{idSolicitacao}},
       '{{quando}}', {{usuarioId}}, '{{quando}}'
FROM DUAL
WHERE {{codprod}} > 0 AND {{quantidade}} > 0 AND {{idSolicitacao}} > 0
  AND <guardaInterna(AVALIAR)>
ON DUPLICATE KEY UPDATE
  ID_SOLICITACAO = VALUES(ID_SOLICITACAO),
  QT_PEDIDA = CASE WHEN QT_PEDIDA > 0 AND STATUS <> 'removido' THEN QT_PEDIDA ELSE VALUES(QT_PEDIDA) END,
  STATUS    = CASE WHEN STATUS = 'removido' THEN 'montagem' ELSE STATUS END,
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)

-- sgcEscSolicitacaoHistoricoRegistrar (7857): a gêmea interna de 7855, só por id
INSERT INTO SGC_SOLICITACAO_HISTORICO (ID_SOLICITACAO, EVENTO, DETALHE, POR, EM)
SELECT S.ID, '{{evento}}', '{{detalhe}}', {{usuarioId}}, '{{em}}'
FROM SGC_SOLICITACAO S
WHERE S.ID = {{id}}
  AND '{{evento}}' IN ('aprovada', 'recusada', 'vinculada', 'desvinculada', 'cancelada')
  AND <guardaInterna(AVALIAR)>
```

`CODEPTO`/`CODSEC`/`UN_POR_CAIXA`/`PRECO_CUSTO` nascem em zero no item criado pela
solicitação: são dados da análise do ERP, e quem os traz é o `sgcItensGravar` da 003 na
primeira gravação da lista (o upsert dele os preenche e **preserva** `ID_SOLICITACAO`).
Até lá o item vale zero no total e o limite de cobertura cai no do fornecedor ou no padrão
de 35 dias — o comportamento correto para um item que ainda não foi analisado (D-007).

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/solicitacoes` | fila, filtros, nova solicitação, avaliar, detalhe com histórico, painel de rastreio | `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `SearchInput`, `FilterChip`, `SelectMenu`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Status`, `Badge`, `Code`, `Dash`, `Pagination`, `EmptyState`, `Alert`, `Button`, `IconButton`, `TextLink`, `LabelledField`, `Input`, `Textarea`, `Dialog` | `SolicitacoesPage`, `NovaSolicitacaoDialogo`, `AvaliarDialogo`, `DetalheSolicitacaoDialogo`, `RastreioPainel` |
| card · fase Análise, bloco **Solicitações** | as ativas do mesmo fornecedor e filial; "Incluir no pedido" e "Recusar" | `Panel`, `PanelHeader`, `Table`, `RowTitle`, `RowMeta`, `Status`, `Badge`, `Code`, `Dash`, `Button`, `Alert`, `EmptyState`, `Dialog` | `BlocoSolicitacoes` |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/lib/solicitacoes.ts` | regra pura: situação, rótulos, prioridade, classificação do rastreio, montagem dos lotes, colunas do CSV |
| `frontend/src/pages/solicitacoes/SolicitacoesPage.tsx` | a tela `/solicitacoes` (porteiro de rota, lista, filtros, paginação) |
| `frontend/src/pages/solicitacoes/solicitacoes-dialogos.tsx` | `NovaSolicitacaoDialogo`, `AvaliarDialogo`, `DetalheSolicitacaoDialogo` (o `max-lines` 800 não cabe tudo num arquivo) |
| `frontend/src/pages/solicitacoes/RastreioPainel.tsx` | o painel dos dois eixos, os três limites e a exportação |
| `frontend/src/pages/quadros/abas/Solicitacoes.tsx` | `BlocoSolicitacoes(ctx: ExtensaoContexto)` — o bloco de `BLOCOS_POR_FASE.analise` |
| `frontend/src/lib/server-functions.ts` | bloco 78xx (nomes e ids locais) |

Desenho (`design.md` §8, §9.1, §9.2, §9.4, §9.5):

- **Tabela da fila**: `Code` para o `CODPROD` e para o `CODCLI`, `RowTitle` para a
  descrição, `RowMeta` para fornecedor · filial · vendedor; quantidade com `numeric`;
  coluna sem dado é `Dash()`, nunca `0`.
- **Situação própria × situação de atendimento** são duas colunas, nunca uma: a primeira é
  `Badge` (`pendente`, `aprovada`, `recusada`, `cancelada`), a segunda é `Status` com ponto
  **e** texto — estado nunca só por cor. Tons: `atendida` → `live`; `nao_atendida` →
  `alert`; `em_faturamento`/`em_transito`/`enviada`/`em_envio`/`em_aprovacao`/`em_analise`
  → `attention`; `sem_pedido` → `off`.
- **Rastreio**: os dois eixos em **duas colunas lado a lado** (RN-014 — colapsar esconderia
  um dos dois fatos), cada um `Status` com rótulo escrito. Cliente: `comprou` → `live`;
  `comprou_outra_filial` → `live` com o texto "Comprou em outra filial";
  `nao_comprou` → `alert`; `carencia` → `off` "Aguardando giro"; `sem_cliente` → `off`
  "Sem cliente informado"; `sem_dado` → `off` "Sem dado". Estoque: `parado` → `alert`;
  `excesso` → `attention`; `girando` → `live`; `sem_estoque` → `off`; `sem_dado` → `off`.
  Inativo **nunca** é vermelho: o vermelho está reservado para "o cliente não comprou" e
  "parado na filial".
- **Os três limites** são campos numéricos na barra do painel (`Toolbar` + `Input`), com os
  padrões 30/60/90 visíveis; mudar qualquer um **reclassifica em memória** (RNF-004).
- **Aviso de lote com falha**: `Alert tone="attention"` no topo do painel dizendo quantas
  solicitações ficaram sem dado — nunca silêncio (RF-017).
- **Diálogos** (`max-h-[90vh]`, só o miolo rola, rodapé `flex-col-reverse` no mobile): a
  nova solicitação tem busca de produto (a mesma `BuscarProduto` da 003, reusada) e busca
  de cliente com resultado em lista; a recusa tem contador de 10 caracteres; o detalhe
  mostra o histórico em linha do tempo.
- **Sem toast** (UI-02 A): confirmação é "Salvo às HH:MM" na faixa do painel e `Alert` no
  fluxo para erro.
- **Permissão** (§9.4): sem `criarSolicitacao` ou `avaliarSolicitacao` os controles ficam
  **desabilitados com o motivo no `title`**, nunca escondidos (C-019). A rota tem porteiro
  (`sessao.permissoes.verSolicitacoes`), no padrão de `/notas-fiscais`.
- **Sem data editável**: nenhuma data desta feature é digitada, então o `DatePicker` não é
  usado aqui; se um filtro de período entrar, é ele — nunca `<input type="date">` (UI-03 B).

### Chaves de `lib/permissoes.ts` (R-056, arquivo da base)

| Chave | admin | analista | gestor | diretoria | comercial | `READ_ONLY` |
|---|---|---|---|---|---|---|
| `verSolicitacoes` | ✓ | ✓ | ✓ | ✓ | ✓ | mantém (como `verBo`/`verCoberturas`) |
| `criarSolicitacao` | ✓ | — | — | — | ✓ | zera |
| `avaliarSolicitacao` | ✓ | ✓ | ✓ | — | — | zera |

`criarSolicitacao` não vai para analista nem gestor porque o autor **é** o vendedor
(RN-002): um comprador registrando uma solicitação criaria uma demanda sem vendedor por
trás. O recorte "o comercial só vê as suas" **não** é uma chave de permissão — é o
`RECORTE_COMERCIAL` do servidor (RF-019).

Item de menu novo: `{ grupo: 'Compras', to: '/solicitacoes', label: 'Solicitações', exige: 'verSolicitacoes' }`,
**antes** de "Produtos em B.O.". Com ele, `menuParaPersona` passa a devolver **exatamente
dois** itens para o comercial (C-021) — hoje devolve um.

## Fluxo

1. O vendedor abre `/solicitacoes` (2 execuções: `sgcSolicitacoesListar` +
   `sgcSolicitacoesListarTotal`) e clica em "Nova solicitação". O diálogo busca o produto
   (`sgcWintBuscarProduto` da 003, 1 execução por busca), resolve o nome do fornecedor do
   produto (`sgcWintFornecedores` da 001 com o código no `busca`, 1 execução, só quando o
   produto muda de fornecedor), lê as filiais (`sgcWintFiliais` da 001, 1 execução na
   abertura) e busca o cliente (`sgcWintClienteBuscar`, 1 execução por busca).
2. Ele confirma: `sgcEscSolicitacaoInserir` (`:VAR_USER`) e a tela **relê a lista** — é a
   releitura que prova que gravou (D-03), e é dela que sai o id para o histórico, se algum
   dia a linha `criada` passar a ser gravada.
3. A compradora abre `/solicitacoes`, filtra por pendentes e **aprova** ou **recusa**:
   `sgcEscSolicitacaoAvaliar` + `sgcEscSolicitacaoHistoricoInserir` (2 execuções), depois
   recarrega. Aprovar deixa a solicitação na fila, sem pedido (RN-005).
4. Ela abre um pedido em montagem no `/quadro` (2 execuções: `kbCardDetalhe` da lib +
   `sgcPedidoCarregar` da 002) e a aba "Nesta fase" desenha, **antes** dos Itens, o bloco
   Solicitações: **uma** execução (`sgcSolicitacoesDaMontagem`), independente do número de
   linhas (RNF-001).
5. "Incluir no pedido" chama `sgcSolicitacaoIncluirNoPedido` **uma** vez; depois a tela
   chama `ctx.recarregar()` e `pedido.recarregar(cardId)`, e o item aparece na lista de
   Itens com a etiqueta "Solicitação de Leo Comercial".
6. "Recusar" no bloco: `sgcEscSolicitacaoAvaliar` + `sgcEscSolicitacaoHistoricoInserir`,
   as mesmas SFs da tela — a decisão é a mesma, muda só de onde é tomada.
7. Remover o item na aba Itens: `sgcEscItemRemover` (003) e, **em seguida**,
   `sgcEscSolicitacaoHistoricoInserir` (`id: 0`, `idCard`, evento `desvinculada`) e
   `sgcEscSolicitacaoDesvincular` — nessa ordem, porque o histórico precisa do `ID_CARD`
   ainda preenchido. A solicitação volta à fila e reaparece no bloco (RN-011). Quando o
   item removido tinha `ID_SOLICITACAO > 0` (a coluna que `sgcPedidoCarregar` passa a
   devolver), a tela fecha com `kbNotaRegistrar` — a nota de desvínculo que R-063 pede,
   dentro de `try/catch`, como a do vínculo.
8. Sair da Análise: depois de `sgcAnaliseSair` (003) devolver `ok`, a tela repete o par do
   passo 7 com o mesmo `idCard` — os itens zerados já foram removidos, então o critério
   "não existe item vivo" captura exatamente as solicitações que perderam o item. Nenhuma
   mudança no `add-006`.
9. Meses depois, o gestor abre o painel de rastreio da página: a tela monta os pares das
   solicitações **aprovadas com data de aprovação** que estão na tela, fatia em lotes de
   120 e chama `sgcWintRastreioSolicitacoes` uma vez por lote. Lote que estoura vira
   `sem_dado` (RF-017). Mexer num limite não chama nada (RNF-004).

### Regra pura — `frontend/src/lib/solicitacoes.ts`

```ts
export type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada' | 'cancelada';
export type SituacaoAtendimento =
  | 'sem_pedido' | 'em_analise' | 'em_aprovacao' | 'em_envio' | 'enviada'
  | 'em_transito' | 'em_faturamento' | 'nao_atendida' | 'atendida';
export type Prioridade = 'normal' | 'alta' | 'urgente';
export type VendaCliente =
  | 'comprou' | 'comprou_outra_filial' | 'nao_comprou' | 'sem_cliente' | 'carencia' | 'sem_dado';
export type SituacaoEstoque = 'parado' | 'excesso' | 'girando' | 'sem_estoque' | 'sem_dado';

export interface LimitesRastreio { carenciaDias: number; paradoDias: number; coberturaDias: number }
export const LIMITES_PADRAO: LimitesRastreio = { carenciaDias: 30, paradoDias: 60, coberturaDias: 90 };

/** R-055: 120 pares por execução, teto de 4000 caracteres do literal Oracle. */
export const PARES_POR_LOTE = 120;
export const RASTREIO_MAX_CARACTERES = 4000;

export function prioridadeDe(bruto: string): Prioridade;           // desconhecida → 'normal'
export function ordemDaPrioridade(p: Prioridade): number;          // urgente 0, alta 1, normal 2
export function rotuloSituacao(s: SituacaoAtendimento): { label: string; tom: TomStatus };
export function rotuloStatus(s: StatusSolicitacao): { label: string; tom: TomStatus };

/** RN-001 — a mesma validação que o WHERE de sgcEscSolicitacaoInserir aplica. */
export function validarSolicitacao(entrada: {
  codprod: number; quantidade: number; codfilial: string; justificativa: string;
}): string[];                                                       // vazio = válida

/** C-018 — o texto digitado vira { codcli, busca } (CNPJ perde a pontuação). */
export function buscaDeCliente(texto: string): { codcli: number; busca: string };

export function chaveRastreio(codprod: unknown, codfilial: unknown, dtRef: unknown, codcli: unknown): string;
export function dataReferencia(alvo: { AVALIADO_EM?: string | null }): string;   // '' = fora do rastreio
export function montarPares(alvos: AlvoRastreio[]): string[];                    // pares únicos, na ordem
export function lotesDePares(pares: string[]): string[];                         // 120 por lote, ≤ 4000 caracteres
export function classificarRastreio(row: RastreioRow | null, hojeIso: string, limites?: LimitesRastreio): RastreioSolicitacao;
export function indexarRastreio(rows: RastreioRow[], hojeIso: string, limites?: LimitesRastreio): Map<string, RastreioSolicitacao>;
export function resumoRastreio(itens: RastreioSolicitacao[]): Record<VendaCliente | SituacaoEstoque, number>;
export function colunasDoCsv(): string[];
export function linhaDoCsv(linha: LinhaSolicitacao, detalhe: RastreioSolicitacao | null): (string | number)[];
```

Classificação (RN-013, RN-014), o porte de `rastreio-venda.ts` do p-45547 com as duas
diferenças que R-055 pede — "comprou em outra filial" vira **classe própria** (no legado
era uma marca dentro de "atendido") e o lote que falha vira `sem_dado` nos dois eixos:

```
venda:    sem linha            → 'sem_dado'
          CODCLI = 0           → 'sem_cliente'
          venda na filial > 0  → 'comprou'
          venda geral > 0      → 'comprou_outra_filial'
          dias < carenciaDias  → 'carencia'
          senão                → 'nao_comprou'

estoque:  sem linha                        → 'sem_dado'
          QT_ESTOQUE <= 0                  → 'sem_estoque'
          dias < carenciaDias              → 'girando'
          sem saída, ou dias sem saída >= paradoDias → 'parado'
          cobertura nula ou > coberturaDias → 'excesso'
          senão                            → 'girando'

giro diário = max(QT_VENDA_90D / 90, QT_VENDIDA_POS / diasDesdeReferencia)
última saída = a mais recente entre DT_ULT_SAIDA (PCEST) e DT_VENDA_POS (PCMOV)
```

O giro por dois caminhos, valendo o maior, é o mesmo cuidado do legado e continua valendo:
os contadores de `PCEST` cobrem os três meses fechados e ficam zerados para o item que
voltou a vender agora — sem isso, um item que vendeu tudo depois da compra seria
classificado como excesso por falta de giro registrado. A última saída também vem de dois
lugares porque `PCEST.DTULTSAIDA` cobre um período maior que a janela consultada.

`montarPares` reconstrói cada campo a partir de número e data validada — nada que veio do
banco entra cru no `{{pares}}`, que é substituído por texto dentro do SQL.

## Simulador

### Tabelas

Nenhuma tabela nasce nesta spec: `SGC_SOLICITACAO`, `SGC_SOLICITACAO_HISTORICO` e a coluna
`SGC_PEDIDO_ITEM.ID_SOLICITACAO` vêm do `setup-backend.mjs` (base S3). Duas colunas novas
nas `PC*` do integrador (`schema-winthor.mjs`, R-062):

| Tabela | Coluna | Por quê |
|---|---|---|
| `PCCLIENT` | `CGCENT VARCHAR(20)` | o CNPJ que `sgcWintClienteBuscar` procura e grava (R-062 já previa) |
| `PCMOV` | `DTCANCEL VARCHAR(10)` | o rastreio descarta movimento cancelado (`DTCANCEL IS NULL`), como o legado |

### Dialeto (`mysql-dialect.mjs`, integrador)

`sgcWintRastreioSolicitacoes` usa duas construções Oracle que o simulador ainda não
traduz. São as **únicas** novas desta spec (`NVL`, `TO_CHAR`, `TO_DATE`, `TRUNC`, `ROWNUM`,
`FROM DUAL`, `FIELD`, `CONCAT`, `COALESCE`, `LENGTH`, `TRIM`, `REPLACE`,
`ON DUPLICATE KEY UPDATE` já existem):

1. **`REGEXP_SUBSTR(texto, padrao, inicio, ocorrencia)`** como função escalar. Só as formas
   `'[^,]+'` e `'[^:]+'` são usadas — isto é, "o n-ésimo pedaço separado por vírgula (ou
   por dois-pontos)". Devolve `null` quando a ocorrência não existe, que é o que encerra o
   `CONNECT BY`.
2. **O gerador de linhas** `SELECT <expr(LEVEL)> AS ITEM FROM DUAL CONNECT BY <expr(LEVEL)> IS NOT NULL`,
   por reescrita textual: prefixar a instrução com a CTE
   `WITH RECURSIVE NIVEL(LVL) AS (SELECT 1 UNION ALL SELECT LVL + 1 FROM NIVEL WHERE LVL < 200)`
   (fundindo com o `WITH PARES AS` que já abre a consulta, que vira
   `WITH RECURSIVE NIVEL(LVL) AS (…), PARES AS (…)`), trocar `FROM DUAL CONNECT BY <x> IS NOT NULL`
   por `FROM NIVEL WHERE <x> IS NOT NULL` e `LEVEL` por `LVL`. O teto de 200 cobre o lote
   de 120 com folga e é o que impede a recursão infinita.

Traduzir preservando o **significado** e não só a sintaxe é a regra do arquivo: se a
reescrita não puder ser feita com segurança, a alternativa é o integrador registrar o
limite e a suíte 008 falhar alto — nunca um shim que devolva linhas plausíveis.

### Seed — `backend/simulator/seed/008-solicitacoes.mjs`

Só **INSERT**. Fornecedores (1015, 1042 ativos, 1088 inativo), filiais (1 Benenutri Matriz,
2 Filial Norte, 3 Filial Sul), personas e o catálogo das 003/007 **não** são tocados
(R-017). Esta spec insere:

- **5 produtos próprios do fornecedor 1042** (`PCPRODUT`, departamento 3, seção 31),
  `CODPROD` **5301–5305** — fora das faixas da 003 (5001–5104) e da 007 (5201–5202) —, e
  nenhuma descrição com "CREME" (a busca do C-009 da 003) nem com as palavras da 007:

  | Código | Descrição |
  |---|---|
  | 5301 | `BEBIDA LACTEA ZERO LACTOSE 200 ML` |
  | 5302 | `FARINHA LACTEA TRADICIONAL 380 G` |
  | 5303 | `LEITE CONDENSADO SEMIDESNATADO 395 G` |
  | 5304 | `IOGURTE NATURAL INTEGRAL 170 G` |
  | 5305 | `MANTEIGA EXTRA SEM SAL 200 G` |

- **5 clientes próprios** (`PCCLIENT` **9201–9205**, com `CGCENT`), fora das faixas 9001–9003
  (003) e 9101–9105 (007). O 9201 é `Nutrivida Clinica Ltda`, CNPJ `12345678000190`.
- **`PCEST` da filial 3** para os cinco produtos, com datas **relativas a hoje** (o teste não
  depende de quando roda) — é a filial das solicitações do rastreio, e por isso nada do que
  entra aqui aparece nas consultas das 003/007, que olham as filiais 1, 2 e 3 só para os
  produtos delas:

  | Produto | `QTEST` | `QTVENDMES/1/2` | `DTULTSAIDA` | leva a |
  |---|---|---|---|---|
  | 5301 | 20 | 30 / 30 / 30 | hoje−5 | `girando` (cobertura 20 dias) |
  | 5302 | 0 | 0 / 0 / 0 | hoje−40 | `sem_estoque` |
  | 5303 | 40 | 0 / 0 / 0 | hoje−80 | `parado` |
  | 5304 | 300 | 30 / 30 / 30 | hoje−3 | `excesso` (cobertura 300 dias) |
  | 5305 | 0 | 0 / 0 / 0 | hoje−50 | `sem_estoque` |

- **Vendas em `PCMOV`** (`CODOPER = 'S'`, `DTCANCEL` nulo), com `NUMTRANSITEM` a partir de
  **950001** (R-062) e datas relativas à aprovação:

  | `NUMTRANSITEM` | Produto | Filial | Cliente | Data | Qt | Prova |
  |---|---|---|---|---|---|---|
  | 950001 | 5301 | 3 | 9201 | hoje−20 | 12 | `comprou` |
  | 950002 | 5302 | **1** | 9202 | hoje−15 | 8 | `comprou_outra_filial` |
  | 950003 | 5303 | 3 | 9204 | hoje−70 | 5 | controle: cliente errado **e** antes da referência |
  | 950004 | 5304 | 3 | 9205 | hoje−30 | 30 | venda a terceiro: contexto, nunca resposta (RN-013) |
  | 950005 | 5301 | 3 | 9201 | hoje−5 | 100 | controle: `CODOPER = 'E'`, entrada não conta |

- **3 cards** no quadro `compras`, fornecedor **1042 Nestlé**, criados por `ana` e com `ana`
  como responsável, exportados em `CARDS_008` (como `CARDS_003`/`CARDS_007`), todos com
  **`DT_ENVIO` vazio**, **sem `SGC_NF`** e **sem `SGC_BO_ITEM`** — é o que os mantém fora
  das listagens globais da 005 e da 007 (R-045):

  | Chave em `CARDS_008` | Fase | Filial | Serve a |
  |---|---|---|---|
  | `montagem` | `analise` | 1 | C-007, C-008, C-009, C-010, C-012, C-013, RN-012 |
  | `montagemFilial2` | `analise` | 2 | C-012 (o recorte por filial) |
  | `vinculado` | `enviado` | 1 | C-011 (o teste move este card pelas 10 fases e o devolve ao fim), C-022 |

  O card `vinculado` nasce com **1 item** (5301, `QT_PEDIDA` 24, `STATUS` `enviado`,
  `ID_SOLICITACAO` da solicitação `vinculada`) — é o item cujo `STATUS` o teste muda para
  `bo` para provar o ramo `nao_atendida` da fase B.O.

- **14 solicitações** (`SGC_SOLICITACAO`), exportadas em `SOLICITACOES_008` — 4 pendentes,
  7 aprovadas sem pedido, 1 aprovada e vinculada, 1 recusada e 1 cancelada (os números de
  C-020):

  | Chave | Produto | Fornec/filial | Cliente | Prioridade | Status | Autor | Serve a |
  |---|---|---|---|---|---|---|---|
  | `pendenteAlta` | 5301 | 1042 / 1 | 9201 | alta | pendente | leo | C-007, C-008, C-009, C-013 |
  | `pendenteNormal` | 5302 | 1042 / 1 | 9202 | normal | pendente | leo | C-007, C-010 |
  | `pendenteFilial2` | 5302 | 1042 / **2** | 9202 | normal | pendente | leo | C-012, C-004 |
  | `pendenteOutroFornec` | 5001 | **1015** / 1 | 9204 | normal | pendente | admin | C-012, C-005, C-006 |
  | `filaUrgente` | 5303 | 1042 / 1 | 9203 | urgente | aprovada (sem pedido) | leo | C-007 (ordem) |
  | `rastComprou` | 5301 | 1042 / **3** | 9201 | normal | aprovada hoje−45 | admin | C-014, C-015 |
  | `rastOutraFilial` | 5302 | 1042 / 3 | 9202 | normal | aprovada hoje−45 | admin | C-014, C-015 |
  | `rastNaoComprou` | 5303 | 1042 / 3 | 9203 | normal | aprovada hoje−45 | admin | C-014, C-015 |
  | `rastExcesso` | 5304 | 1042 / 3 | 9204 | normal | aprovada hoje−45 | admin | C-014, C-015 |
  | `rastSemCliente` | 5305 | 1042 / 3 | **0** | normal | aprovada hoje−45 | admin | C-014, C-015 |
  | `rastCarencia` | 5301 | 1042 / 3 | 9205 | normal | aprovada **hoje−10** | admin | C-014, C-015 |
  | `vinculada` | 5301 | 1042 / 1 | 9201 | normal | aprovada hoje−45, `ID_CARD = CARDS_008.vinculado` | gil | C-011, C-022 |
  | `recusada` | 5303 | 1042 / 1 | 9203 | normal | recusada, motivo de 45 caracteres | gil | C-020 |
  | `cancelada` | 5304 | 1042 / 1 | 9204 | normal | cancelada | gil | C-020 |

  As **4 de Leo** que C-021 exige são `pendenteAlta`, `pendenteNormal`, `pendenteFilial2` e
  `filaUrgente`; `recusada`, `cancelada` e `vinculada` nascem de `gil` e as do rastreio de
  `admin`, justamente para o recorte por autoria ter o que separar. O teste afirma "as de
  Leo" comparando o conjunto devolvido com o conjunto do seed, nunca por literal solto
  (R-045).

- **Histórico** (`SGC_SOLICITACAO_HISTORICO`) só onde o cenário precisa: a `vinculada`
  nasce com `aprovada`, `vinculada`, `desvinculada`, `vinculada` (4 linhas gravadas + a
  `criada` derivada = as 5 de C-022); a `recusada`, com 1 linha `recusada`.

O seed **não** cria fornecedor, filial, persona, campo do quadro nem automação, e não
toca em nenhuma linha das outras specs (R-017).

### `CHECK_INPUT`

Acrescentar em `backend/simulator/config.mjs` (arquivo do integrador), seção 008, **só as
chaves que ainda não existem** — D-17 é dívida aberta justamente por chave repetida, e esta
seção não acrescenta nenhuma:

| Chave | Valor | Para quê |
|---|---|---|
| `codcli` | `'0'` | `sgcWintClienteBuscar` (desligado; `busca` já existe com `''`) |
| `pares` | `'5301:3:2026-08-01:9201'` | `sgcWintRastreioSolicitacoes` (um par válido, para o `CONNECT BY` render 1 linha) |
| `minhas` | `'0'` | `sgcSolicitacoesListar`/`Total` |
| `vendedor` | `'0'` | idem |

Já existem e servem sem redefinição: `busca` (`''`), `limite` (`'20'`), `offset` (`'0'`),
`status` (`''`, da 005), `situacao` (`''`, da 004), `codfornec` (`'1015'`, da 003),
`codfilial` (`'1'`, da 003), `cardId` (`'5'`, da 002). As escritas e as JAVASCRIPT o
`sim:check` pula, então nenhum parâmetro de escrita entra aqui.

### Como o smoke chama o que não tem sessão

Tudo nesta spec tem sessão: não há cron. As chamadas de teste usam
`chamar(nome, input, U.<usuario>)` com os cinco usuários do seed
(`admin`, `ana`, `gil`, `dora`, `leo`), mais um `RESTRICTED` criado no próprio teste para
C-019.

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 · RN-002 · RN-004 | `smoke/008-solicitacoes.mjs` | `sgcEscSolicitacaoInserir` como `leo` com 5301, quantidade 24, cliente 9201 e justificativa de 90 caracteres: `SELECT` na tabela devolve 1 linha nova com `STATUS='pendente'`, `CRIADO_POR = leo`, `CODFORNEC = 1042`, `FORNECEDOR = 'Nestlé'`, `CODCLI = 9201`, `CLIENTE`, `CNPJ_CLIENTE = '12345678000190'`, `AVALIADO_EM = ''`; `sgcSolicitacaoCarregar` devolve `historico[0].EVENTO = 'criada'` com o nome de Leo |
| C-002 · RN-003 | `smoke/008-solicitacoes.mjs` + `tests/solicitacoes.test.mjs` | inserir sem cliente grava `CODCLI = 0` e `CLIENTE = ''`; `classificarRastreio` de uma linha com `CODCLI 0` devolve `venda: 'sem_cliente'`, e `rotuloVenda('sem_cliente').label` contém "Sem cliente informado" |
| C-003 · RN-001 | `smoke/008-solicitacoes.mjs` + `tests/solicitacoes.test.mjs` | `sgcEscSolicitacaoInserir` com `quantidade: 0` e com justificativa de 9 caracteres não muda a contagem da tabela (medida no próprio teste, antes e depois); `validarSolicitacao` devolve as duas mensagens de uma vez, e `[]` com tudo preenchido |
| C-004 · RN-005 | `smoke/008-solicitacoes.mjs` | `sgcEscSolicitacaoAvaliar` como `ana` com `status: 'aprovada'` sobre a `pendenteFilial2`: fica `aprovada`, `ID_CARD = 0`, `AVALIADO_POR = ana`, `AVALIADO_EM` preenchido; `COUNT(*)` de `KB_CARD` e de `SGC_PEDIDO_ITEM` idêntico antes e depois; `sgcEscSolicitacaoHistoricoInserir` grava 1 linha `aprovada` |
| C-005 · RN-006 | `smoke/008-solicitacoes.mjs` | recusar a `pendenteOutroFornec` com motivo de 9 caracteres a deixa `pendente`; com 10, fica `recusada` com `MOTIVO`, `AVALIADO_POR` e `AVALIADO_EM`, e o histórico ganha `recusada` com o motivo no detalhe |
| C-006 · RN-007 | `smoke/008-solicitacoes.mjs` | `leo` cancela a solicitação que ele criou em C-001 (fica `cancelada`); `leo` cancelando a `pendenteOutroFornec`, de `admin`, não muda o status; `leo` cancelando a `filaUrgente`, dele mas já `aprovada`, não muda o status |
| C-007 · RN-012 · RN-017 | `smoke/008-solicitacoes.mjs` | `sgcSolicitacoesDaMontagem({ cardId: CARDS_008.montagem })` devolve exatamente 3 linhas, na ordem `5303`, `5301`, `5302`, com `CRIADO_POR_NOME`, `CLIENTE` e `JUSTIFICATIVA` preenchidos; `recusada`, `cancelada` e `vinculada` não aparecem |
| C-008 · RNF-002 | `smoke/008-solicitacoes.mjs` | `sgcSolicitacaoIncluirNoPedido({ cardId: montagem, id: pendenteAlta })` como `gil` devolve `{ ok: true, aprovouAgora: true }`; `SGC_PEDIDO_ITEM` do card ganha 1 linha `5301` com `QT_PEDIDA = 24`, `STATUS='montagem'` e `ID_SOLICITACAO` correto; a solicitação fica `aprovada` com `ID_CARD`/`ID_ITEM`; `sgcSolicitacoesDaMontagem` passa a devolver 2; `KB_LOG` do card ganha 1 nota com `'Leo'` no texto; o histórico ganha `aprovada` **e** `vinculada` |
| C-009 · RN-011 | `smoke/008-solicitacoes.mjs` | depois de C-008: `sgcEscSolicitacaoHistoricoInserir({ id: 0, idCard, evento: 'desvinculada' })` + `sgcEscSolicitacaoDesvincular({ idCard })` **sem** remover o item não muda nada (item vivo); `sgcEscItemRemover` (003) e o mesmo par devolvem a solicitação à fila (`ID_CARD = 0`, `ID_ITEM = 0`, `STATUS='aprovada'`), `sgcSolicitacoesDaMontagem` volta a 3 e o histórico ganha `desvinculada`; zerar o item (`QT_PEDIDA = 0`) e repetir o par produz o mesmo resultado |
| C-010 | `smoke/008-solicitacoes.mjs` | recusar a `pendenteNormal` pelas mesmas SFs da tela deixa `STATUS='recusada'` e `sgcSolicitacoesDaMontagem` passa a devolver 2 |
| C-011 · RN-008 | `smoke/008-solicitacoes.mjs` | com a solicitação `vinculada` no card `vinculado`, mover o card por `UPDATE KB_CARD SET FASE_ID` nas 10 fases e ler `SITUACAO` em `sgcSolicitacoesListar` devolve, na ordem: `em_analise`, `em_aprovacao`, `em_aprovacao`, `em_envio`, `enviada`, `em_transito`, `em_faturamento`, `em_faturamento`, `atendida`, `nao_atendida`; com o item em `STATUS='bo'` e o card em `bo`, devolve `nao_atendida`; com `ID_CARD = 0`, `sem_pedido`; ao fim o card volta à fase e o item ao status originais |
| C-012 | `smoke/008-solicitacoes.mjs` | `sgcSolicitacoesDaMontagem` do card `montagem` não traz `pendenteFilial2` nem `pendenteOutroFornec`; `sgcSolicitacaoIncluirNoPedido` com cada uma delas devolve `ok: false` citando fornecedor e filial, e `SGC_PEDIDO_ITEM` do card não cresce |
| C-013 · RN-009 · RN-010 | `smoke/008-solicitacoes.mjs` | incluir a mesma solicitação duas vezes devolve `ok: false` na segunda citando o título do pedido, e o card continua com 1 item `5301`; com o item `5301` já em `QT_PEDIDA = 30`, incluir uma segunda solicitação do mesmo produto mantém `QT_PEDIDA = 30`, grava o `ID_SOLICITACAO` novo e continua com **1** item |
| C-014 · RN-013 · RN-015 | `smoke/008-solicitacoes.mjs` + `tests/solicitacoes.test.mjs` | `sgcWintRastreioSolicitacoes` com os 6 pares devolve **6 linhas (> 0)**, e `classificarRastreio` sobre elas devolve, na ordem do seed: `comprou` (12 ao cliente), `comprou_outra_filial` (8 fora da filial, 0 na filial), `nao_comprou`, `nao_comprou` (com `qtVendidaFilial = 30` no contexto), `sem_cliente`, `carencia`; a venda de hoje−70 e a entrada `CODOPER='E'` não entram em nenhuma soma |
| C-015 · RN-014 | `smoke/008-solicitacoes.mjs` + `tests/solicitacoes.test.mjs` | as mesmas 6 linhas classificam o estoque como `girando`, `sem_estoque`, `parado`, `excesso`, `sem_estoque`, `girando`; `QT_VENDA_90D` de 5304 é 90 e a cobertura calculada é 300 |
| C-016 · RF-017 | `tests/solicitacoes.test.mjs` | `classificarRastreio(null, hoje)` devolve `{ venda: 'sem_dado', estoque: 'sem_dado' }`; `indexarRastreio([])` devolve mapa vazio e `resumoRastreio` conta as `sem_dado` |
| C-017 · RNF-004 | `tests/solicitacoes.test.mjs` | a mesma linha (estoque 100, giro 1/dia, saída há 2 dias) classifica `girando` com `coberturaDias: 120` e `excesso` com `coberturaDias: 60`, sem nenhuma entrada nova |
| C-018 | `smoke/008-solicitacoes.mjs` + `tests/solicitacoes.test.mjs` | `sgcWintClienteBuscar({ codcli: 9201, busca: '' })`, `({ codcli: 0, busca: 'nutrivida' })` e `({ codcli: 0, busca: '12345678000190' })` devolvem, cada uma, **≥ 1 linha (> 0)** com `CODCLI = 9201`, `CLIENTE` e `CNPJ`; `buscaDeCliente('12.345.678/0001-90')` devolve `{ codcli: 0, busca: '12345678000190' }` e `buscaDeCliente('9201')` devolve `{ codcli: 9201, busca: '9201' }` |
| C-019 · RN-018 | `smoke/008-solicitacoes.mjs` + `tests/solicitacoes.test.mjs` | `sgcEscSolicitacaoInserir` como `ana` e como `gil` não grava; `sgcEscSolicitacaoAvaliar` como `leo` e como `dora` não muda o status; `sgcSolicitacaoIncluirNoPedido` como `leo`, `dora` e um `READ_ONLY` devolve `ok: false` citando o perfil; como um analista `RESTRICTED` num card criado por `ana`, devolve a frase de acesso restrito; `permissoesDe` devolve a matriz da tabela para as 5 personas e para `READ_ONLY`, e `menuParaPersona(permissoesDe('comercial','MEMBER'))` devolve exatamente 2 itens (`/solicitacoes` e `/bo`) |
| C-020 · RF-018 | `smoke/008-solicitacoes.mjs` | `sgcSolicitacoesListar` como `gil`, **recortada no teste por `SOLICITACOES_008`** (R-045): 14 linhas; `status: 'pendente'` devolve 4 e `status: 'recusada'` devolve 1; `codfornec: 1042` recorta; `busca: 'BEBIDA LACTEA'` devolve só as do 5301; `sgcSolicitacoesListarTotal` bate com o `SELECT COUNT(*)` feito no próprio teste com os mesmos filtros; `limite: 5` devolve 5 e a soma das páginas é o total |
| C-021 · RF-019 | `smoke/008-solicitacoes.mjs` | `sgcSolicitacoesListar` sem filtro **como `leo`** devolve só linhas com `CRIADO_POR = leo` (as 4 dele), inclusive com `minhas: 0`; como `gil`, devolve as de todos; `minhas: 1` como `gil` devolve as de `gil`; `sgcSolicitacaoCarregar` de uma solicitação de `gil` chamada por `leo` devolve `ok: false` |
| C-022 · RF-013 | `smoke/008-solicitacoes.mjs` | `sgcSolicitacaoCarregar` da solicitação `vinculada` devolve 5 linhas de histórico na ordem `criada`, `aprovada`, `vinculada`, `desvinculada`, `vinculada`, cada uma com `POR_NOME` e `EM`, e o detalhe do vínculo citando o título do pedido |
| C-023 · RF-021 | `tests/solicitacoes.test.mjs` | `colunasDoCsv()` devolve as 9 colunas na ordem da tela e `linhaDoCsv` de uma linha com detalhe devolve os 9 valores correspondentes; com detalhe `null`, os dois eixos saem como "Sem dado" |
| RN-016 | `tests/solicitacoes.test.mjs` | `lotesDePares` de 120 pares devolve 1 lote e de 121 devolve 2; nenhum lote passa de 4000 caracteres; `LIMITES_PADRAO` é `{ 30, 60, 90 }`; `montarPares` ignora alvo sem `AVALIADO_EM`, sem produto ou sem filial, e não repete par idêntico |
| RNF-001 | `smoke/008-solicitacoes.mjs` | o bloco da montagem é **uma** SF: `sgcSolicitacoesDaMontagem` devolve as 3 linhas com cliente, vendedor e justificativa em uma chamada — nenhuma outra SF é necessária para desenhá-lo |
| RNF-003 | `tests/solicitacoes.test.mjs` | coberto por RN-016 (120 por lote, teto de 4000) |

- **Backend:** `backend/simulator/smoke/008-solicitacoes.mjs`, um `teste()` por linha, título
  começando pelo id do cenário/regra. As **duas** consultas ao WinThor asserem **contagem >
  0** (vazio não é verde): `sgcWintClienteBuscar` nas três formas de busca e
  `sgcWintRastreioSolicitacoes` com os 6 pares.
- **Ordem dentro do arquivo**, porque a suíte muda o estado do próprio seed: primeiro o que
  só lê (C-018, C-014, C-015, C-020, C-021, C-022, C-011 — que move o card e o devolve ao
  fim, e C-007, que conta as 3 do bloco); depois o que grava (C-001, C-002, C-003, C-006,
  C-005, C-004, C-008, C-013, C-009, C-010, C-012, C-019). Cada cenário que grava opera uma
  solicitação distinta, conforme a coluna *Serve a* do seed; nenhum deles depende de um
  total absoluto do banco (R-045).
- **Frontend:** `frontend/tests/solicitacoes.test.mjs` com `node --test` sobre
  `src/lib/solicitacoes.ts`; as chaves novas de persona entram em
  `frontend/tests/permissoes.test.mjs` (arquivo da 002).
- **Seed extra para o smoke:** nenhum além do `seed/008-solicitacoes.mjs`; o usuário
  `RESTRICTED` de C-019 é criado dentro do próprio teste, como a 007 faz.

## Dependências entre specs

**Consome da 002 (quadro):**

- `SGC_PEDIDO` — lê `ID_CARD`, `CODFORNEC`, `CODFILIAL` (o recorte do bloco).
- `SGC_FASE` — as 10 chaves, base da situação derivada; nenhuma regra usa id nem nome de fase.
- `PERSONA_EFETIVA`/`guardaPersonaDe` — copiados literalmente (R-013).
- **Pede** duas colunas em `sgcPedidoCarregar` (RF-022): `COALESCE(I.ID_SOLICITACAO, 0) AS ID_SOLICITACAO`
  e o nome do vendedor por subconsulta sobre `SGC_SOLICITACAO` + `INT_USER`
  (`SOLICITACAO_VENDEDOR`), na mesma execução — é o que dá a etiqueta "Solicitação de
  &lt;vendedor&gt;" sem custo novo, e é o que a aba Itens consulta para saber se precisa
  desvincular ao remover.

**Consome da 003 (itens):**

- `SGC_PEDIDO_ITEM` — grava `ID_SOLICITACAO` e a linha do item; lê `QT_PEDIDA` e `STATUS`
  (inclusive `bo`, valor da 007).
- `sgcWintBuscarProduto` — a busca de produto do diálogo é a mesma (R-052), inclusive o
  componente `abas/BuscarProduto.tsx`.
- `pedidoEmAnalise(cardId, usuarioId)` e a frase `FORA_DA_ANALISE` — copiados para o
  `add-011`, como o `add-010` copiou o preâmbulo do `add-006`.
- `sgcEscItemGravar` — **nada muda nele**: por não listar `ID_SOLICITACAO` no
  `ON DUPLICATE KEY UPDATE`, ele preserva a origem quando a aba regrava os itens.
- `sgcEscItemRemover` e `sgcAnaliseSair` — os dois gatilhos do desvínculo; nenhum dos dois
  é alterado. Quem chama o par histórico + desvincular é a **tela** (integrador, S4),
  depois de cada um deles.

**Consome da 001 (fornecedores):** `sgcWintFornecedores` (nome do fornecedor do produto,
buscado pelo código) e `sgcWintFiliais` (seletor de filial) — as mesmas que a
`NovoPedidoPage` já usa.

**Consome da 005/007:** `lib/csv.ts` (R-037).

**Fornece:**

- `SGC_SOLICITACAO` e `SGC_SOLICITACAO_HISTORICO` — é o que a **009** lê para a aderência
  das solicitações, o funil e o ranking por vendedor (R-057). O contrato que a 009 recebe:
  `STATUS` tem só os 4 valores gravados; a **situação de atendimento não é coluna** — é a
  expressão `SITUACAO` documentada acima, que a 009 copia ou recalcula sobre as mesmas
  junções; `AVALIADO_EM` é a data de decisão; `CRIADO_POR` é o vendedor.
- `sgcEscSolicitacaoDesvincular` e `sgcEscSolicitacaoHistoricoInserir` — o par que o
  integrador chama no fluxo de remoção e de zeragem de item da 003 (R-063), nesta ordem:
  **histórico primeiro** (precisa do `ID_CARD` ainda preenchido), desvínculo depois. Ambas
  são escritas de tela (`:VAR_USER`), chamadas de `Itens.tsx` e de `verificar-saida.ts`;
  entrada `{ id: 0, idCard, evento: 'desvinculada', detalhe, em }` e `{ idCard, atualizadoEm }`.
- `BlocoSolicitacoes` como componente que recebe `ExtensaoContexto` — entra em
  `BLOCOS_POR_FASE.analise` **antes** de `'itens'` (R-050/R-054); **não** é aba.
- As chaves `verSolicitacoes`, `criarSolicitacao` e `avaliarSolicitacao` de
  `lib/permissoes.ts` e o item de menu "Solicitações" do grupo Compras (R-056).
- `lib/solicitacoes.ts` — `rotuloSituacao` e `prioridadeDe` servem a qualquer tela que
  mostre solicitação (a 009 mostra o funil por situação).

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | O rastreio reusa a **forma** da consulta do p-45547 (`{{pares}}` + `CONNECT BY`), e o simulador ganha dois shims | Reescrever a explosão como tabela derivada `SELECT … UNION ALL SELECT …` montada pela tela | A tela montando `SELECT` é SQL montado na tela, que R-059 proíbe no projeto; e a forma legada está provada em Oracle de produção. O custo é um shim escalar e uma reescrita textual num arquivo do integrador, exatamente o que a 005 pediu em R-043 |
| D-002 | A situação de atendimento é **expressão SQL derivada**, não coluna | Gravar a situação e sincronizar por cron, como os 13 status do legado | O legado tinha 13 status gravados e um script de correção retroativa (`update-sf-status-solic.mjs`) porque eles envelheciam: card movido sem passar pela rotina deixava a solicitação mentindo. Derivar custa três `LEFT JOIN` e nunca desatualiza. É também o que tira da onda 3 o "cron que conta sem reler" (dívida da revisão) |
| D-003 | A linha `criada` do histórico é **derivada** de `CRIADO_POR`/`CRIADO_EM`; só as outras cinco são gravadas | Gravar `criada` junto do registro | Gravar exigiria descobrir o id recém-inserido (uma releitura a mais) ou uma segunda instrução dentro da mesma SF; a linha da solicitação **é** o registro da criação, e derivá-la não perde nada. Todos os seis eventos continuam existindo na leitura |
| D-004 | Duas SFs de histórico — `…HistoricoInserir` (`:VAR_USER`) e `…HistoricoRegistrar` (`{{usuarioId}}`) | Uma só, com `COALESCE(NULLIF(:VAR_USER, 0), {{usuarioId}})` | Aceitar `usuarioId` como identidade quando a sessão não resolve é literalmente a dívida D-06 da onda 1. Duas SFs, duas identidades, uma instrução cada — o mesmo arranjo de `sgcEscItemRemover`/`sgcEscItemRemoverZerados` (003) e `sgcEscPedidoPrevisaoBo`/`sgcEscPedidoAlertaBo` (007) |
| D-005 | O desvínculo tem **uma** SF, e o critério é "não existe item vivo com quantidade", não o `CODPROD` | Uma SF por caminho (remoção de item × zeragem ao sair da Análise), com `codprod` | O mesmo predicado cobre os dois caminhos (o item removido já está `removido`; o zerado já foi removido pelo `sgcAnaliseSair`), é idempotente, e evita que o chamador precise saber qual produto era de qual solicitação. É também o que permite chamar o par com só `{ idCard }` |
| D-006 | Incluir no pedido **não** recalcula o total | Chamar `sgcEscPedidoTotal` (003) ao fim do `sgcSolicitacaoIncluirNoPedido` | O item nasce com custo zero (o custo vem da análise do ERP): o recálculo somaria zero e gastaria uma execução do orçamento de RNF-002. O `sgcItensGravar` recalcula na primeira gravação da lista |
| D-007 | O item criado pela solicitação nasce com `CODEPTO`/`CODSEC`/`PRECO_CUSTO` zerados | Consultar o ERP dentro do `sgcSolicitacaoIncluirNoPedido` para preencher | Seria uma execução a mais numa ação frequente, para um dado que o `sgcItensGravar` da 003 traz na primeira gravação da lista — e que a compradora precisa revisar de qualquer modo. O único efeito de borda é o limite de cobertura cair no do fornecedor até lá, que é o comportamento correto para item não analisado |
| D-008 | Quantidade **preservada** quando o produto já está no pedido | A inclusão sobrescrever a quantidade com a solicitada | Quem decide quanto comprar é a montagem: sobrescrever apagaria uma decisão já tomada por causa de uma demanda de 24 unidades. Item removido ou zerado não é decisão viva, e por isso volta a valer a quantidade solicitada (RN-010) |
| D-009 | `criarSolicitacao` fica com admin e comercial | Dar também a analista e gestor | O autor **é** o vendedor (RN-002): uma solicitação registrada por um comprador seria uma demanda sem cliente comercial por trás, e envenenaria o ranking por vendedor da 009. Admin entra porque admin tem tudo |
| D-010 | O recorte "o comercial só vê as suas" é **cláusula de SQL**, não filtro de tela | Filtrar na tela pelo `usuarioId` da sessão | Filtro de tela não é recorte: a SF continuaria devolvendo tudo a quem chamasse pelo SDK (é o achado A8 da onda 2, telas Fiscal sem porteiro). No servidor custa um `EXISTS` que a guarda de persona já usa |
| D-011 | "Comprou em outra filial" é **classe própria** | Manter a marca dentro de "atendido", como no legado | R-055 fixa as cinco classes do eixo do cliente; e a distinção é acionável: um cliente atendido por outra filial diz que a demanda existia e que o estoque foi para o lugar errado — conclusão diferente de "comprou aqui" |
| D-012 | O bloco da montagem tem `LIMIT 100` sem paginação | Paginar o bloco com uma SF de total | Paginar um bloco de card custaria uma segunda execução por abertura (RNF-001) para um caso que não existe em operação; o teto fica documentado e visível no texto da SF |
| D-013 | Os padrões dos três limites são **30 / 60 / 90 dias** | Alinhar o de cobertura ao padrão de 35 dias de `SGC_COBERTURA` (003) | São perguntas diferentes: os 35 dias da 003 limitam **quanto comprar** antes de a mercadoria existir; aqui se mede **o que já entrou** e um item sazonal legitimamente cobre mais tempo. 30/60/90 são os limites que o p-45547 usa hoje e que a área calibrou; e, por R-055, são parâmetros da tela — quem opera ajusta sem release |
| D-014 | O seed cria produtos (5301–5305) e clientes (9201–9205) **próprios**, na filial 3 | Semear vendas sobre os produtos e clientes das 003/007 | As vendas da 003 têm data fixa (2026-08-15) e as datas desta spec são relativas à aprovação: o mesmo teste daria um resultado hoje e outro no ano que vem. Produtos próprios numa filial que ninguém mais consulta também mantêm intactas as contagens de C-001 da 003 e C-002 da 007 |
| D-015 | O teste de C-011 **move o card** pelas 10 fases por `UPDATE` direto e o devolve ao fim | Semear um card por fase (10 cards) | A situação é uma expressão pura sobre a chave da fase: 10 cards provariam a mesma coisa custando 10 cards a mais no banco compartilhado do smoke, com risco de mexer nas listagens globais da 005 e da 007 (R-045) |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Os shims de `REGEXP_SUBSTR`/`CONNECT BY` não saírem, ou saírem errados | o rastreio não é testável localmente, ou o simulador vira fonte de falso positivo | o pedido está escrito com a reescrita exata (seção *Dialeto*); a alternativa aceitável é a suíte 008 **falhar alto**, nunca um shim que devolva linha plausível. A consulta em si é porte literal de uma SF em produção no p-45547 |
| `PCCLIENT.CGCENT` ou `PCMOV.DTCANCEL` não entrarem no `schema-winthor.mjs` | `sgcWintClienteBuscar` e o rastreio quebram por coluna inexistente no `sim:check` | as duas estão na tabela de pedidos ao integrador e o `sim:check` acusa na primeira rodada |
| `sgcPedidoCarregar` não ganhar `ID_SOLICITACAO`/`SOLICITACAO_VENDEDOR` | a etiqueta de origem some e a aba Itens não sabe quando chamar o desvínculo | o desvínculo é **idempotente e sem `codprod`**: chamar o par a cada remoção funciona mesmo sem a coluna (custa 2 execuções sempre, em vez de só quando há solicitação). RF-022 é `should`, não `must` |
| Descrição de produto ou nome de cliente com aspas quebrar o `INSERT` | gravação falha ou injeta | `texto()` do preâmbulo tira caractere de controle e corta o tamanho; o escape da aspa é do runtime (A-11 da onda 2, que proibiu dobrar duas vezes); o smoke registra uma solicitação de um produto com apóstrofo na descrição |
| Dois compradores incluindo a mesma solicitação ao mesmo tempo | vínculo duplicado, ou dois itens | `sgcEscSolicitacaoVincular` exige `ID_CARD = 0`: a corrida perde e o JS relê e devolve `ok: false` com o título do pedido que ganhou. O item é `UNIQUE (ID_CARD, CODPROD)` com upsert (RN-009) |
| A solicitação vinculada a um card que depois é excluído | situação derivada de uma fase que não existe | a junção exige `EXCLUIDO_EM IS NULL` e o `CASE` cai em `sem_pedido`; a solicitação volta a aparecer nas filas como demanda em aberto |
| O lote de 120 estourar 4000 caracteres com códigos de produto e cliente longos | a consulta falha no Oracle | `lotesDePares` fatia **por caractere também**, não só por contagem, e o teste prova o teto |

## Complexity Tracking

Vazio: nenhuma violação de princípio.

## Pedidos ao 000

1. **Duas SFs a mais** que a linha 008 da tabela do 000: `sgcEscSolicitacaoHistoricoRegistrar`
   (7857, a gêmea interna de `sgcEscSolicitacaoHistoricoInserir`, D-004) e nenhuma outra —
   as sete nomeadas pelo 000 estão todas presentes e com o nome exato. O motivo é a regra
   "uma identidade por SF" (D-06 da onda 1); o precedente é `sgcEscItemRemover` /
   `sgcEscItemRemoverZerados` da 003.
2. **`sgcEscSolicitacaoDesvincular` é escrita de TELA** (`:VAR_USER`), não interna: os dois
   caminhos de R-063 (remoção de item e zeragem ao sair da Análise) partem da tela, que tem
   sessão. Com isso o `add-006` da 003 **não muda**, e nenhuma escrita desta spec aceita
   `usuarioId` vindo de um formulário.
3. **A linha `criada` do histórico é derivada**, não gravada (D-003). Os seis valores de
   `EVENTO` do 000 continuam aparecendo na leitura.
4. **Duas colunas em `sgcPedidoCarregar`** (002): `ID_SOLICITACAO` e `SOLICITACAO_VENDEDOR`
   no item, para a etiqueta de origem de RF-022 sem execução nova.
5. **Duas colunas nas `PC*`** (R-062): `PCCLIENT.CGCENT` (já previsto) e `PCMOV.DTCANCEL`.
6. **Dois shims de dialeto** (`REGEXP_SUBSTR` e o gerador `CONNECT BY`), no precedente de
   R-043.
7. **`BLOCOS_POR_FASE.analise` passa a `['solicitacoes', 'itens', 'alertas']`** (R-054: o
   bloco vem **antes** de Itens), e `lib/conteudo-da-fase.ts` ganha o valor `'solicitacoes'`
   no tipo `Bloco`.
