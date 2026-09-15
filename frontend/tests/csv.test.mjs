// R-037 do 000: textoCsv/baixarCsv nascem uma vez na base (S2) e são
// consumidos por /notas-fiscais, /faturamentos-pendentes, /nfs-em-atraso e
// /bo. Aqui só a parte pura (textoCsv) — baixarCsv mexe com document/Blob e é
// verificado no simulador (design.md, "Exportar").
import test from 'node:test';
import assert from 'node:assert/strict';
import { textoCsv } from '../src/lib/csv.ts';

test('textoCsv: cabeçalho e linhas juntados com ; e quebra \\r\\n', () => {
  const texto = textoCsv(['Fornecedor', 'Valor'], [['Fresenius Kabi', 120.5], ['Nestlé', 80]]);
  assert.equal(texto, 'Fornecedor;Valor\r\nFresenius Kabi;120.5\r\nNestlé;80');
});

test('textoCsv: campo com vírgula não precisa de aspas (separador é ;)', () => {
  const texto = textoCsv(['Nome'], [['Silva, João']]);
  assert.equal(texto, 'Nome\r\nSilva, João');
});

test('textoCsv: campo com ; vira aspas', () => {
  const texto = textoCsv(['Nome'], [['A; B']]);
  assert.equal(texto, 'Nome\r\n"A; B"');
});

test('textoCsv: aspas dentro do campo dobram e o campo inteiro vira aspas', () => {
  const texto = textoCsv(['Obs'], [['disse "oi"']]);
  assert.equal(texto, 'Obs\r\n"disse ""oi"""');
});

test('textoCsv: quebra de linha no campo também exige aspas', () => {
  const texto = textoCsv(['Obs'], [['linha 1\nlinha 2']]);
  assert.equal(texto, 'Obs\r\n"linha 1\nlinha 2"');
});

test('textoCsv: sem linhas devolve só o cabeçalho', () => {
  assert.equal(textoCsv(['A', 'B'], []), 'A;B');
});
