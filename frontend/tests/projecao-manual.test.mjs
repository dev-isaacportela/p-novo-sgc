// Regra pura da spec 019 (projeção manual): a validade, o fator, a validação,
// o selo, a prévia e o efeito do fator na régua da 011 (`ressuprimento.ts`) e
// nos modelos (`previsao.ts`, `analise-sku.ts`).
//
// Caso base da 011: consumo 2,0/dia, lead 9, cobertura 35 e caixa 12 dão
// segurança 18, ponto 36 e máximo 70; cada teste muda UMA entrada.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERCENTUAL_MAXIMO, PERCENTUAL_MINIMO, fatorDaProjecao, lerPercentual, previaDaProjecao, projecaoAtiva, projecaoDeLinha,
  projecoesAtivas, textoDoPercentual, textoDoSelo, validadeMaxima, validadePadrao, validarProjecao,
} from '../src/lib/projecao-manual.ts';
import {
  COLUNAS_CSV, calcularRessuprimento, coberturaComTransito, coberturaFuturaComCompra, filtrarMovimentacao, itemDoCarrinho,
  linhaCsv, montarRessuprimento,
} from '../src/lib/ressuprimento.ts';
import { modeloEscolhido, preverVendas } from '../src/lib/previsao.ts';
import { previsaoDoSku, projetadaDoSku } from '../src/lib/analise-sku.ts';

const HOJE = '2026-11-03';

const medida = (extra = {}) => ({
  CODPROD: 5401, DESCRICAO: 'WHEY CONCENTRADO MORANGO 900 G', EMBALAGEM: 'CX 12', UNIDADE: 'UN',
  CODEPTO: 2, CODSEC: 21, UN_POR_CAIXA_ERP: 12,
  CUSTO_ULT_ENTRADA: 10, DT_ULT_ENTRADA: '2026-09-01', DT_ULT_SAIDA: '2026-09-15',
  ESTOQUE_TOTAL: 50, QT_BLOQUEADA: 0, QT_INDENIZ: 0, QT_RESERV: 0,
  ESTOQUE_ATUAL: 50, QT_PEDIDA_ERP: 0, QT_TRANSITO: 0, ESTOQUE_EM_TRANSITO: 0,
  LEAD_TIME_MEDIDO: 0,
  VENDA_PERIODO: 306, VENDA_PUBLICA: 0,
  CONSUMO_DIARIO: 2, CONSUMO_DIARIO_PUBLICO: 0, VOLATILIDADE_DIARIA: 0,
  ...extra,
});
const BASE = { coberturaDias: 35, leadTimeDias: 9, gatilhoDias: 15, origemCobertura: 'curva', origemLeadTime: 'padrao' };
const calcular = (m, fatorProjecao, opcoes = {}) => calcularRessuprimento(
  m, BASE, { unidadesPorCaixa: 12, desconsiderarLicitacao: false, fatorProjecao, ...opcoes },
);
const foto = (r) => ({
  consumoDiario: Math.round(r.consumoDiario * 10000) / 10000,
  estoqueMaximo: Math.round(r.estoqueMaximo * 100) / 100,
  sugerida: r.sugerida,
  coberturaAtualDias: r.coberturaAtualDias === null ? null : Math.round(r.coberturaAtualDias * 10) / 10,
  diasDeGatilho: r.diasDeGatilho,
  status: r.status,
});
const ajuste = (extra = {}) => ({
  codprod: 5401, percentual: 20, validaAte: '2026-12-03', motivo: 'campanha de novembro', atualizadoPor: 3, atualizadoEm: '', ...extra,
});
const montar = (medidas, projecoes, opcoes = {}) => montarRessuprimento(
  medidas, [], () => 35, new Map(), { codfornec: 1042, hoje: HOJE, desconsiderarLicitacao: false, projecoes, ...opcoes },
);

/* ── a validade e o fator ── */

test('019 C-004 / RN-001: o ajuste vale até o último dia (validade = hoje) e não vale vencido (ontem), sem validade ou com percentual 0', () => {
  assert.equal(projecaoAtiva(ajuste({ validaAte: HOJE }), HOJE), true, 'no último dia ainda vale');
  assert.equal(projecaoAtiva(ajuste({ validaAte: '2026-11-02' }), HOJE), false, 'vencido ontem');
  assert.equal(projecaoAtiva(ajuste({ validaAte: '' }), HOJE), false, 'sem validade não vale (P-02)');
  assert.equal(projecaoAtiva(ajuste({ percentual: 0 }), HOJE), false, 'removido');
  assert.equal(projecaoAtiva(null, HOJE), false);
  assert.equal(fatorDaProjecao(ajuste(), HOJE), 1.2);
  assert.equal(fatorDaProjecao(ajuste({ percentual: -50 }), HOJE), 0.5);
  assert.equal(fatorDaProjecao(ajuste({ validaAte: '2026-11-02' }), HOJE), 1, 'fora da validade, fator 1');
});

test('019 RN-001: projecoesAtivas guarda só os que valem hoje, por produto; projecaoDeLinha lê as colunas UPPERCASE', () => {
  const lidos = [
    { CODPROD: 5401, PERCENTUAL: '20.0', VALIDA_ATE: '2026-12-03', MOTIVO: 'campanha', ATUALIZADO_POR: 3, ATUALIZADO_EM: '2026-11-03T09:00:00' },
    { CODPROD: 5402, PERCENTUAL: 15, VALIDA_ATE: '2026-11-02', MOTIVO: 'vencido', ATUALIZADO_POR: 3, ATUALIZADO_EM: '' },
  ].map(projecaoDeLinha);
  assert.deepEqual(lidos[0], { codprod: 5401, percentual: 20, validaAte: '2026-12-03', motivo: 'campanha', atualizadoPor: 3, atualizadoEm: '2026-11-03T09:00:00' });
  const mapa = projecoesAtivas(lidos, HOJE);
  assert.deepEqual([...mapa.keys()], [5401]);
});

/* ── a régua da 011 com o fator ── */

test('019 C-001 / RN-002: +20 % sobre a base (estoque 50) — consumo 2,4, máximo 84, sugestão 36 (3 caixas), cobertura 20,8 dias, gatilho 2, adequado; sem ajuste, 24 / 25 dias / 7', () => {
  assert.deepEqual(foto(calcular(medida(), 1)), {
    consumoDiario: 2, estoqueMaximo: 70, sugerida: 24, coberturaAtualDias: 25, diasDeGatilho: 7, status: 'adequado',
  });
  const r = calcular(medida(), 1.2);
  assert.deepEqual(foto(r), {
    consumoDiario: 2.4, estoqueMaximo: 84, sugerida: 36, coberturaAtualDias: 20.8, diasDeGatilho: 2, status: 'adequado',
  });
  assert.equal(r.consumoMedido, 2, 'o medido fica para o painel mostrar ao lado');
  assert.equal(r.fatorProjecao, 1.2);
  assert.equal(calcular(medida(), undefined).fatorProjecao, 1, 'sem a opção, fator 1');
});

test('019 C-001: montarRessuprimento liga o ajuste que vale à linha (projecao) e aplica o fator; o vencido não', () => {
  const [com, vencido, sem] = montar(
    [medida(), medida({ CODPROD: 5402 }), medida({ CODPROD: 5403 })],
    new Map([[5401, ajuste()], [5402, ajuste({ codprod: 5402, validaAte: '2026-11-02' })]]),
  );
  assert.equal(com.projecao?.percentual, 20);
  assert.equal(com.sugerida, 36);
  assert.equal(vencido.projecao, null);
  assert.equal(vencido.sugerida, 24, 'C-004: vencido volta à sugestão sem ajuste');
  assert.equal(sem.projecao, null);
  assert.equal(sem.sugerida, 24);
  // O que é passado não muda: a curva e a venda da janela do 5401 são as mesmas com e sem o ajuste.
  const [semAjuste] = montar([medida(), medida({ CODPROD: 5402 }), medida({ CODPROD: 5403 })], new Map());
  assert.deepEqual([com.curva, com.curvaFaturamento, com.curvaRentabilidade], [semAjuste.curva, semAjuste.curvaFaturamento, semAjuste.curvaRentabilidade]);
  assert.equal(com.medida.VENDA_PERIODO, semAjuste.medida.VENDA_PERIODO);
});

test('019 C-002: +100 % com estoque 30 — consumo 4, cobertura 7,5 dias: de baixa exposição (sugestão 48) para elevada exposição, sugestão 120 (10 caixas)', () => {
  const m = medida({ ESTOQUE_ATUAL: 30 });
  assert.equal(calcular(m, 1).status, 'baixa_exposicao');
  assert.equal(calcular(m, 1).sugerida, 48);
  assert.deepEqual(foto(calcular(m, 2)), {
    consumoDiario: 4, estoqueMaximo: 140, sugerida: 120, coberturaAtualDias: 7.5, diasDeGatilho: -11, status: 'elevada_exposicao',
  });
});

test('019 C-003: −50 % com estoque 50 — consumo 1, máximo 35, excesso, sugestão 0', () => {
  const r = calcular(medida(), 0.5);
  assert.equal(r.consumoDiario, 1);
  assert.equal(r.estoqueMaximo, 35);
  assert.equal(r.status, 'excesso');
  assert.equal(r.sugerida, 0);
});

test('019 C-009: produto sem venda nem consumo continua sem sugestão com +50 % — o ajuste é percentual sobre a venda', () => {
  const r = calcular(medida({ CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }), 1.5);
  assert.equal(r.consumoDiario, 0);
  assert.equal(r.sugerida, 0);
});

test('019 C-010: com 20 em trânsito a sugestão continua 0, e os dias com o trânsito caem de 25 para 20,8 (50 ÷ 2,4)', () => {
  const m = medida({ ESTOQUE_ATUAL: 30, ESTOQUE_EM_TRANSITO: 20 });
  assert.equal(calcular(m, 1.2).sugerida, 0);
  assert.equal(coberturaComTransito(calcular(m, 1)), 25);
  assert.equal(Math.round(coberturaComTransito(calcular(m, 1.2)) * 10) / 10, 20.8);
});

test('019 C-011: cobertura futura da simulação de 36 com +20 % é 35,8 dias ((50 + 36) ÷ 2,4); sem ajuste, 43', () => {
  assert.equal(coberturaFuturaComCompra(calcular(medida(), 1), 36), 43);
  assert.equal(Math.round(coberturaFuturaComCompra(calcular(medida(), 1.2), 36) * 10) / 10, 35.8);
});

test('019 C-012: licitação primeiro, ajuste depois — consumo 2,0 com 0,5 público e +20 %: 1,8 desconsiderando, 2,4 com o público', () => {
  const m = medida({ CONSUMO_DIARIO_PUBLICO: 0.5 });
  const sem = calcular(m, 1.2, { desconsiderarLicitacao: true });
  assert.equal(Math.round(sem.consumoDiario * 1000) / 1000, 1.8);
  assert.equal(sem.consumoMedido, 1.5);
  assert.equal(Math.round(calcular(m, 1.2).consumoDiario * 1000) / 1000, 2.4);
});

test('019 C-015: o item do carrinho de uma linha com +20 % nasce com sugerida 36', () => {
  const [linha] = montar([medida()], new Map([[5401, ajuste()]]));
  const item = itemDoCarrinho(linha, 36, 42);
  assert.equal(item.qtSugerida, 36);
  assert.equal(Math.round(item.coberturaDias * 10) / 10, 35.8, 'a cobertura do item também é a ajustada');
});

/* ── os modelos ── */

const pontos = (valores) => valores.map((valor, i) => ({ mes: `2026-0${i + 1}`, valor, original: valor, ajustado: false }));

test('019 C-008 / RN-003: com +20 % a previsão de cada modelo é multiplicada (60 → 72, a de antes em previsaoBase) e MAD, TS e Best Fit são os mesmos', () => {
  const constante = preverVendas(pontos([60, 60, 60, 60, 60, 60]), 1.2);
  const escolhido = modeloEscolhido(constante, 'bestfit');
  assert.equal(escolhido.previsao, 72);
  assert.equal(escolhido.previsaoBase, 60);

  const serie = pontos([50, 70, 40, 80, 55, 65]);
  const semAjuste = preverVendas(serie);
  const comAjuste = preverVendas(serie, 1.2);
  assert.equal(comAjuste.bestFit, semAjuste.bestFit, 'o Best Fit é o mesmo');
  for (let i = 0; i < semAjuste.modelos.length; i += 1) {
    const [a, b] = [semAjuste.modelos[i], comAjuste.modelos[i]];
    assert.deepEqual([b.mad, b.mape, b.ts, b.ce, b.sobControle], [a.mad, a.mape, a.ts, a.ce, a.sobControle], `${a.modelo}: erro medido contra o real`);
    assert.equal(b.previsao, Math.round(a.previsao * 1.2 * 100) / 100);
    assert.equal(b.previsaoBase, a.previsao);
  }
  assert.deepEqual(comAjuste.medias, semAjuste.medias, 'médias 3/6/12 são da série real');
  assert.equal(semAjuste.modelos[0].previsaoBase, undefined, 'sem ajuste, sem previsaoBase');
});

test('019 C-008: previsaoDoSku repassa o fator e a sugestão projetada com 72/mês e estoque 50 é 36 (2,4/dia × 35 = 84 − 50, 3 caixas)', () => {
  const historico = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
    .map((MES) => ({ MES, SAIDAS: 60, ENTRADAS: 0, SAIDAS_PUBLICAS: 0 }));
  const dados = { historico, compras: [], filiais: [], pronto: true, erro: '' };
  const [linha] = montar([medida()], new Map([[5401, ajuste()]]));
  const previsao = previsaoDoSku(dados, 5401, HOJE, [], false, linha.fatorProjecao);
  assert.equal(modeloEscolhido(previsao, 'bestfit').previsao, 72);
  const projetada = projetadaDoSku(previsao, linha, 'bestfit');
  assert.equal(projetada.demandaDiaria, 2.4);
  assert.equal(projetada.sugestao, 36);
  assert.equal(modeloEscolhido(previsaoDoSku(dados, 5401, HOJE, [], false), 'bestfit').previsao, 60, 'sem fator, 60');
});

/* ── a janela, o selo, o filtro, o CSV ── */

test('019 C-005 / RN-004: zero, −95, +350, texto, data anterior a hoje, depois de um ano e motivo curto são recusados; a validade nasce em hoje + 30', () => {
  const ok = { percentual: '20', validaAte: validadePadrao(HOJE), motivo: 'campanha de novembro' };
  assert.equal(validadePadrao(HOJE), '2026-12-03');
  assert.equal(validadeMaxima(HOJE), '2027-11-03');
  assert.deepEqual(validarProjecao(ok, HOJE), { ok: true, erros: [], percentual: 20 });
  for (const [campo, valor, trecho] of [
    ['percentual', '0', /não pode ser zero/],
    ['percentual', '-95', /vai de −?-90 %/],
    ['percentual', '350', /\+300 %/],
    ['percentual', 'muito', /Informe o percentual/],
    ['validaAte', '2026-11-02', /antes de hoje/],
    ['validaAte', '2027-11-04', /365 dias/],
    ['validaAte', '', /até quando/],
    ['motivo', ' abc ', /ao menos 5/],
  ]) {
    const r = validarProjecao({ ...ok, [campo]: valor }, HOJE);
    assert.equal(r.ok, false, `${campo} = ${valor}`);
    assert.match(r.erros.join(' '), trecho);
  }
  assert.equal(validarProjecao({ ...ok, percentual: '-90' }, HOJE).ok, true, 'os limites valem');
  assert.equal(validarProjecao({ ...ok, percentual: '+300 %' }, HOJE).ok, true);
  assert.equal(validarProjecao({ ...ok, percentual: '12,55' }, HOJE).percentual, 12.6, 'uma casa decimal');
  assert.equal(validarProjecao({ ...ok, validaAte: HOJE }, HOJE).ok, true, 'hoje vale');
  assert.equal(lerPercentual('−15'), -15);
  assert.deepEqual([PERCENTUAL_MINIMO, PERCENTUAL_MAXIMO], [-90, 300]);
});

test('019 C-005: a prévia mostra consumo e máximo antes e depois — 2,0 → 2,4 un./dia, 70 → 84 un.', () => {
  const p = previaDaProjecao(2, 35, 20);
  assert.deepEqual([p.consumoAntes, Math.round(p.consumoDepois * 10) / 10, p.maximoAntes, Math.round(p.maximoDepois)], [2, 2.4, 70, 84]);
});

test('019 RN-008: o selo tem sinal e casa só quando não é inteiro — "Projeção +20 %", "Projeção −12,5 %", "Projeção +100 %"', () => {
  assert.equal(textoDoSelo(20), 'Projeção +20 %');
  assert.equal(textoDoSelo(-12.5), 'Projeção −12,5 %');
  assert.equal(textoDoSelo(100), 'Projeção +100 %');
  assert.equal(textoDoPercentual(-90), '−90 %');
});

test('019 C-007: o filtro "Com projeção manual" mostra só o produto com ajuste valendo (não o vencido nem o removido), sem consulta', () => {
  const linhas = montar(
    [medida(), medida({ CODPROD: 5402 }), medida({ CODPROD: 5403 })],
    new Map([
      [5401, ajuste()],
      [5402, ajuste({ codprod: 5402, validaAte: '2026-11-02' })],
      [5403, ajuste({ codprod: 5403, percentual: 0, validaAte: '' })],
    ]),
  );
  assert.deepEqual(filtrarMovimentacao(linhas, 'projecao').map((l) => Number(l.medida.CODPROD)), [5401]);
  assert.equal(filtrarMovimentacao(linhas, '').length, 3);
});

test('019 RF-009: o CSV traz o percentual valendo na última coluna, vazio sem ajuste', () => {
  const [com, sem] = montar([medida(), medida({ CODPROD: 5402 })], new Map([[5401, ajuste()]]));
  assert.equal(COLUNAS_CSV[COLUNAS_CSV.length - 1], 'Projeção manual');
  assert.equal(linhaCsv(com).at(-1), '+20 %');
  assert.equal(linhaCsv(sem).at(-1), '');
  assert.equal(linhaCsv(com).length, COLUNAS_CSV.length);
});
