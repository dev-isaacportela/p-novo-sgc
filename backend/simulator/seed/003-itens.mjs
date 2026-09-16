// Seção Simulador do plan da 003 (itens do pedido): 20 produtos do fornecedor
// 1015 (1 inativo, 1 do departamento 4) e 4 do 1042, vendas/estoque/trânsito
// desenhados para as sugestões de compra e a curva ABC da spec, lotes a
// vencer, excesso de estoque em outra filial, clientes públicos (licitação),
// PCPEDIDO para o prazo de pagamento sugerido, CUSTO_PRODUTOS, limites em
// SGC_COBERTURA e os cards de teste. Ver docs/specs/003-itens-do-pedido/plan.md
// §Simulador.
//
// Só INSERT: nenhuma tabela nasce aqui (o DDL das PC* é do integrador, em
// backend/simulator/schema-winthor.mjs). E nenhum fornecedor, filial ou
// persona: PCFORNEC/PCFILIAL/SGC_FORNECEDOR são do seed/001-fornecedores.mjs e
// SGC_USUARIO_PERSONA é do seed/002-quadro.mjs (R-017).

const PERIODO = { inicio: '2026-08-01', fim: '2026-09-14' }; // 45 dias = 1,5 mês
const FILIAL_PEDIDO = '1';

/** Data de hoje + `dias`, em AAAA-MM-DD — a validade do lote é relativa ao dia do teste. */
function emDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2
const PRODUTOS = [
  [5001, 'CREME NUTRICIONAL MORANGO 200 ML', 'CX 12', 'UN', 1015, 2, 21, 12, null],
  [5002, 'SUPLEMENTO PROTEICO BAUNILHA 400 G', 'CAIXA COM 24', 'UN', 1015, 2, 21, 24, null],
  [5003, 'ESPESSANTE ALIMENTAR 125 G', 'CX 12', 'UN', 1015, 2, 21, 12, null],
  [5004, 'DIETA ENTERAL PADRAO 1 L', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5005, 'MODULO DE PROTEINA 300 G', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5006, "CREME D'AGUA HIDRATANTE 200 ML", 'FRASCO 100 ML', 'UN', 1015, 2, 21, 1, null],
  [5007, 'FORMULA INFANTIL 800 G', 'CAIXA COM 24', 'UN', 1015, 3, 31, 24, null],
  [5008, 'ESPESSANTE INSTANTANEO 200 G', 'CX 12', 'UN', 1015, 2, 21, 12, null],
  [5009, 'SUPLEMENTO HIPERCALORICO 200 ML', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5010, 'DIETA ENTERAL FIBRAS 1 L', 'FRASCO 100 ML', 'UN', 1015, 3, 31, 1, null],
  [5011, 'MODULO DE FIBRAS 250 G', 'CX 12', 'UN', 1015, 2, 21, 12, null],
  [5012, 'SUPLEMENTO RENAL 200 ML', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5013, 'SUPLEMENTO DIABETES 200 ML', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5014, 'AGUA DE COCO EM PO 300 G', 'CAIXA COM 24', 'UN', 1015, 2, 21, 24, null],
  [5015, 'MALTODEXTRINA 1 KG', 'CX 12', 'UN', 1015, 2, 21, 12, null],
  [5016, 'VITAMINA D GOTAS 20 ML', 'FRASCO 100 ML', 'UN', 1015, 2, 21, 1, null],
  [5017, 'SUPLEMENTO IMUNONUTRICAO 200 ML', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5018, 'DIETA PEDIATRICA 200 ML', 'CX 12', 'UN', 1015, 3, 31, 12, null],
  [5019, 'CREME INATIVO 100 ML', 'CX 12', 'UN', 1015, 2, 21, 12, 'INATIVO'],
  [5020, 'CREME DESCARTAVEL 50 ML', 'CX 12', 'UN', 1015, 4, 41, 12, null],
  [5101, 'COMPOSTO LACTEO 400 G', 'CAIXA COM 24', 'UN', 1042, 3, 31, 24, null],
  [5102, 'CEREAL INFANTIL 230 G', 'CX 12', 'UN', 1042, 3, 31, 12, null],
  [5103, 'LEITE EM PO INTEGRAL 400 G', 'CAIXA COM 24', 'UN', 1042, 3, 31, 24, null],
  [5104, 'ACHOCOLATADO EM PO 400 G', 'CX 12', 'UN', 1042, 3, 31, 12, null],
];

// CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, CUSTOULTENT
// Filial 1 é a do pedido; 2 e 3 servem ao alerta de excesso (RN-010).
const ESTOQUE = [
  // filial do pedido — é daqui que saem ESTOQUE e CUSTO_ULT_ENTRADA da análise
  [5001, '1', 5, 12, 6, 6, 10.0],
  [5002, '1', 0, 4, 4, 4, 10.0],
  [5003, '1', 30, 12, 6, 6, 10.0],
  [5004, '1', 10, 30, 30, 30, 10.0],
  [5005, '1', 300, 90, 90, 90, 10.0], // 100 dias, mas NA filial do pedido: não alerta (RN-010)
  [5006, '1', 20, 4, 4, 4, 25.5],
  [5007, '1', 20, 4, 4, 4, 32.0],
  [5008, '1', 20, 4, 4, 4, 18.0],
  [5009, '1', 20, 4, 4, 4, 12.0],
  [5010, '1', 15, 3, 3, 3, 40.0],
  [5011, '1', 15, 3, 3, 3, 22.0],
  [5012, '1', 15, 3, 3, 3, 28.0],
  [5013, '1', 15, 3, 3, 3, 28.0],
  [5014, '1', 15, 3, 3, 3, 14.0],
  [5015, '1', 15, 3, 3, 3, 9.0],
  [5016, '1', 15, 3, 3, 3, 7.5],
  [5017, '1', 15, 3, 3, 3, 35.0],
  [5018, '1', 15, 3, 3, 3, 26.0],
  [5019, '1', 15, 3, 3, 3, 11.0],
  [5020, '1', 15, 3, 3, 3, 11.0],
  [5101, '1', 10, 5, 5, 5, 19.0],
  [5102, '1', 10, 5, 5, 5, 8.0],
  [5103, '1', 10, 5, 5, 5, 21.0],
  [5104, '1', 10, 5, 5, 5, 13.0],
  // outras filiais — excesso (RN-010): 100 dias alerta, 81 alerta, 79 não
  [5001, '2', 300, 90, 90, 90, 10.0],
  [5003, '3', 81, 30, 30, 30, 10.0],
  [5002, '3', 79, 30, 30, 30, 10.0],
];

// CODPROD, CODFILIAL, NUMLOTE, dias até vencer, QT
const LOTES = [
  [5001, '2', 'L2026A', 60, 30],  // C-011: alerta de vencimento
  [5001, '2', 'L2026B', 120, 10], // controle: fora dos 90 dias
  [5002, '2', 'L2026C', 90, 5],   // RN-009: exatamente 90 alerta
  [5003, '2', 'L2026D', 91, 5],   // RN-009: 91 não alerta
];

// CODPROD, CODCLI, QT — todas em 2026-08-15, CODOPER 'S', filial 1.
// 9001 é privado (CODATV1 1); 9002 e 9003 são órgão público (12 e 20).
const VENDAS = [
  [5001, 9001, 12], [5001, 9002, 6],
  [5002, 9001, 6],
  [5003, 9001, 18],
  [5004, 9001, 45],
  [5005, 9001, 50], [5006, 9001, 25], [5007, 9001, 15], [5008, 9001, 7], [5009, 9001, 3],
  [5010, 9001, 4], [5011, 9001, 4], [5012, 9001, 4], [5013, 9001, 4], [5014, 9001, 4],
  [5015, 9001, 4], [5016, 9001, 4], [5017, 9001, 4], [5018, 9001, 4],
  [5019, 9001, 9], [5020, 9001, 9],
  [5101, 9001, 8], [5102, 9001, 8], [5103, 9001, 8], [5104, 9001, 8],
];

/** Itens de um card: [codprod, qtPedida, precoCusto, extras]. */
function item(db, idCard, codprod, qtPedida, precoCusto, extras = {}) {
  const produto = PRODUTOS.find((p) => p[0] === codprod) || [];
  db.prepare(`INSERT INTO SGC_PEDIDO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODEPTO, CODSEC, UN_POR_CAIXA,
     QT_VENDA_TOTAL, QT_VENDA_LICITACAO, QT_ESTOQUE, QT_TRANSITO, QT_SUGERIDA, QT_PEDIDA,
     PRECO_CUSTO, TIPO_PRECO, CURVA_ABC, COBERTURA_DIAS, COBERTURA_LIMITE,
     COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?)`)
    .run(idCard, codprod, produto[1] || `PRODUTO ${codprod}`, produto[2] || '', produto[3] || 'UN',
      produto[5] || 0, produto[6] || 0, produto[7] || 1,
      extras.vendaTotal ?? 0, extras.vendaLicitacao ?? 0, extras.estoque ?? 0, extras.transito ?? 0,
      extras.sugerida ?? 0, qtPedida, precoCusto, extras.tipoPreco || 'padrao', extras.curva || 'C',
      extras.coberturaDias ?? 0, extras.coberturaLimite ?? 35, extras.coberturaJustificativa || '',
      extras.status || 'montagem', '2026-09-15T08:00:00', 2, '2026-09-15T08:00:00');
}

/** Card do quadro + capa do pedido. Devolve o ID_CARD. */
function pedido(db, cenario, { titulo, codfornec, fornecedor, prazoPadrao, prazoAcordado, prazoJustificativa, tecMotivo, tecReprovados }) {
  const agora = '2026-09-15T08:00:00';
  db.prepare(`INSERT INTO KB_CARD (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON,
      TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, 1, NULL, '', '{}', ?, ?, ?, ?, ?)`)
    .run(cenario.boardCompras, cenario.fases.analise, titulo, titulo.toLowerCase(),
      cenario.usuarios.ana, agora, agora, agora);
  const idCard = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
  db.prepare(`INSERT INTO SGC_PEDIDO (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL,
      PERIODO_INICIO, PERIODO_FIM, VL_TOTAL, PRAZO_PADRAO, PRAZO_ACORDADO, PRAZO_JUSTIFICATIVA,
      TEC_MOTIVO, TEC_PRODUTOS_REPROVADOS, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, 'Benenutri Matriz', ?, ?, 0, ?, ?, ?, ?, ?, 'manual', 0, ?, ?, ?)`)
    .run(idCard, codfornec, fornecedor, FILIAL_PEDIDO, PERIODO.inicio, PERIODO.fim,
      prazoPadrao || '', prazoAcordado || '', prazoJustificativa || '',
      tecMotivo || '', tecReprovados || '', cenario.usuarios.ana, agora, agora);
  return idCard;
}

/** Ids dos cards de teste, para o smoke não depender da ordem de inserção. */
export const CARDS_003 = {};

export function seed003(db, cenario) {
  /* ── WinThor: catálogo, estoque, movimento, lote, cliente, pedido de compra ── */
  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 180)`);
  for (const p of PRODUTOS) inserirProduto.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]);

  const inserirEstoque = db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, QTPEDIDA, CUSTOULTENT, DTULTENT, DTULTSAIDA)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, '2026-07-20', '2026-09-12')`);
  for (const e of ESTOQUE) inserirEstoque.run(e[0], e[1], e[2], e[3], e[4], e[5], e[6]);

  db.prepare("INSERT INTO PCESTTRANSITO (CODPROD, CODFILIAL, QTTRANSITO, DTPREVISTA) VALUES (5001, '1', 2, '2026-09-25')").run();

  const inserirCliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1) VALUES (?, ?, ?, ?)');
  inserirCliente.run(9001, 'Clinica Privada Ltda', 'J', 1);
  inserirCliente.run(9002, 'Hospital Municipal', 'J', 12);
  inserirCliente.run(9003, 'Secretaria Estadual de Saude', 'J', 20);

  const inserirMov = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMPED)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`);
  let transitem = 1;
  for (const [codprod, codcli, qt] of VENDAS) {
    inserirMov.run(transitem, codprod, FILIAL_PEDIDO, codcli, 'S', '2026-08-15', qt);
    transitem += 1;
  }
  // Provas do recorte de RN-011: entrada e venda fora do período não contam.
  inserirMov.run(transitem, 5001, FILIAL_PEDIDO, 9001, 'E', '2026-08-20', 500);
  inserirMov.run(transitem + 1, 5001, FILIAL_PEDIDO, 9001, 'S', '2026-06-01', 500);

  const inserirLote = db.prepare('INSERT INTO PCLOTE (CODPROD, CODFILIAL, NUMLOTE, DTVALIDADE) VALUES (?, ?, ?, ?)');
  const inserirSaldoLote = db.prepare(`INSERT INTO PCESTENDLOTE
    (CODPROD, NUMLOTE, MODULO, RUA, NUMERO, APTO, TIPOENDER, QT) VALUES (?, ?, 'PA', '01', '01', '01', 'P', ?)`);
  const inserirEnderecoLote = db.prepare(`INSERT INTO PCLOTEEND
    (CODFILIAL, CODPROD, NUMLOTE, MODULO, RUA, NUMERO, APTO, TIPOENDER) VALUES (?, ?, ?, 'PA', '01', '01', '01', 'P')`);
  for (const [codprod, codfilial, numlote, dias, qt] of LOTES) {
    inserirLote.run(codprod, codfilial, numlote, emDias(dias));
    inserirSaldoLote.run(codprod, numlote, qt);
    inserirEnderecoLote.run(codfilial, codprod, numlote);
  }

  const inserirDepto = db.prepare('INSERT INTO PCDEPTO (CODEPTO, DESCRICAO) VALUES (?, ?)');
  inserirDepto.run(2, 'NUTRICAO CLINICA');
  inserirDepto.run(3, 'NUTRICAO ENTERAL');
  inserirDepto.run(4, 'DESCARTAVEIS');
  const inserirSecao = db.prepare('INSERT INTO PCSECAO (CODSEC, DESCRICAO) VALUES (?, ?)');
  inserirSecao.run(21, 'SUPLEMENTOS ORAIS');
  inserirSecao.run(31, 'DIETAS ENTERAIS');
  inserirSecao.run(41, 'DESCARTAVEIS GERAIS');

  // D-004: condição praticada no ERP, base da sugestão de prazo padrão.
  const inserirPedidoErp = db.prepare(`INSERT INTO PCPEDIDO
    (NUMPED, CODFORNEC, CODFILIAL, DTEMISSAO, VLTOTAL, PRAZO1, PRAZO2, PRAZO3) VALUES (?, ?, ?, ?, ?, 28, 35, 42)`);
  inserirPedidoErp.run(80001, 1015, '1', '2026-07-10', 12500.0);
  inserirPedidoErp.run(80002, 1015, '1', '2026-08-12', 9800.0);

  // AN-05 B: unidades por caixa da gestão de custos (5010 sem linha cai na embalagem).
  const inserirCusto = db.prepare('INSERT INTO CUSTO_PRODUTOS (CODPROD, UNIDADES_POR_CAIXA) VALUES (?, ?)');
  inserirCusto.run(5001, 12);
  inserirCusto.run(5002, 24);

  /* ── SGC: coberturas por curva (C-008 da 003; C-001/C-002 da 012) ──
     Valores de referencia de R-089: departamento 2 = A 35/20 %, B 45/10 %,
     C 60/5 % (tetos 42, 49,5 e 63) e sku 5001 = A 20/0, B 25/0, C 30/0.
     A secao 21 NAO e semeada: o C-020 do smoke da 003 cria e apaga uma linha
     de `secao`/`21`, que colidiria na chave unica; ela so existe como fixture
     dos testes puros. */
  const inserirCobertura = db.prepare(`INSERT INTO SGC_COBERTURA
    (NIVEL, CODIGO, DESCRICAO, ALVO_A_DIAS, TOLERANCIA_A_PCT, ALVO_B_DIAS, TOLERANCIA_B_PCT,
     ALVO_C_DIAS, TOLERANCIA_C_PCT, ATIVO, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '2026-09-15T08:00:00', 1, '2026-09-15T08:00:00')`);
  inserirCobertura.run('departamento', '2', 'NUTRICAO CLINICA', 35, 20, 45, 10, 60, 5);
  inserirCobertura.run('sku', '5001', 'CREME NUTRICIONAL MORANGO 200 ML', 20, 0, 25, 0, 30, 0);

  /* ── SGC: os pedidos de teste, todos na fase Análise ── */

  // C-011/C-012/C-013/C-014/C-007: o item 5001 tem lote a vencer e excesso em
  // outra filial, quantidade 30 e cobertura 40 dias contra um limite de 35.
  CARDS_003.alertas = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · FRESENIUS KABI', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    prazoPadrao: '28/35/42', prazoAcordado: '28/35/42',
  });
  item(db, CARDS_003.alertas, 5001, 30, 10.0, { vendaTotal: 45, vendaLicitacao: 6, estoque: 10, sugerida: 24, curva: 'A', coberturaDias: 40, coberturaLimite: 35 });
  item(db, CARDS_003.alertas, 5004, 10, 10.0, { vendaTotal: 45, estoque: 10, sugerida: 60, curva: 'A', coberturaDias: 20, coberturaLimite: 35 });

  // C-017: tudo zerado — nenhuma outra exigência em jogo.
  CARDS_003.zerado = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · FRESENIUS KABI (VAZIO)', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    prazoPadrao: '28/35/42', prazoAcordado: '28/35/42',
  });
  for (const codprod of [5006, 5007, 5008]) item(db, CARDS_003.zerado, codprod, 0, 10.0, { coberturaLimite: 35 });

  // C-015/RN-007 (parte servidor): só o prazo pendente.
  CARDS_003.prazo = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · FRESENIUS KABI (PRAZO)', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    prazoPadrao: '30/60', prazoAcordado: '28/35/42',
  });
  item(db, CARDS_003.prazo, 5009, 12, 12.0, { coberturaDias: 10, coberturaLimite: 35 });
  item(db, CARDS_003.prazo, 5011, 6, 22.0, { coberturaDias: 10, coberturaLimite: 35 });

  // C-018/RN-014: 20 itens, 8 com quantidade, nenhum alerta (nada de 5001/5002/5003).
  CARDS_003.pronto = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · NESTLE', codfornec: 1042, fornecedor: 'Nestlé',
    prazoPadrao: '28/35/42', prazoAcordado: '28/35/42',
  });
  const DO_PRONTO = [5004, 5005, 5006, 5007, 5008, 5009, 5010, 5011, 5012, 5013,
    5014, 5015, 5016, 5017, 5018, 5019, 5020, 5101, 5102, 5103];
  DO_PRONTO.forEach((codprod, indice) => {
    const comQuantidade = indice < 8;
    item(db, CARDS_003.pronto, codprod, comQuantidade ? 10 : 0, 15.0, { coberturaDias: 12, coberturaLimite: 35 });
  });

  // C-022: voltou da aprovação técnica com motivo e 3 produtos reprovados, que
  // a compradora já zerou.
  CARDS_003.reprovado = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · NESTLE (REPROVADO)', codfornec: 1042, fornecedor: 'Nestlé',
    prazoPadrao: '28/35/42', prazoAcordado: '28/35/42',
    tecMotivo: 'Volume acima do previsto para o trimestre.', tecReprovados: '5010,5011,5012',
  });
  for (const codprod of [5013, 5014, 5015]) item(db, CARDS_003.reprovado, codprod, 5, 20.0, { coberturaDias: 12, coberturaLimite: 35 });
  for (const codprod of [5010, 5011, 5012]) item(db, CARDS_003.reprovado, codprod, 0, 20.0, { coberturaDias: 0, coberturaLimite: 35 });

  // C-010/C-021/RN-013: nasce sem item; quem grava é o sgcItensGravar no smoke.
  CARDS_003.gravacao = pedido(db, cenario, {
    titulo: 'BENENUTRI MATRIZ · FRESENIUS KABI (GRAVACAO)', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    prazoPadrao: '28/35/42', prazoAcordado: '28/35/42',
  });
}

export { PERIODO, FILIAL_PEDIDO };
