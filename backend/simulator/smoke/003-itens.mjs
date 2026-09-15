// Cenários C-001..C-022 e regras RN-001..RN-014 da spec 003 (itens do
// pedido). Ver docs/specs/003-itens-do-pedido/plan.md §Testes.
//
// O que é regra pura de tela (C-002..C-008, C-016, RN-001..RN-008) vive em
// frontend/tests/{compras,cobertura,prazo-pagamento}.test.mjs; aqui fica o que
// só a server function real responde. Toda consulta ao WinThor assere
// contagem > 0 — vazio não é verde.
//
// (Isolamento removido na integração: PCFORNEC/PCFILIAL vêm do seed da 001 e as
// seed/001-fornecedores.mjs e SGC_FASE é do seed/002-quadro.mjs, os dois ainda
// stub. Sem eles o JOIN de PCFILIAL zera as consultas de lote/excesso e
// nenhuma SF reconhece a fase `analise`, então esta suíte insere o mínimo com
// INSERT OR IGNORE. O mesmo vale para o substituto de
// sgcEscPedidoReprovacoesLimpar (SF da 002, chamada por id pelo sgcAnaliseSair).

import { readFileSync } from 'node:fs';
import { toSqlite } from '../mysql-dialect.mjs';
import { assert, CENARIO } from './base.mjs';
import { CARDS_003 } from '../seed/003-itens.mjs';

const SQL_PENDENCIAS = new URL('../../sql/pendencias-analise.sql', import.meta.url);

const FILIAL = '1';
const ANALISE = { codfornec: 1015, codfilial: FILIAL, dataInicio: '2026-08-01', dataFim: '2026-09-14' };

/** Linhas de uma server function SQL. */
async function linhas(ctx, nome, input, userId) {
  const saida = await ctx.chamar(nome, input, userId);
  return saida.rows ?? [];
}

const umItem = (codprod, qtPedida, precoCusto, extra = {}) => ({
  codprod, qtPedida, precoCusto, descricao: `PRODUTO ${codprod}`, embalagem: 'CX 12', unidade: 'UN',
  codepto: 2, codsec: 21, unPorCaixa: 12, qtVendaTotal: 0, qtVendaLicitacao: 0, qtEstoque: 0,
  qtTransito: 0, qtSugerida: 0, tipoPreco: 'padrao', curvaAbc: 'C', coberturaDias: 0,
  coberturaLimite: 35, coberturaJustificativa: '', observacao: '', ...extra,
});

/** Reproduz o ramo `analise -> destino` do sgcPodeMover da 002 com o bloco que esta spec entrega. */
function podeMoverComPendencias(ctx, cardId, par) {
  const fonte = readFileSync(SQL_PENDENCIAS, 'utf8')
    .split('\n').filter((linha) => !linha.trim().startsWith('--')).join('\n').trim();
  const corte = fonte.indexOf('COALESCE((', 1);
  const pendencias = fonte.slice(0, corte).trim();
  const motivo = fonte.slice(corte).trim();
  const sql = `SELECT
  CASE WHEN T.PAR = 'analise>tecnica' AND T.PENDENCIAS > 0 THEN 0 ELSE 1 END AS PODE,
  CASE WHEN T.PAR = 'analise>tecnica' AND T.PENDENCIAS > 0 THEN T.PENDENCIAS_MOTIVO ELSE '' END AS MOTIVO
FROM (
  SELECT '${par}' AS PAR, ${pendencias}, ${motivo}
  FROM KB_CARD C WHERE C.ID = ${cardId}
) T`;
  return ctx.db.prepare(toSqlite(sql)).all()[0];
}

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;

  const verificar = async (cardId) => (await linhas(ctx, 'sgcAnaliseSaidaVerificar', { cardId }))[0];

  /* ── T-080 — a análise, a busca e o recorte do ERP ───────────────────── */

  await teste('C-001: sgcWintAnaliseMontagem (1015 / filial 1 / 01-08 a 14-09-2026) devolve 18 produtos, nao os 20 — o inativo e o do departamento 4 ficam de fora', async () => {
    const rows = await linhas(ctx, 'sgcWintAnaliseMontagem', ANALISE);
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.equal(rows.length, 18);
    assert.equal(rows.filter((r) => [4, 7].includes(Number(r.CODEPTO))).length, 0);
    assert.equal(rows.filter((r) => [5019, 5020].includes(Number(r.CODPROD))).length, 0);
    const p5001 = rows.find((r) => Number(r.CODPROD) === 5001);
    assert.equal(Number(p5001.ESTOQUE), 5);
    assert.equal(Number(p5001.TRANSITO), 2);
    assert.equal(Number(p5001.CUSTO_ULT_ENTRADA), 10);
  });

  await teste('RN-011: a analise nao traz produto inativo nem dos departamentos 4 e 7; a venda de cliente de atividade 12 aparece na licitacao E dentro da venda total (5001: 6 de 18)', async () => {
    const rows = await linhas(ctx, 'sgcWintAnaliseMontagem', ANALISE);
    const p5001 = rows.find((r) => Number(r.CODPROD) === 5001);
    assert.equal(Number(p5001.VENDA_PERIODO), 18, 'entrada (CODOPER E) e venda fora do periodo nao contam');
    assert.equal(Number(p5001.VENDA_LICITACAO), 6);
  });

  await teste('C-009: sgcWintBuscarProduto por nome devolve entre 1 e 20 linhas, nenhuma inativa nem do departamento 4; por codigo devolve exatamente 1', async () => {
    const porNome = await linhas(ctx, 'sgcWintBuscarProduto', { codprod: 0, busca: 'creme', codfilial: FILIAL });
    assert.ok(porNome.length >= 1 && porNome.length <= 20, `busca devolveu ${porNome.length} linhas`);
    assert.equal(porNome.filter((r) => [5019, 5020].includes(Number(r.CODPROD))).length, 0);
    const porCodigo = await linhas(ctx, 'sgcWintBuscarProduto', { codprod: 5001, busca: '', codfilial: FILIAL });
    assert.equal(porCodigo.length, 1);
    assert.equal(Number(porCodigo[0].CODPROD), 5001);
  });

  await teste('RF-019: sgcWintPrazoPagamento devolve a condicao praticada nos pedidos do ERP (28/35/42) para o fornecedor 1015', async () => {
    const rows = await linhas(ctx, 'sgcWintPrazoPagamento', { codfornec: 1015, codfilial: FILIAL });
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.deepEqual([rows[0].PRAZO1, rows[0].PRAZO2, rows[0].PRAZO3].map(Number), [28, 35, 42]);
  });

  /* ── T-081 — alertas de vencimento e de excesso ──────────────────────── */

  await teste('C-011: sgcWintLotesAVencer devolve lote com saldo e validade dentro de 90 dias; sgcAlertasGerar cria 1 alerta de vencimento do 5001 citando a filial 2 e os 60 dias', async () => {
    const lotes = await linhas(ctx, 'sgcWintLotesAVencer', { codprods: '5001', codfilial: FILIAL, diasValidade: 90 });
    assert.ok(lotes.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.equal(lotes.length, 1, 'o lote de 120 dias nao entra');
    assert.equal(Number(lotes[0].DIAS_PARA_VENCER), 60);
    assert.equal(String(lotes[0].CODFILIAL), '2');

    const gerado = await chamar('sgcAlertasGerar', { cardId: CARDS_003.alertas }, U.ana);
    assert.equal(gerado.ok, true, gerado.erro);
    const alertas = db.prepare("SELECT * FROM SGC_ALERTA WHERE ID_CARD = ? AND TIPO = 'vencimento'").all(CARDS_003.alertas);
    assert.equal(alertas.length, 1);
    assert.equal(Number(alertas[0].CODPROD), 5001);
    assert.match(alertas[0].MENSAGEM, /60 dias/);
    assert.match(alertas[0].MENSAGEM, /Benenutri Filial Norte/);
    assert.equal(alertas[0].CHAVE, 'vencimento:5001:2:L2026A');
  });

  await teste('C-012: sgcWintExcessoOutrasFiliais devolve o 5001 com 100 dias de estoque na filial 2; sgcAlertasGerar cria 1 alerta de excesso citando os 100 dias', async () => {
    const excessos = await linhas(ctx, 'sgcWintExcessoOutrasFiliais', { codprods: '5001', codfilial: FILIAL, diasEstoque: 80 });
    assert.ok(excessos.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.equal(Number(excessos[0].DIAS_ESTOQUE), 100);
    const alertas = db.prepare("SELECT * FROM SGC_ALERTA WHERE ID_CARD = ? AND TIPO = 'excesso'").all(CARDS_003.alertas);
    assert.equal(alertas.length, 1);
    assert.match(alertas[0].MENSAGEM, /100 dias/);
    assert.equal(alertas[0].CHAVE, 'excesso:5001:2');
  });

  await teste('RN-009: lote com validade em 90 dias vira alerta; em 91, nao', async () => {
    const rows = await linhas(ctx, 'sgcWintLotesAVencer', { codprods: '5002, 5003', codfilial: FILIAL, diasValidade: 90 });
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.deepEqual(rows.map((r) => Number(r.CODPROD)), [5002]);
    assert.equal(Number(rows[0].DIAS_PARA_VENCER), 90);
  });

  await teste('RN-010: 81 dias de estoque em outra filial alerta; 79 nao; 100 dias NA filial do pedido tambem nao', async () => {
    const rows = await linhas(ctx, 'sgcWintExcessoOutrasFiliais', { codprods: '5002, 5003, 5005', codfilial: FILIAL, diasEstoque: 80 });
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.deepEqual(rows.map((r) => Number(r.CODPROD)), [5003]);
    assert.equal(Number(rows[0].DIAS_ESTOQUE), 81);
  });

  await teste('RF-016: regerar os alertas nao duplica e preserva o que ja foi lido e justificado', async () => {
    db.exec(`UPDATE SGC_ALERTA SET LIDO = 1, JUSTIFICATIVA = 'compra ja negociada' WHERE ID_CARD = ${CARDS_003.alertas} AND TIPO = 'excesso'`);
    const gerado = await chamar('sgcAlertasGerar', { cardId: CARDS_003.alertas }, U.ana);
    assert.equal(gerado.total, 2);
    assert.equal(gerado.naoLidos, 1);
    const excesso = db.prepare("SELECT * FROM SGC_ALERTA WHERE ID_CARD = ? AND TIPO = 'excesso'").all(CARDS_003.alertas);
    assert.equal(excesso.length, 1);
    assert.equal(Number(excesso[0].LIDO), 1);
    assert.equal(excesso[0].JUSTIFICATIVA, 'compra ja negociada');
    db.exec(`UPDATE SGC_ALERTA SET LIDO = 0, JUSTIFICATIVA = '' WHERE ID_CARD = ${CARDS_003.alertas}`);
  });

  /* ── T-082 — gravação em lote e tipo de preço ────────────────────────── */

  await teste('C-010: sgcItensGravar grava 9 itens numa chamada so, le de volta as 9 quantidades e o VL_TOTAL do pedido passa a 1.234,50', async () => {
    const itens = [
      umItem(5006, 10, 100.0, { descricao: "CREME D'AGUA HIDRATANTE 200 ML" }),
      umItem(5007, 5, 20.0, { tipoPreco: 'especial' }),
      umItem(5008, 2, 50.0),
      umItem(5009, 1, 34.5),
      umItem(5010, 0, 10.0), umItem(5011, 0, 10.0), umItem(5012, 0, 10.0),
      umItem(5013, 0, 10.0), umItem(5014, 0, 10.0),
    ];
    const saida = await chamar('sgcItensGravar', { cardId: CARDS_003.gravacao, itensJson: JSON.stringify(itens) }, U.ana);
    assert.equal(saida.ok, true, saida.erro);
    assert.equal(saida.itens, 9);
    const gravados = db.prepare('SELECT CODPROD, QT_PEDIDA, DESCRICAO FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? ORDER BY CODPROD').all(CARDS_003.gravacao);
    assert.equal(gravados.length, 9);
    assert.deepEqual(gravados.map((r) => Number(r.QT_PEDIDA)), [10, 5, 2, 1, 0, 0, 0, 0, 0]);
    assert.equal(gravados[0].DESCRICAO, "CREME D'AGUA HIDRATANTE 200 ML", 'aspa simples no texto do ERP nao pode quebrar o lote');
    const capa = db.prepare('SELECT VL_TOTAL FROM SGC_PEDIDO WHERE ID_CARD = ?').get(CARDS_003.gravacao);
    assert.equal(Number(capa.VL_TOTAL), 1234.5);
    assert.equal(saida.total, 1234.5);
  });

  await teste('C-021: o tipo de preco especial fica gravado no item e os demais seguem padrao', async () => {
    const especiais = db.prepare("SELECT CODPROD FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND TIPO_PRECO = 'especial'").all(CARDS_003.gravacao);
    const padroes = db.prepare("SELECT CODPROD FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND TIPO_PRECO = 'padrao'").all(CARDS_003.gravacao);
    assert.deepEqual(especiais.map((r) => Number(r.CODPROD)), [5007]);
    assert.equal(padroes.length, 8);
  });

  await teste('RNF-004: sgcItensGravar recusa quem nao monta pedido (Leo, comercial) e pedido fora da fase Analise', async () => {
    const comercial = await chamar('sgcItensGravar', { cardId: CARDS_003.gravacao, itensJson: '[]' }, U.leo);
    assert.equal(comercial.ok, false);
    assert.match(comercial.erro, /perfil/i);
    db.exec(`UPDATE KB_CARD SET FASE_ID = ${CENARIO.fases.tecnica} WHERE ID = ${CARDS_003.gravacao}`);
    const foraDaFase = await chamar('sgcItensGravar', { cardId: CARDS_003.gravacao, itensJson: '[]' }, U.ana);
    assert.equal(foraDaFase.ok, false);
    assert.match(foraDaFase.erro, /Analise|Análise/);
    db.exec(`UPDATE KB_CARD SET FASE_ID = ${CENARIO.fases.analise} WHERE ID = ${CARDS_003.gravacao}`);
  });

  /* ── T-083 — as cinco exigências de saída, uma a uma (RN-012) ─────────── */

  await teste('C-013: com 2 alertas nao lidos a verificacao recusa citando "2 alertas"; depois de sgcEscAlertaLer com id 0, essa condicao sai da frente', async () => {
    const antes = await verificar(CARDS_003.alertas);
    assert.equal(Number(antes.PODE), 0);
    assert.match(antes.MOTIVO, /2 alertas/);
    await chamar('sgcEscAlertaLer', { idCard: CARDS_003.alertas, id: 0, lidoEm: '2026-09-15T09:00:00' }, U.ana);
    const naoLidos = db.prepare('SELECT COUNT(*) AS N FROM SGC_ALERTA WHERE ID_CARD = ? AND LIDO = 0').get(CARDS_003.alertas);
    assert.equal(Number(naoLidos.N), 0);
    const depois = await verificar(CARDS_003.alertas);
    assert.doesNotMatch(depois.MOTIVO, /alertas deste pedido/);
  });

  await teste('C-014: item alertado que segue com quantidade 30 sem justificativa recusa citando a descricao do produto; sgcEscAlertaJustificar libera', async () => {
    const antes = await verificar(CARDS_003.alertas);
    assert.equal(Number(antes.PODE), 0);
    assert.match(antes.MOTIVO, /CREME NUTRICIONAL MORANGO 200 ML/);
    await chamar('sgcEscAlertaJustificar', {
      idCard: CARDS_003.alertas, codprod: 5001, justificativa: 'Lote proprio sera consumido antes do vencimento.',
    }, U.ana);
    const depois = await verificar(CARDS_003.alertas);
    assert.doesNotMatch(depois.MOTIVO, /itens com alerta/);
  });

  await teste('C-007: item com cobertura 40 dias contra limite de 35 e sem justificativa recusa citando a cobertura; com a justificativa gravada pelo sgcItensGravar, libera', async () => {
    const antes = await verificar(CARDS_003.alertas);
    assert.equal(Number(antes.PODE), 0);
    assert.match(antes.MOTIVO, /cobertura acima do limite/);
    const saida = await chamar('sgcItensGravar', {
      cardId: CARDS_003.alertas,
      itensJson: JSON.stringify([umItem(5001, 30, 10.0, {
        descricao: 'CREME NUTRICIONAL MORANGO 200 ML', coberturaDias: 40, coberturaLimite: 35,
        coberturaJustificativa: 'Campanha de outubro ja vendida ao hospital.',
      })]),
    }, U.ana);
    assert.equal(saida.ok, true, saida.erro);
    const depois = await verificar(CARDS_003.alertas);
    assert.equal(Number(depois.PODE), 1);
    assert.equal(depois.MOTIVO, '', 'MOTIVO vazio quando pode (contrato da lib, R-020)');
  });

  await teste('C-017: pedido com 3 itens todos zerados recusa com a mensagem de quantidade', async () => {
    const veredicto = await verificar(CARDS_003.zerado);
    assert.equal(Number(veredicto.PODE), 0);
    assert.match(veredicto.MOTIVO, /pelo menos um item/);
  });

  await teste('C-015: prazo acordado divergente do padrao recusa; justificativa de 9 caracteres nao basta, 10 liberam', async () => {
    const semJustificativa = await verificar(CARDS_003.prazo);
    assert.equal(Number(semJustificativa.PODE), 0);
    assert.match(semJustificativa.MOTIVO, /Justifique a diferen/);
    await chamar('sgcEscPedidoPrazo', {
      idCard: CARDS_003.prazo, prazoPadrao: '30/60', prazoAcordado: '28/35/42', prazoJustificativa: '123456789',
    }, U.ana);
    assert.equal(Number((await verificar(CARDS_003.prazo)).PODE), 0, '9 caracteres ainda bloqueiam');
    await chamar('sgcEscPedidoPrazo', {
      idCard: CARDS_003.prazo, prazoPadrao: '30/60', prazoAcordado: '28/35/42', prazoJustificativa: '1234567890',
    }, U.ana);
    const liberado = await verificar(CARDS_003.prazo);
    assert.equal(Number(liberado.PODE), 1, liberado.MOTIVO);
    assert.equal(liberado.MOTIVO, '');
  });

  await teste('RN-012: as cinco exigencias verificadas uma a uma devolvem PODE 0 com a sua mensagem, e o pedido em ordem devolve PODE 1 com MOTIVO vazio', async () => {
    const card = CARDS_003.prazo;
    const restaurar = () => db.exec(`UPDATE SGC_PEDIDO SET PRAZO_PADRAO = '30/60', PRAZO_ACORDADO = '28/35/42', PRAZO_JUSTIFICATIVA = '1234567890' WHERE ID_CARD = ${card}`);

    db.exec(`UPDATE SGC_PEDIDO SET PRAZO_PADRAO = '' WHERE ID_CARD = ${card}`);
    assert.match((await verificar(card)).MOTIVO, /prazo de pagamento padrao|prazo de pagamento padrão/);
    restaurar();

    db.exec(`UPDATE SGC_PEDIDO SET PRAZO_ACORDADO = '' WHERE ID_CARD = ${card}`);
    assert.match((await verificar(card)).MOTIVO, /acordado neste pedido/);
    restaurar();

    db.exec(`UPDATE SGC_PEDIDO_ITEM SET QT_PEDIDA = 0 WHERE ID_CARD = ${card}`);
    assert.match((await verificar(card)).MOTIVO, /pelo menos um item/);
    db.exec(`UPDATE SGC_PEDIDO_ITEM SET QT_PEDIDA = 12 WHERE ID_CARD = ${card}`);

    db.exec(`UPDATE SGC_PEDIDO_ITEM SET COBERTURA_DIAS = 90, COBERTURA_LIMITE = 35, COBERTURA_JUSTIFICATIVA = '' WHERE ID_CARD = ${card}`);
    assert.match((await verificar(card)).MOTIVO, /cobertura acima do limite/);
    db.exec(`UPDATE SGC_PEDIDO_ITEM SET COBERTURA_DIAS = 10 WHERE ID_CARD = ${card}`);

    db.exec(`INSERT INTO SGC_ALERTA (ID_CARD, CODPROD, TIPO, CHAVE, MENSAGEM, LIDO, CRIADO_EM)
      VALUES (${card}, 5009, 'excesso', 'excesso:5009:9', 'teste', 0, '2026-09-15T09:00:00')`);
    assert.match((await verificar(card)).MOTIVO, /Leia o/);
    db.exec(`DELETE FROM SGC_ALERTA WHERE ID_CARD = ${card}`);

    const final = await verificar(card);
    assert.equal(Number(final.PODE), 1, final.MOTIVO);
    assert.equal(final.MOTIVO, '');
  });

  /* ── T-084 — sair da Análise: verifica, arruma e registra ─────────────── */

  await teste('C-018: sgcAnaliseSair num pedido com 20 itens (8 com quantidade) remove os 12 zerados, recalcula o total e escreve no historico uma nota com "8 itens"', async () => {
    const saida = await chamar('sgcAnaliseSair', { cardId: CARDS_003.pronto }, U.ana);
    assert.equal(saida.ok, true, saida.erro);
    assert.equal(saida.itens, 8);
    assert.equal(saida.removidos, 12);
    const vivos = db.prepare("SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS <> 'removido'").get(CARDS_003.pronto);
    assert.equal(Number(vivos.N), 8, 'RN-014: item zerado sai da lista');
    const capa = db.prepare('SELECT VL_TOTAL FROM SGC_PEDIDO WHERE ID_CARD = ?').get(CARDS_003.pronto);
    assert.equal(Number(capa.VL_TOTAL), 1200);
    const nota = db.prepare("SELECT DETALHE FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota'").all(CARDS_003.pronto);
    assert.equal(nota.length, 1);
    assert.match(String(nota[0].DETALHE), /8 itens/);
    assert.match(String(nota[0].DETALHE), /R\$ 1.200,00/);
  });

  await teste('C-018 (recusa): com alerta nao lido o sgcAnaliseSair devolve ok false e NAO grava nada — os itens continuam vivos e nenhuma nota entra no historico', async () => {
    db.exec(`UPDATE SGC_ALERTA SET LIDO = 0 WHERE ID_CARD = ${CARDS_003.alertas}`);
    const antes = db.prepare("SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS <> 'removido'").get(CARDS_003.alertas);
    const saida = await chamar('sgcAnaliseSair', { cardId: CARDS_003.alertas }, U.ana);
    assert.equal(saida.ok, false);
    assert.match(saida.erro, /alertas/);
    const depois = db.prepare("SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS <> 'removido'").get(CARDS_003.alertas);
    assert.equal(Number(depois.N), Number(antes.N));
    const nota = db.prepare("SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota'").get(CARDS_003.alertas);
    assert.equal(Number(nota.N), 0);
  });

  await teste('C-022: reenvio depois da reprovacao tecnica tira os 3 itens zerados da lista, recalcula o total e limpa o motivo da reprovacao', async () => {
    const saida = await chamar('sgcAnaliseSair', { cardId: CARDS_003.reprovado }, U.ana);
    assert.equal(saida.ok, true, saida.erro);
    assert.equal(saida.removidos, 3);
    const zeradosVivos = db.prepare("SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS <> 'removido' AND QT_PEDIDA <= 0").get(CARDS_003.reprovado);
    assert.equal(Number(zeradosVivos.N), 0);
    const capa = db.prepare('SELECT TEC_MOTIVO, TEC_PRODUTOS_REPROVADOS, VL_TOTAL FROM SGC_PEDIDO WHERE ID_CARD = ?').get(CARDS_003.reprovado);
    assert.equal(String(capa.TEC_MOTIVO || ''), '');
    assert.equal(String(capa.TEC_PRODUTOS_REPROVADOS || ''), '');
    assert.equal(Number(capa.VL_TOTAL), 300);
  });

  await teste('RN-013: sgcEscItemStatusFase leva os itens vivos para aprovado e depois para enviado, e nao toca no que ja foi removido', async () => {
    await chamar('sgcEscItemRemover', { idCard: CARDS_003.gravacao, codprod: 5014, atualizadoEm: '2026-09-15T09:10:00' }, U.ana);
    const contar = (status) => Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS = ?').get(CARDS_003.gravacao, status).N);
    assert.equal(contar('removido'), 1);

    await chamar('sgcEscItemStatusFase', { idCard: CARDS_003.gravacao, status: 'aprovado', atualizadoEm: '2026-09-15T09:20:00' }, U.dora);
    assert.equal(contar('aprovado'), 8);
    assert.equal(contar('removido'), 1);

    await chamar('sgcEscItemStatusFase', { idCard: CARDS_003.gravacao, status: 'enviado', atualizadoEm: '2026-09-15T09:30:00' }, U.dora);
    assert.equal(contar('enviado'), 8);
    assert.equal(contar('removido'), 1);
  });

  /* ── T-085 — cancelamento e limites de cobertura ──────────────────────── */

  await teste('C-019: o bloco PENDENCIAS entregue a 002 barra analise -> tecnica e NAO barra analise -> cancelado, com as mesmas pendencias', async () => {
    const paraTecnica = podeMoverComPendencias(ctx, CARDS_003.zerado, 'analise>tecnica');
    assert.equal(Number(paraTecnica.PODE), 0);
    assert.match(paraTecnica.MOTIVO, /pelo menos um item/);
    const paraCancelado = podeMoverComPendencias(ctx, CARDS_003.zerado, 'analise>cancelado');
    assert.equal(Number(paraCancelado.PODE), 1, 'nenhuma exigencia da Analise se aplica ao cancelamento');
    assert.equal(paraCancelado.MOTIVO, '');
  });

  await teste('C-020: o gestor grava limite de cobertura e o analista nao; sgcCoberturaListar devolve o limite resolvido', async () => {
    const entrada = { nivel: 'secao', codigo: '21', descricao: 'SUPLEMENTOS ORAIS', limiteDias: 45, atualizadoEm: '2026-09-15T09:40:00' };
    await chamar('sgcEscCoberturaGravar', entrada, U.ana);
    const depoisDaAna = db.prepare("SELECT COUNT(*) AS N FROM SGC_COBERTURA WHERE NIVEL = 'secao' AND CODIGO = '21'").get();
    assert.equal(Number(depoisDaAna.N), 0, 'analista nao mantem limite de cobertura');

    await chamar('sgcEscCoberturaGravar', entrada, U.gil);
    const lista = await linhas(ctx, 'sgcCoberturaListar', { nivel: '', limite: 200, offset: 0 }, U.gil);
    const secao = lista.find((r) => r.NIVEL === 'secao' && String(r.CODIGO) === '21');
    assert.ok(secao, 'o limite gravado pelo gestor deveria aparecer na listagem');
    assert.equal(Number(secao.LIMITE_DIAS), 45);
    const sku = lista.find((r) => r.NIVEL === 'sku' && String(r.CODIGO) === '5001');
    assert.equal(Number(sku.LIMITE_DIAS), 20);

    await chamar('sgcEscCoberturaExcluir', { id: Number(secao.ID), atualizadoEm: '2026-09-15T09:50:00' }, U.gil);
    const depoisDaExclusao = await linhas(ctx, 'sgcCoberturaListar', { nivel: 'secao', limite: 200, offset: 0 }, U.gil);
    assert.equal(depoisDaExclusao.length, 0, 'exclusao e desativacao: o limite sai da resolucao');
  });
}
