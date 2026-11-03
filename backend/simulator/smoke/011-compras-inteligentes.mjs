// Cenários e regras da spec 011 (compras inteligentes). Ver
// docs/specs/011-compras-inteligentes/plan.md §Testes.
//
// O que é regra pura de tela (a fórmula, a precedência, o status, a curva, o
// carrinho, o CSV e a aderência) vive em frontend/tests/ressuprimento.test.mjs;
// aqui fica o que só a server function real responde. Toda consulta ao WinThor
// assere contagem > 0 — vazio não é verde.
//
// R-045: nenhuma asserção literal sobre listagem global. Os produtos
// (5401-5420 do fornecedor 1042), os clientes (9301-9305) e os cards
// (CARDS_011) desta spec são próprios, e a eficiência é recortada por
// fornecedor e por comprador.

import { assert } from './base.mjs';
import {
  CARDS_011, FILIAL_011, FILIAL_ENVIADO_011, FORNECEDOR_011, JANELA, JANELA_CURTA, VENDAS_FORA_011, VENDA_ATIPICA, haDias,
} from '../seed/011-compras-inteligentes.mjs';

const FAIXA = [5401, 5402, 5403, 5404, 5405, 5406, 5407, 5408, 5409, 5410,
  5411, 5412, 5413, 5414, 5415, 5416, 5417, 5418, 5419, 5420];

/** As fases em que um pedido ainda bloqueia o carrinho (RN-016). */
const FASES_ABERTAS = ['analise', 'tecnica', 'diretoria', 'envio'];

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;

  /** Linhas de uma server function SQL. */
  const linhas = async (nome, input, userId) => (await chamar(nome, input, userId)).rows ?? [];

  /** A consulta principal, na janela da tela; `excluir` é fragmento. */
  const ressuprimento = (extra = {}) => linhas('sgcWintRessuprimento', {
    codfornec: FORNECEDOR_011, codfilial: FILIAL_011, ...JANELA, excluir: '0', ...extra,
  });

  const daFaixa = (rows) => rows.filter((r) => FAIXA.includes(Number(r.CODPROD)));
  const produto = (rows, codprod) => rows.find((r) => Number(r.CODPROD) === codprod);
  // A fase sempre pela CHAVE estavel de SGC_FASE, nunca pelo id nem pelo nome.
  const faseId = (chave) => Number(db.prepare('SELECT FASE_ID AS ID FROM SGC_FASE WHERE CHAVE = ?').get(chave).ID);
  const emFase = (cardId, chave) => db.prepare('UPDATE KB_CARD SET FASE_ID = ? WHERE ID = ?').run(faseId(chave), cardId);

  /* ── T-080 — o recorte do ERP ────────────────────────────────────────── */

  await teste('C-001 / RN-014: sgcWintRessuprimento (1042 / filial 1 / janela de 153 dias) devolve a lista inteira numa consulta so — 18 dos 20 produtos da faixa desta spec, sem o inativo (5419) e sem o do departamento 4 (5420), e nenhuma linha de departamento 4 ou 7', async () => {
    const rows = await ressuprimento();
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.equal(daFaixa(rows).length, 18, 'os 20 produtos da spec menos o inativo e o do departamento 4');
    assert.equal(rows.filter((r) => [4, 7].includes(Number(r.CODEPTO))).length, 0);
    assert.equal(rows.filter((r) => [5419, 5420].includes(Number(r.CODPROD))).length, 0);
    // Cada linha traz a medida inteira: nenhuma consulta a mais por produto.
    const p5403 = produto(rows, 5403);
    assert.equal(Number(p5403.CUSTO_ULT_ENTRADA), 10);
    assert.equal(String(p5403.EMBALAGEM), 'CX 12');
    assert.ok(String(p5403.DT_ULT_ENTRADA).length === 10, 'a data da ultima entrada vem formatada');
  });

  await teste('RN-014: a devolucao de 5 unidades do 5410 (QT negativa, dentro da janela) NAO desconta demanda — VENDA_PERIODO continua 50, a soma so das saidas positivas', async () => {
    const rows = await ressuprimento();
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.equal(Number(produto(rows, 5410).VENDA_PERIODO), 50);
  });

  /* ── T-081 — consumo ponderado por recência ──────────────────────────── */

  await teste('C-008 / RN-001: na janela de 2 dias (ontem e hoje) os tres produtos vendem 20, mas o consumo diario e 10,0000 (10 + 10), 9,1892 (20 ontem) e 10,8108 (20 hoje) — a venda de ontem vale 85 % da de hoje —, com volatilidade 0, 10 e 10', async () => {
    const rows = await ressuprimento(JANELA_CURTA);
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    const esperado = { 5405: [20, 10, 0], 5406: [20, 9.1892, 10], 5407: [20, 10.8108, 10] };
    for (const [codprod, [venda, consumo, volatilidade]] of Object.entries(esperado)) {
      const linha = produto(rows, Number(codprod));
      assert.equal(Number(linha.VENDA_PERIODO), venda, `venda do ${codprod}`);
      assert.equal(Number(linha.CONSUMO_DIARIO), consumo, `consumo do ${codprod}`);
      assert.equal(Number(linha.VOLATILIDADE_DIARIA), volatilidade, `volatilidade do ${codprod}`);
    }
    // O dia do fim pesa 1 e o anterior 0,85: 18,5 / 1,85 = 10. Um peso 1 em
    // todo dia (o erro silencioso da subtracao de datas no SQLite) daria 10,
    // 10 e 10 — e por isso os tres numeros sao diferentes entre si.
    assert.notEqual(Number(produto(rows, 5406).CONSUMO_DIARIO), Number(produto(rows, 5407).CONSUMO_DIARIO));
  });

  /* ── T-082 — estoque líquido, trânsito e lead time medido ────────────── */

  await teste('RN-002: o estoque considerado e o liquido e nunca fica negativo — 5401 tem 100 no total e 80 disponivel (10 bloqueado, 5 avariado, 5 reservado), 5402 tem 5 com 20 reservado e fica em 0; o transito soma o pedido ao ERP e o efetivo (5404: 3 + 7 = 10)', async () => {
    const rows = await ressuprimento();
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    const p5401 = produto(rows, 5401);
    assert.equal(Number(p5401.ESTOQUE_TOTAL), 100);
    assert.equal(Number(p5401.QT_BLOQUEADA), 10);
    assert.equal(Number(p5401.QT_INDENIZ), 5);
    assert.equal(Number(p5401.QT_RESERV), 5);
    assert.equal(Number(p5401.ESTOQUE_ATUAL), 80);
    assert.equal(Number(produto(rows, 5402).ESTOQUE_ATUAL), 0, 'nunca negativo');
    const p5404 = produto(rows, 5404);
    assert.equal(Number(p5404.QT_PEDIDA_ERP), 3);
    assert.equal(Number(p5404.QT_TRANSITO), 7);
    assert.equal(Number(p5404.ESTOQUE_EM_TRANSITO), 10);
  });

  await teste('C-009 (servidor): o lead time medido sai da media das entradas casadas dos ultimos 12 meses — 5 dias no 5403 (entradas 4 e 6 dias depois da emissao), 1 no 5416 (entrada no MESMO dia, o minimo da regra) e 0 no 5410, que nao tem entrada casada e cai no padrao da tela', async () => {
    const rows = await ressuprimento();
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.equal(Number(produto(rows, 5403).LEAD_TIME_MEDIDO), 5);
    assert.equal(Number(produto(rows, 5416).LEAD_TIME_MEDIDO), 1);
    assert.equal(Number(produto(rows, 5410).LEAD_TIME_MEDIDO), 0, '0 = nao medido, e a tela usa 9');
  });

  /* ── T-083 — venda desconsiderada e licitação ────────────────────────── */

  await teste('C-013 / RN-012: a venda atipica sai da demanda NA ORIGEM — o 5408 vende 90 na janela, desconsiderar a venda de 60 (gravada e RELIDA do banco, D-03) derruba para 30 com consumo menor, e reconsiderar devolve os 90', async () => {
    const antes = await ressuprimento();
    assert.ok(antes.length > 0, 'consulta ao WinThor sem linha nao e verde');
    const consumoAntes = Number(produto(antes, 5408).CONSUMO_DIARIO);
    assert.equal(Number(produto(antes, 5408).VENDA_PERIODO), 90);

    const gravado = await chamar('sgcEscVendaDesconsiderar', {
      numtransitem: VENDA_ATIPICA, codprod: 5408, codfilial: FILIAL_011,
      dtmov: JANELA.dataFim, quantidade: 60, motivo: 'Cliente de evento, nao se repete',
      em: `${JANELA.dataFim}T09:00:00`,
    }, U.ana);
    assert.ok(gravado, 'a escrita guardada devolve linhas, nunca erro');

    // O {{excluir}} e montado do que VOLTOU do banco, nunca do que a tela achou
    // que gravou: escrita guardada recusada devolve 0 linhas e nenhum erro.
    const desconsideradas = await linhas('sgcVendasDesconsideradasListar', {
      codfilial: FILIAL_011, codprod: 0, limite: 500, offset: 0,
    }, U.ana);
    const minhas = desconsideradas.filter((l) => Number(l.NUMTRANSITEM) === VENDA_ATIPICA);
    assert.equal(minhas.length, 1);
    assert.equal(String(minhas[0].MOTIVO), 'Cliente de evento, nao se repete');
    assert.equal(Number(minhas[0].QUANTIDADE), 60);

    const depois = await ressuprimento({ excluir: minhas.map((l) => Number(l.NUMTRANSITEM)).join(', ') });
    assert.ok(depois.length > 0, 'consulta ao WinThor sem linha nao e verde');
    const p5408 = produto(depois, 5408);
    assert.equal(Number(p5408.VENDA_PERIODO), 30);
    assert.equal(Number(p5408.VENDA_PUBLICA), 0, 'a venda excluida nao aparece em NENHUMA coluna de venda');
    assert.ok(Number(p5408.CONSUMO_DIARIO) < consumoAntes, 'o consumo ponderado cai junto');

    await chamar('sgcEscVendaReconsiderar', { numtransitem: VENDA_ATIPICA }, U.ana);
    const relidas = await linhas('sgcVendasDesconsideradasListar', {
      codfilial: FILIAL_011, codprod: 0, limite: 500, offset: 0,
    }, U.ana);
    assert.equal(relidas.filter((l) => Number(l.NUMTRANSITEM) === VENDA_ATIPICA).length, 0);
    const voltou = await ressuprimento();
    assert.equal(Number(produto(voltou, 5408).VENDA_PERIODO), 90);
  });

  await teste('RN-011 (servidor): a venda a orgao publico conta na demanda E aparece a parte — o 5409 vende 18 na janela, sendo 6 publicas, e o consumo publico fica DENTRO do consumo total, para o seletor da tela poder subtrair sem nova consulta', async () => {
    const rows = await ressuprimento();
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    const p5409 = produto(rows, 5409);
    assert.equal(Number(p5409.VENDA_PERIODO), 18);
    assert.equal(Number(p5409.VENDA_PUBLICA), 6);
    assert.ok(Number(p5409.CONSUMO_DIARIO_PUBLICO) > 0);
    assert.ok(Number(p5409.CONSUMO_DIARIO_PUBLICO) < Number(p5409.CONSUMO_DIARIO));
  });

  /* ── T-084 — parâmetros, silenciamento e quem pode ───────────────────── */

  await teste('C-012 / C-023 (servidor): o gestor silencia o SKU com data e motivo e a listagem os devolve; o analista e o comercial nao gravam nada (escrita guardada recusada = 0 linha, sem erro); salvar os tres numeros NAO apaga o silenciamento, e restaurar limpa so a data e o motivo', async () => {
    const chave = { codfornec: FORNECEDOR_011, codfilial: FILIAL_011, codprod: 5418 };
    const ate = '2026-10-16';
    const doSku = async () => (await linhas('sgcParametrosCompraListar', {
      codfornec: FORNECEDOR_011, codfilial: FILIAL_011, limite: 600, offset: 0,
    }, U.gil)).find((l) => Number(l.CODPROD) === 5418);

    // Analista e comercial: nada grava (parametrizar e de admin e gestor).
    await chamar('sgcEscParametroCompraSilenciar', {
      ...chave, silenciadoAte: ate, motivo: 'tentativa do analista', atualizadoEm: `${JANELA.dataFim}T09:00:00`,
    }, U.ana);
    assert.equal(await doSku(), undefined, 'analista nao parametriza');
    await chamar('sgcEscParametroCompraSilenciar', {
      ...chave, silenciadoAte: ate, motivo: 'tentativa do comercial', atualizadoEm: `${JANELA.dataFim}T09:00:00`,
    }, U.leo);
    assert.equal(await doSku(), undefined, 'comercial nao parametriza');

    await chamar('sgcEscParametroCompraSilenciar', {
      ...chave, silenciadoAte: ate, motivo: 'Industria sem entrega ate o mes que vem',
      atualizadoEm: `${JANELA.dataFim}T09:00:00`,
    }, U.gil);
    const silenciado = await doSku();
    assert.ok(silenciado, 'o gestor parametriza');
    assert.equal(String(silenciado.SILENCIADO_ATE), ate);
    assert.equal(String(silenciado.MOTIVO_SILENCIO), 'Industria sem entrega ate o mes que vem');
    assert.equal(Number(silenciado.COBERTURA_DIAS), 0, 'silenciar nao inventa parametro');

    // D-014: as duas escritas tocam colunas disjuntas na MESMA linha.
    await chamar('sgcEscParametroCompraSalvar', {
      ...chave, coberturaDias: 28, leadTimeDias: 12, gatilhoDias: 7,
      atualizadoEm: `${JANELA.dataFim}T09:05:00`,
    }, U.gil);
    const comNumeros = await doSku();
    assert.deepEqual(
      [Number(comNumeros.COBERTURA_DIAS), Number(comNumeros.LEAD_TIME_DIAS), Number(comNumeros.GATILHO_DIAS)],
      [28, 12, 7],
    );
    assert.equal(String(comNumeros.SILENCIADO_ATE), ate, 'salvar nao apaga o silenciamento');

    await chamar('sgcEscParametroCompraRestaurar', {
      ...chave, atualizadoEm: `${JANELA.dataFim}T09:10:00`,
    }, U.gil);
    const restaurado = await doSku();
    assert.equal(String(restaurado.SILENCIADO_ATE), '');
    assert.equal(String(restaurado.MOTIVO_SILENCIO), '');
    assert.equal(Number(restaurado.COBERTURA_DIAS), 28, 'restaurar mexe so no silenciamento');
  });

  /* ── T-085 — o detalhe do SKU ────────────────────────────────────────── */

  await teste('C-021: as tres consultas do detalhe do 5403 devolvem contagem > 0 — historico mensal de no maximo 12 linhas, ao menos 1 compra e ao menos 2 filiais com estoque —, uma execucao cada e so ao abrir', async () => {
    const historico = await linhas('sgcWintProdutoHistorico', { codprod: 5403, codfilial: FILIAL_011, meses: 12 }, U.ana);
    assert.ok(historico.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.ok(historico.length <= 12, `12 meses no maximo, veio ${historico.length}`);
    assert.ok(historico.some((l) => Number(l.ENTRADAS) > 0), 'as entradas do lead medido aparecem no historico');

    const compras = await linhas('sgcWintProdutoUltimasCompras', { codprod: 5403 }, U.ana);
    assert.ok(compras.length > 0, 'consulta ao WinThor sem linha nao e verde');
    assert.ok(compras.length <= 10, 'teto de 10 por ROWNUM');
    assert.ok(Number(compras[0].VALOR_TOTAL) > 0);
    // R-123: a entrada traz o pedido ao ERP casado — emissão (solicitação) e previsão.
    const comPedido = compras.find((c) => Number(c.NUMPED) === 970001);
    assert.ok(comPedido, 'a entrada do 970001 esta nas ultimas compras');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(String(comPedido.DT_SOLICITACAO)), `solicitacao ${comPedido.DT_SOLICITACAO}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(String(comPedido.DT_PREVISAO)), `previsao ${comPedido.DT_PREVISAO}`);
    assert.ok(String(comPedido.DT_PREVISAO) < String(comPedido.DT_ENTRADA), 'o 970001 entrou DEPOIS da previsao (atrasado)');

    const filiais = await linhas('sgcWintProdutoEstoqueFiliais', { codprod: 5403 }, U.ana);
    assert.ok(filiais.length >= 2, `o detalhe mostra o estoque nas outras filiais, veio ${filiais.length}`);
    const f3 = filiais.find((l) => String(l.CODFILIAL) === '3');
    assert.equal(Number(f3.ESTOQUE_TOTAL), 35);
    assert.equal(Number(f3.ESTOQUE_ATUAL), 30, 'o mesmo estoque liquido de R-085 vale nas outras filiais');
  });

  /* ── T-086 — o carrinho vira pedido ──────────────────────────────────── */

  let DO_CARRINHO = 0;

  /* ── layout legado (R-117): resumo por fornecedor, itens em pedido aberto, custo atual ── */

  await teste('C-036 / RN-026: sgcWintResumoFornecedores devolve, para o 1042, os itens ativos do recorte de RN-014 (todos menos o inativo e o do departamento 4) e um valor sugerido ESTIMADO maior que zero numa consulta so, sem depender de filial — o rotulo do seletor antes da escolha', async () => {
    const rows = await linhas('sgcWintResumoFornecedores', {
      codfornecs: String(FORNECEDOR_011), dataInicio: haDias(89), diasPeriodo: 90,
    });
    assert.ok(rows.length > 0, 'consulta ao WinThor sem linha nao e verde');
    const resumo = rows.find((r) => Number(r.CODFORNEC) === FORNECEDOR_011);
    assert.ok(resumo, 'o fornecedor 1042 nao veio');
    // R-045: outras specs tambem semeiam produtos do 1042 — a contagem e relativa
    // ao catalogo do fornecedor, e o que se prova e que os dois do recorte
    // (5419 inativo, 5420 do departamento 4) ficam de fora.
    const catalogo = Number(db.prepare('SELECT COUNT(*) AS N FROM PCPRODUT WHERE CODFORNEC = ?').get(FORNECEDOR_011).N);
    assert.ok(catalogo >= 20);
    assert.equal(Number(resumo.ITENS), catalogo - 2, 'o inativo (5419) e o do departamento 4 (5420) ficam fora');
    // O 5402 vende 18 na janela com disponivel 0: a estimativa e positiva.
    assert.ok(Number(resumo.VALOR_SUGERIDO) > 0, 'a estimativa de sugestao do 1042 e positiva');
  });

  await teste('C-035: sgcItensEmPedidoAberto lista os 5 produtos do pedido do 1042 em analise na filial 1, com o card e a fase pela CHAVE, e nada para a filial 2, cujo pedido ja foi enviado', async () => {
    const abertos = await linhas('sgcItensEmPedidoAberto', {
      codfornec: FORNECEDOR_011, codfilial: FILIAL_011, limite: 500, offset: 0,
    });
    const doCard = abertos.filter((r) => Number(r.ID_CARD) === CARDS_011.eficiencia);
    assert.deepEqual(doCard.map((r) => Number(r.CODPROD)).sort(), [5401, 5402, 5403, 5404, 5405]);
    for (const r of doCard) {
      assert.equal(String(r.FASE_CHAVE), 'analise');
      assert.ok(String(r.TITULO).length > 0);
      assert.ok(Number(r.QT_PEDIDA) > 0);
    }
    const filial2 = await linhas('sgcItensEmPedidoAberto', {
      codfornec: FORNECEDOR_011, codfilial: FILIAL_ENVIADO_011, limite: 500, offset: 0,
    });
    assert.equal(filial2.length, 0, 'pedido enviado nao e pedido aberto (RN-016)');
  });

  await teste('C-039 / RN-027: sgcWintRessuprimento devolve o custo ATUAL do ERP ao lado do custo da ultima entrada, e o codigo de fabrica — o 5401 caiu de 12 para 11, o 5403 subiu de 10 para 10,50 e o 5402 nao mudou', async () => {
    const rows = await ressuprimento();
    assert.equal(Number(produto(rows, 5401).CUSTO_ULT_ENTRADA), 12);
    assert.equal(Number(produto(rows, 5401).CUSTO_ATUAL), 11);
    assert.equal(Number(produto(rows, 5403).CUSTO_ATUAL), 10.5);
    assert.equal(Number(produto(rows, 5402).CUSTO_ATUAL), 12);
    assert.equal(String(produto(rows, 5401).CODFAB), 'FAB-5401');
  });

  await teste('C-040 / RN-010: sgcWintRessuprimento devolve FATURAMENTO_PERIODO e RENTABILIDADE_PERIODO por produto — o 5410 (50 un. a 20 com custo financeiro 12) fatura 1000 e rende 400; a devolucao (QT negativa) e a venda desconsiderada ficam fora dos dois; produto sem venda tem 0 e 0', async () => {
    const rows = await ressuprimento();
    assert.equal(Number(produto(rows, 5410).FATURAMENTO_PERIODO), 1000);
    assert.equal(Number(produto(rows, 5410).RENTABILIDADE_PERIODO), 400);
    // So a faixa desta spec (5401..5420): o seed da 003 vende a outro preco.
    for (const linha of rows.filter((r) => Number(r.CODPROD) >= 5401 && Number(r.CODPROD) <= 5420)) {
      assert.equal(Number(linha.FATURAMENTO_PERIODO), Number(linha.VENDA_PERIODO) * 20, `faturamento do ${linha.CODPROD}`);
      assert.equal(Number(linha.RENTABILIDADE_PERIODO), Number(linha.VENDA_PERIODO) * 8, `rentabilidade do ${linha.CODPROD}`);
    }
    const semVenda = rows.find((r) => Number(r.CODPROD) >= 5401 && Number(r.VENDA_PERIODO) === 0);
    assert.ok(semVenda, 'o seed tem produto sem venda na janela');
    assert.equal(Number(semVenda.FATURAMENTO_PERIODO), 0);
    assert.equal(Number(semVenda.RENTABILIDADE_PERIODO), 0);
    // A venda de 60 do 5408 desconsiderada sai dos dois valores (RN-012).
    const venda = db.prepare("SELECT NUMTRANSITEM FROM PCMOV WHERE CODPROD = 5408 AND CODOPER = 'S' AND QT = 60").get();
    const semEla = await ressuprimento({ excluir: String(venda.NUMTRANSITEM) });
    assert.equal(Number(produto(semEla, 5408).FATURAMENTO_PERIODO), 30 * 20);
    assert.equal(Number(produto(semEla, 5408).RENTABILIDADE_PERIODO), 30 * 8);
  });

  await teste('C-041 / R-123: sgcWintProdutoVendas devolve, por venda, o vendedor (CODUSUR e VENDEDOR da PCUSUARI) ao lado do cliente — toda venda do 5408 na janela tem vendedor nomeado', async () => {
    const vendas = await linhas('sgcWintProdutoVendas', { codprod: 5408, codfilial: FILIAL_011, ...JANELA }, U.ana);
    assert.ok(vendas.length >= 4, `o 5408 tem 4 vendas na janela, veio ${vendas.length}`);
    for (const v of vendas) {
      assert.ok(Number(v.CODUSUR) > 0, `CODUSUR da ${v.NUMTRANSITEM}`);
      assert.ok(String(v.VENDEDOR).length > 0, `VENDEDOR da ${v.NUMTRANSITEM}`);
      assert.ok(Number(v.CODCLI) > 0 && String(v.CLIENTE).length > 0);
    }
  });

  await teste('C-050 / R-128: sgcCustoPadraoAtual devolve o custo padrao mais recente do Gestao de Custos por produto — 5401 vale 11 (2026, nao os 12 de 2025), 5403 vale 10, e o 5402 (sem linha na CUSTOPRODUTO) nao volta', async () => {
    const rows = await linhas('sgcCustoPadraoAtual', { codprods: '5401,5402,5403' }, U.ana);
    const mapa = new Map(rows.map((r) => [Number(r.CODPROD), Number(r.CUSTO)]));
    assert.equal(mapa.get(5401), 11);
    assert.equal(mapa.get(5403), 10);
    assert.equal(mapa.has(5402), false, 'sem custo padrao, nada volta: a tela mostra "Sem custo"');
  });

  await teste('C-046 / R-125: sgcCustoEspeciaisProdutos (INTEGRATION gestao-de-custos) devolve so as politicas vigentes com custo — 5401 e 5403 para a Farmacia Central (tabela 1), 5405 aberta (CODCLI 0, tabela 4); a inativa (5402) e a vencida (5404) ficam fora', async () => {
    const rows = await linhas('sgcCustoEspeciaisProdutos', { codprods: '5401,5402,5403,5404,5405' }, U.ana);
    const vistos = rows.map((r) => [Number(r.CODPROD), Number(r.CODCLI), Number(r.CUSTO_ESPECIAL), Number(r.POLITICA_ID)]).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(vistos, [[5401, 9301, 8, 1], [5403, 9301, 9, 1], [5405, 0, 7, 4]]);
    assert.equal(String(produto(rows, 5401).POLITICA_NOME), 'Tabela especial Farmacia Central');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(String(produto(rows, 5401).DATA_FIM)), 'validade como data');
    assert.deepEqual(await linhas('sgcCustoEspeciaisProdutos', { codprods: '' }, U.ana), []);
  });

  await teste('C-047 / R-125: sgcWintVendasClientesProdutos devolve a venda de cada cliente por produto na janela — 5408: 9303 60, 9301 20, 9302 10; 5409 so o 9301 (12) sem orgao publico, e com incluirPublico 1 tambem o 9304 (6)', async () => {
    const semPublico = await linhas('sgcWintVendasClientesProdutos', { codprods: '5408,5409', codfilial: FILIAL_011, ...JANELA, incluirPublico: 0 }, U.ana);
    const mapa = (rows) => rows.map((r) => `${r.CODPROD}:${r.CODCLI}=${Number(r.VENDA_CLIENTE_PERIODO)}`).sort();
    assert.deepEqual(mapa(semPublico), ['5408:9301=20', '5408:9302=10', '5408:9303=60', '5409:9301=12']);
    assert.ok(semPublico.every((r) => String(r.CLIENTE).length > 0), 'o nome do cliente vem junto');
    const comPublico = await linhas('sgcWintVendasClientesProdutos', { codprods: '5408,5409', codfilial: FILIAL_011, ...JANELA, incluirPublico: 1 }, U.ana);
    assert.deepEqual(mapa(comPublico), ['5408:9301=20', '5408:9302=10', '5408:9303=60', '5409:9301=12', '5409:9304=6']);
  });

  await teste('C-051 / R-130: sgcWintEstoqueFiliaisProdutos devolve, numa chamada para a lista, a posicao das OUTRAS filiais com estoque liquido > 0 — 5403 na filial 2 (120) e na 3 (35 - 5 bloqueados = 30), venda de 3 meses 30; a filial da tela e os produtos sem estoque fora dela nao voltam', async () => {
    const rows = await linhas('sgcWintEstoqueFiliaisProdutos', { codprods: '5401,5402,5403,5415', codfilial: FILIAL_011 }, U.ana);
    const vistos = rows.map((r) => `${r.CODPROD}:${r.CODFILIAL}=${Number(r.ESTOQUE_ATUAL)}/${Number(r.VENDA_3_MESES)}`);
    assert.deepEqual(vistos, ['5403:2=120/30', '5403:3=30/30']);
    assert.ok(rows.every((r) => String(r.FILIAL).length > 0), 'o nome da filial vem junto');
    const outraTela = await linhas('sgcWintEstoqueFiliaisProdutos', { codprods: '5403', codfilial: '2' }, U.ana);
    assert.deepEqual(outraTela.map((r) => String(r.CODFILIAL)), ['1', '3'], 'a filial da tela sai, a 1 entra');
  });

  await teste('C-052 / R-130: sgcWintBloqueiosProduto devolve os lotes bloqueados do 5401 na filial 1 — L5401A 6 un. (2 reserv.) com motivo 31 AVARIA NO TRANSPORTE pelo PCMOVBLOQUEIO, rotina 1101; L5401B 4 un. (3 reserv.) sem motivo de historico, com a observacao do lote e quem bloqueou pelo PCLOTELOG (JOAO PEREIRA, nao o desbloqueio parcial do CARLOS); o lote sem bloqueio nao volta', async () => {
    const rows = await linhas('sgcWintBloqueiosProduto', { codprod: 5401, codfilial: FILIAL_011 }, U.ana);
    assert.deepEqual(rows.map((r) => String(r.NUMLOTE)), ['L5401A', 'L5401B']);
    const [a, b] = rows;
    assert.equal(Number(a.QTBLOQUEADA), 6);
    assert.equal(Number(a.QTRESERV), 2);
    assert.equal(Number(a.CODDEVOL), 31);
    assert.equal(String(a.MOTIVO_BLOQUEIO), 'AVARIA NO TRANSPORTE');
    assert.equal(String(a.TIPO_MOTIVO), 'A');
    assert.equal(String(a.ORIGEM_MOTIVO), 'PCMOVBLOQUEIO');
    assert.equal(String(a.ROTINALANC), '1101');
    assert.equal(String(a.FUNCIONARIO), 'MARIA SOUZA');
    assert.equal(String(a.DTVALIDADE), '2027-03-31');
    assert.equal(Number(b.QTBLOQUEADA), 4);
    assert.equal(b.MOTIVO_BLOQUEIO, null, 'sem historico de motivo: a tela cai na observacao do lote');
    assert.equal(String(b.OBSBLOQUEIO), 'AGUARDANDO LAUDO DE QUALIDADE');
    assert.equal(Number(b.LOG_MATRICULA), 88);
    assert.equal(String(b.LOG_RESPONSAVEL), 'JOAO PEREIRA');
    assert.equal(String(b.ROTINALANC), 'PCSIS1106');
    assert.deepEqual(await linhas('sgcWintBloqueiosProduto', { codprod: 5403, codfilial: FILIAL_011 }, U.ana), [], 'sem lote bloqueado, nada volta');
  });

  await teste('C-053 / R-131: a venda valida e um recorte so — a venda entre filiais (ramo 20 e cliente que e filial do grupo) e a remessa de entrega futura (CONDVENDA 8) ficam fora da lista, do historico, da aba Vendas e da venda por cliente; o 5409 segue com 18 (6 publicas) e o publico (ramos 11 a 15) sai segregado, inclusive no faturamento', async () => {
    const p5409 = produto(await ressuprimento(), 5409);
    assert.equal(Number(p5409.VENDA_PERIODO), 18, 'as 3 vendas fora (9 + 7 + 4) nao entram');
    assert.equal(Number(p5409.VENDA_PUBLICA), 6);
    assert.ok(Number(p5409.FATURAMENTO_PUBLICO) > 0 && Number(p5409.FATURAMENTO_PUBLICO) < Number(p5409.FATURAMENTO_PERIODO), 'o faturamento publico sai segregado');
    assert.ok(Number(p5409.RENTABILIDADE_PUBLICA) > 0);
    const p5418 = produto(await ressuprimento(), 5418);
    assert.equal(Number(p5418.VENDA_PUBLICA), Number(p5418.VENDA_PERIODO), 'o 9305 (ramo 13) e publico');

    const historico = await linhas('sgcWintProdutoHistorico', { codprod: 5409, codfilial: FILIAL_011, meses: 12 }, U.ana);
    const saidas = historico.reduce((soma, h) => soma + Number(h.SAIDAS), 0);
    const publicas = historico.reduce((soma, h) => soma + Number(h.SAIDAS_PUBLICAS), 0);
    assert.equal(saidas, 18, 'o grafico e a previsao contam as mesmas 18');
    assert.equal(publicas, 6);

    const vendas = await linhas('sgcWintProdutoVendas', { codprod: 5409, codfilial: FILIAL_011, ...JANELA }, U.ana);
    const itens = vendas.map((v) => Number(v.NUMTRANSITEM));
    for (const [item] of VENDAS_FORA_011) assert.ok(!itens.includes(item), `a aba Vendas mostrou a venda fora ${item}`);
    assert.equal(vendas.length, 2);

    const porCliente = await linhas('sgcWintVendasClientesProdutos', { codprods: '5409', codfilial: FILIAL_011, ...JANELA, incluirPublico: 1 }, U.ana);
    assert.deepEqual(porCliente.map((r) => `${r.CODCLI}=${Number(r.VENDA_CLIENTE_PERIODO)}`).sort(), ['9301=12', '9304=6'], 'nem a filial nem a remessa entram na venda por cliente');
  });

  await teste('C-054 / R-132: sgcWintRessuprimento traz a previsao de chegada do que esta a caminho — 5404 chega em 8 dias (pedido 970004 pendente; o 970002 ja entregue nao conta), 5403 com o pedido atrasado (previsao ha 3 dias) e o 5405, sem pedido pendente, sem data', async () => {
    const rows = await ressuprimento();
    assert.equal(String(produto(rows, 5404).DT_PREV_CHEGADA), haDias(-8));
    assert.equal(String(produto(rows, 5403).DT_PREV_CHEGADA), haDias(3));
    assert.equal(produto(rows, 5405).DT_PREV_CHEGADA, null);
  });

  await teste('C-018 / RNF-002: o carrinho cria o pedido pelo mesmo caminho do Novo pedido do quadro — kbCardCriar + sgcEscPedidoCriar (origem compras_inteligentes) + sgcItensGravar, TRES execucoes por grupo depois de UM kbBoardCarregar —, e os 3 itens nascem completos: quantidade, sugerida, custo, curva, DESCRICAO nao vazia e COBERTURA_LIMITE > 0 (R-112)', async () => {
    const medidas = await ressuprimento();
    assert.ok(medidas.length > 0, 'consulta ao WinThor sem linha nao e verde');

    let execucoes = 0;
    const contado = (nome, input, userId) => { execucoes += 1; return chamar(nome, input, userId); };

    // O board vem UMA vez na carga da pagina, e nao por grupo (C-1 da revisao).
    const board = await contado('kbBoardCarregar', { slug: 'compras' }, U.ana);
    const boardId = Number(board.board.id);
    assert.ok(boardId > 0);
    execucoes = 0;

    // O item do carrinho e o ItemPedido INTEIRO (R-112): a remontagem da
    // Analise preserva o item existente, entao campo que nascer vazio fica
    // vazio para sempre — e um COBERTURA_LIMITE zerado deixaria a trava de
    // cobertura da 003 cega.
    const itemDe = (codprod, qtPedida, qtSugerida) => {
      const m = medidas.find((r) => Number(r.CODPROD) === codprod);
      return {
        codprod, descricao: String(m.DESCRICAO), embalagem: String(m.EMBALAGEM), unidade: String(m.UNIDADE),
        codepto: Number(m.CODEPTO), codsec: Number(m.CODSEC), unPorCaixa: Number(m.UN_POR_CAIXA_ERP) || 1,
        qtVendaTotal: Number(m.VENDA_PERIODO), qtVendaLicitacao: Number(m.VENDA_PUBLICA),
        qtEstoque: Number(m.ESTOQUE_ATUAL), qtTransito: Number(m.ESTOQUE_EM_TRANSITO),
        qtSugerida, qtPedida, precoCusto: Number(m.CUSTO_ULT_ENTRADA), tipoPreco: 'padrao',
        curvaAbc: 'A', coberturaDias: 37, coberturaLimite: 42,
        coberturaJustificativa: '', observacao: '', status: 'montagem',
      };
    };
    // O 5402 esta em ruptura (disponivel 0): e ele que sobe a prioridade do grupo.
    const itens = [itemDe(5401, 24, 24), itemDe(5402, 72, 72), itemDe(5403, 24, 24)];
    const total = itens.reduce((soma, item) => soma + item.qtPedida * item.precoCusto, 0);

    const criado = await contado('kbCardCriar', {
      boardId,
      titulo: 'BENENUTRI MATRIZ · NESTLE',
      responsaveisIds: String(U.ana),
      prazo: '',
      valoresJson: JSON.stringify({
        fornecedor: 'Nestle Brasil Ltda', filial: 'Benenutri Matriz',
        prioridade: 'alta', valor_total: String(total),
      }),
    }, U.ana);
    assert.equal(criado.ok, true, criado.error);
    DO_CARRINHO = criado.id;

    await contado('sgcEscPedidoCriar', {
      cardId: DO_CARRINHO, codfornec: FORNECEDOR_011, fornecedor: 'Nestle Brasil Ltda',
      codfilial: FILIAL_011, filial: 'Benenutri Matriz',
      periodoInicio: JANELA.dataInicio, periodoFim: JANELA.dataFim,
      origem: 'compras_inteligentes', agora: `${JANELA.dataFim}T10:00:00`,
    }, U.ana);

    const gravado = await contado('sgcItensGravar', { cardId: DO_CARRINHO, itensJson: JSON.stringify(itens) }, U.ana);
    assert.equal(gravado.ok, true, gravado.erro);
    assert.equal(execucoes, 3, 'tres execucoes por grupo, qualquer que seja o numero de itens (RNF-002)');

    const detalhe = await chamar('kbCardDetalhe', { cardId: DO_CARRINHO }, U.ana);
    assert.equal(Number(detalhe.card.faseId), faseId('analise'), 'o pedido nasce na primeira fase');
    assert.equal(detalhe.card.valores.prioridade, 'alta', 'um item em ruptura sobe a prioridade do grupo');

    const capa = db.prepare('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?').get(DO_CARRINHO);
    assert.equal(String(capa.ORIGEM), 'compras_inteligentes');
    assert.equal(String(capa.PERIODO_INICIO), JANELA.dataInicio);
    assert.equal(String(capa.PERIODO_FIM), JANELA.dataFim);
    assert.equal(Number(capa.VL_TOTAL), total, 'o total do carrinho e o total da capa');
    assert.equal(Number(capa.CRIADO_POR), U.ana);

    const gravados = db.prepare('SELECT * FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? ORDER BY CODPROD').all(DO_CARRINHO);
    assert.equal(gravados.length, 3);
    for (const item of gravados) {
      assert.ok(Number(item.QT_PEDIDA) > 0, `QT_PEDIDA do ${item.CODPROD}`);
      assert.ok(Number(item.QT_SUGERIDA) > 0, `QT_SUGERIDA do ${item.CODPROD}`);
      assert.ok(Number(item.PRECO_CUSTO) > 0, `PRECO_CUSTO do ${item.CODPROD}`);
      assert.ok(['A', 'B', 'C'].includes(String(item.CURVA_ABC)), `CURVA_ABC do ${item.CODPROD}`);
      assert.notEqual(String(item.DESCRICAO).trim(), '', `DESCRICAO do ${item.CODPROD} (R-112)`);
      assert.ok(Number(item.COBERTURA_LIMITE) > 0, `COBERTURA_LIMITE do ${item.CODPROD} (R-112)`);
      assert.ok(Number(item.UN_POR_CAIXA) > 0, `UN_POR_CAIXA do ${item.CODPROD}`);
    }
  });

  await teste('C-020 / RN-017: montar a analise dentro do pedido NAO apaga o que o carrinho decidiu — gravando em lote so os produtos novos (o que a aba Itens da 003 manda), o 5403 continua com QT_PEDIDA 24 e os campos do carrinho intactos, e os novos entram com 0', async () => {
    const antes = db.prepare('SELECT * FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = 5403').get(DO_CARRINHO);
    assert.equal(Number(antes.QT_PEDIDA), 24);

    const novo = (codprod) => ({
      codprod, descricao: `PRODUTO ${codprod}`, embalagem: 'CX 12', unidade: 'UN', codepto: 2, codsec: 21,
      unPorCaixa: 12, qtVendaTotal: 0, qtVendaLicitacao: 0, qtEstoque: 0, qtTransito: 0,
      qtSugerida: 12, qtPedida: 0, precoCusto: 5, tipoPreco: 'padrao', curvaAbc: 'C',
      coberturaDias: 0, coberturaLimite: 35, coberturaJustificativa: '', observacao: '', status: 'montagem',
    });
    const gravado = await chamar('sgcItensGravar', {
      cardId: DO_CARRINHO, itensJson: JSON.stringify([novo(5404), novo(5405)]),
    }, U.ana);
    assert.equal(gravado.ok, true, gravado.erro);

    const depois = db.prepare('SELECT * FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = 5403').get(DO_CARRINHO);
    assert.equal(Number(depois.QT_PEDIDA), 24, 'o item que nao entrou no lote nao foi tocado pelo upsert');
    assert.equal(String(depois.DESCRICAO), String(antes.DESCRICAO));
    assert.equal(Number(depois.COBERTURA_LIMITE), Number(antes.COBERTURA_LIMITE));
    for (const codprod of [5404, 5405]) {
      const item = db.prepare('SELECT * FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = ?').get(DO_CARRINHO, codprod);
      assert.equal(Number(item.QT_PEDIDA), 0, 'so os produtos novos entram, e zerados');
    }
  });

  /* ── T-087 — o bloqueio do carrinho ──────────────────────────────────── */

  await teste('C-019 / RN-016: sgcPedidoAbertoDoFornecedor lista o pedido do 1042 na filial 1 que ainda nao foi enviado a industria, com titulo e fase pela CHAVE, e continua listando depois de ele ir para a aprovacao tecnica; o pedido ja enviado (filial 2) nunca entra', async () => {
    const abertos = await linhas('sgcPedidoAbertoDoFornecedor', {
      codfornec: FORNECEDOR_011, codfilial: FILIAL_011, limite: 20, offset: 0,
    }, U.ana);
    assert.ok(abertos.length > 0, 'com pedido em analise, o carrinho e recusado');
    const meu = abertos.find((l) => Number(l.ID_CARD) === CARDS_011.eficiencia);
    assert.ok(meu, 'o pedido desta spec esta entre os abertos');
    assert.equal(String(meu.FASE_CHAVE), 'analise');
    assert.notEqual(String(meu.TITULO).trim(), '', 'a recusa cita o pedido pelo titulo');
    assert.ok(abertos.every((l) => FASES_ABERTAS.includes(String(l.FASE_CHAVE))),
      'so fase anterior ao envio a industria bloqueia');

    // A fase vem da CHAVE, nunca do id nem do nome: mover para a tecnica
    // continua bloqueando.
    emFase(CARDS_011.eficiencia, 'tecnica');
    const naTecnica = await linhas('sgcPedidoAbertoDoFornecedor', {
      codfornec: FORNECEDOR_011, codfilial: FILIAL_011, limite: 20, offset: 0,
    }, U.ana);
    assert.equal(String(naTecnica.find((l) => Number(l.ID_CARD) === CARDS_011.eficiencia).FASE_CHAVE), 'tecnica');
    emFase(CARDS_011.eficiencia, 'analise');

    // R-045: nada de literal sobre a listagem global da filial 2 (outras specs
    // semeiam cards ali). O que a regra promete e que o pedido ENVIADO some.
    const daFilial2 = await linhas('sgcPedidoAbertoDoFornecedor', {
      codfornec: FORNECEDOR_011, codfilial: FILIAL_ENVIADO_011, limite: 20, offset: 0,
    }, U.ana);
    assert.equal(daFilial2.filter((l) => Number(l.ID_CARD) === CARDS_011.enviado).length, 0,
      'pedido ja enviado a industria nao bloqueia');
    assert.ok(daFilial2.every((l) => FASES_ABERTAS.includes(String(l.FASE_CHAVE))));
  });

  /* ── T-088 — eficiência do comprador ─────────────────────────────────── */

  await teste('C-022: sgcEficienciaComprador, recortada pelo fornecedor 1042 e pelo comprador do pedido, devolve 5 itens com 3 aderentes e 60,0 % — 80 e 120 estao dentro da faixa de 20 %, 79 e 121 estao fora', async () => {
    const [medida] = await linhas('sgcEficienciaComprador', {
      compradorId: U.gil, codfornec: FORNECEDOR_011, dataInicio: '', dataFim: '',
    }, U.gil);
    assert.ok(medida, 'a apuracao devolve sempre uma linha');
    assert.equal(Number(medida.ITENS), 5);
    assert.equal(Number(medida.ADERENTES), 3);
    assert.equal(Number(medida.PERC_ADERENCIA), 60);

    // Sem pedido nenhum no recorte, a aderencia nao existe: e Dash na tela,
    // nunca 0 % (que leria como "o comprador errou tudo").
    const [vazio] = await linhas('sgcEficienciaComprador', {
      compradorId: U.dora, codfornec: FORNECEDOR_011, dataInicio: '', dataFim: '',
    }, U.gil);
    assert.equal(Number(vazio.ITENS), 0);
    assert.equal(vazio.PERC_ADERENCIA, null);
  });
}
