// Os avisos de excesso e de bloqueio (src/lib/avisos-produto.ts, R-130).
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SEM_MOTIVO, contarAvisos, excessosPorProduto, fatosDoLote, filialCurta, filtrarPorAvisos, motivoDoLote, resumoBloqueio,
  resumoExcesso, seloBloqueado, seloExcesso,
} from '../src/lib/avisos-produto.ts';

const POSICOES = [
  // 5403: filial 2 com 120 e venda 30 em 3 meses (360 d), filial 3 com 30 (90 d)
  { CODPROD: 5403, CODFILIAL: '2', FILIAL: 'BENENUTRI COMERCIAL LTDA - GO', ESTOQUE_ATUAL: 120, VENDA_3_MESES: 30 },
  { CODPROD: 5403, CODFILIAL: '3', FILIAL: 'IBEX COMERCIAL DE ALIMENTOS LTDA - DF', ESTOQUE_ATUAL: 30, VENDA_3_MESES: 30 },
  // 5404: filial 2 com 14 e giro nenhum (sem giro = excesso por definição)
  { CODPROD: 5404, CODFILIAL: '2', FILIAL: 'BENENUTRI COMERCIAL LTDA - GO', ESTOQUE_ATUAL: 14, VENDA_3_MESES: 0 },
  // 5405: filial 2 com 10 e venda 90 (10 d) — dentro do alvo, não é excesso
  { CODPROD: 5405, CODFILIAL: '2', FILIAL: 'BENENUTRI COMERCIAL LTDA - GO', ESTOQUE_ATUAL: 10, VENDA_3_MESES: 90 },
];

test('RN-037: o excesso da lista usa a regra da seção (RN-025) com a cobertura alvo de cada produto — 5403 em 2 filiais com alvo 35, só 1 com alvo 100; 5404 sem giro; 5405 dentro do alvo fica fora', () => {
  const mapa = excessosPorProduto(POSICOES, [
    { codprod: 5403, coberturaDias: 35 }, { codprod: 5404, coberturaDias: 35 }, { codprod: 5405, coberturaDias: 35 },
  ], '1');
  assert.deepEqual([...mapa.keys()].sort(), [5403, 5404]);
  assert.deepEqual(mapa.get(5403).map((f) => f.codfilial), ['2', '3'], 'a maior cobertura primeiro');
  assert.equal(mapa.get(5404)[0].coberturaDias, null);
  const alvoAlto = excessosPorProduto(POSICOES, [{ codprod: 5403, coberturaDias: 100 }], '1');
  assert.deepEqual(alvoAlto.get(5403).map((f) => f.codfilial), ['2']);
  assert.equal(excessosPorProduto(POSICOES, [{ codprod: 5403, coberturaDias: 35 }], '2').get(5403).length, 1, 'a filial da tela nunca conta');
});

test('RN-037: os selos da linha — "Bloqueado 15 un." só com bloqueio; "Excesso em 1 filial" / "em 2 filiais" só com excesso', () => {
  assert.equal(seloBloqueado(15), 'Bloqueado 15 un.');
  assert.equal(seloBloqueado(2520), 'Bloqueado 2.520 un.');
  assert.equal(seloBloqueado(0), null);
  assert.equal(seloBloqueado(null), null);
  assert.equal(seloExcesso(1), 'Excesso em 1 filial');
  assert.equal(seloExcesso(2), 'Excesso em 2 filiais');
  assert.equal(seloExcesso(0), null);
});

test('RN-037: o resumo do alerta de excesso — "Excesso em outras filiais: 2 - GO · estoque 14 · sem giro", com "e mais N" quando há mais filiais; a filial curta sai da UF da razão social', () => {
  const so5404 = excessosPorProduto(POSICOES, [{ codprod: 5404, coberturaDias: 35 }], '1').get(5404);
  assert.equal(resumoExcesso(so5404), 'Excesso em outras filiais: 2 - GO · estoque 14 · sem giro');
  const de5403 = excessosPorProduto(POSICOES, [{ codprod: 5403, coberturaDias: 35 }], '1').get(5403);
  assert.equal(resumoExcesso(de5403), 'Excesso em outras filiais: 2 - GO · estoque 120 · cobertura 360 d e mais 1');
  assert.equal(resumoExcesso([]), null);
  assert.equal(filialCurta('3', 'IBEX COMERCIAL DE ALIMENTOS LTDA - DF'), '3 - DF');
  assert.equal(filialCurta('9', 'DEPOSITO CENTRAL'), '9 - DEPOSITO CENTRAL');
  assert.equal(filialCurta('9', '9'), '9');
});

test('RN-038: o motivo do lote segue a cascata do legado — motivo do histórico, OBSBLOQUEIO, OBSBLOQUEIOMANUAL, OBSANALISE, MOTIVOBLOQESTOQUE, OBS1, OBS2 — e sem nada é "Sem motivo vinculado"', () => {
  const vazio = { MOTIVO_BLOQUEIO: null, OBSBLOQUEIO: null, OBSBLOQUEIOMANUAL: null, OBSANALISE: null, MOTIVOBLOQESTOQUE: null, OBS1: null, OBS2: null };
  assert.equal(motivoDoLote({ ...vazio, MOTIVO_BLOQUEIO: 'AVARIA NO TRANSPORTE', OBSBLOQUEIO: 'X' }), 'AVARIA NO TRANSPORTE');
  assert.equal(motivoDoLote({ ...vazio, OBSBLOQUEIO: '  ', OBSBLOQUEIOMANUAL: 'MANUAL' }), 'MANUAL', 'texto em branco não conta');
  assert.equal(motivoDoLote({ ...vazio, OBSANALISE: 'ANALISE', MOTIVOBLOQESTOQUE: 'EST' }), 'ANALISE');
  assert.equal(motivoDoLote({ ...vazio, MOTIVOBLOQESTOQUE: 'EST', OBS1: 'O1' }), 'EST');
  assert.equal(motivoDoLote({ ...vazio, OBS1: 'O1', OBS2: 'O2' }), 'O1');
  assert.equal(motivoDoLote({ ...vazio, OBS2: 'O2' }), 'O2');
  assert.equal(motivoDoLote(vazio), SEM_MOTIVO);
  assert.equal(SEM_MOTIVO, 'Sem motivo vinculado');
});

test('RN-038: o resumo do alerta de bloqueio — "Estoque bloqueado: 10 un. em 2 lotes · 5 reservadas"; antes dos lotes, só o total; sem bloqueio, nada', () => {
  const lotes = [{ QTBLOQUEADA: 6, QTRESERV: 2 }, { QTBLOQUEADA: 4, QTRESERV: 3 }];
  assert.equal(resumoBloqueio(10, lotes), 'Estoque bloqueado: 10 un. em 2 lotes · 5 reservadas');
  assert.equal(resumoBloqueio(6, [lotes[0]]), 'Estoque bloqueado: 6 un. em 1 lote · 2 reservadas');
  assert.equal(resumoBloqueio(10, null), 'Estoque bloqueado: 10 un.');
  assert.equal(resumoBloqueio(0, lotes), null);
});

test('RN-038: os fatos do lote saem na ordem do legado e só os que têm valor', () => {
  const fatos = fatosDoLote({
    QTRESERV: 2, QTINDENIZ: 0, DTBLOQUEIO1: '2026-10-10', DTBLOQUEIO2: null, DTVALIDADE: '2027-03-31',
    TIPO_MOTIVO: 'A', ORIGEM_MOTIVO: 'PCMOVBLOQUEIO', ROTINALANC: '1101', LOG_RESPONSAVEL: null, FUNCIONARIO: 'MARIA SOUZA',
  }, (d) => d.split('-').reverse().join('/'));
  assert.deepEqual(fatos.map((f) => `${f.rotulo}: ${f.valor}`), [
    'Reservado: 2 un.', 'Bloq. 1: 10/10/2026', 'Validade: 31/03/2027', 'Categoria: A',
    'Origem: PCMOVBLOQUEIO', 'Rotina: 1101', 'Funcionário: MARIA SOUZA',
  ]);
});

test('RN-037: os chips-filtro "Bloqueados" e "Excesso em outras filiais" recortam a lista, juntos ou separados, e contam o recorte', () => {
  const linhas = [{ codprod: 1, qtBloqueada: 5 }, { codprod: 2, qtBloqueada: 0 }, { codprod: 3, qtBloqueada: 2 }];
  const excessos = new Map([[2, []], [3, []]]);
  const dados = (l) => l;
  const cods = (f) => filtrarPorAvisos(linhas, f, excessos, dados).map((l) => l.codprod);
  assert.deepEqual(cods({ soBloqueados: false, soExcesso: false }), [1, 2, 3]);
  assert.deepEqual(cods({ soBloqueados: true, soExcesso: false }), [1, 3]);
  assert.deepEqual(cods({ soBloqueados: false, soExcesso: true }), [2, 3]);
  assert.deepEqual(cods({ soBloqueados: true, soExcesso: true }), [3]);
  assert.deepEqual(contarAvisos(linhas, excessos, dados), { bloqueados: 2, excesso: 2 });
});
