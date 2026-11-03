// add-018 — Server Functions da spec 016: fila de e-mail com novas tentativas
// e aviso diário de pedido pronto para concluir (as rotinas 3383
// `email_fila_processar` e 2579 `sgc_cron_pedidos_prontos_conclusao` do
// legado). Ver docs/specs/016-fila-email-e-aviso-conclusao/.
//
// Faixa de id local: 87xx (R-170 do 000) — escritas 8750-8753, JAVASCRIPT
// 8780-8781. Nenhuma leitura SQL: as duas rotinas leem por runQueryMitra.
//
// O e-mail sai na hora, como antes (P-01): o `sgcEnvioIndustriaRegistrar`
// (add-005) e o `sgcCobrancaEnviar` (add-008) só chamam a sgcEscEmailFilaInserir
// quando o sendEmailMitra falha. A fila não guarda o e-mail: reenvia o
// conteúdo da SGC_COMUNICACAO que o envio gravou (RN-002).
//
// A tabela SGC_EMAIL_FILA está no `setup-backend.mjs` (DDL_016). Os avisos vão
// para a SGC_AVISO pela sgcEscAvisoInserir da 005 (add-008); as notas, pelo
// kbNotaRegistrar da lib.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-018-fila-email-conclusao.mjs \
//   && node add-005-quadro-compras.mjs && node add-008-notas-fiscais.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';
import { fragmento } from './lib/fragmentos.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));
const MARCADOR_IDS = '__SGC_IDS__';

/** RN-001: a do clique + até 2 da rotina. */
export const MAX_TENTATIVAS = 3;
/** RN-004 (RN-EM-19 do legado): "enviando" há mais que isso é rodada que caiu. */
export const PRESO_MINUTOS = 30;
export const ERRO_PRESO = 'Envio interrompido antes da confirmação (a rotina parou no meio).';

// A mesma persona efetiva da guarda da 002 (add-005), copiada literal como nas
// specs 001, 003 e 004: sem linha em SGC_USUARIO_PERSONA vale o nível.
const PERSONA_EFETIVA = `COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER')
                            WHEN 'ADMIN' THEN 'admin'
                            WHEN 'RESTRICTED' THEN 'comercial'
                            ELSE 'analista' END)`;

/* ─────────────── escritas SQL (8750-8753) ─────────────── */

// RN-003 / C-009: só comunicação por e-mail, com endereço, gravada por quem
// envia pedido, e uma vez (UK + NOT EXISTS). Nasce com a tentativa do clique.
const SQL_FILA_INSERIR = `INSERT INTO SGC_EMAIL_FILA (ID_COMUNICACAO, ID_CARD, STATUS, TENTATIVAS, ULTIMO_ERRO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT CO.ID, CO.ID_CARD, 'pendente', 1, '{{erro}}', CO.ENVIADO_POR, '{{agora}}', '{{agora}}'
FROM SGC_COMUNICACAO CO
WHERE CO.ID = {{idComunicacao}}
  AND CO.TIPO IN ('email', 'cobranca')
  AND CO.PARA LIKE '%@%'
  AND NOT EXISTS (SELECT 1 FROM SGC_EMAIL_FILA F WHERE F.ID_COMUNICACAO = CO.ID)
  AND EXISTS (
    SELECT 1 FROM INT_USER IU
    LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID
    WHERE IU.ID = CO.ENVIADO_POR
      AND COALESCE(IU.ACCESS_LEVEL, 'MEMBER') <> 'READ_ONLY'
      AND ${PERSONA_EFETIVA} IN ('admin', 'analista', 'gestor')
  )`;

// RN-004 / C-006: os 20 mais antigos, numa instrução. A derivada X é o que o
// MySQL exige (sem ela: LIMIT em subconsulta IN e a tabela-alvo no FROM).
const SQL_FILA_RESERVAR = `UPDATE SGC_EMAIL_FILA
SET STATUS = 'enviando', LOTE = '{{lote}}', ATUALIZADO_EM = '{{agora}}'
WHERE STATUS = 'pendente'
  AND ID IN (SELECT ID FROM (SELECT ID FROM SGC_EMAIL_FILA WHERE STATUS = 'pendente' ORDER BY ID LIMIT 20) X)`;

const SQL_FILA_ENVIADO = `UPDATE SGC_EMAIL_FILA
SET STATUS = 'enviado', TENTATIVAS = TENTATIVAS + 1, ULTIMO_ERRO = NULL, LOTE = NULL,
  ENVIADO_EM = '{{agora}}', ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{id}} AND STATUS = 'enviando'`;

// STATUS antes de TENTATIVAS e com o "+ 1" próprio: o MySQL avalia o SET da
// esquerda para a direita e o SQLite sobre a linha antiga — assim dão o mesmo.
const SQL_FILA_FALHOU = `UPDATE SGC_EMAIL_FILA
SET STATUS = CASE WHEN TENTATIVAS + 1 >= ${MAX_TENTATIVAS} THEN 'falha' ELSE 'pendente' END,
  TENTATIVAS = TENTATIVAS + 1, ULTIMO_ERRO = '{{erro}}', LOTE = NULL, ATUALIZADO_EM = '{{agora}}'
WHERE ID = {{id}} AND STATUS = 'enviando'`;

/* ─────────────── preâmbulo das JAVASCRIPT ─────────────── */

// Regra da casa: nenhum `{{` literal aqui dentro (o runtime ligaria parâmetro).
const PRELUDIO = `const { runQueryMitra, executeServerFunctionMitra, sendEmailMitra } = require('mitra-sdk');
const SGC_IDS = ${MARCADOR_IDS};
const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId || 1);

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
// Chamada aninhada que FALHA volta com executionStatus 'FAILED' (D-15 da 005).
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
// Caractere de controle fora e teto — o parâmetro entre aspas é escapado pelo runtime.
function texto(valor, teto) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/[\\u0000-\\u001f]/g, ' ').slice(0, teto || 200);
}
function agora() { return new Date().toISOString().slice(0, 19); }
function dia() { return agora().slice(0, 10); }
function mensagemDe(erro) { return String((erro && erro.message) || erro || 'falha sem detalhe'); }`;

/* ─────────────── sgcEmailFilaProcessar (8780) ─────────────── */

// ponytail: o corpo reenviado é o de SGC_COMUNICACAO.CORPO, que o add-005 e o
// add-008 cortam em 20.000 caracteres; e-mail maior sairia cortado na nova
// tentativa. Se um dia passar disso, a fila ganha a própria coluna de corpo.
const JS_FILA_PROCESSAR = `${PRELUDIO}
const MAX_TENTATIVAS = ${MAX_TENTATIVAS};
const ERRO_PRESO = ${JSON.stringify(ERRO_PRESO)};
const COLUNAS = 'SELECT F.ID, F.ID_CARD, F.TENTATIVAS, CO.PARA, CO.CC, CO.ASSUNTO, CO.CORPO, CO.ENVIADO_POR'
  + ' FROM SGC_EMAIL_FILA F JOIN SGC_COMUNICACAO CO ON CO.ID = F.ID_COMUNICACAO';

const momento = agora();
const limite = new Date(Date.now() - ${PRESO_MINUTOS} * 60000).toISOString().slice(0, 19);
const resumo = { ok: true, reservados: 0, enviados: 0, tentativasFalhas: 0, falhasDefinitivas: 0, presos: 0, erros: [] };

// RNF-001 / C-008: fila vazia termina aqui, sem chamar SF nenhuma.
const contagem = (await consultar("SELECT COUNT(*) AS N FROM SGC_EMAIL_FILA WHERE STATUS = 'pendente'"
  + " OR (STATUS = 'enviando' AND ATUALIZADO_EM < '" + limite + "')"))[0];
if (!inteiro(contagem && contagem.N)) return resumo;

function destinatarios(item) {
  return [item.PARA, item.CC]
    .map(function (email) { return String(email || '').trim().toLowerCase(); })
    .filter(function (email, indice, lista) { return email.indexOf('@') > 0 && lista.indexOf(email) === indice; });
}

async function falhar(item, erro) {
  const motivo = texto(erro, 1900);
  await chamar('sgcEscEmailFilaFalhou', { id: inteiro(item.ID), erro: motivo, agora: agora() });
  if (inteiro(item.TENTATIVAS) + 1 < MAX_TENTATIVAS) { resumo.tentativasFalhas += 1; return; }
  resumo.falhasDefinitivas += 1;
  // P-03: histórico do pedido + aviso para quem enviou. Registro acessório:
  // falha aqui não derruba a rodada.
  // Aspas “ ” e não ": a nota vira JSON na lib, e a aspa reta escapada sai com
  // barra a mais em banco que não trata \\ como escape (o SQLite do simulador).
  const frase = 'O e-mail “' + texto(item.ASSUNTO, 200) + '” para ' + texto(item.PARA, 255) + ' não saiu após '
    + MAX_TENTATIVAS + ' tentativas. Último erro: ' + texto(motivo, 300) + ' Reenvie ao fornecedor.';
  try {
    await chamar('kbNotaRegistrar', { cardId: inteiro(item.ID_CARD), usuarioId: inteiro(item.ENVIADO_POR), texto: texto(frase, 1000) });
  } catch (e) { resumo.erros.push({ fila: inteiro(item.ID), erro: mensagemDe(e) }); }
  try {
    await chamar('sgcEscAvisoInserir', {
      idCard: inteiro(item.ID_CARD), tipo: 'email_falha', chave: 'email_falha:' + inteiro(item.ID_CARD) + ':' + inteiro(item.ID),
      paraUsuarioId: inteiro(item.ENVIADO_POR), paraPersona: '', texto: texto(frase, 500), criadoEm: agora(),
    });
  } catch (e) { resumo.erros.push({ fila: inteiro(item.ID), erro: mensagemDe(e) }); }
}

// C-006: o lote é da rodada; outra rodada ao mesmo tempo não vê estes itens.
const lote = 'L' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
await chamar('sgcEscEmailFilaReservar', { lote: lote, agora: momento });
const itens = await consultar(COLUNAS + " WHERE F.LOTE = '" + lote + "' AND F.STATUS = 'enviando' ORDER BY F.ID");
resumo.reservados = itens.length;

for (const item of itens) {
  try {
    const para = destinatarios(item);
    if (!para.length) throw new Error('Comunicação sem e-mail de destino.');
    // RN-002: o mesmo e-mail que o envio registrou, com a cópia de compras.
    await sendEmailMitra({ projectId, to: para, subject: String(item.ASSUNTO || ''), body: String(item.CORPO || '') });
  } catch (erro) {
    try { await falhar(item, mensagemDe(erro)); } catch (e) { resumo.erros.push({ fila: inteiro(item.ID), erro: mensagemDe(e) }); }
    continue;
  }
  try {
    await chamar('sgcEscEmailFilaEnviado', { id: inteiro(item.ID), agora: agora() });
    resumo.enviados += 1;
    await chamar('kbNotaRegistrar', {
      cardId: inteiro(item.ID_CARD), usuarioId: inteiro(item.ENVIADO_POR),
      texto: texto('O e-mail “' + texto(item.ASSUNTO, 200) + '” para ' + texto(item.PARA, 255) + ' saiu na '
        + (inteiro(item.TENTATIVAS) + 1) + 'ª tentativa.', 1000),
    });
  } catch (e) { resumo.erros.push({ fila: inteiro(item.ID), erro: mensagemDe(e) }); }
}

// C-007: preso de rodada anterior conta tentativa falha e só volta na próxima.
const presos = await consultar(COLUNAS + " WHERE F.STATUS = 'enviando' AND F.ATUALIZADO_EM < '" + limite + "' ORDER BY F.ID LIMIT 50");
for (const item of presos) {
  try { await falhar(item, ERRO_PRESO); resumo.presos += 1; } catch (e) { resumo.erros.push({ fila: inteiro(item.ID), erro: mensagemDe(e) }); }
}

return resumo;`;

/* ─────────────── sgcConclusaoProntosAvisar (8781) ─────────────── */

/**
 * As colunas pedidas de um bloco de pendência de backend/sql/, sem as demais
 * (as `_MOTIVO` formatam texto que a rotina não usa). RNF-002: é o MESMO
 * texto que o add-005 cola no contextoDoCard() do sgcPodeMover.
 */
function colunas(arquivo, ...aliases) {
  return fragmento(arquivo).split(/\n(?=COALESCE\()/)
    .map((coluna) => coluna.trim().replace(/,$/, ''))
    .filter((coluna) => aliases.some((alias) => coluna.endsWith(`AS ${alias}`)))
    .join(',\n    ');
}

// RN-005 / P-05 / P-06: Faturamento ou B.O., ≥ 1 nota e as três travas da
// conclusão zeradas; P-07: o aviso de hoje já dado sai na própria consulta.
export const SQL_PRONTOS = `SELECT T.* FROM (
  SELECT C.ID AS ID_CARD, F.CHAVE AS FASE, COALESCE(P.FORNECEDOR, '') AS FORNECEDOR,
    COALESCE(P.NUMPED_WINTHOR, '') AS NUMPED, COALESCE(P.VL_TOTAL, 0) AS VL_TOTAL,
    COALESCE(P.VL_FATURADO, 0) AS VL_FATURADO,
    COALESCE((SELECT SUM(B.QT_PENDENTE * COALESCE(I.PRECO_CUSTO, 0))
              FROM SGC_BO_ITEM B
              JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = B.ID_CARD AND I.CODPROD = B.CODPROD AND I.STATUS <> 'removido'
              WHERE B.ID_CARD = C.ID AND B.STATUS = 'cancelado'), 0) AS VL_BO_CANCELADO,
    (SELECT COUNT(*) FROM SGC_NF N WHERE N.ID_CARD = C.ID) AS QT_NFS,
    ${colunas('pendencias-conclusao-nf.sql', 'PENDENCIAS_NF')},
    ${colunas('pendencias-conclusao-bo.sql', 'PENDENCIAS_BO_ABERTOS')},
    ${colunas('pendencias-conclusao-faturado.sql', 'PENDENCIAS_FATURADO')}
  FROM KB_CARD C
  JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
  JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
  WHERE C.EXCLUIDO_EM IS NULL AND F.CHAVE IN ('faturamento', 'bo')
) T
WHERE T.QT_NFS > 0 AND T.PENDENCIAS_NF = 0 AND T.PENDENCIAS_BO_ABERTOS = 0 AND T.PENDENCIAS_FATURADO = 0
  AND NOT EXISTS (SELECT 1 FROM SGC_AVISO A WHERE A.CHAVE = CONCAT('pronto_conclusao:', T.ID_CARD, ':', '__HOJE__'))
ORDER BY T.ID_CARD
LIMIT 200`;

const JS_PRONTOS_AVISAR = `${PRELUDIO}
const SQL_PRONTOS = ${JSON.stringify(SQL_PRONTOS)};
// O smoke passa o dia; fora dele vale o relógio. Validado: entra no SQL por texto.
const hoje = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(event.hoje || '')) ? String(event.hoje) : dia();

function pct(pedido) {
  const total = numero(pedido.VL_TOTAL);
  if (total <= 0) return '100,0';
  return ((numero(pedido.VL_FATURADO) + numero(pedido.VL_BO_CANCELADO)) * 100 / total).toFixed(1).replace('.', ',');
}

const prontos = await consultar(SQL_PRONTOS.split('__HOJE__').join(hoje));
const erros = [];
let avisados = 0;
for (const pedido of prontos) {
  const cardId = inteiro(pedido.ID_CARD);
  const notas = inteiro(pedido.QT_NFS);
  const frase = 'Pedido de ' + (String(pedido.FORNECEDOR || '') || 'fornecedor')
    + (pedido.NUMPED ? ' (pedido ' + pedido.NUMPED + ')' : '') + ' pronto para concluir: '
    + notas + (notas === 1 ? ' nota' : ' notas') + ', ' + pct(pedido) + ' % do valor coberto, sem conferência nem B.O. pendente.'
    + ' Confira e mova o card para Compras Concluídas.';
  try {
    // P-08: PARA_USUARIO_ID 0 sem persona = os responsáveis do card no sino. O card não se move (RN-006).
    await chamar('sgcEscAvisoInserir', {
      idCard: cardId, tipo: 'pronto_conclusao', chave: 'pronto_conclusao:' + cardId + ':' + hoje,
      paraUsuarioId: 0, paraPersona: '', texto: texto(frase, 500), criadoEm: agora(),
    });
    avisados += 1;
  } catch (erro) {
    erros.push({ card: cardId, erro: mensagemDe(erro) });
  }
}

return { ok: true, hoje: hoje, prontos: prontos.length, avisados: avisados, erros: erros };`;

/* ─────────────── a lista publicada ─────────────── */

const ESCRITAS = [
  ['sgcEscEmailFilaInserir', SQL_FILA_INSERIR, 'RF-001/RN-003 (C-002, C-003, C-009) - poe na fila de nova tentativa a comunicacao por e-mail que nao saiu no clique (TENTATIVAS 1). Chamada por id pelo sgcEnvioIndustriaRegistrar e pelo sgcCobrancaEnviar; guardada pela persona de quem gravou a comunicacao. Params: idComunicacao int, erro, agora'],
  ['sgcEscEmailFilaReservar', SQL_FILA_RESERVAR, 'RN-004 (C-006) - reserva os 20 pendentes mais antigos para a rodada (pendente -> enviando). Sem guarda de persona: o cron nao tem sessao (R-023). Params: lote, agora'],
  ['sgcEscEmailFilaEnviado', SQL_FILA_ENVIADO, 'RF-003 (C-004) - marca enviado o item da rodada. Sem guarda de persona (cron). Params: id int, agora'],
  ['sgcEscEmailFilaFalhou', SQL_FILA_FALHOU, `RF-003/RN-001 (C-005, C-007) - conta a tentativa falha: volta a pendente ou, na ${MAX_TENTATIVAS}a, falha. Sem guarda de persona (cron). Params: id int, erro, agora`],
];

const JAVASCRIPT = [
  ['sgcEmailFilaProcessar', JS_FILA_PROCESSAR, '0 */5 * * * *', 'RF-003 a RF-005 (C-004..C-008) - rodada de 5 min da fila de e-mail: lote de 20, ate 3 tentativas, preso ha 30 min conta falha; falha definitiva vira nota e aviso para quem enviou. Fila vazia nao chama SF. Sem parametros'],
  ['sgcConclusaoProntosAvisar', JS_PRONTOS_AVISAR, '0 10 11 * * *', 'RF-006 (C-010..C-016) - 08h10: avisa os responsaveis de cada pedido em Faturamento ou B.O. que passa na trava de conclusao, com nota; um por dia; nao move o card. Params: hoje (opcional, AAAA-MM-DD)'],
];

/** Materializa `definitions` com o mapa nome -> id injetado nos corpos JAVASCRIPT. */
export function montarDefinitions(ids) {
  return [
    ...ESCRITAS.map(([name, code, description]) => ({ name, type: 'SQL', description, code })),
    ...JAVASCRIPT.map(([name, code, cronExpression, description]) => ({
      name, type: 'JAVASCRIPT', description, cronExpression, code: code.split(MARCADOR_IDS).join(JSON.stringify(ids)),
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

  // Ids reais por NOME (R-016), nunca hardcoded.
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
      };
      const id = mapa.get(definicao.name);
      if (id) await sdk.updateServerFunctionMitra({ ...corpo, serverFunctionId: id });
      else await sdk.createServerFunctionMitra(corpo);
      console.log(`${id ? 'atualizada' : 'criada'}: ${definicao.name}`);
    }
  }

  // Primeiro as SQL; só então as JAVASCRIPT, com os ids REAIS por nome — as
  // rotinas chamam sgcEscAvisoInserir (add-008) e kbNotaRegistrar (lib).
  await publicar(definitions.filter((d) => d.type !== 'JAVASCRIPT'));
  const reais = Object.fromEntries(await existentes());
  if (!reais.sgcEscAvisoInserir) throw new Error('sgcEscAvisoInserir ausente: publique add-008-notas-fiscais.mjs antes do add-018.');
  await publicar(montarDefinitions({ ...idsDoMapa(MAPA), ...reais }).filter((d) => d.type === 'JAVASCRIPT'));

  console.log(`Pronto: ${definitions.length} server functions da spec 016.`);
  console.log('Agora rode de novo add-005-quadro-compras.mjs e add-008-notas-fiscais.mjs (injetam o id real da sgcEscEmailFilaInserir) e `node sync-server-function-map.mjs`.');
}
