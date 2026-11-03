// Spec 008 (solicitações do comercial) — regra pura de `src/lib/solicitacoes.ts`
// (RN-001, RN-003, RN-013, RN-014, RN-016, RN-017) e a metade de tela de
// C-019/RN-018 (a matriz de `src/lib/permissoes.ts`). A metade "regra de
// negócio" dos mesmos cenários está em
// backend/simulator/smoke/008-solicitacoes.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITES_PADRAO, PARES_POR_LOTE, RASTREIO_MAX_CARACTERES,
  prioridadeDe, ordemDaPrioridade, rotuloSituacao, rotuloStatus, rotuloVenda, rotuloEstoque,
  validarSolicitacao, buscaDeCliente, alvoDeRastreio, chaveRastreio, dataReferencia, montarPares, lotesDePares,
  classificarRastreio, indexarRastreio, resumoRastreio, colunasDoCsv, linhaDoCsv,
} from '../src/lib/solicitacoes.ts';
import { menuParaPersona, permissoesDe, PERSONAS } from '../src/lib/permissoes.ts';

const HOJE = '2026-09-16';

/** `HOJE + dias` em AAAA-MM-DD — as mesmas datas relativas do seed 008. */
function emDias(dias) {
  const data = new Date(`${HOJE}T00:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

/** As 6 linhas que `sgcWintRastreioSolicitacoes` devolve para o seed da 008. */
const LINHAS_RASTREIO = [
  {
    CODPROD: 5301, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9201,
    QT_ESTOQUE: 20, DT_ULT_SAIDA: emDias(-5), QT_VENDA_90D: 90,
    QT_VENDIDA_POS: 12, DT_VENDA_POS: emDias(-20),
    QT_VENDIDA_CLIENTE: 12, QT_VENDIDA_CLIENTE_GERAL: 12,
  },
  {
    CODPROD: 5302, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9202,
    QT_ESTOQUE: 0, DT_ULT_SAIDA: emDias(-40), QT_VENDA_90D: 0,
    QT_VENDIDA_POS: 0, DT_VENDA_POS: null,
    QT_VENDIDA_CLIENTE: 0, QT_VENDIDA_CLIENTE_GERAL: 8,
  },
  {
    CODPROD: 5303, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9203,
    QT_ESTOQUE: 40, DT_ULT_SAIDA: emDias(-80), QT_VENDA_90D: 0,
    QT_VENDIDA_POS: 0, DT_VENDA_POS: null,
    QT_VENDIDA_CLIENTE: 0, QT_VENDIDA_CLIENTE_GERAL: 0,
  },
  {
    CODPROD: 5304, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9204,
    QT_ESTOQUE: 300, DT_ULT_SAIDA: emDias(-3), QT_VENDA_90D: 90,
    QT_VENDIDA_POS: 30, DT_VENDA_POS: emDias(-30),
    QT_VENDIDA_CLIENTE: 0, QT_VENDIDA_CLIENTE_GERAL: 0,
  },
  {
    CODPROD: 5305, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 0,
    QT_ESTOQUE: 0, DT_ULT_SAIDA: emDias(-50), QT_VENDA_90D: 0,
    QT_VENDIDA_POS: 0, DT_VENDA_POS: null,
    QT_VENDIDA_CLIENTE: 0, QT_VENDIDA_CLIENTE_GERAL: 0,
  },
  {
    CODPROD: 5301, CODFILIAL: '3', DT_REFERENCIA: emDias(-10), CODCLI: 9205,
    QT_ESTOQUE: 20, DT_ULT_SAIDA: emDias(-5), QT_VENDA_90D: 90,
    QT_VENDIDA_POS: 0, DT_VENDA_POS: null,
    QT_VENDIDA_CLIENTE: 0, QT_VENDIDA_CLIENTE_GERAL: 0,
  },
];

const classificadas = () => LINHAS_RASTREIO.map((linha) => classificarRastreio(linha, HOJE));

/* ─────────────── T-090 — os dois eixos do rastreio ─────────────── */

test('C-014 / RN-013: o eixo do cliente — comprou, comprou em outra filial, não comprou, não comprou (venda a terceiro é contexto), sem cliente e aguardando giro', () => {
  const eixo = classificadas().map((r) => r.venda);
  assert.deepEqual(eixo, ['comprou', 'comprou_outra_filial', 'nao_comprou', 'nao_comprou', 'sem_cliente', 'carencia']);

  const [comprou, outraFilial, , terceiro] = classificadas();
  assert.equal(comprou.qtVendidaCliente, 12);
  assert.equal(outraFilial.qtVendidaCliente, 0);
  assert.equal(outraFilial.qtVendidaClienteGeral, 8, 'a venda em outra filial é classe própria, não "não comprou" (D-011)');
  assert.equal(terceiro.qtVendidaFilial, 30, 'a venda a terceiro aparece ao lado, nunca como resposta');
});

test('RN-013: a tabela do eixo do cliente, caso a caso — cliente 0, venda na filial, venda geral, carência e fora da carência', () => {
  const base = { CODPROD: 5301, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9201, QT_ESTOQUE: 10, DT_ULT_SAIDA: emDias(-1), QT_VENDA_90D: 90 };
  const venda = (mudanca, limites) => classificarRastreio({ ...base, ...mudanca }, HOJE, limites).venda;

  assert.equal(venda({ CODCLI: 0 }), 'sem_cliente');
  assert.equal(venda({ QT_VENDIDA_CLIENTE: 5 }), 'comprou');
  assert.equal(venda({ QT_VENDIDA_CLIENTE: 0, QT_VENDIDA_CLIENTE_GERAL: 5 }), 'comprou_outra_filial');
  assert.equal(venda({ DT_REFERENCIA: emDias(-10) }), 'carencia', 'dentro da carência não se cobra resultado');
  assert.equal(venda({ DT_REFERENCIA: emDias(-45) }), 'nao_comprou');
});

test('C-002 / RN-003: cliente ausente é "Sem cliente informado" nos dois eixos de rótulo — e nunca "cliente não comprou"', () => {
  const semCliente = classificarRastreio({ ...LINHAS_RASTREIO[4] }, HOJE);
  assert.equal(semCliente.venda, 'sem_cliente');
  assert.match(rotuloVenda(semCliente.venda).label, /Sem cliente informado/);
  assert.notEqual(rotuloVenda(semCliente.venda).label, rotuloVenda('nao_comprou').label);
  assert.equal(rotuloVenda('sem_cliente').tom, 'off', 'ausência de dado não é alarme vermelho');
  assert.equal(rotuloVenda('nao_comprou').tom, 'alert');
});

test('C-015 / RN-014: o eixo do estoque — girando, sem estoque, parado, em excesso, sem estoque e girando (dentro da carência)', () => {
  const eixo = classificadas().map((r) => r.estoque);
  assert.deepEqual(eixo, ['girando', 'sem_estoque', 'parado', 'excesso', 'sem_estoque', 'girando']);

  const [girando, , parado, excesso] = classificadas();
  assert.equal(Math.round(girando.diasCobertura), 20);
  assert.equal(parado.diasSemSaida, 80);
  assert.equal(Math.round(excesso.diasCobertura), 300, 'o giro de 1/dia sobre 300 em estoque');
});

test('RN-014: a tabela do eixo do estoque, caso a caso — estoque 0, carência, parado, excesso por cobertura e excesso por giro zero', () => {
  const base = { CODPROD: 5301, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9201, QT_ESTOQUE: 20, DT_ULT_SAIDA: emDias(-5), QT_VENDA_90D: 90 };
  const estoque = (mudanca, limites) => classificarRastreio({ ...base, ...mudanca }, HOJE, limites).estoque;

  assert.equal(estoque({ QT_ESTOQUE: 0 }), 'sem_estoque', 'o que foi comprado saiu — isso nunca é alerta');
  assert.equal(estoque({ DT_REFERENCIA: emDias(-10) }), 'girando', 'dentro da carência');
  assert.equal(estoque({ QT_ESTOQUE: 40, DT_ULT_SAIDA: emDias(-80), QT_VENDA_90D: 0 }), 'parado');
  assert.equal(estoque({ QT_ESTOQUE: 40, DT_ULT_SAIDA: null, DT_VENDA_POS: null, QT_VENDA_90D: 0 }), 'parado', 'sem saída registrada também é parado');
  assert.equal(estoque({ QT_ESTOQUE: 300 }), 'excesso', '300 em estoque com giro de 1/dia = 300 dias de cobertura');
  assert.equal(estoque({ QT_VENDA_90D: 0, QT_VENDIDA_POS: 0 }), 'excesso', 'giro zero é cobertura infinita');
  assert.equal(estoque({}), 'girando', '20 dias de cobertura, com saída há 5 dias');
});

test('RN-014: o giro vale o MAIOR entre os 90 dias de PCEST e o observado desde a aprovação — item que voltou a vender não é excesso', () => {
  const voltouAVender = {
    CODPROD: 5301, CODFILIAL: '3', DT_REFERENCIA: emDias(-30), CODCLI: 9201,
    QT_ESTOQUE: 60, DT_ULT_SAIDA: emDias(-1), QT_VENDA_90D: 0, QT_VENDIDA_POS: 60, DT_VENDA_POS: emDias(-1),
  };
  const classificada = classificarRastreio(voltouAVender, HOJE);
  assert.equal(classificada.giroDiario, 2, '60 unidades em 30 dias, mesmo com os contadores de PCEST zerados');
  assert.equal(classificada.estoque, 'girando');
});

test('C-016 / RF-017: lote que falha vira "sem dado" nos dois eixos — nunca "não comprou" nem "estoque normal" — e o resumo conta quantas ficaram sem dado', () => {
  const semDado = classificarRastreio(null, HOJE);
  assert.equal(semDado.venda, 'sem_dado');
  assert.equal(semDado.estoque, 'sem_dado');
  assert.equal(rotuloVenda('sem_dado').label, 'Sem dado');
  assert.equal(rotuloEstoque('sem_dado').label, 'Sem dado');

  assert.equal(indexarRastreio([], HOJE).size, 0);
  const resumo = resumoRastreio([...classificadas(), semDado, semDado]);
  assert.equal(resumo.sem_dado, 2, 'uma contagem por solicitação sem dado, não uma por eixo');
  assert.equal(resumo.comprou, 1);
  assert.equal(resumo.nao_comprou, 2);
  assert.equal(resumo.parado, 1);
  assert.equal(resumo.excesso, 1);
});

test('C-017 / RNF-004: mudar o limite reclassifica os MESMOS dados, sem entrada nova', () => {
  const linha = {
    CODPROD: 5301, CODFILIAL: '3', DT_REFERENCIA: emDias(-45), CODCLI: 9201,
    QT_ESTOQUE: 100, DT_ULT_SAIDA: emDias(-2), QT_VENDA_90D: 90, QT_VENDIDA_POS: 0,
  };
  const com120 = classificarRastreio(linha, HOJE, { ...LIMITES_PADRAO, coberturaDias: 120 });
  const com60 = classificarRastreio(linha, HOJE, { ...LIMITES_PADRAO, coberturaDias: 60 });
  assert.equal(com120.estoque, 'girando');
  assert.equal(com60.estoque, 'excesso');
  assert.equal(com120.diasCobertura, com60.diasCobertura, 'a mesma linha, a mesma conta — só o limite mudou');
});

test('indexarRastreio: a linha volta pela chave do par que a tela enviou', () => {
  const mapa = indexarRastreio(LINHAS_RASTREIO, HOJE);
  assert.equal(mapa.size, 6);
  const chave = chaveRastreio(5301, '3', emDias(-45), 9201);
  assert.equal(mapa.get(chave).venda, 'comprou');
  assert.equal(mapa.get(chaveRastreio(5301, '3', emDias(-10), 9205)).venda, 'carencia');
});

/* ─────────────── T-091 — registro, busca, lotes e CSV ─────────────── */

test('C-003 / RN-001: a validação aponta os dois campos de uma vez; tudo preenchido não devolve mensagem', () => {
  const valido = { codprod: 5301, quantidade: 24, codfilial: '1', justificativa: 'Cliente pediu 24 unidades para o mes.' };
  assert.deepEqual(validarSolicitacao(valido), []);

  const dois = validarSolicitacao({ ...valido, quantidade: 0, justificativa: 'curta 123' });
  assert.equal(dois.length, 2, 'os dois campos de uma vez, sem perder o que foi digitado');
  assert.ok(dois.some((m) => /quantidade/i.test(m)));
  assert.ok(dois.some((m) => /justificativa/i.test(m)));

  assert.ok(validarSolicitacao({ ...valido, codprod: 0 }).some((m) => /produto/i.test(m)));
  assert.ok(validarSolicitacao({ ...valido, codfilial: '' }).some((m) => /filial/i.test(m)));
  assert.deepEqual(validarSolicitacao({ ...valido, justificativa: '1234567890' }), [], '10 caracteres bastam');
});

test('C-018: o texto digitado vira { codcli, busca } — código, parte do nome e CNPJ sem pontuação', () => {
  assert.deepEqual(buscaDeCliente('9201'), { codcli: 9201, busca: '9201' });
  assert.deepEqual(buscaDeCliente(' nutrivida '), { codcli: 0, busca: 'nutrivida' });
  assert.deepEqual(buscaDeCliente('12.345.678/0001-90'), { codcli: 0, busca: '12345678000190' });
  assert.deepEqual(buscaDeCliente('12345678000190'), { codcli: 0, busca: '12345678000190' });
  assert.deepEqual(buscaDeCliente(''), { codcli: 0, busca: '' });
});

test('RN-016 / RNF-003: 120 pares dão 1 lote e 121 dão 2; nenhum lote passa de 4000 caracteres; os padrões são 30, 60 e 90', () => {
  assert.deepEqual(LIMITES_PADRAO, { carenciaDias: 30, paradoDias: 60, coberturaDias: 90 });
  assert.equal(PARES_POR_LOTE, 120);
  assert.equal(RASTREIO_MAX_CARACTERES, 4000);

  const pares = (n) => Array.from({ length: n }, (_, i) => `${5301 + i}:3:${emDias(-45)}:${9201 + i}`);
  assert.equal(lotesDePares(pares(120)).length, 1);
  assert.equal(lotesDePares(pares(121)).length, 2);
  assert.equal(lotesDePares([]).length, 0);
  for (const lote of lotesDePares(pares(500))) {
    assert.ok(lote.length <= RASTREIO_MAX_CARACTERES, `lote com ${lote.length} caracteres`);
  }

  // O teto de caracteres corta ANTES do de contagem quando o par é longo.
  const longos = Array.from({ length: 120 }, (_, i) => `${1000000 + i}:FILIAL-MUITO-LONGA-${i}:${emDias(-45)}:${9000000 + i}`);
  const lotesLongos = lotesDePares(longos);
  assert.ok(lotesLongos.length > 1, 'par longo fatia por caractere, não só por contagem');
  for (const lote of lotesLongos) assert.ok(lote.length <= RASTREIO_MAX_CARACTERES);
});

test('RN-015 / RN-016: montarPares usa a data de APROVAÇÃO, ignora alvo sem ela (ou sem produto e filial) e não repete par idêntico', () => {
  const alvos = [
    { CODPROD: 5301, CODFILIAL: '3', CODCLI: 9201, AVALIADO_EM: `${emDias(-45)}T09:00:00`, CRIADO_EM: `${emDias(-50)}T09:00:00` },
    { CODPROD: 5301, CODFILIAL: '3', CODCLI: 9201, AVALIADO_EM: `${emDias(-45)}T18:00:00` },
    { CODPROD: 5302, CODFILIAL: '3', CODCLI: 0, AVALIADO_EM: '' },
    { CODPROD: 0, CODFILIAL: '3', CODCLI: 9202, AVALIADO_EM: `${emDias(-45)}T09:00:00` },
    { CODPROD: 5303, CODFILIAL: '', CODCLI: 9203, AVALIADO_EM: `${emDias(-45)}T09:00:00` },
    { CODPROD: 5305, CODFILIAL: '3', CODCLI: 0, AVALIADO_EM: `${emDias(-45)}T09:00:00` },
  ];
  const pares = montarPares(alvos);
  assert.deepEqual(pares, [
    `5301:3:${emDias(-45)}:9201`,
    `5305:3:${emDias(-45)}:0`,
  ], 'par repetido entra uma vez; sem aprovação, sem produto ou sem filial fica fora');

  assert.equal(dataReferencia({ AVALIADO_EM: `${emDias(-45)}T09:00:00` }), emDias(-45));
  assert.equal(dataReferencia({ AVALIADO_EM: '' }), '', 'sem data de aprovação, fora do rastreio');
});

test('RN-015b: recusada com AVALIADO_EM não é alvo do rastreio — só a aprovada com data de referência', () => {
  const em = `${emDias(-45)}T09:00:00`;
  assert.equal(alvoDeRastreio({ STATUS: 'aprovada', AVALIADO_EM: em }), true, 'aprovada com data é alvo');
  assert.equal(
    alvoDeRastreio({ STATUS: 'recusada', AVALIADO_EM: em }), false,
    'recusar também carimba AVALIADO_EM — perguntar se o cliente comprou o que foi recusado é a pergunta errada',
  );
  assert.equal(alvoDeRastreio({ STATUS: 'cancelada', AVALIADO_EM: em }), false);
  assert.equal(alvoDeRastreio({ STATUS: 'pendente', AVALIADO_EM: '' }), false);
  assert.equal(alvoDeRastreio({ STATUS: 'aprovada', AVALIADO_EM: '' }), false, 'aprovada sem data não tem referência');
});

test('RN-017: prioridade desconhecida vira normal, e a ordem é urgente, alta, normal', () => {
  assert.equal(prioridadeDe('urgente'), 'urgente');
  assert.equal(prioridadeDe('ALTA'), 'alta');
  assert.equal(prioridadeDe('altissima'), 'normal');
  assert.equal(prioridadeDe(''), 'normal');
  assert.equal(prioridadeDe(null), 'normal');

  const ordenadas = ['normal', 'urgente', 'alta']
    .sort((a, b) => ordemDaPrioridade(prioridadeDe(a)) - ordemDaPrioridade(prioridadeDe(b)));
  assert.deepEqual(ordenadas, ['urgente', 'alta', 'normal']);
});

test('RN-008: cada situação de atendimento tem rótulo escrito e tom próprio — atendida verde, não atendida vermelha, sem pedido cinza', () => {
  assert.equal(rotuloSituacao('atendida').tom, 'live');
  assert.equal(rotuloSituacao('nao_atendida').tom, 'alert');
  assert.equal(rotuloSituacao('sem_pedido').tom, 'off');
  for (const situacao of ['em_analise', 'em_aprovacao', 'em_envio', 'enviada', 'em_transito', 'em_faturamento']) {
    assert.equal(rotuloSituacao(situacao).tom, 'attention', situacao);
    assert.ok(rotuloSituacao(situacao).label.length > 0, situacao);
  }
  assert.equal(rotuloSituacao('inventada').label, 'Sem pedido', 'valor fora do contrato cai no mais fraco');
  assert.equal(rotuloStatus('pendente').label, 'Pendente');
  assert.equal(rotuloStatus('recusada').tom, 'alert');
});

test('C-023 / RF-021: o CSV do rastreio tem as 9 colunas da tela, na ordem; sem detalhe, os dois eixos saem como "Sem dado"', () => {
  const colunas = colunasDoCsv();
  assert.equal(colunas.length, 9);
  assert.deepEqual(colunas, [
    'Produto', 'Cliente', 'Filial', 'Aprovada em', 'Situação do cliente',
    'Situação do estoque', 'Vendido ao cliente', 'Estoque atual', 'Dias de cobertura',
  ]);

  const linha = {
    ID: 1, CODPROD: 5301, DESCRICAO: 'BEBIDA LACTEA ZERO LACTOSE 200 ML',
    CODFILIAL: '3', FILIAL: 'Benenutri Filial Sul', CODCLI: 9201, CLIENTE: 'Nutrivida Clinica Ltda',
    AVALIADO_EM: `${emDias(-45)}T09:00:00`,
  };
  const comDetalhe = linhaDoCsv(linha, classificarRastreio(LINHAS_RASTREIO[0], HOJE));
  assert.equal(comDetalhe.length, colunas.length);
  assert.equal(comDetalhe[0], 'BEBIDA LACTEA ZERO LACTOSE 200 ML');
  assert.equal(comDetalhe[1], '9201 · Nutrivida Clinica Ltda');
  assert.equal(comDetalhe[3], emDias(-45));
  assert.equal(comDetalhe[4], 'Cliente comprou');
  assert.equal(comDetalhe[5], 'Girando');
  assert.equal(comDetalhe[6], '12,00');
  assert.equal(comDetalhe[8], '20');

  const semDetalhe = linhaDoCsv({ ...linha, CODCLI: 0, CLIENTE: '' }, null);
  assert.equal(semDetalhe[1], 'Sem cliente informado');
  assert.equal(semDetalhe[4], 'Sem dado');
  assert.equal(semDetalhe[5], 'Sem dado');
  assert.equal(semDetalhe[8], '');
});

/* ─────────────── T-092 — as três chaves novas e o menu do comercial ─────────────── */

test('C-019 / RN-018: ver solicitações é de todas as personas; registrar é do comercial e do admin; avaliar é de admin, analista e gestor', () => {
  for (const persona of PERSONAS) {
    assert.equal(permissoesDe(persona, 'MEMBER').verSolicitacoes, true, `${persona} vê as solicitações`);
  }
  const registram = PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').criarSolicitacao);
  assert.deepEqual(registram, ['admin', 'comercial'], 'o autor É o vendedor (RN-002/D-009)');
  const avaliam = PERSONAS.filter((p) => permissoesDe(p, 'MEMBER').avaliarSolicitacao);
  assert.deepEqual(avaliam, ['admin', 'analista', 'gestor']);

  const leitura = permissoesDe('gestor', 'READ_ONLY');
  assert.equal(leitura.verSolicitacoes, true, 'somente leitura VÊ a fila');
  assert.equal(leitura.avaliarSolicitacao, false, 'e não opera nada');
  assert.equal(permissoesDe('comercial', 'READ_ONLY').criarSolicitacao, false);
  assert.equal(permissoesDe('analista', 'RESTRICTED').avaliarSolicitacao, true, 'restrito avalia — o recorte por dono é do card');
});

test('C-021 / RN-018: o menu do comercial tem exatamente dois itens — Solicitações e Produtos em B.O.', () => {
  const menu = menuParaPersona(permissoesDe('comercial', 'MEMBER'));
  assert.deepEqual(menu.map((item) => item.to), ['/solicitacoes', '/bo']);
  assert.equal(menu.find((item) => item.to === '/solicitacoes').label, 'Solicitações');
  for (const persona of ['admin', 'analista', 'gestor', 'diretoria']) {
    assert.ok(
      menuParaPersona(permissoesDe(persona, 'MEMBER')).some((item) => item.to === '/solicitacoes'),
      `${persona} também chega a /solicitacoes`,
    );
  }
});

test('R-133: o cartão da solicitação — fora, completa ou menor no pedido, e o texto "No pedido: X — comercial pediu Y"', async () => {
  const { estadoNoPedido, textoNoPedido, metaDaSolicitacao, TOM_PRIORIDADE_CARTAO } = await import('../src/lib/solicitacoes.ts');
  assert.equal(estadoNoPedido(10, 0), 'fora');
  assert.equal(estadoNoPedido(10, 10), 'completa');
  assert.equal(estadoNoPedido(10, 12), 'completa');
  assert.equal(estadoNoPedido(10, 4), 'menor');
  assert.equal(textoNoPedido(10, 0), null);
  assert.equal(textoNoPedido(10, 4), 'No pedido: 4 — comercial pediu 10');
  assert.deepEqual(metaDaSolicitacao({ CODPROD: 54, QUANTIDADE: 1200, CODCLI: 9301, CLIENTE: 'Farmácia Central', CRIADO_EM: '2026-10-28T09:10:00', CRIADO_POR_NOME: 'Leo' }), {
    codigo: 'Cód. 54', quantidade: '1.200 un.', cliente: 'Farmácia Central', abertura: '28/10/2026', solicitante: 'Leo',
  });
  assert.equal(metaDaSolicitacao({ CODPROD: 54, QUANTIDADE: 1, CODCLI: 0, CLIENTE: '', CRIADO_EM: '', CRIADO_POR_NOME: '' }).cliente, 'Sem cliente informado');
  assert.deepEqual(TOM_PRIORIDADE_CARTAO, { urgente: 'alert', alta: 'attention', normal: 'neutral' });
});
