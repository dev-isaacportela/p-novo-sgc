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

test('C-044 / RN-021: a persona comercial é a única sem acesso ao quadro; o menu dela não traz compras nem fiscal — só B.O. (C-013 do plan da 007, O2-06)', () => {
  const comercial = permissoesDe('comercial', 'MEMBER');
  assert.equal(comercial.verQuadro, false);
  for (const persona of PERSONAS.filter((p) => p !== 'comercial')) {
    assert.equal(permissoesDe(persona, 'MEMBER').verQuadro, true, `${persona} deveria ver o quadro`);
  }
  const menu = menuParaPersona(comercial);
  assert.deepEqual(menu.map((item) => item.to), ['/bo']);
  for (const rota of ['/quadro', '/agenda', '/fornecedores', '/notas-fiscais', '/faturamentos-pendentes', '/nfs-em-atraso']) {
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
  // FO-07 / RF-013 da 001: quem parametriza fornecedor; READ_ONLY não salva.
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').editarFornecedor), ['admin', 'gestor', 'diretoria']);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').editarFornecedor, false);
  // D-12: Coberturas é tela de admin e gestor; READ_ONLY continua vendo (só não grava).
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').verCoberturas), ['admin', 'gestor']);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').verCoberturas, true);
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').aprovarTecnica), ['admin', 'gestor']);
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').aprovarDiretoria), ['admin', 'diretoria']);
});

test('menuParaPersona: o menu do analista tem quadro, novo pedido, agenda, notificações, B.O., fornecedores e o grupo Fiscal — e nada de segurança nem coberturas', () => {
  const rotas = menuParaPersona(permissoesDe('analista', 'MEMBER')).map((item) => item.to);
  assert.deepEqual(rotas, [
    '/quadro', '/pedidos/novo', '/agenda', '/notificacoes', '/bo', '/fornecedores',
    '/notas-fiscais', '/faturamentos-pendentes', '/nfs-em-atraso',
  ]);
  assert.ok(menuParaPersona(permissoesDe('admin', 'ADMIN')).some((item) => item.to === '/seguranca'));
  assert.ok(menuParaPersona(permissoesDe('gestor', 'MEMBER')).some((item) => item.to === '/coberturas'));
  // Somente leitura vê o quadro, mas não a criação de pedido.
  const leitura = menuParaPersona(permissoesDe('gestor', 'READ_ONLY')).map((item) => item.to);
  assert.ok(leitura.includes('/quadro'));
  assert.equal(leitura.includes('/pedidos/novo'), false);
});

test('R-028/R-038 (onda 2): chaves novas por persona — comercial só vê B.O.; diretoria só lê; READ_ONLY zera operar*/registrarContato, mas não ver*', () => {
  const CHAVES_VER = ['verNotasFiscais', 'verFaturamentoPendente', 'verNfsAtraso'];
  const CHAVES_OPERAR = ['operarNf', 'registrarContato'];

  // comercial: só verBo — nada de fiscal, nada de B.O. operado (O2-06/R-028).
  const comercial = permissoesDe('comercial', 'MEMBER');
  for (const chave of [...CHAVES_VER, ...CHAVES_OPERAR, 'operarBo']) {
    assert.equal(comercial[chave], false, `comercial não deveria ter ${chave}`);
  }
  assert.equal(comercial.verBo, true, 'comercial vê o painel de B.O. (O2-06)');

  // admin/analista/gestor: tudo ligado.
  for (const persona of ['admin', 'analista', 'gestor']) {
    const p = permissoesDe(persona, 'MEMBER');
    for (const chave of [...CHAVES_VER, ...CHAVES_OPERAR, 'verBo', 'operarBo']) {
      assert.equal(p[chave], true, `${persona} deveria ter ${chave}`);
    }
  }

  // diretoria: lê tudo (inclusive verBo), não opera nada (R-038).
  const diretoria = permissoesDe('diretoria', 'MEMBER');
  for (const chave of [...CHAVES_VER, 'verBo']) assert.equal(diretoria[chave], true, `diretoria deveria ver ${chave}`);
  for (const chave of [...CHAVES_OPERAR, 'operarBo']) assert.equal(diretoria[chave], false, `diretoria não deveria operar ${chave}`);

  // READ_ONLY: zera operar*/registrarContato (como qualquer escrita), mas ver* continua.
  const leitura = permissoesDe('gestor', 'READ_ONLY');
  for (const chave of [...CHAVES_VER, 'verBo']) assert.equal(leitura[chave], true, `READ_ONLY continua vendo ${chave}`);
  for (const chave of [...CHAVES_OPERAR, 'operarBo']) assert.equal(leitura[chave], false, `READ_ONLY zera ${chave}`);
});
