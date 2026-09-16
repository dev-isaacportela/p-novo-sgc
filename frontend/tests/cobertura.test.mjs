// Cobertura por curva ABC da spec 012 (src/lib/cobertura.ts): o alvo que a
// compra mira, o teto sem justificativa, a precedencia de quatro niveis e a
// auditoria campo a campo.
//
// Parametrizacao de referencia (a mesma do seed/003-itens.mjs): departamento 2
// = A 35/20 %, B 45/10 %, C 60/5 % e sku 5001 = A 20/0, B 25/0, C 30/0. A
// secao 21 e fixture SO destes testes — semea-la colidiria com o C-020 do
// smoke da 003, que cria e apaga `secao`/`21` na chave unica.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALVO_COBERTURA_PADRAO_DIAS, CAMPOS_COBERTURA, COLUNAS_CSV_COBERTURA, acaoDaCobertura,
  acimaDoLimite, coberturaDeLinha, curvaValida, diferencasDeCobertura, limiteDeCobertura,
  linhasCsvCobertura, tetoDaCurva,
} from '../src/lib/cobertura.ts';

/** `cob('departamento', '2', 'NUTRICAO', [35, 20], [45, 10], [60, 5])` */
const cob = (nivel, codigo, descricao, a, b, c, ativo = true) => ({
  id: 0,
  nivel,
  codigo,
  descricao,
  ativo,
  curvas: {
    A: { alvoDias: a[0], toleranciaPct: a[1] },
    B: { alvoDias: b[0], toleranciaPct: b[1] },
    C: { alvoDias: c[0], toleranciaPct: c[1] },
  },
});

/** Um par só, repetido nas três curvas — para os casos de precedência pura. */
const cobUnica = (nivel, codigo, alvoDias, toleranciaPct = 0) =>
  cob(nivel, codigo, '', [alvoDias, toleranciaPct], [alvoDias, toleranciaPct], [alvoDias, toleranciaPct]);

const DEPARTAMENTO_2 = cob('departamento', '2', 'NUTRICAO CLINICA', [35, 20], [45, 10], [60, 5]);
const SKU_5001 = cob('sku', '5001', 'CREME NUTRICIONAL MORANGO 200 ML', [20, 0], [25, 0], [30, 0]);
// Fixture: parametrizada so na curva A, B e C em branco (alvo 0).
const SECAO_21 = cob('secao', '21', 'SUPLEMENTOS ORAIS', [10, 0], [0, 0], [0, 0]);
const REFERENCIA = [DEPARTAMENTO_2, SKU_5001];

const alvo5002 = { codprod: 5002, codsec: 99, codepto: 2, codfornec: 1015 };
const alvo5001 = { codprod: 5001, codsec: 99, codepto: 2, codfornec: 1015 };
const alvo5003 = { codprod: 5003, codsec: 21, codepto: 2, codfornec: 1015 };
const alvo7001 = { codprod: 7001, codsec: 98, codepto: 9, codfornec: 1042 };

test('C-001: departamento 2 em A 35/20 %, B 45/10 % e C 60/5 % cobra o item de curva A contra 42 dias, o de curva B contra 49,5 e o de curva C contra 63', () => {
  assert.equal(limiteDeCobertura(REFERENCIA, alvo5002, 'A').limiteDias, 42);
  assert.equal(limiteDeCobertura(REFERENCIA, alvo5002, 'B').limiteDias, 49.5);
  assert.equal(limiteDeCobertura(REFERENCIA, alvo5002, 'C').limiteDias, 63);
  assert.equal(limiteDeCobertura(REFERENCIA, alvo5002, 'B').nivel, 'departamento');
});

test('C-002: com o departamento 2 em B 45/10 % e o produto 5001 em B 25/0, o item 5001 de curva B e cobrado contra 25 dias — a parametrizacao do produto vence a do departamento', () => {
  assert.deepEqual(limiteDeCobertura(REFERENCIA, alvo5001, 'B'), {
    alvoDias: 25, limiteDias: 25, toleranciaPct: 0, curva: 'B', nivel: 'sku',
  });
});

test('C-003: item sem curva classificada e cobrado pela coluna C — 63 dias, a curva mais tolerante, nunca a mais apertada', () => {
  assert.deepEqual(limiteDeCobertura(REFERENCIA, alvo5002, ''), {
    alvoDias: 60, limiteDias: 63, toleranciaPct: 5, curva: 'C', nivel: 'departamento',
  });
  assert.equal(limiteDeCobertura(REFERENCIA, alvo5002, undefined).curva, 'C');
});

test('C-004: produto sem parametrizacao de produto, secao, departamento nem fornecedor resolve alvo 35, tolerancia 0 e teto 35', () => {
  assert.deepEqual(limiteDeCobertura(REFERENCIA, alvo7001, 'A'), {
    alvoDias: 35, limiteDias: 35, toleranciaPct: 0, curva: 'A', nivel: 'padrao',
  });
});

test('C-005: a secao 21 parametrizada so na curva A nao segura o item de curva B — ele cai no departamento (49,5); na curva A a secao vale (10)', () => {
  const coberturas = [...REFERENCIA, SECAO_21];
  assert.deepEqual(limiteDeCobertura(coberturas, alvo5003, 'B'), {
    alvoDias: 45, limiteDias: 49.5, toleranciaPct: 10, curva: 'B', nivel: 'departamento',
  });
  assert.deepEqual(limiteDeCobertura(coberturas, alvo5003, 'A'), {
    alvoDias: 10, limiteDias: 10, toleranciaPct: 0, curva: 'A', nivel: 'secao',
  });
});

test('C-007: comprar mira o alvo, nao o teto — a resolucao da curva A devolve alvoDias 35 e toleranciaPct 20 ao lado de limiteDias 42', () => {
  const resolvido = limiteDeCobertura(REFERENCIA, alvo5002, 'A');
  assert.equal(resolvido.alvoDias, 35, 'o estoque maximo da sugestao usa o alvo');
  assert.equal(resolvido.toleranciaPct, 20);
  assert.equal(resolvido.limiteDias, 42, 'o teto so existe para decidir o que precisa de justificativa');
});

test('C-008: trocar os tres alvos e as tres tolerancias produz seis linhas de historico, com a acao alterou', () => {
  const depois = cob('departamento', '2', 'NUTRICAO CLINICA', [30, 10], [40, 5], [50, 0]);
  const diferencas = diferencasDeCobertura(DEPARTAMENTO_2, depois);
  assert.equal(diferencas.length, 6);
  assert.deepEqual(diferencas, [
    { campo: 'ALVO_A_DIAS', antes: '35', depois: '30' },
    { campo: 'TOLERANCIA_A_PCT', antes: '20', depois: '10' },
    { campo: 'ALVO_B_DIAS', antes: '45', depois: '40' },
    { campo: 'TOLERANCIA_B_PCT', antes: '10', depois: '5' },
    { campo: 'ALVO_C_DIAS', antes: '60', depois: '50' },
    { campo: 'TOLERANCIA_C_PCT', antes: '5', depois: '0' },
  ]);
  assert.equal(acaoDaCobertura(DEPARTAMENTO_2, depois), 'alterou');
});

test('C-009: criar uma parametrizacao registra sete linhas — descricao e os seis numeros —, com o valor anterior vazio e a acao criou', () => {
  const nova = cob('sku', '5004', 'DIETA ENTERAL 500 ML', [30, 10], [40, 5], [50, 0]);
  const diferencas = diferencasDeCobertura(null, nova);
  assert.equal(diferencas.length, 7, 'ATIVO nao conta: a linha nasce ativa, a situacao nao mudou');
  assert.ok(diferencas.every((d) => d.antes === ''));
  assert.deepEqual(diferencas[0], { campo: 'DESCRICAO', antes: '', depois: 'DIETA ENTERAL 500 ML' });
  assert.equal(acaoDaCobertura(null, nova), 'criou');
});

test('C-010: a parametrizacao de sku desativada sai da resolucao — o item 5001 de curva B passa a ser cobrado contra os 49,5 do departamento; regravar a partir da linha inativa deriva reativou, nunca criou', () => {
  const inativa = { ...SKU_5001, ativo: false };
  assert.equal(limiteDeCobertura([DEPARTAMENTO_2, inativa], alvo5001, 'B').limiteDias, 49.5);
  assert.equal(limiteDeCobertura([DEPARTAMENTO_2, inativa], alvo5001, 'B').nivel, 'departamento');

  // O `antes` vem da propria listagem (R-109: ela devolve ATIVO e as inativas).
  const antes = coberturaDeLinha({
    ID: '2', NIVEL: 'sku', CODIGO: '5001', DESCRICAO: 'CREME NUTRICIONAL MORANGO 200 ML',
    ALVO_A_DIAS: '20', TOLERANCIA_A_PCT: '0', ALVO_B_DIAS: '25', TOLERANCIA_B_PCT: '0',
    ALVO_C_DIAS: '30', TOLERANCIA_C_PCT: '0', ATIVO: 0,
  });
  assert.equal(antes.ativo, false);
  assert.equal(acaoDaCobertura(antes, SKU_5001), 'reativou');
  assert.deepEqual(diferencasDeCobertura(antes, SKU_5001), [{ campo: 'ATIVO', antes: '0', depois: '1' }]);
});

test('C-012: a linha exportada da parametrizacao de referencia traz 35; 20; 42; 45; 10; 49,5; 60; 5; 63', () => {
  assert.equal(COLUNAS_CSV_COBERTURA.length, 13);
  assert.deepEqual(linhasCsvCobertura([DEPARTAMENTO_2]), [[
    'departamento', '2', 'NUTRICAO CLINICA', 'Ativa',
    '35', '20', '42', '45', '10', '49,5', '60', '5', '63',
  ]]);
  assert.deepEqual(linhasCsvCobertura([{ ...SECAO_21, ativo: false }])[0].slice(3),
    ['Inativa', '10', '0', '10', '0', '0', '', '0', '0', '']);
});

test('C-013: o maximo sem justificativa aparece antes de salvar — alvo 45 com tolerancia 10 da 49,5; faltando um dos dois numeros, nao ha teto a mostrar', () => {
  assert.equal(tetoDaCurva(45, 10), 49.5);
  assert.equal(tetoDaCurva(45, Number.NaN), null, 'tolerancia ainda vazia no formulario');
  assert.equal(tetoDaCurva(0, 10), null, 'alvo vazio');
});

test('RN-001: teto = alvo x (1 + tolerancia / 100), a duas casas; tolerancia 0 e valida e devolve o proprio alvo; alvo 0 nao tem teto', () => {
  assert.equal(tetoDaCurva(35, 20), 42);
  assert.equal(tetoDaCurva(45, 10), 49.5);
  assert.equal(tetoDaCurva(60, 5), 63);
  assert.equal(tetoDaCurva(35, 0), 35);
  assert.equal(tetoDaCurva(0, 20), null, 'a linha nao vale para a curva (D-006)');
});

test('RN-002: com produto 20, secao 45, departamento 60 e fornecedor 90 na mesma curva vale 20; sem a do produto, 45; so a do fornecedor, 90; nenhuma, 35', () => {
  const alvo = { codprod: 5001, codsec: 21, codepto: 2, codfornec: 1015 };
  const todas = [
    cobUnica('fornecedor', '1015', 90), cobUnica('departamento', '2', 60),
    cobUnica('secao', '21', 45), cobUnica('sku', '5001', 20),
  ];
  assert.equal(limiteDeCobertura(todas, alvo, 'A').limiteDias, 20);
  assert.equal(limiteDeCobertura(todas.filter((c) => c.nivel !== 'sku'), alvo, 'A').limiteDias, 45);
  assert.equal(limiteDeCobertura(todas.filter((c) => c.nivel === 'fornecedor'), alvo, 'A').limiteDias, 90);
  assert.equal(limiteDeCobertura([], alvo, 'A').limiteDias, ALVO_COBERTURA_PADRAO_DIAS);
});

test('RN-002: codigo zerado ou vazio no alvo nao casa com parametrizacao nenhuma — o nivel e pulado', () => {
  const coberturas = [cobUnica('sku', '0', 5), cobUnica('departamento', '2', 60)];
  assert.equal(limiteDeCobertura(coberturas, { codprod: 0, codsec: 0, codepto: 2, codfornec: 0 }, 'A').limiteDias, 60);
});

test('RN-003: curva vazia, invalida (D) e ausente resolvem todas pela coluna C; minuscula ainda e a curva que ela nomeia', () => {
  assert.equal(curvaValida(''), 'C');
  assert.equal(curvaValida('D'), 'C');
  assert.equal(curvaValida(undefined), 'C');
  assert.equal(curvaValida('b'), 'B');
  assert.equal(curvaValida('A'), 'A');
});

test('RN-004: toda resolucao devolve alvo e teto separados — no padrao, 35 e 35; no departamento de curva A, 35 e 42', () => {
  const padrao = limiteDeCobertura([], alvo7001, 'A');
  assert.equal(padrao.alvoDias, 35);
  assert.equal(padrao.limiteDias, 35);
  const departamento = limiteDeCobertura(REFERENCIA, alvo5002, 'A');
  assert.equal(departamento.alvoDias, 35);
  assert.equal(departamento.limiteDias, 42);
});

test('RN-006: uma parametrizacao comparada com ela mesma nao gera linha; com um unico numero diferente, gera uma', () => {
  assert.deepEqual(diferencasDeCobertura(DEPARTAMENTO_2, DEPARTAMENTO_2), []);
  const so_b = cob('departamento', '2', 'NUTRICAO CLINICA', [35, 20], [45, 15], [60, 5]);
  assert.deepEqual(diferencasDeCobertura(DEPARTAMENTO_2, so_b),
    [{ campo: 'TOLERANCIA_B_PCT', antes: '10', depois: '15' }]);
  assert.equal(CAMPOS_COBERTURA.length, 8, 'DESCRICAO, os seis numeros e ATIVO');
});

test('RN-007: inexistente vira criou; ativa que ficou inativa, desativou; inativa que voltou, reativou; valor diferente com a mesma situacao, alterou', () => {
  const inativa = { ...DEPARTAMENTO_2, ativo: false };
  assert.equal(acaoDaCobertura(null, DEPARTAMENTO_2), 'criou');
  assert.equal(acaoDaCobertura(DEPARTAMENTO_2, inativa), 'desativou');
  assert.equal(acaoDaCobertura(inativa, DEPARTAMENTO_2), 'reativou');
  assert.equal(acaoDaCobertura(DEPARTAMENTO_2, cob('departamento', '2', 'OUTRA', [35, 20], [45, 10], [60, 5])), 'alterou');
});

test('RF-010: acima do limite so quando ha cobertura a calcular — produto sem venda nao esta acima de nada, e a fracao do teto decide', () => {
  assert.equal(acimaDoLimite(40, 35), true);
  assert.equal(acimaDoLimite(35, 35), false, 'no limite ainda esta dentro');
  assert.equal(acimaDoLimite(49.2, 49.5), false, 'meia casa de tolerancia nao pode virar justificativa (C-006b)');
  assert.equal(acimaDoLimite(null, 35), false);
});

test('coberturaDeLinha converte a linha UPPERCASE de sgcCoberturaListar, e ATIVO ausente e lido como ativa', () => {
  assert.deepEqual(coberturaDeLinha({
    ID: '3', NIVEL: 'secao', CODIGO: '21', DESCRICAO: 'ORAIS',
    ALVO_A_DIAS: '10', TOLERANCIA_A_PCT: '0', ALVO_B_DIAS: '0', TOLERANCIA_B_PCT: '0',
    ALVO_C_DIAS: '0', TOLERANCIA_C_PCT: '0', ATIVO: 1,
  }), { ...SECAO_21, id: 3, descricao: 'ORAIS' });
  assert.equal(coberturaDeLinha({ NIVEL: 'sku', CODIGO: '5001' }).ativo, true);
});
