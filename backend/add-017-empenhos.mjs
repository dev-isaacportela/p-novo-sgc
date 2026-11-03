// add-017 — Server Functions da spec 015 (quadro de empenhos): pregão, empenho,
// itens e decisão, aprovações com CMV congelado, desmembramento em pedidos por
// indústria e de transferência, pendências e indicadores. Ver
// docs/specs/015-quadro-de-empenhos/.
//
// Faixa de id local: 86xx (R-160 do 000) — leituras 8601-8609, escritas
// 8650-8668, JAVASCRIPT 8680-8681. As do ERP se chamam sgcWint* e entram em
// WINTHOR (recebem o jdbcId por nome na publicação).
//
// O quadro `empenhos` (10 fases por chave `emp_*` em SGC_EMP_FASE, 6 campos, nenhum obrigatório)
// é criado aqui, no entrypoint, de forma idempotente — como o `add-005` faz com
// o de compras; no simulador as mesmas listas são gravadas por
// backend/simulator/seed/015-empenhos.mjs, que as importa deste arquivo.
//
// O gancho de mover/excluir é UM por projeto (KB_META): o ramo deste quadro é
// exportado daqui (RAMO_PODE_MOVER_EMPENHOS, RAMO_PODE_EXCLUIR_EMPENHOS,
// FORA_DOS_EMPENHOS) e o `add-005` o pendura no sgcPodeMover/sgcPodeExcluir
// (R-161). No sandbox, rode o add-005 de novo DEPOIS deste.
//
// As tabelas SGC_EMP_* estão no `setup-backend.mjs` (DDL_015).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-017-empenhos.mjs && node add-005-quadro-compras.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { PUBLICO, VENDA_VALIDA } from './venda-valida.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));
const MARCADOR_IDS = '__SGC_IDS__';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintEmpProdutos', 'sgcWintEmpClientes', 'sgcWintEmpEstoqueFiliais', 'sgcWintEmpVendaMensal'];

/* ─────────────── o quadro: slug, fases, campos ─────────────── */

export const SLUG_EMPENHOS = 'empenhos';
export const NOME_EMPENHOS = 'Empenhos';
export const DESCRICAO_EMPENHOS = 'Empenhos de órgãos públicos: da análise de onde sai cada item ao pedido por indústria.';

// R-160 / C-002: a CHAVE é o contrato. As chaves do quadro de empenhos moram em
// SGC_EMP_FASE, não na SGC_FASE do quadro de compras: as SFs de compras leem a
// SGC_FASE sem filtrar quadro (o tradutor sgcFasesListar boardId 0 e os
// indicadores da 009 contariam 20 fases). O prefixo `emp_` deixa a chave
// inconfundível nos dois lugares. `emp_pedidos` é a fase a mais do legado (P-01):
// a lib não esconde card.
export const FASES_EMPENHO = [
  { chave: 'emp_analise', nome: 'Análise', cor: 'data-1', tipo: 'comum' },
  { chave: 'emp_tecnica', nome: 'Aprovação Técnica', cor: 'data-2', tipo: 'comum' },
  { chave: 'emp_diretoria', nome: 'Aprovação da Diretoria', cor: 'data-3', tipo: 'comum' },
  { chave: 'emp_pedidos', nome: 'Empenho em pedidos', cor: 'data-5', tipo: 'comum' },
  { chave: 'emp_envio', nome: 'Envio para Indústria', cor: 'data-4', tipo: 'comum' },
  { chave: 'emp_aguardando', nome: 'Aguardando Indústria', cor: 'data-5', tipo: 'comum' },
  { chave: 'emp_transito', nome: 'Em Trânsito para BN', cor: 'data-6', tipo: 'comum' },
  { chave: 'emp_pendencia', nome: 'Pedidos com Pendência', cor: 'data-8', tipo: 'comum' },
  { chave: 'emp_concluido', nome: 'Empenhos Concluídos', cor: 'data-6', tipo: 'sucesso' },
  { chave: 'emp_cancelado', nome: 'Empenhos Cancelados', cor: 'data-8', tipo: 'cancelado' },
];

// RN-017 da 002 vale aqui: nenhum campo obrigatório, nenhum de fase. Todos na
// capa; campo vazio não ocupa linha (o pedido não tem `cmv`, o empenho não tem
// `fornecedor`). A tela os escreve por kbCardAtualizar (RNF-003).
export const CAMPOS_EMPENHO = [
  { chave: 'orgao', label: 'Órgão', tipo: 'texto', noCard: true },
  { chave: 'filial', label: 'Filial', tipo: 'texto', noCard: true },
  { chave: 'fornecedor', label: 'Indústria', tipo: 'texto', noCard: true },
  { chave: 'valor_contrato', label: 'Valor do contrato', tipo: 'moeda', noCard: true },
  { chave: 'cmv', label: 'CMV', tipo: 'texto', noCard: true },
  { chave: 'situacao', label: 'Situação', tipo: 'texto', noCard: true },
];

const FINAIS = ['emp_concluido', 'emp_cancelado'];
const aspas = (valores) => valores.map((valor) => `'${valor}'`).join(', ');

/* ─────────────── guarda de persona (R-013, texto único da 002) ─────────────── */

const PERSONA_EFETIVA = `COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                            WHEN 'ADMIN' THEN 'admin'
                            WHEN 'RESTRICTED' THEN 'comercial'
                            ELSE 'analista' END)`;

function guarda(personas, quem = ':VAR_USER') {
  return `EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${quem}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND ${PERSONA_EFETIVA} IN (${aspas(personas)})
  )`;
}
const guardaInterna = (personas) => guarda(personas, '{{usuarioId}}');

/** RN-009 (P-12): operam admin, analista e gestor; a técnica é do gestor, a diretoria da diretoria. */
const OPERAR = ['admin', 'analista', 'gestor'];
const TECNICA = ['admin', 'gestor'];
const DIRETORIA = ['admin', 'diretoria'];

/** O card está no quadro `empenhos`, vivo, numa das fases (por chave). */
const naFase = (card, ...chaves) => `EXISTS (
    SELECT 1 FROM KB_CARD KC
    JOIN SGC_EMP_FASE SF ON SF.BOARD_ID = KC.BOARD_ID AND SF.FASE_ID = KC.FASE_ID
    WHERE KC.ID = ${card} AND KC.EXCLUIDO_EM IS NULL AND SF.CHAVE IN (${aspas(chaves)})
  )`;

/** O card é do quadro `empenhos` e foi criado por quem chama (a tela acabou de criá-lo por kbCardCriar). */
const cardNovoDoQuadro = (card) => `EXISTS (
    SELECT 1 FROM KB_CARD KC JOIN KB_BOARD KB ON KB.ID = KC.BOARD_ID
    WHERE KC.ID = ${card} AND KB.SLUG = '${SLUG_EMPENHOS}' AND KC.EXCLUIDO_EM IS NULL AND KC.CRIADO_POR = :VAR_USER
  )`;

/**
 * RN-001 (P-06): o custo efetivo, UMA conta. "Pedir pelo padrão" ignora o
 * negociado; zero no negociado é "não negociei". Exige SGC_EMP_ITEM como `I`.
 */
export const CUSTO_EFETIVO = `CASE WHEN COALESCE(I.TIPO_CUSTO_PEDIDO, '') = 'PADRAO'
    THEN COALESCE(NULLIF(I.CUSTO_ESPECIAL, 0), I.CUSTO_PADRAO, 0)
    ELSE COALESCE(NULLIF(I.CUSTO_NEGOCIADO, 0), NULLIF(I.CUSTO_ESPECIAL, 0), I.CUSTO_PADRAO, 0) END`;

/** RN-002: valor, custo e CMV do empenho pela quantidade empenhada — razão das somas. */
const somaItens = (expressao, empenho) => `COALESCE((SELECT SUM(${expressao}) FROM SGC_EMP_ITEM I WHERE I.ID_EMPENHO = ${empenho}), 0)`;
const valorDoEmpenho = (empenho) => somaItens('I.QT_EMPENHO * I.PRECO_VENDA', empenho);
const custoDoEmpenho = (empenho) => somaItens(`I.QT_EMPENHO * (${CUSTO_EFETIVO})`, empenho);
const cmvDoEmpenho = (empenho) => `CASE WHEN ${valorDoEmpenho(empenho)} > 0
    THEN ${custoDoEmpenho(empenho)} / ${valorDoEmpenho(empenho)} ELSE NULL END`;

/** RN-007: item que ainda não está pronto para sair da Análise. Exige SGC_EMP_ITEM como `I`. */
const ITEM_ABERTO = `(
    COALESCE(I.QT_COMPRA, 0) + COALESCE(I.QT_TRANSFERENCIA, 0) + COALESCE(I.QT_ESTOQUE, 0) <= 0
    OR ABS(COALESCE(I.QT_EMPENHO, 0) - (COALESCE(I.QT_COMPRA, 0) + COALESCE(I.QT_TRANSFERENCIA, 0) + COALESCE(I.QT_ESTOQUE, 0))) > 0.0005
    OR (COALESCE(I.QT_TRANSFERENCIA, 0) > 0 AND COALESCE(I.CODFILIAL_ORIGEM, '') = '')
    OR COALESCE(I.PRECO_VENDA, 0) <= 0
  )`;

/* ─────────────── leituras — SGC (MySQL) ─────────────── */

const PAGINA = 'LIMIT {{limite}} OFFSET {{offset}}';
const FILTRO_PREGAO = (p) => `('{{busca}}' = '' OR UPPER(${p}.CODIGO_EDITAL) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
      OR UPPER(${p}.ORGAO) LIKE CONCAT('%', UPPER('{{busca}}'), '%'))`;
const FASE_DO_EMPENHO = `JOIN KB_CARD C ON C.ID = E.ID_CARD AND C.EXCLUIDO_EM IS NULL
  JOIN SGC_EMP_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID`;

// RN-003 / P-05: VL_TOTAL e VL_CUSTO são os vivos até a diretoria e os congelados
// depois (a mesma coluna). Cancelado não soma valor (RN-014).
const SQL_PREGOES_LISTAR = `SELECT P.ID, P.CODIGO_EDITAL, P.ORGAO, P.CODCLI, COALESCE(P.DT_VIGENCIA_FIM, '') AS DT_VIGENCIA_FIM,
  (SELECT COUNT(*) FROM SGC_EMP_EMPENHO E ${FASE_DO_EMPENHO} WHERE E.ID_PREGAO = P.ID) AS QT_EMPENHOS,
  (SELECT COALESCE(SUM(E.VL_TOTAL), 0) FROM SGC_EMP_EMPENHO E ${FASE_DO_EMPENHO}
    WHERE E.ID_PREGAO = P.ID AND F.CHAVE <> 'emp_cancelado') AS VL_TOTAL,
  (SELECT COALESCE(SUM(E.VL_CUSTO), 0) FROM SGC_EMP_EMPENHO E ${FASE_DO_EMPENHO}
    WHERE E.ID_PREGAO = P.ID AND F.CHAVE <> 'emp_cancelado') AS VL_CUSTO,
  (SELECT COUNT(*) FROM SGC_EMP_PREGAO P2 WHERE ${FILTRO_PREGAO('P2')}) AS TOTAL_REGISTROS
FROM SGC_EMP_PREGAO P
WHERE ${FILTRO_PREGAO('P')}
ORDER BY P.CODIGO_EDITAL
${PAGINA}`;

const SQL_PREGAO_EMPENHOS = `SELECT E.ID, E.ID_CARD, C.TITULO, COALESCE(E.NUM_EMPENHO, '') AS NUM_EMPENHO,
  E.CODFILIAL, COALESCE(E.FILIAL, '') AS FILIAL, E.DT_RECEBIMENTO, COALESCE(E.DT_LIMITE, '') AS DT_LIMITE,
  COALESCE(E.VL_TOTAL, 0) AS VL_TOTAL, COALESCE(E.VL_CUSTO, 0) AS VL_CUSTO, E.CMV_PERC,
  COALESCE(E.CONGELADO_EM, '') AS CONGELADO_EM, F.CHAVE AS FASE, KF.NOME AS FASE_NOME,
  (SELECT COUNT(*) FROM SGC_EMP_EMPENHO E2 JOIN KB_CARD C2 ON C2.ID = E2.ID_CARD AND C2.EXCLUIDO_EM IS NULL
    WHERE E2.ID_PREGAO = {{idPregao}}) AS TOTAL_REGISTROS
FROM SGC_EMP_EMPENHO E
${FASE_DO_EMPENHO}
JOIN KB_FASE KF ON KF.ID = C.FASE_ID
WHERE E.ID_PREGAO = {{idPregao}}
ORDER BY E.DT_RECEBIMENTO DESC, E.ID DESC
${PAGINA}`;

const RECORTE_INDICADORES = `E.DT_RECEBIMENTO >= '{{dataInicio}}' AND E.DT_RECEBIMENTO <= '{{dataFim}}'
  AND ('{{codfilial}}' = '' OR E.CODFILIAL = '{{codfilial}}')`;

// RN-014 / P-14: tudo pelo mesmo período (data de recebimento do empenho).
const SQL_INDICADORES_RESUMO = `SELECT
  COUNT(*) AS QT_EMPENHOS,
  COALESCE(SUM(CASE WHEN F.CHAVE NOT IN (${aspas(FINAIS)}) THEN 1 ELSE 0 END), 0) AS QT_EM_ABERTO,
  COALESCE(SUM(CASE WHEN F.CHAVE = 'emp_concluido' THEN 1 ELSE 0 END), 0) AS QT_CONCLUIDOS,
  COALESCE(SUM(CASE WHEN F.CHAVE = 'emp_cancelado' THEN 1 ELSE 0 END), 0) AS QT_CANCELADOS,
  COALESCE(SUM(CASE WHEN F.CHAVE <> 'emp_cancelado' THEN E.VL_TOTAL ELSE 0 END), 0) AS VL_CONTRATO,
  COALESCE(SUM(CASE WHEN F.CHAVE <> 'emp_cancelado' THEN E.VL_CUSTO ELSE 0 END), 0) AS VL_CUSTO,
  COALESCE(SUM(CASE WHEN COALESCE(E.CONGELADO_EM, '') <> '' THEN 1 ELSE 0 END), 0) AS QT_APROVADOS
FROM SGC_EMP_EMPENHO E
${FASE_DO_EMPENHO}
WHERE ${RECORTE_INDICADORES}`;

// RN-013: dias contados a partir do `hoje` que a tela manda (data de Brasília).
const SQL_PRAZOS_LISTAR = `SELECT E.ID, E.ID_CARD, C.TITULO, P.ORGAO, E.CODFILIAL, COALESCE(E.DT_LIMITE, '') AS DT_LIMITE,
  COALESCE(P.DT_VIGENCIA_FIM, '') AS DT_VIGENCIA_FIM, F.CHAVE AS FASE, KF.NOME AS FASE_NOME,
  DATEDIFF(E.DT_LIMITE, '{{hoje}}') AS DIAS_ENTREGA,
  CASE WHEN COALESCE(P.DT_VIGENCIA_FIM, '') = '' THEN NULL ELSE DATEDIFF(P.DT_VIGENCIA_FIM, '{{hoje}}') END AS DIAS_VIGENCIA,
  (SELECT COUNT(*) FROM SGC_EMP_EMPENHO E2 JOIN KB_CARD C2 ON C2.ID = E2.ID_CARD AND C2.EXCLUIDO_EM IS NULL
     JOIN SGC_EMP_FASE F2 ON F2.BOARD_ID = C2.BOARD_ID AND F2.FASE_ID = C2.FASE_ID
     WHERE F2.CHAVE NOT IN (${aspas(FINAIS)}) AND COALESCE(E2.DT_LIMITE, '') <> ''
       AND ('{{codfilial}}' = '' OR E2.CODFILIAL = '{{codfilial}}')) AS TOTAL_REGISTROS
FROM SGC_EMP_EMPENHO E
${FASE_DO_EMPENHO}
JOIN KB_FASE KF ON KF.ID = C.FASE_ID
JOIN SGC_EMP_PREGAO P ON P.ID = E.ID_PREGAO
WHERE F.CHAVE NOT IN (${aspas(FINAIS)}) AND COALESCE(E.DT_LIMITE, '') <> ''
  AND ('{{codfilial}}' = '' OR E.CODFILIAL = '{{codfilial}}')
ORDER BY DIAS_ENTREGA, E.ID
${PAGINA}`;

const SQL_POR_ORGAO = `SELECT P.ORGAO, COUNT(*) AS QT_EMPENHOS,
  COALESCE(SUM(E.VL_TOTAL), 0) AS VL_CONTRATO, COALESCE(SUM(E.VL_CUSTO), 0) AS VL_CUSTO,
  (SELECT COUNT(DISTINCT P2.ORGAO) FROM SGC_EMP_EMPENHO E JOIN SGC_EMP_PREGAO P2 ON P2.ID = E.ID_PREGAO
     ${FASE_DO_EMPENHO} WHERE F.CHAVE <> 'emp_cancelado' AND ${RECORTE_INDICADORES}) AS TOTAL_REGISTROS
FROM SGC_EMP_EMPENHO E
JOIN SGC_EMP_PREGAO P ON P.ID = E.ID_PREGAO
${FASE_DO_EMPENHO}
WHERE F.CHAVE <> 'emp_cancelado' AND ${RECORTE_INDICADORES}
GROUP BY P.ORGAO
ORDER BY VL_CONTRATO DESC, P.ORGAO
${PAGINA}`;

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// RN-EMP-29 do legado: produto ativo (OBS2 vazio, fora dos departamentos 4 e 7),
// por código ou trecho do nome; a indústria e o código de fábrica do cadastro.
const SQL_PRODUTOS = `SELECT * FROM (
  SELECT P.CODPROD, P.DESCRICAO, NVL(P.EMBALAGEM, '') AS EMBALAGEM, NVL(P.UNIDADE, '') AS UNIDADE,
         NVL(P.CODFAB, '') AS CODFAB, P.CODFORNEC, NVL(F.FORNECEDOR, '') AS FORNECEDOR
  FROM PCPRODUT P
  LEFT JOIN PCFORNEC F ON F.CODFORNEC = P.CODFORNEC
  WHERE NVL(LENGTH(TRIM(P.OBS2)), 0) = 0
    AND NVL(P.CODEPTO, 0) NOT IN (4, 7)
    AND ( P.CODPROD = {{codprod}}
          OR ({{codprod}} = 0 AND UPPER(P.DESCRICAO) LIKE '%' || UPPER('{{busca}}') || '%') )
  ORDER BY P.DESCRICAO
) WHERE ROWNUM <= 20`;

// RN-EMP-13: o órgão é um cliente do ERP; os de órgão público (11 a 15) vêm primeiro.
const SQL_CLIENTES = `SELECT * FROM (
  SELECT C.CODCLI, C.CLIENTE, NVL(C.CGCENT, '') AS CNPJ, NVL(C.CODATV1, 0) AS CODATV1, NVL(A.RAMO, '') AS RAMO
  FROM PCCLIENT C
  LEFT JOIN PCATIVI A ON A.CODATIV = C.CODATV1
  WHERE C.CODCLI = {{codcli}}
     OR ({{codcli}} = 0 AND UPPER(C.CLIENTE) LIKE '%' || UPPER('{{busca}}') || '%')
  ORDER BY CASE WHEN NVL(C.CODATV1, 0) IN (11, 12, 13, 14, 15) THEN 0 ELSE 1 END, C.CLIENTE
) WHERE ROWNUM <= 20`;

// RN-005 / P-02: disponível = físico − bloqueado − reservado (nunca negativo,
// P-09); venda de 45 dias e última venda pela venda válida COM o órgão público;
// filial 99 fora. `codprods` é FRAGMENTO (só dígitos e vírgulas, montado pela tela).
const SQL_ESTOQUE_FILIAIS = `SELECT E.CODPROD, E.CODFILIAL, NVL(FL.RAZAOSOCIAL, E.CODFILIAL) AS FILIAL,
  NVL(E.QTEST, 0) AS QT_FISICO,
  NVL(E.QTBLOQUEADA, 0) + NVL(E.QTRESERV, 0) AS QT_RETIDO,
  GREATEST(NVL(E.QTEST, 0) - NVL(E.QTBLOQUEADA, 0) - NVL(E.QTRESERV, 0), 0) AS QT_DISPONIVEL,
  NVL(V.QT_45D, 0) AS QT_VENDA_45D,
  TO_CHAR(V.ULTIMA, 'YYYY-MM-DD') AS DT_ULTIMA_VENDA
FROM PCEST E
LEFT JOIN PCFILIAL FL ON FL.CODIGO = E.CODFILIAL
LEFT JOIN (
  SELECT M.CODPROD, M.CODFILIAL,
    SUM(CASE WHEN M.DTMOV >= TRUNC(SYSDATE) - 45 THEN M.QT ELSE 0 END) AS QT_45D,
    MAX(M.DTMOV) AS ULTIMA
  FROM PCMOV M
  LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
  WHERE M.CODPROD IN ({{codprods}})
    AND M.DTMOV >= TRUNC(SYSDATE) - 365
    AND M.DTCANCEL IS NULL
    AND ${VENDA_VALIDA}
  GROUP BY M.CODPROD, M.CODFILIAL
) V ON V.CODPROD = E.CODPROD AND V.CODFILIAL = E.CODFILIAL
WHERE E.CODPROD IN ({{codprods}})
  AND E.CODFILIAL <> '99'
  AND (NVL(E.QTEST, 0) > 0 OR NVL(V.QT_45D, 0) > 0)
ORDER BY E.CODPROD, E.CODFILIAL`;

// RN-014 / P-03: público = venda válida aos ramos 11 a 15; privado = venda válida
// aos demais (a rede e a remessa ficam fora dos dois lados); compras = entradas.
const SQL_VENDA_MENSAL = `SELECT TO_CHAR(M.DTMOV, 'YYYY-MM') AS MES,
  SUM(CASE WHEN ${VENDA_VALIDA} AND ${PUBLICO} THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END) AS VENDA_PUBLICO,
  SUM(CASE WHEN ${VENDA_VALIDA} AND NOT (${PUBLICO}) THEN M.QT * NVL(M.PUNIT, 0) ELSE 0 END) AS VENDA_PRIVADO,
  SUM(CASE WHEN M.CODOPER = 'E' THEN NVL(M.QT, 0) * NVL(M.PUNIT, 0) ELSE 0 END) AS VALOR_COMPRADO
FROM PCMOV M
LEFT JOIN PCCLIENT C ON C.CODCLI = M.CODCLI
WHERE M.DTMOV >= TO_DATE('{{dataInicio}}', 'YYYY-MM-DD')
  AND TRUNC(M.DTMOV) <= TO_DATE('{{dataFim}}', 'YYYY-MM-DD')
  AND M.CODOPER IN ('S', 'E')
  AND M.DTCANCEL IS NULL
  -- Oracle: '' é NULL, então "todas" se testa por NVL.
  AND (NVL('{{codfilial}}', 'TODAS') = 'TODAS' OR M.CODFILIAL = '{{codfilial}}')
GROUP BY TO_CHAR(M.DTMOV, 'YYYY-MM')
ORDER BY MES`;

/* ─────────────── escritas (tela, :VAR_USER) ─────────────── */

// C-004 / C-005: edital único (também pela chave UNIQUE), sem duplicata silenciosa.
const SQL_PREGAO_CRIAR = `INSERT INTO SGC_EMP_PREGAO (CODIGO_EDITAL, ORGAO, CODCLI, DT_VIGENCIA_FIM, ATIVO, CRIADO_POR, CRIADO_EM)
SELECT TRIM('{{codigoEdital}}'), '{{orgao}}', {{codcli}}, NULLIF('{{vigenciaFim}}', ''), 1, :VAR_USER, '{{agora}}'
FROM DUAL
WHERE ${guarda(OPERAR)}
  AND LENGTH(TRIM('{{codigoEdital}}')) > 0 AND LENGTH(TRIM('{{orgao}}')) > 0
  AND NOT EXISTS (SELECT 1 FROM SGC_EMP_PREGAO P WHERE UPPER(P.CODIGO_EDITAL) = UPPER(TRIM('{{codigoEdital}}')))`;

const UNIDADE = `CASE WHEN '{{prazoUnidade}}' = 'UTEIS' THEN 'UTEIS' ELSE 'CORRIDOS' END`;

// C-008: a capa do empenho sobre o card que a tela ACABOU de criar (kbCardCriar),
// do quadro `empenhos`, por quem chama; uma por card.
const SQL_EMPENHO_CRIAR = `INSERT INTO SGC_EMP_EMPENHO
  (ID_CARD, ID_PREGAO, NUM_EMPENHO, CODFILIAL, FILIAL, CODFILIAL_PEDIDO, DT_RECEBIMENTO, PRAZO_DIAS, PRAZO_UNIDADE,
   DT_LIMITE, ACEITA_PARCIAL, OBSERVACAO, VL_TOTAL, VL_CUSTO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{cardId}}, {{idPregao}}, '{{numEmpenho}}', '{{codfilial}}', '{{filial}}', '{{codfilialPedido}}', '{{dtRecebimento}}',
  {{prazoDias}}, ${UNIDADE}, NULLIF('{{dtLimite}}', ''), CASE WHEN {{aceitaParcial}} = 1 THEN 1 ELSE 0 END, '{{observacao}}',
  0, 0, :VAR_USER, '{{agora}}', '{{agora}}'
FROM DUAL
WHERE ${guarda(OPERAR)}
  AND ${cardNovoDoQuadro('{{cardId}}')}
  AND EXISTS (SELECT 1 FROM SGC_EMP_PREGAO P WHERE P.ID = {{idPregao}})
  AND NOT EXISTS (SELECT 1 FROM SGC_EMP_EMPENHO X WHERE X.ID_CARD = {{cardId}})
  AND '{{codfilial}}' <> '' AND '{{dtRecebimento}}' <> ''`;

// C-019 / P-11: o cabeçalho na Análise.
const SQL_CABECALHO_SALVAR = `UPDATE SGC_EMP_EMPENHO SET
  NUM_EMPENHO = '{{numEmpenho}}', CODFILIAL_PEDIDO = '{{codfilialPedido}}', DT_RECEBIMENTO = '{{dtRecebimento}}',
  PRAZO_DIAS = {{prazoDias}}, PRAZO_UNIDADE = ${UNIDADE}, DT_LIMITE = NULLIF('{{dtLimite}}', ''),
  ACEITA_PARCIAL = CASE WHEN {{aceitaParcial}} = 1 THEN 1 ELSE 0 END, OBSERVACAO = '{{observacao}}',
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND '{{dtRecebimento}}' <> ''
  AND ${guarda(OPERAR)}
  AND ${naFase('{{cardId}}', 'emp_analise')}`;

const COLUNAS_ITEM = ['ID_EMPENHO', 'CODPROD', 'DESCRICAO', 'EMBALAGEM', 'UNIDADE', 'CODFAB', 'CODFORNEC', 'FORNECEDOR',
  'QT_EMPENHO', 'PRECO_VENDA', 'CUSTO_NEGOCIADO', 'CUSTO_ESPECIAL', 'CUSTO_PADRAO', 'TIPO_CUSTO_PEDIDO',
  'QT_COMPRA', 'QT_TRANSFERENCIA', 'QT_ESTOQUE', 'CODFILIAL_ORIGEM', 'OBSERVACAO', 'ATUALIZADO_POR', 'ATUALIZADO_EM'];

/** O empenho (por id) está na Análise — só lá os itens e a decisão mudam (RN-EMP-59, sem as aprovações). */
const empenhoEmAnalise = (empenho) => `EXISTS (
    SELECT 1 FROM SGC_EMP_EMPENHO EE
    JOIN KB_CARD KC ON KC.ID = EE.ID_CARD AND KC.EXCLUIDO_EM IS NULL
    JOIN SGC_EMP_FASE SF ON SF.BOARD_ID = KC.BOARD_ID AND SF.FASE_ID = KC.FASE_ID
    WHERE EE.ID = ${empenho} AND SF.CHAVE = 'emp_analise'
  )`;

// Interna (por id, de sgcEmpItensGravar): o lote vai como derivada SELECT … UNION
// ALL (o mesmo molde do sgcEscItemGravar da 003), com a guarda sobre {{usuarioId}}.
const SQL_ITEM_GRAVAR = `INSERT INTO SGC_EMP_ITEM (${COLUNAS_ITEM.join(', ')})
SELECT * FROM ({{linhas}}) LOTE
WHERE LOTE.ID_EMPENHO = {{idEmpenho}}
  AND ${guardaInterna(OPERAR)}
  AND ${empenhoEmAnalise('{{idEmpenho}}')}
ON DUPLICATE KEY UPDATE
  DESCRICAO = VALUES(DESCRICAO), EMBALAGEM = VALUES(EMBALAGEM), UNIDADE = VALUES(UNIDADE), CODFAB = VALUES(CODFAB),
  CODFORNEC = VALUES(CODFORNEC), FORNECEDOR = VALUES(FORNECEDOR), QT_EMPENHO = VALUES(QT_EMPENHO),
  PRECO_VENDA = VALUES(PRECO_VENDA), CUSTO_NEGOCIADO = VALUES(CUSTO_NEGOCIADO), CUSTO_ESPECIAL = VALUES(CUSTO_ESPECIAL),
  CUSTO_PADRAO = VALUES(CUSTO_PADRAO), TIPO_CUSTO_PEDIDO = VALUES(TIPO_CUSTO_PEDIDO), QT_COMPRA = VALUES(QT_COMPRA),
  QT_TRANSFERENCIA = VALUES(QT_TRANSFERENCIA), QT_ESTOQUE = VALUES(QT_ESTOQUE), CODFILIAL_ORIGEM = VALUES(CODFILIAL_ORIGEM),
  OBSERVACAO = VALUES(OBSERVACAO), ATUALIZADO_POR = VALUES(ATUALIZADO_POR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`;

const SQL_ITEM_REMOVER = `DELETE FROM SGC_EMP_ITEM
WHERE ID_EMPENHO = {{idEmpenho}} AND CODPROD IN ({{codprods}})
  AND ${guardaInterna(OPERAR)}
  AND ${empenhoEmAnalise('{{idEmpenho}}')}`;

// RN-003: os vivos; congelado não muda mais.
const SQL_TOTAIS = `UPDATE SGC_EMP_EMPENHO SET
  VL_TOTAL = ${valorDoEmpenho('SGC_EMP_EMPENHO.ID')},
  VL_CUSTO = ${custoDoEmpenho('SGC_EMP_EMPENHO.ID')},
  CMV_PERC = ${cmvDoEmpenho('SGC_EMP_EMPENHO.ID')},
  ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{idEmpenho}} AND COALESCE(CONGELADO_EM, '') = ''
  AND ${guardaInterna(OPERAR)}`;

// O passo do antesDeMover Análise → Técnica: a rodada nova começa sem aprovação
// nem reprovação da anterior (RN-EMP-70).
const SQL_ANALISE_ENVIAR = `UPDATE SGC_EMP_EMPENHO SET
  TEC_POR = NULL, TEC_EM = NULL, DIR_POR = NULL, DIR_EM = NULL,
  REPROV_FASE = NULL, REPROV_MOTIVO = NULL, REPROV_POR = NULL, REPROV_EM = NULL,
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}}
  AND ${guarda(OPERAR)}
  AND ${naFase('{{cardId}}', 'emp_analise')}`;

const SQL_APROVAR_TECNICA = `UPDATE SGC_EMP_EMPENHO SET TEC_POR = :VAR_USER, TEC_EM = '{{agora}}', ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}}
  AND ${guarda(TECNICA)}
  AND ${naFase('{{cardId}}', 'emp_tecnica')}`;

// C-021 / RN-003 (P-05): aprovar a diretoria congela valor, custo e CMV na MESMA instrução.
const SQL_APROVAR_DIRETORIA = `UPDATE SGC_EMP_EMPENHO SET
  DIR_POR = :VAR_USER, DIR_EM = '{{agora}}',
  VL_TOTAL = ${valorDoEmpenho('SGC_EMP_EMPENHO.ID')},
  VL_CUSTO = ${custoDoEmpenho('SGC_EMP_EMPENHO.ID')},
  CMV_PERC = ${cmvDoEmpenho('SGC_EMP_EMPENHO.ID')},
  CONGELADO_EM = '{{agora}}', ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND COALESCE(TEC_EM, '') <> ''
  AND ${guarda(DIRETORIA)}
  AND ${naFase('{{cardId}}', 'emp_diretoria')}`;

// C-023 / P-07: só grava com motivo de 10+ e por quem decide a fase em que o card está.
const SQL_REPROVAR = `UPDATE SGC_EMP_EMPENHO SET
  REPROV_FASE = CASE WHEN '{{fase}}' = 'diretoria' THEN 'diretoria' ELSE 'tecnica' END,
  REPROV_MOTIVO = '{{motivo}}', REPROV_POR = :VAR_USER, REPROV_EM = '{{agora}}',
  TEC_POR = NULL, TEC_EM = NULL, DIR_POR = NULL, DIR_EM = NULL, ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND LENGTH(TRIM('{{motivo}}')) >= 10
  AND (('{{fase}}' = 'tecnica' AND ${guarda(TECNICA)} AND ${naFase('{{cardId}}', 'emp_tecnica')})
    OR ('{{fase}}' = 'diretoria' AND ${guarda(DIRETORIA)} AND ${naFase('{{cardId}}', 'emp_diretoria')}))`;

/** RN-010: a quantidade do item que vai para o pedido. Exige SGC_EMP_ITEM como `I`. */
const QT_DO_PEDIDO = `CASE WHEN '{{tipo}}' = 'TRANSFERENCIA' THEN COALESCE(I.QT_TRANSFERENCIA, 0)
    WHEN I.CODFORNEC = {{codfornec}} THEN COALESCE(I.QT_COMPRA, 0) ELSE 0 END`;
const TIPO_PEDIDO = `CASE WHEN '{{tipo}}' = 'TRANSFERENCIA' THEN 'TRANSFERENCIA' ELSE 'FORNECEDOR' END`;

// C-021 / RN-010: o vínculo do card gerado com o empenho aprovado pela diretoria
// e ainda não desmembrado, com o valor e o custo DO PEDIDO. Um por indústria e um
// de transferência por empenho; o card é do quadro e foi criado por quem chama.
const SQL_PEDIDO_REGISTRAR = `INSERT INTO SGC_EMP_CARD
  (ID_EMPENHO, ID_CARD, TIPO, CODFORNEC, FORNECEDOR, VL_TOTAL, VL_CUSTO, CRIADO_POR, CRIADO_EM)
SELECT E.ID, {{cardFilho}}, ${TIPO_PEDIDO}, CASE WHEN '{{tipo}}' = 'TRANSFERENCIA' THEN 0 ELSE {{codfornec}} END,
  '{{fornecedor}}',
  ${somaItens(`(${QT_DO_PEDIDO}) * I.PRECO_VENDA`, 'E.ID')},
  ${somaItens(`(${QT_DO_PEDIDO}) * (${CUSTO_EFETIVO})`, 'E.ID')},
  :VAR_USER, '{{agora}}'
FROM SGC_EMP_EMPENHO E
WHERE E.ID_CARD = {{cardId}} AND COALESCE(E.DIR_EM, '') <> '' AND COALESCE(E.DESMEMBRADO_EM, '') = ''
  AND ${guarda(DIRETORIA)}
  AND ${naFase('{{cardId}}', 'emp_diretoria')}
  AND ${cardNovoDoQuadro('{{cardFilho}}')}
  AND NOT EXISTS (SELECT 1 FROM SGC_EMP_CARD X WHERE X.ID_CARD = {{cardFilho}})
  AND NOT EXISTS (SELECT 1 FROM SGC_EMP_EMPENHO Y WHERE Y.ID_CARD = {{cardFilho}})
  AND NOT EXISTS (SELECT 1 FROM SGC_EMP_CARD X WHERE X.ID_EMPENHO = E.ID AND X.TIPO = ${TIPO_PEDIDO}
                  AND COALESCE(X.CODFORNEC, 0) = CASE WHEN '{{tipo}}' = 'TRANSFERENCIA' THEN 0 ELSE {{codfornec}} END)
  AND EXISTS (SELECT 1 FROM SGC_EMP_ITEM I WHERE I.ID_EMPENHO = E.ID AND (${QT_DO_PEDIDO}) > 0)`;

// RN-010 (D30 do legado): uma pendência TRANSFERENCIA por item a transferir, numa instrução.
const SQL_PENDENCIAS_TRANSFERENCIA = `INSERT INTO SGC_EMP_PENDENCIA
  (ID_EMPENHO, ID_CARD, CODPROD, TIPO, DESCRICAO, QT, CODFILIAL_ORIGEM, STATUS, ABERTA_POR, ABERTA_EM)
SELECT PC.ID_EMPENHO, PC.ID_CARD, I.CODPROD, 'TRANSFERENCIA', I.DESCRICAO, I.QT_TRANSFERENCIA, I.CODFILIAL_ORIGEM,
  'ABERTA', :VAR_USER, '{{agora}}'
FROM SGC_EMP_CARD PC
JOIN SGC_EMP_ITEM I ON I.ID_EMPENHO = PC.ID_EMPENHO AND COALESCE(I.QT_TRANSFERENCIA, 0) > 0
WHERE PC.ID_CARD = {{cardFilho}} AND PC.TIPO = 'TRANSFERENCIA'
  AND ${guarda(DIRETORIA)}
  AND NOT EXISTS (SELECT 1 FROM SGC_EMP_PENDENCIA X WHERE X.ID_CARD = {{cardFilho}} AND X.TIPO = 'TRANSFERENCIA')`;

// P-07: "desmembrado" só com pedido registrado.
const SQL_DESMEMBRADO = `UPDATE SGC_EMP_EMPENHO SET DESMEMBRADO_EM = '{{agora}}', ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{cardId}} AND COALESCE(DIR_EM, '') <> '' AND COALESCE(DESMEMBRADO_EM, '') = ''
  AND EXISTS (SELECT 1 FROM SGC_EMP_CARD X WHERE X.ID_EMPENHO = SGC_EMP_EMPENHO.ID)
  AND ${guarda(DIRETORIA)}`;

const pedidoDoCard = (tipo) => `ID_CARD = {{cardId}}${tipo ? ` AND TIPO = '${tipo}'` : ''}`;

// C-025: número e data do pedido à indústria.
const SQL_PEDIDO_ENVIO = `UPDATE SGC_EMP_CARD SET NUM_PEDIDO = TRIM('{{numPedido}}'), DT_PEDIDO = '{{dtPedido}}'
WHERE ${pedidoDoCard('FORNECEDOR')} AND LENGTH(TRIM('{{numPedido}}')) > 0 AND '{{dtPedido}}' <> ''
  AND ${guarda(OPERAR)}
  AND ${naFase('{{cardId}}', 'emp_envio', 'emp_aguardando')}`;

// C-026: a previsão de chegada.
const SQL_PEDIDO_PREVISAO = `UPDATE SGC_EMP_CARD SET DT_PREVISAO = '{{dtPrevisao}}'
WHERE ${pedidoDoCard()} AND '{{dtPrevisao}}' <> ''
  AND ${guarda(OPERAR)}
  AND ${naFase('{{cardId}}', 'emp_aguardando', 'emp_transito', 'emp_pendencia')}`;

// C-027: recebido na BN.
const SQL_PEDIDO_RECEBIDO = `UPDATE SGC_EMP_CARD SET DT_RECEBIDO = '{{dtRecebido}}'
WHERE ${pedidoDoCard()} AND '{{dtRecebido}}' <> ''
  AND ${guarda(OPERAR)}
  AND ${naFase('{{cardId}}', 'emp_transito')}`;

// C-029 / RN-011: pendência manual (BO ou VENDA; desconhecido vira BO).
const SQL_PENDENCIA_ABRIR = `INSERT INTO SGC_EMP_PENDENCIA
  (ID_EMPENHO, ID_CARD, CODPROD, TIPO, DESCRICAO, QT, CODFILIAL_ORIGEM, PREVISAO, STATUS, ABERTA_POR, ABERTA_EM)
SELECT PC.ID_EMPENHO, PC.ID_CARD, {{codprod}}, CASE WHEN '{{tipo}}' = 'VENDA' THEN 'VENDA' ELSE 'BO' END, '{{descricao}}', 0, NULL,
  NULLIF('{{previsao}}', ''), 'ABERTA', :VAR_USER, '{{agora}}'
FROM SGC_EMP_CARD PC
WHERE PC.ID_CARD = {{cardId}} AND LENGTH(TRIM('{{descricao}}')) >= 10
  AND ${guarda(OPERAR)}
  AND ${naFase('{{cardId}}', 'emp_envio', 'emp_aguardando', 'emp_transito', 'emp_pendencia')}`;

// C-030: só pendência aberta se fecha.
const SQL_PENDENCIA_FECHAR = `UPDATE SGC_EMP_PENDENCIA SET
  STATUS = CASE WHEN '{{status}}' = 'CANCELADA' THEN 'CANCELADA' ELSE 'RESOLVIDA' END,
  FECHADA_POR = :VAR_USER, FECHADA_EM = '{{agora}}'
WHERE ID = {{id}} AND STATUS = 'ABERTA'
  AND ${guarda(OPERAR)}`;

// C-033 / P-13: cancelar é do empenho inteiro, com motivo; a diretoria só na fase dela.
const SQL_CANCELAR = `UPDATE SGC_EMP_EMPENHO SET CANC_MOTIVO = '{{motivo}}', CANC_POR = :VAR_USER, CANC_EM = '{{agora}}',
  ATUALIZADO_EM = '{{agora}}'
WHERE (ID_CARD = {{cardId}} OR ID = (SELECT PC.ID_EMPENHO FROM SGC_EMP_CARD PC WHERE PC.ID_CARD = {{cardId}}))
  AND LENGTH(TRIM('{{motivo}}')) >= 10
  AND EXISTS (SELECT 1 FROM KB_CARD KC JOIN SGC_EMP_FASE SF ON SF.BOARD_ID = KC.BOARD_ID AND SF.FASE_ID = KC.FASE_ID
              WHERE KC.ID = SGC_EMP_EMPENHO.ID_CARD AND SF.CHAVE NOT IN (${aspas(FINAIS)}))
  AND (${guarda(OPERAR)} OR (${guarda(['diretoria'])} AND ${naFase('{{cardId}}', 'emp_diretoria')}))`;

/* ─────────────── JAVASCRIPT ─────────────── */

const PRELUDIO = `const { runQueryMitra, executeServerFunctionMitra } = require('mitra-sdk');
const SGC_IDS = ${MARCADOR_IDS};
const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);

function desembrulhar(resposta) {
  let saida = resposta;
  for (let volta = 0; volta < 4; volta += 1) {
    if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch (e) { return saida; } continue; }
    if (saida && typeof saida === 'object' && saida.result !== undefined) { saida = saida.result; continue; }
    if (saida && typeof saida === 'object' && saida.output !== undefined) { saida = saida.output; continue; }
    break;
  }
  return saida;
}
function linhasDe(resposta) {
  const saida = desembrulhar(resposta);
  if (Array.isArray(saida)) return saida;
  if (saida && Array.isArray(saida.rows)) return saida.rows;
  return [];
}
async function consultar(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }
async function chamar(nome, entrada) {
  const id = SGC_IDS[nome];
  if (!id) throw new Error('Server function sem id no mapa: ' + nome);
  return desembrulhar(await executeServerFunctionMitra({ projectId, serverFunctionId: Number(id), input: entrada || {} }));
}
function inteiro(valor) { const n = Number(valor); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function numero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
function texto(valor, teto) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\\u0000-\\u001f]/g, ' ').slice(0, teto || 200).replace(/'/g, "''");
}
function lote(colunas, linhas) {
  return linhas.map(function (valores, ordem) {
    return 'SELECT ' + valores.map(function (valor, coluna) {
      return ordem === 0 ? valor + ' AS ' + colunas[coluna] : valor;
    }).join(', ');
  }).join(' UNION ALL ');
}
function agora() { return new Date().toISOString().slice(0, 19); }
// R-013: o mesmo mapa de ACCESS_LEVEL da guarda SQL, conferido ANTES de escrever.
async function persona() {
  const linhas = await consultar("SELECT IU.ID, COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS NIVEL, COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')"
    + " WHEN 'ADMIN' THEN 'admin' WHEN 'RESTRICTED' THEN 'comercial' ELSE 'analista' END) AS PERSONA"
    + ' FROM INT_USER IU LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID WHERE IU.ID = :VAR_USER');
  const linha = linhas[0];
  if (!linha) return { id: 0, persona: '', nivel: '' };
  return { id: inteiro(linha.ID), persona: String(linha.PERSONA || ''), nivel: String(linha.NIVEL || '') };
}`;

// RNF-001: abrir o card = kbCardDetalhe (lib) + ESTA execução. Serve o card do
// empenho e o de qualquer pedido dele: o papel diz qual é.
const JS_CARREGAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!quem.id || quem.persona === 'comercial') return { ok: false, erro: 'Seu perfil não tem acesso ao quadro de empenhos.' };

const vinculo = await consultar('SELECT E.ID AS ID_EMPENHO, 0 AS EH_PEDIDO FROM SGC_EMP_EMPENHO E WHERE E.ID_CARD = ' + cardId
  + ' UNION ALL SELECT PC.ID_EMPENHO, 1 FROM SGC_EMP_CARD PC WHERE PC.ID_CARD = ' + cardId);
if (!vinculo[0]) return { ok: true, papel: '', empenho: null, itens: [], pedidos: [], pendencias: [], pedido: null };
const idEmpenho = inteiro(vinculo[0].ID_EMPENHO);

const FASE = ' JOIN KB_CARD KC ON KC.ID = {CARD} JOIN SGC_EMP_FASE SF ON SF.BOARD_ID = KC.BOARD_ID AND SF.FASE_ID = KC.FASE_ID'
  + ' JOIN KB_FASE KF ON KF.ID = KC.FASE_ID';
const empenhos = await consultar('SELECT E.*, P.CODIGO_EDITAL, P.ORGAO, P.CODCLI, COALESCE(P.DT_VIGENCIA_FIM, \\'\\') AS DT_VIGENCIA_FIM,'
  + ' KC.TITULO, SF.CHAVE AS FASE, KF.NOME AS FASE_NOME,'
  + " COALESCE(UT.NOME, '') AS TEC_NOME, COALESCE(UD.NOME, '') AS DIR_NOME, COALESCE(UR.NOME, '') AS REPROV_NOME, COALESCE(UC.NOME, '') AS CANC_NOME"
  + ' FROM SGC_EMP_EMPENHO E JOIN SGC_EMP_PREGAO P ON P.ID = E.ID_PREGAO'
  + FASE.split('{CARD}').join('E.ID_CARD')
  + ' LEFT JOIN INT_USER UT ON UT.ID = E.TEC_POR LEFT JOIN INT_USER UD ON UD.ID = E.DIR_POR'
  + ' LEFT JOIN INT_USER UR ON UR.ID = E.REPROV_POR LEFT JOIN INT_USER UC ON UC.ID = E.CANC_POR'
  + ' WHERE E.ID = ' + idEmpenho);
const itens = await consultar('SELECT * FROM SGC_EMP_ITEM WHERE ID_EMPENHO = ' + idEmpenho + ' ORDER BY DESCRICAO, CODPROD');
const pedidos = await consultar('SELECT PC.*, KC.TITULO, SF.CHAVE AS FASE, KF.NOME AS FASE_NOME FROM SGC_EMP_CARD PC'
  + FASE.split('{CARD}').join('PC.ID_CARD') + ' WHERE PC.ID_EMPENHO = ' + idEmpenho + ' AND KC.EXCLUIDO_EM IS NULL ORDER BY PC.TIPO, PC.FORNECEDOR, PC.ID');
const pendencias = await consultar("SELECT PD.*, COALESCE(UA.NOME, '') AS ABERTA_NOME, COALESCE(UF.NOME, '') AS FECHADA_NOME"
  + ' FROM SGC_EMP_PENDENCIA PD LEFT JOIN INT_USER UA ON UA.ID = PD.ABERTA_POR LEFT JOIN INT_USER UF ON UF.ID = PD.FECHADA_POR'
  + ' WHERE PD.ID_EMPENHO = ' + idEmpenho + ' ORDER BY PD.ID');
const pedido = inteiro(vinculo[0].EH_PEDIDO) === 1
  ? (pedidos.filter(function (p) { return inteiro(p.ID_CARD) === cardId; })[0] || null) : null;
return {
  ok: true,
  papel: pedido ? String(pedido.TIPO || '') : 'EMPENHO',
  empenho: empenhos[0] || null,
  itens: itens,
  pedidos: pedidos,
  pendencias: pendencias,
  pedido: pedido,
};`;

// RNF-002: a análise inteira numa execução da tela; as escritas por id em lotes de 200.
const JS_ITENS_GRAVAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!quem.id || quem.nivel === 'READ_ONLY' || ['admin', 'analista', 'gestor'].indexOf(quem.persona) === -1) {
  return { ok: false, erro: 'Seu perfil não pode editar os itens deste empenho.' };
}
const empenho = (await consultar('SELECT E.ID, SF.CHAVE FROM SGC_EMP_EMPENHO E JOIN KB_CARD KC ON KC.ID = E.ID_CARD'
  + ' JOIN SGC_EMP_FASE SF ON SF.BOARD_ID = KC.BOARD_ID AND SF.FASE_ID = KC.FASE_ID WHERE E.ID_CARD = ' + cardId))[0];
if (!empenho) return { ok: false, erro: 'Empenho não encontrado.' };
if (String(empenho.CHAVE) !== 'emp_analise') return { ok: false, erro: 'Os itens só mudam com o empenho na Análise.' };
const idEmpenho = inteiro(empenho.ID);

function lista(valor) {
  let saida = valor;
  if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch (e) { saida = null; } }
  return Array.isArray(saida) ? saida : [];
}
const itens = lista(event.itensJson).filter(function (item) { return inteiro(item && item.codprod) > 0; });
const remover = lista(event.removerJson).map(inteiro).filter(function (c) { return c > 0; });

const COLUNAS = ${JSON.stringify(COLUNAS_ITEM)};
const quando = agora();
const tuplas = itens.map(function (item) {
  const tipoCusto = String(item.tipoCustoPedido || '') === 'PADRAO' ? 'PADRAO' : '';
  const transferencia = numero(item.qtTransferencia);
  return [
    idEmpenho, inteiro(item.codprod),
    "'" + texto(item.descricao, 200) + "'", "'" + texto(item.embalagem, 60) + "'", "'" + texto(item.unidade, 10) + "'",
    "'" + texto(item.codfab, 60) + "'", inteiro(item.codfornec), "'" + texto(item.fornecedor, 200) + "'",
    numero(item.qtEmpenho), numero(item.precoVenda), numero(item.custoNegociado), numero(item.custoEspecial),
    numero(item.custoPadrao), "'" + tipoCusto + "'",
    numero(item.qtCompra), transferencia, numero(item.qtEstoque),
    "'" + (transferencia > 0 ? texto(item.codfilialOrigem, 10) : '') + "'", "'" + texto(item.observacao, 500) + "'",
    quem.id, "'" + quando + "'",
  ];
});
for (let inicio = 0; inicio < tuplas.length; inicio += 200) {
  await chamar('sgcEscEmpItemGravar', { linhas: lote(COLUNAS, tuplas.slice(inicio, inicio + 200)), idEmpenho: idEmpenho, usuarioId: quem.id });
}
if (remover.length) await chamar('sgcEscEmpItemRemover', { idEmpenho: idEmpenho, codprods: remover.join(', '), usuarioId: quem.id });
await chamar('sgcEscEmpTotais', { idEmpenho: idEmpenho, usuarioId: quem.id, agora: quando });
const capa = (await consultar('SELECT VL_TOTAL, VL_CUSTO, CMV_PERC FROM SGC_EMP_EMPENHO WHERE ID = ' + idEmpenho))[0] || {};
return { ok: true, itens: itens.length, removidos: remover.length,
  vlTotal: numero(capa.VL_TOTAL), vlCusto: numero(capa.VL_CUSTO), cmv: capa.CMV_PERC === null || capa.CMV_PERC === undefined ? null : numero(capa.CMV_PERC) };`;

/* ─────────────── o ramo do gancho (R-161) ─────────────── */

/** Mensagens — as MESMAS de `lib/empenhos.ts` (a tela desabilita com a mesma frase). */
export const MENSAGENS_EMPENHO = {
  comercial: 'Seu perfil não tem acesso ao quadro de empenhos.',
  leitura: 'Seu acesso é somente leitura.',
  restrito: 'Seu acesso só permite mover os cards que você criou.',
  diretoria: 'Você só movimenta cards na fase Aprovação da Diretoria.',
  semTransicao: 'Esta passagem não existe no fluxo do empenho.',
  analise: 'Há itens sem decisão fechada, sem preço do contrato ou com transferência sem filial.',
  tecnica: 'A aprovação técnica ainda não foi registrada.',
  diretoriaAprov: 'A aprovação da diretoria ainda não foi registrada, ou o empenho não foi desmembrado.',
  reprovar: 'Reprove com o motivo pelo botão Reprovar.',
  nadaAPedir: 'Este empenho tem itens a comprar ou transferir: aprove e desmembre.',
  reagrupar: 'O empenho volta a ser um só quando todos os pedidos terminarem.',
  cancelar: 'Cancele pelo botão Cancelar empenho, com o motivo.',
  envio: 'Informe o número e a data do pedido à indústria.',
  previsao: 'Informe a previsão de chegada.',
  recebido: 'Marque o recebimento na BN.',
  pendenciaAberta: 'Feche as pendências abertas antes de avançar.',
  semPendencia: 'Abra uma pendência para mover o pedido para Pedidos com Pendência.',
  excluir: 'Só se exclui o empenho na Análise, sem pedido, por admin, gestor ou diretoria.',
};
const M = MENSAGENS_EMPENHO;

/** RN-008: os pares por papel do card. A ordem não importa; a condição de cada par vem no CASE. */
export const PARES_EMPENHO = {
  EMPENHO: ['emp_analise>emp_tecnica', 'emp_tecnica>emp_diretoria', 'emp_tecnica>emp_analise',
    'emp_diretoria>emp_pedidos', 'emp_diretoria>emp_concluido', 'emp_diretoria>emp_analise',
    'emp_pedidos>emp_concluido', 'emp_pedidos>emp_cancelado',
    'emp_analise>emp_cancelado', 'emp_tecnica>emp_cancelado', 'emp_diretoria>emp_cancelado'],
  FORNECEDOR: ['emp_analise>emp_envio', 'emp_envio>emp_aguardando', 'emp_aguardando>emp_transito', 'emp_transito>emp_concluido',
    'emp_envio>emp_pendencia', 'emp_aguardando>emp_pendencia', 'emp_transito>emp_pendencia', 'emp_pendencia>emp_transito',
    'emp_aguardando>emp_envio', 'emp_transito>emp_aguardando',
    'emp_analise>emp_cancelado', 'emp_envio>emp_cancelado', 'emp_aguardando>emp_cancelado',
    'emp_transito>emp_cancelado', 'emp_pendencia>emp_cancelado'],
  TRANSFERENCIA: ['emp_analise>emp_pendencia', 'emp_pendencia>emp_transito', 'emp_transito>emp_pendencia',
    'emp_transito>emp_concluido', 'emp_analise>emp_cancelado', 'emp_pendencia>emp_cancelado', 'emp_transito>emp_cancelado'],
};

/** O pedido recém-gerado sai da Análise para a fase de entrada — a diretoria que desmembra também pode. */
const ENTRADA_DO_PEDIDO = `((T.PAPEL = 'FORNECEDOR' AND T.PAR = 'emp_analise>emp_envio')
      OR (T.PAPEL = 'TRANSFERENCIA' AND T.PAR = 'emp_analise>emp_pendencia'))`;

const parDoPapel = `((T.PAPEL = 'EMPENHO' AND T.PAR IN (${aspas(PARES_EMPENHO.EMPENHO)}))
      OR (T.PAPEL = 'FORNECEDOR' AND T.PAR IN (${aspas(PARES_EMPENHO.FORNECEDOR)}))
      OR (T.PAPEL = 'TRANSFERENCIA' AND T.PAR IN (${aspas(PARES_EMPENHO.TRANSFERENCIA)})))`;

const CONTAR_PEDIDOS = (condicao) => `(SELECT COUNT(*) FROM SGC_EMP_CARD P2
      JOIN KB_CARD K2 ON K2.ID = P2.ID_CARD AND K2.EXCLUIDO_EM IS NULL
      JOIN SGC_EMP_FASE F2 ON F2.BOARD_ID = K2.BOARD_ID AND F2.FASE_ID = K2.FASE_ID
      WHERE P2.ID_EMPENHO = E.ID${condicao ? ` AND ${condicao}` : ''})`;

/** O card em chaves estáveis: persona, acesso, fases, papel, estado do empenho e do pedido, contagens. */
function contextoEmpenho({ comDestino = true } = {}) {
  return `SELECT
    ${PERSONA_EFETIVA} AS PERSONA,
    COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACESSO,
    COALESCE(C.CRIADO_POR, 0) AS CRIADO_POR,
    COALESCE(FO.CHAVE, '') AS ORIGEM,
    ${comDestino ? "CONCAT(COALESCE(FO.CHAVE, ''), '>', COALESCE(FD.CHAVE, ''))" : "''"} AS PAR,
    CASE WHEN EP.ID IS NOT NULL THEN 'EMPENHO' WHEN PC.ID IS NOT NULL THEN PC.TIPO ELSE '' END AS PAPEL,
    COALESCE(E.TEC_EM, '') AS TEC_EM,
    COALESCE(E.DIR_EM, '') AS DIR_EM,
    COALESCE(E.REPROV_FASE, '') AS REPROV_FASE,
    COALESCE(E.DESMEMBRADO_EM, '') AS DESMEMBRADO_EM,
    COALESCE(E.CANC_MOTIVO, '') AS CANC_MOTIVO,
    COALESCE(PC.NUM_PEDIDO, '') AS NUM_PEDIDO,
    COALESCE(PC.DT_PEDIDO, '') AS DT_PEDIDO,
    COALESCE(PC.DT_PREVISAO, '') AS DT_PREVISAO,
    COALESCE(PC.DT_RECEBIDO, '') AS DT_RECEBIDO,
    (SELECT COUNT(*) FROM SGC_EMP_ITEM I WHERE I.ID_EMPENHO = E.ID) AS ITENS,
    (SELECT COUNT(*) FROM SGC_EMP_ITEM I WHERE I.ID_EMPENHO = E.ID AND ${ITEM_ABERTO}) AS ITENS_ABERTOS,
    (SELECT COUNT(*) FROM SGC_EMP_ITEM I WHERE I.ID_EMPENHO = E.ID
       AND (COALESCE(I.QT_COMPRA, 0) > 0 OR COALESCE(I.QT_TRANSFERENCIA, 0) > 0)) AS ITENS_A_PEDIR,
    (SELECT COUNT(*) FROM SGC_EMP_PENDENCIA PD WHERE PD.ID_CARD = C.ID AND PD.STATUS = 'ABERTA') AS PEND_ABERTAS,
    ${CONTAR_PEDIDOS('')} AS PEDIDOS,
    ${CONTAR_PEDIDOS(`F2.CHAVE IN (${aspas(FINAIS)})`)} AS PEDIDOS_FINAIS,
    ${CONTAR_PEDIDOS("F2.CHAVE = 'emp_cancelado'")} AS PEDIDOS_CANCELADOS
  FROM KB_CARD C
  LEFT JOIN INT_USER IU ON IU.ID = {{usuarioId}}
  LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = {{usuarioId}}
  LEFT JOIN SGC_EMP_FASE FO ON FO.BOARD_ID = C.BOARD_ID AND FO.FASE_ID = C.FASE_ID
  ${comDestino ? 'LEFT JOIN SGC_EMP_FASE FD ON FD.BOARD_ID = {{boardId}} AND FD.FASE_ID = {{faseId}}' : ''}
  LEFT JOIN SGC_EMP_EMPENHO EP ON EP.ID_CARD = C.ID
  LEFT JOIN SGC_EMP_CARD PC ON PC.ID_CARD = C.ID
  LEFT JOIN SGC_EMP_EMPENHO E ON E.ID = COALESCE(EP.ID, PC.ID_EMPENHO)
  WHERE C.ID = {{cardId}} AND C.EXCLUIDO_EM IS NULL
    AND EXISTS (SELECT 1 FROM KB_BOARD QB WHERE QB.ID = {{boardId}} AND QB.SLUG = '${SLUG_EMPENHOS}')`;
}

/** Fora do quadro `empenhos`: o add-005 pendura isto na consulta de compras (exatamente uma metade devolve linha). */
export const FORA_DOS_EMPENHOS = `NOT EXISTS (SELECT 1 FROM KB_BOARD QB WHERE QB.ID = {{boardId}} AND QB.SLUG = '${SLUG_EMPENHOS}')`;

// RN-008 / RN-009. A ordem do CASE é a ordem em que a regra recusa — a MESMA de
// `motivoDeDestinoEmpenho` em frontend/src/lib/empenhos.ts.
const PODE_MOVER = `CASE
    WHEN T.PERSONA = 'comercial' THEN 0
    WHEN T.ACESSO = 'READ_ONLY' THEN 0
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}} THEN 0
    WHEN T.PERSONA = 'diretoria' AND T.ORIGEM <> 'emp_diretoria' AND NOT ${ENTRADA_DO_PEDIDO} THEN 0
    WHEN NOT ${parDoPapel} THEN 0
    WHEN T.PAR LIKE '%>emp_cancelado' AND T.PAR <> 'emp_pedidos>emp_cancelado' AND T.CANC_MOTIVO = '' THEN 0
    WHEN T.PAR = 'emp_pedidos>emp_cancelado' AND T.CANC_MOTIVO = ''
      AND NOT (T.PEDIDOS > 0 AND T.PEDIDOS_CANCELADOS = T.PEDIDOS) THEN 0
    WHEN T.PAR = 'emp_analise>emp_tecnica' AND (T.ITENS = 0 OR T.ITENS_ABERTOS > 0) THEN 0
    WHEN T.PAR = 'emp_tecnica>emp_diretoria' AND T.TEC_EM = '' THEN 0
    WHEN T.PAR = 'emp_tecnica>emp_analise' AND T.REPROV_FASE <> 'tecnica' THEN 0
    WHEN T.PAR = 'emp_diretoria>emp_analise' AND T.REPROV_FASE <> 'diretoria' THEN 0
    WHEN T.PAR = 'emp_diretoria>emp_pedidos' AND (T.DIR_EM = '' OR T.DESMEMBRADO_EM = '') THEN 0
    WHEN T.PAR = 'emp_diretoria>emp_concluido' AND (T.DIR_EM = '' OR T.ITENS_A_PEDIR > 0) THEN 0
    WHEN T.PAR = 'emp_pedidos>emp_concluido'
      AND NOT (T.PEDIDOS > 0 AND T.PEDIDOS_FINAIS = T.PEDIDOS AND T.PEDIDOS_CANCELADOS < T.PEDIDOS) THEN 0
    WHEN T.PAR IN ('emp_envio>emp_aguardando', 'emp_aguardando>emp_transito', 'emp_transito>emp_concluido', 'emp_pendencia>emp_transito')
      AND T.PEND_ABERTAS > 0 THEN 0
    WHEN T.PAR = 'emp_envio>emp_aguardando' AND (T.NUM_PEDIDO = '' OR T.DT_PEDIDO = '') THEN 0
    WHEN T.PAR = 'emp_aguardando>emp_transito' AND T.DT_PREVISAO = '' THEN 0
    WHEN T.PAR = 'emp_transito>emp_concluido' AND T.DT_RECEBIDO = '' THEN 0
    WHEN T.PAR LIKE '%>emp_pendencia' AND T.PEND_ABERTAS = 0 THEN 0
    ELSE 1
  END`;

const MOTIVO_MOVER = `CASE WHEN (${PODE_MOVER}) = 1 THEN '' ELSE CASE
    WHEN T.PERSONA = 'comercial' THEN '${M.comercial}'
    WHEN T.ACESSO = 'READ_ONLY' THEN '${M.leitura}'
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}} THEN '${M.restrito}'
    WHEN T.PERSONA = 'diretoria' AND T.ORIGEM <> 'emp_diretoria' AND NOT ${ENTRADA_DO_PEDIDO} THEN '${M.diretoria}'
    WHEN NOT ${parDoPapel} THEN '${M.semTransicao}'
    WHEN T.PAR = 'emp_pedidos>emp_cancelado' THEN '${M.reagrupar}'
    WHEN T.PAR LIKE '%>emp_cancelado' THEN '${M.cancelar}'
    WHEN T.PAR = 'emp_analise>emp_tecnica' THEN '${M.analise}'
    WHEN T.PAR = 'emp_tecnica>emp_diretoria' THEN '${M.tecnica}'
    WHEN T.PAR IN ('emp_tecnica>emp_analise', 'emp_diretoria>emp_analise') THEN '${M.reprovar}'
    WHEN T.PAR = 'emp_diretoria>emp_pedidos' THEN '${M.diretoriaAprov}'
    WHEN T.PAR = 'emp_diretoria>emp_concluido' AND T.DIR_EM = '' THEN '${M.diretoriaAprov}'
    WHEN T.PAR = 'emp_diretoria>emp_concluido' THEN '${M.nadaAPedir}'
    WHEN T.PAR = 'emp_pedidos>emp_concluido' THEN '${M.reagrupar}'
    WHEN T.PEND_ABERTAS > 0 AND T.PAR NOT LIKE '%>emp_pendencia' THEN '${M.pendenciaAberta}'
    WHEN T.PAR = 'emp_envio>emp_aguardando' THEN '${M.envio}'
    WHEN T.PAR = 'emp_aguardando>emp_transito' THEN '${M.previsao}'
    WHEN T.PAR = 'emp_transito>emp_concluido' THEN '${M.recebido}'
    WHEN T.PAR LIKE '%>emp_pendencia' THEN '${M.semPendencia}'
    ELSE ''
  END END`;

export const RAMO_PODE_MOVER_EMPENHOS = `SELECT ${PODE_MOVER} AS PODE, ${MOTIVO_MOVER} AS MOTIVO
FROM (
  ${contextoEmpenho()}
) T`;

// C-034: o empenho em rascunho (Análise, sem pedido) por admin, gestor ou
// diretoria; o card sem empenho (a criação parou no meio) também por quem o criou.
const PODE_EXCLUIR = `CASE
    WHEN T.PERSONA = 'comercial' THEN 0
    WHEN T.ACESSO = 'READ_ONLY' THEN 0
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}} THEN 0
    WHEN T.PAPEL = '' AND (T.PERSONA IN ('admin', 'gestor', 'diretoria') OR T.CRIADO_POR = {{usuarioId}}) THEN 1
    WHEN T.PAPEL = 'EMPENHO' AND T.ORIGEM = 'emp_analise' AND T.PEDIDOS = 0
      AND T.PERSONA IN ('admin', 'gestor', 'diretoria') THEN 1
    ELSE 0
  END`;

export const RAMO_PODE_EXCLUIR_EMPENHOS = `SELECT ${PODE_EXCLUIR} AS PODE,
  CASE WHEN (${PODE_EXCLUIR}) = 1 THEN '' ELSE CASE
    WHEN T.PERSONA = 'comercial' THEN '${M.comercial}'
    WHEN T.ACESSO = 'READ_ONLY' THEN '${M.leitura}'
    WHEN T.ACESSO = 'RESTRICTED' AND T.CRIADO_POR <> {{usuarioId}} THEN '${M.restrito}'
    ELSE '${M.excluir}'
  END END AS MOTIVO
FROM (
  ${contextoEmpenho({ comDestino: false })}
) T`;

/* ─────────────── definitions ─────────────── */

const SQL_FASES_LISTAR = `SELECT SF.CHAVE, SF.FASE_ID, KF.NOME, KF.ORDEM, KF.TIPO, COALESCE(KF.COR, '') AS COR
FROM SGC_EMP_FASE SF
JOIN KB_FASE KF ON KF.ID = SF.FASE_ID
ORDER BY KF.ORDEM, SF.ID`;

const LEITURAS = [
  ['sgcEmpFasesListar', SQL_FASES_LISTAR, 'C-002 - tradutor CHAVE estavel -> KB_FASE do quadro empenhos (nome e cor que o administrador edita). Sem params'],
  ['sgcEmpPregoesListar', SQL_PREGOES_LISTAR, 'C-006 - pregoes por edital ou orgao com QT_EMPENHOS, VL_TOTAL e VL_CUSTO (sem cancelados) e TOTAL_REGISTROS. Params: busca, limite, offset'],
  ['sgcEmpPregaoEmpenhos', SQL_PREGAO_EMPENHOS, 'C-006/C-007 - empenhos do pregao com a fase (chave e nome). Params: idPregao int, limite, offset'],
  ['sgcEmpIndicadoresResumo', SQL_INDICADORES_RESUMO, 'C-036/RN-014 - em aberto, concluidos, cancelados, valor e custo (sem cancelados) dos empenhos recebidos no periodo. Params: dataInicio, dataFim, codfilial'],
  ['sgcEmpPrazosListar', SQL_PRAZOS_LISTAR, 'C-035/C-036 - empenhos abertos por dias ate a entrega (e vigencia) a partir de hoje. Params: hoje, codfilial, limite, offset'],
  ['sgcEmpPorOrgao', SQL_POR_ORGAO, 'C-036 - contrato e custo por orgao no periodo, sem cancelados. Params: dataInicio, dataFim, codfilial, limite, offset'],
  ['sgcWintEmpProdutos', SQL_PRODUTOS, 'C-012 - produto ativo por codigo ou nome, com CODFAB e a industria, 20 linhas. Params: codprod int, busca'],
  ['sgcWintEmpClientes', SQL_CLIENTES, 'C-004 - cliente (orgao) por codigo ou nome, os de orgao publico primeiro, 20 linhas. Params: codcli int, busca'],
  ['sgcWintEmpEstoqueFiliais', SQL_ESTOQUE_FILIAIS, 'C-014/RN-005 - por produto x filial: fisico, retido, disponivel, venda valida de 45 dias com publico e ultima venda. Params: codprods fragmento'],
  ['sgcWintEmpVendaMensal', SQL_VENDA_MENSAL, 'C-036/RN-014 - mes a mes: venda valida a orgao publico (11 a 15), privada e compras, em reais. Params: dataInicio, dataFim, codfilial'],
];

const ESCRITAS = [
  ['sgcEscEmpPregaoCriar', SQL_PREGAO_CRIAR, 'C-004/C-005 - pregao com edital unico. Params: codigoEdital, orgao, codcli int, vigenciaFim, agora'],
  ['sgcEscEmpEmpenhoCriar', SQL_EMPENHO_CRIAR, 'C-008 - capa do empenho sobre o card recem-criado do quadro empenhos. Params: cardId int, idPregao int, numEmpenho, codfilial, filial, codfilialPedido, dtRecebimento, prazoDias int, prazoUnidade, dtLimite, aceitaParcial int, observacao, agora'],
  ['sgcEscEmpCabecalhoSalvar', SQL_CABECALHO_SALVAR, 'C-019 - cabecalho do empenho na Analise. Params: cardId int, numEmpenho, codfilialPedido, dtRecebimento, prazoDias int, prazoUnidade, dtLimite, aceitaParcial int, observacao, agora'],
  ['sgcEscEmpItemGravar', SQL_ITEM_GRAVAR, 'RNF-002 - interna (sgcEmpItensGravar): upsert em lote dos itens, empenho na Analise. Params: linhas fragmento, idEmpenho int, usuarioId int', true],
  ['sgcEscEmpItemRemover', SQL_ITEM_REMOVER, 'RNF-002 - interna (sgcEmpItensGravar): remove itens. Params: idEmpenho int, codprods fragmento, usuarioId int', true],
  ['sgcEscEmpTotais', SQL_TOTAIS, 'RN-003 - interna (sgcEmpItensGravar): valor, custo e CMV vivos. Params: idEmpenho int, usuarioId int, agora', true],
  ['sgcEscEmpAnaliseEnviar', SQL_ANALISE_ENVIAR, 'C-018 - antes de Analise -> Tecnica: limpa aprovacoes e reprovacao da rodada anterior. Params: cardId int, agora'],
  ['sgcEscEmpAprovarTecnica', SQL_APROVAR_TECNICA, 'C-020 - aprovacao tecnica (admin, gestor). Params: cardId int, agora'],
  ['sgcEscEmpAprovarDiretoria', SQL_APROVAR_DIRETORIA, 'C-021/RN-003 - aprovacao da diretoria (admin, diretoria) que congela valor, custo e CMV. Params: cardId int, agora'],
  ['sgcEscEmpReprovar', SQL_REPROVAR, 'C-023 - reprovacao da fase (tecnica ou diretoria) com motivo de 10+. Params: cardId int, fase, motivo, agora'],
  ['sgcEscEmpPedidoRegistrar', SQL_PEDIDO_REGISTRAR, 'C-021/RN-010 - vinculo do card gerado (industria ou transferencia) com o empenho aprovado. Params: cardId int (empenho), cardFilho int, tipo FORNECEDOR|TRANSFERENCIA, codfornec int, fornecedor, agora'],
  ['sgcEscEmpPendenciasTransferencia', SQL_PENDENCIAS_TRANSFERENCIA, 'RN-010 - uma pendencia TRANSFERENCIA por item a transferir. Params: cardFilho int, agora'],
  ['sgcEscEmpDesmembrado', SQL_DESMEMBRADO, 'P-07 - DESMEMBRADO_EM so com pedido registrado. Params: cardId int, agora'],
  ['sgcEscEmpPedidoEnvio', SQL_PEDIDO_ENVIO, 'C-025 - numero e data do pedido a industria. Params: cardId int, numPedido, dtPedido'],
  ['sgcEscEmpPedidoPrevisao', SQL_PEDIDO_PREVISAO, 'C-026 - previsao de chegada. Params: cardId int, dtPrevisao'],
  ['sgcEscEmpPedidoRecebido', SQL_PEDIDO_RECEBIDO, 'C-027 - recebido na BN. Params: cardId int, dtRecebido'],
  ['sgcEscEmpPendenciaAbrir', SQL_PENDENCIA_ABRIR, 'C-029/RN-011 - pendencia BO ou VENDA com descricao de 10+. Params: cardId int, codprod int, tipo, descricao, previsao, agora'],
  ['sgcEscEmpPendenciaFechar', SQL_PENDENCIA_FECHAR, 'C-030 - fecha pendencia aberta (RESOLVIDA ou CANCELADA). Params: id int, status, agora'],
  ['sgcEscEmpCancelar', SQL_CANCELAR, 'C-033/P-13 - motivo de cancelamento do empenho inteiro (pelo card do empenho ou de um pedido). Params: cardId int, motivo, agora'],
];

const JAVASCRIPT = [
  ['sgcEmpCarregar', JS_CARREGAR, 'RNF-001 - abrir o card: empenho, pregao, itens, pedidos, pendencias e o papel do card. Params: cardId int'],
  ['sgcEmpItensGravar', JS_ITENS_GRAVAR, 'C-017/RNF-002 - itens em lote e totais vivos; confere a persona antes. Params: cardId int, itensJson JSON, removerJson JSON'],
];

const AVISO_INTERNA = 'Interna: chamada por id de dentro de uma JAVASCRIPT, com a guarda sobre usuarioId';

export function montarDefinitions(ids) {
  return [
    ...[...LEITURAS, ...ESCRITAS].map(([name, code, description, interna]) => ({
      name, type: 'SQL', description: interna ? `${description}. ${AVISO_INTERNA}` : description, code,
    })),
    ...JAVASCRIPT.map(([name, code, description]) => ({
      name, type: 'JAVASCRIPT', description, code: code.split(MARCADOR_IDS).join(JSON.stringify(ids)),
    })),
  ];
}

export const definitions = montarDefinitions(idsDoMapa(MAPA));

/* ─────────────── publicação (só no sandbox) ─────────────── */

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

const idDaFuncao = (item) => item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;

if (isEntrypoint()) {
  if (!process.env.MITRA_BASE_URL) throw new Error('MITRA_BASE_URL ausente: este script roda no sandbox do Mitra, com o .env real.');
  const sdk = await import('mitra-sdk');
  const { jdbcIdWinthor } = await import('./add-003-jdbc-winthor.mjs');
  sdk.configureSdkMitra({
    baseURL: process.env.MITRA_BASE_URL,
    token: process.env.MITRA_TOKEN,
    integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
  });
  const projectId = Number(process.env.MITRA_PROJECT_ID);
  const jdbcId = await jdbcIdWinthor(projectId);

  const linhas = async (sql) => {
    const resposta = await sdk.runQueryMitra({ projectId, sql });
    const saida = resposta?.result ?? resposta;
    return saida?.rows ?? saida?.result ?? saida ?? [];
  };
  const um = async (sql) => (await linhas(sql))[0] || null;
  const texto = (valor) => String(valor ?? '').replace(/'/g, "''");
  const agora = new Date().toISOString().slice(0, 19);

  /* 1. quadro `empenhos` (upsert por slug) */
  let board = await um(`SELECT ID FROM KB_BOARD WHERE SLUG = '${SLUG_EMPENHOS}' LIMIT 1`);
  if (!board) {
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_BOARD (NOME, SLUG, DESCRICAO, ADMINS_IDS, ATIVO, CRIADO_EM, ATUALIZADO_EM)
VALUES ('${NOME_EMPENHOS}', '${SLUG_EMPENHOS}', '${texto(DESCRICAO_EMPENHOS)}', '', TRUE, '${agora}', '${agora}')`,
    });
    board = await um(`SELECT ID FROM KB_BOARD WHERE SLUG = '${SLUG_EMPENHOS}' LIMIT 1`);
  }
  const boardId = Number(board.ID);
  console.log(`Quadro ${SLUG_EMPENHOS}: id ${boardId}`);

  /* 2. as 10 fases + SGC_EMP_FASE (idempotente por CHAVE) */
  for (let i = 0; i < FASES_EMPENHO.length; i += 1) {
    const fase = FASES_EMPENHO[i];
    const ja = await um(`SELECT FASE_ID FROM SGC_EMP_FASE WHERE BOARD_ID = ${boardId} AND CHAVE = '${fase.chave}' LIMIT 1`);
    if (ja) continue;
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_FASE (BOARD_ID, NOME, COR, ORDEM, TIPO, SLA_HORAS, ATIVO)
VALUES (${boardId}, '${texto(fase.nome)}', '${fase.cor}', ${i + 1}, '${fase.tipo}', 0, TRUE)`,
    });
    const criada = await um(`SELECT ID FROM KB_FASE WHERE BOARD_ID = ${boardId} AND NOME = '${texto(fase.nome)}' ORDER BY ID DESC LIMIT 1`);
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO SGC_EMP_FASE (BOARD_ID, CHAVE, FASE_ID, ORDEM) VALUES (${boardId}, '${fase.chave}', ${Number(criada.ID)}, ${i + 1})`,
    });
  }
  console.log(`  ${FASES_EMPENHO.length} fases garantidas (por chave em SGC_EMP_FASE)`);

  /* 3. os 6 campos — nenhum obrigatório, nenhum de fase */
  for (let i = 0; i < CAMPOS_EMPENHO.length; i += 1) {
    const campo = CAMPOS_EMPENHO[i];
    const ja = await um(`SELECT ID FROM KB_CAMPO WHERE BOARD_ID = ${boardId} AND CHAVE = '${campo.chave}' LIMIT 1`);
    if (ja) continue;
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_CAMPO (BOARD_ID, FASE_ID, CHAVE, LABEL, TIPO, OBRIGATORIO, NO_CARD, EDITAVEL_DEPOIS, ORDEM, CONFIG_JSON, ATIVO)
VALUES (${boardId}, NULL, '${campo.chave}', '${texto(campo.label)}', '${campo.tipo}', FALSE, ${campo.noCard ? 'TRUE' : 'FALSE'}, FALSE, ${i + 1}, '{}', TRUE)`,
    });
  }
  console.log(`  ${CAMPOS_EMPENHO.length} campos garantidos (0 obrigatórios)`);

  /* 4. server functions — ids reais por NOME (R-016); duas passagens para as JAVASCRIPT */
  async function publicar(definicoes) {
    const publicadas = new Map(((await sdk.listServerFunctionsMitra({ projectId }))?.result ?? []).map((fn) => [fn.name, fn]));
    for (const definicao of definicoes) {
      const corpo = {
        projectId, name: definicao.name, type: definicao.type, code: definicao.code, description: definicao.description,
        ...(WINTHOR.includes(definicao.name) ? { jdbcId } : {}),
      };
      const existente = publicadas.get(definicao.name);
      if (existente) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: idDaFuncao(existente) });
      else await sdk.createServerFunctionMitra(corpo);
    }
    return new Map(((await sdk.listServerFunctionsMitra({ projectId }))?.result ?? []).map((fn) => [fn.name, idDaFuncao(fn)]));
  }
  const idsReais = Object.fromEntries(await publicar(definitions));
  const comIdsReais = montarDefinitions(idsReais).filter((d) => d.type === 'JAVASCRIPT');
  await publicar(comIdsReais);
  console.log(`Pronto: ${definitions.length} server functions da spec 015 (${comIdsReais.length} JAVASCRIPT com ids reais).`);
  console.log('Rode `node add-005-quadro-compras.mjs` (o gancho ganha o ramo do quadro empenhos, R-161) e `node sync-server-function-map.mjs`.');
}
