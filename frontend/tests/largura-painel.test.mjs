// A largura do painel de detalhe (src/lib/largura-painel.ts, R-129).
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHAVE_LARGURA, LARGURAS, larguraDe, larguraEfetiva, listaCompacta, proximaLargura, rolagemDoPainel } from '../src/lib/largura-painel.ts';

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

test('R-129: o painel nunca deixa a lista com menos de 640 px — grade de 1448 px: tudo cabe; 1200 px: Largo e Metade caem para Médio; 1100 px: só Estreito; sem medida vale a escolha', () => {
  assert.equal(larguraEfetiva('metade', 1448), 'metade');
  assert.equal(larguraEfetiva('largo', 1448), 'largo');
  assert.equal(larguraEfetiva('largo', 1200), 'medio', '1200 - 16 - 620 = 564 < 640; com 480 sobram 704');
  assert.equal(larguraEfetiva('metade', 1200), 'medio');
  assert.equal(larguraEfetiva('medio', 1100), 'estreito', '1100 - 16 - 480 = 604 < 640');
  assert.equal(larguraEfetiva('estreito', 900), 'estreito', 'Estreito é o piso');
  assert.equal(larguraEfetiva('metade', 0), 'metade');
});

test('R-129: a lista fica compacta abaixo de 900 px medidos; o painel rola inteiro quando sobram menos de 160 px para os detalhes', () => {
  assert.equal(listaCompacta(899), true);
  assert.equal(listaCompacta(900), false);
  assert.equal(listaCompacta(0), false, 'sem medida, layout normal');
  assert.equal(rolagemDoPainel(600, 420), 'separada');
  assert.equal(rolagemDoPainel(560, 420), 'unica');
  assert.equal(rolagemDoPainel(0, 420), 'separada');
});
