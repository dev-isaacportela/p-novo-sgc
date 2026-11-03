// R-133: o seletor de custo do item (src/lib/custo-do-item.ts) — padrão do
// Gestão de Custos, tabela especial vigente ou manual.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { tabelasVigentes, opcoesDeCusto, escolhaDoItem, custoDaEscolha, chaveDaTabela, seloDoCusto } from '../src/lib/custo-do-item.ts';

const especial = (codprod, politica, custo, fim, codcli = 1) => ({
  CODPROD: codprod, CODCLI: codcli, CUSTO_ESPECIAL: custo, VARIACAO_PERCENTUAL: 0, POLITICA_ID: politica, POLITICA_NOME: `Tabela ${politica}`, DATA_FIM: fim,
});
const padrao = { valor: 10, dataRef: '2026-01-01', origem: 'gestao' };

test('R-133: tabelas vigentes — uma por política e custo, só do produto, sem as vencidas, da mais barata', () => {
  const custos = [
    especial(5, 2, 8.5, null), especial(5, 2, 8.5, null, 2), especial(5, 1, 9, '2026-12-31'),
    especial(5, 3, 7, '2026-10-01'), especial(6, 1, 1, null), especial(5, 4, 0, null),
  ];
  const t = tabelasVigentes(custos, 5, '2026-11-03');
  assert.deepEqual(t.map((x) => [x.politicaId, x.custo]), [[2, 8.5], [1, 9]]);
});

test('R-133: as opções — padrão, cada tabela, a especial fora da vigência do item, e manual', () => {
  const t = [{ politicaId: 2, politicaNome: 'Tabela 2', custo: 8.5, dataFim: '' }];
  const opcoes = opcoesDeCusto(padrao, t, { tipoPreco: 'especial', precoCusto: 7.25 });
  assert.deepEqual(opcoes.map((o) => o.value), ['padrao', 'esp:2:8.5', 'esp:0:7.25', 'manual']);
  assert.match(opcoes[0].label, /^Padrão R\$\s?10,00$/);
  assert.equal(opcoesDeCusto({ valor: 0, dataRef: '', origem: 'sem' }, [])[0].label, 'Padrão — sem custo');
  assert.match(opcoesDeCusto({ valor: 0, dataRef: '', origem: 'carregando' }, [], { tipoPreco: 'padrao', precoCusto: 38.14 })[0].label, /^Padrão R\$\s?38,14$/, 'antes da análise, o custo que o item já tem');
  assert.equal(opcoesDeCusto({ valor: 0, dataRef: '', origem: 'carregando' }, [])[0].label, 'Padrão');
});

test('R-133: a escolha do item e o que cada escolha grava', () => {
  const t = [{ politicaId: 2, politicaNome: 'Tabela 2', custo: 8.5, dataFim: '' }];
  assert.equal(escolhaDoItem({ tipoPreco: 'padrao', precoCusto: 10 }, t), 'padrao');
  assert.equal(escolhaDoItem({ tipoPreco: 'especial', precoCusto: 8.5 }, t), chaveDaTabela(t[0]));
  assert.equal(escolhaDoItem({ tipoPreco: 'manual', precoCusto: 3 }, t), 'manual');
  assert.deepEqual(custoDaEscolha('esp:2:8.5', padrao, 10), { precoCusto: 8.5, tipoPreco: 'especial' });
  assert.deepEqual(custoDaEscolha('padrao', padrao, 8.5), { precoCusto: 10, tipoPreco: 'padrao' });
  assert.deepEqual(custoDaEscolha('padrao', { valor: 0, dataRef: '', origem: 'sem' }, 8.5), { precoCusto: 0, tipoPreco: 'padrao' });
  assert.deepEqual(custoDaEscolha('manual', padrao, 8.5), { precoCusto: 8.5, tipoPreco: 'manual' });
  assert.equal(seloDoCusto('especial'), 'ESP');
  assert.equal(seloDoCusto('manual'), 'MAN');
  assert.equal(seloDoCusto('padrao'), null);
});
