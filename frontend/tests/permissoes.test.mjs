// Spec 002 — a matriz de permissões por persona (`src/lib/permissoes.ts`).
// A outra metade da regra (a SQL ligada) é testada em
// backend/simulator/smoke/002-quadro.mjs; RNF-005 prova que as duas concordam.
import test from 'node:test';
import assert from 'node:assert/strict';
import { menuParaPersona, permissoesDe, personaDe, PERSONAS } from '../src/lib/permissoes.ts';

test('RN-001: sem persona atribuída vale o nível da plataforma; em falha, analista', () => {
  assert.deepEqual(personaDe(null), { persona: 'analista', acesso: 'MEMBER' });
  assert.deepEqual(personaDe({ ACCESS_LEVEL: 'ADMIN' }), { persona: 'admin', acesso: 'ADMIN' });
  assert.deepEqual(personaDe({ ACCESS_LEVEL: 'MEMBER' }), { persona: 'analista', acesso: 'MEMBER' });
  assert.deepEqual(personaDe({ ACCESS_LEVEL: 'RESTRICTED' }), { persona: 'comercial', acesso: 'RESTRICTED' });
  // Persona gravada manda sobre o nível; lixo no dado cai no nível.
  assert.equal(personaDe({ PERSONA: 'gestor', ACCESS_LEVEL: 'MEMBER' }).persona, 'gestor');
  assert.equal(personaDe({ PERSONA: 'chefe', ACCESS_LEVEL: 'MEMBER' }).persona, 'analista');
  assert.equal(personaDe({ PERSONA: 'gestor', ACCESS_LEVEL: 'inventado' }).acesso, 'MEMBER');
});

test('RN-002: READ_ONLY zera a operação e RESTRICTED liga somenteProprios — os dois valem ALÉM da persona', () => {
  const leitura = permissoesDe('gestor', 'READ_ONLY');
  assert.equal(leitura.somenteLeitura, true);
  assert.equal(leitura.verQuadro, true, 'somente leitura VÊ o quadro');
  for (const chave of ['criarPedido', 'editarPedido', 'aprovarTecnica', 'aprovarDiretoria', 'cancelar',
    'registrarEnvio', 'excluirPedido', 'administrarQuadro', 'agendar', 'cancelarAgendamento']) {
    assert.equal(leitura[chave], false, `${chave} deveria estar fechado para somente leitura`);
  }
  const restrito = permissoesDe('analista', 'RESTRICTED');
  assert.equal(restrito.somenteProprios, true);
  assert.equal(restrito.editarPedido, true, 'restrito continua operando — só os próprios pedidos');
  assert.equal(permissoesDe('analista', 'MEMBER').somenteProprios, false);
});

test('C-044 / RN-021: a persona comercial é a única sem acesso ao quadro, e o menu dela não traz compras', () => {
  const comercial = permissoesDe('comercial', 'MEMBER');
  assert.equal(comercial.verQuadro, false);
  for (const persona of PERSONAS.filter((p) => p !== 'comercial')) {
    assert.equal(permissoesDe(persona, 'MEMBER').verQuadro, true, `${persona} deveria ver o quadro`);
  }
  const menu = menuParaPersona(comercial);
  assert.equal(menu.length, 0);
  for (const rota of ['/quadro', '/agenda', '/fornecedores']) {
    assert.equal(menu.some((item) => item.to === rota), false, `${rota} não é do comercial`);
  }
});

test('C-038 / RN-016: administrar o quadro é só do admin; agendar e cancelar agendamento seguem P-04/P-10 (B-02 da 004)', () => {
  assert.equal(permissoesDe('admin', 'ADMIN').administrarQuadro, true);
  for (const persona of ['analista', 'gestor', 'diretoria', 'comercial']) {
    assert.equal(permissoesDe(persona, 'MEMBER').administrarQuadro, false, persona);
  }
  const agendam = PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').agendar);
  assert.deepEqual(agendam, ['admin', 'analista', 'gestor']);
  const cancelam = PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').cancelarAgendamento);
  assert.deepEqual(cancelam, ['admin', 'gestor', 'diretoria']);
});

test('C-040: o analista não aprova nada — a tela desabilita a ação com o motivo, não a esconde', () => {
  const analista = permissoesDe('analista', 'MEMBER');
  assert.equal(analista.aprovarTecnica, false);
  assert.equal(analista.aprovarDiretoria, false);
  assert.equal(analista.criarPedido, true);
  assert.equal(analista.cancelar, true);
  assert.equal(analista.registrarEnvio, true);
  assert.equal(analista.excluirPedido, false);
});

test('RN-015 / P-13: excluem pedido admin, gestor e diretoria; veem Segurança admin e diretoria', () => {
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').excluirPedido), ['admin', 'gestor', 'diretoria']);
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').verSeguranca), ['admin', 'diretoria']);
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').aprovarTecnica), ['admin', 'gestor']);
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').aprovarDiretoria), ['admin', 'diretoria']);
});

test('menuParaPersona: o menu do analista tem quadro, novo pedido, agenda, notificações e fornecedores — e nada de segurança', () => {
  const rotas = menuParaPersona(permissoesDe('analista', 'MEMBER')).map((item) => item.to);
  assert.deepEqual(rotas, ['/quadro', '/pedidos/novo', '/agenda', '/notificacoes', '/fornecedores']);
  assert.ok(menuParaPersona(permissoesDe('admin', 'ADMIN')).some((item) => item.to === '/seguranca'));
  assert.ok(menuParaPersona(permissoesDe('gestor', 'MEMBER')).some((item) => item.to === '/coberturas'));
  // Somente leitura vê o quadro, mas não a criação de pedido.
  const leitura = menuParaPersona(permissoesDe('gestor', 'READ_ONLY')).map((item) => item.to);
  assert.ok(leitura.includes('/quadro'));
  assert.equal(leitura.includes('/pedidos/novo'), false);
});
