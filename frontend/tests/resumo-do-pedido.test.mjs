// R-141 / C-046 (002): o resumo que abre o card depois da Análise — selos de
// aprovação, envio e cancelamento e o faturado do topo (src/lib/resumo-do-pedido.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { selosDoPedido, faturadoDoPedido, textoDoEnvio, rotuloPercentual } from '../src/lib/resumo-do-pedido.ts';

const CAPA = {
  vlTotal: 1000, vlFaturado: 0, percFaturadoValor: 0,
  tecEm: '', tecNome: '', tecMotivo: '', dirEm: '', dirNome: '', dirMotivo: '',
  dtEnvio: '', canal: '', emailEnvio: '', numped: '', envioNome: '',
  cancMotivo: '', cancEm: '', cancNome: '',
};

test('C-046: pedido aprovado e enviado mostra os três selos na ordem em que aconteceram', () => {
  const selos = selosDoPedido({
    ...CAPA,
    tecEm: '2026-10-28T09:15:00', tecNome: 'Gil Gestor',
    dirEm: '2026-10-28T14:00:00', dirNome: 'Dora Diretora',
    dtEnvio: '2026-10-29', canal: 'email', emailEnvio: 'pedidos@fresenius.com', numped: '50123', envioNome: 'Ana Analista',
  });
  assert.deepEqual(selos.map((s) => s.chave), ['tecnica', 'diretoria', 'envio']);
  assert.equal(selos[0].texto, 'por Gil Gestor em 28/10/2026 09:15');
  assert.equal(selos[1].titulo, 'Aprovado pela diretoria');
  assert.equal(selos[2].texto, '29/10/2026 por e-mail para pedidos@fresenius.com · pedido nº 50123 · registrado por Ana Analista');
});

test('C-046: reprovação apaga a data da aprovação e aparece como alerta; a da diretoria vence a técnica', () => {
  const tecnica = selosDoPedido({ ...CAPA, tecMotivo: 'Cobertura alta', tecEm: '' });
  assert.deepEqual(tecnica.map((s) => [s.chave, s.tom, s.texto]), [['reprovacao', 'alert', 'Cobertura alta']]);
  const ambas = selosDoPedido({ ...CAPA, tecMotivo: 'A', dirMotivo: 'B' });
  assert.equal(ambas.length, 1);
  assert.equal(ambas[0].titulo, 'Reprovado pela diretoria');
});

test('C-046: compra cancelada traz motivo, quem e quando; envio pela plataforma não cita e-mail', () => {
  const [selo] = selosDoPedido({ ...CAPA, cancMotivo: 'Fornecedor sem estoque', cancNome: 'Ana', cancEm: '2026-11-01T08:00:00' });
  assert.equal(selo.chave, 'cancelado');
  assert.equal(selo.texto, 'Fornecedor sem estoque — por Ana em 01/11/2026 08:00');
  assert.equal(textoDoEnvio({ dtEnvio: '2026-10-29', canal: 'plataforma', emailEnvio: '', numped: '' }), '29/10/2026 pela plataforma do fornecedor');
});

test('C-046: o faturado usa o percentual gravado, satura a barra em 100 e diz quanto falta', () => {
  assert.deepEqual(faturadoDoPedido({ vlTotal: 1000, vlFaturado: 600, percFaturadoValor: 60 }), { pct: 60, pctBarra: 60, falta: 400 });
  assert.deepEqual(faturadoDoPedido({ vlTotal: 1000, vlFaturado: 1100, percFaturadoValor: 110 }), { pct: 110, pctBarra: 100, falta: 0 });
  assert.equal(faturadoDoPedido({ vlTotal: 200, vlFaturado: 50, percFaturadoValor: 0 }).pct, 25, 'sem percentual gravado, calcula');
  assert.equal(rotuloPercentual(60), '60,0 %');
});
