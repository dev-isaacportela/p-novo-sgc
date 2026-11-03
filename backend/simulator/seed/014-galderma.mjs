// Seção Simulador da spec 014 (pedido Galderma). Ver
// docs/specs/014-pedido-galderma/plan.md §Simulador.
//
// Só INSERT (e um INSERT OR IGNORE no fornecedor): nenhuma tabela nasce aqui.
// Filiais (1, 2, 3) são do seed/001-fornecedores.mjs, e o 011 já fez da filial 2
// um cliente (9307, venda entre filiais). Faixas próprias, para não mexer em
// nenhuma listagem das outras specs (R-045): fornecedor 1541, produtos
// 5801-5806, clientes 9501-9504, NUMTRANSITEM >= 980001, NUMTRANSVENDA >= 980001,
// CUSTOPRODUTO.ID >= 1401.
//
// As datas são FIXAS (competências de 2026): a mesa é mensal e os cenários são
// os do sistema antigo — o trimestre de 2026-08 é 2026-05-01..2026-07-31.

export const GALDERMA = 1541;
export const COMPETENCIA_014 = '2026-08';

/** O período da competência 2026-08 que a mesa manda à posição (RN-005). */
export const PERIODO_014 = {
  dataInicioTri: '2026-05-01', dataFimTri: '2026-07-31',
  dataInicioMes: '2026-08-01', dataFimMes: '2026-08-31',
};

// CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, QTUNITCX, OBS2, CODAUXILIAR (EAN).
// 5806 é inativo (OBS2): fica fora do catálogo da mesa (RN-PG-13).
const PRODUTOS = [
  [5801, 'PREENCHEDOR HIALURONICO VOLUME 1ML', '1X1UN', 'UN', 12, null, '7890000058012'],
  [5802, 'PREENCHEDOR HIALURONICO LABIOS 1ML', '1X1UN', 'UN', 12, null, '7890000058029'],
  [5803, 'BIOESTIMULADOR 2 FRASCOS', '1X1UN', 'UN', 1, null, '7890000058036'],
  [5804, 'TOXINA BOTULINICA 300UI', '1X1UN', 'UN', 120, null, '7890000058043'],
  [5805, 'SERUM PEPTIDEOS 30ML', '1X1UN', 'UN', 1, null, '7890000058050'],
  [5806, 'KIT DESCONTINUADO', '1X1UN', 'UN', 1, 'INATIVO', '7890000058067'],
];

// CODPROD, CODFILIAL, QTEST, QTBLOQUEADA, QTRESERV, QTPEDIDA, CUSTOULTENT.
// 5801 na filial 1 é o C-002: 150 físicas, 10 bloqueadas, 8 reservadas, 20
// pedidas e 5 em PCESTTRANSITO → disponível 132, trânsito 25, total 157.
const ESTOQUE = [
  [5801, '1', 150, 10, 8, 20, 48.0],
  [5801, '2', 60, 0, 0, 0, 48.0],
  [5802, '1', 80, 0, 0, 0, 38.0],
  [5802, '2', 40, 0, 0, 12, 38.0],
  [5803, '1', 30, 0, 0, 0, 900.0],
  [5804, '1', 240, 0, 0, 0, 700.0],
  [5804, '2', 120, 0, 0, 0, 700.0],
  [5805, '1', 18, 0, 0, 0, 120.0],
];

// NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMTRANSVENDA, DTCANCEL.
// C-003: no trimestre de 2026-08, o 5801 na filial 1 vende 900 a clientes comuns
// (300 por mês) e mais 40 ao órgão público (9502), 30 à filial 2 (9307) e 20 em
// remessa de entrega futura (NUMTRANSVENDA 980090, CONDVENDA 8) — que ficam fora.
const MOVIMENTOS = [
  [980001, 5801, '1', 9501, 'S', '2026-05-15', 300, 95.0, 980001, null],
  [980002, 5801, '1', 9501, 'S', '2026-06-15', 300, 95.0, 980002, null],
  [980003, 5801, '1', 9504, 'S', '2026-07-15', 300, 95.0, 980003, null],
  [980004, 5801, '1', 9502, 'S', '2026-06-20', 40, 90.0, 980004, null],
  [980005, 5801, '1', 9307, 'S', '2026-07-01', 30, 48.0, 980005, null],
  [980006, 5801, '1', 9501, 'S', '2026-07-20', 20, 0, 980090, null],
  // Agosto: venda do mês 120 (e uma cancelada de 10, que a reconstrução do estoque ignora), compra 600.
  [980007, 5801, '1', 9501, 'S', '2026-08-10', 120, 95.0, 980007, null],
  [980008, 5801, '1', 9501, 'S', '2026-08-12', 10, 95.0, 980008, '2026-08-13'],
  [980009, 5801, '1', null, 'E', '2026-08-05', 600, 48.0, null, null],
  // Filial 2 e os outros produtos: giro e compra para a composição e o acompanhamento.
  [980010, 5801, '2', 9501, 'S', '2026-06-10', 90, 95.0, 980010, null],
  [980011, 5801, '2', 9504, 'S', '2026-08-18', 45, 95.0, 980011, null],
  [980012, 5801, '2', null, 'E', '2026-08-06', 240, 48.0, null, null],
  [980013, 5802, '1', 9501, 'S', '2026-06-05', 150, 80.0, 980013, null],
  [980014, 5802, '1', 9504, 'S', '2026-08-08', 60, 80.0, 980014, null],
  [980015, 5802, '2', 9501, 'S', '2026-07-08', 60, 80.0, 980015, null],
  [980016, 5802, '1', null, 'E', '2026-08-03', 120, 38.0, null, null],
  [980017, 5804, '1', 9501, 'S', '2026-07-22', 240, 1100.0, 980017, null],
  [980018, 5804, '2', 9504, 'S', '2026-08-22', 120, 1100.0, 980018, null],
  [980019, 5804, '1', null, 'E', '2026-08-02', 360, 700.0, null, null],
  [980020, 5803, '1', 9501, 'S', '2026-08-25', 6, 1500.0, 980020, null],
  // Setembro e outubro: o realizado dos meses seguintes do acompanhamento.
  [980021, 5801, '1', 9501, 'S', '2026-09-12', 150, 95.0, 980021, null],
  [980022, 5801, '1', null, 'E', '2026-09-03', 240, 48.0, null, null],
  [980023, 5802, '1', 9504, 'S', '2026-09-14', 72, 80.0, 980023, null],
  [980024, 5801, '1', 9501, 'S', '2026-10-09', 132, 95.0, 980024, null],
  [980025, 5804, '2', 9501, 'S', '2026-10-15', 120, 1100.0, 980025, null],
];

export function seed014(db, { usuarios: U }) {
  db.prepare(`INSERT OR IGNORE INTO PCFORNEC (CODFORNEC, FORNECEDOR, FANTASIA, CGC, EMAIL, UF)
    VALUES (?, 'GALDERMA DISTRIBUIDORA DO BRASIL LTDA', 'GALDERMA', '00000000000191', '', 'SP')`).run(GALDERMA);

  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL, CODFAB, CODAUXILIAR)
    VALUES (?, ?, ?, ?, ${GALDERMA}, 2, 21, ?, ?, 0, '', ?)`);
  for (const p of PRODUTOS) inserirProduto.run(...p);

  const inserirEstoque = db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, QTPEDIDA, QTBLOQUEADA, QTINDENIZ, QTRESERV, CUSTOULTENT, CUSTOFIN)
    VALUES (?, ?, ?, 0, 0, 0, ?, ?, 0, ?, ?, ?)`);
  for (const [codprod, filial, qtest, bloq, reserv, pedida, custo] of ESTOQUE) {
    inserirEstoque.run(codprod, filial, qtest, pedida, bloq, reserv, custo, custo);
  }
  db.prepare("INSERT INTO PCESTTRANSITO (CODPROD, CODFILIAL, QTTRANSITO, DTPREVISTA) VALUES (5801, '1', 5, '2026-11-20')").run();

  const inserirCliente = db.prepare('INSERT OR IGNORE INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1) VALUES (?, ?, ?, ?)');
  inserirCliente.run(9501, 'CLINICA DERMATO CENTRAL', 'J', 1);
  inserirCliente.run(9502, 'SECRETARIA DE SAUDE (ORGAO PUBLICO)', 'J', 11);
  inserirCliente.run(9503, 'BENENUTRI FILIAL (RAMO 20)', 'J', 20);
  inserirCliente.run(9504, 'CLINICA ESTETICA NORTE', 'J', 1);

  db.prepare('INSERT OR IGNORE INTO PCNFSAID (NUMTRANSVENDA, CONDVENDA) VALUES (980090, 8)').run();
  const inserirMovimento = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, CUSTOFIN, NUMTRANSVENDA, DTCANCEL)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`);
  for (const m of MOVIMENTOS) inserirMovimento.run(...m);

  // R-128: custo padrão do Gestão de Custos (o 5803 não tem: "Sem custo") e caixa do 5801 lá.
  const inserirCustoPadrao = db.prepare('INSERT OR IGNORE INTO CUSTOPRODUTO (ID, CODPROD, CUSTO, DATA_REF) VALUES (?, ?, ?, ?)');
  [[1401, 5801, 50.0], [1402, 5802, 40.0], [1404, 5804, 720.0], [1405, 5805, 110.0]]
    .forEach(([id, codprod, custo]) => inserirCustoPadrao.run(id, codprod, custo, '2026-10-01'));
  db.prepare('INSERT OR IGNORE INTO CUSTO_PRODUTOS (CODPROD, UNIDADES_POR_CAIXA) VALUES (5801, 12), (5802, 12)').run();

  // Duas negociações para a tela no modo SQLite: setembro fechada e outubro
  // aberta, com proposta, pedidos por filial e uma meta de sell-out lançada.
  // O smoke cria as suas próprias, em 2026-07 (R-045).
  const agora = '2026-10-01T09:00:00';
  const inserirNegociacao = db.prepare(`INSERT INTO SGC_GALD_NEGOCIACAO
    (COMPETENCIA, DATA_PEDIDO, DESCRICAO, FILIAIS, COBERTURA_ALVO_DIAS, TRANSITO_COMO_COMPRA, META_SELLOUT_VALOR,
     OBSERVACAO, STATUS, ID_PAI, CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, 35, 0, ?, '', ?, 0, ?, ?, ?, ?)`);
  const setembro = Number(inserirNegociacao.run('2026-09', '2026-09-02', 'Pedido Galderma 2026-09', '1,2', 60000,
    'fechada', U.ana, agora, U.ana, agora).lastInsertRowid);
  const outubro = Number(inserirNegociacao.run('2026-10', '2026-10-01', 'Pedido Galderma 2026-10', '1,2', 65000,
    'aberta', U.ana, agora, U.ana, agora).lastInsertRowid);

  const inserirItem = db.prepare(`INSERT INTO SGC_GALD_ITEM
    (ID_NEGOCIACAO, CODPROD, EAN, DESCRICAO, PRECO_SELLOUT, PRECO_NET, PRECO_LISTA, PRECO_LISTA_DESC,
     ESTOQUE_INICIAL, MEDIA_SELLOUT, PREVISAO_SELLOUT, PROPOSTA_SELLIN, META_SELLIN_VALOR, OBSERVACAO, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, '', ?, ?)`);
  const inserirPedido = db.prepare(`INSERT INTO SGC_GALD_ITEM_FILIAL (ID_ITEM, CODFILIAL, QTD_PEDIDA, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?)`);
  // ID_NEGOCIACAO, CODPROD, sell-out, net, com desconto, estoque inicial, média, previsão, proposta, pedidos [filial, qt].
  const ITENS = [
    [setembro, 5801, 95, 45, 48, 200, 210, 220, 240, [['1', 192], ['2', 48]]],
    [setembro, 5802, 80, 36, 38, 120, 80, 90, 96, [['1', 72], ['2', 24]]],
    [setembro, 5804, 1100, 690, 700, 360, 240, 260, 240, [['1', 120], ['2', 120]]],
    [outubro, 5801, 95, 45, 48, 210, 220, 230, 264, [['1', 144], ['2', 36]]],
    [outubro, 5802, 80, 36, 38, 96, 90, 96, 120, [['1', 60]]],
    [outubro, 5803, 1500, 820, 850, 30, 8, 10, 12, []],
    [outubro, 5804, 1100, 690, 700, 360, 240, 250, 360, [['2', 120]]],
  ];
  const descricao = new Map(PRODUTOS.map(([codprod, nome, , , , , ean]) => [codprod, { nome, ean }]));
  for (const [negociacao, codprod, sellout, net, desc, estoque, media, previsao, proposta, pedidos] of ITENS) {
    const { nome, ean } = descricao.get(codprod);
    const item = Number(inserirItem.run(negociacao, codprod, ean, nome, sellout, net, desc, estoque, media, previsao,
      proposta, agora, agora).lastInsertRowid);
    for (const [filial, qt] of pedidos) inserirPedido.run(item, filial, qt, U.ana, agora);
  }

  db.prepare(`INSERT INTO SGC_GALD_SELLOUT (CODPROD, COMPETENCIA, PREVISAO_SELLOUT, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (5801, '2026-09', 180, ?, ?)`).run(U.gil, '2026-09-10T14:00:00');
  db.prepare(`INSERT INTO SGC_GALD_SELLOUT_LOG (CODPROD, COMPETENCIA, ANTES, DEPOIS, ORIGEM_ANTERIOR, POR, EM)
    VALUES (5801, '2026-09', '220', '180', 'mesa', ?, ?)`).run(U.gil, '2026-09-10T14:00:00');
}
