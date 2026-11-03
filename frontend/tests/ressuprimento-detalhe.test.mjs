// O painel de detalhe do layout legado da spec 011 (src/lib/ressuprimento-detalhe.ts):
// a série "Compras × vendas" com projeção, o rodapé, as filiais com excesso e a
// simulação de compra. Sem React, sem DOM, sem SDK.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarRessuprimento } from '../src/lib/ressuprimento.ts';
import {
  diasDoMes, filiaisComExcesso, mesesAte, rotuloMes, serieComprasVendas, simularCompra, somarMeses, totaisDoRodape,
  desconsideradasPorMes, entradaAtrasou, historicoSuficiente, mesesComMovimento, mesesDeVendas, necessidade,
  resumoDeVendas, rotuloMesLongo, serieEmCaixas, vendasDoMes, ENTRADAS_VISIVEIS, MESES_MINIMOS_HISTORICO,
} from '../src/lib/ressuprimento-detalhe.ts';

const medida = (extra = {}) => ({
  CODPROD: 5401, DESCRICAO: 'WHEY CONCENTRADO MORANGO 900 G', EMBALAGEM: 'CX 12', UNIDADE: 'UN',
  CODEPTO: 2, CODSEC: 21, UN_POR_CAIXA_ERP: 12,
  CUSTO_ULT_ENTRADA: 10, CUSTO_ATUAL: 11, CODFAB: 'FAB-5401', DT_ULT_ENTRADA: '2026-09-01', DT_ULT_SAIDA: '2026-09-15',
  ESTOQUE_TOTAL: 50, QT_BLOQUEADA: 0, QT_INDENIZ: 0, QT_RESERV: 0,
  ESTOQUE_ATUAL: 50, QT_PEDIDA_ERP: 0, QT_TRANSITO: 0, ESTOQUE_EM_TRANSITO: 0,
  LEAD_TIME_MEDIDO: 0, VENDA_PERIODO: 306, VENDA_PUBLICA: 0,
  CONSUMO_DIARIO: 2, CONSUMO_DIARIO_PUBLICO: 0, VOLATILIDADE_DIARIA: 0, ...extra,
});
const PARAMETRO_FIXO = [{ codprod: 0, coberturaDias: 35, leadTimeDias: 9, gatilhoDias: 15, silenciadoAte: '', motivoSilencio: '' }];
// R-128: o custo de compra vem do Gestão de Custos; aqui, o mesmo valor da última entrada da medida.
const custosDe = (medidas) => new Map(medidas.map((m) => [m.CODPROD, { custo: m.CUSTO_ULT_ENTRADA, dataRef: '2026-01-01' }]));
const linha = (extra = {}) => montarRessuprimento([medida(extra)], PARAMETRO_FIXO, () => 35, new Map(), {
  codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false,
}, custosDe([medida(extra)]))[0];

test('calendário: set/26, um mês antes de jan/2026 é dez/2025, fevereiro de 2026 tem 28 dias e os 3 meses até 16/09 são jul, ago e set', () => {
  assert.equal(rotuloMes('2026-09'), 'set/26');
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(somarMeses('2026-11', 2), '2027-01');
  assert.equal(diasDoMes('2026-02'), 28);
  assert.deepEqual(mesesAte('2026-09-16', 3), ['2026-07', '2026-08', '2026-09']);
});

test('C-032: a série de 6 meses tem 6 pontos medidos (zero onde não houve movimento) mais o mês seguinte projetado a consumo diário × dias do mês, cada série só na sua coluna', () => {
  const historico = [
    { MES: '2026-08', SAIDAS: 10, ENTRADAS: 24, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-09', SAIDAS: 20, ENTRADAS: 0, SAIDAS_PUBLICAS: 4 },
  ];
  const serie = serieComprasVendas(historico, '2026-09-16', 6, 2);
  assert.equal(serie.length, 7);
  assert.deepEqual(serie.map((p) => p.mes), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(serie[4], { mes: '2026-08', rotulo: 'ago/26', compras: 24, vendas: 10, projecao: null, desconsideradas: null });
  assert.deepEqual(serie[0], { mes: '2026-04', rotulo: 'abr/26', compras: 0, vendas: 0, projecao: null, desconsideradas: null });
  assert.deepEqual(serie[6], { mes: '2026-10', rotulo: 'out/26', compras: null, vendas: null, projecao: 62, desconsideradas: null });
  assert.equal(serieComprasVendas(historico, '2026-09-16', 13, 2).length, 14);
});

test('C-032: o rodapé soma 3, 6 e 12 meses de vendas e compras e projeta o próximo mês', () => {
  const historico = [
    { MES: '2025-10', SAIDAS: 100, ENTRADAS: 100, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-05', SAIDAS: 7, ENTRADAS: 12, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-08', SAIDAS: 10, ENTRADAS: 24, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-09', SAIDAS: 20, ENTRADAS: 0, SAIDAS_PUBLICAS: 4 },
  ];
  assert.deepEqual(totaisDoRodape(historico, '2026-09-16', 2), {
    vendas3m: 30, vendas6m: 37, vendas12m: 137,
    compras3m: 24, compras6m: 36, compras12m: 136,
    projecaoMes: 62,
  });
});

test('RN-025 / C-033: filial com cobertura acima do teto de 42 dias ou com estoque sem giro tem excesso; a filial da tela e as abaixo do teto não', () => {
  const posicoes = [
    { CODFILIAL: '1', FILIAL: 'Matriz', ESTOQUE_TOTAL: 500, ESTOQUE_ATUAL: 500, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 9, DT_ULT_SAIDA: null },
    { CODFILIAL: '2', FILIAL: 'Norte', ESTOQUE_TOTAL: 120, ESTOQUE_ATUAL: 120, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 90, DT_ULT_SAIDA: '2026-09-01' },
    { CODFILIAL: '3', FILIAL: 'Sul', ESTOQUE_TOTAL: 35, ESTOQUE_ATUAL: 35, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 90, DT_ULT_SAIDA: '2026-09-01' },
    { CODFILIAL: '4', FILIAL: 'Oeste', ESTOQUE_TOTAL: 10, ESTOQUE_ATUAL: 10, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 0, DT_ULT_SAIDA: null },
    { CODFILIAL: '5', FILIAL: 'Vazia', ESTOQUE_TOTAL: 0, ESTOQUE_ATUAL: 0, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 0, DT_ULT_SAIDA: null },
  ];
  const excesso = filiaisComExcesso(posicoes, '1', 42);
  assert.deepEqual(excesso.map((f) => f.codfilial), ['4', '2'], 'sem giro primeiro, depois a maior cobertura');
  assert.equal(excesso[0].coberturaDias, null);
  assert.equal(excesso[1].coberturaDias, 120);
});

test('C-034: simular 50 unidades com caixa de 12 compra 60 (5 caixas) por R$ 600, leva a cobertura a 55 dias e o nível a 157 %', () => {
  const s = simularCompra(linha(), 50);
  assert.equal(s.quantidade, 60);
  assert.equal(s.caixas, 5);
  assert.equal(s.total, 600);
  assert.equal(s.coberturaFuturaDias, 55);
  assert.equal(Math.round(s.nivelFuturoPct), 157);
  assert.equal(simularCompra(linha({ CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }), 12).coberturaFuturaDias, null, 'sem giro não há cobertura');
});

/* ── R-123 — a janela "Análise do Produto" (C-042) ─────────────────────── */

const VENDAS = [
  { NUMTRANSITEM: 1, DTMOV: '2026-10-05', QUANTIDADE: 10, PRECO_VENDA: 20, VALOR_TOTAL: 200, CODCLI: 9301, CLIENTE: 'A', CODUSUR: 1, VENDEDOR: 'Carla', PUBLICO: 0 },
  { NUMTRANSITEM: 2, DTMOV: '2026-10-20', QUANTIDADE: 60, PRECO_VENDA: 20, VALOR_TOTAL: 1200, CODCLI: 9303, CLIENTE: 'B', CODUSUR: 2, VENDEDOR: 'Diego', PUBLICO: 0 },
  { NUMTRANSITEM: 3, DTMOV: '2026-09-02', QUANTIDADE: 5, PRECO_VENDA: 20, VALOR_TOTAL: 100.5, CODCLI: 9301, CLIENTE: 'A', CODUSUR: 1, VENDEDOR: 'Carla', PUBLICO: 1 },
];

test('C-042: a aba Vendas agrupa por mês do mais recente ao mais antigo ("Outubro de 2026 · 2 vendas · R$ 1.400"), filtra por mês e resume o que está fora da demanda', () => {
  assert.equal(rotuloMesLongo('2026-10'), 'Outubro de 2026');
  assert.equal(rotuloMesLongo('x'), 'x');
  assert.deepEqual(mesesDeVendas(VENDAS), [
    { mes: '2026-10', rotulo: 'Outubro de 2026', vendas: 2, valor: 1400 },
    { mes: '2026-09', rotulo: 'Setembro de 2026', vendas: 1, valor: 100.5 },
  ]);
  assert.deepEqual(vendasDoMes(VENDAS, '2026-09').map((v) => v.NUMTRANSITEM), [3]);
  assert.equal(vendasDoMes(VENDAS, '').length, 3);
  assert.deepEqual(resumoDeVendas(VENDAS, [2, 999]), { listadas: 3, quantidadeDesconsiderada: 60, valorDesconsiderado: 1200 });
  assert.deepEqual(resumoDeVendas([], []), { listadas: 0, quantidadeDesconsiderada: 0, valorDesconsiderado: 0 });
});

test('C-042: a série "Desconsideradas" soma as vendas fora da demanda por mês e entra no gráfico só quando pedida; em caixas, cada valor é dividido pela caixa com 1 decimal', () => {
  const fora = desconsideradasPorMes([{ dtmov: '2026-09-10', quantidade: 6 }, { dtmov: '2026-09-11', quantidade: 4 }, { dtmov: '2026-08-01', quantidade: 1 }]);
  assert.deepEqual([...fora.entries()], [['2026-09', 10], ['2026-08', 1]]);
  const historico = [{ MES: '2026-09', SAIDAS: 20, ENTRADAS: 24, SAIDAS_PUBLICAS: 0 }];
  const serie = serieComprasVendas(historico, '2026-09-16', 6, 2, fora);
  assert.equal(serie[5].desconsideradas, 10);
  assert.equal(serie[4].desconsideradas, 1);
  assert.equal(serie[0].desconsideradas, 0, 'mês sem desconsiderada é zero quando a série foi pedida');
  assert.equal(serie[6].desconsideradas, null, 'a projeção não tem desconsiderada');
  assert.equal(serieComprasVendas(historico, '2026-09-16', 6, 2)[5].desconsideradas, null);
  const caixas = serieEmCaixas(serie, 12);
  assert.deepEqual([caixas[5].compras, caixas[5].vendas, caixas[5].desconsideradas, caixas[6].projecao, caixas[6].compras], [2, 1.7, 0.8, 5.2, null]);
  assert.deepEqual(serieEmCaixas(serie, 1), serie, 'avulso não divide');
});

test('C-042: com menos de 3 meses com movimento o histórico não sustenta leitura; a entrada que chegou depois da previsão fica em atenção; a necessidade é o que falta ao máximo, inteira e nunca negativa', () => {
  assert.equal(MESES_MINIMOS_HISTORICO, 3);
  const dois = [{ MES: '2026-08', SAIDAS: 1, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 }, { MES: '2026-09', SAIDAS: 0, ENTRADAS: 5, SAIDAS_PUBLICAS: 0 }, { MES: '2026-07', SAIDAS: 0, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 }];
  assert.equal(mesesComMovimento(dois), 2);
  assert.equal(historicoSuficiente(dois), false);
  assert.equal(historicoSuficiente([...dois, { MES: '2026-06', SAIDAS: 3, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 }]), true);
  assert.equal(entradaAtrasou({ DT_ENTRADA: '2026-09-04', DT_PREVISAO: '2026-09-02' }), true);
  assert.equal(entradaAtrasou({ DT_ENTRADA: '2026-09-04', DT_PREVISAO: '2026-09-10' }), false);
  assert.equal(entradaAtrasou({ DT_ENTRADA: '2026-09-04', DT_PREVISAO: '' }), false, 'sem previsão não há atraso');
  assert.equal(ENTRADAS_VISIVEIS, 5);
  assert.equal(necessidade({ estoqueMaximo: 70, estoqueAtual: 30, emTransito: 0 }), 40);
  assert.equal(necessidade({ estoqueMaximo: 52.5, estoqueAtual: 30, emTransito: 10 }), 13);
  assert.equal(necessidade({ estoqueMaximo: 20, estoqueAtual: 30, emTransito: 0 }), 0);
  assert.equal(necessidade(linha()), 20, 'a linha do caso base: máximo 70, 50 disponível');
});

test('R-124: com a projeção do modelo, a última barra e o rodapé usam ela no lugar de consumo × dias do mês; negativa vira 0; sem ela, nada muda', () => {
  const historico = [{ MES: '2026-09', SAIDAS: 20, ENTRADAS: 24, SAIDAS_PUBLICAS: 0 }];
  assert.equal(serieComprasVendas(historico, '2026-09-16', 6, 2, undefined, 123.4)[6].projecao, 123);
  assert.equal(serieComprasVendas(historico, '2026-09-16', 6, 2, undefined, -5)[6].projecao, 0);
  assert.equal(serieComprasVendas(historico, '2026-09-16', 6, 2, undefined, null)[6].projecao, 62);
  assert.equal(totaisDoRodape(historico, '2026-09-16', 2, 123.4).projecaoMes, 123);
  assert.equal(totaisDoRodape(historico, '2026-09-16', 2).projecaoMes, 62);
});

test('R-133: clientes que compraram — os 10 que mais levaram no mês, cada um com as vendas dele, da mais recente', async () => {
  const { clientesQueCompraram } = await import('../src/lib/ressuprimento-detalhe.ts');
  const venda = (n, dtmov, codcli, qt, valor) => ({ NUMTRANSITEM: n, DTMOV: dtmov, QUANTIDADE: qt, PRECO_VENDA: 0, VALOR_TOTAL: valor, CODCLI: codcli, CLIENTE: `C${codcli}`, PUBLICO: 0 });
  const vendas = [
    venda(1, '2026-09-10', 9, 10, 100), venda(2, '2026-10-02', 9, 5, 50), venda(3, '2026-10-05', 12, 30, 300),
    venda(4, '2026-10-20', 9, 40, 400), venda(5, '2026-10-21', 0, 1, 10),
  ];
  const outubro = clientesQueCompraram(vendas, '2026-10');
  assert.deepEqual(outubro.map((c) => [c.codcli, c.quantidade, c.valor]), [[9, 45, 450], [12, 30, 300], [0, 1, 10]]);
  assert.deepEqual(outubro[0].vendas.map((v) => v.NUMTRANSITEM), [4, 2], 'a mais recente primeiro');
  assert.equal(outubro[2].cliente, 'C0');
  assert.deepEqual(clientesQueCompraram(vendas, '').map((c) => c.codcli), [9, 12, 0], 'sem mês: o período todo');
  assert.equal(clientesQueCompraram(vendas, '', 2).length, 2);
});
