// R-133: a conta da Análise do Produto saiu da página da 011 para a janela
// aberta do pedido fazer a mesma (src/lib/analise-sku.ts). Aqui, o que ela
// devolve quando ainda não há dado — o resto é das funções que ela compõe,
// testadas em previsao/custo-especial/ressuprimento-detalhe.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { previsaoDoSku, projetadaDoSku, oportunidadesDaLinha, sugestoesDaLinha } from '../src/lib/analise-sku.ts';

test('C-028 (R-133): sem o detalhe do SKU pronto não há previsão; sem previsão nem linha, sem projeção; sem política, sem oportunidade', () => {
  assert.equal(previsaoDoSku(undefined, 54, '2026-11-03', [], true), null);
  assert.equal(previsaoDoSku({ historico: [], compras: [], filiais: [], pronto: false, erro: '' }, 54, '2026-11-03', [], true), null);
  assert.equal(previsaoDoSku({ historico: [], compras: [], filiais: [], pronto: true, erro: '' }, 0, '2026-11-03', [], true), null);
  assert.equal(projetadaDoSku(null, null, 'bestfit'), null);
  const linha = { medida: { CODPROD: 54 }, custo: { valor: 10 }, sugerida: 40, coberturaDias: 35, consumoDiario: 1, unidadesPorCaixa: 8 };
  assert.deepEqual(oportunidadesDaLinha(linha, [], []), []);
  assert.deepEqual(sugestoesDaLinha(linha, [], null, 'bestfit'), []);
  assert.deepEqual(sugestoesDaLinha(null, [{}], null, 'bestfit'), []);
});
