// Cenários e regras da spec 014 (pedido Galderma). Ver
// docs/specs/014-pedido-galderma/plan.md §Testes.
//
// O que é regra pura de tela (linha da filial, grupo, caixa, semáforo, planilha,
// acompanhamento, composição) vive em frontend/tests/galderma.test.mjs; aqui
// fica o que só a server function real responde. Toda consulta ao WinThor
// assere contagem > 0 — vazio não é verde; o WinThor REAL tem a sua prova em
// smoke/014-galderma-winthor.mjs.
//
// R-045: nada de asserção literal sobre listagem global. Os produtos
// (5801-5806), os clientes (9501-9504) e a competência das negociações que esta
// suíte cria (2026-07) são próprios; as do seed (2026-09 e 2026-10) ficam para a tela.

import { assert } from './base.mjs';
import { COMPETENCIA_014, GALDERMA, PERIODO_014 } from '../seed/014-galderma.mjs';

const COMPETENCIA = '2026-07';
const AGORA = '2026-07-20T10:00:00';

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;
  const linhas = async (nome, input, userId = U.ana) => (await chamar(nome, input, userId)).rows ?? [];
  const pagina = { limite: 500, offset: 0 };
  const um = (sql, ...args) => db.prepare(sql).get(...args);
  const contar = (sql, ...args) => Number(db.prepare(sql).get(...args).N);

  const cabecalho = (extra = {}) => ({
    competencia: COMPETENCIA, dataPedido: '2026-07-20', descricao: `Pedido Galderma ${COMPETENCIA}`,
    filiais: '1,2', coberturaAlvoDias: 35, transitoComoCompra: 0, metaSelloutValor: 0,
    observacao: '', idPai: 0, agora: AGORA, ...extra,
  });
  /** Cria uma negociação e devolve o id — achado pelo carimbo de criação, nunca por MAX(ID). */
  const criar = async (extra = {}, userId = U.ana) => {
    const agora = extra.agora ?? `2026-07-20T10:${String(contar('SELECT COUNT(*) AS N FROM SGC_GALD_NEGOCIACAO') % 60).padStart(2, '0')}:00`;
    await chamar('sgcEscGaldNegociacaoCriar', cabecalho({ ...extra, agora }), userId);
    const linha = um('SELECT ID FROM SGC_GALD_NEGOCIACAO WHERE CRIADO_POR = ? AND CRIADO_EM = ? ORDER BY ID DESC', userId, agora);
    return linha ? Number(linha.ID) : 0;
  };
  const item = (idNegociacao, codprod, extra = {}) => ({
    idNegociacao, codprod, ean: `78900000${codprod}`, descricao: `PRODUTO ${codprod}`,
    precoSellout: 95, precoNet: 45, precoLista: 0, precoListaDesc: 48, estoqueInicial: 200,
    mediaSellout: 210, previsaoSellout: 220, propostaSellin: 240, metaSellinValor: 0,
    observacao: '', agora: AGORA, ...extra,
  });
  const idItem = (idNegociacao, codprod) => Number(um('SELECT ID FROM SGC_GALD_ITEM WHERE ID_NEGOCIACAO = ? AND CODPROD = ?', idNegociacao, codprod)?.ID ?? 0);
  const situacao = (id) => String(um('SELECT STATUS FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', id)?.STATUS ?? '');
  const pedido = (item, filial) => Number(um('SELECT QTD_PEDIDA FROM SGC_GALD_ITEM_FILIAL WHERE ID_ITEM = ? AND CODFILIAL = ?', item, filial)?.QTD_PEDIDA ?? -1);

  /* ── mesa: cabeçalho, situação, acesso ── */

  let NEG = 0;
  await teste('C-001 / RF-001: criar a negociação grava o cabeçalho aberto com cobertura 35; sem filial, nada é criado', async () => {
    NEG = await criar();
    assert.ok(NEG > 0, 'a negociação não nasceu');
    const n = um('SELECT * FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', NEG);
    assert.equal(String(n.STATUS), 'aberta');
    assert.equal(Number(n.COBERTURA_ALVO_DIAS), 35);
    assert.equal(String(n.FILIAIS), '1,2');
    assert.equal(Number(n.CRIADO_POR), U.ana);
    assert.equal(await criar({ filiais: '', agora: '2026-07-20T11:00:00' }), 0, 'sem filial não pode criar');
  });

  await teste('C-031 / RN-015: diretora e comercial não criam, não editam e não lançam sell-out; a analista sim', async () => {
    assert.equal(await criar({ agora: '2026-07-20T11:01:00' }, U.dora), 0, 'diretoria só lê (P-10)');
    assert.equal(await criar({ agora: '2026-07-20T11:02:00' }, U.leo), 0, 'comercial não vê o módulo');
    await chamar('sgcEscGaldNegociacaoAtualizar', { id: NEG, ...cabecalho({ descricao: 'MUDOU' }) }, U.dora);
    assert.notEqual(String(um('SELECT DESCRICAO FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', NEG).DESCRICAO), 'MUDOU');
    const antes = contar('SELECT COUNT(*) AS N FROM SGC_GALD_SELLOUT');
    await chamar('sgcEscGaldSelloutSalvar', { codprod: 5801, competencia: COMPETENCIA, previsaoSellout: 10, agora: AGORA }, U.leo);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_SELLOUT'), antes);
    await chamar('sgcEscGaldNegociacaoAtualizar', { id: NEG, ...cabecalho({ descricao: 'Pedido Galderma julho' }) }, U.gil);
    assert.equal(String(um('SELECT DESCRICAO FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', NEG).DESCRICAO), 'Pedido Galderma julho');
  });

  /* ── posição do ERP (SQLite do seed) ── */

  await teste('C-002 / RF-002: a posição do 5801 na filial 1 vem do ERP — disponível 132 (150 − 10 − 8), físico 150, trânsito 25 (20 pedidas + 5 em trânsito)', async () => {
    const rows = await linhas('sgcWintGaldPosicao', { codprods: '5801,5802', filiais: "'1','2'", ...PERIODO_014 });
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha não é verde');
    assert.equal(rows.length, 4, 'um produto × filial por linha, mesmo sem estoque');
    const l = rows.find((r) => Number(r.CODPROD) === 5801 && String(r.CODFILIAL) === '1');
    assert.equal(Number(l.QTEST), 132);
    assert.equal(Number(l.QTEST_FISICO), 150);
    assert.equal(Number(l.EM_TRANSITO), 25);
    assert.equal(Number(l.QT_PEDIDA_ERP), 20);
    assert.equal(Number(l.QT_TRANSITO), 5);
  });

  await teste('C-003 / RF-003: no trimestre de 2026-08 o 5801 na filial 1 vendeu 900 — público, venda à filial 2 e remessa de entrega futura ficam fora; agosto tem 120 de venda e 600 de compra', async () => {
    const rows = await linhas('sgcWintGaldPosicao', { codprods: '5801', filiais: "'1'", ...PERIODO_014 });
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].VENDA_TRIMESTRE), 900);
    assert.equal(Number(rows[0].VENDA_MES), 130, 'o mês conta a venda cancelada (só a reconstrução do estoque a ignora)');
    assert.equal(Number(rows[0].COMPRA_MES), 600);
  });

  await teste('RN-PG-13: o catálogo da mesa traz os ativos da Galderma com EAN e deixa o inativo de fora', async () => {
    const rows = (await linhas('sgcWintGaldProdutos', {})).filter((r) => Number(r.CODPROD) >= 5801 && Number(r.CODPROD) <= 5806);
    assert.ok(rows.length > 0);
    assert.deepEqual(rows.map((r) => Number(r.CODPROD)).sort(), [5801, 5802, 5803, 5804, 5805]);
    assert.equal(String(rows.find((r) => Number(r.CODPROD) === 5801).EAN), '7890000058012');
  });

  /* ── itens ── */

  await teste('C-012 / RN-PG-15: salvar o mesmo produto duas vezes deixa um item só (o segundo atualiza); item sem produto é recusado', async () => {
    await chamar('sgcEscGaldItemSalvar', item(NEG, 5801), U.ana);
    await chamar('sgcEscGaldItemSalvar', item(NEG, 5801, { propostaSellin: 264 }), U.ana);
    await chamar('sgcEscGaldItemSalvar', item(NEG, 0), U.ana);
    const rows = await linhas('sgcGaldItensListar', { idNegociacao: NEG, ...pagina });
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].PROPOSTA_SELLIN), 264);
  });

  await teste('C-009 / C-010 / RN-010: importar atualiza só o que a planilha traz — preço de lista, meta de sell-in e observação digitados ficam', async () => {
    await chamar('sgcEscGaldItemSalvar', item(NEG, 5802, { precoLista: 52, metaSellinValor: 9000, observacao: 'combinado com a indústria' }), U.ana);
    await chamar('sgcEscGaldItemImportar', item(NEG, 5802, { precoSellout: 1184.02, propostaSellin: 8857 }), U.ana);
    await chamar('sgcEscGaldItemImportar', item(NEG, 5803), U.ana);
    const i = um('SELECT * FROM SGC_GALD_ITEM WHERE ID_NEGOCIACAO = ? AND CODPROD = 5802', NEG);
    assert.equal(Number(i.PRECO_SELLOUT), 1184.02);
    assert.equal(Number(i.PROPOSTA_SELLIN), 8857);
    assert.equal(Number(i.PRECO_LISTA), 52);
    assert.equal(Number(i.META_SELLIN_VALOR), 9000);
    assert.equal(String(i.OBSERVACAO), 'combinado com a indústria');
    assert.ok(idItem(NEG, 5803) > 0, 'a linha nova da planilha nasce');
  });

  /* ── decisão por filial e histórico ── */

  await teste('C-007 / RF-005 / RF-006: o pedido por filial grava e deixa uma linha de histórico com antes e depois; filial que não participa é recusada sem histórico', async () => {
    const it = idItem(NEG, 5801);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '1', qtdPedida: 120, agora: AGORA }, U.ana);
    await chamar('sgcEscGaldDecisaoLogInserir', { idItem: it, codfilial: '1', antes: '0', depois: '120', agora: AGORA }, U.ana);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '1', qtdPedida: 144, agora: AGORA }, U.ana);
    await chamar('sgcEscGaldDecisaoLogInserir', { idItem: it, codfilial: '1', antes: '120', depois: '144', agora: AGORA }, U.ana);
    assert.equal(pedido(it, '1'), 144);
    // Filial 3 não está em FILIAIS ('1,2'): nem o pedido nem o histórico entram (RNF-006).
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '3', qtdPedida: 12, agora: AGORA }, U.ana);
    await chamar('sgcEscGaldDecisaoLogInserir', { idItem: it, codfilial: '3', antes: '0', depois: '12', agora: AGORA }, U.ana);
    assert.equal(pedido(it, '3'), -1);
    const log = await linhas('sgcGaldDecisaoLogListar', { idNegociacao: NEG, ...pagina });
    assert.equal(log.length, 2);
    assert.equal(String(log[0].ANTES), '120', 'do mais recente para o mais antigo');
    assert.equal(String(log[0].DEPOIS), '144');
    assert.equal(String(log[0].POR_NOME), 'Ana Analista');
    assert.equal(String(log[0].DESCRICAO), 'PRODUTO 5801');
  });

  await teste('C-013 / RN-007: fechada trava itens e pedidos por filial (sem histórico), mantém o cabeçalho editável e reabre', async () => {
    const it = idItem(NEG, 5801);
    await chamar('sgcEscGaldNegociacaoSituacao', { id: NEG, status: 'fechada', agora: AGORA }, U.ana);
    assert.equal(situacao(NEG), 'fechada');
    const logAntes = contar('SELECT COUNT(*) AS N FROM SGC_GALD_DECISAO_LOG WHERE ID_NEGOCIACAO = ?', NEG);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '1', qtdPedida: 24, agora: AGORA }, U.ana);
    await chamar('sgcEscGaldDecisaoLogInserir', { idItem: it, codfilial: '1', antes: '144', depois: '24', agora: AGORA }, U.ana);
    await chamar('sgcEscGaldItemSalvar', item(NEG, 5804), U.ana);
    assert.equal(pedido(it, '1'), 144);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_DECISAO_LOG WHERE ID_NEGOCIACAO = ?', NEG), logAntes);
    assert.equal(idItem(NEG, 5804), 0);
    await chamar('sgcEscGaldNegociacaoAtualizar', { id: NEG, ...cabecalho({ transitoComoCompra: 1 }) }, U.ana);
    assert.equal(Number(um('SELECT TRANSITO_COMO_COMPRA AS T FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', NEG).T), 1, 'P-06: cabeçalho editável na fechada');
    await chamar('sgcEscGaldNegociacaoSituacao', { id: NEG, status: 'aberta', agora: AGORA }, U.ana);
    assert.equal(situacao(NEG), 'aberta');
  });

  await teste('C-013: excluir uma negociação sem pedido gerado apaga pedidos por filial, itens e a negociação, e o histórico fica', async () => {
    const outra = await criar({ agora: '2026-07-21T08:00:00' });
    await chamar('sgcEscGaldItemSalvar', item(outra, 5801), U.ana);
    const it = idItem(outra, 5801);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '2', qtdPedida: 12, agora: AGORA }, U.ana);
    await chamar('sgcEscGaldDecisaoLogInserir', { idItem: it, codfilial: '2', antes: '0', depois: '12', agora: AGORA }, U.ana);
    for (const nome of ['sgcEscGaldNegociacaoExcluirPedidos', 'sgcEscGaldNegociacaoExcluirItens', 'sgcEscGaldNegociacaoExcluir']) {
      await chamar(nome, { id: outra }, U.ana);
    }
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', outra), 0);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_ITEM WHERE ID_NEGOCIACAO = ?', outra), 0);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_ITEM_FILIAL WHERE ID_ITEM = ?', it), 0);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_DECISAO_LOG WHERE ID_NEGOCIACAO = ?', outra), 1);
  });

  await teste('RN-PG-19: remover um item apaga os pedidos por filial dele, só com a negociação aberta', async () => {
    const it = idItem(NEG, 5803);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '2', qtdPedida: 6, agora: AGORA }, U.ana);
    await chamar('sgcEscGaldItemExcluirPedidos', { idItem: it }, U.ana);
    await chamar('sgcEscGaldItemExcluir', { idItem: it }, U.ana);
    assert.equal(idItem(NEG, 5803), 0);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_ITEM_FILIAL WHERE ID_ITEM = ?', it), 0);
  });

  /* ── geração dos pedidos no quadro ── */

  const board = await chamar('kbBoardCarregar', { slug: 'compras' }, U.ana);
  const boardId = Number(board.board.id);
  const itemDoPedido = (codprod, qt, preco) => ({
    codprod, descricao: `PRODUTO ${codprod}`, embalagem: '1X1UN', unidade: 'UN', codepto: 2, codsec: 21,
    unPorCaixa: 12, qtVendaTotal: 900, qtVendaLicitacao: 0, qtEstoque: 132, qtTransito: 25,
    qtSugerida: qt, qtPedida: qt, precoCusto: preco, tipoPreco: 'especial', curvaAbc: 'C',
    coberturaDias: 35, coberturaLimite: 35, coberturaJustificativa: '', observacao: '', status: 'montagem',
  });
  /** O caminho da tela, por filial (plan, "Como se liga ao kanban"): card, vínculo, capa, itens. */
  const gerarFilial = async (idNegociacao, codfilial, filial, itens, { pararDepoisDoVinculo = false } = {}) => {
    const total = itens.reduce((s, i) => s + i.qtPedida * i.precoCusto, 0);
    const criado = await chamar('kbCardCriar', {
      boardId, titulo: `Galderma · ${filial} · ${COMPETENCIA}`, responsaveisIds: String(U.ana), prazo: '',
      valoresJson: JSON.stringify({ fornecedor: 'GALDERMA DISTRIBUIDORA DO BRASIL LTDA', filial, prioridade: 'normal', valor_total: String(total) }),
    }, U.ana);
    assert.equal(criado.ok, true, criado.error);
    await chamar('sgcEscGaldCardRegistrar', { idNegociacao, codfilial, cardId: criado.id, agora: AGORA }, U.ana);
    if (pararDepoisDoVinculo) return criado.id;
    await completarFilial(idNegociacao, codfilial, filial, criado.id, itens);
    return criado.id;
  };
  const completarFilial = async (idNegociacao, codfilial, filial, cardId, itens) => {
    await chamar('sgcEscGaldPedidoCapaCriar', {
      cardId, idNegociacao, codfilial, fornecedor: 'GALDERMA DISTRIBUIDORA DO BRASIL LTDA', filial,
      periodoInicio: '2026-04-20', periodoFim: '2026-07-20', agora: AGORA,
    }, U.ana);
    const gravado = await chamar('sgcItensGravar', { cardId, itensJson: JSON.stringify(itens) }, U.ana);
    assert.equal(gravado.ok, true, gravado.erro);
  };

  let CARD_FILIAL_1 = 0;
  await teste('C-014 / RN-009: gerar cria o pedido da filial 1 pelo kbCardCriar, na Análise, com capa de origem galderma (fornecedor 1541), itens com o preço com desconto como custo especial, e o vínculo', async () => {
    const it = idItem(NEG, 5802);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '2', qtdPedida: 24, agora: AGORA }, U.ana);
    CARD_FILIAL_1 = await gerarFilial(NEG, '1', 'Benenutri Matriz', [itemDoPedido(5801, 144, 48)]);
    const detalhe = await chamar('kbCardDetalhe', { cardId: CARD_FILIAL_1 }, U.ana);
    assert.equal(String(detalhe.card.faseId), String(um("SELECT FASE_ID AS ID FROM SGC_FASE WHERE CHAVE = 'analise'").ID));
    const capa = um('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?', CARD_FILIAL_1);
    assert.equal(String(capa.ORIGEM), 'galderma');
    assert.equal(Number(capa.CODFORNEC), GALDERMA);
    assert.equal(String(capa.CODFILIAL), '1');
    assert.equal(Number(capa.VL_TOTAL), 144 * 48);
    const itens = db.prepare('SELECT * FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ?').all(CARD_FILIAL_1);
    assert.equal(itens.length, 1);
    assert.equal(Number(itens[0].QT_PEDIDA), 144);
    assert.equal(Number(itens[0].PRECO_CUSTO), 48);
    assert.equal(String(itens[0].TIPO_PRECO), 'especial', 'P-01: o preço negociado vai como especial');
    const cards = await linhas('sgcGaldCardsListar', { idNegociacao: NEG, ...pagina });
    assert.deepEqual(cards.map((c) => [String(c.CODFILIAL), Number(c.ID_CARD), Number(c.TEM_CAPA)]), [['1', CARD_FILIAL_1, 1]]);
  });

  await teste('C-016 / RF-011: com a filial 2 pendente a negociação não converte; o segundo vínculo da filial 1 é recusado; capa para card fora do vínculo não nasce; retomada sem capa completa o mesmo card e converte', async () => {
    await chamar('sgcEscGaldNegociacaoConverter', { id: NEG, agora: AGORA }, U.ana);
    assert.equal(situacao(NEG), 'aberta', 'a filial 2 tem pedido e não tem card');
    await chamar('sgcEscGaldCardRegistrar', { idNegociacao: NEG, codfilial: '1', cardId: 999999, agora: AGORA }, U.ana);
    assert.equal(contar("SELECT COUNT(*) AS N FROM SGC_GALD_NEGOCIACAO_CARD WHERE ID_NEGOCIACAO = ? AND CODFILIAL = '1'", NEG), 1);
    const intruso = await chamar('kbCardCriar', { boardId, titulo: 'fora da mesa', responsaveisIds: String(U.ana), prazo: '', valoresJson: '{}' }, U.ana);
    await chamar('sgcEscGaldPedidoCapaCriar', {
      cardId: intruso.id, idNegociacao: NEG, codfilial: '2', fornecedor: 'GALDERMA', filial: 'Norte',
      periodoInicio: '2026-04-20', periodoFim: '2026-07-20', agora: AGORA,
    }, U.ana);
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_PEDIDO WHERE ID_CARD = ?', intruso.id), 0, 'só o card do vínculo vira pedido Galderma');
    // A filial 2: o card e o vínculo nascem e a geração "cai" antes da capa.
    const card2 = await gerarFilial(NEG, '2', 'Benenutri Filial Norte', [], { pararDepoisDoVinculo: true });
    await chamar('sgcEscGaldNegociacaoConverter', { id: NEG, agora: AGORA }, U.ana);
    assert.equal(situacao(NEG), 'aberta', 'vínculo sem capa ainda é pendência');
    const cards = await linhas('sgcGaldCardsListar', { idNegociacao: NEG, ...pagina });
    assert.equal(Number(cards.find((c) => String(c.CODFILIAL) === '2').TEM_CAPA), 0);
    await completarFilial(NEG, '2', 'Benenutri Filial Norte', card2, [itemDoPedido(5802, 24, 38)]);
    await chamar('sgcEscGaldNegociacaoConverter', { id: NEG, agora: AGORA }, U.ana);
    assert.equal(situacao(NEG), 'convertida');
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_GALD_NEGOCIACAO_CARD WHERE ID_NEGOCIACAO = ?', NEG), 2, 'um card por filial, nunca dois');
  });

  await teste('C-017 / RF-012: convertida não volta — reabrir, editar o cabeçalho, salvar item, mudar pedido por filial e excluir não alteram nada no servidor', async () => {
    const it = idItem(NEG, 5801);
    await chamar('sgcEscGaldNegociacaoSituacao', { id: NEG, status: 'aberta', agora: AGORA }, U.gil);
    await chamar('sgcEscGaldNegociacaoAtualizar', { id: NEG, ...cabecalho({ descricao: 'REABERTA' }) }, U.gil);
    await chamar('sgcEscGaldItemSalvar', item(NEG, 5801, { propostaSellin: 1 }), U.gil);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: it, codfilial: '1', qtdPedida: 0, agora: AGORA }, U.gil);
    for (const nome of ['sgcEscGaldNegociacaoExcluirPedidos', 'sgcEscGaldNegociacaoExcluirItens', 'sgcEscGaldNegociacaoExcluir']) {
      await chamar(nome, { id: NEG }, U.admin);
    }
    assert.equal(situacao(NEG), 'convertida');
    assert.notEqual(String(um('SELECT DESCRICAO FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', NEG).DESCRICAO), 'REABERTA');
    assert.equal(Number(um('SELECT PROPOSTA_SELLIN AS P FROM SGC_GALD_ITEM WHERE ID = ?', it).P), 264);
    assert.equal(pedido(it, '1'), 144);
  });

  /* ── negociação complementar ── */

  let COMPLEMENTAR = 0;
  await teste('C-018 / RN-008: a complementar herda o pedido da de origem por produto × filial; a mesma origem não serve a uma segunda; origem não convertida ou de outra competência é recusada', async () => {
    COMPLEMENTAR = await criar({ idPai: NEG, descricao: 'Complemento julho', agora: '2026-07-25T09:00:00' });
    assert.ok(COMPLEMENTAR > 0);
    const herdado = await linhas('sgcGaldHerdadoListar', { idNegociacao: COMPLEMENTAR, ...pagina });
    assert.ok(herdado.length > 0);
    assert.deepEqual(herdado.map((h) => [Number(h.CODPROD), String(h.CODFILIAL), Number(h.QTD_HERDADA)]), [[5801, '1', 144], [5802, '2', 24]]);
    assert.equal(await criar({ idPai: NEG, agora: '2026-07-25T09:01:00' }), 0, 'P-08: uma de origem para uma complementar');
    assert.equal(await criar({ idPai: COMPLEMENTAR, agora: '2026-07-25T09:02:00' }), 0, 'origem aberta não serve');
    assert.equal(await criar({ idPai: NEG, competencia: '2026-06', agora: '2026-07-25T09:03:00' }), 0, 'outra competência não serve');
    await chamar('sgcEscGaldNegociacaoAtualizar', { id: COMPLEMENTAR, ...cabecalho({ competencia: '2026-06' }) }, U.ana);
    assert.equal(String(um('SELECT COMPETENCIA AS C FROM SGC_GALD_NEGOCIACAO WHERE ID = ?', COMPLEMENTAR).C), COMPETENCIA, 'a complementar não troca de mês');
  });

  /* ── acompanhamento ── */

  await teste('C-027 / C-022 / RN-012: o acompanhamento de 2026-07 tira a proposta só da de origem (P-09) e soma o pedido enviado das duas', async () => {
    await chamar('sgcEscGaldItemSalvar', item(COMPLEMENTAR, 5801, { propostaSellin: 100, previsaoSellout: 50 }), U.ana);
    await chamar('sgcEscGaldPedidoFilialSalvar', { idItem: idItem(COMPLEMENTAR, 5801), codfilial: '2', qtdPedida: 36, agora: AGORA }, U.ana);
    const rows = (await linhas('sgcGaldAcompanhamento', { competenciaInicio: COMPETENCIA, competenciaFim: COMPETENCIA, ...pagina }))
      .filter((r) => Number(r.CODPROD) === 5801);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].PROPOSTA_SELLIN), 264, 'a complementar (100) não duplica a meta');
    assert.equal(Number(rows[0].PREVISAO_SELLOUT), 220);
    assert.equal(Number(rows[0].PEDIDO_ENVIADO), 144 + 36);
  });

  await teste('C-022 / RN-012: o realizado mensal do ERP traz a venda válida sem público e a compra, em unidades e reais', async () => {
    const rows = await linhas('sgcWintGaldRealizadoMensal', { dataInicio: '2026-07-01', dataFim: '2026-08-31' });
    assert.ok(rows.length > 0);
    const julho = rows.find((r) => Number(r.CODPROD) === 5801 && String(r.CODFILIAL) === '1' && String(r.MES) === '2026-07');
    assert.equal(Number(julho.VENDA_REALIZADA), 300, 'a venda à filial 2 e a remessa ficam fora');
    assert.equal(Number(julho.VALOR_VENDA), 300 * 95);
    const agosto = rows.find((r) => Number(r.CODPROD) === 5801 && String(r.CODFILIAL) === '1' && String(r.MES) === COMPETENCIA_014);
    assert.equal(Number(agosto.COMPRA_REALIZADA), 600);
    assert.equal(Number(agosto.VALOR_COMPRA), 600 * 48);
  });

  await teste('C-023 / RF-018: lançar 180 sobre a mesa grava a meta e o histórico com origem "mesa"; relançar registra "lancado"; apagar remove e registra; a mesa não muda', async () => {
    const competencia = COMPETENCIA;
    const salvar = (valor) => chamar('sgcEscGaldSelloutSalvar', { codprod: 5801, competencia, previsaoSellout: valor, agora: AGORA }, U.ana);
    const logar = (antes, depois, origemAnterior) => chamar('sgcEscGaldSelloutLogInserir', { codprod: 5801, competencia, antes, depois, origemAnterior, agora: AGORA }, U.ana);
    await salvar(180); await logar('220', '180', 'mesa');
    await salvar(170); await logar('180', '170', 'lancado');
    let metas = (await linhas('sgcGaldSelloutListar', { competenciaInicio: competencia, competenciaFim: competencia, ...pagina })).filter((m) => Number(m.CODPROD) === 5801);
    assert.equal(metas.length, 1);
    assert.equal(Number(metas[0].PREVISAO_SELLOUT), 170);
    await chamar('sgcEscGaldSelloutExcluir', { codprod: 5801, competencia }, U.ana); await logar('170', '', 'lancado');
    metas = (await linhas('sgcGaldSelloutListar', { competenciaInicio: competencia, competenciaFim: competencia, ...pagina })).filter((m) => Number(m.CODPROD) === 5801);
    assert.equal(metas.length, 0);
    const log = (await linhas('sgcGaldSelloutLogListar', { competenciaInicio: competencia, competenciaFim: competencia, ...pagina })).filter((l) => Number(l.CODPROD) === 5801);
    assert.deepEqual(log.map((l) => [String(l.ANTES), String(l.DEPOIS), String(l.ORIGEM_ANTERIOR)]),
      [['170', '', 'lancado'], ['180', '170', 'lancado'], ['220', '180', 'mesa']]);
    assert.equal(String(log[0].DESCRICAO), 'PRODUTO 5801');
    assert.equal(Number(um('SELECT PREVISAO_SELLOUT AS P FROM SGC_GALD_ITEM WHERE ID = ?', idItem(NEG, 5801)).P), 220, 'RN-AG-40: a mesa não muda');
    await chamar('sgcEscGaldSelloutLogInserir', { codprod: 5801, competencia, antes: '1', depois: '2', origemAnterior: 'outra', agora: AGORA }, U.ana);
    assert.equal(contar("SELECT COUNT(*) AS N FROM SGC_GALD_SELLOUT_LOG WHERE CODPROD = 5801 AND COMPETENCIA = ?", competencia), 3);
  });

  await teste('C-026 / RN-013: o estoque inicial de 2026-08 do 5801 na filial 1 é o de hoje − entradas + saídas físicas desde 01/08, sem a venda cancelada', async () => {
    const rows = await linhas('sgcWintGaldEstoqueInicial', { dataInicio: '2026-08-01' });
    assert.ok(rows.length > 0);
    const l = rows.find((r) => Number(r.CODPROD) === 5801 && String(r.CODFILIAL) === '1');
    // Entradas: 600 (ago) + 240 (set). Saídas: 120 (ago) + 150 (set) + 132 (out); a cancelada de 10 fica fora.
    assert.equal(Number(l.ENTRADAS), 840);
    assert.equal(Number(l.SAIDAS), 402);
    assert.equal(Number(l.ESTOQUE_INICIAL), 150 - 840 + 402);
  });

  /* ── composição ── */

  await teste('C-029 / RN-014: a composição de 2026-08 traz, por filial, a compra e a venda válida sem público em unidades e reais; a filial 99 não entra', async () => {
    const rows = await linhas('sgcWintGaldComposicao', { dataInicio: '2026-08-01', dataFim: '2026-08-31' });
    assert.ok(rows.length > 0);
    const f1 = rows.find((r) => String(r.CODFILIAL) === '1');
    assert.equal(Number(f1.QTD_SELLIN), 600 + 120 + 360);
    assert.equal(Number(f1.VALOR_SELLIN), 600 * 48 + 120 * 38 + 360 * 700);
    assert.equal(Number(f1.QTD_VENDAS), 120 + 10 + 60 + 6);
    const f2 = rows.find((r) => String(r.CODFILIAL) === '2');
    assert.equal(Number(f2.QTD_VENDAS), 45 + 120);
    assert.ok(!rows.some((r) => String(r.CODFILIAL) === '99'));
  });

  await teste('C-030 / RN-014: o estoque de agora vem por produto × filial com disponível e físico (o valor é a custo padrão, na tela)', async () => {
    const rows = (await linhas('sgcWintGaldEstoqueAtual', {})).filter((r) => Number(r.CODPROD) >= 5801 && Number(r.CODPROD) <= 5806);
    assert.ok(rows.length > 0);
    const l = rows.find((r) => Number(r.CODPROD) === 5801 && String(r.CODFILIAL) === '1');
    assert.equal(Number(l.QT_DISPONIVEL), 132);
    assert.equal(Number(l.QT_FISICO), 150);
    const custo = await linhas('sgcCustoPadraoAtual', { codprods: '5801,5803' });
    assert.deepEqual(custo.map((c) => [Number(c.CODPROD), Number(c.CUSTO)]), [[5801, 50]], 'o 5803 não tem custo padrão: "Sem custo"');
  });
}
