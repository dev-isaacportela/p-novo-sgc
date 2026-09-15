// Spec 002 — o que a criação e os formulários do pedido calculam
// (`src/lib/pedido.ts`) e os contratos de tela do quadro (`src/lib/quadro.ts`).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoDoPedido, periodoPadrao, PERIODO_PADRAO_DIAS, PRIORIDADES,
  tituloDoPedido, validarEnvio, validarMotivo, validarNovoPedido,
} from '../src/lib/pedido.ts';
import {
  ATUALIZAR_A_CADA_MS, QUADRO_COMPRAS, ROTA_NOVO_PEDIDO, ROTULO_NOVO_PEDIDO,
} from '../src/lib/quadro.ts';

test('RN-014: o título é "FILIAL · FORNECEDOR", em maiúsculas', () => {
  assert.equal(tituloDoPedido('1 — Matriz', 'Nutrilatina'), '1 — MATRIZ · NUTRILATINA');
  assert.equal(tituloDoPedido('  2 — Filial Norte ', ' Vitao '), '2 — FILIAL NORTE · VITAO');
});

test('C-003 / RN-014: o período sugerido são os últimos 45 dias — em 15/09/2026, de 01/08 a 15/09', () => {
  assert.equal(PERIODO_PADRAO_DIAS, 45);
  assert.deepEqual(periodoPadrao(new Date('2026-09-15')), { inicio: '2026-08-01', fim: '2026-09-15' });
  assert.deepEqual(periodoPadrao(new Date('2026-01-10')), { inicio: '2025-11-26', fim: '2026-01-10' });
  const padrao = periodoPadrao();
  assert.match(padrao.inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(padrao.inicio < padrao.fim);
});

test('C-002: criação sem os três obrigatórios é recusada, e a mensagem cita o campo em falta', () => {
  const semFilial = validarNovoPedido({ codfornec: '1015', codfilial: '', inicio: '2026-08-01', fim: '2026-09-15' });
  assert.equal(semFilial.ok, false);
  assert.match(semFilial.erros.filial, /filial/i);
  assert.equal(semFilial.erros.fornecedor, undefined);

  const semFornecedor = validarNovoPedido({ codfornec: '', codfilial: '1', inicio: '2026-08-01', fim: '2026-09-15' });
  assert.equal(semFornecedor.ok, false);
  assert.match(semFornecedor.erros.fornecedor, /fornecedor/i);

  const semPeriodo = validarNovoPedido({ codfornec: '1015', codfilial: '1', inicio: '', fim: '' });
  assert.equal(semPeriodo.ok, false);
  assert.match(semPeriodo.erros.periodo, /período/i);

  const invertido = validarNovoPedido({ codfornec: '1015', codfilial: '1', inicio: '2026-09-15', fim: '2026-08-01' });
  assert.equal(invertido.ok, false);

  const bom = validarNovoPedido({ codfornec: '1015', codfilial: '1', inicio: '2026-08-01', fim: '2026-09-15' });
  assert.deepEqual(bom, { ok: true, erros: {} });
});

test('RN-009: motivo vazio é recusado e a mensagem cita "motivo"; acima de 1000 caracteres também', () => {
  assert.match(validarMotivo(''), /motivo/i);
  assert.match(validarMotivo('   '), /motivo/i);
  assert.equal(validarMotivo('Preço acima do praticado'), null);
  assert.match(validarMotivo('x'.repeat(1001)), /1000/);
});

test('RN-012: o envio exige canal, data e número do pedido, e só aceita contato cadastrado', () => {
  const contatos = ['pedidos@nutrilatina.com.br', 'comercial@nutrilatina.com.br'];
  const bom = validarEnvio({ canal: 'email', contato: contatos[0], data: '2026-09-15', numped: '998877' }, contatos);
  assert.deepEqual(bom, { ok: true, erros: {} });

  const foraDaLista = validarEnvio({ canal: 'email', contato: 'eu@gmail.com', data: '2026-09-15', numped: '998877' }, contatos);
  assert.equal(foraDaLista.ok, false);
  assert.match(foraDaLista.erros.contato, /cadastrad/i);

  const semNumero = validarEnvio({ canal: 'email', contato: contatos[0], data: '2026-09-15', numped: '' }, contatos);
  assert.equal(semNumero.ok, false);
  assert.match(semNumero.erros.numped, /número do pedido/i);

  const semData = validarEnvio({ canal: 'email', contato: contatos[0], data: '', numped: '998877' }, contatos);
  assert.equal(semData.ok, false);
  assert.match(semData.erros.data, /data/i);

  // Plataforma não cobra contato cadastrado: o destino é o link do fornecedor.
  const plataforma = validarEnvio({ canal: 'plataforma', contato: '', data: '2026-09-15', numped: '998877' }, []);
  assert.equal(plataforma.ok, true);
});

test('RN-018: a prioridade é normal, alta ou urgente, e nasce normal', () => {
  assert.deepEqual([...PRIORIDADES], ['normal', 'alta', 'urgente']);
  assert.equal(PRIORIDADES[0], 'normal');
});

test('C-036: o quadro oferece um botão "Novo pedido", que leva à criação do SGC', () => {
  assert.equal(ROTULO_NOVO_PEDIDO, 'Novo pedido');
  assert.equal(ROTA_NOVO_PEDIDO, '/pedidos/novo');
  assert.equal(QUADRO_COMPRAS, 'compras');
});

test('C-037 / RNF-002: o quadro se atualiza sozinho a cada 60 segundos', () => {
  assert.equal(ATUALIZAR_A_CADA_MS, 60000);
});

test('estadoDoPedido: capa ainda não carregada fecha tudo o que depende de motivo (menor privilégio)', () => {
  assert.deepEqual(estadoDoPedido(null, true), {
    souCriador: true, temMotivoCancelamento: false, temMotivoTecnico: false,
    temMotivoDiretoria: false, envioRegistrado: false,
  });
  const capa = {
    ID_CARD: 10, CANC_MOTIVO: '', TEC_MOTIVO: 'Preço acima do praticado', DIR_MOTIVO: '  ',
    DT_ENVIO: '2026-09-15', NUMPED_WINTHOR: '998877',
  };
  assert.deepEqual(estadoDoPedido(capa, false), {
    souCriador: false, temMotivoCancelamento: false, temMotivoTecnico: true,
    temMotivoDiretoria: false, envioRegistrado: true,
  });
  // Envio só conta com data E número — é o que o gancho confere.
  assert.equal(estadoDoPedido({ ...capa, NUMPED_WINTHOR: '' }, false).envioRegistrado, false);
});
