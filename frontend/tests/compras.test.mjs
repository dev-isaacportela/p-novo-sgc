// Regra de compra da spec 003 (src/lib/compras.ts): sugestão, arredondamento
// por caixa, curva ABC, cobertura futura e total do pedido. Sem React, sem
// DOM, sem SDK — cada `test` cita o cenário/regra da spec no título.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mesesDoPeriodo, sugestaoDeCompra, unidadesPorCaixa, arredondarPorCaixa,
  curvaAbc, coberturaFuturaDias, totalDoPedido, montarItens,
} from '../src/lib/compras.ts';

const linha = (codprod, vendaPeriodo, custo, extra = {}) => ({
  CODPROD: codprod, DESCRICAO: `PRODUTO ${codprod}`, EMBALAGEM: 'CX 12', UNIDADE: 'UN',
  CODEPTO: 2, CODSEC: 21, UN_POR_CAIXA_ERP: 0, ESTOQUE: 0, TRANSITO: 0,
  VENDA_PERIODO: vendaPeriodo, VENDA_LICITACAO: 0, CUSTO_ULT_ENTRADA: custo, ...extra,
});

test('mesesDoPeriodo: 01/08 a 14/09/2026 são 45 dias, ou 1,5 mês; período inválido não quebra a tela', () => {
  assert.equal(mesesDoPeriodo('2026-08-01', '2026-09-14'), 1.5);
  assert.equal(mesesDoPeriodo('2026-09-14', '2026-08-01'), 1, 'fim antes do início cai no mínimo');
  assert.equal(mesesDoPeriodo('', ''), 1);
});

test('C-002: produto que vendeu 18 em 45 dias (12 por mês), com 5 em estoque e 2 em trânsito, sugere 21', () => {
  assert.equal(sugestaoDeCompra(18, 5, 2, 1.5), 21);
});

test('C-003: giro lento (6 em 45 dias, 4 por mês) compra 2,5 meses e sugere 10', () => {
  assert.equal(sugestaoDeCompra(6, 0, 0, 1.5), 10);
});

test('C-005: estoque de 30 já cobre a necessidade de 24 — a sugestão é 0, não 1', () => {
  assert.equal(sugestaoDeCompra(18, 30, 0, 1.5), 0);
});

test('C-004: sugestão 21 com caixa de 12 vira 24 (2 caixas cheias); com 1 unidade por caixa continua 21', () => {
  assert.equal(arredondarPorCaixa(21, 12), 24);
  assert.equal(arredondarPorCaixa(21, 1), 21);
  assert.equal(arredondarPorCaixa(0, 12), 0, 'sugestão zero não vira uma caixa');
});

test('C-006: cinco produtos com valor de venda 500, 250, 150, 70 e 30 viram A, A, B, C, C (cortes de 80 % e 95 %)', () => {
  const linhas = [
    linha(1, 50, 10), linha(2, 25, 10), linha(3, 15, 10), linha(4, 7, 10), linha(5, 3, 10),
  ];
  const curvas = curvaAbc(linhas);
  assert.deepEqual([1, 2, 3, 4, 5].map((cod) => curvas.get(cod)), ['A', 'A', 'B', 'C', 'C']);
});

test('C-007: venda 45 em 1,5 mês, 10 em estoque e 30 pedidos dão 40 dias de cobertura futura', () => {
  assert.equal(coberturaFuturaDias(45, 10, 0, 30, 1.5), 40);
});

test('RN-001: a tabela de sugestão da spec — (0,0,0,6)→0; (120,10,0,6)→30; (12,0,0,6)→5; (120,50,20,6)→10; (120,500,0,6)→0', () => {
  assert.equal(sugestaoDeCompra(0, 0, 0, 6), 0);
  assert.equal(sugestaoDeCompra(120, 10, 0, 6), 30);
  assert.equal(sugestaoDeCompra(12, 0, 0, 6), 5);
  assert.equal(sugestaoDeCompra(120, 50, 20, 6), 10);
  assert.equal(sugestaoDeCompra(120, 500, 0, 6), 0);
});

test('RN-001: o trânsito reduz a posição de estoque, e posição maior que a necessidade nunca vira sugestão negativa', () => {
  assert.equal(sugestaoDeCompra(18, 5, 2, 1.5), 21, 'posição 3, não 5');
  assert.equal(sugestaoDeCompra(18, 5, 50, 1.5), 24, 'trânsito maior que o estoque zera a posição, não a torna negativa');
  assert.equal(sugestaoDeCompra(18, 1000, 0, 1.5), 0);
});

test('RN-002: "CX 12" dá 12; "FRASCO 100 ML" dá 1; a gestão de custos vence a embalagem', () => {
  assert.equal(unidadesPorCaixa({ EMBALAGEM: 'CX 12', UN_POR_CAIXA_ERP: 0 }), 12);
  assert.equal(unidadesPorCaixa({ EMBALAGEM: 'CAIXA COM 24', UN_POR_CAIXA_ERP: 0 }), 24);
  assert.equal(unidadesPorCaixa({ EMBALAGEM: 'FRASCO 100 ML', UN_POR_CAIXA_ERP: 0 }), 1);
  assert.equal(unidadesPorCaixa({ EMBALAGEM: 'CX 12', UN_POR_CAIXA_ERP: 0 }, 6), 6);
  assert.equal(unidadesPorCaixa({ EMBALAGEM: 'CX 12', UN_POR_CAIXA_ERP: 8 }), 8, 'o cadastro do ERP vem antes da embalagem');
});

test('RN-003: lista vazia dá mapa vazio; todos com valor zero são C', () => {
  assert.equal(curvaAbc([]).size, 0);
  const semValor = curvaAbc([linha(1, 10, 0), linha(2, 20, 0)]);
  assert.deepEqual([...semValor.values()], ['C', 'C']);
});

test('RN-004: venda 180 em 6 meses com 10 de estoque, 5 em trânsito e 20 pedidos dá 25 dias; sem venda, não há cobertura', () => {
  assert.equal(coberturaFuturaDias(180, 10, 5, 20, 6), 25);
  assert.equal(coberturaFuturaDias(0, 100, 0, 50, 6), null);
});

test('RN-008: três itens (10 × 2,50; 4 × 10,00; 0 × 8,00) totalizam 65,00', () => {
  assert.equal(totalDoPedido([
    { qtPedida: 10, precoCusto: 2.5 },
    { qtPedida: 4, precoCusto: 10 },
    { qtPedida: 0, precoCusto: 8 },
  ]), 65);
  assert.equal(totalDoPedido([]), 0);
});

test('C-001/C-004 e RN-009 (012): montarItens junta sugestão, arredondamento, curva e o teto DA CURVA do item numa passada só', () => {
  const linhas = [
    linha(5001, 18, 10, { ESTOQUE: 5, TRANSITO: 2, EMBALAGEM: 'CX 12' }),
    linha(5002, 6, 10, { EMBALAGEM: 'FRASCO 100 ML' }),
  ];
  // A parametrização de referência do seed (R-089): departamento 2 = A 35/20 %,
  // B 45/10 %, C 60/5 %; sku 5001 = A 20/0, B 25/0, C 30/0.
  const curvas = (a, b, c) => ({
    A: { alvoDias: a[0], toleranciaPct: a[1] },
    B: { alvoDias: b[0], toleranciaPct: b[1] },
    C: { alvoDias: c[0], toleranciaPct: c[1] },
  });
  const coberturas = [
    { id: 1, nivel: 'departamento', codigo: '2', descricao: 'NUTRICAO', ativo: true, curvas: curvas([35, 20], [45, 10], [60, 5]) },
    { id: 2, nivel: 'sku', codigo: '5001', descricao: 'CREME', ativo: true, curvas: curvas([20, 0], [25, 0], [30, 0]) },
  ];
  const itens = montarItens(linhas, coberturas, new Map([[5001, 12]]), { inicio: '2026-08-01', fim: '2026-09-14' }, 1015);

  assert.equal(itens.length, 2);
  assert.equal(itens[0].qtSugerida, 24, 'sugestão 21 arredondada para 2 caixas de 12');
  assert.equal(itens[0].curvaAbc, 'A');
  assert.equal(itens[0].coberturaLimite, 20, 'curva A do SKU (20 + 0 %) vence o departamento');
  assert.equal(itens[0].qtPedida, 0, 'abrir a análise não decide quantidade nenhuma (D-014)');
  assert.equal(itens[1].qtSugerida, 10, 'giro lento, sem caixa: a sugestão não é arredondada');
  assert.equal(itens[1].curvaAbc, 'C');
  assert.equal(itens[1].coberturaLimite, 63, 'sem linha de SKU, vale a curva C do departamento: 60 + 5 %');
});
