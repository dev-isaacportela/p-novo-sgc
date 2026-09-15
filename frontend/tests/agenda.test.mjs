// Regra pura da agenda de análises (spec 004): src/lib/agenda.ts e
// src/lib/agenda-permissoes.ts (provisório — ver o cabeçalho do arquivo).
// Sem React, sem SDK.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  proximaOcorrencia, situacao, periodoPadrao, periodoDaOcorrencia,
  validarAgendamento, recorte, diaNoFuso,
} from '../src/lib/agenda.ts';
import { permissoesDe } from '../src/lib/agenda-permissoes.ts';

test('C-004/RN-001: recorrência mensal — mesmo dia do mês seguinte, cortado no último dia quando não existe', () => {
  assert.equal(proximaOcorrencia('2026-01-31', 'mensal'), '2026-02-28');
  assert.equal(proximaOcorrencia('2026-02-28', 'mensal'), '2026-03-28');
  assert.equal(proximaOcorrencia('2028-01-31', 'mensal'), '2028-02-29', '2028 é bissexto');
  assert.equal(proximaOcorrencia('2026-03-30', 'mensal'), '2026-04-30');
});

test('RN-002: recorrência semanal soma 7 dias, quinzenal soma 14', () => {
  assert.equal(proximaOcorrencia('2026-10-20', 'semanal'), '2026-10-27');
  assert.equal(proximaOcorrencia('2026-10-20', 'quinzenal'), '2026-11-03');
});

test('C-005/RN-003: recorrência para na data-limite — não cria ocorrência que passa dela', () => {
  assert.equal(proximaOcorrencia('2026-10-05', 'quinzenal', '2026-10-25'), '2026-10-19');
  assert.equal(proximaOcorrencia('2026-10-19', 'quinzenal', '2026-10-25'), null, '02/11 passa do limite 25/10');
  assert.equal(proximaOcorrencia('2026-10-20', 'semanal', '2026-10-25'), null, '27/10 passa do limite 25/10');
});

test('recorrência "nenhuma" nunca gera próxima ocorrência', () => {
  assert.equal(proximaOcorrencia('2026-10-20', 'nenhuma'), null);
});

test('C-002: período invertido é recusado citando "período"', () => {
  const resultado = validarAgendamento({
    codfornec: 0, codfilial: '', dataAnalise: '', periodoInicio: '2026-10-20', periodoFim: '2026-09-05',
    recorrencia: 'nenhuma', dataLimite: '',
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.ok ? '' : resultado.erro, /período/);
});

test('C-003: data-limite anterior à data da análise é recusada citando "data-limite"', () => {
  const resultado = validarAgendamento({
    codfornec: 0, codfilial: '', dataAnalise: '2026-10-20', periodoInicio: '', periodoFim: '',
    recorrencia: 'semanal', dataLimite: '2026-10-10',
  });
  assert.equal(resultado.ok, false);
  assert.match(resultado.ok ? '' : resultado.erro, /data-limite/);
});

test('validarAgendamento: período válido e sem recorrência passa', () => {
  const resultado = validarAgendamento({
    codfornec: 1015, codfilial: '1', dataAnalise: '2026-10-20', periodoInicio: '2026-09-05', periodoFim: '2026-10-20',
    recorrencia: 'nenhuma', dataLimite: '',
  });
  assert.equal(resultado.ok, true);
});

test('C-015/RN-005: situação derivada — cancelado, processado, atrasado, pendente, nessa ordem de prioridade', () => {
  assert.equal(situacao({ ATIVO: 0, PROCESSADO_EM: null, DATA_ANALISE: '2026-09-14' }, '2026-09-15'), 'cancelado');
  assert.equal(situacao({ ATIVO: 1, PROCESSADO_EM: '2026-09-15T10:00:00', DATA_ANALISE: '2026-09-14' }, '2026-09-15'), 'processado');
  assert.equal(situacao({ ATIVO: 1, PROCESSADO_EM: null, DATA_ANALISE: '2026-09-14' }, '2026-09-15'), 'atrasado');
  assert.equal(situacao({ ATIVO: 1, PROCESSADO_EM: null, DATA_ANALISE: '2026-09-20' }, '2026-09-15'), 'pendente');
});

test('RN-006: período padrão de 45 dias; validarAgendamento recusa início depois do fim', () => {
  assert.deepEqual(periodoPadrao('2026-10-20'), { inicio: '2026-09-05', fim: '2026-10-20' });
  const resultado = validarAgendamento({
    codfornec: 0, codfilial: '', dataAnalise: '', periodoInicio: '2026-10-20', periodoFim: '2026-09-05',
    recorrencia: 'nenhuma', dataLimite: '',
  });
  assert.equal(resultado.ok, false);
});

test('RN-008: período da ocorrência seguinte mantém a duração, com o fim na data nova', () => {
  assert.deepEqual(
    periodoDaOcorrencia({ inicio: '2026-08-21', fim: '2026-10-05' }, '2026-10-19'),
    { inicio: '2026-09-04', fim: '2026-10-19' },
  );
});

test('RN-011: permissoesDe lê agendar/cancelarAgendamento — a matriz inteira é testada na 002', () => {
  assert.equal(permissoesDe('admin', 'ADMIN').agendar, true);
  assert.equal(permissoesDe('analista', 'MEMBER').agendar, true);
  assert.equal(permissoesDe('gestor', 'MEMBER').agendar, true);
  assert.equal(permissoesDe('diretoria', 'MEMBER').agendar, false);
  assert.equal(permissoesDe('comercial', 'RESTRICTED').agendar, false);
  assert.equal(permissoesDe('analista', 'READ_ONLY').agendar, false, 'READ_ONLY não opera nada');

  assert.equal(permissoesDe('admin', 'ADMIN').cancelarAgendamento, true);
  assert.equal(permissoesDe('gestor', 'MEMBER').cancelarAgendamento, true);
  assert.equal(permissoesDe('diretoria', 'MEMBER').cancelarAgendamento, true);
  assert.equal(permissoesDe('analista', 'MEMBER').cancelarAgendamento, false);
  assert.equal(permissoesDe('comercial', 'RESTRICTED').cancelarAgendamento, false);
});

test('RN-013: o dia no fuso de Brasília não vira amanhã às 22h locais (00h UTC)', () => {
  assert.equal(diaNoFuso(Date.parse('2026-09-16T01:00:00Z')), '2026-09-15');
  assert.equal(diaNoFuso(Date.parse('2026-09-16T03:00:00Z')), '2026-09-16');
});

test('recorte: os quatro modos do processamento manual (D-007, D-008)', () => {
  assert.deepEqual(recorte('agendamento', { idAgenda: 4 }, '2026-09-15'), { modo: 'agendamento', dataInicio: '', dataFim: '', idAgenda: 4 });
  assert.deepEqual(recorte('intervalo', { dataInicio: '2026-09-14', dataFim: '2026-09-16' }, '2026-09-15'),
    { modo: 'intervalo', dataInicio: '2026-09-14', dataFim: '2026-09-16', idAgenda: 0 });
  assert.deepEqual(recorte('dias', { dias: 7 }, '2026-09-15'), { modo: 'dias', dataInicio: '2026-09-15', dataFim: '2026-09-21', idAgenda: 0 });
  assert.deepEqual(recorte('mes', {}, '2026-09-15'), { modo: 'mes', dataInicio: '2026-09-01', dataFim: '2026-09-30', idAgenda: 0 });
  assert.deepEqual(recorte('', {}, '2026-09-15'), { modo: 'mes', dataInicio: '2026-09-01', dataFim: '2026-09-30', idAgenda: 0 }, 'modo desconhecido cai em mes, nunca a base inteira');
  assert.ok('erro' in recorte('intervalo', { dataInicio: '2026-09-16', dataFim: '2026-09-14' }, '2026-09-15'), 'intervalo invertido é recusado');
});
