// Regra pura da spec 014 (pedido Galderma): src/lib/galderma.ts e
// src/lib/galderma-acompanhamento.ts. Os números são os casos verificados do
// sistema antigo (galderma-calculos.test.ts do p-60523): sugestão 218, cobertura
// futura 35, saldo 360/290, caixa 24/36/12/0. O que só o servidor responde está
// em backend/simulator/smoke/014-galderma.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoDeCaixa, cabecalhoPadrao, calcularLinhaFilial, casarPlanilha, consolidarGrupo, COLUNAS_CSV_MESA, ehMultiploCaixa,
  entradaDoCabecalho, itemDoPedidoGalderma, linhasCsvMesa, listaDeCodigos, listaDeFiliais, montarMesa, montarPedidosPorFilial,
  numeroDaPlanilha, origensPossiveis, parsearPlanilha, periodoDaCompetencia, periodoDaPosicao, periodoDoPedido, periodoDoTrimestre,
  planoDeGeracao, podeEditar, produtosDisponiveis, proximoMultiploCaixa, quantidadeDigitada, resumoDaMesa, SEM_FILIAL, somarValores,
  sugestaoEmCaixa, textoDoModelo, tomCobertura, validarCabecalho,
} from '../src/lib/galderma.ts';
import {
  anteriorDoSellout, faltaPercentual, janelaDoAcompanhamento, juntarAcompanhamento, lerSellout, montarComposicao, percentualDaMeta,
  semaforoDaMeta, serieMensal, textoDivergenciaEstoque, textoDoHistorico, totaisAcompanhamento, valorizarEstoque,
} from '../src/lib/galderma-acompanhamento.ts';
import { permissoesDe, menuParaPersona } from '../src/lib/permissoes.ts';

const quase = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const posicao = (extra = {}) => ({ CODPROD: 1, CODFILIAL: '1', QTEST: 132, QTBLOQUEADA: 0, QTRESERV: 0, EM_TRANSITO: 0, VENDA_MES: 0, VENDA_TRIMESTRE: 900, COMPRA_MES: 0, ...extra });
const linha = (extra = {}, posicaoExtra = {}) => calcularLinhaFilial({ posicao: posicao(posicaoExtra), codfilial: '1', filial: 'F1', coberturaAlvoDias: 35, pedido: 0, ...extra });
const item = (extra = {}) => ({
  id: 10, codprod: 1, ean: '', descricao: 'P1', precoSellout: 50, precoNet: 10, precoLista: 0, precoListaDesc: 12,
  estoqueInicial: 0, mediaSellout: 0, previsaoSellout: 0, propostaSellin: 100, metaSellinValor: 0, observacao: '', ...extra,
});

/* ── mesa ── */

test('C-001: cabeçalho padrão — competência do mês, hoje, "Pedido Galderma AAAA-MM", 35 dias, trânsito desmarcado, filiais da última negociação ou as três primeiras do ERP', () => {
  const c = cabecalhoPadrao('2026-11-03', null, ['1', '2', '3', '4']);
  assert.deepEqual(c, {
    competencia: '2026-11', dataPedido: '2026-11-03', descricao: 'Pedido Galderma 2026-11', filiais: ['1', '2', '3'],
    coberturaAlvoDias: 35, transitoComoCompra: false, metaSelloutValor: 0, observacao: '', idPai: 0,
  });
  assert.deepEqual(cabecalhoPadrao('2026-11-03', { filiais: ['1', '6'] }, ['1', '2']).filiais, ['1', '6']);
  assert.equal(validarCabecalho({ ...c, filiais: [] }), SEM_FILIAL);
  assert.equal(validarCabecalho(c), '');
  assert.equal(entradaDoCabecalho({ ...c, coberturaAlvoDias: 0 }, 'x').coberturaAlvoDias, 35, 'RN-PG-06: 0 vira 35');
  assert.equal(entradaDoCabecalho({ ...c, filiais: ['1', ' 2', 'x'] }, 'x').filiais, '1,2');
});

test('C-003 / RN-005: o trimestre é dos três meses anteriores (2026-08 → 05-01..07-31) e cruza o ano (2026-01 → 2025-10..2025-12)', () => {
  assert.deepEqual(periodoDoTrimestre('2026-08'), { inicio: '2026-05-01', fim: '2026-07-31' });
  assert.deepEqual(periodoDoTrimestre('2026-01'), { inicio: '2025-10-01', fim: '2025-12-31' });
  assert.deepEqual(periodoDaCompetencia('2028-02'), { inicio: '2028-02-01', fim: '2028-02-29' });
  assert.deepEqual(periodoDaPosicao('2026-08'), { dataInicioTri: '2026-05-01', dataFimTri: '2026-07-31', dataInicioMes: '2026-08-01', dataFimMes: '2026-08-31' });
});

test('C-004 / RN-001: estoque 132, sem trânsito, 900 no trimestre, alvo 35 → cobertura 13,2, sugestão 218; pedindo 218 a cobertura futura é 35', () => {
  const l = linha();
  quase(l.mediaTrimestre, 300);
  quase(l.mediaDiaria, 10);
  quase(l.coberturaDias, 13.2);
  assert.equal(l.sugestaoCobertura, 218);
  quase(linha({ pedido: 218 }).coberturaFuturaDias, 35);
  assert.equal(linha({}, { VENDA_TRIMESTRE: 0 }).coberturaDias, null, 'sem giro');
  assert.equal(linha({ qtdHerdada: 150 }).sugestaoCobertura, 68, 'o herdado desconta da sugestão');
  assert.equal(linha({ precoListaDesc: 12, pedido: 10 }).custoPedido, 120);
});

test('RN-001: venda em valor absoluto, falta vender e estoque líquido; o físico cai no disponível + bloqueado + reservado quando a posição não traz', () => {
  const l = calcularLinhaFilial({ posicao: { QTEST: 100, QTBLOQUEADA: 5, QTRESERV: 3, EM_TRANSITO: 20, VENDA_MES: -90, VENDA_TRIMESTRE: -300 }, codfilial: '1', filial: 'F', coberturaAlvoDias: 35, pedido: 0 });
  assert.equal(l.vendaMes, 90);
  assert.equal(l.estoqueTotal, 120);
  assert.equal(l.difProjecaoVenda, 10);
  assert.equal(l.estoqueLiquido, 110);
  assert.equal(l.qtestFisico, 108);
});

test('C-005 / RN-002: saldo 1440 − 1080 = 360; com trânsito 70 como compra = 290; com herdado 150 também = 140', () => {
  const f1 = linha({}, { COMPRA_MES: 1080, EM_TRANSITO: 70 });
  assert.equal(consolidarGrupo({ filiais: [f1], propostaSellin: 1440, previsaoSellout: 0 }).saldoAComprar, 360);
  assert.equal(consolidarGrupo({ filiais: [f1], propostaSellin: 1440, previsaoSellout: 0, considerarTransitoComoCompra: true }).saldoAComprar, 290);
  const herdado = linha({ qtdHerdada: 150 }, { COMPRA_MES: 1080, EM_TRANSITO: 70 });
  assert.equal(consolidarGrupo({ filiais: [herdado], propostaSellin: 1440, previsaoSellout: 0, considerarTransitoComoCompra: true }).saldoAComprar, 140);
});

test('RN-002: o grupo soma as filiais, a falta vender é previsão − venda do grupo, saldo simulado e desvio contam o pedido', () => {
  const g = consolidarGrupo({
    filiais: [linha({ pedido: 100 }, { VENDA_MES: 40, COMPRA_MES: 20 }), linha({ pedido: 60, codfilial: '2' }, { VENDA_MES: 10 })],
    propostaSellin: 300, previsaoSellout: 200,
  });
  assert.equal(g.pedidoTotal, 160);
  assert.equal(g.difProjecaoVenda, 150);
  assert.equal(g.saldoAComprar, 280);
  assert.equal(g.saldoAComprarSimulado, 120);
  assert.equal(g.desvioProposta, -120);
  quase(g.coberturaFuturaDias, (264 + 160) / 20);
});

test('C-006 / RN-003: caixa de 12 — 25 recusa e sugere 24; 31 → 36; 3 → 12; 0 → 0; 24 grava; caixa ≤ 1 é avulso', () => {
  assert.equal(avisoDeCaixa(25, 12), 'múltiplo de 12 · use 24');
  assert.equal(proximoMultiploCaixa(31, 12), 36);
  assert.equal(proximoMultiploCaixa(3, 12), 12);
  assert.equal(proximoMultiploCaixa(0, 12), 0);
  assert.equal(avisoDeCaixa(24, 12), '');
  assert.ok(ehMultiploCaixa(7, 1));
  assert.ok(ehMultiploCaixa(7, 0));
  assert.equal(quantidadeDigitada('abc'), 0);
  assert.equal(quantidadeDigitada('-5'), 0);
  assert.equal(quantidadeDigitada('24'), 24);
});

test('C-007: simular muda o saldo, a cobertura futura e os valores sem tocar o gravado; o gravado continua sendo o que vai ao pedido', () => {
  const base = { negociacao: { filiais: ['1'], coberturaAlvoDias: 35, transitoComoCompra: false }, itens: [item({ propostaSellin: 300 })], posicoes: [posicao()] };
  const pedidos = new Map([['10|1', 120]]);
  const gravado = montarMesa({ ...base, pedidos });
  const simulado = montarMesa({ ...base, pedidos, simulacao: new Map([['10|1', 144]]) });
  assert.equal(gravado[0].grupo.saldoAComprarSimulado, 180);
  assert.equal(simulado[0].grupo.saldoAComprarSimulado, 156);
  quase(simulado[0].filiais[0].coberturaFuturaDias, (132 + 144) / 10);
  assert.equal(simulado[0].filiais[0].pedidoGravado, 120);
  assert.equal(resumoDaMesa(simulado).valores.pedidoListaDesc, 144 * 12);
});

test('C-008 / P-04: usar a sugestão 218 com caixa de 12 grava 228, a caixa fechada logo acima', () => {
  assert.equal(sugestaoEmCaixa(218, 12), 228);
  assert.equal(sugestaoEmCaixa(216, 12), 216);
  assert.equal(sugestaoEmCaixa(0, 12), 0);
  assert.equal(sugestaoEmCaixa(7, 1), 7);
});

const PLANILHA = [
  'TOTAL;;;;;;;;;;;;',
  'Produto;EAN;SKU;Sell-out;Net;Lista desc;Estoque;Média;;Previsão;Proposta;;',
  'Volume;7890000058012;SKU-1;" R$ 1,184.02 ";R$ 500.00;600;10;" 8,857 ";x;220;240;;',
  'Desconhecido;7999999999999;SKU-X;1;1;1;1;1;;1;1;;',
  'Total;;;;;;;;;;;;',
].join('\r\n');

test('C-009 / RN-010: a planilha tem 2 linhas de cabeçalho; EAN com 8+ dígitos é linha; " R$ 1,184.02 " → 1184,02 e " 8,857 " → 8857; EAN sem produto vai para o relatório', () => {
  const linhas = parsearPlanilha(PLANILHA);
  assert.equal(linhas.length, 2, 'a linha de total sem EAN não conta');
  assert.equal(linhas[0].precoSellout, 1184.02);
  assert.equal(linhas[0].mediaSellout, 8857);
  assert.equal(linhas[0].propostaSellin, 240);
  const r = casarPlanilha(linhas, [{ codprod: 5801, descricao: 'VOLUME', ean: '7890000058012', embalagem: '', unPorCaixaErp: 12 }]);
  assert.equal(r.lidas, 2);
  assert.equal(r.casadas.length, 1);
  assert.deepEqual(r.semProduto, [{ ean: '7999999999999', sku: 'SKU-X' }]);
  assert.equal(numeroDaPlanilha('-'), 0);
  assert.equal(numeroDaPlanilha(''), 0);
});

test('C-011 / RN-PG-72: o modelo da competência volta pelo importador com o mesmo EAN de cada produto e sem colunas trocadas', () => {
  const catalogo = [
    { codprod: 5801, descricao: 'VOLUME; 1ML', ean: '7890000058012', embalagem: '', unPorCaixaErp: 12 },
    { codprod: 5802, descricao: 'LABIOS', ean: '7890000058029', embalagem: '', unPorCaixaErp: 12 },
    { codprod: 5803, descricao: 'SEM EAN', ean: '', embalagem: '', unPorCaixaErp: 1 },
  ];
  const texto = textoDoModelo('2026-08', catalogo);
  assert.ok(texto.includes('Estoque inicial ago/26'));
  assert.ok(texto.includes('Média Sellout TRI (mai/26/jun/26/jul/26)'));
  const lidas = parsearPlanilha(texto);
  assert.deepEqual(lidas.map((l) => l.ean), ['7890000058012', '7890000058029']);
  assert.equal(casarPlanilha(lidas, catalogo).casadas.length, 2);
});

test('C-012: a lista de escolha tira os produtos já na negociação (menos o que está sendo editado)', () => {
  const catalogo = [1818, 1819, 1820].map((codprod) => ({ codprod, descricao: '', ean: '', embalagem: '', unPorCaixaErp: 1 }));
  assert.deepEqual(produtosDisponiveis(catalogo, [{ codprod: 1818 }]).map((p) => p.codprod), [1819, 1820]);
  assert.deepEqual(produtosDisponiveis(catalogo, [{ codprod: 1818 }], 1818).map((p) => p.codprod), [1818, 1819, 1820]);
});

test('C-013 / RN-007: aberta edita tudo; fechada só o cabeçalho e a situação; convertida nada; sem operar, nada', () => {
  assert.deepEqual(podeEditar(true, 'aberta'), { cabecalho: true, itens: true, situacao: true, excluir: true, gerar: true });
  assert.deepEqual(podeEditar(true, 'fechada'), { cabecalho: true, itens: false, situacao: true, excluir: true, gerar: true });
  assert.deepEqual(podeEditar(true, 'convertida'), { cabecalho: false, itens: false, situacao: false, excluir: false, gerar: false });
  assert.equal(Object.values(podeEditar(false, 'aberta')).some(Boolean), false);
});

const mesaDeDuasFiliais = (simulacao) => montarMesa({
  negociacao: { filiais: ['2', '1', '6'], coberturaAlvoDias: 35, transitoComoCompra: false },
  itens: [item({ id: 11, codprod: 1819, precoListaDesc: 40 }), item({ id: 10, codprod: 1818, precoListaDesc: 50 })],
  pedidos: new Map([['10|1', 24], ['10|2', 12], ['11|1', 60]]),
  posicoes: [posicao({ CODPROD: 1818, EM_TRANSITO: 5 })],
  simulacao, caixas: new Map([[1818, 12]]),
  nomesFiliais: new Map([['1', 'Matriz'], ['2', 'Norte'], ['6', 'Tocantins']]),
});

test('C-014 / RN-009: só filiais com pedido > 0 viram pedido, em ordem numérica; produtos por código; custo = preço com desconto; o item é o ItemPedido inteiro com preço especial', () => {
  const pedidos = montarPedidosPorFilial(mesaDeDuasFiliais());
  assert.deepEqual(pedidos.map((p) => p.codfilial), ['1', '2']);
  assert.deepEqual(pedidos[0].produtos.map((p) => p.codprod), [1818, 1819]);
  assert.equal(pedidos[0].unidades, 84);
  assert.equal(pedidos[0].valor, 24 * 50 + 60 * 40);
  const it = itemDoPedidoGalderma(pedidos[0].produtos[0], 35);
  assert.equal(it.qtPedida, 24);
  assert.equal(it.qtSugerida, 24);
  assert.equal(it.precoCusto, 50);
  assert.equal(it.tipoPreco, 'especial');
  assert.equal(it.qtTransito, 5);
  assert.equal(it.coberturaLimite, 35);
  assert.equal(it.unPorCaixa, 12);
});

test('C-015: a simulação (25 recusado sobre 24 gravado) não vai ao pedido — vai o gravado', () => {
  const pedidos = montarPedidosPorFilial(mesaDeDuasFiliais(new Map([['10|1', 25], ['10|6', 12]])));
  assert.equal(pedidos[0].produtos.find((p) => p.codprod === 1818).qtdPedida, 24);
  assert.ok(!pedidos.some((p) => p.codfilial === '6'), 'filial só com simulação não gera pedido');
});

test('C-016: o plano de geração gera a filial sem vínculo, completa a que tem vínculo sem capa e pula a já gerada', () => {
  const pedidos = montarPedidosPorFilial(mesaDeDuasFiliais());
  const plano = planoDeGeracao(pedidos, [{ codfilial: '1', cardId: 70, temCapa: true }]);
  assert.deepEqual(plano.aGerar.map((p) => p.codfilial), ['2']);
  assert.deepEqual(plano.jaGeradas.map((p) => p.codfilial), ['1']);
  const retomada = planoDeGeracao(pedidos, [{ codfilial: '1', cardId: 70, temCapa: true }, { codfilial: '2', cardId: 71, temCapa: false }]);
  assert.deepEqual(retomada.aCompletar.map((c) => [c.pedido.codfilial, c.cardId]), [['2', 71]]);
  assert.equal(retomada.aGerar.length, 0);
  assert.deepEqual(periodoDoPedido('2026-11-03'), { inicio: '2026-08-03', fim: '2026-11-03' });
  assert.deepEqual(periodoDoPedido('2026-05-31'), { inicio: '2026-02-28', fim: '2026-05-31' });
});

test('C-018 / P-08: a origem possível é convertida, da mesma competência e sem complementar', () => {
  const n = (id, status, competencia, complementares = 0) => ({ id, status, competencia, complementares });
  assert.deepEqual(origensPossiveis([n(1, 'convertida', '2026-08'), n(2, 'aberta', '2026-08'), n(3, 'convertida', '2026-07'), n(4, 'convertida', '2026-08', 1)], '2026-08').map((x) => x.id), [1]);
});

test('C-019 / RN-006: meta R$ 1.200, comprado R$ 240, falta R$ 960, pedido net R$ 600, lista cheio R$ 720, com desconto R$ 720, vendido R$ 1.500', () => {
  const v = somarValores([{ ...item(), pedidoTotal: 60, compraMes: 20, vendaMes: 30 }]);
  assert.equal(v.metaSellin, 1200);
  assert.equal(v.compradoNoMes, 240);
  assert.equal(v.faltaComprar, 960);
  assert.equal(v.pedidoNet, 600);
  assert.equal(v.pedidoListaCheio, 720);
  assert.equal(v.pedidoListaDesc, 720);
  assert.equal(v.vendidoNoMes, 1500);
  assert.equal(somarValores([{ ...item({ metaSellinValor: 5000, precoLista: 15 }), pedidoTotal: 10, compraMes: 0, vendaMes: 0 }]).metaSellin, 5000, 'a meta digitada prevalece');
  assert.equal(somarValores([{ ...item({ precoListaDesc: 0 }), pedidoTotal: 0, compraMes: 0, vendaMes: 0 }]).metaSellin, 1000, 'sem preço com desconto, o net');
});

test('C-020 / RN-004: alvo 35 — 0 ruptura, 10 atenção, 35 adequado, 80 excesso, sem giro', () => {
  assert.deepEqual([0, 10, 35, 80, null].map((c) => tomCobertura(c, 35)), ['ruptura', 'atencao', 'adequado', 'excesso', 'sem-giro']);
  assert.equal(tomCobertura(17.5, 35), 'adequado', 'a metade exata não é atenção');
  assert.equal(tomCobertura(70, 35), 'adequado', 'o dobro exato não é excesso');
});

test('C-021 / RN-PG-81: o arquivo tem 17 colunas e uma linha por produto × filial, número em vírgula decimal', () => {
  const linhas = linhasCsvMesa(mesaDeDuasFiliais());
  assert.equal(COLUNAS_CSV_MESA.length, 17);
  assert.equal(linhas.length, 6);
  assert.equal(linhas.every((l) => l.length === 17), true);
  const l = linhas.find((x) => x[0] === '1818' && x[2] === 'Matriz');
  assert.equal(l[4], '5');
  assert.equal(l[8], '300,00');
  assert.equal(l[12], '24');
});

test('RN-PG-28: os fragmentos só levam dígitos — vazio vira 0 e \'-1\'', () => {
  assert.equal(listaDeCodigos([1813, '1814', 'x', 1813]), '1813,1814');
  assert.equal(listaDeCodigos([]), '0');
  assert.equal(listaDeFiliais(['1', "2'; DROP", '6']), "'1','2','6'");
  assert.equal(listaDeFiliais([]), "'-1'");
});

/* ── acompanhamento ── */

const HIST = [{ CODPROD: 1, COMPETENCIA: '2026-08', DESCRICAO: 'P1', PRECO_SELLOUT: 10, PRECO_NET: 4, PRECO_LISTA: 0, PRECO_LISTA_DESC: 5, ESTOQUE_INICIAL: 210, PREVISAO_SELLOUT: 200, PROPOSTA_SELLIN: 300, PEDIDO_ENVIADO: 240 }];
const REAL = [
  { CODPROD: 1, CODFILIAL: '1', MES: '2026-08', VENDA_REALIZADA: 100, VALOR_VENDA: 1000, COMPRA_REALIZADA: 200, VALOR_COMPRA: 900 },
  { CODPROD: 1, CODFILIAL: '2', MES: '2026-08', VENDA_REALIZADA: 50, VALOR_VENDA: 500, COMPRA_REALIZADA: 0, VALOR_COMPRA: 0 },
  { CODPROD: 1, CODFILIAL: '1', MES: '2026-05', VENDA_REALIZADA: 90, VALOR_VENDA: 0, COMPRA_REALIZADA: 0, VALOR_COMPRA: 0 },
  { CODPROD: 1, CODFILIAL: '1', MES: '2026-06', VENDA_REALIZADA: 120, VALOR_VENDA: 0, COMPRA_REALIZADA: 0, VALOR_COMPRA: 0 },
  { CODPROD: 1, CODFILIAL: '1', MES: '2026-07', VENDA_REALIZADA: 90, VALOR_VENDA: 0, COMPRA_REALIZADA: 0, VALOR_COMPRA: 0 },
];

test('C-022 / RN-012: 150 de 200 → 75 %, atenção, falta 25 %; sell-in 240 de 300 → 80 %, faltam 60 un. e R$ 300 a preço com desconto', () => {
  const [l] = juntarAcompanhamento({ historico: HIST, realizado: REAL, lancamentos: [], competencias: ['2026-08'] });
  assert.equal(l.vendaRealizada, 150);
  assert.equal(l.percentualSellout, 75);
  assert.equal(l.semaforoSellout, 'atencao');
  assert.equal(l.faltaSelloutPct, 25);
  assert.equal(l.percentualSellin, 80);
  assert.equal(l.faltaSellinUn, 60);
  assert.equal(l.faltaSellinValor, 300);
  assert.equal(l.valorSelloutProjetado, 2000);
  assert.equal(l.propostaSemDesconto, 1500, 'sem lista cheio, vale a com desconto');
  const soFilial2 = juntarAcompanhamento({ historico: HIST, realizado: REAL, lancamentos: [], competencias: ['2026-08'], filiais: ['2'] });
  assert.equal(soFilial2[0].vendaRealizada, 50, 'o realizado soma só as filiais filtradas');
});

test('C-023: a meta lançada prevalece sobre a mesa e o "antes" do histórico diz de onde veio; vazio remove; negativo é recusado', () => {
  const [l] = juntarAcompanhamento({ historico: HIST, realizado: REAL, lancamentos: [{ CODPROD: 1, COMPETENCIA: '2026-08', PREVISAO_SELLOUT: 180, POR_NOME: 'Gil' }], competencias: ['2026-08'] });
  assert.equal(l.previsaoSellout, 180);
  assert.equal(l.previsaoMesa, 200);
  quase(l.percentualSellout, 150 / 180 * 100);
  assert.deepEqual(anteriorDoSellout(l), { antes: '180', origemAnterior: 'lancado' });
  assert.deepEqual(anteriorDoSellout({ selloutLancado: null, previsaoMesa: 200 }), { antes: '200', origemAnterior: 'mesa' });
  assert.deepEqual(lerSellout(' 180,5 '), { ok: true, valor: 180.5 });
  assert.deepEqual(lerSellout(''), { ok: true, valor: null });
  assert.equal(lerSellout('-1').ok, false);
  assert.equal(textoDoHistorico({ ANTES: '200', DEPOIS: '180', ORIGEM_ANTERIOR: 'mesa' }), 'de 200 (mesa) para 180');
  assert.equal(textoDoHistorico({ ANTES: '180', DEPOIS: '', ORIGEM_ANTERIOR: 'lancado' }), 'lançamento removido (era 180)');
});

test('C-024 / RN-AG-15: a média do trimestre pelo ERP de agosto usa maio a julho, e esses meses não viram linha', () => {
  const linhas = juntarAcompanhamento({ historico: HIST, realizado: REAL, lancamentos: [], competencias: ['2026-08'] });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].mediaTriErp, 100);
  assert.deepEqual(janelaDoAcompanhamento('2026-08', 3), { competencias: ['2026-06', '2026-07', '2026-08'], inicioComTrimestre: '2026-03' });
});

test('C-025: totais pela razão das somas — (meta 100, vendeu 50) + (sem meta, vendeu 30) → 80 %', () => {
  const t = totaisAcompanhamento([
    { previsaoSellout: 100, vendaRealizada: 50, propostaSellin: 0, pedidoEnviado: 0 },
    { previsaoSellout: 0, vendaRealizada: 30, propostaSellin: 0, pedidoEnviado: 0 },
  ].map((x) => ({ valorSelloutProjetado: 0, valorVenda: 0, propostaComDesconto: 0, realizadoComDesconto: 0, compraRealizada: 0, valorCompra: 0, faltaSellinUn: 0, faltaSellinValor: 0, ...x })));
  assert.equal(t.vendaRealizada, 80);
  assert.equal(t.percentualSellout, 80);
  assert.equal(t.percentualSellin, null);
});

test('C-026: a divergência do estoque inicial — −8 contra 210, "Bate" quando igual, aviso quando a Galderma não informou', () => {
  assert.equal(textoDivergenciaEstoque(202, 210), '−8 em relação ao que a Galderma informou (210)');
  assert.equal(textoDivergenciaEstoque(215, 210), '+5 em relação ao que a Galderma informou (210)');
  assert.equal(textoDivergenciaEstoque(210, 210), 'Bate com o que a Galderma informou.');
  assert.equal(textoDivergenciaEstoque(10, 0), 'A Galderma não informou estoque inicial para este produto.');
  const [l] = juntarAcompanhamento({ historico: HIST, realizado: REAL, lancamentos: [], competencias: ['2026-08'], estoqueInicial: [{ CODPROD: 1, CODFILIAL: '1', ESTOQUE_INICIAL: 150 }, { CODPROD: 1, CODFILIAL: '2', ESTOQUE_INICIAL: 52 }], competenciaDoEstoque: '2026-08' });
  assert.equal(l.estoqueInicialErp, 202);
});

test('C-028: mês sem negociação com meta lançada continua aparecendo, marcado sem proposta', () => {
  const linhas = juntarAcompanhamento({ historico: [], realizado: [], lancamentos: [{ CODPROD: 9, COMPETENCIA: '2026-09', PREVISAO_SELLOUT: 40 }], competencias: ['2026-09'] });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].temProposta, false);
  assert.equal(linhas[0].previsaoSellout, 40);
  assert.equal(linhas[0].descricao, 'Produto 9');
});

test('RN-011: percentual sem número com meta 0, negativa ou ausente; 100 dentro, 70 atenção, 69,9 abaixo', () => {
  assert.equal(percentualDaMeta(10, 0), null);
  assert.equal(percentualDaMeta(10, -5), null);
  assert.equal(percentualDaMeta(10, null), null);
  assert.deepEqual([100, 70, 69.9, null].map(semaforoDaMeta), ['dentro', 'atencao', 'abaixo', 'sem-meta']);
  assert.equal(faltaPercentual(120), 0);
  assert.equal(faltaPercentual(null), null);
});

test('RN-012: a série mensal segue as competências do período, com zero no mês sem linha', () => {
  const linhas = juntarAcompanhamento({ historico: HIST, realizado: REAL, lancamentos: [], competencias: ['2026-07', '2026-08'] });
  assert.deepEqual(serieMensal(linhas, ['2026-07', '2026-08']), [
    { competencia: '2026-07', previsao: 0, realizado: 90, sellinProjetado: 0, sellinComprado: 0 },
    { competencia: '2026-08', previsao: 200, realizado: 150, sellinProjetado: 300, sellinComprado: 240 },
  ]);
});

/* ── composição ── */

const COMP = [
  { CODFILIAL: '1', FILIAL: 'Matriz', VALOR_SELLIN: 60000, QTD_SELLIN: 600, VALOR_VENDAS: 30000, QTD_VENDAS: 300 },
  { CODFILIAL: '2', FILIAL: 'Norte', VALOR_SELLIN: 40000, QTD_SELLIN: 100, VALOR_VENDAS: 10000, QTD_VENDAS: 100 },
];

test('C-029 / RN-014: participação 60/40 no sell-in e 75/25 nas vendas, em reais; em unidades as mesmas contas; grupo é uma linha', () => {
  const valor = montarComposicao(COMP, 'filial', 'valor');
  assert.deepEqual(valor.map((l) => [l.codfilial, l.partSellin, l.partVendas]), [['1', 60, 75], ['2', 40, 25]]);
  const qtd = montarComposicao(COMP, 'filial', 'qtd');
  assert.deepEqual(qtd.map((l) => [l.sellin, l.vendas]), [[600, 300], [100, 100]]);
  const grupo = montarComposicao(COMP, 'grupo', 'valor');
  assert.deepEqual(grupo.map((l) => [l.filial, l.sellin, l.vendas, l.partSellin]), [['Grupo', 100000, 40000, 100]]);
  assert.equal(montarComposicao([], 'filial', 'valor').length, 0);
});

test('C-030 / R-128: estoque a custo padrão — 100 × 50 e 120 × 50; produto sem custo não soma; consulta que falhou não dá valor nenhum', () => {
  const rows = [
    { CODPROD: 1, CODFILIAL: '1', FILIAL: 'Matriz', QT_DISPONIVEL: 100, QT_FISICO: 120 },
    { CODPROD: 2, CODFILIAL: '1', FILIAL: 'Matriz', QT_DISPONIVEL: 10, QT_FISICO: 10 },
  ];
  const custos = new Map([[1, { custo: 50, dataRef: '2026-10-01' }]]);
  const [f1] = valorizarEstoque(rows, custos);
  assert.equal(f1.valorDisponivel, 5000);
  assert.equal(f1.valorFisico, 6000);
  assert.equal(f1.qtDisponivel, 110);
  assert.equal(f1.semCusto, 1);
  const [erro] = valorizarEstoque(rows, null);
  assert.equal(erro.valorDisponivel, null);
  assert.equal(erro.valorFisico, null);
});

/* ── acesso ── */

test('C-031 / RN-015: ver Galderma — admin, analista, gestor e diretoria; operar — admin, analista e gestor; somente-leitura vê e não opera; comercial não vê nem tem menu', () => {
  for (const persona of ['admin', 'analista', 'gestor', 'diretoria']) assert.equal(permissoesDe(persona, 'MEMBER').verGalderma, true, persona);
  for (const persona of ['admin', 'analista', 'gestor']) assert.equal(permissoesDe(persona, 'MEMBER').operarGalderma, true, persona);
  assert.equal(permissoesDe('diretoria', 'MEMBER').operarGalderma, false);
  assert.equal(permissoesDe('comercial', 'MEMBER').verGalderma, false);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').verGalderma, true);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').operarGalderma, false);
  assert.ok(menuParaPersona(permissoesDe('analista', 'MEMBER')).some((i) => i.to === '/galderma' && i.grupo === 'Compras'));
  assert.equal(menuParaPersona(permissoesDe('comercial', 'MEMBER')).some((i) => i.to === '/galderma'), false);
});
