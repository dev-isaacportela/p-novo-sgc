// add-015 — Server Functions da spec 013 (movimentação de produtos): os cinco
// recortes do estoque por filial lidos do WinThor — sem venda, excedentes, a
// vencer, alerta de ruptura e perdas (com o rastro do lote) — e o plano de ação
// por aba + produto + filial. Ver docs/specs/013-movimentacao-produtos/.
//
// Faixa de id local: 83xx (R-133 do 000) — leituras 8301-8309 no WinThor
// (sgcWintDepartamentos, sgcWintMovSemVenda, sgcWintMovExcedentes,
// sgcWintMovAVencer, sgcWintMovRuptura, sgcWintMovRupturaFiliais,
// sgcWintMovPerdas, sgcWintMovPerdasFiliais, sgcWintMovLoteHistorico),
// 8310-8311 no banco do projeto (sgcMovPlanosListar, sgcMovPlanosResumo) e
// escritas 8350-8351 (sgcEscMovPlanoSalvar, sgcEscMovPlanoExcluir).
//
// Nenhuma definição é JAVASCRIPT e nenhuma tem cron: a classificação do
// excedente (curva + régua de cobertura) é regra pura da tela
// (`lib/movimentacao.ts`, com `curvaPorValor` e `limiteDeCobertura`), e as duas
// escritas são chamadas direto da tela, com `:VAR_USER`.
//
// A venda que conta é UMA: o recorte da R-131, importado do add-013 (não
// copiado), sem o público — RN-002 da spec. O SQL do WinThor segue as regras
// de portabilidade do plan (D-001): roda igual no Oracle e no simulador.
//
// A tabela `SGC_MOV_PLANO` está no `setup-backend.mjs` (DDL_013).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-015-movimentacao.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { PUBLICO, REMESSA_FUTURA, VENDA_VALIDA } from './add-013-compras-inteligentes.mjs';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintDepartamentos', 'sgcWintMovSemVenda', 'sgcWintMovExcedentes',
  'sgcWintMovAVencer', 'sgcWintMovRuptura', 'sgcWintMovRupturaFiliais', 'sgcWintMovPerdas',
  'sgcWintMovPerdasFiliais', 'sgcWintMovLoteHistorico'];

/* ──────────────────────────────────────────────────────────────────────────
   A guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente de
   add-013/add-014; só a lista de personas muda. `:VAR_USER` vale porque as
   duas escritas são chamadas direto da tela.
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas) {
  const lista = personas.map((p) => `'${p}'`).join(', ');
  return `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = :VAR_USER
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN (${lista})
  )`;
}

/** RN-011: quem grava plano de ação — o comercial não, e READ_ONLY nunca. */
const PLANO = ['admin', 'analista', 'gestor', 'diretoria'];

/* ─────────────── fragmentos do WinThor ─────────────── */

/**
 * RN-002: a venda que conta nesta tela — a VENDA_VALIDA da R-131 (sem venda
 * entre filiais e sem remessa de entrega futura) e não cancelada; o público
 * (ramos 11-15) fica fora POR PADRÃO, como na 011, e `{{incluirPublico}}` = 1
 * o devolve (P-08: no WinThor real, produto vendido só a órgão público aparecia
 * "sem venda"). Exige `PCMOV M` com `LEFT JOIN PCCLIENT C`.
 */
const VENDA_MOV = `(M.DTCANCEL IS NULL AND ${VENDA_VALIDA} AND ({{incluirPublico}} = 1 OR NOT ${PUBLICO}))`;

/** RN-001: produto de venda — sem marca de inativo e fora dos departamentos 4 e 7. */
const PRODUTO_ATIVO = `(NVL(LENGTH(TRIM(P.OBS2)), 0) = 0 AND NVL(P.CODEPTO, 0) NOT IN (4, 7))`;

/** Entradas de origem do lote (RN-017): a transferência (ET) NÃO é origem. */
const OPER_ORIGEM = `'E', 'EA', 'EB', 'ED', 'EI', 'ER', 'EN'`;

// D-001 f: o '' é nulo no Oracle e não é no SQLite — a disjunção vale nos dois.
const filtroFilial = (coluna) => `('{{codfilial}}' IS NULL OR '{{codfilial}}' = '' OR ${coluna} = '{{codfilial}}')`;
const FILTRO_FORNEC = '({{codfornec}} = 0 OR P.CODFORNEC = {{codfornec}})';
const FILTRO_DEPTO = '({{codepto}} = 0 OR P.CODEPTO = {{codepto}})';
// 3A-1: concatenação, nunca '%{{busca}}%' (o apóstrofo quebraria a consulta).
const BUSCA_PRODUTO = `(UPPER(P.DESCRICAO) LIKE '%' || UPPER('{{busca}}') || '%' OR TO_CHAR(P.CODPROD) = '{{busca}}')`;
const BUSCA_LOTE = `(${BUSCA_PRODUTO} OR UPPER(TRIM(L.NUMLOTE)) = UPPER(TRIM('{{busca}}')))`;

/**
 * D-001 a: paginação que o Oracle e o SQLite entendem — nem OFFSET/FETCH nem
 * LIMIT. Os totais analíticos (COUNT(*) OVER ()) são calculados ANTES do corte.
 * `ordem` termina sempre numa chave única, para a página não trocar linhas.
 */
function paginar(sql, ordem) {
  return `SELECT * FROM (
  SELECT X.*, ROW_NUMBER() OVER (ORDER BY ${ordem}) AS RN
  FROM (
${sql}
  ) X
) WHERE RN > {{offset}} AND RN <= {{offset}} + {{limite}}
ORDER BY RN`;
}

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

const SQL_DEPARTAMENTOS = `SELECT D.CODEPTO, D.DESCRICAO
FROM PCDEPTO D
WHERE D.CODEPTO > 0 AND D.CODEPTO <> 9999
ORDER BY D.DESCRICAO`;

// RF-006 (legado 2830). Última venda e última entrada saem do movimento (RN-003),
// nunca de PCEST.DTULTSAIDA — que volta só como referência do ERP. Dias até hoje
// por FLOOR(col - TRUNC(SYSDATE)) (D-001 c): o mesmo que TRUNC(col) - TRUNC(SYSDATE).
const SQL_SEM_VENDA = paginar(`SELECT P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, F.FORNECEDOR,
  P.CODEPTO, D.DESCRICAO AS DEPARTAMENTO, E.CODFILIAL,
  NVL(E.QTEST, 0) AS ESTOQUE_ATUAL,
  NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA,
  ROUND(NVL(E.QTEST, 0) * NVL(E.CUSTOULTENT, 0), 2) AS VALOR_PARADO,
  TO_CHAR(ENT.DT_ULT_ENTRADA, 'YYYY-MM-DD') AS DT_ULT_ENTRADA,
  TO_CHAR(VEN.DT_ULT_VENDA, 'YYYY-MM-DD') AS DT_ULT_VENDA,
  TO_CHAR(E.DTULTSAIDA, 'YYYY-MM-DD') AS DT_ULT_SAIDA_ERP,
  CASE WHEN VEN.DT_ULT_VENDA IS NULL THEN NULL ELSE 0 - FLOOR(VEN.DT_ULT_VENDA - TRUNC(SYSDATE)) END AS DIAS_SEM_VENDA,
  CASE WHEN ENT.DT_ULT_ENTRADA IS NULL THEN NULL ELSE 0 - FLOOR(ENT.DT_ULT_ENTRADA - TRUNC(SYSDATE)) END AS DIAS_DESDE_ENTRADA,
  {{janelaDias}} AS JANELA_DIAS,
  COUNT(*) OVER () AS TOTAL_REGISTROS,
  ROUND(SUM(NVL(E.QTEST, 0) * NVL(E.CUSTOULTENT, 0)) OVER (), 2) AS TOTAL_VALOR
FROM PCPRODUT P
JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
LEFT JOIN (
  SELECT M.CODPROD, MAX(M.DTMOV) AS DT_ULT_VENDA
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.CODFILIAL = '{{codfilial}}'
    AND M.DTMOV >= TRUNC(SYSDATE) - {{janelaDias}}
    AND ${VENDA_MOV}
  GROUP BY M.CODPROD
) VEN ON VEN.CODPROD = P.CODPROD
LEFT JOIN (
  SELECT M.CODPROD, MAX(M.DTMOV) AS DT_ULT_ENTRADA
  FROM PCMOV M
  WHERE M.CODFILIAL = '{{codfilial}}'
    AND M.CODOPER = 'E'
    AND M.DTCANCEL IS NULL
    AND M.DTMOV >= TRUNC(SYSDATE) - {{janelaDias}}
  GROUP BY M.CODPROD
) ENT ON ENT.CODPROD = P.CODPROD
WHERE ${PRODUTO_ATIVO}
  AND ({{somenteComEstoque}} = 0 OR NVL(E.QTEST, 0) > 0)
  AND ${FILTRO_FORNEC}
  AND ${FILTRO_DEPTO}
  AND ${BUSCA_PRODUTO}
  AND (VEN.DT_ULT_VENDA IS NULL OR 0 - FLOOR(VEN.DT_ULT_VENDA - TRUNC(SYSDATE)) >= {{diasSemVenda}})`,
'NVL(X.DIAS_SEM_VENDA, 99999) DESC, X.VALOR_PARADO DESC, X.DESCRICAO, X.CODPROD');

// RF-007 (legado 2831). Estoque disponível e trânsito como a sgcWintRessuprimento
// da 011 (R-085, P-03): o trânsito é PRÉ-AGREGADO por produto/filial — a junção
// direta do legado duplicava o produto com dois registros (C-013). Sem paginação
// de verdade: a curva ABC é da população inteira (D-006 da 011) e a tela pagina
// em memória. `ponytail:` teto de {{limite}} (3.000) produtos com giro por
// filial, avisado na tela por TOTAL_REGISTROS (RNF-004).
const SQL_EXCEDENTES = paginar(`SELECT P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, F.FORNECEDOR,
  NVL(P.CODEPTO, 0) AS CODEPTO, D.DESCRICAO AS DEPARTAMENTO, NVL(P.CODSEC, 0) AS CODSEC, E.CODFILIAL,
  GREATEST(0, NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0)) AS ESTOQUE_ATUAL,
  NVL(E.QTPEDIDA, 0) + NVL(T.QTTRANSITO, 0) AS ESTOQUE_EM_TRANSITO,
  NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA,
  V.QT_TOTAL AS VENDA_PERIODO,
  ROUND(V.FATURAMENTO, 2) AS FATURAMENTO_PERIODO,
  {{diasPeriodo}} AS DIAS_PERIODO,
  ROUND(1.0 * V.QT_TOTAL / GREATEST({{diasPeriodo}}, 1), 4) AS CONSUMO_MEDIO_DIARIO,
  ROUND((GREATEST(0, NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0))
         + NVL(E.QTPEDIDA, 0) + NVL(T.QTTRANSITO, 0))
        / (1.0 * V.QT_TOTAL / GREATEST({{diasPeriodo}}, 1)), 2) AS COBERTURA_ATUAL_DIAS,
  COUNT(*) OVER () AS TOTAL_REGISTROS
FROM PCPRODUT P
JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '{{codfilial}}'
LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
LEFT JOIN (
  SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QTTRANSITO
  FROM PCESTTRANSITO
  GROUP BY CODPROD, CODFILIAL
) T ON T.CODPROD = P.CODPROD AND T.CODFILIAL = E.CODFILIAL
JOIN (
  SELECT M.CODPROD, SUM(M.QT) AS QT_TOTAL, SUM(M.QT * NVL(M.PUNIT, 0)) AS FATURAMENTO
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.CODFILIAL = '{{codfilial}}'
    AND M.DTMOV >= TRUNC(SYSDATE) - {{diasPeriodo}}
    AND ${VENDA_MOV}
  GROUP BY M.CODPROD
) V ON V.CODPROD = P.CODPROD AND V.QT_TOTAL > 0
WHERE ${PRODUTO_ATIVO}
  AND NVL(E.QTEST, 0) > 0
  AND ${FILTRO_FORNEC}
  AND ${FILTRO_DEPTO}
  AND ${BUSCA_PRODUTO}`,
'X.COBERTURA_ATUAL_DIAS DESC, X.DESCRICAO, X.CODPROD');

// RF-008..RF-010 (legado 2860). Saldo do lote = PCLOTE.QT (P-01, RN-007). Quem
// bloqueou e quando: o último PCLOTELOG que AUMENTOU o bloqueio (RN-008); a
// matrícula é o 2.º campo de OBSAPLICACAO ('6366:<matricula>'), nome em PCEMPR.
// PCLOTELOG não registra motivo — e esta consulta não inventa um.
const SQL_A_VENCER = paginar(`WITH BLOQ_EVENTO AS (
  SELECT CODFILIAL, CODPROD, NUMLOTE, DATA, PROGRAMA, MATRICULA FROM (
    SELECT PL.CODFILIAL, PL.CODPROD, PL.NUMLOTE, PL.DATA, PL.PROGRAMA,
      CASE WHEN REGEXP_LIKE(REGEXP_SUBSTR(PL.OBSAPLICACAO, '[^:]+', 1, 2), '^[0-9]+$')
           THEN TO_NUMBER(REGEXP_SUBSTR(PL.OBSAPLICACAO, '[^:]+', 1, 2)) END AS MATRICULA,
      ROW_NUMBER() OVER (PARTITION BY PL.CODFILIAL, PL.CODPROD, NVL(PL.NUMLOTE, '-') ORDER BY PL.DATA DESC) AS RN_LOG
    FROM PCLOTELOG PL
    WHERE PL.CODFILIAL = '{{codfilial}}'
      AND NVL(PL.QTBLOQUEADA, 0) > NVL(PL.QTBLOQUEADA_ANT, 0)
  ) WHERE RN_LOG = 1
),
TOTAL_LOTES AS (
  SELECT CODPROD, CODFILIAL, SUM(NVL(QT, 0)) AS QT_TOTAL_LOTES
  FROM PCLOTE
  WHERE NVL(QT, 0) > 0 AND DTEXCLUSAO IS NULL AND CODFILIAL = '{{codfilial}}'
  GROUP BY CODPROD, CODFILIAL
)
SELECT L.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, F.FORNECEDOR, L.CODFILIAL, L.NUMLOTE,
  TO_CHAR(L.DTVALIDADE, 'YYYY-MM-DD') AS DTVALIDADE,
  NVL(L.QT, 0) AS QT_LOTE,
  NVL(L.QTRESERV, 0) AS QT_RESERVADA,
  NVL(L.QTBLOQUEADA, 0) AS QT_BLOQUEADA,
  CASE
    WHEN NVL(L.QTBLOQUEADA, 0) <= 0 THEN 'LIVRE'
    WHEN NVL(L.QTBLOQUEADA, 0) >= NVL(L.QT, 0) THEN 'TOTAL'
    ELSE 'PARCIAL'
  END AS SITUACAO_BLOQUEIO,
  GREATEST(NVL(L.QT, 0) - NVL(L.QTBLOQUEADA, 0) - NVL(L.QTRESERV, 0), 0) AS QT_DISPONIVEL,
  ROUND(NVL(L.QTBLOQUEADA, 0) * NVL(E.CUSTOULTENT, 0), 2) AS VALOR_BLOQUEADO,
  CASE WHEN NVL(L.QTBLOQUEADA, 0) > 0 THEN TO_CHAR(BQ.DATA, 'YYYY-MM-DD') END AS BLOQUEIO_DATA,
  CASE WHEN NVL(L.QTBLOQUEADA, 0) > 0 THEN BQ.PROGRAMA END AS BLOQUEIO_ROTINA,
  CASE WHEN NVL(L.QTBLOQUEADA, 0) > 0 THEN BQ.MATRICULA END AS BLOQUEIO_MATRICULA,
  CASE WHEN NVL(L.QTBLOQUEADA, 0) > 0 THEN FB.NOME END AS BLOQUEIO_RESPONSAVEL,
  NVL(E.QTEST, 0) AS ESTOQUE_PRODUTO,
  NVL(TL.QT_TOTAL_LOTES, 0) AS QT_TOTAL_LOTES,
  CASE WHEN NVL(TL.QT_TOTAL_LOTES, 0) > NVL(E.QTEST, 0) THEN 1 ELSE 0 END AS DIVERGENTE,
  NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA,
  ROUND(NVL(L.QT, 0) * NVL(E.CUSTOULTENT, 0), 2) AS VALOR_EM_RISCO,
  FLOOR(L.DTVALIDADE - TRUNC(SYSDATE)) AS DIAS_PARA_VENCER,
  COUNT(*) OVER () AS TOTAL_REGISTROS,
  ROUND(SUM(NVL(L.QT, 0) * NVL(E.CUSTOULTENT, 0)) OVER (), 2) AS TOTAL_VALOR,
  SUM(CASE WHEN L.DTVALIDADE < TRUNC(SYSDATE) THEN 1 ELSE 0 END) OVER () AS TOTAL_VENCIDOS,
  ROUND(SUM(CASE WHEN L.DTVALIDADE < TRUNC(SYSDATE) THEN NVL(L.QT, 0) * NVL(E.CUSTOULTENT, 0) ELSE 0 END) OVER (), 2) AS TOTAL_VALOR_VENCIDO,
  SUM(CASE WHEN L.DTVALIDADE >= TRUNC(SYSDATE) AND L.DTVALIDADE <= TRUNC(SYSDATE) + 30 THEN 1 ELSE 0 END) OVER () AS TOTAL_ATE_30,
  SUM(CASE WHEN NVL(TL.QT_TOTAL_LOTES, 0) > NVL(E.QTEST, 0) THEN 1 ELSE 0 END) OVER () AS TOTAL_DIVERGENTES,
  SUM(CASE WHEN NVL(L.QTBLOQUEADA, 0) > 0 THEN 1 ELSE 0 END) OVER () AS TOTAL_BLOQUEADOS,
  ROUND(SUM(NVL(L.QTBLOQUEADA, 0) * NVL(E.CUSTOULTENT, 0)) OVER (), 2) AS TOTAL_VALOR_BLOQUEADO
FROM PCLOTE L
JOIN PCPRODUT P ON P.CODPROD = L.CODPROD
LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
LEFT JOIN PCEST E ON E.CODPROD = L.CODPROD AND E.CODFILIAL = L.CODFILIAL
LEFT JOIN BLOQ_EVENTO BQ ON BQ.CODPROD = L.CODPROD AND BQ.CODFILIAL = L.CODFILIAL
  AND NVL(BQ.NUMLOTE, '-') = NVL(L.NUMLOTE, '-')
LEFT JOIN PCEMPR FB ON FB.MATRICULA = BQ.MATRICULA
LEFT JOIN TOTAL_LOTES TL ON TL.CODPROD = L.CODPROD AND TL.CODFILIAL = L.CODFILIAL
WHERE L.CODFILIAL = '{{codfilial}}'
  AND NVL(L.QT, 0) > 0
  AND L.DTEXCLUSAO IS NULL
  AND L.DTVALIDADE IS NOT NULL
  AND L.DTVALIDADE >= TO_DATE('2000-01-01', 'YYYY-MM-DD')
  AND ${PRODUTO_ATIVO}
  AND ${FILTRO_FORNEC}
  AND ${FILTRO_DEPTO}
  AND ${BUSCA_LOTE}
  AND ('{{bloqueio}}' NOT IN ('BLOQUEADOS', 'LIVRES')
       OR ('{{bloqueio}}' = 'BLOQUEADOS' AND NVL(L.QTBLOQUEADA, 0) > 0)
       OR ('{{bloqueio}}' = 'LIVRES' AND NVL(L.QTBLOQUEADA, 0) = 0))
  AND (('{{situacao}}' = 'VENCIDOS' AND L.DTVALIDADE < TRUNC(SYSDATE))
       OR ('{{situacao}}' = 'A_VENCER' AND L.DTVALIDADE >= TRUNC(SYSDATE) AND L.DTVALIDADE <= TRUNC(SYSDATE) + {{diasHorizonte}})
       OR ('{{situacao}}' = 'TODOS' AND L.DTVALIDADE <= TRUNC(SYSDATE) + {{diasHorizonte}}))`,
'X.DTVALIDADE, X.DESCRICAO, X.NUMLOTE, X.CODPROD');

// RF-014 (legado 2943/2944): UMA CTE para a lista e o resumo por filial — os dois
// não podem divergir. Mudanças sobre o legado: a venda é a VENDA_MOV (RN-002);
// a transferência recebida (ET) entra como entrada da janela (P-05); o início
// da análise vem pronto em {{diasTotal}} = janela + base (D-001 c); a marca de
// venda válida é calculada uma vez por movimento (VV), não em cada agregado.
function cteRuptura() {
  return `WITH MOVF AS (
  SELECT M.CODPROD, M.CODFILIAL, M.CODOPER, M.DTMOV, M.QT, M.CODCLI,
    CASE WHEN ${VENDA_MOV} THEN 1 ELSE 0 END AS VV
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.DTCANCEL IS NULL
    AND M.CODOPER IN ('S', 'E', 'ET')
    AND M.QT > 0
    AND M.DTMOV >= TRUNC(SYSDATE) - {{diasTotal}}
    AND ${filtroFilial('M.CODFILIAL')}
),
MOV AS (
  SELECT MF.CODPROD, MF.CODFILIAL,
    SUM(CASE WHEN MF.VV = 1 AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN MF.QT ELSE 0 END) AS QT_VENDA_JANELA,
    SUM(CASE WHEN MF.CODOPER IN ('E', 'ET') AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN MF.QT ELSE 0 END) AS QT_ENTRADA_JANELA,
    SUM(CASE WHEN MF.VV = 1 AND MF.DTMOV < TRUNC(SYSDATE) - {{diasJanela}} THEN MF.QT ELSE 0 END) AS QT_VENDA_BASE,
    MAX(CASE WHEN MF.VV = 1 AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN MF.QT ELSE 0 END) AS QT_MAIOR_SAIDA,
    MIN(CASE WHEN MF.VV = 1 AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN TRUNC(MF.DTMOV) END) AS DT_PRIMEIRA_VENDA,
    MAX(CASE WHEN MF.VV = 1 AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN TRUNC(MF.DTMOV) END) AS DT_ULTIMA_VENDA,
    COUNT(DISTINCT CASE WHEN MF.VV = 1 AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN TRUNC(MF.DTMOV) END) AS DIAS_COM_VENDA,
    COUNT(DISTINCT CASE WHEN MF.VV = 1 AND MF.DTMOV >= TRUNC(SYSDATE) - {{diasJanela}} THEN MF.CODCLI END) AS CLIENTES_JANELA
  FROM MOVF MF
  GROUP BY MF.CODPROD, MF.CODFILIAL
),
BASE AS (
  SELECT E.CODFILIAL, NVL(FIL.RAZAOSOCIAL, E.CODFILIAL) AS FILIAL,
    P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, F.FORNECEDOR,
    NVL(E.QTEST, 0) AS ESTOQUE_ATUAL,
    NVL(E.QTPEDIDA, 0) + NVL(T.QT_TRANSITO, 0) AS QT_TRANSITO,
    NVL(E.CUSTOULTENT, 0) AS CUSTO_UNITARIO,
    TO_CHAR(E.DTULTENT, 'YYYY-MM-DD') AS DT_ULT_ENTRADA,
    MOV.QT_VENDA_JANELA, MOV.QT_ENTRADA_JANELA, MOV.QT_VENDA_BASE, MOV.QT_MAIOR_SAIDA,
    MOV.DT_PRIMEIRA_VENDA, MOV.DT_ULTIMA_VENDA, MOV.DIAS_COM_VENDA, MOV.CLIENTES_JANELA
  FROM MOV
  JOIN PCPRODUT P ON P.CODPROD = MOV.CODPROD
  JOIN PCEST E ON E.CODPROD = MOV.CODPROD AND E.CODFILIAL = MOV.CODFILIAL
  LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
  LEFT JOIN PCFILIAL FIL ON FIL.CODIGO = E.CODFILIAL
  LEFT JOIN (
    SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QT_TRANSITO
    FROM PCESTTRANSITO
    GROUP BY CODPROD, CODFILIAL
  ) T ON T.CODPROD = MOV.CODPROD AND T.CODFILIAL = MOV.CODFILIAL
  WHERE MOV.QT_VENDA_JANELA >= {{vendaMinima}}
    AND MOV.QT_VENDA_JANELA > 0
    AND ({{incluirExcecoes}} = 1 OR ${PRODUTO_ATIVO})
    AND ${FILTRO_FORNEC}
    AND ${FILTRO_DEPTO}
    AND ${BUSCA_PRODUTO}
),
CALC AS (
  SELECT B.*,
    GREATEST(B.ESTOQUE_ATUAL + B.QT_VENDA_JANELA - B.QT_ENTRADA_JANELA, 0) AS ESTOQUE_INICIAL,
    ROUND(1.0 * B.QT_VENDA_JANELA / GREATEST({{diasJanela}}, 1), 4) AS CONSUMO_DIARIO_JANELA,
    ROUND(1.0 * B.QT_VENDA_BASE / GREATEST({{diasBase}}, 1), 4) AS CONSUMO_DIARIO_BASE,
    TRUNC(B.DT_ULTIMA_VENDA - B.DT_PRIMEIRA_VENDA) + 1 AS DIAS_CONSUMO_REAL
  FROM BASE B
),
RISCO AS (
  SELECT C.*,
    CASE WHEN C.ESTOQUE_INICIAL > 0 THEN ROUND(1.0 * C.QT_VENDA_JANELA / C.ESTOQUE_INICIAL * 100, 1) END AS PERC_CONSUMIDO,
    CASE WHEN C.CONSUMO_DIARIO_BASE > 0 THEN ROUND(C.CONSUMO_DIARIO_JANELA / C.CONSUMO_DIARIO_BASE, 2) END AS FATOR_ACELERACAO,
    CASE WHEN C.CONSUMO_DIARIO_JANELA > 0 THEN ROUND(C.ESTOQUE_ATUAL / C.CONSUMO_DIARIO_JANELA, 1) END AS COBERTURA_RITMO_ATUAL,
    CASE WHEN C.CONSUMO_DIARIO_JANELA > 0 THEN ROUND((C.ESTOQUE_ATUAL + C.QT_TRANSITO) / C.CONSUMO_DIARIO_JANELA, 1) END AS COBERTURA_COM_TRANSITO,
    CASE WHEN C.CONSUMO_DIARIO_BASE > 0 THEN ROUND(C.ESTOQUE_ATUAL / C.CONSUMO_DIARIO_BASE, 1) END AS COBERTURA_RITMO_HISTORICO,
    CASE WHEN C.CONSUMO_DIARIO_BASE > 0 THEN ROUND(C.QT_VENDA_JANELA / C.CONSUMO_DIARIO_BASE, 1) END AS DIAS_ESPERADOS
  FROM CALC C
),
ALERTA AS (
  SELECT R.*,
    CASE WHEN R.CONSUMO_DIARIO_BASE > 0 THEN 'COM_HISTORICO' ELSE 'SEM_HISTORICO' END AS ORIGEM_CURVA,
    CASE
      WHEN R.ESTOQUE_ATUAL <= 0 THEN 'RUPTURA'
      WHEN R.COBERTURA_COM_TRANSITO <= {{prazoReposicao}} THEN 'CRITICO'
      WHEN R.COBERTURA_COM_TRANSITO <= 2 * {{prazoReposicao}} THEN 'ALTO'
      ELSE 'MEDIO'
    END AS SEVERIDADE
  FROM RISCO R
  WHERE R.PERC_CONSUMIDO >= {{limiarPerc}}
    AND ((R.CONSUMO_DIARIO_BASE > 0
          AND R.FATOR_ACELERACAO >= {{fatorMinimo}}
          AND R.DIAS_CONSUMO_REAL < R.DIAS_ESPERADOS)
         OR (R.CONSUMO_DIARIO_BASE = 0 AND {{incluirSemHistorico}} = 1))
)`;
}

const SQL_RUPTURA = paginar(`${cteRuptura()}
SELECT A.*,
  GREATEST(CEIL(A.CONSUMO_DIARIO_JANELA * {{diasCoberturaAlvo}} - A.ESTOQUE_ATUAL - A.QT_TRANSITO), 0) AS QT_REPOR_SUGERIDA,
  ROUND(A.ESTOQUE_ATUAL * A.CUSTO_UNITARIO, 2) AS VALOR_ESTOQUE,
  TO_CHAR(A.DT_PRIMEIRA_VENDA, 'YYYY-MM-DD') AS PRIMEIRA_VENDA,
  TO_CHAR(A.DT_ULTIMA_VENDA, 'YYYY-MM-DD') AS ULTIMA_VENDA,
  COUNT(*) OVER () AS TOTAL_REGISTROS,
  SUM(CASE WHEN A.SEVERIDADE = 'RUPTURA' THEN 1 ELSE 0 END) OVER () AS TOTAL_RUPTURA,
  SUM(CASE WHEN A.SEVERIDADE = 'CRITICO' THEN 1 ELSE 0 END) OVER () AS TOTAL_CRITICO,
  SUM(CASE WHEN A.SEVERIDADE = 'ALTO' THEN 1 ELSE 0 END) OVER () AS TOTAL_ALTO,
  SUM(CASE WHEN A.ORIGEM_CURVA = 'SEM_HISTORICO' THEN 1 ELSE 0 END) OVER () AS TOTAL_SEM_HISTORICO,
  ROUND(SUM(A.ESTOQUE_ATUAL * A.CUSTO_UNITARIO) OVER (), 2) AS TOTAL_VALOR_ESTOQUE,
  ROUND(AVG(A.FATOR_ACELERACAO) OVER (), 2) AS MEDIA_FATOR
FROM ALERTA A
WHERE ('{{severidade}}' IS NULL OR '{{severidade}}' = '' OR A.SEVERIDADE = '{{severidade}}')`,
`CASE X.SEVERIDADE WHEN 'RUPTURA' THEN 0 WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2 ELSE 3 END,
    NVL(X.COBERTURA_COM_TRANSITO, 0), NVL(X.FATOR_ACELERACAO, 999) DESC, X.CODFILIAL, X.CODPROD`);

const SQL_RUPTURA_FILIAIS = `${cteRuptura()}
SELECT A.CODFILIAL, MAX(A.FILIAL) AS FILIAL, COUNT(*) AS ALERTAS,
  SUM(CASE WHEN A.SEVERIDADE = 'RUPTURA' THEN 1 ELSE 0 END) AS RUPTURA,
  SUM(CASE WHEN A.SEVERIDADE = 'CRITICO' THEN 1 ELSE 0 END) AS CRITICO,
  SUM(CASE WHEN A.SEVERIDADE = 'ALTO' THEN 1 ELSE 0 END) AS ALTO,
  ROUND(SUM(A.ESTOQUE_ATUAL * A.CUSTO_UNITARIO), 2) AS VALOR_ESTOQUE,
  ROUND(AVG(A.FATOR_ACELERACAO), 2) AS MEDIA_FATOR
FROM ALERTA A
GROUP BY A.CODFILIAL
ORDER BY RUPTURA DESC, CRITICO DESC, ALERTAS DESC, A.CODFILIAL`;

// RF-017 (legado 2883/2884): UMA CTE para a lista e o resumo por filial. Saldo
// = PCLOTE.QT (P-01). KEEP (DENSE_RANK …) do legado virou ROW_NUMBER (D-001 d).
// Movimento cancelado não conta no rastro. Datas truncadas na CTE, para as
// diferenças em dias saírem por TRUNC(A.COL - B.COL) (D-001 c).
function ctePerdas() {
  return `WITH V AS (
  SELECT L.CODFILIAL, L.CODPROD, TRIM(L.NUMLOTE) AS NUMLOTE, TRUNC(L.DTVALIDADE) AS DTVALIDADE, NVL(L.QT, 0) AS QT_PERDIDA
  FROM PCLOTE L
  JOIN PCPRODUT P ON P.CODPROD = L.CODPROD
  WHERE NVL(L.QT, 0) > 0
    AND L.DTEXCLUSAO IS NULL
    AND L.DTVALIDADE IS NOT NULL
    AND L.DTVALIDADE >= TO_DATE('2000-01-01', 'YYYY-MM-DD')
    AND L.DTVALIDADE < TRUNC(SYSDATE)
    AND ({{diasVencidos}} = 0 OR L.DTVALIDADE >= TRUNC(SYSDATE) - {{diasVencidos}})
    AND ({{incluirExcecoes}} = 1 OR ${PRODUTO_ATIVO})
    AND ${filtroFilial('L.CODFILIAL')}
    AND ${FILTRO_FORNEC}
    AND ${FILTRO_DEPTO}
    AND ${BUSCA_LOTE}
),
LOTES AS (SELECT DISTINCT CODPROD, NUMLOTE FROM V),
MOVL AS (
  SELECT LO.CODPROD, LO.NUMLOTE, M.CODFILIAL, M.CODOPER, TRUNC(M.DTMOV) AS DTMOV,
    NVL(M.QT, 0) AS QT, M.NUMNOTA, NVL(M.CUSTOREAL, 0) AS CUSTOREAL,
    CASE WHEN ${VENDA_MOV} THEN 1 ELSE 0 END AS VV
  FROM LOTES LO
  JOIN PCMOV M ON M.CODPROD = LO.CODPROD AND TRIM(M.NUMLOTE) = LO.NUMLOTE
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.DTCANCEL IS NULL
),
ENT AS (
  SELECT CODPROD, NUMLOTE, DT_ENTRADA, FILIAL_ENTRADA, NUMNOTA_ENTRADA, OPER_ENTRADA, CUSTO_ENTRADA FROM (
    SELECT ML.CODPROD, ML.NUMLOTE, ML.DTMOV AS DT_ENTRADA, ML.CODFILIAL AS FILIAL_ENTRADA,
      ML.NUMNOTA AS NUMNOTA_ENTRADA, ML.CODOPER AS OPER_ENTRADA, ML.CUSTOREAL AS CUSTO_ENTRADA,
      ROW_NUMBER() OVER (PARTITION BY ML.CODPROD, ML.NUMLOTE ORDER BY ML.DTMOV, ML.CUSTOREAL DESC, ML.CODFILIAL) AS RN_ENT
    FROM MOVL ML
    WHERE ML.CODOPER IN (${OPER_ORIGEM})
  ) WHERE RN_ENT = 1
),
CHEG AS (
  SELECT CODPROD, NUMLOTE, CODFILIAL, MAX(DTMOV) AS DT_CHEGADA
  FROM MOVL
  WHERE CODOPER IN (${OPER_ORIGEM}, 'ET')
  GROUP BY CODPROD, NUMLOTE, CODFILIAL
),
TRF AS (
  SELECT CODPROD, NUMLOTE, COUNT(*) AS QT_TRANSF, MAX(DTMOV) AS DT_ULT_TRANSF
  FROM MOVL
  WHERE CODOPER = 'ET'
  GROUP BY CODPROD, NUMLOTE
),
TRFU AS (
  SELECT CODPROD, NUMLOTE, FILIAL_ULT_TRANSF_DESTINO, NUMNOTA_ULT_TRANSF FROM (
    SELECT ML.CODPROD, ML.NUMLOTE, ML.CODFILIAL AS FILIAL_ULT_TRANSF_DESTINO, ML.NUMNOTA AS NUMNOTA_ULT_TRANSF,
      ROW_NUMBER() OVER (PARTITION BY ML.CODPROD, ML.NUMLOTE ORDER BY ML.DTMOV DESC, ML.CODFILIAL) AS RN_TRF
    FROM MOVL ML
    WHERE ML.CODOPER = 'ET'
  ) WHERE RN_TRF = 1
),
VND AS (
  SELECT CODPROD, NUMLOTE, CODFILIAL, MAX(DTMOV) AS DT_ULT_VENDA, SUM(QT) AS QT_VENDIDA
  FROM MOVL
  WHERE VV = 1
  GROUP BY CODPROD, NUMLOTE, CODFILIAL
),
BASE AS (
  SELECT V.CODFILIAL, V.CODPROD, V.NUMLOTE, V.DTVALIDADE, V.QT_PERDIDA,
    P.DESCRICAO, P.EMBALAGEM, P.UNIDADE, P.CODFORNEC, F.FORNECEDOR,
    FIL.RAZAOSOCIAL AS FILIAL_NOME,
    NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA,
    NVL(ENT.CUSTO_ENTRADA, 0) AS CUSTO_ENTRADA_LOTE,
    NVL(NULLIF(ENT.CUSTO_ENTRADA, 0), NVL(E.CUSTOULTENT, 0)) AS CUSTO_UNITARIO,
    ENT.DT_ENTRADA, ENT.FILIAL_ENTRADA, ENT.NUMNOTA_ENTRADA, ENT.OPER_ENTRADA,
    FILENT.RAZAOSOCIAL AS FILIAL_ENTRADA_NOME,
    CHEG.DT_CHEGADA AS DT_CHEGADA_FILIAL,
    NVL(TRF.QT_TRANSF, 0) AS QT_TRANSFERENCIAS,
    TRF.DT_ULT_TRANSF, TRFU.FILIAL_ULT_TRANSF_DESTINO,
    (SELECT MIN(ST.CODFILIAL) FROM MOVL ST
      WHERE ST.CODOPER = 'ST' AND ST.NUMNOTA = TRFU.NUMNOTA_ULT_TRANSF
        AND ST.CODPROD = V.CODPROD AND ST.NUMLOTE = V.NUMLOTE) AS FILIAL_ULT_TRANSF_ORIGEM,
    VND.DT_ULT_VENDA, NVL(VND.QT_VENDIDA, 0) AS QT_VENDIDA_FILIAL,
    NVL(VND.DT_ULT_VENDA, NVL(CHEG.DT_CHEGADA, ENT.DT_ENTRADA)) AS DT_REF_VENDA,
    NVL(CHEG.DT_CHEGADA, ENT.DT_ENTRADA) AS DT_REF_CHEGADA,
    NVL(ENT.DT_ENTRADA, CHEG.DT_CHEGADA) AS DT_REF_ENTRADA
  FROM V
  JOIN PCPRODUT P ON P.CODPROD = V.CODPROD
  LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
  LEFT JOIN PCFILIAL FIL ON FIL.CODIGO = V.CODFILIAL
  LEFT JOIN PCEST E ON E.CODPROD = V.CODPROD AND E.CODFILIAL = V.CODFILIAL
  LEFT JOIN ENT ON ENT.CODPROD = V.CODPROD AND ENT.NUMLOTE = V.NUMLOTE
  LEFT JOIN PCFILIAL FILENT ON FILENT.CODIGO = ENT.FILIAL_ENTRADA
  LEFT JOIN CHEG ON CHEG.CODPROD = V.CODPROD AND CHEG.NUMLOTE = V.NUMLOTE AND CHEG.CODFILIAL = V.CODFILIAL
  LEFT JOIN TRF ON TRF.CODPROD = V.CODPROD AND TRF.NUMLOTE = V.NUMLOTE
  LEFT JOIN TRFU ON TRFU.CODPROD = V.CODPROD AND TRFU.NUMLOTE = V.NUMLOTE
  LEFT JOIN VND ON VND.CODPROD = V.CODPROD AND VND.NUMLOTE = V.NUMLOTE AND VND.CODFILIAL = V.CODFILIAL
)`;
}

const SQL_PERDAS = paginar(`${ctePerdas()}
SELECT B.CODFILIAL, B.FILIAL_NOME, B.CODPROD, B.DESCRICAO, B.EMBALAGEM, B.UNIDADE, B.CODFORNEC, B.FORNECEDOR,
  B.NUMLOTE, TO_CHAR(B.DTVALIDADE, 'YYYY-MM-DD') AS DTVALIDADE,
  0 - FLOOR(B.DTVALIDADE - TRUNC(SYSDATE)) AS DIAS_VENCIDO,
  B.QT_PERDIDA, B.QT_VENDIDA_FILIAL,
  B.CUSTO_UNITARIO, B.CUSTO_ENTRADA_LOTE, B.CUSTO_ULT_ENTRADA,
  ROUND(B.QT_PERDIDA * B.CUSTO_UNITARIO, 2) AS VALOR_PERDA,
  TO_CHAR(B.DT_ENTRADA, 'YYYY-MM-DD') AS DT_ENTRADA, B.FILIAL_ENTRADA, B.FILIAL_ENTRADA_NOME, B.NUMNOTA_ENTRADA, B.OPER_ENTRADA,
  TO_CHAR(B.DT_CHEGADA_FILIAL, 'YYYY-MM-DD') AS DT_CHEGADA_FILIAL,
  B.QT_TRANSFERENCIAS, TO_CHAR(B.DT_ULT_TRANSF, 'YYYY-MM-DD') AS DT_ULT_TRANSF,
  B.FILIAL_ULT_TRANSF_ORIGEM, B.FILIAL_ULT_TRANSF_DESTINO,
  TO_CHAR(B.DT_ULT_VENDA, 'YYYY-MM-DD') AS DT_ULT_VENDA,
  CASE WHEN B.DT_REF_VENDA IS NULL THEN NULL ELSE GREATEST(TRUNC(B.DTVALIDADE - B.DT_REF_VENDA), 0) END AS DIAS_SEM_VENDA,
  CASE WHEN B.DT_REF_CHEGADA IS NULL THEN NULL ELSE TRUNC(B.DTVALIDADE - B.DT_REF_CHEGADA) END AS DIAS_NA_FILIAL,
  CASE WHEN B.DT_REF_ENTRADA IS NULL THEN NULL ELSE TRUNC(B.DTVALIDADE - B.DT_REF_ENTRADA) END AS DIAS_DESDE_ENTRADA,
  COUNT(*) OVER () AS TOTAL_REGISTROS,
  ROUND(SUM(B.QT_PERDIDA * B.CUSTO_UNITARIO) OVER (), 2) AS TOTAL_VALOR,
  SUM(B.QT_PERDIDA) OVER () AS TOTAL_QT,
  (SELECT COUNT(DISTINCT V2.CODPROD) FROM V V2) AS TOTAL_PRODUTOS,
  SUM(CASE WHEN B.QT_TRANSFERENCIAS > 0 THEN 1 ELSE 0 END) OVER () AS TOTAL_COM_TRANSFERENCIA,
  ROUND(SUM(CASE WHEN B.QT_TRANSFERENCIAS > 0 THEN B.QT_PERDIDA * B.CUSTO_UNITARIO ELSE 0 END) OVER (), 2) AS TOTAL_VALOR_TRANSFERIDO,
  SUM(CASE WHEN B.DT_ULT_VENDA IS NULL THEN 1 ELSE 0 END) OVER () AS TOTAL_NUNCA_VENDIDOS,
  ROUND(SUM(CASE WHEN B.DT_ULT_VENDA IS NULL THEN B.QT_PERDIDA * B.CUSTO_UNITARIO ELSE 0 END) OVER (), 2) AS TOTAL_VALOR_NUNCA_VENDIDO
FROM BASE B`,
'X.VALOR_PERDA DESC, X.DTVALIDADE, X.DESCRICAO, X.NUMLOTE, X.CODFILIAL');

const SQL_PERDAS_FILIAIS = `${ctePerdas()}
SELECT B.CODFILIAL, MAX(B.FILIAL_NOME) AS FILIAL,
  COUNT(*) AS QT_LOTES,
  COUNT(DISTINCT B.CODPROD) AS QT_PRODUTOS,
  SUM(B.QT_PERDIDA) AS QT_PERDIDA,
  ROUND(SUM(B.QT_PERDIDA * B.CUSTO_UNITARIO), 2) AS VALOR_PERDA,
  SUM(CASE WHEN B.QT_TRANSFERENCIAS > 0 THEN 1 ELSE 0 END) AS QT_COM_TRANSFERENCIA,
  SUM(CASE WHEN B.DT_ULT_VENDA IS NULL THEN 1 ELSE 0 END) AS QT_NUNCA_VENDIDOS
FROM BASE B
GROUP BY B.CODFILIAL
ORDER BY VALOR_PERDA DESC, B.CODFILIAL`;

// RF-018 (legado 2885): todo movimento do lote, em todas as filiais. A remessa
// de entrega futura vem MARCADA (REMESSA = 1, P-02) com o fragmento da R-131:
// a tela a rotula, e ela nunca conta como venda.
const SQL_LOTE_HISTORICO = `SELECT * FROM (
  SELECT M.CODFILIAL, FIL.RAZAOSOCIAL AS FILIAL_NOME, M.CODOPER,
    CASE WHEN M.CODOPER IN (${OPER_ORIGEM}, 'ET') THEN 'ENTRADA' ELSE 'SAIDA' END AS SENTIDO,
    TO_CHAR(M.DTMOV, 'YYYY-MM-DD') AS DTMOV, NVL(M.QT, 0) AS QT, M.NUMNOTA,
    M.CODCLI, C.CLIENTE, M.CODFORNEC, F.FORNECEDOR, NVL(M.CUSTOREAL, 0) AS CUSTOREAL,
    CASE WHEN M.CODOPER = 'ET' THEN
      (SELECT MIN(ST.CODFILIAL) FROM PCMOV ST
        WHERE ST.CODOPER = 'ST' AND ST.NUMNOTA = M.NUMNOTA
          AND ST.CODPROD = M.CODPROD AND TRIM(ST.NUMLOTE) = TRIM(M.NUMLOTE))
    END AS FILIAL_ORIGEM,
    CASE WHEN M.CODOPER = 'ST' THEN
      (SELECT MIN(ET.CODFILIAL) FROM PCMOV ET
        WHERE ET.CODOPER = 'ET' AND ET.NUMNOTA = M.NUMNOTA
          AND ET.CODPROD = M.CODPROD AND TRIM(ET.NUMLOTE) = TRIM(M.NUMLOTE))
    END AS FILIAL_DESTINO,
    CASE WHEN ${REMESSA_FUTURA} THEN 1 ELSE 0 END AS REMESSA,
    CASE WHEN M.DTCANCEL IS NULL THEN 0 ELSE 1 END AS CANCELADO,
    ROW_NUMBER() OVER (ORDER BY M.DTMOV, M.CODOPER, M.CODFILIAL, M.NUMNOTA) AS RN
  FROM PCMOV M
  LEFT JOIN PCFILIAL FIL ON FIL.CODIGO = M.CODFILIAL
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  LEFT JOIN PCFORNEC F ON F.CODFORNEC = M.CODFORNEC
  WHERE M.CODPROD = {{codprod}}
    AND TRIM(M.NUMLOTE) = TRIM('{{numlote}}')
) WHERE RN <= {{limite}}
ORDER BY RN`;

/* ─────────────── leituras — banco do projeto ─────────────── */

// RNF-002: os planos da PÁGINA numa chamada só. `{{codprods}}` é FRAGMENTO
// (lista de inteiros sem aspas, `listaCodprods` da tela); `0` = nenhum.
const SQL_PLANOS_LISTAR = `SELECT P.ID, P.ORIGEM, P.CODPROD, P.CODFILIAL, P.DESCRICAO,
       P.FATO, P.CAUSA, P.ACAO, P.RESPONSAVEL_ID, COALESCE(R.NOME, '') AS RESPONSAVEL_NOME,
       P.DATA_ACOMPANHAMENTO, P.STATUS,
       P.CRIADO_POR, COALESCE(UC.NOME, '') AS CRIADO_POR_NOME, P.CRIADO_EM,
       P.ATUALIZADO_POR, COALESCE(UA.NOME, '') AS ATUALIZADO_POR_NOME, P.ATUALIZADO_EM
FROM SGC_MOV_PLANO P
LEFT JOIN INT_USER R ON R.ID = P.RESPONSAVEL_ID
LEFT JOIN INT_USER UC ON UC.ID = P.CRIADO_POR
LEFT JOIN INT_USER UA ON UA.ID = P.ATUALIZADO_POR
WHERE P.ORIGEM = '{{origem}}'
  AND P.CODFILIAL = '{{codfilial}}'
  AND P.CODPROD IN ({{codprods}})
ORDER BY P.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

// RF-012/C-023: acompanhamento vencido = data antes de hoje e não concluído.
const SQL_PLANOS_RESUMO = `SELECT COUNT(*) AS TOTAL,
  COALESCE(SUM(CASE WHEN P.STATUS <> 'concluido' THEN 1 ELSE 0 END), 0) AS ABERTOS,
  COALESCE(SUM(CASE WHEN P.STATUS <> 'concluido'
                     AND COALESCE(P.DATA_ACOMPANHAMENTO, '') <> ''
                     AND P.DATA_ACOMPANHAMENTO < '{{hoje}}' THEN 1 ELSE 0 END), 0) AS VENCIDOS
FROM SGC_MOV_PLANO P
WHERE P.ORIGEM = '{{origem}}'
  AND P.CODFILIAL = '{{codfilial}}'`;

/* ─────────────── escritas SQL (uma instrução por SF) ─────────────── */

// RN-010/RN-011: upsert pela chave única (ORIGEM, CODPROD, CODFILIAL). A guarda,
// a lista fechada de origem e status e o "fato, causa ou ação" ficam no WHERE:
// recusa = 0 linhas, sem erro, e a tela relê para dizer que não gravou (C-024).
const SQL_PLANO_SALVAR = `INSERT INTO SGC_MOV_PLANO
  (ORIGEM, CODPROD, CODFILIAL, DESCRICAO, FATO, CAUSA, ACAO, RESPONSAVEL_ID, DATA_ACOMPANHAMENTO, STATUS,
   CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT '{{origem}}', {{codprod}}, '{{codfilial}}', '{{descricao}}', '{{fato}}', '{{causa}}', '{{acao}}',
       {{responsavelId}}, '{{dataAcompanhamento}}', '{{status}}',
       :VAR_USER, '{{agora}}', :VAR_USER, '{{agora}}'
FROM DUAL
WHERE '{{origem}}' IN ('sem_venda', 'a_vencer')
  AND {{codprod}} > 0 AND TRIM('{{codfilial}}') <> ''
  AND '{{status}}' IN ('aberto', 'em_andamento', 'concluido')
  AND (TRIM('{{fato}}') <> '' OR TRIM('{{causa}}') <> '' OR TRIM('{{acao}}') <> '')
  AND ${guarda(PLANO)}
ON DUPLICATE KEY UPDATE
  DESCRICAO = VALUES(DESCRICAO),
  FATO = VALUES(FATO),
  CAUSA = VALUES(CAUSA),
  ACAO = VALUES(ACAO),
  RESPONSAVEL_ID = VALUES(RESPONSAVEL_ID),
  DATA_ACOMPANHAMENTO = VALUES(DATA_ACOMPANHAMENTO),
  STATUS = VALUES(STATUS),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

const SQL_PLANO_EXCLUIR = `DELETE FROM SGC_MOV_PLANO
WHERE ID = {{id}}
  AND ${guarda(PLANO)}`;

const FILTROS = 'codfilial string, codfornec int (0 = todos), codepto int (0 = todos), busca string, incluirPublico int (0 = publico fora, o padrao)';

const LEITURAS = [
  { name: 'sgcWintDepartamentos', code: SQL_DEPARTAMENTOS, resumo: 'R-133 - departamentos do ERP para o filtro do topo (CODEPTO > 0 e diferente de 9999), por nome' },
  { name: 'sgcWintMovSemVenda', code: SQL_SEM_VENDA, resumo: `RF-006 - produtos ativos com estoque na filial e dias desde a ultima venda valida >= corte, paginados, com TOTAL_REGISTROS e TOTAL_VALOR. Params: ${FILTROS}, diasSemVenda int, somenteComEstoque int, janelaDias int, limite int, offset int` },
  { name: 'sgcWintMovExcedentes', code: SQL_EXCEDENTES, resumo: `RF-007 - produtos com estoque e venda valida no periodo (venda, faturamento, consumo, cobertura com transito pre-agregado); a tela classifica. Params: ${FILTROS}, diasPeriodo int, limite int (teto, 3000), offset int` },
  { name: 'sgcWintMovAVencer', code: SQL_A_VENCER, resumo: `RF-008..RF-010 - lotes com saldo (PCLOTE.QT) por situacao, horizonte e bloqueio, com quem/quando bloqueou (PCLOTELOG, sem motivo) e divergencia lote x produto, paginados. Params: ${FILTROS}, situacao string, diasHorizonte int, bloqueio string, limite int, offset int` },
  { name: 'sgcWintMovRuptura', code: SQL_RUPTURA, resumo: `RF-014 - produtos com venda fora da curva (janela x base), severidade pelo prazo de reposicao, paginados. Params: ${FILTROS}, diasJanela int, diasBase int, diasTotal int, limiarPerc int, fatorMinimo decimal, prazoReposicao int, vendaMinima int, incluirSemHistorico int, incluirExcecoes int, diasCoberturaAlvo int, severidade string, limite int, offset int` },
  { name: 'sgcWintMovRupturaFiliais', code: SQL_RUPTURA_FILIAIS, resumo: 'RF-015 - o recorte da ruptura agrupado por filial (a tela manda codfilial e severidade vazios). Params: os de sgcWintMovRuptura' },
  { name: 'sgcWintMovPerdas', code: SQL_PERDAS, resumo: `RF-017 - lotes vencidos com saldo, com custo da perda e rastro (entrada, chegada, transferencias, ultima venda), paginados. Params: ${FILTROS}, diasVencidos int (0 = todo o historico), incluirExcecoes int, limite int, offset int` },
  { name: 'sgcWintMovPerdasFiliais', code: SQL_PERDAS_FILIAIS, resumo: 'RF-015 - o recorte das perdas agrupado por filial (a tela manda codfilial vazio). Params: os de sgcWintMovPerdas' },
  { name: 'sgcWintMovLoteHistorico', code: SQL_LOTE_HISTORICO, resumo: 'RF-018 - movimentos do lote em todas as filiais, em ordem, com sentido, filial de origem/destino da transferencia e a remessa marcada. Params: codprod int, numlote string, limite int' },
  { name: 'sgcMovPlanosListar', code: SQL_PLANOS_LISTAR, resumo: 'RF-011/RNF-002 - planos de acao da aba + filial para os codigos da pagina. Params: origem string, codfilial string, codprods fragmento (inteiros; 0 = nenhum), limite int, offset int' },
  { name: 'sgcMovPlanosResumo', code: SQL_PLANOS_RESUMO, resumo: 'RF-012 - total, abertos e acompanhamentos vencidos da aba + filial. Params: origem string, codfilial string, hoje string' },
];

const ESCRITAS = [
  { name: 'sgcEscMovPlanoSalvar', code: SQL_PLANO_SALVAR, resumo: 'RN-010/RN-011 - upsert do plano de acao por (origem, codprod, codfilial), guardado por :VAR_USER (admin, analista, gestor, diretoria). Params: origem string, codprod int, codfilial string, descricao string, fato string, causa string, acao string, responsavelId int, dataAcompanhamento string, status string, agora string' },
  { name: 'sgcEscMovPlanoExcluir', code: SQL_PLANO_EXCLUIR, resumo: 'RF-011 - remove o plano de acao, guardado por :VAR_USER. Params: id int' },
];

export const definitions = [...LEITURAS, ...ESCRITAS].map((f) => ({
  name: f.name,
  type: 'SQL',
  description: f.resumo,
  code: f.code,
}));

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
  const mapa = new Map(lista.map((f) => [f.name, f.id]));

  for (const definicao of definitions) {
    const corpo = {
      projectId,
      name: definicao.name,
      type: definicao.type,
      code: definicao.code,
      description: definicao.description,
      ...(WINTHOR.includes(definicao.name) ? { jdbcId } : {}),
    };
    const id = mapa.get(definicao.name);
    if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
    else await sdk.createServerFunctionMitra(corpo);
    console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
  }

  console.log(`Pronto: ${definitions.length} server functions da spec 013 (movimentação de produtos).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
