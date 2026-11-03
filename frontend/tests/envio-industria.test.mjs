// R-141 / C-048 e C-049 (002): Envio e Enviado para Indústria no card (src/lib/envio-industria.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { itensDoEnvio, totaisDoEnvio, textoCopiarItens, proximoDoEnviado } from '../src/lib/envio-industria.ts';

const ITENS = [
  { codprod: 1662, descricao: 'SORO FISIOLOGICO 500ML', embalagem: 'CX 24', qtPedida: 48, precoCusto: 3.5 },
  { codprod: 1700, descricao: 'EQUIPO MACRO', embalagem: '', qtPedida: 0, precoCusto: 2 },
  { codprod: 1801, descricao: 'LUVA P', embalagem: 'CX 100', qtPedida: 1200, precoCusto: 0.42 },
];

test('C-048: só vai ao fornecedor o que tem quantidade, com os totais do resumo', () => {
  assert.deepEqual(itensDoEnvio(ITENS).map((i) => i.codprod), [1662, 1801]);
  const totais = totaisDoEnvio(ITENS);
  assert.equal(totais.produtos, 2);
  assert.equal(totais.quantidade, 1248);
  assert.ok(Math.abs(totais.valor - (48 * 3.5 + 1200 * 0.42)) < 1e-9);
});

test('C-048: "Copiar itens" sai com cabeçalho, tabulação e número em pt-BR, sem marca de origem', () => {
  const linhas = textoCopiarItens(ITENS).split('\n');
  assert.equal(linhas[0], 'Código\tProduto\tEmb.\tQtd\tCusto un.');
  assert.equal(linhas[1], '1662\tSORO FISIOLOGICO 500ML\tCX 24\t48\t3,50');
  assert.equal(linhas[2], '1801\tLUVA P\tCX 100\t1.200\t0,42');
  assert.equal(linhas.length, 3);
  assert.ok(!textoCopiarItens(ITENS).includes('Comercial'));
});

test('C-049: Em Trânsito para BN só libera com nota vinculada (a mesma trava do servidor)', () => {
  assert.deepEqual(proximoDoEnviado(0), { liberado: false, texto: 'Vincule a nota fiscal para liberar' });
  assert.deepEqual(proximoDoEnviado(1), { liberado: true, texto: '1 nota vinculada' });
  assert.equal(proximoDoEnviado(3).texto, '3 notas vinculadas');
});
