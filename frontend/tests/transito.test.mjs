// A cobertura ao chegar do Em trânsito (src/lib/transito.ts, C-049 emendado, R-132).
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { chegadaDoTransito, rotuloCobertura, textoChegada } from '../src/lib/transito.ts';

const HOJE = '2026-10-30';

test('C-049 (R-132): pela previsão do pedido — estoque 50, trânsito 100, consumo 2/dia, chega em 10 dias: sobram 30 na chegada e cobre 65 d', () => {
  const c = chegadaDoTransito({ estoqueAtual: 50, emTransito: 100, consumoDiario: 2, leadTimeDias: 9 }, '2026-11-09', HOJE);
  assert.equal(c.pelaPrevisao, true);
  assert.equal(c.diasAteChegar, 10);
  assert.equal(c.estoqueNaChegada, 30);
  assert.equal(c.coberturaAoChegarDias, 65);
  assert.equal(c.diasSemEstoque, 0);
  assert.equal(textoChegada(c), 'chega em 09/11 (10 d)');
});

test('C-049 (R-132): sem pedido pendente, hoje + lead time, e o texto diz isso', () => {
  const c = chegadaDoTransito({ estoqueAtual: 50, emTransito: 100, consumoDiario: 2, leadTimeDias: 9 }, null, HOJE);
  assert.equal(c.pelaPrevisao, false);
  assert.equal(c.data, '2026-11-08');
  assert.equal(textoChegada(c), 'chega em 08/11 (9 d) · prev. pelo lead time');
});

test('C-049 (R-132): ruptura antes de chegar — estoque 10 a 2/dia dura 5 d e a chegada é em 12: 7 d sem estoque, chega com 0', () => {
  const c = chegadaDoTransito({ estoqueAtual: 10, emTransito: 60, consumoDiario: 2, leadTimeDias: 9 }, '2026-11-11', HOJE);
  assert.equal(c.diasSemEstoque, 7);
  assert.equal(c.estoqueNaChegada, 0);
  assert.equal(c.coberturaAoChegarDias, 30);
});

test('C-049 (R-132): pedido atrasado conta como chegando hoje; sem consumo não há cobertura nem ruptura; sem trânsito, nada', () => {
  const atrasado = chegadaDoTransito({ estoqueAtual: 10, emTransito: 20, consumoDiario: 1, leadTimeDias: 9 }, '2026-10-27', HOJE);
  assert.equal(atrasado.atrasada, true);
  assert.equal(atrasado.diasAteChegar, 0);
  assert.equal(atrasado.coberturaAoChegarDias, 30);
  assert.equal(textoChegada(atrasado), 'chega em 27/10 (atrasado)');
  const parado = chegadaDoTransito({ estoqueAtual: 10, emTransito: 20, consumoDiario: 0, leadTimeDias: 9 }, '2026-11-05', HOJE);
  assert.equal(parado.coberturaAoChegarDias, null);
  assert.equal(parado.diasSemEstoque, 0);
  assert.equal(chegadaDoTransito({ estoqueAtual: 10, emTransito: 0, consumoDiario: 1, leadTimeDias: 9 }, '2026-11-05', HOJE), null);
  assert.equal(textoChegada(chegadaDoTransito({ estoqueAtual: 10, emTransito: 5, consumoDiario: 1, leadTimeDias: 9 }, HOJE, HOJE)), 'chega em 30/10 (hoje)');
});

test('C-049 (R-132): cobertura absurda vira "> 365 d"; sem consumo, o texto pedido', () => {
  assert.equal(rotuloCobertura(27611), '> 365 d');
  assert.equal(rotuloCobertura(365), '365 d');
  assert.equal(rotuloCobertura(12.4), '12 d');
  assert.equal(rotuloCobertura(null), 'Sem giro');
  assert.equal(rotuloCobertura(null, 'Sem consumo'), 'Sem consumo');
});
