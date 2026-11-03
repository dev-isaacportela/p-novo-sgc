// Extrato do pedido (spec 010, src/lib/extrato.ts): marca d'água por fase,
// assinaturas, prazo padrão × acordado, itens, total, faturamento, CSV e o
// aviso de pop-up bloqueado. Um test() por cenário/regra da seção "Testes"
// do plan.md — C-017 já está coberto por tests/permissoes.test.mjs (a chave
// `verQuadro` é a mesma que o extrato usa, sem linha nova).
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarExtrato, linhasCsvExtrato, popupFoiBloqueado } from '../src/lib/extrato.ts';

/** Pedido mínimo (colunas de `sgcPedidoCarregar`), sobrescrito por cenário. */
function pedido(overrides = {}) {
  return {
    ID_CARD: 4321,
    FORNECEDOR: 'Fornecedor Teste',
    FILIAL: 'Filial 1',
    PERIODO_INICIO: '2026-08-01',
    PERIODO_FIM: '2026-09-15',
    VL_TOTAL: 1000,
    PRAZO_PADRAO: '30',
    PRAZO_ACORDADO: '30',
    PRAZO_JUSTIFICATIVA: '',
    TEC_POR: null, TEC_EM: '', TEC_MOTIVO: '', TEC_NOME: '',
    DIR_POR: null, DIR_EM: '', DIR_MOTIVO: '', DIR_NOME: '',
    DT_ENVIO: '', NUMPED_WINTHOR: '',
    CANC_MOTIVO: '', CANC_EM: '', CANC_NOME: '',
    CRIADOR_NOME: '',
    ...overrides,
  };
}

test('C-001 / RN-002: pedido sem motivo de reprovação, fase Aprovação Técnica — marca "não aprovado" e as três assinaturas', () => {
  const modelo = montarExtrato(pedido(), [], 'tecnica', []);
  assert.equal(modelo.marca, 'nao_aprovado');
  assert.equal(modelo.assinaturas, true);
});

test('C-002 / RN-001: aprovação técnica antiga gravada (TEC_EM/TEC_POR) com o pedido de volta na Análise — a marca continua "não aprovado"', () => {
  const modelo = montarExtrato(pedido({ TEC_POR: 7, TEC_EM: '2026-08-01T10:00:00', TEC_NOME: 'Carla' }), [], 'analise', []);
  assert.equal(modelo.marca, 'nao_aprovado', 'a fase manda, não a data antiga gravada');
  assert.equal(modelo.assinaturas, true);
});

test('C-003 / RN-003: pedido cancelado, com motivo — marca "cancelado", zero assinatura e o motivo em .decisoes', () => {
  const modelo = montarExtrato(
    pedido({ CANC_MOTIVO: 'Fornecedor sem estoque', CANC_EM: '2026-09-10T09:00:00', CANC_NOME: 'Ana' }),
    [], 'cancelado', [],
  );
  assert.equal(modelo.marca, 'cancelado');
  assert.equal(modelo.assinaturas, false);
  assert.ok(modelo.decisoes.some((d) => d.texto.includes('Fornecedor sem estoque')), 'o motivo do cancelamento aparece nas decisões');
});

test('C-004 / RN-004: nas seis fases fora da decisão e do cancelamento — zero marca, zero assinatura', () => {
  for (const fase of ['envio', 'enviado', 'transito', 'faturamento', 'bo', 'concluido']) {
    const modelo = montarExtrato(pedido(), [], fase, []);
    assert.equal(modelo.marca, null, fase);
    assert.equal(modelo.assinaturas, false, fase);
  }
});

test('C-005 / RN-005: prazo padrão e acordado iguais — os dois aparecem sem pedir justificativa', () => {
  const modelo = montarExtrato(pedido({ PRAZO_PADRAO: '30', PRAZO_ACORDADO: '30' }), [], 'analise', []);
  assert.equal(modelo.prazo.exigeJustificativa, false);
});

test('C-006 / RN-005: prazo divergente com justificativa preenchida — a diferença e o texto gravado aparecem', () => {
  const modelo = montarExtrato(
    pedido({ PRAZO_PADRAO: '30', PRAZO_ACORDADO: '60', PRAZO_JUSTIFICATIVA: 'Negociado por volume com o fornecedor.' }),
    [], 'analise', [],
  );
  assert.equal(modelo.prazo.exigeJustificativa, true);
  assert.equal(modelo.prazo.justificativa, 'Negociado por volume com o fornecedor.');
});

test('C-007 / RN-005: prazo divergente sem justificativa ainda — exige justificativa e o texto fica vazio (a tela decide o rótulo de pendente)', () => {
  const modelo = montarExtrato(pedido({ PRAZO_PADRAO: '30', PRAZO_ACORDADO: '60', PRAZO_JUSTIFICATIVA: '' }), [], 'analise', []);
  assert.equal(modelo.prazo.exigeJustificativa, true);
  assert.equal(modelo.prazo.justificativa, '', 'nada de texto inventado quando ainda não foi registrada');
});

test('C-008 / RN-006: item de quantidade pedida zero fica fora da lista', () => {
  const itens = [
    { CODPROD: 1, DESCRICAO: 'Zerado', EMBALAGEM: 'CX', QT_PEDIDA: 0, PRECO_CUSTO: 10 },
    { CODPROD: 2, DESCRICAO: 'Pedido', EMBALAGEM: 'CX', QT_PEDIDA: 5, PRECO_CUSTO: 20 },
  ];
  const modelo = montarExtrato(pedido(), itens, 'analise', []);
  assert.equal(modelo.itens.length, 1);
  assert.equal(modelo.itens[0].codprod, 2);
});

test('C-009 / RN-007: o total do extrato é VL_TOTAL do pedido, não a soma recalculada dos itens', () => {
  const itens = [{ CODPROD: 1, DESCRICAO: 'X', EMBALAGEM: 'CX', QT_PEDIDA: 3, PRECO_CUSTO: 10 }]; // soma = 30
  const modelo = montarExtrato(pedido({ VL_TOTAL: 999 }), itens, 'analise', []);
  assert.equal(modelo.totalPedido, 999);
});

test('C-010 / RN-008: pedido com uma nota fiscal vinculada — a seção de faturamento traz a nota e o percentual', () => {
  const nfs = [{ NUMNOTA: 555, SERIE: '1', DT_EMISSAO: '2026-09-01', VL_TOTAL: 600 }];
  const modelo = montarExtrato(pedido({ VL_TOTAL: 1000 }), [], 'faturamento', nfs);
  assert.equal(modelo.faturamento.temNota, true);
  assert.equal(modelo.faturamento.notas.length, 1);
  assert.equal(modelo.faturamento.percentual, 60);
});

test('C-011 / RN-008: pedido sem nenhuma nota fiscal — a seção de faturamento não existe', () => {
  const modelo = montarExtrato(pedido(), [], 'faturamento', []);
  assert.equal(modelo.faturamento.temNota, false);
  assert.equal(modelo.faturamento.notas.length, 0);
});

test('C-012 / RN-009: número do pedido no fornecedor só aparece com o envio registrado; criador segue R-068 sem quebrar o resto do modelo', () => {
  const comEnvio = montarExtrato(pedido({ DT_ENVIO: '2026-09-05', NUMPED_WINTHOR: '778899', CRIADOR_NOME: 'Bruno' }), [], 'enviado', []);
  assert.equal(comEnvio.cabecalho.numeroWinthor, '778899');
  assert.equal(comEnvio.cabecalho.criador, 'Bruno');

  const semEnvio = montarExtrato(pedido({ DT_ENVIO: '', NUMPED_WINTHOR: '778899' }), [], 'analise', []);
  assert.equal(semEnvio.cabecalho.numeroWinthor, '', 'sem DT_ENVIO o número no fornecedor não aparece');

  const semCriador = montarExtrato(pedido({ CRIADOR_NOME: undefined }), [], 'analise', []);
  assert.equal(semCriador.cabecalho.criador, '', 'CRIADOR_NOME ausente (antes de R-068 publicada) não quebra o resto do modelo');
  assert.equal(semCriador.totalPedido, 1000);
});

test('C-013 / RN-013: popupFoiBloqueado só é true para janela nula', () => {
  assert.equal(popupFoiBloqueado(null), true);
  assert.equal(popupFoiBloqueado({}), false);
});

test('C-014 / RN-012: as linhas do CSV batem com os itens do modelo, na mesma ordem', () => {
  const itens = [
    { CODPROD: 10, DESCRICAO: 'Produto A', EMBALAGEM: 'CX 12', QT_PEDIDA: 3, PRECO_CUSTO: 15.5 },
    { CODPROD: 20, DESCRICAO: 'Produto B', EMBALAGEM: 'CX 24', QT_PEDIDA: 7, PRECO_CUSTO: 9.9 },
  ];
  const modelo = montarExtrato(pedido(), itens, 'analise', []);
  const { linhas } = linhasCsvExtrato(modelo);
  assert.equal(linhas.length, modelo.itens.length);
  linhas.forEach((linha, indice) => {
    const item = modelo.itens[indice];
    assert.equal(linha[0], item.codprod);
    assert.equal(linha[1], item.descricao);
    assert.equal(linha[2], item.embalagem);
    assert.equal(linha[3], item.qtPedida);
  });
});

test('C-015 / RN-010: pedido de identificação 4321 — o nome do arquivo contém essa identificação', () => {
  const modelo = montarExtrato(pedido({ ID_CARD: 4321 }), [], 'analise', []);
  assert.equal(modelo.nomeArquivo, 'extrato-pedido-4321');
});

test('C-016 / RN-011: gerando às 15/09/2026 14:05 (hora local injetada) — a emissão mostrada é 15/09/2026 14:05', () => {
  const modelo = montarExtrato(pedido(), [], 'analise', [], new Date(2026, 8, 15, 14, 5));
  assert.ok(modelo.geradoEm.includes('15/09/2026'));
  assert.ok(modelo.geradoEm.includes('14:05'));
});

test('C-018 / RN-014 (R-144): o faturamento do extrato diz o saldo a faturar — nunca negativo —, que a conclusão agora exige coberto', () => {
  const parcial = montarExtrato(pedido({ VL_TOTAL: 1000 }), [], 'faturamento', [{ NUMNOTA: 1, SERIE: '', DT_EMISSAO: '2026-10-01', VL_TOTAL: 600 }]);
  assert.equal(parcial.faturamento.falta, 400);
  const demais = montarExtrato(pedido({ VL_TOTAL: 1000 }), [], 'faturamento', [{ NUMNOTA: 1, SERIE: '', DT_EMISSAO: '2026-10-01', VL_TOTAL: 1010 }]);
  assert.equal(demais.faturamento.falta, 0);
});
