// Oportunidades com custo especial da spec 011 (src/lib/custo-especial.ts,
// R-125): a oportunidade por produto × cliente, o selo da linha, a sugestão
// segura por tabela, o agrupamento e a distribuição da quantidade. Valores
// conferidos à mão. Sem React, sem DOM, sem SDK.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  capRecenteSku, chaveEspecial, lotesDeCodigos, oportunidadesDoItem, piorRisco, planoEspecial, seloEspecial, sugestaoPorCliente,
  abaDoGrafico, temAbaEspecial, secaoEspecialAberta,
} from '../src/lib/custo-especial.ts';

const custo = (CODCLI, CUSTO_ESPECIAL, POLITICA_ID, POLITICA_NOME, DATA_FIM = '2026-12-31') => ({ CODPROD: 5401, CODCLI, CUSTO_ESPECIAL, VARIACAO_PERCENTUAL: 0, POLITICA_ID, POLITICA_NOME, DATA_FIM });
const venda = (CODCLI, VENDA_CLIENTE_PERIODO, CLIENTE = `Cliente ${CODCLI}`) => ({ CODPROD: 5401, CODCLI, CLIENTE, VENDA_CLIENTE_PERIODO });
const CUSTOS = [custo(9301, 8, 1, 'Tabela A'), custo(0, 10.5, 2, 'Aberta', ''), custo(9302, 12, 3, 'Sem economia')];
const VENDAS = [venda(9301, 306, 'Farmacia Central'), venda(9302, 51), venda(9304, 0), venda(9399, 20)];
const ITEM = { codprod: 5401, custoAtual: 11, custoUltimaEntrada: 12, sugerida: 48, coberturaDias: 35 };

test('C-046 / RN-032: a oportunidade exige cliente com venda, custo especial e economia — Tabela A para o 9301 (economia 3, projeção 70, qs 48, seguro, ganho 144) e a política aberta para cada cliente que comprou; sem economia ou sem venda, nada; ordem por ganho', () => {
  const lista = oportunidadesDoItem(ITEM, CUSTOS, VENDAS, 153);
  assert.deepEqual(lista.map((o) => [o.politicaId, o.codcli, o.projecaoCliente, o.qs, o.risco, o.ganho]), [
    [1, 9301, 70, 48, 'seguro', 144],
    [2, 9301, 70, 48, 'seguro', 24],
    [2, 9302, 12, 12, 'seguro', 6],
    [2, 9399, 5, 5, 'seguro', 2.5],
  ]);
  assert.equal(lista[0].economiaUnit, 3, 'custo atual 11 − especial 8');
  assert.equal(lista[0].cliente, 'Farmacia Central');
  assert.equal(lista[0].dataFim, '2026-12-31');
  // Sem custo atual, vale o da última entrada: 12 − 8 = 4.
  assert.equal(oportunidadesDoItem({ ...ITEM, custoAtual: 0 }, CUSTOS, VENDAS, 153)[0].economiaUnit, 4);
  // Venda do cliente abaixo de 2 × qs é moderado; sugestão zero é monitorar.
  // Período de 30 dias, cobertura 45: projeção 23 > sugerida 10 → qs 10; venda 15 < 20 → moderado.
  assert.equal(oportunidadesDoItem({ ...ITEM, sugerida: 10, coberturaDias: 45 }, [custo(9302, 8, 4, 'B')], [venda(9302, 15)], 30)[0].risco, 'moderado');
  assert.equal(oportunidadesDoItem({ ...ITEM, sugerida: 0 }, CUSTOS, VENDAS, 153)[0].risco, 'monitorar');
  // A cobertura segura vai de 1 a 45 dias: 90 vira 45 → projeção ceil(306/153 × 45) = 90, qs = 48.
  assert.equal(oportunidadesDoItem({ ...ITEM, coberturaDias: 90 }, CUSTOS, VENDAS, 153)[0].projecaoCliente, 90);
});

test('C-046: o selo da linha é "Especial N un." (positivo) com quantidade segura, "Especial N tabelas" (atenção) sem ela, e nada sem oportunidade', () => {
  assert.deepEqual(seloEspecial(oportunidadesDoItem(ITEM, CUSTOS, VENDAS, 153)), { texto: 'Especial 113 un.', tone: 'accent' });
  assert.deepEqual(seloEspecial(oportunidadesDoItem({ ...ITEM, sugerida: 0 }, CUSTOS, VENDAS, 153)), { texto: 'Especial 2 tabelas', tone: 'attention' });
  assert.equal(seloEspecial([]), null);
  assert.equal(piorRisco('seguro', 'arriscado'), 'arriscado');
  assert.equal(piorRisco('moderado', 'monitorar'), 'moderado');
});

test('RN-033: a sugestão segura por tabela — cliente com 85 % do SKU (306 de 360 em 6 meses de 60): média 51, caps 51, projeção 51, seguro 60 (caixa 12), crescimento 1, seguro, limitado por ambos; cap recente do SKU = mediana dos 6 últimos até +25 %', () => {
  assert.equal(capRecenteSku([10, 0, 20, 30, 100].map((valor, i) => ({ mes: `2026-0${i + 1}`, valor }))), 31.25);
  assert.equal(capRecenteSku([]), 0);
  const serie = Array.from({ length: 6 }, (_, i) => ({ mes: `2026-0${i + 1}`, valor: 60 }));
  const sku = { quantidade: 48, projecaoMensal: 0, coberturaDias: 30, consumoDiario: 2, unidadesPorCaixa: 12, serie };
  const [o] = oportunidadesDoItem({ ...ITEM, coberturaDias: 30 }, [custo(9301, 8, 1, 'Tabela A')], [venda(9301, 306)], 153);
  assert.equal(o.projecaoCliente, 60);
  const s = sugestaoPorCliente(o, sku);
  assert.deepEqual(
    [s.share, s.mediaMensal, s.capCliente, s.base, s.teto, s.projMensal, s.seguro, s.crescimento, s.riscoTabela, s.limitadoPor],
    [0.85, 51, 51, 51, 51, 51, 60, 1, 'seguro', 'ambos'],
  );
  assert.deepEqual(s.mensais.map((m) => m.valor), [51, 51, 51, 51, 51, 51]);
  // A previsão do modelo acima da venda mensal puxa a projeção, mas o teto segura: 51 continua.
  assert.equal(sugestaoPorCliente(o, { ...sku, projecaoMensal: 120 }).projMensal, 51);
  // Sem série do SKU: base = mensal do período (60), teto = base × 1,05, projeção 60, seguro 60; limitado pelo SKU.
  const semSerie = sugestaoPorCliente(o, { ...sku, serie: [] });
  assert.deepEqual([semSerie.base, semSerie.projMensal, semSerie.seguro, semSerie.limitadoPor], [60, 60, 60, 'sku']);
});

test('RN-034: as tabelas se agrupam por política + custo (soma, pior risco, menor validade), ficam as de seguro > 0 por maior economia e depois maior seguro, e a quantidade simulada se distribui até sobrar a compra padrão', () => {
  const s = (politicaId, custoEspecial, economiaUnit, seguro, riscoTabela, dataFim, codcli = 1) => ({
    codprod: 5401, codcli, cliente: `C${codcli}`, politicaId, politicaNome: `P${politicaId}`, dataFim, custoEspecial, custoAtual: 11, economiaUnit,
    vendaCliente: 10, projecaoCliente: 5, qs: 5, risco: 'seguro', ganho: 0, share: 1, mediaMensal: 0, capCliente: 0, base: 0, teto: 0,
    projMensal: 0, seguro, crescimento: 1, riscoTabela, limitadoPor: 'cliente', mensais: [],
  });
  const plano = planoEspecial([
    s(1, 8, 3, 60, 'seguro', '2026-12-31', 1),
    s(2, 6, 5, 12, 'seguro', '2026-11-30', 2),
    s(2, 6, 5, 12, 'arriscado', '2026-11-15', 3),
    s(3, 10.5, 0.5, 0, 'seguro', '', 4),
  ], 100);
  assert.deepEqual(plano.tabelas.map((t) => [t.chave, t.seguro, t.ganhoPotencial, t.risco, t.dataFim, t.quantidadeComprar, t.ganhoEstimado]), [
    ['2-6', 24, 120, 'arriscado', '2026-11-15', 24, 120],
    ['1-8', 60, 180, 'seguro', '2026-12-31', 60, 180],
  ], 'a tabela 3 (seguro 0) fica de fora; a 2 vem antes pela economia maior');
  assert.deepEqual([plano.especialTotal, plano.comprarPadrao, plano.ganhoEstimado], [84, 16, 300]);
  assert.equal(plano.tabelas[0].clientes.length, 2);
  const curto = planoEspecial([s(1, 8, 3, 60, 'seguro', '2026-12-31')], 48);
  assert.deepEqual([curto.tabelas[0].quantidadeComprar, curto.comprarPadrao, curto.ganhoEstimado], [48, 0, 144]);
  assert.deepEqual(planoEspecial([], 10), { tabelas: [], comprarPadrao: 10, especialTotal: 0, ganhoEstimado: 0 });
});

test('R-125: a linha especial do carrinho tem chave própria, e os códigos vão em lotes de 500 sem repetição', () => {
  assert.equal(chaveEspecial(5401, '1', 1, 8), '5401-1-especial-1-8');
  const lotes = lotesDeCodigos([...Array.from({ length: 1001 }, (_, i) => i + 1), 5, 5]);
  assert.equal(lotes.length, 3);
  assert.equal(lotes[0].split(',').length, 500);
  assert.equal(lotes[2], '1001');
  assert.deepEqual(lotesDeCodigos([]), []);
});

test('C-048 (abas do gráfico): a aba "Preço especial" só existe com oportunidade; sem ela a escolha cai em "Compras × vendas", que é o padrão', () => {
  const comEspecial = [{ seguro: 24 }];
  assert.equal(temAbaEspecial(comEspecial), true);
  assert.equal(temAbaEspecial([]), false);
  assert.equal(abaDoGrafico('vendas', comEspecial), 'vendas');
  assert.equal(abaDoGrafico('especial', comEspecial), 'especial');
  assert.equal(abaDoGrafico('especial', []), 'vendas', 'produto sem oportunidade nunca mostra a aba especial');
});

test('C-048: a aba "Preço especial" abre a seção "Oportunidade com preço especial" já expandida; em "Compras × vendas" ela segue recolhida', () => {
  assert.equal(secaoEspecialAberta('especial'), true);
  assert.equal(secaoEspecialAberta('vendas'), false);
  assert.equal(abaDoGrafico('especial', []), 'vendas', 'sem oportunidade não há aba especial, e nada abre');
});
