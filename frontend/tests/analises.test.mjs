// Spec 009 — regra pura de `src/lib/analises.ts`: os blocos em paralelo
// (C-002), os períodos derivados de hoje (C-004/RN-011), a filial assumida
// (C-005/RN-012), as séries que servem gráfico e tabela (C-024) e o resumo do
// funil nas duas dimensões (C-016/RN-009).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listarPeriodos, periodoCorrente, periodoRange, intervaloPadrao, filialDoRecorte,
  resultadosDosBlocos, serieSimples, serieComparativa, resumoSolicitacoes,
  serieDoFunil, serieDasPendentes,
} from '../src/lib/analises.ts';

test('C-002 / RF-002 / RF-003: um bloco resolvido, um rejeitado e um vazio — a falha de um não derruba os outros', () => {
  const blocos = resultadosDosBlocos(['a', 'b', 'c'], [
    { status: 'fulfilled', value: [1, 2] },
    { status: 'rejected', reason: new Error('falhou a consulta') },
    { status: 'fulfilled', value: [] },
  ]);
  assert.equal(blocos.a.estado, 'ok');
  assert.equal(blocos.a.linhas.length, 2);
  assert.equal(blocos.b.estado, 'erro');
  assert.equal(blocos.b.erro, 'falhou a consulta');
  assert.equal(blocos.c.estado, 'vazio', '"sem dados no período" não é "não foi possível carregar"');
  assert.equal(blocos.c.erro, '');
});

test('C-002: bloco sem resultado nenhum (a promessa nem existiu) vira erro com mensagem, não tela em branco', () => {
  const blocos = resultadosDosBlocos(['a', 'b'], [{ status: 'fulfilled', value: [1] }]);
  assert.equal(blocos.a.estado, 'ok');
  assert.equal(blocos.b.estado, 'erro');
  assert.ok(blocos.b.erro.length > 0);
});

test('C-004 / RN-011: a lista de períodos é derivada de hoje — 12 meses terminando no corrente e os trimestres já iniciados', () => {
  const setembro = listarPeriodos(new Date('2026-09-15T12:00:00Z'));
  const meses = setembro.filter((o) => /^\d{4}-\d{2}$/.test(o.value));
  const trimestres = setembro.filter((o) => /Q\d$/.test(o.value));
  assert.equal(meses.length, 12);
  assert.equal(meses[0].value, '2026-09', 'o mês corrente está lá, no topo');
  assert.equal(meses[11].value, '2025-10', 'e os onze anteriores');
  assert.equal(trimestres.length, 3);
  assert.deepEqual(trimestres.map((o) => o.value), ['2026-Q3', '2026-Q2', '2026-Q1']);

  const janeiro = listarPeriodos(new Date('2027-01-02T12:00:00Z'));
  assert.equal(janeiro[0].value, '2027-01');
  assert.equal(janeiro.filter((o) => /Q\d$/.test(o.value)).length, 1);
  assert.equal(periodoCorrente(new Date('2027-01-02T12:00:00Z')), '2027-01');
});

test('C-004: periodoRange abre mês e trimestre em datas reais, com o último dia certo', () => {
  assert.deepEqual(periodoRange('2026-09'), { dataInicio: '2026-09-01', dataFim: '2026-09-30' });
  assert.deepEqual(periodoRange('2026-02'), { dataInicio: '2026-02-01', dataFim: '2026-02-28' });
  assert.deepEqual(periodoRange('2024-02'), { dataInicio: '2024-02-01', dataFim: '2024-02-29' }, 'ano bissexto');
  assert.deepEqual(periodoRange('2026-Q3'), { dataInicio: '2026-07-01', dataFim: '2026-09-30' });
  assert.deepEqual(periodoRange('2026-Q1'), { dataInicio: '2026-01-01', dataFim: '2026-03-31' });
  assert.deepEqual(periodoRange('lixo'), { dataInicio: '', dataFim: '' });
});

test('RN-011: o intervalo padrão do painel termina hoje e tem 90 dias', () => {
  const { dataInicio, dataFim } = intervaloPadrao(new Date('2026-09-15T12:00:00Z'));
  assert.equal(dataFim, '2026-09-15');
  assert.equal(dataInicio, '2026-06-17');
  const dias = (Date.parse(dataFim) - Date.parse(dataInicio)) / 86400000;
  assert.equal(dias, 90);
});

test('C-005 / RN-012: sem filial escolhida a comparação assume a primeira e DIZ qual; com escolha, nenhum aviso', () => {
  const filiais = [
    { CODFILIAL: '1', FILIAL: 'Benenutri Matriz' },
    { CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte' },
  ];
  const assumida = filialDoRecorte(filiais, '');
  assert.equal(assumida.codfilial, '1');
  assert.ok(assumida.aviso.includes('Benenutri Matriz'));

  const escolhida = filialDoRecorte(filiais, '2');
  assert.equal(escolhida.codfilial, '2');
  assert.equal(escolhida.aviso, '');

  const semNenhuma = filialDoRecorte([], '');
  assert.equal(semNenhuma.codfilial, '');
  assert.ok(semNenhuma.aviso.length > 0, 'sem filial no ERP a tela diz isso, não chama a consulta');
});

test('C-024: a série do gráfico e a tabela alternativa saem da MESMA função — mesmos rótulos, valores e ordem', () => {
  const linhas = [
    { FASE_NOME: 'Análise', QTD: 6, VL_TOTAL: 100 },
    { FASE_NOME: 'Envio', QTD: 4, VL_TOTAL: 250 },
    { FASE_NOME: 'Concluídas', QTD: 0, VL_TOTAL: 0 },
  ];
  assert.deepEqual(serieSimples(linhas, 'FASE_NOME', 'QTD'), [
    { name: 'Análise', value: 6 }, { name: 'Envio', value: 4 }, { name: 'Concluídas', value: 0 },
  ]);
  assert.deepEqual(serieComparativa(
    [{ FORNECEDOR: 'Nestlé', QT_COMPRADA: 500, QT_VENDIDA: 800 }], 'FORNECEDOR', 'QT_COMPRADA', 'QT_VENDIDA',
  ), [{ name: 'Nestlé', a: 500, b: 800 }]);
  assert.deepEqual(serieSimples([{ FASE_NOME: 'X', QTD: null }], 'FASE_NOME', 'QTD'), [{ name: 'X', value: 0 }]);
});

// C-016: 20 solicitações — 8 atendidas, 4 esperando avaliação, 2 recusadas e 6
// em fluxo. As 4 e as 2 só se separam pela DECISÃO: a régua da 008 devolve
// `sem_pedido` para as duas (R-076).
const FUNIL = [
  { STATUS: 'pendente', SITUACAO: 'sem_pedido', QTD: 4, QTD_AVALIADAS: 0, TEMPO_MEDIO_AVALIACAO_DIAS: null },
  { STATUS: 'recusada', SITUACAO: 'sem_pedido', QTD: 2, QTD_AVALIADAS: 2, TEMPO_MEDIO_AVALIACAO_DIAS: 1 },
  { STATUS: 'aprovada', SITUACAO: 'atendida', QTD: 8, QTD_AVALIADAS: 8, TEMPO_MEDIO_AVALIACAO_DIAS: 2 },
  { STATUS: 'aprovada', SITUACAO: 'em_analise', QTD: 4, QTD_AVALIADAS: 4, TEMPO_MEDIO_AVALIACAO_DIAS: 3 },
  { STATUS: 'aprovada', SITUACAO: 'enviada', QTD: 2, QTD_AVALIADAS: 2, TEMPO_MEDIO_AVALIACAO_DIAS: 3 },
];

test('C-016 / RN-009: aderência geral de 40,0 % e de fluxo de 57,1 %, lidas nas DUAS dimensões', () => {
  const resumo = resumoSolicitacoes(FUNIL);
  assert.equal(resumo.total, 20);
  assert.equal(resumo.pendentes, 4, 'pendentes saem da DECISÃO, não da situação');
  assert.equal(resumo.recusadas, 2, 'recusadas saem da DECISÃO');
  assert.equal(resumo.atendidas, 8, 'atendidas saem da SITUAÇÃO');
  assert.equal(resumo.emFluxo, 6, 'em fluxo sai da SITUAÇÃO');
  assert.equal(resumo.aderenciaGeralPct, 40);
  assert.equal(resumo.aderenciaFluxoPct, 57.1);
  // Média PONDERADA pelas avaliadas: (2×1 + 8×2 + 4×3 + 2×3) ÷ 16 = 2,25 → 2,3.
  assert.equal(resumo.tempoMedioAvaliacaoDias, 2.3);
});

test('RN-009: sem solicitação no período as duas aderências ficam VAZIAS, não zero', () => {
  const vazio = resumoSolicitacoes([]);
  assert.equal(vazio.total, 0);
  assert.equal(vazio.aderenciaGeralPct, null);
  assert.equal(vazio.aderenciaFluxoPct, null);
  assert.equal(vazio.tempoMedioAvaliacaoDias, null);

  // Só pendentes e recusadas: o denominador de fluxo zera e a aderência de
  // fluxo continua vazia, em vez de virar 0 %.
  const semFluxo = resumoSolicitacoes(FUNIL.slice(0, 2));
  assert.equal(semFluxo.aderenciaGeralPct, 0);
  assert.equal(semFluxo.aderenciaFluxoPct, null);
});

test('RN-009 / C-016: serieDoFunil soma os pares de volta por situação; as sem pedido se separam pela decisão', () => {
  const serie = serieDoFunil(FUNIL);
  assert.equal(serie.reduce((acc, p) => acc + p.value, 0), 20);
  assert.deepEqual(serie[0], { name: 'Atendida', value: 8 });
  assert.deepEqual(serie.find((p) => p.name === 'Sem pedido'), { name: 'Sem pedido', value: 6 });

  const pendentes = serieDasPendentes(FUNIL);
  assert.deepEqual(pendentes, [
    { name: 'Esperando avaliação', value: 4 },
    { name: 'Recusada', value: 2 },
  ]);
});
