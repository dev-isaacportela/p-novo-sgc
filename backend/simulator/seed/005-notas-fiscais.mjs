// Seção Simulador do plan da 005 (notas fiscais e faturamento): os onze
// pedidos da tabela do plan, as seis notas de entrada do WinThor
// (PCNFENT + PCMOV CODOPER='E' + PCLANC, NUMNOTA < 90000 — faixa reservada,
// R-036) e os contatos de faturamento. Ver
// docs/specs/005-notas-fiscais-e-faturamento/plan.md §Simulador.
//
// Só INSERT (mais dois UPDATE de CODFAB/CODAUXILIAR em PCPRODUT, colunas que
// só esta spec lê): nenhuma tabela nasce aqui, e nenhum fornecedor, filial,
// persona ou produto — PCFORNEC/PCFILIAL/SGC_FORNECEDOR são do seed/001,
// SGC_USUARIO_PERSONA do seed/002 e PCPRODUT do seed/003 (R-017).
//
// As datas de envio são calculadas a partir de HOJE com `somarDiasUteis`
// (R-025), para os níveis do cron de cobrança serem determinísticos em
// qualquer dia em que o smoke rode; o gêmeo puro de `backend/lib/dias-uteis.mjs`
// é o módulo do frontend, importado direto (o mesmo que smoke/002 faz com
// `transicoes.ts`) para não existir uma terceira implementação.

import { somarDiasUteis } from '../../../frontend/src/lib/dias-uteis.ts';

const AGORA = new Date().toISOString().slice(0, 19);
export const HOJE = AGORA.slice(0, 10);

/** Data de `dias` úteis ATRÁS de hoje, em AAAA-MM-DD. */
const envio = (dias) => somarDiasUteis(HOJE, -dias);

/** Data de `dias` corridos depois de `iso`. */
function maisDias(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

/** Ids dos cards de teste, para o smoke recortar as asserções (R-045). */
export const CARDS_005 = {};
/** Datas calculadas que o smoke precisa conferir sem recalcular. */
export const DATAS_005 = { hoje: HOJE };

const PRAZO_CARD = '2026-12-31';
const TITULO = (filial, fornecedor) => `${filial.toUpperCase()} · ${fornecedor.toUpperCase()}`;

// Pedidos desta spec. `dias` = dias úteis desde o envio (é o que decide a
// faixa de /faturamentos-pendentes e o nível do cron).
const PEDIDOS = [
  {
    chave: 'enviadoComPedido', fase: 'enviado', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 3, numped: '998901', vlTotal: 120000,
    prazo: '28/35/42', responsaveis: ['ana', 'gil'], contatos: 1,
    itens: [[5001, 1000, 10.0], [5002, 500, 20.0], [5003, 500, 30.0]],
  },
  {
    chave: 'enviadoSemPedido', fase: 'enviado', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '2', filial: 'Benenutri Filial Norte', dias: 5, numped: '', vlTotal: 5000,
    prazo: '30/60', responsaveis: ['ana'], contatos: 1,
    itens: [[5001, 100, 10.0], [5002, 100, 10.0], [5003, 100, 10.0], [5004, 100, 10.0], [5005, 100, 10.0]],
  },
  {
    chave: 'faturamentoParcial', fase: 'faturamento', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 3, numped: '998902', vlTotal: 100000,
    prazo: '28/35/42', responsaveis: ['ana'], contatos: 1,
    itens: [[5006, 500, 50.0], [5007, 500, 150.0]],
    faturado: { vl: 60000, percValor: 60, percQtd: 60 },
    nfVinculada: { numnota: 7010, serie: '1', vlTotal: 60000 },
  },
  {
    chave: 'conferencias', fase: 'faturamento', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 4, numped: '998903', vlTotal: 60000,
    prazo: '28/35/42', responsaveis: ['ana'], contatos: 1,
    itens: [[5008, 100, 10.0], [5009, 100, 20.0], [5010, 100, 30.0]],
  },
  {
    chave: 'notaDeOutro', fase: 'transito', codfornec: 1042, fornecedor: 'Nestlé',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 3, numped: '998904', vlTotal: 40000,
    prazo: '30/60', responsaveis: ['ana'], contatos: 1,
    itens: [[5101, 100, 400.0]],
    faturado: { vl: 40000, percValor: 100, percQtd: 100 },
    nfVinculada: { numnota: 7004, serie: '1', vlTotal: 40000 },
  },
  {
    chave: 'semNota', fase: 'enviado', codfornec: 1042, fornecedor: 'Nestlé',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 1, numped: '998905', vlTotal: 20000,
    prazo: '30/60', responsaveis: ['ana'], contatos: 0,
    itens: [[5103, 100, 100.0], [5104, 100, 100.0]],
  },
  {
    chave: 'semNota2', fase: 'enviado', codfornec: 1042, fornecedor: 'Nestlé',
    codfilial: '2', filial: 'Benenutri Filial Norte', dias: 2, numped: '998906', vlTotal: 15000,
    prazo: '30/60', responsaveis: ['ana'], contatos: 0,
    itens: [[5103, 50, 300.0]],
  },
  {
    chave: 'atrasadoNove', fase: 'transito', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 9, numped: '998907', vlTotal: 80000,
    prazo: '28/35/42', responsaveis: ['ana'], contatos: 1,
    itens: [[5011, 200, 400.0]],
  },
  {
    chave: 'cemPorCento', fase: 'faturamento', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 6, numped: '998908', vlTotal: 50000,
    prazo: '28/35/42', responsaveis: ['ana'], contatos: 1,
    itens: [[5012, 100, 500.0]],
    faturado: { vl: 50000, percValor: 100, percQtd: 100 },
    nfVinculada: { numnota: 7011, serie: '1', vlTotal: 50000 },
    alerta: { nivel: 5 },
  },
  {
    chave: 'emBo', fase: 'bo', codfornec: 1015, fornecedor: 'Fresenius Kabi',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 7, numped: '998909', vlTotal: 30000,
    prazo: '28/35/42', responsaveis: ['ana'], contatos: 1,
    itens: [[5013, 100, 300.0]],
    bo: { previsaoEmDias: 10, itens: [[5006, 40], [5007, 25]] },
  },
  {
    chave: 'validade1042', fase: 'faturamento', codfornec: 1042, fornecedor: 'Nestlé',
    codfilial: '1', filial: 'Benenutri Matriz', dias: 3, numped: '998910', vlTotal: 20000,
    prazo: '30/60', responsaveis: ['ana'], contatos: 1,
    itens: [[5101, 100, 100.0], [5102, 100, 100.0]],
  },
];

export function seed005(db, cenario) {
  const U = cenario.usuarios;

  /* ── produtos auxiliares do ERP e os dois códigos alternativos (C-008) ──
   * 9001 casa com o item 5002 do pedido pelo CÓDIGO DE FÁBRICA e 9002 com o
   * 5003 pelo CÓDIGO DE BARRAS; 9999 não casa por nenhum dos três (C-009).
   * 8801/8802 são os itens da nota 7005, que não pertencem a pedido nenhum.
   * CODFORNEC 1099 de propósito: são códigos da indústria, e sob 1015 eles
   * entrariam na análise de montagem da 003 (que lista por fornecedor). */
  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL, CODFAB, CODAUXILIAR)
    VALUES (?, ?, 'CX 12', 'UN', 1099, 2, 21, 12, NULL, 180, ?, ?)`);
  inserirProduto.run(9001, 'SUPLEMENTO PROTEICO BAUNILHA 400 G (COD. INDUSTRIA)', 'FK-123', '');
  inserirProduto.run(9002, 'ESPESSANTE ALIMENTAR 125 G (COD. INDUSTRIA)', '', '7891234567890');
  inserirProduto.run(9999, 'BRINDE PROMOCIONAL NAO PEDIDO', '', '');
  inserirProduto.run(8801, 'DIETA ENTERAL PREMIUM 1 L', '', '');
  inserirProduto.run(8802, 'MODULO DE FIBRAS PREMIUM 250 G', '', '');
  // Os pares do casamento alternativo, do lado do PEDIDO. CODFAB e CODAUXILIAR
  // são colunas que só a 005 lê (R-027), então preenchê-las não mexe com a 003.
  db.prepare("UPDATE PCPRODUT SET CODFAB = 'FK-123' WHERE CODPROD = 5002").run();
  db.prepare("UPDATE PCPRODUT SET CODAUXILIAR = '7891234567890' WHERE CODPROD = 5003").run();

  /* ── os onze pedidos ── */
  const inserirCard = db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirResponsavel = db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, ?)');
  const inserirPedido = db.prepare(`INSERT INTO SGC_PEDIDO
    (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, VL_TOTAL,
     PRAZO_PADRAO, PRAZO_ACORDADO, DT_ENVIO, CANAL, EMAIL_ENVIO, NUMPED_WINTHOR, ENVIO_POR, ENVIO_EM,
     ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM,
     VL_FATURADO, PERC_FATURADO_VALOR, PERC_FATURADO_QTD, ALERTA_FATURAMENTO_NIVEL, ALERTA_FATURAMENTO_EM, DT_PREVISAO_BO)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'email', ?, ?, ?, ?, 'manual', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirItem = db.prepare(`INSERT INTO SGC_PEDIDO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, QT_PEDIDA, PRECO_CUSTO, TIPO_PRECO, CURVA_ABC,
     COBERTURA_DIAS, COBERTURA_LIMITE, COBERTURA_JUSTIFICATIVA, OBSERVACAO, STATUS, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, 'CX 12', 'UN', ?, ?, 'padrao', 'B', 10, 35, '', '', 'enviado', ?, ?, ?)`);
  const inserirNf = db.prepare(`INSERT INTO SGC_NF
    (ID_CARD, NUMNOTA, SERIE, CHAVENFE, NUMTRANSENT, CODFORNEC, CODFILIAL, DT_EMISSAO, DT_ENTRADA,
     DT_RECEBIMENTO, VL_TOTAL, PRAZO_PARCELAS, ORIGEM, VINCULADO_POR, VINCULADO_EM)
    VALUES (?, ?, ?, '', 0, ?, ?, ?, ?, ?, ?, '', 'manual', ?, ?)`);
  const inserirContato = db.prepare(`INSERT INTO SGC_CONTATO_FATURAMENTO
    (ID_CARD, DT_CONTATO, CANAL, RESUMO, PREVISAO_FATURAMENTO, REGISTRADO_POR, CRIADO_EM)
    VALUES (?, ?, 'telefone', ?, ?, ?, ?)`);
  const inserirBoItem = db.prepare(`INSERT INTO SGC_BO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, QT_PENDENTE, OBSERVACAO, STATUS, CLIENTES_IMPACTADOS, QT_VENDIDA_60D, CRIADO_POR, CRIADO_EM)
    VALUES (?, ?, ?, ?, '', 'aberto', 0, 0, ?, ?)`);

  PEDIDOS.forEach((pedido, indice) => {
    const dtEnvio = envio(pedido.dias);
    const titulo = TITULO(pedido.filial, pedido.fornecedor);
    const valores = {
      fornecedor: pedido.fornecedor, filial: pedido.filial,
      valor_total: String(pedido.vlTotal), prioridade: 'normal',
    };
    inserirCard.run(cenario.boardCompras, cenario.fases[pedido.fase], titulo, (indice + 1) * 10,
      U[pedido.responsaveis[0]], PRAZO_CARD, JSON.stringify(valores),
      `${titulo} ${pedido.fornecedor}`.toLowerCase(), U.ana, AGORA, AGORA, AGORA);
    const idCard = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
    CARDS_005[pedido.chave] = idCard;
    pedido.responsaveis.forEach((chave, ordem) => inserirResponsavel.run(idCard, U[chave], ordem + 1));

    const faturado = pedido.faturado || { vl: 0, percValor: 0, percQtd: 0 };
    inserirPedido.run(idCard, pedido.codfornec, pedido.fornecedor, pedido.codfilial, pedido.filial,
      maisDias(dtEnvio, -45), dtEnvio, pedido.vlTotal, pedido.prazo, pedido.prazo, dtEnvio,
      `pedidos@${pedido.codfornec === 1015 ? 'fresenius-kabi' : 'nestle'}.com`, pedido.numped,
      U.ana, `${dtEnvio}T09:00:00`, U.ana, AGORA, AGORA,
      faturado.vl, faturado.percValor, faturado.percQtd,
      pedido.alerta ? pedido.alerta.nivel : 0,
      pedido.alerta ? `${maisDias(HOJE, -1)}T08:00:00` : '',
      pedido.bo ? maisDias(HOJE, pedido.bo.previsaoEmDias) : '');

    for (const [codprod, qt, preco] of pedido.itens) {
      inserirItem.run(idCard, codprod, `PRODUTO ${codprod}`, qt, preco, AGORA, U.ana, AGORA);
    }
    if (pedido.nfVinculada) {
      const nf = pedido.nfVinculada;
      inserirNf.run(idCard, nf.numnota, nf.serie, pedido.codfornec, pedido.codfilial,
        maisDias(dtEnvio, 1), maisDias(dtEnvio, 3), maisDias(dtEnvio, 3), nf.vlTotal, U.ana, AGORA);
    }
    // É o contato (ou a falta dele) que faz o filtro "sem contato" devolver
    // exatamente `semNota` e `semNota2` (C-026).
    for (let i = 0; i < pedido.contatos; i += 1) {
      inserirContato.run(idCard, `${maisDias(HOJE, -2)}T10:00:00`,
        'Indústria informou que o faturamento sai nesta semana.', maisDias(HOJE, 5), U.ana, AGORA);
    }
    if (pedido.bo) {
      for (const [codprod, qt] of pedido.bo.itens) {
        inserirBoItem.run(idCard, codprod, `PRODUTO ${codprod}`, qt, U.ana, AGORA);
      }
    }
  });

  /* ── WinThor: as seis notas de entrada (NUMNOTA < 90000, R-036) ──
   * 90001–90017 são da 006 e a 007 não semeia nota nenhuma. */
  const inserirNfEnt = db.prepare(`INSERT INTO PCNFENT
    (NUMTRANSENT, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, DTEMISSAO, DTENT, DTCANCEL, VLTOTAL, CHAVENFE, PRAZO, ESPECIE)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NF')`);
  const inserirMov = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMPED, NUMTRANSENT, NUMNOTA, SERIE, NUMLOTE, DATAVALIDADE)
    VALUES (?, ?, ?, 0, 'E', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirLanc = db.prepare(`INSERT INTO PCLANC
    (NUMTRANSENT, NUMNOTA, CODFORNEC, DTEMISSAO, DTVENC, VALOR, DUPLIC, NUMPARCELAMENTO)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  let transitem = 700001;
  /** Uma nota completa: cabeçalho, itens e duplicatas. */
  function nota({ numtransent, numnota, serie, codfornec, codfilial, emissao, entrada, cancelada,
    vlTotal, chavenfe, prazo, numped, itens, parcelas }) {
    inserirNfEnt.run(numtransent, numnota, serie, codfornec, codfilial, emissao, entrada || null,
      cancelada || null, vlTotal, chavenfe || '', prazo || 0);
    for (const item of itens) {
      inserirMov.run(transitem, item.codprod, codfilial, emissao, item.qt, item.punit,
        numped || 0, numtransent, numnota, serie, item.lote || '', item.validade || null);
      transitem += 1;
    }
    (parcelas || []).forEach((dias, ordem) => inserirLanc.run(numtransent, numnota, codfornec,
      emissao, maisDias(emissao, dias), Math.round((vlTotal / parcelas.length) * 100) / 100,
      `${numnota}/${ordem + 1}`, parcelas.length));
  }

  // 7001 — a nota do pedido 998901 (C-001, score 100 por NUMPED). Três itens:
  // um casa por CODPROD, um por CODFAB e um por EAN (C-008); os preços dão
  // conforme / atenção (0,8 %) / divergente (1,5 %) contra 10, 20 e 30 (C-010);
  // os lotes dão 143 e 81 dias de validade da emissão (C-011); as duplicatas
  // vencem em 28/35/42 dias (C-013). 72.000,00 de 120.000,00 = 60 % (C-014).
  const emissao7001 = maisDias(envio(3), 1);
  DATAS_005.emissao7001 = emissao7001;
  nota({
    numtransent: 9001, numnota: 7001, serie: '1', codfornec: 1015, codfilial: '1',
    emissao: emissao7001, entrada: maisDias(emissao7001, 3), vlTotal: 72000,
    chavenfe: '35260949324221000104550010000070011000070011', prazo: 0, numped: 998901,
    itens: [
      { codprod: 5001, qt: 600, punit: 10.0, lote: 'L7001A', validade: maisDias(emissao7001, 143) },
      { codprod: 9001, qt: 300, punit: 20.16, lote: 'L7001B', validade: maisDias(emissao7001, 81) },
      { codprod: 9002, qt: 300, punit: 30.45, lote: 'L7001C', validade: maisDias(emissao7001, 200) },
    ],
    parcelas: [28, 35, 42],
  });

  // 7002 — sem NUMPED, na filial 2: 4 dos 5 produtos do `enviadoSemPedido`
  // mais um item que não está no pedido (C-002 score 88, C-009).
  const emissao7002 = maisDias(envio(5), 3);
  DATAS_005.emissao7002 = emissao7002;
  nota({
    numtransent: 9002, numnota: 7002, serie: '1', codfornec: 1015, codfilial: '2',
    emissao: emissao7002, entrada: maisDias(emissao7002, 2), vlTotal: 3000, prazo: 30, numped: 0,
    itens: [
      { codprod: 5001, qt: 100, punit: 10.0, lote: 'L7002A', validade: maisDias(emissao7002, 200) },
      { codprod: 5002, qt: 100, punit: 10.0, lote: 'L7002B', validade: maisDias(emissao7002, 200) },
      { codprod: 5003, qt: 100, punit: 10.0, lote: 'L7002C', validade: maisDias(emissao7002, 200) },
      { codprod: 5004, qt: 100, punit: 10.0, lote: 'L7002D', validade: maisDias(emissao7002, 200) },
      { codprod: 9999, qt: 50, punit: 10.0, lote: 'L7002E', validade: maisDias(emissao7002, 200) },
    ],
    parcelas: [30],
  });

  // 7003 — cancelada no ERP: não é candidata nem com o NUMPED do pedido (C-004/RN-015).
  nota({
    numtransent: 9003, numnota: 7003, serie: '1', codfornec: 1015, codfilial: '1',
    emissao: maisDias(envio(3), 1), entrada: maisDias(envio(3), 2), cancelada: maisDias(envio(3), 2),
    vlTotal: 5000, prazo: 30, numped: 998901,
    itens: [{ codprod: 5001, qt: 10, punit: 10.0 }],
    parcelas: [30],
  });

  // 7004 — já vinculada ao card `notaDeOutro`: nunca é sugerida a outro (C-003).
  nota({
    numtransent: 9004, numnota: 7004, serie: '1', codfornec: 1042, codfilial: '1',
    emissao: maisDias(envio(3), 1), entrada: maisDias(envio(3), 3), vlTotal: 40000, prazo: 30, numped: 998904,
    itens: [{ codprod: 5101, qt: 100, punit: 400.0 }],
    parcelas: [30],
  });

  // 7005 — faturada e ainda SEM entrada no armazém (DTENT nulo): é o registro
  // híbrido pelo número (C-006). Duplicatas em 30 e 60 dias, divergentes do
  // prazo acordado 28/35/42 (C-013).
  const emissao7005 = maisDias(envio(3), 2);
  DATAS_005.emissao7005 = emissao7005;
  nota({
    numtransent: 9005, numnota: 7005, serie: '', codfornec: 1015, codfilial: '1',
    emissao: emissao7005, entrada: null, vlTotal: 8000, prazo: 0, numped: 0,
    itens: [
      { codprod: 8801, qt: 10, punit: 400.0, lote: 'L7005A', validade: maisDias(emissao7005, 300) },
      { codprod: 8802, qt: 10, punit: 400.0, lote: 'L7005B', validade: maisDias(emissao7005, 300) },
    ],
    parcelas: [30, 60],
  });

  // 7007 — a nota do pedido 998909, que está em Produtos em B.O. (A-10 da
  // revisão da onda 2): R-041 tira do `bo` o AVISO diário, não a DETECÇÃO.
  const emissao7007 = maisDias(envio(7), 1);
  DATAS_005.emissao7007 = emissao7007;
  nota({
    numtransent: 9007, numnota: 7007, serie: '1', codfornec: 1015, codfilial: '1',
    emissao: emissao7007, entrada: maisDias(emissao7007, 2), vlTotal: 9000, prazo: 30, numped: 998909,
    itens: [{ codprod: 5013, qt: 30, punit: 300.0, lote: 'L7007A', validade: maisDias(emissao7007, 200) }],
    parcelas: [30],
  });

  // 7006 — fornecedor 1042, com os mesmos dois prazos de validade da 7001
  // (143 e 81 dias): com a validade mínima do 1042 no cadastro, os dois lotes
  // caem do outro lado da régua (C-011).
  const emissao7006 = maisDias(envio(3), 1);
  DATAS_005.emissao7006 = emissao7006;
  nota({
    numtransent: 9006, numnota: 7006, serie: '1', codfornec: 1042, codfilial: '1',
    emissao: emissao7006, entrada: maisDias(emissao7006, 3), vlTotal: 12000, prazo: 30, numped: 0,
    itens: [
      { codprod: 5101, qt: 60, punit: 100.0, lote: 'L7006A', validade: maisDias(emissao7006, 143) },
      { codprod: 5102, qt: 60, punit: 100.0, lote: 'L7006B', validade: maisDias(emissao7006, 81) },
    ],
    parcelas: [30, 60],
  });
}
