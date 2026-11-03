// A venda válida da 011 na tela (R-131): o público fica fora por padrão das
// curvas, do gráfico, dos totais e da série da previsão — os mesmos números
// da lista. (Venda entre filiais e remessa de entrega futura saem na consulta:
// smoke C-053.)
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { curvasDoRessuprimento } from '../src/lib/ressuprimento.ts';
import { historicoSemPublico } from '../src/lib/ressuprimento-detalhe.ts';

const medida = (codprod, fat, fatPub, rent, rentPub) => ({
  CODPROD: codprod, VENDA_PERIODO: 1, CUSTO_ULT_ENTRADA: 1,
  FATURAMENTO_PERIODO: fat, FATURAMENTO_PUBLICO: fatPub, RENTABILIDADE_PERIODO: rent, RENTABILIDADE_PUBLICA: rentPub,
});

test('RN-001 (R-131): sem o público, um produto vendido quase só a órgão público cai na curva — com o público ele é A', () => {
  // 1: 1000 de faturamento, 900 público; 2: 600 sem público; 3: 200; 4: 100; 5: 50.
  const medidas = [medida(1, 1000, 900, 500, 450), medida(2, 600, 0, 300, 0), medida(3, 200, 0, 100, 0), medida(4, 100, 0, 50, 0), medida(5, 50, 0, 25, 0)];
  assert.equal(curvasDoRessuprimento(medidas, false).get(1).faturamento, 'A');
  const sem = curvasDoRessuprimento(medidas, true).get(1);
  assert.notEqual(sem.faturamento, 'A', 'só 100 de faturamento sem o público');
  assert.notEqual(sem.rentabilidade, 'A');
  assert.equal(curvasDoRessuprimento(medidas, true).get(2).faturamento, 'A');
});

test('RN-001 (R-131): o histórico do gráfico e da previsão perde a parte pública com o seletor marcado e a devolve desmarcado; nunca negativo', () => {
  const historico = [
    { MES: '2026-08', SAIDAS: 18, ENTRADAS: 0, SAIDAS_PUBLICAS: 6 },
    { MES: '2026-09', SAIDAS: 5, ENTRADAS: 10, SAIDAS_PUBLICAS: 9 },
  ];
  assert.deepEqual(historicoSemPublico(historico, true).map((p) => p.SAIDAS), [12, 0]);
  assert.deepEqual(historicoSemPublico(historico, true).map((p) => p.ENTRADAS), [0, 10], 'as entradas não mudam');
  assert.equal(historicoSemPublico(historico, false), historico);
});
