// O painel de detalhe do layout legado da spec 011 (src/lib/ressuprimento-detalhe.ts):
// a série "Compras × vendas" com projeção, o rodapé, as filiais com excesso e a
// simulação de compra. Sem React, sem DOM, sem SDK.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { montarRessuprimento } from '../src/lib/ressuprimento.ts';
import {
  diasDoMes, filiaisComExcesso, mesesAte, rotuloMes, serieComprasVendas, simularCompra, somarMeses, totaisDoRodape,
} from '../src/lib/ressuprimento-detalhe.ts';

const medida = (extra = {}) => ({
  CODPROD: 5401, DESCRICAO: 'WHEY CONCENTRADO MORANGO 900 G', EMBALAGEM: 'CX 12', UNIDADE: 'UN',
  CODEPTO: 2, CODSEC: 21, UN_POR_CAIXA_ERP: 12,
  CUSTO_ULT_ENTRADA: 10, CUSTO_ATUAL: 11, CODFAB: 'FAB-5401', DT_ULT_ENTRADA: '2026-09-01', DT_ULT_SAIDA: '2026-09-15',
  ESTOQUE_TOTAL: 50, QT_BLOQUEADA: 0, QT_INDENIZ: 0, QT_RESERV: 0,
  ESTOQUE_ATUAL: 50, QT_PEDIDA_ERP: 0, QT_TRANSITO: 0, ESTOQUE_EM_TRANSITO: 0,
  LEAD_TIME_MEDIDO: 0, VENDA_PERIODO: 306, VENDA_PUBLICA: 0,
  CONSUMO_DIARIO: 2, CONSUMO_DIARIO_PUBLICO: 0, VOLATILIDADE_DIARIA: 0, ...extra,
});
const PARAMETRO_FIXO = [{ codprod: 0, coberturaDias: 35, leadTimeDias: 9, gatilhoDias: 15, silenciadoAte: '', motivoSilencio: '' }];
const linha = (extra = {}) => montarRessuprimento([medida(extra)], PARAMETRO_FIXO, () => 35, new Map(), {
  codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false,
})[0];

test('calendário: set/26, um mês antes de jan/2026 é dez/2025, fevereiro de 2026 tem 28 dias e os 3 meses até 16/09 são jul, ago e set', () => {
  assert.equal(rotuloMes('2026-09'), 'set/26');
  assert.equal(somarMeses('2026-01', -1), '2025-12');
  assert.equal(somarMeses('2026-11', 2), '2027-01');
  assert.equal(diasDoMes('2026-02'), 28);
  assert.deepEqual(mesesAte('2026-09-16', 3), ['2026-07', '2026-08', '2026-09']);
});

test('C-032: a série de 6 meses tem 6 pontos medidos (zero onde não houve movimento) mais o mês seguinte projetado a consumo diário × dias do mês, cada série só na sua coluna', () => {
  const historico = [
    { MES: '2026-08', SAIDAS: 10, ENTRADAS: 24, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-09', SAIDAS: 20, ENTRADAS: 0, SAIDAS_PUBLICAS: 4 },
  ];
  const serie = serieComprasVendas(historico, '2026-09-16', 6, 2);
  assert.equal(serie.length, 7);
  assert.deepEqual(serie.map((p) => p.mes), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(serie[4], { mes: '2026-08', rotulo: 'ago/26', compras: 24, vendas: 10, projecao: null });
  assert.deepEqual(serie[0], { mes: '2026-04', rotulo: 'abr/26', compras: 0, vendas: 0, projecao: null });
  assert.deepEqual(serie[6], { mes: '2026-10', rotulo: 'out/26', compras: null, vendas: null, projecao: 62 });
  assert.equal(serieComprasVendas(historico, '2026-09-16', 13, 2).length, 14);
});

test('C-032: o rodapé soma 3, 6 e 12 meses de vendas e compras e projeta o próximo mês', () => {
  const historico = [
    { MES: '2025-10', SAIDAS: 100, ENTRADAS: 100, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-05', SAIDAS: 7, ENTRADAS: 12, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-08', SAIDAS: 10, ENTRADAS: 24, SAIDAS_PUBLICAS: 0 },
    { MES: '2026-09', SAIDAS: 20, ENTRADAS: 0, SAIDAS_PUBLICAS: 4 },
  ];
  assert.deepEqual(totaisDoRodape(historico, '2026-09-16', 2), {
    vendas3m: 30, vendas6m: 37, vendas12m: 137,
    compras3m: 24, compras6m: 36, compras12m: 136,
    projecaoMes: 62,
  });
});

test('RN-025 / C-033: filial com cobertura acima do teto de 42 dias ou com estoque sem giro tem excesso; a filial da tela e as abaixo do teto não', () => {
  const posicoes = [
    { CODFILIAL: '1', FILIAL: 'Matriz', ESTOQUE_TOTAL: 500, ESTOQUE_ATUAL: 500, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 9, DT_ULT_SAIDA: null },
    { CODFILIAL: '2', FILIAL: 'Norte', ESTOQUE_TOTAL: 120, ESTOQUE_ATUAL: 120, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 90, DT_ULT_SAIDA: '2026-09-01' },
    { CODFILIAL: '3', FILIAL: 'Sul', ESTOQUE_TOTAL: 35, ESTOQUE_ATUAL: 35, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 90, DT_ULT_SAIDA: '2026-09-01' },
    { CODFILIAL: '4', FILIAL: 'Oeste', ESTOQUE_TOTAL: 10, ESTOQUE_ATUAL: 10, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 0, DT_ULT_SAIDA: null },
    { CODFILIAL: '5', FILIAL: 'Vazia', ESTOQUE_TOTAL: 0, ESTOQUE_ATUAL: 0, ESTOQUE_EM_TRANSITO: 0, VENDA_3_MESES: 0, DT_ULT_SAIDA: null },
  ];
  const excesso = filiaisComExcesso(posicoes, '1', 42);
  assert.deepEqual(excesso.map((f) => f.codfilial), ['4', '2'], 'sem giro primeiro, depois a maior cobertura');
  assert.equal(excesso[0].coberturaDias, null);
  assert.equal(excesso[1].coberturaDias, 120);
});

test('C-034: simular 50 unidades com caixa de 12 compra 60 (5 caixas) por R$ 600, leva a cobertura a 55 dias e o nível a 157 %', () => {
  const s = simularCompra(linha(), 50);
  assert.equal(s.quantidade, 60);
  assert.equal(s.caixas, 5);
  assert.equal(s.total, 600);
  assert.equal(s.coberturaFuturaDias, 55);
  assert.equal(Math.round(s.nivelFuturoPct), 157);
  assert.equal(simularCompra(linha({ CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }), 12).coberturaFuturaDias, null, 'sem giro não há cobertura');
});
