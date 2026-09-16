# Plan: Indicadores e relatórios — o painel de gestão de compras

**Spec:** `spec.md` · **Data:** 2026-09-15

> O COMO. Nenhum requisito novo nasce aqui — se faltou algo, volta pra spec.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem `[NEEDS CLARIFICATION]`; cenários vindos de O3-03 de `regras.md` e das decisões R-051, R-057, R-058, R-059, R-061, R-062 e R-063 do 000 |
| Backend escrito local, executado no sandbox | sim | arquivo novo `backend/add-012-indicadores.mjs` (R-051); a tabela `SGC_RELATORIO` entra no `setup-backend.mjs` **pelo integrador** (arquivo compartilhado, R-062); nada do `mitra-sdk` roda da máquina local |
| Migrations append-only | sim | nada em `backend/migrations/`; o DDL vive no `setup-backend.mjs`, no `CREATE` e sem `ALTER` (a onda 3 ainda não publicou) |
| Leitura e escrita por Server Function | sim | nenhum `listRecords`/`patchRecord`: as duas telas usam `linhas()`/`linha()` de `src/lib/mitra-api.ts`; as três escritas são SF SQL guardadas por `:VAR_USER` chamadas direto da tela — **nenhuma escrita por id nesta spec** |
| Simulador cobre a feature | sim | `simulator/seed/009-indicadores.mjs` insere **só relatórios salvos** (R-062: nenhum pedido, card, NF ou solicitação nova); `sim:check` roda as 17 SQL de leitura |
| Testes automatizados obrigatórios | sim | 27 cenários e 16 regras mapeados em `backend/simulator/smoke/009-indicadores.mjs` e em `frontend/tests/{sla,analises,relatorio}.test.mjs`; `npm test` verde nos dois lados |
| Design tokens, sem cor literal | sim | §8.7 e §12 do `design.md`: `GradeKpi`/`Kpi`, `GradeGraficos`/`PainelGrafico`, `corDeSerie` e o `chart.tsx` do kit; cor de série só de `--data-*`, estado sempre com rótulo escrito; zero hex, zero `style={{}}`, zero classe Tailwind solta |
| Simplicidade | sim | **zero SF JAVASCRIPT** (não há orquestração, e-mail nem cron aqui — o paralelismo é da tela, R-057); uma cadeia de CTEs serve quatro consultas em vez de quatro réguas; `recharts` + `chart.tsx` são dependência prevista pelo `design.md` §1.2 e instalada pela base (R-058) |

## Contexto técnico

- **Frontend:** React 19 · Vite 7 · Tailwind 4 · react-router 7 · `mitra-interactions-sdk`
- **Backend:** tabelas e Server Functions na plataforma Mitra, provisionadas por `backend/*.mjs` com `mitra-sdk`; leitura do WinThor por JDBC Oracle (`jdbcId` resolvido por nome no `isEntrypoint()`, como em `add-008`)
- **Reuso identificado:** `backend/lib/dias-uteis.mjs` (R-025, `diasUteisEntre`) e o gêmeo `frontend/src/lib/dias-uteis.ts`; `frontend/src/lib/csv.ts` (R-037); `lib/permissoes.ts`, `lib/persona.ts`, `lib/formato.ts`, `lib/mitra-api.ts`; `page.tsx` (`PageHeader`, `Panel`, `PanelHeader`, `Toolbar`, `SelectMenu`, `SearchInput`, `FilterChip`, `Table`/`Th`/`Td`/`Tr`, `RowTitle`, `RowMeta`, `Status`, `Badge`, `Code`, `Dash`, `Stat`, `Alert`, `EmptyState`, `Pagination`, `Dialog`, `Field`, `LabelledField`, `Button`, `IconButton`, `TextLink`, `CheckRow`) e o bloco §8.7 (`GradeKpi`, `Kpi`, `GradeGraficos`, `PainelGrafico`, `corDeSerie`, `AlternaVisao` e os primitivos do recharts reexportados); `DatePicker` (004); `sgcWintFiliais` (001) para o filtro do cabeçalho
- **Dependência nova:** `recharts` (+ `components/ui/chart.tsx` do kit shadcn). Justificativa: R-058 do 000 e `design.md` §1.2/§12.1 já a preveem como a biblioteca de gráfico da casa; **quem instala é a base (S2)**, não esta spec. Nenhuma outra: sem `xlsx` (R-059), sem `echarts`, sem biblioteca de datas

## Modelo de dados

Uma tabela nova, a do R-059. Tudo o mais é **leitura** de tabelas das ondas 1, 2 e 3.
Convenções do 000: colunas em UPPERCASE, datas em `VARCHAR(10)`/`VARCHAR(19)`, dinheiro
`DECIMAL(15,2)`, sem `FOREIGN KEY`, `ID` autoincremento.

### `SGC_RELATORIO` (R-059)

| Coluna | Tipo | Observação |
|---|---|---|
| `ID` | `INT AUTO_INCREMENT PRIMARY KEY` | |
| `TITULO` | `VARCHAR(180) NOT NULL` | vazio é recusado na escrita (RN-013) |
| `DESCRICAO` | `VARCHAR(500)` | |
| `CONFIG_JSON` | `TEXT` | o recorte inteiro; forma fixada abaixo |
| `COMPARTILHADO` | `BOOLEAN NOT NULL DEFAULT FALSE` | 0/1 |
| `CRIADO_POR` | `INT` | dono: só ele e o admin editam/excluem |
| `CRIADO_EM` | `VARCHAR(19)` | |
| `ATUALIZADO_POR` | `INT` | |
| `ATUALIZADO_EM` | `VARCHAR(19)` | |

`INDEX IX_SGC_RELATORIO_DONO (CRIADO_POR, ID)` — é por ele que a galeria monta
"meus + compartilhados".

O 000 escreveu `COMPARTILHADO TINYINT (0/1)`; o **nome e o domínio** são os do 000, o
**tipo** segue a convenção do projeto (`BOOLEAN`, como `SGC_FORNECEDOR.ATIVO` e
`SGC_ALERTA.LIDO`) — o tradutor do simulador já mapeia `BOOLEAN` → `INTEGER` e
`TRUE`/`FALSE` → 1/0, e `TINYINT` não passa por nenhum dos dois. Registrado em
*Pedidos ao 000*.

### A forma de `CONFIG_JSON` (fixada aqui; R-059)

```jsonc
{
  "filtros": {
    "fase": "",            // chave de fase ('' = todas)
    "codfornec": 0,        // 0 = todos
    "codfilial": "",       // '' = todas
    "responsavelId": 0,    // 0 = qualquer
    "prioridade": "",      // '' | 'normal' | 'alta' | 'urgente'
    "dataInicio": "",      // período de CRIAÇÃO do pedido; '' = sem limite inferior
    "dataFim": ""
  },
  "colunas": ["numero", "titulo", "fase", "fornecedor", "filial",
              "responsavel", "prioridade", "valor", "criado_em", "dias_na_fase"],
  "agrupamento": "fase",   // '' | fase | fornecedor | filial | responsavel | prioridade
  "grafico": { "tipo": "barra", "eixo": "fase", "medida": "contagem" },
  "visao": "tabela"        // 'grafico' | 'tabela'
}
```

- `tipo` só `barra` ou `linha` (R-058: nada de pizza); `medida` só `contagem`, `valor`
  (soma de `VL_TOTAL`) ou `dias_na_fase` (média);
- `eixo` e `agrupamento` têm o **mesmo domínio** e são independentes: a tabela agrupa por
  um, o gráfico por outro (o padrão iguala os dois);
- `colunas` é um subconjunto ordenado da lista fechada de `COLUNAS` de `lib/relatorio.ts`;
- a leitura é **tolerante** (`lerConfig`): chave desconhecida é descartada, chave faltando
  ganha o padrão, valor fora do domínio volta ao padrão. Relatório salvo antes de uma
  mudança abre, não quebra (C-018).

### Só leitura, de outras specs

| Origem | O que esta spec lê |
|---|---|
| lib (`KB_*`) | `KB_CARD` (`ID`, `BOARD_ID`, `FASE_ID`, `TITULO`, `VALORES_JSON`, `FASE_DESDE`, `CONCLUIDO_EM`, `EXCLUIDO_EM`, `CRIADO_EM`), `KB_FASE` (`ID`, `NOME`), `KB_CARD_RESPONSAVEL` (`CARD_ID`, `USUARIO_ID`, `ORDEM`), `KB_MOVIMENTO` (`ID`, `CARD_ID`, `PARA_FASE_ID`, `QUANDO`) |
| 002 | `SGC_FASE` (`BOARD_ID`, `CHAVE`, `FASE_ID`, `ORDEM`), `SGC_PEDIDO` (`ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `VL_TOTAL`, `DT_ENVIO`, `NUMPED_WINTHOR`, `ORIGEM`, `ID_AGENDA`, `CRIADO_POR`, `CRIADO_EM`), `SGC_USUARIO_PERSONA`, `INT_USER` |
| 001 | `SGC_FORNECEDOR` (`CODFORNEC`, `FORNECEDOR`, `ATIVO`, `SLA_ANALISE_DIAS`, `SLA_FATURAMENTO_DIAS`, `PRAZO_ENTREGA_DIAS`, `PRAZO_ENTREGA_TIPO`) e `sgcWintFiliais` |
| 003 | `SGC_PEDIDO_ITEM` (`ID`, `ID_CARD`, `STATUS`) |
| 004 | `SGC_AGENDA` (`ID`, `DATA_ANALISE`, `DATA_ENVIO_REAL`, `CODFILIAL`, `CODFORNEC`, `FORNECEDOR`, `FILIAL`, `ATIVO`, `ID_CARD_GERADO`) |
| 005 | `SGC_NF` (`ID_CARD`, `DT_EMISSAO`, `DT_RECEBIMENTO`), `SGC_PEDIDO` (`DT_PRIMEIRO_FATURAMENTO`, `PERC_FATURADO_VALOR`, `ALERTA_FATURAMENTO_NIVEL`) |
| 007 | `SGC_BO_ITEM` (`ID_CARD`, `CODPROD`, `DESCRICAO`, `QT_PENDENTE`, `STATUS`) |
| 008 | `SGC_SOLICITACAO` (`ID`, `CODFILIAL`, `STATUS`, `ID_CARD`, `ID_ITEM`, `CRIADO_POR`, `CRIADO_EM`, `AVALIADO_EM`) — **só as colunas do 000**; a situação derivada vem do fragmento da 008 (ver *Dependências*) |
| WinThor | `PCMOV` (`CODPROD`, `CODFILIAL`, `CODCLI`, `CODOPER`, `DTMOV`, `QT`, `PUNIT`), `PCPRODUT` (`CODPROD`, `CODFORNEC`), `PCFORNEC` (`CODFORNEC`, `FORNECEDOR`), `PCCLIENT` (`CODCLI`, `CODATV1`) |

## Contratos de backend

Tudo em `backend/add-012-indicadores.mjs`, que exporta `definitions`. Ids locais
**7901–7917** (leituras) e **7950–7952** (escritas), faixa 79xx do R-051. Filtro
desligado é `''` no texto e `0` no número. `hoje` desligado é `''` e vira a data do
servidor pelo idioma já usado na 005/006: `COALESCE(NULLIF('{{hoje}}', ''), CURDATE())`
— chamado de `HOJE` daqui em diante.

Todas as leituras são chamadas **direto da tela**, então identificam quem chama por
`:VAR_USER`; nenhuma recebe `{{usuarioId}}`, porque **não há JS nem cron nesta spec**
(D-001).

**O par `dataInicio`/`dataFim` é obrigatório em tudo que é indicador** (as quatro SFs da
cadeia de CTEs, `sgcIndResumo`, `sgcIndPedidosPorFase`, `sgcIndAgendaAtrasos`,
`sgcIndLeadTime`, `sgcSolicitacoesFunil`, `sgcSolicitacoesPorVendedor` e
`sgcWintComprasVsVendas`): a tela **sempre** manda um período (`intervaloPadrao()` ou o
mês/trimestre escolhido), e todo bloco diz de que período está falando. Ali o par entra
como `BETWEEN` seco, sem ramo de desligado — `BETWEEN '' AND ''` devolveria zero linha em
silêncio, que é pior do que não filtrar. O **único** lugar onde o período é filtro
desligável é o período de **criação** do relatório (R-059), e lá ele tem a forma de dois
ramos independentes:

```sql
AND ('{{dataInicio}}' = '' OR SUBSTRING(P.CRIADO_EM, 1, 10) >= '{{dataInicio}}')
AND ('{{dataFim}}'    = '' OR SUBSTRING(P.CRIADO_EM, 1, 10) <= '{{dataFim}}')
```

RN-014 tem um teste só para isso: com o par vazio, o total da consulta do relatório é
igual ao total sem nenhum filtro contado no próprio teste (D-014).

### A cadeia de CTEs dos pedidos — `pedidosCte()`

Uma função no `add-012` devolve o mesmo texto para **quatro** SFs (`sgcSlaPedidosKpis`,
`sgcSlaPedidosListar`, `sgcSlaPedidosListarTotal` e `sgcIndPerfilFornecedor`): é isto que
o R-057 chama de "KPIs e lista saem da mesma cadeia de CTEs", e é o que faz o número do
topo nunca discordar da linha da tabela (RF-012, C-013).

```sql
WITH PED AS (
  SELECT
    C.ID AS CARD_ID, C.TITULO, C.FASE_ID,
    COALESCE(KF.NOME, '')  AS FASE_NOME,
    COALESCE(SF.CHAVE, '') AS FASE_CHAVE,
    CASE WHEN COALESCE(SF.CHAVE, '') = 'concluido' THEN 1 ELSE 0 END AS CONCLUIDO,
    SUBSTRING(COALESCE(C.CONCLUIDO_EM, ''), 1, 10) AS DT_CONCLUSAO,
    P.CODFORNEC, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
    COALESCE(P.CODFILIAL, '') AS CODFILIAL, COALESCE(P.FILIAL, '') AS FILIAL,
    COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED_WINTHOR,
    COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL,
    COALESCE(P.PERC_FATURADO_VALOR, 0) AS PERC_FATURADO,
    SUBSTRING(P.CRIADO_EM, 1, 10) AS DT_CRIACAO,
    COALESCE(NULLIF(P.DT_ENVIO, ''), '') AS DT_ENVIO,
    COALESCE(NULLIF(P.DT_PRIMEIRO_FATURAMENTO, ''), COALESCE(NF.PRIMEIRA_NF, '')) AS DT_PRIMEIRA_NF,
    COALESCE(NF.QTD_NFS, 0) AS QTD_NFS,
    CASE
      WHEN COALESCE(SF.CHAVE, '') = 'concluido' THEN COALESCE(NF.RECEB_MAX, '')
      WHEN COALESCE(NF.QTD_NFS, 0) > 0 AND COALESCE(NF.NFS_SEM_RECEBIMENTO, 0) = 0
           AND COALESCE(P.PERC_FATURADO_VALOR, 0) >= 100 THEN COALESCE(NF.RECEB_MAX, '')
      ELSE '' END AS DT_ENTREGA,
    COALESCE(NULLIF(AG.DATA_ANALISE, ''), '') AS DT_AGENDA,
    COALESCE(NULLIF(SUBSTRING(COALESCE(AG.DATA_ENVIO_REAL, ''), 1, 10), ''),
             COALESCE(NULLIF(P.DT_ENVIO, ''), '')) AS DT_ENVIO_EFETIVO,
    CASE WHEN COALESCE(F.SLA_ANALISE_DIAS, 0)     > 0 THEN F.SLA_ANALISE_DIAS     ELSE 1 END AS META_ANALISE_DIAS,
    CASE WHEN COALESCE(F.SLA_FATURAMENTO_DIAS, 0) > 0 THEN F.SLA_FATURAMENTO_DIAS ELSE 5 END AS META_FATURAMENTO_DIAS,
    COALESCE(F.PRAZO_ENTREGA_DIAS, 0) AS META_ENTREGA_DIAS,
    CASE WHEN COALESCE(F.PRAZO_ENTREGA_TIPO, 'uteis') = 'corridos' THEN 'corridos' ELSE 'uteis' END AS META_ENTREGA_TIPO
  FROM SGC_PEDIDO P
  JOIN KB_CARD C       ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL
  LEFT JOIN KB_FASE KF ON KF.ID = C.FASE_ID
  LEFT JOIN SGC_FASE SF ON SF.FASE_ID = C.FASE_ID AND SF.BOARD_ID = C.BOARD_ID
  LEFT JOIN SGC_FORNECEDOR F ON F.CODFORNEC = P.CODFORNEC
  LEFT JOIN (SELECT ID_CARD,
                    MIN(NULLIF(DT_EMISSAO, ''))     AS PRIMEIRA_NF,
                    MAX(NULLIF(DT_RECEBIMENTO, '')) AS RECEB_MAX,
                    SUM(CASE WHEN COALESCE(DT_RECEBIMENTO, '') = '' THEN 1 ELSE 0 END) AS NFS_SEM_RECEBIMENTO,
                    COUNT(*) AS QTD_NFS
             FROM SGC_NF GROUP BY ID_CARD) NF ON NF.ID_CARD = P.ID_CARD
  LEFT JOIN SGC_AGENDA AG ON AG.ID = P.ID_AGENDA AND COALESCE(P.ID_AGENDA, 0) > 0
  WHERE COALESCE(SF.CHAVE, '') <> 'cancelado'
    AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
    AND ({{codfornec}} = 0 OR P.CODFORNEC = {{codfornec}})
    AND SUBSTRING(P.CRIADO_EM, 1, 10) BETWEEN '{{dataInicio}}' AND '{{dataFim}}'   -- período OBRIGATÓRIO
    AND ('{{busca}}' = '' OR C.TITULO LIKE '%{{busca}}%'
         OR COALESCE(P.FORNECEDOR, '') LIKE '%{{busca}}%'
         OR COALESCE(P.NUMPED_WINTHOR, '') LIKE '%{{busca}}%')
    AND <recorte RESTRICTED>
),
DIAS AS (
  SELECT P.*,
    CASE WHEN P.DT_CRIACAO = '' THEN NULL ELSE <úteis(DT_CRIACAO, fimAnalise)>      END AS DIAS_ANALISE,
    CASE WHEN P.DT_ENVIO   = '' THEN NULL ELSE <úteis(DT_ENVIO, fimFaturamento)>    END AS DIAS_FATURAMENTO,
    CASE WHEN P.DT_PRIMEIRA_NF = '' THEN NULL
         WHEN P.META_ENTREGA_TIPO = 'corridos'
           THEN GREATEST(0, DATEDIFF(<fimEntrega>, P.DT_PRIMEIRA_NF))
         ELSE <úteis(DT_PRIMEIRA_NF, fimEntrega)> END AS DIAS_ENTREGA
  FROM PED P
),
CLASS AS ( ... os três CASE de estado, o de agenda e os dias de atraso ... ),
FINAL AS ( ... SLA_STATUS e SLA_SCORE ... )
```

Os três "fins" são a **mesma regra** (RN-001), escrita uma vez cada:

```sql
fimAnalise      = CASE WHEN P.DT_ENVIO       <> '' THEN P.DT_ENVIO
                       WHEN P.CONCLUIDO = 1 AND P.DT_CONCLUSAO <> '' THEN P.DT_CONCLUSAO
                       ELSE <HOJE> END
fimFaturamento  = CASE WHEN P.DT_PRIMEIRA_NF <> '' THEN P.DT_PRIMEIRA_NF
                       WHEN P.CONCLUIDO = 1 AND P.DT_CONCLUSAO <> '' THEN P.DT_CONCLUSAO
                       ELSE <HOJE> END
fimEntrega      = CASE WHEN P.DT_ENTREGA     <> '' THEN P.DT_ENTREGA
                       WHEN P.CONCLUIDO = 1 AND P.DT_CONCLUSAO <> '' THEN P.DT_CONCLUSAO
                       ELSE <HOJE> END
```

`<úteis(a, b)>` é **literalmente** `diasUteisEntre(a, b)` de `backend/lib/dias-uteis.mjs`
(R-025/R-038), importado no topo do `add-012` — nenhuma tabela de 49 posições, nenhuma
segunda implementação.

Os sete estados (RN-002), iguais para as três etapas, mudando só os marcos e a meta:

```sql
CASE
  WHEN <inicio> = ''                          THEN 'nao_iniciada'
  WHEN <meta> = 0                             THEN 'sem_meta'          -- só a Entrega chega aqui
  WHEN <fimReal> <> ''                        THEN CASE WHEN <dias> <= <meta> THEN 'ok' ELSE 'estourou' END
  WHEN P.CONCLUIDO = 1                        THEN CASE WHEN <dias> <= <meta> THEN 'ok' ELSE 'estourou' END
  WHEN <dias> >  <meta>                       THEN 'vencida'
  WHEN <dias> =  <meta>                       THEN 'atencao'
  ELSE 'andamento'
END
```

Análise e Faturamento nunca caem em `sem_meta` (a meta tem padrão 1 e 5, RN-004); a
Entrega nunca cai em `ok`/`estourou` sem meta, porque o ramo `sem_meta` vem antes.

SLA do pedido e nota (RN-005, RN-006):

```sql
CASE
  WHEN Y.STATUS_ANALISE = 'vencida'                                       THEN 'atrasado_compras'
  WHEN Y.STATUS_FATURAMENTO = 'vencida' OR Y.STATUS_ENTREGA = 'vencida'   THEN 'atrasado_fornecedor'
  WHEN Y.CONCLUIDO = 1                                                    THEN 'concluido'
  WHEN Y.STATUS_ANALISE = 'atencao' OR Y.STATUS_FATURAMENTO = 'atencao'
       OR Y.STATUS_ENTREGA = 'atencao'                                    THEN 'atencao'
  ELSE 'no_prazo'
END AS SLA_STATUS,

ROUND((
    CASE WHEN Y.DIAS_ANALISE IS NULL THEN 0
         ELSE LEAST(100, ROUND(100.0 * Y.META_ANALISE_DIAS / GREATEST(Y.DIAS_ANALISE, 1))) END
  + CASE WHEN Y.DIAS_FATURAMENTO IS NULL THEN 0
         ELSE LEAST(100, ROUND(100.0 * Y.META_FATURAMENTO_DIAS / GREATEST(Y.DIAS_FATURAMENTO, 1))) END
  + CASE WHEN Y.DIAS_ENTREGA IS NULL OR Y.META_ENTREGA_DIAS = 0 THEN 0
         ELSE LEAST(100, ROUND(100.0 * Y.META_ENTREGA_DIAS / GREATEST(Y.DIAS_ENTREGA, 1))) END
) / GREATEST(
    CASE WHEN Y.DIAS_ANALISE IS NULL THEN 0 ELSE 1 END
  + CASE WHEN Y.DIAS_FATURAMENTO IS NULL THEN 0 ELSE 1 END
  + CASE WHEN Y.DIAS_ENTREGA IS NULL OR Y.META_ENTREGA_DIAS = 0 THEN 0 ELSE 1 END, 1)) AS SLA_SCORE
```

**`100.0`, não `100`**: no SQLite `/` entre inteiros é divisão inteira e `100 * 2 / 3`
daria 66, enquanto o MySQL daria 66,67 → 67. O literal decimal força ponto flutuante nos
dois lados; sem ele a nota diverge entre o simulador e a plataforma (ver *Dialeto*).

Aderência à agenda (RN-008):

```sql
CASE
  WHEN P.DT_AGENDA = ''            THEN 'sem_agenda'
  WHEN P.DT_ENVIO_EFETIVO <> ''    THEN CASE WHEN P.DT_ENVIO_EFETIVO <= P.DT_AGENDA
                                             THEN 'no_planejado' ELSE 'enviada_com_atraso' END
  WHEN <HOJE> > P.DT_AGENDA        THEN 'pendente_atrasada'
  ELSE 'pendente'
END AS STATUS_AGENDA,
CASE WHEN P.DT_AGENDA = '' THEN NULL
     ELSE GREATEST(0, DATEDIFF(CASE WHEN P.DT_ENVIO_EFETIVO <> '' THEN P.DT_ENVIO_EFETIVO
                                    ELSE <HOJE> END, P.DT_AGENDA)) END AS DIAS_ATRASO_AGENDA
```

O **recorte RESTRICTED** (RN-015) é um bloco só, `RECORTE_RESTRITO`, copiado literal em
toda consulta desta spec que fala de pedido — as quatro da CTE, `sgcIndResumo`,
`sgcIndPedidosPorFase`, `sgcIndAgendaAtrasos`, `sgcIndProdutosBo`, `sgcIndLeadTime`,
`sgcSlaPedidoFases` e as três do relatório (o mesmo espírito do R-013):

```sql
AND (NOT EXISTS (SELECT 1 FROM INT_USER IU
                 WHERE IU.ID = :VAR_USER AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') = 'RESTRICTED')
     OR C.CRIADO_POR = :VAR_USER)
```

É **`KB_CARD.CRIADO_POR`**, não `SGC_PEDIDO.CRIADO_POR`: "os próprios cards" é o card em
todo o projeto — `sgcPodeMover`/`sgcPodeExcluir` (`add-005`) e `pedidoEmAnalise`
(`add-006`) conferem `C.CRIADO_POR`, e as duas colunas podem divergir (o cron da agenda
cria o card sem sessão). Toda consulta que cola este bloco tem `KB_CARD C` no escopo.

### Leituras — indicadores (SQL, banco interno)

| Nome | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|
| `sgcIndResumo` | `codfilial` (''), `dataInicio` (**obrigatório**), `dataFim` (**obrigatório**), `hoje` ('') | **uma** linha: `PEDIDOS_ABERTOS, VL_ABERTO, ENVIOS_ATRASADOS, FATURAMENTOS_PENDENTES, NFS_ATRASADAS, ITENS_BO, FORNECEDORES_COM_PEDIDO` | RF-001, C-001 |
| `sgcIndPedidosPorFase` | `codfilial` (''), `dataInicio` (**obrigatório**), `dataFim` (**obrigatório**) | uma linha por fase: `FASE_CHAVE, FASE_NOME, ORDEM, QTD, VL_TOTAL` (as 10, inclusive as vazias) | RF-001, C-001 |
| `sgcIndAgendaAtrasos` | `codfilial` (''), `dataInicio` (**obrigatório**), `dataFim` (**obrigatório**), `hoje` (''), `limite` (50) | `ID_AGENDA, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_PLANEJADA, DATA_ENVIO, DIAS_ATRASO, STATUS_PRAZO, ID_CARD` | RF-013, C-001 |
| `sgcIndProdutosBo` | `codfilial` (''), `limite` (50) | por fornecedor: `CODFORNEC, FORNECEDOR, ITENS_ABERTOS, QT_PENDENTE, VL_PENDENTE, CARDS` | RF-025, C-001 |
| `sgcIndPerfilFornecedor` | os da CTE (período **obrigatório**) + `limite` (50) | `CODFORNEC, FORNECEDOR, QTD_PEDIDOS, MEDIA_ANALISE, MEDIA_FATURAMENTO, MEDIA_ENTREGA, PERC_NO_PRAZO, SCORE_MEDIO` | RF-025, C-026 |
| `sgcIndLeadTime` | `codfilial` (''), `dataInicio` (**obrigatório**), `dataFim` (**obrigatório**), `hoje` ('') | por fase: `FASE_CHAVE, FASE_NOME, ORDEM, PASSAGENS, DIAS_MEDIA` | RF-025, C-027 |

**`sgcIndProdutosBo` e o `VL_PENDENTE`:** `SGC_BO_ITEM` não guarda valor (R-026) — o
pendente em reais é a quantidade parada vezes o custo do item do pedido:

```sql
SELECT P.CODFORNEC, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
  COUNT(*) AS ITENS_ABERTOS,
  COALESCE(SUM(B.QT_PENDENTE), 0) AS QT_PENDENTE,
  COALESCE(SUM(B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0)), 0) AS VL_PENDENTE,
  COUNT(DISTINCT B.ID_CARD) AS CARDS
FROM SGC_BO_ITEM B
JOIN KB_CARD C      ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
JOIN SGC_PEDIDO P   ON P.ID_CARD = B.ID_CARD
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD
WHERE B.STATUS = 'aberto'
  AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
  AND <RECORTE_RESTRITO>
GROUP BY P.CODFORNEC, P.FORNECEDOR
ORDER BY VL_PENDENTE DESC, ITENS_ABERTOS DESC, P.CODFORNEC
LIMIT {{limite}}
```

Item sem par em `SGC_PEDIDO_ITEM` (produto que saiu do pedido depois de entrar em B.O.)
entra com custo 0 e continua contado em `ITENS_ABERTOS`: some do valor, nunca da fila.

**`sgcIndResumo`** é uma linha de subconsultas escalares, porque cinco dos seis números
não são sobre pedido (nota atrasada, item em falta, fornecedor). Os dois que **são**
usam as mesmas condições da CTE, escritas uma vez no arquivo como fragmentos
(`CONDICAO_ABERTO`, `CONDICAO_AGENDA_ATRASADA`) e reusadas por `sgcIndAgendaAtrasos` —
é isso que faz o número do topo bater com a lista do bloco (C-001).

- `PEDIDOS_ABERTOS` / `VL_ABERTO`: pedidos com fase fora de `concluido` e `cancelado`;
- `ENVIOS_ATRASADOS`: agendamentos ativos com `DATA_ANALISE` no período, já passados, sem
  envio real e sem `DT_ENVIO` no pedido gerado (`CONDICAO_AGENDA_ATRASADA`);
- `FATURAMENTOS_PENDENTES`: pedidos com `DT_ENVIO <> ''` e `PERC_FATURADO_VALOR < 100` nas
  fases `enviado`, `transito`, `faturamento`, `bo` (a mesma população da `/faturamentos-pendentes` da 005);
- `NFS_ATRASADAS`: notas sem `DT_RECEBIMENTO` cuja previsão (emissão + prazo do fornecedor)
  já passou — o **mesmo** critério da 006, ver *Dependências*;
- `ITENS_BO`: linhas de `SGC_BO_ITEM` com `STATUS = 'aberto'`;
- `FORNECEDORES_COM_PEDIDO`: `COUNT(DISTINCT CODFORNEC)` dos pedidos abertos.

**`sgcIndLeadTime`** e **`sgcSlaPedidoFases`** acham a passagem seguinte por subconsulta
correlacionada, não por função de janela:

```sql
LEFT JOIN KB_MOVIMENTO PROX
       ON PROX.ID = (SELECT MIN(M2.ID) FROM KB_MOVIMENTO M2
                      WHERE M2.CARD_ID = M.CARD_ID AND M2.ID > M.ID)
```

`KB_MOVIMENTO.ID` é autoincremento e as passagens nascem em ordem cronológica, então o
`ID` **é** a linha do tempo; `IX_KB_MOVIMENTO_CARD` cobre a busca. `LEAD()` funcionaria
nos dois bancos, mas o dialeto do simulador não tem nenhum atalho de janela e a
subconsulta custa o mesmo (D-006).

### Leituras — prazo dos pedidos (SQL, a cadeia de CTEs)

| Nome | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|
| `sgcSlaPedidosKpis` | `codfilial` (''), `codfornec` (0), `dataInicio` (**obrigatório**), `dataFim` (**obrigatório**), `busca` (''), `hoje` ('') | **uma** linha: `TOTAL, NO_PRAZO, ATENCAO, ATRASADOS_COMPRAS, ATRASADOS_FORNECEDOR, CONCLUIDOS, FORA_DA_AGENDA, SCORE_MEDIO` | RF-012, C-013 |
| `sgcSlaPedidosListar` | os mesmos + `fase` (''), `soVencidos` (''), `limite` (20), `offset` (0) | `CARD_ID, TITULO, FASE_CHAVE, FASE_NOME, CONCLUIDO, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, NUMPED_WINTHOR, VL_TOTAL, PERC_FATURADO, QTD_NFS, DT_CRIACAO, DT_ENVIO, DT_PRIMEIRA_NF, DT_ENTREGA, DT_CONCLUSAO, DT_AGENDA, DIAS_ANALISE, META_ANALISE_DIAS, STATUS_ANALISE, DIAS_FATURAMENTO, META_FATURAMENTO_DIAS, STATUS_FATURAMENTO, DIAS_ENTREGA, META_ENTREGA_DIAS, META_ENTREGA_TIPO, STATUS_ENTREGA, STATUS_AGENDA, DIAS_ATRASO_AGENDA, SLA_STATUS, SLA_SCORE` | RF-007..RF-010, C-007..C-011 |
| `sgcSlaPedidosListarTotal` | os mesmos filtros da listagem | `TOTAL` | RF-012, RNF-002 |
| `sgcSlaPedidoFases` | `idCard` (0) | uma linha por passagem: `ID, FASE_ID, FASE_CHAVE, FASE_NOME, DT_ENTRADA, DT_SAIDA, DIAS_NA_FASE` | RF-014, C-015 |

A listagem devolve **os marcos e as metas junto dos estados** de propósito: é com eles
que `lib/sla.ts` desenha as três etapas do pedido expandido, e é sobre eles que o teste
RN-016 confere as duas réguas. Ordenação: `FIELD(SLA_STATUS, 'atrasado_compras',
'atrasado_fornecedor', 'atencao', 'no_prazo', 'concluido')`, depois `DT_CRIACAO DESC,
CARD_ID DESC` — o que dói primeiro.

Filtros do lado de fora da CTE (nunca dentro: os KPIs precisam do conjunto inteiro):
`('{{fase}}' = '' OR F.FASE_CHAVE = '{{fase}}')` e
`('{{soVencidos}}' = '' OR F.SLA_STATUS IN ('atrasado_compras', 'atrasado_fornecedor'))`.

### Leituras — solicitações (SQL)

Uma derivada só, `solicitacoesCte()`, com **uma linha por solicitação**, o `STATUS` próprio
e a coluna `SITUACAO` derivada; as duas SFs agregam sobre ela. A régua da situação **não é
escrita aqui**: vem do arquivo `backend/sql/situacao-solicitacao.sql`, entrega da 008
(R-070/R-075), carregado pelo loader generalizado da base:

```js
import { fragmento } from './lib/fragmentos.mjs';   // R-074, base (S2)
const SITUACAO = fragmento('situacao-solicitacao.sql');
```

O **contrato de composição** do arquivo (R-075) fixa os aliases, e é por isso que a
derivada desta spec tem os quatro — inclusive o `C`, que a 009 não usaria por conta
própria (ela agrega, não mostra o card):

```sql
SELECT S.ID, S.STATUS, S.CRIADO_POR, S.CRIADO_EM, S.AVALIADO_EM, ${SITUACAO} AS SITUACAO
FROM SGC_SOLICITACAO S
LEFT JOIN KB_CARD C  ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_FASE SF ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD
                           AND COALESCE(I.STATUS, '') <> 'removido'
WHERE ('{{codfilial}}' = '' OR S.CODFILIAL = '{{codfilial}}')
  AND SUBSTRING(S.CRIADO_EM, 1, 10) BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
```

Os três `LEFT JOIN` são **obrigatórios** e vêm nesta ordem: o `CASE` do fragmento lê
`C.ID` (card excluído ou ausente → `sem_pedido`), `SF.CHAVE` e `I.STATUS`. Nenhum filtro
de persona: solicitação não é card, e o comercial não abre esta tela (R-061).

| Nome | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|
| `sgcSolicitacoesFunil` | `codfilial` (''), `dataInicio` (**obrigatório**), `dataFim` (**obrigatório**) | uma linha por par: `STATUS, SITUACAO, QTD, QTD_AVALIADAS, TEMPO_MEDIO_AVALIACAO_DIAS`, com `GROUP BY S.STATUS, SITUACAO` | RF-015, C-016 |
| `sgcSolicitacoesPorVendedor` | os mesmos + `limite` (50) | `USUARIO_ID, VENDEDOR, TOTAL, PENDENTES, RECUSADAS, ATENDIDAS, NAO_ATENDIDAS, EM_FLUXO, ADERENCIA_PCT, TEMPO_MEDIO_AVALIACAO_DIAS` | RF-016, C-017 |

**Duas dimensões, não uma** (R-076). A régua devolve `sem_pedido` para tudo que ainda não
tem card — pendente, recusada, cancelada **e** aprovada esperando na fila —, então a
`SITUACAO` sozinha não distingue "esperando avaliação" de "recusada", e a aderência de
fluxo (que tira pendentes e recusadas do denominador) ficaria impossível. O funil agrega
pelo **par** `STATUS × SITUACAO`: o eixo do gráfico é a `SITUACAO`, e `pendentes` e
`recusadas` saem do `STATUS`. `sgcSolicitacoesPorVendedor` faz a mesma leitura dentro dos
`SUM(CASE …)`: `PENDENTES`/`RECUSADAS` por `S.STATUS`, `ATENDIDAS`/`NAO_ATENDIDAS`/
`EM_FLUXO` por `SITUACAO`.

`VENDEDOR` = `COALESCE(NULLIF(TRIM(IU.NOME), ''), 'Sem vendedor')` sobre
`SGC_SOLICITACAO.CRIADO_POR` (R-052: o vendedor **é** quem registra; não existe coluna de
nome de vendedor). `ADERENCIA_PCT = ROUND(100.0 * SUM(CASE WHEN SITUACAO = 'atendida'
THEN 1 ELSE 0 END) / COUNT(*), 1)`. Nenhuma coluna de valor em reais (R-057).

O resumo consolidado (total, aderência geral e de fluxo, tempo médio) **não** é uma SF: é
derivado do funil já agregado, em `lib/analises.ts` (`resumoSolicitacoes`) — uma execução
a menos por carga, e a conta fica testável (C-016).

### Leitura — WinThor (Oracle, `jdbcId` resolvido por nome)

| Nome | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|
| `sgcWintComprasVsVendas` | `codfilial` (**obrigatória**), `dataInicio`, `dataFim`, `limite` (50) | `CODFORNEC, FORNECEDOR, QT_COMPRADA, QT_VENDIDA, VL_COMPRADO, VL_VENDIDO, QT_VENDIDA_LICITACAO, VL_VENDIDO_LICITACAO` | RF-006, C-006 |

```sql
SELECT * FROM (
  SELECT P.CODFORNEC, NVL(F.FORNECEDOR, '') AS FORNECEDOR,
    SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) ELSE 0 END) AS QT_COMPRADA,
    SUM(CASE WHEN M.CODOPER = 'S' THEN NVL(M.QT, 0) ELSE 0 END) AS QT_VENDIDA,
    SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) * NVL(M.PUNIT, 0) ELSE 0 END) AS VL_COMPRADO,
    SUM(CASE WHEN M.CODOPER = 'S' THEN NVL(M.QT, 0) * NVL(M.PUNIT, 0) ELSE 0 END) AS VL_VENDIDO,
    SUM(CASE WHEN M.CODOPER = 'S' AND NVL(C.CODATV1, 0) IN (11,12,13,14,15,20)
             THEN NVL(M.QT, 0) ELSE 0 END) AS QT_VENDIDA_LICITACAO,
    SUM(CASE WHEN M.CODOPER = 'S' AND NVL(C.CODATV1, 0) IN (11,12,13,14,15,20)
             THEN NVL(M.QT, 0) * NVL(M.PUNIT, 0) ELSE 0 END) AS VL_VENDIDO_LICITACAO
  FROM PCMOV M
  JOIN PCPRODUT P ON P.CODPROD = M.CODPROD
  LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.CODFILIAL = '{{codfilial}}'
    AND M.CODOPER IN ('E', 'S')
    AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  GROUP BY P.CODFORNEC, F.FORNECEDOR
  ORDER BY VL_VENDIDO DESC, QT_VENDIDA DESC, P.CODFORNEC
) WHERE ROWNUM <= {{limite}}
```

`CODFILIAL` entra sem `OR ''`: sem filial a consulta devolve zero linhas de propósito
(RN-012), e é a tela que garante uma (R-057). A lista de atividades de licitação é a
**mesma** de `sgcWintAnaliseMontagem` (003, AN-04): a venda de licitação aparece em
coluna própria em vez de sumir da conta — esconder metade da venda num indicador de
comparação seria o defeito que a AN-03 corrigiu na 003 (D-004).

### Leituras — relatórios salvos (SQL)

| Nome | Entrada (valor desligado) | Saída | Atende |
|---|---|---|---|
| `sgcRelatoriosListar` | `busca` (''), `limite` (50) | `ID, TITULO, DESCRICAO, CONFIG_JSON, COMPARTILHADO, CRIADO_POR, CRIADO_POR_NOME, CRIADO_EM, ATUALIZADO_EM, PODE_EDITAR` | RF-017, C-018, C-020 |
| `sgcRelatorioPedidos` | `fase` (''), `codfornec` (0), `codfilial` (''), `responsavelId` (0), `prioridade` (''), `dataInicio` (''), `dataFim` (''), `limite` (20), `offset` (0) | `ID_CARD, TITULO, FASE_CHAVE, FASE_NOME, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, RESPONSAVEL, PRIORIDADE, VL_TOTAL, NUMPED_WINTHOR, DT_ENVIO, PERC_FATURADO, CRIADO_EM, CRIADO_POR_NOME, DIAS_NA_FASE` | RF-019, C-021 |
| `sgcRelatorioPedidosTotal` | os mesmos filtros | `TOTAL` | RF-019, RNF-002 |
| `sgcRelatorioAgregar` | os mesmos filtros + `campoAgrupar` (`'fase'`) | `CHAVE, QTD, VL_TOTAL, DIAS_NA_FASE_MEDIA` | RF-020, C-022 |

`PODE_EDITAR` sai do servidor (`CASE WHEN R.CRIADO_POR = :VAR_USER OR <guarda admin>
THEN 1 ELSE 0 END`): a tela desabilita o botão com esse valor em vez de reimplementar a
regra de dono (RN-013). A galeria só devolve `COMPARTILHADO = 1 OR CRIADO_POR = :VAR_USER`.

A consulta é **fixa** (R-059): a tela manda valores, nunca pedaço de consulta. O
agrupamento é um `CASE` sobre um domínio fechado, não concatenação:

```sql
SELECT
  CASE '{{campoAgrupar}}'
    WHEN 'fornecedor'  THEN COALESCE(NULLIF(P.FORNECEDOR, ''), 'Sem fornecedor')
    WHEN 'filial'      THEN COALESCE(NULLIF(P.FILIAL, ''), 'Sem filial')
    WHEN 'responsavel' THEN COALESCE((SELECT COALESCE(IU2.NOME, '') FROM KB_CARD_RESPONSAVEL R2
                                       JOIN INT_USER IU2 ON IU2.ID = R2.USUARIO_ID
                                      WHERE R2.CARD_ID = C.ID ORDER BY R2.ORDEM, R2.ID LIMIT 1), 'Sem responsável')
    WHEN 'prioridade'  THEN COALESCE(NULLIF(<prioridade>, ''), 'normal')
    ELSE COALESCE(NULLIF(KF.NOME, ''), 'Sem fase')
  END AS CHAVE,
  COUNT(*) AS QTD,
  COALESCE(SUM(P.VL_TOTAL), 0) AS VL_TOTAL,
  ROUND(AVG(GREATEST(0, DATEDIFF(<HOJE>, SUBSTRING(COALESCE(C.FASE_DESDE, C.CRIADO_EM), 1, 10)))), 1) AS DIAS_NA_FASE_MEDIA
FROM ... GROUP BY CHAVE ORDER BY QTD DESC, CHAVE LIMIT {{limite}}
```

`DIAS_NA_FASE` sai de `KB_CARD.FASE_DESDE` (dias corridos até hoje), que a lib já mantém —
sem uma segunda leitura de `KB_MOVIMENTO`. `<prioridade>` é o campo do quadro, que vive em
`KB_CARD.VALORES_JSON` (R-009: o SGC não tem coluna de prioridade):
`JSON_UNQUOTE(JSON_EXTRACT(C.VALORES_JSON, '$.prioridade'))` — a forma MySQL, com uma
reescrita nova no dialeto do simulador (ver *Dialeto*).

### Escritas SQL (uma instrução por SF, `:VAR_USER`)

| Nome | Guarda | Entrada | Instrução | Atende |
|---|---|---|---|---|
| `sgcEscRelatorioInserir` | `:VAR_USER` + persona | `titulo`, `descricao`, `configJson`, `compartilhado`, `agora` | `INSERT … SELECT … FROM DUAL WHERE TRIM('{{titulo}}') <> '' AND <guarda>` | RF-017 |
| `sgcEscRelatorioAtualizar` | `:VAR_USER` + persona + dono | `id`, `titulo`, `descricao`, `configJson`, `compartilhado`, `agora` | `UPDATE SGC_RELATORIO SET … WHERE ID = {{id}} AND TRIM('{{titulo}}') <> '' AND <dono> AND <guarda>` | RF-017, RF-018 |
| `sgcEscRelatorioExcluir` | `:VAR_USER` + persona + dono | `id` | `DELETE FROM SGC_RELATORIO WHERE ID = {{id}} AND <dono> AND <guarda>` | RF-018 |

A guarda de persona é **a mesma** da 002, copiada literal (R-013), trocando só a lista —
`admin`, `analista`, `gestor` (as personas de `salvarRelatorio`, R-061):

```sql
AND EXISTS (
  SELECT 1 FROM INT_USER IU
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
  WHERE IU.ID = :VAR_USER
    AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
    AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                               WHEN 'ADMIN' THEN 'admin'
                               WHEN 'RESTRICTED' THEN 'comercial'
                               ELSE 'analista' END) IN ('admin', 'analista', 'gestor')
)
```

`<dono>` é `(CRIADO_POR = :VAR_USER OR <a mesma guarda, com a lista só ('admin')>)`.
Nenhuma das três recebe `{{usuarioId}}`: as três nascem de um clique e têm sessão (D-001).
Como escrita guardada recusada devolve **0 linhas e nenhum erro** (D-03 da onda 1), a tela
**relê a galeria** depois de cada uma e compara com o que esperava, em vez de confiar no
silêncio.

### Bloco 79xx de `frontend/src/lib/server-functions.ts`

| Id local | Nome | Id local | Nome |
|---|---|---|---|
| 7901 | `sgcIndResumo` | 7911 | `sgcSlaPedidoFases` |
| 7902 | `sgcIndPedidosPorFase` | 7912 | `sgcSolicitacoesFunil` |
| 7903 | `sgcIndAgendaAtrasos` | 7913 | `sgcSolicitacoesPorVendedor` |
| 7904 | `sgcIndProdutosBo` | 7914 | `sgcRelatoriosListar` |
| 7905 | `sgcIndPerfilFornecedor` | 7915 | `sgcRelatorioPedidos` |
| 7906 | `sgcIndLeadTime` | 7916 | `sgcRelatorioPedidosTotal` |
| 7907 | `sgcWintComprasVsVendas` | 7917 | `sgcRelatorioAgregar` |
| 7908 | `sgcSlaPedidosKpis` | 7950 | `sgcEscRelatorioInserir` |
| 7909 | `sgcSlaPedidosListar` | 7951 | `sgcEscRelatorioAtualizar` |
| 7910 | `sgcSlaPedidosListarTotal` | 7952 | `sgcEscRelatorioExcluir` |

`sgcIndPedidosPorFase` é a única SF **a mais** do que a linha 009 da tabela do 000. O 000
pede "pedidos por fase" dentro de `sgcIndResumo`, mas `sgcIndResumo` devolve uma linha de
escalares (os KPIs do topo) e "pedidos por fase" é uma linha por fase: juntar as duas
formas numa SF só devolveria uma tabela com seis colunas repetidas em dez linhas. A faixa
79xx e o padrão de nome são os mesmos (D-002).

## Quem chama o quê

| Quem | Chama | Como |
|---|---|---|
| `/analises` (cabeçalho) | `sgcWintFiliais` (001) | uma vez por abertura da tela, para o filtro de filial |
| aba **Indicadores** | `sgcIndResumo`, `sgcIndPedidosPorFase`, `sgcIndAgendaAtrasos`, `sgcIndProdutosBo`, `sgcIndLeadTime` | 5 chamadas em `Promise.allSettled`, `:VAR_USER` |
| aba **Compras × vendas** | `sgcWintComprasVsVendas` | 1 chamada, filial obrigatória |
| aba **Pedidos (SLA)** | `sgcSlaPedidosKpis`, `sgcSlaPedidosListar`, `sgcSlaPedidosListarTotal`, `sgcIndPerfilFornecedor` | 4 em paralelo; `sgcSlaPedidoFases` só ao expandir um pedido |
| aba **Solicitações** | `sgcSolicitacoesFunil`, `sgcSolicitacoesPorVendedor` | 2 em paralelo |
| `/relatorios` | `sgcRelatoriosListar`; ao executar um relatório: `sgcRelatorioPedidos` + `sgcRelatorioPedidosTotal` + `sgcRelatorioAgregar` | 1 + 3 em paralelo |
| `/relatorios` (salvar/editar/excluir) | `sgcEscRelatorio*` seguida de `sgcRelatoriosListar` | escrita de tela, `:VAR_USER`, releitura obrigatória (D-03) |

Nenhuma SF desta spec é chamada por id, e nenhuma é chamada por outra spec.

## Superfície de interação

| Tela / rota | Responsabilidade | Componentes reusados | Novos |
|---|---|---|---|
| `/analises` | casca das quatro abas, filtro de filial no cabeçalho, porteiro de rota | `PageHeader`, `Toolbar`, `SelectMenu`, `Alert`, `EmptyState` | `AnalisesPage` |
| `/analises?aba=indicadores` | 4 `Kpi` no topo + pedidos por fase, agenda atrasada, produtos em B.O. e tempo por fase | `GradeKpi`, `Kpi`, `GradeGraficos`, `PainelGrafico`, `AlternaVisao`, `Table`, `Status`, `Dash`, `DatePicker` | `IndicadoresTab` |
| `/analises?aba=compras-vendas` | comparação por fornecedor no mês/trimestre, gráfico e tabela | `PainelGrafico`, `Table`, `SelectMenu` | `ComprasVendasTab` |
| `/analises?aba=pedidos` | KPIs de prazo, lista com as três etapas, pedido expandido com linha do tempo, perfil por fornecedor | `GradeKpi`, `Kpi`, `Panel`, `Table`, `Status`, `Badge`, `Pagination`, `FilterChip`, `SearchInput` | `PedidosSlaTab` |
| `/analises?aba=solicitacoes` | funil, duas aderências, tempo médio e ranking por vendedor | `GradeKpi`, `PainelGrafico`, `Table`, `Status` | `SolicitacoesTab` |
| `/relatorios` | galeria de relatórios salvos + construtor (filtros, colunas, agrupamento, gráfico, tabela paginada, CSV, compartilhar) | `PageHeader`, `Panel`, `Toolbar`, `SelectMenu`, `CheckRow`, `Table`, `Pagination`, `Dialog`, `Field`, `LabelledField`, `Button`, `IconButton`, `DatePicker`, `PainelGrafico` | `RelatoriosPage`, `relatorio-dialogos.tsx` |

Arquivos:

| Arquivo | Conteúdo |
|---|---|
| `frontend/src/pages/analises/AnalisesPage.tsx` | casca, abas por `?aba=`, filtro de filial, porteiro `verAnalises` |
| `frontend/src/pages/analises/IndicadoresTab.tsx` | os cinco blocos da aba |
| `frontend/src/pages/analises/ComprasVendasTab.tsx` | comparação compras × vendas |
| `frontend/src/pages/analises/PedidosSlaTab.tsx` | KPIs, lista de prazos e pedido expandido |
| `frontend/src/pages/analises/SolicitacoesTab.tsx` | funil e ranking |
| `frontend/src/pages/relatorios/RelatoriosPage.tsx` | galeria + construtor + tabela/gráfico |
| `frontend/src/pages/relatorios/relatorio-dialogos.tsx` | salvar, editar, excluir (o `max-lines` 800 não cabe tudo num arquivo) |
| `frontend/src/lib/sla.ts` | a régua de prazo da tela + rótulos/tons + CSV do SLA |
| `frontend/src/lib/analises.ts` | períodos derivados de hoje, blocos em paralelo, séries dos gráficos, resumo do funil |
| `frontend/src/lib/relatorio.ts` | `CONFIG_JSON` (ler/escrever/padrão), colunas, linhas do CSV, série do agregado |
| `frontend/src/lib/server-functions.ts` | bloco 79xx (nomes e ids locais) |

Desenho (`design.md` §8.7, §9.1, §9.4, §9.7, §12):

- **Três alturas** (§9.7): `GradeKpi` com **no máximo quatro** `Kpi`, depois dois a quatro
  gráficos em `GradeGraficos`, depois a tabela. Os sete valores de `sgcIndResumo` não
  viram seis KPIs: quatro sobem para a grade (pedidos abertos, com `VL_ABERTO` no `hint`;
  envios atrasados; faturamentos pendentes; notas atrasadas) e dois viram `hint` do painel a
  que pertencem (itens em B.O. no painel de produtos em falta, fornecedores no de perfil).
- **Um filtro só, no topo** (§9.7): a filial no cabeçalho vale para a tela inteira; o
  período fica na aba, porque intervalo livre e mês fechado são grandezas diferentes
  (RN-011). Nenhum gráfico tem seletor próprio.
- **Todo `PainelGrafico` traz o par Gráfico/Tabela em `acoes`** (`AlternaVisao`) — RF-022,
  §12.4: é a versão acessível, não um extra. A tabela sai da **mesma** função de série
  (C-024), nunca de uma segunda consulta.
- **Cor**: `corDeSerie(indice do contrato)` (§8.7), nunca a rampa da marca nem a paleta de
  estado. Estado (`no prazo`, `vence hoje`, `prazo vencido`) é `Status` com **rótulo
  escrito**: `ok`/`no_prazo`/`concluido` → `tone="live"`, `atencao` → `tone="attention"`,
  `vencida`/`estourou`/`atrasado_*` → `tone="alert"`, `nao_iniciada`/`sem_meta` →
  `tone="off"`. Barra de consumo da meta é largura + rótulo "4 / 5 dias úteis", nunca cor sozinha.
- **Sem pizza, sem dois eixos Y, eixo de valor a partir de zero** (§12.3). Dado
  insuficiente (menos de dois pontos) não vira gráfico: uma frase diz o que falta (§9.7).
- **Sem dado é `Dash()`**, inclusive no gráfico e na tabela alternativa — barra de altura
  zero afirmaria "zero" (§12.4).
- **Campo de data** é o `DatePicker` da 004 (UI-03 B), nunca `<input type="date">`. **Sem
  toast** (UI-02 A): confirmação na faixa do painel, erro em `Alert`.
- **Permissão** (§9.4): diretoria e `READ_ONLY` veem tudo com salvar/editar/excluir
  **desabilitados e com o motivo no `title`**, nunca escondidos (D-11 da onda 1). O
  comercial não chega às rotas — item fora do menu **e** porteiro na tela (A-8 da onda 2):
  `if (!sessao.permissoes.verAnalises) return <Alert tone="error">…`.
- **Exportar CSV** usa `textoCsv()`/`baixarCsv()` de `lib/csv.ts` (R-037) sobre as
  **mesmas linhas já carregadas** — sem SF nova, sem segunda consulta, sem escape próprio.

### Chaves de `lib/permissoes.ts` (R-061, arquivo da base)

| Chave | admin | analista | gestor | diretoria | comercial | `READ_ONLY` |
|---|---|---|---|---|---|---|
| `verAnalises` | ✓ | ✓ | ✓ | ✓ | — | mantém (não passa por `operar()`, como `verCoberturas`) |
| `verRelatorios` | ✓ | ✓ | ✓ | ✓ | — | mantém |
| `salvarRelatorio` | ✓ | ✓ | ✓ | — | — | zera |

Itens de menu novos, no `MENU` de `lib/permissoes.ts` (é lá que o menu mora; o
`AdminLayout` só dá o ícone — G-7 da onda 2), no grupo novo **Gestão** (R-063):
`{ grupo: 'Gestão', to: '/analises', label: 'Análises', exige: 'verAnalises' }` e
`{ grupo: 'Gestão', to: '/relatorios', label: 'Relatórios', exige: 'verRelatorios' }`.

## Fluxo

1. A pessoa abre `/analises`. O porteiro confere `verAnalises`; a casca carrega as filiais
   (`sgcWintFiliais`) e abre a aba de `?aba=` (padrão: indicadores).
2. A aba dispara os seus blocos em **um** `Promise.allSettled`. Cada bloco vira
   `{ estado: 'ok' | 'vazio' | 'erro', linhas }` por `resultadosDosBlocos` (`lib/analises.ts`);
   a tela desenha os `ok`, mostra "sem dados no período" nos `vazio` e um `Alert` com
   "tentar de novo" nos `erro` (C-002).
3. Trocar a filial no cabeçalho ou o período da aba refaz **só** a aba visível (RNF-001).
4. Na aba Pedidos, expandir uma linha chama `sgcSlaPedidoFases` daquele card (1 execução) e
   desenha as três etapas a partir dos marcos que a listagem já trouxe, por
   `classificarEtapa` de `lib/sla.ts` — a régua da tela, conferida contra a do servidor
   pelo teste RN-016.
5. Em `/relatorios`, a galeria vem de `sgcRelatoriosListar`. Abrir um relatório lê o
   `CONFIG_JSON` por `lerConfig` e executa os três blocos da consulta em paralelo.
6. Salvar chama `sgcEscRelatorioInserir`/`Atualizar` e **relê a galeria**; a linha nova
   (ou o título alterado) é a confirmação. Excluir idem. Sem a releitura, uma escrita
   recusada passaria por sucesso (D-03).
7. Exportar monta cabeçalho e linhas com `linhasCsvRelatorio` sobre o que já está na tela e
   entrega a `textoCsv`/`baixarCsv`.

## Regras puras

### `frontend/src/lib/sla.ts`

```ts
export type StatusEtapa = 'ok' | 'estourou' | 'andamento' | 'atencao' | 'vencida' | 'nao_iniciada' | 'sem_meta';
export type StatusSla   = 'atrasado_compras' | 'atrasado_fornecedor' | 'atencao' | 'no_prazo' | 'concluido';
export type StatusAgenda = 'no_planejado' | 'enviada_com_atraso' | 'pendente_atrasada' | 'pendente' | 'sem_agenda';

export interface MarcosEtapa {
  inicio: string; fimReal: string; meta: number;
  tipo: 'uteis' | 'corridos'; concluido: boolean; dtConclusao: string; hoje: string;
}
/** RN-001/RN-002 — o espelho declarado do CASE do servidor. */
export function diasDaEtapa(m: MarcosEtapa): number | null;
export function classificarEtapa(m: MarcosEtapa): StatusEtapa;
/** RN-005 — a precedência, na ordem. */
export function slaDoPedido(a: StatusEtapa, f: StatusEtapa, e: StatusEtapa, concluido: boolean): StatusSla;
/** RN-006 — média das etapas iniciadas COM meta; sem nenhuma, 0. */
export function notaDoPedido(etapas: { dias: number | null; meta: number }[]): number;

export function rotuloEtapa(s: string): string;   export function tomEtapa(s: string): 'live' | 'attention' | 'alert' | 'off';
export function rotuloSla(s: string): string;     export function tomSla(s: string): 'live' | 'attention' | 'alert' | 'off';
export function rotuloAgenda(s: string): string;  export function tomAgenda(s: string): 'live' | 'attention' | 'alert' | 'off';
export function percentualDaMeta(dias: number | null, meta: number): number;   // 0–100, satura
export function rotuloConsumo(dias: number | null, meta: number, tipo: 'uteis' | 'corridos'): string; // "4 / 5 dias úteis"
export function faixaDoScore(score: number | null): 'live' | 'attention' | 'alert' | 'off'; // ≥90 / ≥60 / resto
export const COLUNAS_CSV_SLA: string[];
export function linhasCsvSla(linhas: LinhaSla[]): (string | number)[][];
```

`classificarEtapa`/`notaDoPedido` **têm consumidor na tela** (a dívida D-16 da onda 2 é
exatamente o contrário disto): é com elas que o pedido expandido desenha as três etapas a
partir dos marcos que `sgcSlaPedidosListar` já devolveu — sem pedir nada a mais ao
servidor. As colunas classificadas que o servidor manda continuam sendo a fonte dos KPIs,
do filtro `soVencidos` e da ordenação; o teste RN-016 exige que as duas concordem **em
todas as linhas**, que é o mesmo remédio do teste de 500 combinações da 002.
`diasDaEtapa` usa `diasUteisEntre`/`somarDiasUteis` de `lib/dias-uteis.ts` (R-025) — não
reimplementa dia útil.

### `frontend/src/lib/analises.ts`

```ts
export interface OpcaoPeriodo { value: string; label: string }
export function listarPeriodos(hoje?: Date): OpcaoPeriodo[];  // 12 meses + trimestres do ano (RN-011)
export function periodoCorrente(hoje?: Date): string;          // 'AAAA-MM'
export function periodoRange(periodo: string): { dataInicio: string; dataFim: string };
export function intervaloPadrao(hoje?: Date): { dataInicio: string; dataFim: string }; // últimos 90 dias
export function filialDoRecorte(filiais: Filial[], escolhida: string):
  { codfilial: string; aviso: string };                        // RN-012 — assume a primeira e diz qual

export type EstadoBloco = 'ok' | 'vazio' | 'erro';
export function resultadosDosBlocos<T>(nomes: string[], resultados: PromiseSettledResult<T[]>[]):
  Record<string, { estado: EstadoBloco; linhas: T[]; erro: string }>;   // RF-002

export function serieSimples(linhas, chave, valor): { name: string; value: number }[];
export function serieComparativa(linhas, chave, a, b): { name: string; a: number; b: number }[];
/** Uma linha por par STATUS × SITUACAO (R-076). */
export interface FunilRow { STATUS: string; SITUACAO: string; QTD: number;
  QTD_AVALIADAS: number; TEMPO_MEDIO_AVALIACAO_DIAS: number | null }
export function resumoSolicitacoes(funil: FunilRow[]): {
  total; pendentes; recusadas; atendidas; naoAtendidas; emFluxo;
  aderenciaGeralPct: number | null; aderenciaFluxoPct: number | null; tempoMedioAvaliacaoDias: number | null };
export function serieDoFunil(funil: FunilRow[]): { name: string; value: number }[]; // agrupa por SITUACAO
```

`resumoSolicitacoes` é RN-009 e lê **as duas dimensões** (R-076): `pendentes` e `recusadas`
saem de `STATUS`, `atendidas`, `naoAtendidas` e `emFluxo` saem de `SITUACAO`, e `total` é a
soma de `QTD` de todas as linhas. Sem solicitação no período, as duas aderências são
`null`, não 0 — "vazio" e "zero por cento" são leituras diferentes. `serieDoFunil` soma o
par de volta numa dimensão só para o gráfico, que é por situação. `serieSimples`/
`serieComparativa` alimentam **o gráfico e a tabela alternativa** do mesmo bloco (C-024).

### `frontend/src/lib/relatorio.ts`

```ts
export const COLUNAS: { chave: string; label: string; numerica?: boolean }[];  // lista fechada
export const CAMPOS_AGRUPAVEIS: { chave: string; label: string }[];            // fase, fornecedor, filial, responsavel, prioridade
export const MEDIDAS: { chave: 'contagem' | 'valor' | 'dias_na_fase'; label: string }[];
export function configPadrao(): ConfigRelatorio;
export function lerConfig(texto: string): ConfigRelatorio;   // tolerante (C-018)
export function escreverConfig(c: ConfigRelatorio): string;
export function filtrosDaConfig(c: ConfigRelatorio): Record<string, string>;   // já com os valores desligados
export function podeEditar(relatorio: { CRIADO_POR: number; PODE_EDITAR?: number }, usuarioId: number, ehAdmin: boolean): boolean;
export function serieDoAgregado(linhas: AgregadoRow[], medida: Medida): { name: string; value: number }[];
export function colunasCsvRelatorio(colunas: string[]): string[];
export function linhasCsvRelatorio(linhas: PedidoRow[], colunas: string[]): (string | number)[][];
```

## Simulador

### Tabelas

Esta spec **não cria tabela nenhuma**: `SGC_RELATORIO` entra no `setup-backend.mjs` pelo
integrador (T-001), no `CREATE` e sem `ALTER`. Nada muda em `schema-winthor.mjs`: as
colunas que `sgcWintComprasVsVendas` usa (`PCMOV.CODOPER/DTMOV/QT/PUNIT/CODCLI`,
`PCPRODUT.CODFORNEC`, `PCFORNEC.FORNECEDOR`, `PCCLIENT.CODATV1`) já existem desde a 003.

### Seed — `backend/simulator/seed/009-indicadores.mjs`

**Só relatórios salvos** (R-062). Nenhum card, pedido, NF, agendamento, item de B.O. ou
solicitação nasce aqui: os indicadores desta spec leem exatamente o que as ondas 1 e 2 (e o
seed da 008) semearam, e é isso que torna as asserções interessantes.

| Relatório | Dono | Compartilhado | Para quê |
|---|---|---|---|
| `Pedidos por fase` | `ana` (2) | sim | C-018, C-020 (visível ao colega), C-022 (agrupado por fase, gráfico barra, medida contagem) |
| `Valor por fornecedor` | `gil` (3) | sim | C-019 (a `ana` não edita o relatório do `gil`), C-022 (agrupado por fornecedor, medida valor) |
| `Meus pedidos em análise` | `ana` (2) | **não** | C-020 (não aparece para o `gil`), C-021 (config com filtro de fase preenchido) |
| `Relatório antigo` | `admin` (1) | sim | C-018 — `CONFIG_JSON` sem `visao` e com uma chave desconhecida, para `lerConfig` provar a tolerância |

`export const RELATORIOS_009 = { … }` com os quatro ids, como a 003 faz com `CARDS_003`:
é por ele que o smoke recorta as asserções de galeria (R-045), nunca por total absoluto.

**Como o smoke arranja o que o seed não semeia.** Os cenários de SLA e de agenda precisam
de estados que os seeds das ondas 1 e 2 não têm (um pedido ligado a um agendamento, por
exemplo). O arranjo é feito **dentro do próprio teste**, por `UPDATE` direto, e desfeito no
fim dele — é o padrão que o smoke da 002 já usa (`UPDATE KB_MOVIMENTO SET QUANDO = …`) e
mantém o R-062 intacto: o seed continua sem pedido novo. A suíte 009 é a **última** do
`smoke.mjs`, então nenhuma outra depende do que ela toca.

### `CHECK_INPUT`

O `sim:check` só exercita **SQL de leitura**. A seção 009 de `backend/simulator/config.mjs`
(arquivo do integrador) acrescenta **cinco chaves, todas novas** — nenhuma repetida em
nenhuma seção anterior, que é a dívida D-17 que esta spec não repete:

```js
// spec 009 (indicadores e relatórios): só chaves NOVAS.
fase: '', soVencidos: '', campoAgrupar: 'fase', responsavelId: '0', prioridade: '',
```

As demais já existem com valores que servem, e **nenhuma muda de valor aqui**:
`codfilial` `'1'` e `codfornec` `'1015'` (003), `dataInicio` `'2026-08-01'` e `dataFim`
`'2026-09-14'` (003 — período com movimento em `PCMOV`, o que faz `sgcWintComprasVsVendas`
voltar com linhas no `sim:check`), `hoje` `'2026-09-15'` (004), `idCard` `'5'` (002),
`busca` `''`, `limite` `'20'`, `offset` `'0'`.

Nomes escolhidos para **não** colidir (G-4 da onda 2): `campoAgrupar` em vez de `campo`,
`responsavelId` em vez de `responsavel`, `fase` (livre) em vez de `faseId` (002, `'2'`).
As escritas usam `titulo`, `descricao`, `configJson`, `compartilhado` e `agora` — `agora`
já existe e as outras quatro não são exercitadas pelo `sim:check` (escrita é pulada).

### Dialeto

Já são shims: `NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `CONCAT`, `DATEDIFF`, `LEAST`,
`GREATEST`, `FIELD`, `FLOOR`, `MOD`, `CURDATE`, `ROWNUM`, `SUBSTRING(` → `substr(`.
Esta spec acrescenta **um** pedido ao integrador, em `backend/simulator/mysql-dialect.mjs`:

- **`JSON_UNQUOTE(JSON_EXTRACT(col, '$.chave'))` → `json_extract(col, '$.chave')`** — uma
  reescrita de texto, do mesmo tipo das que já existem. É a única forma de ler a
  prioridade, que é campo do quadro e vive em `KB_CARD.VALORES_JSON` (R-009). O SQLite já
  traz `json_extract` embutido; o MySQL 8 já traz as duas funções.

E fixa três cuidados que valem para todo SQL desta spec:

- **`LEFT(col, 10)` não existe** no dialeto: a parte de data de uma coluna `VARCHAR(19)`
  sai sempre de `SUBSTRING(col, 1, 10)`, que é reescrito para `substr`;
- **divisão**: `100.0 * a / b`, nunca `100 * a / b` — no SQLite `/` entre inteiros trunca;
- **booleano em agregação**: `SUM(CASE WHEN x THEN 1 ELSE 0 END)`, nunca `SUM(x = 'y')`
  (forma MySQL que o SQLite aceita por acaso e que o MySQL estrito recusa em `ONLY_FULL_GROUP_BY`).

Nenhuma função de janela (`LEAD`, `OVER`) é usada (D-006). `WITH` já roda nos dois lados
(`sgcWintLotesAVencer` da 003 usa).

## Testes

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | `smoke/009-indicadores.mjs` | os sete números de `sgcIndResumo` batem com sete `SELECT COUNT/SUM` feitos **no próprio teste** sobre as mesmas tabelas (R-045: nenhum literal absoluto); `sgcIndPedidosPorFase` devolve 10 linhas (as fases do quadro) e a soma de `QTD` é igual à contagem de pedidos não cancelados do período |
| C-002 | `tests/analises.test.mjs` | `resultadosDosBlocos(['a','b','c'], [fulfilled([1,2]), rejected('falhou'), fulfilled([])])` → `a` `ok` com 2 linhas, `b` `erro` com a mensagem, `c` `vazio` |
| C-003 | `smoke/…` | `sgcIndResumo` com `codfilial: '1'` e com `'2'` devolve números diferentes, e cada um bate com a contagem da própria filial feita no teste; com `''`, a soma dos dois recortes é ≤ o total |
| C-004 | `tests/analises.test.mjs` | `listarPeriodos(new Date('2026-09-15'))` → 12 meses terminando em `2026-09` e 3 trimestres; `listarPeriodos(new Date('2027-01-02'))` → `2027-01` no topo e 1 trimestre; `periodoRange('2026-Q3')` → `2026-07-01`/`2026-09-30` |
| C-005 | `tests/analises.test.mjs` | `filialDoRecorte([{codfilial:'1',nome:'Matriz'},…], '')` → `'1'` e aviso citando "Matriz"; com `'2'`, devolve `'2'` e aviso vazio |
| C-006 | `smoke/…` | `sgcWintComprasVsVendas` com filial `'1'` e o período do seed devolve **contagem > 0** (vazio não é verde), com `QT_COMPRADA` e `QT_VENDIDA` > 0 em pelo menos uma linha e a coluna de licitação presente; com `codfilial: ''`, 0 linhas (RN-012) |
| C-007 | `tests/sla.test.mjs` + `smoke/…` | na régua pura: `classificarEtapa({inicio:'2026-09-08',fimReal:'2026-09-09',meta:1})` → `ok` com 1 dia; `fimReal:'2026-09-11'` → `estourou` com 3. No smoke, o teste arranja um pedido existente com essas duas datas e lê `STATUS_ANALISE`/`DIAS_ANALISE` de `sgcSlaPedidosListar` |
| C-008 | `tests/sla.test.mjs` + `smoke/…` | `{inicio:'2026-09-09',fimReal:'',meta:5,hoje:'2026-09-18'}` → `vencida` com 7 dias e `slaDoPedido` → `atrasado_fornecedor`; com a análise vencida junto, `atrasado_compras` (precedência) |
| C-009 | `tests/sla.test.mjs` + `smoke/…` | o mesmo com `hoje:'2026-09-16'` → `atencao` com 5 dias; pedido `atencao` |
| C-010 | `tests/sla.test.mjs` + `smoke/…` | `meta: 0` na Entrega → `sem_meta`, e `notaDoPedido` ignora a etapa. No smoke, os três fornecedores do seed da 001 **têm** prazo de entrega (7, 10 e 5) e o seed da 001 não se toca (R-017): o arranjo é `UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 0 WHERE CODFORNEC = 1042`, feito **e desfeito dentro do próprio `teste()`**, com o valor original lido antes; entre os dois, um pedido do 1042 com primeira NF sai com `STATUS_ENTREGA = 'sem_meta'` e `SLA_SCORE` sem a etapa |
| C-011 | `tests/sla.test.mjs` + `smoke/…` | `notaDoPedido([{dias:2,meta:1},{dias:5,meta:5}])` → 75; `([{1,1},{5,5},{10,7}])` → 90; no smoke, `SLA_SCORE` do pedido arranjado com esses marcos é o mesmo número |
| C-012 | `smoke/…` | o pedido da fase `cancelado` do seed 002 não aparece em `sgcSlaPedidosListar`, não entra em `sgcSlaPedidosKpis.TOTAL` nem em `sgcIndPerfilFornecedor` |
| C-013 | `smoke/…` | `sgcSlaPedidosKpis.TOTAL` = `sgcSlaPedidosListarTotal.TOTAL` sem filtro; `ATRASADOS_COMPRAS + ATRASADOS_FORNECEDOR` = total com `soVencidos: '1'`; e continua igual depois de trocar o período |
| C-014 | `smoke/…` | o teste liga um pedido existente a um agendamento com `DATA_ANALISE` 4 dias antes do `DT_ENVIO` → `STATUS_AGENDA = 'enviada_com_atraso'` e `DIAS_ATRASO_AGENDA = 4`; com a data igual ao envio → `no_planejado` e 0; sem agendamento → `sem_agenda` e `NULL` |
| C-015 | `smoke/…` | `sgcSlaPedidoFases` de um card com N passagens devolve N linhas, em ordem crescente, com `DT_SAIDA` vazia só na última e `DIAS_NA_FASE` ≥ 0 em todas |
| C-016 | `tests/analises.test.mjs` | `resumoSolicitacoes` sobre um funil montado à mão com os **pares** `('pendente','sem_pedido') 4`, `('recusada','sem_pedido') 2`, `('aprovada','atendida') 8` e `('aprovada','em_analise'/'enviada') 6` → total 20, pendentes 4 e recusadas 2 lidos do `STATUS`, atendidas 8 e em fluxo 6 lidos da `SITUACAO`, geral **40,0** e fluxo **57,1**; funil vazio → as duas `null` |
| C-017 | `smoke/…` | `sgcSolicitacoesPorVendedor` devolve uma linha por `CRIADO_POR` distinto do período (contado no teste), com `TOTAL` igual à contagem daquele vendedor, `PENDENTES`/`RECUSADAS` batendo com o `STATUS` e `ATENDIDAS`/`EM_FLUXO` com a `SITUACAO`, e nenhuma coluna de valor |
| C-018 | `smoke/…` + `tests/relatorio.test.mjs` | `sgcEscRelatorioInserir` cria 1 linha e `sgcRelatoriosListar` a devolve com título, autor e `CONFIG_JSON` idêntico ao enviado; `lerConfig` do relatório "antigo" do seed devolve a config completa, com `visao` no padrão e a chave desconhecida descartada |
| C-019 | `smoke/…` | `sgcEscRelatorioAtualizar` do relatório do `gil` chamado pela `ana` não muda nada (título e `ATUALIZADO_EM` iguais antes e depois); chamado pelo `gil`, muda; chamado pelo `admin`, muda; `sgcRelatoriosListar` traz `PODE_EDITAR` 1 para o dono e 0 para o colega |
| C-020 | `smoke/…` | `sgcRelatoriosListar` como `gil` não traz `Meus pedidos em análise`; como `ana`, traz; os compartilhados aparecem para os dois — contagem **recortada por `RELATORIOS_009`** |
| C-021 | `smoke/…` | `sgcRelatorioPedidos` com todos os filtros desligados devolve `limite` linhas e `sgcRelatorioPedidosTotal` o total; cada filtro isolado (fase, fornecedor, filial, responsável, prioridade, período) reduz o total; `offset` 20 não repete nenhum `ID_CARD` da primeira página |
| C-022 | `smoke/…` + `tests/relatorio.test.mjs` | `sgcRelatorioAgregar` por `fase` devolve uma linha por fase presente, e `SUM(QTD)` é igual ao total da consulta; por `fornecedor`, o mesmo; `serieDoAgregado(linhas, 'valor')` devolve `{name, value}` com `VL_TOTAL` |
| C-023 | `tests/relatorio.test.mjs` | `colunasCsvRelatorio(['numero','fornecedor','valor'])` → 3 cabeçalhos na ordem; `linhasCsvRelatorio` com 2 linhas devolve 2 arrays de 3 posições, com o valor formatado em pt-BR (o escape é de `lib/csv.ts`, testado pela base) |
| C-024 | `tests/analises.test.mjs` | `serieSimples` e `serieComparativa` devolvem a mesma lista que a tabela alternativa consome: mesmos rótulos, mesmos valores, mesma ordem |
| C-025 | `smoke/…` + `tests/permissoes.test.mjs` | `permissoesDe` devolve `verAnalises`/`verRelatorios`/`salvarRelatorio` por persona (comercial falso nas três; diretoria só nas duas primeiras; `READ_ONLY` zera só a terceira); `sgcEscRelatorioInserir` como `dora` (diretoria) e como `leo` (comercial) não grava; `sgcIndResumo` e `sgcSlaPedidosListar` chamadas por um usuário `RESTRICTED` contam só os pedidos criados por ele (contagem feita no teste) |
| C-026 | `smoke/…` | `sgcIndPerfilFornecedor` devolve uma linha por fornecedor com pedido no período (contado no teste), `QTD_PEDIDOS` igual à contagem e `PERC_NO_PRAZO` entre 0 e 100 |
| C-027 | `smoke/…` | `sgcIndLeadTime` devolve uma linha por fase com passagem no período, e `SUM(PASSAGENS)` é igual à contagem de `KB_MOVIMENTO` do mesmo recorte feita no teste |
| RN-001 | `tests/sla.test.mjs` + `smoke/…` | pedido sem envio mede a Análise até `hoje`; pedido concluído sem nota mede o Faturamento até `dtConclusao`, e o número **não** muda quando `hoje` avança |
| RN-002 | `tests/sla.test.mjs` | os sete estados → os sete rótulos e os quatro tons; estado desconhecido → "Sem estado" e `off`, sem lançar |
| RN-003 | `tests/sla.test.mjs` + `smoke/…` | `somarDiasUteis('2026-08-24', 15)` → `'2026-09-14'`; `diasUteisEntre('2026-08-24','2026-09-14')` → 15; sex→seg 1; seg→sáb 4; mesmo dia 0; e a mesma conta pelo fragmento SQL, num `SELECT` com as duas datas literais |
| RN-004 | `smoke/…` | fornecedor sem `SLA_ANALISE_DIAS`/`SLA_FATURAMENTO_DIAS` sai com `META_ANALISE_DIAS = 1` e `META_FATURAMENTO_DIAS = 5` (os dois zerados pelo mesmo arranjo de C-010, feito e desfeito no `teste()`); sem `PRAZO_ENTREGA_DIAS`, `STATUS_ENTREGA = 'sem_meta'` |
| RN-005 | `tests/sla.test.mjs` | as combinações de precedência, inclusive `vencida` na análise **e** no faturamento → `atrasado_compras`, e concluído com atenção → `concluido` |
| RN-006 | `tests/sla.test.mjs` | 75 e 90; nenhuma etapa medida → 0; `dias = 0` não divide por zero; etapa sem meta fora da média |
| RN-007 | `smoke/…` | o pedido cancelado não aparece em `sgcSlaPedidosListar`, `sgcSlaPedidosKpis`, `sgcSlaPedidosListarTotal` nem `sgcIndPerfilFornecedor` |
| RN-008 | `tests/sla.test.mjs` + `smoke/…` | as cinco situações de agenda; envio antes da data planejada → `no_planejado` e 0 dias (nunca negativo) |
| RN-009 | `tests/analises.test.mjs` | 8/20 → 40,0 e 8/14 → 57,1, com pendentes e recusadas vindo do `STATUS` e atendidas da `SITUACAO` (uma dimensão só não separaria as três — R-076); total 0 → `null` nas duas; `serieDoFunil` soma os pares de volta por situação |
| RN-010 | `smoke/…` | a soma de `QTD` de `sgcSolicitacoesFunil` é igual à contagem de `SGC_SOLICITACAO` do período, e a soma **por `SITUACAO`** (juntando os pares do mesmo valor) bate, situação a situação, com a que `sgcSolicitacoesListar` (008) devolve para o mesmo recorte — as duas leem o mesmo `situacao-solicitacao.sql`, com os mesmos aliases (R-075) |
| RN-011 | `tests/analises.test.mjs` | `listarPeriodos` em duas datas; `intervaloPadrao(new Date('2026-09-15'))` → `dataFim` `'2026-09-15'` e 90 dias de intervalo |
| RN-012 | `smoke/…` + `tests/analises.test.mjs` | `sgcWintComprasVsVendas` com `codfilial: ''` devolve 0 linhas; `filialDoRecorte` nunca devolve `''` quando a lista tem filial |
| RN-013 | `smoke/…` | título vazio não grava; alterar relatório alheio não grava; excluir o próprio grava e some da listagem |
| RN-014 | `smoke/…` | **o par de período desligado não reduz**: `sgcRelatorioPedidosTotal` com `dataInicio`/`dataFim` vazios é igual ao `SELECT COUNT(*)` dos pedidos vivos feito no próprio teste, e igual ao total com um período que cobre tudo; os demais filtros desligados idem; `sgcIndAgendaAtrasos`, `sgcIndProdutosBo`, `sgcIndPerfilFornecedor` e `sgcSolicitacoesPorVendedor` respeitam `limite` |
| RN-015 | `smoke/…` | as duas consultas chamadas como usuário `RESTRICTED` contam só os pedidos com `CRIADO_POR` dele; como `MEMBER`, contam todos |
| RN-016 | `smoke/…` | para **cada** linha de `sgcSlaPedidosListar` (sem filtro), `classificarEtapa` de `frontend/src/lib/sla.ts` — importado direto pelo smoke, como o seed da 005 importa `dias-uteis.ts` — reproduz `STATUS_ANALISE`, `STATUS_FATURAMENTO`, `STATUS_ENTREGA` e `notaDoPedido` reproduz `SLA_SCORE` |

- **Backend:** `backend/simulator/smoke/009-indicadores.mjs`, um `teste()` por linha, título
  começando pelo id. A consulta ao WinThor assere **contagem > 0** (vazio não é verde).
  Nenhuma asserção de total absoluto: tudo é contado no próprio teste ou recortado por
  `RELATORIOS_009` (R-045).
- **Frontend:** `frontend/tests/{sla,analises,relatorio}.test.mjs` com `node --test` sobre
  `src/lib/`. `permissoes.test.mjs` (002) ganha as três chaves novas.
- **Seed extra para o smoke:** nenhum. Os arranjos que faltam são feitos e desfeitos dentro
  do próprio teste (R-062).

## Dependências entre specs

**Consome da 001 (fornecedores):** `SGC_FORNECEDOR.SLA_ANALISE_DIAS`,
`SLA_FATURAMENTO_DIAS`, `PRAZO_ENTREGA_DIAS`, `PRAZO_ENTREGA_TIPO` (conferidas no
`setup-backend.mjs`: as quatro existem, `INT NOT NULL DEFAULT 0` e
`VARCHAR(10) DEFAULT 'uteis'`) e a SF `sgcWintFiliais` para o filtro do cabeçalho. Zero
cadastro novo: o seed da 001 continua dono único de fornecedor e filial (R-017).

**Consome da 002 (quadro):** `SGC_PEDIDO`, `SGC_FASE` (as chaves `concluido` e `cancelado`
decidem o que entra), `SGC_USUARIO_PERSONA` + `INT_USER` (a guarda de persona, R-013) e o
seed dos 6 pedidos. `lib/permissoes.ts` ganha as três chaves de R-061 **pela base**.

**Consome da 003 (itens):** `SGC_PEDIDO_ITEM.STATUS` (o `bo` que a situação da solicitação
usa) e a lista de atividades de licitação de `sgcWintAnaliseMontagem` (AN-04).

**Consome da 004 (agenda):** `SGC_AGENDA.DATA_ANALISE`, `DATA_ENVIO_REAL`, `ATIVO`,
`ID_CARD_GERADO` e `SGC_PEDIDO.ID_AGENDA` — a aderência à agenda (R-057) e o bloco de
envios atrasados. `DatePicker` para o intervalo livre.

**Consome da 005 (NF e faturamento):** `SGC_NF.DT_EMISSAO`/`DT_RECEBIMENTO`,
`SGC_PEDIDO.DT_PRIMEIRO_FATURAMENTO`/`PERC_FATURADO_VALOR`, e `backend/lib/dias-uteis.mjs`
+ `frontend/src/lib/dias-uteis.ts` (R-025, assinatura congelada lá) e `lib/csv.ts` (R-037).
`DT_PRIMEIRO_FATURAMENTO` é espelho que só a 005 escreve: a CTE cai em
`MIN(SGC_NF.DT_EMISSAO)` quando ele está vazio, para um pedido cujo espelho nunca foi
recalculado ainda assim medir (D-003).

**Consome da 006 (trânsito):** o critério de "nota atrasada" do KPI `NFS_ATRASADAS` é o
mesmo de `sgcNfsEmAtraso` — nota sem `DT_RECEBIMENTO` cuja previsão (emissão + prazo do
fornecedor, úteis ou corridos) já passou. O `add-012` **não** reescreve a conta: usa
`somarDiasUteis`/`somarDiasCorridos` de `backend/lib/dias-uteis.mjs` com as mesmas colunas,
que é de onde a 006 também parte. Se a 006 mudar o critério, este KPI muda junto (D-005).

**Consome da 007 (B.O.):** `SGC_BO_ITEM` (`STATUS = 'aberto'`, `QT_PENDENTE`) para o KPI de
itens em falta e para o bloco de produtos em B.O. por fornecedor. Degrada sozinha: sem
linhas, o número é 0 e o bloco fica vazio.

**Consome da 008 (solicitações) — o único acoplamento novo da onda:**

- as colunas de `SGC_SOLICITACAO` listadas no 000 (R-052), **nenhuma a mais**;
- `backend/sql/situacao-solicitacao.sql` (R-070, R-075): o `CASE` escalar que deriva
  `SITUACAO` da fase do card, do estado do item e do status da solicitação, no mesmo
  formato dos `pendencias-*.sql` da onda 2. O **contrato de composição** está no cabeçalho
  do arquivo e é o que a 009 obedece, alias por alias: `S` = `SGC_SOLICITACAO`,
  `C` = `KB_CARD` com `EXCLUIDO_EM IS NULL`, `SF` = `SGC_FASE` por `(BOARD_ID, FASE_ID)` do
  card, `I` = `SGC_PEDIDO_ITEM` por `(ID_CARD, CODPROD)` com `STATUS <> 'removido'`, mais
  os três `LEFT JOIN` obrigatórios. **A 008 é a dona**; a 009 só compõe, e por
  `fragmento('situacao-solicitacao.sql')` de `backend/lib/fragmentos.mjs` (R-074, base) —
  nunca por cópia do texto. O que **não** pode acontecer é a 009 escrever uma segunda régua
  (RN-010), e o teste RN-010 é o que acusa se as duas divergirem;
- o vocabulário que a régua devolve, inclusive o `sem_pedido` que cobre pendente, recusada,
  cancelada e aprovada-sem-pedido — é dele que sai a necessidade das duas dimensões no
  funil (R-076).

**Consome da base (S2):** `recharts` + `components/ui/chart.tsx` + o bloco §8.7 de
`page.tsx` (`GradeKpi`, `Kpi`, `GradeGraficos`, `PainelGrafico`, `corDeSerie`,
`AlternaVisao` e os primitivos do recharts reexportados) — **entrega da base** por R-080,
porque `page.tsx` é arquivo compartilhado; a seção *Superfície de interação* deste plan é a
especificação que a base segue, e a 009 só consome. Mais `backend/lib/fragmentos.mjs` com
`fragmento(nome)` (R-074), `SGC_RELATORIO` no `setup-backend.mjs`, as três chaves e os dois
itens de menu de `lib/permissoes.ts`.

**Fornece:** nada a outras specs da onda. As duas telas são folhas: ninguém lê SF, tabela
ou módulo desta spec. O integrador liga rotas, menu, `PUBLISH_ORDER`, `CHECK_INPUT` e a
reescrita de JSON do dialeto (R-063).

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | **Nenhuma SF JAVASCRIPT e nenhuma escrita por id.** Todas as 17 leituras e as 3 escritas são SQL chamadas direto da tela, com `:VAR_USER` | Um JS por aba, devolvendo os blocos numa execução (o padrão de `sgcNfListar`/`sgcBoCarregar`) | O princípio 5 do 000 reserva JS para orquestração, e-mail e cron, e aqui não há nenhum dos três. Um JS por aba também **mataria** o R-057: se os blocos vêm numa execução, a falha de um derruba todos, e é exatamente isso que o RF-002 proíbe. Cinco execuções em paralelo cabem no teto (uma abertura de aba por pessoa a cada poucos minutos), e cada bloco falha sozinho |
| D-002 | `sgcIndPedidosPorFase` entra como SF a mais da linha 009 | Espremer "pedidos por fase" dentro de `sgcIndResumo` | Uma linha de escalares e uma linha por fase são formas diferentes; juntá-las repetiria os seis KPIs em dez linhas e obrigaria a tela a desempacotar. O 000 permite acrescentar com justificativa, e a faixa e o prefixo são os mesmos |
| D-003 | A primeira nota sai de `COALESCE(NULLIF(DT_PRIMEIRO_FATURAMENTO,''), MIN(SGC_NF.DT_EMISSAO))` | Confiar só na coluna espelho da 005 | A coluna é escrita por `sgcEscPedidoFaturamento`, que só roda quando alguém vincula nota pela tela; pedido semeado ou migrado tem nota e espelho vazio. O `COALESCE` mede os dois casos e nunca discorda do espelho quando ele existe |
| D-004 | Venda de licitação entra em **coluna própria** na comparação compras × vendas | Excluir cliente público da venda, como o sistema anterior fazia | O 000 não mandou excluir, e esconder metade da venda num indicador de comparação é o defeito que a AN-03 corrigiu na consulta de análise da 003. Com a coluna, quem quiser a leitura sem licitação subtrai; sem ela, ninguém recupera o número |
| D-005 | O KPI de notas atrasadas usa os fragmentos de dias úteis, não uma cópia da SQL da 006 | Chamar `sgcNfsEmAtrasoTotal` da 006 a partir da tela | Chamar a SF da 006 acrescentaria uma execução ao painel e traria o recorte dela (fases `enviado`/`transito`), que não é o do painel. O fragmento compartilhado é o mesmo em que a 006 se apoia, então a conta não diverge |
| D-006 | Sem função de janela: a passagem seguinte sai de `MIN(M2.ID) … WHERE M2.ID > M.ID` | `LEAD(QUANDO) OVER (…)`, como no sistema anterior | `KB_MOVIMENTO.ID` é autoincremento e as passagens nascem em ordem, então o `ID` já é a linha do tempo. O dialeto do simulador não tem nenhum atalho de janela, e a subconsulta cai direto em `IX_KB_MOVIMENTO_CARD` |
| D-007 | A etapa aberta de um pedido **concluído** é medida até a conclusão, e classificada `ok`/`estourou` | O `SEM_DADO` do sistema anterior (oitavo estado) | O 000 fixou **sete** estados. Medir até hoje faria o número crescer para sempre depois que o pedido fechou; medir até a conclusão responde a pergunta certa ("fechou dentro do prazo?") e dispensa o oitavo estado |
| D-008 | Só duas listagens são paginadas com `…Total` (SLA e consulta do relatório); os blocos de gráfico são **top-N** com `{{limite}}` e teto de 50 | Paginar tudo, com um `…Total` por bloco | Um gráfico de 8 barras não se pagina; o `…Total` de cada bloco seria uma execução a mais por carga, contra o RNF-001. O corte aparece no rodapé do painel ("10 maiores"), que é o que o `design.md` §9.7 pede |
| D-009 | O resumo das solicitações (aderências, tempo médio) é derivado do funil **na tela** | Uma SF de resumo | O funil já vem agregado: somar seis linhas na tela custa zero e poupa uma execução por carga. De quebra, RN-009 vira teste puro em vez de asserção sobre banco |
| D-010 | `lib/sla.ts` repete a régua de classificação e **é consumida** pelo pedido expandido; o teste RN-016 compara as duas linha a linha | Deixar a classificação só no servidor e a `lib/sla.ts` só com rótulos | O integrador pediu a régua dos dois lados, e a dívida D-16 da onda 2 mostra o que acontece com módulo puro sem consumidor. Consumindo-a onde os marcos já chegaram (o expandido), a tela não gasta execução nova e o teste impede a divergência que o A-12 registrou |
| D-011 | A prioridade sai de `KB_CARD.VALORES_JSON` por `JSON_EXTRACT`, com uma reescrita nova no dialeto | Tirar a prioridade dos filtros do relatório, ou casar por `LIKE` no texto do JSON | R-059 lista a prioridade entre os filtros e R-009 diz que ela vive **só** no campo do quadro. `LIKE '%"prioridade":"alta"%'` quebra com um espaço a mais no JSON. A reescrita é uma linha, do mesmo tipo das que a 005 pediu |
| D-012 | O recorte `RESTRICTED` é aplicado **no servidor**, em toda consulta que fala de pedido | Filtrar na tela pelo `CRIADO_POR` devolvido | Filtro de tela não protege nada: o perfil business libera a SF, e o número agregado já teria vazado antes de a tela filtrar (é o mesmo achado A1 da onda 1, aplicado a leitura). P-08 B é a regra: acesso restrito opera e enxerga só os próprios cards |
| D-013 | Nenhuma exportação nas abas de `/analises`; o CSV é do construtor de relatórios | CSV em cada bloco do painel | O R-059 pede CSV no relatório; cada bloco já tem a alternativa em tabela, que é o que a acessibilidade exige. Exportação por bloco seria seis botões para um caso de uso que o relatório salvo cobre melhor |
| D-013 (emenda, integração da onda 3, 2026-09-16) | **UM** botão "Exportar CSV" na aba Pedidos (SLA), sobre a página atual da lista | Continuar sem exportação nenhuma | Com `/relatorios` adiado (R-114) o construtor não existe nesta onda, e `lib/sla.ts` já entregou `COLUNAS_CSV_SLA`/`linhasCsvSla` sem consumidor. O resto de D-013 segue valendo: nenhum outro bloco do painel ganha botão |
| D-014 | **Período obrigatório** em todo indicador; desligável só no filtro de criação do relatório, e lá em dois ramos (`'{{dataInicio}}' = '' OR …`) | O mesmo `BETWEEN` em tudo, com `''` valendo como "desligado" | `BETWEEN '' AND ''` não desliga filtro nenhum: devolve **zero linha em silêncio**, e um painel vazio lê como "não há pedidos", não como "faltou parâmetro". Onde o período é da própria pergunta ("os últimos 90 dias"), exigi-lo é mais honesto do que fingir que ele é opcional; onde ele é filtro de recorte (R-059), o ramo explícito faz o desligado ser desligado. RN-014 prova que o par vazio não reduz |
| D-015 | O funil agrega pelo par `STATUS × SITUACAO` | Só `SITUACAO`, como o funil do sistema anterior | A régua da 008 devolve `sem_pedido` para pendente, recusada, cancelada **e** aprovada-na-fila (R-075/R-076): com uma dimensão só, "esperando avaliação" e "recusada" viram a mesma barra e a aderência de fluxo fica impossível de calcular. O par custa uma coluna a mais e nenhuma régua nova |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O arquivo `situacao-solicitacao.sql` mudar de aliases depois de a 009 compor sobre ele | o funil quebra ou, pior, deriva situação errada em silêncio | o contrato de aliases está **no cabeçalho do arquivo** (R-075) e é o mesmo das duas specs; o teste RN-010 cruza o funil com `sgcSolicitacoesListar` da 008 a cada rodada do smoke, então uma mudança de alias aparece como divergência de contagem, não como número plausível |
| A cadeia de CTEs varrer toda a base a cada carga | painel lento com 10 mil pedidos | o período é obrigatório na cláusula (`BETWEEN` sobre `CRIADO_EM`), a filial recorta, e as quatro SFs que a usam já filtram antes de agregar. RNF-002 mede com 2 mil pedidos; acima disso, a saída é um índice em `SGC_PEDIDO (CRIADO_EM)`, não mudar a régua |
| `recharts`/`chart.tsx` não estarem instalados quando esta spec for implementada | as telas não compilam | é dependência da base (S2, R-058) e está no `design.md` §1.2 desde a 2.2.0; as tasks de tela dependem de T-002 |
| Divergência entre a régua do servidor e a de `lib/sla.ts` | o expandido diz uma coisa e o KPI outra | RN-016 compara as duas em **todas** as linhas da listagem a cada rodada do smoke; é o mesmo remédio do teste de 500 combinações da 002 |
| `ROUND`/divisão inteira darem números diferentes no SQLite e no MySQL | a nota do pedido muda entre simulador e produção | `100.0` em toda divisão, `ROUND` em toda média, e o teste C-011 fixa os dois números (75 e 90) nos dois lados |
| Um pedido antigo com `CRIADO_EM` fora do período mas ainda aberto sumir do painel | gestor não vê o pedido mais atrasado | é o recorte declarado (todo bloco é "do período"), e o padrão de 90 dias cobre o ciclo real de compra. O filtro de período é da pessoa, e o bloco diz qual período está lendo |

## Pedidos ao 000 — respondidos (R-070, R-071, R-074, R-076, R-080)

Nenhum pedido em aberto: os quatro desta spec foram absorvidos pelo 000 na S1 da onda 3.

| # | Pedido | Decisão | Onde entrou |
|---|---|---|---|
| 1 | `SGC_RELATORIO.COMPARTILHADO` como `BOOLEAN` em vez de `TINYINT` | **aceito (R-071)** | *Modelo de dados*, T-001 |
| 2 | `sgcIndPedidosPorFase` como SF a mais na linha 009 | **aceito (R-071)**, e a reescrita de JSON do dialeto junto | D-002, D-011, T-007, T-020 |
| 3 | `backend/sql/situacao-solicitacao.sql` como entrega da 008 | **aceito (R-070)**, com o contrato de aliases fixado em **R-075** e o loader `fragmento(nome)` de `backend/lib/fragmentos.mjs` como entrega da base (**R-074**) | *Leituras — solicitações*, T-003, T-011, T-021 |
| 4 | Os primitivos de KPI e gráfico em `page.tsx` | **entrega da base (R-080)**; a seção *Superfície de interação* deste plan é a especificação que ela segue | T-002 |

O 000 acrescentou ainda a **R-076** (funil por `STATUS` × `SITUACAO`), que esta spec
aplica em `sgcSolicitacoesFunil`, em `resumoSolicitacoes` e nos testes C-016/RN-009.

## Complexity Tracking

Vazio: nenhuma violação de princípio. A dependência nova (`recharts` + `chart.tsx`) está
prevista no `design.md` §1.2 e no R-058, e é instalada pela base.
