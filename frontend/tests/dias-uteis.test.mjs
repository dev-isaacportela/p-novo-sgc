// R-025 do 000: mesma conferência do backend/lib/dias-uteis.mjs (SQL) e de
// backend/simulator/smoke/000-dias-uteis.mjs — as duas implementações têm que
// concordar nos mesmos números, sem uma reimplementar a outra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { diasUteisEntre, somarDiasUteis } from '../src/lib/dias-uteis.ts';

test('RN-001: somarDiasUteis(2026-08-24, 15) = 2026-09-14 (conferência do R-025)', () => {
  assert.equal(somarDiasUteis('2026-08-24', 15), '2026-09-14');
});

test('RN-001: diasUteisEntre é o inverso de somarDiasUteis (ida e volta)', () => {
  assert.equal(diasUteisEntre('2026-08-24', '2026-09-14'), 15);
});

test('conta o dia de chegada, não o de partida: segunda→sábado = 4, sexta→segunda = 1, mesmo dia = 0', () => {
  assert.equal(diasUteisEntre('2026-08-24', '2026-08-29'), 4);
  assert.equal(diasUteisEntre('2026-08-28', '2026-08-31'), 1);
  assert.equal(diasUteisEntre('2026-08-24', '2026-08-24'), 0);
});

test('diasUteisEntre cruzando um fim de semana (sexta 2026-09-11 -> terça 2026-09-15) = 2', () => {
  assert.equal(diasUteisEntre('2026-09-11', '2026-09-15'), 2);
});

test('base em fim de semana recua para sexta: sábado e domingo somam a partir da mesma sexta', () => {
  assert.equal(somarDiasUteis('2026-08-29', 1), somarDiasUteis('2026-08-28', 1)); // sáb/sex
  assert.equal(somarDiasUteis('2026-08-30', 1), somarDiasUteis('2026-08-28', 1)); // dom/sex
});

test('n = 0 devolve o próprio dia quando é útil, e a sexta anterior quando não é', () => {
  assert.equal(somarDiasUteis('2026-08-28', 0), '2026-08-28'); // sexta
  assert.equal(somarDiasUteis('2026-08-29', 0), '2026-08-28'); // sábado -> sexta
});
