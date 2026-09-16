// Cenários C-006, C-006b, C-008..C-011, C-014, C-015 e regras RN-005, RN-008 e
// RN-010 da spec 012 (coberturas por curva). Ver
// docs/specs/012-coberturas-por-curva/plan.md §Testes.
//
// O que é regra pura de tela (C-001..C-005, C-007, C-012, C-013, RN-001..RN-004,
// RN-006, RN-007) vive em frontend/tests/cobertura.test.mjs; aqui fica o que só
// a server function real responde. Nenhuma consulta ao WinThor nesta spec: as
// SFs são todas do banco do projeto.
//
// Roda logo depois de `itens` (003), R-107: a 012 é dona, nesta onda, das linhas
// de SGC_COBERTURA do seed/003-itens.mjs e escreve no card CARDS_003.gravacao,
// que nasce vazio e com prazo resolvido justamente para a suíte gravar nele
// pelo sgcItensGravar real.

import { assert } from './base.mjs';
import { CARDS_003 } from '../seed/003-itens.mjs';
import { coberturaDeLinha, limiteDeCobertura } from '../../../frontend/src/lib/cobertura.ts';

/** Linhas de uma server function SQL. */
async function linhas(ctx, nome, input, userId) {
  const saida = await ctx.chamar(nome, input, userId);
  return saida.rows ?? [];
}

const umItem = (codprod, qtPedida, extra = {}) => ({
  codprod, qtPedida, precoCusto: 10.0, descricao: `PRODUTO ${codprod}`, embalagem: 'CX 12', unidade: 'UN',
  codepto: 2, codsec: 21, unPorCaixa: 12, qtVendaTotal: 0, qtVendaLicitacao: 0, qtEstoque: 0,
  qtTransito: 0, qtSugerida: 0, tipoPreco: 'padrao', curvaAbc: 'C', coberturaDias: 0,
  coberturaLimite: 35, coberturaJustificativa: '', observacao: '', ...extra,
});

/** Os seis números de uma parametrização, no formato que sgcEscCoberturaGravar espera. */
const pares = (a, b, c) => ({
  alvoADias: a[0], toleranciaAPct: a[1],
  alvoBDias: b[0], toleranciaBPct: b[1],
  alvoCDias: c[0], toleranciaCPct: c[1],
});

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;

  const verificar = async (cardId) => (await linhas(ctx, 'sgcAnaliseSaidaVerificar', { cardId }))[0];
  const gravar = (itens) => chamar('sgcItensGravar', {
    cardId: CARDS_003.gravacao, itensJson: JSON.stringify(itens),
  }, U.ana);
  const idDe = (nivel, codigo) => {
    const linha = db.prepare('SELECT ID FROM SGC_COBERTURA WHERE NIVEL = ? AND CODIGO = ?').get(nivel, codigo);
    return Number(linha?.ID ?? 0);
  };
  const contarLog = (idCobertura) => Number(
    db.prepare('SELECT COUNT(*) AS N FROM SGC_COBERTURA_LOG WHERE ID_COBERTURA = ?').get(idCobertura).N,
  );
  const listarCoberturas = (situacao, userId = U.gil) =>
    linhas(ctx, 'sgcCoberturaListar', { nivel: '', situacao, limite: 200, offset: 0 }, userId);

  /* ── T-085 · T-085b · T-094 — o teto da curva atravessa até a trava de saída ── */

  await teste('C-006: item de curva A com 45 dias de cobertura contra o teto 42, sem justificativa, recusa a saida da Analise com a mesma frase de sempre; justificado, libera', async () => {
    const saida = await gravar([umItem(5018, 10, {
      descricao: 'DIETA ENTERAL FIBRA 1000 ML', curvaAbc: 'A', coberturaDias: 45, coberturaLimite: 42,
    })]);
    assert.equal(saida.ok, true, saida.erro);

    const antes = await verificar(CARDS_003.gravacao);
    assert.equal(Number(antes.PODE), 0);
    assert.match(antes.MOTIVO, /Justifique os itens com cobertura acima do limite \(1\), a começar por/);
    assert.match(antes.MOTIVO, /DIETA ENTERAL FIBRA 1000 ML/);

    await gravar([umItem(5018, 10, {
      descricao: 'DIETA ENTERAL FIBRA 1000 ML', curvaAbc: 'A', coberturaDias: 45, coberturaLimite: 42,
      coberturaJustificativa: 'Contrato do hospital fechado para o trimestre.',
    })]);
    const depois = await verificar(CARDS_003.gravacao);
    assert.equal(Number(depois.PODE), 1, depois.MOTIVO);
    assert.equal(depois.MOTIVO, '', 'MOTIVO vazio quando pode (contrato da lib, R-020)');
  });

  await teste('C-006b: o teto 49,5 da curva B chega INTEIRO ao banco — o item com 49,2 dias de cobertura nao barra nada (com INT na coluna ou inteiro() no lote, o teto viraria 49 e a saida recusaria)', async () => {
    const saida = await gravar([umItem(5019, 10, {
      descricao: 'SUPLEMENTO HIPERPROTEICO 200 ML', curvaAbc: 'B', coberturaDias: 49.2, coberturaLimite: 49.5,
    })]);
    assert.equal(saida.ok, true, saida.erro);

    const gravado = db.prepare('SELECT COBERTURA_LIMITE, CURVA_ABC FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = 5019')
      .get(CARDS_003.gravacao);
    assert.equal(Number(gravado.COBERTURA_LIMITE), 49.5, 'R-101 + R-108: a fracao do teto nao pode se perder no caminho');
    assert.equal(String(gravado.CURVA_ABC), 'B');

    const veredicto = await verificar(CARDS_003.gravacao);
    assert.equal(Number(veredicto.PODE), 1, veredicto.MOTIVO);
  });

  await teste('C-015: alterar a parametrizacao depois da montagem nao reescreve pedido ja montado — o item de curva B mantem o teto 49,5 que a analise fotografou, e e contra ele que a trava decide', async () => {
    await chamar('sgcEscCoberturaGravar', {
      nivel: 'sku', codigo: '5019', descricao: 'SUPLEMENTO HIPERPROTEICO 200 ML',
      ...pares([30, 0], [30, 0], [30, 0]), atualizadoEm: '2026-09-16T08:00:00',
    }, U.gil);
    const nova = (await listarCoberturas('ativa')).find((r) => r.NIVEL === 'sku' && String(r.CODIGO) === '5019');
    assert.equal(Number(nova.ALVO_B_DIAS), 30, 'a regua nova esta valendo a partir de agora');

    const item = db.prepare('SELECT COBERTURA_LIMITE FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND CODPROD = 5019')
      .get(CARDS_003.gravacao);
    assert.equal(Number(item.COBERTURA_LIMITE), 49.5, 'RN-009: o teto gravado no item nao muda por baixo da compradora');
    assert.equal(Number((await verificar(CARDS_003.gravacao)).PODE), 1);
  });

  /* ── T-087 · T-088 · T-093 — a auditoria campo a campo ────────────────── */

  await teste('C-008: seis numeros alterados dao seis linhas de historico, com campo, antes, depois e quem fez — e o recorte por parametrizacao devolve exatamente essas', async () => {
    const id = idDe('departamento', '2');
    assert.ok(id > 0, 'o seed da 003 tem a parametrizacao do departamento 2');
    const antesDoTeste = contarLog(id);

    const alteracoes = [
      ['ALVO_A_DIAS', '35', '30'], ['TOLERANCIA_A_PCT', '20', '10'],
      ['ALVO_B_DIAS', '45', '40'], ['TOLERANCIA_B_PCT', '10', '5'],
      ['ALVO_C_DIAS', '60', '50'], ['TOLERANCIA_C_PCT', '5', '0'],
    ];
    for (const [campo, antes, depois] of alteracoes) {
      await chamar('sgcEscCoberturaLogInserir', {
        nivel: 'departamento', codigo: '2', campo, antes, depois,
        acao: 'alterou', em: '2026-09-16T09:00:00',
      }, U.gil);
    }
    assert.equal(contarLog(id), antesDoTeste + 6, 'uma linha por campo alterado (RF-008)');

    const historico = await linhas(ctx, 'sgcCoberturaLogListar', { idCobertura: id, limite: 50, offset: 0 }, U.gil);
    assert.equal(historico.length, antesDoTeste + 6);
    for (const [campo, antes, depois] of alteracoes) {
      const linha = historico.find((r) => String(r.CAMPO) === campo);
      assert.ok(linha, `a linha de ${campo} deveria estar no historico`);
      assert.equal(String(linha.ANTES), antes);
      assert.equal(String(linha.DEPOIS), depois);
      assert.equal(String(linha.ACAO), 'alterou');
      assert.equal(String(linha.POR_NOME), 'Gil Gestor', 'o nome sai do INT_USER pelo :VAR_USER da escrita');
      assert.equal(String(linha.NIVEL), 'departamento', 'o recorte traz o alvo junto, sem execucao extra');
    }
  });

  await teste('C-009: criar uma parametrizacao que nao existia grava a linha e as sete do historico, com o valor anterior vazio e a acao criou', async () => {
    assert.equal(idDe('sku', '5004'), 0, 'o sku 5004 nao esta no seed');
    await chamar('sgcEscCoberturaGravar', {
      nivel: 'sku', codigo: '5004', descricao: 'DIETA ENTERAL PADRAO 500 ML',
      ...pares([30, 10], [40, 5], [50, 0]), atualizadoEm: '2026-09-16T09:10:00',
    }, U.gil);
    const id = idDe('sku', '5004');
    assert.ok(id > 0, 'a parametrizacao nasceu');

    const campos = ['DESCRICAO', 'ALVO_A_DIAS', 'TOLERANCIA_A_PCT', 'ALVO_B_DIAS', 'TOLERANCIA_B_PCT',
      'ALVO_C_DIAS', 'TOLERANCIA_C_PCT'];
    const valores = ['DIETA ENTERAL PADRAO 500 ML', '30', '10', '40', '5', '50', '0'];
    for (let i = 0; i < campos.length; i += 1) {
      await chamar('sgcEscCoberturaLogInserir', {
        nivel: 'sku', codigo: '5004', campo: campos[i], antes: '', depois: valores[i],
        acao: 'criou', em: '2026-09-16T09:10:00',
      }, U.gil);
    }

    const historico = await linhas(ctx, 'sgcCoberturaLogListar', { idCobertura: id, limite: 50, offset: 0 }, U.gil);
    assert.equal(historico.length, 7, 'uma linha por campo preenchido; ATIVO nao conta, a linha nasce ativa');
    assert.ok(historico.every((r) => String(r.ACAO) === 'criou'));
    assert.ok(historico.every((r) => String(r.ANTES ?? '') === ''));
  });

  await teste('C-014: o historico vem do mais recente para o mais antigo, com a contagem apurada no proprio banco, e o recorte por parametrizacao so traz as linhas dela', async () => {
    const total = Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COBERTURA_LOG').get().N);
    const todas = await linhas(ctx, 'sgcCoberturaLogListar', { idCobertura: 0, limite: 200, offset: 0 }, U.gil);
    assert.equal(todas.length, total, 'a contagem sai do banco, nunca de um numero literal (R-045)');

    const ids = todas.map((r) => Number(r.ID));
    assert.deepEqual(ids, [...ids].sort((a, b) => b - a), 'ORDER BY L.ID DESC');

    const id5004 = idDe('sku', '5004');
    const recortado = await linhas(ctx, 'sgcCoberturaLogListar', { idCobertura: id5004, limite: 200, offset: 0 }, U.gil);
    assert.equal(recortado.length, contarLog(id5004));
    assert.ok(recortado.every((r) => Number(r.ID_COBERTURA) === id5004));
    assert.ok(recortado.length < total, 'o recorte e mesmo um recorte');
  });

  /* ── T-089 · T-104 — desativar tira da resolucao; regravar reativa ────── */

  await teste('C-010 / RN-010: desativado o sku 5001, a listagem de ativas nao o traz, a de inativas traz com ATIVO 0 e a regua passa a resolver os 49,5 do departamento na curva B; regravado, volta a 25 e reaparece nas ativas', async () => {
    const id = idDe('sku', '5001');
    await chamar('sgcEscCoberturaExcluir', { id, atualizadoEm: '2026-09-16T09:20:00' }, U.gil);

    const ativas = await listarCoberturas('ativa');
    assert.equal(ativas.filter((r) => r.NIVEL === 'sku' && String(r.CODIGO) === '5001').length, 0);
    const inativas = await listarCoberturas('inativa');
    const desativada = inativas.find((r) => r.NIVEL === 'sku' && String(r.CODIGO) === '5001');
    assert.ok(desativada, 'e por "Inativas" que se chega ao alvo desativado para reativa-lo (R-109)');
    assert.equal(Number(desativada.ATIVO), 0);

    // A regua da tela sobre o que a SF devolve com situacao '' (o que a aba
    // Itens da 003 recebe): a linha inativa vem, e a resolucao a descarta.
    const todas = (await listarCoberturas('')).map(coberturaDeLinha);
    assert.ok(todas.some((c) => c.nivel === 'sku' && c.codigo === '5001' && c.ativo === false));
    const alvo5001 = { codprod: 5001, codsec: 99, codepto: 2, codfornec: 1015 };
    assert.deepEqual(limiteDeCobertura(todas, alvo5001, 'B'), {
      alvoDias: 45, limiteDias: 49.5, toleranciaPct: 10, curva: 'B', nivel: 'departamento',
    });

    await chamar('sgcEscCoberturaGravar', {
      nivel: 'sku', codigo: '5001', descricao: 'CREME NUTRICIONAL MORANGO 200 ML',
      ...pares([20, 0], [25, 0], [30, 0]), atualizadoEm: '2026-09-16T09:30:00',
    }, U.gil);
    const reativadas = await listarCoberturas('ativa');
    const voltou = reativadas.find((r) => r.NIVEL === 'sku' && String(r.CODIGO) === '5001');
    assert.ok(voltou, 'regravar o mesmo alvo reativa (ATIVO = 1 no ON DUPLICATE KEY UPDATE)');
    assert.equal(Number(voltou.ALVO_B_DIAS), 25);
    assert.equal(Number(voltou.ID), id, 'a chave unica (NIVEL, CODIGO) preserva a linha e o historico dela');

    const depois = (await listarCoberturas('')).map(coberturaDeLinha);
    assert.equal(limiteDeCobertura(depois, alvo5001, 'B').limiteDias, 25);
  });

  /* ── T-090 · T-102 — quem mantem e quem nao ──────────────────────────── */

  await teste('C-011 / RN-008: gravacao e historico chamados por analista, comercial e diretoria nao alteram nada nas duas tabelas; por gestor e admin, alteram', async () => {
    const contarCoberturas = () => Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COBERTURA').get().N);
    const contarTodoLog = () => Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COBERTURA_LOG').get().N);
    const antes = { coberturas: contarCoberturas(), log: contarTodoLog() };

    const novaCobertura = {
      nivel: 'sku', codigo: '5005', descricao: 'INJETADA',
      ...pares([10, 0], [10, 0], [10, 0]), atualizadoEm: '2026-09-16T09:40:00',
    };
    const novoLog = {
      nivel: 'departamento', codigo: '2', campo: 'DESCRICAO', antes: 'A', depois: 'B',
      acao: 'alterou', em: '2026-09-16T09:40:00',
    };

    for (const quem of [U.ana, U.leo, U.dora]) {
      await chamar('sgcEscCoberturaGravar', novaCobertura, quem);
      await chamar('sgcEscCoberturaLogInserir', novoLog, quem);
    }
    assert.equal(contarCoberturas(), antes.coberturas, 'analista, comercial e diretoria nao mantem cobertura');
    assert.equal(contarTodoLog(), antes.log, 'RNF-005: gravacao recusada nao deixa linha de historico orfa');

    await chamar('sgcEscCoberturaGravar', novaCobertura, U.gil);
    assert.equal(contarCoberturas(), antes.coberturas + 1, 'o gestor mantem');
    await chamar('sgcEscCoberturaLogInserir', novoLog, U.admin);
    assert.equal(contarTodoLog(), antes.log + 1, 'o admin mantem');
  });

  await teste('RNF-005: o historico de um alvo que nao existe casa 0 linhas — o log nunca aponta para nada', async () => {
    const antes = Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COBERTURA_LOG').get().N);
    await chamar('sgcEscCoberturaLogInserir', {
      nivel: 'sku', codigo: '999999', campo: 'DESCRICAO', antes: '', depois: 'FANTASMA',
      acao: 'criou', em: '2026-09-16T09:50:00',
    }, U.gil);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COBERTURA_LOG').get().N), antes);
  });
}
