// R-141 / C-024 (006): o acompanhamento do faturamento no topo do Trânsito (src/lib/acompanhamento.ts).
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

import { podeNotificarGestor, gestoresDe, responsaveisComGestor, textoNotificacaoGestor } from '../src/lib/acompanhamento.ts';

test('C-034 / RN-017 (P-3): "Notificar gestor" só a partir de 5 dias úteis sem faturamento completo, para quem tem a persona gestor, que entra nos responsáveis uma vez só', () => {
  const quatro = acompanhamentoDoFaturamento({ dtEnvio: '2026-08-17', hoje: '2026-08-21', percFaturado: 0 });
  const cinco = acompanhamentoDoFaturamento({ dtEnvio: '2026-08-17', hoje: '2026-08-24', percFaturado: 40 });
  const completo = acompanhamentoDoFaturamento({ dtEnvio: '2026-08-03', hoje: '2026-08-24', percFaturado: 100 });
  assert.deepEqual([podeNotificarGestor(quatro), podeNotificarGestor(cinco), podeNotificarGestor(completo)], [false, true, false]);

  assert.deepEqual(gestoresDe([
    { USUARIO_ID: 3, NOME: 'Gil Gestor', EMAIL: 'gil@sgc.local', PERSONA: 'gestor' },
    { USUARIO_ID: 2, NOME: 'Ana Analista', EMAIL: 'ana@sgc.local', PERSONA: 'analista' },
    { USUARIO_ID: 7, NOME: 'Bia Gerente', EMAIL: 'bia@sgc.local', PERSONA: 'gestor' },
  ]), [
    { id: 7, nome: 'Bia Gerente', email: 'bia@sgc.local' },
    { id: 3, nome: 'Gil Gestor', email: 'gil@sgc.local' },
  ]);

  assert.deepEqual(responsaveisComGestor([2], 3), { lista: [2, 3], mudou: true });
  assert.deepEqual(responsaveisComGestor([2, 3], 3), { lista: [2, 3], mudou: false });
  assert.equal(
    textoNotificacaoGestor({ fornecedor: 'Fresenius Kabi', diasUteis: 9, saldo: 48000, quem: 'Ana Analista' }),
    'Pedido de Fresenius Kabi sem faturamento completo há 9 dias úteis (saldo R$ 48.000,00). Ana Analista indicou você como gestor para cobrar a indústria.',
  );
});
