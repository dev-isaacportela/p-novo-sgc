// Smoke da spec 015 (quadro de empenhos): o fluxo inteiro com as SFs reais do
// add-017 e o gancho do add-005 (R-161) — pregão, empenho, itens em lote,
// análise, técnica, diretoria (congela), desmembramento, envio, trânsito,
// pendência, conclusão, reagrupamento, reprovação, cancelamento, excluir e os
// indicadores. O que é regra pura (CMV, decisão, prontidão, prazos) está em
// frontend/tests/empenhos.test.mjs; aqui se prova o SQL.
import { assert, CENARIO } from './base.mjs';
import { MENSAGENS_EMPENHO as M } from '../../add-017-empenhos.mjs';

const AGORA = '2026-11-03T12:00:00';

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;
  const E = CENARIO.empenhos;
  const { boardId, fases } = E;

  const uma = (resultado) => resultado.rows[0];
  const linhas = (resultado) => resultado.rows;
  const empenhoDoCard = (cardId) => db.prepare('SELECT * FROM SGC_EMP_EMPENHO WHERE ID_CARD = ?').get(cardId);
  const pedidoDoCard = (cardId) => db.prepare('SELECT * FROM SGC_EMP_CARD WHERE ID_CARD = ?').get(cardId);
  const faseDe = (cardId) => Number(db.prepare('SELECT FASE_ID FROM KB_CARD WHERE ID = ?').get(cardId).FASE_ID);

  const podeMover = async (usuarioId, cardId, chave) => uma(await chamar('sgcPodeMover', {
    usuarioId, cardId, boardId, faseId: fases[chave],
  }, usuarioId));
  const podeExcluir = async (usuarioId, cardId) => uma(await chamar('sgcPodeExcluir', {
    usuarioId, cardId, boardId, faseId: 0,
  }, usuarioId));
  const mover = async (usuarioId, cardId, chave) => {
    const movido = await chamar('kbCardMover', { cardId, faseId: fases[chave], ordem: 0 }, usuarioId);
    assert.equal(movido.ok, true, `${chave}: ${movido.error}`);
    assert.equal(faseDe(cardId), fases[chave]);
  };
  const recusa = async (usuarioId, cardId, chave, motivo) => {
    const regra = await podeMover(usuarioId, cardId, chave);
    assert.equal(Number(regra.PODE), 0, `${chave} devia recusar`);
    if (motivo) assert.equal(regra.MOTIVO, motivo);
  };
  const libera = async (usuarioId, cardId, chave) => {
    const regra = await podeMover(usuarioId, cardId, chave);
    assert.equal(Number(regra.PODE), 1, `${chave}: ${regra.MOTIVO}`);
    assert.equal(regra.MOTIVO, '', 'R-020: MOTIVO vazio quando PODE = 1');
  };

  const ITENS = [
    { codprod: 6601, descricao: 'DIETA ENTERAL TESTE 1L', codfab: 'FK-6601', codfornec: 1661, fornecedor: 'Industria Teste A', qtEmpenho: 100, precoVenda: 45.5, custoPadrao: 28, custoNegociado: 25 },
    { codprod: 6602, descricao: 'SUPLEMENTO PROTEICO TESTE 400G', codfab: 'NL-6602', codfornec: 1662, fornecedor: 'Industria Teste B', qtEmpenho: 35, precoVenda: 132.52, custoPadrao: 96.28 },
    { codprod: 6603, descricao: 'MODULO DE FIBRAS TESTE 200G', codfab: 'FK-6603', codfornec: 1661, fornecedor: 'Industria Teste A', qtEmpenho: 10, precoVenda: 20, custoPadrao: 12 },
  ];

  /** Cria um empenho como a janela Novo empenho: kbCardCriar + capa + itens em lote. */
  async function criarEmpenho(usuarioId = U.ana, itens = ITENS, numEmpenho = '2026NE000777') {
    const criado = await chamar('kbCardCriar', {
      boardId, titulo: `PE 90/2026 · ${numEmpenho}`, responsaveisIds: String(usuarioId), prazo: '2026-11-20',
      valoresJson: JSON.stringify({ orgao: E.orgao.nome, filial: 'Benenutri Matriz' }),
    }, usuarioId);
    assert.equal(criado.ok, true, criado.error);
    await chamar('sgcEscEmpEmpenhoCriar', {
      cardId: criado.id, idPregao: E.idPregao, numEmpenho, codfilial: '1', filial: 'Benenutri Matriz', codfilialPedido: '1',
      dtRecebimento: '2026-11-03', prazoDias: 15, prazoUnidade: 'CORRIDOS', dtLimite: '2026-11-18', aceitaParcial: 0,
      observacao: '', agora: AGORA,
    }, usuarioId);
    const gravado = await chamar('sgcEmpItensGravar', { cardId: criado.id, itensJson: JSON.stringify(itens), removerJson: '[]' }, usuarioId);
    assert.equal(gravado.ok, true, gravado.erro);
    return criado.id;
  }
  const decidir = (cardId, decisoes, usuarioId = U.ana) => chamar('sgcEmpItensGravar', {
    cardId, removerJson: '[]',
    itensJson: JSON.stringify(ITENS.map((item) => ({ ...item, ...(decisoes[item.codprod] || {}) }))),
  }, usuarioId);

  await teste('C-002: o quadro empenhos tem as 10 chaves emp_* na ordem, com sucesso e cancelado nas duas finais', async () => {
    const chaves = db.prepare(`SELECT SF.CHAVE, KF.TIPO FROM SGC_EMP_FASE SF JOIN KB_FASE KF ON KF.ID = SF.FASE_ID
      WHERE SF.BOARD_ID = ? ORDER BY KF.ORDEM`).all(boardId);
    assert.deepEqual(chaves.map((c) => c.CHAVE), ['emp_analise', 'emp_tecnica', 'emp_diretoria', 'emp_pedidos', 'emp_envio',
      'emp_aguardando', 'emp_transito', 'emp_pendencia', 'emp_concluido', 'emp_cancelado']);
    assert.equal(chaves[8].TIPO, 'sucesso');
    assert.equal(chaves[9].TIPO, 'cancelado');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM KB_CAMPO WHERE BOARD_ID = ? AND OBRIGATORIO = 1').get(boardId).N), 0);
  });

  await teste('C-003 / R-161: o gancho devolve UMA linha para card de compras (a regra de compras) e uma para card de empenho', async () => {
    const compras = await chamar('sgcPodeMover', {
      usuarioId: U.ana, cardId: 1, boardId: CENARIO.boardCompras, faseId: CENARIO.fases.diretoria,
    }, U.ana);
    assert.equal(linhas(compras).length, 1);
    assert.ok(!Object.values(M).includes(uma(compras).MOTIVO), "card de compras responde pela regra de compras");
    const empenho = await chamar('sgcPodeMover', { usuarioId: U.ana, cardId: E.cardId, boardId, faseId: fases.emp_tecnica }, U.ana);
    assert.equal(linhas(empenho).length, 1);
    const excluirCompras = await chamar('sgcPodeExcluir', { usuarioId: U.gil, cardId: 1, boardId: CENARIO.boardCompras, faseId: 0 }, U.gil);
    assert.equal(linhas(excluirCompras).length, 1);
    assert.equal(Number(uma(excluirCompras).PODE), 1);
  });

  await teste('C-004 / C-005: Ana cadastra pregão; edital repetido não cria; Leo (comercial) não grava', async () => {
    const dados = { codigoEdital: 'PE 91/2026', orgao: E.orgao.nome, codcli: E.orgao.codcli, vigenciaFim: '2027-01-31', agora: AGORA };
    await chamar('sgcEscEmpPregaoCriar', dados, U.ana);
    await chamar('sgcEscEmpPregaoCriar', { ...dados, codigoEdital: 'pe 91/2026' }, U.gil);
    await chamar('sgcEscEmpPregaoCriar', { ...dados, codigoEdital: 'PE 92/2026' }, U.leo);
    const editais = db.prepare("SELECT CODIGO_EDITAL FROM SGC_EMP_PREGAO WHERE CODIGO_EDITAL IN ('PE 91/2026', 'pe 91/2026', 'PE 92/2026')").all();
    assert.deepEqual(editais.map((l) => l.CODIGO_EDITAL), ['PE 91/2026']);
  });

  await teste('C-008: kbCardCriar + capa + itens nascem na Análise; capa sobre card de compras não grava', async () => {
    const card = await criarEmpenho();
    assert.equal(faseDe(card), fases.emp_analise);
    const capa = empenhoDoCard(card);
    assert.equal(capa.CRIADO_POR, U.ana);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_EMP_ITEM WHERE ID_EMPENHO = ?').get(capa.ID).N), 3);
    await chamar('sgcEscEmpEmpenhoCriar', {
      cardId: 1, idPregao: E.idPregao, numEmpenho: 'X', codfilial: '1', filial: 'X', codfilialPedido: '1',
      dtRecebimento: '2026-11-03', prazoDias: 0, prazoUnidade: 'CORRIDOS', dtLimite: '', aceitaParcial: 0, observacao: '', agora: AGORA,
    }, U.ana);
    assert.equal(empenhoDoCard(1), undefined);
  });

  await teste('C-006: pregões filtrados pelo órgão trazem QT_EMPENHOS, valor e TOTAL_REGISTROS; empenhos do pregão com a fase', async () => {
    const pregoes = linhas(await chamar('sgcEmpPregoesListar', { busca: 'prefeitura municipal de teste', limite: 50, offset: 0 }));
    const pe90 = pregoes.find((p) => p.CODIGO_EDITAL === 'PE 90/2026');
    assert.ok(pe90);
    assert.ok(Number(pe90.QT_EMPENHOS) >= 2);
    assert.ok(Number(pe90.VL_TOTAL) > 0);
    assert.equal(Number(pe90.TOTAL_REGISTROS), pregoes.length);
    const empenhos = linhas(await chamar('sgcEmpPregaoEmpenhos', { idPregao: E.idPregao, limite: 50, offset: 0 }));
    assert.ok(empenhos.length >= 2);
    assert.ok(empenhos.every((e) => e.FASE === 'emp_analise' && e.FASE_NOME === 'Análise'));
  });

  await teste('C-012: busca de produto no ERP traz o código de fábrica e a indústria; por código também', async () => {
    const porNome = linhas(await chamar('sgcWintEmpProdutos', { codprod: 0, busca: 'teste 1l' }));
    const dieta = porNome.find((p) => Number(p.CODPROD) === 6601);
    assert.equal(dieta.CODFAB, 'FK-6601');
    assert.ok(dieta.FORNECEDOR.length > 0);
    const porCodigo = linhas(await chamar('sgcWintEmpProdutos', { codprod: 6602, busca: '' }));
    assert.deepEqual(porCodigo.map((p) => Number(p.CODPROD)), [6602]);
    const clientes = linhas(await chamar('sgcWintEmpClientes', { codcli: 0, busca: 'teste' }));
    assert.ok([11, 12, 13, 14, 15].includes(Number(clientes[0].CODATV1)), 'órgão público primeiro');
    assert.ok(clientes.some((c) => Number(c.CODCLI) === E.orgao.codcli));
  });

  await teste('C-014 / RN-005 / P-02: estoque das filiais — disponível sem retido, filial 99 fora, venda de 45 d com público e sem rede nem remessa', async () => {
    const posicao = linhas(await chamar('sgcWintEmpEstoqueFiliais', { codprods: '6601, 6602' }));
    const f1 = posicao.find((l) => Number(l.CODPROD) === 6601 && l.CODFILIAL === '1');
    assert.equal(Number(f1.QT_DISPONIVEL), 30);
    assert.equal(Number(f1.QT_RETIDO), 10);
    assert.equal(Number(f1.QT_VENDA_45D), 45, '30 ao órgão + 15 ao privado; 20 à rede e 7 de remessa ficam fora');
    assert.ok(!posicao.some((l) => l.CODFILIAL === '99'));
    const f3 = posicao.find((l) => Number(l.CODPROD) === 6602 && l.CODFILIAL === '3');
    assert.equal(Number(f3.QT_VENDA_45D), 0);
    assert.ok(f3.DT_ULTIMA_VENDA, 'a última venda vem de antes da janela de 45 dias');
  });

  /* ─────────── o fluxo do empenho ─────────── */

  const CARD = await criarEmpenho(U.ana, ITENS, '2026NE000888');

  await teste('C-017 / RNF-002: três itens numa chamada; valor, custo e CMV vivos recalculados; Leo não grava', async () => {
    const r = await decidir(CARD, { 6601: { qtCompra: 60, qtTransferencia: 30, codfilialOrigem: '2', qtEstoque: 10 } });
    assert.equal(r.ok, true, r.erro);
    assert.equal(r.itens, 3);
    const capa = empenhoDoCard(CARD);
    // RN-001: 6601 pelo negociado (25), os outros pelo padrão.
    assert.equal(Number(capa.VL_TOTAL), 100 * 45.5 + 35 * 132.52 + 10 * 20);
    assert.equal(Number(capa.VL_CUSTO), Math.round((100 * 25 + 35 * 96.28 + 10 * 12) * 100) / 100);
    assert.ok(Math.abs(Number(capa.CMV_PERC) - Number(capa.VL_CUSTO) / Number(capa.VL_TOTAL)) < 0.0001);
    const leo = await decidir(CARD, {}, U.leo);
    assert.equal(leo.ok, false);
  });

  await teste('C-018 / RN-007: Análise → Técnica recusada com item aberto, liberada com tudo decidido', async () => {
    await recusa(U.ana, CARD, 'emp_tecnica', M.analise);
    await decidir(CARD, {
      6601: { qtCompra: 60, qtTransferencia: 30, codfilialOrigem: '2', qtEstoque: 10 },
      6602: { qtCompra: 35 },
      6603: { qtEstoque: 10 },
    });
    await libera(U.ana, CARD, 'emp_tecnica');
    await decidir(CARD, {
      6601: { qtCompra: 60, qtTransferencia: 30, codfilialOrigem: '', qtEstoque: 10 },
      6602: { qtCompra: 35 }, 6603: { qtEstoque: 10 },
    });
    await recusa(U.ana, CARD, 'emp_tecnica', M.analise);
    await decidir(CARD, {
      6601: { qtCompra: 60, qtTransferencia: 30, codfilialOrigem: '2', qtEstoque: 10 },
      6602: { qtCompra: 35 }, 6603: { qtEstoque: 10 },
    });
  });

  await teste('C-019: cabeçalho salvo na Análise; fora dela não', async () => {
    const cabecalho = {
      cardId: CARD, numEmpenho: '2026NE000889', codfilialPedido: '2', dtRecebimento: '2026-11-03', prazoDias: 10,
      prazoUnidade: 'UTEIS', dtLimite: '2026-11-17', aceitaParcial: 1, observacao: 'corrigido', agora: AGORA,
    };
    await chamar('sgcEscEmpCabecalhoSalvar', cabecalho, U.ana);
    assert.equal(empenhoDoCard(CARD).NUM_EMPENHO, '2026NE000889');
    assert.equal(empenhoDoCard(CARD).PRAZO_UNIDADE, 'UTEIS');
    await chamar('sgcEscEmpCabecalhoSalvar', { ...cabecalho, codfilialPedido: '1' }, U.ana);
  });

  await teste('C-020 / C-024 / RN-009: técnica só por gestor ou admin, gravada antes de mover; diretoria fora da fase dela não move', async () => {
    await chamar('sgcEscEmpAnaliseEnviar', { cardId: CARD, agora: AGORA }, U.ana);
    await mover(U.ana, CARD, 'emp_tecnica');
    await chamar('sgcEscEmpCabecalhoSalvar', {
      cardId: CARD, numEmpenho: 'NAO GRAVA', codfilialPedido: '1', dtRecebimento: '2026-11-03', prazoDias: 0,
      prazoUnidade: 'CORRIDOS', dtLimite: '', aceitaParcial: 0, observacao: '', agora: AGORA,
    }, U.ana);
    assert.equal(empenhoDoCard(CARD).NUM_EMPENHO, '2026NE000889', 'C-019: fora da Análise o cabeçalho não muda');
    await recusa(U.gil, CARD, 'emp_diretoria', M.tecnica);
    await recusa(U.dora, CARD, 'emp_diretoria', M.diretoria);
    await chamar('sgcEscEmpAprovarTecnica', { cardId: CARD, agora: AGORA }, U.ana);
    assert.equal(empenhoDoCard(CARD).TEC_EM, null);
    await chamar('sgcEscEmpAprovarTecnica', { cardId: CARD, agora: AGORA }, U.gil);
    assert.equal(empenhoDoCard(CARD).TEC_POR, U.gil);
    await libera(U.gil, CARD, 'emp_diretoria');
  });

  await teste('C-023: reprovar exige motivo de 10+ e a fase de quem decide; a volta só com a reprovação gravada; a rodada recomeça limpa', async () => {
    await recusa(U.gil, CARD, 'emp_analise', M.reprovar);
    await chamar('sgcEscEmpReprovar', { cardId: CARD, fase: 'tecnica', motivo: 'curto', agora: AGORA }, U.gil);
    assert.equal(empenhoDoCard(CARD).REPROV_FASE, null);
    await chamar('sgcEscEmpReprovar', { cardId: CARD, fase: 'tecnica', motivo: 'Preço do contrato errado no item 2', agora: AGORA }, U.ana);
    assert.equal(empenhoDoCard(CARD).REPROV_FASE, null, 'analista não reprova a técnica');
    await chamar('sgcEscEmpReprovar', { cardId: CARD, fase: 'tecnica', motivo: 'Preço do contrato errado no item 2', agora: AGORA }, U.gil);
    const reprovado = empenhoDoCard(CARD);
    assert.equal(reprovado.REPROV_FASE, 'tecnica');
    assert.equal(reprovado.TEC_EM, null, 'reprovar apaga a aprovação');
    await mover(U.gil, CARD, 'emp_analise');
    await chamar('sgcEscEmpAnaliseEnviar', { cardId: CARD, agora: AGORA }, U.ana);
    assert.equal(empenhoDoCard(CARD).REPROV_FASE, null);
    await mover(U.ana, CARD, 'emp_tecnica');
    await recusa(U.gil, CARD, 'emp_analise', M.reprovar);
    await chamar('sgcEscEmpAprovarTecnica', { cardId: CARD, agora: AGORA }, U.gil);
    await mover(U.gil, CARD, 'emp_diretoria');
  });

  const pedidos = {};
  await teste('C-021 / RN-003 / RN-010: diretoria aprova e congela; um pedido por indústria e um de transferência com uma pendência por item', async () => {
    await recusa(U.dora, CARD, 'emp_pedidos', M.diretoriaAprov);
    await chamar('sgcEscEmpAprovarDiretoria', { cardId: CARD, agora: AGORA }, U.gil);
    assert.equal(empenhoDoCard(CARD).DIR_EM, null, 'gestor não aprova a diretoria');
    await chamar('sgcEscEmpAprovarDiretoria', { cardId: CARD, agora: AGORA }, U.dora);
    const congelado = empenhoDoCard(CARD);
    assert.equal(congelado.CONGELADO_EM, AGORA);
    assert.ok(Number(congelado.CMV_PERC) > 0);

    const gerar = async (tipo, codfornec, fornecedor, entrada) => {
      const criado = await chamar('kbCardCriar', {
        boardId, titulo: `PE 90/2026 · ${fornecedor}`, responsaveisIds: String(U.ana), prazo: '2026-11-17', valoresJson: '{}',
      }, U.dora);
      assert.equal(criado.ok, true, criado.error);
      await chamar('sgcEscEmpPedidoRegistrar', { cardId: CARD, cardFilho: criado.id, tipo, codfornec, fornecedor, agora: AGORA }, U.dora);
      if (tipo === 'TRANSFERENCIA') await chamar('sgcEscEmpPendenciasTransferencia', { cardFilho: criado.id, agora: AGORA }, U.dora);
      await mover(U.dora, criado.id, entrada);
      return criado.id;
    };
    pedidos.fresenius = await gerar('FORNECEDOR', 1661, 'Industria Teste A', 'emp_envio');
    pedidos.nutri = await gerar('FORNECEDOR', 1662, 'Industria Teste B', 'emp_envio');
    pedidos.transferencia = await gerar('TRANSFERENCIA', 0, 'Transferência entre filiais', 'emp_pendencia');

    const fresenius = pedidoDoCard(pedidos.fresenius);
    assert.equal(Number(fresenius.VL_TOTAL), 60 * 45.5, 'só a parte comprada do 6601 (o 6603 é estoque)');
    assert.equal(Number(fresenius.VL_CUSTO), 60 * 25);
    assert.equal(Number(pedidoDoCard(pedidos.nutri).VL_CUSTO), Math.round(35 * 96.28 * 100) / 100);
    const pendencias = db.prepare("SELECT * FROM SGC_EMP_PENDENCIA WHERE ID_CARD = ? AND TIPO = 'TRANSFERENCIA'").all(pedidos.transferencia);
    assert.equal(pendencias.length, 1);
    assert.equal(Number(pendencias[0].QT), 30);
    assert.equal(pendencias[0].CODFILIAL_ORIGEM, '2');

    // Repetir não duplica: o mesmo fornecedor e o mesmo card não registram de novo.
    const extra = await chamar('kbCardCriar', { boardId, titulo: 'duplicado', responsaveisIds: '', prazo: '', valoresJson: '{}' }, U.dora);
    await chamar('sgcEscEmpPedidoRegistrar', { cardId: CARD, cardFilho: extra.id, tipo: 'FORNECEDOR', codfornec: 1661, fornecedor: 'X', agora: AGORA }, U.dora);
    assert.equal(pedidoDoCard(extra.id), undefined);
    await chamar('kbCardExcluir', { cardId: extra.id }, U.admin);

    await recusa(U.dora, CARD, 'emp_pedidos', M.diretoriaAprov);
    await chamar('sgcEscEmpDesmembrado', { cardId: CARD, agora: AGORA }, U.dora);
    await recusa(U.dora, CARD, 'emp_concluido', M.nadaAPedir);
    await mover(U.dora, CARD, 'emp_pedidos');
  });

  await teste('C-025 / C-026 / C-028 / RN-008: envio pede número e data; trânsito pede previsão; pendência aberta segura o avanço', async () => {
    const card = pedidos.fresenius;
    await recusa(U.ana, card, 'emp_aguardando', M.envio);
    await recusa(U.ana, card, 'emp_concluido', M.semTransicao);
    await chamar('sgcEscEmpPedidoEnvio', { cardId: card, numPedido: '', dtPedido: '2026-11-04' }, U.ana);
    assert.equal(pedidoDoCard(card).NUM_PEDIDO, null);
    await chamar('sgcEscEmpPedidoEnvio', { cardId: card, numPedido: 'PC-4471', dtPedido: '2026-11-04' }, U.ana);
    await mover(U.ana, card, 'emp_aguardando');
    await recusa(U.ana, card, 'emp_transito', M.previsao);
    await chamar('sgcEscEmpPedidoPrevisao', { cardId: card, dtPrevisao: '2026-11-12' }, U.ana);
    await mover(U.ana, card, 'emp_transito');
  });

  await teste('C-029 / C-030 / RN-011: pendência de 10+ leva a Pendência; fechar a última volta ao trânsito', async () => {
    const card = pedidos.fresenius;
    await recusa(U.ana, card, 'emp_pendencia', M.semPendencia);
    await chamar('sgcEscEmpPendenciaAbrir', { cardId: card, codprod: 6601, tipo: 'BO', descricao: 'curta', previsao: '', agora: AGORA }, U.ana);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_EMP_PENDENCIA WHERE ID_CARD = ?').get(card).N), 0);
    await chamar('sgcEscEmpPendenciaAbrir', { cardId: card, codprod: 6601, tipo: 'XPTO', descricao: 'Indústria sem o lote de dezembro', previsao: '2026-11-20', agora: AGORA }, U.ana);
    const pendencia = db.prepare('SELECT * FROM SGC_EMP_PENDENCIA WHERE ID_CARD = ?').get(card);
    assert.equal(pendencia.TIPO, 'BO', 'tipo desconhecido vira BO');
    await recusa(U.ana, card, 'emp_concluido', M.pendenciaAberta);
    await mover(U.ana, card, 'emp_pendencia');
    await recusa(U.ana, card, 'emp_transito', M.pendenciaAberta);
    await chamar('sgcEscEmpPendenciaFechar', { id: pendencia.ID, status: 'RESOLVIDA', agora: AGORA }, U.leo);
    assert.equal(db.prepare('SELECT STATUS FROM SGC_EMP_PENDENCIA WHERE ID = ?').get(pendencia.ID).STATUS, 'ABERTA');
    await chamar('sgcEscEmpPendenciaFechar', { id: pendencia.ID, status: 'RESOLVIDA', agora: AGORA }, U.ana);
    await mover(U.ana, card, 'emp_transito');
  });

  await teste('C-027 / C-032: recebido conclui o pedido; o empenho só volta a ser um quando o último terminar', async () => {
    await recusa(U.ana, pedidos.fresenius, 'emp_concluido', M.recebido);
    await chamar('sgcEscEmpPedidoRecebido', { cardId: pedidos.fresenius, dtRecebido: '2026-11-12' }, U.ana);
    await mover(U.ana, pedidos.fresenius, 'emp_concluido');
    await recusa(U.ana, CARD, 'emp_concluido', M.reagrupar);
  });

  await teste('C-031: a transferência só anda com as pendências de transferência fechadas e não tem envio', async () => {
    const card = pedidos.transferencia;
    await recusa(U.ana, card, 'emp_transito', M.pendenciaAberta);
    await recusa(U.ana, card, 'emp_envio', M.semTransicao);
    const pendencia = db.prepare('SELECT ID FROM SGC_EMP_PENDENCIA WHERE ID_CARD = ?').get(card);
    await chamar('sgcEscEmpPendenciaFechar', { id: pendencia.ID, status: 'RESOLVIDA', agora: AGORA }, U.ana);
    await mover(U.ana, card, 'emp_transito');
    await chamar('sgcEscEmpPedidoRecebido', { cardId: card, dtRecebido: '2026-11-10' }, U.ana);
    await mover(U.ana, card, 'emp_concluido');
  });

  await teste('C-032 / RN-012: com o último pedido final, o empenho vai a Concluídos (não a Cancelados)', async () => {
    const card = pedidos.nutri;
    await chamar('sgcEscEmpPedidoEnvio', { cardId: card, numPedido: 'NL-9', dtPedido: '2026-11-04' }, U.ana);
    await mover(U.ana, card, 'emp_aguardando');
    await chamar('sgcEscEmpPedidoPrevisao', { cardId: card, dtPrevisao: '2026-11-08' }, U.ana);
    await mover(U.ana, card, 'emp_transito');
    await chamar('sgcEscEmpPedidoRecebido', { cardId: card, dtRecebido: '2026-11-08' }, U.ana);
    await mover(U.ana, card, 'emp_concluido');
    await recusa(U.ana, CARD, 'emp_cancelado', M.reagrupar);
    await mover(U.ana, CARD, 'emp_concluido');
  });

  await teste('C-033 / P-13: cancelar exige motivo de 10+; com ele o empenho e os pedidos abertos vão a Cancelados', async () => {
    const card = await criarEmpenho(U.ana, ITENS, '2026NE000999');
    await recusa(U.ana, card, 'emp_cancelado', M.cancelar);
    await chamar('sgcEscEmpCancelar', { cardId: card, motivo: 'curto', agora: AGORA }, U.ana);
    assert.equal(empenhoDoCard(card).CANC_MOTIVO, null);
    await chamar('sgcEscEmpCancelar', { cardId: card, motivo: 'Órgão anulou o empenho', agora: AGORA }, U.leo);
    assert.equal(empenhoDoCard(card).CANC_MOTIVO, null, 'comercial não cancela');
    await chamar('sgcEscEmpCancelar', { cardId: card, motivo: 'Órgão anulou o empenho', agora: AGORA }, U.ana);
    assert.equal(empenhoDoCard(card).CANC_POR, U.ana);
    await mover(U.ana, card, 'emp_cancelado');
  });

  await teste('C-034: excluir só o empenho na Análise sem pedido, por admin, gestor ou diretoria; pedido desmembrado nunca', async () => {
    assert.equal(Number((await podeExcluir(U.gil, E.cardId)).PODE), 1);
    const analista = await podeExcluir(U.ana, E.cardId);
    assert.equal(Number(analista.PODE), 0);
    assert.equal(analista.MOTIVO, M.excluir);
    assert.equal(Number((await podeExcluir(U.gil, pedidos.nutri)).PODE), 0);
    assert.equal(Number((await podeExcluir(U.gil, CARD)).PODE), 0);
  });

  await teste('C-022: tudo do estoque — a diretoria aprova e o empenho vai direto a Concluídos, sem pedido', async () => {
    const card = await criarEmpenho(U.ana, ITENS, '2026NE001000');
    await decidir(card, { 6601: { qtEstoque: 100 }, 6602: { qtEstoque: 35 }, 6603: { qtEstoque: 10 } });
    await chamar('sgcEscEmpAnaliseEnviar', { cardId: card, agora: AGORA }, U.ana);
    await mover(U.ana, card, 'emp_tecnica');
    await chamar('sgcEscEmpAprovarTecnica', { cardId: card, agora: AGORA }, U.gil);
    await mover(U.gil, card, 'emp_diretoria');
    await recusa(U.dora, card, 'emp_concluido', M.diretoriaAprov);
    await chamar('sgcEscEmpAprovarDiretoria', { cardId: card, agora: AGORA }, U.dora);
    await recusa(U.dora, card, 'emp_pedidos', M.diretoriaAprov);
    await chamar('sgcEscEmpDesmembrado', { cardId: card, agora: AGORA }, U.dora);
    assert.equal(empenhoDoCard(card).DESMEMBRADO_EM, null, 'P-07: sem pedido não carimba');
    await mover(U.dora, card, 'emp_concluido');
  });

  await teste('RNF-001: sgcEmpCarregar devolve empenho, itens, pedidos e pendências numa execução, com o papel do card; Leo não lê', async () => {
    const doEmpenho = await chamar('sgcEmpCarregar', { cardId: CARD }, U.ana);
    assert.equal(doEmpenho.ok, true, doEmpenho.erro);
    assert.equal(doEmpenho.papel, 'EMPENHO');
    assert.equal(doEmpenho.empenho.FASE, 'emp_concluido');
    assert.equal(doEmpenho.empenho.CODIGO_EDITAL, 'PE 90/2026');
    assert.equal(doEmpenho.itens.length, 3);
    assert.equal(doEmpenho.pedidos.length, 3);
    assert.ok(doEmpenho.pendencias.length >= 2);
    const doPedido = await chamar('sgcEmpCarregar', { cardId: pedidos.transferencia }, U.ana);
    assert.equal(doPedido.papel, 'TRANSFERENCIA');
    assert.equal(Number(doPedido.pedido.ID_CARD), pedidos.transferencia);
    const leo = await chamar('sgcEmpCarregar', { cardId: CARD }, U.leo);
    assert.equal(leo.ok, false);
  });

  await teste('C-036 / RN-014: indicadores do período — resumo sem o cancelado no valor, prazos, por órgão e venda pública × privada', async () => {
    const periodo = { dataInicio: '2026-11-01', dataFim: '2026-11-30', codfilial: '' };
    const resumo = uma(await chamar('sgcEmpIndicadoresResumo', periodo));
    assert.ok(Number(resumo.QT_EMPENHOS) >= 4);
    assert.ok(Number(resumo.QT_CONCLUIDOS) >= 2);
    assert.ok(Number(resumo.QT_CANCELADOS) >= 1);
    const somaViva = db.prepare(`SELECT SUM(E.VL_TOTAL) AS V FROM SGC_EMP_EMPENHO E JOIN KB_CARD C ON C.ID = E.ID_CARD
      JOIN SGC_EMP_FASE F ON F.BOARD_ID = C.BOARD_ID AND F.FASE_ID = C.FASE_ID
      WHERE E.DT_RECEBIMENTO BETWEEN '2026-11-01' AND '2026-11-30' AND F.CHAVE <> 'emp_cancelado'`).get();
    assert.equal(Number(resumo.VL_CONTRATO), Number(somaViva.V));
    const prazos = linhas(await chamar('sgcEmpPrazosListar', { hoje: '2026-11-03', codfilial: '', limite: 50, offset: 0 }));
    assert.ok(prazos.length >= 1);
    assert.ok(prazos.every((p) => !['emp_concluido', 'emp_cancelado'].includes(p.FASE)));
    const orgao = linhas(await chamar('sgcEmpPorOrgao', { ...periodo, limite: 50, offset: 0 }));
    assert.equal(orgao[0].ORGAO, E.orgao.nome);
    const hoje = new Date();
    const inicio = new Date(hoje.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const meses = linhas(await chamar('sgcWintEmpVendaMensal', { dataInicio: inicio, dataFim: hoje.toISOString().slice(0, 10), codfilial: '1' }));
    const publico = meses.reduce((s, m) => s + Number(m.VENDA_PUBLICO), 0);
    const privado = meses.reduce((s, m) => s + Number(m.VENDA_PRIVADO), 0);
    assert.ok(publico >= 30 * 50, 'a venda ao órgão (ramo 12) é pública');
    assert.ok(privado >= 15 * 60);
  });
}
