// R-150 / C-024 (006): o acompanhamento do faturamento no topo do Trânsito (src/lib/acompanhamento.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { acompanhamentoDoFaturamento, rotuloDiasUteis } from '../src/lib/acompanhamento.ts';

test('C-024: conta dias úteis desde o envio e escala em 3 e 5, como o cron', () => {
  // seg 17/08 → qui 20/08 = 3 dias úteis; seg 17/08 → seg 24/08 = 5.
  const tres = acompanhamentoDoFaturamento({ dtEnvio: '2026-08-17', hoje: '2026-08-20', percFaturado: 0 });
  assert.deepEqual([tres.diasUteis, tres.nivel, tres.tom], [3, 3, 'attention']);
  assert.equal(tres.selo, 'Faturamento pendente — 3 dias úteis — contate a indústria');
  const cinco = acompanhamentoDoFaturamento({ dtEnvio: '2026-08-17', hoje: '2026-08-24', percFaturado: 40 });
  assert.deepEqual([cinco.nivel, cinco.tom], [5, 'alert']);
  assert.match(cinco.selo, /gerência avisada/);
});

test('C-024: antes de 3 dias aguarda (ou diz parcial); 100 % sai do escalonamento; sem envio não conta', () => {
  assert.equal(acompanhamentoDoFaturamento({ dtEnvio: '2026-08-17', hoje: '2026-08-18', percFaturado: 0 }).selo, 'Aguardando faturamento');
  assert.equal(acompanhamentoDoFaturamento({ dtEnvio: '2026-08-17', hoje: '2026-08-18', percFaturado: 30 }).selo, 'Faturamento parcial');
  const completo = acompanhamentoDoFaturamento({ dtEnvio: '2026-08-03', hoje: '2026-08-24', percFaturado: 100 });
  assert.deepEqual([completo.nivel, completo.tom, completo.diasUteis], [0, 'live', 15]);
  assert.deepEqual(acompanhamentoDoFaturamento({ dtEnvio: '', hoje: '2026-08-24', percFaturado: 0 }), { diasUteis: 0, nivel: 0, selo: 'Envio não registrado', tom: 'off' });
  assert.equal(rotuloDiasUteis(1), '1 dia útil');
});
