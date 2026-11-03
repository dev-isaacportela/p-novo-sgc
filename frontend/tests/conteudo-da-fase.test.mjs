// R-050 (spec 015 da lib): o conteúdo da aba "Nesta fase" por fase do quadro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCOS_POR_FASE, blocosDaFase } from '../src/lib/conteudo-da-fase.ts';
import { FASES } from '../src/lib/transicoes.ts';

test('R-050: toda fase do quadro tem ao menos um bloco, sem repetição, e nenhuma fase fica de fora', () => {
  for (const fase of FASES) {
    const blocos = blocosDaFase(fase);
    assert.ok(blocos.length >= 1, `${fase} sem bloco`);
    assert.equal(new Set(blocos).size, blocos.length, `${fase} repete bloco`);
  }
  assert.deepEqual(Object.keys(BLOCOS_POR_FASE).sort(), [...FASES].sort());
  assert.deepEqual(blocosDaFase(null), [], 'mapa de fases ainda não carregado');
});

test('R-050/R-054: a montagem abre com as solicitações do comercial, depois itens e alertas; expedição mostra notas fiscais e recebimento; faturamento e B.O. mostram B.O. e notas', () => {
  // R-054: só a Análise mostra a fila do comercial, e antes de Itens.
  assert.deepEqual(blocosDaFase('analise'), ['solicitacoes', 'itens', 'alertas']);
  for (const fase of ['tecnica', 'diretoria']) {
    assert.ok(blocosDaFase(fase).includes('itens') && blocosDaFase(fase).includes('alertas'), fase);
  }
  for (const fase of ['enviado', 'transito']) {
    assert.ok(blocosDaFase(fase).includes('notas-fiscais'), fase);
    assert.ok(blocosDaFase(fase).includes('recebimento'), fase);
    assert.ok(!blocosDaFase(fase).includes('itens'), `${fase}: itens não se editam depois do envio`);
  }
  for (const fase of ['faturamento', 'bo']) {
    assert.ok(blocosDaFase(fase).includes('bo'), fase);
    assert.ok(blocosDaFase(fase).includes('notas-fiscais'), fase);
  }
  assert.ok(!blocosDaFase('analise').includes('bo'), 'B.O. antes do envio não existe');
});
