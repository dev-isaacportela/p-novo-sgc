// Spec 006 (trânsito e recebimento) — a parte de TELA dos cenários: C-018
// (exportar), RN-003 (rótulo e tom das cinco situações), RN-005 (faixas de
// atraso) e RN-012 (matriz de perfis). A aritmética de data não está aqui de
// propósito (D-003): a previsão vem pronta do servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COLUNAS_CSV_ATRASO, faixaDeAtraso, linhasCsv, notaDeLinha, resumoRecebimento,
  rotuloAtraso, rotuloSituacao, situacaoDeTexto, tomSituacao,
} from '../src/lib/recebimento.ts';
import { textoCsv } from '../src/lib/csv.ts';
import { permissoesDe } from '../src/lib/permissoes.ts';

const linha = (extras) => ({
  ID: 10, ID_CARD: 5, TITULO: 'BENENUTRI MATRIZ · NESTLE', FASE: 'transito',
  NUMNOTA: 90011, SERIE: '1', CODFORNEC: 1042, FORNECEDOR: 'NESTLE BRASIL LTDA',
  CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte', NUMPED_WINTHOR: '900500',
  DT_EMISSAO: '2026-09-01', DT_PREVISAO: '2026-09-11', DT_RECEBIMENTO: '',
  DIAS_ATRASO: 4, PRAZO_ENTREGA_DIAS: 10, PRAZO_ENTREGA_TIPO: 'corridos',
  VL_TOTAL: 4000.5, SITUACAO: 'atrasada', ...extras,
});

/* ── RN-003 (tela): as cinco situações, com rótulo e tom ── */

test('RN-003: situacaoDeTexto aceita os cinco valores do servidor e cai em sem_prazo no desconhecido', () => {
  for (const valor of ['recebida', 'atrasada', 'em_transito', 'dentro_prazo', 'sem_prazo']) {
    assert.equal(situacaoDeTexto(valor), valor);
  }
  assert.equal(situacaoDeTexto('extraviada'), 'sem_prazo');
  assert.equal(situacaoDeTexto(null), 'sem_prazo');
  assert.equal(situacaoDeTexto(undefined), 'sem_prazo');
});

test('RN-003: cada situação tem rótulo em português e um dos quatro tons do design system — estado nunca só por cor', () => {
  assert.equal(rotuloSituacao('recebida'), 'Recebida');
  assert.equal(rotuloSituacao('atrasada'), 'Em atraso');
  assert.equal(rotuloSituacao('em_transito'), 'Chegando');
  assert.equal(rotuloSituacao('dentro_prazo'), 'Dentro do prazo');
  assert.equal(rotuloSituacao('sem_prazo'), 'Sem prazo parametrizado');

  assert.equal(tomSituacao('recebida'), 'live');
  assert.equal(tomSituacao('atrasada'), 'alert');
  assert.equal(tomSituacao('em_transito'), 'attention');
  assert.equal(tomSituacao('dentro_prazo'), 'off');
  assert.equal(tomSituacao('sem_prazo'), 'off');
  assert.equal(tomSituacao(situacaoDeTexto('extraviada')), 'off');
});

test('RN-003: notaDeLinha lê as colunas UPPERCASE do servidor sem inventar número em coluna vazia', () => {
  const nota = notaDeLinha(linha());
  assert.equal(nota.numnota, 90011);
  assert.equal(nota.vlTotal, 4000.5);
  assert.equal(nota.situacao, 'atrasada');
  assert.equal(nota.dtRecebimento, '');

  const vazia = notaDeLinha({});
  assert.equal(vazia.numnota, 0);
  assert.equal(vazia.dtPrevisao, '');
  assert.equal(vazia.situacao, 'sem_prazo');
  assert.equal(vazia.diasAtraso, 0);
});

test('RN-003: rotuloAtraso só fala de quem atrasou, no singular e no plural', () => {
  assert.equal(rotuloAtraso(notaDeLinha(linha({ DIAS_ATRASO: 1 }))), '1 dia de atraso');
  assert.equal(rotuloAtraso(notaDeLinha(linha({ DIAS_ATRASO: 4 }))), '4 dias de atraso');
  assert.equal(rotuloAtraso(notaDeLinha(linha({ SITUACAO: 'recebida', DIAS_ATRASO: 0 }))), '');
  assert.equal(rotuloAtraso(notaDeLinha(linha({ SITUACAO: 'sem_prazo', DIAS_ATRASO: 0 }))), '');
});

test('RN-003: resumoRecebimento conta o que a aba mostra e só diz completo com nota', () => {
  const notas = [
    notaDeLinha(linha({ NUMNOTA: 1, SITUACAO: 'recebida', DT_RECEBIMENTO: '2026-09-01' })),
    notaDeLinha(linha({ NUMNOTA: 2, SITUACAO: 'recebida', DT_RECEBIMENTO: '2026-09-02' })),
    notaDeLinha(linha({ NUMNOTA: 3, SITUACAO: 'atrasada' })),
  ];
  assert.deepEqual(resumoRecebimento(notas), {
    total: 3, recebidas: 2, pendentes: 1, atrasadas: 1, semPrazo: 0, completo: false,
  });
  assert.equal(resumoRecebimento(notas.slice(0, 2)).completo, true);
  assert.equal(resumoRecebimento([]).completo, false, 'pedido sem nota nunca está completo (RN-006)');
});

/* ── RN-005: as faixas de atraso, nos limites ── */

test('RN-005: faixaDeAtraso nos limites — 0 e 3 em "até 3", 4 e 7 em "de 4 a 7", 8 em "mais de 7"', () => {
  assert.equal(faixaDeAtraso(0), 'ate3');
  assert.equal(faixaDeAtraso(3), 'ate3');
  assert.equal(faixaDeAtraso(4), '4a7');
  assert.equal(faixaDeAtraso(7), '4a7');
  assert.equal(faixaDeAtraso(8), 'mais7');
  assert.equal(faixaDeAtraso(90), 'mais7');
});

/* ── C-018: exportar a lista filtrada ── */

test('C-018: linhasCsv devolve uma linha por nota, nas colunas de COLUNAS_CSV_ATRASO e na ordem delas', () => {
  const notas = [
    notaDeLinha(linha({ NUMNOTA: 90011, DIAS_ATRASO: 2, VL_TOTAL: 4000.5 })),
    notaDeLinha(linha({ NUMNOTA: 90012, DIAS_ATRASO: 5, VL_TOTAL: 6000 })),
    notaDeLinha(linha({ NUMNOTA: 90013, DIAS_ATRASO: 9, VL_TOTAL: 10000, FASE: 'enviado' })),
  ];
  const linhas = linhasCsv(notas);
  assert.equal(linhas.length, 3);
  for (const l of linhas) assert.equal(l.length, COLUNAS_CSV_ATRASO.length);
  assert.equal(linhas[0][0], 90011);
  assert.equal(linhas[0][COLUNAS_CSV_ATRASO.indexOf('Dias de atraso')], 2);
  assert.equal(linhas[2][COLUNAS_CSV_ATRASO.indexOf('Fase')], 'Enviado para Indústria');
});

test('C-018: textoCsv sobre as 3 notas dá 4 linhas (cabeçalho + 3), valor em vírgula decimal e o campo com ; entre aspas', () => {
  const notas = [
    notaDeLinha(linha({ NUMNOTA: 90011, VL_TOTAL: 4000.5 })),
    notaDeLinha(linha({ NUMNOTA: 90012, VL_TOTAL: 6000, FORNECEDOR: 'NESTLE; BRASIL' })),
    notaDeLinha(linha({ NUMNOTA: 90013, VL_TOTAL: 10000 })),
  ];
  const texto = textoCsv(COLUNAS_CSV_ATRASO, linhasCsv(notas));
  const linhasDoArquivo = texto.split('\r\n');
  assert.equal(linhasDoArquivo.length, 4);
  assert.equal(linhasDoArquivo[0], COLUNAS_CSV_ATRASO.join(';'));
  assert.ok(linhasDoArquivo[1].includes('4000,50'), 'valor em vírgula decimal');
  assert.ok(linhasDoArquivo[2].includes('"NESTLE; BRASIL"'), 'campo com o separador vai entre aspas');
});

/* ── RN-012: quem vê e quem opera ── */

test('RN-012: verNfsAtraso liga para admin, analista, gestor e diretoria e desliga para o comercial', () => {
  for (const persona of ['admin', 'analista', 'gestor', 'diretoria']) {
    assert.equal(permissoesDe(persona, 'MEMBER').verNfsAtraso, true, persona);
  }
  assert.equal(permissoesDe('comercial', 'MEMBER').verNfsAtraso, false);
});

test('RN-012: operarNf (Verificar entrada / Sincronizar) é de admin, analista e gestor; diretoria, comercial e READ_ONLY não operam', () => {
  for (const persona of ['admin', 'analista', 'gestor']) {
    assert.equal(permissoesDe(persona, 'MEMBER').operarNf, true, persona);
  }
  assert.equal(permissoesDe('diretoria', 'MEMBER').operarNf, false);
  assert.equal(permissoesDe('comercial', 'MEMBER').operarNf, false);
  for (const persona of ['admin', 'analista', 'gestor']) {
    const somenteLeitura = permissoesDe(persona, 'READ_ONLY');
    assert.equal(somenteLeitura.operarNf, false, `${persona} READ_ONLY não opera`);
    assert.equal(somenteLeitura.verNfsAtraso, true, `${persona} READ_ONLY continua vendo a lista`);
  }
});

test('RN-012: RESTRICTED sem persona cadastrada cai em comercial e não vê nada desta feature', () => {
  const restrito = permissoesDe('comercial', 'RESTRICTED');
  assert.equal(restrito.verNfsAtraso, false);
  assert.equal(restrito.operarNf, false);
});
