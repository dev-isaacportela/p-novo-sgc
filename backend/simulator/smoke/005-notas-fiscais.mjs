// Cenários C-001..C-028 e regras RN-001..RN-015 da spec 005 (notas fiscais e
// faturamento). Ver docs/specs/005-notas-fiscais-e-faturamento/plan.md §Testes.
//
// Tudo roda sobre as MESMAS definitions que o add-008-notas-fiscais.mjs
// publica, num banco descartável compartilhado com as outras suítes — por isso
// NENHUMA asserção de total usa literal absoluto (R-045): o recorte é por
// `ID_CARD IN (CARDS_005)`, por diferença antes/depois, ou contado no próprio
// banco. Pelo mesmo motivo a validade mínima do fornecedor é LIDA do cadastro
// dentro do teste (a suíte 001 a altera durante a execução), nunca suposta.

import { assert } from './base.mjs';
import { CARDS_005, DATAS_005 } from '../seed/005-notas-fiscais.mjs';
import { toSqlite } from '../mysql-dialect.mjs';
import { createRunner } from '../runtime.mjs';
import { ehWinthor } from '../winthor-oracle.mjs';
import { diasUteisEntre } from '../../lib/dias-uteis.mjs';

export async function suite(ctx) {
  const { db, byName, byId, chamar, teste, U, emails } = ctx;

  /* ── atalhos ── */

  const linhas = (resultado) => resultado.rows;
  const uma = (resultado) => resultado.rows[0];
  const um = (sql, ...args) => db.prepare(sql).get(...args);
  const todos = (sql, ...args) => db.prepare(sql).all(...args);
  const conta = (sql, ...args) => Number(um(sql, ...args).N);
  const idsDoSeed = Object.values(CARDS_005).join(', ');

  const ocorrenciasDe = (cardId) => todos('SELECT * FROM SGC_NF_OCORRENCIA WHERE ID_CARD = ? ORDER BY ID', cardId);
  const pedidoDe = (cardId) => um('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?', cardId);
  const cardDe = (cardId) => um('SELECT * FROM KB_CARD WHERE ID = ?', cardId);
  const respDe = (cardId) => todos('SELECT USUARIO_ID FROM KB_CARD_RESPONSAVEL WHERE CARD_ID = ? ORDER BY ID', cardId)
    .map((linha) => Number(linha.USUARIO_ID));
  /** R-047: o cron reenvia os quatro campos; título, prazo e responsáveis não podem sumir. */
  const fotoDoCard = (cardId) => {
    const card = cardDe(cardId);
    return { titulo: card.TITULO, prazo: card.PRAZO, responsaveis: respDe(cardId).join(',') };
  };
  const mesmaFoto = (antes, cardId, mensagem) => {
    const depois = fotoDoCard(cardId);
    assert.deepEqual(depois, antes, mensagem);
  };
  /** Montagem de cenário, não o que está sob teste (mesmo `emFase` da suíte 002). */
  const emFase = (cardId, faseId) => db.prepare('UPDATE KB_CARD SET FASE_ID = ? WHERE ID = ?').run(faseId, cardId);
  const faseIdDe = (chave) => Number(um('SELECT FASE_ID FROM SGC_FASE WHERE CHAVE = ?', chave).FASE_ID);

  const podeMover = async (usuarioId, cardId, chaveDestino) => uma(await chamar('sgcPodeMover', {
    usuarioId, cardId, boardId: Number(cardDe(cardId).BOARD_ID), faseId: faseIdDe(chaveDestino),
  }, usuarioId));

  const vincular = (cardId, nota, usuarioId = U.ana) => chamar('sgcNfVincular', {
    cardId, idSugestao: 0, numnota: nota.numnota, serie: nota.serie,
    codfornec: nota.codfornec, codfilial: nota.codfilial, origem: 'automatica', itensJson: '',
  }, usuarioId);

  const NF_7001 = { numnota: 7001, serie: '1', codfornec: 1015, codfilial: '1' };
  const NF_7002 = { numnota: 7002, serie: '1', codfornec: 1015, codfilial: '2' };
  const NF_7006 = { numnota: 7006, serie: '1', codfornec: 1042, codfilial: '1' };

  /* ─────────── T-080 — a rodada de detecção ─────────── */

  await teste('C-001 / C-002 / C-003 / C-004 / RN-010: a rodada de deteccao sugere a 7001 pelo numero do pedido (100/pedido) e a 7002 por semelhanca (88/heuristica), ignora a cancelada e a ja vinculada, e NAO vincula nada', async () => {
    const nfsAntes = conta('SELECT COUNT(*) AS N FROM SGC_NF');
    const rodada = await chamar('sgcNfDetectar', {}, 0);
    assert.equal(rodada.ok, true);
    assert.deepEqual(rodada.erros, [], 'RNF-006: nenhum grupo pode ter derrubado a rodada');

    // RNF-002: uma consulta ao ERP por fornecedor + filial, nunca por card.
    assert.equal(rodada.consultasErp, rodada.grupos, 'uma consulta ao ERP por grupo fornecedor+filial');
    assert.ok(rodada.grupos < rodada.cards, 'os cards do seed compartilham fornecedor e filial');

    // C-001: a nota emitida contra o NUMPED 998901 vale 100, origem `pedido`.
    const porPedido = todos('SELECT * FROM SGC_NF_SUGESTAO WHERE ID_CARD = ?', CARDS_005.enviadoComPedido);
    assert.equal(porPedido.length, 1, 'uma sugestao para o pedido com numero no ERP');
    assert.equal(Number(porPedido[0].NUMNOTA), 7001);
    assert.equal(Number(porPedido[0].SCORE), 100);
    assert.equal(porPedido[0].ORIGEM, 'pedido');
    assert.equal(porPedido[0].STATUS, 'sugerida');

    // C-002: sem NUMPED, 4 dos 5 produtos na nota, emissao 3 dias depois do
    // envio e valor dentro do saldo -> 48 + 20 + 20 = 88.
    const porSemelhanca = todos('SELECT * FROM SGC_NF_SUGESTAO WHERE ID_CARD = ?', CARDS_005.enviadoSemPedido);
    assert.equal(porSemelhanca.length, 1);
    assert.equal(Number(porSemelhanca[0].NUMNOTA), 7002);
    assert.equal(Number(porSemelhanca[0].SCORE), 88);
    assert.equal(porSemelhanca[0].ORIGEM, 'heuristica');
    assert.match(porSemelhanca[0].MOTIVO, /4 de 5/);

    // C-003 / C-004 / RN-015: a 7004 ja pertence a outro pedido e a 7003 esta
    // cancelada no ERP — nenhuma das duas vira sugestao de ninguem.
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF_SUGESTAO WHERE NUMNOTA IN (7003, 7004)'), 0);

    // RN-010: nada foi vinculado — a contagem de notas nao mudou.
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF'), nfsAntes, 'a deteccao nao vincula nota nenhuma');

    // D-008 / R-023: o cron grava aviso e nota do historico.
    assert.ok(conta('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = ?',
      CARDS_005.enviadoComPedido, 'nf_sugerida') > 0, 'aviso nf_sugerida do cron');
  });

  await teste('A-10 (revisão onda 2): o pedido em Produtos em B.O. entra na DETECCAO e recebe a sugestao da 7007 — R-041 tira do `bo` o aviso diario de faturamento, nao a busca de nota no ERP', async () => {
    const sugeridas = todos('SELECT * FROM SGC_NF_SUGESTAO WHERE ID_CARD = ?', CARDS_005.emBo);
    assert.equal(sugeridas.length, 1, 'a deteccao varria so enviado/transito/faturamento');
    assert.equal(Number(sugeridas[0].NUMNOTA), 7007);
    assert.equal(sugeridas[0].ORIGEM, 'pedido', 'casada pelo NUMPED 998909');
    assert.equal(Number(sugeridas[0].SCORE), 100);
  });

  await teste('A-1 (revisão onda 2): a segunda rodada de deteccao nao reprocessa sugestao que ja existe — 0 sugestoes novas, 0 avisos novos e 0 notas novas no historico (o INSERT era idempotente, kbNotaRegistrar nao)', async () => {
    const sugestoesAntes = conta(`SELECT COUNT(*) AS N FROM SGC_NF_SUGESTAO WHERE ID_CARD IN (${idsDoSeed})`);
    const avisosAntes = conta(`SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD IN (${idsDoSeed})`);
    const notasAntes = conta(`SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID IN (${idsDoSeed}) AND EVENTO = 'nota'`);

    const segunda = await chamar('sgcNfDetectar', {}, 0);
    assert.equal(segunda.ok, true);
    assert.deepEqual(segunda.erros, []);
    assert.equal(segunda.sugestoes, 0, 'o contador soma so o insert real');
    assert.equal(conta(`SELECT COUNT(*) AS N FROM SGC_NF_SUGESTAO WHERE ID_CARD IN (${idsDoSeed})`), sugestoesAntes);
    assert.equal(conta(`SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD IN (${idsDoSeed})`), avisosAntes);
    assert.equal(conta(`SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID IN (${idsDoSeed}) AND EVENTO = 'nota'`),
      notasAntes, 'a nota do historico so nasce com a sugestao');
  });

  await teste('C-004 / RN-015: sgcWintNfEntradas do 1015 traz linhas (> 0) e nenhuma delas e a 7003 cancelada, mesmo ela tendo o NUMPED do pedido', async () => {
    const candidatas = linhas(await chamar('sgcWintNfEntradas', {
      codfornec: 1015, codfilial: '1', dataEnvio: '2026-01-01', numpeds: '998901',
    }));
    assert.ok(candidatas.length > 0, 'consulta ao WinThor vazia nao e verde');
    assert.equal(candidatas.filter((linha) => Number(linha.NUMNOTA) === 7003).length, 0, 'nota cancelada fora');
    assert.ok(candidatas.some((linha) => Number(linha.NUMNOTA) === 7001), 'a 7001 e candidata');
  });

  await teste('C-003: vincular a nota 7004, que ja pertence a outro pedido, e recusado citando o pedido dono', async () => {
    const recusa = await chamar('sgcNfVincular', {
      cardId: CARDS_005.semNota, idSugestao: 0, numnota: 7004, serie: '1',
      codfornec: 1042, codfilial: '1', origem: 'automatica', itensJson: '',
    }, U.ana);
    assert.equal(recusa.ok, false);
    assert.match(recusa.erro, /ja esta vinculada/i);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ?', CARDS_005.semNota), 0);
  });

  /* ─────────── T-081 — sem candidata e registro pelo número ─────────── */

  await teste('C-005: o pedido sem nenhuma nota candidata abre a aba com listas vazias em UMA execucao (RNF-001)', async () => {
    const aba = await chamar('sgcNfListar', { cardId: CARDS_005.semNota }, U.ana);
    assert.equal(aba.ok, true);
    assert.deepEqual(aba.sugestoes, []);
    assert.deepEqual(aba.nfs, []);
    assert.deepEqual(aba.ocorrencias, []);
    assert.ok(aba.pedido, 'a capa do pedido vem na mesma execucao');
    assert.equal(Number(aba.pedido.CODFORNEC), 1042);
  });

  await teste('C-006 / RN-015: a busca hibrida acha a 7005 pelo numero SEM exigir entrada (DT_ENTRADA vazia), devolve serie, emissao, valor e os 2 itens, e nao acha a 7003 cancelada', async () => {
    const achadas = linhas(await chamar('sgcWintNfBuscar', { numnota: 7005, codfornec: 1015 }));
    assert.equal(achadas.length, 1);
    assert.equal(String(achadas[0].DT_ENTRADA ?? ''), '', 'a nota faturada ainda nao entrou no armazem');
    assert.equal(achadas[0].DT_EMISSAO, DATAS_005.emissao7005);
    assert.equal(Number(achadas[0].VL_TOTAL), 8000);

    const itens = linhas(await chamar('sgcWintNfItens', { numnota: 7005, serie: '', codfornec: 1015 }));
    assert.equal(itens.length, 2, 'os 2 itens da nota, com lote e validade');
    assert.ok(itens.every((item) => item.NUMLOTE && item.DT_VALIDADE));

    const cancelada = linhas(await chamar('sgcWintNfBuscar', { numnota: 7003, codfornec: 1015 }));
    assert.equal(cancelada.length, 0, 'nota cancelada nao aparece nem na busca por numero');
  });

  /* ─────────── T-082 — validar, item não pedido e recusa ─────────── */

  let ocorrenciaRecusada = 0;

  await teste('C-007: validar a sugestao da 7001 grava 1 nota, 3 itens e 15 conferencias pendentes (4 por item + 3 de pedido) e 1 linha no historico do pedido', async () => {
    const card = CARDS_005.enviadoComPedido;
    const notasAntes = conta('SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = ?', card, 'nota');
    const resultado = await vincular(card, NF_7001);
    assert.equal(resultado.ok, true, resultado.erro);

    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ?', card), 1);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF_ITEM WHERE ID_CARD = ?', card), 3);
    const ocorrencias = ocorrenciasDe(card);
    assert.equal(ocorrencias.length, 15, '4 conferencias por item mais as 3 de pedido');
    assert.ok(ocorrencias.every((o) => o.DECISAO === 'pendente'), 'toda conferencia nasce pendente');
    assert.equal(conta('SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = ?', card, 'nota'),
      notasAntes + 1, 'o vinculo vira linha no historico do pedido');
  });

  await teste('C-009: o item 9999 da 7002, que nao casa por codigo, codigo de fabrica nem codigo de barras, vira 1 conferencia item_nao_pedido divergente', async () => {
    const card = CARDS_005.enviadoSemPedido;
    const resultado = await vincular(card, NF_7002);
    assert.equal(resultado.ok, true, resultado.erro);
    const naoPedido = ocorrenciasDe(card).filter((o) => o.TIPO === 'item_nao_pedido' && Number(o.CODPROD) === 9999);
    assert.equal(naoPedido.length, 1);
    assert.equal(naoPedido[0].RESULTADO, 'divergente');
    assert.match(naoPedido[0].VALOR_ENCONTRADO, /nenhum codigo/);
  });

  await teste('C-016 / RF-013: recusar com 9 caracteres e negado, com 10 grava decisao, autor e data — e a nota continua vinculada nos dois casos', async () => {
    const card = CARDS_005.enviadoComPedido;
    const divergente = ocorrenciasDe(card).filter((o) => o.RESULTADO === 'divergente')[0];
    assert.ok(divergente, 'a 7001 tem conferencia divergente (preco 1,5 % acima)');
    ocorrenciaRecusada = Number(divergente.ID);

    const curta = await chamar('sgcOcorrenciaDecidir', {
      cardId: card, idOcorrencia: ocorrenciaRecusada, modo: 'individual',
      decisao: 'recusado', justificativa: '123456789',
    }, U.ana);
    assert.equal(curta.ok, false);
    assert.match(curta.erro, /10 caracteres/);
    assert.equal(um('SELECT DECISAO FROM SGC_NF_OCORRENCIA WHERE ID = ?', ocorrenciaRecusada).DECISAO, 'pendente');
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ?', card), 1, 'a nota segue vinculada');

    const aceita = await chamar('sgcOcorrenciaDecidir', {
      cardId: card, idOcorrencia: ocorrenciaRecusada, modo: 'individual',
      decisao: 'recusado', justificativa: 'Preco acima do negociado, cobranca aberta com a industria.',
    }, U.ana);
    assert.equal(aceita.ok, true, aceita.erro);
    assert.equal(aceita.decididas, 1);
    const gravada = um('SELECT * FROM SGC_NF_OCORRENCIA WHERE ID = ?', ocorrenciaRecusada);
    assert.equal(gravada.DECISAO, 'recusado');
    assert.equal(Number(gravada.DECIDIDO_POR), U.ana);
    assert.ok(gravada.DECIDIDO_EM, 'a decisao guarda a data');
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ?', card), 1, 'RF-013: divergencia nao desfaz o vinculo');
  });

  /* ─────────── T-083 — as sete regras, do lado do servidor ─────────── */

  await teste('C-010: as tres conferencias de preco da 7001 saem conforme (10,0000), atencao (20,1600 = 0,8 %) e divergente (30,4500 = 1,5 %)', async () => {
    const precos = ocorrenciasDe(CARDS_005.enviadoComPedido).filter((o) => o.TIPO === 'preco_divergente');
    assert.equal(precos.length, 3);
    const por = (codprod) => precos.filter((o) => Number(o.CODPROD) === codprod)[0];
    assert.equal(por(5001).RESULTADO, 'conforme');
    assert.equal(Number(por(5001).DELTA_PERC), 0);
    assert.equal(por(9001).RESULTADO, 'atencao');
    assert.equal(Number(por(9001).DELTA_PERC), 0.008);
    assert.equal(por(9002).RESULTADO, 'divergente');
    assert.equal(Number(por(9002).DELTA_PERC), 0.015);
  });

  await teste('C-008 / RN-003: o item casa por codigo de fabrica e por codigo de barras, nessa ordem, e as duas conferencias ficam em atencao citando o codigo', async () => {
    const casamentos = ocorrenciasDe(CARDS_005.enviadoComPedido).filter((o) => o.TIPO === 'item_nao_pedido');
    const por = (codprod) => casamentos.filter((o) => Number(o.CODPROD) === codprod)[0];
    assert.equal(por(5001).RESULTADO, 'conforme', 'casou pelo proprio codigo do produto');
    assert.equal(por(9001).RESULTADO, 'atencao');
    assert.match(por(9001).VALOR_ENCONTRADO, /codigo de fabrica FK-123/);
    assert.equal(por(9002).RESULTADO, 'atencao');
    assert.match(por(9002).VALOR_ENCONTRADO, /codigo de barras 7891234567890/);
    const itens = todos('SELECT CODPROD, CASADO_POR FROM SGC_NF_ITEM WHERE ID_CARD = ? ORDER BY CODPROD',
      CARDS_005.enviadoComPedido);
    assert.deepEqual(itens.map((i) => i.CASADO_POR), ['codprod', 'codfab', 'ean']);
  });

  await teste('C-011 / RN-005: a validade e medida contra o cadastro do fornecedor (lido aqui, nunca suposto) — no 1015 o lote de 143 dias e o de 81 caem de lados diferentes da regua; no 1042 os dois sao divergentes', async () => {
    const minimo1015 = Number(um('SELECT VALIDADE_MINIMA_DIAS AS N FROM SGC_FORNECEDOR WHERE CODFORNEC = 1015').N);
    const minimo1042 = Number(um('SELECT VALIDADE_MINIMA_DIAS AS N FROM SGC_FORNECEDOR WHERE CODFORNEC = 1042').N);
    assert.ok(minimo1015 > 0 && minimo1042 > 0, 'o cadastro da 001 e a fonte do minimo');

    const validades = ocorrenciasDe(CARDS_005.enviadoComPedido).filter((o) => o.TIPO === 'validade_curta');
    assert.equal(validades.length, 3);
    const por = (codprod) => validades.filter((o) => Number(o.CODPROD) === codprod)[0];
    assert.equal(por(5001).VALOR_ENCONTRADO, '143 dias');
    assert.equal(por(5001).RESULTADO, 143 >= minimo1015 ? 'conforme' : 'divergente');
    assert.equal(por(9001).VALOR_ENCONTRADO, '81 dias');
    assert.equal(por(9001).RESULTADO, 81 >= minimo1015 ? 'conforme' : 'divergente');
    assert.equal(por(5001).VALOR_ESPERADO, `${minimo1015} dias`);

    const resultado = await vincular(CARDS_005.validade1042, NF_7006);
    assert.equal(resultado.ok, true, resultado.erro);
    const do1042 = ocorrenciasDe(CARDS_005.validade1042).filter((o) => o.TIPO === 'validade_curta');
    assert.equal(do1042.length, 2);
    assert.deepEqual(do1042.map((o) => o.VALOR_ENCONTRADO).sort(), ['143 dias', '81 dias']);
    assert.ok(do1042.every((o) => o.RESULTADO === (Number(o.VALOR_ENCONTRADO.split(' ')[0]) >= minimo1042 ? 'conforme' : 'divergente')));
    assert.equal(minimo1042, 180, 'R-043: o 1042 e o fornecedor com minimo proprio de 180 dias');
    assert.ok(do1042.every((o) => o.RESULTADO === 'divergente'), 'com 180 dias, 143 e 81 sao os dois curtos');
  });

  await teste('C-013 / RN-007: sgcWintNfParcelas da 7001 devolve 3 duplicatas (> 0) em 28/35/42 dias e a conferencia de prazo fica conforme; a 7005, com 30/60, seria divergente contra 28/35/42', async () => {
    const parcelas = linhas(await chamar('sgcWintNfParcelas', { numnota: 7001, codfornec: 1015 }));
    assert.equal(parcelas.length, 3);
    assert.deepEqual(parcelas.map((p) => Number(p.DIAS)), [28, 35, 42]);

    const prazo = ocorrenciasDe(CARDS_005.enviadoComPedido).filter((o) => o.TIPO === 'prazo_divergente')[0];
    assert.equal(prazo.RESULTADO, 'conforme');
    assert.equal(prazo.VALOR_ESPERADO, '28/35/42');
    assert.equal(prazo.VALOR_ENCONTRADO, '28/35/42');

    const outras = linhas(await chamar('sgcWintNfParcelas', { numnota: 7005, codfornec: 1015 }));
    assert.deepEqual(outras.map((p) => Number(p.DIAS)), [30, 60], 'a 7005 vence em 30 e 60 dias');
  });

  /* ─────────── T-084 — faturamento e espelho da capa (caminho de tela) ─────────── */

  await teste('C-014 / C-019 / RN-008: depois do vinculo o pedido tem 60 % em valor e 60 % em quantidade, saldo de 48.000,00 e a data do primeiro faturamento; a tela espelha a capa por kbCardAtualizar sem apagar titulo, prazo nem responsaveis (R-047)', async () => {
    const card = CARDS_005.enviadoComPedido;
    const pedido = pedidoDe(card);
    assert.equal(Number(pedido.VL_FATURADO), 72000);
    assert.equal(Number(pedido.PERC_FATURADO_VALOR), 60);
    assert.equal(Number(pedido.PERC_FATURADO_QTD), 60, '1.200 de 2.000 unidades casadas');
    assert.equal(pedido.DT_PRIMEIRO_FATURAMENTO, DATAS_005.emissao7001);
    assert.equal(Number(pedido.VL_TOTAL) - Number(pedido.VL_FATURADO), 48000);

    const valorTotal = ocorrenciasDe(card).filter((o) => o.TIPO === 'valor_total_divergente')[0];
    assert.equal(valorTotal.RESULTADO, 'conforme', 'o faturado nao passou do pedido');
    const percentual = ocorrenciasDe(card).filter((o) => o.TIPO === 'percentual_faturado')[0];
    assert.match(percentual.VALOR_ENCONTRADO, /60 % em valor, 60 % em quantidade/);

    // Caminho de TELA (com sessão): o mesmo kbCardAtualizar de capa-do-quadro.ts.
    const antes = fotoDoCard(card);
    const texto = 'R$ 72.000,00 (60 %) · saldo R$ 48.000,00';
    const espelho = await chamar('kbCardAtualizar', {
      cardId: card, titulo: antes.titulo, valoresJson: JSON.stringify({ faturamento: texto }),
      responsaveisIds: antes.responsaveis, prazo: antes.prazo,
    }, U.ana);
    assert.equal(espelho.ok, true, espelho.error);
    assert.equal(JSON.parse(cardDe(card).VALORES_JSON).faturamento, texto);
    mesmaFoto(antes, card, 'R-047: o espelho da tela reenvia os quatro campos e nao apaga nada');
  });

  /* ─────────── T-086 — entrada em Trânsito ─────────── */

  await teste('C-017 / RN-012: o pedido sem nota nao entra em Em Transito para BN, com a frase exata do fragmento; com uma nota vinculada, libera', async () => {
    const semNota = await podeMover(U.ana, CARDS_005.semNota, 'transito');
    assert.equal(Number(semNota.PODE), 0);
    assert.equal(semNota.MOTIVO, 'Vincule ao menos uma nota fiscal ao pedido antes de mover para Em Trânsito para BN.');

    const comNota = await podeMover(U.ana, CARDS_005.enviadoComPedido, 'transito');
    assert.equal(Number(comNota.PODE), 1);
    assert.equal(comNota.MOTIVO, '', 'R-020: MOTIVO vazio quando PODE = 1');
  });

  /* ─────────── T-087 — a rodada diária de cobrança ─────────── */

  await teste('C-020 / C-021 / C-022 / C-023 / C-028 / RN-009 / RN-014: a rodada diaria encerra o pedido 100 % faturado, avisa aos 3 e aos 5 dias uteis (com o segundo aviso a gerencia), repete uma vez por dia acima de 5, PULA o pedido em B.O. e nao envia e-mail nenhum — com titulo, prazo e responsaveis intactos (R-047)', async () => {
    const fotos = {};
    for (const chave of Object.keys(CARDS_005)) fotos[chave] = fotoDoCard(CARDS_005[chave]);
    const emailsAntes = emails.length;

    const primeira = await chamar('sgcFaturamentoMonitorar', {}, 0);
    assert.equal(primeira.ok, true);
    assert.deepEqual(primeira.erros, []);

    // C-020: 100 % em valor encerra — nivel zerado, nenhum aviso, fora da lista.
    assert.ok(primeira.encerrados >= 1);
    assert.equal(Number(pedidoDe(CARDS_005.cemPorCento).ALERTA_FATURAMENTO_NIVEL), 0);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ?', CARDS_005.cemPorCento), 0);
    const pendentes = linhas(await chamar('sgcFaturamentoPendenteListar',
      { faixa: '', busca: '', hoje: DATAS_005.hoje, limite: 500, offset: 0 }, U.gil));
    assert.equal(pendentes.filter((l) => Number(l.ID_CARD) === CARDS_005.cemPorCento).length, 0);

    // C-021: 3 dias uteis -> aviso aos responsaveis, nivel 3 e nota no historico.
    const tres = todos('SELECT * FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = ?', CARDS_005.enviadoComPedido, 'faturamento_3');
    assert.equal(tres.length, 1);
    assert.equal(Number(tres[0].PARA_USUARIO_ID), 0, 'PARA_USUARIO_ID 0 = responsaveis do card');
    assert.match(tres[0].TEXTO, /3 dias uteis/);
    assert.match(tres[0].TEXTO, /Fresenius Kabi/);
    assert.equal(tres[0].CHAVE, `faturamento_3:${CARDS_005.enviadoComPedido}:${DATAS_005.hoje}`);
    assert.equal(Number(pedidoDe(CARDS_005.enviadoComPedido).ALERTA_FATURAMENTO_NIVEL), 3);
    assert.ok(conta('SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = ?',
      CARDS_005.enviadoComPedido, 'nota') > 0);

    // C-022: 5 dias uteis -> dois avisos, o segundo para a persona gestor.
    const cinco = todos('SELECT * FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = ? ORDER BY ID',
      CARDS_005.enviadoSemPedido, 'faturamento_5');
    assert.equal(cinco.length, 2);
    assert.equal(cinco.filter((a) => a.PARA_PERSONA === 'gestor').length, 1);
    assert.equal(cinco.filter((a) => a.PARA_PERSONA === 'gestor')[0].CHAVE,
      `faturamento_5:${CARDS_005.enviadoSemPedido}:${DATAS_005.hoje}:gestor`);
    assert.equal(Number(pedidoDe(CARDS_005.enviadoSemPedido).ALERTA_FATURAMENTO_NIVEL), 5);

    // C-028 / R-041: o pedido em B.O. tem o aviso diario da 007 — a rodada de
    // faturamento nao cria nenhum para ele, mas ele CONTINUA na lista.
    assert.ok(primeira.pulados >= 1);
    // Só os avisos de FATURAMENTO: depois do A-10 o card em B.O. entra na
    // detecção e pode ter um `nf_sugerida`, que é de outra rotina.
    assert.equal(conta("SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO LIKE 'faturamento%'",
      CARDS_005.emBo), 0);
    const emBo = pendentes.filter((l) => Number(l.ID_CARD) === CARDS_005.emBo)[0];
    assert.ok(emBo, 'o pedido em B.O. continua na lista de faturamentos pendentes');
    assert.ok(emBo.DT_PREVISAO_BO, 'com a previsao de liberacao');
    assert.equal(Number(emBo.QT_BO_ABERTO), 2, 'e a contagem de itens em aberto');

    // C-023 / RN-009: a segunda rodada no mesmo dia nao cria aviso novo.
    const diarios = conta('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = ?',
      CARDS_005.atrasadoNove, 'faturamento_diario');
    assert.equal(diarios, 1);
    assert.equal(um('SELECT CHAVE FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = ?',
      CARDS_005.atrasadoNove, 'faturamento_diario').CHAVE,
    `faturamento_diario:${CARDS_005.atrasadoNove}:${DATAS_005.hoje}`);
    const segunda = await chamar('sgcFaturamentoMonitorar', {}, 0);
    assert.equal(segunda.ok, true);
    assert.equal(segunda.avisos, 0, 'nenhum aviso novo na segunda rodada do mesmo dia');
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = ?',
      CARDS_005.atrasadoNove, 'faturamento_diario'), 1);

    // RN-014 / RNF-003: a rotina diaria nao envia e-mail nenhum.
    assert.equal(emails.length, emailsAntes, 'a rodada de cobranca nao dispara e-mail');

    // R-047: depois das DUAS rodadas, os quatro campos do card continuam os do seed.
    for (const chave of Object.keys(CARDS_005)) {
      mesmaFoto(fotos[chave], CARDS_005[chave], `R-047: o cron nao pode apagar nada do card ${chave}`);
    }
    // C-019 pelo caminho do CRON: kbCardAtualizar por id, com atualizadoPor e origem sistema.
    assert.match(JSON.parse(cardDe(CARDS_005.atrasadoNove).VALORES_JSON).faturamento || '',
      /Faturamento pendente · 9 dias úteis/, 'a capa do cartao recebe a linha de faturamento pelo cron');
  });

  await teste('A-9 (revisão onda 2): o cron reenvia os responsaveis na ordem de KB_CARD_RESPONSAVEL.ORDEM — por R.ID, o kbCardAtualizar do espelho da capa regravaria ORDEM = posicao e trocaria "quem processa" nas 006/007', async () => {
    const card = CARDS_005.enviadoComPedido;
    const ordenados = () => todos('SELECT USUARIO_ID FROM KB_CARD_RESPONSAVEL WHERE CARD_ID = ? ORDER BY ORDEM, ID', card)
      .map((linha) => Number(linha.USUARIO_ID));
    assert.deepEqual(ordenados(), [U.ana, U.gil], 'o seed grava ana e depois gil');

    // Montagem de cenário: alguém reordenou na tela — gil passa a ser o
    // primeiro sem que o ID das linhas mude. E a capa precisa MUDAR, senão o
    // espelho nem chama a lib.
    db.prepare('UPDATE KB_CARD_RESPONSAVEL SET ORDEM = 2 WHERE CARD_ID = ? AND USUARIO_ID = ?').run(card, U.ana);
    db.prepare('UPDATE KB_CARD_RESPONSAVEL SET ORDEM = 1 WHERE CARD_ID = ? AND USUARIO_ID = ?').run(card, U.gil);
    const valores = JSON.parse(cardDe(card).VALORES_JSON || '{}');
    delete valores.faturamento;
    db.prepare('UPDATE KB_CARD SET VALORES_JSON = ? WHERE ID = ?').run(JSON.stringify(valores), card);
    assert.deepEqual(ordenados(), [U.gil, U.ana]);

    const rodada = await chamar('sgcFaturamentoMonitorar', {}, 0);
    assert.equal(rodada.ok, true);
    assert.deepEqual(rodada.erros, []);
    assert.ok(JSON.parse(cardDe(card).VALORES_JSON).faturamento, 'o espelho da capa rodou de verdade');
    assert.deepEqual(ordenados(), [U.gil, U.ana], 'a ordem dos responsaveis sobrevive ao cron');

    db.prepare('UPDATE KB_CARD_RESPONSAVEL SET ORDEM = 1 WHERE CARD_ID = ? AND USUARIO_ID = ?').run(card, U.ana);
    db.prepare('UPDATE KB_CARD_RESPONSAVEL SET ORDEM = 2 WHERE CARD_ID = ? AND USUARIO_ID = ?').run(card, U.gil);
  });

  await teste('A-2 (revisão onda 2): pedido cujo 1º responsavel e o comercial nao conta como avisado — a escrita por id guardada pela persona casa 0 linhas e volta COMPLETED; entra em erros[] e ALERTA_FATURAMENTO_NIVEL/_EM ficam como estavam', async () => {
    const card = CARDS_005.faturamentoParcial;
    const antes = pedidoDe(card);
    const avisosAntes = conta('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ?', card);

    // Montagem de cenário: leo (comercial) vira o único responsável e a marca
    // do dia sai, para o cron olhar este card de novo.
    db.prepare('DELETE FROM KB_CARD_RESPONSAVEL WHERE CARD_ID = ?').run(card);
    db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, 1)').run(card, U.leo);
    db.prepare("UPDATE SGC_PEDIDO SET ALERTA_FATURAMENTO_NIVEL = 0, ALERTA_FATURAMENTO_EM = '' WHERE ID_CARD = ?").run(card);

    const rodada = await chamar('sgcFaturamentoMonitorar', {}, 0);
    assert.equal(rodada.ok, true);
    assert.equal(rodada.avisos, 0, 'nada foi gravado, nada e contado como aviso');
    const meus = rodada.erros.filter((erro) => Number(erro.card) === card);
    assert.equal(meus.length, 1, 'o card sem persona operante aparece em erros[]');
    assert.match(meus[0].erro, /persona operante/);

    const depois = pedidoDe(card);
    assert.equal(Number(depois.ALERTA_FATURAMENTO_NIVEL), 0, 'o nivel continua como estava');
    assert.equal(String(depois.ALERTA_FATURAMENTO_EM || ''), '', 'e a data do ultimo aviso tambem');
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ?', card), avisosAntes,
      'sem a marca, o aviso nao nasce — senao repetiria todo dia');

    db.prepare('DELETE FROM KB_CARD_RESPONSAVEL WHERE CARD_ID = ?').run(card);
    db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, 1)').run(card, U.ana);
    db.prepare('UPDATE SGC_PEDIDO SET ALERTA_FATURAMENTO_NIVEL = ?, ALERTA_FATURAMENTO_EM = ? WHERE ID_CARD = ?')
      .run(antes.ALERTA_FATURAMENTO_NIVEL, antes.ALERTA_FATURAMENTO_EM, card);
  });

  /* ─────────── T-088 — contatos, cobrança e a lista consolidada ─────────── */

  await teste('C-024: dois contatos novos no mesmo pedido preservam o anterior, saem do mais novo para o mais antigo e aparecem na lista de pendentes', async () => {
    const card = CARDS_005.atrasadoNove;
    const antes = conta('SELECT COUNT(*) AS N FROM SGC_CONTATO_FATURAMENTO WHERE ID_CARD = ?', card);
    for (const [quando, resumo] of [['2026-09-01T09:00:00', 'Liguei para a industria, sem previsao.'],
      ['2026-09-02T09:00:00', 'Industria prometeu faturar em 20/09.']]) {
      const gravado = await chamar('sgcEscContatoInserir', {
        cardId: card, dtContato: quando, canalContato: 'telefone', resumo,
        previsao: '2026-09-20', criadoEm: quando,
      }, U.ana);
      assert.ok(gravado, 'a escrita de tela devolve resposta');
    }
    const lista = linhas(await chamar('sgcContatosListar', { cardId: card, limite: 50, offset: 0 }, U.ana));
    assert.equal(lista.length, antes + 2, 'os contatos anteriores continuam la');
    assert.ok(lista[0].DT_CONTATO >= lista[1].DT_CONTATO, 'do mais novo para o mais antigo');
    assert.equal(lista[0].REGISTRADO_NOME, 'Ana Analista');

    const pendentes = linhas(await chamar('sgcFaturamentoPendenteListar',
      { faixa: '', busca: '', hoje: DATAS_005.hoje, limite: 500, offset: 0 }, U.gil));
    const linha = pendentes.filter((l) => Number(l.ID_CARD) === card)[0];
    assert.equal(Number(linha.QT_CONTATOS), antes + 2);
    assert.equal(linha.DT_ULTIMO_CONTATO, lista[0].DT_CONTATO);
  });

  await teste('C-025 / RN-014: a cobranca manual envia 1 e-mail para o contato do fornecedor COM copia fixa para compras@benenutri.com e grava 1 comunicacao do tipo cobranca — e so com o clique', async () => {
    const card = CARDS_005.atrasadoNove;
    const emailsAntes = emails.length;
    const comunicacoesAntes = conta('SELECT COUNT(*) AS N FROM SGC_COMUNICACAO WHERE ID_CARD = ?', card);

    const enviado = await chamar('sgcCobrancaEnviar', {
      cardId: card, para: 'captacao.pedidos@fresenius-kabi.com',
      assunto: 'Faturamento pendente', corpo: 'Bom dia, o pedido segue sem faturamento.',
    }, U.ana);
    assert.equal(enviado.ok, true, enviado.erro);
    assert.deepEqual(enviado.destinatarios, ['captacao.pedidos@fresenius-kabi.com', 'compras@benenutri.com']);
    assert.equal(emails.length, emailsAntes + 1);
    assert.deepEqual(emails[emails.length - 1].to, enviado.destinatarios);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_COMUNICACAO WHERE ID_CARD = ? AND TIPO = ?', card, 'cobranca'),
      1, 'a cobranca vira comunicacao do pedido');
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_COMUNICACAO WHERE ID_CARD = ?', card), comunicacoesAntes + 1);
    // D-005: o JS NAO grava o contato — quem grava e a tela, com :VAR_USER.
    assert.ok(enviado.comunicacaoId > 0);
  });

  await teste('C-026: os 9 pedidos pendentes deste seed aparecem na listagem e as quatro faixas os recortam em 2 / 4 / 1 / 2 — contagem sempre sobre os cards da propria spec (R-045), e o total conferido por diferenca', async () => {
    const doSeed = (lista) => lista.filter((linha) => Object.values(CARDS_005).includes(Number(linha.ID_CARD)));
    const listar = async (faixa, busca = '') => doSeed(linhas(await chamar('sgcFaturamentoPendenteListar',
      { faixa, busca, hoje: DATAS_005.hoje, limite: 500, offset: 0 }, U.gil)));

    const todosPendentes = await listar('');
    assert.equal(todosPendentes.length, 9, 'notaDeOutro e cemPorCento estao em 100 % e ficam fora');
    assert.equal((await listar('sem_contato')).length, 2);
    assert.equal((await listar('3')).length, 4);
    assert.equal((await listar('5')).length, 1);
    assert.equal((await listar('mais5')).length, 2);

    // O total absoluto e do banco inteiro (as outras suites tambem semeiam):
    // confere por DIFERENCA, contando as linhas do proprio seed no banco.
    const total = Number(uma(await chamar('sgcFaturamentoPendenteListarTotal',
      { faixa: '', busca: '', hoje: DATAS_005.hoje }, U.gil)).TOTAL);
    const doSeedNoBanco = conta(
      `SELECT COUNT(*) AS N FROM KB_CARD C JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
       WHERE C.ID IN (${idsDoSeed}) AND COALESCE(P.PERC_FATURADO_VALOR, 0) < 100`);
    assert.equal(doSeedNoBanco, 9);
    assert.ok(total >= doSeedNoBanco, 'o total do sistema nunca e menor que o recorte da spec');

    const busca = await listar('', 'Fresenius');
    assert.ok(busca.length > 0 && busca.length < todosPendentes.length, 'a busca por fornecedor recorta a lista');
    assert.ok(busca.every((linha) => String(linha.FORNECEDOR).includes('Fresenius')));
  });

  /* ─────────── T-085 — decisão em lote e conclusão ─────────── */

  await teste('C-015: "aceitar todos os conformes" decide todas as conformes pendentes numa operacao e deixa as demais pendentes, uma a uma', async () => {
    const card = CARDS_005.enviadoComPedido;
    const conformesPendentes = ocorrenciasDe(card)
      .filter((o) => o.RESULTADO === 'conforme' && o.DECISAO === 'pendente').length;
    const pendentesAntes = ocorrenciasDe(card).filter((o) => o.DECISAO === 'pendente').length;
    assert.ok(conformesPendentes > 0 && pendentesAntes > conformesPendentes, 'ha conformes e nao-conformes pendentes');

    const lote = await chamar('sgcOcorrenciaDecidir', {
      cardId: card, idOcorrencia: 0, modo: 'conformes', decisao: 'aceito', justificativa: '',
    }, U.ana);
    assert.equal(lote.ok, true, lote.erro);
    assert.equal(lote.decididas, conformesPendentes, 'as conformes saem numa unica operacao');
    assert.equal(lote.pendentes, pendentesAntes - conformesPendentes);
    assert.equal(ocorrenciasDe(card).filter((o) => o.RESULTADO === 'conforme' && o.DECISAO === 'pendente').length, 0);
  });

  await teste('C-018 / RN-011: com conferencias pendentes o pedido nao conclui — a recusa cita quantas —, e depois de decididas a conclusao libera, saindo de Faturamento e de Produtos em B.O.', async () => {
    const card = CARDS_005.enviadoComPedido;
    emFase(card, faseIdDe('faturamento'));
    const pendentes = ocorrenciasDe(card).filter((o) => o.DECISAO === 'pendente');
    assert.ok(pendentes.length > 0);

    const recusa = await podeMover(U.gil, card, 'concluido');
    assert.equal(Number(recusa.PODE), 0);
    assert.match(recusa.MOTIVO, new RegExp(`Decida as ${pendentes.length} confer`));

    for (const ocorrencia of pendentes) {
      const decidida = await chamar('sgcOcorrenciaDecidir', {
        cardId: card, idOcorrencia: Number(ocorrencia.ID), modo: 'individual',
        decisao: 'aceito', justificativa: '',
      }, U.ana);
      assert.equal(decidida.ok, true, decidida.erro);
    }
    // R-144 (P-6): decididas as conferencias, o que ainda trava e o saldo nao
    // faturado — a frase passa a ser a do faturado. Daqui em diante o teste e
    // so das conferencias: o saldo fica coberto (a trava do faturado tem o
    // C-033 proprio, logo abaixo) e volta ao fim.
    const soFaturado = await podeMover(U.gil, card, 'concluido');
    assert.equal(Number(soFaturado.PODE), 0);
    assert.match(soFaturado.MOTIVO, /^Falta faturar R\$ /);
    const faturadoAntes = um('SELECT VL_FATURADO FROM SGC_PEDIDO WHERE ID_CARD = ?', card).VL_FATURADO;
    db.prepare('UPDATE SGC_PEDIDO SET VL_FATURADO = VL_TOTAL WHERE ID_CARD = ?').run(card);
    const livre = await podeMover(U.gil, card, 'concluido');
    assert.equal(Number(livre.PODE), 1, livre.MOTIVO);
    assert.equal(livre.MOTIVO, '');

    // RN-011: com a divergente ja DECIDIDA, concluir libera — inclusive de B.O.
    assert.equal(um('SELECT DECISAO FROM SGC_NF_OCORRENCIA WHERE ID = ?', ocorrenciaRecusada).DECISAO, 'recusado');
    emFase(card, faseIdDe('bo'));
    const deBo = await podeMover(U.gil, card, 'concluido');
    assert.equal(Number(deBo.PODE), 1, deBo.MOTIVO);

    // E com uma pendente, recusa tambem saindo de B.O.
    const outro = CARDS_005.enviadoSemPedido;
    emFase(outro, faseIdDe('bo'));
    assert.ok(ocorrenciasDe(outro).some((o) => o.DECISAO === 'pendente'));
    const recusaBo = await podeMover(U.gil, outro, 'concluido');
    assert.equal(Number(recusaBo.PODE), 0);
    assert.match(recusaBo.MOTIVO, /confer/);
    db.prepare('UPDATE SGC_PEDIDO SET VL_FATURADO = ? WHERE ID_CARD = ?').run(faturadoAntes, card);
  });

  await teste('C-033 / RN-016 (R-144, P-6): so conclui com 99,5 % do valor coberto — a recusa diz quanto falta, 99,5 % ja libera, e o saldo marcado em B.O. como "nao vem mais" conta como coberto', async () => {
    const card = CARDS_005.enviadoComPedido;
    emFase(card, faseIdDe('faturamento'));
    assert.equal(ocorrenciasDe(card).filter((o) => o.DECISAO === 'pendente').length, 0, 'C-018 decidiu tudo');
    const total = Number(um('SELECT VL_TOTAL FROM SGC_PEDIDO WHERE ID_CARD = ?', card).VL_TOTAL);
    assert.ok(total > 0);
    const faturar = (valor) => db.prepare('UPDATE SGC_PEDIDO SET VL_FATURADO = ? WHERE ID_CARD = ?').run(valor, card);
    const antes = um('SELECT VL_FATURADO FROM SGC_PEDIDO WHERE ID_CARD = ?', card).VL_FATURADO;
    try {
      faturar(total * 0.6);
      const recusa = await podeMover(U.gil, card, 'concluido');
      assert.equal(Number(recusa.PODE), 0);
      const falta = (total * 0.4).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      assert.equal(recusa.MOTIVO, `Falta faturar R$ ${falta} (60,0 % coberto; o mínimo para concluir é 99,5 %). Registre a nota complementar ou marque o saldo em B.O. como "não vem mais".`);
      // a mesma trava saindo de Produtos em B.O.
      emFase(card, faseIdDe('bo'));
      assert.equal(Number((await podeMover(U.gil, card, 'concluido')).PODE), 0);
      emFase(card, faseIdDe('faturamento'));

      faturar(total * 0.994);
      assert.equal(Number((await podeMover(U.gil, card, 'concluido')).PODE), 0, '99,4 % ainda trava');
      faturar(total * 0.995);
      const livre = await podeMover(U.gil, card, 'concluido');
      assert.equal(Number(livre.PODE), 1, livre.MOTIVO);
      assert.equal(livre.MOTIVO, '');

      // O que falta, todo em B.O. cancelado ("nao vem mais"), conta como coberto.
      const item = um("SELECT CODPROD, QT_PEDIDA, PRECO_CUSTO FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS <> 'removido' AND PRECO_CUSTO > 0 AND QT_PEDIDA > 0 AND CODPROD NOT IN (SELECT CODPROD FROM SGC_BO_ITEM WHERE ID_CARD = ?) ORDER BY QT_PEDIDA * PRECO_CUSTO DESC LIMIT 1", card, card);
      assert.ok(item, 'um item do pedido sem B.O.');
      const valorBo = Number(item.QT_PEDIDA) * Number(item.PRECO_CUSTO);
      assert.ok(valorBo / total > 0.005, 'o item pesa mais que a folga de 0,5 %');
      faturar(total - valorBo);
      assert.equal(Number((await podeMover(U.gil, card, 'concluido')).PODE), 0, 'sem o B.O., falta o valor do item');
      db.prepare("INSERT INTO SGC_BO_ITEM (ID_CARD, CODPROD, DESCRICAO, QT_PENDENTE, OBSERVACAO, STATUS, CRIADO_POR, CRIADO_EM) VALUES (?, ?, '', ?, 'C-033', 'cancelado', ?, '2026-11-03T08:00:00')")
        .run(card, item.CODPROD, item.QT_PEDIDA, U.ana);
      const comBo = await podeMover(U.gil, card, 'concluido');
      assert.equal(Number(comBo.PODE), 1, comBo.MOTIVO);
      // liberado volta a esperar nota: nao cobre.
      db.prepare("UPDATE SGC_BO_ITEM SET STATUS = 'liberado' WHERE ID_CARD = ? AND OBSERVACAO = 'C-033'").run(card);
      assert.equal(Number((await podeMover(U.gil, card, 'concluido')).PODE), 0, 'B.O. liberado nao cobre o saldo');
      db.prepare("DELETE FROM SGC_BO_ITEM WHERE ID_CARD = ? AND OBSERVACAO = 'C-033'").run(card);
    } finally {
      faturar(antes);
    }
  });

  await teste('C-034 / RN-017 (R-146, P-3): "Notificar gestor" a partir de 5 dias uteis — quem opera a nota avisa UM gestor escolhido, uma vez por dia, e ele recebe no feed; abaixo de 5 dias, 100 % faturado, alvo que nao e gestor ou quem nao opera a nota nao gravam nada', async () => {
    const card = CARDS_005.atrasadoNove;
    const avisosDe = (c) => todos("SELECT * FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = 'faturamento_gestor'", c);
    const notificar = (c, gestorId, usuarioId, texto = 'Pedido sem faturamento completo ha 9 dias uteis.') =>
      chamar('sgcEscGestorNotificar', { cardId: c, gestorId, texto, criadoEm: '2026-11-03T09:00:00' }, usuarioId);
    assert.equal(avisosDe(card).length, 0);

    await notificar(card, U.gil, U.ana);
    const gravados = avisosDe(card);
    assert.equal(gravados.length, 1);
    assert.equal(Number(gravados[0].PARA_USUARIO_ID), U.gil);
    await notificar(card, U.gil, U.ana);
    assert.equal(avisosDe(card).length, 1, 'um aviso por gestor por dia');

    // o gestor ve o aviso no feed dele
    const feed = (await chamar('sgcNotificacoesListar', { limite: 50, offset: 0 }, U.gil)).rows ?? [];
    assert.ok(feed.some((linha) => Number(linha.CARD_ID) === card && /9 dias uteis/.test(String(linha.TEXTO))), 'aviso no feed do gil');

    await notificar(card, U.ana, U.gil);
    assert.equal(avisosDe(card).length, 1, 'o alvo precisa ter persona gestor');
    await notificar(card, U.gil, U.leo);
    await notificar(card, U.gil, U.dora);
    assert.equal(avisosDe(card).length, 1, 'comercial e diretoria nao operam a nota');

    const cedo = CARDS_005.enviadoComPedido; // seed: 3 dias uteis desde o envio
    await notificar(cedo, U.gil, U.ana);
    assert.equal(avisosDe(cedo).length, 0, 'abaixo de 5 dias uteis');
    const completo = CARDS_005.cemPorCento;
    await notificar(completo, U.gil, U.ana);
    assert.equal(avisosDe(completo).length, 0, '100 % faturado nao escala');
  });

  /* ─────────── T-089 — permissões e dias úteis no servidor ─────────── */

  await teste('C-027 / RF-026: o comercial e a diretoria nao vinculam nota nem registram contato; a escrita de tela chamada pelo comercial nao grava linha nenhuma', async () => {
    const card = CARDS_005.conferencias;
    const comoComercial = await vincular(card, NF_7001, U.leo);
    assert.equal(comoComercial.ok, false);
    const comoDiretoria = await vincular(card, NF_7001, U.dora);
    assert.equal(comoDiretoria.ok, false);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ?', card), 0);

    const antes = conta('SELECT COUNT(*) AS N FROM SGC_CONTATO_FATURAMENTO WHERE ID_CARD = ?', card);
    await chamar('sgcEscContatoInserir', {
      cardId: card, dtContato: '2026-09-15T10:00:00', canalContato: 'telefone',
      resumo: 'Contato do comercial, que nao deveria gravar.', previsao: '', criadoEm: '2026-09-15T10:00:00',
    }, U.leo);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_CONTATO_FATURAMENTO WHERE ID_CARD = ?', card), antes,
      'a guarda de persona recusa a escrita do comercial');
  });

  /* ─────────── revisão da onda 2 — escape e escopo da decisão ─────────── */

  await teste("A-11 (revisão onda 2): justificativa com apostrofo grava com UMA aspa — texto() dobrava a aspa ANTES de o runtime dobrar de novo, e SANT'ANNA virava SANT''ANNA no banco", async () => {
    const card = CARDS_005.validade1042;
    const alvo = ocorrenciasDe(card).filter((o) => o.DECISAO === 'pendente')[0];
    assert.ok(alvo, 'o card tem conferencia pendente para decidir');
    const justificativa = "Lote da SANT'ANNA recusado pelo comprador.";

    const decidida = await chamar('sgcOcorrenciaDecidir', {
      cardId: card, idOcorrencia: Number(alvo.ID), modo: 'individual',
      decisao: 'recusado', justificativa,
    }, U.ana);
    assert.equal(decidida.ok, true, decidida.erro);
    assert.equal(um('SELECT JUSTIFICATIVA FROM SGC_NF_OCORRENCIA WHERE ID = ?', Number(alvo.ID)).JUSTIFICATIVA,
      justificativa, 'o parametro escalar vai cru: quem dobra a aspa e o runtime');
  });

  await teste('A-3 (revisão onda 2): sgcEscOcorrenciaDecidir com id 0 FORA do modo "conformes" nao decide nada — os dois ramos eram independentes e id 0 + modo individual decidia todas as pendentes do card, ate as divergentes e sem justificativa', async () => {
    const card = CARDS_005.validade1042;
    const pendentesAntes = ocorrenciasDe(card).filter((o) => o.DECISAO === 'pendente').map((o) => Number(o.ID));
    assert.ok(pendentesAntes.length > 0, 'o card ainda tem conferencias pendentes');

    await chamar('sgcEscOcorrenciaDecidir', {
      cardId: card, id: 0, modo: 'individual', decisao: 'aceito',
      justificativa: '', usuarioId: U.ana, decididoEm: '2026-09-15T10:00:00',
    }, U.ana);

    assert.deepEqual(ocorrenciasDe(card).filter((o) => o.DECISAO === 'pendente').map((o) => Number(o.ID)),
      pendentesAntes, 'nenhuma linha foi decidida');
  });

  await teste('D-016: nenhuma SQL com tabela PC* vai ao banco do projeto — com as sgcWint* desviadas para um executor externo (como no WinThor real), sgcNfDetectar e sgcNfVincular (7005 no faturamentoParcial) terminam ok, os codigos de fabrica/EAN dos itens do pedido chegam por sgcWintProdutosCodigos (UMA leitura por rodada, UMA por vinculo, fora da conta de RNF-002) e tudo o que passou por runQueryMitra e livre de PC*', async () => {
    const aoOracle = [];
    const aoProjeto = [];
    const codigosWinthor = new Set([...byName.values()].filter(ehWinthor).map((d) => d.code));
    const execute = createRunner(db, {
      resolveById: (id) => byId.get(id) ?? null,
      // O mesmo SQLite, mas por FORA de runQueryMitra: e o que o Oracle receberia.
      externo: {
        aceita: ehWinthor,
        query: async (sql) => { aoOracle.push(sql); return db.prepare(toSqlite(sql)).all().map((linha) => ({ ...linha })); },
      },
      // onQuery recebe toda consulta: no desvio externo o segundo argumento e o
      // code da definition sgcWint*; em tudo o mais e o SQL que foi ao banco do projeto.
      onQuery: (sql, origem) => { if (!codigosWinthor.has(origem)) aoProjeto.push(sql); },
    });
    const TABELA_PC = /\b(FROM|JOIN|INTO|UPDATE)\s+PC[A-Z_]+\b/i;
    const LEITURA_DE_CODIGOS = /FROM PCPRODUT P\s+WHERE P\.CODPROD IN \(/;

    db.exec('BEGIN');
    try {
      const rodada = await execute(byName.get('sgcNfDetectar'), {}, 0);
      assert.equal(rodada.ok, true);
      assert.deepEqual(rodada.erros, [], 'a leitura de codigos no Oracle nao pode ter falhado');
      assert.equal(rodada.consultasErp, rodada.grupos, 'RNF-002 continua: uma busca de notas por grupo');

      const card = CARDS_005.faturamentoParcial;
      const vinculo = await execute(byName.get('sgcNfVincular'), {
        cardId: card, idSugestao: 0, numnota: 7005, serie: '', codfornec: 1015, codfilial: '1', origem: 'hibrida', itensJson: '',
      }, U.ana);
      assert.equal(vinculo.ok, true, vinculo.erro);
      assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE ID_CARD = ? AND NUMNOTA = 7005', card), 1);

      assert.ok(aoProjeto.length > 0, 'as duas JAVASCRIPT consultam o banco do projeto');
      const vazou = aoProjeto.filter((sql) => TABELA_PC.test(sql));
      assert.deepEqual(vazou, [], 'SQL com PC* foi por runQueryMitra ao banco do projeto, onde a tabela nao existe em producao');

      const leiturasDeCodigos = aoOracle.filter((sql) => LEITURA_DE_CODIGOS.test(sql));
      assert.equal(leiturasDeCodigos.length, 2, 'uma leitura de codigos na rodada e uma no vinculo');
      assert.match(leiturasDeCodigos[1], /IN \(5006, 5007\)/, 'os itens do pedido faturamentoParcial, nao os da nota');
    } finally {
      db.exec('ROLLBACK');
    }
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_NF WHERE NUMNOTA = 7005'), 0, 'o banco volta ao que era para as suites seguintes');
  });

  await teste('RN-001 / RF-018: o fragmento SQL de dias uteis conta 15 dias uteis entre 24/08/2026 e 14/09/2026 — a mesma conferencia do R-025, agora dentro da SQL desta spec', async () => {
    const linha = db.prepare(toSqlite(`SELECT ${diasUteisEntre("'2026-08-24'", "'2026-09-14'")} AS X`)).get();
    assert.equal(Number(linha.X), 15);
    const mesmoDia = db.prepare(toSqlite(`SELECT ${diasUteisEntre("'2026-09-14'", "'2026-09-14'")} AS X`)).get();
    assert.equal(Number(mesmoDia.X), 0);
  });
}
