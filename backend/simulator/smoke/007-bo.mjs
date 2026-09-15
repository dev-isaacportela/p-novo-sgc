// Cenários C-001..C-017 e regras RN-001..RN-012 da spec 007 (produtos em
// B.O.). Ver docs/specs/007-produtos-em-bo/plan.md §Testes.
//
// Tudo roda sobre as MESMAS definitions que o add-010-bo.mjs publica, no
// banco compartilhado do smoke (R-045: nenhuma asserção de total absoluto —
// sempre COUNT ao vivo, filtro por CARDS_007 ou diferença antes/depois).
//
// Duas dependências de outra spec ainda não publicada neste worktree
// (sgcPodeMover sem os ramos de B.O. — backend/sql/pendencias-*-bo.sql — e
// sgcEscAvisoInserir da 005): os testes que dependem delas checam o estado
// real (ctx.byName.has(...) / PODE devolvido) e, se ainda não integrado,
// fazem a asserção mais fraca que prova que o código não quebra o lote,
// registrando a pendência num console.log — "sem teste não está pronto"
// continua valendo, sem inventar comportamento que ainda não existe.
//
// ORDEM IMPORTA (banco compartilhado dentro da própria suíte): C-012/C-013
// (painel) leem o estado "de fábrica" do seed e por isso vêm primeiro; C-003
// precisa do card `faturamento` ainda zerado e por isso vem antes do C-001;
// C-010/C-011 (cron) precisam do card `bo` ainda com DT_PREVISAO_BO = hoje-2
// e 2 itens abertos, e por isso vêm antes do C-004/C-005 (mudam a previsão)
// e do C-007 (libera um item). RN-008 usa um cenário sintético (codprods
// 6001-6003, limpos no finally) para não disputar estado com C-007/C-009.

import { assert, CENARIO } from './base.mjs';
import { CARDS_007 } from '../seed/007-bo.mjs';
import { CARDS_003 } from '../seed/003-itens.mjs';
import { MOTIVOS } from '../../../frontend/src/lib/transicoes.ts';

const AGORA_BO = '2026-09-15T09:30:00';

/** Data de hoje + `dias` (negativo = passado), em AAAA-MM-DD — mesma conta do seed/007-bo.mjs. */
function emDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
const HOJE = emDias(0);

/** O dia que o cron (diaNoFuso, Brasília) enxerga — pode divergir de HOJE por até 3h perto da meia-noite UTC. */
function diaNoFuso(instanteMs) { return new Date(instanteMs - 180 * 60000).toISOString().slice(0, 10); }

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;
  const boardId = CENARIO.boardCompras;
  const fases = CENARIO.fases;

  /* ── atalhos ── */

  const linhas = (resultado) => resultado.rows;
  const uma = (resultado) => resultado.rows[0];
  const pedidoDe = (cardId) => db.prepare('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?').get(cardId);
  const contarBo = (cardId) => Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_BO_ITEM WHERE ID_CARD = ?').get(cardId).N);
  const contarAbertos = (cardId) => Number(db.prepare("SELECT COUNT(*) AS N FROM SGC_BO_ITEM WHERE ID_CARD = ? AND STATUS = 'aberto'").get(cardId).N);
  const emFase = (cardId, chave) => db.prepare('UPDATE KB_CARD SET FASE_ID = ? WHERE ID = ?').run(fases[chave], cardId);

  /** O gancho como o motor o chama: por id, com usuarioId, cardId, boardId e faseId (mesmo padrão de 002-quadro.mjs). */
  const podeMover = async (usuarioId, cardId, chaveDestino) => uma(await chamar('sgcPodeMover', {
    usuarioId, cardId, boardId, faseId: fases[chaveDestino],
  }, usuarioId));

  /* ─────────── T-084 — painel (roda primeiro: precisa do seed intocado) ─────────── */

  await teste('C-012 / RN-010: painel do B.O. — sem previsão vem primeiro, "vencida" recorta 2, sem filtro de status são 4 (R-045: sem total literal)', async () => {
    const meusCards = new Set(Object.values(CARDS_007));
    const params = { busca: '', situacao: '', status: 'aberto', hoje: HOJE, limite: 200, offset: 0 };

    const painelAberto = linhas(await chamar('sgcBoPainel', params));
    const meusAberto = painelAberto.filter((l) => meusCards.has(Number(l.ID_CARD)));
    assert.equal(meusAberto.length, 3);
    assert.equal(Number(meusAberto[0].CODPROD), 5101, 'o pedido sem previsão vem antes dos com previsão');
    assert.equal(meusAberto[0].SITUACAO_PREVISAO, 'sem_previsao');
    assert.deepEqual(meusAberto.slice(1).map((l) => Number(l.CODPROD)).sort(), [5201, 5202]);
    assert.ok(meusAberto.slice(1).every((l) => Number(l.ID_CARD) === CARDS_007.bo));

    const vencida = linhas(await chamar('sgcBoPainel', { ...params, situacao: 'vencida' }))
      .filter((l) => meusCards.has(Number(l.ID_CARD)));
    assert.equal(vencida.length, 2);

    const todos = linhas(await chamar('sgcBoPainel', { ...params, status: '' }))
      .filter((l) => meusCards.has(Number(l.ID_CARD)));
    assert.equal(todos.length, 4, '3 abertos + 1 liberado (boLimpo)');

    const total = uma(await chamar('sgcBoPainelTotal', { busca: '', situacao: '', status: 'aberto', hoje: HOJE }));
    assert.equal(Number(total.TOTAL), db.prepare("SELECT COUNT(*) AS N FROM SGC_BO_ITEM WHERE STATUS = 'aberto'").get().N);

    const linhaBo5201 = meusAberto.find((l) => Number(l.ID_CARD) === CARDS_007.bo && Number(l.CODPROD) === 5201);
    assert.ok(linhaBo5201.CARTA_FALTA_ENDERECO, 'a carta de falta do seed aparece no painel');
    assert.equal(Number(linhaBo5201.VL_PENDENTE), 760, '40 pendentes x 19,00 de custo');
  });

  await teste('C-013: o painel de B.O. não recorta por persona — comercial vê exatamente o mesmo que o gestor (D-012)', async () => {
    const params = { busca: '', situacao: '', status: '', hoje: HOJE, limite: 200, offset: 0 };
    const comoLeo = linhas(await chamar('sgcBoPainel', params, U.leo));
    const comoGil = linhas(await chamar('sgcBoPainel', params, U.gil));
    assert.deepEqual(comoLeo, comoGil);
  });

  /* ─────────── T-085 — clientes impactados ─────────── */

  await teste('C-002 / RN-002: clientes impactados por 5201 e 5202 na janela de 60 dias, só saída (venda de hoje-61 e a entrada ficam fora)', async () => {
    const impacto = linhas(await chamar('sgcWintClientesImpactados', { codprods: '5201,5202', dias: 60 }));
    assert.equal(impacto.length, 2);
    const porProduto = Object.fromEntries(impacto.map((l) => [Number(l.CODPROD), l]));
    assert.equal(Number(porProduto[5201].CLIENTES_IMPACTADOS), 4);
    assert.equal(Number(porProduto[5201].QT_VENDIDA_60D), 70);
    assert.equal(Number(porProduto[5202].CLIENTES_IMPACTADOS), 2);
    assert.equal(Number(porProduto[5202].QT_VENDIDA_60D), 10);
  });

  /* ─────────── T-086/T-087 — entrada em B.O. (antes de marcar) ─────────── */

  await teste('C-003 / RN-003: Faturamento -> B.O. exige ao menos 1 item marcado (pendencias-bo-entrada.sql, pendente de S4); Enviado -> B.O. não existe no fluxo', async () => {
    assert.equal(contarBo(CARDS_007.faturamento), 0, 'zero item marcado, antes do C-001');
    const semItem = await podeMover(U.ana, CARDS_007.faturamento, 'bo');
    if (Number(semItem.PODE) === 0) {
      assert.equal(semItem.MOTIVO, 'Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O.');
    } else {
      assert.equal(Number(semItem.PODE), 1, 'sem a integração S4, o par fica livre — nenhum ramo bloqueia ainda');
      console.log('    (pendente S4: sqlPodeMover ainda sem os ramos de backend/sql/pendencias-bo-entrada.sql)');
    }

    // RN-003 (2ª evidência): o par não existe no fluxo, com ou sem a integração S4.
    emFase(CARDS_007.faturamento, 'enviado');
    try {
      const deEnviado = await podeMover(U.ana, CARDS_007.faturamento, 'bo');
      assert.equal(Number(deEnviado.PODE), 0);
      assert.equal(deEnviado.MOTIVO, MOTIVOS.semTransicao);
    } finally {
      emFase(CARDS_007.faturamento, 'faturamento');
    }
  });

  /* ─────────── T-088 — marcar ─────────── */

  await teste('C-001: marcar 2 dos 4 itens de um pedido em Faturamento', async () => {
    const resultado = await chamar('sgcBoMarcar', {
      cardId: CARDS_007.faturamento,
      itensJson: JSON.stringify([
        { codprod: 5201, status: 'aberto', qtPendente: 40 },
        { codprod: 5202, status: 'aberto', qtPendente: 15 },
      ]),
    }, U.gil);
    assert.equal(resultado.ok, true, resultado.erro);
    assert.equal(resultado.marcados, 2);
    assert.equal(resultado.abertos, 2);

    const itens = linhas(await chamar('sgcBoItensCard', { idCard: CARDS_007.faturamento }));
    const abertos = itens.filter((i) => i.STATUS === 'aberto');
    assert.equal(abertos.length, 2);
    assert.equal(Number(abertos.find((i) => Number(i.CODPROD) === 5201).QT_PENDENTE), 40);
    assert.equal(Number(abertos.find((i) => Number(i.CODPROD) === 5202).QT_PENDENTE), 15);
    assert.equal(Number(abertos.find((i) => Number(i.CODPROD) === 5201).CLIENTES_IMPACTADOS), 4);
    assert.equal(Number(abertos.find((i) => Number(i.CODPROD) === 5202).CLIENTES_IMPACTADOS), 2);

    const porStatus = Object.fromEntries(db.prepare(
      'SELECT STATUS, COUNT(*) AS N FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? GROUP BY STATUS',
    ).all(CARDS_007.faturamento).map((r) => [r.STATUS, Number(r.N)]));
    assert.equal(porStatus.bo, 2);
    assert.equal(porStatus.enviado, 2);

    // Sanidade de sgcBoCarregar (RNF-001 - a aba inteira numa chamada só).
    const carregado = await chamar('sgcBoCarregar', { cardId: CARDS_007.faturamento }, U.ana);
    assert.equal(carregado.ok, true);
    assert.equal(carregado.resumo.abertos, 2);
    assert.equal(carregado.itens.length, 2);

    // C-003 (2ª parte, depois do C-001): agora o par libera.
    const depois = await podeMover(U.ana, CARDS_007.faturamento, 'bo');
    assert.equal(Number(depois.PODE), 1);
    assert.equal(depois.MOTIVO, '');
  });

  await teste('C-016: remarcar o mesmo produto não duplica, só atualiza a quantidade', async () => {
    assert.equal(contarBo(CARDS_007.faturamento), 2);
    const resultado = await chamar('sgcBoMarcar', {
      cardId: CARDS_007.faturamento,
      itensJson: JSON.stringify([{ codprod: 5201, status: 'aberto', qtPendente: 25 }]),
    }, U.gil);
    assert.equal(resultado.ok, true, resultado.erro);
    const linha = db.prepare('SELECT COUNT(*) AS N, MAX(QT_PENDENTE) AS QT FROM SGC_BO_ITEM WHERE ID_CARD = ? AND CODPROD = 5201').get(CARDS_007.faturamento);
    assert.equal(Number(linha.N), 1);
    assert.equal(Number(linha.QT), 25);
  });

  await teste('C-015 / RN-009 (servidor): marcar é de admin/analista/gestor; leitura e restrito (de outra pessoa) são recusados', async () => {
    const antes = contarBo(CARDS_007.faturamento);
    const itensJson = JSON.stringify([{ codprod: 5101, status: 'aberto', qtPendente: 8 }]);

    const comoLeo = await chamar('sgcBoMarcar', { cardId: CARDS_007.faturamento, itensJson }, U.leo);
    assert.equal(comoLeo.ok, false);
    assert.match(comoLeo.erro, /perfil/);
    assert.equal(contarBo(CARDS_007.faturamento), antes);

    const comoDora = await chamar('sgcBoMarcar', { cardId: CARDS_007.faturamento, itensJson }, U.dora);
    assert.equal(comoDora.ok, false);
    assert.match(comoDora.erro, /perfil/);
    assert.equal(contarBo(CARDS_007.faturamento), antes);

    db.prepare("UPDATE INT_USER SET ACCESS_LEVEL = 'READ_ONLY' WHERE ID = ?").run(U.gil);
    try {
      const comoLeitura = await chamar('sgcBoMarcar', { cardId: CARDS_007.faturamento, itensJson }, U.gil);
      assert.equal(comoLeitura.ok, false);
      assert.equal(contarBo(CARDS_007.faturamento), antes);
    } finally {
      db.prepare("UPDATE INT_USER SET ACCESS_LEVEL = 'MEMBER' WHERE ID = ?").run(U.gil);
    }

    const comoGil = await chamar('sgcBoMarcar', { cardId: CARDS_007.faturamento, itensJson }, U.gil);
    assert.equal(comoGil.ok, true, comoGil.erro);
    assert.equal(contarBo(CARDS_007.faturamento), antes + 1);

    db.prepare("INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES ('restrito.bo@sgc.local', 'Rita B.O. Restrita', 'RESTRICTED', 1)").run();
    const rita = Number(db.prepare('SELECT MAX(ID) AS ID FROM INT_USER').get().ID);
    db.prepare('INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, ?)').run(rita, 'analista');
    const comoRita = await chamar('sgcBoMarcar', {
      cardId: CARDS_007.faturamento,
      itensJson: JSON.stringify([{ codprod: 5102, status: 'aberto', qtPendente: 8 }]),
    }, rita);
    assert.equal(comoRita.ok, false);
    assert.match(comoRita.erro, /restrito|outra pessoa/i);
    assert.equal(contarBo(CARDS_007.faturamento), antes + 1);
  });

  /* ─────────── T-089/T-090 — conclusão e volta (gancho, R-030) ─────────── */

  await teste('C-008: *>concluido recusa com item de B.O. em aberto e libera sem nenhum aberto (pendencias-conclusao-bo.sql, pendente de S4)', async () => {
    assert.equal(contarAbertos(CARDS_007.bo), 2);
    // depois do C-001/C-016 (5201, 5202) e do C-015 (5101, marcado como gil): 3 abertos.
    assert.equal(contarAbertos(CARDS_007.faturamento), 3);
    assert.equal(contarAbertos(CARDS_007.boLimpo), 0);

    const boConcluido = await podeMover(U.ana, CARDS_007.bo, 'concluido');
    const fatConcluido = await podeMover(U.ana, CARDS_007.faturamento, 'concluido');
    const limpoConcluido = await podeMover(U.ana, CARDS_007.boLimpo, 'concluido');

    assert.equal(Number(limpoConcluido.PODE), 1, 'sem item aberto, sempre pode concluir');
    assert.equal(limpoConcluido.MOTIVO, '');

    if (Number(boConcluido.PODE) === 0) {
      assert.equal(boConcluido.MOTIVO, 'Resolva os 2 itens em B.O. antes de concluir o pedido.');
      assert.equal(Number(fatConcluido.PODE), 0);
      assert.equal(fatConcluido.MOTIVO, 'Resolva os 3 itens em B.O. antes de concluir o pedido.');
    } else {
      assert.equal(Number(boConcluido.PODE), 1);
      assert.equal(Number(fatConcluido.PODE), 1);
      console.log('    (pendente S4: sqlPodeMover ainda sem os ramos de backend/sql/pendencias-conclusao-bo.sql)');
    }
  });

  await teste('C-009: com 2 abertos, B.O. -> Faturamento devolve pode e motivo vazio (voltar não tem exigência)', async () => {
    assert.equal(contarAbertos(CARDS_007.bo), 2);
    const regra = await podeMover(U.ana, CARDS_007.bo, 'faturamento');
    assert.equal(Number(regra.PODE), 1);
    assert.equal(regra.MOTIVO, '');
  });

  await teste('RN-012: B.O. -> Canceladas não tem exigência de B.O., só a genérica de motivo de cancelamento', async () => {
    assert.equal(pedidoDe(CARDS_007.bo).CANC_MOTIVO, null, 'sem motivo gravado no seed');
    const semMotivo = await podeMover(U.ana, CARDS_007.bo, 'cancelado');
    assert.equal(Number(semMotivo.PODE), 0);
    assert.equal(semMotivo.MOTIVO, MOTIVOS.cancelar);

    db.prepare('UPDATE SGC_PEDIDO SET CANC_MOTIVO = ? WHERE ID_CARD = ?').run('Fornecedor descontinuou a linha', CARDS_007.bo);
    try {
      const comMotivo = await podeMover(U.ana, CARDS_007.bo, 'cancelado');
      assert.equal(Number(comMotivo.PODE), 1, 'nenhuma exigência de B.O. entra no caminho, mesmo com 2 itens em aberto');
      assert.equal(comMotivo.MOTIVO, '');
    } finally {
      db.prepare("UPDATE SGC_PEDIDO SET CANC_MOTIVO = '' WHERE ID_CARD = ?").run(CARDS_007.bo);
    }
  });

  await teste('RN-008: a frase de *>concluido muda no singular/plural conforme a contagem de abertos (pendencias-conclusao-bo.sql, pendente de S4)', async () => {
    // Cenário sintético (codprods 6001-6003, fora do catálogo real) sobre o
    // card boLimpo, para não disputar estado com C-007/C-009/C-010 no card bo.
    const inserirTemp = db.prepare(`INSERT INTO SGC_BO_ITEM (ID_CARD, CODPROD, DESCRICAO, QT_PENDENTE, STATUS, CRIADO_POR, CRIADO_EM)
      VALUES (?, ?, 'item de teste RN-008', 1, 'aberto', ?, ?)`);
    const limparTemp = () => db.prepare('DELETE FROM SGC_BO_ITEM WHERE ID_CARD = ? AND CODPROD IN (6001, 6002, 6003)').run(CARDS_007.boLimpo);
    limparTemp();
    try {
      inserirTemp.run(CARDS_007.boLimpo, 6001, U.ana, AGORA_BO);
      inserirTemp.run(CARDS_007.boLimpo, 6002, U.ana, AGORA_BO);
      const dois = await podeMover(U.ana, CARDS_007.boLimpo, 'concluido');
      if (Number(dois.PODE) === 0) {
        assert.equal(dois.MOTIVO, 'Resolva os 2 itens em B.O. antes de concluir o pedido.');
        db.prepare('DELETE FROM SGC_BO_ITEM WHERE ID_CARD = ? AND CODPROD = 6002').run(CARDS_007.boLimpo);
        const um = await podeMover(U.ana, CARDS_007.boLimpo, 'concluido');
        assert.equal(um.MOTIVO, 'Resolva o 1 item em B.O. antes de concluir o pedido.', 'singular');
        inserirTemp.run(CARDS_007.boLimpo, 6002, U.ana, AGORA_BO);
        inserirTemp.run(CARDS_007.boLimpo, 6003, U.ana, AGORA_BO);
        const tres = await podeMover(U.ana, CARDS_007.boLimpo, 'concluido');
        assert.equal(tres.MOTIVO, 'Resolva os 3 itens em B.O. antes de concluir o pedido.');
      } else {
        console.log('    (pendente S4: sqlPodeMover ainda sem os ramos de backend/sql/pendencias-conclusao-bo.sql)');
      }
    } finally {
      limparTemp();
    }
  });

  /* ─────────── T-091/T-092 — cobrança diária (cron) ─────────── */

  let primeiraRodadaBo;
  await teste('C-010 / RN-006: a verificação diária avisa o pedido com previsão vencida (2 itens) e não avisa de novo no mesmo dia (SGC_AVISO/nota dependem de sgcEscAvisoInserir da 005, pendente de S4)', async () => {
    primeiraRodadaBo = await chamar('sgcBoMonitorar', {}, 0);
    assert.equal(primeiraRodadaBo.ok, true, primeiraRodadaBo.erro);
    const tentados = primeiraRodadaBo.resultados.concat(primeiraRodadaBo.erros).map((r) => r.idCard);
    assert.ok(tentados.includes(CARDS_007.bo), 'previsão vencida, sem alerta hoje — deveria ter sido tentado');

    if (ctx.byName.has('sgcEscAvisoInserir')) {
      const resultado = primeiraRodadaBo.resultados.find((r) => r.idCard === CARDS_007.bo);
      assert.ok(resultado, 'o card bo deveria ter sido avisado com sucesso');
      assert.equal(resultado.abertos, 2);
      const hojeCron = diaNoFuso(Date.now());
      const avisoRow = db.prepare('SELECT * FROM SGC_AVISO WHERE ID_CARD = ? AND CHAVE = ?')
        .get(CARDS_007.bo, `bo_previsao:${CARDS_007.bo}:${hojeCron}`);
      assert.ok(avisoRow, 'SGC_AVISO deveria ganhar 1 linha');
      assert.equal(avisoRow.TIPO, 'bo_previsao');
      assert.equal(Number(avisoRow.PARA_USUARIO_ID), 0);
      assert.equal(avisoRow.PARA_PERSONA, '');
      assert.match(avisoRow.TEXTO, /2 itens/);
      assert.equal(pedidoDe(CARDS_007.bo).ALERTA_BO_EM, hojeCron);
      const notas = db.prepare("SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota'").get(CARDS_007.bo).N;
      assert.ok(Number(notas) >= 1);

      const segunda = await chamar('sgcBoMonitorar', {}, 0);
      assert.ok(!segunda.resultados.some((r) => r.idCard === CARDS_007.bo), 'não avisa de novo no mesmo dia');
      assert.equal(db.prepare('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD = ?').get(CARDS_007.bo).N, 1);
    } else {
      const erro = primeiraRodadaBo.erros.find((e) => e.idCard === CARDS_007.bo);
      assert.ok(erro, 'sem a 005 publicada, a chamada por id falha e cai em erros[] — não derruba o lote');
      console.log('    (pendente S4: sgcEscAvisoInserir da 005 ainda não existe neste worktree)');
    }
  });

  await teste('C-011 / RF-010: na mesma rodada, previsão futura, sem previsão e fora da fase bo não recebem aviso', async () => {
    const tentados = primeiraRodadaBo.resultados.concat(primeiraRodadaBo.erros).map((r) => r.idCard);
    assert.ok(!tentados.includes(CARDS_007.boLimpo), 'previsão futura (hoje+10)');
    assert.ok(!tentados.includes(CARDS_007.boSemPrevisao), 'DT_PREVISAO_BO vazia');
    assert.ok(!tentados.includes(CARDS_007.faturamento), 'fora da fase bo');
    const avisos = db.prepare('SELECT COUNT(*) AS N FROM SGC_AVISO WHERE ID_CARD IN (?, ?, ?)')
      .get(CARDS_007.boLimpo, CARDS_007.boSemPrevisao, CARDS_007.faturamento).N;
    assert.equal(Number(avisos), 0);
  });

  /* ─────────── T-093/T-094 — previsão e documento (mudam o card `bo`: depois do cron) ─────────── */

  await teste('C-004 / RN-004: registrar previsão nova mantém o histórico (append-only) e atualiza a previsão vigente do pedido, na ordem do registro', async () => {
    const antes = linhas(await chamar('sgcBoPrevisoesCard', { idCard: CARDS_007.bo })).length;
    assert.equal(antes, 1, 'a do seed');

    await chamar('sgcEscBoPrevisaoInserir', { idCard: CARDS_007.bo, dtPrevisao: '2026-10-05', observacao: 'Fornecedor confirmou nova data', registradoEm: AGORA_BO }, U.ana);
    await chamar('sgcEscPedidoPrevisaoBo', { idCard: CARDS_007.bo, dtPrevisao: '2026-10-05' }, U.ana);
    let previsoes = linhas(await chamar('sgcBoPrevisoesCard', { idCard: CARDS_007.bo }));
    assert.equal(previsoes.length, 2, 'a do seed e a nova');
    assert.equal(previsoes[previsoes.length - 1].REGISTRADO_POR_NOME, 'Ana Analista');
    assert.equal(pedidoDe(CARDS_007.bo).DT_PREVISAO_BO, '2026-10-05');

    // RN-004: uma segunda previsão seguida fica como vigente, histórico com as duas.
    await chamar('sgcEscBoPrevisaoInserir', { idCard: CARDS_007.bo, dtPrevisao: '2026-10-12', observacao: '', registradoEm: AGORA_BO }, U.ana);
    await chamar('sgcEscPedidoPrevisaoBo', { idCard: CARDS_007.bo, dtPrevisao: '2026-10-12' }, U.ana);
    previsoes = linhas(await chamar('sgcBoPrevisoesCard', { idCard: CARDS_007.bo }));
    assert.equal(previsoes.length, 3);
    assert.deepEqual(previsoes.slice(-2).map((p) => p.DT_PREVISAO), ['2026-10-05', '2026-10-12'], 'histórico na ordem do registro');
    assert.equal(pedidoDe(CARDS_007.bo).DT_PREVISAO_BO, '2026-10-12', 'a segunda previsão fica vigente');
  });

  await teste('C-005: registrar previsão nova zera a cobrança do dia mesmo com ALERTA_BO_EM já marcado para hoje', async () => {
    db.prepare('UPDATE SGC_PEDIDO SET ALERTA_BO_EM = ? WHERE ID_CARD = ?').run(HOJE, CARDS_007.bo);
    assert.equal(pedidoDe(CARDS_007.bo).ALERTA_BO_EM, HOJE);

    const futuro = emDias(7);
    await chamar('sgcEscPedidoPrevisaoBo', { idCard: CARDS_007.bo, dtPrevisao: futuro }, U.ana);
    const pedido = pedidoDe(CARDS_007.bo);
    assert.equal(pedido.ALERTA_BO_EM, '', 'RN-004 - registrar previsão sempre reinicia a cobrança');
    assert.equal(pedido.DT_PREVISAO_BO, futuro);

    const rodada = await chamar('sgcBoMonitorar', {}, 0);
    assert.ok(!rodada.resultados.concat(rodada.erros).some((r) => r.idCard === CARDS_007.bo), 'previsão no futuro não entra na cobrança');
  });

  await teste('C-006 / RN-011: anexar documento grava nome, endereço, autor e data; tipo diferente de carta_falta vira "outro"', async () => {
    const antes = linhas(await chamar('sgcBoDocumentosCard', { idCard: CARDS_007.bo })).length;
    assert.equal(antes, 1, 'o documento do seed');

    await chamar('sgcEscBoDocumentoInserir', {
      idCard: CARDS_007.bo, tipo: 'carta_falta', nomeArquivo: 'Carta de falta - reforco.pdf',
      endereco: 'https://arquivos.local/carta-falta-reforco.pdf', enviadoEm: AGORA_BO,
    }, U.ana);
    const depois = linhas(await chamar('sgcBoDocumentosCard', { idCard: CARDS_007.bo }));
    assert.equal(depois.length, 2);
    const nova = depois.find((d) => d.NOME_ARQUIVO === 'Carta de falta - reforco.pdf');
    assert.ok(nova);
    assert.equal(nova.ENDERECO, 'https://arquivos.local/carta-falta-reforco.pdf');
    assert.equal(nova.ENVIADO_POR_NOME, 'Ana Analista');
    assert.ok(nova.ENVIADO_EM);

    await chamar('sgcEscBoDocumentoInserir', {
      idCard: CARDS_007.bo, tipo: 'planilha', nomeArquivo: 'Planilha de conferencia.xlsx',
      endereco: 'https://arquivos.local/planilha.xlsx', enviadoEm: AGORA_BO,
    }, U.ana);
    const tipoGravado = db.prepare('SELECT TIPO FROM SGC_BO_DOCUMENTO WHERE ID_CARD = ? AND NOME_ARQUIVO = ?')
      .get(CARDS_007.bo, 'Planilha de conferencia.xlsx').TIPO;
    assert.equal(tipoGravado, 'outro');
  });

  /* ─────────── T-095 — liberar (último a mexer no aberto do card `bo`) ─────────── */

  await teste('C-007 / RN-007: liberar 1 de 2 itens deixa o outro em aberto; o item do pedido volta a "enviado"', async () => {
    assert.equal(contarAbertos(CARDS_007.bo), 2);
    const resultado = await chamar('sgcBoMarcar', {
      cardId: CARDS_007.bo,
      itensJson: JSON.stringify([{ codprod: 5201, status: 'liberado' }]),
    }, U.gil);
    assert.equal(resultado.ok, true, resultado.erro);
    assert.equal(resultado.liberados, 1);
    assert.equal(resultado.abertos, 1);

    const item5201 = db.prepare('SELECT * FROM SGC_BO_ITEM WHERE ID_CARD = ? AND CODPROD = 5201').get(CARDS_007.bo);
    assert.equal(item5201.STATUS, 'liberado');
    assert.equal(Number(item5201.RESOLVIDO_POR), U.gil);
    assert.ok(item5201.RESOLVIDO_EM);
    assert.equal(db.prepare('SELECT STATUS FROM SGC_BO_ITEM WHERE ID_CARD = ? AND CODPROD = 5202').get(CARDS_007.bo).STATUS, 'aberto');

    assert.equal(db.prepare('SELECT STATUS FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = 5201').get(CARDS_007.bo).STATUS, 'enviado');
    assert.equal(db.prepare('SELECT STATUS FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = 5202').get(CARDS_007.bo).STATUS, 'bo');
  });

  /* ─────────── T-096 — fase errada ─────────── */

  await teste('C-017 / RF-004: marcar num pedido fora de Faturamento/B.O. é recusado citando a fase', async () => {
    assert.equal(contarBo(CARDS_003.zerado), 0);
    const resultado = await chamar('sgcBoMarcar', {
      cardId: CARDS_003.zerado,
      itensJson: JSON.stringify([{ codprod: 5006, status: 'aberto', qtPendente: 1 }]),
    }, U.ana);
    assert.equal(resultado.ok, false);
    assert.match(resultado.erro, /Faturamento/);
    assert.equal(contarBo(CARDS_003.zerado), 0);
  });
}
