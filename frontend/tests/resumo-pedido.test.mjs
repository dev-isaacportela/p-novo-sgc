// R-133: o topo do card na Análise (src/lib/resumo-pedido.ts) — os quatro
// números, a aderência à sugestão, "Aceitar sugestão", as faixas e o banner de
// reprovação.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numerosDoPedido, aderenciaASugestao, tomDaAderencia, textoDaAderencia, aceitarSugestao,
  faixasDoResumo, textoDosAlertas, reprovacoesDoPedido, codigosCitados,
} from '../src/lib/resumo-pedido.ts';

const item = (codprod, qtPedida, qtSugerida, extra = {}) => ({
  codprod, qtPedida, qtSugerida, precoCusto: 10, tipoPreco: 'padrao', idSolicitacao: 0, ...extra,
});

test('C-024 (R-133): os quatro números contam só o que está no pedido — 3 itens e 30 un., R$ 300, 1 especial, 2 alertas não lidos', () => {
  const itens = [item(1, 10, 10), item(2, 15, 12, { tipoPreco: 'especial' }), item(3, 5, 0), item(4, 0, 24)];
  const alertas = [{ tipo: 'vencimento', lido: false }, { tipo: 'excesso', lido: false }, { tipo: 'excesso', lido: true }];
  assert.deepEqual(numerosDoPedido(itens, alertas), { itens: 3, unidades: 30, valor: 300, especiais: 1, alertas: 2 });
});

test('RN-015 / C-024 (R-133): aderência — segue quem pediu ≥ a sugerida (> 0); sugestão 0 no pedido é alterado; solicitação do comercial fica fora', () => {
  const itens = [
    item(1, 12, 12), item(2, 24, 12), item(3, 6, 12), item(4, 5, 0),
    item(5, 3, 12, { idSolicitacao: 9 }), item(6, 0, 12),
  ];
  const a = aderenciaASugestao(itens);
  assert.equal(a.base, 4);
  assert.equal(a.seguem, 2);
  assert.equal(a.pct, 50);
  assert.deepEqual(a.alterados, [3, 4]);
  assert.equal(a.tom, 'attention');
  assert.equal(textoDaAderencia(a), '2 de 4 seguem · 2 alterados');
});

test('RN-015 (R-133): o tom da aderência é verde a partir de 80, âmbar a partir de 50 e vermelho abaixo', () => {
  assert.equal(tomDaAderencia(80), 'live');
  assert.equal(tomDaAderencia(79), 'attention');
  assert.equal(tomDaAderencia(50), 'attention');
  assert.equal(tomDaAderencia(49), 'alert');
  assert.equal(tomDaAderencia(null), 'live');
  assert.equal(textoDaAderencia(aderenciaASugestao([])), 'Nenhum item da análise no pedido');
});

test('C-024 (R-133): aceitar sugestão grava a sugerida nos alterados e zera (tira do pedido) quem tem sugestão 0', () => {
  const itens = [item(1, 12, 12), item(3, 6, 12), item(4, 5, 0), item(5, 3, 12, { idSolicitacao: 9 })];
  assert.deepEqual(aceitarSugestao(itens), [{ codprod: 3, qtPedida: 12 }, { codprod: 4, qtPedida: 0 }]);
  const depois = itens.map((i) => ({ ...i, ...(aceitarSugestao(itens).find((m) => m.codprod === i.codprod) ?? {}) }));
  assert.equal(aderenciaASugestao(depois).pct, 100);
});

test('C-024 (R-133): as faixas — 1 vencimento / 2 excesso, 1 item especial e 2 de solicitação comercial (8 un.)', () => {
  const itens = [item(1, 5, 0, { idSolicitacao: 3 }), item(2, 3, 0, { idSolicitacao: 4, tipoPreco: 'especial' }), item(3, 0, 0, { idSolicitacao: 5 })];
  const alertas = [{ tipo: 'vencimento', lido: true }, { tipo: 'excesso', lido: false }, { tipo: 'excesso', lido: false }];
  const f = faixasDoResumo(itens, alertas);
  assert.deepEqual(f, { vencimento: 1, excesso: 2, especiais: 1, solicitacoes: { itens: 2, unidades: 8 } });
  assert.equal(textoDosAlertas(f), '1 vencimento / 2 excesso — ver na seção Alertas');
  assert.equal(textoDosAlertas({ vencimento: 0, excesso: 0 }), '');
});

test('C-023 (R-133): o banner de reprovação — a diretoria antes da técnica, com os códigos citados no texto livre', () => {
  assert.deepEqual(codigosCitados('5001, 5002 e 5010; 5001'), [5001, 5002, 5010]);
  assert.deepEqual(reprovacoesDoPedido({ TEC_MOTIVO: '', DIR_MOTIVO: '  ' }), []);
  const lista = reprovacoesDoPedido({ TEC_MOTIVO: 'Custo acima da tabela', TEC_PRODUTOS_REPROVADOS: '5001 5002', DIR_MOTIVO: 'Prazo longo' });
  assert.deepEqual(lista.map((r) => r.origem), ['diretoria', 'tecnica']);
  assert.equal(lista[1].motivo, 'Custo acima da tabela');
  assert.deepEqual(lista[1].produtos, [5001, 5002]);
  assert.deepEqual(lista[0].produtos, []);
});
