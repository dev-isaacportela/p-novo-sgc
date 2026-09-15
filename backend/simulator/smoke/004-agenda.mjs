// Cenários C-001..C-021 e regras RN-001..RN-015 da spec 004 (agenda de
// análises). Ver docs/specs/004-agenda-de-analises/plan.md §Testes.
//
// (Provisórios removidos na integração: fornecedores vêm do seed da 001 e a capa da 002.)
// PROVISÓRIO (histórico) — duas dependências de specs
// que ainda não existem neste worktree:
//
// 1. Fornecedores (spec 001): o seed da 001 é stub aqui, então este arquivo
//    insere o mínimo de SGC_FORNECEDOR (1015/1042 ativos, 1088 inativo) que
//    a guarda de `sgcEscAgendaInserir` precisa — o integrador remove quando a
//    001 estiver publicada e cobrir o mesmo cenário.
// 2. `sgcEscPedidoCapaInserir` (spec 002, id 7260): o add-005 também é stub;
//    o cron (`sgcAgendaProcessar`) chama essa escrita por id. Este arquivo
//    registra uma definição mínima e temporária, com o mesmo nome e os
//    mesmos parâmetros do plan da 002 (`usuarioId, cardId, codfornec,
//    fornecedor, codfilial, filial, periodoInicio, periodoFim, origem,
//    idAgenda, agora`), direto em `ctx.byName`/`ctx.byId` — o integrador troca
//    pela real quando a 002 publicar.
//
// Datas relativas a "hoje" (não hardcoded): o seed usa o mesmo `comDias()`,
// então os testes continuam corretos em qualquer dia em que rodarem.
//
// Reordenação registrada no relatório: C-021/RN-015 roda ANTES de C-008,
// porque C-021 edita o agendamento 4 (`sgcEscAgendaAtualizar`, que só aceita
// `PROCESSADO_EM IS NULL`) e C-008 é quem processa esse mesmo agendamento —
// na ordem do tasks.md (T-082 antes de T-086) o id 4 já estaria processado
// e a edição do C-021 seria recusada pela própria guarda que a RN-015 exige.
// Os dois cenários continuam cobertos por completo, só a ordem de execução
// no arquivo é diferente da ordem das tasks.

import { idsDoMapa } from '../../ids-do-mapa.mjs';
import { FRONTEND_MAP } from '../config.mjs';
import { assert, CENARIO } from './base.mjs';

function comDias(delta) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function primeiroDiaMes(iso) {
  return `${iso.slice(0, 8)}01`;
}

function ultimoDiaMes(iso) {
  const [ano, mes] = iso.split('-').map(Number);
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function mesSeguinteDia(iso, dia) {
  const [ano, mes] = iso.split('-').map(Number);
  const mesAlvo = mes === 12 ? 1 : mes + 1;
  const anoAlvo = mes === 12 ? ano + 1 : ano;
  return `${anoAlvo}-${String(mesAlvo).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

export async function suite(ctx) {
  const { db, byName, byId, chamar, teste, U } = ctx;
  const hoje = comDias(0);
  const agoraIso = () => new Date().toISOString().slice(0, 19);

  const idsMapa = idsDoMapa(FRONTEND_MAP);

  /* ─────────────── helpers de banco (direto, como o plan pede nos cenários "o teste insere") ─────────────── */

  function contarCards() {
    return Number(db.prepare('SELECT COUNT(*) AS N FROM KB_CARD').get().N);
  }
  function agendaPorId(id) {
    return db.prepare('SELECT * FROM SGC_AGENDA WHERE ID = ?').get(id);
  }
  function inserirAgendaTeste(campos) {
    const base = {
      CODFORNEC: 1015, FORNECEDOR: 'Fresenius Kabi Brasil Ltda', CODFILIAL: '1', FILIAL: 'Benenutri Matriz',
      PERIODO_INICIO: comDias(-10), PERIODO_FIM: hoje, RECORRENCIA: 'nenhuma', DATA_LIMITE_RECORRENCIA: null,
      OBSERVACAO: null, ATIVO: 1, PROCESSADO_EM: null, ID_CARD_GERADO: null, CANCELADO_EM: null, CANCELADO_POR: null,
      CRIADO_POR: U.ana, CRIADO_EM: agoraIso(), ATUALIZADO_EM: agoraIso(),
      ...campos,
    };
    const info = db.prepare(`INSERT INTO SGC_AGENDA
      (CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM, RECORRENCIA, DATA_LIMITE_RECORRENCIA,
       OBSERVACAO, ATIVO, PROCESSADO_EM, ID_CARD_GERADO, CANCELADO_EM, CANCELADO_POR, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
      VALUES (@CODFORNEC, @FORNECEDOR, @CODFILIAL, @FILIAL, @DATA_ANALISE, @PERIODO_INICIO, @PERIODO_FIM, @RECORRENCIA, @DATA_LIMITE_RECORRENCIA,
       @OBSERVACAO, @ATIVO, @PROCESSADO_EM, @ID_CARD_GERADO, @CANCELADO_EM, @CANCELADO_POR, @CRIADO_POR, @CRIADO_EM, @ATUALIZADO_EM)`).run(base);
    return Number(info.lastInsertRowid);
  }

  /* ─────────────── T-080 ─────────────── */

  await teste('C-018: lista filtrada por situação "atrasado" devolve os 2 do seed e o total bate; sem filtro devolve os 6', async () => {
    const filtroBase = { codfornec: 0, codfilial: '', dataInicio: '', dataFim: '', situacao: 'atrasado', hoje, limite: 50, offset: 0 };
    const { rows: atrasados } = await chamar('sgcAgendaListar', filtroBase, U.ana);
    assert.equal(atrasados.length, 2);
    assert.deepEqual(atrasados.map((r) => Number(r.ID)).sort(), [1, 2]);
    const { rows: total } = await chamar('sgcAgendaListarTotal', filtroBase, U.ana);
    assert.equal(Number(total[0].TOTAL), 2);

    const { rows: todos } = await chamar('sgcAgendaListar', { ...filtroBase, situacao: '' }, U.ana);
    assert.equal(todos.length, 6);
    assert.ok(todos.some((r) => Number(r.ID) === 5 && Number(r.ATIVO) === 0), 'o cancelado continua na lista sem filtro (RN-004)');
  });

  await teste('C-001/RF-001/RF-002: agendamento gravado com o período padrão (45 dias) e situação pendente', async () => {
    const dataAnalise = comDias(35);
    const periodoInicio = comDias(35 - 45);
    const criadoEm = agoraIso();
    await chamar('sgcEscAgendaInserir', {
      codfornec: 1015, fornecedor: 'Fresenius Kabi Brasil Ltda', codfilial: '1', filial: 'Benenutri Matriz',
      dataAnalise, periodoInicio, periodoFim: dataAnalise, recorrencia: 'nenhuma', dataLimiteRecorrencia: '', observacao: '', criadoEm,
    }, U.ana);
    const { rows } = await chamar('sgcAgendaListar', {
      codfornec: 1015, codfilial: '', dataInicio: dataAnalise, dataFim: dataAnalise, situacao: '', hoje, limite: 20, offset: 0,
    }, U.ana);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].PERIODO_INICIO, periodoInicio);
    assert.equal(rows[0].PERIODO_FIM, dataAnalise);
    assert.equal(rows[0].PROCESSADO_EM, null);
  });

  /* ─────────────── C-021/RN-015 (antes do C-008: ver nota do cabeçalho) ─────────────── */

  await teste('C-021/RF-020/RN-015: fornecedor inativo não entra em agendamento novo; o antigo (id 4) segue editável', async () => {
    const criadoEm = agoraIso();
    const antes = db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N;

    await chamar('sgcEscAgendaInserir', {
      codfornec: 1088, fornecedor: 'Danone Ltda', codfilial: '1', filial: 'Benenutri Matriz',
      dataAnalise: comDias(55), periodoInicio: comDias(10), periodoFim: comDias(55),
      recorrencia: 'nenhuma', dataLimiteRecorrencia: '', observacao: '', criadoEm,
    }, U.ana);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N, antes, 'fornecedor inativo não grava agendamento novo');

    await chamar('sgcEscAgendaInserir', {
      codfornec: 1015, fornecedor: 'Fresenius Kabi Brasil Ltda', codfilial: '1', filial: 'Benenutri Matriz',
      dataAnalise: comDias(56), periodoInicio: comDias(11), periodoFim: comDias(56),
      recorrencia: 'nenhuma', dataLimiteRecorrencia: '', observacao: '', criadoEm,
    }, U.ana);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N, antes + 1, 'fornecedor ativo grava normalmente');

    // Agendamento 4 (seed, do 1088) ainda não foi processado — continua editável (RN-015).
    const novaData = comDias(7);
    await chamar('sgcEscAgendaAtualizar', {
      id: 4, codfornec: 1088, fornecedor: 'Danone Ltda', codfilial: '1', filial: 'Benenutri Matriz',
      dataAnalise: novaData, periodoInicio: comDias(7 - 45), periodoFim: novaData,
      recorrencia: 'nenhuma', dataLimiteRecorrencia: '', observacao: '', atualizadoEm: criadoEm,
    }, U.ana);
    assert.equal(agendaPorId(4).DATA_ANALISE, novaData);

    // E, vencido, é processado normalmente — o processamento não consulta a situação do fornecedor.
    const semanalInativoId = inserirAgendaTeste({
      CODFORNEC: 1088, FORNECEDOR: 'Danone Ltda', CODFILIAL: '1', FILIAL: 'Benenutri Matriz',
      DATA_ANALISE: comDias(-1), RECORRENCIA: 'semanal', CRIADO_POR: U.ana, CRIADO_EM: criadoEm,
    });
    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'agendamento', idAgenda: semanalInativoId }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.processados, 1);
    assert.ok(resultado.resultados[0].proxima, 'a recorrência do fornecedor inativo continua gerando a ocorrência seguinte');
  });

  /* ─────────────── T-081 ─────────────── */

  let cardsAntesDoCron;
  await teste('C-006/RF-006/RF-008/RNF-002: o cron processa os 2 vencidos, cria os cards na fase "analise", marca e gera as 2 próximas ocorrências', async () => {
    cardsAntesDoCron = contarCards();
    const resultado = await chamar('sgcAgendaProcessar', {}, 0);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.processados, 2);
    assert.equal(contarCards(), cardsAntesDoCron + 2);

    const a1 = agendaPorId(1);
    const a2 = agendaPorId(2);
    assert.ok(a1.PROCESSADO_EM && a1.ID_CARD_GERADO, 'id 1 deveria estar marcado como processado');
    assert.ok(a2.PROCESSADO_EM && a2.ID_CARD_GERADO, 'id 2 deveria estar marcado como processado');

    const fase1 = db.prepare('SELECT FASE_ID FROM KB_CARD WHERE ID = ?').get(a1.ID_CARD_GERADO);
    const fase2 = db.prepare('SELECT FASE_ID FROM KB_CARD WHERE ID = ?').get(a2.ID_CARD_GERADO);
    assert.equal(Number(fase1.FASE_ID), CENARIO.fases.analise);
    assert.equal(Number(fase2.FASE_ID), CENARIO.fases.analise);

    const proxima1 = db.prepare("SELECT * FROM SGC_AGENDA WHERE CODFORNEC = 1015 AND DATA_ANALISE = ? AND PROCESSADO_EM IS NULL").get(comDias(6));
    assert.ok(proxima1, 'a próxima ocorrência do id 1 (semanal) deveria nascer em hoje+6');
    const proxima2 = db.prepare("SELECT * FROM SGC_AGENDA WHERE CODFORNEC = 1042 AND CODFILIAL = '2' AND DATA_ANALISE = ? AND PROCESSADO_EM IS NULL").get(comDias(13));
    assert.ok(proxima2, 'a próxima ocorrência do id 2 (quinzenal) deveria nascer em hoje+13');

    assert.equal(agendaPorId(3).PROCESSADO_EM, null, 'id 3 (futuro) continua pendente');
    assert.equal(agendaPorId(4).PROCESSADO_EM, null, 'id 4 (futuro) continua pendente');
  });

  await teste('C-019/RF-007/RN-009: o pedido nasce em nome de quem agendou', async () => {
    const a1 = agendaPorId(1);
    const card = db.prepare('SELECT * FROM KB_CARD WHERE ID = ?').get(a1.ID_CARD_GERADO);
    assert.equal(Number(card.CRIADO_POR), U.ana);
    assert.equal(card.TITULO, 'BENENUTRI MATRIZ · FRESENIUS KABI BRASIL LTDA', 'RN-014 da 002: FILIAL · FORNECEDOR em maiúsculas');
    const responsavel = db.prepare('SELECT * FROM KB_CARD_RESPONSAVEL WHERE CARD_ID = ? AND USUARIO_ID = ?').get(a1.ID_CARD_GERADO, U.ana);
    assert.ok(responsavel, 'quem agendou é o responsável inicial');
    const movimento = db.prepare('SELECT * FROM KB_MOVIMENTO WHERE CARD_ID = ? AND DE_FASE_ID IS NULL').get(a1.ID_CARD_GERADO);
    assert.equal(movimento.ORIGEM, 'sistema');
    assert.equal(Number(movimento.USUARIO_ID), U.ana);
    const pedido = db.prepare('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?').get(a1.ID_CARD_GERADO);
    assert.equal(pedido.ORIGEM, 'agenda');
    assert.equal(Number(pedido.ID_AGENDA), 1);
  });

  await teste('C-007/RNF-003: rodar o cron de novo não duplica — 0 processados, contagem de cards igual', async () => {
    const antes = contarCards();
    const resultado = await chamar('sgcAgendaProcessar', {}, 0);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.processados, 0);
    assert.equal(contarCards(), antes);
  });

  /* ─────────────── T-083 (cancelamento) ─────────────── */

  await teste('C-014/RN-011: cancelamento pela analista é recusado — a guarda de persona não deixa passar', async () => {
    await chamar('sgcEscAgendaCancelar', { id: 3, canceladoEm: agoraIso() }, U.ana);
    assert.equal(Number(agendaPorId(3).ATIVO), 1, 'analista não cancela');
  });

  await teste('C-013/RN-004: gestor cancela um agendamento pendente; a rodada seguinte não o processa', async () => {
    await chamar('sgcEscAgendaCancelar', { id: 3, canceladoEm: agoraIso() }, U.gil);
    const a3 = agendaPorId(3);
    assert.equal(Number(a3.ATIVO), 0);
    assert.ok(a3.CANCELADO_EM);

    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'agendamento', idAgenda: 3 }, U.ana);
    assert.equal(resultado.processados, 0, 'cancelado deixa de ser processado');
  });

  /* ─────────────── T-082 (recortes do processamento manual) ─────────────── */

  await teste('C-008/RF-011/RN-014: manual "um agendamento" processa mesmo com data futura', async () => {
    const antesCards = contarCards();
    const antesAgendas = db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N;
    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'agendamento', idAgenda: 4 }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.processados, 1);
    assert.equal(contarCards(), antesCards + 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N, antesAgendas, 'sem recorrência, não nasce próxima ocorrência');
  });

  await teste('C-009/RF-011: manual "intervalo" processa só o que cai nele', async () => {
    const idA = inserirAgendaTeste({ DATA_ANALISE: comDias(40) });
    const idB = inserirAgendaTeste({ DATA_ANALISE: comDias(41) });
    const idC = inserirAgendaTeste({ DATA_ANALISE: comDias(60) });
    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'intervalo', dataInicio: comDias(40), dataFim: comDias(41) }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    const processados = resultado.resultados.map((r) => Number(r.idAgenda));
    assert.ok(processados.includes(idA) && processados.includes(idB));
    assert.ok(!processados.includes(idC));
    assert.equal(agendaPorId(idC).PROCESSADO_EM, null);
  });

  await teste('C-010/RF-011/RF-012: manual sem recorte (padrão mês vigente) não pega o mês seguinte', async () => {
    const idDia1 = inserirAgendaTeste({ DATA_ANALISE: primeiroDiaMes(hoje) });
    const idUltimo = inserirAgendaTeste({ DATA_ANALISE: ultimoDiaMes(hoje) });
    const idMesSeguinte = inserirAgendaTeste({ DATA_ANALISE: mesSeguinteDia(hoje, 5) });
    const resultado = await chamar('sgcAgendaProcessarManual', { modo: '' }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.filtros.modo, 'mes');
    const processados = resultado.resultados.map((r) => Number(r.idAgenda));
    assert.ok(processados.includes(idDia1) && processados.includes(idUltimo));
    assert.ok(!processados.includes(idMesSeguinte));
    assert.equal(agendaPorId(idMesSeguinte).PROCESSADO_EM, null);
  });

  await teste('C-011/RF-011: manual "próximos 7 dias" processa só a janela hoje..hoje+6', async () => {
    const idOntem = inserirAgendaTeste({ DATA_ANALISE: comDias(-1) });
    const idDepoisDeAmanha = inserirAgendaTeste({ DATA_ANALISE: comDias(2) });
    const idTrintaDias = inserirAgendaTeste({ DATA_ANALISE: comDias(30) });
    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'dias', dias: 7 }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    const processados = resultado.resultados.map((r) => Number(r.idAgenda));
    assert.ok(processados.includes(idDepoisDeAmanha));
    assert.ok(!processados.includes(idOntem), 'anterior a hoje é do cron, não do recorte manual de dias');
    assert.ok(!processados.includes(idTrintaDias));
    assert.equal(agendaPorId(idTrintaDias).PROCESSADO_EM, null);
  });

  await teste('C-012/RN-011: quem não pode processar é recusado citando o perfil; gestor é aceito', async () => {
    const antes = contarCards();
    const recusado = await chamar('sgcAgendaProcessarManual', { modo: 'dias', dias: 1 }, U.leo);
    assert.equal(recusado.ok, false);
    assert.match(recusado.error, /perfil/);
    assert.equal(contarCards(), antes);

    const aceito = await chamar('sgcAgendaProcessarManual', { modo: 'dias', dias: 1 }, U.gil);
    assert.equal(aceito.ok, true, aceito.error);
  });

  /* ─────────────── T-084 (envio sincroniza a agenda) ─────────────── */

  await teste('C-016/RF-016/RN-012: o envio grava a data real e guarda a planejada original uma vez só', async () => {
    const planejadaOriginal = agendaPorId(6).DATA_ANALISE;
    const primeiroEnvio = comDias(-1);
    await chamar('sgcEscAgendaEnvio', { idCard: 9006, dtEnvio: primeiroEnvio, usuarioId: U.ana }, 0);
    let a6 = agendaPorId(6);
    assert.equal(a6.DATA_ENVIO_REAL, primeiroEnvio);
    assert.equal(a6.DATA_PLANEJADA_ORIGINAL, planejadaOriginal);
    assert.equal(a6.DATA_ANALISE, primeiroEnvio);

    const segundoEnvio = hoje;
    await chamar('sgcEscAgendaEnvio', { idCard: 9006, dtEnvio: segundoEnvio, usuarioId: U.ana }, 0);
    a6 = agendaPorId(6);
    assert.equal(a6.DATA_PLANEJADA_ORIGINAL, planejadaOriginal, 'a segunda chamada não sobrescreve a planejada original');
    assert.equal(a6.DATA_ENVIO_REAL, segundoEnvio);
  });

  /* ─────────────── T-085 (participantes) ─────────────── */

  await teste('C-017/RF-005/RF-009/RN-010: limpar + inserir regrava a lista inteira; a ocorrência herda os participantes atuais', async () => {
    const criadoEm = agoraIso();
    const idAgenda = inserirAgendaTeste({ DATA_ANALISE: comDias(-1), RECORRENCIA: 'semanal', CRIADO_POR: U.ana, CRIADO_EM: criadoEm });

    await chamar('sgcEscAgendaParticipanteInserir', { idAgenda, usuarioId: U.admin, criadoEm }, U.ana);
    await chamar('sgcEscAgendaParticipanteInserir', { idAgenda, usuarioId: U.gil, criadoEm }, U.ana);
    await chamar('sgcEscAgendaParticipanteInserir', { idAgenda, usuarioId: U.dora, criadoEm }, U.ana);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA_PARTICIPANTE WHERE ID_AGENDA = ?').get(idAgenda).N, 3);

    await chamar('sgcEscAgendaParticipanteLimpar', { idAgenda }, U.ana);
    await chamar('sgcEscAgendaParticipanteInserir', { idAgenda, usuarioId: U.gil, criadoEm }, U.ana);
    await chamar('sgcEscAgendaParticipanteInserir', { idAgenda, usuarioId: U.dora, criadoEm }, U.ana);
    const restantes = db.prepare('SELECT USUARIO_ID FROM SGC_AGENDA_PARTICIPANTE WHERE ID_AGENDA = ?').all(idAgenda)
      .map((r) => Number(r.USUARIO_ID)).sort();
    assert.deepEqual(restantes, [U.dora, U.gil].sort());

    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'agendamento', idAgenda }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.processados, 1);
    const proximaData = resultado.resultados[0].proxima;
    assert.ok(proximaData);
    const proxima = db.prepare('SELECT * FROM SGC_AGENDA WHERE CODFORNEC = 1015 AND DATA_ANALISE = ? AND ID <> ? ORDER BY ID DESC LIMIT 1').get(proximaData, idAgenda);
    assert.ok(proxima, 'a ocorrência seguinte deveria nascer');
    const participantesNovos = db.prepare('SELECT USUARIO_ID FROM SGC_AGENDA_PARTICIPANTE WHERE ID_AGENDA = ?').all(proxima.ID)
      .map((r) => Number(r.USUARIO_ID)).sort();
    assert.deepEqual(participantesNovos, [U.dora, U.gil].sort());
  });

  /* ─────────────── T-086 (falha isolada, cancelamento e idempotência) ─────────────── */

  await teste('C-020/RNF-004: falha em um agendamento não derruba os outros — 2 processados, 1 erro isolado', async () => {
    const criadoEm = agoraIso();
    const idBom1 = inserirAgendaTeste({
      DATA_ANALISE: comDias(-1), CODFORNEC: 1015, FORNECEDOR: 'Fresenius Kabi Brasil Ltda', CODFILIAL: '1', FILIAL: 'Benenutri Matriz', CRIADO_POR: U.ana, CRIADO_EM: criadoEm,
    });
    const idRuim = inserirAgendaTeste({
      DATA_ANALISE: comDias(-1), CODFORNEC: 1042, FORNECEDOR: 'Nestle Brasil Ltda', CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte', CRIADO_POR: 999999, CRIADO_EM: criadoEm,
    });
    const idBom2 = inserirAgendaTeste({
      DATA_ANALISE: comDias(-1), CODFORNEC: 1015, FORNECEDOR: 'Fresenius Kabi Brasil Ltda', CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte', CRIADO_POR: U.gil, CRIADO_EM: criadoEm,
    });

    const resultado = await chamar('sgcAgendaProcessarManual', { modo: 'intervalo', dataInicio: comDias(-1), dataFim: comDias(-1) }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);

    const processados = resultado.resultados.map((r) => Number(r.idAgenda));
    const comErro = resultado.erros.map((e) => Number(e.idAgenda));
    assert.ok(processados.includes(idBom1) && processados.includes(idBom2));
    assert.ok(comErro.includes(idRuim));
    const erroDoRuim = resultado.erros.find((e) => Number(e.idAgenda) === idRuim);
    assert.match(erroDoRuim.erro, /não encontrado/);

    assert.equal(agendaPorId(idRuim).PROCESSADO_EM, null);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_PEDIDO WHERE ID_AGENDA = ?').get(idRuim).N, 0);
  });

  await teste('RN-004: cancelar um agendamento já processado é recusado — a guarda de tela não altera nada', async () => {
    await chamar('sgcEscAgendaCancelar', { id: 6, canceladoEm: agoraIso() }, U.gil);
    assert.equal(Number(agendaPorId(6).ATIVO), 1, 'id 6 já processado, não deveria cancelar');
  });

  await teste('RN-007: agendamento com pedido gerado e marcação apagada à mão não gera segundo pedido', async () => {
    db.prepare('UPDATE SGC_AGENDA SET PROCESSADO_EM = NULL WHERE ID = 6').run();
    const antesCards = contarCards();
    const resultado = await chamar('sgcAgendaProcessar', {}, 0);
    assert.equal(resultado.ok, true, resultado.error);
    const processados = resultado.resultados.map((r) => Number(r.idAgenda));
    assert.ok(!processados.includes(6), 'o NOT EXISTS em SGC_PEDIDO deveria segurar o id 6');
    assert.equal(contarCards(), antesCards, 'nenhum card novo deveria nascer para o id 6');
  });

  /* ─────────────── T-087 ─────────────── */

  await teste('RNF-001: custo por agendamento — 3 escritas no caso simples, 5 com recorrência e participantes', async () => {
    const contados = new Set([
      Number(idsMapa.kbCardCriar), Number(idsMapa.sgcEscPedidoCapaInserir),
      Number(idsMapa.sgcEscAgendaProcessada), Number(idsMapa.sgcEscAgendaProximaInserir),
      Number(idsMapa.sgcEscAgendaParticipanteCopiar),
    ]);
    let contagem = 0;
    const getOriginal = byId.get.bind(byId);
    byId.get = (id) => {
      if (contados.has(id)) contagem += 1;
      return getOriginal(id);
    };

    try {
      const criadoEm = agoraIso();
      const idSimples = inserirAgendaTeste({ DATA_ANALISE: comDias(-1), RECORRENCIA: 'nenhuma', CRIADO_POR: U.ana, CRIADO_EM: criadoEm });
      contagem = 0;
      const r1 = await chamar('sgcAgendaProcessarManual', { modo: 'agendamento', idAgenda: idSimples }, U.ana);
      assert.equal(r1.processados, 1, r1.error);
      assert.equal(contagem, 3, 'caso simples: kbCardCriar + capa + marcação');

      const idComRecorrenciaEParticipante = inserirAgendaTeste({ DATA_ANALISE: comDias(-1), RECORRENCIA: 'semanal', CRIADO_POR: U.ana, CRIADO_EM: criadoEm });
      await chamar('sgcEscAgendaParticipanteInserir', { idAgenda: idComRecorrenciaEParticipante, usuarioId: U.gil, criadoEm }, U.ana);
      contagem = 0;
      const r2 = await chamar('sgcAgendaProcessarManual', { modo: 'agendamento', idAgenda: idComRecorrenciaEParticipante }, U.ana);
      assert.equal(r2.processados, 1, r2.error);
      assert.equal(contagem, 5, 'com recorrência e participantes: + próxima ocorrência + cópia de participantes');
    } finally {
      byId.get = getOriginal;
    }
  });

  /* ─────────────── A1 (revisão adversarial) ─────────────── */

  await teste('A1: as quatro escritas internas recusam usuarioId de perfil comercial (Leo)', async () => {
    const criadoEm = agoraIso();

    const idPendente = inserirAgendaTeste({ DATA_ANALISE: comDias(-1), RECORRENCIA: 'nenhuma', CRIADO_POR: U.ana, CRIADO_EM: criadoEm });
    await chamar('sgcEscAgendaProcessada', { id: idPendente, idCard: 999999, processadoEm: agoraIso(), usuarioId: U.leo }, 0);
    assert.equal(agendaPorId(idPendente).PROCESSADO_EM, null, 'Leo (comercial) não deveria conseguir marcar como processado');

    const antesTotal = db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N;
    await chamar('sgcEscAgendaProximaInserir', {
      codfornec: 1015, fornecedor: 'Fresenius Kabi Brasil Ltda', codfilial: '1', filial: 'Benenutri Matriz',
      dataAnalise: comDias(20), periodoInicio: comDias(-25), periodoFim: comDias(20),
      recorrencia: 'nenhuma', dataLimiteRecorrencia: '', observacao: '', criadoPor: U.ana, criadoEm: agoraIso(), usuarioId: U.leo,
    }, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA').get().N, antesTotal, 'Leo não deveria conseguir inserir a próxima ocorrência');

    await chamar('sgcEscAgendaParticipanteCopiar', { idOrigem: 1, idNova: idPendente, criadoEm: agoraIso(), usuarioId: U.leo }, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AGENDA_PARTICIPANTE WHERE ID_AGENDA = ?').get(idPendente).N, 0, 'Leo não deveria conseguir copiar participantes');

    const idCardTeste = 888888;
    const idEnvioTeste = inserirAgendaTeste({
      DATA_ANALISE: comDias(-5), RECORRENCIA: 'nenhuma', PROCESSADO_EM: agoraIso(), ID_CARD_GERADO: idCardTeste, CRIADO_POR: U.ana, CRIADO_EM: agoraIso(),
    });
    await chamar('sgcEscAgendaEnvio', { idCard: idCardTeste, dtEnvio: comDias(0), usuarioId: U.leo }, 0);
    assert.equal(agendaPorId(idEnvioTeste).DATA_ENVIO_REAL, null, 'Leo não deveria conseguir sincronizar o envio');
  });
}
