// R-141 / C-047 (002): a análise para aprovação das fases Técnica e Diretoria (src/lib/aprovacao.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { analiseParaAprovacao } from '../src/lib/aprovacao.ts';

const base = {
  descricao: '', embalagem: '', unidade: '', codepto: 0, codsec: 0, unPorCaixa: 1, qtVendaLicitacao: 0,
  qtTransito: 0, curvaAbc: 'A', coberturaJustificativa: '', observacao: '', status: 'pendente', solicitacaoDe: '',
};
const ITENS = [
  // venda 60/mês (2/dia): sem estoque → ruptura; 60 pedidos → 30 dias após.
  { ...base, codprod: 1, qtVendaTotal: 60, qtEstoque: 0, qtSugerida: 60, qtPedida: 60, precoCusto: 10, tipoPreco: 'padrao', coberturaDias: 30, coberturaLimite: 60, idSolicitacao: 0 },
  // estoque 90 (45 dias) + 100 → 95 dias, acima do limite 60, preço especial, do comercial.
  { ...base, codprod: 2, qtVendaTotal: 60, qtEstoque: 90, qtSugerida: 50, qtPedida: 100, precoCusto: 5, tipoPreco: 'especial', coberturaDias: 95, coberturaLimite: 60, idSolicitacao: 9 },
  // sem venda no período, abaixo da sugestão.
  { ...base, codprod: 3, qtVendaTotal: 0, qtEstoque: 5, qtSugerida: 10, qtPedida: 4, precoCusto: 25, tipoPreco: 'padrao', coberturaDias: 0, coberturaLimite: 60, idSolicitacao: 0 },
  // fora do pedido: quantidade zero não entra em nada.
  { ...base, codprod: 4, qtVendaTotal: 30, qtEstoque: 0, qtSugerida: 5, qtPedida: 0, precoCusto: 1, tipoPreco: 'padrao', coberturaDias: 0, coberturaLimite: 60, idSolicitacao: 0 },
];

test('C-047: total, cobertura média atual → após e preço especial saem dos itens com quantidade', () => {
  const a = analiseParaAprovacao(ITENS, 1);
  assert.equal(a.total, 600 + 500 + 100);
  assert.equal(a.coberturaAtual, (0 + 45) / 2, 'item sem venda não entra na média');
  assert.equal(a.coberturaApos, (30 + 95) / 2);
  assert.equal(a.especialValor, 500);
  assert.ok(Math.abs(a.especialPct - (500 / 1200) * 100) < 1e-9);
});

test('C-047: os indicadores do pedido contam os produtos e guardam a lista para o drill-in', () => {
  const ind = Object.fromEntries(analiseParaAprovacao(ITENS, 1).indicadores.map((i) => [i.chave, i]));
  assert.equal(ind.itens.quantidade, 3);
  assert.deepEqual(ind.comercial.produtos.map((p) => p.codprod), [2]);
  assert.deepEqual([ind.dentro.quantidade, ind.acima.quantidade, ind.abaixo.quantidade], [1, 1, 1]);
  assert.deepEqual(ind.ruptura.produtos.map((p) => p.codprod), [1]);
  assert.deepEqual(ind.cobertura.produtos.map((p) => p.codprod), [2], 'limite do item, não 60 fixo');
  assert.equal(ind['cobertura-valor'].quantidade, 500);
  assert.equal(ind['cobertura-valor'].emValor, true);
  assert.deepEqual(ind['sem-venda'].produtos.map((p) => p.codprod), [3]);
});

import { comprasVsVendasDoFornecedor } from '../src/lib/aprovacao.ts';

test('C-050 (P-1): compras × vendas do fornecedor no período do pedido, hoje e depois deste pedido — sem meta, achado no ranking da filial', () => {
  const ranking = [
    { CODFORNEC: 42, VL_COMPRADO: 900, VL_VENDIDO: 1000 },
    { CODFORNEC: 119, VL_COMPRADO: 300000, VL_VENDIDO: 400000 },
  ];
  assert.deepEqual(comprasVsVendasDoFornecedor(ranking, 119, 100000), { comprado: 300000, vendido: 400000, pctAtual: 75, pctApos: 100 });
  assert.equal(comprasVsVendasDoFornecedor(ranking, 7, 1), null, 'fornecedor sem movimento no período');
  assert.deepEqual(comprasVsVendasDoFornecedor([{ CODFORNEC: 5, VL_COMPRADO: 10, VL_VENDIDO: 0 }], 5, 1), { comprado: 10, vendido: 0, pctAtual: null, pctApos: null });
});
