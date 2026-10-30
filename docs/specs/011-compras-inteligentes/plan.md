# Plan: Compras inteligentes — o que comprar hoje, por fornecedor e filial

**Spec:** `spec.md` · **Data:** 2026-09-16

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; os cenários vêm de O4-01, O4-02, O4-04 e das decisões R-081..R-088 e R-091..R-096 do 000 |
| Backend escrito local, executado no sandbox | sim | um arquivo novo, `backend/add-013-compras-inteligentes.mjs`; as duas tabelas novas e o `PUBLISH_ORDER` são pedidos à base da onda 4 (arquivos compartilhados). Nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL vive no `setup-backend.mjs` e a migration é gerada pelo sandbox. A onda 4 **edita o `CREATE`**, sem `ALTER` |
| Leitura e escrita por Server Function | sim | a tela usa `linhas()`/`acao()` de `src/lib/mitra-api.ts`; **toda** escrita é SF SQL guardada por `:VAR_USER`, chamada direto da tela — nenhuma SF JavaScript, nenhum cron (R-081, contrato da onda 4) |
| Simulador cobre a feature | sim | `simulator/seed/011-compras-inteligentes.mjs` só insere linhas; as três colunas novas de `PCEST` e os shims do dialeto são pedidos à base (R-096); `sim:check` roda as 9 leituras |
| Testes automatizados obrigatórios | sim | 25 cenários e 19 regras mapeados em `backend/simulator/smoke/011-compras-inteligentes.mjs` e em `frontend/tests/ressuprimento.test.mjs`; toda consulta Oracle assere contagem > 0 |
| Design tokens, sem cor literal | sim | `page.tsx` (`PageHeader`, `Panel`, `Toolbar`, `Tabs`, `Table`, `Status`, `Code`, `Dash`, `GradeKpi`, `Kpi`…); zero hex, zero `style={{}}`, zero classe Tailwind solta na página |
| Simplicidade | sim | nenhuma dependência nova; nenhuma tabela de resultado (o cálculo é recalculado, nunca persistido); a fórmula é uma função pura em `src/lib/ressuprimento.ts`; o carrinho reusa o caminho de `/pedidos/novo` e o upsert em lote da 003, sem SF de orquestração |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`; leitura do WinThor por JDBC Oracle (`jdbcId` resolvido por nome no `isEntrypoint()`, como em `add-006-itens.mjs`)
- **Reuso identificado:** `lib/compras.ts` da 003 (`curvaAbc`, `arredondarPorCaixa`, `unidadesPorCaixa`, `itemDeLinha`), `lib/cobertura.ts` da 012 (`limiteDeCobertura` com a curva — chamado **só pela tela**, R-111), `lib/csv.ts` (`textoCsv`/`baixarCsv`, R-037), `lib/permissoes.ts`, `lib/formato.ts`, `lib/mitra-api.ts`, `lib/quadro.ts`; `sgcCustoUnidadesPorCaixa` (7306, 003), `sgcCoberturaListar` (7307, 003), `sgcFornecedorListar`/`sgcFornecedorCarregar` (001), `sgcEscPedidoCriar` (7250, 002), `sgcItensGravar` (7309, 003), `api.cardCriar` da lib; `page.tsx` inteiro
- **Dependência nova:** nenhuma

## Modelo de dados

Duas tabelas novas, as duas no `setup-backend.mjs` (arquivo da base da onda 4). Convenções do
000: colunas UPPERCASE, datas em `VARCHAR(10)`/`VARCHAR(19)`, sem `FOREIGN KEY`, `ID`
autoincremento, dinheiro `DECIMAL(15,2)`, quantidade `DECIMAL(15,3)`.

### `SGC_PARAMETRO_COMPRA` (R-086)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `CODFORNEC` | `INT NOT NULL` | mesmo tipo de `SGC_PEDIDO.CODFORNEC` (C-14) |
| `CODFILIAL` | `VARCHAR(10) NOT NULL` | idem |
| `CODPROD` | `INT NOT NULL DEFAULT 0` | **0 = linha do fornecedor**; > 0 = linha do SKU |
| `COBERTURA_DIAS` | `INT NOT NULL DEFAULT 0` | `0` = herda (RN-004) |
| `LEAD_TIME_DIAS` | `INT NOT NULL DEFAULT 0` | `0` = herda (RN-003) |
| `GATILHO_DIAS` | `INT NOT NULL DEFAULT 0` | `0` = herda (RN-005) |
| `SILENCIADO_ATE` | `VARCHAR(10)` | `''` = não silenciado (RN-013) |
| `MOTIVO_SILENCIO` | `VARCHAR(500)` | |
| `ATUALIZADO_POR` | `INT` | |
| `ATUALIZADO_EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_SGC_PARAMETRO_COMPRA (CODFORNEC, CODFILIAL, CODPROD)` — é o que faz os dois
upserts (parâmetro e silenciamento) conviverem na mesma linha sem se apagarem.
Índice `IX_SGC_PARAMETRO_COMPRA_FORN (CODFORNEC, CODFILIAL)`.

### `SGC_VENDA_DESCONSIDERADA` (R-087)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `NUMTRANSITEM` | `INT NOT NULL` | a identidade da venda no ERP — chave única (R-087) |
| `CODPROD` | `INT NOT NULL` | |
| `CODFILIAL` | `VARCHAR(10) NOT NULL` | |
| `DTMOV` | `VARCHAR(10)` | foto da data, para a lista não reconsultar o ERP |
| `QUANTIDADE` | `DECIMAL(15,3)` | foto da quantidade, idem |
| `MOTIVO` | `VARCHAR(500)` | |
| `POR` | `INT` | |
| `EM` | `VARCHAR(19)` | |

`UNIQUE KEY UK_SGC_VENDA_DESCONSIDERADA (NUMTRANSITEM)`.
Índice `IX_SGC_VENDA_DESCONSIDERADA_PROD (CODFILIAL, CODPROD)`.

### `SGC_PEDIDO.ORIGEM` ganha um valor

`ORIGEM VARCHAR(20) NOT NULL DEFAULT 'manual'` (`setup-backend.mjs`) passa a aceitar
`compras_inteligentes`, ao lado de `manual` e `agenda` — **só o comentário muda** (R-091):
a palavra tem exatamente 20 caracteres e cabe no tipo atual. Nenhuma coluna nova.

### Colunas novas em `PCEST` (ERP, só no simulador — R-096)

`QTBLOQUEADA`, `QTINDENIZ` e `QTRESERV` (`DECIMAL(15,3)`) em
`backend/simulator/schema-winthor.mjs`. Na plataforma elas já existem no Oracle; aqui é só
DDL, e o seed desta spec preenche as linhas.

### Só leitura, de outras specs

`SGC_COBERTURA` (003, com as colunas de curva da 012) para o alvo por curva;
`SGC_PEDIDO` + `KB_CARD` + `SGC_FASE` (002) para o bloqueio do carrinho e para a eficiência;
`SGC_PEDIDO_ITEM` (003) para a eficiência. Escrita nenhuma nelas por esta spec — os itens e a
capa do pedido são gravados pelas SFs **da 002 e da 003**, chamadas da tela (R-091).

## Contratos de backend

Tudo em `backend/add-013-compras-inteligentes.mjs`, que exporta `definitions`. Ids locais:
**8101–8109** (leitura) e **8150–8154** (escrita), R-081. Filtro desligado é `''` no texto e
`0` no número. **Nenhuma SF JavaScript, nenhum cron** (contrato da onda 4).

### Leituras — WinThor (Oracle, `jdbcId` resolvido por nome)

| Nome | Tipo | Entrada (`{{param}}`, valor desligado) | Saída | Atende |
|---|---|---|---|---|
| `sgcWintRessuprimento` | SQL (Oracle) | `codfornec` (0), `codfilial` (''), `dataInicio` (''), `dataFim` (''), `diasPeriodo` (0), `excluir` (`0`, **fragmento**) | uma linha por produto ativo: `CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA_ERP, CUSTO_ULT_ENTRADA, DT_ULT_ENTRADA, DT_ULT_SAIDA, ESTOQUE_TOTAL, QT_BLOQUEADA, QT_INDENIZ, QT_RESERV, ESTOQUE_ATUAL, QT_PEDIDA_ERP, QT_TRANSITO, ESTOQUE_EM_TRANSITO, LEAD_TIME_MEDIDO, VENDA_PERIODO, VENDA_PUBLICA, CONSUMO_DIARIO, CONSUMO_DIARIO_PUBLICO, VOLATILIDADE_DIARIA` | RF-001..RF-005, RF-013 |
| `sgcWintProdutoHistorico` | SQL (Oracle) | `codprod` (0), `codfilial` (''), `meses` (0) | `MES, SAIDAS, ENTRADAS, SAIDAS_PUBLICAS` | RF-020 |
| `sgcWintProdutoUltimasCompras` | SQL (Oracle) | `codprod` (0) | `DT_ENTRADA, NUMTRANSENT, NUMNOTA, CODFILIAL, QUANTIDADE, PRECO_UNITARIO, VALOR_TOTAL` (máx. 10) | RF-020 |
| `sgcWintProdutoEstoqueFiliais` | SQL (Oracle) | `codprod` (0) | `CODFILIAL, FILIAL, ESTOQUE_TOTAL, ESTOQUE_ATUAL, ESTOQUE_EM_TRANSITO, VENDA_3_MESES, DT_ULT_SAIDA` | RF-020 |
| `sgcWintProdutoVendas` | SQL (Oracle) | `codprod` (0), `codfilial` (''), `dataInicio` (''), `dataFim` ('') | `NUMTRANSITEM, DTMOV, QUANTIDADE, PRECO_VENDA, VALOR_TOTAL, CODCLI, CLIENTE, PUBLICO` (máx. 50, maiores primeiro) | RF-012 |

**`sgcWintRessuprimento`** — a consulta principal. É o porte da forma de
`p-45547/backend/update-estoque-centralizado.mjs` (CTEs `PRODUTOS_BASE` `:38-64`,
`RESSUPRIMENTO_PRODUTO` `:82-97`, `DIAS`/`VENDAS_DIA`/`DEMANDA_DIA` `:98-128`) com as quatro
emendas do 000: **R-082** (devolve medidas, não fórmula: saem `FATOR_Z`, `ESTOQUE_SEGURANCA`,
`NECESSIDADE_ESTRITA`, `ESTOQUE_MAXIMO`, `QUANTIDADE_SUGERIDA`, `COBERTURA_ATUAL_DIAS`,
`DIAS_GATILHO` e `STATUS_COMPRA`, que passam a ser da regra pura — e some a curva dupla
faturamento × rentabilidade, R-088), **R-084** (a venda pública **não** é excluída no `WHERE`:
vem somada e segregada, em coluna própria, e também no consumo ponderado, para o seletor da
tela poder subtrair), **R-085** (estoque líquido e trânsito) e **R-087** (`{{excluir}}`).

```sql
WITH
  PRODUTOS_BASE AS (
    SELECT
      P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE,
      NVL(P.CODEPTO, 0) AS CODEPTO,
      NVL(P.CODSEC, 0)  AS CODSEC,
      NVL(P.QTUNITCX, 0) AS UN_POR_CAIXA_ERP,
      NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA,
      TO_CHAR(E.DTULTENT, 'YYYY-MM-DD')   AS DT_ULT_ENTRADA,
      TO_CHAR(E.DTULTSAIDA, 'YYYY-MM-DD') AS DT_ULT_SAIDA,
      NVL(E.QTEST, 0)        AS ESTOQUE_TOTAL,
      NVL(E.QTBLOQUEADA, 0)  AS QT_BLOQUEADA,
      NVL(E.QTINDENIZ, 0)    AS QT_INDENIZ,
      NVL(E.QTRESERV, 0)     AS QT_RESERV,
      GREATEST(0, NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0)) AS ESTOQUE_ATUAL,
      NVL(E.QTPEDIDA, 0)  AS QT_PEDIDA_ERP,
      NVL(T.QTTRANSITO, 0) AS QT_TRANSITO,
      NVL(E.QTPEDIDA, 0) + NVL(T.QTTRANSITO, 0) AS ESTOQUE_EM_TRANSITO
    FROM PCPRODUT P
    LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
    LEFT JOIN (
      SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QTTRANSITO
      FROM PCESTTRANSITO GROUP BY CODPROD, CODFILIAL
    ) T ON T.CODPROD = P.CODPROD AND T.CODFILIAL = '{{codfilial}}'
    WHERE P.CODFORNEC = {{codfornec}}
      AND P.CODFORNEC <> 999999
      AND NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
      AND NVL(P.CODEPTO, 0) NOT IN (4, 7)
  ),
  RESSUPRIMENTO_PRODUTO AS (
    SELECT
      M.CODPROD,
      CEIL(AVG(GREATEST(TRUNC(M.DTMOV - O.DTEMISSAO), 1))) AS LEAD_TIME_MEDIDO
    FROM PCPEDIDO O
    JOIN PCMOV M ON M.NUMPED = O.NUMPED AND M.CODOPER = 'E'
    JOIN PRODUTOS_BASE PB ON PB.CODPROD = M.CODPROD
    WHERE O.CODFORNEC = {{codfornec}}
      AND M.CODFILIAL = '{{codfilial}}'
      AND O.DTEMISSAO IS NOT NULL
      AND M.DTMOV IS NOT NULL
      AND M.NUMPED IS NOT NULL
      AND M.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE), -12)
    GROUP BY M.CODPROD
  ),
  DIAS AS (
    SELECT
      TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') + (LEVEL - 1) AS DIA,
      GREATEST({{diasPeriodo}}, 1) - LEVEL AS DIAS_ATE_FIM
    FROM DUAL
    CONNECT BY LEVEL <= GREATEST({{diasPeriodo}}, 1)
  ),
  VENDAS_DIA AS (
    SELECT
      M.CODPROD,
      TRUNC(M.DTMOV) AS DIA,
      SUM(M.QT) AS QT_DIA,
      SUM(CASE WHEN NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15, 20) THEN M.QT ELSE 0 END) AS QT_DIA_PUBLICA
    FROM PCMOV M
    JOIN PRODUTOS_BASE PB ON PB.CODPROD = M.CODPROD
    LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
    WHERE M.CODOPER = 'S'
      AND M.QT > 0
      AND M.CODFILIAL = '{{codfilial}}'
      AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
      AND M.NUMTRANSITEM NOT IN ({{excluir}})
    GROUP BY M.CODPROD, TRUNC(M.DTMOV)
  ),
  DEMANDA_DIA AS (
    SELECT
      PB.CODPROD,
      NVL(V.QT_DIA, 0)         AS QT_DIA,
      NVL(V.QT_DIA_PUBLICA, 0) AS QT_DIA_PUBLICA,
      POWER(0.85, D.DIAS_ATE_FIM) AS PESO
    FROM PRODUTOS_BASE PB
    CROSS JOIN DIAS D
    LEFT JOIN VENDAS_DIA V ON V.CODPROD = PB.CODPROD AND V.DIA = D.DIA
  ),
  METRICAS AS (
    SELECT
      D.CODPROD,
      SUM(D.QT_DIA)         AS VENDA_PERIODO,
      SUM(D.QT_DIA_PUBLICA) AS VENDA_PUBLICA,
      ROUND(SUM(D.QT_DIA * D.PESO)         / NULLIF(SUM(D.PESO), 0), 4) AS CONSUMO_DIARIO,
      ROUND(SUM(D.QT_DIA_PUBLICA * D.PESO) / NULLIF(SUM(D.PESO), 0), 4) AS CONSUMO_DIARIO_PUBLICO,
      ROUND(SQRT(GREATEST(AVG(D.QT_DIA * D.QT_DIA) - AVG(D.QT_DIA) * AVG(D.QT_DIA), 0)), 4) AS VOLATILIDADE_DIARIA
    FROM DEMANDA_DIA D
    GROUP BY D.CODPROD
  )
SELECT
  PB.CODPROD, PB.DESCRICAO, PB.EMBALAGEM, PB.UNIDADE, PB.CODEPTO, PB.CODSEC,
  PB.UN_POR_CAIXA_ERP, PB.CUSTO_ULT_ENTRADA, PB.DT_ULT_ENTRADA, PB.DT_ULT_SAIDA,
  PB.ESTOQUE_TOTAL, PB.QT_BLOQUEADA, PB.QT_INDENIZ, PB.QT_RESERV, PB.ESTOQUE_ATUAL,
  PB.QT_PEDIDA_ERP, PB.QT_TRANSITO, PB.ESTOQUE_EM_TRANSITO,
  NVL(R.LEAD_TIME_MEDIDO, 0)       AS LEAD_TIME_MEDIDO,
  NVL(M.VENDA_PERIODO, 0)          AS VENDA_PERIODO,
  NVL(M.VENDA_PUBLICA, 0)          AS VENDA_PUBLICA,
  NVL(M.CONSUMO_DIARIO, 0)         AS CONSUMO_DIARIO,
  NVL(M.CONSUMO_DIARIO_PUBLICO, 0) AS CONSUMO_DIARIO_PUBLICO,
  NVL(M.VOLATILIDADE_DIARIA, 0)    AS VOLATILIDADE_DIARIA
FROM PRODUTOS_BASE PB
LEFT JOIN RESSUPRIMENTO_PRODUTO R ON R.CODPROD = PB.CODPROD
LEFT JOIN METRICAS M ON M.CODPROD = PB.CODPROD
ORDER BY PB.DESCRICAO
```

Sete decisões dentro dessa SQL, todas com motivo:

1. **`DIAS` existe para o dia sem venda entrar na média** (RN-001). Sem o calendário,
   `SUM(qt × peso) / SUM(peso)` seria a média **dos dias com venda** — um item que vende 60
   uma vez por mês teria consumo 60/dia. É o único motivo do `CROSS JOIN`.
2. **O peso vem de `DIAS_ATE_FIM`, não de uma subtração de datas.** No Oracle
   `dataFim − D.DIA` daria dias; no SQLite daria zero, e um peso 1 em todo dia é exatamente o
   "shim que devolve valor plausível e errado" que o `mysql-dialect.mjs` proíbe no cabeçalho.
   Como `DIA = dataInicio + (LEVEL − 1)`, a distância até o fim é `diasPeriodo − LEVEL`, que é
   aritmética de inteiro e roda igual nos dois bancos. `{{diasPeriodo}}` vem da tela
   (`fim − início + 1`), pelo mesmo motivo.
3. **Lead time com `TRUNC(M.DTMOV - O.DTEMISSAO)`**, e não `TRUNC(a) − TRUNC(b)`: é a forma
   que o dialeto já traduz (`mysql-dialect.mjs:482-483`, `TRUNC(alias.COL - alias.COL)` →
   `JULIANDAY`). Mesmo resultado em Oracle, zero shim novo.
4. **`AVG(x²) − AVG(x)²` no lugar de `STDDEV_POP`** (R-100 tirou o shim). `STDDEV_POP` é
   função de **agregação**, e o simulador registra funções escalares (`db.function` em
   `mysql-dialect.mjs:171-172`); um agregado exigiria `db.aggregate`, que é mais novo no
   `node:sqlite` que o resto do arquivo. A identidade da variância populacional dá o mesmo
   número com `AVG` (nativo nos dois) + `SQRT` e `GREATEST` (shims que R-096 já pede).
5. **Sem `LIMIT/OFFSET`.** A curva ABC (RN-010) é acumulada **sobre o fornecedor inteiro**:
   paginar no servidor daria uma curva por página. A lista volta inteira e a tela pagina,
   filtra e ordena localmente (RNF-005). `ponytail:` teto prático de ~2.000 produtos por
   fornecedor; acima disso, paginar exigiria calcular a curva numa segunda passada.
6. **`{{excluir}}` é fragmento** (lista de inteiros sem aspas), `0` quando não há nenhuma —
   `NUMTRANSITEM` começa em 1, então `NOT IN (0)` não exclui nada. Teto de 500 por chamada
   (R-087, literal do Oracle / `ORA-01795`).
7. **A venda pública fica na demanda** (R-084). O legado a excluía no `WHERE`
   (`update-estoque-centralizado.mjs:115`) e dava sugestão diferente da montagem do pedido
   para o mesmo produto (AN-04 A). Aqui ela vem em `VENDA_PUBLICA` e
   `CONSUMO_DIARIO_PUBLICO`, e quem decide é o seletor da tela.

**`sgcWintProdutoHistorico`** — 12 meses de venda e entrada (o legado usava
`TRUNC(SYSDATE, 'MM')`, TRUNC de dois argumentos; aqui é `TRUNC(SYSDATE)`, que o dialeto já
tem, e a janela passa a ser "12 meses a partir de hoje"):

```sql
SELECT
  TO_CHAR(M.DTMOV, 'YYYY-MM') AS MES,
  SUM(CASE WHEN M.CODOPER = 'S' THEN NVL(M.QT, 0) ELSE 0 END) AS SAIDAS,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) ELSE 0 END) AS ENTRADAS,
  SUM(CASE WHEN M.CODOPER = 'S' AND NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15, 20)
           THEN NVL(M.QT, 0) ELSE 0 END) AS SAIDAS_PUBLICAS
FROM PCMOV M
LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
WHERE M.CODPROD = {{codprod}}
  AND M.CODFILIAL = '{{codfilial}}'
  AND M.CODOPER IN ('S', 'E')
  AND M.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE), -{{meses}})
GROUP BY TO_CHAR(M.DTMOV, 'YYYY-MM')
ORDER BY MES
```

**`sgcWintProdutoUltimasCompras`** — `ROWNUM` literal dentro da subconsulta ordenada, como em
`sgcWintBuscarProduto` da 003:

```sql
SELECT * FROM (
  SELECT
    TO_CHAR(M.DTMOV, 'YYYY-MM-DD') AS DT_ENTRADA,
    NVL(M.NUMTRANSENT, 0) AS NUMTRANSENT,
    NVL(M.NUMNOTA, 0)     AS NUMNOTA,
    NVL(M.CODFILIAL, '')  AS CODFILIAL,
    NVL(M.QT, 0)          AS QUANTIDADE,
    NVL(M.PUNIT, 0)       AS PRECO_UNITARIO,
    NVL(M.QT, 0) * NVL(M.PUNIT, 0) AS VALOR_TOTAL
  FROM PCMOV M
  WHERE M.CODPROD = {{codprod}} AND M.CODOPER = 'E' AND M.QT > 0
  ORDER BY M.DTMOV DESC
) WHERE ROWNUM <= 10
```

**`sgcWintProdutoEstoqueFiliais`** — a posição do produto em todas as filiais, com o mesmo
estoque líquido de R-085:

```sql
SELECT
  E.CODFILIAL,
  NVL(F.RAZAOSOCIAL, E.CODFILIAL) AS FILIAL,
  NVL(E.QTEST, 0) AS ESTOQUE_TOTAL,
  GREATEST(0, NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0)) AS ESTOQUE_ATUAL,
  NVL(E.QTPEDIDA, 0) + NVL(T.QTTRANSITO, 0) AS ESTOQUE_EM_TRANSITO,
  NVL(E.QTVENDMES, 0) + NVL(E.QTVENDMES1, 0) + NVL(E.QTVENDMES2, 0) AS VENDA_3_MESES,
  TO_CHAR(E.DTULTSAIDA, 'YYYY-MM-DD') AS DT_ULT_SAIDA
FROM PCEST E
LEFT JOIN PCFILIAL F ON F.CODIGO = E.CODFILIAL
LEFT JOIN (
  SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QTTRANSITO
  FROM PCESTTRANSITO GROUP BY CODPROD, CODFILIAL
) T ON T.CODPROD = E.CODPROD AND T.CODFILIAL = E.CODFILIAL
WHERE E.CODPROD = {{codprod}}
ORDER BY E.CODFILIAL
```

**`sgcWintProdutoVendas`** — as vendas da janela, maiores primeiro (a venda atípica é a
grande), com o `NUMTRANSITEM` que vira a chave de `SGC_VENDA_DESCONSIDERADA`:

```sql
SELECT * FROM (
  SELECT
    M.NUMTRANSITEM,
    TO_CHAR(M.DTMOV, 'YYYY-MM-DD') AS DTMOV,
    NVL(M.QT, 0)    AS QUANTIDADE,
    NVL(M.PUNIT, 0) AS PRECO_VENDA,
    NVL(M.QT, 0) * NVL(M.PUNIT, 0) AS VALOR_TOTAL,
    NVL(M.CODCLI, 0) AS CODCLI,
    NVL(C.CLIENTE, '') AS CLIENTE,
    CASE WHEN NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15, 20) THEN 1 ELSE 0 END AS PUBLICO
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.CODPROD = {{codprod}}
    AND M.CODFILIAL = '{{codfilial}}'
    AND M.CODOPER = 'S'
    AND M.QT > 0
    AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  ORDER BY M.QT DESC, M.DTMOV DESC
) WHERE ROWNUM <= 50
```

### Leituras — banco interno

| Nome | Tipo | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|---|
| `sgcParametrosCompraListar` | SQL | `codfornec` (0), `codfilial` (''), `limite` (600), `offset` (0) | `ID, CODFORNEC, CODFILIAL, CODPROD, COBERTURA_DIAS, LEAD_TIME_DIAS, GATILHO_DIAS, SILENCIADO_ATE, MOTIVO_SILENCIO, ATUALIZADO_POR, ATUALIZADO_EM` | RF-010, RF-011 |
| `sgcVendasDesconsideradasListar` | SQL | `codfilial` (''), `codprod` (0), `limite` (500), `offset` (0) | `ID, NUMTRANSITEM, CODPROD, CODFILIAL, DTMOV, QUANTIDADE, MOTIVO, POR, EM` | RF-012 |
| `sgcPedidoAbertoDoFornecedor` | SQL | `codfornec` (0), `codfilial` (''), `limite` (5), `offset` (0) | `ID_CARD, TITULO, FASE_CHAVE, CRIADO_EM` | RF-018 |
| `sgcEficienciaComprador` | SQL | `compradorId` (0), `codfornec` (0), `dataInicio` (''), `dataFim` ('') | uma linha: `ITENS, ADERENTES, PERC_ADERENCIA` | RF-021 |

```sql
-- sgcParametrosCompraListar: a linha do fornecedor (CODPROD = 0) e as linhas de SKU,
-- numa consulta só; a tela separa as duas pela coluna.
SELECT ID, CODFORNEC, CODFILIAL, CODPROD, COBERTURA_DIAS, LEAD_TIME_DIAS, GATILHO_DIAS,
       COALESCE(SILENCIADO_ATE, '') AS SILENCIADO_ATE,
       COALESCE(MOTIVO_SILENCIO, '') AS MOTIVO_SILENCIO,
       ATUALIZADO_POR, ATUALIZADO_EM
FROM SGC_PARAMETRO_COMPRA
WHERE CODFORNEC = {{codfornec}} AND CODFILIAL = '{{codfilial}}'
ORDER BY CODPROD
LIMIT {{limite}} OFFSET {{offset}}
```

```sql
-- sgcVendasDesconsideradasListar: codprod 0 = todas as da filial (é o que alimenta
-- {{excluir}} da consulta principal); codprod > 0 = as do diálogo do SKU.
SELECT ID, NUMTRANSITEM, CODPROD, CODFILIAL, DTMOV, QUANTIDADE,
       COALESCE(MOTIVO, '') AS MOTIVO, POR, EM
FROM SGC_VENDA_DESCONSIDERADA
WHERE CODFILIAL = '{{codfilial}}'
  AND ({{codprod}} = 0 OR CODPROD = {{codprod}})
ORDER BY DTMOV DESC, NUMTRANSITEM DESC
LIMIT {{limite}} OFFSET {{offset}}
```

```sql
-- sgcPedidoAbertoDoFornecedor (RN-016): pedido do mesmo fornecedor e filial em qualquer
-- fase ANTES do envio à indústria. A fase vem por SGC_FASE.CHAVE, nunca por id nem nome.
SELECT P.ID_CARD, C.TITULO, F.CHAVE AS FASE_CHAVE, P.CRIADO_EM
FROM SGC_PEDIDO P
JOIN KB_CARD C ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL
JOIN SGC_FASE F ON F.FASE_ID = C.FASE_ID
WHERE P.CODFORNEC = {{codfornec}}
  AND P.CODFILIAL = '{{codfilial}}'
  AND F.CHAVE IN ('analise', 'tecnica', 'diretoria', 'envio')
ORDER BY P.ID_CARD DESC
LIMIT {{limite}} OFFSET {{offset}}
```

```sql
-- sgcEficienciaComprador (R-092/RN-018): sem tabela própria — a foto da sugestão já está
-- em SGC_PEDIDO_ITEM.QT_SUGERIDA, gravada pelo carrinho.
SELECT
  COUNT(*) AS ITENS,
  SUM(CASE WHEN I.QT_SUGERIDA > 0
             AND I.QT_PEDIDA >= I.QT_SUGERIDA * 0.8
             AND I.QT_PEDIDA <= I.QT_SUGERIDA * 1.2
           THEN 1 ELSE 0 END) AS ADERENTES,
  ROUND(100.0 * SUM(CASE WHEN I.QT_SUGERIDA > 0
             AND I.QT_PEDIDA >= I.QT_SUGERIDA * 0.8
             AND I.QT_PEDIDA <= I.QT_SUGERIDA * 1.2
           THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS PERC_ADERENCIA
FROM SGC_PEDIDO P
JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido'
WHERE P.ORIGEM = 'compras_inteligentes'
  AND ({{compradorId}} = 0 OR P.CRIADO_POR = {{compradorId}})
  AND ({{codfornec}} = 0 OR P.CODFORNEC = {{codfornec}})
  AND ('{{dataInicio}}' = '' OR P.CRIADO_EM >= '{{dataInicio}}')
  AND ('{{dataFim}}' = '' OR P.CRIADO_EM <= CONCAT('{{dataFim}}', 'T23:59:59'))
```

### Escritas SQL (uma instrução por SF, todas de tela, todas com `:VAR_USER`)

| Nome | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|
| `sgcEscParametroCompraSalvar` | `:VAR_USER` + `admin`/`gestor` | `codfornec`, `codfilial`, `codprod` (0 = fornecedor), `coberturaDias`, `leadTimeDias`, `gatilhoDias`, `atualizadoEm` | upsert dos três números | RF-010 |
| `sgcEscParametroCompraSilenciar` | `:VAR_USER` + `admin`/`gestor` | `codfornec`, `codfilial`, `codprod`, `silenciadoAte`, `motivo`, `atualizadoEm` | upsert só do silenciamento | RF-011 |
| `sgcEscParametroCompraRestaurar` | `:VAR_USER` + `admin`/`gestor` | `codfornec`, `codfilial`, `codprod`, `atualizadoEm` | limpa o silenciamento | RF-011 |
| `sgcEscVendaDesconsiderar` | `:VAR_USER` + `admin`/`analista`/`gestor` | `numtransitem`, `codprod`, `codfilial`, `dtmov`, `quantidade`, `motivo`, `em` | insere (idempotente por `NUMTRANSITEM`) | RF-012 |
| `sgcEscVendaReconsiderar` | `:VAR_USER` + `admin`/`analista`/`gestor` | `numtransitem` | apaga a linha | RF-012 |

```sql
-- sgcEscParametroCompraSalvar — NÃO toca em SILENCIADO_ATE/MOTIVO_SILENCIO: as duas
-- escritas convivem na mesma linha (UK por fornecedor+filial+produto) sem se apagarem.
INSERT INTO SGC_PARAMETRO_COMPRA
  (CODFORNEC, CODFILIAL, CODPROD, COBERTURA_DIAS, LEAD_TIME_DIAS, GATILHO_DIAS, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{codfilial}}', {{codprod}},
       {{coberturaDias}}, {{leadTimeDias}}, {{gatilhoDias}}, :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE {{codfornec}} > 0 AND TRIM('{{codfilial}}') <> ''
  AND {{coberturaDias}} >= 0 AND {{leadTimeDias}} >= 0 AND {{gatilhoDias}} >= 0
  AND <guarda(admin, gestor)>
ON DUPLICATE KEY UPDATE
  COBERTURA_DIAS = VALUES(COBERTURA_DIAS),
  LEAD_TIME_DIAS = VALUES(LEAD_TIME_DIAS),
  GATILHO_DIAS   = VALUES(GATILHO_DIAS),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM  = VALUES(ATUALIZADO_EM)
```

```sql
-- sgcEscParametroCompraSilenciar — só o silenciamento; motivo obrigatório (RN-013).
INSERT INTO SGC_PARAMETRO_COMPRA
  (CODFORNEC, CODFILIAL, CODPROD, SILENCIADO_ATE, MOTIVO_SILENCIO, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{codfilial}}', {{codprod}},
       '{{silenciadoAte}}', '{{motivo}}', :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE {{codprod}} > 0 AND TRIM('{{silenciadoAte}}') <> '' AND TRIM('{{motivo}}') <> ''
  AND <guarda(admin, gestor)>
ON DUPLICATE KEY UPDATE
  SILENCIADO_ATE  = VALUES(SILENCIADO_ATE),
  MOTIVO_SILENCIO = VALUES(MOTIVO_SILENCIO),
  ATUALIZADO_POR  = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM   = VALUES(ATUALIZADO_EM)
```

```sql
-- sgcEscParametroCompraRestaurar
UPDATE SGC_PARAMETRO_COMPRA
SET SILENCIADO_ATE = '', MOTIVO_SILENCIO = '', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE CODFORNEC = {{codfornec}} AND CODFILIAL = '{{codfilial}}' AND CODPROD = {{codprod}}
  AND <guarda(admin, gestor)>
```

```sql
-- sgcEscVendaDesconsiderar — idempotente por NUMTRANSITEM; motivo obrigatório.
INSERT INTO SGC_VENDA_DESCONSIDERADA
  (NUMTRANSITEM, CODPROD, CODFILIAL, DTMOV, QUANTIDADE, MOTIVO, POR, EM)
SELECT {{numtransitem}}, {{codprod}}, '{{codfilial}}', '{{dtmov}}', {{quantidade}}, '{{motivo}}', :VAR_USER, '{{em}}'
FROM DUAL
WHERE {{numtransitem}} > 0 AND {{codprod}} > 0 AND TRIM('{{motivo}}') <> ''
  AND <guarda(admin, analista, gestor)>
ON DUPLICATE KEY UPDATE MOTIVO = VALUES(MOTIVO), POR = VALUES(POR), EM = VALUES(EM)
```

```sql
-- sgcEscVendaReconsiderar
DELETE FROM SGC_VENDA_DESCONSIDERADA
WHERE NUMTRANSITEM = {{numtransitem}}
  AND <guarda(admin, analista, gestor)>
```

`<guarda(…)>` é **o mesmo texto** da 002 (R-013), copiado literalmente do `guarda()` de
`add-006-itens.mjs:50-62`, trocando só a lista de personas:

```sql
EXISTS (
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

Não há variante `{{usuarioId}}`: **nenhuma** escrita desta spec é chamada por id — não há
JavaScript nem cron aqui (R-081). Todo `INSERT … SELECT … WHERE` leva `FROM DUAL` (A6).

### Bloco 81xx de `frontend/src/lib/server-functions.ts`

| Id local | Nome | Id local | Nome |
|---|---|---|---|
| 8101 | `sgcWintRessuprimento` | 8150 | `sgcEscParametroCompraSalvar` |
| 8102 | `sgcWintProdutoHistorico` | 8151 | `sgcEscParametroCompraSilenciar` |
| 8103 | `sgcWintProdutoUltimasCompras` | 8152 | `sgcEscParametroCompraRestaurar` |
| 8104 | `sgcWintProdutoEstoqueFiliais` | 8153 | `sgcEscVendaDesconsiderar` |
| 8105 | `sgcWintProdutoVendas` | 8154 | `sgcEscVendaReconsiderar` |
| 8106 | `sgcParametrosCompraListar` | | |
| 8107 | `sgcVendasDesconsideradasListar` | | |
| 8108 | `sgcPedidoAbertoDoFornecedor` | | |
| 8109 | `sgcEficienciaComprador` | | |

`WINTHOR` (as que recebem o `jdbcId` resolvido por nome no `isEntrypoint()`):
`sgcWintRessuprimento`, `sgcWintProdutoHistorico`, `sgcWintProdutoUltimasCompras`,
`sgcWintProdutoEstoqueFiliais`, `sgcWintProdutoVendas`.

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/compras-inteligentes` | fornecedor + filial, KPIs, três abas, grid, seletor de licitação, parâmetros, carrinho, CSV | `PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`, `SearchInput`, `SelectMenu`, `FilterChip`, `GradeKpi`, `Kpi`, `Table`/`Th`/`Td` (`numeric`), `Tr`, `RowTitle`, `RowMeta`, `Code`, `Dash`, `Status`, `Badge`, `MetaDot`, `Button`, `IconButton`, `TextLink`, `Alert`, `EmptyState`, `Pagination`, `Dialog`, `Field`, `LabelledField`, `Input`, `Textarea`, `CheckRow`, `DatePicker` | `ComprasInteligentesPage`, `GradeRessuprimento`, `Carrinho`, `DetalheSku`, `ParametrosDialogo`, `SilenciarDialogo`, `VendasDialogo` |

Arquivos — quatro, e não um, porque a tela inteira num arquivo só passa das 800 linhas do
`max-lines` (C-13 da revisão; é a mesma divisão que a 007 fez entre aba e diálogos):

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/lib/ressuprimento.ts` | regra pura: fórmula, precedência de parâmetros, status, silenciamento, agrupamento do carrinho, aderência, colunas do CSV |
| `frontend/src/pages/compras-inteligentes/ComprasInteligentesPage.tsx` | porteiro de rota, seleção de fornecedor e filial, carga, KPIs, abas, filtros, seletor de licitação, CSV |
| `frontend/src/pages/compras-inteligentes/grid.tsx` | `GradeRessuprimento`: cabeçalho, linha, `Status`/`Badge`/`Dash`, edição da sugestão com arredondamento por caixa, ações da linha |
| `frontend/src/pages/compras-inteligentes/Carrinho.tsx` | painel do carrinho, bloqueio por pedido aberto e criação do pedido |
| `frontend/src/pages/compras-inteligentes/dialogos.tsx` | `DetalheSku`, `ParametrosDialogo` (fornecedor e SKU), `SilenciarDialogo`, `VendasDialogo` |
| `frontend/src/lib/server-functions.ts` | bloco 81xx (nomes e ids locais) |

A **rota** `/compras-inteligentes` e a primeira versão de `ComprasInteligentesPage.tsx` são da
**base (S2)**, não desta spec (C-2 da revisão, R-113): uma página-stub com porteiro, no padrão
do commit `99e87a5` da onda 3 (`SolicitacoesPage.tsx`) — comentário `STUB DA BASE (S2)`,
`usePersona()`, `Alert tone="error"` para quem não tem `verComprasInteligentes` e
`EmptyState title="Em construção — spec 011"` para quem tem. Assim `App.tsx` (arquivo
compartilhado) é tocado uma vez só, e a S3 troca o corpo do arquivo sem mexer na rota.

Desenho (`design.md` §8, §9.1, §9.2, §9.4, §9.5, §14):

- **Grid**: `Code` para o `CODPROD`, `RowTitle` para a descrição, `RowMeta` para embalagem e
  unidade; consumo, estoque, trânsito, cobertura, gatilho, sugestão, custo e total com
  `numeric` (à direita); sem zebra, linhas `py-3`, sem selo preenchido dentro da célula.
  Coluna sem dado é `Dash()` — cobertura e gatilho de produto sem giro mostram `Dash()` com
  "sem giro" no `title`, nunca `9999` (o número mágico do legado,
  `update-estoque-centralizado.mjs:272`).
- **Situação** como `Status` com ponto **e** texto, estado nunca só por cor: `ruptura` →
  `tone="alert"` "Ruptura"; `elevada_exposicao` → `tone="alert"` "Elevada exposição";
  `baixa_exposicao` → `tone="attention"` "Baixa exposição"; `excesso` → `tone="attention"`
  "Excesso"; `adequado` → `tone="live"` "Adequado". **Urgente** (RF-015) é um `Badge` ao lado
  do número de dias de gatilho, com o parâmetro no `title` — nunca só o vermelho.
- **Curva** como texto simples (A/B/C) com o alvo em dias no `title`; produto **silenciado**
  leva `Badge` "Silenciado até DD/MM" com o motivo no `title`.
- **Abas** (`Tabs` do `page.tsx`): "A comprar", "Todos" (com `SelectMenu` de situação) e "Em
  trânsito". A troca de aba e o filtro são locais (RNF-005).
- **Seletor de licitação**: `CheckRow` na `Toolbar`, com o texto "Desconsiderar venda para
  órgãos públicos" e o total público do fornecedor ao lado. Ligar/desligar recalcula na tela.
- **KPIs**: `GradeKpi` com **quatro** `Kpi` (`page.tsx:1026-1066`, §8.7 do `design.md`,
  entregues pela base da onda 3 em R-080): sugestão total em R$, rupturas, silenciados e
  aderência do comprador. Quatro é o teto da grade (`xl:grid-cols-4`); sem dado, o `Kpi`
  mostra `Dash`, nunca 0.
- **Diálogos** (`max-h-[90vh]`, só o miolo rola, rodapé `flex-col-reverse` no mobile): detalhe
  do SKU (3 blocos, 3 consultas), parâmetros (fornecedor e SKU, com o `title` dizendo o que
  `0` significa), silenciar (`DatePicker` do projeto — **nunca** `<input type="date">`, UI-03 B
  — pré-carregado com hoje + 30 e `Textarea` de motivo obrigatório) e vendas (lista com
  `Desconsiderar`/`Reconsiderar`).
- **Sem toast** (UI-02 A): confirmação é "Salvo às HH:MM" na faixa do painel; erro e bloqueio
  do carrinho são `Alert` no fluxo.
- **Permissão** (§9.4, anti-padrão "botão escondido por falta de permissão"): sem
  `operarComprasInteligentes` ou sem `parametrizarCompras`, os controles ficam
  **desabilitados com o motivo no `title`**, nunca escondidos. A rota tem porteiro
  (`sessao.permissoes.verComprasInteligentes`), como as telas Fiscal (A-8).
- **Cor**: só token; nenhum hex, nenhum `style={{}}`.

### Chaves de `lib/permissoes.ts` (R-095, arquivo da base)

| Chave | admin | analista | gestor | diretoria | comercial | `READ_ONLY` |
|---|---|---|---|---|---|---|
| `verComprasInteligentes` | ✓ | ✓ | ✓ | ✓ | — | mantém (como `verCoberturas`, D-12) |
| `operarComprasInteligentes` | ✓ | ✓ | ✓ | — | — | zera |
| `parametrizarCompras` | ✓ | — | ✓ | — | — | zera |

Item de menu novo, no grupo **Compras**, **depois de "Novo pedido"** (R-095):
`{ grupo: 'Compras', to: '/compras-inteligentes', label: 'Compras inteligentes', exige: 'verComprasInteligentes' }`.

## Fluxo

1. A compradora abre `/compras-inteligentes`. A tela carrega `sgcFornecedorListar`
   (ativos), `sgcEficienciaComprador` e `api.boardCarregar({ slug: 'compras' })` — 3
   execuções, uma vez só. O board vem aqui, e não no carrinho, porque o id é o mesmo para
   todos os grupos: assim "criar pedido" custa 3 por grupo e não 4 (C-1 da revisão).
2. Ela escolhe o fornecedor: `sgcFornecedorCarregar` traz as filiais atendidas (1 execução,
   o mesmo caminho de `/pedidos/novo`). Escolhida a filial, a tela dispara **em paralelo**
   `sgcParametrosCompraListar`, `sgcVendasDesconsideradasListar` (`codprod: 0`),
   `sgcCoberturaListar` (003) e `sgcPedidoAbertoDoFornecedor` — 4 execuções.
3. Com a lista de `NUMTRANSITEM` desconsiderados em mãos, a tela chama
   `sgcWintRessuprimento` **uma** vez, com a janela de 153 dias encerrada hoje
   (`diasPeriodo` = 153) e `excluir` = a lista (ou `0`). São as 9 execuções do RNF-001, e
   6 quando só o fornecedor ou a filial muda.
4. `montarRessuprimento()` (regra pura) calcula tudo: curva por `curvaAbc()` da 003, alvo
   pela função `alvoDaCurvaDias` que a **tela injeta** (`limiteDeCobertura(...).alvoDias` da
   012 — R-111), parâmetros por precedência, e as sete grandezas por produto. Nada disso
   volta ao servidor.
5. A compradora filtra, ordena, troca de aba e liga o seletor de licitação — zero execução
   (RNF-005). Editar a quantidade sugerida arredonda por caixa na hora (RF-016).
6. "Detalhe": `sgcWintProdutoHistorico`, `sgcWintProdutoUltimasCompras` e
   `sgcWintProdutoEstoqueFiliais`, uma execução cada, só ao abrir (RNF-003).
7. "Silenciar" (`sgcEscParametroCompraSilenciar`), "Restaurar"
   (`sgcEscParametroCompraRestaurar`) e "Parâmetros" (`sgcEscParametroCompraSalvar`) gravam e
   a tela recarrega só `sgcParametrosCompraListar` (a medida do ERP não mudou).
8. "Desconsiderar venda": `sgcWintProdutoVendas` ao abrir o diálogo (1),
   `sgcEscVendaDesconsiderar` (ou `sgcEscVendaReconsiderar`) ao confirmar (1),
   **`sgcVendasDesconsideradasListar` de novo** (1) e **`sgcWintRessuprimento` de novo** (1)
   — 4 execuções. A releitura da lista não é enfeite: escrita SQL guardada recusada devolve
   0 linhas e nenhum erro (D-03), então o `{{excluir}}` é montado do que **voltou do banco**,
   nunca do que a tela achou que gravou. A exclusão acontece na origem (RN-012), e por isso a
   medida precisa ser refeita.
9. **Carrinho.** Cada produto jogado no carrinho passa por `pedidoAbertoDe(codfornec,
   codfilial)` na memória da tela (a lista veio no passo 2): havendo pedido aberto, `Alert`
   com o título e a fase, e nada acontece (RF-018). "Criar pedido", por grupo de fornecedor +
   filial:
   1. `api.cardCriar` da lib (`boardId` já em memória desde o passo 1, título
      `FILIAL · FORNECEDOR` em maiúsculas — RN-014 da 002 —,
      `valores: { fornecedor, filial, prioridade, valor_total }`, responsável = quem cria).
      O card nasce na primeira fase, `analise`.
   2. `sgcEscPedidoCriar` (7250, 002) com `origem: 'compras_inteligentes'`, fornecedor,
      filial e o período da janela.
   3. `sgcItensGravar` (7309, 003) com o `itensJson` do grupo — **um** upsert em lote, que
      já recalcula `SGC_PEDIDO.VL_TOTAL` por dentro. Cada item vai como o **`ItemPedido`
      inteiro** de `lib/compras.ts` (R-112), não só quantidade e custo: `descricao`,
      `embalagem`, `unidade`, `codepto`, `codsec`, `unPorCaixa`, `qtVendaTotal`,
      `qtVendaLicitacao`, `qtEstoque`, `qtTransito` (as medidas da linha),
      `qtSugerida`, `qtPedida`, `precoCusto`, `curvaAbc`, `coberturaDias` (a cobertura futura
      **com a quantidade do carrinho**, por `coberturaFuturaComCompra`), `coberturaLimite`
      (o limite resolvido para o item), `tipoPreco: 'padrao'`, `observacao: ''`,
      `status: 'montagem'`. O motivo é o passo 10: a remontagem da Análise **preserva o item
      existente inteiro**, então campo que nascer zerado fica zerado para sempre — e um
      `COBERTURA_LIMITE` zerado deixaria a trava de cobertura da 003 cega (`COBERTURA_DIAS >
      COBERTURA_LIMITE` nunca seria falso, ou nunca verdadeiro, conforme o zero).

   São as 3 execuções do RNF-002. O `valor_total` da capa vai no próprio `cardCriar` porque a
   tela já sabe a soma — nenhum `kbCardAtualizar` a mais.
10. A compradora abre o pedido no `/quadro` e monta a análise normalmente (003). O
    `Itens.tsx:107-109` já garante RN-017: `jaNaLista.get(item.codprod) ?? item` mantém o item
    que veio do carrinho com a quantidade dele, e `setAlterados(...)` só marca os produtos
    **novos** — o upsert de `sgcEscItemGravar` (`add-006-itens.mjs:278-290`, que traz
    `QT_PEDIDA = VALUES(QT_PEDIDA)`) nem chega a receber os itens do carrinho.

## Regra pura — `frontend/src/lib/ressuprimento.ts`

R-111: este módulo **não importa** `lib/cobertura.ts`. O alvo por curva chega como função
injetada pela tela — assim as duas features param de depender da ordem de merge, e o teste
puro usa um stub de três linhas em vez da tabela da 012.

```ts
import { arredondarPorCaixa, curvaAbc, unidadesPorCaixa } from './compras';
import type { CurvaAbc } from './compras';

export type StatusRessuprimento =
  'ruptura' | 'excesso' | 'elevada_exposicao' | 'baixa_exposicao' | 'adequado';

export const JANELA_DIAS = 153;              // R-082
export const PESO_RECENCIA_DIA = 0.85;       // R-082
export const LEAD_TIME_PADRAO_DIAS = 9;      // O4-02 / R-086
export const GATILHO_PADRAO_DIAS = 15;       // O4-02 / R-086
export const SILENCIO_PADRAO_DIAS = 30;      // O4-02 / R-086
export const TOLERANCIA_ADERENCIA = 0.2;     // R-092

/** Linha de `sgcWintRessuprimento` (colunas UPPERCASE) — medida, nunca decisão. */
export interface MedidaRessuprimento {
  CODPROD: number; DESCRICAO: string; EMBALAGEM: string; UNIDADE: string;
  CODEPTO: number; CODSEC: number; UN_POR_CAIXA_ERP: number;
  CUSTO_ULT_ENTRADA: number; DT_ULT_ENTRADA: string; DT_ULT_SAIDA: string;
  ESTOQUE_TOTAL: number; QT_BLOQUEADA: number; QT_INDENIZ: number; QT_RESERV: number;
  ESTOQUE_ATUAL: number; QT_PEDIDA_ERP: number; QT_TRANSITO: number; ESTOQUE_EM_TRANSITO: number;
  LEAD_TIME_MEDIDO: number;          // 0 = não medido
  VENDA_PERIODO: number; VENDA_PUBLICA: number;
  CONSUMO_DIARIO: number; CONSUMO_DIARIO_PUBLICO: number; VOLATILIDADE_DIARIA: number;
}

/** Linha de `sgcParametrosCompraListar`; `codprod 0` é a linha do fornecedor. */
export interface ParametroCompra {
  codprod: number; coberturaDias: number; leadTimeDias: number; gatilhoDias: number;
  silenciadoAte: string; motivoSilencio: string;
}

export interface ParametrosResolvidos {
  coberturaDias: number; leadTimeDias: number; gatilhoDias: number;
  origemCobertura: 'sku' | 'fornecedor' | 'curva';
  origemLeadTime: 'sku' | 'fornecedor' | 'medido' | 'padrao';
}

export function resolverParametros(
  doSku: ParametroCompra | null,
  doFornecedor: ParametroCompra | null,
  leadTimeMedido: number,
  alvoDaCurvaEmDias: number,
): ParametrosResolvidos;
// RN-003/004/005. `0` em qualquer campo = herda. Lead medido < 1 vira 1.

export function estaSilenciado(silenciadoAte: string, hoje: string): boolean;
// RN-013: '' -> false; comparação de texto AAAA-MM-DD, sem fuso.

export function dataDeSilencio(hoje: string, dias = SILENCIO_PADRAO_DIAS): string;

export interface Ressuprimento {
  consumoDiario: number; estoqueAtual: number; emTransito: number;
  leadTimeDias: number; coberturaDias: number; gatilhoDias: number;
  estoqueSeguranca: number; pontoDePedido: number; estoqueMaximo: number;
  sugerida: number;
  coberturaAtualDias: number | null; diasDeGatilho: number | null;
  status: StatusRessuprimento; urgente: boolean;
}

export function calcularRessuprimento(
  medida: MedidaRessuprimento,
  parametros: ParametrosResolvidos,
  opcoes: { unidadesPorCaixa: number; desconsiderarLicitacao: boolean },
): Ressuprimento;
// RN-001 (o consumo já vem medido), RN-006, RN-007, RN-008, RN-009, RN-011.

export function motivoDaSugestao(r: Ressuprimento): string;
// "Por que comprar" do carrinho: "Ruptura — sem estoque, consumo de 2 un./dia" |
// "Abaixo do ponto de pedido (36 un.); cobertura de 15 dias" | "Gatilho em 7 dias" |
// "Estoque máximo de 70 un. não atingido".

export function coberturaFuturaComCompra(r: Ressuprimento, quantidade: number): number | null;
// (estoqueAtual + emTransito + quantidade) / consumoDiario; sem consumo -> null.

export function aderenteASugestao(qtSugerida: number, qtPedida: number): boolean;
// RN-018: sugerida > 0 e 0,8 x sugerida <= pedida <= 1,2 x sugerida (limites inclusive).

export interface LinhaRessuprimento extends Ressuprimento {
  medida: MedidaRessuprimento; curva: CurvaAbc;
  parametros: ParametrosResolvidos; unidadesPorCaixa: number; silenciado: boolean;
}

/** O alvo em dias da curva do item. A TELA injeta; esta lib não conhece SGC_COBERTURA. */
export type AlvoDaCurva = (
  alvo: { codprod: number; codsec: number; codepto: number; codfornec: number },
  curva: CurvaAbc,
) => number;

export function montarRessuprimento(
  medidas: MedidaRessuprimento[],
  parametros: ParametroCompra[],
  alvoDaCurvaDias: AlvoDaCurva,
  unidadesPorCaixaPorProduto: Map<number, number>,
  opcoes: { codfornec: number; hoje: string; desconsiderarLicitacao: boolean },
): LinhaRessuprimento[];
// Orquestra: curvaAbc() da 003 sobre todas as medidas -> alvoDaCurvaDias(alvo, curva)
// -> resolverParametros -> calcularRessuprimento. É a única chamada que a tela faz por
// carga. RN-010, RN-004. A tela injeta
// `(alvo, curva) => limiteDeCobertura(coberturas, alvo, curva).alvoDias` (012, R-111);
// o teste injeta um stub de três linhas.

export function aComprar(linhas: LinhaRessuprimento[]): LinhaRessuprimento[];
// RF-014: sugerida > 0 e não silenciado; urgentes primeiro, depois por dias de gatilho,
// depois por sugestão decrescente e descrição.

export interface GrupoCarrinho {
  codfornec: number; codfilial: string; fornecedor: string; filial: string;
  prioridade: 'normal' | 'alta'; total: number;
  itens: { linha: LinhaRessuprimento; quantidade: number }[];
}

export function agruparCarrinho(
  itens: { linha: LinhaRessuprimento; quantidade: number; codfornec: number; codfilial: string;
           fornecedor: string; filial: string }[],
): GrupoCarrinho[];
// RN-015: um grupo por fornecedor + filial; prioridade 'alta' quando algum item está em
// ruptura; total = soma de quantidade x custo.

export const COLUNAS_CSV: string[];
export function linhaCsv(l: LinhaRessuprimento): (string | number)[];
// RF-023/C-024: alimentam `textoCsv`/`baixarCsv` de lib/csv.ts (R-037). Nada de xlsx.
```

### Tabela de casos numéricos (é o coração dos testes)

Base de todas as linhas, salvo coluna em contrário: **consumo 2,0/dia**, **lead 9**,
**cobertura 35**, **gatilho 15**, **caixa 12** → segurança **18**, ponto **36**, máximo **70**.

| # | Caso | Entrada que muda | segurança | ponto | máximo | sugerida | cob. atual | gatilho | status |
|---|---|---|---|---|---|---|---|---|---|
| 1 | C-002 adequado | disponível 50, trânsito 0 | 18 | 36 | 70 | **24** | 25 | **7** | `adequado` |
| 2 | C-003 ruptura | disponível 0 | 18 | 36 | 70 | **72** | 0 | **−18** | `ruptura` |
| 3 | C-004 excesso | disponível 100 | 18 | 36 | 70 | **0** | 50 | 32 | `excesso` |
| 4 | C-005 baixa exposição | disponível 30 | 18 | 36 | 70 | **48** | 15 | **−3** | `baixa_exposicao` |
| 5 | C-006 elevada exposição | disponível 10 | 18 | 36 | 70 | **60** | 5 | −13 | `elevada_exposicao` |
| 6 | C-007 trânsito zera | disponível 30, trânsito 20 | 18 | 36 | 70 | **0** | 15 | 7 | `baixa_exposicao` |
| 7 | C-025 sem giro | consumo 0, disponível 40 | 0 | 0 | 0 | **0** | `null` | `null` | `excesso` |
| 8 | C-009 lead medido | disponível 30, lead **medido 5** | **10** | **20** | 70 | 48 | 15 | **5** | `adequado` |
| 9 | C-009 sem medida | disponível 30, lead medido 0 | 18 | 36 | 70 | 48 | 15 | −3 | `baixa_exposicao` |
| 10 | C-010 parâmetro do fornecedor | disponível 50, cobertura do fornecedor **20** | 18 | 36 | **40** | **0** | 25 | 7 | `excesso` |
| 11 | C-011 parâmetro do SKU vence | disponível 50, fornecedor 20, SKU **45** | 18 | 36 | **90** | **48** | 25 | 7 | `adequado` |
| 12 | C-016 alvo da curva A | disponível 50, sem parâmetro, curva A (alvo 35) | 18 | 36 | 70 | 24 | 25 | 7 | `adequado` |
| 13 | C-016 alvo da curva B | idem, curva B (alvo 45) | 18 | 36 | **90** | 48 | 25 | 7 | `adequado` |
| 14 | C-016 alvo da curva C | idem, curva C (alvo 60) | 18 | 36 | **120** | **72** | 25 | 7 | `adequado` |
| 15 | C-014 licitação dentro | disponível 30, consumo 2,0 (público 0,5) | 18 | 36 | 70 | 48 | 15 | −3 | `baixa_exposicao` |
| 16 | C-014 licitação fora | idem, seletor ligado → consumo **1,5** | **13,5** | **27** | **52,5** | **24** | 20 | **2** | `adequado` |
| 17 | RN-009 ordem 1 | disponível 0 e máximo 0 | 0 | 0 | 0 | 0 | `null` | `null` | `ruptura` (não `excesso`) |
| 18 | RN-009 ordem 2 | disponível 10, cobertura 5 < lead 9 | 18 | 36 | 70 | 60 | 5 | −13 | `elevada_exposicao` (não `baixa_exposicao`) |
| 19 | RN-007 caixa 1 | disponível 50, caixa **1** | 18 | 36 | 70 | **20** | 25 | 7 | `adequado` |
| 20 | RF-015 urgência | gatilho 7 × parâmetro 15 → urgente; gatilho 32 × 15 → não | — | — | — | — | — | — | — |

Três contas abertas, para quem for implementar conferir o resto:

- linha 1 — `sugerida = ceil(70 − 50 − 0) = 20`, arredondada por caixa 12 → **24**;
  `gatilho = floor((50 + 0 − 18) ÷ 2 − 9) = floor(16 − 9) = 7`.
- linha 8 (lead medido 5) — `segurança = 5 × 2 = 10`;
  `gatilho = floor((30 + 0 − 10) ÷ 2 − 5) = floor(10 − 5) = 5`.
- linha 16 (sem licitação, consumo 1,5) — `máximo = 35 × 1,5 = 52,5`;
  `sugerida = ceil(52,5 − 30) = 23`, por caixa 12 → **24**; `cobertura atual = 30 ÷ 1,5 = 20`;
  `gatilho = floor((30 − 13,5) ÷ 1,5 − 9) = floor(11 − 9) = 2`.

## Simulador

### Tabelas

Nenhuma tabela nasce nesta spec. `SGC_PARAMETRO_COMPRA` e `SGC_VENDA_DESCONSIDERADA` vêm do
`setup-backend.mjs` (base da onda 4); as `PC*` vêm do `schema-winthor.mjs` (base da onda 4), que
ganha **três colunas em `PCEST`** (R-096):

```sql
QTBLOQUEADA DECIMAL(15,3),
QTINDENIZ   DECIMAL(15,3),
QTRESERV    DECIMAL(15,3)
```

Nada mais: `PCPEDIDO` (`NUMPED`, `DTEMISSAO`), `PCMOV` (`NUMTRANSITEM`, `NUMPED`, `CODOPER`,
`DTMOV`, `QT`, `PUNIT`, `NUMTRANSENT`, `NUMNOTA`), `PCPRODUT`, `PCCLIENT` (`CODATV1`),
`PCESTTRANSITO` e `PCFILIAL` já têm tudo. `PCPRODUT.DTEXCLUSAO` **não** é portada (R-085).

### Dialeto — a reescrita exata do gerador de calendário (R-096, R-100, R-113)

`backend/simulator/mysql-dialect.mjs` (arquivo da base) ganha **três shims escalares** e
**uma reescrita textual**. Sem a reescrita a suíte falha alto, como o `REGEXP_SUBSTR` da
R-064 — nunca um shim que devolva linha plausível. **Nenhuma reescrita existente sai**
(R-113): as da onda 3 (`reescreverGeradorConnectBy` de R-064, `reescreverUpsert` de R-079,
`reescreverJsonUnquote` de R-071) continuam, e a nova entra no fim da cadeia.

Escalares, ao lado dos de `registerMysqlFunctions` (`mysql-dialect.mjs:171-172`):

```js
def('POWER', 2, (base, expoente) => (
  base == null || expoente == null ? null : Math.pow(Number(base), Number(expoente))
));
def('SQRT', 1, (valor) => (valor == null ? null : Math.sqrt(Number(valor))));
// ADD_MONTHS(data, n) do Oracle: mesmo dia, n meses depois (n negativo volta). Dia que não
// existe no mês de destino cai no último dia do mês, como no Oracle (31/03 -1 mês = 28/02).
def('ADD_MONTHS', 2, (valor, meses) => {
  const texto = valor == null ? '' : String(valor).trim().slice(0, 10);
  const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]) - 1 + Number(meses);
  const dia = Number(partes[3]);
  const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const data = new Date(Date.UTC(ano, mes, Math.min(dia, ultimo)));
  return data.toISOString().slice(0, 10);
});
```

`INSTR` e `STDDEV_POP`, citados em R-096, **não entram**: nenhuma SQL desta spec usa `INSTR`
(o `ci_completar_compra` do legado ficou fora de escopo) e a volatilidade usa
`AVG`/`SQRT` em vez do agregado (decisão 4 da consulta principal). `NULLIF` é nativo do
SQLite; as funções de janela não são usadas.

A reescrita roda sobre o SQL **inteiro**, fora do `mapOutsideStrings` (a projeção tem
literais de aspas) e antes de `FROM DUAL` ser apagado lá embaixo — o mesmo motivo do
`reescreverGeradorConnectBy` de R-064 (`mysql-dialect.mjs:386-404`):

```js
/**
 * Gerador de calendário do Oracle (spec 011, R-096/R-100). A consulta de ressuprimento
 * precisa de UMA linha por dia do período, inclusive nos dias sem venda — é o denominador do
 * consumo ponderado. No Oracle:
 *
 *   SELECT TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') + (LEVEL - 1) AS DIA,
 *          GREATEST({{diasPeriodo}}, 1) - LEVEL AS DIAS_ATE_FIM
 *   FROM DUAL
 *   CONNECT BY LEVEL <= GREATEST({{diasPeriodo}}, 1)
 *
 * No SQLite, uma CTE recursiva com a MESMA coluna LEVEL (1..N):
 *
 *   WITH RECURSIVE CALENDARIO(LEVEL) AS (
 *     SELECT 1 UNION ALL SELECT LEVEL + 1 FROM CALENDARIO WHERE LEVEL + 1 <= (GREATEST(153, 1))
 *   )
 *   SELECT date(TO_DATE('2026-04-17', 'YYYY-MM-DD'), '+' || (LEVEL - 1) || ' days') AS DIA,
 *          GREATEST(153, 1) - LEVEL AS DIAS_ATE_FIM
 *   FROM CALENDARIO
 *
 * `CALENDARIO`, e não `NIVEL`: o gerador de R-064 já usa `NIVEL(LVL)` e as duas reescritas
 * podem conviver no mesmo arquivo. Só esta forma (`CONNECT BY LEVEL <= …`) é traduzida —
 * a de R-064 (`CONNECT BY <expr> IS NOT NULL`) continua com o dono dela, e qualquer outro
 * `CONNECT BY` segue sem tradução: melhor quebrar alto do que devolver linha plausível e
 * errada (é a regra do cabeçalho do arquivo).
 */
function reescreverCalendarioOracle(sql) {
  // B-2: o `((?:(?!\bSELECT\b)[\s\S])*?)` impede o casamento de começar num SELECT
  // anterior e atravessar outras CTEs (PRODUTOS_BASE, RESSUPRIMENTO_PRODUTO) até chegar
  // ao FROM DUAL de DIAS — o que apagaria meia consulta.
  const ABERTURA = /\bSELECT\b((?:(?!\bSELECT\b)[\s\S])*?)\bFROM\s+DUAL\s+CONNECT\s+BY\s+LEVEL\s*<=\s*/gi;
  let saida = '';
  let cursor = 0;
  let m;
  while ((m = ABERTURA.exec(sql))) {
    if (m.index < cursor) continue;
    const inicioLimite = ABERTURA.lastIndex;
    const fimLimite = fimDoBlocoForaDeAspas(sql, inicioLimite);
    const projecao = comDataDoNivel(m[1].trim().replace(/,\s*$/, ''));
    const limite = sql.slice(inicioLimite, fimLimite).trim();
    saida += sql.slice(cursor, m.index);
    saida += 'WITH RECURSIVE CALENDARIO(LEVEL) AS (\n'
      + `  SELECT 1 UNION ALL SELECT LEVEL + 1 FROM CALENDARIO WHERE LEVEL + 1 <= (${limite})\n`
      + `)\nSELECT ${projecao} FROM CALENDARIO`;
    cursor = fimLimite;
    ABERTURA.lastIndex = cursor;
  }
  return saida + sql.slice(cursor);
}

/**
 * Do início da expressão até o `)` que fecha o bloco que a contém, ignorando aspas.
 * B-4: sem parêntese envolvente (o gerador solto, fora de uma CTE), o fim da INSTRUÇÃO é o
 * fim do bloco — devolver −1 e desistir deixaria o `CONNECT BY` cru chegar ao SQLite, já
 * sem o `FROM DUAL` que é apagado depois. Não existe caminho de desistência.
 */
function fimDoBlocoForaDeAspas(texto, inicio) {
  let profundidade = 0;
  let aspa = null;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspa) {
      if (c === aspa && texto[i + 1] === aspa) { i += 1; continue; }
      if (c === aspa) aspa = null;
      continue;
    }
    if (c === "'" || c === '"') { aspa = c; continue; }
    if (c === '(') profundidade += 1;
    else if (c === ')') {
      if (profundidade === 0) return i;
      profundidade -= 1;
    }
    else if (c === ';' && profundidade === 0) return i;
  }
  return texto.length;
}

/** `TO_DATE(x, f) + (LEVEL - 1)` -> `date(TO_DATE(x, f), '+' || (LEVEL - 1) || ' days')`. */
function comDataDoNivel(projecao) {
  return projecao.replace(
    /\bTO_DATE\s*\(\s*('(?:[^']|'')*')\s*,\s*('(?:[^']|'')*')\s*\)\s*\+\s*\(\s*LEVEL\s*-\s*1\s*\)/gi,
    (_, valor, formato) => `date(TO_DATE(${valor}, ${formato}), '+' || (LEVEL - 1) || ' days')`,
  );
}
```

e, dentro de `toSqlite()` (`mysql-dialect.mjs:422-428`), **acrescentando** um elo à cadeia
que a onda 3 já montou, sem tirar nenhum (B-3, R-113):

```js
const preparado = reescreverCalendarioOracle(
  reescreverGeradorConnectBy(
    reescreverUpsert(reescreverJsonUnquote(reescreverDateAddComExpressao(String(sql)))),
  ),
);

const resultado = mapOutsideStrings(preparado, (chunk) => { /* … como hoje … */ });
```

`reescreverGeradorConnectBy` (R-064) vem antes e não toca nesta forma: ele só casa
`CONNECT BY <expr> IS NOT NULL`.

`ponytail:` a reescrita produz um `WITH RECURSIVE` **dentro** do corpo de uma CTE (`DIAS AS
( … )`), que o SQLite aceita porque `WITH` faz parte do `select-stmt`. Se alguma versão
recusar, a saída sobe para o `WITH` do topo — muda o lugar, não o conteúdo. O teste
`smoke/000-dialeto.mjs` (base) é onde isso aparece primeiro, como o S0-011 de R-064 fez:
**duas** formas, as duas com 153 linhas — o gerador dentro de `WITH DIAS AS (…)` precedido de
**duas outras CTEs** (é o caso que B-2 pega) e o gerador solto, sem parêntese envolvente (o
caso de B-4).

### Seed — `backend/simulator/seed/011-compras-inteligentes.mjs`

Só **INSERT**. Fornecedores (1015, 1042 ativos, 1088 inativo) e filiais (1, 2, 3) são do
`seed/001-fornecedores.mjs`; `SGC_USUARIO_PERSONA` é do `seed/002-quadro.mjs` (R-017). As
datas são **relativas a hoje**, como no seed da 007 — a janela da tela termina hoje.

- **20 produtos `CODPROD` 5401–5420, do fornecedor 1042** (não do 1015 — R-097),
  departamentos 2 e 3, seções 21 e 31, embalagens "CX 12", "CAIXA COM 24" e
  "FRASCO 100 ML", descrições sem a palavra "CREME" (para não mexer na busca do C-009 da
  003): **5419** com `OBS2 = 'INATIVO'` e **5420** com `CODEPTO = 4` — os dois que provam o
  recorte de RN-014 e fazem C-001 esperar **18** dos 20.
- **`PCEST` da filial 1** para os 20, com `QTEST`, `QTBLOQUEADA`, `QTINDENIZ`, `QTRESERV`,
  `QTPEDIDA` e `CUSTOULTENT` desenhados para os casos: 5401 total 100 / bloqueado 10 /
  avariado 5 / reservado 5 → **disponível 80**; 5402 total 5 e reservado 20 → **disponível 0**
  (RN-002, o piso em zero); 5403 disponível 50; 5404 disponível 30 com `QTPEDIDA` 3 e
  trânsito 7 → **trânsito 10** (RN-002).
- **`PCEST` das filiais 2 e 3** para o 5403, para o detalhe de estoque nas filiais (C-021,
  ao menos 2 filiais).
- **`PCESTTRANSITO`** do 5404 na filial 1, `QTTRANSITO` 7.
- **Vendas (`PCMOV`, `CODOPER = 'S'`, filial 1), `NUMTRANSITEM` a partir de 960001**, todas
  dentro da janela e com as três linhas do C-008 na janela curta de 2 dias:
  | Produto | Vendas | Serve a |
  |---|---|---|
  | 5405 | 10 ontem + 10 hoje | C-008 consumo 10,0000, volatilidade 0 |
  | 5406 | 20 ontem | C-008 consumo 9,1892, volatilidade 10 |
  | 5407 | 20 hoje | C-008 consumo 10,8108, volatilidade 10 |
  | 5408 | 60 num dia (cliente 9303) + 30 espalhados | C-013: venda 90 → 30 com a exclusão |
  | 5409 | 12 privadas + 6 de cliente público (9304, `CODATV1` 12) | RN-011: venda 18 com pública 6 |
  | 5410..5414 | volumes e custos que dão valor 500 / 250 / 150 / 70 / 30 | C-015 (a curva também é testada pura) |
  | 5410 | **mais uma linha com `QT = -5`** (devolução), dentro da janela | RN-014: quantidade negativa fica fora de `VENDA_PERIODO` |
  | 5415 | nenhuma venda, estoque 40 | C-025 sem giro |

  A linha negativa do 5410 é o que dá dente à RN-014 (C-7 da revisão): sem ela o `QT > 0` da
  consulta nunca seria exercido, e uma devolução passaria a **descontar** demanda — o produto
  de maior valor da curva encolheria em silêncio. Como o 5410 é o topo da curva de C-015, ela
  também prova que a soma positiva continua 500: o `-5` não entra em lugar nenhum.
- **3 clientes próprios** `PCCLIENT` **9301** (privado, `CODATV1` 1), **9302** (privado),
  **9303** (privado) e **9304**/**9305** públicos (`CODATV1` 12 e 20) — fora das faixas
  9001–9003 (003), 9101–9105 (007) e 9201–9205 (onda 3).
- **Lead time medido** (`PCPEDIDO` + `PCMOV` `CODOPER = 'E'`), `NUMPED` a partir de
  **970001**, todos do fornecedor 1042 com **`PRAZO1 = 0`** (assim não entram no
  `sgcWintPrazoPagamento` da 003): 5403 com duas entradas, uma 4 dias depois da emissão e
  outra 6 → **lead medido 5** (C-009); 5416 com uma entrada no **mesmo dia** da emissão →
  lead **1** (o mínimo de RN-003); os demais produtos sem entrada casada → `LEAD_TIME_MEDIDO`
  0 e fallback 9.
- **`SGC_PARAMETRO_COMPRA`**: linha do fornecedor 1042 + filial 1 com `COBERTURA_DIAS` 0
  (herda) e uma linha de SKU do 5417 com `COBERTURA_DIAS` 45 — os casos de precedência são
  testados puros; estas duas provam a leitura e o upsert.
- **`SGC_PEDIDO`/`KB_CARD` próprios** (`CARDS_011`): 1 pedido do 1042 + filial 1 na fase
  `analise` com `ORIGEM = 'compras_inteligentes'` e 5 itens com `QT_SUGERIDA` 100 e
  `QT_PEDIDA` 100, 80, 120, 79 e 121 (C-022 = 60 %); 1 pedido do 1042 + filial **2** na fase
  `enviado` (C-019: não bloqueia). Cards próprios, como a 008 fez (R-073), para não mexer nas
  listagens globais das outras specs (R-045).
- **`SGC_COBERTURA`**: nenhuma linha própria — os alvos por curva são do seed da 012 (R-096);
  os casos de alvo são testados puros.

### `CHECK_INPUT`

Acrescentar em `backend/simulator/config.mjs` (arquivo compartilhado, entregue pela **base
(S2)** junto do `PUBLISH_ORDER` — sem a chave o próprio `sim:check` da base falha ao varrer o
`add-013`), na seção 011, **só chaves novas** (D-17): `diasPeriodo: '153'`, `excluir: '0'`, `meses: '12'`,
`compradorId: '0'`, `numtransitem: '960001'`. `codfornec`, `codfilial`, `dataInicio`,
`dataFim`, `codprod`, `limite` e `offset` já existem com valores que servem (o `sim:check`
cobre sintaxe; o conteúdo é do smoke). **Não** entram `leadTimeDias`, `coberturaDias` nem
`curva`, citadas em R-096: com R-083 elas deixaram de ser parâmetro de SQL.

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/011-compras-inteligentes.mjs` | `sgcWintRessuprimento` (1042 / filial 1 / janela de 153 dias) devolve contagem > 0; entre os `CODPROD` 5401–5420 há exatamente **18**; nenhuma linha com `CODEPTO` 4 ou 7 |
| C-002..C-007, C-025 | `tests/ressuprimento.test.mjs` | as linhas 1 a 7 da tabela de casos numéricos, campo a campo (`estoqueSeguranca`, `pontoDePedido`, `estoqueMaximo`, `sugerida`, `coberturaAtualDias`, `diasDeGatilho`, `status`) |
| C-008 | `smoke/011-compras-inteligentes.mjs` | com `dataInicio` = ontem, `dataFim` = hoje e `diasPeriodo` 2: 5405 → `VENDA_PERIODO` 20, `CONSUMO_DIARIO` 10, `VOLATILIDADE_DIARIA` 0; 5406 → 20 / 9,1892 / 10; 5407 → 20 / 10,8108 / 10 |
| C-009 | `smoke/…` + `tests/ressuprimento.test.mjs` | consulta: `LEAD_TIME_MEDIDO` 5 no 5403, 1 no 5416 (mesmo dia) e 0 no 5410; regra: linhas 8 e 9 da tabela |
| C-010, C-011 | `tests/ressuprimento.test.mjs` | linhas 10 e 11 da tabela, e `resolverParametros` devolvendo `origemCobertura` `fornecedor` e `sku` |
| C-012 | `smoke/…` + `tests/ressuprimento.test.mjs` | `sgcEscParametroCompraSilenciar` como `gil` (gestor) grava `SILENCIADO_ATE` = hoje+30 e o motivo, e `sgcParametrosCompraListar` os devolve; como `ana` (analista) **não** grava nada; `sgcEscParametroCompraRestaurar` limpa; a regra tira o produto de `aComprar()` e o mantém na lista com `silenciado: true` |
| C-013 | `smoke/011-compras-inteligentes.mjs` | 5408 com `excluir: '0'` → `VENDA_PERIODO` 90; `sgcEscVendaDesconsiderar` do `NUMTRANSITEM` da venda de 60 grava 1 linha; com `excluir` = esse número → `VENDA_PERIODO` 30 e `CONSUMO_DIARIO` menor; `sgcEscVendaReconsiderar` apaga e a venda volta a 90 |
| C-014 | `tests/ressuprimento.test.mjs` | linhas 15 e 16 da tabela: com e sem licitação, todas as grandezas e o status |
| C-015 | `tests/ressuprimento.test.mjs` | 5 medidas com valores 500/250/150/70/30 → `['A','A','B','C','C']` por `montarRessuprimento` (a régua é a `curvaAbc` da 003) |
| C-016 | `tests/ressuprimento.test.mjs` | sem parâmetro, com alvos 35/45/60 por curva → máximos 70/90/120 (linhas 12 a 14); sem regra alcançável → 35 |
| C-017 | `tests/ressuprimento.test.mjs` | `arredondarPorCaixa(50, 12)` → 60; `(48, 12)` → 48; `(0, 12)` → 0 (linha 19 cobre caixa 1) |
| C-018 | `smoke/011-compras-inteligentes.mjs` | `kbCardCriar` + `sgcEscPedidoCriar` (`origem: 'compras_inteligentes'`) + `sgcItensGravar` com 3 itens: 1 card na fase `analise`, `SGC_PEDIDO.ORIGEM` = `compras_inteligentes`, `PERIODO_INICIO/FIM` iguais à janela, `VALORES_JSON` com prioridade `alta`, 3 linhas em `SGC_PEDIDO_ITEM` com `QT_PEDIDA`, `QT_SUGERIDA`, `PRECO_CUSTO` e `CURVA_ABC`, e `VL_TOTAL` = soma |
| C-019 | `smoke/011-compras-inteligentes.mjs` | `sgcPedidoAbertoDoFornecedor` (1042, filial 1) devolve 1 linha com `TITULO` e `FASE_CHAVE = 'analise'`; para a filial 2 (card em `enviado`) devolve 0 |
| C-020 | `smoke/011-compras-inteligentes.mjs` | no card criado pelo carrinho, o 5403 tem `QT_PEDIDA` 24; gravar em lote **só os produtos novos** e reler: 5403 continua com 24 e os novos entram com 0. O que o smoke prova é o **upsert**: item que não entra no lote não é tocado. Quem decide mandar só os novos é `Itens.tsx:107-109` (003), citado, não reimplementado aqui — esta spec não cria cópia dessa regra |
| C-021 | `smoke/011-compras-inteligentes.mjs` | as três consultas do detalhe do 5403 devolvem contagem > 0: histórico com ≤ 12 meses, ≥ 1 compra e ≥ 2 filiais com estoque |
| C-022 | `smoke/…` + `tests/ressuprimento.test.mjs` | `sgcEficienciaComprador` recortada por `codfornec: 1042` e `compradorId` do criador devolve `ITENS` 5, `ADERENTES` 3 e `PERC_ADERENCIA` 60,0 (R-045: nada de literal absoluto sobre a listagem global); `aderenteASugestao` devolve o mesmo para os 5 pares |
| C-023 | `smoke/…` + `tests/permissoes.test.mjs` | matriz: `verComprasInteligentes` para admin/analista/gestor/diretoria e não para comercial; `operarComprasInteligentes` zerada em `READ_ONLY`; `parametrizarCompras` só admin/gestor; no servidor, `sgcEscParametroCompraSalvar` grava como `gil` e não grava como `ana` nem como `leo` |
| C-024 | `tests/ressuprimento.test.mjs` | `COLUNAS_CSV` tem 10 títulos; `linhaCsv` de 3 linhas + `textoCsv` produz 4 linhas com `;`, com a descrição contendo `"` escapada |
| C-041 | `smoke/011-compras-inteligentes.mjs` | `sgcWintProdutoVendas` (5408, janela) → ≥ 4 vendas com `CODUSUR` > 0 e `VENDEDOR` não vazio; em C-021, a entrada do 970001 traz `DT_SOLICITACAO` e `DT_PREVISAO` no formato ISO e `DT_PREVISAO < DT_ENTRADA` |
| C-042 | `tests/ressuprimento-detalhe.test.mjs` | `rotuloMesLongo`, `mesesDeVendas`, `vendasDoMes`, `resumoDeVendas`, `desconsideradasPorMes` + `serieComprasVendas` com a 5ª série, `serieEmCaixas`, `mesesComMovimento`/`historicoSuficiente`, `entradaAtrasou`, `necessidade` (R-123) |
| RN-001 | `smoke/011-compras-inteligentes.mjs` | os pesos, pela janela de 2 dias de C-008 (o dia do fim vale 1 e o anterior 0,85: 18,5 ÷ 1,85 = 10) |
| RN-002 | `smoke/011-compras-inteligentes.mjs` | 5401 → `ESTOQUE_TOTAL` 100 e `ESTOQUE_ATUAL` 80; 5402 → `ESTOQUE_ATUAL` 0 (nunca negativo); 5404 → `ESTOQUE_EM_TRANSITO` 10 |
| RN-003, RN-004, RN-005 | `tests/ressuprimento.test.mjs` | `resolverParametros` com as quatro combinações de cada eixo (sku, fornecedor, medido/curva, padrão) |
| RN-006, RN-007, RN-008, RN-009 | `tests/ressuprimento.test.mjs` | as linhas 17 a 19 da tabela mais os casos de contorno (consumo 0, máximo menor que o disponível) |
| RN-010 | `tests/ressuprimento.test.mjs` | lista vazia → vazio; todos com custo 0 → todos `C` |
| RN-011 | `smoke/…` + `tests/ressuprimento.test.mjs` | 5409 → `VENDA_PERIODO` 18 com `VENDA_PUBLICA` 6 e `CONSUMO_DIARIO_PUBLICO` dentro de `CONSUMO_DIARIO`; a regra subtrai e nunca fica negativa |
| RN-012 | `smoke/011-compras-inteligentes.mjs` | com a venda de 60 em `{{excluir}}`, ela não aparece em `VENDA_PERIODO`, em `VENDA_PUBLICA` nem no consumo — a exclusão é na origem |
| RN-013 | `tests/ressuprimento.test.mjs` | `estaSilenciado('2026-09-17', '2026-09-16')` → true; `('2026-09-15', …)` → false; `('', …)` → false; `dataDeSilencio('2026-09-16')` → `'2026-10-16'` |
| RN-014 | `smoke/011-compras-inteligentes.mjs` | a consulta não traz 5419 (inativo) nem 5420 (departamento 4); venda com `QT` negativa não entra em `VENDA_PERIODO` |
| RN-015 | `tests/ressuprimento.test.mjs` | `agruparCarrinho` com 3 itens do mesmo fornecedor/filial e 1 em ruptura → 1 grupo, `prioridade: 'alta'`, total certo; sem ruptura → `'normal'`; com 2 filiais → 2 grupos |
| RN-016 | `smoke/011-compras-inteligentes.mjs` | a consulta lista o card em `analise` e não lista o de `enviado`; movendo o primeiro para `tecnica`, continua listando |
| RN-017 | `smoke/011-compras-inteligentes.mjs` | a mesma gravação de C-020, com um item existente e dois novos: `sgcEscItemGravar` nem chega a receber o item do carrinho, e por isso `QT_PEDIDA = VALUES(QT_PEDIDA)` (`add-006-itens.mjs:286`) não o alcança |
| RN-018 | `tests/ressuprimento.test.mjs` | (100,100), (100,80), (100,120) → true; (100,79), (100,121), (0,10) → false |
| RN-019 | `tests/permissoes.test.mjs` | a matriz de C-023, persona a persona e nível a nível |

- **Backend:** `backend/simulator/smoke/011-compras-inteligentes.mjs`, um `teste()` por linha,
  título começando pelo id. Toda consulta ao WinThor assere **contagem > 0** (vazio não é
  verde). Nenhuma asserção literal sobre listagem global (R-045): a eficiência é recortada por
  fornecedor e comprador, e a contagem de produtos é filtrada pela faixa 5401–5420.
- **Frontend:** `frontend/tests/ressuprimento.test.mjs` (novo) e `permissoes.test.mjs`
  (existente, ganha as três chaves), com `node --test` sobre `src/lib/`.
- **Seed extra para o smoke:** nenhum além do `seed/011-compras-inteligentes.mjs`.

## Dependências entre specs

**Consome da 002 (quadro):**

- `sgcEscPedidoCriar` (7250) — precisa aceitar **`{{origem}}`** no lugar do literal `'manual'`
  (`add-005-quadro-compras.mjs:396`), com a lista fechada
  `AND '{{origem}}' IN ('manual', 'compras_inteligentes')`. **É entrega da base (S2)**, não
  desta spec (R-106): trocar o literal por parâmetro quebra `NovoPedidoPage.tsx:128` e
  `smoke/002-quadro.mjs` se os três pontos não mudarem no mesmo commit — a SQL, a chamada da
  tela e a chamada do smoke, todas com `origem: 'manual'`. Os três trechos prontos estão em
  `tasks.md` (T-013). A 011 consome o parâmetro já existente.
- `SGC_PEDIDO`, `SGC_FASE`, `KB_CARD` para o bloqueio do carrinho (RN-016) e para a eficiência.
- O título do card segue a RN-014 da 002 (`FILIAL · FORNECEDOR` em maiúsculas), pela mesma
  função que `/pedidos/novo` usa.

**Consome da 003 (itens):** `lib/compras.ts` (`curvaAbc` — a régua única de R-088 —,
`arredondarPorCaixa`, `unidadesPorCaixa`), `sgcCustoUnidadesPorCaixa` (7306),
`sgcCoberturaListar` (7307), `sgcItensGravar` (7309) e a estrutura de `SGC_PEDIDO_ITEM`
(`QT_SUGERIDA`, `QT_PEDIDA`, `PRECO_CUSTO`, `CURVA_ABC`).

**Nada muda no comportamento da 003, mas uma assinatura estreita na base (R-110):**
`curvaAbc(linhas: LinhaAnalise[])` hoje exige o registro inteiro da montagem (`ESTOQUE`,
`TRANSITO`, `VENDA_LICITACAO`…), e a `MedidaRessuprimento` desta spec não tem esses campos —
`tsc -b` recusaria a chamada. A base (S2) troca o parâmetro por
`Pick<LinhaAnalise, 'CODPROD' | 'VENDA_PERIODO' | 'CUSTO_ULT_ENTRADA'>[]`, que é exatamente o
que a função lê. É alargamento de tipo: todo chamador atual continua válido, o corpo não muda
e a régua continua única. Trecho pronto em `tasks.md` (T-014).

**Consome da 012 (coberturas por curva):** `limiteDeCobertura(coberturas, alvo, curva)` de
`frontend/src/lib/cobertura.ts`, que a 012 é dona nesta onda (R-096). O contrato de que esta
spec precisa, e só ele:

```ts
limiteDeCobertura(
  coberturas: Cobertura[],
  alvo: { codprod: number; codsec: number; codepto: number; codfornec: number },
  curva: 'A' | 'B' | 'C',
): { alvoDias: number; limiteDias: number; toleranciaPct: number; nivel: NivelCobertura | 'padrao' };
```

A 011 usa **`alvoDias`** — o alvo da curva, sem tolerância (R-089) — e ignora `limiteDias`
(que é o teto sem justificativa da montagem, 003). Sem linha alcançável, `alvoDias` é 35.

**`lib/ressuprimento.ts` não importa `lib/cobertura.ts`** (R-111). A dependência é por
**injeção**: `montarRessuprimento` recebe `alvoDaCurvaDias: (alvo, curva) => number` e só a
tela conhece `limiteDeCobertura`. Três consequências, todas boas:

- os testes de `frontend/tests/ressuprimento.test.mjs` rodam com um *stub* de três linhas
  (`() => 35`, ou uma tabela `{ A: 20, B: 35, C: 50 }`), sem depender do arquivo da 012 nem do
  seu seed — a 011 fica testável antes de a 012 existir;
- se a 012 atrasar, a tela injeta `() => 35` e nada mais muda (uma linha em
  `ComprasInteligentesPage.tsx`, T-038);
- quando a 012 integrar, a mesma linha vira
  `(alvo, curva) => limiteDeCobertura(coberturas, alvo, curva).alvoDias`. O merge não toca na
  regra pura.

**Consome da 001 (fornecedores):** `sgcFornecedorListar` e `sgcFornecedorCarregar` (filiais
atendidas), exatamente como `/pedidos/novo` (`NovoPedidoPage.tsx:55-98`). Nenhuma SF nova.

**Fornece:**

- `SGC_PEDIDO.ORIGEM = 'compras_inteligentes'` como recorte dos pedidos nascidos aqui — é o
  que a eficiência (R-092) e, se a 009 quiser, os indicadores consomem;
- `SGC_PARAMETRO_COMPRA` como o lugar único dos parâmetros de compra;
- `lib/ressuprimento.ts` como a régua única de ressuprimento do projeto;
- à **012**: nada além do consumo — a 011 não escreve em `SGC_COBERTURA`.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | A consulta devolve **medidas** e a fórmula roda na regra pura da tela | Cálculo no SQL, como o legado (e como O4-01 dizia) | R-083. Parâmetro de SKU vive no Mitra e medida no Oracle: bancos diferentes. Foi por isso que o legado salvou o parâmetro por SKU e o ignorou (`ComprasInteligentesPage.tsx:1832-1841`). Com a fórmula pura, o parâmetro por SKU **funciona** e a fórmula fica testada em `node --test` |
| D-002 | A venda pública fica dentro do consumo, com uma **segunda coluna** de consumo público | Excluir no `WHERE`, como o legado (`update-estoque-centralizado.mjs:115`) | R-084. Duas telas dariam sugestões diferentes para o mesmo produto (AN-04 A manda incluir). E só com o consumo público **ponderado** o seletor da tela pode subtrair sem refazer a consulta (RNF-005) |
| D-003 | Estoque de segurança = lead × consumo (R-082), não o `9` literal do legado nem o fator Z | Porte fiel da geração 2 (`ROUND(9 × consumo, 3)`, `:225`) ou fator Z vivo | O `9` do legado era o lead time padrão escrito à mão dentro da fórmula: com lead medido de 30 dias, a segurança continuava 9 dias. O fator Z era calculado e nunca usado (`:220-224`). A volatilidade continua medida e exibida; a segurança estatística é dívida D-28 |
| D-004 | Peso de recência por `DIAS_ATE_FIM` (inteiro do calendário), não por subtração de datas | `TRUNC(dataFim) − D.DIA`, como o legado (`:124`) | No SQLite a subtração de dois textos dá 0 e o peso viraria 1 em todo dia — erro silencioso. `{{diasPeriodo}}` vem da tela e a conta é de inteiros nos dois bancos |
| D-005 | Volatilidade por `AVG(x²) − AVG(x)²` com `SQRT` | `STDDEV_POP` com shim (R-096) | `STDDEV_POP` é agregado; o dialeto registra escalares (`db.function`). A identidade dá o mesmo número com funções que já existem ou que R-096 já pede |
| D-006 | A consulta principal **não pagina** | `OFFSET … FETCH NEXT`, como o legado (`:317`) | A curva ABC é acumulada sobre o fornecedor inteiro (R-088): paginar no servidor daria uma curva por página. A tela pagina o que já tem em memória, e filtro/ordenação/aba passam a custar zero execução (RNF-005) |
| D-007 | O carrinho cria o pedido por `kbCardCriar` + `sgcEscPedidoCriar` + `sgcItensGravar`, da tela | SF JavaScript de orquestração (`sgcCarrinhoCriarPedido`) | R-091 é explícita ("nenhuma SF JavaScript nova para criar pedido"), e o caminho de `/pedidos/novo` já existe e está testado. Três execuções por grupo, contra uma execução externa mais três aninhadas |
| D-008 | O `valor_total` da capa vai no próprio `cardCriar` | `kbCardAtualizar` depois de gravar os itens | A tela já sabe a soma do carrinho; um `kbCardAtualizar` a mais custaria execução e ainda precisaria reenviar responsáveis e prazo (R-047) |
| D-009 | O bloqueio do carrinho tem SF própria (`sgcPedidoAbertoDoFornecedor`) | Deduzir de alguma listagem existente | Nenhuma SF atual cruza `SGC_PEDIDO` com a fase por fornecedor+filial, e a mensagem precisa citar o card e a fase (RF-018). Uma execução por carga, nada por linha |
| D-010 | `sgcWintProdutoVendas` é SF a mais, e vive num diálogo próprio | Tirar as vendas do detalhe do SKU | Sem a lista de vendas com `NUMTRANSITEM` não há como escolher a venda atípica (RF-012), e a chave de R-087 é justamente o `NUMTRANSITEM`. Fica fora do detalhe para o detalhe continuar em 3 execuções (RNF-003) |
| D-011 | O parâmetro de gatilho marca o item como **urgente** (ordem + selo), não recorta a aba | Gatilho como filtro da aba "a comprar" | O legado salvava o gatilho e não o usava em lugar nenhum; O4-02 o mantém com padrão 15. Dar-lhe o papel de recorte esconderia sugestão real da compradora; dar-lhe o papel de prioridade resolve o que o nome promete sem esconder nada |
| D-012 | "A comprar" = sugestão > 0 e não silenciado | Incluir também quem tem gatilho baixo e sugestão 0 | Sugestão 0 é "não há o que comprar" (há trânsito, ou o estoque já passou do máximo): listar seria oferecer um botão que não faz nada |
| D-013 | Nenhuma tabela guarda o resultado do cálculo | Tabela de sugestão persistida | O legado criou `SUGESTAO_COMPRA` e **nunca escreveu nela** (`add-compras-inteligentes.mjs:111-134`). O cálculo é barato e muda a cada venda; persistir só criaria uma segunda verdade |
| D-014 | Silenciamento e parâmetros na **mesma linha** de `SGC_PARAMETRO_COMPRA`, com duas escritas que não se pisam | Tabela separada de silenciamento | A chave é a mesma (fornecedor + filial + produto) e o `ON DUPLICATE KEY UPDATE` de cada escrita toca só as suas colunas — é o que o legado já fazia com duas SFs sobre `PRODUTO_PARAMETROS_COMPRA` |
| D-015 | O seed usa o fornecedor **1042** | 1015, como sugeria R-096 | **R-097** (R-096 emendada): `smoke/003-itens.mjs:59` assere que `sgcWintAnaliseMontagem` do 1015 devolve **18** linhas; 20 produtos novos no 1015 quebrariam a 003 |
| D-016 | A janela de 153 dias é fixa, mostrada e não editável | Campo de período na tela | É o padrão do legado (`ComprasInteligentesPage.tsx:1766-1767`) e o que R-082 fixa. Um campo a mais aqui só criaria uma segunda janela para explicar na curva e no consumo — se o usuário pedir, entra depois |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O SQLite recusar `WITH RECURSIVE` dentro do corpo de uma CTE | a suíte 011 inteira falha no simulador | a reescrita tem caso próprio no `smoke/000-dialeto.mjs` (base), que é o primeiro a rodar; se falhar, a CTE recursiva sobe para o `WITH` do topo — muda o lugar, não o conteúdo |
| Um shim de data devolver número plausível e errado (peso 1 em todo dia) | consumo errado em silêncio, sugestão errada | D-004 tirou a subtração de datas do caminho; o teste de C-008 assere 10,0000 / 9,1892 / 10,8108, que só batem se o peso estiver certo |
| `{{excluir}}` passar de 500 itens | `ORA-01795` na consulta principal | a tela corta nos 500 mais recentes e mostra `Alert`; `ponytail:` acima disso o recorte teria de ir por produto |
| `PCEST` sem `QTBLOQUEADA`/`QTINDENIZ`/`QTRESERV` no sandbox | a consulta quebra na primeira publicação | as três colunas existem no WinThor real (é de lá que o legado as lê, `:52-54`); no simulador entram por R-096 |
| A 012 atrasar e `limiteDeCobertura` não existir no merge | o estoque máximo cairia para 35 fixo | a regra pura não importa a 012 (R-111): recebe `alvoDaCurvaDias` injetado. Sem a 012, a tela injeta `() => 35` e os testes usam um *stub*; com a 012, a mesma linha passa a chamar `limiteDeCobertura(...).alvoDias` |
| Fornecedor com 2.000+ produtos | carga lenta e memória na tela | `ponytail:` teto declarado em D-006; a saída seria calcular a curva numa passada e paginar na segunda |
| `sgcItensGravar` recusar por fase ou por dono | o pedido nasce sem itens | o card acabou de nascer em `analise` e o criador é quem opera (`pedidoEmAnalise`, `add-006-itens.mjs:467-476`); a tela relê o pedido e mostra `Alert` se o retorno vier `ok: false` |

## Complexity Tracking

Vazio: nenhuma violação de princípio.

## Pedidos ao 000 — todos respondidos

Os seis pedidos da S1 voltaram aceitos no 000 (tabelas *Decisões tomadas na S1 da onda 4* e
*Revisão cruzada da S1 da onda 4*). Ficam aqui com a resposta ao lado, porque o plan cita os
números; **não há pedido aberto**.

| # | Pedido | Resposta |
|---|---|---|
| 1 | Seed no fornecedor **1042**, não no 1015 (`smoke/003-itens.mjs:59` assere 18 linhas de `sgcWintAnaliseMontagem` para o 1015; 20 produtos novos lá quebrariam C-001 da 003) | **R-097** — aceito; faixas 5401–5420, 9301–9305, `NUMTRANSITEM` ≥ 960001 e `NUMPED` ≥ 970001 mantidas |
| 2 | `sgcEscPedidoCapaSalvar` não existe: a escrita é **`sgcEscPedidoCriar`** (7250, `add-005-quadro-compras.mjs:390`), e ela precisa de `{{origem}}` no lugar do literal `'manual'` (`:396`) | **R-098**, emendada por **R-106** — o nome está corrigido, e o `{{origem}}` virou entrega da **base (S2)** com os três pontos de chamada no mesmo commit (T-013) |
| 3 | Duas SFs a mais na linha 011: `sgcPedidoAbertoDoFornecedor` (8108) e `sgcWintProdutoVendas` (8105) | **R-099** — aceitas, com os ids 8101–8109 (leitura) e 8150–8154 (escrita) fixados por este plan |
| 4 | `INSTR` e `STDDEV_POP` saem dos shims de R-096; entram `POWER`, `SQRT`, `ADD_MONTHS` e o gerador de calendário | **R-100** — aceito; a reescrita exata está na seção *Simulador* e ganha caso próprio no `smoke/000-dialeto.mjs` |
| 5 | `CHECK_INPUT` sem `leadTimeDias`, `coberturaDias` e `curva` (com R-083 deixaram de ser parâmetro de SQL); chaves novas `diasPeriodo`, `excluir`, `meses`, `compradorId`, `numtransitem` | **R-100** — aceito |
| 6 | `SGC_PEDIDO.ORIGEM` cabe em `VARCHAR(20)` por um caractere (`compras_inteligentes` = 20) | **R-098** — registrado; nenhum valor de origem futuro pode passar de 20 |

A revisão cruzada acrescentou quatro entregas da base que esta spec consome e **não**
implementa — estão em `tasks.md` como tarefas de base, cada uma com o trecho pronto:

- **R-106** — `{{origem}}` em `sgcEscPedidoCriar`, com `add-005`, `NovoPedidoPage.tsx` e
  `smoke/002-quadro.mjs` no mesmo commit (T-013);
- **R-107** — `seed011` em `seed.mjs` e a suíte 011 em `smoke.mjs` (depois de `indicadores`),
  com stub vazio (T-015);
- **R-110** — `curvaAbc()` aceitando `Pick<LinhaAnalise, 'CODPROD' | 'VENDA_PERIODO' | 'CUSTO_ULT_ENTRADA'>[]` (T-014);
- **R-113** — os shims encadeados em `toSqlite` sem remover nenhuma reescrita da onda 3, as
  colunas de `PCEST`, a chave de `CHECK_INPUT`, as permissões, a rota, o menu e a página-stub
  (T-020 a T-024, T-037).

## Layout legado — Opção A (R-117, 2026-10-30)

A tela foi redesenhada no layout do sistema antigo (p-60523), mantendo tudo o que a
spec já tinha e acrescentando os cenários C-026..C-039. Nada da regra pura anterior
mudou; o que entrou está em módulos próprios para o `max-lines` de 800.

### Arquivos

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/lib/ressuprimento.ts` | **+** visões (`linhasDaVisao`, `contarVisoes`, `completarCompra`, `quantidadeParaCompletar`, `emTransito`), ordem (`ordenarLinhas`), movimentação (`filtrarMovimentacao`), `nivelDeCobertura`, `textoDaSugestao`, `FiltrosLista`; a medida ganha `CUSTO_ATUAL` e `CODFAB` opcionais |
| `frontend/src/lib/ressuprimento-detalhe.ts` | **novo**: `serieComprasVendas`, `totaisDoRodape`, `filiaisComExcesso`, `simularCompra`, calendário de meses, `DadosDoSku` |
| `frontend/src/lib/carrinho.ts` | **novo**: `ItemCarrinho` (motivo + pedido mínimo), `carrinhoDeTexto`/`textoDoCarrinho` (RN-021), `resumoDoCarrinho`, `variacaoDePreco`, `economiaNoCusto`, `faltaParaMinimo`, `pedidoMinimoDoGrupo`, `filtrarCarrinho`, `textoImportacaoWinthor`, `nomeArquivoWinthor` |
| `frontend/src/lib/csv.ts` | **+** `baixarTexto` (sem BOM) — o arquivo do WinThor é lido pelo ERP |
| `frontend/src/components/page.tsx` | **+** §8.8: `CardVisao`, `GradeVisoes`, `ChipContagem`, `Disclosure`, `AlternaOpcoes`; reexporta `ComposedChart` e `LabelList` |
| `pages/compras-inteligentes/ComprasInteligentesPage.tsx` | orquestração: cabeçalho com ações (Unidades/Caixas, Parâmetros do fornecedor, Coberturas ABC, Atualizar), barra de recorte, aviso de carrinho salvo, cards de visão, duas colunas a partir de `xl` (`xl:grid-cols-[minmax(0,1fr)_440px]`), carrinho em janela, diálogos |
| `pages/compras-inteligentes/grid.tsx` | `ListaProdutos`: subtítulo, botão do carrinho, chips, tabela com linha selecionável (fundo accent + barra de 4px), paginação |
| `pages/compras-inteligentes/painel-detalhe.tsx` | `PainelDetalhe`: 4 `Kpi`, o gráfico, as seis `Disclosure` |
| `pages/compras-inteligentes/grafico.tsx` | `GraficoComprasVendas`: `ComposedChart` com `LabelList` em toda marca (R-116), 6m/13m, Gráfico/Tabela, rodapé |
| `pages/compras-inteligentes/Carrinho.tsx` | `CarrinhoDialogo` (Dialog `sm:max-w-6xl`): cabeçalho, busca, grupos com `BarraConsumo` do mínimo, colunas do legado, rodapé |
| `pages/compras-inteligentes/dialogos.tsx` | inalterado: `DetalheSku` (botão olho), `ParametrosDialogo`, `SilenciarDialogo`, `VendasDialogo` |

### Contratos novos (add-013, bloco 81xx)

| Nome | Tipo | Params | Saída | Id local |
|---|---|---|---|---|
| `sgcWintResumoFornecedores` | SQL (Oracle, `jdbcId`) | `codfornecs` **fragmento** (lista de CODFORNEC), `dataInicio`, `diasPeriodo` | `CODFORNEC`, `ITENS`, `VALOR_SUGERIDO` (RN-026) | 8110 |
| `sgcItensEmPedidoAberto` | SQL (banco do projeto) | `codfornec`, `codfilial`, `limite`, `offset` | `CODPROD`, `ID_CARD`, `TITULO`, `FASE_CHAVE`, `QT_PEDIDA` — fases de RN-016, pela CHAVE | 8111 |

`sgcWintRessuprimento` ganha duas colunas: `CODFAB` (`PCPRODUT.CODFAB`) e `CUSTO_ATUAL`
(`PCEST.CUSTOFIN`). No simulador, `PCEST` ganha `CUSTOFIN` (`schema-winthor.mjs`) e o
seed 011 grava `FAB-<codprod>` e dois custos atuais diferentes do da última entrada
(5401: 12 → 11; 5403: 10 → 10,50). `CHECK_INPUT` ganha `codfornecs: '1042'`.

### Fluxo e orçamento (RNF-001 emendada)

1. Abrir: `sgcFornecedorListar` + `sgcEficienciaComprador` + `api.boardCarregar` (3) e, com a lista de
   fornecedores, `sgcWintResumoFornecedores` (1) → o `hint` de cada opção do seletor.
2. Fornecedor: `sgcFornecedorCarregar` (1) → filiais e `PEDIDO_MINIMO`.
3. Filial: `sgcParametrosCompraListar`, `sgcVendasDesconsideradasListar`, `sgcCoberturaListar`,
   `sgcPedidoAbertoDoFornecedor`, `sgcItensEmPedidoAberto` em paralelo (5), `sgcWintRessuprimento` (1) e,
   com os códigos da lista, `sgcCustoUnidadesPorCaixa` (R-120, 1 por lote de 1000) → o `Map` de
   `montarRessuprimento`, que também grava a origem da caixa na linha (`origemCaixa`).
4. Selecionar um produto (o primeiro vem selecionado): `sgcWintProdutoHistorico` (13 meses),
   `sgcWintProdutoUltimasCompras`, `sgcWintProdutoEstoqueFiliais` (3), em cache por SKU; "Atualizar"
   limpa o cache. O gráfico, as filiais com excesso e a simulação saem desses dados e da linha.
5. Carrinho: cada mudança grava no `localStorage` (`CHAVE_CARRINHO(usuarioId)`), com `abertoEm`,
   `abertoPor` e `salvoEm`; ao abrir a tela com carrinho da tela vazio e texto guardado, o aviso.
   "Criar N pedidos" é o mesmo caminho de antes (3 execuções por grupo); o "por que comprar" vai
   como `observacao` do item. O carrinho só é bloqueado pelo pedido aberto do fornecedor + filial
   **da tela** (os demais grupos, vindos de um carrinho salvo, não custam consulta extra).

### Testes acrescentados

| Cenário / regra | Arquivo |
|---|---|
| C-026, C-027, RN-020, C-038, C-031, C-037 | `frontend/tests/ressuprimento.test.mjs` |
| C-032, C-033, C-034, RN-025, calendário | `frontend/tests/ressuprimento-detalhe.test.mjs` |
| C-028, C-029, C-030, C-039 (tela), RN-021, RN-022, RN-023, RN-027 | `frontend/tests/carrinho.test.mjs` |
| C-035, C-036, C-039 (servidor), RN-026, RN-027 | `backend/simulator/smoke/011-compras-inteligentes.mjs` |

### Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-017 | O carrinho é guardado no **navegador**, por usuário | Tabela `SGC_CARRINHO` + 3 SFs | Zero execução a mais na carga (RNF-001) e nenhuma tabela nova; retomar de outra máquina é dívida registrada na spec |
| D-018 | "Completar compra" = sugestão 0, sem trânsito, com giro, cobertura ≤ alvo + lead (RN-020) | Todo produto com sugestão 0 | Com sugestão 0 o disponível já passa do máximo: listar tudo seria oferecer o que sobra para fechar o mínimo; a régua pega o que fura no próximo ciclo |
| D-019 | O arquivo do WinThor é `CODPROD;PRECO;QTD`, ponto decimal, sem cabeçalho, sem BOM, um por grupo | Planilha | É um arquivo para o ERP ler; o formato exato do importador do WinThor deve ser confirmado com quem opera o ERP |
| D-020 | O resumo do seletor é uma **estimativa** numa consulta para todos os fornecedores, sem filial (RN-026) | A consulta principal por fornecedor | 200 fornecedores × consulta pesada não cabe em nenhum orçamento; a estimativa custa 1 execução e o rótulo diz "sugestão" sem prometer a conta exata |
| D-021 | O detalhe custa 3 execuções **ao selecionar**, uma vez por SKU, com cache | Carregar o detalhe de toda a lista | Nada por linha; o painel fixo precisa dos dados ao clicar, e a mesma consulta alimenta gráfico, filiais com excesso e compras |
| D-022 | As unidades por caixa vêm do Gestão de Custos numa execução por carga (R-120) | Mapa vazio, como D-006 fazia por orçamento | A referência Unidades/Caixas e o "N cx" ficavam na embalagem; uma execução em lotes de 1000 é barata, e o simulador agora roda a INTEGRATION (SQLite por padrão, plataforma com env) |
