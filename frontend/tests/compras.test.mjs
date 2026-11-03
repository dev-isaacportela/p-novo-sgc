// Regra de compra da spec 003 (src/lib/compras.ts): sugestão, arredondamento
// por caixa, curva ABC, cobertura futura e total do pedido. Sem React, sem
// DOM, sem SDK — cada `test` cita o cenário/regra da spec no título.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mesesDoPeriodo, sugestaoDeCompra, unidadesPorCaixa, arredondarPorCaixa, origemUnidadesPorCaixa,
  curvaAbc, coberturaFuturaDias, totalDoPedido, montarItens, itemDeLinha, itemDeProdutoBuscado,
  curvaPorValor, piorCurva, custoPadraoDe, mapaDeCustoPadrao, rotuloSemCusto, vendaBaseDoItem,
} from '../src/lib/compras.ts';
import { sugestaoNaUnidade } from '../src/lib/analise-pedido.ts';

const linha = (codprod, vendaPeriodo, custo, extra = {}) => ({
  CODPROD: codprod, DESCRICAO: `PRODUTO ${codprod}`, EMBALAGEM: 'CX 12', UNIDADE: 'UN',
  CODEPTO: 2, CODSEC: 21, UN_POR_CAIXA_ERP: 0, ESTOQUE: 0, TRANSITO: 0,
  VENDA_PERIODO: vendaPeriodo, VENDA_LICITACAO: 0, CUSTO_ULT_ENTRADA: custo, ...extra,
});

test('R-134: mesesDoPeriodo — (fim − início) ÷ 30,44 com duas casas, no mínimo 1; período ausente ou inválido vale 3', () => {
  assert.equal(mesesDoPeriodo('2026-08-01', '2026-09-14'), 1.45, '44 dias');
  assert.equal(mesesDoPeriodo('2026-01-01', '2026-07-01'), 5.95, '181 dias');
  assert.equal(mesesDoPeriodo('2026-09-01', '2026-09-10'), 1, 'menos de um mês vale 1');
  assert.equal(mesesDoPeriodo('2026-09-14', '2026-08-01'), 3, 'fim antes do início');
  assert.equal(mesesDoPeriodo('', ''), 3, 'sem período');
});

test('C-002 (R-134): vendeu 18 em 1,5 mês (0,4 por dia), com 5 em estoque e 2 em trânsito — alvo 35: necessidade 14, posição 7, sugere 7', () => {
  assert.equal(sugestaoDeCompra(18, 5, 2, 1.5), 7);
});

test('C-003 (R-134): o giro lento compra pelo mesmo alvo — 6 em 1,5 mês, alvo 35, sugere 5; com alvo 60, 8 (saiu o alvo de 2,5 meses)', () => {
  assert.equal(sugestaoDeCompra(6, 0, 0, 1.5), 5);
  assert.equal(sugestaoDeCompra(6, 0, 0, 1.5, 60), 8);
});

test('C-005 (R-134): estoque de 30 já cobre a necessidade de 14 — a sugestão é 0', () => {
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

test('RN-001 (R-134): fórmula do legado — venda 120 em 6 meses, estoque 10, alvo 35: necessidade ceil(120/6/30 × 35) = 24, sugere 14; alvo 60 → 30; sem venda → 0', () => {
  assert.equal(sugestaoDeCompra(120, 10, 0, 6, 35), 14);
  assert.equal(sugestaoDeCompra(120, 10, 0, 6), 14, 'sem regra, alvo 35');
  assert.equal(sugestaoDeCompra(120, 10, 0, 6, 60), 30);
  assert.equal(sugestaoDeCompra(0, 0, 0, 6, 35), 0);
  assert.equal(sugestaoDeCompra(120, 500, 0, 6, 35), 0, 'nunca negativa');
});

test('RN-001 (R-134): a base é a venda válida SEM o público — com 60 dos 120 para órgão público, sugere 2', () => {
  assert.equal(vendaBaseDoItem({ qtVendaTotal: 120, qtVendaLicitacao: 60 }), 60);
  assert.equal(sugestaoDeCompra(vendaBaseDoItem({ qtVendaTotal: 120, qtVendaLicitacao: 60 }), 10, 0, 6, 35), 2);
  assert.equal(vendaBaseDoItem({ qtVendaTotal: 10, qtVendaLicitacao: 30 }), 0, 'nunca negativa');
});

test('RN-001 (R-134): o trânsito SOMA à posição — 10 em estoque e 5 em trânsito sugerem 9; trânsito negativo não desconta', () => {
  assert.equal(sugestaoDeCompra(120, 10, 5, 6, 35), 9);
  assert.equal(sugestaoDeCompra(120, 10, -5, 6, 35), 14);
  assert.equal(sugestaoDeCompra(18, 1000, 0, 1.5), 0);
});

test('RN-001 (R-134): 4 por dia × 35 dá 140, não 141 — o produto é arredondado a 6 casas antes do teto', () => {
  // 136,8 em 1,14 mês: 4 por dia, mas 136,8/1,14/30 × 35 = 140,00000000000003 em ponto flutuante.
  assert.equal(sugestaoDeCompra(136.8, 0, 0, 1.14, 35), 140);
});

test('RN-002 (R-134): em Caixa cheia a sugestão sobe ao múltiplo da caixa de 12 (14 → 24); em Embalagem mínima, não sobe', () => {
  assert.equal(sugestaoNaUnidade(14, 12, 'caixa'), 24);
  assert.equal(sugestaoNaUnidade(14, 12, 'embalagem'), 14);
  assert.equal(sugestaoNaUnidade(0, 12, 'caixa'), 0);
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

test('RN-004 (R-134): venda 180 em 6 meses (1 por dia) com 10 de estoque, 5 em trânsito e 20 pedidos dá 35 dias — o trânsito soma; sem venda, não há cobertura', () => {
  assert.equal(coberturaFuturaDias(180, 10, 5, 20, 6), 35);
  assert.equal(coberturaFuturaDias(0, 100, 0, 50, 6), null);
});

test('RN-004 (R-134): a mesma base dos dois lados — comprar a sugestão leva ao alvo, uma unidade a menos fica abaixo dele', () => {
  const sugestao = sugestaoDeCompra(120, 10, 0, 6, 35);
  assert.ok(coberturaFuturaDias(120, 10, 0, sugestao, 6) >= 35);
  assert.ok(coberturaFuturaDias(120, 10, 0, sugestao - 1, 6) < 35);
});

test('RN-008: três itens (10 × 2,50; 4 × 10,00; 0 × 8,00) totalizam 65,00', () => {
  assert.equal(totalDoPedido([
    { qtPedida: 10, precoCusto: 2.5 },
    { qtPedida: 4, precoCusto: 10 },
    { qtPedida: 0, precoCusto: 8 },
  ]), 65);
  assert.equal(totalDoPedido([]), 0);
});

test('C-001 e RN-009 (012) (R-134): montarItens junta sugestão pelo alvo da curva, curva, teto e a origem da cobertura numa passada só', () => {
  const linhas = [
    linha(5001, 18, 10, { ESTOQUE: 5, TRANSITO: 2, QT_PEDIDA_ERP: 1, EMBALAGEM: 'CX 12' }),
    linha(5002, 6, 10, { EMBALAGEM: 'FRASCO 100 ML' }),
    linha(5003, 30, 10, { VENDA_LICITACAO: 30 }),
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

  assert.equal(itens.length, 3);
  // 1,45 mês: 18/1,45/30 = 0,414 por dia × alvo 20 (curva A do SKU) = 8,28 → 9; posição 5 + 2 + 1 = 8 → 1.
  assert.equal(itens[0].qtTransito, 3, 'o trânsito soma o pedido ao ERP');
  assert.equal(itens[0].qtSugerida, 1, 'em unidades: a caixa cheia arredonda só na tela');
  assert.equal(itens[0].curvaAbc, 'A');
  assert.equal(itens[0].coberturaAlvo, 20);
  assert.equal(itens[0].coberturaLimite, 20, 'curva A do SKU (20 + 0 %) vence o departamento');
  assert.equal(itens[0].coberturaOrigem, 'Produto · curva A');
  assert.equal(itens[0].qtPedida, 0, 'abrir a análise não decide quantidade nenhuma (D-014)');
  // 6/1,45/30 = 0,138 por dia × alvo 60 (curva C do departamento) = 8,28 → 9.
  assert.equal(itens[1].qtSugerida, 9);
  assert.equal(itens[1].curvaAbc, 'C');
  assert.equal(itens[1].coberturaLimite, 63, 'sem linha de SKU, vale a curva C do departamento: 60 + 5 %');
  assert.equal(itens[1].coberturaOrigem, 'Departamento · curva C');
  assert.equal(itens[2].qtSugerida, 0, 'toda a venda foi pública: sem base, sem sugestão');
  assert.equal(itens[2].coberturaDias, 0);
});

// 003 / D-32 (R-104, integração da onda 4): o produto adicionado por busca herda
// a parametrização carregada na aba — curva C, a mais tolerante (RN-003) — e só
// cai no padrão 35 quando não há linha nenhuma.
test('D-32: itemDeProdutoBuscado herda o teto do departamento (curva C) e só sem parametrização cai no padrão', () => {
  const curvas = (a, b, c) => ({
    A: { alvoDias: a[0], toleranciaPct: a[1] },
    B: { alvoDias: b[0], toleranciaPct: b[1] },
    C: { alvoDias: c[0], toleranciaPct: c[1] },
  });
  const coberturas = [
    { id: 1, nivel: 'departamento', codigo: '2', descricao: 'NUTRICAO', ativo: true, curvas: curvas([35, 20], [45, 10], [60, 5]) },
  ];
  const buscado = { CODPROD: 5009, DESCRICAO: 'NOVO', EMBALAGEM: 'CX 6', UNIDADE: 'UN', CODEPTO: 2, CODSEC: 21, ESTOQUE: 3, CUSTO_ULT_ENTRADA: 9 };

  assert.equal(itemDeProdutoBuscado(buscado, coberturas, 1015).coberturaLimite, 63, 'curva C do departamento 2: 60 + 5 %');
  assert.equal(itemDeProdutoBuscado(buscado, [], 1015).coberturaLimite, 35, 'sem parametrização vale o padrão');
  assert.equal(itemDeProdutoBuscado({ ...buscado, CODEPTO: 9 }, coberturas, 1015).coberturaLimite, 35, 'departamento sem linha cai no padrão');
});

// 008 (RF-022, R-054/R-068): a origem do item é dado da linha, não da tela.
test('RF-022: itemDeLinha lê ID_SOLICITACAO e SOLICITACAO_VENDEDOR; item sem solicitação fica 0 e vazio', () => {
  const base = { CODPROD: 5301, DESCRICAO: 'CREME', QT_PEDIDA: 24 };
  const comOrigem = itemDeLinha({ ...base, ID_SOLICITACAO: 7, SOLICITACAO_VENDEDOR: 'Leo Vendas' });
  assert.equal(comOrigem.idSolicitacao, 7);
  assert.equal(comOrigem.solicitacaoDe, 'Leo Vendas');

  const semOrigem = itemDeLinha(base);
  assert.equal(semOrigem.idSolicitacao, 0, 'coluna ausente não vira NaN');
  assert.equal(semOrigem.solicitacaoDe, '', 'sem vendedor a etiqueta não aparece');
});

test('R-120 / RN-002: a origem das unidades por caixa segue a mesma cadeia — gestão de custos, cadastro do ERP, embalagem, avulso', () => {
  const l = (EMBALAGEM, UN_POR_CAIXA_ERP) => ({ EMBALAGEM, UN_POR_CAIXA_ERP });
  assert.equal(origemUnidadesPorCaixa(l('CX 12', 24), 6), 'gestao');
  assert.equal(origemUnidadesPorCaixa(l('CX 12', 24)), 'erp');
  assert.equal(origemUnidadesPorCaixa(l('CX 12', 0)), 'embalagem');
  assert.equal(origemUnidadesPorCaixa(l('FRASCO 100 ML', 0)), 'avulso');
  assert.equal(origemUnidadesPorCaixa(l('FRASCO 100 ML', 1), 1), 'avulso', '1 não é caixa');
});

test('R-122: curvaPorValor é a régua de curvaAbc sobre qualquer valor (500/250/150/70/30 → A,A,B,C,C; negativo vale zero; sem total, todos C) e piorCurva devolve a letra mais ao fim', () => {
  const itens = [[1, 500], [2, 250], [3, 150], [4, 70], [5, 30]].map(([codprod, valor]) => ({ codprod, valor }));
  const curvas = curvaPorValor(itens);
  assert.deepEqual([1, 2, 3, 4, 5].map((cod) => curvas.get(cod)), ['A', 'A', 'B', 'C', 'C']);
  assert.deepEqual(curvas, curvaAbc([1, 2, 3, 4, 5].map((cod, i) => linha(cod, [50, 25, 15, 7, 3][i], 10))), 'a mesma régua da 003');
  // 400/100/100 somam 600: 0,67 → A, 0,83 → B, 1,0 → C; o negativo vale zero e fica no fim, C.
  const comPrejuizo = curvaPorValor([{ codprod: 1, valor: -100 }, { codprod: 2, valor: 400 }, { codprod: 3, valor: 100 }, { codprod: 4, valor: 100 }]);
  assert.deepEqual([1, 2, 3, 4].map((cod) => comPrejuizo.get(cod)), ['C', 'A', 'B', 'C']);
  assert.deepEqual([...curvaPorValor([{ codprod: 1, valor: 0 }]).values()], ['C']);
  assert.equal(curvaPorValor([]).size, 0);
  assert.equal(piorCurva('A', 'C'), 'C');
  assert.equal(piorCurva('B', 'A'), 'B');
  assert.equal(piorCurva('B', 'B'), 'B');
});

test('R-128: o custo de compra é o custo padrão do Gestão de Custos — a data mais recente vence; sem linha é "Sem custo" (0); a consulta que falhou deixa TODOS em "Erro custo" (0); antes de vir, "…"; nunca o ERP', () => {
  const mapa = mapaDeCustoPadrao([
    { CODPROD: 54, CUSTO: 51.1, DATA_REF: '2025-01-01' },
    { CODPROD: 54, CUSTO: 57.23, DATA_REF: '2026-01-01' },
    { CODPROD: 7, CUSTO: 0, DATA_REF: '2026-01-01' },
  ]);
  assert.deepEqual(custoPadraoDe(mapa, 54), { valor: 57.23, dataRef: '2026-01-01', origem: 'gestao' });
  assert.deepEqual(custoPadraoDe(mapa, 99), { valor: 0, dataRef: '', origem: 'sem' });
  assert.equal(custoPadraoDe(mapa, 7).origem, 'sem', 'custo zero conta como sem custo');
  assert.deepEqual(custoPadraoDe(null, 54), { valor: 0, dataRef: '', origem: 'erro' });
  assert.equal(custoPadraoDe(undefined, 54).origem, 'carregando');
  assert.equal(rotuloSemCusto(custoPadraoDe(mapa, 54)), null);
  assert.equal(rotuloSemCusto(custoPadraoDe(mapa, 99)), 'Sem custo');
  assert.equal(rotuloSemCusto(custoPadraoDe(null, 54)), 'Erro custo');
});

test('R-128: na montagem do pedido (003) o item nasce com o custo padrão do Gestão de Custos e a curva pesa venda × esse custo; sem linha lá, custo 0', () => {
  const linhas = [linha(1, 50, 10), linha(2, 25, 10)];
  const custos = new Map([[1, { custo: 12, dataRef: '2026-01-01' }]]);
  const itens = montarItens(linhas, [], new Map(), { inicio: '2026-08-01', fim: '2026-09-14' }, 1042, custos);
  assert.equal(itens[0].precoCusto, 12);
  assert.equal(itens[1].precoCusto, 0, 'sem custo padrão: 0, nunca o da última entrada');
  // Só o 1 tem custo: ele leva 100 % do valor (C pelo corte de 95 %), e o 2, sem custo, também fica em C — a curva já não usa a última entrada.
  assert.equal(itens[1].curvaAbc, 'C');
  // Cinco produtos com a mesma última entrada (10): pela última entrada seriam A, A, B, C, C; pelo custo
  // padrão (1, 1, 1, 1, 100) os valores são 50, 25, 15, 7 e 300 → B, B, C, C, A.
  const cinco = [linha(1, 50, 10), linha(2, 25, 10), linha(3, 15, 10), linha(4, 7, 10), linha(5, 3, 10)];
  const padrao = new Map([1, 2, 3, 4, 5].map((c) => [c, { custo: c === 5 ? 100 : 1, dataRef: '2026-01-01' }]));
  assert.deepEqual(montarItens(cinco, [], new Map(), { inicio: '2026-08-01', fim: '2026-09-14' }, 1042, padrao).map((i) => i.curvaAbc), ['B', 'B', 'C', 'C', 'A']);
  assert.equal(montarItens(linhas, [], new Map(), { inicio: '2026-08-01', fim: '2026-09-14' }, 1042, null)[0].precoCusto, 0, 'consulta que falhou: 0 em todos');
});
