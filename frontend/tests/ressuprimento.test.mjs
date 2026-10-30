// Regra pura da spec 011 (src/lib/ressuprimento.ts): a fórmula de
// ressuprimento, a precedência dos parâmetros, o status, o silenciamento, o
// agrupamento do carrinho, a aderência e as colunas do CSV.
//
// A tabela de casos numéricos do plan (20 linhas) é o coração deste arquivo:
// consumo 2,0/dia, lead 9, cobertura 35, gatilho 15 e caixa 12 dão segurança
// 18, ponto 36 e máximo 70; cada teste muda UMA entrada.
//
// R-111: nenhum import de `lib/cobertura.ts`. O alvo por curva entra por
// injeção — aqui, um stub de três linhas.
//
// Uso: cd frontend && npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { arredondarPorCaixa } from '../src/lib/compras.ts';
import { textoCsv } from '../src/lib/csv.ts';
import {
  COLUNAS_CSV, aComprar, aderenteASugestao, agruparCarrinho, calcularRessuprimento,
  coberturaFuturaComCompra, dataDeSilencio, estaSilenciado, itemDoCarrinho, linhaCsv,
  montarRessuprimento, motivoDaSugestao, resolverParametros,
} from '../src/lib/ressuprimento.ts';

/** Uma medida de `sgcWintRessuprimento`, com o caso base do plan. */
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

/** Os parâmetros do caso base, já resolvidos. */
const BASE = {
  coberturaDias: 35, leadTimeDias: 9, gatilhoDias: 15,
  origemCobertura: 'curva', origemLeadTime: 'padrao',
};

const calcular = (m, parametros = BASE, opcoes = {}) => calcularRessuprimento(
  m, parametros, { unidadesPorCaixa: 12, desconsiderarLicitacao: false, ...opcoes },
);

/** As três grandezas + sugestão + cobertura + gatilho + status, numa asserção só. */
const foto = (r) => ({
  estoqueSeguranca: r.estoqueSeguranca,
  pontoDePedido: r.pontoDePedido,
  estoqueMaximo: r.estoqueMaximo,
  sugerida: r.sugerida,
  coberturaAtualDias: r.coberturaAtualDias,
  diasDeGatilho: r.diasDeGatilho,
  status: r.status,
});

/** Stub de três linhas (R-111): o alvo por curva que a 012 dará na tela. */
const ALVO_STUB = { A: 20, B: 35, C: 50 };
const alvoStub = (_alvo, curva) => ALVO_STUB[curva];
/** O mesmo alvo nas três curvas, onde o caso sob teste não é a curva. */
const alvoPadrao = () => 35;

const parametro = (codprod, extra = {}) => ({
  codprod, coberturaDias: 0, leadTimeDias: 0, gatilhoDias: 0,
  silenciadoAte: '', motivoSilencio: '', ...extra,
});

/* ── T-089 — linhas 1 a 7 da tabela de casos numéricos ────────────────── */

test('C-002: disponível 50 e nada em trânsito é adequado, sugere 24 (2 caixas de 12), cobre 25 dias e tem gatilho em 7', () => {
  assert.deepEqual(foto(calcular(medida())), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 24, coberturaAtualDias: 25, diasDeGatilho: 7, status: 'adequado',
  });
});

test('C-003: disponível 0 é ruptura, sugere 72 (6 caixas) e o gatilho já passou há 18 dias', () => {
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 0 }))), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 72, coberturaAtualDias: 0, diasDeGatilho: -18, status: 'ruptura',
  });
});

test('C-004: disponível 100 passa do máximo de 70 — excesso, sugestão 0 e cobertura de 50 dias', () => {
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 100 }))), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 0, coberturaAtualDias: 50, diasDeGatilho: 32, status: 'excesso',
  });
});

test('C-005: disponível 30 está abaixo do ponto de pedido, mas os 15 dias de cobertura passam do lead de 9 — baixa exposição, sugere 48', () => {
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 30 }))), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 48, coberturaAtualDias: 15, diasDeGatilho: -3, status: 'baixa_exposicao',
  });
});

test('C-006: disponível 10 cobre 5 dias e não alcança os 9 de lead — elevada exposição, sugere 60', () => {
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 10 }))), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 60, coberturaAtualDias: 5, diasDeGatilho: -13, status: 'elevada_exposicao',
  });
});

test('C-007: com 20 em trânsito a sugestão é 0 — o que já está a caminho não se compra de novo —, e a situação continua baixa exposição', () => {
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 30, QT_TRANSITO: 20, ESTOQUE_EM_TRANSITO: 20 }))), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 0, coberturaAtualDias: 15, diasDeGatilho: 7, status: 'baixa_exposicao',
  });
});

test('C-025: sem giro nenhum (consumo 0) com 40 em estoque é excesso, sugestão 0, e cobertura e gatilho NÃO existem — null, nunca 9999', () => {
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 40, VENDA_PERIODO: 0, CONSUMO_DIARIO: 0 }))), {
    estoqueSeguranca: 0, pontoDePedido: 0, estoqueMaximo: 0,
    sugerida: 0, coberturaAtualDias: null, diasDeGatilho: null, status: 'excesso',
  });
});

/* ── T-090 — lead medido, precedência e alvo por curva (linhas 8 a 14) ── */

test('C-009 (tela): lead medido 5 baixa a segurança para 10 e o ponto para 20 — o produto vira adequado com gatilho 5; sem medida, os 9 do padrão o deixam em baixa exposição com gatilho −3', () => {
  const comMedida = resolverParametros(null, null, 5, 35);
  assert.equal(comMedida.leadTimeDias, 5);
  assert.equal(comMedida.origemLeadTime, 'medido');
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 30 }), comMedida)), {
    estoqueSeguranca: 10, pontoDePedido: 20, estoqueMaximo: 70,
    sugerida: 48, coberturaAtualDias: 15, diasDeGatilho: 5, status: 'adequado',
  });

  const semMedida = resolverParametros(null, null, 0, 35);
  assert.equal(semMedida.leadTimeDias, 9);
  assert.equal(semMedida.origemLeadTime, 'padrao');
  assert.deepEqual(foto(calcular(medida({ ESTOQUE_ATUAL: 30 }), semMedida)), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 48, coberturaAtualDias: 15, diasDeGatilho: -3, status: 'baixa_exposicao',
  });
});

test('C-010: a cobertura de 20 dias parametrizada no fornecedor vale para todos os produtos dele — o máximo cai para 40 e o produto com 50 em estoque vira excesso', () => {
  const [linha] = montarRessuprimento(
    [medida()], [parametro(0, { coberturaDias: 20 })], alvoStub, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
  );
  assert.equal(linha.parametros.origemCobertura, 'fornecedor');
  assert.deepEqual(foto(linha), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 40,
    sugerida: 0, coberturaAtualDias: 25, diasDeGatilho: 7, status: 'excesso',
  });
});

test('C-011: o parâmetro do SKU vence o do fornecedor — máximo 90 e sugestão 48 no 5401, enquanto o 5402 do mesmo fornecedor continua com máximo 40', () => {
  const linhas = montarRessuprimento(
    [medida(), medida({ CODPROD: 5402, DESCRICAO: 'BARRA DE PROTEINA CACAU 45 G' })],
    [parametro(0, { coberturaDias: 20 }), parametro(5401, { coberturaDias: 45 })],
    alvoStub, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
  );
  const doSku = linhas.find((l) => l.medida.CODPROD === 5401);
  const semSku = linhas.find((l) => l.medida.CODPROD === 5402);
  assert.equal(doSku.parametros.origemCobertura, 'sku');
  assert.equal(doSku.estoqueMaximo, 90);
  assert.equal(doSku.sugerida, 48);
  assert.equal(semSku.parametros.origemCobertura, 'fornecedor');
  assert.equal(semSku.estoqueMaximo, 40);
  assert.equal(semSku.sugerida, 0);
});

test('C-016: sem parâmetro nenhum, o estoque máximo usa o ALVO da curva (35/45/60 → 70/90/120), nunca o teto que dispensa justificativa; sem regra alcançável, 35', () => {
  const alvoPorCurva = { A: 35, B: 45, C: 60 };
  const esperado = { A: [70, 24], B: [90, 48], C: [120, 72] };
  for (const [curva, [maximo, sugerida]] of Object.entries(esperado)) {
    const [linha] = montarRessuprimento(
      [medida()], [], () => alvoPorCurva[curva], new Map(),
      { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
    );
    assert.equal(linha.parametros.origemCobertura, 'curva', `curva ${curva}`);
    assert.equal(linha.estoqueMaximo, maximo, `máximo da curva ${curva}`);
    assert.equal(linha.sugerida, sugerida, `sugestão da curva ${curva}`);
  }
  // Sem linha alcançável a injeção devolve 0: a régua cai no padrão de 35 dias.
  const [semRegra] = montarRessuprimento(
    [medida()], [], () => 0, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
  );
  assert.equal(semRegra.coberturaDias, 35);
});

test('RN-003: lead time por precedência — SKU 45, fornecedor 20, medido 5, padrão 9', () => {
  const sku = parametro(5401, { leadTimeDias: 45 });
  const forn = parametro(0, { leadTimeDias: 20 });
  assert.equal(resolverParametros(sku, forn, 5, 35).leadTimeDias, 45);
  assert.equal(resolverParametros(null, forn, 5, 35).leadTimeDias, 20);
  assert.equal(resolverParametros(null, null, 5, 35).leadTimeDias, 5);
  assert.equal(resolverParametros(null, null, 0, 35).leadTimeDias, 9);
  // Entrega no mesmo dia da emissão não é lead zero: é 1 (mínimo de RN-003).
  assert.equal(resolverParametros(null, null, 0.4, 35).leadTimeDias, 1);
});

test('RN-004: cobertura por precedência — SKU 45, fornecedor 20, alvo da curva 35', () => {
  const sku = parametro(5401, { coberturaDias: 45 });
  const forn = parametro(0, { coberturaDias: 20 });
  assert.equal(resolverParametros(sku, forn, 0, 35).coberturaDias, 45);
  assert.equal(resolverParametros(null, forn, 0, 35).coberturaDias, 20);
  assert.equal(resolverParametros(null, null, 0, 35).coberturaDias, 35);
  assert.equal(resolverParametros(null, null, 0, 0).coberturaDias, 35, 'sem alvo alcançável, o padrão');
});

test('RN-005 / RF-015: gatilho por precedência (SKU 5, fornecedor 10, padrão 15) e urgência — gatilho 7 contra parâmetro 15 é urgente, 32 não é', () => {
  const sku = parametro(5401, { gatilhoDias: 5 });
  const forn = parametro(0, { gatilhoDias: 10 });
  assert.equal(resolverParametros(sku, forn, 0, 35).gatilhoDias, 5);
  assert.equal(resolverParametros(null, forn, 0, 35).gatilhoDias, 10);
  assert.equal(resolverParametros(null, null, 0, 35).gatilhoDias, 15);

  assert.equal(calcular(medida()).diasDeGatilho, 7);
  assert.equal(calcular(medida()).urgente, true, 'gatilho 7 <= parâmetro 15');
  const folgado = calcular(medida({ ESTOQUE_ATUAL: 100 }));
  assert.equal(folgado.diasDeGatilho, 32);
  assert.equal(folgado.urgente, false, 'gatilho 32 > parâmetro 15');
});

/* ── T-091 — licitação, as três grandezas, sugestão, gatilho e a ordem ── */

test('C-014: com a venda pública dentro, consumo 2,0 dá máximo 70, sugestão 48 e baixa exposição; desconsiderando a licitação, consumo 1,5 dá máximo 52,5, sugestão 24 e adequado', () => {
  const m = medida({ ESTOQUE_ATUAL: 30, CONSUMO_DIARIO: 2, CONSUMO_DIARIO_PUBLICO: 0.5, VENDA_PERIODO: 306, VENDA_PUBLICA: 76.5 });
  assert.deepEqual(foto(calcular(m)), {
    estoqueSeguranca: 18, pontoDePedido: 36, estoqueMaximo: 70,
    sugerida: 48, coberturaAtualDias: 15, diasDeGatilho: -3, status: 'baixa_exposicao',
  });
  assert.deepEqual(foto(calcular(m, BASE, { desconsiderarLicitacao: true })), {
    estoqueSeguranca: 13.5, pontoDePedido: 27, estoqueMaximo: 52.5,
    sugerida: 24, coberturaAtualDias: 20, diasDeGatilho: 2, status: 'adequado',
  });
});

test('RN-011 (tela): o seletor subtrai a parte pública do consumo e nunca deixa o consumo negativo', () => {
  const m = medida({ CONSUMO_DIARIO: 2, CONSUMO_DIARIO_PUBLICO: 0.5 });
  assert.equal(calcular(m).consumoDiario, 2);
  assert.equal(calcular(m, BASE, { desconsiderarLicitacao: true }).consumoDiario, 1.5);
  const sujo = medida({ CONSUMO_DIARIO: 1, CONSUMO_DIARIO_PUBLICO: 4 });
  assert.equal(calcular(sujo, BASE, { desconsiderarLicitacao: true }).consumoDiario, 0);
});

test('RN-006: segurança = lead × consumo, ponto = 2 × lead × consumo e máximo = cobertura × consumo — com consumo 0, as três são 0', () => {
  const r = calcular(medida());
  assert.deepEqual([r.estoqueSeguranca, r.pontoDePedido, r.estoqueMaximo], [18, 36, 70]);
  const parado = calcular(medida({ CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }));
  assert.deepEqual([parado.estoqueSeguranca, parado.pontoDePedido, parado.estoqueMaximo], [0, 0, 0]);
});

test('RN-007: a sugestão é o que falta para o máximo, em caixas cheias; com trânsito é 0, sem giro é 0, com estoque acima do máximo é 0, e com caixa 1 são 20 unidades', () => {
  assert.equal(calcular(medida()).sugerida, 24);
  assert.equal(calcular(medida({ QT_TRANSITO: 20, ESTOQUE_EM_TRANSITO: 20 })).sugerida, 0);
  assert.equal(calcular(medida({ VENDA_PERIODO: 0, CONSUMO_DIARIO: 0 })).sugerida, 0);
  assert.equal(calcular(medida(), { ...BASE, coberturaDias: 5 }).sugerida, 0, 'máximo 10 com 50 em estoque não compra');
  assert.equal(calcular(medida(), BASE, { unidadesPorCaixa: 1 }).sugerida, 20);
});

test('RN-008: cobertura atual = disponível ÷ consumo e gatilho = parte inteira de (disponível + trânsito − segurança) ÷ consumo − lead; sem consumo, as duas são null', () => {
  const r = calcular(medida());
  assert.equal(r.coberturaAtualDias, 25);
  assert.equal(r.diasDeGatilho, 7);
  const parado = calcular(medida({ CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }));
  assert.equal(parado.coberturaAtualDias, null);
  assert.equal(parado.diasDeGatilho, null);
});

test('RN-009: a ordem de avaliação é a regra — disponível 0 com máximo 0 é ruptura (não excesso) e disponível 10 com cobertura 5 abaixo do lead 9 é elevada exposição (não baixa)', () => {
  const rompido = calcular(medida({ ESTOQUE_ATUAL: 0, CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }));
  assert.equal(rompido.estoqueMaximo, 0);
  assert.equal(rompido.status, 'ruptura');
  assert.equal(calcular(medida({ ESTOQUE_ATUAL: 10 })).status, 'elevada_exposicao');
  assert.equal(calcular(medida({ ESTOQUE_ATUAL: 30 })).status, 'baixa_exposicao');
});

/* ── T-092 — curva, arredondamento e aderência ───────────────────────── */

test('C-015: a curva é a régua única da 003 sobre a janela da tela — valores 500, 250, 150, 70 e 30 dão A, A, B, C, C', () => {
  const medidas = [
    medida({ CODPROD: 5410, VENDA_PERIODO: 50, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 5411, VENDA_PERIODO: 25, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 5412, VENDA_PERIODO: 15, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 5413, VENDA_PERIODO: 7, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 5414, VENDA_PERIODO: 3, CUSTO_ULT_ENTRADA: 10 }),
  ];
  const linhas = montarRessuprimento(medidas, [], alvoStub, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false });
  assert.deepEqual(linhas.map((l) => l.curva), ['A', 'A', 'B', 'C', 'C']);
});

test('RN-010: lista vazia não produz linha nenhuma; com todos os custos zerados, todos caem em C', () => {
  assert.deepEqual(montarRessuprimento([], [], alvoStub, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false }), []);
  const semValor = montarRessuprimento(
    [medida({ CODPROD: 5410, CUSTO_ULT_ENTRADA: 0 }), medida({ CODPROD: 5411, CUSTO_ULT_ENTRADA: 0 })],
    [], alvoStub, new Map(), { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
  );
  assert.deepEqual(semValor.map((l) => l.curva), ['C', 'C']);
});

test('C-017: a quantidade digitada sobe para a caixa cheia — 50 vira 60, 48 continua 48 e 0 continua 0', () => {
  assert.equal(arredondarPorCaixa(50, 12), 60);
  assert.equal(arredondarPorCaixa(48, 12), 48);
  assert.equal(arredondarPorCaixa(0, 12), 0);
});

test('RN-018 / C-022 (tela): a aderência é a faixa de ±20 % sobre a sugerida — 100, 80 e 120 aderem; 79 e 121 não; sugerida 0 nunca adere, e 5 itens com 3 aderentes dão 60 %', () => {
  assert.equal(aderenteASugestao(100, 100), true);
  assert.equal(aderenteASugestao(100, 80), true);
  assert.equal(aderenteASugestao(100, 120), true);
  assert.equal(aderenteASugestao(100, 79), false);
  assert.equal(aderenteASugestao(100, 121), false);
  assert.equal(aderenteASugestao(0, 10), false);

  const pedidas = [100, 80, 120, 79, 121];
  const aderentes = pedidas.filter((q) => aderenteASugestao(100, q)).length;
  assert.equal(Math.round((100 * aderentes) / pedidas.length), 60);
});

/* ── T-093 — silenciamento, carrinho e CSV ───────────────────────────── */

test('C-012 (tela): o produto silenciado sai da aba "a comprar" e continua na lista, marcado; restaurado, volta à fila', () => {
  const medidas = [medida(), medida({ CODPROD: 5402, DESCRICAO: 'BARRA DE PROTEINA CACAU 45 G' })];
  const hoje = '2026-09-16';
  const silenciado = montarRessuprimento(
    medidas,
    [parametro(5401, { silenciadoAte: '2026-10-16', motivoSilencio: 'Indústria sem entrega até o mês que vem' })],
    alvoPadrao, new Map(), { codfornec: 1042, hoje, desconsiderarLicitacao: false },
  );
  assert.equal(silenciado.length, 2, 'silenciar não tira o produto da lista');
  const linha5401 = silenciado.find((l) => l.medida.CODPROD === 5401);
  assert.equal(linha5401.silenciado, true);
  assert.equal(linha5401.motivoSilencio, 'Indústria sem entrega até o mês que vem');
  assert.deepEqual(aComprar(silenciado).map((l) => l.medida.CODPROD), [5402]);

  const restaurado = montarRessuprimento(medidas, [parametro(5401)], alvoPadrao, new Map(),
    { codfornec: 1042, hoje, desconsiderarLicitacao: false });
  assert.deepEqual(aComprar(restaurado).map((l) => l.medida.CODPROD).sort(), [5401, 5402]);
});

test('RN-013: silenciado até amanhã com hoje continua silenciado, até ontem não, e data vazia nunca silencia; o padrão são 30 dias', () => {
  assert.equal(estaSilenciado('2026-09-17', '2026-09-16'), true);
  assert.equal(estaSilenciado('2026-09-15', '2026-09-16'), false);
  assert.equal(estaSilenciado('', '2026-09-16'), false);
  assert.equal(dataDeSilencio('2026-09-16'), '2026-10-16');
});

test('RN-015 / R-112: o carrinho agrupa por fornecedor e filial, sobe a prioridade com ruptura no grupo, soma o total e cada item nasce como o ItemPedido INTEIRO', () => {
  const emRuptura = montarRessuprimento([medida({ CODPROD: 5403, ESTOQUE_ATUAL: 0 })], [], alvoPadrao, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false })[0];
  const normais = montarRessuprimento(
    [medida({ CODPROD: 5401 }), medida({ CODPROD: 5402 })], [], alvoPadrao, new Map(),
    { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
  );
  const doFornecedor = (linha, quantidade, codfilial = '1') => ({
    linha, quantidade, codfornec: 1042, codfilial, fornecedor: 'Nestlé', filial: 'Benenutri Matriz',
  });

  const [grupo] = agruparCarrinho([
    doFornecedor(normais[0], 24), doFornecedor(normais[1], 12), doFornecedor(emRuptura, 72),
  ]);
  assert.equal(grupo.prioridade, 'alta', 'um item em ruptura sobe o grupo inteiro');
  assert.equal(grupo.itens.length, 3);
  assert.equal(grupo.total, (24 + 12 + 72) * 10);

  const [semRuptura] = agruparCarrinho([doFornecedor(normais[0], 24), doFornecedor(normais[1], 12)]);
  assert.equal(semRuptura.prioridade, 'normal');

  const duasFiliais = agruparCarrinho([doFornecedor(normais[0], 24), doFornecedor(normais[1], 12, '2')]);
  assert.equal(duasFiliais.length, 2, 'um pedido por fornecedor E filial');

  // R-112: campo que nascer vazio fica vazio para sempre (a remontagem da
  // Análise preserva o item existente) — nenhum campo em branco aqui.
  const item = itemDoCarrinho(normais[0], 24, 42);
  assert.equal(item.descricao, 'WHEY CONCENTRADO MORANGO 900 G');
  assert.equal(item.embalagem, 'CX 12');
  assert.equal(item.unidade, 'UN');
  assert.equal(item.codepto, 2);
  assert.equal(item.codsec, 21);
  assert.equal(item.unPorCaixa, 12);
  assert.equal(item.qtVendaTotal, 306);
  assert.equal(item.qtEstoque, 50);
  assert.equal(item.qtSugerida, 24);
  assert.equal(item.qtPedida, 24);
  assert.equal(item.precoCusto, 10);
  assert.equal(item.curvaAbc, 'A', 'a curva da linha viaja com o item (R-112)');
  assert.equal(item.coberturaLimite, 42, 'COBERTURA_LIMITE zerado deixaria a trava da 003 cega');
  assert.equal(item.coberturaDias, 37, '(50 + 0 + 24) / 2 dias de cobertura futura');
  assert.equal(item.status, 'montagem');
  assert.equal(coberturaFuturaComCompra(normais[0], 24), 37);
  assert.equal(coberturaFuturaComCompra(
    montarRessuprimento([medida({ CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 })], [], alvoPadrao, new Map(),
      { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false })[0], 24,
  ), null, 'sem consumo não há cobertura futura');
  assert.match(motivoDaSugestao(emRuptura), /^Ruptura/);
});

test('C-024: a exportação leva as 10 colunas da tela e 3 linhas, separadas por ponto e vírgula, com as aspas da descrição escapadas', () => {
  assert.equal(COLUNAS_CSV.length, 10);
  const linhas = montarRessuprimento(
    [
      medida({ CODPROD: 5401, DESCRICAO: 'WHEY 900 G "ZERO"' }),
      medida({ CODPROD: 5402, ESTOQUE_ATUAL: 0 }),
      medida({ CODPROD: 5403, CONSUMO_DIARIO: 0, VENDA_PERIODO: 0 }),
    ],
    [], alvoPadrao, new Map(), { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false },
  );
  const texto = textoCsv(COLUNAS_CSV, linhas.map(linhaCsv));
  const partes = texto.split('\r\n');
  assert.equal(partes.length, 4);
  assert.equal(partes[0].split(';').length, 10);
  assert.match(partes[1], /"WHEY 900 G ""ZERO"" \(5401\)"/);
  assert.match(partes[3], /sem giro/, 'produto sem giro não inventa número no CSV');
});

/* ── Layout legado (R-117): visões, completar compra, ordem, movimentação, nível, referência ── */

import {
  completarCompra, contarVisoes, filtrarMovimentacao, linhasDaVisao, nivelDeCobertura, ordenarLinhas,
  quantidadeParaCompletar, textoDaSugestao,
} from '../src/lib/ressuprimento.ts';

/** O parâmetro do fornecedor que fixa cobertura 35, lead 9 e gatilho 15, qualquer que seja a curva. */
const PARAMETRO_FIXO = [{ codprod: 0, coberturaDias: 35, leadTimeDias: 9, gatilhoDias: 15, silenciadoAte: '', motivoSilencio: '' }];
const montar = (medidas) => montarRessuprimento(medidas, PARAMETRO_FIXO, alvoStub, new Map(), {
  codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false,
});

test('C-026 / C-027 / RN-020: as quatro visões contam o que mostram — disponível 20 está a comprar; 75 (cobertura 37,5 d, dentro de alvo 35 + lead 9) completa a compra com uma caixa; 200 não completa (cobertura 100 d); e 30 com 20 em trânsito só aparece em trânsito', () => {
  const linhas = montar([
    medida({ CODPROD: 1, DESCRICAO: 'A COMPRAR', ESTOQUE_ATUAL: 20 }),
    medida({ CODPROD: 2, DESCRICAO: 'COMPLETAR', ESTOQUE_ATUAL: 75 }),
    medida({ CODPROD: 3, DESCRICAO: 'SOBRANDO', ESTOQUE_ATUAL: 200 }),
    medida({ CODPROD: 4, DESCRICAO: 'A CAMINHO', ESTOQUE_ATUAL: 30, ESTOQUE_EM_TRANSITO: 20 }),
  ]);
  assert.deepEqual(contarVisoes(linhas), { comprar: 1, completar: 1, todos: 4, transito: 1 });
  assert.deepEqual(completarCompra(linhas).map((l) => l.medida.CODPROD), [2]);
  assert.deepEqual(linhasDaVisao(linhas, 'comprar').map((l) => l.medida.CODPROD), [1]);
  assert.deepEqual(linhasDaVisao(linhas, 'transito').map((l) => l.medida.CODPROD), [4]);
  assert.equal(linhasDaVisao(linhas, 'todos').length, 4);
  assert.equal(quantidadeParaCompletar(completarCompra(linhas)[0]), 12, 'uma caixa de 12');
  const avulso = montar([medida({ CODPROD: 5, EMBALAGEM: 'FRASCO 100 ML', UN_POR_CAIXA_ERP: 0, ESTOQUE_ATUAL: 75 })]);
  assert.equal(quantidadeParaCompletar(avulso[0]), 1, 'avulso completa com 1 unidade');
});

test('RN-020: silenciado, sem giro e com trânsito nunca entram em "completar compra", e a ordem é da menor cobertura para a maior', () => {
  const linhas = montarRessuprimento([
    medida({ CODPROD: 1, DESCRICAO: 'B', ESTOQUE_ATUAL: 80 }),
    medida({ CODPROD: 2, DESCRICAO: 'A', ESTOQUE_ATUAL: 72 }),
    medida({ CODPROD: 3, DESCRICAO: 'SILENCIADO', ESTOQUE_ATUAL: 72 }),
    medida({ CODPROD: 4, DESCRICAO: 'SEM GIRO', ESTOQUE_ATUAL: 40, VENDA_PERIODO: 0, CONSUMO_DIARIO: 0 }),
    medida({ CODPROD: 5, DESCRICAO: 'TRANSITO', ESTOQUE_ATUAL: 72, ESTOQUE_EM_TRANSITO: 5 }),
  ], [...PARAMETRO_FIXO, { codprod: 3, coberturaDias: 0, leadTimeDias: 0, gatilhoDias: 0, silenciadoAte: '2026-10-16', motivoSilencio: 'indústria' }],
  alvoStub, new Map(), { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false });
  assert.deepEqual(completarCompra(linhas).map((l) => l.medida.CODPROD), [2, 1]);
});

test('C-038: ordenar por código, nome e curva, e os filtros de movimentação, sem nenhuma consulta', () => {
  const linhas = montar([
    medida({ CODPROD: 30, DESCRICAO: 'ZINCO', ESTOQUE_ATUAL: 0, VENDA_PERIODO: 500, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 10, DESCRICAO: 'ALBUMINA', ESTOQUE_ATUAL: 50, VENDA_PERIODO: 0, CONSUMO_DIARIO: 0 }),
    medida({ CODPROD: 20, DESCRICAO: 'MAGNESIO', ESTOQUE_ATUAL: 30, ESTOQUE_EM_TRANSITO: 20, VENDA_PERIODO: 30, CUSTO_ULT_ENTRADA: 1 }),
  ]);
  assert.deepEqual(ordenarLinhas(linhas, 'codigo').map((l) => l.medida.CODPROD), [10, 20, 30]);
  assert.deepEqual(ordenarLinhas(linhas, 'nome').map((l) => l.medida.DESCRICAO), ['ALBUMINA', 'MAGNESIO', 'ZINCO']);
  // A régua da curva é a de C-015 (500 / 250 / 150 → A, B, C): a ordem por curva é A, B, C.
  const porCurva = ordenarLinhas(montar([
    medida({ CODPROD: 3, DESCRICAO: 'C', VENDA_PERIODO: 15, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 1, DESCRICAO: 'A', VENDA_PERIODO: 50, CUSTO_ULT_ENTRADA: 10 }),
    medida({ CODPROD: 2, DESCRICAO: 'B', VENDA_PERIODO: 25, CUSTO_ULT_ENTRADA: 10 }),
  ]), 'curva');
  assert.deepEqual(porCurva.map((l) => `${l.curva}${l.medida.CODPROD}`), ['A1', 'B2', 'C3']);
  assert.deepEqual(ordenarLinhas(linhas, 'padrao').map((l) => l.medida.CODPROD), [30, 10, 20], 'padrão mantém a ordem recebida');
  assert.deepEqual(filtrarMovimentacao(linhas, 'com_venda').map((l) => l.medida.CODPROD), [30, 20]);
  assert.deepEqual(filtrarMovimentacao(linhas, 'sem_venda').map((l) => l.medida.CODPROD), [10]);
  assert.deepEqual(filtrarMovimentacao(linhas, 'com_estoque').map((l) => l.medida.CODPROD), [10, 20]);
  assert.deepEqual(filtrarMovimentacao(linhas, 'sem_estoque').map((l) => l.medida.CODPROD), [30]);
  assert.deepEqual(filtrarMovimentacao(linhas, 'com_transito').map((l) => l.medida.CODPROD), [20]);
  assert.equal(filtrarMovimentacao(linhas, '').length, 3);
});

test('C-031: o nível de cobertura é disponível ÷ máximo — 50 de 70 dá 71,4 %; sem máximo (sem giro) não existe', () => {
  assert.equal(Math.round(nivelDeCobertura({ estoqueAtual: 50, estoqueMaximo: 70 }) * 10) / 10, 71.4);
  assert.equal(nivelDeCobertura({ estoqueAtual: 40, estoqueMaximo: 0 }), null);
});

test('C-037: a referência Unidades/Caixas só muda o texto da sugestão — 48 com caixa de 12 é "48 un. · 4 cx" ou "4 cx · 48 un."; avulso é só unidades', () => {
  assert.equal(textoDaSugestao(48, 12, 'unidades'), '48 un. · 4 cx');
  assert.equal(textoDaSugestao(48, 12, 'caixas'), '4 cx · 48 un.');
  assert.equal(textoDaSugestao(48, 1, 'caixas'), '48 un.');
});

test('R-120: o mapa do Gestão de Custos chega à regra — produto com 6 na gestão e "CX 12" na embalagem fica com caixa 6 (origem gestão) e a sugestão sobe em múltiplos de 6; sem o mapa, 12 pela embalagem', () => {
  const m = medida({ ESTOQUE_ATUAL: 50, EMBALAGEM: 'CX 12', UN_POR_CAIXA_ERP: 0 });
  const opcoes = { codfornec: 1042, hoje: '2026-09-16', desconsiderarLicitacao: false };
  const [comGestao] = montarRessuprimento([m], PARAMETRO_FIXO, alvoStub, new Map([[5401, 6]]), opcoes);
  assert.equal(comGestao.unidadesPorCaixa, 6);
  assert.equal(comGestao.origemCaixa, 'gestao');
  assert.equal(comGestao.sugerida, 24, '70 − 50 = 20 → 4 caixas de 6');
  const [semGestao] = montarRessuprimento([m], PARAMETRO_FIXO, alvoStub, new Map(), opcoes);
  assert.equal(semGestao.unidadesPorCaixa, 12);
  assert.equal(semGestao.origemCaixa, 'embalagem');
  const [doErp] = montarRessuprimento([medida({ ESTOQUE_ATUAL: 50, UN_POR_CAIXA_ERP: 24 })], PARAMETRO_FIXO, alvoStub, new Map(), opcoes);
  assert.equal(doErp.origemCaixa, 'erp');
});
