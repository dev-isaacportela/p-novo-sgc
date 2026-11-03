// add-013 — Server Functions da spec 011 (compras inteligentes): a consulta de
// ressuprimento no WinThor (medidas por produto ativo do fornecedor na filial),
// os detalhes do SKU, os parâmetros de compra, as vendas desconsideradas, o
// bloqueio do carrinho por pedido aberto e a eficiência do comprador. Ver
// docs/specs/011-compras-inteligentes/.
//
// Faixa de id local: 81xx (R-081 do 000) — leituras 8101-8109
// (sgcWintRessuprimento, sgcWintProdutoHistorico, sgcWintProdutoUltimasCompras,
// sgcWintProdutoEstoqueFiliais, sgcWintProdutoVendas, sgcParametrosCompraListar,
// sgcVendasDesconsideradasListar, sgcPedidoAbertoDoFornecedor,
// sgcEficienciaComprador), 8110-8111 do layout legado (sgcWintResumoFornecedores,
// sgcItensEmPedidoAberto — R-117), 8115-8116 dos avisos de excesso e bloqueio
// (sgcWintEstoqueFiliaisProdutos, sgcWintBloqueiosProduto — R-130), escritas 8150-8154 (sgcEscParametroCompraSalvar,
// sgcEscParametroCompraSilenciar, sgcEscParametroCompraRestaurar,
// sgcEscVendaDesconsiderar, sgcEscVendaReconsiderar).
//
// NENHUMA definição aqui é JAVASCRIPT e nenhuma tem cron (contrato da onda 4,
// R-081): a fórmula roda em regra pura da tela (`lib/ressuprimento.ts`, R-083)
// e o pedido do carrinho nasce pelas SFs da 002 e da 003 (R-091) — kbCardCriar
// + sgcEscPedidoCriar + sgcItensGravar, chamadas da tela.
//
// A consulta principal devolve MEDIDAS, não fórmula (R-082): saem FATOR_Z,
// ESTOQUE_SEGURANCA, ESTOQUE_MAXIMO, QUANTIDADE_SUGERIDA, COBERTURA_ATUAL_DIAS,
// DIAS_GATILHO e STATUS_COMPRA do legado. A venda pública vem somada e
// segregada (R-084), o estoque é líquido (R-085) e `{{excluir}}` tira a venda
// desconsiderada na origem (R-087).
//
// As tabelas `SGC_PARAMETRO_COMPRA` e `SGC_VENDA_DESCONSIDERADA` já estão no
// `setup-backend.mjs`, e os shims que a consulta principal usa (`POWER`,
// `SQRT`, `ADD_MONTHS` e o gerador de calendário `FROM DUAL CONNECT BY LEVEL`)
// já estão em `simulator/mysql-dialect.mjs` — os dois pela base (R-113).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-013-compras-inteligentes.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintRessuprimento', 'sgcWintProdutoHistorico',
  'sgcWintProdutoUltimasCompras', 'sgcWintProdutoEstoqueFiliais', 'sgcWintProdutoVendas',
  'sgcWintResumoFornecedores', 'sgcWintVendasClientesProdutos', 'sgcWintEstoqueFiliaisProdutos',
  'sgcWintBloqueiosProduto'];

/* ──────────────────────────────────────────────────────────────────────────
   A guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente de
   add-006-itens.mjs:50-62; só a lista de personas muda. `:VAR_USER` vale porque
   TODA escrita desta spec é chamada direto da tela: não há JavaScript nem cron
   aqui (R-081), então não existe variante `{{usuarioId}}`.
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

/** Parametrizar e silenciar: admin e gestor (RN-019). */
const PARAMETRIZAR = ['admin', 'gestor'];
/** Operar (desconsiderar venda): admin, analista e gestor (RN-019). */
const OPERAR = ['admin', 'analista', 'gestor'];

/**
 * Cliente de órgão público (ramos 11 a 15 do PCATIVI, "ORGAO PUBLICO …"). R-131:
 * fica FORA da demanda por padrão — a tela traz o seletor marcado e quem o
 * desmarca vê com o público; por isso a consulta segue devolvendo a parte
 * pública segregada. O ramo 20 é "FILIAL" (venda para a própria rede): saiu
 * daqui e entrou em ENTRE_FILIAIS, que fica fora sempre.
 */
export const PUBLICO = 'NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15)';

/**
 * R-131: venda para a própria rede — o ramo 20 (FILIAL) ou o cliente que é uma
 * filial do grupo (PCFILIAL.CODCLI). No WinThor real os dois recortes são o
 * mesmo (64 linhas, 4.827 un. em 153 dias na filial 1); os dois ficam por
 * robustez. `NVL(M.CODCLI, 0)`: venda sem cliente não pode virar NULL no NOT.
 */
// `NVL(FX.CODCLI, 0) > 0` e não `IS NOT NULL`: o gerador CONNECT BY do dialeto do simulador casa
// até o próximo `IS NOT NULL` da consulta (o calendário da principal viraria número).
const ENTRE_FILIAIS = `(NVL(C.CODATV1, 0) = 20 OR NVL(M.CODCLI, 0) IN (SELECT FX.CODCLI FROM PCFILIAL FX WHERE NVL(FX.CODCLI, 0) > 0))`;

/** R-131 (RN-CI-07 e RN-EST-11 do legado): remessa de entrega futura — a venda já contou na nota de venda (CONDVENDA 7). */
export const REMESSA_FUTURA = `EXISTS (SELECT 1 FROM PCNFSAID NF WHERE NF.NUMTRANSVENDA = M.NUMTRANSVENDA AND NF.CONDVENDA = 8)`;

/**
 * RN-001 (R-131): a venda que conta na 011 — UM recorte só, para lista,
 * curvas, gráfico, previsão, aba Vendas, custo especial e o resumo do seletor
 * baterem. Exige PCMOV como `M` e `LEFT JOIN PCCLIENT C`. O público fica de
 * fora à parte (PUBLICO), porque a tela decide.
 */
export const VENDA_VALIDA = `(M.CODOPER = 'S' AND M.QT > 0 AND NOT ${ENTRE_FILIAIS} AND NOT ${REMESSA_FUTURA})`;

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// A consulta principal (RF-001..RF-005, RF-013). Sete decisões, todas no plan:
//
// 1. `DIAS` existe para o dia SEM venda entrar na média (RN-001): sem o
//    calendário, SUM(qt x peso) / SUM(peso) seria a média dos dias COM venda, e
//    um item que vende 60 uma vez por mês teria consumo 60/dia.
// 2. O peso vem de `DIAS_ATE_FIM` (inteiro do calendário), não de subtração de
//    datas: no SQLite `dataFim - D.DIA` daria zero e o peso viraria 1 em todo
//    dia — erro silencioso. `{{diasPeriodo}}` vem da tela (fim - início + 1).
// 3. Lead time com `TRUNC(M.DTMOV - O.DTEMISSAO)`: é a forma que o dialeto já
//    traduz, mesmo resultado no Oracle, zero shim novo.
// 4. Volatilidade por `AVG(x²) - AVG(x)²` + `SQRT`, e não `STDDEV_POP`
//    (R-100): o dialeto registra funções escalares, não agregados.
// 5. Sem `LIMIT/OFFSET` (D-006): a curva ABC é acumulada sobre o fornecedor
//    inteiro — paginar no servidor daria uma curva por página. A tela pagina o
//    que já tem em memória. `ponytail:` teto prático de ~2.000 produtos por
//    fornecedor; acima disso a curva teria de sair numa segunda passada.
// 6. `{{excluir}}` é FRAGMENTO (lista de inteiros sem aspas), `0` quando não há
//    nenhuma — `NUMTRANSITEM` começa em 1, então `NOT IN (0)` não exclui nada.
//    Teto de 500 por chamada (R-087, ORA-01795).
// 7. A venda pública sai segregada em VENDA_PUBLICA, CONSUMO_DIARIO_PUBLICO,
//    FATURAMENTO_PUBLICO e RENTABILIDADE_PUBLICA: quem decide é o seletor da
//    tela (R-131: marcado por padrão, o público fica fora), sem nova consulta.
// 9. R-132 (C-049): PREVISAO_CHEGADA é a menor previsão de entrega
//    (PCPEDIDO.DTPREVENT) dos pedidos da filial com saldo pendente no item
//    (PCITEM: pedida − entregue > 0), dos últimos 12 meses; sem pedido assim, a
//    tela cai em hoje + lead time e diz isso. Fica ANTES do calendário e sem
//    "IS NOT NULL": o gerador CONNECT BY do simulador casa até o próximo.
// 8. R-131: só entra a VENDA_VALIDA — venda entre filiais e remessa de entrega
//    futura (CONDVENDA 8) ficam fora sempre, em todas as SFs que contam venda.
const SQL_RESSUPRIMENTO = `WITH
  PRODUTOS_BASE AS (
    SELECT
      P.CODPROD, P.DESCRICAO, P.EMBALAGEM, P.UNIDADE,
      NVL(P.CODEPTO, 0) AS CODEPTO,
      NVL(P.CODSEC, 0)  AS CODSEC,
      NVL(P.QTUNITCX, 0) AS UN_POR_CAIXA_ERP,
      NVL(P.CODFAB, '') AS CODFAB,
      NVL(E.CUSTOULTENT, 0) AS CUSTO_ULT_ENTRADA,
      NVL(E.CUSTOFIN, 0) AS CUSTO_ATUAL,
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
  PREVISAO_CHEGADA AS (
    SELECT I.CODPROD, MIN(O.DTPREVENT) AS DT_PREV
    FROM PCPEDIDO O
    JOIN PCITEM I ON I.NUMPED = O.NUMPED
    JOIN PRODUTOS_BASE PB ON PB.CODPROD = I.CODPROD
    WHERE O.CODFILIAL = '{{codfilial}}'
      AND NVL(I.QTPEDIDA, 0) - NVL(I.QTENTREGUE, 0) > 0
      AND O.DTEMISSAO >= ADD_MONTHS(TRUNC(SYSDATE), -12)
    GROUP BY I.CODPROD
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
      SUM(CASE WHEN ${PUBLICO} THEN M.QT ELSE 0 END) AS QT_DIA_PUBLICA,
      SUM(M.QT * NVL(M.PUNIT, 0)) AS VL_DIA,
      SUM(M.QT * (NVL(M.PUNIT, 0) - NVL(M.CUSTOFIN, 0))) AS MARGEM_DIA,
      SUM(CASE WHEN ${PUBLICO} THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END) AS VL_DIA_PUBLICO,
      SUM(CASE WHEN ${PUBLICO} THEN M.QT * (NVL(M.PUNIT, 0) - NVL(M.CUSTOFIN, 0)) ELSE 0 END) AS MARGEM_DIA_PUBLICA
    FROM PCMOV M
    JOIN PRODUTOS_BASE PB ON PB.CODPROD = M.CODPROD
    LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
    WHERE ${VENDA_VALIDA}
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
      NVL(V.VL_DIA, 0)         AS VL_DIA,
      NVL(V.MARGEM_DIA, 0)     AS MARGEM_DIA,
      NVL(V.VL_DIA_PUBLICO, 0)     AS VL_DIA_PUBLICO,
      NVL(V.MARGEM_DIA_PUBLICA, 0) AS MARGEM_DIA_PUBLICA,
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
      SUM(D.VL_DIA)         AS FATURAMENTO_PERIODO,
      SUM(D.MARGEM_DIA)     AS RENTABILIDADE_PERIODO,
      SUM(D.VL_DIA_PUBLICO)     AS FATURAMENTO_PUBLICO,
      SUM(D.MARGEM_DIA_PUBLICA) AS RENTABILIDADE_PUBLICA,
      ROUND(SUM(D.QT_DIA * D.PESO)         / NULLIF(SUM(D.PESO), 0), 4) AS CONSUMO_DIARIO,
      ROUND(SUM(D.QT_DIA_PUBLICA * D.PESO) / NULLIF(SUM(D.PESO), 0), 4) AS CONSUMO_DIARIO_PUBLICO,
      ROUND(SQRT(GREATEST(AVG(D.QT_DIA * D.QT_DIA) - AVG(D.QT_DIA) * AVG(D.QT_DIA), 0)), 4) AS VOLATILIDADE_DIARIA
    FROM DEMANDA_DIA D
    GROUP BY D.CODPROD
  )
SELECT
  PB.CODPROD, PB.DESCRICAO, PB.EMBALAGEM, PB.UNIDADE, PB.CODEPTO, PB.CODSEC,
  PB.UN_POR_CAIXA_ERP, PB.CODFAB, PB.CUSTO_ULT_ENTRADA, PB.CUSTO_ATUAL, PB.DT_ULT_ENTRADA, PB.DT_ULT_SAIDA,
  PB.ESTOQUE_TOTAL, PB.QT_BLOQUEADA, PB.QT_INDENIZ, PB.QT_RESERV, PB.ESTOQUE_ATUAL,
  PB.QT_PEDIDA_ERP, PB.QT_TRANSITO, PB.ESTOQUE_EM_TRANSITO,
  NVL(R.LEAD_TIME_MEDIDO, 0)       AS LEAD_TIME_MEDIDO,
  NVL(M.VENDA_PERIODO, 0)          AS VENDA_PERIODO,
  NVL(M.VENDA_PUBLICA, 0)          AS VENDA_PUBLICA,
  NVL(M.FATURAMENTO_PERIODO, 0)    AS FATURAMENTO_PERIODO,
  NVL(M.RENTABILIDADE_PERIODO, 0)  AS RENTABILIDADE_PERIODO,
  NVL(M.FATURAMENTO_PUBLICO, 0)    AS FATURAMENTO_PUBLICO,
  NVL(M.RENTABILIDADE_PUBLICA, 0)  AS RENTABILIDADE_PUBLICA,
  NVL(M.CONSUMO_DIARIO, 0)         AS CONSUMO_DIARIO,
  NVL(M.CONSUMO_DIARIO_PUBLICO, 0) AS CONSUMO_DIARIO_PUBLICO,
  NVL(M.VOLATILIDADE_DIARIA, 0)    AS VOLATILIDADE_DIARIA,
  TO_CHAR(PC.DT_PREV, 'YYYY-MM-DD') AS DT_PREV_CHEGADA
FROM PRODUTOS_BASE PB
LEFT JOIN RESSUPRIMENTO_PRODUTO R ON R.CODPROD = PB.CODPROD
LEFT JOIN PREVISAO_CHEGADA PC ON PC.CODPROD = PB.CODPROD
LEFT JOIN METRICAS M ON M.CODPROD = PB.CODPROD
ORDER BY PB.DESCRICAO`;

// 12 meses de venda e entrada (RF-020). O legado usava `TRUNC(SYSDATE, 'MM')`
// (TRUNC de dois argumentos); aqui é `TRUNC(SYSDATE)`, que o dialeto já tem, e
// a janela passa a ser "12 meses a partir de hoje".
const SQL_PRODUTO_HISTORICO = `SELECT
  TO_CHAR(M.DTMOV, 'YYYY-MM') AS MES,
  SUM(CASE WHEN ${VENDA_VALIDA} THEN NVL(M.QT, 0) ELSE 0 END) AS SAIDAS,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) ELSE 0 END) AS ENTRADAS,
  SUM(CASE WHEN ${VENDA_VALIDA} AND ${PUBLICO}
           THEN NVL(M.QT, 0) ELSE 0 END) AS SAIDAS_PUBLICAS
FROM PCMOV M
LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
WHERE M.CODPROD = {{codprod}}
  AND M.CODFILIAL = '{{codfilial}}'
  AND M.CODOPER IN ('S', 'E')
  AND M.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE), -{{meses}})
GROUP BY TO_CHAR(M.DTMOV, 'YYYY-MM')
ORDER BY MES`;

// `ROWNUM` literal dentro da subconsulta ordenada, como em sgcWintBuscarProduto
// da 003 — é a forma que o dialeto traduz em LIMIT.
// R-123: o pedido ao ERP de cada entrada (número, emissão = solicitação e
// previsão de entrega) para a Análise do Produto; entrada sem pedido casado
// devolve 0 e datas vazias.
const SQL_PRODUTO_ULTIMAS_COMPRAS = `SELECT * FROM (
  SELECT
    TO_CHAR(M.DTMOV, 'YYYY-MM-DD') AS DT_ENTRADA,
    NVL(M.NUMTRANSENT, 0) AS NUMTRANSENT,
    NVL(M.NUMNOTA, 0)     AS NUMNOTA,
    NVL(M.CODFILIAL, '')  AS CODFILIAL,
    NVL(M.QT, 0)          AS QUANTIDADE,
    NVL(M.PUNIT, 0)       AS PRECO_UNITARIO,
    NVL(M.QT, 0) * NVL(M.PUNIT, 0) AS VALOR_TOTAL,
    NVL(M.NUMPED, 0)      AS NUMPED,
    NVL(TO_CHAR(O.DTEMISSAO, 'YYYY-MM-DD'), '') AS DT_SOLICITACAO,
    NVL(TO_CHAR(O.DTPREVENT, 'YYYY-MM-DD'), '') AS DT_PREVISAO
  FROM PCMOV M
  LEFT JOIN PCPEDIDO O ON O.NUMPED = M.NUMPED
  WHERE M.CODPROD = {{codprod}} AND M.CODOPER = 'E' AND M.QT > 0
  ORDER BY M.DTMOV DESC
) WHERE ROWNUM <= 10`;

// A posição do produto em todas as filiais, com o mesmo estoque líquido de R-085.
const SQL_PRODUTO_ESTOQUE_FILIAIS = `SELECT
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
ORDER BY E.CODFILIAL`;

// As vendas da janela, MAIORES PRIMEIRO (a venda atípica é a grande), com o
// NUMTRANSITEM que vira a chave de SGC_VENDA_DESCONSIDERADA (R-087).
const SQL_PRODUTO_VENDAS = `SELECT * FROM (
  SELECT
    M.NUMTRANSITEM,
    TO_CHAR(M.DTMOV, 'YYYY-MM-DD') AS DTMOV,
    NVL(M.QT, 0)    AS QUANTIDADE,
    NVL(M.PUNIT, 0) AS PRECO_VENDA,
    NVL(M.QT, 0) * NVL(M.PUNIT, 0) AS VALOR_TOTAL,
    NVL(M.CODCLI, 0) AS CODCLI,
    NVL(C.CLIENTE, '') AS CLIENTE,
    NVL(M.CODUSUR, 0) AS CODUSUR,
    NVL(U.NOME, '') AS VENDEDOR,
    CASE WHEN ${PUBLICO} THEN 1 ELSE 0 END AS PUBLICO
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  LEFT JOIN PCUSUARI U ON U.CODUSUR = M.CODUSUR
  WHERE M.CODPROD = {{codprod}}
    AND M.CODFILIAL = '{{codfilial}}'
    AND ${VENDA_VALIDA}
    AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  ORDER BY M.QT DESC, M.DTMOV DESC
) WHERE ROWNUM <= 50`;

// Layout legado (R-117 / RN-026): o rótulo do seletor de fornecedor traz
// "N itens · sugestão R$ X" ANTES de a compradora escolher. É uma ESTIMATIVA
// barata numa consulta só para todos os fornecedores parametrizados: venda dos
// últimos {{diasPeriodo}} dias sem ponderação, cobertura padrão de 35 dias,
// estoque disponível e pedido ao ERP somados em todas as filiais, custo da
// última entrada. Nada de parâmetro de SKU nem de curva — a sugestão exata
// continua sendo a da consulta principal, por fornecedor e filial. `{{codfornecs}}`
// é FRAGMENTO (lista de inteiros sem aspas), como o `{{excluir}}`.
const SQL_RESUMO_FORNECEDORES = `WITH
  BASE AS (
    SELECT P.CODFORNEC, P.CODPROD
    FROM PCPRODUT P
    WHERE P.CODFORNEC IN ({{codfornecs}})
      AND P.CODFORNEC <> 999999
      AND NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
      AND NVL(P.CODEPTO, 0) NOT IN (4, 7)
  ),
  POSICAO AS (
    SELECT E.CODPROD,
      SUM(GREATEST(0, NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0))) AS DISPONIVEL,
      SUM(NVL(E.QTPEDIDA, 0)) AS PEDIDO_ERP,
      MAX(NVL(E.CUSTOULTENT, 0)) AS CUSTO
    FROM PCEST E
    JOIN BASE B ON B.CODPROD = E.CODPROD
    GROUP BY E.CODPROD
  ),
  VENDA AS (
    SELECT M.CODPROD, SUM(M.QT) AS QT
    FROM PCMOV M
    JOIN BASE B ON B.CODPROD = M.CODPROD
    LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
    WHERE ${VENDA_VALIDA} AND NOT (${PUBLICO})
      AND M.DTMOV >= TO_DATE('{{dataInicio}}', 'YYYY-MM-DD')
    GROUP BY M.CODPROD
  )
SELECT
  B.CODFORNEC,
  COUNT(*) AS ITENS,
  ROUND(SUM(GREATEST(0, NVL(V.QT, 0) / GREATEST({{diasPeriodo}}, 1) * 35 - NVL(PO.DISPONIVEL, 0) - NVL(PO.PEDIDO_ERP, 0)) * NVL(PO.CUSTO, 0)), 2) AS VALOR_SUGERIDO
FROM BASE B
LEFT JOIN POSICAO PO ON PO.CODPROD = B.CODPROD
LEFT JOIN VENDA V ON V.CODPROD = B.CODPROD
GROUP BY B.CODFORNEC
ORDER BY B.CODFORNEC`;

/* ─────────────── leituras — banco interno ─────────────── */

// A linha do fornecedor (CODPROD = 0) e as linhas de SKU numa consulta só; a
// tela separa as duas pela coluna (RF-010, RF-011).
const SQL_PARAMETROS_LISTAR = `SELECT ID, CODFORNEC, CODFILIAL, CODPROD, COBERTURA_DIAS, LEAD_TIME_DIAS, GATILHO_DIAS,
       COALESCE(SILENCIADO_ATE, '') AS SILENCIADO_ATE,
       COALESCE(MOTIVO_SILENCIO, '') AS MOTIVO_SILENCIO,
       ATUALIZADO_POR, ATUALIZADO_EM
FROM SGC_PARAMETRO_COMPRA
WHERE CODFORNEC = {{codfornec}} AND CODFILIAL = '{{codfilial}}'
ORDER BY CODPROD
LIMIT {{limite}} OFFSET {{offset}}`;

// codprod 0 = todas as da filial (é o que alimenta o {{excluir}} da consulta
// principal); codprod > 0 = as do diálogo do SKU (RF-012).
const SQL_VENDAS_DESCONSIDERADAS = `SELECT ID, NUMTRANSITEM, CODPROD, CODFILIAL, DTMOV, QUANTIDADE,
       COALESCE(MOTIVO, '') AS MOTIVO, POR, EM
FROM SGC_VENDA_DESCONSIDERADA
WHERE CODFILIAL = '{{codfilial}}'
  AND ({{codprod}} = 0 OR CODPROD = {{codprod}})
ORDER BY DTMOV DESC, NUMTRANSITEM DESC
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-016: pedido do mesmo fornecedor e filial em qualquer fase ANTES do envio à
// indústria. A fase vem por SGC_FASE.CHAVE, nunca por id nem por nome.
const SQL_PEDIDO_ABERTO = `SELECT P.ID_CARD, C.TITULO, F.CHAVE AS FASE_CHAVE, P.CRIADO_EM
FROM SGC_PEDIDO P
JOIN KB_CARD C ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL
JOIN SGC_FASE F ON F.FASE_ID = C.FASE_ID
WHERE P.CODFORNEC = {{codfornec}}
  AND P.CODFILIAL = '{{codfilial}}'
  AND F.CHAVE IN ('analise', 'tecnica', 'diretoria', 'envio')
ORDER BY P.ID_CARD DESC
LIMIT {{limite}} OFFSET {{offset}}`;

// Layout legado (R-117 / C-035): os produtos que JÁ estão num pedido aberto do
// fornecedor na filial — a sublinha "Pedido #N aberto, ainda sem trânsito" da
// lista. Mesmas fases de RN-016, fase sempre pela CHAVE; uma execução por
// troca de filial, nada por linha.
const SQL_ITENS_PEDIDO_ABERTO = `SELECT I.CODPROD, P.ID_CARD, C.TITULO, F.CHAVE AS FASE_CHAVE, I.QT_PEDIDA
FROM SGC_PEDIDO P
JOIN KB_CARD C ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL
JOIN SGC_FASE F ON F.FASE_ID = C.FASE_ID
JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido'
WHERE P.CODFORNEC = {{codfornec}}
  AND P.CODFILIAL = '{{codfilial}}'
  AND F.CHAVE IN ('analise', 'tecnica', 'diretoria', 'envio')
ORDER BY I.CODPROD, P.ID_CARD DESC
LIMIT {{limite}} OFFSET {{offset}}`;

// R-092/RN-018: sem tabela própria — a foto da sugestão já está em
// SGC_PEDIDO_ITEM.QT_SUGERIDA, gravada pelo carrinho.
const ADERENTE = `I.QT_SUGERIDA > 0
             AND I.QT_PEDIDA >= I.QT_SUGERIDA * 0.8
             AND I.QT_PEDIDA <= I.QT_SUGERIDA * 1.2`;

const SQL_EFICIENCIA = `SELECT
  COUNT(*) AS ITENS,
  SUM(CASE WHEN ${ADERENTE} THEN 1 ELSE 0 END) AS ADERENTES,
  ROUND(100.0 * SUM(CASE WHEN ${ADERENTE} THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS PERC_ADERENCIA
FROM SGC_PEDIDO P
JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = P.ID_CARD AND I.STATUS <> 'removido'
WHERE P.ORIGEM = 'compras_inteligentes'
  AND ({{compradorId}} = 0 OR P.CRIADO_POR = {{compradorId}})
  AND ({{codfornec}} = 0 OR P.CODFORNEC = {{codfornec}})
  AND ('{{dataInicio}}' = '' OR P.CRIADO_EM >= '{{dataInicio}}')
  AND ('{{dataFim}}' = '' OR P.CRIADO_EM <= CONCAT('{{dataFim}}', 'T23:59:59'))`;

/* ─────────────── escritas SQL (uma instrução por SF, todas com :VAR_USER) ─────────────── */

// D-014: salvar NÃO toca em SILENCIADO_ATE/MOTIVO_SILENCIO e silenciar não toca
// nos três números — as duas escritas convivem na MESMA linha (UK por
// fornecedor + filial + produto) sem se apagarem.
const SQL_PARAMETRO_SALVAR = `INSERT INTO SGC_PARAMETRO_COMPRA
  (CODFORNEC, CODFILIAL, CODPROD, COBERTURA_DIAS, LEAD_TIME_DIAS, GATILHO_DIAS, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{codfilial}}', {{codprod}},
       {{coberturaDias}}, {{leadTimeDias}}, {{gatilhoDias}}, :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE {{codfornec}} > 0 AND TRIM('{{codfilial}}') <> ''
  AND {{coberturaDias}} >= 0 AND {{leadTimeDias}} >= 0 AND {{gatilhoDias}} >= 0
  AND ${guarda(PARAMETRIZAR)}
ON DUPLICATE KEY UPDATE
  COBERTURA_DIAS = VALUES(COBERTURA_DIAS),
  LEAD_TIME_DIAS = VALUES(LEAD_TIME_DIAS),
  GATILHO_DIAS   = VALUES(GATILHO_DIAS),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM  = VALUES(ATUALIZADO_EM)`;

const SQL_PARAMETRO_SILENCIAR = `INSERT INTO SGC_PARAMETRO_COMPRA
  (CODFORNEC, CODFILIAL, CODPROD, SILENCIADO_ATE, MOTIVO_SILENCIO, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{codfilial}}', {{codprod}},
       '{{silenciadoAte}}', '{{motivo}}', :VAR_USER, '{{atualizadoEm}}'
FROM DUAL
WHERE {{codprod}} > 0 AND TRIM('{{silenciadoAte}}') <> '' AND TRIM('{{motivo}}') <> ''
  AND ${guarda(PARAMETRIZAR)}
ON DUPLICATE KEY UPDATE
  SILENCIADO_ATE  = VALUES(SILENCIADO_ATE),
  MOTIVO_SILENCIO = VALUES(MOTIVO_SILENCIO),
  ATUALIZADO_POR  = VALUES(ATUALIZADO_POR),
  ATUALIZADO_EM   = VALUES(ATUALIZADO_EM)`;

const SQL_PARAMETRO_RESTAURAR = `UPDATE SGC_PARAMETRO_COMPRA
SET SILENCIADO_ATE = '', MOTIVO_SILENCIO = '', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE CODFORNEC = {{codfornec}} AND CODFILIAL = '{{codfilial}}' AND CODPROD = {{codprod}}
  AND ${guarda(PARAMETRIZAR)}`;

const SQL_VENDA_DESCONSIDERAR = `INSERT INTO SGC_VENDA_DESCONSIDERADA
  (NUMTRANSITEM, CODPROD, CODFILIAL, DTMOV, QUANTIDADE, MOTIVO, POR, EM)
SELECT {{numtransitem}}, {{codprod}}, '{{codfilial}}', '{{dtmov}}', {{quantidade}}, '{{motivo}}', :VAR_USER, '{{em}}'
FROM DUAL
WHERE {{numtransitem}} > 0 AND {{codprod}} > 0 AND TRIM('{{motivo}}') <> ''
  AND ${guarda(OPERAR)}
ON DUPLICATE KEY UPDATE MOTIVO = VALUES(MOTIVO), POR = VALUES(POR), EM = VALUES(EM)`;

const SQL_VENDA_RECONSIDERAR = `DELETE FROM SGC_VENDA_DESCONSIDERADA
WHERE NUMTRANSITEM = {{numtransitem}}
  AND ${guarda(OPERAR)}`;

// R-125 (RN-032): a venda de cada cliente por produto na janela, para cruzar
// com as políticas de preço especial. O mesmo recorte de saída da consulta
// principal (CODOPER 'S', QT > 0, filial e janela); diferenças anotadas na
// spec: a venda desconsiderada NÃO sai daqui, e a venda a órgão público fica
// de fora por padrão ({{incluirPublico}} 0), como no legado. `{{codprods}}` é
// FRAGMENTO (lista de inteiros sem aspas), como o `{{excluir}}`; a tela manda
// em lotes de 500 (teto de 4000 caracteres do literal no Oracle).
const SQL_VENDAS_CLIENTES = `SELECT
  M.CODPROD,
  M.CODCLI,
  MAX(NVL(C.CLIENTE, '')) AS CLIENTE,
  SUM(CASE WHEN M.QT > 0 THEN M.QT ELSE 0 END) AS VENDA_CLIENTE_PERIODO
FROM PCMOV M
LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
WHERE ${VENDA_VALIDA}
  AND M.CODFILIAL = '{{codfilial}}'
  AND M.DTMOV BETWEEN TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') AND TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  AND M.CODPROD IN ({{codprods}})
  AND (NOT (${PUBLICO}) OR {{incluirPublico}} = 1)
GROUP BY M.CODPROD, M.CODCLI`;

// R-130: a posição das OUTRAS filiais para a lista inteira, numa chamada por
// lote de 500 produtos (nada por linha — teto de 300/min). Mesmo estoque
// líquido de R-085 e a mesma venda dos 3 meses do `sgcWintProdutoEstoqueFiliais`:
// a tela aplica a MESMA regra de excesso da seção do painel (`filiaisComExcesso`,
// RN-025), com a cobertura alvo de cada produto — por isso a consulta devolve a
// posição, não a contagem. Só filial com estoque líquido > 0 (sem estoque não há
// excesso). `{{codprods}}` é FRAGMENTO, como no `sgcWintVendasClientesProdutos`.
const SQL_ESTOQUE_FILIAIS_PRODUTOS = `SELECT
  E.CODPROD,
  E.CODFILIAL,
  NVL(F.RAZAOSOCIAL, E.CODFILIAL) AS FILIAL,
  GREATEST(0, NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0)) AS ESTOQUE_ATUAL,
  NVL(E.QTVENDMES, 0) + NVL(E.QTVENDMES1, 0) + NVL(E.QTVENDMES2, 0) AS VENDA_3_MESES
FROM PCEST E
LEFT JOIN PCFILIAL F ON F.CODIGO = E.CODFILIAL
WHERE E.CODPROD IN ({{codprods}})
  AND E.CODFILIAL <> '{{codfilial}}'
  AND NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTINDENIZ, 0) - NVL(E.QTRESERV, 0) > 0
ORDER BY E.CODPROD, E.CODFILIAL`;

// R-130: os lotes bloqueados do produto na filial, com o motivo — a SQL do
// legado (`ci_buscar_bloqueios_produto`), sem mudança. O motivo vem, nesta
// ordem, do último PCMOVBLOQUEIO, do último PCBLOQUEIOEST, da última PCMOV com
// CODDEVOL e do PCEST; PCLOTELOG responde só QUEM e QUANDO bloqueou (a
// MATRICULA do OBSAPLICACAO '6366:<n>' em PCEMPR), nunca o motivo. A tela só
// chama ao abrir o produto e só quando QT_BLOQUEADA > 0.
const SQL_BLOQUEIOS_PRODUTO = `WITH HIST_MOV_BLOQ AS (
  SELECT * FROM (SELECT M.CODFILIAL, M.CODPROD, M.NUMLOTE, M.MOTIVO AS CODDEVOL, D.MOTIVO AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO,
      M.CODOPER, M.CODFUNCLANC, M.ROTINALANC, M.DTMOV,
      ROW_NUMBER() OVER (PARTITION BY M.CODFILIAL, M.CODPROD, NVL(M.NUMLOTE,'-') ORDER BY M.DTMOV DESC) AS RN
    FROM PCMOVBLOQUEIO M LEFT JOIN PCTABDEV D ON D.CODDEVOL = M.MOTIVO
    WHERE M.CODPROD = {{codprod}} AND M.CODFILIAL = '{{codfilial}}') WHERE RN = 1
), HIST_BLOQ_EST AS (
  SELECT * FROM (SELECT B.CODFILIAL, B.CODPROD, B.NUMLOTE, B.CODMOTIVO AS CODDEVOL, D.MOTIVO AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO,
      B.CODROTINA, B.CODOPER, B.CODFUNCLANC, B.DATA, B.DTLANC, B.TIPOBLOQ, B.OBS,
      ROW_NUMBER() OVER (PARTITION BY B.CODFILIAL, B.CODPROD, NVL(B.NUMLOTE,'-') ORDER BY NVL(B.DATA, B.DTLANC) DESC) AS RN
    FROM PCBLOQUEIOEST B LEFT JOIN PCTABDEV D ON D.CODDEVOL = B.CODMOTIVO
    WHERE B.CODPROD = {{codprod}} AND B.CODFILIAL = '{{codfilial}}') WHERE RN = 1
), HIST_MOV AS (
  SELECT * FROM (SELECT M.CODFILIAL, M.CODPROD, M.NUMLOTE, M.CODDEVOL, D.MOTIVO AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO,
      M.CODOPER, M.ROTINALANC, M.DTMOV, M.QT, M.QTBLOQUEADA,
      ROW_NUMBER() OVER (PARTITION BY M.CODFILIAL, M.CODPROD, NVL(M.NUMLOTE,'-') ORDER BY M.DTMOV DESC, ABS(NVL(M.QTBLOQUEADA,0)) DESC) AS RN
    FROM PCMOV M LEFT JOIN PCTABDEV D ON D.CODDEVOL = M.CODDEVOL
    WHERE M.CODPROD = {{codprod}} AND M.CODFILIAL = '{{codfilial}}' AND M.CODDEVOL IS NOT NULL AND NVL(M.QTBLOQUEADA,0) <> 0) WHERE RN = 1
), HIST_LOTELOG AS (
  -- PCLOTELOG responde QUEM e QUANDO, nunca POR QUE: OBSAPLICACAO '6366:<n>' traz a MATRICULA de PCEMPR, não CODDEVOL.
  -- Corte QTBLOQUEADA > QTBLOQUEADA_ANT: só o evento que bloqueou (desbloqueio parcial não entra).
  SELECT * FROM (SELECT PL.CODFILIAL, PL.CODPROD, PL.NUMLOTE,
      CASE WHEN REGEXP_LIKE(REGEXP_SUBSTR(PL.OBSAPLICACAO,'[^:]+',1,2),'^[0-9]+$') THEN TO_NUMBER(REGEXP_SUBSTR(PL.OBSAPLICACAO,'[^:]+',1,2)) END AS MATRICULA,
      PL.DATA, PL.PROGRAMA, PL.USUARIO, PL.OBSAPLICACAO, PL.QTBLOQUEADA_ANT, PL.QTBLOQUEADA,
      ROW_NUMBER() OVER (PARTITION BY PL.CODFILIAL, PL.CODPROD, NVL(PL.NUMLOTE,'-') ORDER BY PL.DATA DESC) AS RN
    FROM PCLOTELOG PL
    WHERE PL.CODPROD = {{codprod}} AND PL.CODFILIAL = '{{codfilial}}' AND NVL(PL.QTBLOQUEADA,0) > NVL(PL.QTBLOQUEADA_ANT,0)) WHERE RN = 1
), HIST_EST AS (
  SELECT E.CODFILIAL, E.CODPROD, E.CODDEVOL, COALESCE(D.MOTIVO, E.MOTIVOBLOQESTOQUE) AS MOTIVO_BLOQUEIO, D.TIPO AS TIPO_MOTIVO, E.MOTIVOBLOQESTOQUE
  FROM PCEST E LEFT JOIN PCTABDEV D ON D.CODDEVOL = E.CODDEVOL
  WHERE E.CODPROD = {{codprod}} AND E.CODFILIAL = '{{codfilial}}' AND NVL(E.QTBLOQUEADA,0) > 0
)
SELECT L.CODPROD, P.DESCRICAO, L.CODFILIAL, L.NUMLOTE,
  NVL(L.QT,0) AS QT, NVL(L.QTBLOQUEADA,0) AS QTBLOQUEADA, NVL(L.QTRESERV,0) AS QTRESERV, NVL(L.QTINDENIZ,0) AS QTINDENIZ,
  COALESCE(HMB.CODDEVOL, HBE.CODDEVOL, HM.CODDEVOL, HE.CODDEVOL) AS CODDEVOL,
  COALESCE(HMB.MOTIVO_BLOQUEIO, HBE.MOTIVO_BLOQUEIO, HM.MOTIVO_BLOQUEIO, HE.MOTIVO_BLOQUEIO) AS MOTIVO_BLOQUEIO,
  COALESCE(HMB.TIPO_MOTIVO, HBE.TIPO_MOTIVO, HM.TIPO_MOTIVO, HE.TIPO_MOTIVO) AS TIPO_MOTIVO,
  CASE WHEN HMB.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCMOVBLOQUEIO' WHEN HBE.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCBLOQUEIOEST'
       WHEN HM.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCMOV' WHEN HE.MOTIVO_BLOQUEIO IS NOT NULL THEN 'PCEST' END AS ORIGEM_MOTIVO,
  COALESCE(HMB.CODOPER, HBE.CODOPER, HM.CODOPER) AS CODOPER,
  COALESCE(HMB.CODFUNCLANC, HBE.CODFUNCLANC) AS CODFUNCLANC,
  COALESCE(HMB.ROTINALANC, HM.ROTINALANC, TO_CHAR(HBE.CODROTINA), HLL.PROGRAMA) AS ROTINALANC,
  TO_CHAR(COALESCE(HMB.DTMOV, HBE.DATA, HBE.DTLANC, HM.DTMOV, HLL.DATA),'YYYY-MM-DD') AS DTMOV_BLOQUEIO,
  HBE.TIPOBLOQ, HBE.OBS AS OBS_BLOQUEIOEST,
  HLL.PROGRAMA AS LOG_PROGRAMA, HLL.USUARIO AS LOG_USUARIO, HLL.OBSAPLICACAO AS LOG_OBSAPLICACAO, HLL.MATRICULA AS LOG_MATRICULA,
  FB.NOME AS LOG_RESPONSAVEL,
  L.MOTIVOBLOQESTOQUE, L.OBS1, L.OBS2, L.OBSANALISE, L.OBSBLOQUEIO, L.OBSBLOQUEIOMANUAL,
  TO_CHAR(L.DTBLOQUEIO1,'YYYY-MM-DD') AS DTBLOQUEIO1, TO_CHAR(L.DTBLOQUEIO2,'YYYY-MM-DD') AS DTBLOQUEIO2,
  L.CODFUNCRM, F.NOME AS FUNCIONARIO,
  TO_CHAR(L.DTULTMOVENT,'YYYY-MM-DD') AS DTULTMOVENT, TO_CHAR(L.DTULTMOVSAI,'YYYY-MM-DD') AS DTULTMOVSAI, TO_CHAR(L.DTVALIDADE,'YYYY-MM-DD') AS DTVALIDADE
FROM PCLOTE L
JOIN PCPRODUT P ON P.CODPROD = L.CODPROD
LEFT JOIN PCEMPR F ON F.MATRICULA = L.CODFUNCRM
LEFT JOIN HIST_MOV_BLOQ HMB ON HMB.CODPROD = L.CODPROD AND HMB.CODFILIAL = L.CODFILIAL AND NVL(HMB.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN HIST_BLOQ_EST HBE ON HBE.CODPROD = L.CODPROD AND HBE.CODFILIAL = L.CODFILIAL AND NVL(HBE.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN HIST_MOV HM ON HM.CODPROD = L.CODPROD AND HM.CODFILIAL = L.CODFILIAL AND NVL(HM.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN HIST_LOTELOG HLL ON HLL.CODPROD = L.CODPROD AND HLL.CODFILIAL = L.CODFILIAL AND NVL(HLL.NUMLOTE,'-') = NVL(L.NUMLOTE,'-')
LEFT JOIN PCEMPR FB ON FB.MATRICULA = HLL.MATRICULA
LEFT JOIN HIST_EST HE ON HE.CODPROD = L.CODPROD AND HE.CODFILIAL = L.CODFILIAL
WHERE L.CODPROD = {{codprod}} AND L.CODFILIAL = '{{codfilial}}' AND NVL(L.QTBLOQUEADA,0) > 0
ORDER BY L.NUMLOTE`;

// R-125 (RN-CI-38 do legado): as políticas de preço especial vigentes por
// produto, na conexão gestao-de-custos (projeto 60574: COST_POLICIES,
// POLICY_ITEMS, COST_POLICY_CLIENTS). Três origens de cliente — a lista da
// política, o CLIENTE_ID da própria política e, sem nenhum dos dois, a política
// aberta (CODCLI 0) — unidas e filtradas por custo > 0, status não encerrado e
// vigência em CURDATE(). `event.codprods` é substituição textual (lotes de 500).
// R-128: o custo de compra é o custo PADRÃO do Gestão de Custos (CUSTOPRODUTO,
// a linha de DATA_REF mais recente por produto), não o do ERP; o ERP fica como
// histórico. Sem linha, o produto fica "Sem custo" (sem fallback); a consulta
// que falha deixa a tela inteira em "Erro custo". `event.codprods` em lotes.
const CODE_CUSTO_PADRAO = JSON.stringify({
  connection: 'gestao-de-custos',
  method: 'POST',
  endpoint: 'runQuery',
  body: {
    sql: `SELECT C1.CODPROD, C1.CUSTO, C1.DATA_REF
FROM CUSTOPRODUTO C1
JOIN (
  SELECT CODPROD, MAX(DATA_REF) AS DATA_MAX
  FROM CUSTOPRODUTO
  WHERE CODPROD IN (event.codprods)
  GROUP BY CODPROD
) C2 ON C2.CODPROD = C1.CODPROD AND C2.DATA_MAX = C1.DATA_REF`,
  },
});

const CODE_CUSTOS_ESPECIAIS = JSON.stringify({
  connection: 'gestao-de-custos',
  method: 'POST',
  endpoint: 'runQuery',
  body: {
    sql: `SELECT DISTINCT Q.CODPROD, Q.CODCLI, Q.CUSTO_ESPECIAL, Q.VARIACAO_PERCENTUAL, Q.POLITICA_ID, Q.POLITICA_NOME, Q.DATA_FIM
FROM (
  SELECT I.PRODUCT_ID AS CODPROD, C.CLIENTE_ID AS CODCLI, I.SPECIAL_COST AS CUSTO_ESPECIAL, I.VARIATION_PERCENT AS VARIACAO_PERCENTUAL,
         P.ID AS POLITICA_ID, P.NAME AS POLITICA_NOME, P.STATUS AS POLITICA_STATUS, P.DT_START AS DATA_INICIO, P.DT_END AS DATA_FIM
    FROM COST_POLICIES P
    JOIN POLICY_ITEMS I ON I.POLICY_ID = P.ID
    JOIN COST_POLICY_CLIENTS C ON C.POLICY_ID = P.ID
  UNION ALL
  SELECT I.PRODUCT_ID, P.CLIENTE_ID, I.SPECIAL_COST, I.VARIATION_PERCENT, P.ID, P.NAME, P.STATUS, P.DT_START, P.DT_END
    FROM COST_POLICIES P
    JOIN POLICY_ITEMS I ON I.POLICY_ID = P.ID
   WHERE COALESCE(P.CLIENTE_ID, 0) > 0
  UNION ALL
  SELECT I.PRODUCT_ID, 0, I.SPECIAL_COST, I.VARIATION_PERCENT, P.ID, P.NAME, P.STATUS, P.DT_START, P.DT_END
    FROM COST_POLICIES P
    JOIN POLICY_ITEMS I ON I.POLICY_ID = P.ID
   WHERE P.CLIENTE_ID IS NULL
     AND NOT EXISTS (SELECT 1 FROM COST_POLICY_CLIENTS X WHERE X.POLICY_ID = P.ID)
) Q
WHERE Q.CODPROD IN (event.codprods)
  AND COALESCE(Q.CUSTO_ESPECIAL, 0) > 0
  AND UPPER(COALESCE(Q.POLITICA_STATUS, 'ATIVA')) NOT IN ('INATIVA', 'INACTIVE', 'CANCELADA', 'CANCELADO', 'REJEITADA', 'REPROVADA')
  AND (Q.DATA_INICIO IS NULL OR Q.DATA_INICIO = '' OR Q.DATA_INICIO <= CURDATE())
  AND (Q.DATA_FIM IS NULL OR Q.DATA_FIM = '' OR Q.DATA_FIM >= CURDATE())`,
  },
});

/* ─────────────── a lista publicada ─────────────── */

const LEITURAS = [
  {
    name: 'sgcWintRessuprimento',
    code: SQL_RESSUPRIMENTO,
    resumo: 'RF-001..RF-005/RF-013 (R-082..R-087) - uma linha por produto ativo do fornecedor na filial, com MEDIDAS: estoque liquido e parcelas, transito, lead time medido, venda do periodo (publica a parte), faturamento e rentabilidade do periodo (R-122: QT x PUNIT e QT x (PUNIT - CUSTOFIN) da PCMOV, para as curvas de faturamento e de rentabilidade), consumo ponderado por recencia e volatilidade. Sem formula e sem paginacao (a curva ABC e acumulada sobre o fornecedor inteiro). Params: codfornec int, codfilial string, dataInicio string, dataFim string, diasPeriodo int, excluir lista de NUMTRANSITEM (fragmento, 0 = nenhuma, teto 500)',
  },
  {
    name: 'sgcWintProdutoHistorico',
    code: SQL_PRODUTO_HISTORICO,
    resumo: 'RF-020 - saidas, entradas e saidas publicas por mes nos ultimos N meses. Params: codprod int, codfilial string, meses int',
  },
  {
    name: 'sgcWintProdutoUltimasCompras',
    code: SQL_PRODUTO_ULTIMAS_COMPRAS,
    resumo: 'RF-020 - as 10 ultimas entradas do produto, com nota, quantidade e preco. Params: codprod int',
  },
  {
    name: 'sgcWintProdutoEstoqueFiliais',
    code: SQL_PRODUTO_ESTOQUE_FILIAIS,
    resumo: 'RF-020 - a posicao do produto em todas as filiais, com o mesmo estoque liquido de R-085. Params: codprod int',
  },
  {
    name: 'sgcWintProdutoVendas',
    code: SQL_PRODUTO_VENDAS,
    resumo: 'RF-012 - as vendas do produto na janela, maiores primeiro (teto 50), com o NUMTRANSITEM que identifica a venda a desconsiderar. Params: codprod int, codfilial string, dataInicio string, dataFim string',
  },
  {
    name: 'sgcWintVendasClientesProdutos',
    code: SQL_VENDAS_CLIENTES,
    resumo: 'R-125/RN-032 - venda de cada cliente por produto na janela (CODPROD, CODCLI, CLIENTE, VENDA_CLIENTE_PERIODO), para as oportunidades com custo especial. Params: codprods fragmento (lotes de 500), codfilial string, dataInicio string, dataFim string, incluirPublico int (0 = sem orgao publico)',
  },
  {
    name: 'sgcWintEstoqueFiliaisProdutos',
    code: SQL_ESTOQUE_FILIAIS_PRODUTOS,
    resumo: 'R-130/RN-037 - posicao das OUTRAS filiais com estoque liquido > 0 (CODPROD, CODFILIAL, FILIAL, ESTOQUE_ATUAL, VENDA_3_MESES), para o selo e o filtro de excesso da lista; a tela aplica a regra de excesso da RN-025. Params: codprods fragmento (lotes de 500), codfilial string (a filial da tela, que fica de fora)',
  },
  {
    name: 'sgcWintBloqueiosProduto',
    code: SQL_BLOQUEIOS_PRODUTO,
    resumo: 'R-130/RN-038 - lotes com QTBLOQUEADA > 0 do produto na filial, com o motivo (PCMOVBLOQUEIO, PCBLOQUEIOEST, PCMOV, PCEST), quem bloqueou (PCLOTELOG + PCEMPR), reservado, indenizado, datas e validade; SQL do legado ci_buscar_bloqueios_produto. Params: codprod int, codfilial string',
  },
  {
    name: 'sgcParametrosCompraListar',
    code: SQL_PARAMETROS_LISTAR,
    resumo: 'RF-010/RF-011 - parametros de compra do fornecedor + filial: a linha do fornecedor (CODPROD = 0) e as linhas de SKU. Params: codfornec int, codfilial string, limite int, offset int',
  },
  {
    name: 'sgcVendasDesconsideradasListar',
    code: SQL_VENDAS_DESCONSIDERADAS,
    resumo: 'RF-012 - vendas desconsideradas da filial (codprod 0 = todas, e o que alimenta o {{excluir}} da consulta principal). Params: codfilial string, codprod int, limite int, offset int',
  },
  {
    name: 'sgcPedidoAbertoDoFornecedor',
    code: SQL_PEDIDO_ABERTO,
    resumo: 'RF-018/RN-016 - pedido do mesmo fornecedor e filial em fase anterior ao envio a industria (analise, tecnica, diretoria, envio), para o carrinho recusar citando o card e a fase. Params: codfornec int, codfilial string, limite int, offset int',
  },
  {
    name: 'sgcEficienciaComprador',
    code: SQL_EFICIENCIA,
    resumo: 'RF-021/RN-018 (R-092) - aderencia do comprador: % de itens de pedidos originados das compras inteligentes com QT_PEDIDA dentro de +-20% da QT_SUGERIDA. Params: compradorId int, codfornec int, dataInicio string, dataFim string',
  },
  {
    name: 'sgcWintResumoFornecedores',
    code: SQL_RESUMO_FORNECEDORES,
    resumo: 'RF-024/RN-026 (R-117) - por fornecedor da lista: itens ativos e valor sugerido ESTIMADO (venda dos ultimos N dias, cobertura 35, estoque e pedido ao ERP em todas as filiais, custo da ultima entrada), para o rotulo do seletor. Params: codfornecs lista de CODFORNEC (fragmento), dataInicio string, diasPeriodo int',
  },
  {
    name: 'sgcItensEmPedidoAberto',
    code: SQL_ITENS_PEDIDO_ABERTO,
    resumo: 'RF-025/C-035 (R-117) - produtos que ja estao em pedido aberto (analise, tecnica, diretoria, envio) do fornecedor na filial, com o card e a fase pela CHAVE. Params: codfornec int, codfilial string, limite int, offset int',
  },
];

const ESCRITAS = [
  {
    name: 'sgcEscParametroCompraSalvar',
    code: SQL_PARAMETRO_SALVAR,
    resumo: 'RF-010 - upsert de cobertura, lead time e gatilho por fornecedor (codprod 0) ou por SKU; 0 = herda. NAO toca no silenciamento (D-014). Params: codfornec int, codfilial string, codprod int, coberturaDias int, leadTimeDias int, gatilhoDias int, atualizadoEm string',
  },
  {
    name: 'sgcEscParametroCompraSilenciar',
    code: SQL_PARAMETRO_SILENCIAR,
    resumo: 'RF-011/RN-013 - upsert so do silenciamento do SKU (data ate quando e motivo, os dois obrigatorios). NAO toca nos tres numeros (D-014). Params: codfornec int, codfilial string, codprod int, silenciadoAte string, motivo string, atualizadoEm string',
  },
  {
    name: 'sgcEscParametroCompraRestaurar',
    code: SQL_PARAMETRO_RESTAURAR,
    resumo: 'RF-011 - limpa o silenciamento do SKU e devolve o produto a fila de compra. Params: codfornec int, codfilial string, codprod int, atualizadoEm string',
  },
  {
    name: 'sgcEscVendaDesconsiderar',
    code: SQL_VENDA_DESCONSIDERAR,
    resumo: 'RF-012/RN-012 - tira uma venda da demanda, com motivo; idempotente por NUMTRANSITEM. Params: numtransitem int, codprod int, codfilial string, dtmov string, quantidade decimal, motivo string, em string',
  },
  {
    name: 'sgcEscVendaReconsiderar',
    code: SQL_VENDA_RECONSIDERAR,
    resumo: 'RF-012 - devolve a venda a demanda. Params: numtransitem int',
  },
];

// T-011: nenhuma definicao desta spec e JAVASCRIPT e nenhuma tem cron (R-081).
// R-125: a unica INTEGRATION e a das politicas de preco especial, no molde da
// sgcCustoUnidadesPorCaixa da 003.
export const definitions = [
  ...[...LEITURAS, ...ESCRITAS].map((f) => ({
    name: f.name,
    type: 'SQL',
    description: f.resumo,
    code: f.code,
  })),
  {
    name: 'sgcCustoPadraoAtual',
    type: 'INTEGRATION',
    description: 'R-128 - custo padrao atual por produto (CODPROD, CUSTO, DATA_REF: a linha de DATA_REF mais recente da CUSTOPRODUTO), da conexao gestao-de-custos. Params: codprods lista (lotes de 500)',
    code: CODE_CUSTO_PADRAO,
  },
  {
    name: 'sgcCustoEspeciaisProdutos',
    type: 'INTEGRATION',
    description: 'R-125/RN-032 - politicas de preco especial vigentes por produto (CODPROD, CODCLI, CUSTO_ESPECIAL, VARIACAO_PERCENTUAL, POLITICA_ID, POLITICA_NOME, DATA_FIM), da conexao gestao-de-custos. Params: codprods lista (lotes de 500)',
    code: CODE_CUSTOS_ESPECIAIS,
  },
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

  console.log(`Pronto: ${definitions.length} server functions da spec 011 (compras inteligentes).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
