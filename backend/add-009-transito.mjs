// add-009 — Server Functions da spec 006 (trânsito e recebimento): previsão
// por nota, sincronização com o WinThor, alerta de atraso, Trânsito →
// Faturamento automático. Ver
// docs/specs/006-transito-e-recebimento/{spec,plan,tasks}.md.
//
// Faixa de id local: 76xx (R-024) — leituras e JAVASCRIPT 7601-7606, escritas
// 7650-7651 (chamadas SÓ por id, nunca da tela — D-005 do plan). O id local
// vem de SERVER_FUNCTIONS em frontend/src/lib/server-functions.ts até o
// sync-server-function-map.mjs trazer os reais do sandbox.
//
// sgcRecebimentoSincronizar chama por id: sgcNfsRecebimentoPendente e
// sgcWintNfEntradasConfirmadas (desta spec, D-015), sgcEscNfRecebimento e
// sgcEscNfAlertaAtraso (desta spec), sgcEscAvisoInserir (005, R-023) e
// kbCardMover/kbNotaRegistrar (lib 1.4.0, R-021). No módulo (simulador) os ids
// saem do mapa local por `backend/ids-do-mapa.mjs`; na publicação real são
// resolvidos por NOME via `listServerFunctionsMitra` (R-016) — e, como quatro
// deles nascem NESTE script, o publicador grava as SQL primeiro e só então
// injeta os ids no JAVASCRIPT.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-009-transito.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';
import { somarDiasUteis, somarDiasCorridos } from './lib/dias-uteis.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));

const NOMES_INTERNOS = [
  'sgcNfsRecebimentoPendente',
  'sgcWintNfEntradasConfirmadas',
  'sgcEscNfRecebimento',
  'sgcEscNfAlertaAtraso',
  'sgcEscAvisoInserir',
  'kbCardMover',
  'kbNotaRegistrar',
];

const MARCADOR_IDS = '__SGC_IDS__';

function injetarIds(code, mapa) {
  return String(code).split(MARCADOR_IDS).join(JSON.stringify(mapa));
}

function filtrarIds(mapaCompleto) {
  const saida = {};
  for (const nome of NOMES_INTERNOS) saida[nome] = mapaCompleto[nome];
  return saida;
}

/* ─────────────── guarda de persona (R-013 do 000, literal da 002) ───────────────
 *
 * Nesta spec não existe escrita de tela (D-005): as duas `sgcEsc*` são
 * chamadas só por id, de dentro do JS, então `quem` é sempre `{{usuarioId}}`
 * — o QUEM_PROCESSA do pedido (primeiro responsável, ou o criador). Chamada
 * aninhada não propaga `:VAR_USER` (runtime.mjs), e o perfil business libera
 * todas as SFs: sem esta guarda, qualquer usuário gravaria recebimento pelo
 * SDK (achado A1 da revisão da onda 1).
 */
const guardaPersona = (quem, personas) => `AND EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = ${quem}
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                                 WHEN 'ADMIN' THEN 'admin'
                                 WHEN 'RESTRICTED' THEN 'comercial'
                                 ELSE 'analista' END) IN (${personas})
  )`;
const PERSONAS_RECEBIMENTO = "'admin','analista','gestor'";

/* ─────────────── a previsão, escrita UMA vez (T-003) ───────────────
 *
 * RF-004: previsão nunca é coluna — é expressão, recalculada a cada consulta,
 * para mudar o prazo do fornecedor corrigir todas as notas em aberto sem
 * reprocessamento (C-021). A aritmética de dia útil é a de
 * backend/lib/dias-uteis.mjs (R-025): esta spec importa, não reimplementa.
 *
 * `PRAZO_ENTREGA_DIAS <= 0` OU fornecedor sem linha em SGC_FORNECEDOR (o
 * LEFT JOIN devolve NULL) é "sem prazo" (RN-002, D-002): a coluna é
 * NOT NULL DEFAULT 0, então zero já É a ausência.
 */
const dtPrevisao = (nf, fo) => `CASE
    WHEN TRIM(COALESCE(${nf}.DT_EMISSAO, '')) = '' OR COALESCE(${fo}.PRAZO_ENTREGA_DIAS, 0) <= 0 THEN ''
    WHEN COALESCE(${fo}.PRAZO_ENTREGA_TIPO, 'corridos') = 'uteis'
      THEN ${somarDiasUteis(`${nf}.DT_EMISSAO`, `${fo}.PRAZO_ENTREGA_DIAS`)}
    ELSE ${somarDiasCorridos(`${nf}.DT_EMISSAO`, `${fo}.PRAZO_ENTREGA_DIAS`)}
  END`;

// D-006: o dia de referência vem de quem chama — a tela manda o dia do
// navegador, o cron manda o dia de Brasília; '' cai no dia do servidor.
const HOJE = `COALESCE(NULLIF('{{hoje}}', ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d'))`;

// RN-003, nesta ordem. Datas são texto ISO em VARCHAR: a comparação `<`/`<=`
// entre elas é de texto e ordena certo, sem conversão a mais.
const SITUACAO = (n) => `CASE
    WHEN TRIM(COALESCE(${n}.DT_RECEBIMENTO, '')) <> '' THEN 'recebida'
    WHEN ${n}.DT_PREVISAO = ''                         THEN 'sem_prazo'
    WHEN ${n}.DT_PREVISAO < ${HOJE}                    THEN 'atrasada'
    WHEN ${n}.DT_PREVISAO <= ${somarDiasCorridos(HOJE, 2)} THEN 'em_transito'
    ELSE 'dentro_prazo'
  END`;

// RN-005: dias CORRIDOS entre a previsão e hoje (D-010 — mercadoria parada não
// descansa no fim de semana), mesmo quando o prazo do fornecedor é em úteis.
const DIAS_ATRASO = (n) => `CASE
    WHEN ${n}.DT_PREVISAO = '' OR TRIM(COALESCE(${n}.DT_RECEBIMENTO, '')) <> '' THEN 0
    ELSE DATEDIFF(STR_TO_DATE(${HOJE}, '%Y-%m-%d'), STR_TO_DATE(${n}.DT_PREVISAO, '%Y-%m-%d'))
  END`;

/* ─────────────── a camada interna, compartilhada pelas quatro leituras ───────────────
 *
 * Duas camadas em toda consulta: o MySQL não reaproveita alias no mesmo
 * SELECT, então a interna resolve DT_PREVISAO e a externa resolve SITUACAO e
 * DIAS_ATRASO em cima dela.
 */
const COLUNAS_NF = `NF.ID, NF.ID_CARD, NF.NUMNOTA, COALESCE(NF.SERIE, '') AS SERIE,
    COALESCE(NF.CHAVENFE, '') AS CHAVENFE, COALESCE(NF.NUMTRANSENT, 0) AS NUMTRANSENT,
    NF.CODFORNEC, COALESCE(NF.CODFILIAL, '') AS CODFILIAL,
    COALESCE(NF.DT_EMISSAO, '') AS DT_EMISSAO, COALESCE(NF.VL_TOTAL, 0) AS VL_TOTAL,
    COALESCE(NF.DT_RECEBIMENTO, '') AS DT_RECEBIMENTO,
    COALESCE(NF.ALERTA_ATRASO_EM, '') AS ALERTA_ATRASO_EM,
    COALESCE(FO.PRAZO_ENTREGA_DIAS, 0) AS PRAZO_ENTREGA_DIAS,
    COALESCE(FO.PRAZO_ENTREGA_TIPO, '') AS PRAZO_ENTREGA_TIPO,
    ${dtPrevisao('NF', 'FO')} AS DT_PREVISAO`;

// O contexto do pedido: fase (por CHAVE, nunca por id ou nome), filial que
// desempata a entrada (RN-004), quem assina as escritas sem sessão (RN-006) e
// as colunas da lista de vencidas.
const COLUNAS_PEDIDO = `F.CHAVE AS FASE, C.BOARD_ID, C.TITULO, COALESCE(C.CRIADO_POR, 0) AS CRIADO_POR,
    COALESCE(P.CODFILIAL, '') AS FILIAL_PEDIDO, COALESCE(P.FILIAL, '') AS FILIAL,
    COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
    COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED_WINTHOR,
    COALESCE((SELECT R.USUARIO_ID FROM KB_CARD_RESPONSAVEL R
               WHERE R.CARD_ID = C.ID ORDER BY R.ORDEM, R.ID LIMIT 1),
             C.CRIADO_POR, 0) AS QUEM_PROCESSA`;

const JUNCOES_PEDIDO = `JOIN KB_CARD C   ON C.ID = NF.ID_CARD AND C.EXCLUIDO_EM IS NULL
  JOIN SGC_FASE F  ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
  LEFT JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID`;

// RN-011: só nota de pedido em Enviado ou Em Trânsito é verificada e listada.
const MONITORADA = `TRIM(COALESCE(NF.DT_RECEBIMENTO, '')) = ''
    AND F.CHAVE IN ('enviado', 'transito')`;

/* ─────────────── leituras (SQL) ─────────────── */

// RNF-001: a aba inteira em UMA execução, com 1 ou com 12 notas.
const SQL_RECEBIMENTO_CARD = `SELECT N.*, ${SITUACAO('N')} AS SITUACAO, ${DIAS_ATRASO('N')} AS DIAS_ATRASO
FROM (
  SELECT ${COLUNAS_NF}
  FROM SGC_NF NF
  LEFT JOIN SGC_FORNECEDOR FO ON FO.CODFORNEC = NF.CODFORNEC
  WHERE NF.ID_CARD = {{cardId}}
) N
ORDER BY N.DT_EMISSAO, N.NUMNOTA`;

// RN-010/D-007: o lote é por PEDIDO, não por nota — a subconsulta escolhe 30
// ID_CARD (o de faturamento mais antigo primeiro) e a consulta traz TODAS as
// notas pendentes deles, para nenhum pedido ser avaliado pela metade. A camada
// extra (`IN (SELECT … FROM (… LIMIT 30) L)`) existe porque o MySQL recusa
// `IN (SELECT … LIMIT …)` direto.
const SQL_RECEBIMENTO_PENDENTE = `SELECT N.*, ${SITUACAO('N')} AS SITUACAO, ${DIAS_ATRASO('N')} AS DIAS_ATRASO
FROM (
  SELECT ${COLUNAS_NF},
    ${COLUNAS_PEDIDO}
  FROM SGC_NF NF
  LEFT JOIN SGC_FORNECEDOR FO ON FO.CODFORNEC = NF.CODFORNEC
  ${JUNCOES_PEDIDO}
  WHERE ${MONITORADA}
    AND ({{cardId}} = 0 OR NF.ID_CARD = {{cardId}})
    AND NF.ID_CARD IN (SELECT L.ID_CARD FROM (
      SELECT NF2.ID_CARD
      FROM SGC_NF NF2
      JOIN KB_CARD C2  ON C2.ID = NF2.ID_CARD AND C2.EXCLUIDO_EM IS NULL
      JOIN SGC_FASE F2 ON F2.BOARD_ID = C2.BOARD_ID AND F2.FASE_ID = C2.FASE_ID
      WHERE TRIM(COALESCE(NF2.DT_RECEBIMENTO, '')) = ''
        AND F2.CHAVE IN ('enviado', 'transito')
        AND ({{cardId}} = 0 OR NF2.ID_CARD = {{cardId}})
      GROUP BY NF2.ID_CARD
      ORDER BY MIN(COALESCE(NF2.DT_EMISSAO, '')), NF2.ID_CARD
      LIMIT 30
    ) L)
) N
ORDER BY N.ID_CARD, N.DT_EMISSAO, N.NUMNOTA`;

// A busca no número da nota usa CONCAT('', NUMNOTA), e não CAST(… AS CHAR): o
// CONCAT já é shim do dialeto do simulador e coage número para texto nos dois
// bancos (R-043).
const FILTROS_ATRASO = `A.SITUACAO = 'atrasada'
  AND ('{{busca}}' = ''
       OR CONCAT('', A.NUMNOTA) LIKE CONCAT('%', '{{busca}}', '%')
       OR UPPER(A.FORNECEDOR) LIKE CONCAT('%', UPPER('{{busca}}'), '%')
       OR A.NUMPED_WINTHOR LIKE CONCAT('%', '{{busca}}', '%'))
  AND ('{{faixa}}' = ''
       OR ('{{faixa}}' = 'ate3'  AND A.DIAS_ATRASO <= 3)
       OR ('{{faixa}}' = '4a7'   AND A.DIAS_ATRASO BETWEEN 4 AND 7)
       OR ('{{faixa}}' = 'mais7' AND A.DIAS_ATRASO > 7))`;

const CAMADA_ATRASO = `(
  SELECT N.*, ${SITUACAO('N')} AS SITUACAO, ${DIAS_ATRASO('N')} AS DIAS_ATRASO
  FROM (
    SELECT ${COLUNAS_NF},
      ${COLUNAS_PEDIDO}
    FROM SGC_NF NF
    LEFT JOIN SGC_FORNECEDOR FO ON FO.CODFORNEC = NF.CODFORNEC
    ${JUNCOES_PEDIDO}
    WHERE ${MONITORADA}
  ) N
) A`;

/* ─────────────── WinThor (Oracle, jdbcId resolvido por nome) ─────────────── */

// Porte de p-45547/backend/add-nf-transito-recebimento.mjs
// (`sgc_nf_entradas_winthor`), com NUMTRANSENT e VLTOTAL a mais. As duas
// condições finais SÃO a regra: DTENT IS NOT NULL é a entrada consolidada
// (RN-004) e DTCANCEL IS NULL tira a nota cancelada (C-007). `{{numnotas}}` é
// montada pelo JS em lotes de 500 (ORA-01795). Só leitura (RNF-005).
const SQL_ENTRADAS_CONFIRMADAS = `SELECT N.NUMTRANSENT, N.NUMNOTA, N.SERIE, N.CODFORNEC, N.CODFILIAL,
       NVL(N.CHAVENFE, '') AS CHAVENFE,
       TO_CHAR(N.DTEMISSAO, 'YYYY-MM-DD') AS DT_EMISSAO,
       TO_CHAR(N.DTENT, 'YYYY-MM-DD')     AS DT_ENTRADA,
       NVL(N.VLTOTAL, 0) AS VL_TOTAL
FROM PCNFENT N
WHERE N.CODFORNEC = {{codfornec}}
  AND N.NUMNOTA IN ({{numnotas}})
  AND N.DTENT IS NOT NULL
  AND N.DTCANCEL IS NULL
ORDER BY N.NUMNOTA, N.DTENT`;

/* ─────────────── JAVASCRIPT — sgcRecebimentoSincronizar ─────────────── */

const PREAMBULO_JS = `
const { runQueryMitra, executeServerFunctionMitra } = require('mitra-sdk');
const IDS = ${MARCADOR_IDS};
const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId || 1);

function linhasDe(resposta) {
  const saida = (resposta && resposta.result) || resposta;
  return (saida && saida.rows) || [];
}
async function query(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }
async function chamar(id, params) {
  if (!id) throw new Error('Server function não publicada no mapa.');
  const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input: params || {} });
  const resultado = (resposta && resposta.result) || resposta;
  if (resultado && resultado.executionStatus === 'FAILED') throw new Error(resultado.error || 'Falha na execução.');
  return resultado && resultado.output;
}
/** Leitura SQL chamada por id (D-015): devolve as linhas. */
async function linhasPorId(id, params) {
  const saida = await chamar(id, params);
  return (saida && saida.rows) || [];
}
function inteiro(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function agora() { return new Date().toISOString().slice(0, 19); }
function dataBr(iso) {
  const t = String(iso || '').slice(0, 10);
  return t ? t.slice(8, 10) + '/' + t.slice(5, 7) + '/' + t.slice(0, 4) : '';
}
`;

const ROTINA = `
var FUSO_MINUTOS = -180;
// Dia em Brasília, não o dia UTC do relógio universal (D-006).
function diaNoFuso(instanteMs) { return new Date(instanteMs + FUSO_MINUTOS * 60000).toISOString().slice(0, 10); }

var PERSONAS_QUE_OPERAM = ['admin', 'analista', 'gestor'];

/** R-013: a resolução de persona da 002, aqui sobre a sessão (\`:VAR_USER\`).
 * Sem sessão (o cron) devolve null — e aí quem assina cada pedido é o
 * QUEM_PROCESSA dele, conferido dentro de cada escrita (D-004). */
async function pessoaDaSessao() {
  var linhas = await query(
    "SELECT IU.ID AS ID, COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACESSO, " +
    "COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER') WHEN 'ADMIN' THEN 'admin' WHEN 'RESTRICTED' THEN 'comercial' ELSE 'analista' END) AS PERSONA " +
    "FROM INT_USER IU LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID WHERE IU.ID = :VAR_USER"
  );
  return linhas[0] || null;
}

/** RN-009/RNF-002: uma consulta ao ERP por FORNECEDOR, com todas as notas
 * dele, em fatias de 500 (ORA-01795). Falha do fornecedor sobe para quem
 * chama, que a isola (C-014, RNF-006). */
async function entradasDoFornecedor(codfornec, numnotas) {
  var entradas = [];
  for (var i = 0; i < numnotas.length; i += 500) {
    var fatia = numnotas.slice(i, i + 500).map(inteiro).join(',');
    var linhas = await linhasPorId(IDS.sgcWintNfEntradasConfirmadas, { codfornec: inteiro(codfornec), numnotas: fatia || '0' });
    entradas = entradas.concat(linhas);
  }
  return entradas;
}

/** RN-004/C-008: candidata é a entrada com o mesmo NUMNOTA (e o mesmo
 * NUMTRANSENT, quando a nota já o tem). Havendo mais de uma, vence a da filial
 * do pedido; não havendo, a primeira por data de entrada. */
function entradaDaNota(nf, entradas) {
  var transent = inteiro(nf.NUMTRANSENT);
  var candidatas = entradas.filter(function (e) {
    if (inteiro(e.NUMNOTA) !== inteiro(nf.NUMNOTA)) return false;
    return transent === 0 || inteiro(e.NUMTRANSENT) === transent;
  });
  if (candidatas.length === 0) return null;
  var daFilial = candidatas.filter(function (e) { return String(e.CODFILIAL || '') === String(nf.FILIAL_PEDIDO || ''); });
  var alvo = daFilial.length ? daFilial : candidatas;
  return alvo.slice().sort(function (a, b) { return String(a.DT_ENTRADA).localeCompare(String(b.DT_ENTRADA)); })[0];
}

/** RN-007: aviso de atraso uma vez por dia por nota. A dupla trava é a data na
 * própria nota (ALERTA_ATRASO_EM) e a CHAVE única do aviso — é ela que faz a
 * rodada repetida do mesmo dia dar 5 avisos e não 15 (C-011). */
async function alertarAtraso(nf, hoje, quando) {
  var texto = 'NF ' + inteiro(nf.NUMNOTA) + ' de ' + String(nf.FORNECEDOR || 'fornecedor não parametrizado')
    + ' (faturada em ' + dataBr(nf.DT_EMISSAO) + ', previsão ' + dataBr(nf.DT_PREVISAO) + ') está '
    + inteiro(nf.DIAS_ATRASO) + (inteiro(nf.DIAS_ATRASO) === 1 ? ' dia atrasada' : ' dias atrasada')
    + ' e continua sem entrada no WinThor.';
  await chamar(IDS.sgcEscAvisoInserir, {
    idCard: inteiro(nf.ID_CARD),
    tipo: 'nf_atrasada',
    chave: 'nf_atrasada:' + inteiro(nf.ID_CARD) + ':' + hoje + ':' + inteiro(nf.ID),
    paraUsuarioId: 0,
    paraPersona: '',
    texto: texto,
    criadoEm: quando,
  });
  await chamar(IDS.sgcEscNfAlertaAtraso, { idNf: inteiro(nf.ID), alertaEm: quando, usuarioId: inteiro(nf.QUEM_PROCESSA) });
}

/** RN-006/D-014: TODO pedido em trânsito com ao menos uma nota e zero nota sem
 * recebimento — não só os tocados na rodada. Nota vinculada depois de a
 * entrada existir no ERP nasce recebida (D-012 da 005) e nunca aparece entre
 * as pendentes; sem esta varredura, o pedido ficaria preso em trânsito (C-023).
 * A fase de destino sai de SGC_FASE.CHAVE, nunca por id nem por nome. */
async function pedidosProntos(recorte) {
  return query(
    "SELECT C.ID AS ID_CARD, C.BOARD_ID, " +
    "  (SELECT FA.FASE_ID FROM SGC_FASE FA WHERE FA.BOARD_ID = C.BOARD_ID AND FA.CHAVE = 'faturamento' LIMIT 1) AS FASE_DESTINO, " +
    "  COALESCE((SELECT R.USUARIO_ID FROM KB_CARD_RESPONSAVEL R WHERE R.CARD_ID = C.ID ORDER BY R.ORDEM, R.ID LIMIT 1), C.CRIADO_POR, 0) AS QUEM_PROCESSA, " +
    "  (SELECT COUNT(*) FROM SGC_NF N WHERE N.ID_CARD = C.ID) AS QT_NFS " +
    "FROM KB_CARD C " +
    "JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID AND F.CHAVE = 'transito' " +
    "WHERE C.EXCLUIDO_EM IS NULL " +
    "  AND EXISTS (SELECT 1 FROM SGC_NF N WHERE N.ID_CARD = C.ID) " +
    "  AND NOT EXISTS (SELECT 1 FROM SGC_NF N WHERE N.ID_CARD = C.ID AND TRIM(COALESCE(N.DT_RECEBIMENTO, '')) = '') " +
    recorte
  );
}

/** Nota no histórico do card — sempre em try/catch: nota que falha não derruba
 * a rodada (D-07 da revisão da onda 1). */
async function registrarNota(cardId, texto, usuarioId) {
  try {
    await chamar(IDS.kbNotaRegistrar, { cardId: inteiro(cardId), texto: texto, usuarioId: inteiro(usuarioId) });
  } catch (erro) { /* histórico é registro, não pré-requisito */ }
}
`;

const CORPO_SINCRONIZAR = `
var cardId = inteiro(event.cardId);
var hoje = diaNoFuso(Date.now());
var quando = agora();

// 1. Quem está processando. Com sessão (o botão da tela), o perfil decide aqui;
//    sem sessão (o cron), a guarda cai sobre o QUEM_PROCESSA de cada pedido.
var pessoa = await pessoaDaSessao();
if (pessoa && (pessoa.ACESSO === 'READ_ONLY' || PERSONAS_QUE_OPERAM.indexOf(pessoa.PERSONA) === -1)) {
  return { ok: false, error: 'Seu perfil não verifica o recebimento das notas.' };
}
// A2 da revisão: RESTRICTED opera apenas os pedidos que criou.
var somenteDe = pessoa && pessoa.ACESSO === 'RESTRICTED' ? inteiro(pessoa.ID) : 0;

// 2. Notas pendentes (uma execução por rodada, D-015).
var pendentes = await linhasPorId(IDS.sgcNfsRecebimentoPendente, { cardId: cardId, hoje: hoje });
if (somenteDe) pendentes = pendentes.filter(function (nf) { return inteiro(nf.CRIADO_POR) === somenteDe; });

var erros = [];
var recebidas = 0;
var atrasadas = 0;
var porCard = {};

// 3. Uma consulta ao ERP por fornecedor, cada uma isolada em try/catch.
var porFornecedor = {};
for (var i = 0; i < pendentes.length; i += 1) {
  var chave = String(inteiro(pendentes[i].CODFORNEC));
  if (!porFornecedor[chave]) porFornecedor[chave] = [];
  porFornecedor[chave].push(pendentes[i]);
}

var codigos = Object.keys(porFornecedor);
for (var f = 0; f < codigos.length; f += 1) {
  var notas = porFornecedor[codigos[f]];
  var entradas = null;
  try {
    entradas = await entradasDoFornecedor(codigos[f], notas.map(function (nf) { return inteiro(nf.NUMNOTA); }));
  } catch (erro) {
    // C-014/RNF-006: nada do fornecedor é sobrescrito e o laço segue.
    erros.push({ codfornec: inteiro(codigos[f]), erro: (erro && erro.message) || String(erro) });
    continue;
  }
  for (var n = 0; n < notas.length; n += 1) {
    var nf = notas[n];
    var entrada = entradaDaNota(nf, entradas);
    if (!entrada || !String(entrada.DT_ENTRADA || '')) continue;
    try {
      await chamar(IDS.sgcEscNfRecebimento, {
        idNf: inteiro(nf.ID),
        dtRecebimento: String(entrada.DT_ENTRADA).slice(0, 10),
        numtransent: inteiro(entrada.NUMTRANSENT),
        chavenfe: String(entrada.CHAVENFE || ''),
        usuarioId: inteiro(nf.QUEM_PROCESSA),
      });
      recebidas += 1;
      nf.DT_RECEBIMENTO = String(entrada.DT_ENTRADA).slice(0, 10);
      var alvo = porCard[String(inteiro(nf.ID_CARD))] || { quemProcessa: inteiro(nf.QUEM_PROCESSA), notas: [] };
      alvo.notas.push('NF ' + inteiro(nf.NUMNOTA) + ', ' + dataBr(nf.DT_RECEBIMENTO));
      porCard[String(inteiro(nf.ID_CARD))] = alvo;
    } catch (erro) {
      erros.push({ codfornec: inteiro(codigos[f]), erro: (erro && erro.message) || String(erro) });
    }
  }
}

// 4. Atrasadas que continuam sem entrada (RF-013/RN-007).
for (var a = 0; a < pendentes.length; a += 1) {
  var nota = pendentes[a];
  if (String(nota.DT_RECEBIMENTO || '')) continue;
  if (nota.SITUACAO !== 'atrasada') continue;
  if (String(nota.ALERTA_ATRASO_EM || '').slice(0, 10) === hoje) continue;
  try {
    await alertarAtraso(nota, hoje, quando);
    atrasadas += 1;
  } catch (erro) {
    erros.push({ codfornec: inteiro(nota.CODFORNEC), erro: (erro && erro.message) || String(erro) });
  }
}

// 5. Resumo no histórico de cada pedido que teve nota recebida.
var tocados = Object.keys(porCard);
for (var t = 0; t < tocados.length; t += 1) {
  var dados = porCard[tocados[t]];
  var quantas = dados.notas.length;
  await registrarNota(tocados[t],
    'Recebimento sincronizado: ' + quantas + (quantas === 1 ? ' nota com entrada' : ' notas com entrada')
      + ' no WinThor (' + dados.notas.join('; ') + ').',
    dados.quemProcessa);
}

// 6. Conclusão do trânsito (RN-006/R-031).
var recorte = cardId ? ' AND C.ID = ' + cardId : '';
if (somenteDe) recorte += ' AND C.CRIADO_POR = ' + somenteDe;
var prontos = await pedidosProntos(recorte);
var movidos = 0;
var resultados = [];

for (var p = 0; p < prontos.length; p += 1) {
  var pedido = prontos[p];
  var destino = inteiro(pedido.FASE_DESTINO);
  if (!destino) {
    erros.push({ idCard: inteiro(pedido.ID_CARD), erro: 'Fase "faturamento" não mapeada em SGC_FASE.' });
    continue;
  }
  try {
    var movido = await chamar(IDS.kbCardMover, {
      cardId: inteiro(pedido.ID_CARD),
      faseId: destino,
      ordem: 0,
      movidoPor: inteiro(pedido.QUEM_PROCESSA),
      origem: 'sistema',
    });
    if (!movido || movido.ok !== true) throw new Error((movido && movido.error) || 'kbCardMover recusou.');
    movidos += 1;
    resultados.push({ idCard: inteiro(pedido.ID_CARD), faseId: destino, notas: inteiro(pedido.QT_NFS) });

    var qt = inteiro(pedido.QT_NFS);
    await chamar(IDS.sgcEscAvisoInserir, {
      idCard: inteiro(pedido.ID_CARD),
      tipo: 'nf_recebida',
      chave: 'nf_recebida:' + inteiro(pedido.ID_CARD) + ':' + hoje,
      paraUsuarioId: 0,
      paraPersona: '',
      texto: (qt === 1 ? 'A nota do pedido deu entrada' : 'As ' + qt + ' notas do pedido deram entrada')
        + ' no WinThor. O pedido saiu de Em Trânsito para BN e está em Faturamento em Andamento.',
      criadoEm: quando,
    });
    await registrarNota(pedido.ID_CARD,
      (qt === 1 ? 'A nota do pedido deu entrada' : 'As ' + qt + ' notas do pedido deram entrada')
        + ' no WinThor. O pedido saiu de Em Trânsito para BN e está em Faturamento em Andamento.',
      pedido.QUEM_PROCESSA);
  } catch (erro) {
    erros.push({ idCard: inteiro(pedido.ID_CARD), erro: (erro && erro.message) || String(erro) });
  }
}

return {
  ok: true,
  hoje: hoje,
  notas: pendentes.length,
  recebidas: recebidas,
  atrasadas: atrasadas,
  movidos: movidos,
  resultados: resultados,
  erros: erros,
};
`;

/* ─────────────── definições publicadas ───────────────
 *
 * `BASE` guarda o código CRU, com o marcador __SGC_IDS__ intacto: `definitions`
 * (ids locais, simulador) e a publicação real (ids por nome) derivam dele, cada
 * uma com o seu mapa.
 */

const BASE = [
  /* ── leituras ── */
  {
    name: 'sgcNfsRecebimentoCard',
    type: 'SQL',
    description: 'RF-001/RF-005/RF-006 - as notas do pedido com previsão, situação e dias de atraso, em UMA execução (RNF-001). Previsão derivada (RF-004), nunca coluna. Params: cardId, hoje (\'\' = dia do servidor).',
    code: SQL_RECEBIMENTO_CARD,
  },
  {
    name: 'sgcNfsRecebimentoPendente',
    type: 'SQL',
    description: 'RF-007/RF-016/RN-010/RN-011 - notas sem recebimento de pedidos em Enviado ou Em Trânsito, em lote de 30 PEDIDOS (todas as notas de cada um), com fornecedor, filial do pedido e quem assina as escritas. Params: cardId (0 = todos os monitorados), hoje.',
    code: SQL_RECEBIMENTO_PENDENTE,
  },
  {
    name: 'sgcNfsEmAtraso',
    type: 'SQL',
    description: 'RF-018/RF-019 - lista paginada das notas vencidas dos pedidos em Enviado e Em Trânsito; busca por número da nota, fornecedor ou pedido no ERP; faixa ate3|4a7|mais7. Params: busca, faixa, hoje, limite, offset.',
    code: `SELECT A.ID, A.ID_CARD, A.TITULO, A.FASE, A.NUMNOTA, A.SERIE, A.CODFORNEC, A.FORNECEDOR,
  A.CODFILIAL, A.FILIAL, A.NUMPED_WINTHOR, A.DT_EMISSAO, A.PRAZO_ENTREGA_DIAS, A.PRAZO_ENTREGA_TIPO,
  A.DT_PREVISAO, A.DIAS_ATRASO, A.VL_TOTAL
FROM ${CAMADA_ATRASO}
WHERE ${FILTROS_ATRASO}
ORDER BY A.DIAS_ATRASO DESC, A.VL_TOTAL DESC
LIMIT {{limite}} OFFSET {{offset}}`,
  },
  {
    name: 'sgcNfsEmAtrasoTotal',
    type: 'SQL',
    description: 'RF-018 - total de notas e valor acumulado do MESMO recorte da listagem, numa execução (o topo da tela). Params: busca, faixa, hoje.',
    code: `SELECT COUNT(*) AS TOTAL, COALESCE(SUM(A.VL_TOTAL), 0) AS VALOR_TOTAL
FROM ${CAMADA_ATRASO}
WHERE ${FILTROS_ATRASO}`,
  },
  {
    name: 'sgcWintNfEntradasConfirmadas',
    type: 'SQL',
    description: 'RF-008/RF-016/RNF-005 - entradas CONSOLIDADAS da nota no WinThor (DTENT não nula, DTCANCEL nula), por fornecedor e lista de NUMNOTA. Só leitura. Params: codfornec, numnotas (lista de inteiros, fatias de 500).',
    code: SQL_ENTRADAS_CONFIRMADAS,
  },
  {
    name: 'sgcRecebimentoSincronizar',
    type: 'JAVASCRIPT',
    cronExpression: '0 25 9-23/2 * * *',
    description: 'RF-007/RF-010/RF-011/RF-015/RF-017/RF-025 - casa as notas pendentes com a entrada no WinThor (uma consulta por fornecedor), alerta atraso uma vez por dia por nota e leva para Faturamento todo pedido em Trânsito com 100% recebido, por kbCardMover com origem "sistema". Cron 0 25 9-23/2 * * * (UTC; 6h25-20h25 de Brasília, R-035). Params: cardId (0 = todos os pedidos monitorados).',
    code: PREAMBULO_JS + ROTINA + CORPO_SINCRONIZAR,
  },

  /* ── escritas (uma instrução cada, chamadas SÓ por id, D-005) ── */
  {
    name: 'sgcEscNfRecebimento',
    type: 'SQL',
    description: 'RF-008 - grava a data de entrada consolidada do ERP como recebimento e completa DT_ENTRADA/NUMTRANSENT/CHAVENFE quando vieram vazios. Persona de {{usuarioId}} (quem processa o pedido), não :VAR_USER: chamada aninhada não propaga sessão (R-013).',
    code: `UPDATE SGC_NF SET
  DT_RECEBIMENTO = '{{dtRecebimento}}',
  DT_ENTRADA = COALESCE(NULLIF(DT_ENTRADA, ''), '{{dtRecebimento}}'),
  NUMTRANSENT = CASE WHEN COALESCE(NUMTRANSENT, 0) > 0 THEN NUMTRANSENT ELSE {{numtransent}} END,
  CHAVENFE = COALESCE(NULLIF(CHAVENFE, ''), NULLIF('{{chavenfe}}', ''))
WHERE ID = {{idNf}}
  AND TRIM('{{dtRecebimento}}') <> ''
  AND {{usuarioId}} > 0
  ${guardaPersona('{{usuarioId}}', PERSONAS_RECEBIMENTO)}`,
  },
  {
    name: 'sgcEscNfAlertaAtraso',
    type: 'SQL',
    description: 'RF-013/RN-007 - marca na nota o dia do último aviso de atraso (a primeira das duas travas de idempotência; a outra é a CHAVE única de SGC_AVISO). Persona de {{usuarioId}}.',
    code: `UPDATE SGC_NF SET ALERTA_ATRASO_EM = '{{alertaEm}}'
WHERE ID = {{idNf}}
  AND {{usuarioId}} > 0
  ${guardaPersona('{{usuarioId}}', PERSONAS_RECEBIMENTO)}`,
  },
];

// Para o simulador (e para quem só importa `definitions`): ids LOCAIS, do mapa
// deste projeto — o mesmo padrão de add-001-kanban.mjs e add-007-agenda.mjs.
export const definitions = BASE.map((definicao) => (
  definicao.type === 'JAVASCRIPT'
    ? { ...definicao, code: injetarIds(definicao.code, filtrarIds(idsDoMapa(MAPA))) }
    : definicao
));

/* ─────────────── publicação ─────────────── */

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function functionId(item) {
  return item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;
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

  const lista = await sdk.listServerFunctionsMitra({ projectId });
  const porNome = new Map((lista?.result ?? lista ?? []).map((fn) => [fn.name, fn]));

  // O jdbcId do WinThor, resolvido por NOME (add-003-jdbc-winthor.mjs).
  const jdbcId = await jdbcIdWinthor(projectId);

  async function publicar(definicao, idsReais) {
    const code = definicao.type === 'JAVASCRIPT' ? injetarIds(definicao.code, idsReais) : definicao.code;
    const extras = {};
    if (definicao.cronExpression) extras.cronExpression = definicao.cronExpression;
    // As sgcWint* falam com o Oracle do WinThor, não com o banco do projeto.
    if (definicao.name.startsWith('sgcWint')) extras.jdbcId = jdbcId;
    const existente = porNome.get(definicao.name);
    if (existente) {
      const id = functionId(existente);
      await sdk.updateServerFunctionMitra({ projectId, serverFunctionId: id, code, description: definicao.description, ...extras });
      console.log(`  atualizada  ${definicao.name} (${id})`);
      return id;
    }
    const criada = await sdk.createServerFunctionMitra({ projectId, name: definicao.name, type: definicao.type, code, description: definicao.description, ...extras });
    const id = functionId(criada);
    console.log(`  criada      ${definicao.name} (${id})`);
    return id;
  }

  // Quatro das sete SFs que o JS chama por id nascem NESTE script: publicar as
  // SQL primeiro é o que permite resolver os ids por nome (R-016) sem
  // hardcode e sem uma segunda rodada manual.
  const ids = {};
  for (const definicao of BASE.filter((d) => d.type !== 'JAVASCRIPT')) ids[definicao.name] = await publicar(definicao);

  const idsReais = {};
  for (const nome of NOMES_INTERNOS) {
    const achado = ids[nome] ?? (porNome.has(nome) ? functionId(porNome.get(nome)) : undefined);
    if (!achado) throw new Error(`Server function não publicada: ${nome}. Publique add-001-kanban.mjs e add-008-notas-fiscais.mjs antes do add-009.`);
    idsReais[nome] = achado;
  }

  for (const definicao of BASE.filter((d) => d.type === 'JAVASCRIPT')) ids[definicao.name] = await publicar(definicao, idsReais);

  console.log(`Pronto: ${Object.keys(ids).length} server functions de trânsito e recebimento publicadas.`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
