// Seção Simulador da spec 007 (produtos em B.O.). Ver
// docs/specs/007-produtos-em-bo/plan.md §Simulador.
//
// Só INSERT: fornecedores/filiais são do seed/001-fornecedores.mjs, personas
// do seed/002-quadro.mjs, catálogo e vendas de 2026-08-15 são do
// seed/003-itens.mjs (R-017). Esta spec insere 2 produtos PRÓPRIOS do
// fornecedor 1042 (5201, 5202 — fora da faixa que a 003 analisa, sem "CREME"
// na descrição, B-05) e 5 clientes próprios (9101–9105, fora da faixa
// 9001–9003 da 003); vendas `CODOPER = 'S'` com data RELATIVA a hoje (para o
// teste de clientes impactados não envelhecer) e `NUMTRANSITEM` a partir de
// 900001 (R-036, não colide com a 003); 4 cards do quadro, exportados em
// `CARDS_007`, todos com `DT_ENVIO` vazio e sem `SGC_NF` (R-045: banco
// compartilhado do smoke — pedido com envio entraria em
// /faturamentos-pendentes da 005).

/** Data de hoje + `dias` (negativo = passado), em AAAA-MM-DD. */
function emDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

const HOJE = emDias(0);
const FORNECEDOR = { codfornec: 1042, nome: 'Nestlé' };
const FILIAL = { codfilial: '1', nome: 'Benenutri Matriz' };
const TITULO = `${FILIAL.nome.toUpperCase()} · ${FORNECEDOR.nome.toUpperCase()}`;

// CODPROD, DESCRICAO, CODEPTO, CODSEC — fornecedor 1042, própria desta spec.
const PRODUTOS = [
  [5201, 'COMPOSTO LACTEO SEM LACTOSE 400 G', 3, 31],
  [5202, 'CEREAL INFANTIL MULTICEREAIS 230 G', 3, 31],
];

// CODCLI — 5 clientes próprios, fora da faixa 9001–9003 da 003.
const CLIENTES = [9101, 9102, 9103, 9104, 9105];

// [CODPROD, diasRelativos, CODCLI, QT, CODOPER] — 5201: 4 clientes distintos e
// 70 un; 5202: 2 clientes e 10 un (C-002/RN-002). Controles: venda de hoje-61
// (fora da janela de 60 dias) e uma entrada 'E' (não é saída) não contam.
const VENDAS = [
  [5201, -5, 9101, 10, 'S'], [5201, -12, 9101, 10, 'S'], [5201, -20, 9101, 10, 'S'],
  [5201, -8, 9102, 10, 'S'], [5201, -15, 9102, 10, 'S'],
  [5201, -25, 9103, 10, 'S'],
  [5201, -30, 9104, 10, 'S'],
  [5201, -61, 9105, 10, 'S'], // controle: fora dos 60 dias
  [5201, -3, 9101, 500, 'E'], // controle: entrada, não saída
  [5202, -6, 9101, 5, 'S'], [5202, -18, 9102, 5, 'S'],
];

/** Um item do pedido — os 4 são os mesmos em todo card desta spec. */
const ITENS = [
  { codprod: 5201, descricao: 'COMPOSTO LACTEO SEM LACTOSE 400 G', embalagem: 'CAIXA COM 24', unidade: 'UN', qtPedida: 100, precoCusto: 19.0 },
  { codprod: 5202, descricao: 'CEREAL INFANTIL MULTICEREAIS 230 G', embalagem: 'CX 12', unidade: 'UN', qtPedida: 60, precoCusto: 8.0 },
  { codprod: 5101, descricao: 'COMPOSTO LACTEO 400 G', embalagem: 'CAIXA COM 24', unidade: 'UN', qtPedida: 40, precoCusto: 19.0 },
  { codprod: 5102, descricao: 'CEREAL INFANTIL 230 G', embalagem: 'CX 12', unidade: 'UN', qtPedida: 40, precoCusto: 8.0 },
];

/** Ids dos cards de teste, para o smoke não depender da ordem de inserção. */
export const CARDS_007 = {};

export function seed007(db, cenario) {
  const agora = '2026-09-15T08:00:00';
  const anaId = cenario.usuarios.ana;
  const gilId = cenario.usuarios.gil;

  /* ── WinThor: catálogo próprio, clientes próprios, vendas relativas ── */
  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL)
    VALUES (?, ?, ?, ?, ?, ?, ?, 24, NULL, 180)`);
  for (const [codprod, descricao, codepto, codsec] of PRODUTOS) {
    inserirProduto.run(codprod, descricao, 'CAIXA COM 24', 'UN', FORNECEDOR.codfornec, codepto, codsec);
  }
  const inserirEstoque = db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, QTPEDIDA, CUSTOULTENT, DTULTENT, DTULTSAIDA)
    VALUES (?, ?, 0, 0, 0, 0, 0, 0, ?, ?)`);
  for (const [codprod] of PRODUTOS) inserirEstoque.run(codprod, FILIAL.codfilial, HOJE, HOJE);

  const inserirCliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1) VALUES (?, ?, ?, 1)');
  CLIENTES.forEach((codcli, indice) => inserirCliente.run(codcli, `Cliente B.O. ${indice + 1}`, 'J'));

  const inserirMov = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMPED)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)`);
  let transitem = 900001;
  for (const [codprod, dias, codcli, qt, codoper] of VENDAS) {
    inserirMov.run(transitem, codprod, FILIAL.codfilial, codcli, codoper, emDias(dias), qt);
    transitem += 1;
  }

  /* ── SGC: os 4 cards, todos fornecedor 1042 / filial 1, criados por ana ── */
  const inserirCard = db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const inserirResponsavel = db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, 1)');
  const inserirPedido = db.prepare(`INSERT INTO SGC_PEDIDO
    (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA,
     DT_PREVISAO_BO, ALERTA_BO_EM, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, '2026-08-01', '2026-09-15', 'manual', 0, ?, ?, ?, ?, ?)`);
  const inserirItem = db.prepare(`INSERT INTO SGC_PEDIDO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, QT_PEDIDA, PRECO_CUSTO, STATUS, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirBoItem = db.prepare(`INSERT INTO SGC_BO_ITEM
    (ID_CARD, CODPROD, DESCRICAO, QT_PENDENTE, OBSERVACAO, STATUS, CLIENTES_IMPACTADOS, QT_VENDIDA_60D,
     CRIADO_POR, CRIADO_EM, RESOLVIDO_POR, RESOLVIDO_EM)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirPrevisao = db.prepare(`INSERT INTO SGC_BO_PREVISAO
    (ID_CARD, DT_PREVISAO, OBSERVACAO, REGISTRADO_POR, REGISTRADO_EM) VALUES (?, ?, ?, ?, ?)`);
  const inserirDocumento = db.prepare(`INSERT INTO SGC_BO_DOCUMENTO
    (ID_CARD, TIPO, NOME_ARQUIVO, ENDERECO, ENVIADO_POR, ENVIADO_EM) VALUES (?, 'carta_falta', ?, ?, ?, ?)`);

  /** Cria um card com os 4 itens padrão (status por padrão 'enviado', com exceções). */
  function criarCard(faseChave, statusPorCodprod = {}, dtPrevisaoBo = '', alertaBoEm = '') {
    inserirCard.run(
      cenario.boardCompras, cenario.fases[faseChave], TITULO, 1, anaId, '{}',
      TITULO.toLowerCase(), anaId, agora, agora, agora,
    );
    const cardId = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
    inserirResponsavel.run(cardId, anaId);
    inserirPedido.run(
      cardId, FORNECEDOR.codfornec, FORNECEDOR.nome, FILIAL.codfilial, FILIAL.nome,
      dtPrevisaoBo, alertaBoEm, anaId, agora, agora,
    );
    for (const item of ITENS) {
      const status = statusPorCodprod[item.codprod] || 'enviado';
      inserirItem.run(cardId, item.codprod, item.descricao, item.embalagem, item.unidade, item.qtPedida, item.precoCusto, status, agora, anaId, agora);
    }
    return cardId;
  }

  // `faturamento` — nenhum item em B.O.: C-001, C-002, C-003, C-008 (entrada), C-011, C-016.
  CARDS_007.faturamento = criarCard('faturamento');

  // `bo` — 5201 (40 pendentes, 4 clientes, 70 un) e 5202 (15, 2, 10), os dois
  // abertos; DT_PREVISAO_BO = hoje-2 (vencida), ALERTA_BO_EM = ''; 1 previsão
  // e 1 documento: C-004..C-010, C-012, RN-012.
  CARDS_007.bo = criarCard('bo', { 5201: 'bo', 5202: 'bo' }, emDias(-2), '');
  inserirBoItem.run(CARDS_007.bo, 5201, 'COMPOSTO LACTEO SEM LACTOSE 400 G', 40, 'Falta confirmada pela indústria', 'aberto', 4, 70, anaId, agora, null, null);
  inserirBoItem.run(CARDS_007.bo, 5202, 'CEREAL INFANTIL MULTICEREAIS 230 G', 15, '', 'aberto', 2, 10, anaId, agora, null, null);
  inserirPrevisao.run(CARDS_007.bo, emDias(-2), 'confirmado pelo representante', anaId, '2026-09-10T10:00:00');
  inserirDocumento.run(CARDS_007.bo, 'Carta de falta - Nestlé.pdf', 'https://arquivos.local/carta-falta-nestle.pdf', anaId, '2026-09-10T10:05:00');

  // `boLimpo` — 5201 já liberado, zero aberto; DT_PREVISAO_BO = hoje+10 (no
  // prazo): C-008 (libera), C-009, C-011, C-012.
  CARDS_007.boLimpo = criarCard('bo', {}, emDias(10), '');
  inserirBoItem.run(CARDS_007.boLimpo, 5201, 'COMPOSTO LACTEO SEM LACTOSE 400 G', 40, '', 'liberado', 4, 70, anaId, '2026-09-08T08:00:00', gilId, '2026-09-12T09:00:00');

  // `boSemPrevisao` — 5101 aberto (1 cliente, 8 un), DT_PREVISAO_BO = '' (sem
  // previsão): C-011, C-012 (ordenação — vem antes de tudo).
  CARDS_007.boSemPrevisao = criarCard('bo', { 5101: 'bo' }, '', '');
  inserirBoItem.run(CARDS_007.boSemPrevisao, 5101, 'COMPOSTO LACTEO 400 G', 8, '', 'aberto', 1, 8, anaId, agora, null, null);
}
