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
  // Onda 3 (R-056): Solicitações entra e o comercial passa a ter DOIS itens.
  assert.deepEqual(menu.map((item) => item.to), ['/solicitacoes', '/bo']);
  for (const rota of ['/quadro', '/agenda', '/fornecedores', '/notas-fiscais', '/faturamentos-pendentes', '/nfs-em-atraso', '/analises', '/compras-inteligentes']) {
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
    '/quadro', '/pedidos/novo', '/compras-inteligentes', '/solicitacoes', '/agenda', '/notificacoes',
    '/bo', '/fornecedores',
    '/notas-fiscais', '/faturamentos-pendentes', '/nfs-em-atraso',
    '/analises',
  ]);
  assert.ok(menuParaPersona(permissoesDe('admin', 'ADMIN')).some((item) => item.to === '/seguranca'));
  assert.ok(menuParaPersona(permissoesDe('gestor', 'MEMBER')).some((item) => item.to === '/coberturas'));
  // Somente leitura vê o quadro, mas não a criação de pedido.
  const leitura = menuParaPersona(permissoesDe('gestor', 'READ_ONLY')).map((item) => item.to);
  assert.ok(leitura.includes('/quadro'));
  assert.equal(leitura.includes('/pedidos/novo'), false);
});

test('C-027 / R-028/R-038 (onda 2): chaves novas por persona — comercial só vê B.O.; diretoria só lê; READ_ONLY zera operar*/registrarContato, mas não ver*', () => {
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

test('C-021 / R-056 e R-061 (onda 3): chaves novas por persona — o comercial registra mas não avalia, a diretoria só lê, criarSolicitacao não é de analista nem gestor (RN-002 da 008) e READ_ONLY zera criar/avaliar sem tocar em ver*', () => {
  const chave = (nome) => PERSONAS.filter((p) => permissoesDe(p, 'MEMBER')[nome]);

  // 008 (R-056): ver todas as personas; registrar só admin e comercial (o autor
  // É o vendedor); avaliar admin, analista e gestor.
  assert.deepEqual(chave('verSolicitacoes'), ['admin', 'analista', 'gestor', 'diretoria', 'comercial']);
  assert.deepEqual(chave('criarSolicitacao'), ['admin', 'comercial']);
  assert.deepEqual(chave('avaliarSolicitacao'), ['admin', 'analista', 'gestor']);

  // 009 (R-061): análises menos o comercial. `verRelatorios`/`salvarRelatorio`
  // saíram com a tela de relatórios salvos, adiada em 2026-09-16 (R-114).
  assert.deepEqual(chave('verAnalises'), ['admin', 'analista', 'gestor', 'diretoria']);
  for (const nome of ['verRelatorios', 'salvarRelatorio']) {
    assert.equal(nome in permissoesDe('admin', 'ADMIN'), false, `${nome} saiu com /relatorios (R-114)`);
  }

  // READ_ONLY: ver* atravessa (como verCoberturas/verBo), o resto zera.
  const leitura = permissoesDe('admin', 'READ_ONLY');
  for (const nome of ['verSolicitacoes', 'verAnalises']) {
    assert.equal(leitura[nome], true, `READ_ONLY continua vendo ${nome}`);
  }
  for (const nome of ['criarSolicitacao', 'avaliarSolicitacao']) {
    assert.equal(leitura[nome], false, `READ_ONLY zera ${nome}`);
  }
  // E o comercial READ_ONLY vê a lista, mas não registra.
  const comercialLeitura = permissoesDe('comercial', 'READ_ONLY');
  assert.equal(comercialLeitura.verSolicitacoes, true);
  assert.equal(comercialLeitura.criarSolicitacao, false);

  // O grupo Gestão é do resto; o comercial não chega às rotas (menu + porteiro).
  const gestao = menuParaPersona(permissoesDe('gestor', 'MEMBER')).filter((i) => i.grupo === 'Gestão');
  assert.deepEqual(gestao.map((i) => i.to), ['/analises'], 'Gestão fica só com Análises (R-114)');
  assert.equal(menuParaPersona(permissoesDe('comercial', 'MEMBER')).length, 2, 'o comercial tem exatamente 2 itens de menu');
});

test('C-023 / RN-019 (011, R-095): chaves novas de compras inteligentes — ver inclui a diretoria e atravessa READ_ONLY (como verCoberturas), operar é de admin/analista/gestor, parametrizar só de admin e gestor, e o item de menu entra logo depois de "Novo pedido"', () => {
  const chave = (nome) => PERSONAS.filter((p) => permissoesDe(p, 'MEMBER')[nome]);

  assert.deepEqual(chave('verComprasInteligentes'), ['admin', 'analista', 'gestor', 'diretoria']);
  assert.deepEqual(chave('operarComprasInteligentes'), ['admin', 'analista', 'gestor']);
  assert.deepEqual(chave('parametrizarCompras'), ['admin', 'gestor']);

  // READ_ONLY: ver* atravessa (como verCoberturas), as duas escritas zeram.
  const leitura = permissoesDe('gestor', 'READ_ONLY');
  assert.equal(leitura.verComprasInteligentes, true, 'READ_ONLY continua vendo verComprasInteligentes');
  assert.equal(leitura.operarComprasInteligentes, false, 'READ_ONLY zera operarComprasInteligentes');
  assert.equal(leitura.parametrizarCompras, false, 'READ_ONLY zera parametrizarCompras');

  // RESTRICTED opera: o card que ele cria é dele (R-095) — o recorte "só os
  // próprios" é `somenteProprios`, não a chave.
  const restrito = permissoesDe('analista', 'RESTRICTED');
  assert.equal(restrito.operarComprasInteligentes, true);
  assert.equal(restrito.somenteProprios, true);

  // Menu: grupo Compras, logo depois de "Novo pedido"; o comercial fica fora.
  const compras = menuParaPersona(permissoesDe('gestor', 'MEMBER')).filter((i) => i.grupo === 'Compras');
  assert.equal(compras[1].to, '/pedidos/novo');
  assert.equal(compras[2].to, '/compras-inteligentes');
  assert.equal(compras[2].label, 'Compras inteligentes');
  assert.equal(
    menuParaPersona(permissoesDe('comercial', 'MEMBER')).some((i) => i.to === '/compras-inteligentes'),
    false,
    'o comercial não vê compras inteligentes',
  );
  // A diretoria vê o item mesmo sem operar nem parametrizar.
  assert.ok(menuParaPersona(permissoesDe('diretoria', 'MEMBER')).some((i) => i.to === '/compras-inteligentes'));
});

test('C-011 (012): a tela de coberturas e de admin e gestor — analista, diretoria e comercial nao entram; o gestor somente-leitura ve a lista inteira e nao grava, porque `podeManter` e verCoberturas E NAO somenteLeitura', () => {
  assert.deepEqual(PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').verCoberturas), ['admin', 'gestor']);

  const leitura = permissoesDe('gestor', 'READ_ONLY');
  assert.equal(leitura.verCoberturas, true, 'READ_ONLY ve: o porteiro de rota deixa passar');
  assert.equal(leitura.somenteLeitura, true, 'e a tela desabilita os controles de escrita com esta chave');

  const analista = permissoesDe('analista', 'MEMBER');
  assert.equal(analista.verCoberturas, false, 'pelo endereco direto tambem recebe a recusa (A-8)');
  assert.equal(menuParaPersona(analista).some((i) => i.to === '/coberturas'), false);
  assert.equal(menuParaPersona(permissoesDe('gestor', 'READ_ONLY')).some((i) => i.to === '/coberturas'), true);
});
