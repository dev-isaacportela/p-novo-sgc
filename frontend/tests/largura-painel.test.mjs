// A largura do painel de detalhe (src/lib/largura-painel.ts, R-129).
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE_LARGURA, LARGURAS, curvasJuntas, larguraDe, proximaLargura } from '../src/lib/largura-painel.ts';

test('R-129: quatro larguras em ordem; + e − andam um passo e param nas pontas; o ciclo inteiro vai de Estreito a Metade e volta', () => {
  assert.deepEqual(LARGURAS, ['estreito', 'medio', 'largo', 'metade']);
  let l = 'estreito';
  const ida = [];
  for (let i = 0; i < 4; i += 1) { l = proximaLargura(l, 1); ida.push(l); }
  assert.deepEqual(ida, ['medio', 'largo', 'metade', 'metade']);
  const volta = [];
  for (let i = 0; i < 4; i += 1) { l = proximaLargura(l, -1); volta.push(l); }
  assert.deepEqual(volta, ['largo', 'medio', 'estreito', 'estreito']);
});

test('R-129: o valor guardado no navegador volta como largura; ausente, vazio ou inválido cai em Médio; a chave é por usuário', () => {
  assert.equal(larguraDe('largo'), 'largo');
  assert.equal(larguraDe(null), 'medio');
  assert.equal(larguraDe(''), 'medio');
  assert.equal(larguraDe('enorme'), 'medio');
  assert.equal(proximaLargura('lixo', 1), 'largo', 'inválido conta como Médio');
  assert.equal(CHAVE_LARGURA(7), 'sgc2.compras-inteligentes.largura-painel.7');
});

test('R-129: com o painel Largo ou na Metade da tela, as duas curvas viram uma coluna só', () => {
  assert.equal(curvasJuntas('estreito'), false);
  assert.equal(curvasJuntas('medio'), false);
  assert.equal(curvasJuntas('largo'), true);
  assert.equal(curvasJuntas('metade'), true);
});
