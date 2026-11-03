// add-016 — Server Functions da spec 014 (pedido Galderma): a mesa de
// negociação mensal com a Galderma (fornecedor 1541), o acompanhamento
// proposta × realizado e a composição por filial. Ver
// docs/specs/014-pedido-galderma/.
//
// Faixa de id local: 84xx (R-150 do 000) — leituras 8401-8415, escritas
// 8450-8467. As do ERP se chamam sgcWint* e entram em WINTHOR (recebem o
// jdbcId por nome na publicação).
//
// NENHUMA definição aqui é JAVASCRIPT e nenhuma tem cron: a regra (linha da
// filial, grupo, caixa, metas) é pura na tela (`lib/galderma.ts`) e o pedido de
// compra nasce pelo caminho do carrinho da 011 (R-091) — kbCardCriar +
// sgcEscGaldCardRegistrar + sgcEscGaldPedidoCapaCriar + sgcItensGravar,
// chamadas da tela. A negociação não é card (plan, "Como se liga ao kanban").
//
// As tabelas SGC_GALD_* estão no `setup-backend.mjs` (DDL_014).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-016-galderma.mjs

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { PUBLICO, VENDA_VALIDA } from './venda-valida.mjs';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintGaldProdutos', 'sgcWintGaldPosicao', 'sgcWintGaldRealizadoMensal',
  'sgcWintGaldEstoqueInicial', 'sgcWintGaldComposicao', 'sgcWintGaldEstoqueAtual'];

/** RN-PG-01 do legado: a mesa é da Galderma, fornecedor fixo — constante, nunca parâmetro. */
export const GALDERMA = 1541;

/* ──────────────────────────────────────────────────────────────────────────
   Guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente de
   add-014-coberturas-abc.mjs; só a lista de personas muda. `:VAR_USER` vale
   porque toda escrita desta spec é chamada direto da tela.
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas, quem = ':VAR_USER') {
  const lista = personas.map((p) => `'${p}'`).join(', ');
  return `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${quem}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN (${lista})
  )`;
}

/** RN-015 (P-10): operam admin, analista e gestor; a diretoria lê. */
const OPERAR = ['admin', 'analista', 'gestor'];

/**
 * RF-003: a venda da Galderma é a venda válida da R-131 (sem venda entre
 * filiais e sem remessa de entrega futura) e SEM órgão público, sempre — a
 * mesa não tem seletor, como o legado. Exige PCMOV `M` e `LEFT JOIN PCCLIENT C`.
 */
const VENDA_GALDERMA = `(${VENDA_VALIDA} AND NOT (${PUBLICO}))`;

/** RN-005: o dia inteiro conta, inclusive o último (`DTMOV` grava hora no WinThor). */
const entre = (inicio, fim) => `M.DTMOV >= TO_DATE('{{${inicio}}}', 'YYYY-MM-DD')
    AND TRUNC(M.DTMOV) <= TO_DATE('{{${fim}}}', 'YYYY-MM-DD')`;

/** RN-PG-22: o disponível é físico − bloqueado − reservado, nunca negativo (o QTINDENIZ da R-085 não entra). */
const DISPONIVEL = 'GREATEST(NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTRESERV, 0), 0)';

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// RN-PG-13: o catálogo da mesa — ativos (OBS2 vazio) do fornecedor; o EAN é o
// CODAUXILIAR, contra o qual a planilha da indústria casa (RN-010).
const SQL_PRODUTOS = `SELECT P.CODPROD, P.DESCRICAO, P.CODAUXILIAR AS EAN, P.EMBALAGEM, P.UNIDADE,
  NVL(P.QTUNITCX, 0) AS UN_POR_CAIXA_ERP
FROM PCPRODUT P
WHERE P.CODFORNEC = ${GALDERMA}
  AND NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
ORDER BY P.DESCRICAO`;

// RF-002 / C-002 / C-003. Uma passada só na PCMOV, de `dataInicioTri` a
// `dataFimMes` (o trimestre termina na véspera do mês, então as janelas são
// contíguas), com um CASE por janela. Trânsito = pedido pendente + trânsito
// (o SQL vivo do legado, `fix-galderma-transito-pedidos-pendentes`, e a R-085).
// `codprods` e `filiais` são FRAGMENTOS: `codprods` só dígitos e vírgulas,
// `filiais` a lista entre aspas ('1','2') — validados por `listaDeCodigos` na tela.
const SQL_POSICAO = `SELECT
  P.CODPROD,
  F.CODIGO AS CODFILIAL,
  F.RAZAOSOCIAL AS FILIAL,
  ${DISPONIVEL} AS QTEST,
  NVL(E.QTEST, 0) AS QTEST_FISICO,
  NVL(E.QTBLOQUEADA, 0) AS QTBLOQUEADA,
  NVL(E.QTRESERV, 0) AS QTRESERV,
  NVL(E.QTPEDIDA, 0) AS QT_PEDIDA_ERP,
  NVL(T.QTTRANSITO, 0) AS QT_TRANSITO,
  NVL(E.QTPEDIDA, 0) + NVL(T.QTTRANSITO, 0) AS EM_TRANSITO,
  NVL(MV.VENDA_MES, 0) AS VENDA_MES,
  NVL(MV.VENDA_TRIMESTRE, 0) AS VENDA_TRIMESTRE,
  NVL(MV.COMPRA_MES, 0) AS COMPRA_MES
FROM PCPRODUT P
CROSS JOIN PCFILIAL F
LEFT JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = F.CODIGO
LEFT JOIN (
  SELECT CODPROD, CODFILIAL, SUM(NVL(QTTRANSITO, 0)) AS QTTRANSITO
  FROM PCESTTRANSITO GROUP BY CODPROD, CODFILIAL
) T ON T.CODPROD = P.CODPROD AND T.CODFILIAL = F.CODIGO
LEFT JOIN (
  SELECT M.CODPROD, M.CODFILIAL,
    SUM(CASE WHEN TRUNC(M.DTMOV) >= TO_DATE('{{dataInicioMes}}', 'YYYY-MM-DD') AND ${VENDA_GALDERMA}
      THEN M.QT ELSE 0 END) AS VENDA_MES,
    SUM(CASE WHEN TRUNC(M.DTMOV) <= TO_DATE('{{dataFimTri}}', 'YYYY-MM-DD') AND ${VENDA_GALDERMA}
      THEN M.QT ELSE 0 END) AS VENDA_TRIMESTRE,
    SUM(CASE WHEN TRUNC(M.DTMOV) >= TO_DATE('{{dataInicioMes}}', 'YYYY-MM-DD') AND M.CODOPER = 'E'
      THEN NVL(M.QT, 0) ELSE 0 END) AS COMPRA_MES
  FROM PCMOV M
  JOIN PCPRODUT PM ON PM.CODPROD = M.CODPROD AND PM.CODFORNEC = ${GALDERMA}
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE ${entre('dataInicioTri', 'dataFimMes')}
    AND M.CODOPER IN ('S', 'E')
    AND M.CODPROD IN ({{codprods}})
  GROUP BY M.CODPROD, M.CODFILIAL
) MV ON MV.CODPROD = P.CODPROD AND MV.CODFILIAL = F.CODIGO
WHERE P.CODFORNEC = ${GALDERMA}
  AND P.CODPROD IN ({{codprods}})
  AND TRIM(F.CODIGO) IN ({{filiais}})
ORDER BY P.CODPROD, F.CODIGO`;

// RN-012 (RN-AG-14 do legado): o realizado por produto × filial × mês, venda
// válida sem público e compra, em unidades e em reais (QT × PUNIT, histórico do ERP).
const SQL_REALIZADO_MENSAL = `SELECT M.CODPROD, M.CODFILIAL, TO_CHAR(M.DTMOV, 'YYYY-MM') AS MES,
  SUM(CASE WHEN ${VENDA_GALDERMA} THEN M.QT ELSE 0 END) AS VENDA_REALIZADA,
  SUM(CASE WHEN ${VENDA_GALDERMA} THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END) AS VALOR_VENDA,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) ELSE 0 END) AS COMPRA_REALIZADA,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) * NVL(M.PUNIT, 0) ELSE 0 END) AS VALOR_COMPRA
FROM PCMOV M
JOIN PCPRODUT P ON P.CODPROD = M.CODPROD AND P.CODFORNEC = ${GALDERMA}
LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
WHERE ${entre('dataInicio', 'dataFim')}
  AND M.CODOPER IN ('S', 'E')
GROUP BY M.CODPROD, M.CODFILIAL, TO_CHAR(M.DTMOV, 'YYYY-MM')
ORDER BY 3, 1, 2`;

// RN-013 / C-026 (RN-AG-18 do legado, com o `fix-galderma-venda-entrega-futura`):
// estoque físico de hoje − entradas + saídas físicas desde `dataInicio`, sem
// movimento cancelado. A nota de venda de entrega futura (CONDVENDA 7) não tira
// do estoque — quem tira é a remessa —, então não conta como saída aqui.
const SQL_ESTOQUE_INICIAL = `SELECT E.CODPROD, E.CODFILIAL,
  NVL(E.QTEST, 0) AS QTEST_HOJE,
  NVL(MV.ENTRADAS, 0) AS ENTRADAS,
  NVL(MV.SAIDAS, 0) AS SAIDAS,
  NVL(E.QTEST, 0) - NVL(MV.ENTRADAS, 0) + NVL(MV.SAIDAS, 0) AS ESTOQUE_INICIAL
FROM PCEST E
JOIN PCPRODUT P ON P.CODPROD = E.CODPROD AND P.CODFORNEC = ${GALDERMA}
LEFT JOIN (
  SELECT M.CODPROD, M.CODFILIAL,
    SUM(CASE WHEN M.CODOPER LIKE 'E%' THEN NVL(M.QT, 0) ELSE 0 END) AS ENTRADAS,
    SUM(CASE WHEN M.CODOPER LIKE 'S%'
      AND NOT EXISTS (SELECT 1 FROM PCNFSAID NF WHERE NF.NUMTRANSVENDA = M.NUMTRANSVENDA AND NF.CONDVENDA = 7)
      THEN NVL(M.QT, 0) ELSE 0 END) AS SAIDAS
  FROM PCMOV M
  JOIN PCPRODUT PM ON PM.CODPROD = M.CODPROD AND PM.CODFORNEC = ${GALDERMA}
  WHERE M.DTMOV >= TO_DATE('{{dataInicio}}', 'YYYY-MM-DD')
    AND M.DTCANCEL IS NULL
  GROUP BY M.CODPROD, M.CODFILIAL
) MV ON MV.CODPROD = E.CODPROD AND MV.CODFILIAL = E.CODFILIAL
WHERE E.CODFILIAL <> '99'
ORDER BY E.CODPROD, E.CODFILIAL`;

// RN-014 / C-029 (RN-AG-46 do legado): compra (sell-in) e venda válida sem
// público, por filial. O "grupo" é a soma, feita na tela — sem `granularidade`.
const SQL_COMPOSICAO = `SELECT M.CODFILIAL, MAX(F.RAZAOSOCIAL) AS FILIAL,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) * NVL(M.PUNIT, 0) ELSE 0 END) AS VALOR_SELLIN,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) ELSE 0 END) AS QTD_SELLIN,
  SUM(CASE WHEN ${VENDA_GALDERMA} THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END) AS VALOR_VENDAS,
  SUM(CASE WHEN ${VENDA_GALDERMA} THEN M.QT ELSE 0 END) AS QTD_VENDAS
FROM PCMOV M
JOIN PCPRODUT P ON P.CODPROD = M.CODPROD AND P.CODFORNEC = ${GALDERMA}
JOIN PCFILIAL F ON F.CODIGO = M.CODFILIAL
LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
WHERE ${entre('dataInicio', 'dataFim')}
  AND M.CODOPER IN ('S', 'E')
  AND M.CODFILIAL <> '99'
GROUP BY M.CODFILIAL
ORDER BY M.CODFILIAL`;

// C-030 (RN-AG-48 do legado): a posição de agora por produto × filial. O valor
// é quantidade × custo padrão do Gestão de Custos, na tela (R-128) — por isso a
// consulta devolve o produto e não o valor já somado (o legado usava CUSTOULTENT).
const SQL_ESTOQUE_ATUAL = `SELECT E.CODPROD, E.CODFILIAL, F.RAZAOSOCIAL AS FILIAL,
  ${DISPONIVEL} AS QT_DISPONIVEL,
  NVL(E.QTEST, 0) AS QT_FISICO
FROM PCEST E
JOIN PCPRODUT P ON P.CODPROD = E.CODPROD AND P.CODFORNEC = ${GALDERMA}
JOIN PCFILIAL F ON F.CODIGO = E.CODFILIAL
WHERE F.CODIGO <> '99'
  AND NVL(E.QTEST, 0) > 0
ORDER BY E.CODFILIAL, E.CODPROD`;

/* ─────────────── leituras — banco do projeto ─────────────── */

// RN-PG-09: a mais recente primeiro. COMPLEMENTARES e CARDS: a tela decide o
// "criar a partir de" (P-08) e a faixa "Convertida em pedido" sem outra leitura.
const SQL_NEGOCIACOES_LISTAR = `SELECT N.ID, N.COMPETENCIA, N.DATA_PEDIDO, N.DESCRICAO, N.FILIAIS,
  N.COBERTURA_ALVO_DIAS, N.TRANSITO_COMO_COMPRA, N.META_SELLOUT_VALOR, N.OBSERVACAO, N.STATUS,
  N.ID_PAI, N.CRIADO_POR, COALESCE(U.NOME, '') AS CRIADO_POR_NOME, N.CRIADO_EM, N.ATUALIZADO_EM,
  (SELECT COUNT(*) FROM SGC_GALD_NEGOCIACAO NF WHERE NF.ID_PAI = N.ID) AS COMPLEMENTARES,
  (SELECT COUNT(*) FROM SGC_GALD_NEGOCIACAO_CARD NC WHERE NC.ID_NEGOCIACAO = N.ID) AS CARDS
FROM SGC_GALD_NEGOCIACAO N
LEFT JOIN INT_USER U ON U.ID = N.CRIADO_POR
ORDER BY N.DATA_PEDIDO DESC, N.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-PG-18: por código crescente.
const SQL_ITENS_LISTAR = `SELECT I.ID, I.ID_NEGOCIACAO, I.CODPROD, I.EAN, I.DESCRICAO,
  I.PRECO_SELLOUT, I.PRECO_NET, I.PRECO_LISTA, I.PRECO_LISTA_DESC, I.ESTOQUE_INICIAL,
  I.MEDIA_SELLOUT, I.PREVISAO_SELLOUT, I.PROPOSTA_SELLIN, I.META_SELLIN_VALOR, I.OBSERVACAO,
  I.CRIADO_EM, I.ATUALIZADO_EM
FROM SGC_GALD_ITEM I
WHERE I.ID_NEGOCIACAO = {{idNegociacao}}
ORDER BY I.CODPROD
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_PEDIDOS_FILIAL_LISTAR = `SELECT PF.ID_ITEM, I.CODPROD, PF.CODFILIAL, PF.QTD_PEDIDA
FROM SGC_GALD_ITEM_FILIAL PF
JOIN SGC_GALD_ITEM I ON I.ID = PF.ID_ITEM
WHERE I.ID_NEGOCIACAO = {{idNegociacao}}
ORDER BY I.CODPROD, PF.CODFILIAL
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-008: o que a de origem (um nível) pediu, por produto × filial.
const SQL_HERDADO_LISTAR = `SELECT I.CODPROD, PF.CODFILIAL, SUM(PF.QTD_PEDIDA) AS QTD_HERDADA
FROM SGC_GALD_NEGOCIACAO N
JOIN SGC_GALD_ITEM I ON I.ID_NEGOCIACAO = N.ID_PAI
JOIN SGC_GALD_ITEM_FILIAL PF ON PF.ID_ITEM = I.ID
WHERE N.ID = {{idNegociacao}} AND N.ID_PAI > 0
GROUP BY I.CODPROD, PF.CODFILIAL
ORDER BY I.CODPROD, PF.CODFILIAL
LIMIT {{limite}} OFFSET {{offset}}`;

// RF-006: do mais recente para o mais antigo; o produto pela descrição do item.
const SQL_DECISAO_LOG_LISTAR = `SELECT L.ID, L.ID_ITEM, L.CODPROD, COALESCE(I.DESCRICAO, '') AS DESCRICAO,
  L.CODFILIAL, L.CAMPO, L.ANTES, L.DEPOIS, L.POR, COALESCE(U.NOME, '') AS POR_NOME, L.EM
FROM SGC_GALD_DECISAO_LOG L
LEFT JOIN SGC_GALD_ITEM I ON I.ID = L.ID_ITEM
LEFT JOIN INT_USER U ON U.ID = L.POR
WHERE L.ID_NEGOCIACAO = {{idNegociacao}}
ORDER BY L.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-009 / C-016: o que já nasceu, por filial — e se a capa já está gravada
// (vínculo sem capa = geração interrompida: a tela refaz capa e itens no mesmo card).
const SQL_CARDS_LISTAR = `SELECT NC.CODFILIAL, NC.ID_CARD,
  CASE WHEN EXISTS (SELECT 1 FROM SGC_PEDIDO P WHERE P.ID_CARD = NC.ID_CARD) THEN 1 ELSE 0 END AS TEM_CAPA,
  NC.EM
FROM SGC_GALD_NEGOCIACAO_CARD NC
WHERE NC.ID_NEGOCIACAO = {{idNegociacao}}
ORDER BY NC.CODFILIAL
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-012 / C-022 / C-027 (P-09): proposta, previsão e estoque informado só das
// negociações que não são complementares (ID_PAI = 0) — somar a complementar
// duplicaria a meta; o pedido enviado soma todas.
const SQL_ACOMPANHAMENTO = `SELECT I.CODPROD, N.COMPETENCIA,
  MAX(I.DESCRICAO) AS DESCRICAO, MAX(I.EAN) AS EAN,
  MAX(I.PRECO_SELLOUT) AS PRECO_SELLOUT, MAX(I.PRECO_NET) AS PRECO_NET,
  MAX(I.PRECO_LISTA) AS PRECO_LISTA, MAX(I.PRECO_LISTA_DESC) AS PRECO_LISTA_DESC,
  SUM(CASE WHEN N.ID_PAI = 0 THEN I.ESTOQUE_INICIAL ELSE 0 END) AS ESTOQUE_INICIAL,
  SUM(CASE WHEN N.ID_PAI = 0 THEN I.MEDIA_SELLOUT ELSE 0 END) AS MEDIA_SELLOUT,
  SUM(CASE WHEN N.ID_PAI = 0 THEN I.PREVISAO_SELLOUT ELSE 0 END) AS PREVISAO_SELLOUT,
  SUM(CASE WHEN N.ID_PAI = 0 THEN I.PROPOSTA_SELLIN ELSE 0 END) AS PROPOSTA_SELLIN,
  SUM(CASE WHEN N.ID_PAI = 0 THEN I.META_SELLIN_VALOR ELSE 0 END) AS META_SELLIN_VALOR,
  SUM(COALESCE(PF.QTD, 0)) AS PEDIDO_ENVIADO
FROM SGC_GALD_ITEM I
JOIN SGC_GALD_NEGOCIACAO N ON N.ID = I.ID_NEGOCIACAO
LEFT JOIN (
  SELECT ID_ITEM, SUM(QTD_PEDIDA) AS QTD FROM SGC_GALD_ITEM_FILIAL GROUP BY ID_ITEM
) PF ON PF.ID_ITEM = I.ID
WHERE N.COMPETENCIA >= '{{competenciaInicio}}' AND N.COMPETENCIA <= '{{competenciaFim}}'
GROUP BY I.CODPROD, N.COMPETENCIA
ORDER BY N.COMPETENCIA, I.CODPROD
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_SELLOUT_LISTAR = `SELECT S.CODPROD, S.COMPETENCIA, S.PREVISAO_SELLOUT,
  COALESCE(U.NOME, '') AS POR_NOME, S.ATUALIZADO_EM
FROM SGC_GALD_SELLOUT S
LEFT JOIN INT_USER U ON U.ID = S.ATUALIZADO_POR
WHERE S.COMPETENCIA >= '{{competenciaInicio}}' AND S.COMPETENCIA <= '{{competenciaFim}}'
ORDER BY S.COMPETENCIA, S.CODPROD
LIMIT {{limite}} OFFSET {{offset}}`;

// RN-AG-43: produto nunca negociado sai sem descrição (a tela escreve "Produto N").
const SQL_SELLOUT_LOG_LISTAR = `SELECT L.ID, L.CODPROD, L.COMPETENCIA,
  COALESCE((SELECT MAX(I.DESCRICAO) FROM SGC_GALD_ITEM I WHERE I.CODPROD = L.CODPROD), '') AS DESCRICAO,
  L.ANTES, L.DEPOIS, L.ORIGEM_ANTERIOR, L.POR, COALESCE(U.NOME, '') AS POR_NOME, L.EM
FROM SGC_GALD_SELLOUT_LOG L
LEFT JOIN INT_USER U ON U.ID = L.POR
WHERE L.COMPETENCIA >= '{{competenciaInicio}}' AND L.COMPETENCIA <= '{{competenciaFim}}'
ORDER BY L.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

/* ─────────────── escritas SQL (uma instrução por SF) ─────────────── */

/**
 * RN-007: a negociação aceita a escrita? `aberta` exige a situação aberta (itens
 * e pedidos por filial, RN-PG-12); sem ela, basta não estar convertida
 * (cabeçalho, P-06). Convertida é terminal NO SERVIDOR (P-07, C-017).
 */
const negociacao = (id, { aberta = false } = {}) => `EXISTS (
    SELECT 1 FROM SGC_GALD_NEGOCIACAO NG
    WHERE NG.ID = ${id} AND ${aberta ? "NG.STATUS = 'aberta'" : "NG.STATUS <> 'convertida'"}
  )`;

/** A negociação do item, para as escritas que só recebem `idItem`. */
const doItem = (idItem, opcoes) => `EXISTS (
    SELECT 1 FROM SGC_GALD_ITEM IT
    WHERE IT.ID = ${idItem} AND ${negociacao('IT.ID_NEGOCIACAO', opcoes)}
  )`;

/** Sem pedido gerado: excluir uma negociação com geração começada deixaria pedidos sem origem. */
const semCards = (id) => `NOT EXISTS (SELECT 1 FROM SGC_GALD_NEGOCIACAO_CARD NC WHERE NC.ID_NEGOCIACAO = ${id})`;

// RF-001 / C-001 / RN-008 (P-08): a de origem precisa estar convertida, ser da
// mesma competência e não ter complementar ainda.
const SQL_NEGOCIACAO_CRIAR = `INSERT INTO SGC_GALD_NEGOCIACAO
  (COMPETENCIA, DATA_PEDIDO, DESCRICAO, FILIAIS, COBERTURA_ALVO_DIAS, TRANSITO_COMO_COMPRA,
   META_SELLOUT_VALOR, OBSERVACAO, STATUS, ID_PAI, CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT '{{competencia}}', '{{dataPedido}}', '{{descricao}}', '{{filiais}}', {{coberturaAlvoDias}},
  {{transitoComoCompra}}, {{metaSelloutValor}}, '{{observacao}}', 'aberta', {{idPai}},
  :VAR_USER, '{{agora}}', :VAR_USER, '{{agora}}'
FROM DUAL
WHERE TRIM('{{filiais}}') <> '' AND LENGTH('{{competencia}}') = 7
  AND ({{idPai}} = 0 OR EXISTS (
    SELECT 1 FROM SGC_GALD_NEGOCIACAO PAI
    WHERE PAI.ID = {{idPai}} AND PAI.STATUS = 'convertida' AND PAI.COMPETENCIA = '{{competencia}}'
      AND NOT EXISTS (SELECT 1 FROM SGC_GALD_NEGOCIACAO OUTRA WHERE OUTRA.ID_PAI = PAI.ID)
  ))
  AND ${guarda(OPERAR)}`;

// RN-PG-85: a origem não muda; a complementar não troca de competência (o herdado é do mesmo mês).
const SQL_NEGOCIACAO_ATUALIZAR = `UPDATE SGC_GALD_NEGOCIACAO SET
  COMPETENCIA = '{{competencia}}', DATA_PEDIDO = '{{dataPedido}}', DESCRICAO = '{{descricao}}',
  FILIAIS = '{{filiais}}', COBERTURA_ALVO_DIAS = {{coberturaAlvoDias}},
  TRANSITO_COMO_COMPRA = {{transitoComoCompra}}, META_SELLOUT_VALOR = {{metaSelloutValor}},
  OBSERVACAO = '{{observacao}}', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{id}} AND STATUS <> 'convertida'
  AND TRIM('{{filiais}}') <> '' AND LENGTH('{{competencia}}') = 7
  AND (ID_PAI = 0 OR COMPETENCIA = '{{competencia}}')
  AND ${guarda(OPERAR)}`;

// RN-007: aberta ⇄ fechada; convertida só pela geração (8464).
const SQL_NEGOCIACAO_SITUACAO = `UPDATE SGC_GALD_NEGOCIACAO SET
  STATUS = '{{status}}', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{id}} AND STATUS IN ('aberta', 'fechada') AND '{{status}}' IN ('aberta', 'fechada')
  AND ${guarda(OPERAR)}`;

// C-013 (RN-PG-11): três passos, filhos primeiro; o histórico de decisões fica.
const SQL_NEGOCIACAO_EXCLUIR_PEDIDOS = `DELETE FROM SGC_GALD_ITEM_FILIAL
WHERE ID_ITEM IN (SELECT I.ID FROM SGC_GALD_ITEM I WHERE I.ID_NEGOCIACAO = {{id}})
  AND ${negociacao('{{id}}')} AND ${semCards('{{id}}')}
  AND ${guarda(OPERAR)}`;

const SQL_NEGOCIACAO_EXCLUIR_ITENS = `DELETE FROM SGC_GALD_ITEM
WHERE ID_NEGOCIACAO = {{id}}
  AND ${negociacao('{{id}}')} AND ${semCards('{{id}}')}
  AND ${guarda(OPERAR)}`;

const SQL_NEGOCIACAO_EXCLUIR = `DELETE FROM SGC_GALD_NEGOCIACAO
WHERE ID = {{id}} AND STATUS <> 'convertida' AND ${semCards('ID')}
  AND ${guarda(OPERAR)}`;

const COLUNAS_NUMERICAS_ITEM = ['PRECO_SELLOUT', 'PRECO_NET', 'PRECO_LISTA_DESC', 'ESTOQUE_INICIAL',
  'MEDIA_SELLOUT', 'PREVISAO_SELLOUT', 'PROPOSTA_SELLIN'];

// RN-PG-17: o item do modal é upsert total por (negociação, produto); CRIADO_EM só no insert.
const SQL_ITEM_SALVAR = `INSERT INTO SGC_GALD_ITEM
  (ID_NEGOCIACAO, CODPROD, EAN, DESCRICAO, PRECO_SELLOUT, PRECO_NET, PRECO_LISTA, PRECO_LISTA_DESC,
   ESTOQUE_INICIAL, MEDIA_SELLOUT, PREVISAO_SELLOUT, PROPOSTA_SELLIN, META_SELLIN_VALOR, OBSERVACAO,
   CRIADO_EM, ATUALIZADO_EM)
SELECT {{idNegociacao}}, {{codprod}}, '{{ean}}', '{{descricao}}', {{precoSellout}}, {{precoNet}},
  {{precoLista}}, {{precoListaDesc}}, {{estoqueInicial}}, {{mediaSellout}}, {{previsaoSellout}},
  {{propostaSellin}}, {{metaSellinValor}}, '{{observacao}}', '{{agora}}', '{{agora}}'
FROM DUAL
WHERE {{codprod}} > 0 AND ${negociacao('{{idNegociacao}}', { aberta: true })}
  AND ${guarda(OPERAR)}
ON DUPLICATE KEY UPDATE
  EAN = VALUES(EAN), DESCRICAO = VALUES(DESCRICAO),
  ${COLUNAS_NUMERICAS_ITEM.map((c) => `${c} = VALUES(${c})`).join(', ')},
  PRECO_LISTA = VALUES(PRECO_LISTA), META_SELLIN_VALOR = VALUES(META_SELLIN_VALOR),
  OBSERVACAO = VALUES(OBSERVACAO), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

// RN-010 / C-010 (P-05): a importação só atualiza o que a planilha traz —
// preço de lista, meta de sell-in e observação digitados à mão ficam.
const SQL_ITEM_IMPORTAR = `INSERT INTO SGC_GALD_ITEM
  (ID_NEGOCIACAO, CODPROD, EAN, DESCRICAO, PRECO_SELLOUT, PRECO_NET, PRECO_LISTA_DESC,
   ESTOQUE_INICIAL, MEDIA_SELLOUT, PREVISAO_SELLOUT, PROPOSTA_SELLIN, OBSERVACAO, CRIADO_EM, ATUALIZADO_EM)
SELECT {{idNegociacao}}, {{codprod}}, '{{ean}}', '{{descricao}}', {{precoSellout}}, {{precoNet}},
  {{precoListaDesc}}, {{estoqueInicial}}, {{mediaSellout}}, {{previsaoSellout}}, {{propostaSellin}},
  '', '{{agora}}', '{{agora}}'
FROM DUAL
WHERE {{codprod}} > 0 AND ${negociacao('{{idNegociacao}}', { aberta: true })}
  AND ${guarda(OPERAR)}
ON DUPLICATE KEY UPDATE
  EAN = VALUES(EAN), DESCRICAO = VALUES(DESCRICAO),
  ${COLUNAS_NUMERICAS_ITEM.map((c) => `${c} = VALUES(${c})`).join(', ')},
  ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

// RN-PG-19: os pedidos por filial do item primeiro, depois o item.
const SQL_ITEM_EXCLUIR_PEDIDOS = `DELETE FROM SGC_GALD_ITEM_FILIAL
WHERE ID_ITEM = {{idItem}} AND ${doItem('{{idItem}}', { aberta: true })}
  AND ${guarda(OPERAR)}`;

const SQL_ITEM_EXCLUIR = `DELETE FROM SGC_GALD_ITEM
WHERE ID = {{idItem}} AND ${negociacao('ID_NEGOCIACAO', { aberta: true })}
  AND ${guarda(OPERAR)}`;

/**
 * RF-005 / C-007: o pedido por filial — a filial precisa ser participante
 * (`FILIAIS` é CSV sem aspas nem espaço: `FIND_IN_SET`). A MESMA condição
 * vale para o log (8461): pedido recusado não deixa linha de histórico (RNF-006).
 */
const pedidoFilialAceito = `EXISTS (
    SELECT 1 FROM SGC_GALD_ITEM IT
    JOIN SGC_GALD_NEGOCIACAO NG ON NG.ID = IT.ID_NEGOCIACAO
    WHERE IT.ID = {{idItem}} AND NG.STATUS = 'aberta'
      AND FIND_IN_SET('{{codfilial}}', NG.FILIAIS) > 0
  )
  AND ${guarda(OPERAR)}`;

const SQL_PEDIDO_FILIAL_SALVAR = `INSERT INTO SGC_GALD_ITEM_FILIAL (ID_ITEM, CODFILIAL, QTD_PEDIDA, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{idItem}}, '{{codfilial}}', {{qtdPedida}}, :VAR_USER, '{{agora}}'
FROM DUAL
WHERE {{qtdPedida}} >= 0 AND ${pedidoFilialAceito}
ON DUPLICATE KEY UPDATE QTD_PEDIDA = VALUES(QTD_PEDIDA),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

const SQL_DECISAO_LOG_INSERIR = `INSERT INTO SGC_GALD_DECISAO_LOG
  (ID_NEGOCIACAO, ID_ITEM, CODPROD, CODFILIAL, CAMPO, ANTES, DEPOIS, POR, EM)
SELECT I.ID_NEGOCIACAO, I.ID, I.CODPROD, '{{codfilial}}', 'QTD_PEDIDA', '{{antes}}', '{{depois}}',
  :VAR_USER, '{{agora}}'
FROM SGC_GALD_ITEM I
WHERE I.ID = {{idItem}} AND ${pedidoFilialAceito}`;

// RN-009 / C-016: o vínculo nasce logo depois do card, antes da capa e dos
// itens — é ele que impede o segundo card da mesma filial (UNIQUE + NOT EXISTS).
const SQL_CARD_REGISTRAR = `INSERT INTO SGC_GALD_NEGOCIACAO_CARD (ID_NEGOCIACAO, CODFILIAL, ID_CARD, POR, EM)
SELECT {{idNegociacao}}, '{{codfilial}}', {{cardId}}, :VAR_USER, '{{agora}}'
FROM DUAL
WHERE {{cardId}} > 0 AND ${negociacao('{{idNegociacao}}')}
  AND NOT EXISTS (SELECT 1 FROM SGC_GALD_NEGOCIACAO_CARD NC
                  WHERE NC.ID_NEGOCIACAO = {{idNegociacao}} AND NC.CODFILIAL = '{{codfilial}}')
  AND ${guarda(OPERAR)}`;

// RN-009 / P-14: a capa do pedido gerado, com ORIGEM 'galderma' e o fornecedor
// fixo. Só para o card que o vínculo (8462) aponta — nenhum card de fora vira
// "Galderma" por aqui. Idempotente por ID_CARD, como a sgcEscPedidoCriar (7250).
const SQL_PEDIDO_CAPA_CRIAR = `INSERT INTO SGC_PEDIDO
  (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA,
   CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{cardId}}, ${GALDERMA}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}',
  '{{periodoInicio}}', '{{periodoFim}}', 'galderma', 0, :VAR_USER, '{{agora}}', '{{agora}}'
FROM DUAL
WHERE TRIM('{{fornecedor}}') <> '' AND TRIM('{{filial}}') <> ''
  AND EXISTS (SELECT 1 FROM SGC_GALD_NEGOCIACAO_CARD NC
              WHERE NC.ID_NEGOCIACAO = {{idNegociacao}} AND NC.CODFILIAL = '{{codfilial}}'
                AND NC.ID_CARD = {{cardId}})
  AND ${negociacao('{{idNegociacao}}')}
  AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO EX WHERE EX.ID_CARD = {{cardId}})
  AND ${guarda(OPERAR)}`;

// RN-009 / C-016: converte só quando nenhuma filial com pedido > 0 ficou sem
// vínculo com capa — a regra está aqui, não só na tela.
const SQL_NEGOCIACAO_CONVERTER = `UPDATE SGC_GALD_NEGOCIACAO SET
  STATUS = 'convertida', ATUALIZADO_POR = :VAR_USER, ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{id}} AND STATUS <> 'convertida'
  AND EXISTS (SELECT 1 FROM SGC_GALD_NEGOCIACAO_CARD NC WHERE NC.ID_NEGOCIACAO = {{id}})
  AND NOT EXISTS (
    SELECT 1 FROM SGC_GALD_ITEM I
    JOIN SGC_GALD_ITEM_FILIAL PF ON PF.ID_ITEM = I.ID
    WHERE I.ID_NEGOCIACAO = {{id}} AND PF.QTD_PEDIDA > 0
      AND NOT EXISTS (
        SELECT 1 FROM SGC_GALD_NEGOCIACAO_CARD NC
        JOIN SGC_PEDIDO P ON P.ID_CARD = NC.ID_CARD
        WHERE NC.ID_NEGOCIACAO = {{id}} AND NC.CODFILIAL = PF.CODFILIAL
      )
  )
  AND ${guarda(OPERAR)}`;

// RF-018 / C-023 (RN-AG-38/39/40): a meta lançada nunca toca a mesa.
const SQL_SELLOUT_SALVAR = `INSERT INTO SGC_GALD_SELLOUT (CODPROD, COMPETENCIA, PREVISAO_SELLOUT, ATUALIZADO_POR, ATUALIZADO_EM)
SELECT {{codprod}}, '{{competencia}}', {{previsaoSellout}}, :VAR_USER, '{{agora}}'
FROM DUAL
WHERE {{codprod}} > 0 AND {{previsaoSellout}} >= 0 AND LENGTH('{{competencia}}') = 7
  AND ${guarda(OPERAR)}
ON DUPLICATE KEY UPDATE PREVISAO_SELLOUT = VALUES(PREVISAO_SELLOUT),
  ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

const SQL_SELLOUT_EXCLUIR = `DELETE FROM SGC_GALD_SELLOUT
WHERE CODPROD = {{codprod}} AND COMPETENCIA = '{{competencia}}'
  AND ${guarda(OPERAR)}`;

const SQL_SELLOUT_LOG_INSERIR = `INSERT INTO SGC_GALD_SELLOUT_LOG
  (CODPROD, COMPETENCIA, ANTES, DEPOIS, ORIGEM_ANTERIOR, POR, EM)
SELECT {{codprod}}, '{{competencia}}', '{{antes}}', '{{depois}}', '{{origemAnterior}}', :VAR_USER, '{{agora}}'
FROM DUAL
WHERE '{{origemAnterior}}' IN ('mesa', 'lancado')
  AND ${guarda(OPERAR)}`;

const PAGINA = 'limite int, offset int';
const CABECALHO = 'competencia AAAA-MM, dataPedido, descricao, filiais (CSV), coberturaAlvoDias int, transitoComoCompra 0/1, metaSelloutValor, observacao, agora';
const NUMEROS_ITEM = 'precoSellout, precoNet, precoListaDesc, estoqueInicial, mediaSellout, previsaoSellout, propostaSellin';

const LEITURAS = [
  ['sgcWintGaldProdutos', SQL_PRODUTOS, 'RN-PG-13 - catalogo Galderma (1541) ativo, com EAN (CODAUXILIAR) e caixa do ERP. Sem params'],
  ['sgcWintGaldPosicao', SQL_POSICAO, 'RF-002/RF-003 - posicao por produto x filial: disponivel, fisico, bloqueado, reservado, transito (pedido pendente + PCESTTRANSITO), venda valida sem publico do mes e do trimestre anterior, compra do mes. Params: codprods fragmento, filiais fragmento entre aspas, dataInicioTri, dataFimTri, dataInicioMes, dataFimMes'],
  ['sgcGaldNegociacoesListar', SQL_NEGOCIACOES_LISTAR, `RF-001 - negociacoes, a mais recente primeiro, com COMPLEMENTARES e CARDS. Params: ${PAGINA}`],
  ['sgcGaldItensListar', SQL_ITENS_LISTAR, `RF-007 - itens da proposta por CODPROD. Params: idNegociacao int, ${PAGINA}`],
  ['sgcGaldPedidosFilialListar', SQL_PEDIDOS_FILIAL_LISTAR, `RF-005 - pedido gravado por item x filial. Params: idNegociacao int, ${PAGINA}`],
  ['sgcGaldHerdadoListar', SQL_HERDADO_LISTAR, `RN-008 - o que a negociacao de origem pediu, por produto x filial. Params: idNegociacao int (a complementar), ${PAGINA}`],
  ['sgcGaldDecisaoLogListar', SQL_DECISAO_LOG_LISTAR, `RF-006 - historico de decisoes, do mais recente para o mais antigo. Params: idNegociacao int, ${PAGINA}`],
  ['sgcGaldCardsListar', SQL_CARDS_LISTAR, `RN-009 - pedidos gerados por filial, com TEM_CAPA. Params: idNegociacao int, ${PAGINA}`],
  ['sgcGaldAcompanhamento', SQL_ACOMPANHAMENTO, `RF-017 - proposta da mesa por produto x competencia (so negociacoes sem origem) e o pedido enviado de todas. Params: competenciaInicio, competenciaFim, ${PAGINA}`],
  ['sgcWintGaldRealizadoMensal', SQL_REALIZADO_MENSAL, 'RF-017 - realizado do ERP por produto x filial x mes: venda valida sem publico e compra, em unidades e reais. Params: dataInicio, dataFim'],
  ['sgcGaldSelloutListar', SQL_SELLOUT_LISTAR, `RF-018 - metas de sell-out lancadas. Params: competenciaInicio, competenciaFim, ${PAGINA}`],
  ['sgcGaldSelloutLogListar', SQL_SELLOUT_LOG_LISTAR, `RF-018 - historico das metas de sell-out. Params: competenciaInicio, competenciaFim, ${PAGINA}`],
  ['sgcWintGaldEstoqueInicial', SQL_ESTOQUE_INICIAL, 'RN-013 - estoque inicial reconstruido por produto x filial (hoje - entradas + saidas fisicas desde dataInicio, sem cancelados). Params: dataInicio'],
  ['sgcWintGaldComposicao', SQL_COMPOSICAO, 'RN-014 - compra e venda valida sem publico por filial, em unidades e reais. Params: dataInicio, dataFim'],
  ['sgcWintGaldEstoqueAtual', SQL_ESTOQUE_ATUAL, 'RN-014 - estoque de agora por produto x filial (disponivel e fisico); o valor e a custo padrao na tela (R-128). Sem params'],
];

const ESCRITAS = [
  ['sgcEscGaldNegociacaoCriar', SQL_NEGOCIACAO_CRIAR, `RF-001/RN-008 - cria a negociacao aberta; a de origem precisa estar convertida, ser da mesma competencia e sem complementar. Params: ${CABECALHO}, idPai int`],
  ['sgcEscGaldNegociacaoAtualizar', SQL_NEGOCIACAO_ATUALIZAR, `RF-001/RN-007 - cabecalho da negociacao nao convertida. Params: id int, ${CABECALHO}`],
  ['sgcEscGaldNegociacaoSituacao', SQL_NEGOCIACAO_SITUACAO, 'RN-007 - aberta <-> fechada. Params: id int, status aberta|fechada, agora'],
  ['sgcEscGaldNegociacaoExcluirPedidos', SQL_NEGOCIACAO_EXCLUIR_PEDIDOS, 'C-013 - exclusao, passo 1: pedidos por filial da negociacao nao convertida e sem pedido gerado. Params: id int'],
  ['sgcEscGaldNegociacaoExcluirItens', SQL_NEGOCIACAO_EXCLUIR_ITENS, 'C-013 - exclusao, passo 2: itens. Params: id int'],
  ['sgcEscGaldNegociacaoExcluir', SQL_NEGOCIACAO_EXCLUIR, 'C-013 - exclusao, passo 3: a negociacao (o historico fica). Params: id int'],
  ['sgcEscGaldItemSalvar', SQL_ITEM_SALVAR, `RF-007 - item da proposta, upsert total por (negociacao, produto); negociacao aberta. Params: idNegociacao int, codprod int, ean, descricao, ${NUMEROS_ITEM}, precoLista, metaSellinValor, observacao, agora`],
  ['sgcEscGaldItemImportar', SQL_ITEM_IMPORTAR, `RN-010/C-010 - linha casada da planilha: atualiza so o que a planilha traz. Params: idNegociacao int, codprod int, ean, descricao, ${NUMEROS_ITEM}, agora`],
  ['sgcEscGaldItemExcluirPedidos', SQL_ITEM_EXCLUIR_PEDIDOS, 'RN-PG-19 - remover item, passo 1: os pedidos por filial dele. Params: idItem int'],
  ['sgcEscGaldItemExcluir', SQL_ITEM_EXCLUIR, 'RN-PG-19 - remover item, passo 2. Params: idItem int'],
  ['sgcEscGaldPedidoFilialSalvar', SQL_PEDIDO_FILIAL_SALVAR, 'RF-005 - pedido por filial (upsert); negociacao aberta e filial participante. Params: idItem int, codfilial, qtdPedida numero, agora'],
  ['sgcEscGaldDecisaoLogInserir', SQL_DECISAO_LOG_INSERIR, 'RF-006 - uma linha de historico por mudanca efetiva, com a mesma condicao do pedido por filial. Params: idItem int, codfilial, antes, depois, agora'],
  ['sgcEscGaldCardRegistrar', SQL_CARD_REGISTRAR, 'RN-009 - vinculo negociacao x filial x card, logo depois do kbCardCriar. Params: idNegociacao int, codfilial, cardId int, agora'],
  ['sgcEscGaldPedidoCapaCriar', SQL_PEDIDO_CAPA_CRIAR, 'RN-009/P-14 - capa SGC_PEDIDO do pedido gerado, ORIGEM galderma, fornecedor 1541, so para o card do vinculo. Params: cardId int, idNegociacao int, codfilial, fornecedor, filial, periodoInicio, periodoFim, agora'],
  ['sgcEscGaldNegociacaoConverter', SQL_NEGOCIACAO_CONVERTER, 'RN-009/C-016 - converte quando nenhuma filial com pedido ficou sem vinculo com capa. Params: id int, agora'],
  ['sgcEscGaldSelloutSalvar', SQL_SELLOUT_SALVAR, 'RF-018 - meta de sell-out lancada (upsert por produto x competencia). Params: codprod int, competencia, previsaoSellout numero, agora'],
  ['sgcEscGaldSelloutExcluir', SQL_SELLOUT_EXCLUIR, 'RF-018 - remove a meta lancada (volta a da mesa). Params: codprod int, competencia'],
  ['sgcEscGaldSelloutLogInserir', SQL_SELLOUT_LOG_INSERIR, 'RF-018 - historico da meta de sell-out. Params: codprod int, competencia, antes, depois, origemAnterior mesa|lancado, agora'],
];

export const definitions = [...LEITURAS, ...ESCRITAS].map(([name, code, description]) => ({
  name, type: 'SQL', description, code,
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

  console.log(`Pronto: ${definitions.length} server functions da spec 014 (pedido Galderma).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
