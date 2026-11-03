// R-150 / C-029, C-030 e C-031 (005): saldo por item, o que falta para
// concluir e os itens faturados do card (src/lib/conclusao.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pendentesDeFaturamento, pendenciasDaConclusao, itensFaturados } from '../src/lib/conclusao.ts';

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

test('C-030: pronto para concluir segue o servidor — conferência pendente e B.O. em aberto travam, saldo só avisa', () => {
  assert.deepEqual(pendenciasDaConclusao({ conferenciasPendentes: 0, boAbertos: 0, saldo: 0 }), { pronto: true, pendencias: [] });
  const comSaldo = pendenciasDaConclusao({ conferenciasPendentes: 0, boAbertos: 0, saldo: 120 });
  assert.equal(comSaldo.pronto, true);
  assert.deepEqual(comSaldo.pendencias.map((p) => p.trava), [false]);
  const travado = pendenciasDaConclusao({ conferenciasPendentes: 2, boAbertos: 1, saldo: 0 });
  assert.equal(travado.pronto, false);
  assert.deepEqual(travado.pendencias.map((p) => p.texto), [
    'Decida as 2 conferências de nota fiscal pendentes.',
    'Resolva o item em B.O. em aberto.',
  ]);
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
