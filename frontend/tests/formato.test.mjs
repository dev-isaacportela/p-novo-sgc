// Testes do frontend: regra pura de `src/lib/` (formatação, cálculo, máscara,
// normalização de linhas do backend). Sem React, sem DOM, sem SDK — o que
// depende de tela é verificado nos cenários C-00N abertos no simulador.
//
// Cada `test` cita o requisito/cenário da spec no título (rastreabilidade).
// Node 22.18+ importa `.ts` direto (type stripping); não precisa de vitest.
//
// Uso: cd frontend && npm test   (= node --test "tests/**/*.test.mjs")
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtData, fmtDataHora, moeda, hojeIso, numeroPt } from '../src/lib/formato.ts';

test('RF-000: data ISO do backend aparece como dd/mm/aaaa', () => {
  assert.equal(fmtData('2026-08-27'), '27/08/2026');
  assert.equal(fmtDataHora('2026-09-03T14:00:00'), '03/09/2026 14:00');
  assert.equal(fmtDataHora('2026-09-03'), '03/09/2026');
});

test('entrada inválida não quebra a tela', () => {
  assert.equal(fmtData(''), '');
  assert.equal(fmtData(null), '');
  assert.equal(fmtData('27/08/2026'), '27/08/2026');
  assert.equal(moeda('abc'), '');
});

test('moeda em pt-BR', () => {
  assert.equal(moeda(120.5).replace(/ /g, ' '), 'R$ 120,50');
  assert.equal(moeda('0'), moeda(0));
});

test('hojeIso tem o formato aaaa-mm-dd', () => {
  assert.match(hojeIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('numeroPt: casas fixas em pt-BR — 1234,5 com 1 casa é 1.234,5, com 0 arredonda para 1.235, 17,4299 com 1 é 17,4; não numérico vira traço', () => {
  assert.equal(numeroPt(1234.5, 1), '1.234,5');
  assert.equal(numeroPt(1234.5), '1.235');
  assert.equal(numeroPt(17.4299, 1), '17,4');
  assert.equal(numeroPt('616.0'), '616');
  assert.equal(numeroPt(null), '—');
});
