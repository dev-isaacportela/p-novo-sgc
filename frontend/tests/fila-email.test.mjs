// Spec 016 / RF-002: o texto da tela quando o e-mail entra na fila
// (src/lib/fila-email.ts). O fluxo da fila é provado no smoke do backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AVISO_FILA, resumoComFila, textoDoEnvioRegistrado } from '../src/lib/fila-email.ts';
import { resumoDaCobranca } from '../src/lib/faturamento.ts';

test('C-001 (016): e-mail que saiu na hora — o aviso do envio é o de sempre', () => {
  assert.equal(textoDoEnvioRegistrado(false), 'Envio registrado no pedido.');
  assert.equal(textoDoEnvioRegistrado(undefined), 'Envio registrado no pedido.', 'servidor sem a 016 publicada');
});

test('C-002 (016) / RF-002 / RN-001: e-mail na fila — o aviso diz que o sistema tenta de novo, 3 tentativas no total', () => {
  const texto = textoDoEnvioRegistrado(true);
  assert.equal(texto, `Envio registrado no pedido. ${AVISO_FILA}`);
  assert.match(texto, /a cada 5 minutos/);
  assert.match(texto, /até 3 tentativas no total/);
  assert.equal(textoDoEnvioRegistrado('true'), 'Envio registrado no pedido.', 'só o booleano do servidor conta');
});

test('C-003 (016): a cobrança na fila marca o contato registrado; a que saiu fica como antes', () => {
  const resumo = resumoDaCobranca('Faturamento pendente', 'pedidos@fornecedor.com');
  assert.equal(resumoComFila(resumo, false), resumo);
  assert.equal(resumoComFila(resumo, true), `${resumo} (e-mail na fila de nova tentativa)`);
  assert.ok(resumoComFila(resumo, true).length <= 1000, 'cabe no resumo do contato');
});
