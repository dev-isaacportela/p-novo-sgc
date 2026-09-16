// Seção Simulador da spec 008 (solicitações do comercial). Ver
// docs/specs/008-solicitacoes-do-comercial/plan.md §Simulador.
//
// Só INSERT: fornecedores, filiais, personas e o catálogo das 003/007 não são
// tocados (R-017). Esta spec insere o que é só dela:
//
// - 5 produtos próprios do fornecedor 1042 (PCPRODUT, CODPROD 5301–5305, fora
//   das faixas da 003 — 5001–5104 — e da 007 — 5201–5202 —, sem "CREME" na
//   descrição nem as palavras da 007);
// - 5 clientes próprios (PCCLIENT 9201–9205, com CGCENT — R-069);
// - PCEST da FILIAL 3 para os cinco, com datas RELATIVAS a hoje (D-014: as
//   datas do rastreio são relativas à aprovação, as dos seeds 003/007 são
//   fixas — o mesmo teste daria um resultado hoje e outro no ano que vem);
// - vendas em PCMOV (CODOPER 'S', DTCANCEL nulo) a partir de NUMTRANSITEM
//   950001 (R-062), mais dois controles: a venda anterior à referência e uma
//   entrada 'E', que não podem entrar em soma nenhuma;
// - 3 cards PRÓPRIOS do quadro compras (R-073), exportados em CARDS_008, todos
//   com DT_ENVIO vazio, sem SGC_NF e sem SGC_BO_ITEM — é o que os mantém fora
//   das listagens globais da 005 e da 007 (R-045);
// - 15 solicitações em SGC_SOLICITACAO (5 pendentes, 7 aprovadas sem pedido, 1
//   aprovada e vinculada, 1 recusada, 1 cancelada — os números de C-020),
//   exportadas em SOLICITACOES_008, e o histórico só onde o cenário precisa (a
//   `vinculada`, com as 4 linhas gravadas de C-022, e a `recusada`).

/** Data de hoje + `dias` (negativo = passado), em AAAA-MM-DD. */
function emDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
const carimbo = (dias) => `${emDias(dias)}T09:00:00`;

const FORNECEDOR = { codfornec: 1042, nome: 'NESTLE BRASIL LTDA' }; // o nome exato do seed da 001 (C-1)
const OUTRO_FORNECEDOR = { codfornec: 1015, nome: 'FRESENIUS KABI BRASIL LTDA' };
const FILIAIS = {
  1: 'Benenutri Matriz',
  2: 'Benenutri Filial Norte',
  3: 'Benenutri Filial Sul',
};

// CODPROD, DESCRICAO, EMBALAGEM, UNIDADE.
const PRODUTOS = [
  [5301, 'BEBIDA LACTEA ZERO LACTOSE 200 ML', 'CAIXA COM 24', 'UN'],
  [5302, 'FARINHA LACTEA TRADICIONAL 380 G', 'CX 12', 'UN'],
  [5303, 'LEITE CONDENSADO SEMIDESNATADO 395 G', 'CX 24', 'UN'],
  [5304, 'IOGURTE NATURAL INTEGRAL 170 G', 'BANDEJA 6', 'UN'],
  [5305, 'MANTEIGA EXTRA SEM SAL 200 G', 'CX 12', 'UN'],
];

// CODCLI, CLIENTE, CGCENT (só dígitos, como o vendedor busca).
const CLIENTES = [
  [9201, 'Nutrivida Clinica Ltda', '12345678000190'],
  [9202, 'Casa de Repouso Bem Viver Ltda', '22345678000181'],
  [9203, 'Hospital Sao Lucas SA', '32345678000172'],
  [9204, 'Rede Vida Distribuidora Ltda', '42345678000163'],
  [9205, 'Mercado Central Alimentos Ltda', '52345678000154'],
];

// CODPROD, QTEST, QTVENDMES(=1=2), dias da última saída — filial 3, o que o
// eixo do estoque de C-015 lê.
const ESTOQUES = [
  [5301, 20, 30, -5],   // girando (cobertura 20 dias)
  [5302, 0, 0, -40],    // sem_estoque
  [5303, 40, 0, -80],   // parado (80 dias sem saída)
  [5304, 300, 30, -3],  // excesso (cobertura 300 dias)
  [5305, 0, 0, -50],    // sem_estoque
];

// NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, dias, QT, CODOPER.
const VENDAS = [
  [950001, 5301, '3', 9201, -20, 12, 'S'], // cliente comprou na filial
  [950002, 5302, '1', 9202, -15, 8, 'S'],  // comprou em OUTRA filial
  [950003, 5303, '3', 9204, -70, 5, 'S'],  // controle: cliente errado e antes da referência
  [950004, 5304, '3', 9205, -30, 30, 'S'], // venda a terceiro: contexto, nunca resposta (RN-013)
  [950005, 5301, '3', 9201, -5, 100, 'E'], // controle: entrada não conta
];

/** Ids dos cards desta spec, para o smoke não depender da ordem de inserção. */
export const CARDS_008 = {};
/** Ids das 15 solicitações, por chave — o recorte de R-045 no smoke. */
export const SOLICITACOES_008 = {};

// chave, CODPROD, fornecedor, CODFILIAL, CODCLI, PRIORIDADE, STATUS, autor,
// CRIADO_EM (dias), AVALIADO_EM (dias; null = sem avaliação).
const SOLICITACOES = [
  ['pendenteAlta', 5301, 1042, '1', 9201, 'alta', 'pendente', 'leo', -8, null],
  ['pendenteNormal', 5302, 1042, '1', 9202, 'normal', 'pendente', 'leo', -7, null],
  ['pendenteMesmoProduto', 5301, 1042, '1', 9205, 'normal', 'pendente', 'admin', -6, null],
  ['pendenteFilial2', 5302, 1042, '2', 9202, 'normal', 'pendente', 'leo', -5, null],
  ['pendenteOutroFornec', 5001, 1015, '1', 9204, 'normal', 'pendente', 'admin', -5, null],
  ['filaUrgente', 5303, 1042, '1', 9203, 'urgente', 'aprovada', 'leo', -9, -4],
  ['rastComprou', 5301, 1042, '3', 9201, 'normal', 'aprovada', 'admin', -50, -45],
  ['rastOutraFilial', 5302, 1042, '3', 9202, 'normal', 'aprovada', 'admin', -50, -45],
  ['rastNaoComprou', 5303, 1042, '3', 9203, 'normal', 'aprovada', 'admin', -50, -45],
  ['rastExcesso', 5304, 1042, '3', 9204, 'normal', 'aprovada', 'admin', -50, -45],
  ['rastSemCliente', 5305, 1042, '3', 0, 'normal', 'aprovada', 'admin', -50, -45],
  ['rastCarencia', 5301, 1042, '3', 9205, 'normal', 'aprovada', 'admin', -12, -10],
  ['vinculada', 5301, 1042, '1', 9201, 'normal', 'aprovada', 'gil', -50, -45],
  ['recusada', 5303, 1042, '1', 9203, 'normal', 'recusada', 'gil', -20, -18],
  ['cancelada', 5304, 1042, '1', 9204, 'normal', 'cancelada', 'gil', -20, null],
];

const JUSTIFICATIVA = {
  5001: 'Cliente pediu reposicao mensal e o estoque zerou na semana passada.',
  5301: 'Cliente pediu 24 unidades para o mes; estamos sem estoque desde a semana passada.',
  5302: 'Demanda recorrente da regiao; a ultima compra nao cobriu o giro do trimestre.',
  5303: 'Pedido fechado com o cliente para o proximo mes, sem estoque na filial.',
  5304: 'Cliente novo pediu grade completa; item sem cobertura na filial.',
  5305: 'Giro que enxergamos na regiao, sem cliente fechado ainda.',
};

const DESCRICAO_DE = Object.fromEntries(PRODUTOS.map(([codprod, descricao]) => [codprod, descricao]));
const EMBALAGEM_DE = Object.fromEntries(PRODUTOS.map(([codprod, , embalagem]) => [codprod, embalagem]));
const CLIENTE_DE = Object.fromEntries(CLIENTES.map(([codcli, cliente, cnpj]) => [codcli, { cliente, cnpj }]));

export function seed008(db, cenario) {
  const anaId = cenario.usuarios.ana;
  const agora = '2026-09-15T08:00:00';

  /* ── WinThor: catálogo, clientes, estoque da filial 3 e vendas relativas ── */
  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL)
    VALUES (?, ?, ?, ?, ?, 3, 31, 24, NULL, 180)`);
  for (const [codprod, descricao, embalagem, unidade] of PRODUTOS) {
    inserirProduto.run(codprod, descricao, embalagem, unidade, FORNECEDOR.codfornec);
  }

  const inserirCliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1, CGCENT) VALUES (?, ?, ?, 1, ?)');
  for (const [codcli, cliente, cgcent] of CLIENTES) inserirCliente.run(codcli, cliente, 'J', cgcent);

  const inserirEstoque = db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, QTPEDIDA, CUSTOULTENT, DTULTENT, DTULTSAIDA)
    VALUES (?, '3', ?, ?, ?, ?, 0, 0, ?, ?)`);
  for (const [codprod, qtest, giroMes, diasUltSaida] of ESTOQUES) {
    inserirEstoque.run(codprod, qtest, giroMes, giroMes, giroMes, emDias(-95), emDias(diasUltSaida));
  }

  const inserirMov = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMPED, NUMNOTA, DTCANCEL)
    VALUES (?, ?, ?, ?, ?, ?, ?, 10, 0, ?, NULL)`);
  for (const [transitem, codprod, codfilial, codcli, dias, qt, codoper] of VENDAS) {
    inserirMov.run(transitem, codprod, codfilial, codcli, codoper, emDias(dias), qt, transitem);
  }

  /* ── SGC: os 3 cards próprios (R-073), fornecedor 1042, criados por ana ── */
  const inserirCard = db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const inserirResponsavel = db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, 1)');
  const inserirPedido = db.prepare(`INSERT INTO SGC_PEDIDO
    (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA,
     DT_ENVIO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, '2026-08-01', '2026-09-15', 'manual', 0, '', ?, ?, ?)`);

  function criarCard(chave, faseChave, codfilial) {
    const titulo = `${FILIAIS[codfilial].toUpperCase()} · NESTLE (SOLICITACOES)`;
    inserirCard.run(
      cenario.boardCompras, cenario.fases[faseChave], titulo, 1, anaId, '{}',
      titulo.toLowerCase(), anaId, agora, agora, agora,
    );
    const cardId = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
    inserirResponsavel.run(cardId, anaId);
    inserirPedido.run(cardId, FORNECEDOR.codfornec, FORNECEDOR.nome, codfilial, FILIAIS[codfilial], anaId, agora, agora);
    CARDS_008[chave] = cardId;
    return cardId;
  }

  criarCard('montagem', 'analise', '1');
  criarCard('montagemFilial2', 'analise', '2');
  criarCard('vinculado', 'enviado', '1');

  /* ── as 15 solicitações ── */
  const inserirSolicitacao = db.prepare(`INSERT INTO SGC_SOLICITACAO
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL,
     QUANTIDADE, JUSTIFICATIVA, CODCLI, CLIENTE, CNPJ_CLIENTE, PRIORIDADE, STATUS, MOTIVO,
     ID_CARD, ID_ITEM, AVALIADO_POR, AVALIADO_EM, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (const [chave, codprod, codfornec, codfilial, codcli, prioridade, status, autor, diasCriacao, diasAvaliacao] of SOLICITACOES) {
    const fornecedor = codfornec === FORNECEDOR.codfornec ? FORNECEDOR.nome : OUTRO_FORNECEDOR.nome;
    const cliente = CLIENTE_DE[codcli] || { cliente: '', cnpj: '' };
    const avaliadoEm = diasAvaliacao === null ? '' : carimbo(diasAvaliacao);
    inserirSolicitacao.run(
      codprod, DESCRICAO_DE[codprod] || 'DIETA ENTERAL PADRAO 1000 ML', EMBALAGEM_DE[codprod] || 'CX 6', 'UN',
      codfornec, fornecedor, codfilial, FILIAIS[codfilial],
      24, JUSTIFICATIVA[codprod] || JUSTIFICATIVA[5301],
      codcli, cliente.cliente, cliente.cnpj, prioridade, status,
      chave === 'recusada' ? 'Produto ja coberto pelo pedido 998877, chega em 12 dias.' : '',
      0, 0, diasAvaliacao === null ? 0 : cenario.usuarios.gil, avaliadoEm,
      cenario.usuarios[autor], carimbo(diasCriacao), carimbo(diasAvaliacao === null ? diasCriacao : diasAvaliacao),
    );
    SOLICITACOES_008[chave] = Number(db.prepare('SELECT MAX(ID) AS ID FROM SGC_SOLICITACAO').get().ID);
  }

  /* ── o item do card `vinculado` (5301, 24, enviado) e o vínculo ── */
  const idVinculada = SOLICITACOES_008.vinculada;
  db.prepare(`INSERT INTO SGC_PEDIDO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, QT_PEDIDA, PRECO_CUSTO, STATUS, ID_SOLICITACAO,
     CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, 5301, ?, ?, 'UN', 24, 12.5, 'enviado', ?, ?, ?, ?)`)
    .run(CARDS_008.vinculado, DESCRICAO_DE[5301], EMBALAGEM_DE[5301], idVinculada, agora, anaId, agora);
  const idItem = Number(db.prepare('SELECT MAX(ID) AS ID FROM SGC_PEDIDO_ITEM').get().ID);
  db.prepare('UPDATE SGC_SOLICITACAO SET ID_CARD = ?, ID_ITEM = ? WHERE ID = ?')
    .run(CARDS_008.vinculado, idItem, idVinculada);

  /* ── histórico: só onde o cenário precisa (C-022 lê as 4 + a `criada` derivada) ── */
  const inserirHistorico = db.prepare(`INSERT INTO SGC_SOLICITACAO_HISTORICO
    (ID_SOLICITACAO, EVENTO, DETALHE, POR, EM) VALUES (?, ?, ?, ?, ?)`);
  const tituloVinculado = `${FILIAIS['1'].toUpperCase()} · NESTLE (SOLICITACOES)`;
  inserirHistorico.run(idVinculada, 'aprovada', 'Aprovada na fila de solicitações.', cenario.usuarios.gil, carimbo(-45));
  inserirHistorico.run(idVinculada, 'vinculada', `Incluída no pedido ${tituloVinculado} como item 5301.`, cenario.usuarios.gil, carimbo(-44));
  inserirHistorico.run(idVinculada, 'desvinculada', 'Item removido da lista do pedido.', cenario.usuarios.gil, carimbo(-43));
  inserirHistorico.run(idVinculada, 'vinculada', `Incluída no pedido ${tituloVinculado} como item 5301.`, cenario.usuarios.gil, carimbo(-42));
  inserirHistorico.run(
    SOLICITACOES_008.recusada, 'recusada', 'Produto ja coberto pelo pedido 998877, chega em 12 dias.',
    cenario.usuarios.gil, carimbo(-18),
  );
}
