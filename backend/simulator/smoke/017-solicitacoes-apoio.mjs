// Cenários C-01..C-05 e C-08..C-13 da spec 017 (solicitações: apoio à
// avaliação e visões agrupadas). Ver docs/specs/017-solicitacoes-apoio-e-visoes/.
//
// Apoio: as TRÊS leituras que a 017 reusa do add-013 (sgcWintProdutoHistorico,
// sgcWintProdutoVendasNotas, sgcWintProdutoEstoqueFiliais) sobre o produto 5311
// do seed/017 — contagem > 0, vazio não é verde. A regra de tela (top 5, cliente
// da solicitação, cobertura) é de frontend/tests/solicitacoes-apoio.test.mjs.
//
// Visões: as duas SFs do add-019 sobre SETE solicitações que esta suíte insere
// (fornecedor 1099, que nenhum seed usa) e três cards do quadro de compras nas
// fases enviado, concluído e cancelado. A suíte roda por último (smoke.mjs):
// nenhuma outra vê esses dados. Recorte de R-045: tudo filtrado por codfornec
// 1099 — nunca total absoluto.

import { assert } from './base.mjs';
import { PRODUTO_017 } from '../seed/017-solicitacoes-apoio.mjs';

const FORNECEDOR = { codfornec: 1099, nome: 'FORNECEDOR VISOES 017' };
const FILIAIS = { 1: 'Benenutri Matriz', 2: 'Benenutri Filial Norte' };

const FILTROS = {
  status: '', situacao: '', codfornec: FORNECEDOR.codfornec, codfilial: '', vendedor: 0, minhas: 0,
  busca: '', limite: 20, offset: 0,
};

/** Dia 1 do mês `meses` atrás de hoje (UTC), em AAAA-MM-DD — o início da janela do apoio (P-02). */
function inicioDoMes(meses) {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - meses, 1)).toISOString().slice(0, 10);
}
const mesAtras = (meses) => inicioDoMes(meses).slice(0, 7);

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;
  const { codprod, codfilial } = PRODUTO_017;
  const linhas = async (nome, input, quem = U.gil) => (await chamar(nome, input, quem)).rows;

  /* ═════════════ apoio à avaliação (RN-SOL-19) ═════════════ */

  await teste('C-01 / RN-02 (017): sgcWintProdutoHistorico do 5311 na filial 3 dá, sem o público, 20 · 40 · 10 · 50 · 35 · 40 · 20 nos sete meses (contagem > 0)', async () => {
    const meses = await linhas('sgcWintProdutoHistorico', { codprod, codfilial, meses: 7 });
    assert.ok(meses.length > 0, 'consulta ao WinThor vazia não é verde');
    const porMes = new Map(meses.map((m) => [String(m.MES), Number(m.SAIDAS) - Number(m.SAIDAS_PUBLICAS)]));
    assert.deepEqual([6, 5, 4, 3, 2, 1, 0].map((k) => porMes.get(mesAtras(k)) ?? 0), [20, 40, 10, 50, 35, 40, 20]);
    assert.equal(Number(meses.find((m) => String(m.MES) === mesAtras(3)).SAIDAS_PUBLICAS), 200, 'o público vem à parte, para a tela tirar');
    assert.ok(!porMes.has(mesAtras(8)), 'a venda de 8 meses atrás fica fora da janela');
  });

  const janela = { codprod, codfilial, dataInicio: inicioDoMes(6), dataFim: new Date().toISOString().slice(0, 10) };

  await teste('C-02 / RN-01 (017): as notas do 5311 na filial 3 sem o público não trazem o órgão público, a rede, a remessa futura, a outra filial nem a entrada', async () => {
    const notas = await linhas('sgcWintProdutoVendasNotas', { ...janela, incluirPublico: 0 });
    assert.ok(notas.length > 0, 'consulta ao WinThor vazia não é verde');
    const clientes = new Set(notas.map((n) => Number(n.CODCLI)));
    for (const fora of [9317, 9318, 0]) assert.ok(!clientes.has(fora), `o cliente ${fora} não é venda do apoio`);
    assert.equal(notas.reduce((t, n) => t + Number(n.QUANTIDADE), 0), 215, '195 nos seis fechados + 20 no corrente');
    assert.ok(!notas.some((n) => Number(n.QUANTIDADE) === 500 || Number(n.QUANTIDADE) === 100), 'nem a filial 1 nem a remessa futura');

    const comPublico = await linhas('sgcWintProdutoVendasNotas', { ...janela, incluirPublico: 1 });
    assert.ok(comPublico.some((n) => Number(n.CODCLI) === 9317), 'com o seletor, o órgão público aparece — e a rede continua fora');
    assert.ok(!comPublico.some((n) => Number(n.CODCLI) === 9318));
  });

  await teste('C-03 / RN-03 (017): somadas por cliente, as notas dão 9311 (70), 9312 (50), 9313 (40), 9314 (30), 9315 (20) e 9316 (5), com as notas e a última compra', async () => {
    const notas = await linhas('sgcWintProdutoVendasNotas', { ...janela, incluirPublico: 0 });
    const porCliente = new Map();
    for (const n of notas) {
      const atual = porCliente.get(Number(n.CODCLI)) ?? { qt: 0, notas: 0, ultima: '' };
      atual.qt += Number(n.QUANTIDADE);
      atual.notas += 1;
      if (String(n.DTMOV) > atual.ultima) atual.ultima = String(n.DTMOV);
      porCliente.set(Number(n.CODCLI), atual);
    }
    const ordem = [...porCliente].sort((a, b) => b[1].qt - a[1].qt).map(([codcli, c]) => [codcli, c.qt]);
    assert.deepEqual(ordem, [[9311, 70], [9312, 50], [9313, 40], [9314, 30], [9315, 20], [9316, 5]]);
    assert.equal(porCliente.get(9311).notas, 2);
    assert.equal(porCliente.get(9316).notas, 1, 'o 9316 levou 5 em 1 nota (C-04)');
    assert.equal(porCliente.get(9313).ultima, inicioDoMes(0), 'a última compra do 9313 é a do mês corrente');
    assert.ok(notas.every((n) => String(n.CLIENTE).length > 0), 'todo cliente com nome');
  });

  await teste('C-05 / RN-05 (017): sgcWintProdutoEstoqueFiliais do 5311 dá, na filial 3, disponível 65 (80 − 10 bloqueado − 5 reservado) e a caminho 36 (24 pedido + 12 trânsito)', async () => {
    const filiais = await linhas('sgcWintProdutoEstoqueFiliais', { codprod });
    assert.ok(filiais.length > 0, 'consulta ao WinThor vazia não é verde');
    const sul = filiais.find((f) => String(f.CODFILIAL) === codfilial);
    assert.ok(sul, 'a filial da solicitação tem posição');
    assert.equal(Number(sul.ESTOQUE_ATUAL), 65);
    assert.equal(Number(sul.ESTOQUE_EM_TRANSITO), 36);
  });

  /* ═════════════ visões agrupadas (RN-SOL-16) ═════════════ */

  const agora = '2026-11-03T09:00:00';
  const faseId = (chave) => Number(db.prepare('SELECT FASE_ID FROM SGC_FASE WHERE CHAVE = ?').get(chave).FASE_ID);
  const inserirCard = db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (1, ?, ?, 1, ?, '', '{}', ?, ?, ?, ?, ?)`);
  const card = (chave) => {
    const titulo = `VISOES 017 · ${chave.toUpperCase()}`;
    inserirCard.run(faseId(chave), titulo, U.ana, titulo.toLowerCase(), U.ana, agora, agora, agora);
    return Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
  };
  const cards = { enviado: card('enviado'), concluido: card('concluido'), cancelado: card('cancelado') };

  const inserirSolicitacao = db.prepare(`INSERT INTO SGC_SOLICITACAO
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL,
     QUANTIDADE, JUSTIFICATIVA, CODCLI, CLIENTE, CNPJ_CLIENTE, PRIORIDADE, STATUS, MOTIVO,
     ID_CARD, ID_ITEM, AVALIADO_POR, AVALIADO_EM, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, 'CX 6', 'UN', ?, ?, ?, ?, 12, 'Demanda do cliente para o mes que vem, sem estoque.', 0, '', '', 'normal', ?, '',
            ?, 0, 0, '', ?, ?, ?)`);
  // autor, produto, filial, status, card, dia — C-08: Leo 4 (1 pendente, 1 na
  // fila, 1 em compra, 1 recusada; 2 produtos), admin 3 (1 atendida, 1 não
  // atendida, 1 cancelada). C-09: filial 1 = 3, filial 2 = 4.
  const SETE = [
    ['leo', 7101, '1', 'pendente', 0, '2026-10-20'],
    ['leo', 7101, '1', 'aprovada', 0, '2026-10-21'],
    ['leo', 7102, '2', 'aprovada', cards.enviado, '2026-10-22'],
    ['leo', 7102, '1', 'recusada', 0, '2026-10-30'],
    ['admin', 7103, '2', 'aprovada', cards.concluido, '2026-10-10'],
    ['admin', 7103, '2', 'aprovada', cards.cancelado, '2026-10-11'],
    ['admin', 7104, '2', 'cancelada', 0, '2026-10-12'],
  ];
  const DESCRICAO = { 7101: 'MODULO DE PROTEINA VISOES 017', 7102: 'DIETA ENTERAL VISOES 017', 7103: 'ESPESSANTE VISOES 017', 7104: 'FIBRA SOLUVEL VISOES 017' };
  for (const [autor, produto, filial, status, idCard, dia] of SETE) {
    inserirSolicitacao.run(
      produto, DESCRICAO[produto], FORNECEDOR.codfornec, FORNECEDOR.nome, filial, FILIAIS[filial],
      status, idCard, U[autor], `${dia}T10:00:00`, `${dia}T10:00:00`,
    );
  }

  const agrupar = (dimensao, filtros = {}, quem = U.gil) => linhas('sgcSolicitacoesAgrupar', { ...FILTROS, dimensao, ...filtros }, quem);
  const totalDeGrupos = async (dimensao, filtros = {}, quem = U.gil) =>
    Number((await linhas('sgcSolicitacoesAgruparTotal', { ...FILTROS, dimensao, ...filtros }, quem))[0].TOTAL);
  const situacoes = (g) => ['PENDENTES', 'NA_FILA', 'EM_COMPRA', 'ATENDIDAS', 'NAO_ATENDIDAS', 'ENCERRADAS'].map((c) => Number(g[c]));
  const soma = (valores) => valores.reduce((t, v) => t + v, 0);

  await teste('C-08 / RN-07 / RN-08 (017): por vendedor, Leo (4: 1 pendente, 1 na fila, 1 em compra, 1 recusada; 2 produtos) antes do admin (3: 1 atendida, 1 não atendida, 1 cancelada) — as seis colunas somam o total', async () => {
    const grupos = await agrupar('vendedor');
    assert.equal(grupos.length, 2);
    const [leo, admin] = grupos;
    assert.equal(String(leo.CHAVE), String(U.leo));
    assert.equal(String(leo.ROTULO), 'Leo Comercial');
    assert.equal(Number(leo.TOTAL), 4);
    assert.equal(Number(leo.PRODUTOS), 2);
    assert.deepEqual(situacoes(leo), [1, 1, 1, 0, 0, 1]);
    assert.equal(String(leo.ULTIMA), '2026-10-30T10:00:00', 'a mais recente do grupo');
    assert.equal(String(admin.ROTULO), 'Admin SGC');
    assert.equal(Number(admin.TOTAL), 3);
    assert.deepEqual(situacoes(admin), [0, 0, 0, 1, 1, 1]);
    for (const g of grupos) assert.equal(soma(situacoes(g)), Number(g.TOTAL), `a partição de ${g.ROTULO} soma o total`);
  });

  await teste('C-09 / RN-08 / RN-10 (017): por fornecedor, 1 grupo de 7 com o nome gravado; por filial, Norte (4) antes de Matriz (3), com os nomes', async () => {
    const porFornecedor = await agrupar('fornecedor');
    assert.equal(porFornecedor.length, 1);
    assert.equal(String(porFornecedor[0].CHAVE), String(FORNECEDOR.codfornec));
    assert.equal(String(porFornecedor[0].ROTULO), FORNECEDOR.nome);
    assert.equal(Number(porFornecedor[0].TOTAL), 7);
    assert.equal(Number(porFornecedor[0].PRODUTOS), 4);
    assert.equal(soma(situacoes(porFornecedor[0])), 7);

    const porFilial = await agrupar('filial');
    assert.deepEqual(porFilial.map((g) => [String(g.CHAVE), String(g.ROTULO), Number(g.TOTAL)]), [
      ['2', 'Benenutri Filial Norte', 4], ['1', 'Benenutri Matriz', 3],
    ]);
  });

  await teste('C-10 / RN-09 (017): os filtros da lista recontam os grupos — pendentes: só Leo com 1; atendida: só o admin com 1; busca pelo produto: só as dele', async () => {
    const pendentes = await agrupar('vendedor', { status: 'pendente' });
    assert.deepEqual(pendentes.map((g) => [String(g.CHAVE), Number(g.TOTAL)]), [[String(U.leo), 1]]);

    const atendidas = await agrupar('vendedor', { situacao: 'atendida' });
    assert.deepEqual(atendidas.map((g) => [String(g.CHAVE), Number(g.TOTAL), Number(g.ATENDIDAS)]), [[String(U.admin), 1, 1]]);

    const porProduto = await agrupar('vendedor', { busca: 'ESPESSANTE' });
    assert.deepEqual(porProduto.map((g) => [String(g.CHAVE), Number(g.TOTAL)]), [[String(U.admin), 2]]);

    const daFilial2DoLeo = await agrupar('filial', { vendedor: U.leo });
    assert.deepEqual(daFilial2DoLeo.map((g) => [String(g.CHAVE), Number(g.TOTAL)]), [['1', 3], ['2', 1]], 'o vendedor do grupo aberto também filtra');
  });

  await teste('C-11 / RN-09 (017): Leo (comercial) agrupando por vendedor vê 1 grupo, o dele, com as 4 — as do admin não aparecem nem somadas', async () => {
    const doLeo = await agrupar('vendedor', {}, U.leo);
    assert.deepEqual(doLeo.map((g) => [String(g.CHAVE), Number(g.TOTAL)]), [[String(U.leo), 4]]);
    const porFornecedor = await agrupar('fornecedor', {}, U.leo);
    assert.equal(Number(porFornecedor[0].TOTAL), 4, 'por fornecedor, só as dele');
    assert.equal(await totalDeGrupos('vendedor', {}, U.leo), 1);
  });

  await teste('C-13 / RN-10 (017): de 1 em 1, a página 1 é Leo e a 2 é o admin; o total é 2 grupos; dimensão desconhecida devolve nenhum grupo', async () => {
    assert.equal(await totalDeGrupos('vendedor'), 2);
    const p1 = await agrupar('vendedor', { limite: 1, offset: 0 });
    const p2 = await agrupar('vendedor', { limite: 1, offset: 1 });
    assert.deepEqual([...p1, ...p2].map((g) => String(g.CHAVE)), [String(U.leo), String(U.admin)]);
    assert.equal(await totalDeGrupos('filial'), 2);
    assert.equal((await agrupar('cliente')).length, 0, 'só vendedor, fornecedor e filial');
    assert.equal(await totalDeGrupos('cliente'), 0);
  });

  await teste('C-12 (017): o filtro de um grupo aberto é o mesmo da lista — sgcSolicitacoesListar com o vendedor, o fornecedor ou a filial do grupo devolve exatamente o TOTAL dele', async () => {
    const listar = async (filtros) => (await linhas('sgcSolicitacoesListar', { ...FILTROS, ...filtros })).length;
    for (const g of await agrupar('vendedor')) assert.equal(await listar({ vendedor: Number(g.CHAVE) }), Number(g.TOTAL));
    for (const g of await agrupar('filial')) assert.equal(await listar({ codfilial: String(g.CHAVE) }), Number(g.TOTAL));
    const [fornecedor] = await agrupar('fornecedor');
    assert.equal(await listar({ codfornec: Number(fornecedor.CHAVE) }), Number(fornecedor.TOTAL));
  });
}
