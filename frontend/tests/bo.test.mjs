// Spec 007 (produtos em B.O.) — regra pura de `src/lib/bo.ts` (RN-001,
// RN-005, RN-006) e a matriz de permissões (C-013, C-014). A metade "regra
// de negócio" dos mesmos cenários está em backend/simulator/smoke/007-bo.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  situacaoDaPrevisao, rotuloSituacaoPrevisao, validarMarcacaoBo, textoAvisoBo, resumoBo,
  COLUNAS_CSV_BO, linhasCsvBo,
} from '../src/lib/bo.ts';
import { menuParaPersona, permissoesDe } from '../src/lib/permissoes.ts';

test('RN-005: situacaoDaPrevisao — sem previsão, vencida, hoje e no prazo (comparação de texto, sem fuso)', () => {
  const hoje = '2026-09-15';
  assert.equal(situacaoDaPrevisao('', hoje), 'sem_previsao');
  assert.equal(situacaoDaPrevisao('2026-09-14', hoje), 'vencida');
  assert.equal(situacaoDaPrevisao('2026-09-15', hoje), 'hoje');
  assert.equal(situacaoDaPrevisao('2026-09-16', hoje), 'no_prazo');
});

test('rotuloSituacaoPrevisao — um rótulo por situação, plural certo na vencida', () => {
  assert.equal(rotuloSituacaoPrevisao('sem_previsao', 0), 'Sem previsão');
  assert.equal(rotuloSituacaoPrevisao('vencida', 1), 'Vencida há 1 dia');
  assert.equal(rotuloSituacaoPrevisao('vencida', 5), 'Vencida há 5 dias');
  assert.equal(rotuloSituacaoPrevisao('hoje', 0), 'Vence hoje');
  assert.equal(rotuloSituacaoPrevisao('no_prazo', 0), 'No prazo');
});

test('RN-001: validarMarcacaoBo — quantidade 0 e acima da pedida são recusadas citando o produto; 40 sobre 100 é aceita', () => {
  const itensDoPedido = [
    { CODPROD: 5201, DESCRICAO: 'COMPOSTO LACTEO SEM LACTOSE 400 G', QT_PEDIDA: 100, STATUS: 'enviado' },
    { CODPROD: 5202, DESCRICAO: 'CEREAL INFANTIL MULTICEREAIS 230 G', QT_PEDIDA: 60, STATUS: 'removido' },
  ];
  assert.equal(
    validarMarcacaoBo([{ codprod: 5201, qtPendente: 0 }], itensDoPedido),
    'Quantidade pendente inválida para COMPOSTO LACTEO SEM LACTOSE 400 G.',
  );
  assert.equal(
    validarMarcacaoBo([{ codprod: 5201, qtPendente: 120 }], itensDoPedido),
    'Quantidade pendente inválida para COMPOSTO LACTEO SEM LACTOSE 400 G.',
  );
  assert.equal(validarMarcacaoBo([{ codprod: 5201, qtPendente: 40 }], itensDoPedido), null);
  // Fora do pedido: código inexistente e código removido contam igual (o
  // sgcBoMarcar do servidor também exclui STATUS = 'removido' da consulta).
  assert.equal(
    validarMarcacaoBo([{ codprod: 9999, qtPendente: 1 }], itensDoPedido),
    'O produto 9999 não está neste pedido.',
  );
  assert.equal(
    validarMarcacaoBo([{ codprod: 5202, qtPendente: 1 }], itensDoPedido),
    'O produto 5202 não está neste pedido.',
  );
});

test('RN-006: textoAvisoBo — data, "venceu há N dias"/"vence hoje" e a contagem no singular/plural', () => {
  const texto = textoAvisoBo({ titulo: 'BENENUTRI MATRIZ · NESTLE', dtPrevisao: '2026-10-05', hoje: '2026-10-07', abertos: 2 });
  assert.match(texto, /05\/10\/2026/);
  assert.match(texto, /venceu há 2 dias/);
  assert.match(texto, /2 itens/);

  assert.match(textoAvisoBo({ titulo: 'X', dtPrevisao: '2026-10-05', hoje: '2026-10-07', abertos: 1 }), /1 item\b/);
  assert.match(textoAvisoBo({ titulo: 'X', dtPrevisao: '2026-10-05', hoje: '2026-10-06', abertos: 1 }), /venceu há 1 dia\b/);
  assert.match(textoAvisoBo({ titulo: 'X', dtPrevisao: '2026-10-07', hoje: '2026-10-07', abertos: 3 }), /vence hoje/);
});

test('resumoBo — conta abertos e liberados, ignora outros status', () => {
  assert.deepEqual(resumoBo([{ STATUS: 'aberto' }, { STATUS: 'aberto' }, { STATUS: 'liberado' }, { STATUS: 'cancelado' }]),
    { abertos: 2, liberados: 1 });
  assert.deepEqual(resumoBo([]), { abertos: 0, liberados: 0 });
});

test('C-014 / RN-009 (tela): a matriz de verBo/operarBo — diretoria e comercial só veem, gestor opera, READ_ONLY não opera', () => {
  assert.deepEqual(permissoesDe('diretoria', 'MEMBER'), { ...permissoesDe('diretoria', 'MEMBER'), verBo: true, operarBo: false });
  assert.equal(permissoesDe('gestor', 'MEMBER').verBo, true);
  assert.equal(permissoesDe('gestor', 'MEMBER').operarBo, true);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').verBo, true);
  assert.equal(permissoesDe('gestor', 'READ_ONLY').operarBo, false);
  assert.equal(permissoesDe('comercial', 'MEMBER').verBo, true);
  assert.equal(permissoesDe('comercial', 'MEMBER').operarBo, false);
});

test('C-013: o painel de B.O. é item de menu do comercial — desde a onda 3 (R-056) ao lado de Solicitações, os DOIS únicos que ela tem (coberto também em tests/permissoes.test.mjs)', () => {
  const menu = menuParaPersona(permissoesDe('comercial', 'MEMBER'));
  assert.deepEqual(menu.map((item) => item.to), ['/solicitacoes', '/bo']);
});

test('A-15 (revisão onda 2): linhasCsvBo — as colunas do painel de /bo, valor em vírgula decimal (R-037)', () => {
  const linha = {
    ID: 1, TITULO: 'BENENUTRI MATRIZ · NESTLÉ', FORNECEDOR: 'Nestlé', FILIAL: 'Benenutri Matriz',
    CODPROD: 5201, DESCRICAO: 'COMPOSTO LACTEO SEM LACTOSE 400 G', QT_PENDENTE: 40, VL_PENDENTE: 760,
    CLIENTES_IMPACTADOS: 4, DT_PREVISAO_BO: '2026-09-13', STATUS: 'aberto',
  };
  assert.deepEqual(COLUNAS_CSV_BO, [
    'Produto', 'Código', 'Pedido', 'Fornecedor', 'Filial',
    'Pendente', 'Valor', 'Clientes impactados', 'Previsão', 'Status',
  ]);
  assert.deepEqual(linhasCsvBo([linha]), [[
    'COMPOSTO LACTEO SEM LACTOSE 400 G', 5201, 'BENENUTRI MATRIZ · NESTLÉ', 'Nestlé', 'Benenutri Matriz',
    40, '760,00', 4, '2026-09-13', 'aberto',
  ]]);
  assert.deepEqual(linhasCsvBo([]), []);
});

// R-141 / C-018: o topo da fase B.O. no card.
import { topoDoBo } from '../src/lib/bo.ts';

test('C-018: total pendente só dos itens em aberto, a carta de falta mais recente e o aviso de previsão vencida', () => {
  const topo = topoDoBo({
    itens: [
      { STATUS: 'aberto', VL_PENDENTE: 100 },
      { STATUS: 'aberto', VL_PENDENTE: 50.5 },
      { STATUS: 'liberado', VL_PENDENTE: 999 },
    ],
    documentos: [
      { TIPO: 'carta_falta', ENVIADO_EM: '2026-10-20T10:00:00' },
      { TIPO: 'outro', ENVIADO_EM: '2026-10-30T10:00:00' },
      { TIPO: 'carta_falta', ENVIADO_EM: '2026-10-25T09:00:00' },
    ],
    dtPrevisao: '2026-10-30',
    hoje: '2026-11-02',
  });
  assert.equal(topo.totalPendente, 150.5);
  assert.equal(topo.cartaEm, '2026-10-25T09:00:00');
  assert.equal(topo.avisoVencida, 'Previsão de liberação vencida há 3 dias. Reavalie com o fornecedor e registre uma previsão nova.');
  const semNada = topoDoBo({ itens: [], documentos: [], dtPrevisao: '2026-11-05', hoje: '2026-11-02' });
  assert.deepEqual(semNada, { totalPendente: 0, cartaEm: '', avisoVencida: '' });
});
