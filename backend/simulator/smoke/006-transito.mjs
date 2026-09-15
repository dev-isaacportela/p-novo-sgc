// Cenários C-001..C-023 e regras RN-001..RN-013 da spec 006 (trânsito e
// recebimento). Ver docs/specs/006-transito-e-recebimento/plan.md §Testes.
//
// Tudo roda sobre as MESMAS definitions que o add-009-transito.mjs publica,
// num banco descartável. O banco é UM só para as sete suítes (R-045): nenhuma
// asserção usa total absoluto de listagem — ou recorta por `CARDS_006`, ou é
// comparada com um SELECT que o próprio teste faz, ou é medida por diferença.
//
// A rodada do cron é chamada com `userId = 0` (ausência de sessão): é o que
// habilita `movidoPor`/`origem: 'sistema'` no kbCardMover da lib 1.4.0 (R-021).

import { assert, CENARIO, FRONTEND_MAP } from './base.mjs';
import { idsDoMapa } from '../../ids-do-mapa.mjs';
import { CARDS_006, emDias } from '../seed/006-transito.mjs';

const IDS = idsDoMapa(FRONTEND_MAP);

/** AAAA-MM-DD + n dias, em dias corridos. */
function somarDias(iso, n) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Contrato de R-038, publicado pela 005 (`add-008`): enquanto ela não chegar,
 * o smoke da 006 registra esta cópia literal em `byId` para os avisos do cron
 * existirem. Assim que a 005 publicar a SF de verdade, `byName` a tem e este
 * bloco não faz nada — o teste passa a exercitar a escrita real. */
const AVISO_DA_005 = `INSERT INTO SGC_AVISO (ID_CARD, TIPO, CHAVE, PARA_USUARIO_ID, PARA_PERSONA, TEXTO, CRIADO_EM)
SELECT {{idCard}}, '{{tipo}}', '{{chave}}', {{paraUsuarioId}}, '{{paraPersona}}', '{{texto}}', '{{criadoEm}}'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM SGC_AVISO A WHERE A.CHAVE = '{{chave}}')`;

export async function suite(ctx) {
  const { db, byName, byId, chamar, teste, U } = ctx;
  const fases = CENARIO.fases;
  const { T1, T2, T3, T4, E5, F6, T7 } = CARDS_006;
  const TODOS = Object.values(CARDS_006);
  const recorte = TODOS.join(',');
  const HOJE = new Date().toISOString().slice(0, 10);

  if (!byName.has('sgcEscAvisoInserir')) {
    byId.set(IDS.sgcEscAvisoInserir, { name: 'sgcEscAvisoInserir', type: 'SQL', code: AVISO_DA_005 });
  }

  /* ── atalhos ── */

  const linhas = (resultado) => resultado.rows;
  const notasDoCard = async (cardId, hoje = '') => linhas(await chamar('sgcNfsRecebimentoCard', { cardId, hoje }, U.ana));
  const acharNota = (rows, numnota) => rows.find((linha) => Number(linha.NUMNOTA) === numnota);
  const nfDoBanco = (numnota) => db.prepare('SELECT * FROM SGC_NF WHERE NUMNOTA = ? LIMIT 1').get(numnota);
  const faseDoCard = (cardId) => Number(db.prepare('SELECT FASE_ID FROM KB_CARD WHERE ID = ?').get(cardId).FASE_ID);
  const movimentos = (cardId) => db.prepare('SELECT * FROM KB_MOVIMENTO WHERE CARD_ID = ? ORDER BY ID').all(cardId);
  const avisos = (tipo) => Number(db.prepare(
    `SELECT COUNT(*) AS N FROM SGC_AVISO WHERE TIPO = ? AND ID_CARD IN (${recorte})`,
  ).get(tipo).N);
  const recebidasNoRecorte = () => Number(db.prepare(
    `SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD IN (${recorte}) AND TRIM(COALESCE(DT_RECEBIMENTO, '')) <> ''`,
  ).get().N);

  /** A rodada como o cron a faz: sem sessão (userId 0). */
  const rodada = (cardId = 0, userId = 0) => chamar('sgcRecebimentoSincronizar', { cardId }, userId);

  const emAtraso = async (filtros = {}) => linhas(await chamar('sgcNfsEmAtraso', {
    busca: '', faixa: '', hoje: '', limite: 200, offset: 0, ...filtros,
  }, U.gil));
  const totalEmAtraso = async (filtros = {}) => linhas(await chamar('sgcNfsEmAtrasoTotal', {
    busca: '', faixa: '', hoje: '', ...filtros,
  }, U.gil))[0];

  /* ── espião do WinThor: conta as consultas ao ERP (RN-009) e, quando pedido,
   *    faz o fornecedor escolhido falhar (C-014). O corpo real da SQL é o
   *    MESMO — o stand-in só o embrulha. ── */
  const DEF_ERP = byName.get('sgcWintNfEntradasConfirmadas');
  const SQL_ERP = JSON.stringify(DEF_ERP.code);
  db.exec('CREATE TABLE IF NOT EXISTS SMOKE_006_ERP (ID INTEGER PRIMARY KEY AUTOINCREMENT, CODFORNEC INTEGER, NUMNOTAS TEXT)');

  function espiaoErp(codfornecQueFalha = 0) {
    db.exec('DELETE FROM SMOKE_006_ERP');
    byId.set(IDS.sgcWintNfEntradasConfirmadas, {
      name: 'sgcWintNfEntradasConfirmadas',
      type: 'JAVASCRIPT',
      code: `
const { runQueryMitra } = require('mitra-sdk');
await runQueryMitra({ projectId: 1, sql: "INSERT INTO SMOKE_006_ERP (CODFORNEC, NUMNOTAS) VALUES ({{codfornec}}, '{{numnotas}}')" });
if (Number(event.codfornec) === ${Number(codfornecQueFalha)}) throw new Error('WinThor indisponível para este fornecedor.');
const resposta = await runQueryMitra({ projectId: 1, sql: ${SQL_ERP} });
return { rows: ((resposta && resposta.result) || resposta).rows || [] };
`,
    });
  }
  const consultasAoErp = () => db.prepare('SELECT CODFORNEC, NUMNOTAS FROM SMOKE_006_ERP ORDER BY ID').all();
  const restaurarErp = () => byId.set(IDS.sgcWintNfEntradasConfirmadas, DEF_ERP);

  /* ─────────── T-080 — previsão (RF-001, RF-002, RF-004) ─────────── */

  await teste('C-001: no T1, a NF 90001 (faturada 24/08, segunda) prevê 2026-09-02 e a 90002 (28/08, sexta) prevê 2026-09-08 — as duas com o prazo de 7 dias úteis do fornecedor 1015', async () => {
    const notas = await notasDoCard(T1);
    assert.equal(notas.length, 3, 'o T1 tem 3 notas');
    const n1 = acharNota(notas, 90001);
    const n2 = acharNota(notas, 90002);
    assert.equal(n1.DT_PREVISAO, '2026-09-02');
    assert.equal(n2.DT_PREVISAO, '2026-09-08');
    for (const nota of [n1, n2]) {
      assert.equal(Number(nota.PRAZO_ENTREGA_DIAS), 7);
      assert.equal(nota.PRAZO_ENTREGA_TIPO, 'uteis');
    }
  });

  await teste('C-002: a NF 90006 (fornecedor 1042, 10 dias CORRIDOS, faturada 28/08) prevê 2026-09-07 — a contagem é de calendário', async () => {
    const nota = acharNota(await notasDoCard(T3), 90006);
    assert.equal(nota.DT_PREVISAO, '2026-09-07');
    assert.equal(nota.PRAZO_ENTREGA_TIPO, 'corridos');
    assert.equal(Number(nota.PRAZO_ENTREGA_DIAS), 10);
  });

  await teste('RN-001: o fragmento de dias úteis dentro da SQL desta spec — 24/08/2026 + 15 úteis = 2026-09-14 e 29/08/2026 (sábado) + 1 útil = 2026-08-31', async () => {
    // Exercitado pela própria previsão: trocar o prazo do 1015 muda a previsão
    // da 90001 (faturada em 24/08) sem tocar em mais nada.
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 15 WHERE CODFORNEC = 1015').run();
    assert.equal(acharNota(await notasDoCard(T1), 90001).DT_PREVISAO, '2026-09-14');

    // Sábado recua para a sexta anterior antes de contar: 29/08 + 1 útil = 31/08.
    db.prepare("UPDATE SGC_NF SET DT_EMISSAO = '2026-08-29' WHERE NUMNOTA = 90003").run();
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 1 WHERE CODFORNEC = 1015').run();
    assert.equal(acharNota(await notasDoCard(T1), 90003).DT_PREVISAO, '2026-08-31');

    db.prepare("UPDATE SGC_NF SET DT_EMISSAO = ? WHERE NUMNOTA = 90003").run(emDias(-20));
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 7 WHERE CODFORNEC = 1015').run();
  });

  await teste('C-021: trocar o prazo do fornecedor 1015 de 7 para 10 dias úteis corrige a previsão da 90001 para 2026-09-07 sem reprocessar nada, e as notas já recebidas mantêm a data de recebimento', async () => {
    const recebimentoAntes = nfDoBanco(90002).DT_RECEBIMENTO;
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 10 WHERE CODFORNEC = 1015').run();
    const notas = await notasDoCard(T1);
    assert.equal(acharNota(notas, 90001).DT_PREVISAO, '2026-09-07');
    assert.equal(nfDoBanco(90002).DT_RECEBIMENTO, recebimentoAntes, 'nota recebida não é tocada pela parametrização');
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 7 WHERE CODFORNEC = 1015').run();
    assert.equal(acharNota(await notasDoCard(T1), 90001).DT_PREVISAO, '2026-09-02', 'o teste devolve o prazo a 7');
  });

  /* ─────────── T-081 — situação por nota (RF-003, RF-005, RF-006) ─────────── */

  await teste('C-003: a NF 90009, de fornecedor sem parametrização (999999, sem linha em SGC_FORNECEDOR), fica sem previsão, com situação sem_prazo e 0 dia de atraso — e não entra na lista de vencidas', async () => {
    const nota = acharNota(await notasDoCard(T4), 90009);
    assert.equal(nota.DT_PREVISAO, '');
    assert.equal(nota.SITUACAO, 'sem_prazo');
    assert.equal(Number(nota.DIAS_ATRASO), 0);
    assert.equal(Number(nota.PRAZO_ENTREGA_DIAS), 0);
    const vencidas = await emAtraso();
    assert.ok(!acharNota(vencidas, 90009), 'nota sem prazo nunca é vencida');
  });

  await teste('C-004: a NF 90010, sem data de faturamento, é sem_prazo mesmo com o fornecedor 1015 parametrizado', async () => {
    const nota = acharNota(await notasDoCard(T4), 90010);
    assert.equal(nota.DT_EMISSAO, '');
    assert.equal(Number(nota.PRAZO_ENTREGA_DIAS), 7, 'o fornecedor tem prazo; o que falta é a data da nota');
    assert.equal(nota.DT_PREVISAO, '');
    assert.equal(nota.SITUACAO, 'sem_prazo');
  });

  await teste('RN-002: prazo do fornecedor em 0 zera a previsão do mesmo jeito que a data de faturamento vazia', async () => {
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 0 WHERE CODFORNEC = 1015').run();
    const nota = acharNota(await notasDoCard(T1), 90003);
    assert.equal(nota.DT_PREVISAO, '');
    assert.equal(nota.SITUACAO, 'sem_prazo');
    db.prepare('UPDATE SGC_FORNECEDOR SET PRAZO_ENTREGA_DIAS = 7 WHERE CODFORNEC = 1015').run();
  });

  await teste('C-005: a NF 90011 (fornecedor 1042, 10 corridos, faturada há 12 dias) está atrasada há exatamente 2 dias', async () => {
    const nota = acharNota(await notasDoCard(E5), 90011);
    assert.equal(nota.SITUACAO, 'atrasada');
    assert.equal(Number(nota.DIAS_ATRASO), 2);
    assert.equal(nota.DT_PREVISAO, emDias(-2));
  });

  await teste('C-012: no T1, na MESMA resposta, 90001 e 90002 continuam recebida enquanto a 90003 está atrasada — o atraso de uma não contamina as outras', async () => {
    const notas = await notasDoCard(T1);
    assert.equal(acharNota(notas, 90001).SITUACAO, 'recebida');
    assert.equal(acharNota(notas, 90002).SITUACAO, 'recebida');
    assert.equal(acharNota(notas, 90003).SITUACAO, 'atrasada');
  });

  await teste('RN-003: com `hoje` forçado, previsão de ontem é atrasada, hoje+2 é em_transito, hoje+3 é dentro_prazo — e recebimento vence tudo', async () => {
    const previsao = acharNota(await notasDoCard(T1), 90003).DT_PREVISAO;
    const situacaoCom = async (hoje) => acharNota(await notasDoCard(T1, hoje), 90003).SITUACAO;
    assert.equal(await situacaoCom(somarDias(previsao, 1)), 'atrasada', 'previsão < hoje');
    assert.equal(await situacaoCom(somarDias(previsao, -2)), 'em_transito', 'previsão = hoje + 2');
    assert.equal(await situacaoCom(somarDias(previsao, -3)), 'dentro_prazo', 'previsão = hoje + 3');
    const recebida = acharNota(await notasDoCard(T1, '2030-01-01'), 90001);
    assert.equal(recebida.SITUACAO, 'recebida', 'recebimento vence a previsão vencida');
    assert.equal(Number(recebida.DIAS_ATRASO), 0);
  });

  /* ─────────── T-086 (leitura) — lista de vencidas (RF-018..RF-020) ─────────── */

  await teste('C-015: a lista de vencidas traz as 5 notas dos pedidos desta spec (90003, 90006, 90011, 90012, 90013) e NÃO traz a 90015, de pedido já em faturamento; o total e o valor acumulado batem com o COUNT/SUM que o próprio teste faz pela mesma regra', async () => {
    const vencidas = await emAtraso();
    const minhas = vencidas.filter((linha) => TODOS.includes(Number(linha.ID_CARD))).map((linha) => Number(linha.NUMNOTA)).sort();
    assert.deepEqual(minhas, [90003, 90006, 90011, 90012, 90013]);
    assert.ok(!acharNota(vencidas, 90015), 'nota de pedido em faturamento não entra (RN-011)');
    // A tela rotula pela SITUACAO da linha (recebimento.ts): a listagem precisa devolvê-la, senão tudo vira 'sem prazo parametrizado'.
    assert.ok(vencidas.length > 0 && vencidas.every((linha) => linha.SITUACAO === 'atrasada'), 'toda linha da lista de vencidas traz SITUACAO = atrasada');

    // R-045: sem literal — o esperado é contado no banco, pela mesma regra.
    const esperado = db.prepare(`SELECT COUNT(*) AS TOTAL, COALESCE(SUM(NF.VL_TOTAL), 0) AS VALOR
      FROM SGC_NF NF
      JOIN KB_CARD C  ON C.ID = NF.ID_CARD AND C.EXCLUIDO_EM IS NULL
      JOIN SGC_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
      WHERE TRIM(COALESCE(NF.DT_RECEBIMENTO, '')) = ''
        AND F.CHAVE IN ('enviado', 'transito')
        AND NF.ID IN (${vencidas.map((linha) => Number(linha.ID)).join(',') || '0'})`).get();
    const total = await totalEmAtraso();
    assert.equal(Number(total.TOTAL), Number(esperado.TOTAL));
    assert.equal(Number(total.TOTAL), vencidas.length);
    assert.equal(Number(total.VALOR_TOTAL).toFixed(2), Number(esperado.VALOR).toFixed(2));
  });

  await teste('C-016: as faixas de atraso recortam certo — "até 3" traz só a 90011 (2 dias), "de 4 a 7" só a 90012 (5) e "mais de 7" traz 90013 (9), 90003 e 90006', async () => {
    const daSpec = async (faixa) => (await emAtraso({ faixa }))
      .filter((linha) => TODOS.includes(Number(linha.ID_CARD)))
      .map((linha) => Number(linha.NUMNOTA)).sort();
    assert.deepEqual(await daSpec('ate3'), [90011]);
    assert.deepEqual(await daSpec('4a7'), [90012]);
    assert.deepEqual(await daSpec('mais7'), [90003, 90006, 90013]);
  });

  await teste('C-017: a busca acha por número da nota ("90012"), por parte do nome do fornecedor ("NESTLE") e pelo número do pedido no ERP ("900500", as 3 notas do E5)', async () => {
    const porNota = await emAtraso({ busca: '90012' });
    assert.ok(acharNota(porNota, 90012), 'busca pelo número da nota');

    const porFornecedor = await emAtraso({ busca: 'NESTLE' });
    for (const numnota of [90006, 90011, 90012, 90013]) {
      assert.ok(acharNota(porFornecedor, numnota), `busca por fornecedor deveria trazer a ${numnota}`);
    }
    const porPedido = (await emAtraso({ busca: '900500' })).filter((linha) => Number(linha.ID_CARD) === E5);
    assert.deepEqual(porPedido.map((linha) => Number(linha.NUMNOTA)).sort(), [90011, 90012, 90013]);
  });

  await teste('RN-011: nota de pedido em faturamento (90015) fica fora da lista e da verificação; marcando o T4 como excluído, as notas dele somem das duas', async () => {
    const pendentesAgora = async () => linhas(await chamar('sgcNfsRecebimentoPendente', { cardId: 0, hoje: '' }, U.ana));

    const antes = await pendentesAgora();
    assert.ok(!acharNota(antes, 90015), 'pedido em faturamento sai do monitoramento');
    assert.ok(acharNota(antes, 90009), 'o T4 está em trânsito, então as notas dele são monitoradas');

    db.prepare("UPDATE KB_CARD SET EXCLUIDO_EM = '2026-09-15T09:00:00' WHERE ID = ?").run(T4);
    const depois = await pendentesAgora();
    assert.ok(!acharNota(depois, 90009), 'card excluído sai do monitoramento');
    assert.ok(!acharNota(await emAtraso(), 90009), 'e da lista de vencidas');
    db.prepare('UPDATE KB_CARD SET EXCLUIDO_EM = NULL WHERE ID = ?').run(T4);
  });

  await teste('RN-010: com 45 pedidos pendentes, a rodada trata 30 PEDIDOS e nenhum deles fica com nota não avaliada', async () => {
    const criados = [];
    const inserirCard = db.prepare(`INSERT INTO KB_CARD
      (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
      VALUES (?, ?, ?, 1, ?, '', '{}', 'lote rn-010', ?, '2026-09-15T08:00:00', '2026-09-15T08:00:00', '2026-09-15T08:00:00')`);
    const inserirNf = db.prepare(`INSERT INTO SGC_NF
      (ID_CARD, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, DT_EMISSAO, DT_RECEBIMENTO, VL_TOTAL, ORIGEM)
      VALUES (?, ?, ?, 1015, '1', ?, '', 100, 'manual')`);
    for (let i = 0; i < 45; i += 1) {
      inserirCard.run(CENARIO.boardCompras, fases.transito, `LOTE RN-010 ${i}`, U.ana, U.ana);
      const idCard = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
      criados.push(idCard);
      inserirNf.run(idCard, 91000 + i, 'A', emDias(-30 - i));
      inserirNf.run(idCard, 91000 + i, 'B', emDias(-30 - i));
    }

    const pendentes = linhas(await chamar('sgcNfsRecebimentoPendente', { cardId: 0, hoje: '' }, U.ana));
    const cards = [...new Set(pendentes.map((linha) => Number(linha.ID_CARD)))];
    assert.equal(cards.length, 30, 'o lote é de 30 PEDIDOS, não de 30 notas');
    for (const idCard of cards) {
      const noBanco = Number(db.prepare(
        "SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ? AND TRIM(COALESCE(DT_RECEBIMENTO, '')) = ''",
      ).get(idCard).N);
      const naResposta = pendentes.filter((linha) => Number(linha.ID_CARD) === idCard).length;
      assert.equal(naResposta, noBanco, `o pedido ${idCard} veio pela metade`);
    }

    db.prepare(`DELETE FROM SGC_NF WHERE ID_CARD IN (${criados.join(',')})`).run();
    db.prepare(`DELETE FROM KB_CARD WHERE ID IN (${criados.join(',')})`).run();
  });

  /* ─────────── T-085 (parte) — verificação sob demanda (RF-015) ─────────── */

  await teste('C-013: a verificação com o pedido T3 informado, pela sessão da analista, trata só as notas do T3 — as do T1 ficam exatamente como estavam', async () => {
    const antes90003 = nfDoBanco(90003);
    const resposta = await rodada(T3, U.ana);
    assert.equal(resposta.ok, true, resposta.error);
    assert.equal(Number(resposta.notas), 3, 'as 3 notas pendentes do T3, e nenhuma de outro pedido');
    assert.equal(Number(resposta.recebidas), 1, 'só a 90008 tinha entrada confirmada');

    const depois90003 = nfDoBanco(90003);
    assert.equal(depois90003.DT_RECEBIMENTO ?? '', antes90003.DT_RECEBIMENTO ?? '');
    assert.equal(depois90003.ALERTA_ATRASO_EM ?? '', antes90003.ALERTA_ATRASO_EM ?? '', 'a nota do T1 nem foi alertada');
  });

  /* ─────────── T-082 — recebimento (RF-008, RF-009) ─────────── */

  let rodada1 = null;

  await teste('C-006: depois da rodada, a NF 90005 fica com recebimento na data de entrada do ERP (ontem) e situação recebida; a consulta ao WinThor devolve mais de 0 linha para (1015, 90005)', async () => {
    rodada1 = await rodada(0);
    assert.equal(rodada1.ok, true, rodada1.error);

    const nota = acharNota(await notasDoCard(T2), 90005);
    assert.equal(nota.DT_RECEBIMENTO, emDias(-1));
    assert.equal(nota.SITUACAO, 'recebida');
    assert.equal(nfDoBanco(90005).NUMTRANSENT, 900005, 'o NUMTRANSENT do ERP é completado no vínculo');

    const doErp = linhas(await chamar('sgcWintNfEntradasConfirmadas', { codfornec: 1015, numnotas: '90005' }, U.ana));
    assert.ok(doErp.length > 0, 'consulta ao WinThor vazia não é verde');

    // R-045: a resposta da rodada conta notas de todas as suítes; o recorte é o desta spec.
    const minhas = Number(db.prepare(
      `SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD IN (${recorte}) AND NUMNOTA IN (90005, 90008) AND TRIM(COALESCE(DT_RECEBIMENTO, '')) <> ''`,
    ).get().N);
    assert.equal(minhas, 2, 'as duas notas com entrada confirmada nesta spec (90005 e 90008)');
  });

  await teste('C-007 / RN-004: a NF 90007 tem entrada no ERP COM cancelamento — continua pendente, e sgcWintNfEntradasConfirmadas(1042, 90007) devolve 0 linha', async () => {
    assert.equal(nfDoBanco(90007).DT_RECEBIMENTO ?? '', '');
    const doErp = linhas(await chamar('sgcWintNfEntradasConfirmadas', { codfornec: 1042, numnotas: '90007' }, U.ana));
    assert.equal(doErp.length, 0, 'DTCANCEL preenchido nunca é recebimento');
    // A linha existe no ERP: o que a descarta é a regra, não a ausência de dado.
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM PCNFENT WHERE NUMNOTA = 90007').get().N), 1);
  });

  await teste('C-008: a NF 90008 deu entrada na filial 1 (há 3 dias) e na filial 2 (ontem); o pedido é da filial 2, então o recebimento gravado é o de ontem', async () => {
    assert.equal(nfDoBanco(90008).DT_RECEBIMENTO, emDias(-1));
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM PCNFENT WHERE NUMNOTA = 90008').get().N), 2, 'as duas entradas continuam no ERP');
  });

  await teste('C-022: a NF 90006, registrada pelo número antes de entrar no ERP, tem previsão e situação normais e continua sem recebimento depois da rodada', async () => {
    const nota = acharNota(await notasDoCard(T3), 90006);
    assert.equal(nota.DT_PREVISAO, '2026-09-07');
    assert.equal(nota.SITUACAO, 'atrasada');
    assert.equal(nota.DT_RECEBIMENTO, '');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM PCNFENT WHERE NUMNOTA = 90006').get().N), 0);
  });

  /* ─────────── T-083 — conclusão do trânsito (RF-010..RF-012, RF-025) ─────────── */

  await teste('C-009: com a última nota entrando no ERP, o T2 vai sozinho para Faturamento — movimento com origem sistema em nome do primeiro responsável (gil), 1 nota no histórico e 1 aviso nf_recebida', async () => {
    assert.equal(faseDoCard(T2), fases.faturamento);
    const ultimo = movimentos(T2).at(-1);
    assert.equal(Number(ultimo.PARA_FASE_ID), fases.faturamento);
    assert.equal(ultimo.ORIGEM, 'sistema');
    assert.equal(Number(ultimo.USUARIO_ID), U.gil, 'o primeiro responsável assina o movimento');

    const notasDoHistorico = Number(db.prepare(
      "SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota'",
    ).get(T2).N);
    assert.ok(notasDoHistorico >= 1, 'o cron registra o que fez no histórico do card');

    assert.equal(Number(db.prepare(
      "SELECT COUNT(*) AS N FROM SGC_AVISO WHERE TIPO = 'nf_recebida' AND ID_CARD = ?",
    ).get(T2).N), 1);
  });

  await teste('C-010 / RF-012: o T1 continua em trânsito com 2 de 3 notas recebidas — uma nota pendente segura o pedido', async () => {
    assert.equal(faseDoCard(T1), fases.transito);
    const notas = await notasDoCard(T1);
    assert.equal(notas.length, 3);
    assert.equal(notas.filter((linha) => linha.SITUACAO === 'recebida').length, 2);
  });

  await teste('C-023 / RF-025: o T7 (2 notas que já nasceram recebidas, nenhuma pendente, nenhuma linha em PCNFENT) não aparece entre as pendentes e ainda assim é movido para Faturamento, com origem sistema em nome de gil e 1 aviso nf_recebida', async () => {
    const pendentes = linhas(await chamar('sgcNfsRecebimentoPendente', { cardId: 0, hoje: '' }, U.ana));
    assert.ok(!pendentes.some((linha) => Number(linha.ID_CARD) === T7), 'o T7 nunca é "tocado" por uma rodada');
    assert.equal(faseDoCard(T7), fases.faturamento);
    const ultimo = movimentos(T7).at(-1);
    assert.equal(ultimo.ORIGEM, 'sistema');
    assert.equal(Number(ultimo.USUARIO_ID), U.gil);
    assert.equal(Number(db.prepare(
      "SELECT COUNT(*) AS N FROM SGC_AVISO WHERE TIPO = 'nf_recebida' AND ID_CARD = ?",
    ).get(T7).N), 1);
  });

  await teste('RN-006: a segunda rodada não move o T2 nem o T7 de novo (um único movimento sistema cada); pedido em trânsito SEM nenhuma nota nunca move', async () => {
    db.prepare(`INSERT INTO KB_CARD
      (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
      VALUES (?, ?, 'TRANSITO SEM NOTA', 1, ?, '', '{}', 'transito sem nota', ?, '2026-09-15T08:00:00', '2026-09-15T08:00:00', '2026-09-15T08:00:00')`)
      .run(CENARIO.boardCompras, fases.transito, U.ana, U.ana);
    const semNota = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);

    const segunda = await rodada(0);
    assert.equal(segunda.ok, true, segunda.error);
    assert.equal(faseDoCard(semNota), fases.transito, 'sem nota não há o que concluir');
    for (const cardId of [T2, T7]) {
      const doSistema = movimentos(cardId).filter((linha) => linha.ORIGEM === 'sistema');
      assert.equal(doSistema.length, 1, `o card ${cardId} foi movido uma vez só`);
    }
    assert.equal(faseDoCard(T1), fases.transito, 'o T1 tem nota pendente e não move');

    db.prepare('DELETE FROM KB_CARD WHERE ID = ?').run(semNota);
  });

  /* ─────────── T-084 — avisos (RF-013, RF-014) ─────────── */

  await teste('C-011: contando só os pedidos desta spec, as notas vencidas geraram 5 avisos nf_atrasada — um por nota; a terceira rodada do mesmo dia continua em 5, não em 15', async () => {
    assert.equal(avisos('nf_atrasada'), 5, 'uma por nota vencida: 90003, 90006, 90011, 90012, 90013');
    const terceira = await rodada(0);
    assert.equal(terceira.ok, true, terceira.error);
    assert.equal(Number(terceira.atrasadas), 0, 'no mesmo dia, nenhuma nota alerta de novo');
    assert.equal(avisos('nf_atrasada'), 5);
  });

  await teste('RN-007: apagando o ALERTA_ATRASO_EM da 90011 e rodando de novo no MESMO dia, a CHAVE do aviso segura — a contagem continua em 5', async () => {
    db.prepare("UPDATE SGC_NF SET ALERTA_ATRASO_EM = '' WHERE NUMNOTA = 90011").run();
    const nova = await rodada(0);
    assert.equal(nova.ok, true, nova.error);
    assert.equal(Number(nova.atrasadas), 1, 'a nota voltou a ser candidata (a trava da nota foi apagada)');
    assert.equal(avisos('nf_atrasada'), 5, 'a segunda trava — a CHAVE única do dia — não deixa duplicar');
    assert.equal(String(nfDoBanco(90011).ALERTA_ATRASO_EM).slice(0, 10), HOJE, 'a marca do dia volta para a nota');
  });

  await teste('RN-008: o aviso de chegada é gravado uma vez por pedido movido, endereçado aos responsáveis (PARA_USUARIO_ID = 0)', async () => {
    const linha = db.prepare("SELECT * FROM SGC_AVISO WHERE TIPO = 'nf_recebida' AND ID_CARD = ?").get(T2);
    assert.equal(Number(linha.PARA_USUARIO_ID), 0);
    assert.equal(linha.PARA_PERSONA ?? '', '');
    assert.equal(linha.CHAVE, `nf_recebida:${T2}:${HOJE}`);
    assert.equal(avisos('nf_recebida'), 2, 'T2 e T7, um aviso cada');
  });

  /* ─────────── T-085 (resto) — uma consulta por fornecedor e falha isolada ─────────── */

  await teste('RN-009 / RNF-002: a rodada agrupa as notas pendentes por fornecedor e faz UMA consulta ao ERP por fornecedor, com todas as notas dele num `numnotas` só', async () => {
    espiaoErp();
    const pendentes = linhas(await chamar('sgcNfsRecebimentoPendente', { cardId: 0, hoje: '' }, U.ana));
    const fornecedores = [...new Set(pendentes.map((linha) => Number(linha.CODFORNEC)))];
    await rodada(0);
    const consultas = consultasAoErp();
    assert.equal(consultas.length, fornecedores.length, 'uma consulta por fornecedor, nunca por nota nem por pedido');
    for (const consulta of consultas) {
      const doFornecedor = pendentes.filter((linha) => Number(linha.CODFORNEC) === Number(consulta.CODFORNEC));
      assert.equal(String(consulta.NUMNOTAS).split(',').length, doFornecedor.length, 'todas as notas do fornecedor numa lista só');
    }
    restaurarErp();
  });

  await teste('C-014 / RNF-006: com o WinThor falhando para o fornecedor 1042, a rodada grava o recebimento do 1015 (90003), devolve 1 erro com o código 1042 e não sobrescreve nada do 1042', async () => {
    // A 90003 passa a ter entrada confirmada no ERP: é a nota do 1015 que a rodada deve gravar.
    db.prepare(`INSERT INTO PCNFENT (NUMTRANSENT, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, DTEMISSAO, DTENT, DTCANCEL, VLTOTAL, CHAVENFE, PRAZO, ESPECIE)
      VALUES (900003, 90003, '1', 1015, '1', ?, ?, NULL, 5000, '', 30, 'NF')`).run(emDias(-20), emDias(-1));
    const do1042Antes = db.prepare(
      "SELECT COUNT(*) AS N FROM SGC_NF WHERE CODFORNEC = 1042 AND TRIM(COALESCE(DT_RECEBIMENTO, '')) <> ''",
    ).get().N;

    espiaoErp(1042);
    const resposta = await rodada(0);
    restaurarErp();

    assert.equal(resposta.ok, true, resposta.error);
    assert.equal(nfDoBanco(90003).DT_RECEBIMENTO, emDias(-1), 'o fornecedor que respondeu foi gravado');
    const erros1042 = resposta.erros.filter((erro) => Number(erro.codfornec) === 1042);
    assert.equal(erros1042.length, 1, 'a falha do fornecedor é registrada, uma vez');
    assert.match(String(erros1042[0].erro), /WinThor/);
    assert.equal(Number(db.prepare(
      "SELECT COUNT(*) AS N FROM SGC_NF WHERE CODFORNEC = 1042 AND TRIM(COALESCE(DT_RECEBIMENTO, '')) <> ''",
    ).get().N), Number(do1042Antes), 'nada do fornecedor que falhou foi sobrescrito');
  });

  /* ─────────── T-087 — perfis (RF-023, RF-024) ─────────── */

  await teste('C-020 / RN-012: a verificação chamada por leo (comercial) e por dora (diretoria) é recusada sem gravar nada; sgcEscNfRecebimento com o comercial como autor não altera linha nenhuma', async () => {
    const antes = recebidasNoRecorte();
    for (const usuario of [U.leo, U.dora]) {
      const resposta = await rodada(0, usuario);
      assert.equal(resposta.ok, false, 'perfil sem direito de operar');
      assert.match(String(resposta.error), /perfil/i);
    }
    assert.equal(recebidasNoRecorte(), antes, 'recusa não grava');

    const alvo = nfDoBanco(90006);
    await chamar('sgcEscNfRecebimento', {
      idNf: alvo.ID, dtRecebimento: HOJE, numtransent: 0, chavenfe: '', usuarioId: U.leo,
    }, 0);
    assert.equal(nfDoBanco(90006).DT_RECEBIMENTO ?? '', '', 'a guarda de persona recusa fora da tela também');

    await chamar('sgcEscNfAlertaAtraso', { idNf: alvo.ID, alertaEm: '2030-01-01T00:00:00', usuarioId: U.leo }, 0);
    assert.notEqual(String(nfDoBanco(90006).ALERTA_ATRASO_EM).slice(0, 4), '2030');
  });

  /* ─────────── T-088 — conclusão do pedido (RF-022) ─────────── */

  await teste('C-019 / RN-013: concluir o F6 com uma comparação de NF sem decisão é recusado pelo servidor, com o motivo da pendência (pendencias-conclusao-nf.sql no sgcPodeMover)', async () => {
    assert.ok(String(byName.get('sgcPodeMover')?.code ?? '').includes('SGC_NF_OCORRENCIA'), 'o gancho compõe o fragmento da 005');
    const pendentes = Number(db.prepare(
      "SELECT COUNT(*) AS N FROM SGC_NF_OCORRENCIA WHERE ID_CARD = ? AND DECISAO = 'pendente'",
    ).get(F6).N);
    assert.equal(pendentes, 1, 'o seed do F6 tem a ocorrência sem decisão de que C-019 depende');

    const recusa = linhas(await chamar('sgcPodeMover', {
      usuarioId: U.gil, cardId: F6, boardId: CENARIO.boardCompras, faseId: fases.concluido,
    }, U.gil))[0];
    assert.equal(Number(recusa.PODE), 0);
    assert.ok(String(recusa.MOTIVO).trim().length > 0, 'R-020: PODE = 0 nunca sai com motivo vazio');

    db.prepare("UPDATE SGC_NF_OCORRENCIA SET DECISAO = 'aceito' WHERE ID_CARD = ?").run(F6);
    const liberado = linhas(await chamar('sgcPodeMover', {
      usuarioId: U.gil, cardId: F6, boardId: CENARIO.boardCompras, faseId: fases.concluido,
    }, U.gil))[0];
    assert.equal(Number(liberado.PODE), 1);
    assert.equal(String(liberado.MOTIVO ?? '').trim(), '');
    db.prepare("UPDATE SGC_NF_OCORRENCIA SET DECISAO = 'pendente' WHERE ID_CARD = ?").run(F6);
  });

  db.exec('DROP TABLE IF EXISTS SMOKE_006_ERP');
}
