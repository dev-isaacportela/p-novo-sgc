// add-010 — Server Functions da spec 007 (produtos em B.O.): itens
// indisponíveis, previsão de liberação, carta de falta, clientes impactados,
// painel consolidado. Ver docs/specs/007-produtos-em-bo/{spec,plan,tasks}.md.
//
// Faixa de id local: 77xx (R-024) — leituras e JAVASCRIPT 7701-7709
// (sgcBoItensCard, sgcBoPrevisoesCard, sgcBoDocumentosCard, sgcBoPainel,
// sgcBoPainelTotal, sgcWintClientesImpactados, sgcBoCarregar, sgcBoMarcar,
// sgcBoMonitorar — cron `0 5 11 * * *`), escritas 7750-7756
// (sgcEscBoItemInserir…sgcEscPedidoAlertaBo). Preâmbulo JS e guarda de persona
// portados de add-006-itens.mjs (mesmo padrão de add-007-agenda.mjs para o
// cron chamar por id).
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-010-bo.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { jdbcIdWinthor } from './add-003-jdbc-winthor.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));
const MARCADOR_IDS = '__SGC_IDS__';

/** Nomes que falam com o WinThor: recebem o jdbcId resolvido por nome na publicação. */
export const WINTHOR = ['sgcWintClientesImpactados'];

/* ──────────────────────────────────────────────────────────────────────────
   Guarda de persona — UM texto só, o da 002 (R-013), copiado literalmente
   (mesmo padrão de add-006-itens.mjs); só a lista de personas e o dono da
   sessão mudam. `:VAR_USER` vale em SF chamada DIRETO da tela; escrita
   chamada por id de dentro de um JAVASCRIPT recebe `{{usuarioId}}` cru — e
   leva a MESMA guarda sobre ele (A1 da revisão da onda 1).
   ────────────────────────────────────────────────────────────────────────── */

function guarda(personas, quem = ':VAR_USER', extra = '') {
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
      ${extra}
  )`;
}

/** A mesma guarda, para a escrita interna que recebe o usuário como parâmetro. */
const guardaInterna = (personas) => guarda(personas, '{{usuarioId}}');

/** RF-019/RN-009 — marcar, liberar, registrar previsão e anexar é de admin/analista/gestor. */
const PERSONAS_BO = ['admin', 'analista', 'gestor'];

// A-6 (revisão onda 2): sgcEscBoPrevisaoInserir/sgcEscPedidoPrevisaoBo/
// sgcEscBoDocumentoInserir são chamadas DIRETO da tela só com guarda(persona)
// — sem checar fase nem dono, um analista gravava previsão num card fora de
// Faturamento/B.O. e um RESTRICTED gravava em card alheio. Mesma condição de
// pedidoEmBo (JS acima) e a mesma junção SGC_FASE→KB_FASE de lá, aqui em SQL,
// dentro do EXISTS da guarda (reusa o alias IU já filtrado por `quem`).
const guardaFaseEDono = (idCardExpr, quem = ':VAR_USER') => `AND EXISTS (
        SELECT 1 FROM KB_CARD C
        JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID AND F.CHAVE IN ('faturamento', 'bo')
        WHERE C.ID = ${idCardExpr}
          AND (COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'RESTRICTED' OR C.CRIADO_POR = ${quem})
      )`;

/* ─────────────── leituras — WinThor (Oracle) ─────────────── */

// D-003 do plan: porte de sgc_bo_clientes_impactados (p-45547) com duas
// correções — INSTR(...) vira IN ({{codprods}}) (sargável, mesmo fragmento
// que a 003 já monta e fatia em 500 códigos, ORA-01795) e a janela vira
// parâmetro ({{dias}} = 60) em vez de literal. Sem filial no recorte (D-004):
// o cliente impactado é o cliente da empresa. CODOPER = 'S' com QT > 0
// descarta entrada e estorno (RN-002).
const SQL_CLIENTES_IMPACTADOS = `SELECT M.CODPROD,
       COUNT(DISTINCT M.CODCLI)                          AS CLIENTES_IMPACTADOS,
       NVL(SUM(CASE WHEN M.QT > 0 THEN M.QT ELSE 0 END), 0) AS QT_VENDIDA_60D
FROM PCMOV M
WHERE M.CODPROD IN ({{codprods}})
  AND M.CODOPER = 'S'
  AND M.DTMOV >= TRUNC(SYSDATE) - {{dias}}
GROUP BY M.CODPROD`;

/* ─────────────── leituras — banco do projeto ───────────────
 *
 * D-001/T-004: as três leituras do card são CONSTANTES EXPORTADAS — o
 * sgcBoCarregar (JAVASCRIPT) as reusa por runQueryMitra, trocando
 * `{{idCard}}` pelo id saneado por texto (o mesmo texto publicado, sem
 * segunda cópia para divergir).
 */

export const SQL_BO_ITENS_CARD = `SELECT B.ID, B.CODPROD, B.DESCRICAO, I.EMBALAGEM, I.UNIDADE,
  B.QT_PENDENTE, COALESCE(I.QT_PEDIDA, 0) AS QT_PEDIDA, COALESCE(I.PRECO_CUSTO, 0) AS PRECO_CUSTO,
  (B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0))      AS VL_PENDENTE,
  COALESCE(B.OBSERVACAO, '')                        AS OBSERVACAO,
  B.STATUS, B.CLIENTES_IMPACTADOS, B.QT_VENDIDA_60D,
  COALESCE(UC.NOME, '') AS CRIADO_POR_NOME, COALESCE(B.CRIADO_EM, '')    AS CRIADO_EM,
  COALESCE(UR.NOME, '') AS RESOLVIDO_POR_NOME, COALESCE(B.RESOLVIDO_EM, '') AS RESOLVIDO_EM
FROM SGC_BO_ITEM B
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD
LEFT JOIN INT_USER UC ON UC.ID = B.CRIADO_POR
LEFT JOIN INT_USER UR ON UR.ID = B.RESOLVIDO_POR
WHERE B.ID_CARD = {{idCard}}
ORDER BY CASE B.STATUS WHEN 'aberto' THEN 0 ELSE 1 END, B.QT_PENDENTE DESC, B.DESCRICAO`;

export const SQL_BO_PREVISOES_CARD = `SELECT PR.ID, PR.DT_PREVISAO, COALESCE(PR.OBSERVACAO, '') AS OBSERVACAO,
  COALESCE(U.NOME, '') AS REGISTRADO_POR_NOME, COALESCE(PR.REGISTRADO_EM, '') AS REGISTRADO_EM
FROM SGC_BO_PREVISAO PR
LEFT JOIN INT_USER U ON U.ID = PR.REGISTRADO_POR
WHERE PR.ID_CARD = {{idCard}}
ORDER BY PR.ID`;

export const SQL_BO_DOCUMENTOS_CARD = `SELECT D.ID, D.TIPO, D.NOME_ARQUIVO, D.ENDERECO,
  COALESCE(U.NOME, '') AS ENVIADO_POR_NOME, COALESCE(D.ENVIADO_EM, '') AS ENVIADO_EM
FROM SGC_BO_DOCUMENTO D
LEFT JOIN INT_USER U ON U.ID = D.ENVIADO_POR
WHERE D.ID_CARD = {{idCard}}
ORDER BY D.ID`;

// G-6 (o mesmo desenho da 006): `hoje` desligado (`''`) não pode virar "tudo
// no prazo" — cai para o dia do servidor.
const HOJE = `COALESCE(NULLIF('{{hoje}}', ''), DATE_FORMAT(CURDATE(), '%Y-%m-%d'))`;

// D-006: filtra por B.STATUS, NÃO pela fase do card — item aberto continua no
// painel mesmo que o pedido tenha voltado a Faturamento.
const SQL_BO_PAINEL_BASE = `FROM SGC_BO_ITEM B
JOIN KB_CARD C  ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_PEDIDO P      ON P.ID_CARD = B.ID_CARD
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD
WHERE ('{{status}}' = '' OR B.STATUS = '{{status}}')
  AND ('{{busca}}' = '' OR B.DESCRICAO LIKE CONCAT('%', '{{busca}}', '%')
       OR C.TITULO LIKE CONCAT('%', '{{busca}}', '%')
       OR COALESCE(P.FORNECEDOR, '') LIKE CONCAT('%', '{{busca}}', '%'))
  AND ('{{situacao}}' = '' OR '{{situacao}}' = CASE
        WHEN COALESCE(P.DT_PREVISAO_BO, '') = '' THEN 'sem_previsao'
        WHEN P.DT_PREVISAO_BO < ${HOJE}          THEN 'vencida'
        WHEN P.DT_PREVISAO_BO = ${HOJE}          THEN 'hoje'
        ELSE 'no_prazo' END)`;

const SQL_BO_PAINEL = `SELECT B.ID, B.ID_CARD, C.TITULO,
  COALESCE(P.CODFORNEC, 0) AS CODFORNEC, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
  COALESCE(P.CODFILIAL, '') AS CODFILIAL, COALESCE(P.FILIAL, '')    AS FILIAL,
  B.CODPROD, B.DESCRICAO, COALESCE(I.UNIDADE, '') AS UNIDADE,
  B.QT_PENDENTE, (B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0)) AS VL_PENDENTE,
  B.CLIENTES_IMPACTADOS, B.QT_VENDIDA_60D, COALESCE(B.OBSERVACAO, '') AS OBSERVACAO, B.STATUS,
  COALESCE(P.DT_PREVISAO_BO, '') AS DT_PREVISAO_BO,
  CASE
    WHEN COALESCE(P.DT_PREVISAO_BO, '') = ''   THEN 'sem_previsao'
    WHEN P.DT_PREVISAO_BO < ${HOJE}            THEN 'vencida'
    WHEN P.DT_PREVISAO_BO = ${HOJE}            THEN 'hoje'
    ELSE 'no_prazo' END                        AS SITUACAO_PREVISAO,
  COALESCE((SELECT D.ENDERECO FROM SGC_BO_DOCUMENTO D
            WHERE D.ID_CARD = B.ID_CARD AND D.TIPO = 'carta_falta'
            ORDER BY D.ENVIADO_EM DESC, D.ID DESC LIMIT 1), '') AS CARTA_FALTA_ENDERECO,
  COALESCE(B.CRIADO_EM, '') AS CRIADO_EM
${SQL_BO_PAINEL_BASE}
ORDER BY CASE WHEN COALESCE(P.DT_PREVISAO_BO, '') = '' THEN 0 ELSE 1 END,
         P.DT_PREVISAO_BO, B.ID_CARD, B.DESCRICAO
LIMIT {{limite}} OFFSET {{offset}}`;

const SQL_BO_PAINEL_TOTAL = `SELECT COUNT(*) AS TOTAL
${SQL_BO_PAINEL_BASE}`;

/* ─────────────── escritas SQL (uma instrução por SF) ─────────────── */

// A1: o lote de sgcEscBoItemInserir é `SELECT … UNION ALL SELECT …` dentro de
// uma derivada (o mesmo helper `lote()` do add-006), não `VALUES (…), (…)`,
// porque é a única forma de pendurar o `WHERE <guardaInterna>` numa execução
// só. UNIQUE (ID_CARD, CODPROD) + ON DUPLICATE KEY UPDATE é o que faz C-016
// (remarcar não duplica).
const SQL_BO_ITEM_INSERIR = `INSERT INTO SGC_BO_ITEM
  (ID_CARD, CODPROD, DESCRICAO, QT_PENDENTE, OBSERVACAO, STATUS, CLIENTES_IMPACTADOS, QT_VENDIDA_60D, CRIADO_POR, CRIADO_EM)
SELECT * FROM ({{linhas}}) LOTE
WHERE ${guardaInterna(PERSONAS_BO)}
ON DUPLICATE KEY UPDATE
  DESCRICAO = VALUES(DESCRICAO), QT_PENDENTE = VALUES(QT_PENDENTE), OBSERVACAO = VALUES(OBSERVACAO),
  STATUS = VALUES(STATUS), CLIENTES_IMPACTADOS = VALUES(CLIENTES_IMPACTADOS), QT_VENDIDA_60D = VALUES(QT_VENDIDA_60D),
  CRIADO_POR = VALUES(CRIADO_POR), CRIADO_EM = VALUES(CRIADO_EM)`;

const SQL_BO_ITEM_RESOLVER = `UPDATE SGC_BO_ITEM SET STATUS = '{{status}}', RESOLVIDO_POR = {{usuarioId}}, RESOLVIDO_EM = '{{resolvidoEm}}'
WHERE ID_CARD = {{idCard}} AND CODPROD IN ({{codprods}}) AND STATUS = 'aberto'
  AND ${guardaInterna(PERSONAS_BO)}`;

const SQL_ITEM_STATUS_BO = `UPDATE SGC_PEDIDO_ITEM SET STATUS = '{{status}}', ATUALIZADO_POR = {{usuarioId}}, ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID_CARD = {{idCard}} AND CODPROD IN ({{codprods}}) AND STATUS <> 'removido'
  AND ${guardaInterna(PERSONAS_BO)}`;

const SQL_BO_PREVISAO_INSERIR = `INSERT INTO SGC_BO_PREVISAO (ID_CARD, DT_PREVISAO, OBSERVACAO, REGISTRADO_POR, REGISTRADO_EM)
SELECT {{idCard}}, '{{dtPrevisao}}', '{{observacao}}', :VAR_USER, '{{registradoEm}}'
FROM DUAL
WHERE ${guarda(PERSONAS_BO, ':VAR_USER', guardaFaseEDono('{{idCard}}'))}`;

// RN-004/C-005: sempre zera ALERTA_BO_EM — registrar previsão é, por
// definição, reiniciar a cobrança. Não há parâmetro para isso não acontecer.
const SQL_PEDIDO_PREVISAO_BO = `UPDATE SGC_PEDIDO SET DT_PREVISAO_BO = '{{dtPrevisao}}', ALERTA_BO_EM = ''
WHERE ID_CARD = {{idCard}} AND ${guarda(PERSONAS_BO, ':VAR_USER', guardaFaseEDono('{{idCard}}'))}`;

// R-040: ENDERECO, o mesmo nome e tipo de SGC_FORNECEDOR_DOCUMENTO.ENDERECO (001).
// RN-011: tipo diferente de 'carta_falta' é gravado como 'outro' — normalizado
// aqui (não confiado ao frontend), C-006.
const SQL_BO_DOCUMENTO_INSERIR = `INSERT INTO SGC_BO_DOCUMENTO (ID_CARD, TIPO, NOME_ARQUIVO, ENDERECO, ENVIADO_POR, ENVIADO_EM)
SELECT {{idCard}}, CASE WHEN '{{tipo}}' = 'carta_falta' THEN 'carta_falta' ELSE 'outro' END, '{{nomeArquivo}}', '{{endereco}}', :VAR_USER, '{{enviadoEm}}'
FROM DUAL
WHERE ${guarda(PERSONAS_BO, ':VAR_USER', guardaFaseEDono('{{idCard}}'))}`;

const SQL_PEDIDO_ALERTA_BO = `UPDATE SGC_PEDIDO SET ALERTA_BO_EM = '{{alertaEm}}'
WHERE ID_CARD = {{idCard}} AND ${guardaInterna(PERSONAS_BO)}`;

const ESCRITAS = [
  {
    name: 'sgcEscBoItemInserir',
    resumo: 'RF-001/RF-003/C-016 - upsert em lote dos itens marcados em B.O. (uma execução por lote de 200 tuplas). Params: linhas (fragmento SELECT montado por sgcBoMarcar), usuarioId int',
    interna: true,
    code: SQL_BO_ITEM_INSERIR,
  },
  {
    name: 'sgcEscBoItemResolver',
    resumo: 'RF-012/RN-007 - libera (ou cancela) os itens de B.O. de uma lista de códigos. Params: idCard int, codprods lista, status string, usuarioId int, resolvidoEm string',
    interna: true,
    code: SQL_BO_ITEM_RESOLVER,
  },
  {
    name: 'sgcEscItemStatusBo',
    resumo: 'RF-001/RF-012/R-022 - situação do item do pedido acompanhando o B.O. (bo ao marcar, enviado ao liberar). Params: idCard int, codprods lista, status string, usuarioId int, atualizadoEm string',
    interna: true,
    code: SQL_ITEM_STATUS_BO,
  },
  {
    name: 'sgcEscBoPrevisaoInserir',
    resumo: 'RF-006 - histórico append-only de previsões de liberação. Params: idCard int, dtPrevisao string, observacao string, registradoEm string',
    code: SQL_BO_PREVISAO_INSERIR,
  },
  {
    name: 'sgcEscPedidoPrevisaoBo',
    resumo: 'RF-007/C-005 - espelha a previsão vigente no pedido e reinicia a cobrança (zera ALERTA_BO_EM sempre). Params: idCard int, dtPrevisao string',
    code: SQL_PEDIDO_PREVISAO_BO,
  },
  {
    name: 'sgcEscBoDocumentoInserir',
    resumo: 'RF-011/RN-011 - carta de falta ou outro documento do pedido. Params: idCard int, tipo string, nomeArquivo string, endereco string, enviadoEm string',
    code: SQL_BO_DOCUMENTO_INSERIR,
  },
  {
    name: 'sgcEscPedidoAlertaBo',
    resumo: 'RF-008 - marca o dia do último aviso (uma vez por dia). Params: idCard int, alertaEm string, usuarioId int',
    interna: true,
    code: SQL_PEDIDO_ALERTA_BO,
  },
];

const AVISO_INTERNA = 'Escrita interna, chamada por id de dentro das server functions JAVASCRIPT da spec 007; leva a guarda de persona sobre o usuarioId recebido (A1). Nao chamar do frontend.';

/* ─────────────── JavaScript (orquestração) ─────────────── */

// Preâmbulo comum, portado de add-006-itens.mjs (T-002). Regra da casa:
// nenhum `{{` literal aqui dentro — o que chega a um `{{param}}` é o `input`
// das chamadas por id.
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
  const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId: Number(id), input: entrada || {} });
  // D-15: resposta com executionStatus FAILED nao lanca sozinha — sem isso o
  // chamador (ex.: sgcBoMonitorar) segue como se a escrita tivesse ido.
  const resultado = (resposta && resposta.result) || resposta;
  if (resultado && resultado.executionStatus === 'FAILED') {
    throw new Error((resultado && resultado.error) || ('Falha em ' + nome + '.'));
  }
  return desembrulhar(resposta);
}
function inteiro(valor) { const n = Number(valor); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function numero(valor) { const n = Number(valor); return Number.isFinite(n) ? n : 0; }
// Aspa simples dobrada e caractere de controle fora (mesmo escape do add-006).
function texto(valor, teto) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\\u0000-\\u001f]/g, ' ').slice(0, teto || 200).replace(/'/g, "''");
}
// A1: o lote vai como derivada SELECT ... UNION ALL SELECT ... (nao VALUES),
// a unica forma de pendurar o WHERE da guarda numa execucao so.
function lote(colunas, linhas) {
  return linhas.map(function (valores, ordem) {
    return 'SELECT ' + valores.map(function (valor, coluna) {
      return ordem === 0 ? valor + ' AS ' + colunas[coluna] : valor;
    }).join(', ');
  }).join(' UNION ALL ');
}
function agora() { return new Date().toISOString().slice(0, 19); }
// Dia em Brasília, nunca o dia UTC do relógio universal (mesmo diaNoFuso do
// add-007-agenda.mjs) — RN-005/RN-006, R-035.
function diaNoFuso(instanteMs) { return new Date(instanteMs - 180 * 60000).toISOString().slice(0, 10); }
function diasEntre(aIso, bIso) {
  var a = aIso.split('-').map(Number); var b = bIso.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
function fmtDataBr(iso) {
  var m = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(iso || ''));
  return m ? m[3] + '/' + m[2] + '/' + m[1] : String(iso || '');
}
// R-013: o MESMO mapa de ACCESS_LEVEL da guarda SQL da 002, aqui em JS —
// :VAR_USER não se propaga em chamada aninhada.
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
function podeOperarBo(quem) {
  return quem.id > 0 && quem.nivel !== 'READ_ONLY' && ['admin', 'analista', 'gestor'].indexOf(quem.persona) !== -1;
}
// RF-004/RN-003/A2: o pedido precisa estar em faturamento ou bo, e RESTRICTED
// só opera o que criou (P-08 B).
async function pedidoEmBo(cardId, usuarioId) {
  const quemId = inteiro(usuarioId);
  const linhas = await consultar(
    'SELECT P.ID_CARD FROM SGC_PEDIDO P'
    + ' JOIN KB_CARD C ON C.ID = P.ID_CARD'
    + " JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID AND F.CHAVE IN ('faturamento', 'bo')"
    + ' JOIN INT_USER IU ON IU.ID = ' + quemId
    + ' WHERE P.ID_CARD = ' + inteiro(cardId) + ' AND C.EXCLUIDO_EM IS NULL'
    + " AND (COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'RESTRICTED' OR C.CRIADO_POR = " + quemId + ')');
  return linhas[0] || null;
}
const FORA_DO_BO = 'O pedido não está em Faturamento nem em Produtos em B.O., ou é de outra pessoa e o seu acesso é restrito aos próprios pedidos.';
// RN-001 - mesmo texto de validarMarcacaoBo (frontend/src/lib/bo.ts, G-... uma
// regra, dois lugares, literal nos dois).
function produtoForaDoPedido(codprod) { return 'O produto ' + codprod + ' não está neste pedido.'; }
function quantidadeInvalida(descricao) { return 'Quantidade pendente inválida para ' + descricao + '.'; }
// RN-006 - o mesmo texto de textoAvisoBo (frontend/src/lib/bo.ts): copiado
// literal para dentro do corpo JS do cron, porque a SF da plataforma não
// importa módulo do frontend.
function textoAvisoBo(titulo, dtPrevisao, hoje, abertos) {
  var dias = diasEntre(dtPrevisao, hoje);
  var situacaoTexto = dtPrevisao === hoje ? 'vence hoje' : ('venceu há ' + dias + (dias === 1 ? ' dia' : ' dias'));
  var itensTexto = abertos === 1 ? '1 item' : (abertos + ' itens');
  return 'Produtos em B.O. do pedido ' + titulo + ': a previsão de liberação era ' + fmtDataBr(dtPrevisao)
    + ' (' + situacaoTexto + ') e ' + itensTexto + ' continuam em aberto. Reavalie com o fornecedor e registre uma previsão nova.';
}`;

// sgcBoCarregar — a ÚNICA chamada da aba (RNF-001, D-001). Três runQueryMitra
// com os mesmos textos das constantes exportadas acima, mais a linha de capa.
const JS_BO_CARREGAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const sqlItens = ${JSON.stringify(SQL_BO_ITENS_CARD)}.split('{{idCard}}').join(String(cardId));
const sqlPrevisoes = ${JSON.stringify(SQL_BO_PREVISOES_CARD)}.split('{{idCard}}').join(String(cardId));
const sqlDocumentos = ${JSON.stringify(SQL_BO_DOCUMENTOS_CARD)}.split('{{idCard}}').join(String(cardId));
const [itens, previsoes, documentos, capa] = await Promise.all([
  consultar(sqlItens), consultar(sqlPrevisoes), consultar(sqlDocumentos),
  consultar("SELECT COALESCE(P.DT_PREVISAO_BO, '') AS DT_PREVISAO_BO FROM SGC_PEDIDO P WHERE P.ID_CARD = " + cardId),
]);
const dtPrevisao = String((capa[0] && capa[0].DT_PREVISAO_BO) || '');
const hoje = diaNoFuso(Date.now());
const situacao = dtPrevisao === '' ? 'sem_previsao' : (dtPrevisao < hoje ? 'vencida' : (dtPrevisao === hoje ? 'hoje' : 'no_prazo'));
const abertos = itens.filter(function (i) { return String(i.STATUS) === 'aberto'; }).length;
const liberados = itens.filter(function (i) { return String(i.STATUS) === 'liberado'; }).length;
return {
  ok: true, itens: itens, previsoes: previsoes, documentos: documentos,
  resumo: { abertos: abertos, liberados: liberados, previsao: dtPrevisao, situacao: situacao },
};`;

// sgcBoMarcar — marca e libera, nos dois sentidos, numa SF só (D-002).
const JS_BO_MARCAR = `${PRELUDIO}
const cardId = inteiro(event.cardId);
const quem = await persona();
if (!podeOperarBo(quem)) return { ok: false, erro: 'Seu perfil não opera os produtos em B.O. deste pedido.' };
if (!await pedidoEmBo(cardId, quem.id)) return { ok: false, erro: FORA_DO_BO };

let itensEntrada = event.itensJson;
if (typeof itensEntrada === 'string') { try { itensEntrada = JSON.parse(itensEntrada); } catch (e) { itensEntrada = null; } }
if (!Array.isArray(itensEntrada)) return { ok: false, erro: 'Lista de itens inválida.' };
itensEntrada = itensEntrada.filter(function (item) { return inteiro(item && item.codprod) > 0; });
if (itensEntrada.length === 0) return { ok: true, marcados: 0, liberados: 0, abertos: 0 };

const marcarLista = [];
const resolverLista = [];
for (const item of itensEntrada) {
  const status = String((item && item.status) || 'aberto');
  if (status === 'aberto') marcarLista.push(item); else resolverLista.push({ codprod: inteiro(item.codprod), status: status });
}

// RN-001 - valida cada marcação contra os itens do pedido ANTES de gravar
// qualquer coisa: produto fora do pedido, qtPendente <= 0 ou > QT_PEDIDA
// recusam a chamada inteira.
let itensDoPedido = [];
if (marcarLista.length > 0) {
  const codprodsValidar = marcarLista.map(function (i) { return inteiro(i.codprod); });
  itensDoPedido = await consultar(
    'SELECT CODPROD, DESCRICAO, QT_PEDIDA FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ' + cardId
    + " AND STATUS <> 'removido' AND CODPROD IN (" + codprodsValidar.join(',') + ')');
  const porCodigo = new Map();
  for (const linha of itensDoPedido) porCodigo.set(inteiro(linha.CODPROD), linha);
  for (const item of marcarLista) {
    const codprod = inteiro(item.codprod);
    const doItem = porCodigo.get(codprod);
    if (!doItem) return { ok: false, erro: produtoForaDoPedido(codprod) };
    const qt = numero(item.qtPendente);
    if (qt <= 0 || qt > numero(doItem.QT_PEDIDA)) return { ok: false, erro: quantidadeInvalida(String(doItem.DESCRICAO || '')) };
  }
}

let marcados = 0;
let liberados = 0;
const quando = agora();

if (marcarLista.length > 0) {
  const descricaoPorCodigo = new Map();
  for (const linha of itensDoPedido) descricaoPorCodigo.set(inteiro(linha.CODPROD), String(linha.DESCRICAO || ''));

  // RNF-003: UMA consulta de impacto por marcação, fatiada acima de 500 (ORA-01795).
  const codprodsMarcar = marcarLista.map(function (i) { return inteiro(i.codprod); });
  const impactoPorProduto = new Map();
  for (let inicio = 0; inicio < codprodsMarcar.length; inicio += 500) {
    const fatia = codprodsMarcar.slice(inicio, inicio + 500).join(',');
    const impacto = linhasDe(await chamar('sgcWintClientesImpactados', { codprods: fatia, dias: 60 }));
    for (const linha of impacto) impactoPorProduto.set(inteiro(linha.CODPROD), linha);
  }

  const COLUNAS = ['ID_CARD', 'CODPROD', 'DESCRICAO', 'QT_PENDENTE', 'OBSERVACAO', 'STATUS', 'CLIENTES_IMPACTADOS', 'QT_VENDIDA_60D', 'CRIADO_POR', 'CRIADO_EM'];
  const tuplas = marcarLista.map(function (item) {
    const codprod = inteiro(item.codprod);
    const impacto = impactoPorProduto.get(codprod);
    return [
      cardId, codprod,
      "'" + texto(descricaoPorCodigo.get(codprod) || '', 200) + "'",
      numero(item.qtPendente),
      "'" + texto(item.observacao, 500) + "'",
      "'aberto'",
      inteiro(impacto && impacto.CLIENTES_IMPACTADOS),
      numero(impacto && impacto.QT_VENDIDA_60D),
      quem.id, "'" + quando + "'",
    ];
  });
  // Lotes de 200 tuplas: RNF-002 (≤ 4 execuções aninhadas, qualquer N).
  for (let inicio = 0; inicio < tuplas.length; inicio += 200) {
    await chamar('sgcEscBoItemInserir', { linhas: lote(COLUNAS, tuplas.slice(inicio, inicio + 200)), usuarioId: quem.id });
  }
  await chamar('sgcEscItemStatusBo', { idCard: cardId, codprods: codprodsMarcar.join(','), status: 'bo', usuarioId: quem.id, atualizadoEm: quando });
  marcados = marcarLista.length;
}

if (resolverLista.length > 0) {
  // ponytail: um único status por chamada (o que a tela usa hoje é só
  // "liberado" — "cancelado" fica no dado para um "não vem mais" futuro,
  // fora de escopo da tela nesta onda). Lista com status misto, agrupar por
  // status quando precisar.
  const codprodsResolver = resolverLista.map(function (i) { return i.codprod; });
  const status = String(resolverLista[0].status) === 'cancelado' ? 'cancelado' : 'liberado';
  await chamar('sgcEscBoItemResolver', { idCard: cardId, codprods: codprodsResolver.join(','), status: status, usuarioId: quem.id, resolvidoEm: quando });
  await chamar('sgcEscItemStatusBo', { idCard: cardId, codprods: codprodsResolver.join(','), status: 'enviado', usuarioId: quem.id, atualizadoEm: quando });
  liberados = resolverLista.length;
}

const abertosLinha = await consultar("SELECT COUNT(*) AS N FROM SGC_BO_ITEM WHERE ID_CARD = " + cardId + " AND STATUS = 'aberto'");
return { ok: true, marcados: marcados, liberados: liberados, abertos: inteiro(abertosLinha[0] && abertosLinha[0].N) };`;

// sgcBoMonitorar — cron das 11h05 UTC (08h05 de Brasília, R-035), sem
// parâmetros, sem sessão. sgcEscAvisoInserir é a exceção de R-023 (a única
// escrita sem guarda de persona — a idempotência é a CHAVE única).
const JS_BO_MONITORAR = `${PRELUDIO}
const hoje = diaNoFuso(Date.now());
const loteCards = await consultar(
  'SELECT C.ID AS ID_CARD, C.TITULO,'
  + ' COALESCE((SELECT R.USUARIO_ID FROM KB_CARD_RESPONSAVEL R WHERE R.CARD_ID = C.ID ORDER BY R.ORDEM, R.ID LIMIT 1), C.CRIADO_POR) AS QUEM,'
  + ' P.DT_PREVISAO_BO,'
  + " (SELECT COUNT(*) FROM SGC_BO_ITEM B WHERE B.ID_CARD = C.ID AND B.STATUS = 'aberto') AS ABERTOS"
  + ' FROM KB_CARD C'
  + " JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID AND F.CHAVE = 'bo'"
  + ' JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID'
  + ' WHERE C.EXCLUIDO_EM IS NULL'
  + "   AND COALESCE(P.DT_PREVISAO_BO, '') <> '' AND P.DT_PREVISAO_BO <= '" + hoje + "'"
  + "   AND COALESCE(P.ALERTA_BO_EM, '') <> '" + hoje + "'"
  + ' ORDER BY P.DT_PREVISAO_BO, C.ID'
  + ' LIMIT 30'
);

let avisados = 0;
const resultados = [];
const erros = [];
for (const linha of loteCards) {
  const idCard = inteiro(linha.ID_CARD);
  try {
    const abertos = inteiro(linha.ABERTOS);
    const quemId = inteiro(linha.QUEM);
    const textoAviso = textoAvisoBo(String(linha.TITULO || ''), String(linha.DT_PREVISAO_BO || ''), hoje, abertos);
    await chamar('sgcEscAvisoInserir', {
      idCard: idCard, tipo: 'bo_previsao', chave: 'bo_previsao:' + idCard + ':' + hoje,
      paraUsuarioId: 0, paraPersona: '', texto: textoAviso, criadoEm: agora(),
    });
    // D-07 da onda 1: nota que falha não desfaz o aviso.
    try {
      await chamar('kbNotaRegistrar', { cardId: idCard, texto: textoAviso, usuarioId: quemId });
    } catch (e) { /* nota é acessória */ }
    await chamar('sgcEscPedidoAlertaBo', { idCard: idCard, alertaEm: hoje, usuarioId: quemId });
    // A-2: sgcEscPedidoAlertaBo é guardada pela persona do responsável (QUEM)
    // — 0 linhas casadas volta COMPLETED, não FAILED (chamar só lança em
    // FAILED de verdade). Releio a linha e só conto o que releu; o que não
    // gravou (responsável sem persona operante) vai para erros[], mesmo
    // padrão do 'gravada' em add-008-notas-fiscais.mjs.
    const pedidoGravado = await consultar("SELECT ALERTA_BO_EM FROM SGC_PEDIDO WHERE ID_CARD = " + idCard);
    if (!pedidoGravado[0] || String(pedidoGravado[0].ALERTA_BO_EM) !== hoje) {
      erros.push({ idCard: idCard, erro: 'responsável sem persona operante para registrar o alerta de B.O.' });
      continue;
    }
    avisados += 1;
    resultados.push({ idCard: idCard, abertos: abertos });
  } catch (erro) {
    erros.push({ idCard: idCard, erro: (erro && erro.message) || String(erro) });
  }
}
return { ok: true, hoje: hoje, tentados: loteCards.length, avisados: avisados, resultados: resultados, erros: erros };`;

/* ─────────────── a lista publicada ─────────────── */

const LEITURAS = [
  { name: 'sgcWintClientesImpactados', code: SQL_CLIENTES_IMPACTADOS, resumo: 'RF-003/RN-002 - clientes distintos e quantidade vendida nos últimos N dias (60), por lista de CODPROD. Params: codprods lista, dias int' },
  { name: 'sgcBoItensCard', code: SQL_BO_ITENS_CARD, resumo: 'RF-001/RF-012 - itens em B.O. do card, abertos primeiro. Params: idCard int' },
  { name: 'sgcBoPrevisoesCard', code: SQL_BO_PREVISOES_CARD, resumo: 'RF-006 - histórico de previsões de liberação do card. Params: idCard int' },
  { name: 'sgcBoDocumentosCard', code: SQL_BO_DOCUMENTOS_CARD, resumo: 'RF-011 - documentos (carta de falta e outros) do card. Params: idCard int' },
  { name: 'sgcBoPainel', code: SQL_BO_PAINEL, resumo: 'RF-015/RF-016/RF-017/RF-022 - uma linha por produto em B.O. de todos os pedidos, sem recorte por persona (D-012). Params: busca string, situacao string, status string, hoje string, limite int, offset int' },
  { name: 'sgcBoPainelTotal', code: SQL_BO_PAINEL_TOTAL, resumo: 'RF-017 - total da mesma listagem, para a paginação. Params: busca, situacao, status, hoje' },
];

const JAVASCRIPT = [
  { name: 'sgcBoCarregar', code: JS_BO_CARREGAR, resumo: 'RNF-001 - a aba inteira (itens, previsões, documentos, resumo) numa execução. Params: cardId int' },
  { name: 'sgcBoMarcar', code: JS_BO_MARCAR, resumo: 'RF-001..RF-004/RF-012/RF-019/RF-020 - marca e libera itens de B.O., nos dois sentidos. Params: cardId int, itensJson JSON' },
  { name: 'sgcBoMonitorar', code: JS_BO_MONITORAR, resumo: 'RF-008/RF-009/RF-010 - cobrança diária dos pedidos em B.O. com previsão atingida. Sem parâmetros.', cronExpression: '0 5 11 * * *' },
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
      code: f.code.split(MARCADOR_IDS).join(JSON.stringify(ids)),
      ...(f.cronExpression ? { cronExpression: f.cronExpression } : {}),
    })),
  ];
}

export const definitions = montarDefinitions(idsDoMapa(MAPA));

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

  // Primeiro as SQL (as JAVASCRIPT chamam sgcEscAvisoInserir da 005 e
  // kbNotaRegistrar da lib por NOME — precisam já estar publicadas antes do
  // segundo passo, que regrava as JAVASCRIPT com os ids REAIS, R-016).
  const semJs = definitions.filter((d) => d.type !== 'JAVASCRIPT');
  await publicar(semJs);
  const reais = Object.fromEntries(await existentes());
  await publicar(montarDefinitions({ ...idsDoMapa(MAPA), ...reais }).filter((d) => d.type === 'JAVASCRIPT'));

  console.log(`Pronto: ${definitions.length} server functions da spec 007 (produtos em B.O.).`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
