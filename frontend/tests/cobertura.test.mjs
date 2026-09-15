// Limite de cobertura futura da spec 003 (src/lib/cobertura.ts): vale sempre o
// mais específico e, sem parametrização nenhuma, 35 dias.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_COBERTURA_PADRAO_DIAS, limiteDeCobertura, acimaDoLimite, coberturaDeLinha,
} from '../src/lib/cobertura.ts';

const lim = (nivel, codigo, limiteDias) => ({ id: 0, nivel, codigo, descricao: '', limiteDias });

test('C-008: com limite de 60 para o departamento 2 e de 20 para o produto 5001, o 5001 usa 20, o 5002 do mesmo departamento usa 60 e um produto sem nada usa 35', () => {
  const coberturas = [lim('departamento', '2', 60), lim('sku', '5001', 20)];
  assert.deepEqual(limiteDeCobertura(coberturas, { codprod: 5001, codsec: 21, codepto: 2, codfornec: 1015 }),
    { limiteDias: 20, nivel: 'sku' });
  assert.deepEqual(limiteDeCobertura(coberturas, { codprod: 5002, codsec: 21, codepto: 2, codfornec: 1015 }),
    { limiteDias: 60, nivel: 'departamento' });
  assert.deepEqual(limiteDeCobertura(coberturas, { codprod: 7001, codsec: 99, codepto: 9, codfornec: 1042 }),
    { limiteDias: 35, nivel: 'padrao' });
});

test('RN-005: com fornecedor 90, departamento 60, seção 45 e produto 20, vale 20; sem o do produto, 45; sem nenhum, 35', () => {
  const alvo = { codprod: 5001, codsec: 21, codepto: 2, codfornec: 1015 };
  const todos = [lim('fornecedor', '1015', 90), lim('departamento', '2', 60), lim('secao', '21', 45), lim('sku', '5001', 20)];
  assert.equal(limiteDeCobertura(todos, alvo).limiteDias, 20);
  assert.equal(limiteDeCobertura(todos.filter((c) => c.nivel !== 'sku'), alvo).limiteDias, 45);
  assert.equal(limiteDeCobertura(todos.filter((c) => c.nivel === 'fornecedor'), alvo).limiteDias, 90);
  assert.equal(limiteDeCobertura([], alvo).limiteDias, LIMITE_COBERTURA_PADRAO_DIAS);
});

test('RN-005: código zerado ou vazio no alvo não casa com parametrização nenhuma', () => {
  const coberturas = [lim('sku', '0', 5), lim('departamento', '2', 60)];
  assert.equal(limiteDeCobertura(coberturas, { codprod: 0, codsec: 0, codepto: 2, codfornec: 0 }).limiteDias, 60);
});

test('RF-010: acima do limite só quando há cobertura a calcular — produto sem venda não está acima de nada', () => {
  assert.equal(acimaDoLimite(40, 35), true);
  assert.equal(acimaDoLimite(35, 35), false, 'no limite ainda está dentro');
  assert.equal(acimaDoLimite(null, 35), false);
});

test('coberturaDeLinha converte a linha UPPERCASE de sgcCoberturaListar', () => {
  assert.deepEqual(coberturaDeLinha({ ID: '3', NIVEL: 'secao', CODIGO: '21', DESCRICAO: 'ORAIS', LIMITE_DIAS: '45' }),
    { id: 3, nivel: 'secao', codigo: '21', descricao: 'ORAIS', limiteDias: 45 });
});
