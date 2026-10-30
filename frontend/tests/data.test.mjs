// Regra pura do DatePicker (src/components/DatePicker.tsx, spec 004 — UI-03 B):
// grade do mês, navegação e conversão texto <-> ISO. Sem React, sem DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aplicarMascaraData, comMesmoDia, dentroDoLimite, diaDaSemana, diasEntre, diasNoMes, diasRelativos, fimDaSemana, gradeDoMes, inicioDaSemana, isoParaTexto, isoPorExtenso, isoValido, mesAdjacente, nomeDiaSemanaAbrev, nomeMes, parseIso, resolverRelativo, somarDias, textoParaIso,
} from '../src/lib/data.ts';

test('parseIso/isoValido: data impossível (31/02) e ano bissexto (29/02)', () => {
  assert.equal(isoValido('2026-02-31'), false);
  assert.equal(isoValido('2027-02-29'), false, '2027 não é bissexto');
  assert.equal(isoValido('2028-02-29'), true, '2028 é bissexto');
  assert.equal(isoValido('2026-13-01'), false);
  assert.equal(isoValido(''), false);
  assert.equal(isoValido('20/10/2026'), false);
  assert.deepEqual(parseIso('2026-10-20'), { ano: 2026, mes: 10, dia: 20 });
});

test('textoParaIso: só converte dd/mm/aaaa completo e possível; senão null (não chama onChange)', () => {
  assert.equal(textoParaIso('20/10/2026'), '2026-10-20');
  assert.equal(textoParaIso('31/02/2026'), null);
  assert.equal(textoParaIso('20/10/26'), null);
  assert.equal(textoParaIso('20/10'), null);
  assert.equal(textoParaIso(''), null);
});

test('isoParaTexto: ida-e-volta com textoParaIso', () => {
  assert.equal(isoParaTexto('2026-10-20'), '20/10/2026');
  assert.equal(isoParaTexto(''), '');
  assert.equal(isoParaTexto('data-invalida'), '');
});

test('isoPorExtenso: aria-label de cada dia da grade', () => {
  assert.equal(isoPorExtenso('2026-10-20'), '20 de outubro de 2026');
  assert.equal(isoPorExtenso('2026-01-05'), '5 de janeiro de 2026');
  assert.equal(isoPorExtenso(''), '');
});

test('aplicarMascaraData: barras automáticas, só dígitos, corta em 8', () => {
  assert.equal(aplicarMascaraData('20102026'), '20/10/2026');
  assert.equal(aplicarMascaraData('2010'), '20/10');
  assert.equal(aplicarMascaraData('20'), '20');
  assert.equal(aplicarMascaraData('2010202699'), '20/10/2026');
  assert.equal(aplicarMascaraData('20/10/2026'), '20/10/2026');
});

test('somarDias: sem fuso, atravessa mês e vira ano', () => {
  assert.equal(somarDias('2026-10-20', 1), '2026-10-21');
  assert.equal(somarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(somarDias('2026-10-20', -20), '2026-09-30');
});

test('diaDaSemana/inicioDaSemana/fimDaSemana: 2026-10-20 é terça (RN-013-ish, Home/End da grade)', () => {
  assert.equal(diaDaSemana('2026-10-20'), 2);
  assert.equal(inicioDaSemana('2026-10-20'), '2026-10-18');
  assert.equal(fimDaSemana('2026-10-20'), '2026-10-24');
});

test('mesAdjacente: PageUp/PageDown, vira o ano nas pontas', () => {
  assert.deepEqual(mesAdjacente({ ano: 2026, mes: 10 }, 1), { ano: 2026, mes: 11 });
  assert.deepEqual(mesAdjacente({ ano: 2026, mes: 12 }, 1), { ano: 2027, mes: 1 });
  assert.deepEqual(mesAdjacente({ ano: 2026, mes: 1 }, -1), { ano: 2025, mes: 12 });
});

test('comMesmoDia: corta no último dia do mês mais curto', () => {
  assert.equal(comMesmoDia('2026-01-31', { ano: 2026, mes: 2 }), '2026-02-28');
  assert.equal(comMesmoDia('2026-10-15', { ano: 2026, mes: 11 }), '2026-11-15');
});

test('dentroDoLimite: min/max como comparação de texto ISO', () => {
  assert.equal(dentroDoLimite('2026-10-20', '2026-10-01', '2026-10-31'), true);
  assert.equal(dentroDoLimite('2026-09-30', '2026-10-01', ''), false);
  assert.equal(dentroDoLimite('2026-11-01', '', '2026-10-31'), false);
  assert.equal(dentroDoLimite('2026-10-20'), true);
});

test('gradeDoMes: 42 células, começa no domingo, out-2026 tem 31 dias marcados noMes', () => {
  const grade = gradeDoMes(2026, 10);
  assert.equal(grade.length, 42);
  assert.equal(diaDaSemana(grade[0].iso), 0);
  assert.equal(grade.filter((d) => d.noMes).length, diasNoMes(2026, 10));
  assert.ok(grade.some((d) => d.iso === '2026-10-01' && d.noMes));
  assert.ok(grade.some((d) => d.iso === '2026-10-31' && d.noMes));
});

test('diasNoMes/nomeMes/nomeDiaSemanaAbrev', () => {
  assert.equal(diasNoMes(2026, 2), 28);
  assert.equal(diasNoMes(2028, 2), 29);
  assert.equal(nomeMes(10), 'outubro');
  assert.equal(nomeDiaSemanaAbrev(0), 'dom');
});

test('C-045 / R-119: diasRelativos aceita "45", "45d", "45 dia", "45 dias" e " 45 DIAS " (1 a 3 dígitos); "1234", "abc" e "15/09" não são dias', () => {
  for (const texto of ['45', '45d', '45 dia', '45 dias', ' 45 DIAS ', '45D']) assert.equal(diasRelativos(texto), 45, texto);
  assert.equal(diasRelativos('0'), 0);
  assert.equal(diasRelativos('999'), 999);
  for (const texto of ['1234', 'abc', '15/09', '15/09/2026', '', '45 semanas', 'd45']) assert.equal(diasRelativos(texto), null, texto);
});

test('C-045: resolverRelativo — "45" no início com fim 30/10/2026 dá 15/09/2026 (a mesma conta do periodoPadrao); "30" no fim a partir de 01/10 dá 31/10; "0" é a própria base; vira mês e ano (10/01/2027 − 45 = 26/11/2026); texto que não é dias ou base inválida dá null', () => {
  assert.equal(resolverRelativo('45', '2026-10-30', -1), '2026-09-15');
  assert.equal(resolverRelativo('45 dias', '2026-10-30', -1), '2026-09-15');
  assert.equal(resolverRelativo('30', '2026-10-01', 1), '2026-10-31');
  assert.equal(resolverRelativo('0', '2026-10-30', -1), '2026-10-30');
  assert.equal(resolverRelativo('45', '2027-01-10', -1), '2026-11-26');
  assert.equal(resolverRelativo('15/09/2026', '2026-10-30', -1), null);
  assert.equal(resolverRelativo('abc', '2026-10-30', -1), null);
  assert.equal(resolverRelativo('45', '', -1), null);
  assert.equal(resolverRelativo('45', '2026-02-30', -1), null, 'base impossível');
});

test('diasEntre: 15/09 a 30/10/2026 são 45 dias; invertido é negativo; data inválida não dá número', () => {
  assert.equal(diasEntre('2026-09-15', '2026-10-30'), 45);
  assert.equal(diasEntre('2026-10-30', '2026-09-15'), -45);
  assert.equal(diasEntre('2026-12-31', '2027-01-01'), 1);
  assert.equal(diasEntre('', '2026-10-30'), null);
});
