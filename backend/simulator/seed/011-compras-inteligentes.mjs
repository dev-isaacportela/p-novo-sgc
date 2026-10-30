// Seção Simulador da spec 011 (compras inteligentes). Ver
// docs/specs/011-compras-inteligentes/plan.md §Simulador.
//
// Só INSERT: nenhuma tabela nasce aqui. Fornecedores (1015, 1042 ativos, 1088
// inativo) e filiais (1, 2, 3) são do seed/001-fornecedores.mjs;
// SGC_USUARIO_PERSONA é do seed/002-quadro.mjs (R-017); PCDEPTO e PCSECAO são
// do seed/003-itens.mjs. Faixas próprias (R-097), para não mexer em nenhuma
// listagem das outras specs (R-045): produtos 5401-5420 do fornecedor **1042**
// (não do 1015 — smoke/003-itens.mjs assere 18 linhas para o 1015), clientes
// 9301-9305, NUMTRANSITEM >= 960001, PCPEDIDO.NUMPED >= 970001 e os cards de
// CARDS_011.
//
// As datas são RELATIVAS a hoje: a janela da tela são 153 dias terminados hoje,
// e o peso por recência depende da distância até o fim da janela.

/** Data de hoje − `dias`, em AAAA-MM-DD (UTC, como o `datetime('now')` do dialeto). */
function haDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

/** A janela da tela: 153 dias terminados hoje (R-082). */
export const JANELA = {
  dataInicio: haDias(152),
  dataFim: haDias(0),
  diasPeriodo: 153,
};

/** A janela curta de C-008: ontem e hoje, para os pesos 0,85 e 1 aparecerem sozinhos. */
export const JANELA_CURTA = {
  dataInicio: haDias(1),
  dataFim: haDias(0),
  diasPeriodo: 2,
};

export const FORNECEDOR_011 = 1042;
export const FILIAL_011 = '1';
export const FILIAL_ENVIADO_011 = '2';

/** A venda atípica de 60 unidades do 5408 — a chave de SGC_VENDA_DESCONSIDERADA (C-013). */
export const VENDA_ATIPICA = 960005;

// CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, QTUNITCX, OBS2.
// Nenhuma descrição com a palavra "CREME": é o termo da busca do C-009 da 003.
const PRODUTOS = [
  [5401, 'ISOTONICO LIMAO 500 ML', 'CX 12', 'UN', 2, 21, 12, null],
  [5402, 'BARRA DE PROTEINA CACAU 45 G', 'CAIXA COM 24', 'UN', 2, 21, 24, null],
  [5403, 'SHAKE SUBSTITUTO BAUNILHA 400 G', 'CX 12', 'UN', 2, 21, 12, null],
  [5404, 'GEL DE CARBOIDRATO 30 G', 'CX 12', 'UN', 2, 21, 12, null],
  [5405, 'WHEY CONCENTRADO MORANGO 900 G', 'CX 12', 'UN', 3, 31, 12, null],
  [5406, 'WHEY CONCENTRADO CHOCOLATE 900 G', 'CX 12', 'UN', 3, 31, 12, null],
  [5407, 'WHEY CONCENTRADO NATURAL 900 G', 'CX 12', 'UN', 3, 31, 12, null],
  [5408, 'ALBUMINA EM PO 500 G', 'CAIXA COM 24', 'UN', 3, 31, 24, null],
  [5409, 'GLUTAMINA EM PO 300 G', 'CX 12', 'UN', 3, 31, 12, null],
  [5410, 'COLAGENO HIDROLISADO 300 G', 'CX 12', 'UN', 2, 21, 12, null],
  [5411, 'MULTIVITAMINICO 60 CAPSULAS', 'CX 12', 'UN', 2, 21, 12, null],
  [5412, 'OLEO DE PEIXE 120 CAPSULAS', 'CX 12', 'UN', 2, 21, 12, null],
  [5413, 'MAGNESIO QUELATO 60 CAPSULAS', 'CX 12', 'UN', 2, 21, 12, null],
  [5414, 'ZINCO QUELATO 60 CAPSULAS', 'FRASCO 100 ML', 'UN', 2, 21, 1, null],
  [5415, 'PROBIOTICO 30 SACHES', 'CX 12', 'UN', 3, 31, 12, null],
  [5416, 'FIBRA SOLUVEL 260 G', 'CX 12', 'UN', 3, 31, 12, null],
  [5417, 'TERMOGENICO 60 CAPSULAS', 'CAIXA COM 24', 'UN', 2, 21, 24, null],
  [5418, 'HIDRATANTE CORPORAL 200 ML', 'FRASCO 100 ML', 'UN', 2, 21, 1, null],
  // Os dois que provam o recorte de RN-014 e fazem C-001 esperar 18 dos 20.
  [5419, 'BEBIDA LACTEA DESCONTINUADA 200 ML', 'CX 12', 'UN', 2, 21, 12, 'INATIVO'],
  [5420, 'COPO DESCARTAVEL 200 ML', 'CX 12', 'UN', 4, 41, 12, null],
];

// CODPROD, CODFILIAL, QTEST, QTBLOQUEADA, QTINDENIZ, QTRESERV, QTPEDIDA, CUSTOULTENT.
// 5401 e 5402 são os casos de RN-002 (estoque líquido e o piso em zero); 5404
// tem QTPEDIDA 3 e PCESTTRANSITO 7 (trânsito 10); 5415 tem estoque sem venda
// nenhuma (C-025); o 5403 aparece nas filiais 2 e 3 para o C-021.
const ESTOQUE = [
  [5401, '1', 100, 10, 5, 5, 0, 12.0],
  [5402, '1', 5, 0, 0, 20, 0, 12.0],
  [5403, '1', 50, 0, 0, 0, 0, 10.0],
  [5404, '1', 30, 0, 0, 0, 3, 10.0],
  [5405, '1', 60, 0, 0, 0, 0, 8.0],
  [5406, '1', 60, 0, 0, 0, 0, 8.0],
  [5407, '1', 60, 0, 0, 0, 0, 8.0],
  [5408, '1', 120, 0, 0, 0, 0, 9.0],
  [5409, '1', 40, 0, 0, 0, 0, 7.0],
  [5410, '1', 80, 0, 0, 0, 0, 10.0],
  [5411, '1', 60, 0, 0, 0, 0, 10.0],
  [5412, '1', 45, 0, 0, 0, 0, 10.0],
  [5413, '1', 30, 0, 0, 0, 0, 10.0],
  [5414, '1', 20, 0, 0, 0, 0, 10.0],
  [5415, '1', 40, 0, 0, 0, 0, 15.0],
  [5416, '1', 25, 0, 0, 0, 0, 11.0],
  [5417, '1', 25, 0, 0, 0, 0, 11.0],
  [5418, '1', 25, 0, 0, 0, 0, 11.0],
  [5419, '1', 10, 0, 0, 0, 0, 11.0],
  [5420, '1', 10, 0, 0, 0, 0, 11.0],
  [5403, '2', 120, 0, 0, 0, 0, 10.0],
  [5403, '3', 35, 5, 0, 0, 0, 10.0],
];

// NUMTRANSITEM, CODPROD, CODCLI, QT, dias atrás. Todas CODOPER 'S' na filial 1.
// As três primeiras linhas montam a janela de 2 dias do C-008: 5405 vende 10
// ontem e 10 hoje (consumo 10,0000), 5406 vende 20 ontem (9,1892) e 5407 vende
// 20 hoje (10,8108) — os pesos 0,85 e 1 só batem se DIAS_ATE_FIM estiver certo.
const VENDAS = [
  [960001, 5405, 9301, 10, 1],
  [960002, 5405, 9301, 10, 0],
  [960003, 5406, 9301, 20, 1],
  [960004, 5407, 9301, 20, 0],
  // C-013: 60 num dia para um cliente que não volta, mais 30 espalhados (90).
  [VENDA_ATIPICA, 5408, 9303, 60, 10],
  [960006, 5408, 9301, 10, 20],
  [960007, 5408, 9301, 10, 30],
  [960008, 5408, 9302, 10, 40],
  // RN-011: 12 privadas e 6 de cliente público (9304, CODATV1 12) = 18 com 6 públicas.
  [960009, 5409, 9301, 12, 15],
  [960010, 5409, 9304, 6, 16],
  // C-015: valores de venda × custo 500 / 250 / 150 / 70 / 30.
  [960011, 5410, 9301, 50, 5],
  // RN-014: devolução dentro da janela — quantidade negativa fica FORA de
  // VENDA_PERIODO. Sem ela o `QT > 0` da consulta nunca seria exercido e uma
  // devolução passaria a descontar demanda do produto no topo da curva.
  [960012, 5410, 9301, -5, 6],
  [960013, 5411, 9301, 25, 5],
  [960014, 5412, 9301, 15, 5],
  [960015, 5413, 9301, 7, 5],
  [960016, 5414, 9302, 3, 5],
  // Giro dos demais, fora da janela curta de C-008.
  [960017, 5401, 9301, 24, 7],
  [960018, 5402, 9301, 18, 7],
  [960019, 5403, 9301, 30, 7],
  [960020, 5404, 9301, 12, 7],
  [960021, 5416, 9301, 9, 7],
  [960022, 5417, 9301, 9, 7],
  [960023, 5418, 9305, 6, 7],
  // Os dois do recorte: nunca aparecem, nem com venda.
  [960024, 5419, 9301, 5, 7],
  [960025, 5420, 9301, 5, 7],
];

// NUMPED, dias atrás da emissão, dias atrás da PREVISÃO de entrega — todos do
// 1042 na filial 1, PRAZO1 = 0 para não entrarem no sgcWintPrazoPagamento da
// 003. R-123: o 970001 previa a entrada 2 dias antes de ela acontecer (entrada
// atrasada, em atenção na Análise do Produto); o 970002 previa depois.
const PEDIDOS_ERP = [[970001, 30, 28], [970002, 20, 12], [970003, 10, 9]];

// CODUSUR, NOME — os vendedores das vendas (R-123: coluna da aba Vendas).
const VENDEDORES = [[1, 'Carla Vendas'], [2, 'Diego Vendas']];

// NUMTRANSITEM, CODPROD, NUMPED, dias atrás da entrada, QT, PUNIT.
// 5403: entrada 4 dias depois de uma emissão e 6 depois de outra -> lead 5
// (C-009). 5416: entrada no MESMO dia da emissão -> lead 1, o mínimo de RN-003.
// Nenhum outro produto tem entrada casada -> LEAD_TIME_MEDIDO 0 e fallback 9.
const ENTRADAS = [
  [960101, 5403, 970001, 26, 100, 10.0],
  [960102, 5403, 970002, 14, 100, 10.0],
  [960103, 5416, 970003, 10, 50, 12.0],
];

// CODCLI, CLIENTE, CODATV1 — 9304 e 9305 são de órgão público (12 e 20).
const CLIENTES = [
  [9301, 'Farmacia Central Ltda', 1],
  [9302, 'Distribuidora Vida Ltda', 1],
  [9303, 'Evento Corrida da Cidade Ltda', 1],
  [9304, 'Hospital Regional do Norte', 12],
  [9305, 'Secretaria Municipal de Esportes', 20],
];

/** Ids dos cards desta spec, para o smoke não depender da ordem de inserção. */
export const CARDS_011 = {};

/** Card do quadro + capa do pedido. Devolve o ID_CARD. */
function pedido(db, cenario, { titulo, fase, codfilial, filial, origem, criadoPor }) {
  const agora = `${JANELA.dataFim}T08:00:00`;
  db.prepare(`INSERT INTO KB_CARD (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON,
      TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, 1, NULL, '', '{}', ?, ?, ?, ?, ?)`)
    .run(cenario.boardCompras, cenario.fases[fase], titulo, titulo.toLowerCase(),
      criadoPor, agora, agora, agora);
  const idCard = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
  db.prepare(`INSERT INTO SGC_PEDIDO (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL,
      PERIODO_INICIO, PERIODO_FIM, VL_TOTAL, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, 'Nestle Brasil Ltda', ?, ?, ?, ?, 0, ?, 0, ?, ?, ?)`)
    .run(idCard, FORNECEDOR_011, codfilial, filial, JANELA.dataInicio, JANELA.dataFim,
      origem, criadoPor, agora, agora);
  return idCard;
}

export function seed011(db, cenario) {
  /* ── WinThor: catálogo, estoque, trânsito, clientes, movimento, pedido ── */

  // CODFAB = 'FAB-<codprod>': o código de fábrica que o carrinho do layout
  // legado mostra ao lado do produto (R-117).
  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL, CODFAB)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 240, ?)`);
  for (const p of PRODUTOS) inserirProduto.run(p[0], p[1], p[2], p[3], FORNECEDOR_011, p[4], p[5], p[6], p[7], `FAB-${p[0]}`);

  // CUSTOFIN é o custo ATUAL do ERP (R-117 / RN-027): o 5401 caiu de 12 para
  // 11 e o 5403 subiu de 10 para 10,50; os demais não mudaram desde a última
  // entrada. É o que prova a variação e a economia do carrinho.
  const CUSTO_ATUAL = { 5401: 11.0, 5403: 10.5 };
  const inserirEstoque = db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTBLOQUEADA, QTINDENIZ, QTRESERV, QTPEDIDA, QTVENDMES, QTVENDMES1,
     QTVENDMES2, CUSTOULTENT, CUSTOFIN, DTULTENT, DTULTSAIDA)
    VALUES (?, ?, ?, ?, ?, ?, ?, 12, 10, 8, ?, ?, ?, ?)`);
  for (const e of ESTOQUE) {
    inserirEstoque.run(e[0], e[1], e[2], e[3], e[4], e[5], e[6], e[7], CUSTO_ATUAL[e[0]] ?? e[7], haDias(14), haDias(5));
  }

  db.prepare("INSERT INTO PCESTTRANSITO (CODPROD, CODFILIAL, QTTRANSITO, DTPREVISTA) VALUES (5404, '1', 7, ?)")
    .run(haDias(-8));

  const inserirCliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1) VALUES (?, ?, ?, ?)');
  for (const c of CLIENTES) inserirCliente.run(c[0], c[1], 'J', c[2]);

  // Preço 20 e custo financeiro 12 em toda venda: faturamento = 20 × qt e
  // rentabilidade = 8 × qt (C-040); a ordem das duas curvas é a mesma aqui, e
  // o "pior das duas" é provado puro em tests/ressuprimento.test.mjs.
  // Vendedor (R-123): NUMTRANSITEM ímpar -> 1 (Carla), par -> 2 (Diego).
  const inserirVenda = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, CUSTOFIN, CODUSUR, NUMPED)
    VALUES (?, ?, ?, ?, 'S', ?, ?, 20.0, 12.0, ?, NULL)`);
  for (const [transitem, codprod, codcli, qt, dias] of VENDAS) {
    inserirVenda.run(transitem, codprod, FILIAL_011, codcli, haDias(dias), qt, transitem % 2 === 1 ? 1 : 2);
  }

  const inserirPedidoErp = db.prepare(`INSERT INTO PCPEDIDO
    (NUMPED, CODFORNEC, CODFILIAL, DTEMISSAO, DTPREVENT, VLTOTAL, PRAZO1, PRAZO2, PRAZO3)
    VALUES (?, ?, ?, ?, ?, 5000.0, 0, 0, 0)`);
  for (const [numped, dias, diasPrevisao] of PEDIDOS_ERP) {
    inserirPedidoErp.run(numped, FORNECEDOR_011, FILIAL_011, haDias(dias), haDias(diasPrevisao));
  }

  const inserirVendedor = db.prepare('INSERT OR IGNORE INTO PCUSUARI (CODUSUR, NOME) VALUES (?, ?)');
  for (const [codusur, nome] of VENDEDORES) inserirVendedor.run(codusur, nome);

  // R-125 (C-046): políticas de preço especial do Gestão de Custos. A 1 vale
  // para a Farmacia Central (9301) no 5401 (custo 8, contra 12 da última
  // entrada e 11 do custo atual) e no 5403 (9); a 2 está INATIVA; a 3 venceu
  // ontem; a 4 é aberta (sem cliente) para o 5405.
  const inserirPolitica = db.prepare(`INSERT OR IGNORE INTO COST_POLICIES
    (ID, NAME, STATUS, DT_START, DT_END, CLIENTE_ID, FILIAL_ID) VALUES (?, ?, ?, ?, ?, ?, NULL)`);
  inserirPolitica.run(1, 'Tabela especial Farmacia Central', 'ACTIVE', haDias(30), haDias(-60), 9301);
  inserirPolitica.run(2, 'Tabela inativa', 'INACTIVE', haDias(30), haDias(-60), 9301);
  inserirPolitica.run(3, 'Tabela vencida', 'ACTIVE', haDias(60), haDias(1), 9301);
  inserirPolitica.run(4, 'Tabela aberta', 'ACTIVE', '', '', null);
  const inserirItemPolitica = db.prepare('INSERT OR IGNORE INTO POLICY_ITEMS (ID, POLICY_ID, PRODUCT_ID, SPECIAL_COST, VARIATION_PERCENT) VALUES (?, ?, ?, ?, 0)');
  inserirItemPolitica.run(1, 1, 5401, 8.0);
  inserirItemPolitica.run(2, 1, 5403, 9.0);
  inserirItemPolitica.run(3, 2, 5402, 5.0);
  inserirItemPolitica.run(4, 3, 5404, 5.0);
  inserirItemPolitica.run(5, 4, 5405, 7.0);
  db.prepare('INSERT OR IGNORE INTO COST_POLICY_CLIENTS (ID, POLICY_ID, CLIENTE_ID) VALUES (1, 1, 9301)').run();

  // R-128: custo padrão do Gestão de Custos para a faixa da 011 — o 5401 tem dois (vale 11,00, o de
  // 2026); o 5402 não tem ("Sem custo"); os demais, 10,00.
  const inserirCustoPadrao = db.prepare('INSERT OR IGNORE INTO CUSTOPRODUTO (ID, CODPROD, CUSTO, DATA_REF) VALUES (?, ?, ?, ?)');
  inserirCustoPadrao.run(101, 5401, 12.0, '2025-01-01');
  inserirCustoPadrao.run(102, 5401, 11.0, '2026-01-01');
  let idCusto = 103;
  for (let codprod = 5403; codprod <= 5420; codprod += 1) inserirCustoPadrao.run(idCusto++, codprod, 10.0, '2026-01-01');

  // R-130: os lotes bloqueados do 5401 na filial 1 (os 10 un. de QTBLOQUEADA do PCEST).
  // L5401A (6 bloq., 2 reserv.): motivo pelo PCMOVBLOQUEIO (31 avaria no transporte),
  // lançado pela matrícula 77. L5401B (4 bloq., 3 reserv.): sem histórico de motivo, só a
  // observação do lote; quem bloqueou vem do PCLOTELOG — o evento que BLOQUEOU (0 → 6,
  // matrícula 88), não o desbloqueio parcial depois (6 → 4, matrícula 99). L5401C sem
  // bloqueio não aparece.
  db.prepare("INSERT OR IGNORE INTO PCTABDEV (CODDEVOL, MOTIVO, TIPO) VALUES (31, 'AVARIA NO TRANSPORTE', 'A')").run();
  const inserirFuncionario = db.prepare('INSERT OR IGNORE INTO PCEMPR (MATRICULA, NOME) VALUES (?, ?)');
  inserirFuncionario.run(77, 'MARIA SOUZA');
  inserirFuncionario.run(88, 'JOAO PEREIRA');
  inserirFuncionario.run(99, 'CARLOS LIMA');
  const inserirLoteBloqueado = db.prepare(`INSERT INTO PCLOTE
    (CODPROD, CODFILIAL, NUMLOTE, DTVALIDADE, QT, QTBLOQUEADA, QTRESERV, QTINDENIZ, OBSBLOQUEIO, DTBLOQUEIO1, CODFUNCRM)
    VALUES (5401, '1', ?, ?, ?, ?, ?, 0, ?, ?, ?)`);
  inserirLoteBloqueado.run('L5401A', '2027-03-31', 60, 6, 2, null, haDias(20), 77);
  inserirLoteBloqueado.run('L5401B', '2027-06-30', 40, 4, 3, 'AGUARDANDO LAUDO DE QUALIDADE', haDias(12), null);
  inserirLoteBloqueado.run('L5401C', '2027-09-30', 30, 0, 0, null, null, null);
  db.prepare(`INSERT INTO PCMOVBLOQUEIO (CODFILIAL, CODPROD, NUMLOTE, MOTIVO, CODOPER, CODFUNCLANC, ROTINALANC, DTMOV)
    VALUES ('1', 5401, 'L5401A', 31, 'BL', 77, '1101', ?)`).run(haDias(20));
  const inserirLogLote = db.prepare(`INSERT INTO PCLOTELOG
    (CODFILIAL, CODPROD, NUMLOTE, DATA, PROGRAMA, USUARIO, OBSAPLICACAO, QTBLOQUEADA_ANT, QTBLOQUEADA)
    VALUES ('1', 5401, 'L5401B', ?, 'PCSIS1106', ?, ?, ?, ?)`);
  inserirLogLote.run(haDias(12), 'JPEREIRA', '6366:88', 0, 6);
  inserirLogLote.run(haDias(5), 'CLIMA', '6366:99', 6, 4);

  const inserirEntrada = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMPED, NUMTRANSENT, NUMNOTA)
    VALUES (?, ?, ?, NULL, 'E', ?, ?, ?, ?, NULL, NULL)`);
  for (const [transitem, codprod, numped, dias, qt, punit] of ENTRADAS) {
    inserirEntrada.run(transitem, codprod, FILIAL_011, haDias(dias), qt, punit, numped);
  }

  /* ── SGC: parâmetros de compra (a leitura e o upsert; a precedência é pura) ── */

  const inserirParametro = db.prepare(`INSERT INTO SGC_PARAMETRO_COMPRA
    (CODFORNEC, CODFILIAL, CODPROD, COBERTURA_DIAS, LEAD_TIME_DIAS, GATILHO_DIAS,
     SILENCIADO_ATE, MOTIVO_SILENCIO, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, 0, 0, '', '', ?, ?)`);
  inserirParametro.run(FORNECEDOR_011, FILIAL_011, 0, 0, cenario.usuarios.gil, `${JANELA.dataFim}T08:00:00`);
  inserirParametro.run(FORNECEDOR_011, FILIAL_011, 5417, 45, cenario.usuarios.gil, `${JANELA.dataFim}T08:00:00`);

  /* ── SGC: os dois cards próprios (R-073/R-045) ── */

  // C-022: 5 itens com sugerida 100 e pedidas 100, 80, 120, 79 e 121 -> 60 %.
  // O criador é o GESTOR, e o carrinho do C-018 nasce pela ANALISTA: assim a
  // eficiência recortada por comprador continua vendo só estes 5 itens.
  CARDS_011.eficiencia = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · NESTLE (COMPRAS INTELIGENTES)',
    fase: 'analise',
    codfilial: FILIAL_011,
    filial: 'Benenutri Matriz',
    origem: 'compras_inteligentes',
    criadoPor: cenario.usuarios.gil,
  });
  const inserirItem = db.prepare(`INSERT INTO SGC_PEDIDO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA,
     QT_VENDA_TOTAL, QT_VENDA_LICITACAO, QT_ESTOQUE, QT_TRANSITO, QT_SUGERIDA, QT_PEDIDA,
     PRECO_CUSTO, TIPO_PRECO, CURVA_ABC, COBERTURA_DIAS, COBERTURA_LIMITE,
     COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, 'CX 12', 'UN', 2, 21, 12, 0, 0, 0, 0, 100, ?, 10.0, 'padrao', 'A', 20, 35,
            '', '', 'montagem', ?, ?, ?)`);
  const agora = `${JANELA.dataFim}T08:00:00`;
  [[5401, 100], [5402, 80], [5403, 120], [5404, 79], [5405, 121]].forEach(([codprod, pedida]) => {
    const descricao = PRODUTOS.find((p) => p[0] === codprod)[1];
    inserirItem.run(CARDS_011.eficiencia, codprod, descricao, pedida, agora, cenario.usuarios.gil, agora);
  });

  // C-019: pedido do MESMO fornecedor na filial 2, já enviado à indústria — não
  // bloqueia o carrinho. Sem item: a eficiência não o vê (origem manual).
  CARDS_011.enviado = pedido(db, cenario, {
    titulo: 'BENENUTRI FILIAL NORTE · NESTLE (ENVIADO)',
    fase: 'enviado',
    codfilial: FILIAL_ENVIADO_011,
    filial: 'Benenutri Filial Norte',
    origem: 'manual',
    criadoPor: cenario.usuarios.ana,
  });
}

export { haDias };
