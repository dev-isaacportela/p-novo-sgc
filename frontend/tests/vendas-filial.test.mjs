// R-139: o gráfico de vendas da filial em excesso (src/lib/vendas-filial.ts).
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieDaFilial, resumoDaFilial, filialDaChave, MESES_CONSULTA_FILIAL } from '../src/lib/vendas-filial.ts';

const historico = [
  { MES: '2026-05', SAIDAS: 30, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 },
  { MES: '2026-07', SAIDAS: 50, ENTRADAS: 100, SAIDAS_PUBLICAS: 20 },
  { MES: '2026-10', SAIDAS: 40, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 },
  { MES: '2026-11', SAIDAS: 5, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 },
];

test('C-057 (R-139): os 6 meses fechados e o corrente parcial, com zero no mês sem venda; o público sai quando a tela o tira', () => {
  const serie = serieDaFilial(historico, '2026-11-03', true);
  assert.equal(MESES_CONSULTA_FILIAL, 7);
  assert.deepEqual(serie.map((m) => [m.mes, m.vendas, m.parcial]), [
    ['2026-05', 30, false], ['2026-06', 0, false], ['2026-07', 30, false], ['2026-08', 0, false],
    ['2026-09', 0, false], ['2026-10', 40, false], ['2026-11', 5, true],
  ]);
  assert.equal(serieDaFilial(historico, '2026-11-03', false)[2].vendas, 50, 'com o público, a venda inteira');
});

test('C-057 (R-139): total e média dos 6 fechados (o parcial fora), estoque e cobertura na filial; sem venda, sem giro', () => {
  const r = resumoDaFilial(serieDaFilial(historico, '2026-11-03', true), 15);
  assert.equal(r.total, 100);
  assert.equal(r.mediaMensal, 16.7);
  assert.equal(r.estoque, 15);
  assert.equal(r.coberturaDias, 27, '15 ÷ (100/6/30) = 27 dias');
  const parado = resumoDaFilial(serieDaFilial([], '2026-11-03', true), 15);
  assert.equal(parado.total, 0);
  assert.equal(parado.coberturaDias, null);
});

test('C-057 (R-139): a filial do alerta de excesso do card sai da chave', () => {
  assert.equal(filialDaChave('excesso:5009:9'), '9');
  assert.equal(filialDaChave('vencimento:5009:L1'), '');
  assert.equal(filialDaChave(''), '');
});
