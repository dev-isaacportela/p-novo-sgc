// add-012 — Server Functions da spec 009 (indicadores): KPIs e blocos de
// `/analises`, SLA dos pedidos por etapa, funil das solicitações e compras ×
// vendas no WinThor. Ver docs/specs/009-indicadores-e-relatorios/{spec,plan,tasks}.md.
//
// `/relatorios` (relatórios salvos) foi ADIADO por decisão do usuário em
// 2026-09-16: as leituras 7914-7917 e as escritas 7950-7952 não existem aqui.
//
// Faixa de id local: 79xx (R-051/R-072 do 000) — leituras 7901-7913. TODAS
// SQL: esta spec não tem JAVASCRIPT nem cron (D-001 do plan),
// porque não há orquestração, e-mail nem rotina aqui — o paralelismo dos
// blocos é da tela (R-057), e um JS por aba mataria o RF-002 (a falha de um
// bloco derrubaria os outros). Por isso toda leitura é chamada DIRETO da tela
// e identifica quem chama por `:VAR_USER`; nenhuma recebe `{{usuarioId}}`.
//
// As quatro consultas de prazo (`sgcSlaPedidosKpis`, `sgcSlaPedidosListar`,
// `sgcSlaPedidosListarTotal` e `sgcIndPerfilFornecedor`) saem da MESMA cadeia
// de CTEs, `pedidosCte()` — é isso que faz o número do topo nunca discordar da
// linha da tabela (RF-012/C-013). Os dias úteis vêm de `backend/lib/
// dias-uteis.mjs` (R-025) e a régua de situação da solicitação, de
// `backend/sql/situacao-solicitacao.sql` pelo `fragmento(nome)` de
// `backend/lib/fragmentos.mjs` (R-070/R-074/R-075) — a 009 não escreve régua
// própria (RN-010).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-012-indicadores.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { diasUteisEntre, somarDiasUteis, somarDiasCorridos } from './lib/dias-uteis.mjs';
import { fragmento } from './lib/fragmentos.mjs';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintComprasVsVendas'];

/* ──────────────────────────────────────────────────────────────────────────
   Fragmentos comuns
   ────────────────────────────────────────────────────────────────────────── */

// G-6 (mesma forma da 006/007): `hoje` desligado (`''`) não pode virar "tudo no
// prazo" — cai para o dia do servidor. `DATE_FORMAT(CURDATE(), …)` e não
// `CURDATE()` cru porque toda comparação desta spec é de TEXTO ISO.
const HOJE = `COALESCE(NULLIF('{{hoje}}', ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d'))`;

/**
 * RN-015/D-012 — recorte por acesso restrito, aplicado no SERVIDOR em toda
 * consulta desta spec que fala de pedido. É `KB_CARD.CRIADO_POR`, não
 * `SGC_PEDIDO.CRIADO_POR`: "os próprios cards" é o card em todo o projeto
 * (`sgcPodeMover`/`sgcPodeExcluir` da 005, `pedidoEmAnalise` da 006), e as duas
 * colunas podem divergir — o cron da agenda cria o card sem sessão. Toda
 * consulta que cola este bloco tem `KB_CARD C` no escopo.
 */
const RECORTE_RESTRITO = `AND (NOT EXISTS (SELECT 1 FROM INT_USER IU
                 WHERE IU.ID = :VAR_USER AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') = 'RESTRICTED')
     OR C.CRIADO_POR = :VAR_USER)`;

/** Parte de data de uma coluna `VARCHAR(19)`: `LEFT()` não existe no dialeto. */
const dia = (col) => `SUBSTRING(COALESCE(${col}, ''), 1, 10)`;

/* ──────────────────────────────────────────────────────────────────────────
   A cadeia de CTEs dos pedidos — pedidosCte()
   ──────────────────────────────────────────────────────────────────────────
 *
 * Quatro consultas, uma régua (R-057). As CTEs, em ordem:
 *   PED     — a linha crua do pedido, com marcos e metas do fornecedor
 *   MARCOS  — os três "fins" de RN-001, escritos uma vez cada
 *   DIAS    — os dias de cada etapa (úteis; Entrega também corridos, RN-003)
 *   CLASS   — os sete estados por etapa (RN-002) e a aderência à agenda (RN-008)
 *   FINAL   — o SLA do pedido (RN-005) e a nota (RN-006)
 *
 * O `MARCOS` existe porque nem o MySQL nem o dialeto reaproveitam alias no
 * mesmo SELECT: sem ele, cada CASE de fim apareceria quatro vezes dentro da
 * aritmética de dia útil. Semanticamente é a `DIAS` do plan, partida em duas.
 */

// RN-001: enquanto o marco de fim não existe, a etapa é medida ATÉ HOJE; se o
// pedido foi concluído sem que ela fechasse, até a conclusão — nunca até hoje.
const fimDaEtapa = (real) => `CASE WHEN ${real} <> '' THEN ${real}
         WHEN P.CONCLUIDO = 1 AND P.DT_CONCLUSAO <> '' THEN P.DT_CONCLUSAO
         ELSE ${HOJE} END`;

// RN-002 — os sete estados, iguais para as três etapas: só os marcos e a meta
// mudam. Análise e Faturamento nunca caem em `sem_meta` (a meta tem padrão 1 e
// 5, RN-004); a Entrega nunca cai em `ok`/`estourou` sem meta, porque o ramo
// `sem_meta` vem antes. D-007: etapa aberta de pedido concluído é classificada
// `ok`/`estourou` contra a meta, nunca um oitavo estado.
const estadoDaEtapa = (inicio, meta, fimReal, dias) => `CASE
      WHEN ${inicio} = ''    THEN 'nao_iniciada'
      WHEN ${meta} = 0       THEN 'sem_meta'
      WHEN ${fimReal} <> ''  THEN CASE WHEN ${dias} <= ${meta} THEN 'ok' ELSE 'estourou' END
      WHEN D.CONCLUIDO = 1   THEN CASE WHEN ${dias} <= ${meta} THEN 'ok' ELSE 'estourou' END
      WHEN ${dias} >  ${meta} THEN 'vencida'
      WHEN ${dias} =  ${meta} THEN 'atencao'
      ELSE 'andamento'
    END`;

// RN-006 — a nota de uma etapa: `menor entre 100 e (100 × meta ÷ dias gastos)`.
// `100.0`, não `100`: no SQLite `/` entre inteiros trunca e a nota divergiria
// entre o simulador e a plataforma.
const notaDaEtapa = (dias, meta) => `CASE WHEN ${dias} IS NULL OR ${meta} = 0 THEN 0
         ELSE LEAST(100, ROUND(100.0 * ${meta} / GREATEST(${dias}, 1))) END`;
const contaEtapa = (dias, meta) => `CASE WHEN ${dias} IS NULL OR ${meta} = 0 THEN 0 ELSE 1 END`;

/**
 * O texto `WITH … ` compartilhado. Quem chama acrescenta o seu SELECT sobre a
 * CTE `FINAL` (alias livre). Parâmetros: codfilial (''), codfornec (0),
 * dataInicio e dataFim (OBRIGATÓRIOS — D-014), busca (''), hoje ('').
 */
function pedidosCte() {
  return `WITH PED AS (
  SELECT
    C.ID AS CARD_ID, C.TITULO, C.FASE_ID,
    COALESCE(KF.NOME, '')  AS FASE_NOME,
    COALESCE(SF.CHAVE, '') AS FASE_CHAVE,
    COALESCE(SF.ORDEM, 0)  AS FASE_ORDEM,
    CASE WHEN COALESCE(SF.CHAVE, '') = 'concluido' THEN 1 ELSE 0 END AS CONCLUIDO,
    ${dia('C.CONCLUIDO_EM')} AS DT_CONCLUSAO,
    COALESCE(P.CODFORNEC, 0) AS CODFORNEC, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
    COALESCE(P.CODFILIAL, '') AS CODFILIAL, COALESCE(P.FILIAL, '') AS FILIAL,
    COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED_WINTHOR,
    COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL,
    COALESCE(P.PERC_FATURADO_VALOR, 0) AS PERC_FATURADO,
    ${dia('P.CRIADO_EM')} AS DT_CRIACAO,
    COALESCE(NULLIF(P.DT_ENVIO, ''), '') AS DT_ENVIO,
    -- D-003: o espelho da 005 primeiro; sem ele, a primeira nota do pedido.
    COALESCE(NULLIF(P.DT_PRIMEIRO_FATURAMENTO, ''), COALESCE(NF.PRIMEIRA_NF, '')) AS DT_PRIMEIRA_NF,
    COALESCE(NF.QTD_NFS, 0) AS QTD_NFS,
    -- RN-001: recebimento consolidado — todas as notas recebidas e 100 % faturado,
    -- ou o pedido concluído.
    CASE
      WHEN COALESCE(SF.CHAVE, '') = 'concluido' THEN COALESCE(NF.RECEB_MAX, '')
      WHEN COALESCE(NF.QTD_NFS, 0) > 0 AND COALESCE(NF.NFS_SEM_RECEBIMENTO, 0) = 0
           AND COALESCE(P.PERC_FATURADO_VALOR, 0) >= 100 THEN COALESCE(NF.RECEB_MAX, '')
      ELSE '' END AS DT_ENTREGA,
    COALESCE(NULLIF(AG.DATA_ANALISE, ''), '') AS DT_AGENDA,
    COALESCE(NULLIF(${dia('AG.DATA_ENVIO_REAL')}, ''), COALESCE(NULLIF(P.DT_ENVIO, ''), '')) AS DT_ENVIO_EFETIVO,
    -- RN-004: sem parametrização, 1 dia útil na Análise e 5 no Faturamento. A
    -- Entrega NAO tem padrao: sem prazo cadastrado ela fica sem meta.
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
    AND ${dia('P.CRIADO_EM')} BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND ('{{busca}}' = '' OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%')
         OR COALESCE(P.FORNECEDOR, '') LIKE CONCAT('%', '{{busca}}', '%')
         OR COALESCE(P.NUMPED_WINTHOR, '') LIKE CONCAT('%', '{{busca}}', '%'))
    ${RECORTE_RESTRITO}
),
MARCOS AS (
  SELECT P.*,
    ${fimDaEtapa('P.DT_ENVIO')}       AS FIM_ANALISE,
    ${fimDaEtapa('P.DT_PRIMEIRA_NF')} AS FIM_FATURAMENTO,
    ${fimDaEtapa('P.DT_ENTREGA')}     AS FIM_ENTREGA
  FROM PED P
),
DIAS AS (
  SELECT M.*,
    CASE WHEN M.DT_CRIACAO = '' THEN NULL
         ELSE GREATEST(0, ${diasUteisEntre('M.DT_CRIACAO', 'M.FIM_ANALISE')}) END AS DIAS_ANALISE,
    CASE WHEN M.DT_ENVIO = '' THEN NULL
         ELSE GREATEST(0, ${diasUteisEntre('M.DT_ENVIO', 'M.FIM_FATURAMENTO')}) END AS DIAS_FATURAMENTO,
    CASE WHEN M.DT_PRIMEIRA_NF = '' THEN NULL
         WHEN M.META_ENTREGA_TIPO = 'corridos'
           THEN GREATEST(0, DATEDIFF(M.FIM_ENTREGA, M.DT_PRIMEIRA_NF))
         ELSE GREATEST(0, ${diasUteisEntre('M.DT_PRIMEIRA_NF', 'M.FIM_ENTREGA')}) END AS DIAS_ENTREGA
  FROM MARCOS M
),
CLASS AS (
  SELECT D.*,
    ${estadoDaEtapa('D.DT_CRIACAO', 'D.META_ANALISE_DIAS', 'D.DT_ENVIO', 'D.DIAS_ANALISE')} AS STATUS_ANALISE,
    ${estadoDaEtapa('D.DT_ENVIO', 'D.META_FATURAMENTO_DIAS', 'D.DT_PRIMEIRA_NF', 'D.DIAS_FATURAMENTO')} AS STATUS_FATURAMENTO,
    ${estadoDaEtapa('D.DT_PRIMEIRA_NF', 'D.META_ENTREGA_DIAS', 'D.DT_ENTREGA', 'D.DIAS_ENTREGA')} AS STATUS_ENTREGA,
    CASE
      WHEN D.DT_AGENDA = ''          THEN 'sem_agenda'
      WHEN D.DT_ENVIO_EFETIVO <> ''  THEN CASE WHEN D.DT_ENVIO_EFETIVO <= D.DT_AGENDA
                                               THEN 'no_planejado' ELSE 'enviada_com_atraso' END
      WHEN ${HOJE} > D.DT_AGENDA     THEN 'pendente_atrasada'
      ELSE 'pendente'
    END AS STATUS_AGENDA,
    CASE WHEN D.DT_AGENDA = '' THEN NULL
         ELSE GREATEST(0, DATEDIFF(CASE WHEN D.DT_ENVIO_EFETIVO <> '' THEN D.DT_ENVIO_EFETIVO
                                        ELSE ${HOJE} END, D.DT_AGENDA)) END AS DIAS_ATRASO_AGENDA
  FROM DIAS D
),
FINAL AS (
  SELECT X.*,
    CASE
      WHEN X.STATUS_ANALISE = 'vencida'                                       THEN 'atrasado_compras'
      WHEN X.STATUS_FATURAMENTO = 'vencida' OR X.STATUS_ENTREGA = 'vencida'   THEN 'atrasado_fornecedor'
      WHEN X.CONCLUIDO = 1                                                    THEN 'concluido'
      WHEN X.STATUS_ANALISE = 'atencao' OR X.STATUS_FATURAMENTO = 'atencao'
           OR X.STATUS_ENTREGA = 'atencao'                                    THEN 'atencao'
      ELSE 'no_prazo'
    END AS SLA_STATUS,
    ROUND((
        ${notaDaEtapa('X.DIAS_ANALISE', 'X.META_ANALISE_DIAS')}
      + ${notaDaEtapa('X.DIAS_FATURAMENTO', 'X.META_FATURAMENTO_DIAS')}
      + ${notaDaEtapa('X.DIAS_ENTREGA', 'X.META_ENTREGA_DIAS')}
    ) / GREATEST(
        ${contaEtapa('X.DIAS_ANALISE', 'X.META_ANALISE_DIAS')}
      + ${contaEtapa('X.DIAS_FATURAMENTO', 'X.META_FATURAMENTO_DIAS')}
      + ${contaEtapa('X.DIAS_ENTREGA', 'X.META_ENTREGA_DIAS')}, 1)) AS SLA_SCORE
  FROM CLASS X
)`;
}

// Filtros DO LADO DE FORA da CTE (nunca dentro: os KPIs precisam do conjunto
// inteiro para o total do topo bater com o da lista — C-013).
const FILTROS_SLA = `WHERE ('{{fase}}' = '' OR L.FASE_CHAVE = '{{fase}}')
  AND ('{{soVencidos}}' = '' OR L.SLA_STATUS IN ('atrasado_compras', 'atrasado_fornecedor'))`;

/* ─────────────── leituras — prazo dos pedidos (7908-7911) ─────────────── */

const SQL_SLA_KPIS = `${pedidosCte()}
SELECT COUNT(*) AS TOTAL,
  SUM(CASE WHEN L.SLA_STATUS = 'no_prazo' THEN 1 ELSE 0 END)             AS NO_PRAZO,
  SUM(CASE WHEN L.SLA_STATUS = 'atencao' THEN 1 ELSE 0 END)              AS ATENCAO,
  SUM(CASE WHEN L.SLA_STATUS = 'atrasado_compras' THEN 1 ELSE 0 END)     AS ATRASADOS_COMPRAS,
  SUM(CASE WHEN L.SLA_STATUS = 'atrasado_fornecedor' THEN 1 ELSE 0 END)  AS ATRASADOS_FORNECEDOR,
  SUM(CASE WHEN L.SLA_STATUS = 'concluido' THEN 1 ELSE 0 END)            AS CONCLUIDOS,
  SUM(CASE WHEN L.STATUS_AGENDA IN ('enviada_com_atraso', 'pendente_atrasada') THEN 1 ELSE 0 END) AS FORA_DA_AGENDA,
  ROUND(AVG(L.SLA_SCORE), 1) AS SCORE_MEDIO
FROM FINAL L
${FILTROS_SLA}`;

const SQL_SLA_LISTAR = `${pedidosCte()}
SELECT L.CARD_ID, L.TITULO, L.FASE_CHAVE, L.FASE_NOME, L.CONCLUIDO,
  L.CODFORNEC, L.FORNECEDOR, L.CODFILIAL, L.FILIAL, L.NUMPED_WINTHOR,
  L.VL_TOTAL, L.PERC_FATURADO, L.QTD_NFS,
  L.DT_CRIACAO, L.DT_ENVIO, L.DT_PRIMEIRA_NF, L.DT_ENTREGA, L.DT_CONCLUSAO, L.DT_AGENDA,
  L.DIAS_ANALISE, L.META_ANALISE_DIAS, L.STATUS_ANALISE,
  L.DIAS_FATURAMENTO, L.META_FATURAMENTO_DIAS, L.STATUS_FATURAMENTO,
  L.DIAS_ENTREGA, L.META_ENTREGA_DIAS, L.META_ENTREGA_TIPO, L.STATUS_ENTREGA,
  L.STATUS_AGENDA, L.DIAS_ATRASO_AGENDA, L.SLA_STATUS, L.SLA_SCORE
FROM FINAL L
${FILTROS_SLA}
ORDER BY FIELD(L.SLA_STATUS, 'atrasado_compras', 'atrasado_fornecedor', 'atencao', 'no_prazo', 'concluido'),
         L.DT_CRIACAO DESC, L.CARD_ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_SLA_LISTAR_TOTAL = `${pedidosCte()}
SELECT COUNT(*) AS TOTAL FROM FINAL L
${FILTROS_SLA}`;

// D-006: a passagem seguinte sai de `MIN(M2.ID) … M2.ID > M.ID`, não de LEAD()
// — `KB_MOVIMENTO.ID` é autoincremento e as passagens nascem em ordem, então o
// ID É a linha do tempo, e o dialeto do simulador não tem função de janela.
const PROXIMA_PASSAGEM = `LEFT JOIN KB_MOVIMENTO PROX
       ON PROX.ID = (SELECT MIN(M2.ID) FROM KB_MOVIMENTO M2
                      WHERE M2.CARD_ID = M.CARD_ID AND M2.ID > M.ID)`;
const DIAS_NA_PASSAGEM = `GREATEST(0, DATEDIFF(
    COALESCE(NULLIF(${dia('PROX.QUANDO')}, ''), ${HOJE}), ${dia('M.QUANDO')}))`;

const SQL_SLA_PEDIDO_FASES = `SELECT M.ID, M.PARA_FASE_ID AS FASE_ID,
  COALESCE(SF.CHAVE, '') AS FASE_CHAVE, COALESCE(KF.NOME, '') AS FASE_NOME,
  ${dia('M.QUANDO')} AS DT_ENTRADA,
  COALESCE(NULLIF(${dia('PROX.QUANDO')}, ''), '') AS DT_SAIDA,
  ${DIAS_NA_PASSAGEM} AS DIAS_NA_FASE
FROM KB_MOVIMENTO M
JOIN KB_CARD C       ON C.ID = M.CARD_ID AND C.EXCLUIDO_EM IS NULL
LEFT JOIN KB_FASE KF ON KF.ID = M.PARA_FASE_ID
LEFT JOIN SGC_FASE SF ON SF.FASE_ID = M.PARA_FASE_ID AND SF.BOARD_ID = C.BOARD_ID
${PROXIMA_PASSAGEM}
WHERE M.CARD_ID = {{idCard}}
  ${RECORTE_RESTRITO}
ORDER BY M.ID`;

/* ─────────────── leituras — indicadores (7901-7906) ─────────────── */

// As duas condições que o topo e o bloco compartilham, escritas UMA vez: é
// isso que faz o KPI bater com a lista do bloco (C-001).
const CONDICAO_ABERTO = `COALESCE(SF.CHAVE, '') NOT IN ('concluido', 'cancelado')`;
const CONDICAO_AGENDA_ATRASADA = `A.ATIVO = 1
    AND A.DATA_ANALISE BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
    AND A.DATA_ANALISE < ${HOJE}
    AND COALESCE(A.DATA_ENVIO_REAL, '') = ''
    AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO PG
                    WHERE PG.ID_AGENDA = A.ID AND COALESCE(PG.DT_ENVIO, '') <> '')`;

const DE_PEDIDO = `FROM SGC_PEDIDO P
   JOIN KB_CARD C        ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL
   LEFT JOIN SGC_FASE SF ON SF.FASE_ID = C.FASE_ID AND SF.BOARD_ID = C.BOARD_ID`;
const RECORTE_PEDIDO = `('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
     AND ${dia('P.CRIADO_EM')} BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
     ${RECORTE_RESTRITO}`;

// D-005: "nota atrasada" é o MESMO critério de `sgcNfsEmAtraso` (006) — nota
// sem recebimento cuja previsão (emissão + prazo do fornecedor, úteis ou
// corridos) já passou. O add-012 não reescreve a conta: usa os mesmos
// fragmentos de `backend/lib/dias-uteis.mjs` sobre as mesmas colunas.
const PREVISAO_NF = `CASE
      WHEN TRIM(COALESCE(N.DT_EMISSAO, '')) = '' OR COALESCE(FN.PRAZO_ENTREGA_DIAS, 0) <= 0 THEN ''
      WHEN COALESCE(FN.PRAZO_ENTREGA_TIPO, 'corridos') = 'uteis'
        THEN ${somarDiasUteis('N.DT_EMISSAO', 'FN.PRAZO_ENTREGA_DIAS')}
      ELSE ${somarDiasCorridos('N.DT_EMISSAO', 'FN.PRAZO_ENTREGA_DIAS')}
    END`;

const SQL_IND_RESUMO = `SELECT
  (SELECT COUNT(*) ${DE_PEDIDO}
    WHERE ${CONDICAO_ABERTO} AND ${RECORTE_PEDIDO}) AS PEDIDOS_ABERTOS,
  (SELECT COALESCE(SUM(COALESCE(P.VL_TOTAL, 0)), 0) ${DE_PEDIDO}
    WHERE ${CONDICAO_ABERTO} AND ${RECORTE_PEDIDO}) AS VL_ABERTO,
  (SELECT COUNT(*) FROM SGC_AGENDA A
    LEFT JOIN KB_CARD C ON C.ID = A.ID_CARD_GERADO AND C.EXCLUIDO_EM IS NULL
    WHERE ${CONDICAO_AGENDA_ATRASADA}
      AND ('{{codfilial}}' = '' OR A.CODFILIAL = '{{codfilial}}')
      ${RECORTE_RESTRITO}) AS ENVIOS_ATRASADOS,
  (SELECT COUNT(*) ${DE_PEDIDO}
    WHERE COALESCE(SF.CHAVE, '') IN ('enviado', 'transito', 'faturamento', 'bo')
      AND COALESCE(P.DT_ENVIO, '') <> '' AND COALESCE(P.PERC_FATURADO_VALOR, 0) < 100
      AND ${RECORTE_PEDIDO}) AS FATURAMENTOS_PENDENTES,
  (SELECT COUNT(*) FROM SGC_NF N
    JOIN KB_CARD C ON C.ID = N.ID_CARD AND C.EXCLUIDO_EM IS NULL
    LEFT JOIN SGC_FORNECEDOR FN ON FN.CODFORNEC = N.CODFORNEC
    WHERE COALESCE(N.DT_RECEBIMENTO, '') = ''
      AND ${PREVISAO_NF} <> '' AND ${PREVISAO_NF} < ${HOJE}
      AND ('{{codfilial}}' = '' OR COALESCE(N.CODFILIAL, '') = '{{codfilial}}')
      ${RECORTE_RESTRITO}) AS NFS_ATRASADAS,
  (SELECT COUNT(*) FROM SGC_BO_ITEM B
    JOIN KB_CARD C    ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
    LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = B.ID_CARD
    WHERE B.STATUS = 'aberto'
      AND ('{{codfilial}}' = '' OR COALESCE(P.CODFILIAL, '') = '{{codfilial}}')
      ${RECORTE_RESTRITO}) AS ITENS_BO,
  (SELECT COUNT(DISTINCT P.CODFORNEC) ${DE_PEDIDO}
    WHERE ${CONDICAO_ABERTO} AND ${RECORTE_PEDIDO}) AS FORNECEDORES_COM_PEDIDO
FROM DUAL`;

// D-002: forma diferente de `sgcIndResumo` (uma linha por fase, não uma linha
// de escalares), por isso SF própria. Parte de SGC_FASE para as 10 virem,
// inclusive as vazias — por isso o recorte vive nas condições do LEFT JOIN.
const SQL_IND_PEDIDOS_POR_FASE = `SELECT SF.CHAVE AS FASE_CHAVE, COALESCE(KF.NOME, '') AS FASE_NOME, SF.ORDEM,
  COUNT(P.ID_CARD) AS QTD, COALESCE(SUM(COALESCE(P.VL_TOTAL, 0)), 0) AS VL_TOTAL
FROM SGC_FASE SF
LEFT JOIN KB_FASE KF ON KF.ID = SF.FASE_ID
LEFT JOIN KB_CARD C  ON C.FASE_ID = SF.FASE_ID AND C.BOARD_ID = SF.BOARD_ID AND C.EXCLUIDO_EM IS NULL
                     ${RECORTE_RESTRITO}
LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
                     AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
                     AND ${dia('P.CRIADO_EM')} BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
GROUP BY SF.CHAVE, COALESCE(KF.NOME, ''), SF.ORDEM
ORDER BY SF.ORDEM`;

const SQL_IND_AGENDA_ATRASOS = `SELECT A.ID AS ID_AGENDA, A.CODFORNEC, COALESCE(A.FORNECEDOR, '') AS FORNECEDOR,
  COALESCE(A.CODFILIAL, '') AS CODFILIAL, COALESCE(A.FILIAL, '') AS FILIAL,
  A.DATA_ANALISE AS DATA_PLANEJADA,
  COALESCE(NULLIF(${dia('A.DATA_ENVIO_REAL')}, ''), '') AS DATA_ENVIO,
  GREATEST(0, DATEDIFF(${HOJE}, A.DATA_ANALISE)) AS DIAS_ATRASO,
  'pendente_atrasada' AS STATUS_PRAZO,
  COALESCE(A.ID_CARD_GERADO, 0) AS ID_CARD
FROM SGC_AGENDA A
LEFT JOIN KB_CARD C ON C.ID = A.ID_CARD_GERADO AND C.EXCLUIDO_EM IS NULL
WHERE ${CONDICAO_AGENDA_ATRASADA}
  AND ('{{codfilial}}' = '' OR A.CODFILIAL = '{{codfilial}}')
  ${RECORTE_RESTRITO}
ORDER BY A.DATA_ANALISE, A.ID
LIMIT {{limite}}`;

// C-9/R-026: SGC_BO_ITEM não guarda valor — o pendente em reais é a quantidade
// parada vezes o custo do item do pedido. Item sem par em SGC_PEDIDO_ITEM
// (produto que saiu do pedido depois de entrar em B.O.) entra com custo 0 e
// continua contado em ITENS_ABERTOS: some do valor, nunca da fila.
const SQL_IND_PRODUTOS_BO = `SELECT COALESCE(P.CODFORNEC, 0) AS CODFORNEC,
  MAX(COALESCE(P.FORNECEDOR, '')) AS FORNECEDOR,
  COUNT(*) AS ITENS_ABERTOS,
  COALESCE(SUM(COALESCE(B.QT_PENDENTE, 0)), 0) AS QT_PENDENTE,
  COALESCE(SUM(COALESCE(B.QT_PENDENTE, 0) * COALESCE(I.PRECO_CUSTO, 0)), 0) AS VL_PENDENTE,
  COUNT(DISTINCT B.ID_CARD) AS CARDS
FROM SGC_BO_ITEM B
JOIN KB_CARD C      ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
JOIN SGC_PEDIDO P   ON P.ID_CARD = B.ID_CARD
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD
WHERE B.STATUS = 'aberto'
  AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
  ${RECORTE_RESTRITO}
GROUP BY COALESCE(P.CODFORNEC, 0)
ORDER BY VL_PENDENTE DESC, ITENS_ABERTOS DESC, CODFORNEC
LIMIT {{limite}}`;

// Agrupa por CODFORNEC, nunca pelo par (código, nome): o mesmo fornecedor
// aparece em SGC_PEDIDO com grafias diferentes (a capa guarda o nome do dia em
// que o pedido nasceu), e agrupar pelo nome partiria o fornecedor em vários.
const SQL_IND_PERFIL_FORNECEDOR = `${pedidosCte()}
SELECT L.CODFORNEC, MAX(L.FORNECEDOR) AS FORNECEDOR, COUNT(*) AS QTD_PEDIDOS,
  ROUND(AVG(L.DIAS_ANALISE), 1)     AS MEDIA_ANALISE,
  ROUND(AVG(L.DIAS_FATURAMENTO), 1) AS MEDIA_FATURAMENTO,
  ROUND(AVG(L.DIAS_ENTREGA), 1)     AS MEDIA_ENTREGA,
  ROUND(100.0 * SUM(CASE WHEN L.SLA_STATUS IN ('no_prazo', 'concluido') THEN 1 ELSE 0 END) / COUNT(*), 1) AS PERC_NO_PRAZO,
  ROUND(AVG(L.SLA_SCORE), 1) AS SCORE_MEDIO
FROM FINAL L
GROUP BY L.CODFORNEC
ORDER BY QTD_PEDIDOS DESC, L.CODFORNEC
LIMIT {{limite}}`;

const SQL_IND_LEAD_TIME = `SELECT COALESCE(SF.CHAVE, '') AS FASE_CHAVE, COALESCE(KF.NOME, '') AS FASE_NOME,
  COALESCE(SF.ORDEM, 0) AS ORDEM, COUNT(*) AS PASSAGENS,
  ROUND(AVG(${DIAS_NA_PASSAGEM}), 1) AS DIAS_MEDIA
FROM KB_MOVIMENTO M
JOIN KB_CARD C      ON C.ID = M.CARD_ID AND C.EXCLUIDO_EM IS NULL
JOIN SGC_PEDIDO P   ON P.ID_CARD = C.ID
LEFT JOIN KB_FASE KF ON KF.ID = M.PARA_FASE_ID
LEFT JOIN SGC_FASE SF ON SF.FASE_ID = M.PARA_FASE_ID AND SF.BOARD_ID = C.BOARD_ID
${PROXIMA_PASSAGEM}
WHERE ${dia('M.QUANDO')} BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
  AND ('{{codfilial}}' = '' OR P.CODFILIAL = '{{codfilial}}')
  ${RECORTE_RESTRITO}
GROUP BY COALESCE(SF.CHAVE, ''), COALESCE(KF.NOME, ''), COALESCE(SF.ORDEM, 0)
ORDER BY ORDEM`;

/* ─────────────── leituras — solicitações (7912-7913) ─────────────── */

// RN-010: a régua da situação NÃO é escrita aqui — vem do arquivo da 008 pelo
// loader da base (R-074). O contrato de composição (R-075) fixa os quatro
// aliases e os três LEFT JOIN obrigatórios, nesta ordem: o CASE lê C.ID (card
// excluído ou ausente -> sem_pedido), SF.CHAVE e I.STATUS.
const SITUACAO = fragmento('situacao-solicitacao.sql');

const SOLICITACOES_CTE = `WITH SOL AS (
  SELECT S.ID, S.STATUS, S.CRIADO_POR, S.CRIADO_EM, S.AVALIADO_EM,
    ${SITUACAO} AS SITUACAO
  FROM SGC_SOLICITACAO S
  LEFT JOIN KB_CARD C   ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
  LEFT JOIN SGC_FASE SF ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID
  LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD
                             AND COALESCE(I.STATUS, '') <> 'removido'
  WHERE ('{{codfilial}}' = '' OR S.CODFILIAL = '{{codfilial}}')
    AND ${dia('S.CRIADO_EM')} BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
)`;

// Nenhum filtro de persona: solicitação não é card, e o comercial não abre
// esta tela (R-061).
const TEMPO_ATE_AVALIACAO = `CASE WHEN COALESCE(T.AVALIADO_EM, '') = '' THEN NULL
      ELSE GREATEST(0, DATEDIFF(${dia('T.AVALIADO_EM')}, ${dia('T.CRIADO_EM')})) END`;

// R-076/D-015: o funil agrega pelo PAR `STATUS × SITUACAO`. A régua devolve
// `sem_pedido` para pendente, recusada, cancelada E aprovada-na-fila: com uma
// dimensão só, "esperando avaliação" e "recusada" viram a mesma barra e a
// aderência de fluxo fica impossível de calcular.
const SQL_SOLICITACOES_FUNIL = `${SOLICITACOES_CTE}
SELECT T.STATUS, T.SITUACAO, COUNT(*) AS QTD,
  SUM(CASE WHEN COALESCE(T.AVALIADO_EM, '') <> '' THEN 1 ELSE 0 END) AS QTD_AVALIADAS,
  ROUND(AVG(${TEMPO_ATE_AVALIACAO}), 1) AS TEMPO_MEDIO_AVALIACAO_DIAS
FROM SOL T
GROUP BY T.STATUS, T.SITUACAO
ORDER BY T.SITUACAO, T.STATUS`;

// R-052: o vendedor É quem registra a solicitação; não existe coluna de nome.
// R-057: nenhuma coluna de valor em reais — o ranking é por contagem.
const SQL_SOLICITACOES_POR_VENDEDOR = `${SOLICITACOES_CTE}
SELECT COALESCE(T.CRIADO_POR, 0) AS USUARIO_ID,
  COALESCE(NULLIF(TRIM(IU.NOME), ''), 'Sem vendedor') AS VENDEDOR,
  COUNT(*) AS TOTAL,
  SUM(CASE WHEN T.STATUS = 'pendente' THEN 1 ELSE 0 END)          AS PENDENTES,
  SUM(CASE WHEN T.STATUS = 'recusada' THEN 1 ELSE 0 END)          AS RECUSADAS,
  SUM(CASE WHEN T.SITUACAO = 'atendida' THEN 1 ELSE 0 END)        AS ATENDIDAS,
  SUM(CASE WHEN T.SITUACAO = 'nao_atendida' THEN 1 ELSE 0 END)    AS NAO_ATENDIDAS,
  SUM(CASE WHEN T.SITUACAO NOT IN ('atendida', 'nao_atendida', 'sem_pedido') THEN 1 ELSE 0 END) AS EM_FLUXO,
  ROUND(100.0 * SUM(CASE WHEN T.SITUACAO = 'atendida' THEN 1 ELSE 0 END) / COUNT(*), 1) AS ADERENCIA_PCT,
  ROUND(AVG(${TEMPO_ATE_AVALIACAO}), 1) AS TEMPO_MEDIO_AVALIACAO_DIAS
FROM SOL T
LEFT JOIN INT_USER IU ON IU.ID = T.CRIADO_POR
GROUP BY COALESCE(T.CRIADO_POR, 0), COALESCE(NULLIF(TRIM(IU.NOME), ''), 'Sem vendedor')
ORDER BY TOTAL DESC, USUARIO_ID
LIMIT {{limite}}`;

/* ─────────────── leitura — WinThor (Oracle, 7907) ─────────────── */

// RN-012: CODFILIAL entra SEM `OR ''` — essa comparação casa entrada com saída
// por filial e não existe consolidada; sem filial a consulta devolve zero
// linhas de propósito, e é a tela que garante uma (R-057).
// D-004: a venda de licitação aparece em COLUNA PRÓPRIA em vez de sumir da
// conta; a lista de atividades é a mesma de `sgcWintAnaliseMontagem` (003, AN-04).
const SQL_WINT_COMPRAS_VS_VENDAS = `SELECT * FROM (
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
) WHERE ROWNUM <= {{limite}}`;

/* ─────────────── a lista publicada ─────────────── */

export const definitions = [
  { name: 'sgcIndResumo', type: 'SQL', code: SQL_IND_RESUMO, description: 'RF-001/C-001 - os sete números do topo do painel, numa linha só (pedidos abertos, valor, envios atrasados, faturamentos pendentes, notas atrasadas, itens em B.O., fornecedores). Params: codfilial string, dataInicio string (obrigatorio), dataFim string (obrigatorio), hoje string' },
  { name: 'sgcIndPedidosPorFase', type: 'SQL', code: SQL_IND_PEDIDOS_POR_FASE, description: 'RF-001/C-001 - uma linha por fase do quadro (as 10, inclusive as vazias) com quantidade e valor. Params: codfilial string, dataInicio string (obrigatorio), dataFim string (obrigatorio)' },
  { name: 'sgcIndAgendaAtrasos', type: 'SQL', code: SQL_IND_AGENDA_ATRASOS, description: 'RF-013/C-001 - agendamentos de analise ativos com a data ja passada e sem envio. Params: codfilial string, dataInicio, dataFim (obrigatorios), hoje string, limite int' },
  { name: 'sgcIndProdutosBo', type: 'SQL', code: SQL_IND_PRODUTOS_BO, description: 'RF-025/C-001 - itens em B.O. abertos agregados por fornecedor, com o pendente em reais pelo PRECO_CUSTO do item. Params: codfilial string, limite int' },
  { name: 'sgcIndPerfilFornecedor', type: 'SQL', code: SQL_IND_PERFIL_FORNECEDOR, description: 'RF-025/C-026 - pedidos, media por etapa, percentual no prazo e nota media por fornecedor, sobre a mesma cadeia de CTEs do SLA. Params: codfilial, codfornec, dataInicio, dataFim (obrigatorios), busca, hoje, limite' },
  { name: 'sgcIndLeadTime', type: 'SQL', code: SQL_IND_LEAD_TIME, description: 'RF-025/C-027 - passagens e media de dias por fase do processo, no periodo. Params: codfilial string, dataInicio, dataFim (obrigatorios), hoje string' },
  { name: 'sgcWintComprasVsVendas', type: 'SQL', code: SQL_WINT_COMPRAS_VS_VENDAS, description: 'RF-006/C-006 - comprado x vendido por fornecedor no WinThor, com a venda de licitacao em coluna propria. Filial OBRIGATORIA (RN-012). Params: codfilial string, dataInicio, dataFim, limite int' },
  { name: 'sgcSlaPedidosKpis', type: 'SQL', code: SQL_SLA_KPIS, description: 'RF-012/C-013 - os oito KPIs de prazo, da MESMA cadeia de CTEs da listagem. Params: codfilial, codfornec, dataInicio, dataFim (obrigatorios), busca, hoje, fase, soVencidos' },
  { name: 'sgcSlaPedidosListar', type: 'SQL', code: SQL_SLA_LISTAR, description: 'RF-007..RF-010/C-007..C-011 - um pedido por linha com os marcos, as metas, os tres estados, a aderencia a agenda, o SLA e a nota. Params: os mesmos + fase, soVencidos, limite, offset' },
  { name: 'sgcSlaPedidosListarTotal', type: 'SQL', code: SQL_SLA_LISTAR_TOTAL, description: 'RF-012/RNF-002 - total da mesma listagem, para a paginacao. Params: os mesmos filtros' },
  { name: 'sgcSlaPedidoFases', type: 'SQL', code: SQL_SLA_PEDIDO_FASES, description: 'RF-014/C-015 - a linha do tempo do pedido: uma linha por passagem, com entrada, saida e dias na fase (a ultima contada ate hoje). Params: idCard int, hoje string' },
  { name: 'sgcSolicitacoesFunil', type: 'SQL', code: SQL_SOLICITACOES_FUNIL, description: 'RF-015/C-016 - funil das solicitacoes por PAR status x situacao (R-076), com avaliadas e tempo medio. Params: codfilial string, dataInicio, dataFim (obrigatorios)' },
  { name: 'sgcSolicitacoesPorVendedor', type: 'SQL', code: SQL_SOLICITACOES_POR_VENDEDOR, description: 'RF-016/C-017 - ranking por vendedor solicitante, por CONTAGEM (sem valor em reais). Params: codfilial string, dataInicio, dataFim (obrigatorios), limite int' },
];

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const projectId = Number(process.env.MITRA_PROJECT_ID);
  const jdbcId = await jdbcIdWinthor(projectId);

  const lista = (await sdk.listServerFunctionsMitra({ projectId })).result ?? [];
  const existentes = new Map(lista.map((f) => [f.name, f.id]));

  // Publicação em UM passo: esta spec não tem JAVASCRIPT, então nenhuma
  // definição precisa do id real de outra (R-016).
  for (const definicao of definitions) {
    const corpo = {
      projectId,
      name: definicao.name,
      type: definicao.type,
      code: definicao.code,
      description: definicao.description,
      ...(WINTHOR.includes(definicao.name) ? { jdbcId } : {}),
    };
    const id = existentes.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }

  console.log(`Pronto: ${definitions.length} server functions da spec 009 (indicadores).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
