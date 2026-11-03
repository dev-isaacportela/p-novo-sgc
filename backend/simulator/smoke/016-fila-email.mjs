// Smoke da spec 016: fila de e-mail com novas tentativas e aviso de pedido
// pronto para concluir — as SFs reais do add-018 e os dois pontos de envio que
// passaram a usar a fila (sgcEnvioIndustriaRegistrar do add-005 e
// sgcCobrancaEnviar do add-008).
//
// Roda POR ÚLTIMO no smoke.mjs: a rotina das 08h10 vê todo card do banco
// compartilhado e avisaria pedidos de outras suítes que contam SGC_AVISO. As
// asserções olham só os cards criados aqui. O e-mail que falha é simulado
// trocando `ctx.emails.push` (o onEmail do base.mjs chama emails.push).
import { assert, CENARIO } from './base.mjs';
import { ERRO_PRESO } from '../../add-018-fila-email-conclusao.mjs';

const AGORA = '2026-11-03T12:00:00';
const HOJE = '2026-11-03';
const CAPA = {
  codfornec: 1015, fornecedor: 'Nutrilatina', codfilial: '1', filial: '1 — Matriz',
  periodoInicio: '2026-08-01', periodoFim: '2026-09-15',
};

export async function suite(ctx) {
  const { db, chamar, teste, U, emails, byId } = ctx;
  const boardId = CENARIO.boardCompras;
  const fases = CENARIO.fases;

  /* ── atalhos ── */

  const um = (sql, ...args) => db.prepare(sql).get(...args);
  const todos = (sql, ...args) => db.prepare(sql).all(...args);
  const conta = (sql, ...args) => Number(db.prepare(sql).get(...args).N);
  const emFase = (cardId, chave) => db.prepare('UPDATE KB_CARD SET FASE_ID = ? WHERE ID = ?').run(fases[chave], cardId);
  const faseDe = (cardId) => Number(um('SELECT FASE_ID FROM KB_CARD WHERE ID = ?', cardId).FASE_ID);
  const filaDe = (idComunicacao) => um('SELECT * FROM SGC_EMAIL_FILA WHERE ID_COMUNICACAO = ?', idComunicacao);
  const notas = (cardId) => todos("SELECT DETALHE FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota' ORDER BY ID", cardId)
    // DETALHE é o JSON do registro da lib ({ texto }).
    .map((linha) => { try { return String(JSON.parse(linha.DETALHE).texto ?? linha.DETALHE); } catch { return String(linha.DETALHE); } });
  const processar = () => chamar('sgcEmailFilaProcessar', {}, U.admin);
  const avisar = (hoje = HOJE) => chamar('sgcConclusaoProntosAvisar', { hoje }, U.admin);

  /** O servidor de e-mail recusa tudo enquanto `fn` roda. */
  async function comEmailFalhando(fn) {
    emails.push = () => { throw new Error('SMTP indisponível (simulado)'); };
    try { return await fn(); } finally { delete emails.push; }
  }

  async function criarPedido(chave) {
    const criado = await chamar('kbCardCriar', {
      boardId, titulo: '1 — MATRIZ · NUTRILATINA (016)', responsaveisIds: String(U.ana), prazo: '',
      valoresJson: JSON.stringify({ fornecedor: CAPA.fornecedor, filial: CAPA.filial, prioridade: 'normal' }),
    }, U.ana);
    assert.equal(criado.ok, true, criado.error);
    await chamar('sgcEscPedidoCriar', { cardId: criado.id, ...CAPA, origem: 'manual', agora: AGORA }, U.ana);
    emFase(criado.id, chave);
    return criado.id;
  }

  const envio = (cardId, numped) => chamar('sgcEnvioIndustriaRegistrar', {
    cardId, canal: 'email', para: 'pedidos@nutrilatina.com.br', assunto: `Pedido de compra ${numped}`,
    corpo: `<p>Segue o pedido ${numped}.</p>`, dtEnvio: HOJE, numped, obs: '',
  }, U.ana);

  /* ─────────── fila de e-mail ─────────── */

  const CARD_OK = await criarPedido('envio');
  await teste('C-001 (016): e-mail que sai na hora não passa pela fila — emailNaFila false e nenhuma linha na fila', async () => {
    const filaAntes = conta('SELECT COUNT(*) AS N FROM SGC_EMAIL_FILA');
    const emailsAntes = emails.length;
    const resultado = await envio(CARD_OK, '770001');
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.emailNaFila, false);
    assert.equal(emails.length, emailsAntes + 1);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_EMAIL_FILA'), filaAntes);
  });

  const CARD_FILA = await criarPedido('envio');
  let comunicacaoEnvio = 0;
  await teste('C-002 (016) / RF-001: o e-mail do pedido que falha entra na fila (tentativa 1) e o envio é registrado — o pedido pode ir para Enviado', async () => {
    const emailsAntes = emails.length;
    const resultado = await comEmailFalhando(() => envio(CARD_FILA, '770002'));
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.emailNaFila, true);
    assert.deepEqual(resultado.destinatarios, ['pedidos@nutrilatina.com.br', 'compras@benenutri.com']);
    assert.equal(emails.length, emailsAntes, 'nada saiu');
    comunicacaoEnvio = resultado.comunicacaoId;
    const fila = filaDe(comunicacaoEnvio);
    assert.ok(fila, 'a comunicação entrou na fila');
    assert.equal(fila.STATUS, 'pendente');
    assert.equal(Number(fila.TENTATIVAS), 1, 'a do clique conta');
    assert.equal(Number(fila.ID_CARD), CARD_FILA);
    assert.equal(Number(fila.CRIADO_POR), U.ana);
    assert.match(fila.ULTIMO_ERRO, /SMTP indisponível/);
    const pedido = um('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?', CARD_FILA);
    assert.equal(pedido.DT_ENVIO, HOJE);
    assert.equal(pedido.NUMPED_WINTHOR, '770002');
    assert.ok(notas(CARD_FILA).some((nota) => /não saiu agora e entrou na fila de nova tentativa/.test(nota)));
    const pode = (await chamar('sgcPodeMover', { usuarioId: U.ana, cardId: CARD_FILA, boardId, faseId: fases.enviado }, U.ana)).rows[0];
    assert.equal(Number(pode.PODE), 1, pode.MOTIVO);
  });

  const CARD_COBRANCA = await criarPedido('faturamento');
  let comunicacaoCobranca = 0;
  await teste('C-003 (016): a cobrança que falha fica registrada como comunicação e entra na fila', async () => {
    const resultado = await comEmailFalhando(() => chamar('sgcCobrancaEnviar', {
      cardId: CARD_COBRANCA, para: 'Faturamento@Nutrilatina.com.br', assunto: 'Faturamento pendente',
      corpo: 'Bom dia,\no pedido segue sem faturamento.',
    }, U.ana));
    assert.equal(resultado.ok, true, resultado.erro);
    assert.equal(resultado.emailNaFila, true);
    comunicacaoCobranca = resultado.comunicacaoId;
    const comunicacao = um('SELECT * FROM SGC_COMUNICACAO WHERE ID = ?', comunicacaoCobranca);
    assert.equal(comunicacao.TIPO, 'cobranca');
    assert.equal(filaDe(comunicacaoCobranca).STATUS, 'pendente');
    assert.ok(notas(CARD_COBRANCA).some((nota) => /entrou na fila de nova tentativa/.test(nota)));
  });

  await teste('C-004 (016) / RN-002: a rodada manda o MESMO e-mail registrado (destinatário, cópia, assunto, corpo), marca enviado na 2ª tentativa e registra no histórico', async () => {
    const emailsAntes = emails.length;
    const rodada = await processar();
    assert.equal(rodada.enviados, 2, JSON.stringify(rodada));
    assert.equal(rodada.erros.length, 0, JSON.stringify(rodada.erros));
    const saidos = emails.slice(emailsAntes);
    for (const id of [comunicacaoEnvio, comunicacaoCobranca]) {
      const comunicacao = um('SELECT * FROM SGC_COMUNICACAO WHERE ID = ?', id);
      const email = saidos.find((e) => e.subject === comunicacao.ASSUNTO);
      assert.ok(email, `saiu o e-mail da comunicação ${id}`);
      assert.deepEqual(email.to, [comunicacao.PARA.toLowerCase(), 'compras@benenutri.com']);
      assert.equal(email.body, comunicacao.CORPO);
      const fila = filaDe(id);
      assert.equal(fila.STATUS, 'enviado');
      assert.equal(Number(fila.TENTATIVAS), 2);
      assert.equal(fila.ULTIMO_ERRO, null);
      assert.ok(fila.ENVIADO_EM);
    }
    assert.equal(saidos.find((e) => e.subject === 'Pedido de compra 770002').body, '<p>Segue o pedido 770002.</p>');
    assert.ok(notas(CARD_FILA).some((nota) => /saiu na 2ª tentativa/.test(nota)));
  });

  const CARD_FALHA = await criarPedido('envio');
  await teste('C-005 (016) / RN-001: três tentativas no total — a 2ª volta para a fila, a 3ª é falha definitiva com nota no histórico e aviso para quem enviou', async () => {
    const { comunicacaoId } = await comEmailFalhando(() => envio(CARD_FALHA, '770003'));
    const segunda = await comEmailFalhando(processar);
    assert.equal(segunda.tentativasFalhas, 1, JSON.stringify(segunda));
    assert.equal(segunda.falhasDefinitivas, 0);
    assert.equal(filaDe(comunicacaoId).STATUS, 'pendente');
    assert.equal(Number(filaDe(comunicacaoId).TENTATIVAS), 2);

    const terceira = await comEmailFalhando(processar);
    assert.equal(terceira.falhasDefinitivas, 1, JSON.stringify(terceira));
    assert.equal(terceira.erros.length, 0, JSON.stringify(terceira.erros));
    const fila = filaDe(comunicacaoId);
    assert.equal(fila.STATUS, 'falha');
    assert.equal(Number(fila.TENTATIVAS), 3);
    const frase = 'O e-mail “Pedido de compra 770003” para pedidos@nutrilatina.com.br não saiu após 3 tentativas. Último erro: SMTP indisponível (simulado) Reenvie ao fornecedor.';
    assert.ok(notas(CARD_FALHA).some((nota) => nota.includes(frase)), 'nota no histórico');
    const aviso = um("SELECT * FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = 'email_falha'", CARD_FALHA);
    assert.equal(aviso.TEXTO, frase);
    assert.equal(Number(aviso.PARA_USUARIO_ID), U.ana, 'para quem enviou');
    const sino = (await chamar('sgcNotificacoesListar', { limite: 100, offset: 0 }, U.ana)).rows;
    assert.ok(sino.some((n) => Number(n.CARD_ID) === CARD_FALHA && n.TEXTO === frase), 'o aviso chega no sino de quem enviou');

    const emailsAntes = emails.length;
    const depois = await processar();
    assert.equal(depois.reservados, 0, 'falha definitiva não é mais tentada');
    assert.equal(emails.length, emailsAntes);
  });

  await teste('C-006 (016) / RN-004: a rodada reserva no máximo 20, do mais antigo, e outra rodada não pega os já reservados', async () => {
    assert.equal(conta("SELECT COUNT(*) AS N FROM SGC_EMAIL_FILA WHERE STATUS = 'pendente'"), 0);
    const ids = [];
    for (let i = 0; i < 22; i += 1) {
      const co = db.prepare(`INSERT INTO SGC_COMUNICACAO (ID_CARD, TIPO, PARA, CC, ASSUNTO, CORPO, ENVIADO_POR, ENVIADO_EM)
        VALUES (?, 'email', 'lote@fornecedor.com', 'compras@benenutri.com', ?, 'x', ?, ?)`).run(CARD_OK, `Lote ${i}`, U.ana, AGORA);
      const fila = db.prepare(`INSERT INTO SGC_EMAIL_FILA (ID_COMUNICACAO, ID_CARD, STATUS, TENTATIVAS, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
        VALUES (?, ?, 'pendente', 1, ?, ?, ?)`).run(Number(co.lastInsertRowid), CARD_OK, U.ana, AGORA, AGORA);
      ids.push(Number(fila.lastInsertRowid));
    }
    await chamar('sgcEscEmailFilaReservar', { lote: 'LA', agora: AGORA }, U.admin);
    await chamar('sgcEscEmailFilaReservar', { lote: 'LB', agora: AGORA }, U.admin);
    const doLote = (lote) => todos('SELECT ID FROM SGC_EMAIL_FILA WHERE LOTE = ? ORDER BY ID', lote).map((l) => Number(l.ID));
    assert.deepEqual(doLote('LA'), ids.slice(0, 20));
    assert.deepEqual(doLote('LB'), ids.slice(20));
    assert.equal(conta(`SELECT COUNT(*) AS N FROM SGC_EMAIL_FILA WHERE ID IN (${ids.join(',')}) AND STATUS = 'enviando'`), 22);
    db.prepare(`DELETE FROM SGC_COMUNICACAO WHERE ID IN (SELECT ID_COMUNICACAO FROM SGC_EMAIL_FILA WHERE ID IN (${ids.join(',')}))`).run();
    db.prepare(`DELETE FROM SGC_EMAIL_FILA WHERE ID IN (${ids.join(',')})`).run();
  });

  const CARD_PRESO = await criarPedido('envio');
  await teste('C-007 (016): e-mail preso em "enviando" há mais de 30 min conta tentativa falha e só sai na rodada seguinte', async () => {
    const { comunicacaoId } = await comEmailFalhando(() => envio(CARD_PRESO, '770004'));
    db.prepare("UPDATE SGC_EMAIL_FILA SET STATUS = 'enviando', LOTE = 'LMORTO', ATUALIZADO_EM = '2026-01-01T00:00:00' WHERE ID_COMUNICACAO = ?")
      .run(comunicacaoId);
    const emailsAntes = emails.length;
    const rodada = await processar();
    assert.equal(rodada.presos, 1, JSON.stringify(rodada));
    assert.equal(rodada.reservados, 0);
    assert.equal(emails.length, emailsAntes, 'o preso não é enviado na mesma rodada');
    let fila = filaDe(comunicacaoId);
    assert.equal(fila.STATUS, 'pendente');
    assert.equal(Number(fila.TENTATIVAS), 2);
    assert.equal(fila.ULTIMO_ERRO, ERRO_PRESO);
    assert.equal(fila.LOTE, null);

    const seguinte = await processar();
    assert.equal(seguinte.enviados, 1);
    fila = filaDe(comunicacaoId);
    assert.equal(fila.STATUS, 'enviado');
    assert.equal(Number(fila.TENTATIVAS), 3);
  });

  await teste('C-008 (016) / RNF-001: fila vazia termina sem chamar nenhuma outra server function', async () => {
    let chamadas = 0;
    byId.get = function contar(id) { chamadas += 1; return Map.prototype.get.call(this, id); };
    try {
      const rodada = await processar();
      assert.equal(rodada.reservados, 0);
      assert.equal(rodada.ok, true);
    } finally { delete byId.get; }
    assert.equal(chamadas, 0);
  });

  await teste('C-009 (016) / RN-003: só entra na fila comunicação por e-mail, gravada por quem envia pedido, e uma vez', async () => {
    const inserir = (cardId, tipo, para, por) => Number(db.prepare(`INSERT INTO SGC_COMUNICACAO (ID_CARD, TIPO, PARA, CC, ASSUNTO, CORPO, ENVIADO_POR, ENVIADO_EM)
      VALUES (?, ?, ?, '', 'x', 'x', ?, ?)`).run(cardId, tipo, para, por, AGORA).lastInsertRowid);
    const enfileirar = (idComunicacao, quem = U.leo) => chamar('sgcEscEmailFilaInserir', { idComunicacao, erro: 'x', agora: AGORA }, quem);

    const plataforma = inserir(CARD_OK, 'plataforma', 'https://portal.nutrilatina.com.br', U.ana);
    const doComercial = inserir(CARD_OK, 'email', 'pedidos@nutrilatina.com.br', U.leo);
    const semArroba = inserir(CARD_OK, 'email', 'pedidos', U.ana);
    for (const id of [plataforma, doComercial, semArroba]) {
      await enfileirar(id);
      assert.equal(filaDe(id), undefined, `comunicação ${id} não entra`);
    }
    await enfileirar(comunicacaoEnvio, U.ana);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_EMAIL_FILA WHERE ID_COMUNICACAO = ?', comunicacaoEnvio), 1, 'uma vez');
    assert.equal(filaDe(comunicacaoEnvio).STATUS, 'enviado', 'a repetida não reabre');
  });

  /* ─────────── pedido pronto para concluir ─────────── */

  let numnota = 96000;
  async function pedido({ fase = 'faturamento', vlFaturado = 1000, nfs = 1, conferencia = false, boAberto = false, boCancelado = 0 }) {
    const card = await criarPedido(fase);
    const numped = String(880000 + card);
    db.prepare('UPDATE SGC_PEDIDO SET VL_TOTAL = 1000, VL_FATURADO = ?, NUMPED_WINTHOR = ? WHERE ID_CARD = ?').run(vlFaturado, numped, card);
    db.prepare(`INSERT INTO SGC_PEDIDO_ITEM (ID_CARD, CODPROD, DESCRICAO, QT_PEDIDA, PRECO_CUSTO, STATUS, COBERTURA_DIAS, COBERTURA_LIMITE, CRIADO_EM, ATUALIZADO_EM)
      VALUES (?, 9161, 'ITEM 016', 100, 10, 'enviado', 0, 35, ?, ?)`).run(card, AGORA, AGORA);
    let idNf = 0;
    for (let i = 0; i < nfs; i += 1) {
      numnota += 1;
      idNf = Number(db.prepare(`INSERT INTO SGC_NF (ID_CARD, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, VL_TOTAL, ORIGEM, VINCULADO_POR, VINCULADO_EM)
        VALUES (?, ?, '1', 1015, '1', ?, 'manual', ?, ?)`).run(card, numnota, vlFaturado, U.ana, AGORA).lastInsertRowid);
    }
    if (conferencia) {
      db.prepare(`INSERT INTO SGC_NF_OCORRENCIA (ID_NF, ID_CARD, CODPROD, TIPO, RESULTADO, DECISAO, CRIADO_EM)
        VALUES (?, ?, 9161, 'preco', 'divergente', 'pendente', ?)`).run(idNf, card, AGORA);
    }
    if (boAberto || boCancelado) {
      db.prepare(`INSERT INTO SGC_BO_ITEM (ID_CARD, CODPROD, DESCRICAO, QT_PENDENTE, STATUS, CRIADO_POR, CRIADO_EM)
        VALUES (?, 9161, 'ITEM 016', ?, ?, ?, ?)`).run(card, boCancelado || 10, boAberto ? 'aberto' : 'cancelado', U.ana, AGORA);
    }
    return { card, numped };
  }
  const avisosDe = (card) => todos("SELECT * FROM SGC_AVISO WHERE ID_CARD = ? AND TIPO = 'pronto_conclusao' ORDER BY ID", card);

  const P = {
    pronto: await pedido({}),
    conferencia: await pedido({ conferencia: true }),
    boAberto: await pedido({ boAberto: true }),
    oitenta: await pedido({ vlFaturado: 800 }),
    noventaENove: await pedido({ vlFaturado: 996 }),
    naoVemMais: await pedido({ vlFaturado: 900, boCancelado: 10 }),
    semNota: await pedido({ nfs: 0 }),
    emBo: await pedido({ fase: 'bo', vlFaturado: 900, boCancelado: 10 }),
    concluido: await pedido({ fase: 'concluido' }),
    transito: await pedido({ fase: 'transito' }),
  };
  const rodada = await avisar();

  await teste('C-010 (016) / RN-006: o pedido pronto recebe o aviso no sino dos responsáveis, com o texto, e o card não sai do lugar', async () => {
    assert.equal(rodada.ok, true);
    assert.equal(rodada.erros.length, 0, JSON.stringify(rodada.erros));
    const [aviso] = avisosDe(P.pronto.card);
    assert.ok(aviso, 'aviso criado');
    assert.equal(aviso.TEXTO, `Pedido de Nutrilatina (pedido ${P.pronto.numped}) pronto para concluir: 1 nota, 100,0 % do valor coberto, sem conferência nem B.O. pendente. Confira e mova o card para Compras Concluídas.`);
    assert.equal(aviso.CHAVE, `pronto_conclusao:${P.pronto.card}:${HOJE}`);
    assert.equal(Number(aviso.PARA_USUARIO_ID), 0, 'sem destinatário = os responsáveis');
    assert.equal(faseDe(P.pronto.card), fases.faturamento, 'não move o card');
    const sino = (await chamar('sgcNotificacoesListar', { limite: 200, offset: 0 }, U.ana)).rows;
    assert.ok(sino.some((n) => Number(n.CARD_ID) === P.pronto.card && n.TEXTO === aviso.TEXTO), 'a responsável vê');
    const doGil = (await chamar('sgcNotificacoesListar', { limite: 200, offset: 0 }, U.gil)).rows;
    assert.ok(!doGil.some((n) => Number(n.CARD_ID) === P.pronto.card), 'quem não é responsável não vê');
  });

  await teste('C-011 (016) / RNF-002: conferência pendente, B.O. em aberto ou menos de 99,5 % não recebem aviso — e é a mesma trava do mover para Compras Concluídas', async () => {
    for (const chave of ['conferencia', 'boAberto', 'oitenta']) {
      assert.equal(avisosDe(P[chave].card).length, 0, `${chave} não é avisado`);
    }
    // Paridade: aviso <=> o gancho libera a conclusão, para todo pedido das fases de conclusão com nota.
    for (const chave of ['pronto', 'conferencia', 'boAberto', 'oitenta', 'noventaENove', 'naoVemMais', 'emBo']) {
      const { card } = P[chave];
      const pode = (await chamar('sgcPodeMover', { usuarioId: U.ana, cardId: card, boardId, faseId: fases.concluido }, U.ana)).rows[0];
      assert.equal(Number(pode.PODE) === 1, avisosDe(card).length === 1, `${chave}: PODE ${pode.PODE} (${pode.MOTIVO})`);
    }
  });

  await teste('C-012 (016) / RN-005: 99,6 % faturado conta como 100 %, e o saldo em B.O. que não vem mais conta como coberto', async () => {
    assert.match(avisosDe(P.noventaENove.card)[0].TEXTO, /99,6 % do valor coberto/);
    assert.match(avisosDe(P.naoVemMais.card)[0].TEXTO, /100,0 % do valor coberto/);
  });

  await teste('C-013 (016) / P-06: pedido sem nota vinculada não recebe aviso, mesmo passando na trava', async () => {
    assert.equal(avisosDe(P.semNota.card).length, 0);
  });

  await teste('C-014 (016) / P-05: pedido em Produtos em B.O. com tudo resolvido e coberto também recebe', async () => {
    assert.equal(avisosDe(P.emBo.card).length, 1);
    assert.equal(faseDe(P.emBo.card), fases.bo);
  });

  await teste('C-015 (016) / P-07: um aviso por dia — a segunda rodada do dia não repete; no dia seguinte, se continua pronto, avisa de novo', async () => {
    const mesmoDia = await avisar();
    assert.equal(avisosDe(P.pronto.card).length, 1);
    assert.ok(!mesmoDia.erros.length);
    await avisar('2026-11-04');
    const avisos = avisosDe(P.pronto.card);
    assert.equal(avisos.length, 2);
    assert.equal(avisos[1].CHAVE, `pronto_conclusao:${P.pronto.card}:2026-11-04`);
  });

  await teste('C-016 (016): concluído e em trânsito, mesmo 100 % faturados, não recebem aviso', async () => {
    assert.equal(avisosDe(P.concluido.card).length, 0);
    assert.equal(avisosDe(P.transito.card).length, 0);
  });
}
