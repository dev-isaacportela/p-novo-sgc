// R-135: Clientes que compraram na Análise do Produto aberta do pedido
// (src/lib/clientes-produto.ts) — agrupamento por cliente e por mês, top 10,
// o público fora e a soma por mês igual à barra de Vendas do gráfico.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { janelaDosClientes, semPublico, clientesDoMes, topClientes, matrizClienteMes, somaPorMes } from '../src/lib/clientes-produto.ts';
import { historicoSemPublico, serieComprasVendas } from '../src/lib/ressuprimento-detalhe.ts';

const nota = (mes, dia, numnota, codcli, qt, valor, extra = {}) => ({
  MES: mes, DTMOV: `${mes}-${dia}`, NUMNOTA: numnota, NUMTRANSVENDA: numnota, CODCLI: codcli, CLIENTE: `C${codcli}`,
  CODATV1: 1, RAMO: 'HOSPITAL PRIVADO', QUANTIDADE: qt, VALOR_TOTAL: valor, PUBLICO: 0, ...extra,
});
const notas = [
  nota('2026-06', '10', 1, 9, 10, 100), nota('2026-10', '02', 2, 9, 5, 50), nota('2026-10', '05', 3, 12, 30, 300),
  nota('2026-10', '20', 4, 9, 40, 400), nota('2026-10', '21', 5, 7, 60, 600, { PUBLICO: 1, CODATV1: 12, RAMO: 'ORGAO PUBLICO SUDESTE' }),
  nota('2026-11', '01', 6, 12, 3, 30),
];

test('C-029 (R-135): a janela são os 6 meses do gráfico, o corrente como parcial, do 1º dia do primeiro até hoje', () => {
  const j = janelaDosClientes('2026-11-03');
  assert.deepEqual(j.meses, ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(j.inicio, '2026-06-01');
  assert.equal(j.fim, '2026-11-03');
});

test('C-029 (R-135): o público sai sempre; os clientes do mês vêm do que mais levou, com as notas da mais recente e a última compra', () => {
  const validas = semPublico(notas);
  assert.equal(validas.length, 5);
  const { meses } = janelaDosClientes('2026-11-03');
  const outubro = clientesDoMes(validas, '2026-10', meses);
  assert.deepEqual(outubro.map((c) => [c.codcli, c.quantidade, c.valor, c.notas.length]), [[9, 45, 450, 2], [12, 30, 300, 1]]);
  assert.deepEqual(outubro[0].notas.map((n) => n.NUMNOTA), [4, 2]);
  assert.equal(outubro[0].ultimaCompra, '2026-10-20');
  assert.ok(!outubro.some((c) => c.codcli === 7), 'o órgão público não aparece');
  const todos = clientesDoMes(validas, '', meses);
  assert.deepEqual(todos.map((c) => [c.codcli, c.quantidade]), [[9, 55], [12, 33]]);
});

test('C-029 (R-135): top 10 e "Ver todos"', () => {
  const lista = Array.from({ length: 14 }, (_, i) => i);
  assert.equal(topClientes(lista, false).length, 10);
  assert.equal(topClientes(lista, true).length, 14);
});

test('C-029 (R-135): a matriz cliente × mês e a soma por mês = a barra de Vendas do gráfico (sem o público)', () => {
  const { meses } = janelaDosClientes('2026-11-03');
  const m = matrizClienteMes(semPublico(notas), meses);
  assert.deepEqual(m.linhas.map((l) => [l.codcli, l.porMes, l.total]), [
    [9, [10, 0, 0, 0, 45, 0], 55],
    [12, [0, 0, 0, 0, 30, 3], 33],
  ]);
  assert.deepEqual(m.totalPorMes, [10, 0, 0, 0, 75, 3]);
  assert.equal(m.total, 88);
  // o histórico do mesmo recorte (venda válida, pública segregada), como o gráfico o recebe
  const historico = [
    { MES: '2026-06', SAIDAS: 10, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-10', SAIDAS: 135, ENTRADAS: 0, SAIDAS_PUBLICAS: 60 },
    { MES: '2026-11', SAIDAS: 3, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 },
  ];
  const barras = serieComprasVendas(historicoSemPublico(historico, true), '2026-11-03', 6, 0).filter((p) => p.vendas !== null).map((p) => p.vendas);
  assert.deepEqual(somaPorMes(semPublico(notas), meses), barras);
});
