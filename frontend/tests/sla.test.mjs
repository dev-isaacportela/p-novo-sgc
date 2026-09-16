// Spec 009 — a régua de prazo pura de `src/lib/sla.ts` (a metade "regra de
// tela" de C-007..C-011, RN-001..RN-006 e RN-008). A metade "regra de negócio"
// dos mesmos cenários está em backend/simulator/smoke/009-indicadores.mjs, e o
// teste RN-016 de lá compara as duas linha a linha.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diasDaEtapa, classificarEtapa, slaDoPedido, notaDoPedido,
  rotuloEtapa, tomEtapa, rotuloSla, tomSla, rotuloAgenda, tomAgenda,
  percentualDaMeta, rotuloConsumo, faixaDoScore, marcosDaLinha,
  COLUNAS_CSV_SLA, linhasCsvSla,
} from '../src/lib/sla.ts';
import { diasUteisEntre, somarDiasUteis } from '../src/lib/dias-uteis.ts';

const HOJE = '2026-09-18';

test('C-007: etapa concluída dentro e fora da meta — 1 de 1 dia útil é no prazo, 3 de 1 é concluída com atraso', () => {
  const noPrazo = { inicio: '2026-09-08', fimReal: '2026-09-09', meta: 1, hoje: HOJE };
  assert.equal(diasDaEtapa(noPrazo), 1);
  assert.equal(classificarEtapa(noPrazo), 'ok');

  const atrasada = { inicio: '2026-09-08', fimReal: '2026-09-11', meta: 1, hoje: HOJE };
  assert.equal(diasDaEtapa(atrasada), 3);
  assert.equal(classificarEtapa(atrasada), 'estourou');
});

test('C-008: etapa aberta além da meta — 7 de 5 dias úteis é prazo vencido, e o pedido fica atrasado (fornecedor)', () => {
  const faturamento = { inicio: '2026-09-09', fimReal: '', meta: 5, hoje: '2026-09-18' };
  assert.equal(diasDaEtapa(faturamento), 7);
  assert.equal(classificarEtapa(faturamento), 'vencida');
  assert.equal(slaDoPedido('ok', 'vencida', 'nao_iniciada', false), 'atrasado_fornecedor');
  // E com a Análise vencida junto, a precedência manda (RN-005).
  assert.equal(slaDoPedido('vencida', 'vencida', 'nao_iniciada', false), 'atrasado_compras');
});

test('C-009: último dia da meta é aviso, não atraso — 5 de 5 dias úteis vence hoje e o pedido fica em atenção', () => {
  const faturamento = { inicio: '2026-09-09', fimReal: '', meta: 5, hoje: '2026-09-16' };
  assert.equal(diasDaEtapa(faturamento), 5);
  assert.equal(classificarEtapa(faturamento), 'atencao');
  assert.equal(slaDoPedido('ok', 'atencao', 'nao_iniciada', false), 'atencao');
});

test('C-010: fornecedor sem prazo de entrega — a etapa fica sem meta e sai da média da nota', () => {
  assert.equal(classificarEtapa({ inicio: '2026-09-10', fimReal: '', meta: 0, hoje: HOJE }), 'sem_meta');
  assert.equal(notaDoPedido([{ dias: 2, meta: 1 }, { dias: 5, meta: 5 }, { dias: 30, meta: 0 }]), 75);
});

test('C-011 / RN-006: a nota do pedido — 75 com a entrega fora da conta, 90 com ela dentro', () => {
  assert.equal(notaDoPedido([{ dias: 2, meta: 1 }, { dias: 5, meta: 5 }]), 75);
  assert.equal(notaDoPedido([{ dias: 1, meta: 1 }, { dias: 5, meta: 5 }, { dias: 10, meta: 7 }]), 90);
  assert.equal(notaDoPedido([]), 0, 'pedido sem nenhuma etapa medida tem nota 0');
  assert.equal(notaDoPedido([{ dias: null, meta: 1 }, { dias: null, meta: 5 }]), 0);
  assert.equal(notaDoPedido([{ dias: 0, meta: 5 }]), 100, 'etapa de 0 dia não divide por zero');
});

test('RN-001: a etapa aberta é medida até hoje; a de um pedido concluído, até a conclusão — nunca até hoje', () => {
  const aberta = { inicio: '2026-09-09', fimReal: '', meta: 5 };
  assert.equal(diasDaEtapa({ ...aberta, hoje: '2026-09-16' }), 5);
  assert.equal(diasDaEtapa({ ...aberta, hoje: '2026-09-18' }), 7, 'etapa aberta cresce com o dia de referência');

  const concluida = { ...aberta, concluido: true, dtConclusao: '2026-09-14' };
  assert.equal(diasDaEtapa({ ...concluida, hoje: '2026-09-18' }), 3);
  assert.equal(diasDaEtapa({ ...concluida, hoje: '2026-10-30' }), 3, 'medida até a conclusão, não muda com hoje');
  assert.equal(classificarEtapa({ ...concluida, hoje: '2026-10-30' }), 'ok', 'fechou dentro do prazo (D-007)');

  assert.equal(diasDaEtapa({ inicio: '', fimReal: '', meta: 5, hoje: HOJE }), null);
  assert.equal(classificarEtapa({ inicio: '', fimReal: '', meta: 5, hoje: HOJE }), 'nao_iniciada');
});

test('RN-002: os sete estados devolvem os sete rótulos e os quatro tons; um oitavo cai em "Sem estado" sem lançar', () => {
  const estados = ['ok', 'estourou', 'andamento', 'atencao', 'vencida', 'nao_iniciada', 'sem_meta'];
  const rotulos = estados.map(rotuloEtapa);
  assert.equal(new Set(rotulos).size, 7, 'sete rótulos distintos');
  assert.ok(rotulos.every((r) => r !== 'Sem estado'));
  assert.deepEqual([...new Set(estados.map(tomEtapa))].sort(), ['alert', 'attention', 'live', 'off']);
  assert.equal(rotuloEtapa('oitavo_estado'), 'Sem estado');
  assert.equal(tomEtapa('oitavo_estado'), 'off');
});

test('RN-005: as cinco classificações do pedido, na ordem de precedência', () => {
  assert.equal(slaDoPedido('vencida', 'ok', 'ok', false), 'atrasado_compras');
  assert.equal(slaDoPedido('vencida', 'vencida', 'vencida', true), 'atrasado_compras', 'a análise ganha de tudo');
  assert.equal(slaDoPedido('ok', 'ok', 'vencida', false), 'atrasado_fornecedor');
  assert.equal(slaDoPedido('ok', 'atencao', 'ok', true), 'concluido', 'concluído ganha de atenção');
  assert.equal(slaDoPedido('atencao', 'ok', 'ok', false), 'atencao');
  assert.equal(slaDoPedido('ok', 'ok', 'nao_iniciada', false), 'no_prazo');
  assert.equal(new Set(['atrasado_compras', 'atrasado_fornecedor', 'atencao', 'no_prazo', 'concluido'].map(rotuloSla)).size, 5);
  assert.equal(tomSla('desconhecido'), 'off');
});

test('RN-003: dias úteis — 24/08 mais 15 é 14/09, sexta para segunda é 1, segunda para sábado é 4, mesmo dia é 0', () => {
  assert.equal(somarDiasUteis('2026-08-24', 15), '2026-09-14');
  assert.equal(diasUteisEntre('2026-08-24', '2026-09-14'), 15);
  assert.equal(diasUteisEntre('2026-09-11', '2026-09-14'), 1);
  assert.equal(diasUteisEntre('2026-09-14', '2026-09-19'), 4);
  assert.equal(diasUteisEntre('2026-09-14', '2026-09-14'), 0);
});

test('RN-003: a Entrega conta em corridos quando o cadastro pede, e em úteis quando não', () => {
  const marcos = { inicio: '2026-09-04', fimReal: '2026-09-14', meta: 7 };
  assert.equal(diasDaEtapa({ ...marcos, tipo: 'corridos' }), 10);
  assert.equal(diasDaEtapa({ ...marcos, tipo: 'uteis' }), 6);
});

test('RN-008: os cinco rótulos de aderência à agenda, com o envio antecipado em "na data planejada"', () => {
  const situacoes = ['no_planejado', 'enviada_com_atraso', 'pendente_atrasada', 'pendente', 'sem_agenda'];
  assert.equal(new Set(situacoes.map(rotuloAgenda)).size, 5);
  assert.deepEqual([...new Set(situacoes.map(tomAgenda))].sort(), ['alert', 'live', 'off']);
  assert.equal(rotuloAgenda('inventado'), 'Sem estado');
  assert.equal(tomAgenda('inventado'), 'off');
});

test('C-024/§12.4: a barra de consumo vem sempre com o rótulo escrito, e o percentual satura em 100', () => {
  assert.equal(percentualDaMeta(4, 5), 80);
  assert.equal(percentualDaMeta(12, 5), 100, 'a barra nunca passa da largura');
  assert.equal(percentualDaMeta(null, 5), 0);
  assert.equal(percentualDaMeta(3, 0), 0);
  assert.equal(rotuloConsumo(4, 5), '4 / 5 dias úteis');
  assert.equal(rotuloConsumo(10, 7, 'corridos'), '10 / 7 dias corridos');
  assert.equal(rotuloConsumo(null, 5), 'não iniciada · meta 5 dias úteis');
  assert.equal(rotuloConsumo(null, 0), 'sem meta');
});

test('a faixa da nota: 90 é verde, 60 é atenção, abaixo disso é alerta, e sem nota é neutro', () => {
  assert.equal(faixaDoScore(100), 'live');
  assert.equal(faixaDoScore(90), 'live');
  assert.equal(faixaDoScore(89), 'attention');
  assert.equal(faixaDoScore(60), 'attention');
  assert.equal(faixaDoScore(59), 'alert');
  assert.equal(faixaDoScore(null), 'off');
});

const LINHA = {
  CARD_ID: 7, TITULO: 'MATRIZ · FRESENIUS', FASE_CHAVE: 'faturamento', FASE_NOME: 'Faturamento em Andamento',
  CONCLUIDO: 0, CODFORNEC: 1015, FORNECEDOR: 'Fresenius', CODFILIAL: '1', FILIAL: 'Matriz',
  NUMPED_WINTHOR: '998901', VL_TOTAL: 1200.5, PERC_FATURADO: 60, QTD_NFS: 1,
  DT_CRIACAO: '2026-09-08', DT_ENVIO: '2026-09-09', DT_PRIMEIRA_NF: '2026-09-11', DT_ENTREGA: '',
  DT_CONCLUSAO: '', DT_AGENDA: '',
  DIAS_ANALISE: 1, META_ANALISE_DIAS: 1, STATUS_ANALISE: 'ok',
  DIAS_FATURAMENTO: 2, META_FATURAMENTO_DIAS: 5, STATUS_FATURAMENTO: 'ok',
  DIAS_ENTREGA: 5, META_ENTREGA_DIAS: 7, META_ENTREGA_TIPO: 'uteis', STATUS_ENTREGA: 'andamento',
  STATUS_AGENDA: 'sem_agenda', DIAS_ATRASO_AGENDA: null, SLA_STATUS: 'no_prazo', SLA_SCORE: 100,
};

test('RN-016: marcosDaLinha traduz as colunas da listagem para a régua, etapa por etapa', () => {
  const analise = marcosDaLinha(LINHA, 'analise', HOJE);
  assert.deepEqual(analise, { inicio: '2026-09-08', fimReal: '2026-09-09', meta: 1, tipo: 'uteis', concluido: false, dtConclusao: '', hoje: HOJE });
  assert.equal(classificarEtapa(analise), LINHA.STATUS_ANALISE);
  assert.equal(classificarEtapa(marcosDaLinha(LINHA, 'faturamento', HOJE)), LINHA.STATUS_FATURAMENTO);
  assert.equal(marcosDaLinha(LINHA, 'entrega', HOJE).tipo, 'uteis');
  assert.equal(marcosDaLinha({ ...LINHA, META_ENTREGA_TIPO: 'corridos' }, 'entrega', HOJE).tipo, 'corridos');
});

test('o CSV do SLA tem um cabeçalho por coluna e uma linha por pedido, com o traço no que não tem dado', () => {
  const linhas = linhasCsvSla([LINHA, { ...LINHA, DIAS_ENTREGA: null, META_ENTREGA_DIAS: 0, STATUS_ENTREGA: 'sem_meta' }]);
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.length === COLUNAS_CSV_SLA.length));
  assert.equal(linhas[0][0], '998901');
  assert.equal(linhas[0][5], '08/09/2026');
  assert.equal(linhas[1][13], '', 'dias de entrega sem valor sai vazio, nunca 0');
  assert.equal(linhas[1][15], 'Sem meta');
});
