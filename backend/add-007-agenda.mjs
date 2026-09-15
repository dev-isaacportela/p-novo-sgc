// add-007 — Server Functions da spec 004 (agenda de análises): agendamento
// recorrente que gera pedido de compra. Ver
// docs/specs/004-agenda-de-analises/{spec,plan,tasks}.md.
//
// Faixa de id local: 74xx — leituras e JAVASCRIPT a partir de 7401
// (sgcAgendaListar, sgcAgendaListarTotal, sgcAgendaCarregar, sgcAgendaProcessar
// — cron `0 */30 * * * *` — e sgcAgendaProcessarManual), escritas a partir de
// 7450 (sgcEscAgendaInserir…), até 7458 (sgcEscAgendaEnvio). O id local vem de
// SERVER_FUNCTIONS em frontend/src/lib/server-functions.ts até o
// sync-server-function-map.mjs trazer os reais do sandbox — mesmo padrão de
// add-001-kanban.mjs.
//
// sgcAgendaProcessar e sgcAgendaProcessarManual chamam kbCardCriar (lib) e
// sgcEscPedidoCapaInserir/sgcEscAgendaProcessada/sgcEscAgendaProximaInserir/
// sgcEscAgendaParticipanteCopiar por id, sem `:VAR_USER` (R-010/R-013 do 000):
// no módulo (para o simulador) os ids vêm do mapa local, por
// `backend/ids-do-mapa.mjs`; na publicação real (isEntrypoint) são resolvidos
// por NOME via `listServerFunctionsMitra` (R-016) — nunca hardcoded.
//
// NAO EXECUTE DA MAQUINA LOCAL sem decisao explicita do usuario.
// Uso (no sandbox): cd backend && node add-007-agenda.mjs

import 'dotenv/config';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { idsDoMapa } from './ids-do-mapa.mjs';

const MAPA = fileURLToPath(new URL('../frontend/src/lib/server-functions.ts', import.meta.url));

// As duas JAVASCRIPT desta spec (o cron e o manual) chamam só estas cinco
// escritas por id — kbCardCriar da lib, sgcEscPedidoCapaInserir da 002, e três
// internas desta spec. Nada além disso precisa estar no mapa embutido no corpo.
const NOMES_INTERNOS = [
  'kbCardCriar',
  'sgcEscPedidoCapaInserir',
  'sgcEscAgendaProcessada',
  'sgcEscAgendaProximaInserir',
  'sgcEscAgendaParticipanteCopiar',
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
 * `quem` é `:VAR_USER` nas escritas chamadas direto da tela (sessão de
 * verdade) e `{{usuarioId}}` nas quatro escritas internas (A1 da revisão):
 * cron e chamada aninhada não carregam `:VAR_USER` (runtime.mjs, R-013), então
 * cada uma recebe explícito quem está processando — o cron passa o
 * CRIADO_POR da própria agenda, sgcEnvioIndustriaRegistrar (002) passa quem
 * está logado — e a guarda confere a persona dessa pessoa, não de ninguém.
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
const PERSONAS_AGENDA = "'admin','analista','gestor'";

/* ─────────────── leituras (SQL) ─────────────── */

const COLUNAS_AGENDA = `A.ID, A.CODFORNEC, A.FORNECEDOR, A.CODFILIAL, A.FILIAL, A.DATA_ANALISE,
  A.PERIODO_INICIO, A.PERIODO_FIM, A.RECORRENCIA, A.DATA_LIMITE_RECORRENCIA, A.OBSERVACAO, A.ATIVO,
  A.PROCESSADO_EM, A.ID_CARD_GERADO, A.DATA_ENVIO_REAL, A.DATA_PLANEJADA_ORIGINAL, A.CANCELADO_EM,
  A.CRIADO_POR, A.CRIADO_EM, CU.NOME AS CRIADOR_NOME,
  GROUP_CONCAT(P.USUARIO_ID ORDER BY P.ID SEPARATOR ',') AS PARTICIPANTES_IDS,
  GROUP_CONCAT(PU.NOME ORDER BY P.ID SEPARATOR ', ') AS PARTICIPANTES_NOMES`;

const JUNCOES_AGENDA = `FROM SGC_AGENDA A
  LEFT JOIN INT_USER CU ON CU.ID = A.CRIADO_POR
  LEFT JOIN SGC_AGENDA_PARTICIPANTE P ON P.ID_AGENDA = A.ID
  LEFT JOIN INT_USER PU ON PU.ID = P.USUARIO_ID`;

// A situação é derivada (RN-005), nunca coluna. `hoje` vem da TELA
// (hojeIso() do navegador) — o servidor decide o dia dele em Brasília só
// dentro do cron/manual (R-10 do plan, ver ROTINA abaixo).
const FILTRO_SITUACAO = `('{{situacao}}' = '' OR '{{situacao}}' = CASE
      WHEN A.ATIVO = FALSE THEN 'cancelado'
      WHEN A.PROCESSADO_EM IS NOT NULL THEN 'processado'
      WHEN A.DATA_ANALISE < '{{hoje}}' THEN 'atrasado'
      ELSE 'pendente' END)`;

const FILTROS_LISTA = `({{codfornec}} = 0 OR A.CODFORNEC = {{codfornec}})
  AND ('{{codfilial}}' = '' OR A.CODFILIAL = '{{codfilial}}')
  AND ('{{dataInicio}}' = '' OR A.DATA_ANALISE >= '{{dataInicio}}')
  AND ('{{dataFim}}' = '' OR A.DATA_ANALISE <= '{{dataFim}}')
  AND ${FILTRO_SITUACAO}`;

/* ─────────────── ROTINA (JS) compartilhada do cron e do manual ───────────────
 *
 * Mesmo texto nas duas SFs (cada uma roda isolada na plataforma e carrega a
 * própria cópia — como o motor faz com motor.mjs, plan.md §sgcAgendaProcessar).
 * O cálculo de data é o MESMO de frontend/src/lib/agenda.ts, reescrito em
 * texto puro porque a SF não importa nada do frontend — espelho declarado,
 * testado dos dois lados com os mesmos números (C-004/C-005 na tela, C-006 no
 * smoke).
 */

const PREAMBULO_JS = `
const { runQueryMitra, executeServerFunctionMitra } = require('mitra-sdk');
const IDS = ${MARCADOR_IDS};
const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId || 1);

function linhasDe(resposta) {
  const saida = (resposta && resposta.result) || resposta;
  return (saida && saida.rows) || [];
}
async function query(sql) { return linhasDe(await runQueryMitra({ projectId, sql })); }
async function escrever(id, params) {
  if (!id) throw new Error('Escrita não publicada no mapa.');
  const resposta = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input: params || {} });
  const resultado = (resposta && resposta.result) || resposta;
  if (resultado && resultado.executionStatus === 'FAILED') throw new Error(resultado.error || 'Falha na escrita.');
  return resultado && resultado.output;
}
function inteiro(v) { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function agora() { return new Date().toISOString().slice(0, 19); }
`;

const ROTINA = `
var FUSO_MINUTOS = -180;
// Dia em Brasília, não o dia UTC do relógio universal (RN-013).
function diaNoFuso(instanteMs) { return new Date(instanteMs + FUSO_MINUTOS * 60000).toISOString().slice(0, 10); }

function somarDias(iso, dias) {
  var p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10);
}
function diasNoMes(ano, mes) { return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); }
// Mesmo dia do mês seguinte, cortado no último dia quando ele não existe (RN-001).
function proximoMes(iso) {
  var p = iso.split('-').map(Number);
  var mesAlvo = p[1] === 12 ? 1 : p[1] + 1;
  var anoAlvo = p[1] === 12 ? p[0] + 1 : p[0];
  var dia = Math.min(p[2], diasNoMes(anoAlvo, mesAlvo));
  return anoAlvo + '-' + String(mesAlvo).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
}
function proximaOcorrencia(dataIso, recorrencia, limiteIso) {
  var proxima;
  if (recorrencia === 'semanal') proxima = somarDias(dataIso, 7);
  else if (recorrencia === 'quinzenal') proxima = somarDias(dataIso, 14);
  else if (recorrencia === 'mensal') proxima = proximoMes(dataIso);
  else return null;
  if (limiteIso && proxima > limiteIso) return null;
  return proxima;
}
function diasEntre(aIso, bIso) {
  var a = aIso.split('-').map(Number); var b = bIso.split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}
// Mesma duração, fim na data nova (RN-008).
function periodoDaOcorrencia(inicioAtual, fimAtual, novaDataIso) {
  var duracao = diasEntre(inicioAtual, fimAtual);
  return { inicio: somarDias(novaDataIso, -duracao), fim: novaDataIso };
}
// RN-014/RN-018 do 000: mesma forma do tituloDoPedido da 002, em maiúsculas.
function tituloDoPedido(filial, fornecedor) { return String(filial).toUpperCase() + ' · ' + String(fornecedor).toUpperCase(); }

async function boardCompras() {
  var linhas = await query("SELECT ID FROM KB_BOARD WHERE SLUG = 'compras' LIMIT 1");
  return linhas[0] ? inteiro(linhas[0].ID) : 0;
}

// Um agendamento: card (kbCardCriar) -> capa (sgcEscPedidoCapaInserir) ->
// marcação (sgcEscAgendaProcessada) -> [próxima ocorrência] -> [participantes
// copiados]. RNF-001: 3 escritas no caso simples, 4 com recorrência, 5 com
// recorrência e participantes.
async function processarAgendamento(linha, boardId, quando) {
  var titulo = tituloDoPedido(linha.FILIAL, linha.FORNECEDOR);
  var criado = await escrever(IDS.kbCardCriar, {
    boardId: boardId,
    titulo: titulo,
    valoresJson: JSON.stringify({ fornecedor: linha.FORNECEDOR, filial: linha.FILIAL, prioridade: 'normal' }),
    responsaveisIds: String(inteiro(linha.CRIADO_POR)),
    prazo: '',
    criadoPor: inteiro(linha.CRIADO_POR),
    origem: 'sistema',
  });
  if (!criado || criado.ok !== true) throw new Error((criado && criado.error) || 'kbCardCriar recusou.');
  var cardId = inteiro(criado.id);

  await escrever(IDS.sgcEscPedidoCapaInserir, {
    usuarioId: inteiro(linha.CRIADO_POR),
    cardId: cardId,
    codfornec: inteiro(linha.CODFORNEC),
    fornecedor: linha.FORNECEDOR,
    codfilial: linha.CODFILIAL,
    filial: linha.FILIAL,
    periodoInicio: linha.PERIODO_INICIO,
    periodoFim: linha.PERIODO_FIM,
    origem: 'agenda',
    idAgenda: inteiro(linha.ID),
    agora: quando,
  });

  // A1 da revisão: as quatro escritas internas conferem persona por
  // {{usuarioId}} (nenhuma sessão chega aqui, ver runtime.mjs) — quem
  // agendou tinha uma das personas aceitas quando gravou, então o cron
  // repassa o CRIADO_POR da própria agenda como "quem está processando".
  var quemProcessa = inteiro(linha.CRIADO_POR);
  await escrever(IDS.sgcEscAgendaProcessada, { id: inteiro(linha.ID), idCard: cardId, processadoEm: quando, usuarioId: quemProcessa });

  var proxima = proximaOcorrencia(linha.DATA_ANALISE, linha.RECORRENCIA, linha.DATA_LIMITE_RECORRENCIA);
  if (proxima) {
    var periodo = periodoDaOcorrencia(linha.PERIODO_INICIO, linha.PERIODO_FIM, proxima);
    await escrever(IDS.sgcEscAgendaProximaInserir, {
      codfornec: inteiro(linha.CODFORNEC),
      fornecedor: linha.FORNECEDOR,
      codfilial: linha.CODFILIAL,
      filial: linha.FILIAL,
      dataAnalise: proxima,
      periodoInicio: periodo.inicio,
      periodoFim: periodo.fim,
      recorrencia: linha.RECORRENCIA,
      dataLimiteRecorrencia: linha.DATA_LIMITE_RECORRENCIA || '',
      observacao: linha.OBSERVACAO || '',
      criadoPor: quemProcessa,
      criadoEm: quando,
      usuarioId: quemProcessa,
    });
    if (inteiro(linha.QT_PARTICIPANTES) > 0) {
      var nova = await query(
        "SELECT ID FROM SGC_AGENDA WHERE CRIADO_POR = " + quemProcessa + " AND CRIADO_EM = '" + quando + "' ORDER BY ID DESC LIMIT 1"
      );
      if (nova[0]) {
        await escrever(IDS.sgcEscAgendaParticipanteCopiar, {
          idOrigem: inteiro(linha.ID), idNova: inteiro(nova[0].ID), criadoEm: quando, usuarioId: quemProcessa,
        });
      }
    }
  }
  return { idCard: cardId, proxima: proxima || null };
}

// RNF-002 (lote de 30) + RN-007 (dupla trava de idempotência: PROCESSADO_EM
// IS NULL no WHERE do lote e NOT EXISTS em SGC_PEDIDO, porque se o card nasceu
// e a marcação falhou a rodada seguinte não pode duplicar). RNF-004: erro de
// um agendamento não derruba os outros.
async function processarLote(where) {
  var boardId = await boardCompras();
  var lote = await query(
    "SELECT A.*, (SELECT COUNT(*) FROM SGC_AGENDA_PARTICIPANTE P WHERE P.ID_AGENDA = A.ID) AS QT_PARTICIPANTES " +
    "FROM SGC_AGENDA A WHERE A.ATIVO = TRUE AND A.PROCESSADO_EM IS NULL AND A.DATA_ANALISE <> '' AND (" + where + ") " +
    "AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO PD WHERE PD.ID_AGENDA = A.ID) " +
    "ORDER BY A.DATA_ANALISE, A.ID LIMIT 30"
  );
  var processados = 0; var resultados = []; var erros = [];
  for (var i = 0; i < lote.length; i += 1) {
    var linha = lote[i];
    try {
      var resultado = await processarAgendamento(linha, boardId, agora());
      processados += 1;
      resultados.push({ idAgenda: inteiro(linha.ID), idCard: resultado.idCard, proxima: resultado.proxima });
    } catch (erro) {
      erros.push({ idAgenda: inteiro(linha.ID), erro: (erro && erro.message) || String(erro) });
    }
  }
  return { ok: true, tentados: lote.length, processados: processados, resultados: resultados, erros: erros };
}
`;

// RF-006/RNF-002/RNF-006/RN-013: dia em Brasília, só o vencido, sem sessão.
const CORPO_PROCESSAR = `
var hoje = diaNoFuso(Date.now());
var resultado = await processarLote("A.DATA_ANALISE <= '" + hoje + "'");
resultado.hoje = hoje;
return resultado;
`;

// RF-011/RF-012/RF-019/C-012: persona ANTES de tudo, depois um dos quatro
// recortes (D-007: inclusive data futura no recorte "agendamento").
const CORPO_MANUAL = `
var quem = await query(
  "SELECT COALESCE(UP.PERSONA, CASE COALESCE(IU.ACCESS_LEVEL, 'MEMBER') WHEN 'ADMIN' THEN 'admin' WHEN 'RESTRICTED' THEN 'comercial' ELSE 'analista' END) AS PERSONA, " +
  "COALESCE(IU.ACCESS_LEVEL, 'MEMBER') AS ACESSO FROM INT_USER IU LEFT JOIN SGC_USUARIO_PERSONA UP ON UP.USUARIO_ID = IU.ID WHERE IU.ID = :VAR_USER"
);
var pessoa = quem[0];
var personasQuePodem = ['admin', 'analista', 'gestor'];
if (!pessoa || pessoa.ACESSO === 'READ_ONLY' || personasQuePodem.indexOf(pessoa.PERSONA) === -1) {
  return { ok: false, error: 'Seu perfil não processa a agenda.' };
}

var hoje = diaNoFuso(Date.now());
var modo = String(event.modo || 'mes');
var where; var filtros = {};

if (modo === 'agendamento') {
  where = 'A.ID = ' + inteiro(event.idAgenda);
  filtros = { modo: modo, idAgenda: inteiro(event.idAgenda) };
} else if (modo === 'intervalo') {
  var di = String(event.dataInicio || ''); var df = String(event.dataFim || '');
  if (!di || !df || di > df) return { ok: false, error: 'Informe um intervalo válido: o início não pode ser depois do fim.' };
  where = "A.DATA_ANALISE BETWEEN '" + di + "' AND '" + df + "'";
  filtros = { modo: modo, dataInicio: di, dataFim: df };
} else if (modo === 'dias') {
  var dias = inteiro(event.dias) || 1;
  var fimDias = somarDias(hoje, dias - 1);
  where = "A.DATA_ANALISE BETWEEN '" + hoje + "' AND '" + fimDias + "'";
  filtros = { modo: modo, dataInicio: hoje, dataFim: fimDias };
} else {
  // RF-012: sem escolha (ou recorte desconhecido), o padrão é o mês vigente — nunca a base inteira.
  modo = 'mes';
  var p = hoje.split('-').map(Number);
  var inicioMes = p[0] + '-' + String(p[1]).padStart(2, '0') + '-01';
  var fimMes = p[0] + '-' + String(p[1]).padStart(2, '0') + '-' + String(diasNoMes(p[0], p[1])).padStart(2, '0');
  where = "A.DATA_ANALISE BETWEEN '" + inicioMes + "' AND '" + fimMes + "'";
  filtros = { modo: modo, dataInicio: inicioMes, dataFim: fimMes };
}

var resultado = await processarLote(where);
resultado.hoje = hoje;
resultado.filtros = filtros;
return resultado;
`;

/* ─────────────── definições publicadas ───────────────
 *
 * `BASE` guarda o código CRU, com o marcador __SGC_IDS__ ainda intacto — é
 * dele que tanto `definitions` (ids locais, para o simulador) quanto a
 * publicação real (ids resolvidos por nome, abaixo) derivam, cada um com o
 * seu próprio mapa. Reinjetar em cima de `definitions` não funcionaria: o
 * marcador já teria sumido depois da primeira substituição.
 */

const BASE = [
  /* ── leituras ── */
  {
    name: 'sgcAgendaListar',
    type: 'SQL',
    description: 'RF-014/RF-015 - lista paginada, filtros fornecedor/filial/período/situação (derivada); participantes por GROUP_CONCAT, sem 2ª chamada por linha.',
    code: `SELECT ${COLUNAS_AGENDA}
${JUNCOES_AGENDA}
WHERE ${FILTROS_LISTA}
GROUP BY A.ID
ORDER BY A.DATA_ANALISE, A.ID
LIMIT {{limite}} OFFSET {{offset}}`,
  },
  {
    name: 'sgcAgendaListarTotal',
    type: 'SQL',
    description: 'RF-015 - total da mesma listagem, para a paginação.',
    code: `SELECT COUNT(*) AS TOTAL FROM SGC_AGENDA A WHERE ${FILTROS_LISTA}`,
  },
  {
    name: 'sgcAgendaCarregar',
    type: 'SQL',
    description: 'RF-001 - reabrir um agendamento para editar, mesmas colunas do listar.',
    code: `SELECT ${COLUNAS_AGENDA}
${JUNCOES_AGENDA}
WHERE A.ID = {{id}}
GROUP BY A.ID`,
  },
  {
    name: 'sgcAgendaProcessar',
    type: 'JAVASCRIPT',
    cronExpression: '0 */30 * * * *',
    description: 'RF-006 a RF-010/RNF-002/RNF-003/RNF-004/RNF-006/RN-013 - verificação automática dos agendamentos vencidos, lote de 30, sem sessão. Sem parâmetros.',
    code: PREAMBULO_JS + ROTINA + CORPO_PROCESSAR,
  },
  {
    name: 'sgcAgendaProcessarManual',
    type: 'JAVASCRIPT',
    description: 'RF-011/RF-012/RF-019 - processamento manual por um dos quatro recortes (mes|intervalo|dias|agendamento); confere a persona por runQueryMitra com :VAR_USER antes de tudo. Params: modo, dataInicio, dataFim, dias, idAgenda.',
    code: PREAMBULO_JS + ROTINA + CORPO_MANUAL,
  },

  /* ── escritas da tela, guardadas por :VAR_USER + persona ── */
  {
    name: 'sgcEscAgendaInserir',
    type: 'SQL',
    description: 'RF-001/RF-017/RN-015 - novo agendamento; exige fornecedor ativo e persona admin/analista/gestor.',
    code: `INSERT INTO SGC_AGENDA (CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM, RECORRENCIA, DATA_LIMITE_RECORRENCIA, OBSERVACAO, ATIVO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}', '{{dataAnalise}}', '{{periodoInicio}}', '{{periodoFim}}', '{{recorrencia}}', NULLIF('{{dataLimiteRecorrencia}}', ''), NULLIF('{{observacao}}', ''), TRUE, :VAR_USER, '{{criadoEm}}', '{{criadoEm}}'
FROM DUAL
WHERE EXISTS (SELECT 1 FROM SGC_FORNECEDOR F WHERE F.CODFORNEC = {{codfornec}} AND F.ATIVO = TRUE)
  ${guardaPersona(':VAR_USER', PERSONAS_AGENDA)}`,
  },
  {
    name: 'sgcEscAgendaAtualizar',
    type: 'SQL',
    description: 'RF-001/RF-017 - edita um agendamento ainda não processado; sem checar fornecedor ativo (RN-015: o já agendado segue editável mesmo se o fornecedor foi inativado depois).',
    code: `UPDATE SGC_AGENDA SET
  CODFORNEC = {{codfornec}}, FORNECEDOR = '{{fornecedor}}', CODFILIAL = '{{codfilial}}', FILIAL = '{{filial}}',
  DATA_ANALISE = '{{dataAnalise}}', PERIODO_INICIO = '{{periodoInicio}}', PERIODO_FIM = '{{periodoFim}}',
  RECORRENCIA = '{{recorrencia}}', DATA_LIMITE_RECORRENCIA = NULLIF('{{dataLimiteRecorrencia}}', ''),
  OBSERVACAO = NULLIF('{{observacao}}', ''), ATUALIZADO_EM = '{{atualizadoEm}}'
WHERE ID = {{id}} AND PROCESSADO_EM IS NULL AND ATIVO = TRUE
  ${guardaPersona(':VAR_USER', PERSONAS_AGENDA)}`,
  },
  {
    name: 'sgcEscAgendaCancelar',
    type: 'SQL',
    description: 'RF-013/RF-017/RN-004 - marca cancelado (nunca apaga); só não processado e ainda ativo; persona admin/gestor/diretoria.',
    code: `UPDATE SGC_AGENDA SET ATIVO = FALSE, CANCELADO_EM = '{{canceladoEm}}', CANCELADO_POR = :VAR_USER, ATUALIZADO_EM = '{{canceladoEm}}'
WHERE ID = {{id}} AND PROCESSADO_EM IS NULL AND ATIVO = TRUE
  ${guardaPersona(':VAR_USER', "'admin','gestor','diretoria'")}`,
  },
  {
    name: 'sgcEscAgendaParticipanteLimpar',
    type: 'SQL',
    description: 'RF-005/RN-010 - limpa os participantes de um agendamento ainda não processado, antes de regravar a lista inteira.',
    code: `DELETE FROM SGC_AGENDA_PARTICIPANTE
WHERE ID_AGENDA = {{idAgenda}}
  AND EXISTS (SELECT 1 FROM SGC_AGENDA A WHERE A.ID = {{idAgenda}} AND A.PROCESSADO_EM IS NULL AND A.ATIVO = TRUE)
  ${guardaPersona(':VAR_USER', PERSONAS_AGENDA)}`,
  },
  {
    name: 'sgcEscAgendaParticipanteInserir',
    type: 'SQL',
    description: 'RF-005 - insere um participante (uma instrução por pessoa, chamada em lote pela tela depois do limpar).',
    code: `INSERT INTO SGC_AGENDA_PARTICIPANTE (ID_AGENDA, USUARIO_ID, CRIADO_EM)
SELECT {{idAgenda}}, {{usuarioId}}, '{{criadoEm}}'
FROM DUAL
WHERE EXISTS (SELECT 1 FROM SGC_AGENDA A WHERE A.ID = {{idAgenda}} AND A.PROCESSADO_EM IS NULL AND A.ATIVO = TRUE)
  ${guardaPersona(':VAR_USER', PERSONAS_AGENDA)}`,
  },

  /* ── escritas internas (sem sessão), chamadas por id do cron/manual —
   * guardadas por {{usuarioId}} explícito (A1 da revisão), não :VAR_USER:
   * nenhuma sessão chega até aqui (runtime.mjs força userId=0 em chamada
   * aninhada), então sem a guarda o perfil business — que libera todas as
   * SFs — deixava qualquer usuário (inclusive comercial) chamá-las direto. ── */
  {
    name: 'sgcEscAgendaProcessada',
    type: 'SQL',
    description: 'RF-008/RF-010/RN-007 - marca o agendamento como processado; AND PROCESSADO_EM IS NULL é a primeira trava de idempotência. Persona de {{usuarioId}} (quem processa), não :VAR_USER.',
    code: `UPDATE SGC_AGENDA SET PROCESSADO_EM = '{{processadoEm}}', ID_CARD_GERADO = {{idCard}}, ATUALIZADO_EM = '{{processadoEm}}'
WHERE ID = {{id}} AND PROCESSADO_EM IS NULL
  ${guardaPersona('{{usuarioId}}', PERSONAS_AGENDA)}`,
  },
  {
    name: 'sgcEscAgendaProximaInserir',
    type: 'SQL',
    description: 'RF-009 - cria a ocorrência seguinte da recorrência, com o período já recalculado (RN-008). Persona de {{usuarioId}}.',
    code: `INSERT INTO SGC_AGENDA (CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM, RECORRENCIA, DATA_LIMITE_RECORRENCIA, OBSERVACAO, ATIVO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT {{codfornec}}, '{{fornecedor}}', '{{codfilial}}', '{{filial}}', '{{dataAnalise}}', '{{periodoInicio}}', '{{periodoFim}}', '{{recorrencia}}', NULLIF('{{dataLimiteRecorrencia}}', ''), NULLIF('{{observacao}}', ''), TRUE, {{criadoPor}}, '{{criadoEm}}', '{{criadoEm}}'
FROM DUAL
WHERE 1 = 1
  ${guardaPersona('{{usuarioId}}', PERSONAS_AGENDA)}`,
  },
  {
    name: 'sgcEscAgendaParticipanteCopiar',
    type: 'SQL',
    description: 'RF-009/C-017 - copia os participantes do agendamento de origem para a ocorrência seguinte, numa instrução. Persona de {{usuarioId}}.',
    code: `INSERT INTO SGC_AGENDA_PARTICIPANTE (ID_AGENDA, USUARIO_ID, CRIADO_EM)
SELECT {{idNova}}, USUARIO_ID, '{{criadoEm}}' FROM SGC_AGENDA_PARTICIPANTE WHERE ID_AGENDA = {{idOrigem}}
  ${guardaPersona('{{usuarioId}}', PERSONAS_AGENDA)}`,
  },
  {
    name: 'sgcEscAgendaEnvio',
    type: 'SQL',
    description: 'RF-016/RN-012 - o envio do pedido (spec 002, sgcEnvioIndustriaRegistrar) sincroniza a agenda: grava a data real, guarda a planejada original só na primeira vez que ela difere, e a data da análise passa a ser a real. Persona de {{usuarioId}} (quem registrou o envio), mesma lista.',
    code: `UPDATE SGC_AGENDA SET
  DATA_PLANEJADA_ORIGINAL = CASE WHEN DATA_PLANEJADA_ORIGINAL IS NULL AND DATA_ANALISE <> '{{dtEnvio}}' THEN DATA_ANALISE ELSE DATA_PLANEJADA_ORIGINAL END,
  DATA_ENVIO_REAL = '{{dtEnvio}}',
  DATA_ANALISE = '{{dtEnvio}}'
WHERE ID_CARD_GERADO = {{idCard}}
  ${guardaPersona('{{usuarioId}}', PERSONAS_AGENDA)}`,
  },
];

// Para o simulador (e para quem só importa `definitions`): ids LOCAIS, do
// mapa deste projeto — o mesmo padrão de add-001-kanban.mjs.
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

  // R-016 do 000: na publicação real, os ids das SFs chamadas por id vêm por
  // NOME (nunca hardcoded) — diferente do módulo acima, que embute os ids
  // LOCAIS só para o simulador. kbCardCriar (add-001) e sgcEscPedidoCapaInserir
  // (add-005, da 002) precisam já estar publicados.
  const idsReais = {};
  for (const nome of NOMES_INTERNOS) {
    const achado = porNome.get(nome);
    if (!achado) throw new Error(`Escrita não publicada: ${nome}. Publique add-001-kanban.mjs e add-005-quadro-compras.mjs antes do add-007.`);
    idsReais[nome] = functionId(achado);
  }

  async function publicar(definicao) {
    // BASE ainda tem o marcador intacto (definitions, acima, já o consumiu
    // com os ids locais) — aqui reinjeta com os ids REAIS da plataforma.
    const code = definicao.type === 'JAVASCRIPT' ? injetarIds(definicao.code, idsReais) : definicao.code;
    const extras = definicao.cronExpression ? { cronExpression: definicao.cronExpression } : {};
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

  const ids = {};
  for (const definicao of BASE) ids[definicao.name] = await publicar(definicao);
  console.log(`Pronto: ${Object.keys(ids).length} server functions da agenda publicadas.`);
  console.log('Rode `node sync-server-function-map.mjs` para levar os ids ao frontend.');
}
