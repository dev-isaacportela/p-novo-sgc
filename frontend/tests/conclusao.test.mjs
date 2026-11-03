// R-150 / C-029, C-030 e C-031 (005): saldo por item, o que falta para
// concluir e os itens faturados do card (src/lib/conclusao.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pendentesDeFaturamento, pendenciasDaConclusao, itensFaturados, coberturaDoFaturamento, textoFaltaFaturar, MINIMO_COBERTO_PCT,
} from '../src/lib/conclusao.ts';

const PEDIDO = [
  { CODPROD: 10, DESCRICAO: 'A', QT_PEDIDA: 100, PRECO_CUSTO: 1 },
  { CODPROD: 20, DESCRICAO: 'B', QT_PEDIDA: 50, PRECO_CUSTO: 2 },
  { CODPROD: 30, DESCRICAO: 'C', QT_PEDIDA: 10, PRECO_CUSTO: 3 },
  { CODPROD: 40, DESCRICAO: 'D', QT_PEDIDA: 0, PRECO_CUSTO: 3 },
];
const NF_ITENS = [
  { ID: 1, ID_NF: 7, CODPROD: 10, DESCRICAO: 'A', QT_FATURADA: 60, PRECO_FATURADO: 1, NUMLOTE: 'L1', DT_VALIDADE: '2027-05-01' },
  { ID: 2, ID_NF: 8, CODPROD: 10, DESCRICAO: 'A', QT_FATURADA: 10, PRECO_FATURADO: 1, NUMLOTE: 'L2', DT_VALIDADE: '2027-06-01' },
  { ID: 3, ID_NF: 7, CODPROD: 30, DESCRICAO: 'C', QT_FATURADA: 12, PRECO_FATURADO: 3, NUMLOTE: '', DT_VALIDADE: '' },
];

test('C-029: saldo por item soma todas as notas, ignora o que não foi pedido e não fica negativo', () => {
  const saldo = pendentesDeFaturamento(PEDIDO, NF_ITENS);
  assert.deepEqual(saldo.map((s) => [s.codprod, s.faturada, s.pendente, s.situacao]), [
    [20, 0, 50, 'pendente'],
    [10, 70, 30, 'parcial'],
  ]);
  assert.equal(saldo[1].pct, 70);
});

test('C-030: as travas da conclusão são as do servidor — conferência pendente, B.O. em aberto e o faturado; sem nenhuma, pronto', () => {
  const base = { vlTotal: 1000, vlFaturado: 1000, vlBoCancelado: 0 };
  assert.deepEqual(pendenciasDaConclusao({ conferenciasPendentes: 0, boAbertos: 0, ...base }), { pronto: true, pendencias: [] });
  const travado = pendenciasDaConclusao({ conferenciasPendentes: 2, boAbertos: 1, ...base });
  assert.equal(travado.pronto, false);
  assert.deepEqual(travado.pendencias.map((p) => p.texto), [
    'Decida as 2 conferências de nota fiscal pendentes.',
    'Resolva o item em B.O. em aberto.',
  ]);
});

test('C-033 / RN-016 (P-6): só conclui com 99,5 % do valor coberto — faturado mais o B.O. que não vem mais —, com a frase do servidor', () => {
  assert.equal(MINIMO_COBERTO_PCT, 99.5);
  const falta = pendenciasDaConclusao({ conferenciasPendentes: 0, boAbertos: 0, vlTotal: 120000, vlFaturado: 72000, vlBoCancelado: 0 });
  assert.equal(falta.pronto, false);
  assert.deepEqual(falta.pendencias, [{
    trava: true,
    texto: 'Falta faturar R$ 48.000,00 (60,0 % coberto; o mínimo para concluir é 99,5 %). Registre a nota complementar ou marque o saldo em B.O. como "não vem mais".',
  }]);
  assert.equal(coberturaDoFaturamento({ vlTotal: 1000, vlFaturado: 994, vlBoCancelado: 0 }).coberto, false, '99,4 % trava');
  assert.equal(coberturaDoFaturamento({ vlTotal: 1000, vlFaturado: 995, vlBoCancelado: 0 }).coberto, true, '99,5 % libera');
  assert.equal(coberturaDoFaturamento({ vlTotal: 1000, vlFaturado: 600, vlBoCancelado: 400 }).coberto, true, 'o B.O. que não vem mais cobre');
  assert.deepEqual(coberturaDoFaturamento({ vlTotal: 0, vlFaturado: 0, vlBoCancelado: 0 }), { pct: 100, falta: 0, coberto: true });
  assert.equal(textoFaltaFaturar(1234.5, 98.76), 'Falta faturar R$ 1.234,50 (98,8 % coberto; o mínimo para concluir é 99,5 %). Registre a nota complementar ou marque o saldo em B.O. como "não vem mais".');
});

test('C-031: itens faturados trazem nota, subtotal, lote, validade e a decisão das conferências daquele item', () => {
  const itens = itensFaturados(NF_ITENS, [{ ID: 7, NUMNOTA: 7010, SERIE: '1' }, { ID: 8, NUMNOTA: 7011, SERIE: '' }], [
    { ID_NF: 7, CODPROD: 10, DECISAO: 'aceito' },
    { ID_NF: 7, CODPROD: 30, DECISAO: 'aceito' },
    { ID_NF: 7, CODPROD: 30, DECISAO: 'recusado' },
    { ID_NF: 8, CODPROD: 10, DECISAO: 'pendente' },
  ]);
  assert.deepEqual(itens.map((i) => [i.nota, i.subtotal, i.decisao]), [['7010-1', 60, 'aceito'], ['7011', 10, 'pendente'], ['7010-1', 36, 'recusado']]);
  assert.equal(itens[0].lote, 'L1');
});
