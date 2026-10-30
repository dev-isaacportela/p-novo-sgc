// Os modelos de previsão de venda da spec 011 (src/lib/previsao.ts, R-124):
// série de meses fechados, cap de outliers, MMS, MMP, SE, Holt, Holt-Winters,
// métricas de erro, Best Fit e a sugestão projetada. Valores conferidos à mão.
// Sem React, sem DOM, sem SDK.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITE_TS, MODELOS, PONTOS_MINIMOS, ajustarOutliers, holt, holtWinters, mediasDaSerie, metricas, mmp, mms,
  modeloEscolhido, periodoSazonal, preverVendas, se, serieFechada, sugestaoProjetada, textoDosParametros, resumoVendaFutura,
} from '../src/lib/previsao.ts';

const ponto = (mes, valor) => ({ mes, valor, original: valor, ajustado: false });
const h = (MES, SAIDAS) => ({ MES, SAIDAS, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 });

test('C-043: a série usa só meses FECHADOS, em ordem crescente, no máximo 12, cada mês menos as desconsideradas dele com piso zero', () => {
  const historico = [h('2026-10', 99), h('2026-09', 20), h('2026-07', 5), h('2026-08', 30), h('2025-01', 1)];
  const fora = new Map([['2026-09', 25], ['2026-08', 10]]);
  const serie = serieFechada(historico, '2026-10-30', fora);
  assert.deepEqual(serie.map((p) => [p.mes, p.valor]), [['2025-01', 1], ['2026-07', 5], ['2026-08', 20], ['2026-09', 0]], 'outubro é o mês corrente e fica fora; setembro desconta 25 de 20 e fica em 0');
  const treze = Array.from({ length: 13 }, (_, i) => h(`2025-${String(i + 1).padStart(2, '0')}`, i + 1)).concat([h('2026-01', 50)]);
  const cortada = serieFechada(treze, '2026-02-10');
  assert.equal(cortada.length, 12);
  assert.equal(cortada[0].mes, '2025-03', 'ficam os 12 mais recentes');
});

test('RN-029: cap de outliers só com 4 ou mais pontos — 7 meses de 10 e um de 100: média 21,25, σ 29,76, o 100 vira 21,25 e conta 1 ajustado; com 3 pontos nada muda', () => {
  const serie = ajustarOutliers([10, 10, 10, 10, 10, 10, 10, 100].map((v, i) => ponto(`2026-0${i + 1}`, v)));
  assert.equal(serie.media, 21.25);
  assert.equal(serie.sigma, 29.76);
  assert.equal(serie.outliersAjustados, 1);
  assert.deepEqual(serie.pontos.map((p) => p.valor), [10, 10, 10, 10, 10, 10, 10, 21.25]);
  assert.equal(serie.pontos[7].ajustado, true);
  assert.equal(serie.pontos[7].original, 100);
  const curta = ajustarOutliers([10, 10, 100].map((v, i) => ponto(`2026-0${i + 1}`, v)));
  assert.equal(curta.outliersAjustados, 0);
  assert.deepEqual(curta.pontos.map((p) => p.valor), [10, 10, 100]);
});

test('C-044 (MMS e MMP): com 10, 20, 30, 40, 50 a MMS prevê 40 (média dos 3 últimos) com erros 20 e 20 → MAD 20, MAPE 45, CE 40, TS 2 sob controle; a MMP prevê 43 com MAD 17; com 2 pontos a janela é 1', () => {
  const s = [10, 20, 30, 40, 50];
  const simples = mms(s);
  assert.equal(simples.previsao, 40);
  assert.deepEqual(simples.erros, [20, 20]);
  assert.deepEqual([simples.mad, simples.mape, simples.ce, simples.ts, simples.sobControle], [20, 45, 40, 2, true]);
  const ponderada = mmp(s);
  assert.equal(ponderada.previsao, 43, '0,5 × 50 + 0,3 × 40 + 0,2 × 30');
  assert.deepEqual(ponderada.erros, [17, 17]);
  assert.equal(ponderada.mad, 17);
  assert.equal(mms([10, 20]).previsao, 20);
  assert.equal(mmp([10, 20]).previsao, 20, 'peso único normalizado');
});

test('C-044 (SE): com 10, 20 todo alpha erra 10 no único passo; empate escolhe alpha 0,1 e a previsão é 11; série constante dá MAD 0', () => {
  const r = se([10, 20]);
  assert.equal(r.parametros.alpha, 0.1);
  assert.equal(r.previsao, 11);
  assert.equal(r.mad, 10);
  assert.equal(se([10, 10, 10, 10]).mad, 0);
  assert.equal(textoDosParametros(r), 'α 0,1');
});

test('C-044 (Holt): a série linear 10, 20, 30 é prevista sem erro por qualquer par — previsão 40, MAD 0, alpha e beta 0,2 (o primeiro do empate)', () => {
  const r = holt([10, 20, 30]);
  assert.equal(r.previsao, 40);
  assert.deepEqual(r.erros, [0, 0]);
  assert.equal(r.mad, 0);
  assert.deepEqual(r.parametros, { alpha: 0.2, beta: 0.2 });
  assert.equal(textoDosParametros(r), 'α 0,2 · β 0,2');
});

test('C-044 (Holt-Winters): período 4 até 11 pontos e 6 com 12; com menos de 2 períodos devolve o Holt rotulado "sem sazonalidade"; constante de 8 meses prevê o próprio valor com MAD 0', () => {
  assert.equal(periodoSazonal(11), 4);
  assert.equal(periodoSazonal(12), 6);
  const curta = holtWinters([10, 20, 30, 40, 50]);
  assert.equal(curta.modelo, 'hw');
  assert.equal(curta.rotulo, 'Holt-Winters (sem sazonalidade)');
  assert.equal(curta.semSazonalidade, true);
  assert.equal(curta.previsao, holt([10, 20, 30, 40, 50]).previsao);
  const plana = holtWinters([10, 10, 10, 10, 10, 10, 10, 10]);
  assert.equal(plana.previsao, 10);
  assert.equal(plana.mad, 0);
  assert.equal(plana.semSazonalidade, undefined);
  assert.deepEqual(plana.parametros, { alpha: 0.2, beta: 0.2, gamma: 0.2 });
  assert.equal(textoDosParametros(plana), 'α 0,2 · β 0,2 · γ 0,2');
});

test('RN-030: métricas — erros 5 ×5 dão MAD 5, CE 25 e TS 5, fora de controle (limite ±4); MAPE só conta reais > 0; sem MAD o TS é 0', () => {
  assert.equal(LIMITE_TS, 4);
  const fora = metricas([5, 5, 5, 5, 5], [10, 10, 10, 10, 10]);
  assert.deepEqual(fora, { mad: 5, mape: 50, ce: 25, ts: 5, sobControle: false });
  const dentro = metricas([5, -5, 5, -5], [10, 0, 10, 10]);
  assert.deepEqual(dentro, { mad: 5, mape: 50, ce: 0, ts: 0, sobControle: true });
  assert.deepEqual(metricas([], []), { mad: 0, mape: 0, ce: 0, ts: 0, sobControle: true });
});

test('C-045: Best Fit é o de menor MAD — na série linear 10..50 vence o Holt (MAD 0) e "bestfit" resolve para ele; com menos de 3 pontos não há projeção nem modelos', () => {
  assert.equal(PONTOS_MINIMOS, 3);
  const p = preverVendas([10, 20, 30, 40, 50].map((v, i) => ponto(`2026-0${i + 1}`, v)));
  assert.equal(p.suficiente, true);
  assert.equal(p.modelos.length, 5);
  assert.deepEqual(p.modelos.map((m) => m.modelo), MODELOS.filter((m) => m.value !== 'bestfit').map((m) => m.value));
  assert.equal(p.bestFit, 'holt');
  assert.equal(modeloEscolhido(p, 'bestfit').modelo, 'holt');
  assert.equal(modeloEscolhido(p, 'mms').previsao, 40);
  assert.deepEqual(p.medias, { m3: 40, m6: 30, m12: 30 });
  const curta = preverVendas([10, 20].map((v, i) => ponto(`2026-0${i + 1}`, v)));
  assert.equal(curta.suficiente, false);
  assert.deepEqual(curta.modelos, []);
  assert.equal(curta.bestFit, null);
  assert.equal(modeloEscolhido(curta, 'bestfit'), null);
  assert.deepEqual(mediasDaSerie([10, 20, 30, 40]), { m3: 30, m6: 25, m12: 25 });
});

test('RN-031: sugestão projetada — previsão 300/mês é 10/dia; cobertura 35, estoque 100, trânsito 50 e caixa 12 → 200 un. que sobem para 204; alvo no lead time de 9 dias com segurança 20 = 110; nunca negativa', () => {
  const l = { coberturaDias: 35, estoqueAtual: 100, emTransito: 50, unidadesPorCaixa: 12, leadTimeDias: 9, estoqueSeguranca: 20 };
  assert.deepEqual(sugestaoProjetada(300, l), { demandaDiaria: 10, sugestao: 204, alvoLeadTime: 110 });
  assert.equal(sugestaoProjetada(30, l).sugestao, 0, '35 − 150 < 0');
  assert.equal(sugestaoProjetada(300, { ...l, unidadesPorCaixa: 1 }).sugestao, 200);
});

test('R-126: o resumo recolhido da venda futura — "Best Fit → Holt · 60 un./mês · sugestão 312 un. (26 cx) · TS sob controle" (a série linear 10..50 segue para 60); com um modelo escolhido vem só o nome dele; sem histórico "…"; com menos de 3 pontos avisa', () => {
  const p = preverVendas([10, 20, 30, 40, 50].map((v, i) => ponto(`2026-0${i + 1}`, v)));
  const projetada = { demandaDiaria: 1.33, sugestao: 312, alvoLeadTime: 32 };
  assert.equal(resumoVendaFutura({ previsao: p, modelo: 'bestfit', projetada, unidadesPorCaixa: 12 }), 'Best Fit → Holt · 60 un./mês · sugestão 312 un. (26 cx) · TS sob controle');
  assert.equal(resumoVendaFutura({ previsao: p, modelo: 'mms', projetada, unidadesPorCaixa: 1 }), 'Média móvel simples · 40 un./mês · sugestão 312 un. · TS sob controle');
  assert.equal(resumoVendaFutura({ previsao: p, modelo: 'mms', projetada: null, unidadesPorCaixa: 1 }), 'Média móvel simples · 40 un./mês · sem sugestão projetada · TS sob controle');
  assert.equal(resumoVendaFutura({ previsao: null, modelo: 'bestfit', projetada: null, unidadesPorCaixa: 1 }), '…');
  const curta = preverVendas([10, 20].map((v, i) => ponto(`2026-0${i + 1}`, v)));
  assert.equal(resumoVendaFutura({ previsao: curta, modelo: 'bestfit', projetada: null, unidadesPorCaixa: 1 }), 'sem meses fechados suficientes · segue o consumo ponderado');
});
