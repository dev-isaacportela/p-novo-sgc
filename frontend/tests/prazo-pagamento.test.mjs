// Prazo de pagamento da spec 003 (src/lib/prazo-pagamento.ts): parcelas,
// comparação padrão × acordado e a regra de justificativa. Este módulo é o
// dono único da regra de parcelas no projeto (R-015) — a spec 001 importa
// parcelasDoPrazo/textoDeParcelas/parcelasValidas daqui.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parcelasDoPrazo, textoDeParcelas, parcelasValidas, normalizarPrazo,
  prazoMedioDias, compararPrazo, validarPrazoMontagem,
} from '../src/lib/prazo-pagamento.ts';

test('RN-006: "28/35/42 dias" dá [28,35,42]; "à vista" dá [0]; "conforme contrato" dá []; "30/60" e "30/60 dias" são iguais', () => {
  assert.deepEqual(parcelasDoPrazo('28/35/42 dias'), [28, 35, 42]);
  assert.deepEqual(parcelasDoPrazo('à vista'), [0]);
  assert.deepEqual(parcelasDoPrazo('A VISTA'), [0]);
  assert.deepEqual(parcelasDoPrazo('conforme contrato'), []);
  assert.deepEqual(parcelasDoPrazo(''), []);
  assert.equal(compararPrazo('30/60', '30/60 dias').iguais, true);
});

test('RN-006: textoDeParcelas e parcelasValidas — o que a spec 001 importa para a faixa do fornecedor', () => {
  assert.equal(textoDeParcelas([28, 35, 42]), '28/35/42');
  assert.equal(textoDeParcelas([]), '');
  assert.equal(parcelasValidas('30/60/90'), true);
  assert.equal(parcelasValidas('conforme contrato'), false);
  assert.equal(parcelasValidas('à vista'), true, 'à vista é uma parcela de zero dia, não ausência de prazo');
});

test('D-005: normalizarPrazo dá a mesma forma canônica aos dois lados, para a igualdade de texto do servidor bater com a de parcelas da tela', () => {
  assert.equal(normalizarPrazo('28/35/42 dias'), '28/35/42');
  assert.equal(normalizarPrazo(' 28/35/42 '), '28/35/42');
  assert.equal(normalizarPrazo('à vista'), '0');
  assert.equal(normalizarPrazo('conforme contrato'), 'CONFORME CONTRATO');
  assert.equal(normalizarPrazo(''), '');
});

test('C-015: padrão "30/60" contra acordado "28/35/42" é divergente, média cai de 45 para 35 e a diferença é −10 dias', () => {
  const comparacao = compararPrazo('30/60', '28/35/42');
  assert.equal(comparacao.iguais, false);
  assert.equal(comparacao.padraoMedio, 45);
  assert.equal(comparacao.acordadoMedio, 35);
  assert.equal(comparacao.diferencaDias, -10);
  assert.equal(comparacao.exigeJustificativa, true);
  assert.equal(comparacao.tom, 'alerta');
  assert.match(comparacao.rotulo, /45 → 35/);
});

test('C-016: "à vista" contra o padrão "30 dias" é divergência de 30 dias a menos — nunca igualdade', () => {
  const comparacao = compararPrazo('30 dias', 'à vista');
  assert.deepEqual(comparacao.padraoParcelas, [30]);
  assert.deepEqual(comparacao.acordadoParcelas, [0]);
  assert.equal(comparacao.iguais, false);
  assert.equal(comparacao.diferencaDias, -30);
  assert.equal(comparacao.exigeJustificativa, true);
});

test('RN-006: prazo médio é a média simples das parcelas, com uma casa; sem parcela, não há média', () => {
  assert.equal(prazoMedioDias('28/35/42'), 35);
  assert.equal(prazoMedioDias('30/60'), 45);
  assert.equal(prazoMedioDias('conforme contrato'), null);
});

test('RN-006: um lado sem número nenhum é divergência, e ganha prazo maior é "ganho" mas continua exigindo justificativa', () => {
  const semNumero = compararPrazo('30/60', 'conforme contrato');
  assert.equal(semNumero.comparavel, false);
  assert.equal(semNumero.exigeJustificativa, true);

  const maior = compararPrazo('30/60', '60/90');
  assert.equal(maior.diferencaDias, 30);
  assert.equal(maior.tom, 'ganho');
  assert.equal(maior.exigeJustificativa, true);

  const mesmaMedia = compararPrazo('30/60', '45/45');
  assert.equal(mesmaMedia.diferencaDias, 0);
  assert.equal(mesmaMedia.exigeJustificativa, true, 'mesma média com parcelas diferentes ainda é condição nova');
});

test('RN-007: divergente com 9 caracteres bloqueia, com 10 libera; padrão vazio bloqueia citando o padrão', () => {
  assert.ok(validarPrazoMontagem({ padrao: '30/60', acordado: '28/35/42', justificativa: '123456789' }));
  assert.equal(validarPrazoMontagem({ padrao: '30/60', acordado: '28/35/42', justificativa: '1234567890' }), null);
  assert.match(validarPrazoMontagem({ padrao: '', acordado: '28/35/42', justificativa: '' }), /padrão/);
  assert.match(validarPrazoMontagem({ padrao: '30/60', acordado: '', justificativa: '' }), /acordado/);
  assert.equal(validarPrazoMontagem({ padrao: '30/60', acordado: '30/60 dias', justificativa: '' }), null,
    'prazo igual não precisa de justificativa nenhuma');
});
