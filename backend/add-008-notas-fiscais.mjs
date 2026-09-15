// add-008 — Server Functions da spec 005 (notas fiscais e faturamento):
// detecção automática de NF de entrada, conferência NF × pedido, faturamento
// e cobrança. Ver docs/specs/005-notas-fiscais-e-faturamento/.
//
// Faixa de id local: 75xx (R-024) — leituras e JAVASCRIPT 7501–7515, escritas
// 7550–7559. O id local vem de SERVER_FUNCTIONS em
// frontend/src/lib/server-functions.ts até o sync-server-function-map.mjs
// trazer os reais do sandbox — mesmo padrão de add-006-itens.mjs.
//
// As sgcWintNf* (Oracle) resolvem o jdbcId por NOME, com `jdbcIdWinthor` de
// add-003-jdbc-winthor.mjs. As escritas chamadas POR ID de dentro das
// JAVASCRIPT levam a guarda de persona sobre `{{usuarioId}}` (A1 da revisão da
// onda 1): o perfil business libera todas as SFs, então "só o JS confere" não
// protege nada. `sgcEscAvisoInserir` é a ÚNICA exceção (R-023): cron não tem
// persona, e a guarda dela é a idempotência da CHAVE.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-008-notas-fiscais.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { diasUteisEntre } from './lib/dias-uteis.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));
const MARCADOR_IDS = '__SGC_IDS__';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintNfEntradas', 'sgcWintNfItens', 'sgcWintNfParcelas', 'sgcWintNfBuscar'];

// R-048: o campo do quadro `faturamento` (texto, capa: "R$ 72.000,00 (60 %) ·
// saldo R$ 48.000,00"), no MESMO formato de `CAMPOS` de add-005-quadro-compras.mjs.
// `noCard: true` porque o valor aparece na CAPA do cartão, não no formulário:
// é texto calculado, ninguém digita. Nenhum campo obrigatório e nenhum de fase
// (RN-017 da 002). O seed do quadro insere em KB_CAMPO a partir daqui; no
// sandbox quem cria é o isEntrypoint() abaixo, idempotente por chave.
export const CAMPOS_008 = [
  { chave: 'faturamento', label: 'Faturamento', tipo: 'texto', noCard: true },
];

/** EM-02/R-033: cópia obrigatória em toda cobrança. */
export const COPIA_FIXA = 'compras@benenutri.com';

/* ──────────────────────────────────────────────────────────────────────────
   A guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente;
   só a lista de personas e o dono da sessão mudam. `:VAR_USER` vale em SF
   chamada DIRETO da tela; escrita chamada por id de dentro de um JAVASCRIPT
   recebe `{{usuarioId}}` cru — e leva a MESMA guarda sobre ele.
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

const NF = ['admin', 'analista', 'gestor'];
const guardaInterna = () => guarda(NF, '{{usuarioId}}');

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// D-001: uma linha por ITEM de nota candidata. A cobertura por card é calculada
// no JS (pontuarSugestao), porque uma consulta por FORNECEDOR + FILIAL (RNF-002)
// tem de comparar a mesma nota com vários pedidos. As duas origens numa
// consulta só: a nota emitida contra um dos NUMPED da lista entra mesmo se for
// anterior ao envio; as demais entram pela janela de emissão.
// DTCANCEL IS NULL é RN-015; ESPECIE = 'NF' deixa de fora devolução,
// bonificação e remessa (fora de escopo).
const SQL_NF_ENTRADAS = `SELECT * FROM (
  SELECT N.NUMTRANSENT, N.NUMNOTA, NVL(N.SERIE, '') AS SERIE, NVL(N.CHAVENFE, '') AS CHAVENFE,
         N.CODFORNEC, N.CODFILIAL,
         TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
         TO_CHAR(N.DTENT, 'YYYY-MM-DD')     AS DT_ENTRADA,
         NVL(N.VLTOTAL, 0) AS VL_TOTAL, NVL(N.PRAZO, 0) AS PRAZO,
         NVL(M.NUMPED, 0) AS NUMPED, M.CODPROD,
         NVL(TRIM(P.CODFAB), '') AS CODFAB, NVL(TRIM(P.CODAUXILIAR), '') AS EAN,
         NVL(M.QT, 0) AS QT, NVL(M.PUNIT, 0) AS PUNIT
  FROM PCNFENT N
  JOIN PCMOV M ON M.NUMTRANSENT = N.NUMTRANSENT AND M.CODOPER = 'E'
  LEFT JOIN PCPRODUT P ON P.CODPROD = M.CODPROD
  WHERE N.CODFORNEC = {{codfornec}}
    AND N.CODFILIAL = '{{codfilial}}'
    AND N.ESPECIE = 'NF'
    AND N.DTCANCEL IS NULL
    AND ( N.DTEMISSAO >= TO_DATE('{{dataEnvio}}', 'YYYY-MM-DD')
          OR NVL(M.NUMPED, 0) IN ({{numpeds}}) )
  ORDER BY N.DTEMISSAO DESC, N.NUMNOTA, M.CODPROD
) WHERE ROWNUM <= 2000`;

// Os itens de UMA nota, com lote, validade e os códigos alternativos. O EAN
// vem de PCPRODUT.CODAUXILIAR (R-027 tirou PCDADOSXML do escopo).
const SQL_NF_ITENS = `SELECT M.CODPROD, NVL(P.DESCRICAO, '') AS DESCRICAO,
  NVL(TRIM(P.CODFAB), '') AS CODFAB, NVL(TRIM(P.CODAUXILIAR), '') AS EAN,
  NVL(M.QT, 0) AS QT, NVL(M.PUNIT, 0) AS PUNIT, NVL(M.NUMLOTE, '') AS NUMLOTE,
  TO_CHAR(M.DATAVALIDADE, 'YYYY-MM-DD') AS DT_VALIDADE,
  TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD')    AS DT_EMISSAO_NF,
  TO_CHAR(N.DTENT, 'YYYY-MM-DD')        AS DT_ENTRADA,
  N.NUMTRANSENT, NVL(N.SERIE, '') AS SERIE, NVL(N.CHAVENFE, '') AS CHAVENFE,
  NVL(N.VLTOTAL, 0) AS VL_TOTAL, NVL(N.PRAZO, 0) AS PRAZO
FROM PCMOV M
JOIN PCNFENT N ON N.NUMTRANSENT = M.NUMTRANSENT AND N.DTCANCEL IS NULL
LEFT JOIN PCPRODUT P ON P.CODPROD = M.CODPROD
WHERE M.CODOPER = 'E' AND N.NUMNOTA = {{numnota}} AND N.CODFORNEC = {{codfornec}}
  AND ('{{serie}}' = '' OR N.SERIE = '{{serie}}')
ORDER BY M.CODPROD`;

// O prazo real da nota são as duplicatas (PCNFENT.PRAZO está nulo em boa parte
// das notas; por isso é só o plano B, lido do cabeçalho que sgcWintNfItens já
// trouxe). `TRUNC(A - B)` entre duas colunas de data é Oracle puro; o dialeto
// do simulador o reescreve em JULIANDAY (mysql-dialect.mjs).
const SQL_NF_PARCELAS = `SELECT NVL(L.DUPLIC, '') AS DUPLIC,
  TO_CHAR(L.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
  TO_CHAR(L.DTVENC, 'YYYY-MM-DD')    AS DT_VENC,
  NVL(L.VALOR, 0) AS VALOR,
  TRUNC(L.DTVENC - L.DTEMISSAO) AS DIAS
FROM PCLANC L
WHERE L.NUMNOTA = {{numnota}} AND L.CODFORNEC = {{codfornec}}
ORDER BY L.DTVENC`;

// O registro híbrido (O2-07): acha a nota SEM exigir entrada (DTENT pode ser nulo).
const SQL_NF_BUSCAR = `SELECT * FROM (
  SELECT N.NUMTRANSENT, N.NUMNOTA, NVL(N.SERIE, '') AS SERIE, NVL(N.CHAVENFE, '') AS CHAVENFE,
    N.CODFORNEC, N.CODFILIAL, NVL(N.VLTOTAL, 0) AS VL_TOTAL, NVL(N.PRAZO, 0) AS PRAZO,
    TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
    TO_CHAR(N.DTENT, 'YYYY-MM-DD')     AS DT_ENTRADA
  FROM PCNFENT N
  WHERE N.NUMNOTA = {{numnota}} AND N.CODFORNEC = {{codfornec}} AND N.DTCANCEL IS NULL
  ORDER BY N.DTEMISSAO DESC
) WHERE ROWNUM <= 5`;

/* ─────────────── leituras — banco do projeto ─────────────── */

// G-5: `hoje` vazio em produção (vale o relógio do banco); o smoke passa a
// data e a contagem fica determinística.
const HOJE = `COALESCE(NULLIF('{{hoje}}', ''), CURDATE())`;

// RN-010: a sugestão some da fila quando a nota já foi vinculada em QUALQUER
// card — sem rotina de limpeza. O filtro só vale para o que ainda está
// `sugerida`, para a auditoria do validado/recusado continuar legível.
const FILTROS_SUGESTAO = `('{{status}}' = '' OR S.STATUS = '{{status}}')
  AND ({{codfornec}} = 0 OR S.CODFORNEC = {{codfornec}})
  AND ('{{busca}}' = '' OR CONCAT(S.NUMNOTA, '') LIKE CONCAT('%', '{{busca}}', '%')
       OR COALESCE(P.FORNECEDOR, '') LIKE CONCAT('%', '{{busca}}', '%')
       OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%'))
  AND (S.STATUS <> 'sugerida' OR NOT EXISTS (
        SELECT 1 FROM SGC_NF NV
        WHERE NV.CODFORNEC = S.CODFORNEC AND NV.NUMNOTA = S.NUMNOTA
          AND COALESCE(NV.SERIE, '') = COALESCE(S.SERIE, '')))`;

const JUNCOES_SUGESTAO = `FROM SGC_NF_SUGESTAO S
JOIN KB_CARD C ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = S.ID_CARD`;

const SQL_SUGESTOES_LISTAR = `SELECT S.ID, S.ID_CARD, C.TITULO AS CARD_TITULO, COALESCE(F.CHAVE, '') AS FASE,
  COALESCE(P.FORNECEDOR, '') AS FORNECEDOR, COALESCE(P.FILIAL, '') AS FILIAL,
  COALESCE(P.VL_TOTAL, 0) AS VL_PEDIDO,
  S.NUMNOTA, COALESCE(S.SERIE, '') AS SERIE, COALESCE(S.CHAVENFE, '') AS CHAVENFE, S.NUMTRANSENT,
  S.CODFORNEC, COALESCE(S.CODFILIAL, '') AS CODFILIAL,
  S.DT_EMISSAO, COALESCE(S.DT_ENTRADA, '') AS DT_ENTRADA, S.VL_TOTAL,
  S.ORIGEM, S.SCORE, S.STATUS, COALESCE(S.MOTIVO, '') AS MOTIVO,
  COALESCE(S.NUMPED_WINTHOR, '') AS NUMPED_WINTHOR,
  COALESCE(S.DECIDIDO_POR, 0) AS DECIDIDO_POR, COALESCE(IU.NOME, '') AS DECIDIDO_NOME,
  COALESCE(S.DECIDIDO_EM, '') AS DECIDIDO_EM, S.CRIADO_EM,
  CASE WHEN SUBSTR(S.CRIADO_EM, 1, 10) = ${HOJE} THEN 1 ELSE 0 END AS DE_HOJE
${JUNCOES_SUGESTAO}
LEFT JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
LEFT JOIN INT_USER IU ON IU.ID = S.DECIDIDO_POR
WHERE ${FILTROS_SUGESTAO}
ORDER BY S.SCORE DESC, S.CRIADO_EM DESC, S.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_SUGESTOES_TOTAL = `SELECT COUNT(*) AS TOTAL
${JUNCOES_SUGESTAO}
WHERE ${FILTROS_SUGESTAO}`;

// D-004: o monitoramento cobre `enviado`, `transito`, `faturamento` E `bo` —
// no SGC 2 o card entra em Faturamento quando 100 % das notas foram RECEBIDAS
// (R-031), o que não é 100 % faturado; e o pedido que foi para B.O. continua
// com saldo a faturar (D-014). Quem NÃO é avisado pelo cron é só o `bo`
// (R-041) — por isso a listagem traz DT_PREVISAO_BO e QT_BO_ABERTO, que é o
// que a tela mostra no lugar do aviso.
const DIAS = diasUteisEntre('P.DT_ENVIO', HOJE);

const FILTROS_PENDENTE = `C.EXCLUIDO_EM IS NULL
  AND F.CHAVE IN ('enviado', 'transito', 'faturamento', 'bo')
  AND COALESCE(P.DT_ENVIO, '') <> ''
  AND COALESCE(P.PERC_FATURADO_VALOR, 0) < 100
  AND ('{{busca}}' = '' OR P.FORNECEDOR LIKE CONCAT('%', '{{busca}}', '%')
       OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%')
       OR COALESCE(P.NUMPED_WINTHOR, '') = '{{busca}}')
  AND ('{{faixa}}' = ''
       OR ('{{faixa}}' = 'sem_contato' AND NOT EXISTS (SELECT 1 FROM SGC_CONTATO_FATURAMENTO K WHERE K.ID_CARD = C.ID))
       OR ('{{faixa}}' = '3'     AND ${DIAS} BETWEEN 3 AND 4)
       OR ('{{faixa}}' = '5'     AND ${DIAS} = 5)
       OR ('{{faixa}}' = 'mais5' AND ${DIAS} > 5))`;

const JUNCOES_PENDENTE = `FROM KB_CARD C
JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID`;

const SQL_PENDENTE_LISTAR = `SELECT C.ID AS ID_CARD, C.TITULO, F.CHAVE AS FASE,
  P.CODFORNEC, P.FORNECEDOR, P.CODFILIAL, P.FILIAL,
  COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED, P.DT_ENVIO,
  COALESCE(P.EMAIL_ENVIO, '') AS EMAIL_ENVIO,
  COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL, COALESCE(P.VL_FATURADO, 0) AS VL_FATURADO,
  COALESCE(P.PERC_FATURADO_VALOR, 0) AS PERC_VALOR, COALESCE(P.PERC_FATURADO_QTD, 0) AS PERC_QTD,
  COALESCE(P.DT_PRIMEIRO_FATURAMENTO, '') AS DT_PRIMEIRO_FATURAMENTO,
  COALESCE(P.ALERTA_FATURAMENTO_NIVEL, 0) AS ALERTA_NIVEL,
  COALESCE(P.ALERTA_FATURAMENTO_EM, '') AS ALERTA_EM,
  COALESCE(P.CRIADO_POR, 0) AS CRIADO_POR,
  ${DIAS} AS DIAS_UTEIS,
  (SELECT COUNT(*) FROM SGC_CONTATO_FATURAMENTO K WHERE K.ID_CARD = C.ID) AS QT_CONTATOS,
  COALESCE((SELECT MAX(K.DT_CONTATO) FROM SGC_CONTATO_FATURAMENTO K WHERE K.ID_CARD = C.ID), '') AS DT_ULTIMO_CONTATO,
  COALESCE((SELECT MAX(IU.NOME) FROM SGC_CONTATO_FATURAMENTO K LEFT JOIN INT_USER IU ON IU.ID = K.REGISTRADO_POR
            WHERE K.ID_CARD = C.ID AND K.DT_CONTATO = (SELECT MAX(K2.DT_CONTATO) FROM SGC_CONTATO_FATURAMENTO K2 WHERE K2.ID_CARD = C.ID)), '') AS ULTIMO_CONTATO_POR,
  COALESCE(P.DT_PREVISAO_BO, '') AS DT_PREVISAO_BO,
  (SELECT COUNT(*) FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto') AS QT_BO_ABERTO
${JUNCOES_PENDENTE}
WHERE ${FILTROS_PENDENTE}
ORDER BY ${DIAS} DESC, C.ID
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_PENDENTE_TOTAL = `SELECT COUNT(*) AS TOTAL
${JUNCOES_PENDENTE}
WHERE ${FILTROS_PENDENTE}`;

const SQL_CONTATOS_LISTAR = `SELECT K.ID, K.DT_CONTATO, K.CANAL, COALESCE(K.RESUMO, '') AS RESUMO,
  COALESCE(K.PREVISAO_FATURAMENTO, '') AS PREVISAO_FATURAMENTO,
  COALESCE(K.REGISTRADO_POR, 0) AS REGISTRADO_POR, COALESCE(IU.NOME, '') AS REGISTRADO_NOME
FROM SGC_CONTATO_FATURAMENTO K
LEFT JOIN INT_USER IU ON IU.ID = K.REGISTRADO_POR
WHERE K.ID_CARD = {{cardId}}
ORDER BY K.DT_CONTATO DESC, K.ID DESC
LIMIT {{limite}} OFFSET {{offset}}`;

/* ─────────────── escritas (uma instrução por SF) ─────────────── */

const COLUNAS_NF_ITEM = 'ID_NF, ID_CARD, CODPROD, CODFAB, EAN, DESCRICAO, QT_FATURADA, PRECO_FATURADO, NUMLOTE, DT_VALIDADE, CASADO_POR';
const COLUNAS_OCORRENCIA = 'ID_NF, ID_CARD, CODPROD, TIPO, RESULTADO, VALOR_ESPERADO, VALOR_ENCONTRADO, DELTA_PERC, DECISAO, CRIADO_EM';

const emLista = (colunas) => colunas.split(',').map((coluna) => coluna.trim());

const AVISO_INTERNA = 'Escrita interna, chamada por id de dentro das server functions JAVASCRIPT da spec 005; leva a guarda de persona sobre o usuarioId recebido (A1). Nao chamar do frontend.';

const ESCRITAS = [
  {
    name: 'sgcEscNfInserir',
    interna: true,
    resumo: 'RF-006/RN-010 - vincula a nota ao pedido; recusa nota ja vinculada em QUALQUER card. D-012: DT_RECEBIMENTO nasce igual a DT_ENTRADA (vazia quando a nota ainda nao entrou no ERP). Params: cardId, numnota, serie, chavenfe, numtransent, codfornec, codfilial, dtEmissao, dtEntrada, vlTotal, prazoParcelas, origem, usuarioId, agora',
    code: `INSERT INTO SGC_NF
  (ID_CARD, NUMNOTA, SERIE, CHAVENFE, NUMTRANSENT, CODFORNEC, CODFILIAL, DT_EMISSAO, DT_ENTRADA,
   DT_RECEBIMENTO, VL_TOTAL, PRAZO_PARCELAS, ORIGEM, VINCULADO_POR, VINCULADO_EM)
SELECT {{cardId}}, {{numnota}}, '{{serie}}', '{{chavenfe}}', {{numtransent}}, {{codfornec}}, '{{codfilial}}',
  '{{dtEmissao}}', '{{dtEntrada}}', '{{dtEntrada}}', {{vlTotal}}, '{{prazoParcelas}}', '{{origem}}',
  {{usuarioId}}, '{{agora}}'
FROM DUAL
WHERE {{cardId}} > 0 AND {{numnota}} > 0 AND {{usuarioId}} > 0
  AND NOT EXISTS (SELECT 1 FROM SGC_NF EX
                  WHERE EX.CODFORNEC = {{codfornec}} AND EX.NUMNOTA = {{numnota}}
                    AND COALESCE(EX.SERIE, '') = '{{serie}}')
  AND ${guardaInterna()}`,
  },
  {
    name: 'sgcEscNfItemInserir',
    interna: true,
    resumo: 'RF-006 - upsert em lote dos itens da nota (uma execucao por nota, D-002). Params: linhas (fragmento SELECT ... UNION ALL montado por sgcNfVincular), usuarioId int',
    code: `INSERT INTO SGC_NF_ITEM (${COLUNAS_NF_ITEM})
SELECT * FROM ({{linhas}}) LOTE
WHERE ${guardaInterna()}
ON DUPLICATE KEY UPDATE
  CODFAB = VALUES(CODFAB), EAN = VALUES(EAN), DESCRICAO = VALUES(DESCRICAO),
  QT_FATURADA = VALUES(QT_FATURADA), PRECO_FATURADO = VALUES(PRECO_FATURADO),
  DT_VALIDADE = VALUES(DT_VALIDADE), CASADO_POR = VALUES(CASADO_POR)`,
  },
  {
    name: 'sgcEscOcorrenciaInserir',
    interna: true,
    resumo: 'RF-006 - grava as conferencias da nota em lote, INCLUSIVE as conformes. Sem ON DUPLICATE KEY: a tabela nao tem chave unica, e revalidar uma nota gera conferencia nova de proposito. Params: linhas (fragmento SELECT ... UNION ALL), usuarioId int',
    code: `INSERT INTO SGC_NF_OCORRENCIA (${COLUNAS_OCORRENCIA})
SELECT * FROM ({{linhas}}) LOTE
WHERE ${guardaInterna()}`,
  },
  {
    name: 'sgcEscOcorrenciaDecidir',
    interna: true,
    resumo: 'RF-011/RF-012 - aceita ou recusa conferencias numa instrucao: id > 0 decide uma, id = 0 com modo "conformes" decide todas as conformes pendentes do card. Os dois ramos sao EXCLUDENTES (A-3): id = 0 fora do modo "conformes" nao decide nada. Params: cardId, id, modo, decisao, justificativa, usuarioId, decididoEm',
    code: `UPDATE SGC_NF_OCORRENCIA SET
  DECISAO = '{{decisao}}', JUSTIFICATIVA = '{{justificativa}}',
  DECIDIDO_POR = {{usuarioId}}, DECIDIDO_EM = '{{decididoEm}}'
WHERE ID_CARD = {{cardId}} AND DECISAO = 'pendente'
  AND (({{id}} > 0 AND ID = {{id}})
       OR ('{{modo}}' = 'conformes' AND RESULTADO = 'conforme'))
  AND '{{decisao}}' IN ('aceito', 'recusado')
  AND ${guardaInterna()}`,
  },
  {
    name: 'sgcEscSugestaoInserir',
    interna: true,
    resumo: 'RF-001/RF-003 - grava a sugestao de vinculo do cron; idempotente pela chave da sugestao e recusa nota ja vinculada em qualquer card. Params: chavenfe, numtransent, numnota, serie, codfornec, codfilial, vlTotal, dtEmissao, dtEntrada, cardId, numped, origem, score, motivo, usuarioId, criadoEm',
    code: `INSERT INTO SGC_NF_SUGESTAO
  (CHAVENFE, NUMTRANSENT, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, VL_TOTAL, DT_EMISSAO, DT_ENTRADA,
   ID_CARD, NUMPED_WINTHOR, ORIGEM, SCORE, STATUS, MOTIVO, CRIADO_EM)
SELECT '{{chavenfe}}', {{numtransent}}, {{numnota}}, '{{serie}}', {{codfornec}}, '{{codfilial}}',
  {{vlTotal}}, '{{dtEmissao}}', '{{dtEntrada}}', {{cardId}}, '{{numped}}', '{{origem}}', {{score}},
  'sugerida', '{{motivo}}', '{{criadoEm}}'
FROM DUAL
WHERE {{cardId}} > 0 AND {{usuarioId}} > 0
  AND NOT EXISTS (SELECT 1 FROM SGC_NF_SUGESTAO EX
                  WHERE EX.ID_CARD = {{cardId}} AND EX.CODFORNEC = {{codfornec}}
                    AND EX.NUMNOTA = {{numnota}} AND COALESCE(EX.SERIE, '') = '{{serie}}')
  AND NOT EXISTS (SELECT 1 FROM SGC_NF NV
                  WHERE NV.CODFORNEC = {{codfornec}} AND NV.NUMNOTA = {{numnota}}
                    AND COALESCE(NV.SERIE, '') = '{{serie}}')
  AND ${guardaInterna()}`,
  },
  {
    name: 'sgcEscSugestaoDecidir',
    resumo: 'RF-024 - a tela valida ou recusa uma sugestao da fila (:VAR_USER). Params: id, status, motivo, decididoEm',
    code: `UPDATE SGC_NF_SUGESTAO SET
  STATUS = '{{status}}', MOTIVO = '{{motivo}}', DECIDIDO_POR = :VAR_USER, DECIDIDO_EM = '{{decididoEm}}'
WHERE ID = {{id}} AND STATUS = 'sugerida'
  AND '{{status}}' IN ('validada', 'recusada', 'ignorada')
  AND ${guarda(NF)}`,
  },
  {
    name: 'sgcEscContatoInserir',
    resumo: 'RF-022 - registra o contato com a industria (data, canal, autor, resumo e previsao). Escrita de TELA (:VAR_USER): e ela quem grava depois do ok de sgcCobrancaEnviar (D-005). Params: cardId, dtContato, canalContato, resumo, previsao, criadoEm',
    code: `INSERT INTO SGC_CONTATO_FATURAMENTO
  (ID_CARD, DT_CONTATO, CANAL, RESUMO, PREVISAO_FATURAMENTO, REGISTRADO_POR, CRIADO_EM)
SELECT {{cardId}}, '{{dtContato}}', '{{canalContato}}', '{{resumo}}', '{{previsao}}', :VAR_USER, '{{criadoEm}}'
FROM DUAL
WHERE {{cardId}} > 0 AND TRIM('{{resumo}}') <> ''
  AND '{{canalContato}}' IN ('email', 'telefone', 'whatsapp', 'portal')
  AND ${guarda(NF)}`,
  },
  {
    name: 'sgcEscPedidoFaturamento',
    interna: true,
    resumo: 'RF-016/RN-008 - as quatro medidas do faturamento somadas no PROPRIO banco (nunca por parametro): capa, SGC_PEDIDO e listagem nao podem divergir. Params: idCard int, usuarioId int, agora string',
    code: `UPDATE SGC_PEDIDO SET
  VL_FATURADO = (SELECT COALESCE(SUM(N.VL_TOTAL), 0) FROM SGC_NF N WHERE N.ID_CARD = {{idCard}}),
  DT_PRIMEIRO_FATURAMENTO = COALESCE((SELECT MIN(N.DT_EMISSAO) FROM SGC_NF N WHERE N.ID_CARD = {{idCard}}), ''),
  PERC_FATURADO_VALOR = CASE WHEN COALESCE(VL_TOTAL, 0) > 0
    THEN (SELECT COALESCE(SUM(N.VL_TOTAL), 0) FROM SGC_NF N WHERE N.ID_CARD = {{idCard}}) / VL_TOTAL * 100
    ELSE 0 END,
  PERC_FATURADO_QTD = CASE WHEN (SELECT COALESCE(SUM(I.QT_PEDIDA), 0) FROM SGC_PEDIDO_ITEM I
                                  WHERE I.ID_CARD = {{idCard}} AND I.STATUS <> 'removido') > 0
    THEN (SELECT COALESCE(SUM(NI.QT_FATURADA), 0) FROM SGC_NF_ITEM NI
           WHERE NI.ID_CARD = {{idCard}} AND NI.CASADO_POR <> 'nenhum')
       / (SELECT SUM(I.QT_PEDIDA) FROM SGC_PEDIDO_ITEM I
           WHERE I.ID_CARD = {{idCard}} AND I.STATUS <> 'removido') * 100
    ELSE 0 END,
  ATUALIZADO_EM = '{{agora}}'
WHERE ID_CARD = {{idCard}} AND {{usuarioId}} > 0
  AND ${guardaInterna()}`,
  },
  {
    name: 'sgcEscPedidoAlertaFaturamento',
    interna: true,
    resumo: 'RF-019/RF-020 (D-015) - a marca do escalonamento, escrita SO pelo cron: nivel 0/3/5 e o dia do ultimo aviso. Separada de sgcEscPedidoFaturamento para nenhum caminho de tela mexer no escalonamento sem querer. Params: idCard, nivelAlerta, alertaEm, usuarioId',
    code: `UPDATE SGC_PEDIDO SET
  ALERTA_FATURAMENTO_NIVEL = {{nivelAlerta}}, ALERTA_FATURAMENTO_EM = '{{alertaEm}}'
WHERE ID_CARD = {{idCard}} AND {{usuarioId}} > 0
  AND ${guardaInterna()}`,
  },
  {
    name: 'sgcEscAvisoInserir',
    interna: true,
    semGuarda: true,
    resumo: 'RF-021/RN-009 (R-023) - aviso de processo das TRES specs da onda 2 (005, 006 e 007 chamam por id). UNICA escrita sem guarda de persona: cron nao tem sessao nem persona, e a guarda dela e a idempotencia da CHAVE (tipo:card:AAAA-MM-DD[:nf|:persona]), reforcada pelo UNIQUE. Params: idCard, tipo, chave, paraUsuarioId, paraPersona, texto, criadoEm',
    code: `INSERT INTO SGC_AVISO (ID_CARD, TIPO, CHAVE, PARA_USUARIO_ID, PARA_PERSONA, TEXTO, CRIADO_EM)
SELECT {{idCard}}, '{{tipo}}', '{{chave}}', {{paraUsuarioId}}, '{{paraPersona}}', '{{texto}}', '{{criadoEm}}'
FROM DUAL
WHERE {{idCard}} > 0 AND TRIM('{{chave}}') <> ''
  AND NOT EXISTS (SELECT 1 FROM SGC_AVISO A WHERE A.CHAVE = '{{chave}}')`,
  },
];

/* ─────────────── JavaScript (orquestração, cron e e-mail) ─────────────── */

// Preâmbulo comum. Regra da casa: nenhum `{{` literal aqui dentro — o que
// chega a um `{{param}}` é o `input` das chamadas por id.
const PRELUDIO = `const { runQueryMitra, executeServerFunctionMitra, sendEmailMitra } = require('mitra-sdk');
const SGC_IDS = ${MARCADOR_IDS};
const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId || 1);
const COPIA_FIXA = '${COPIA_FIXA}';
const PERSONAS_NF = ['admin', 'analista', 'gestor'];
const FASES_NF = ['enviado', 'transito', 'faturamento', 'bo'];

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
// D-15: chamada aninhada que FALHA volta com executionStatus 'FAILED' e um
// output vazio — sem esta conferencia o chamador segue como se tivesse gravado.
async function chamar(nome, entrada) {
  const id = SGC_IDS[nome];
  if (!id) throw new Error('Server function sem id no mapa: ' + nome);
  const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId: Number(id), input: entrada || {} });
  const resultado = (resposta && resposta.result) || resposta;
  if (resultado && resultado.executionStatus === 'FAILED') {
    throw new Error('Falha em ' + nome + ': ' + (resultado.error || 'sem detalhe'));
  }
  return desembrulhar(resposta);
}
function inteiro(valor) { const n = Number(valor); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function numero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
// A-11: caractere de controle fora e teto de tamanho — e SO isso. O valor que
// sai daqui para um parametro escalar entre aspas e escapado pelo RUNTIME;
// dobrar a aspa aqui tambem gravaria SANT''ANNA no banco.
function texto(valor, teto) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\\u0000-\\u001f]/g, ' ').slice(0, teto || 200);
}
// A aspa e dobrada AQUI, e so aqui: aspas() monta o fragmento de lote(), que
// chega ao SQL por um marcador SEM aspas ao redor e, portanto, sem o escape do
// runtime. O mesmo vale para o valor concatenado a mao dentro de uma consulta.
function aspas(valor, teto) { return "'" + texto(valor, teto).replace(/'/g, "''") + "'"; }
// A1: o lote vai como derivada SELECT ... UNION ALL SELECT ... (e nao VALUES),
// que e a unica forma de pendurar o WHERE da guarda numa execucao so.
function lote(colunas, linhas) {
  return linhas.map(function (valores, ordem) {
    return 'SELECT ' + valores.map(function (valor, coluna) {
      return ordem === 0 ? valor + ' AS ' + colunas[coluna] : valor;
    }).join(', ');
  }).join(' UNION ALL ');
}
function agora() { return new Date().toISOString().slice(0, 19); }
function dia() { return agora().slice(0, 10); }
function moeda(valor) {
  const partes = Math.abs(numero(valor)).toFixed(2).split('.');
  return (numero(valor) < 0 ? '-R$ ' : 'R$ ')
    + partes[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.') + ',' + partes[1];
}

// R-013: o MESMO mapa de ACCESS_LEVEL da guarda SQL da 002, aqui em JS, porque
// :VAR_USER nao se propaga em chamada aninhada — a persona e conferida ANTES
// de qualquer escrita e as escritas recebem usuarioId cru.
async function persona(fallbackId) {
  const SELECAO = "SELECT IU.ID, COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS NIVEL, COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')"
    + " WHEN 'ADMIN' THEN 'admin' WHEN 'RESTRICTED' THEN 'comercial' ELSE 'analista' END) AS PERSONA"
    + ' FROM INT_USER IU LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID WHERE IU.ID = ';
  let linhas = await consultar(SELECAO + ':VAR_USER');
  if (!linhas[0] && inteiro(fallbackId) > 0) linhas = await consultar(SELECAO + inteiro(fallbackId));
  const linha = linhas[0];
  if (!linha) return { id: 0, persona: '', nivel: '' };
  return { id: inteiro(linha.ID), persona: String(linha.PERSONA || ''), nivel: String(linha.NIVEL || '') };
}
function podeOperarNf(quem) {
  return quem.id > 0 && quem.nivel !== 'READ_ONLY' && PERSONAS_NF.indexOf(quem.persona) !== -1;
}
// P-08 B (A2): RESTRICTED so opera os PROPRIOS cards; a fase precisa ser uma
// das quatro em que a nota existe. Uma consulta responde as duas coisas.
async function pedidoDeNf(cardId, usuarioId) {
  const quemId = inteiro(usuarioId);
  const linhas = await consultar(
    'SELECT P.ID_CARD, P.CODFORNEC, P.CODFILIAL, P.FORNECEDOR, P.FILIAL, COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL,'
    + " COALESCE(P.VL_FATURADO, 0) AS VL_FATURADO, COALESCE(P.PRAZO_ACORDADO, '') AS PRAZO_ACORDADO,"
    + " COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED, F.CHAVE AS FASE,"
    + ' COALESCE((SELECT FR.VALIDADE_MINIMA_DIAS FROM SGC_FORNECEDOR FR WHERE FR.CODFORNEC = P.CODFORNEC), 0) AS VALIDADE_MINIMA'
    + ' FROM SGC_PEDIDO P'
    + ' JOIN KB_CARD C ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL'
    + ' JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID'
    + ' JOIN INT_USER IU ON IU.ID = ' + quemId
    + ' WHERE P.ID_CARD = ' + inteiro(cardId)
    + " AND (COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'RESTRICTED' OR C.CRIADO_POR = " + quemId + ')');
  return linhas[0] || null;
}
const FORA_DA_NF = 'O pedido nao esta numa fase com nota fiscal, ou e de outra pessoa e o seu acesso e restrito aos proprios pedidos.';

/* ── as sete regras de conferencia — espelho de frontend/src/lib/nf.ts ── */

const TOLERANCIA_PRECO = 0.01;

function classificarDelta(esperado, encontrado) {
  const base = numero(esperado);
  const achado = numero(encontrado);
  if (base === 0) return { resultado: achado === 0 ? 'conforme' : 'divergente', delta: achado === 0 ? 0 : 1 };
  const delta = Math.abs(achado - base) / Math.abs(base);
  if (delta === 0) return { resultado: 'conforme', delta: 0 };
  return { resultado: delta <= TOLERANCIA_PRECO ? 'atencao' : 'divergente', delta: delta };
}
function diasEntreDatas(inicioIso, fimIso) {
  const a = String(inicioIso || '').slice(0, 10).split('-').map(Number);
  const b = String(fimIso || '').slice(0, 10).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || !a[0] || !b[0]) return null;
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
function casarItem(itemNf, itensPedido) {
  const codprod = inteiro(itemNf.CODPROD);
  const codfab = String(itemNf.CODFAB || '').trim().toUpperCase();
  const ean = String(itemNf.EAN || '').trim();
  let achado = itensPedido.filter(function (i) { return inteiro(i.CODPROD) === codprod; })[0];
  if (achado) return { item: achado, casadoPor: 'codprod' };
  if (codfab) {
    achado = itensPedido.filter(function (i) { return String(i.CODFAB || '').trim().toUpperCase() === codfab; })[0];
    if (achado) return { item: achado, casadoPor: 'codfab' };
  }
  if (ean) {
    achado = itensPedido.filter(function (i) { return String(i.EAN || '').trim() === ean; })[0];
    if (achado) return { item: achado, casadoPor: 'ean' };
  }
  return { item: null, casadoPor: 'nenhum' };
}
// RN-006 do prazo (R-015): mesmas parcelas na mesma ordem e conforme; um dos
// lados sem numero e atencao; qualquer outra coisa e divergente.
function parcelasDoPrazo(valor) {
  const achados = String(valor === null || valor === undefined ? '' : valor).match(/\\d+(?:[.,]\\d+)?/g) || [];
  return achados.map(function (n) { return Math.round(Number(String(n).replace(',', '.'))); })
    .filter(function (n) { return Number.isFinite(n) && n >= 0; });
}
function textoDeParcelas(dias) {
  return (dias || []).map(function (d) { return String(Math.round(d)); }).join('/');
}
`;

/* ── sgcNfListar (7507) — a aba em UMA execução (RNF-001, D-011) ── */

const JS_NF_LISTAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
if (!cardId) return { ok: false, erro: 'Informe o pedido.' };

const pedido = (await consultar(
  "SELECT P.*, C.TITULO, COALESCE(F.CHAVE, '') AS FASE,"
  + ' COALESCE((SELECT FR.VALIDADE_MINIMA_DIAS FROM SGC_FORNECEDOR FR WHERE FR.CODFORNEC = P.CODFORNEC), 0) AS VALIDADE_MINIMA'
  + ' FROM SGC_PEDIDO P JOIN KB_CARD C ON C.ID = P.ID_CARD'
  + ' LEFT JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID'
  + ' WHERE P.ID_CARD = ' + cardId))[0] || null;

const sugestoes = await consultar(
  'SELECT S.* FROM SGC_NF_SUGESTAO S WHERE S.ID_CARD = ' + cardId
  + " AND S.STATUS = 'sugerida'"
  + ' AND NOT EXISTS (SELECT 1 FROM SGC_NF NV WHERE NV.CODFORNEC = S.CODFORNEC AND NV.NUMNOTA = S.NUMNOTA'
  + "   AND COALESCE(NV.SERIE, '') = COALESCE(S.SERIE, ''))"
  + ' ORDER BY S.SCORE DESC, S.ID DESC');

const nfs = await consultar('SELECT * FROM SGC_NF WHERE ID_CARD = ' + cardId + ' ORDER BY ID');
const itens = await consultar('SELECT * FROM SGC_NF_ITEM WHERE ID_CARD = ' + cardId + ' ORDER BY ID_NF, ID');
const ocorrencias = await consultar(
  'SELECT O.*, COALESCE(IU.NOME, \\'\\') AS DECIDIDO_NOME FROM SGC_NF_OCORRENCIA O'
  + ' LEFT JOIN INT_USER IU ON IU.ID = O.DECIDIDO_POR'
  + ' WHERE O.ID_CARD = ' + cardId + ' ORDER BY O.ID_NF, O.CODPROD, O.ID');
const contatos = await consultar(
  'SELECT K.*, COALESCE(IU.NOME, \\'\\') AS REGISTRADO_NOME FROM SGC_CONTATO_FATURAMENTO K'
  + ' LEFT JOIN INT_USER IU ON IU.ID = K.REGISTRADO_POR'
  + ' WHERE K.ID_CARD = ' + cardId + ' ORDER BY K.DT_CONTATO DESC, K.ID DESC');
const itensPedido = await consultar(
  "SELECT CODPROD, DESCRICAO, QT_PEDIDA, PRECO_CUSTO, STATUS FROM SGC_PEDIDO_ITEM WHERE ID_CARD = " + cardId
  + " AND COALESCE(STATUS, '') <> 'removido' ORDER BY CODPROD");

return { ok: true, pedido: pedido, sugestoes: sugestoes, nfs: nfs, itens: itens,
  ocorrencias: ocorrencias, contatos: contatos, itensPedido: itensPedido };`;

/* ── sgcNfVincular (7512) — grava nota + itens + as sete regras ── */

const JS_NF_VINCULAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!podeOperarNf(quem)) return { ok: false, erro: 'Seu perfil nao vincula nota fiscal a pedido.' };
const pedido = await pedidoDeNf(cardId, quem.id);
if (!pedido) return { ok: false, erro: FORA_DA_NF };
if (FASES_NF.indexOf(String(pedido.FASE)) === -1) return { ok: false, erro: FORA_DA_NF };

const numnota = inteiro(event.numnota);
const serie = texto(event.serie, 10);
const codfornec = inteiro(event.codfornec) || inteiro(pedido.CODFORNEC);
const origem = ['automatica', 'hibrida', 'manual'].indexOf(String(event.origem || '')) === -1 ? 'hibrida' : String(event.origem);
if (!numnota) return { ok: false, erro: 'Informe o numero da nota fiscal.' };

// RN-010: nota ja vinculada a QUALQUER pedido nao entra em outro. A checagem
// antes do INSERT existe para a tela receber a frase certa (o NOT EXISTS da
// escrita e a trava de verdade).
const jaVinculada = (await consultar(
  'SELECT N.ID_CARD, C.TITULO FROM SGC_NF N LEFT JOIN KB_CARD C ON C.ID = N.ID_CARD'
  + ' WHERE N.CODFORNEC = ' + codfornec + ' AND N.NUMNOTA = ' + numnota
  + " AND COALESCE(N.SERIE, '') = " + aspas(serie, 10) + ' LIMIT 1'))[0];
if (jaVinculada) {
  return { ok: false, erro: 'A nota ' + numnota + ' ja esta vinculada ao pedido '
    + String(jaVinculada.TITULO || jaVinculada.ID_CARD) + '.' };
}

// Os itens vem do ERP (automatica/hibrida) ou do preenchimento manual.
let itensNf = [];
let cabecalho = null;
if (origem === 'manual') {
  let manual = event.itensJson;
  if (typeof manual === 'string') { try { manual = JSON.parse(manual); } catch (e) { manual = null; } }
  if (!Array.isArray(manual)) return { ok: false, erro: 'Lista de itens invalida.' };
  itensNf = manual.map(function (i) {
    return { CODPROD: inteiro(i.codprod), CODFAB: String(i.codfab || ''), EAN: String(i.ean || ''),
      DESCRICAO: String(i.descricao || ''), QT: numero(i.qt), PUNIT: numero(i.punit),
      NUMLOTE: String(i.numlote || ''), DT_VALIDADE: String(i.dtValidade || '') };
  });
} else {
  const doErp = linhasDe(await chamar('sgcWintNfItens', { numnota: numnota, serie: serie, codfornec: codfornec }));
  if (doErp.length === 0) return { ok: false, erro: 'A nota ' + numnota + ' nao foi encontrada no WinThor.' };
  cabecalho = doErp[0];
  itensNf = doErp;
}

// RN-007: o prazo da nota sao as duplicatas; sem elas, o prazo declarado no
// cabecalho (PCNFENT.PRAZO).
let diasDaNf = [];
let prazoDaNota = 0;
if (origem !== 'manual') {
  const parcelas = linhasDe(await chamar('sgcWintNfParcelas', { numnota: numnota, codfornec: codfornec }));
  diasDaNf = parcelas.map(function (p) { return inteiro(p.DIAS); }).filter(function (d) { return d >= 0; });
  prazoDaNota = inteiro(cabecalho && cabecalho.PRAZO);
}
if (diasDaNf.length === 0 && prazoDaNota > 0) diasDaNf = [prazoDaNota];

const dtEmissao = texto(event.dtEmissao, 10) || texto(cabecalho && cabecalho.DT_EMISSAO_NF, 10);
const dtEntrada = origem === 'manual' ? texto(event.dtEntrada, 10) : texto(cabecalho && cabecalho.DT_ENTRADA, 10);
const vlTotal = numero(event.vlTotal) || numero(cabecalho && cabecalho.VL_TOTAL);
const quando = agora();

// 1. a nota (D-012: DT_RECEBIMENTO nasce igual a DT_ENTRADA).
await chamar('sgcEscNfInserir', {
  cardId: cardId, numnota: numnota, serie: serie,
  chavenfe: texto(event.chavenfe, 50) || texto(cabecalho && cabecalho.CHAVENFE, 50),
  numtransent: inteiro(event.numtransent) || inteiro(cabecalho && cabecalho.NUMTRANSENT),
  codfornec: codfornec, codfilial: texto(event.codfilial, 10) || texto(pedido.CODFILIAL, 10),
  dtEmissao: dtEmissao, dtEntrada: dtEntrada, vlTotal: vlTotal,
  prazoParcelas: textoDeParcelas(diasDaNf), origem: origem, usuarioId: quem.id, agora: quando,
});
const gravada = (await consultar(
  'SELECT ID FROM SGC_NF WHERE ID_CARD = ' + cardId + ' AND NUMNOTA = ' + numnota
  + " AND COALESCE(SERIE, '') = " + aspas(serie, 10) + ' LIMIT 1'))[0];
if (!gravada) return { ok: false, erro: 'A nota nao foi gravada: confira o seu perfil de acesso.' };
const idNf = inteiro(gravada.ID);

// 2. os itens da nota, num lote so (D-002).
const itensPedido = await consultar(
  'SELECT I.CODPROD, I.DESCRICAO, I.QT_PEDIDA, I.PRECO_CUSTO,'
  + " COALESCE((SELECT TRIM(PP.CODFAB) FROM PCPRODUT PP WHERE PP.CODPROD = I.CODPROD), '') AS CODFAB,"
  + " COALESCE((SELECT TRIM(PP.CODAUXILIAR) FROM PCPRODUT PP WHERE PP.CODPROD = I.CODPROD), '') AS EAN"
  + ' FROM SGC_PEDIDO_ITEM I WHERE I.ID_CARD = ' + cardId + " AND COALESCE(I.STATUS, '') <> 'removido'");

const COLUNAS_ITEM = ${JSON.stringify(emLista(COLUNAS_NF_ITEM))};
const COLUNAS_OCO = ${JSON.stringify(emLista(COLUNAS_OCORRENCIA))};
const tuplasItem = [];
const tuplasOco = [];
const contagem = { conforme: 0, atencao: 0, divergente: 0 };
function ocorrencia(codprod, tipo, resultado, esperado, encontrado, delta) {
  contagem[resultado] = (contagem[resultado] || 0) + 1;
  tuplasOco.push([idNf, cardId, inteiro(codprod), aspas(tipo, 30), aspas(resultado, 20),
    aspas(esperado, 100), aspas(encontrado, 100), numero(delta), "'pendente'", aspas(quando, 19)]);
}

const minimoValidade = inteiro(pedido.VALIDADE_MINIMA) > 0 ? inteiro(pedido.VALIDADE_MINIMA) : 120;
// RN-006 conta a quantidade ACUMULADA: o que as outras notas do pedido ja
// faturaram do mesmo produto sai numa consulta so, nao uma por item.
const faturadoAntes = {};
for (const linha of await consultar(
  'SELECT CODPROD, COALESCE(SUM(QT_FATURADA), 0) AS QT FROM SGC_NF_ITEM WHERE ID_CARD = ' + cardId
  + ' AND ID_NF <> ' + idNf + ' GROUP BY CODPROD')) {
  faturadoAntes[inteiro(linha.CODPROD)] = numero(linha.QT);
}
let qtFaturada = 0;
for (const itemNf of itensNf) {
  const casado = casarItem(itemNf, itensPedido);
  const item = casado.item;
  tuplasItem.push([idNf, cardId, inteiro(itemNf.CODPROD), aspas(itemNf.CODFAB, 60), aspas(itemNf.EAN, 20),
    aspas(itemNf.DESCRICAO || (item && item.DESCRICAO), 200), numero(itemNf.QT), numero(itemNf.PUNIT),
    aspas(itemNf.NUMLOTE, 30), aspas(itemNf.DT_VALIDADE, 10), aspas(casado.casadoPor, 10)]);
  if (casado.casadoPor !== 'nenhum') qtFaturada += numero(itemNf.QT);

  // RN-003 / D-007: o tipo do casamento leva os tres resultados.
  const resultadoCasamento = casado.casadoPor === 'codprod' ? 'conforme'
    : (casado.casadoPor === 'nenhum' ? 'divergente' : 'atencao');
  const comoCasou = casado.casadoPor === 'codfab' ? 'codigo de fabrica ' + String(itemNf.CODFAB || '')
    : (casado.casadoPor === 'ean' ? 'codigo de barras ' + String(itemNf.EAN || '')
      : (casado.casadoPor === 'codprod' ? 'codigo do produto' : 'nenhum codigo'));
  ocorrencia(itemNf.CODPROD, 'item_nao_pedido', resultadoCasamento,
    item ? 'produto ' + inteiro(item.CODPROD) : 'item do pedido', comoCasou, 0);

  // RN-005: validade medida da emissao da nota; sem data, atencao.
  const diasValidade = itemNf.DT_VALIDADE ? diasEntreDatas(dtEmissao, itemNf.DT_VALIDADE) : null;
  const resultadoValidade = diasValidade === null ? 'atencao'
    : (diasValidade >= minimoValidade ? 'conforme' : 'divergente');
  ocorrencia(itemNf.CODPROD, 'validade_curta', resultadoValidade,
    minimoValidade + ' dias', diasValidade === null ? 'sem validade' : diasValidade + ' dias', 0);

  // RN-004: preco unitario com a escala de 1 %.
  const precoEsperado = item ? numero(item.PRECO_CUSTO) : 0;
  const preco = classificarDelta(precoEsperado, itemNf.PUNIT);
  ocorrencia(itemNf.CODPROD, 'preco_divergente', preco.resultado,
    precoEsperado.toFixed(4), numero(itemNf.PUNIT).toFixed(4), Math.round(preco.delta * 10000) / 10000);

  // RN-006: quantidade acumulada maior que a pedida e divergente; menor,
  // conforme com o saldo no texto.
  const pedida = item ? numero(item.QT_PEDIDA) : 0;
  const acumulada = (item ? numero(faturadoAntes[inteiro(item.CODPROD)]) : 0) + numero(itemNf.QT);
  ocorrencia(itemNf.CODPROD, 'qtd_maior', acumulada > pedida ? 'divergente' : 'conforme',
    pedida + ' un', acumulada + ' un' + (acumulada < pedida ? ' (saldo de ' + (pedida - acumulada) + ')' : ''), 0);
}

if (tuplasItem.length > 0) {
  await chamar('sgcEscNfItemInserir', { linhas: lote(COLUNAS_ITEM, tuplasItem), usuarioId: quem.id });
}

// RN-007 — prazo do pedido contra as duplicatas da nota.
const acordado = parcelasDoPrazo(pedido.PRAZO_ACORDADO);
const resultadoPrazo = (acordado.length === 0 || diasDaNf.length === 0) ? 'atencao'
  : (textoDeParcelas(acordado) === textoDeParcelas(diasDaNf) ? 'conforme' : 'divergente');
ocorrencia(0, 'prazo_divergente', resultadoPrazo,
  textoDeParcelas(acordado) || 'sem prazo acordado', textoDeParcelas(diasDaNf) || 'sem duplicata', 0);

// RN-008 — valor total: so passar do pedido e divergencia (a escala de 1 %
// vale sobre o excedente).
const faturadoTotal = numero(pedido.VL_FATURADO) + numero(vlTotal);
const vlPedido = numero(pedido.VL_TOTAL);
const valor = faturadoTotal > vlPedido ? classificarDelta(vlPedido, faturadoTotal) : { resultado: 'conforme', delta: 0 };
ocorrencia(0, 'valor_total_divergente', valor.resultado,
  moeda(vlPedido), moeda(faturadoTotal), Math.round(valor.delta * 10000) / 10000);

const qtPedidaTotal = itensPedido.reduce(function (soma, i) { return soma + numero(i.QT_PEDIDA); }, 0);
const percValor = vlPedido > 0 ? Math.round(faturadoTotal / vlPedido * 10000) / 100 : 0;
const percQtd = qtPedidaTotal > 0 ? Math.round(qtFaturada / qtPedidaTotal * 10000) / 100 : 0;
ocorrencia(0, 'percentual_faturado', 'conforme', '100 %',
  percValor + ' % em valor, ' + percQtd + ' % em quantidade', 0);

await chamar('sgcEscOcorrenciaInserir', { linhas: lote(COLUNAS_OCO, tuplasOco), usuarioId: quem.id });

// 3. as quatro medidas do faturamento, somadas no proprio banco.
await chamar('sgcEscPedidoFaturamento', { idCard: cardId, usuarioId: quem.id, agora: quando });
const capa = (await consultar(
  'SELECT COALESCE(VL_FATURADO, 0) AS VL_FATURADO, COALESCE(PERC_FATURADO_VALOR, 0) AS PERC_VALOR,'
  + ' COALESCE(PERC_FATURADO_QTD, 0) AS PERC_QTD, COALESCE(VL_TOTAL, 0) AS VL_TOTAL'
  + ' FROM SGC_PEDIDO WHERE ID_CARD = ' + cardId))[0] || {};

// D-07 da onda 1: a nota do historico e registro, nao a acao.
try {
  await chamar('kbNotaRegistrar', {
    cardId: cardId, usuarioId: quem.id,
    texto: 'Nota fiscal ' + numnota + (serie ? '/' + serie : '') + ' vinculada ao pedido ('
      + moeda(vlTotal) + ', ' + tuplasOco.length + ' conferencias).',
  });
} catch (e) { /* o vinculo ja aconteceu */ }

return { ok: true, idNf: idNf, itens: tuplasItem.length,
  ocorrencias: contagem,
  totalOcorrencias: tuplasOco.length,
  percValor: numero(capa.PERC_VALOR), percQtd: numero(capa.PERC_QTD),
  vlFaturado: numero(capa.VL_FATURADO), saldo: numero(capa.VL_TOTAL) - numero(capa.VL_FATURADO) };`;

/* ── sgcOcorrenciaDecidir (7513) ── */

const JS_OCORRENCIA_DECIDIR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!podeOperarNf(quem)) return { ok: false, erro: 'Seu perfil nao decide as conferencias deste pedido.' };
if (!await pedidoDeNf(cardId, quem.id)) return { ok: false, erro: FORA_DA_NF };

const decisao = String(event.decisao || '') === 'recusado' ? 'recusado' : 'aceito';
const modo = String(event.modo || 'individual') === 'conformes' ? 'conformes' : 'individual';
const justificativa = String(event.justificativa === null || event.justificativa === undefined ? '' : event.justificativa).trim();
// RF-012: recusar exige justificativa de pelo menos 10 caracteres.
if (decisao === 'recusado' && justificativa.length < 10) {
  return { ok: false, erro: 'Escreva uma justificativa de pelo menos 10 caracteres para recusar a conferencia.' };
}
const idOcorrencia = modo === 'conformes' ? 0 : inteiro(event.idOcorrencia);
if (modo === 'individual' && !idOcorrencia) return { ok: false, erro: 'Informe a conferencia a decidir.' };

const antes = inteiro((await consultar(
  "SELECT COUNT(*) AS N FROM SGC_NF_OCORRENCIA WHERE ID_CARD = " + cardId + " AND DECISAO = 'pendente'"))[0].N);

await chamar('sgcEscOcorrenciaDecidir', {
  cardId: cardId, id: idOcorrencia, modo: modo, decisao: decisao,
  justificativa: texto(justificativa, 500), usuarioId: quem.id, decididoEm: agora(),
});

const pendentes = inteiro((await consultar(
  "SELECT COUNT(*) AS N FROM SGC_NF_OCORRENCIA WHERE ID_CARD = " + cardId + " AND DECISAO = 'pendente'"))[0].N);
const decididas = antes - pendentes;
if (decididas === 0) return { ok: false, erro: 'Nada foi decidido: confira o seu perfil de acesso.', decididas: 0, pendentes: pendentes };

try {
  await chamar('kbNotaRegistrar', {
    cardId: cardId, usuarioId: quem.id,
    texto: decididas + (decididas === 1 ? ' conferencia ' : ' conferencias ')
      + (decisao === 'aceito' ? 'aceitas' : 'recusadas') + ' (' + pendentes + ' pendentes).',
  });
} catch (e) { /* a decisao ja aconteceu */ }

return { ok: true, decididas: decididas, pendentes: pendentes };`;

/* ── sgcNfDetectar (7511) — cron de 30 em 30 minutos ── */

// RN-002: casamento por NUMPED vale 100; nos demais,
// round(cobertura x 60) + 20 (emissao 0..45 dias do envio) + 20 (o valor cabe
// no saldo com folga de 1 %), limitado a [5, 95]. Cobertura 0 nao vira sugestao.
const JS_NF_DETECTAR = `${PRELUDIO}
function pontuarSugestao(nf, ctx) {
  const codprods = ctx.codprodsPedido || [];
  if (codprods.length === 0) return null;
  const naNota = codprods.filter(function (codprod) {
    return nf.itens.some(function (i) {
      return inteiro(i.CODPROD) === inteiro(codprod)
        || (ctx.codfabPorProd[codprod] && String(i.CODFAB || '').trim().toUpperCase() === ctx.codfabPorProd[codprod])
        || (ctx.eanPorProd[codprod] && String(i.EAN || '').trim() === ctx.eanPorProd[codprod]);
    });
  });
  if (naNota.length === 0) return null;
  const cobertura = naNota.length / codprods.length;
  let score = Math.round(cobertura * 60);
  const dias = diasEntreDatas(ctx.dataEnvio, nf.DT_EMISSAO);
  if (dias !== null && dias >= 0 && dias <= 45) score += 20;
  if (numero(nf.VL_TOTAL) <= numero(ctx.saldoPedido) * 1.01) score += 20;
  score = Math.max(5, Math.min(95, score));
  return { score: score, motivo: naNota.length + ' de ' + codprods.length + ' itens do pedido estao na NF' };
}

// RNF-002: ate 30 cards por rodada e UMA consulta ao ERP por fornecedor +
// filial (nunca por card).
const cards = await consultar(
  'SELECT C.ID AS ID_CARD, C.TITULO, P.CODFORNEC, P.CODFILIAL, P.DT_ENVIO,'
  + " COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED, COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL,"
  + ' COALESCE(P.VL_FATURADO, 0) AS VL_FATURADO, COALESCE(P.FORNECEDOR, \\'\\') AS FORNECEDOR,'
  // A-9: a ordem dos responsaveis e ORDEM, ID — a mesma da lib. Por ID, o cron
  // trocaria "quem processa" de card reordenado na tela.
  + ' COALESCE((SELECT R.USUARIO_ID FROM KB_CARD_RESPONSAVEL R WHERE R.CARD_ID = C.ID ORDER BY R.ORDEM, R.ID LIMIT 1),'
  + '          COALESCE(C.CRIADO_POR, 0)) AS RESPONSAVEL'
  + ' FROM KB_CARD C'
  + ' JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID'
  + ' JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID'
  + ' WHERE C.EXCLUIDO_EM IS NULL'
  // A-10: R-041 tira da fase bo o AVISO diario, nao a DETECCAO — o pedido em B.O.
  // continua com saldo a faturar e a nota dele existe no ERP como a de qualquer
  // outro. As quatro fases sao as mesmas da listagem de pendentes (FASES_NF).
  + "   AND F.CHAVE IN ('" + FASES_NF.join("', '") + "')"
  + "   AND COALESCE(P.DT_ENVIO, '') <> ''"
  + '   AND COALESCE(P.PERC_FATURADO_VALOR, 0) < 100'
  + ' ORDER BY P.DT_ENVIO, C.ID LIMIT 30');

const grupos = {};
for (const card of cards) {
  const chave = inteiro(card.CODFORNEC) + '|' + String(card.CODFILIAL || '');
  if (!grupos[chave]) grupos[chave] = { codfornec: inteiro(card.CODFORNEC), codfilial: String(card.CODFILIAL || ''), cards: [] };
  grupos[chave].cards.push(card);
}

const hoje = dia();
const erros = [];
let sugestoes = 0;
let consultasErp = 0;

for (const chave of Object.keys(grupos)) {
  const grupo = grupos[chave];
  try {
    const dataEnvio = grupo.cards.map(function (c) { return String(c.DT_ENVIO); }).sort()[0];
    // ORA-01795: o IN do Oracle para em 1.000 expressoes; a lista de NUMPED
    // do grupo cabe de sobra, mas o corte em 500 fica pelo mesmo motivo da 003.
    const numpeds = grupo.cards.map(function (c) { return inteiro(c.NUMPED); })
      .filter(function (n) { return n > 0; }).slice(0, 500);
    const linhas = linhasDe(await chamar('sgcWintNfEntradas', {
      codfornec: grupo.codfornec, codfilial: grupo.codfilial, dataEnvio: dataEnvio,
      numpeds: (numpeds.length > 0 ? numpeds : [0]).join(', '),
    }));
    consultasErp += 1;

    // As linhas vem por item: agrupa por nota.
    const notas = {};
    for (const linha of linhas) {
      const id = inteiro(linha.NUMNOTA) + '|' + String(linha.SERIE || '');
      if (!notas[id]) {
        notas[id] = { NUMNOTA: inteiro(linha.NUMNOTA), SERIE: String(linha.SERIE || ''),
          CHAVENFE: String(linha.CHAVENFE || ''), NUMTRANSENT: inteiro(linha.NUMTRANSENT),
          DT_EMISSAO: String(linha.DT_EMISSAO || ''), DT_ENTRADA: String(linha.DT_ENTRADA || ''),
          VL_TOTAL: numero(linha.VL_TOTAL), NUMPED: inteiro(linha.NUMPED), itens: [] };
      }
      if (inteiro(linha.NUMPED) > 0) notas[id].NUMPED = inteiro(linha.NUMPED);
      notas[id].itens.push(linha);
    }

    // RN-010 + A-1: UMA consulta traz o que ja esta vinculado em qualquer card
    // (ID_CARD 0) e o que ja foi sugerido a cada card. Sem a segunda metade, a
    // sugestao que ja existe era reprocessada toda rodada: o INSERT e
    // idempotente, mas kbNotaRegistrar nao (+3 notas por rodada, 48 por dia) e
    // o contador somava o no-op.
    const existentes = await consultar(
      'SELECT 0 AS ID_CARD, NUMNOTA, COALESCE(SERIE, \\'\\') AS SERIE FROM SGC_NF WHERE CODFORNEC = ' + grupo.codfornec
      + ' UNION ALL'
      + ' SELECT ID_CARD, NUMNOTA, COALESCE(SERIE, \\'\\') AS SERIE FROM SGC_NF_SUGESTAO WHERE CODFORNEC = ' + grupo.codfornec);
    const jaVinculadas = [];
    const jaSugeridas = [];
    for (const existente of existentes) {
      const chaveNota = inteiro(existente.NUMNOTA) + '|' + String(existente.SERIE || '');
      if (inteiro(existente.ID_CARD) === 0) jaVinculadas.push(chaveNota);
      else jaSugeridas.push(inteiro(existente.ID_CARD) + '|' + chaveNota);
    }

    // Itens de todos os cards do grupo, numa consulta.
    const idsDoGrupo = grupo.cards.map(function (c) { return inteiro(c.ID_CARD); }).join(', ');
    const itens = await consultar(
      'SELECT I.ID_CARD, I.CODPROD,'
      + " COALESCE((SELECT TRIM(PP.CODFAB) FROM PCPRODUT PP WHERE PP.CODPROD = I.CODPROD), '') AS CODFAB,"
      + " COALESCE((SELECT TRIM(PP.CODAUXILIAR) FROM PCPRODUT PP WHERE PP.CODPROD = I.CODPROD), '') AS EAN"
      + ' FROM SGC_PEDIDO_ITEM I WHERE I.ID_CARD IN (' + idsDoGrupo + ")"
      + " AND COALESCE(I.STATUS, '') <> 'removido'");

    for (const id of Object.keys(notas)) {
      if (jaVinculadas.indexOf(id) !== -1) continue;
      const nota = notas[id];
      let melhor = null;
      for (const card of grupo.cards) {
        const doCard = itens.filter(function (i) { return inteiro(i.ID_CARD) === inteiro(card.ID_CARD); });
        if (inteiro(card.NUMPED) > 0 && inteiro(card.NUMPED) === nota.NUMPED) {
          melhor = { card: card, score: 100, origem: 'pedido',
            motivo: 'Nota emitida contra o pedido ' + inteiro(card.NUMPED) + ' no WinThor' };
          break;
        }
        const codfabPorProd = {};
        const eanPorProd = {};
        for (const i of doCard) {
          if (i.CODFAB) codfabPorProd[inteiro(i.CODPROD)] = String(i.CODFAB).trim().toUpperCase();
          if (i.EAN) eanPorProd[inteiro(i.CODPROD)] = String(i.EAN).trim();
        }
        const pontos = pontuarSugestao(nota, {
          codprodsPedido: doCard.map(function (i) { return inteiro(i.CODPROD); }),
          codfabPorProd: codfabPorProd, eanPorProd: eanPorProd,
          dataEnvio: String(card.DT_ENVIO), valorPedido: numero(card.VL_TOTAL),
          saldoPedido: numero(card.VL_TOTAL) - numero(card.VL_FATURADO),
        });
        if (pontos && (!melhor || pontos.score > melhor.score)) {
          melhor = { card: card, score: pontos.score, origem: 'heuristica', motivo: pontos.motivo };
        }
      }
      if (!melhor) continue;
      // A-1: a sugestao deste card para esta nota ja existe — nada a fazer.
      // A mesma chave do NOT EXISTS de sgcEscSugestaoInserir.
      if (jaSugeridas.indexOf(inteiro(melhor.card.ID_CARD) + '|' + id) !== -1) continue;

      const responsavel = inteiro(melhor.card.RESPONSAVEL);
      await chamar('sgcEscSugestaoInserir', {
        chavenfe: texto(nota.CHAVENFE, 50), numtransent: nota.NUMTRANSENT, numnota: nota.NUMNOTA,
        serie: texto(nota.SERIE, 10), codfornec: grupo.codfornec, codfilial: grupo.codfilial,
        vlTotal: nota.VL_TOTAL, dtEmissao: texto(nota.DT_EMISSAO, 10), dtEntrada: texto(nota.DT_ENTRADA, 10),
        cardId: inteiro(melhor.card.ID_CARD), numped: texto(melhor.card.NUMPED, 30),
        origem: melhor.origem, score: melhor.score, motivo: texto(melhor.motivo, 400),
        usuarioId: responsavel, criadoEm: agora(),
      });
      // A-1/A-2: escrita por id guardada pela persona do responsavel casa 0
      // linhas e volta COMPLETED. Le de volta e conta SO o que gravou; o resto
      // vai para erros[], senao o cron relata sugestao que nao existe.
      const gravada = (await consultar(
        'SELECT ID FROM SGC_NF_SUGESTAO WHERE ID_CARD = ' + inteiro(melhor.card.ID_CARD)
        + ' AND CODFORNEC = ' + grupo.codfornec + ' AND NUMNOTA = ' + nota.NUMNOTA
        + ' AND COALESCE(SERIE, \\'\\') = ' + aspas(nota.SERIE, 10) + ' LIMIT 1'))[0];
      if (!gravada) {
        erros.push({ grupo: chave, card: inteiro(melhor.card.ID_CARD), numnota: nota.NUMNOTA,
          erro: 'A sugestao nao foi gravada: o primeiro responsavel do card nao tem persona operante (admin, analista ou gestor).' });
        continue;
      }
      jaSugeridas.push(inteiro(melhor.card.ID_CARD) + '|' + id);
      sugestoes += 1;

      // R-023/D-008: todo cron grava aviso e nota; nenhum dos dois derruba a rodada.
      try {
        await chamar('sgcEscAvisoInserir', {
          idCard: inteiro(melhor.card.ID_CARD), tipo: 'nf_sugerida',
          chave: 'nf_sugerida:' + inteiro(melhor.card.ID_CARD) + ':' + hoje,
          paraUsuarioId: 0, paraPersona: '',
          texto: texto('Nota fiscal ' + nota.NUMNOTA + ' de ' + String(melhor.card.FORNECEDOR || '')
            + ' sugerida para este pedido (' + moeda(nota.VL_TOTAL) + ').', 500),
          criadoEm: agora(),
        });
      } catch (e) { /* aviso e acessorio */ }
      try {
        await chamar('kbNotaRegistrar', {
          cardId: inteiro(melhor.card.ID_CARD), usuarioId: responsavel,
          texto: 'Nota fiscal ' + nota.NUMNOTA + ' sugerida automaticamente (pontuacao ' + melhor.score + ').',
        });
      } catch (e) { /* nota e acessoria */ }
    }
  } catch (erro) {
    erros.push({ grupo: chave, erro: (erro && erro.message) || String(erro) });
  }
}

return { ok: true, cards: cards.length, grupos: Object.keys(grupos).length,
  consultasErp: consultasErp, sugestoes: sugestoes, erros: erros };`;

/* ── sgcFaturamentoMonitorar (7514) — cron diário ── */

const JS_FATURAMENTO_MONITORAR = `${PRELUDIO}
function nivelDeAlerta(diasUteis) {
  if (diasUteis >= 5) return 5;
  if (diasUteis >= 3) return 3;
  return 0;
}
// Espelho de textoDaCapaFaturamento (frontend/src/lib/faturamento.ts, RN-013):
// o mesmo texto nos dois caminhos, o de tela e o do cron.
function textoDaCapa(temNf, vlFaturado, percValor, saldo, diasUteis) {
  if (temNf) {
    const perc = String(Math.round(numero(percValor) * 100) / 100).replace('.', ',');
    return moeda(vlFaturado) + ' (' + perc + ' %) · saldo ' + moeda(saldo);
  }
  if (diasUteis >= 3) return 'Faturamento pendente · ' + diasUteis + ' dias úteis';
  return '';
}

const hoje = dia();
// A MESMA SQL da listagem: a regra de quem esta pendente existe uma vez so.
const pendentes = linhasDe(await chamar('sgcFaturamentoPendenteListar', {
  faixa: '', busca: '', hoje: hoje, limite: 30, offset: 0,
}));
// RF-020: quem ja chegou a 100 % com o nivel aceso precisa ser encerrado.
const encerrar = await consultar(
  'SELECT C.ID AS ID_CARD FROM KB_CARD C JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID'
  + ' WHERE C.EXCLUIDO_EM IS NULL AND COALESCE(P.PERC_FATURADO_VALOR, 0) >= 100'
  + ' AND COALESCE(P.ALERTA_FATURAMENTO_NIVEL, 0) > 0 LIMIT 30');

const erros = [];
let avisos = 0;
let encerrados = 0;
let pulados = 0;

// R-047: kbCardAtualizar grava a lista de responsaveis e o prazo que RECEBE —
// sem eles, apaga. O cron le titulo, prazo e responsaveis (na ordem) antes e
// reenvia os quatro campos, como atualizarCapaDoQuadro faz na tela.
async function espelharCapa(cardId, faturamento) {
  const card = (await consultar(
    "SELECT C.TITULO, COALESCE(C.PRAZO, '') AS PRAZO,"
    // A-9: ORDEM, ID — a MESMA ordem em que a lib le e regrava a lista. Por ID,
    // o kbCardAtualizar do cron reescreveria ORDEM = posicao e reordenaria os
    // responsaveis do card, trocando "quem processa" nas 006/007.
    + " COALESCE((SELECT GROUP_CONCAT(R.USUARIO_ID ORDER BY R.ORDEM, R.ID SEPARATOR ',') FROM KB_CARD_RESPONSAVEL R"
    + '   WHERE R.CARD_ID = C.ID), \\'\\') AS RESPONSAVEIS,'
    + ' COALESCE(C.VALORES_JSON, \\'{}\\') AS VALORES_JSON,'
    + ' COALESCE((SELECT R2.USUARIO_ID FROM KB_CARD_RESPONSAVEL R2 WHERE R2.CARD_ID = C.ID ORDER BY R2.ORDEM, R2.ID LIMIT 1),'
    + '          COALESCE(C.CRIADO_POR, 0)) AS QUEM'
    + ' FROM KB_CARD C WHERE C.ID = ' + inteiro(cardId)))[0];
  if (!card) return 0;
  const atual = JSON.parse(String(card.VALORES_JSON || '{}') || '{}');
  if (String(atual.faturamento || '') === String(faturamento)) return inteiro(card.QUEM);
  await chamar('kbCardAtualizar', {
    cardId: inteiro(cardId), titulo: String(card.TITULO || ''),
    valoresJson: JSON.stringify({ faturamento: faturamento }),
    responsaveisIds: String(card.RESPONSAVEIS || ''), prazo: String(card.PRAZO || ''),
    atualizadoPor: inteiro(card.QUEM), origem: 'sistema',
  });
  return inteiro(card.QUEM);
}

// A-2: sgcEscPedidoAlertaFaturamento e escrita POR ID guardada pela persona do
// responsavel (R-013). Quando ele nao tem persona operante, a instrucao casa 0
// linhas e volta COMPLETED — o cron contava sucesso sem gravar nada, o pedido
// ficava com o nivel antigo e o aviso repetia todo dia. Le a marca de volta e
// so conta o que releu; o resto vai a erros[] com o card e o motivo.
const SEM_PERSONA = 'A marca do alerta nao foi gravada: o primeiro responsavel do card nao tem persona operante (admin, analista ou gestor).';
async function marcaGravada(cardId, nivel, alertaEm) {
  const linha = (await consultar(
    'SELECT COALESCE(ALERTA_FATURAMENTO_NIVEL, 0) AS NIVEL,'
    + " COALESCE(ALERTA_FATURAMENTO_EM, '') AS EM FROM SGC_PEDIDO WHERE ID_CARD = " + inteiro(cardId)))[0];
  return !!linha && inteiro(linha.NIVEL) === inteiro(nivel) && String(linha.EM || '') === String(alertaEm);
}

for (const linha of encerrar) {
  try {
    const quem = await espelharCapa(inteiro(linha.ID_CARD), '');
    await chamar('sgcEscPedidoAlertaFaturamento', {
      idCard: inteiro(linha.ID_CARD), nivelAlerta: 0, alertaEm: '', usuarioId: quem,
    });
    if (!await marcaGravada(inteiro(linha.ID_CARD), 0, '')) {
      erros.push({ card: inteiro(linha.ID_CARD), erro: SEM_PERSONA });
      continue;
    }
    encerrados += 1;
  } catch (erro) {
    erros.push({ card: inteiro(linha.ID_CARD), erro: (erro && erro.message) || String(erro) });
  }
}

for (const pedido of pendentes) {
  const cardId = inteiro(pedido.ID_CARD);
  try {
    // R-041 / D-014: pedido em B.O. tem o aviso diario da 007 — dois avisos por
    // dia sobre o mesmo pedido foi defeito corrigido no legado.
    if (String(pedido.FASE) === 'bo') { pulados += 1; continue; }

    const diasUteis = inteiro(pedido.DIAS_UTEIS);
    const nivel = nivelDeAlerta(diasUteis);
    const temNf = numero(pedido.VL_FATURADO) > 0;
    const saldo = numero(pedido.VL_TOTAL) - numero(pedido.VL_FATURADO);
    const quem = await espelharCapa(cardId, textoDaCapa(temNf, pedido.VL_FATURADO, pedido.PERC_VALOR, saldo, diasUteis));
    if (nivel === 0) continue;
    // RN-009: o mesmo aviso nao nasce duas vezes no mesmo dia.
    if (String(pedido.ALERTA_EM || '').slice(0, 10) === hoje) continue;

    const responsavel = quem || inteiro(pedido.CRIADO_POR);
    const tipo = diasUteis > 5 ? 'faturamento_diario' : (nivel === 5 ? 'faturamento_5' : 'faturamento_3');
    const frase = 'Pedido de ' + String(pedido.FORNECEDOR || '') + ' sem faturamento completo ha '
      + diasUteis + ' dias uteis (saldo ' + moeda(saldo) + ').';

    // A-2: a MARCA do escalonamento vem antes do aviso e vale de porteiro. Sem
    // ela gravada, o aviso nasceria hoje e de novo amanha — todo dia, para
    // sempre —, e o cron ainda relataria o pedido como avisado.
    const alertaEm = agora();
    await chamar('sgcEscPedidoAlertaFaturamento', {
      idCard: cardId, nivelAlerta: nivel, alertaEm: alertaEm, usuarioId: responsavel,
    });
    if (!await marcaGravada(cardId, nivel, alertaEm)) {
      erros.push({ card: cardId, erro: SEM_PERSONA });
      continue;
    }

    await chamar('sgcEscAvisoInserir', {
      idCard: cardId, tipo: tipo, chave: tipo + ':' + cardId + ':' + hoje,
      paraUsuarioId: 0, paraPersona: '', texto: texto(frase, 500), criadoEm: agora(),
    });
    avisos += 1;
    if (nivel === 5 && diasUteis === 5) {
      await chamar('sgcEscAvisoInserir', {
        idCard: cardId, tipo: 'faturamento_5', chave: 'faturamento_5:' + cardId + ':' + hoje + ':gestor',
        paraUsuarioId: 0, paraPersona: 'gestor', texto: texto(frase, 500), criadoEm: agora(),
      });
      avisos += 1;
    }
    try {
      await chamar('kbNotaRegistrar', { cardId: cardId, usuarioId: responsavel, texto: frase });
    } catch (e) { /* nota e acessoria */ }
  } catch (erro) {
    erros.push({ card: cardId, erro: (erro && erro.message) || String(erro) });
  }
}

return { ok: true, pendentes: pendentes.length, avisos: avisos, encerrados: encerrados,
  pulados: pulados, erros: erros };`;

/* ── sgcCobrancaEnviar (7515) ── */

const JS_COBRANCA_ENVIAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!podeOperarNf(quem)) return { ok: false, erro: 'Seu perfil nao envia cobranca a industria.' };
const pedido = await pedidoDeNf(cardId, quem.id);
if (!pedido) return { ok: false, erro: FORA_DA_NF };

const para = String(event.para || '').trim().toLowerCase();
if (para.indexOf('@') === -1) return { ok: false, erro: 'Escolha um contato do fornecedor.' };
const corpo = String(event.corpo === null || event.corpo === undefined ? '' : event.corpo);
if (!corpo.trim()) return { ok: false, erro: 'Escreva a mensagem da cobranca.' };
const assunto = String(event.assunto || '').trim()
  || ('Faturamento pendente - pedido ' + String(pedido.NUMPED || cardId));

// EM-02: a copia fixa entra aqui e nunca duplica o destinatario.
const destinatarios = [para, COPIA_FIXA].filter(function (email, indice, lista) { return lista.indexOf(email) === indice; });
await sendEmailMitra({ projectId, to: destinatarios, subject: assunto, body: corpo });

const enviadoEm = agora();
// R-033 ajustada (D-005): o JS grava SO a comunicacao; o contato e da tela.
await chamar('sgcEscComunicacaoInserir', {
  cardId: cardId, tipo: 'cobranca', para: para, cc: COPIA_FIXA,
  assunto: texto(assunto, 255), corpo: corpo.slice(0, 20000),
  enviadoPor: quem.id, enviadoEm: enviadoEm,
});
const ultima = (await consultar('SELECT MAX(ID) AS ID FROM SGC_COMUNICACAO WHERE ID_CARD = ' + cardId))[0];

try {
  await chamar('kbNotaRegistrar', {
    cardId: cardId, usuarioId: quem.id, texto: 'Cobranca de faturamento enviada para ' + para + '.',
  });
} catch (e) { /* nota e acessoria */ }

return { ok: true, destinatarios: destinatarios, comunicacaoId: inteiro(ultima && ultima.ID) };`;

/* ─────────────── a lista publicada ─────────────── */

const LEITURAS = [
  { name: 'sgcWintNfEntradas', code: SQL_NF_ENTRADAS, resumo: 'RF-001/RF-002/RF-003 - notas de entrada candidatas do fornecedor+filial, uma linha por item, pela janela de emissao OU pela lista de NUMPED. Params: codfornec int, codfilial string, dataEnvio string, numpeds lista' },
  { name: 'sgcWintNfItens', code: SQL_NF_ITENS, resumo: 'RF-006/RF-007 - itens de UMA nota com lote, validade, codigo de fabrica e EAN. Params: numnota int, serie string, codfornec int' },
  { name: 'sgcWintNfParcelas', code: SQL_NF_PARCELAS, resumo: 'RF-009/RN-007 - duplicatas da nota com os dias entre emissao e vencimento. Params: numnota int, codfornec int' },
  { name: 'sgcWintNfBuscar', code: SQL_NF_BUSCAR, resumo: 'RF-005 (O2-07) - registro hibrido: acha a nota pelo numero SEM exigir entrada no armazem. Params: numnota int, codfornec int' },
  { name: 'sgcNfSugestoesListar', code: SQL_SUGESTOES_LISTAR, resumo: 'RF-024 - fila de sugestoes com pedido, fase, score, motivo e situacao; a nota ja vinculada sai da fila (RN-010). Params: status, codfornec, busca, hoje, limite, offset' },
  { name: 'sgcNfSugestoesListarTotal', code: SQL_SUGESTOES_TOTAL, resumo: 'RF-024/RNF-005 - total da fila de sugestoes, para a paginacao. Params: status, codfornec, busca' },
  { name: 'sgcFaturamentoPendenteListar', code: SQL_PENDENTE_LISTAR, resumo: 'RF-025/C-028 - pedidos enviados sem 100 % faturado, com os dias uteis desde o envio, contatos e as duas colunas de B.O. (R-041). Params: faixa, busca, hoje, limite, offset' },
  { name: 'sgcFaturamentoPendenteListarTotal', code: SQL_PENDENTE_TOTAL, resumo: 'RF-025/RNF-005 - total da lista de faturamentos pendentes. Params: faixa, busca, hoje' },
  { name: 'sgcContatosListar', code: SQL_CONTATOS_LISTAR, resumo: 'RF-022 - contatos de faturamento do pedido, do mais novo para o mais antigo. Params: cardId, limite, offset' },
];

const JAVASCRIPT = [
  { name: 'sgcNfListar', code: JS_NF_LISTAR, resumo: 'RNF-001 - a aba Notas fiscais em UMA execucao: capa, sugestoes, notas, itens, ocorrencias e contatos. Params: cardId int' },
  { name: 'sgcNfDetectar', code: JS_NF_DETECTAR, cron: '0 */30 * * * *', resumo: 'RF-001 a RF-004/RNF-002/RNF-006 - deteccao automatica: 30 cards, uma consulta ao ERP por fornecedor+filial, sugestao ao card de maior pontuacao. Nada e vinculado. Sem parametros' },
  { name: 'sgcNfVincular', code: JS_NF_VINCULAR, resumo: 'RF-005 a RF-013/RF-016 - grava a nota, os itens e as sete conferencias e recalcula o faturamento. Params: cardId, idSugestao, numnota, serie, codfornec, codfilial, origem, itensJson' },
  { name: 'sgcOcorrenciaDecidir', code: JS_OCORRENCIA_DECIDIR, resumo: 'RF-011/RF-012 - aceita ou recusa conferencia (individual ou todas as conformes numa execucao); recusa exige 10 caracteres. Params: cardId, idOcorrencia, modo, decisao, justificativa' },
  { name: 'sgcFaturamentoMonitorar', code: JS_FATURAMENTO_MONITORAR, cron: '0 2 11 * * *', resumo: 'RF-018 a RF-021/RNF-003 - rotina diaria de cobranca: niveis 3/5/diario em dias uteis, aviso e espelho da capa; pula a fase bo (R-041); nao envia e-mail nem consulta o ERP. Sem parametros' },
  { name: 'sgcCobrancaEnviar', code: JS_COBRANCA_ENVIAR, resumo: 'RF-023/RN-014 - cobranca MANUAL por e-mail, com copia fixa compras@benenutri.com; grava so SGC_COMUNICACAO (o contato e da tela, D-005). Params: cardId, para, assunto, corpo' },
];

/** Materializa `definitions` com o mapa nome -> id injetado nos corpos JAVASCRIPT. */
export function montarDefinitions(ids) {
  return [
    ...LEITURAS.map((f) => ({ name: f.name, type: 'SQL', description: f.resumo, code: f.code })),
    ...ESCRITAS.map((f) => ({
      name: f.name,
      type: 'SQL',
      description: f.interna ? `${f.resumo}. ${AVISO_INTERNA}` : f.resumo,
      code: f.code,
    })),
    ...JAVASCRIPT.map((f) => ({
      name: f.name,
      type: 'JAVASCRIPT',
      description: f.resumo,
      ...(f.cron ? { cronExpression: f.cron } : {}),
      code: f.code.split(MARCADOR_IDS).join(JSON.stringify(ids)),
    })),
  ];
}

export const definitions = montarDefinitions(idsDoMapa(MAPA));

/* ─────────────── publicação (só no sandbox) ─────────────── */

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

  const linhasDe = async (sql) => {
    const resposta = await sdk.runQueryMitra({ projectId, sql });
    const saida = resposta?.result ?? resposta;
    return saida?.rows ?? saida?.result ?? saida ?? [];
  };
  const um = async (sql) => (await linhasDe(sql))[0] || null;
  const escapar = (valor) => String(valor ?? '').replace(/'/g, "''");

  /* 1. o campo do quadro `faturamento` (R-048), idempotente por chave */
  const board = await um("SELECT ID FROM KB_BOARD WHERE SLUG = 'compras' LIMIT 1");
  if (!board) throw new Error('Quadro `compras` ausente: publique add-005-quadro-compras.mjs antes do add-008.');
  const boardId = Number(board.ID);
  const ultimaOrdem = Number((await um(`SELECT COALESCE(MAX(ORDEM), 0) AS N FROM KB_CAMPO WHERE BOARD_ID = ${boardId}`))?.N ?? 0);
  for (let i = 0; i < CAMPOS_008.length; i += 1) {
    const campo = CAMPOS_008[i];
    const ja = await um(`SELECT ID FROM KB_CAMPO WHERE BOARD_ID = ${boardId} AND CHAVE = '${campo.chave}' LIMIT 1`);
    if (ja) {
      console.log(`  campo ja existe  ${campo.chave} (${Number(ja.ID)})`);
      continue;
    }
    await sdk.runDmlMitra({
      projectId,
      sql: `INSERT INTO KB_CAMPO (BOARD_ID, FASE_ID, CHAVE, LABEL, TIPO, OBRIGATORIO, NO_CARD, EDITAVEL_DEPOIS, ORDEM, CONFIG_JSON, ATIVO)
VALUES (${boardId}, NULL, '${campo.chave}', '${escapar(campo.label)}', '${campo.tipo}', FALSE, ${campo.noCard ? 'TRUE' : 'FALSE'}, FALSE, ${ultimaOrdem + i + 1}, '{}', TRUE)`,
    });
    console.log(`  campo criado     ${campo.chave}`);
  }

  /* 2. as 25 server functions — ids reais por NOME (R-016), nunca hardcoded */
  const existentes = async () => {
    const lista = (await sdk.listServerFunctionsMitra({ projectId })).result ?? [];
    return new Map(lista.map((f) => [f.name, f.id]));
  };

  async function publicar(lista) {
    const mapa = await existentes();
    for (const definicao of lista) {
      const corpo = {
        projectId,
        name: definicao.name,
        type: definicao.type,
        code: definicao.code,
        description: definicao.description,
        ...(definicao.cronExpression ? { cronExpression: definicao.cronExpression } : {}),
        ...(WINTHOR.includes(definicao.name) ? { jdbcId } : {}),
      };
      const id = mapa.get(definicao.name);
      if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
      else await sdk.createServerFunctionMitra(corpo);
      console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
    }
  }

  // Primeiro as SQL; só então as JAVASCRIPT, com os ids REAIS por nome (R-016)
  // — no primeiro publish as SFs chamadas por id ainda não existem.
  await publicar(definitions.filter((d) => d.type !== 'JAVASCRIPT'));
  const reais = Object.fromEntries(await existentes());
  await publicar(montarDefinitions({ ...idsDoMapa(MAPA), ...reais }).filter((d) => d.type === 'JAVASCRIPT'));

  console.log(`Pronto: ${definitions.length} server functions da spec 005 (notas fiscais e faturamento).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
