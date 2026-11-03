// Cenários de regra de negócio da spec 013 (movimentação de produtos): as nove
// sgcWint* contra o seed/013-movimentacao.mjs e o plano de ação contra a guarda
// real. Ver docs/specs/013-movimentacao-produtos/plan.md §Testes.
//
// O que é regra pura de tela vive em frontend/tests/movimentacao.test.mjs;
// aqui fica o que só a server function real responde. O bloco final roda as
// mesmas sgcWint* no WinThor REAL quando SIMULATOR_WINTHOR=oracle e as
// credenciais estão no backend/.env — e exige contagem > 0 em cada uma
// (regra 7 do CLAUDE.md: vazio não é verde). Sem o Oracle, diz que pulou.

import { assert } from './base.mjs';
import { P013, FORNECEDOR_013, MATRICULA_BLOQUEIO } from '../seed/013-movimentacao.mjs';
import { definitions, WINTHOR } from '../../add-015-movimentacao.mjs';
import { PUBLICO, VENDA_VALIDA } from '../../add-013-compras-inteligentes.mjs';
import { abrirWinthor } from '../winthor-oracle.mjs';
import { bindParams } from '../runtime.mjs';
import { classificarExcedentes, linhaExcedenteDe, parametrosRuptura, PADRAO_RUPTURA } from '../../../frontend/src/lib/movimentacao.ts';
import { coberturaDeLinha } from '../../../frontend/src/lib/cobertura.ts';

function haDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

const FILTROS = { codfilial: '1', codfornec: FORNECEDOR_013, codepto: 0, busca: '', incluirPublico: 0, limite: 50, offset: 0 };
const SEM_VENDA = { ...FILTROS, diasSemVenda: 90, somenteComEstoque: 1, janelaDias: 720 };
const EXCEDENTES = { ...FILTROS, diasPeriodo: 90, limite: 3000 };
const A_VENCER = { ...FILTROS, situacao: 'TODOS', diasHorizonte: 90, bloqueio: 'TODOS' };
const RUPTURA = { ...FILTROS, codfilial: '', ...parametrosRuptura(PADRAO_RUPTURA), severidade: '' };
const PERDAS = { ...FILTROS, codfilial: '', diasVencidos: 0, incluirExcecoes: 0 };

const porCodigo = (rows, codprod) => rows.filter((r) => Number(r.CODPROD) === codprod);
const um = (rows, codprod) => {
  const achados = porCodigo(rows, codprod);
  assert.equal(achados.length, 1, `esperava uma linha do ${codprod}, vieram ${achados.length}`);
  return achados[0];
};

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;
  const linhas = async (nome, input, userId = U.ana) => (await chamar(nome, input, userId)).rows ?? [];

  /* ── Sem venda ── */

  await teste('C-006: com o corte de 90 dias o 5701 (última venda válida há 120 dias) entra com 120 e o 5702 (há 10) não; com o corte de 180, o 5701 sai', async () => {
    const rows = await linhas('sgcWintMovSemVenda', SEM_VENDA);
    assert.equal(Number(um(rows, P013.semVenda120).DIAS_SEM_VENDA), 120);
    assert.equal(porCodigo(rows, P013.vendido10).length, 0);
    const corte180 = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, diasSemVenda: 180 });
    assert.equal(porCodigo(corte180, P013.semVenda120).length, 0);
  });

  await teste('C-007: os nunca vendidos na janela (5703…) vêm antes de todos, sem dias; depois o maior número de dias e, no empate, o maior valor parado', async () => {
    const rows = await linhas('sgcWintMovSemVenda', SEM_VENDA);
    const nunca = um(rows, P013.nuncaVendido);
    assert.equal(nunca.DIAS_SEM_VENDA, null);
    const primeiroComDias = rows.findIndex((r) => r.DIAS_SEM_VENDA !== null);
    assert.ok(primeiroComDias > 0, 'nenhum nunca vendido veio primeiro');
    assert.ok(rows.slice(primeiroComDias).every((r) => r.DIAS_SEM_VENDA !== null), 'nunca vendido depois de um com dias');
    const nulos = rows.slice(0, primeiroComDias).map((r) => Number(r.VALOR_PARADO));
    assert.deepEqual(nulos, [...nulos].sort((a, b) => b - a), 'no empate, valor parado decrescente');
    const ordem = rows.map((r) => Number(r.CODPROD));
    assert.ok(ordem.indexOf(P013.dAlho) < ordem.indexOf(P013.semVenda120), '200 dias antes de 120');
    assert.deepEqual(rows.map((r) => Number(r.RN)), rows.map((_, i) => i + 1));
  });

  await teste('C-008 / RN-002: o 5704 vendeu ontem só para órgão público, para a própria rede e por remessa — nada disso conta, e ele aparece com os 200 dias da última venda válida', async () => {
    const rows = await linhas('sgcWintMovSemVenda', SEM_VENDA);
    const linha = um(rows, P013.dAlho);
    assert.equal(Number(linha.DIAS_SEM_VENDA), 200);
    assert.equal(linha.DT_ULT_VENDA, haDias(200));
  });

  await teste('RN-002: a venda da 013 é o fragmento único da R-131 importado do add-013 (não uma cópia), não cancelada e com o público fora salvo incluirPublico', async () => {
    for (const nome of ['sgcWintMovSemVenda', 'sgcWintMovExcedentes', 'sgcWintMovRuptura', 'sgcWintMovRupturaFiliais', 'sgcWintMovPerdas', 'sgcWintMovPerdasFiliais']) {
      const code = definitions.find((d) => d.name === nome).code;
      assert.ok(code.includes(`(M.DTCANCEL IS NULL AND ${VENDA_VALIDA} AND ({{incluirPublico}} = 1 OR NOT ${PUBLICO}))`), `${nome} não usa a venda válida`);
    }
    assert.deepEqual(WINTHOR, definitions.filter((d) => d.name.startsWith('sgcWint')).map((d) => d.name));
  });

  await teste('C-038 (P-08): com "venda a órgão público conta", a venda de ontem do 5704 ao órgão público vale — ele sai do corte de 90 dias; a venda para a rede e a remessa continuam fora', async () => {
    const comPublico = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, incluirPublico: 1 });
    assert.equal(porCodigo(comPublico, P013.dAlho).length, 0);
    const corte0 = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, incluirPublico: 1, diasSemVenda: 0, busca: String(P013.dAlho) });
    assert.equal(Number(um(corte0, P013.dAlho).DIAS_SEM_VENDA), 1);
  });

  await teste('C-009: o 5705 (sem venda e estoque zero) fica fora com "somente com estoque" e entra com "todos"', async () => {
    assert.equal(porCodigo(await linhas('sgcWintMovSemVenda', SEM_VENDA), P013.semEstoque).length, 0);
    const todos = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, somenteComEstoque: 0 });
    assert.equal(porCodigo(todos, P013.semEstoque).length, 1);
  });

  await teste('C-010 / RN-019: valor parado do 5701 = 40 × 12,50 = 500,00 pelo custo da última entrada; TOTAL_REGISTROS e TOTAL_VALOR somam o recorte inteiro', async () => {
    const rows = await linhas('sgcWintMovSemVenda', SEM_VENDA);
    assert.equal(Number(um(rows, P013.semVenda120).VALOR_PARADO), 500);
    assert.equal(Number(rows[0].TOTAL_REGISTROS), rows.length);
    const soma = rows.reduce((s, r) => s + Number(r.VALOR_PARADO), 0);
    assert.equal(Number(rows[0].TOTAL_VALOR), Math.round(soma * 100) / 100);
  });

  await teste('RN-001 / RN-003: o 5706 (inativo) não aparece; a última venda do 5701 vem do movimento (há 120 dias), não do PCEST.DTULTSAIDA (há 5)', async () => {
    const rows = await linhas('sgcWintMovSemVenda', SEM_VENDA);
    assert.equal(porCodigo(rows, P013.inativo).length, 0);
    const linha = um(rows, P013.semVenda120);
    assert.equal(linha.DT_ULT_VENDA, haDias(120));
    assert.equal(linha.DT_ULT_SAIDA_ERP, haDias(5));
    assert.equal(Number(linha.DIAS_DESDE_ENTRADA), 300);
  });

  await teste('C-004: fornecedor e departamento recortam a mesma consulta — 1088 + departamento 2 traz os do seed, departamento 3 não traz nenhum, e a página 2 continua a ordem', async () => {
    const todos = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, codfornec: 0 });
    const doFornecedor = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, codepto: 2 });
    assert.ok(doFornecedor.length > 0 && todos.length >= doFornecedor.length);
    assert.ok(doFornecedor.every((r) => Number(r.CODFORNEC) === FORNECEDOR_013 && Number(r.CODEPTO) === 2));
    assert.equal((await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, codepto: 3 })).length, 0);
    const pagina2 = await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, limite: 2, offset: 2 });
    assert.deepEqual(pagina2.map((r) => Number(r.CODPROD)), doFornecedor.slice(2, 4).map((r) => Number(r.CODPROD)));
    assert.equal(Number(pagina2[0].TOTAL_REGISTROS), doFornecedor.length, 'o total é do recorte, não da página');
  });

  await teste("C-005: a busca D'ALHO não quebra a consulta e traz o 5704 em Sem venda, A vencer e Perdas", async () => {
    const busca = "D'ALHO";
    assert.equal(um(await linhas('sgcWintMovSemVenda', { ...SEM_VENDA, busca }), P013.dAlho).DESCRICAO, "OLEO D'ALHO 50 ML");
    assert.ok(porCodigo(await linhas('sgcWintMovAVencer', { ...A_VENCER, busca }), P013.dAlho).length > 0);
    assert.ok(porCodigo(await linhas('sgcWintMovPerdas', { ...PERDAS, busca }), P013.dAlho).length > 0);
  });

  /* ── Excedentes ── */

  await teste('C-011 / RN-004..RN-006: o 5710 vende 90 em 90 dias com 100 em estoque e 20 em trânsito — cobertura 120; curva A no departamento 2 (35/20, teto 42): excedente, 85 un. acima do alvo e 78 dias acima do teto', async () => {
    const rows = await linhas('sgcWintMovExcedentes', EXCEDENTES);
    const linha = um(rows, P013.excedente);
    assert.equal(Number(linha.VENDA_PERIODO), 90);
    assert.equal(Number(linha.ESTOQUE_ATUAL), 100);
    assert.equal(Number(linha.COBERTURA_ATUAL_DIAS), 120);
    assert.equal(Number(linha.FATURAMENTO_PERIODO), 90000);
    const coberturas = (await linhas('sgcCoberturaListar', { nivel: '', situacao: 'ativa', limite: 500, offset: 0 })).map(coberturaDeLinha);
    const classificado = classificarExcedentes(rows.map(linhaExcedenteDe), coberturas).find((e) => e.codprod === P013.excedente);
    assert.equal(classificado.curva, 'A');
    assert.equal(classificado.tetoDias, 42);
    assert.equal(classificado.excedente, true);
    assert.equal(classificado.quantidadeExcedente, 85);
    assert.equal(classificado.diasAcimaDoTeto, 78);
    assert.equal(classificado.origemRegra, 'Departamento');
  });

  await teste('C-013: os dois registros de trânsito do 5710 (10 + 10) não duplicam o produto — uma linha, trânsito 20', async () => {
    const linha = um(await linhas('sgcWintMovExcedentes', EXCEDENTES), P013.excedente);
    assert.equal(Number(linha.ESTOQUE_EM_TRANSITO), 20);
  });

  await teste('C-014: o 5703 (estoque sem venda no período) não é excedente — é da aba Sem venda', async () => {
    assert.equal(porCodigo(await linhas('sgcWintMovExcedentes', EXCEDENTES), P013.nuncaVendido).length, 0);
  });

  /* ── A vencer ── */

  await teste('C-016: em TODOS/90 o 5711 L-2025-09 (vencido há 5) vem antes do L-2025-10 (vence em 20) e o 5714 de 200 dias não entra; A_VENCER só o de 20; VENCIDOS só o vencido', async () => {
    const todos = await linhas('sgcWintMovAVencer', A_VENCER);
    const lotes = porCodigo(todos, P013.lotes).map((r) => [r.NUMLOTE, Number(r.DIAS_PARA_VENCER)]);
    assert.deepEqual(lotes, [['L-2025-09', -5], ['L-2025-10', 20]]);
    assert.ok(!todos.some((r) => r.NUMLOTE === 'L-2026-09'));
    const aVencer = await linhas('sgcWintMovAVencer', { ...A_VENCER, situacao: 'A_VENCER' });
    assert.deepEqual(porCodigo(aVencer, P013.lotes).map((r) => r.NUMLOTE), ['L-2025-10']);
    const vencidos = await linhas('sgcWintMovAVencer', { ...A_VENCER, situacao: 'VENCIDOS' });
    assert.deepEqual(porCodigo(vencidos, P013.lotes).map((r) => r.NUMLOTE), ['L-2025-09']);
    assert.ok(vencidos.every((r) => Number(r.DIAS_PARA_VENCER) < 0));
  });

  await teste('C-017 / RN-008: TOTAL com "RITA ESTOQUE", a data e a rotina do evento que BLOQUEOU (não o robô que reescreveu depois); PARCIAL 10 de 30; o liberado sem bloqueio antigo; filtros Bloqueados/Livres; nenhuma coluna de motivo', async () => {
    const rows = await linhas('sgcWintMovAVencer', A_VENCER);
    const total = rows.find((r) => r.NUMLOTE === 'L-2025-09');
    assert.equal(total.SITUACAO_BLOQUEIO, 'TOTAL');
    assert.equal(total.BLOQUEIO_RESPONSAVEL, 'RITA ESTOQUE');
    assert.equal(Number(total.BLOQUEIO_MATRICULA), MATRICULA_BLOQUEIO);
    assert.equal(total.BLOQUEIO_DATA, haDias(20));
    assert.equal(String(total.BLOQUEIO_ROTINA), '6366');
    const parcial = rows.find((r) => r.NUMLOTE === 'L-2026-01');
    assert.equal(parcial.SITUACAO_BLOQUEIO, 'PARCIAL');
    assert.equal(Number(parcial.QT_BLOQUEADA), 10);
    const liberado = rows.find((r) => r.NUMLOTE === 'L-2026-02');
    assert.equal(liberado.SITUACAO_BLOQUEIO, 'LIVRE');
    assert.equal(liberado.BLOQUEIO_RESPONSAVEL, null);
    assert.ok(!Object.keys(total).some((c) => /MOTIVO/.test(c)), 'a consulta inventou um motivo');
    const bloqueados = await linhas('sgcWintMovAVencer', { ...A_VENCER, bloqueio: 'BLOQUEADOS' });
    assert.deepEqual(bloqueados.map((r) => r.NUMLOTE).sort(), ['L-2025-09', 'L-2026-01']);
    const livres = await linhas('sgcWintMovAVencer', { ...A_VENCER, bloqueio: 'LIVRES' });
    assert.ok(livres.some((r) => r.NUMLOTE === 'L-2026-02') && livres.every((r) => Number(r.QT_BLOQUEADA) === 0));
  });

  await teste('C-018 / RN-009: os lotes do 5711 somam 50 contra 40 de estoque — os dois marcados, TOTAL_DIVERGENTES 2, e o valor em risco é o de cada lote', async () => {
    const rows = await linhas('sgcWintMovAVencer', { ...A_VENCER, busca: String(P013.lotes) });
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(Number(r.QT_TOTAL_LOTES), 50);
      assert.equal(Number(r.ESTOQUE_PRODUTO), 40);
      assert.equal(Number(r.DIVERGENTE), 1);
      assert.equal(Number(r.VALOR_EM_RISCO), Number(r.QT_LOTE) * 11);
    }
    assert.equal(Number(rows[0].TOTAL_DIVERGENTES), 2);
    assert.equal(Number(rows[0].TOTAL_VALOR), 550);
  });

  await teste('C-019: a busca l-2025-09 (minúscula) acha o lote pelo número', async () => {
    const rows = await linhas('sgcWintMovAVencer', { ...A_VENCER, busca: 'l-2025-09' });
    assert.deepEqual(rows.map((r) => r.NUMLOTE), ['L-2025-09']);
  });

  await teste('C-020 / RN-007: lote com validade em 1900 e lote excluído não entram; o saldo do lote é o QT', async () => {
    const rows = await linhas('sgcWintMovAVencer', { ...A_VENCER, situacao: 'VENCIDOS' });
    assert.ok(!rows.some((r) => r.NUMLOTE === 'L-1900'));
    const todos = await linhas('sgcWintMovAVencer', { ...A_VENCER, diasHorizonte: 365 });
    assert.ok(!todos.some((r) => r.NUMLOTE === 'L-EXCLUIDO'));
    assert.equal(Number(todos.find((r) => r.NUMLOTE === 'L-2025-09').QT_LOTE), 30);
  });

  /* ── Plano de ação ── */

  const plano = (extra = {}) => ({
    origem: 'sem_venda', codprod: P013.semVenda120, codfilial: '1', descricao: 'LEITE DE COCO 200 ML',
    fato: '', causa: '', acao: '', responsavelId: 0, dataAcompanhamento: '', status: 'aberto', agora: `${haDias(0)}T10:00:00`,
    ...extra,
  });
  const planosDe = (origem, codprods, codfilial = '1') =>
    linhas('sgcMovPlanosListar', { origem, codfilial, codprods, limite: 50, offset: 0 });

  await teste('C-023: com um plano aberto e um concluído, os dois com acompanhamento ontem, o resumo da aba Sem venda na filial 1 conta 2 planos e 1 acompanhamento vencido', async () => {
    const [resumo] = await linhas('sgcMovPlanosResumo', { origem: 'sem_venda', codfilial: '1', hoje: haDias(0) });
    assert.equal(Number(resumo.TOTAL), 2);
    assert.equal(Number(resumo.VENCIDOS), 1);
    assert.equal(Number(resumo.ABERTOS), 1);
  });

  await teste('C-021 / RN-010: a Ana grava o plano do 5701 só com o fato; regrava com "em andamento" — continua um plano só, com a situação nova, ela como quem atualizou; sem fato, causa e ação nada é gravado', async () => {
    await chamar('sgcEscMovPlanoSalvar', plano({ fato: 'Sem giro há 4 meses' }), U.ana);
    await chamar('sgcEscMovPlanoSalvar', plano({ fato: 'Sem giro há 4 meses', status: 'em_andamento' }), U.ana);
    const rows = await planosDe('sem_venda', String(P013.semVenda120));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].STATUS, 'em_andamento');
    assert.equal(rows[0].FATO, 'Sem giro há 4 meses');
    assert.equal(Number(rows[0].ATUALIZADO_POR), U.ana);
    assert.equal(rows[0].ATUALIZADO_POR_NOME, 'Ana Analista');
    await chamar('sgcEscMovPlanoSalvar', plano({ fato: '   ', status: 'concluido' }), U.ana);
    assert.equal((await planosDe('sem_venda', String(P013.semVenda120)))[0].STATUS, 'em_andamento');
  });

  await teste('C-022: o plano do 5711 em A vencer atende os dois lotes (uma linha por produto e filial) e é outro que o de Sem venda', async () => {
    await chamar('sgcEscMovPlanoSalvar', plano({ origem: 'a_vencer', codprod: P013.lotes, descricao: 'GRANOLA', acao: 'Promoção do lote' }), U.gil);
    const aVencer = await planosDe('a_vencer', `${P013.lotes},${P013.parcial}`);
    assert.deepEqual(aVencer.map((r) => Number(r.CODPROD)), [P013.lotes]);
    assert.equal((await planosDe('sem_venda', String(P013.lotes))).length, 0);
    assert.equal((await planosDe('a_vencer', '0')).length, 0, 'codprods 0 = nenhum');
  });

  await teste('C-024 / RN-011: o comercial (Leo) e quem só lê não gravam nem removem — 0 linhas, sem erro; diretoria e gestor gravam', async () => {
    const leitura = db.prepare("INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES ('leitura.mov@sgc.local', 'Lia Leitura Mov', 'READ_ONLY', 1)").run();
    const idLeitura = Number(leitura.lastInsertRowid);
    db.prepare("INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, 'gestor')").run(idLeitura);
    for (const quem of [U.leo, idLeitura]) {
      await chamar('sgcEscMovPlanoSalvar', plano({ codprod: P013.dAlho, fato: 'tentativa' }), quem);
    }
    assert.equal((await planosDe('sem_venda', String(P013.dAlho))).length, 0);
    await chamar('sgcEscMovPlanoSalvar', plano({ codprod: P013.dAlho, fato: 'pela diretoria' }), U.dora);
    assert.equal((await planosDe('sem_venda', String(P013.dAlho)))[0].FATO, 'pela diretoria');
    const [existente] = await planosDe('sem_venda', String(P013.dAlho));
    for (const quem of [U.leo, idLeitura]) await chamar('sgcEscMovPlanoExcluir', { id: existente.ID }, quem);
    assert.equal((await planosDe('sem_venda', String(P013.dAlho))).length, 1, 'quem não pode removeu');
  });

  await teste('C-025: a Ana remove o plano do 5704 e o produto volta sem plano', async () => {
    const [existente] = await planosDe('sem_venda', String(P013.dAlho));
    await chamar('sgcEscMovPlanoExcluir', { id: existente.ID }, U.ana);
    assert.equal((await planosDe('sem_venda', String(P013.dAlho))).length, 0);
  });

  /* ── Alerta de ruptura ── */

  await teste('C-026 / RN-012..RN-014: o 5720 entra com 60 % consumido, ritmo 8,57×, 3 dias reais contra 60 esperados, cobertura 4,7, CRITICO e reposição 218', async () => {
    const rows = await linhas('sgcWintMovRuptura', RUPTURA);
    const r = um(rows, P013.ruptura);
    assert.equal(Number(r.ESTOQUE_INICIAL), 100);
    assert.equal(Number(r.PERC_CONSUMIDO), 60);
    assert.equal(Number(r.FATOR_ACELERACAO), 8.57);
    assert.equal(Number(r.DIAS_CONSUMO_REAL), 3);
    assert.equal(Number(r.DIAS_ESPERADOS), 60);
    assert.equal(Number(r.COBERTURA_COM_TRANSITO), 4.7);
    assert.equal(r.SEVERIDADE, 'CRITICO');
    assert.equal(r.ORIGEM_CURVA, 'COM_HISTORICO');
    assert.equal(Number(r.QT_REPOR_SUGERIDA), 218);
    assert.equal(Number(r.CLIENTES_JANELA), 2);
    assert.equal(Number(r.DIAS_COM_VENDA), 3);
  });

  await teste('C-027: o 5721 (4 un., abaixo da venda mínima 5) e o 5722 (ritmo 1,22×) ficam fora; com venda mínima 1 o 5721 é avaliado e entra', async () => {
    const rows = await linhas('sgcWintMovRuptura', RUPTURA);
    assert.equal(porCodigo(rows, P013.abaixoMinimo).length, 0);
    assert.equal(porCodigo(rows, P013.ritmoBaixo).length, 0);
    const minimo1 = await linhas('sgcWintMovRuptura', { ...RUPTURA, vendaMinima: 1 });
    assert.equal(Number(um(minimo1, P013.abaixoMinimo).PERC_CONSUMIDO), 66.7);
  });

  await teste('C-028: o 5723 sem base entra como SEM_HISTORICO, com fator, tempo esperado e cobertura histórica nulos; desligado, sai', async () => {
    const r = um(await linhas('sgcWintMovRuptura', RUPTURA), P013.semHistorico);
    assert.equal(r.ORIGEM_CURVA, 'SEM_HISTORICO');
    assert.equal(r.FATOR_ACELERACAO, null);
    assert.equal(r.DIAS_ESPERADOS, null);
    assert.equal(r.COBERTURA_RITMO_HISTORICO, null);
    assert.equal(Number(r.PERC_CONSUMIDO), 70);
    assert.ok(Number(r.TOTAL_SEM_HISTORICO) >= 1);
    const desligado = await linhas('sgcWintMovRuptura', { ...RUPTURA, incluirSemHistorico: 0 });
    assert.equal(porCodigo(desligado, P013.semHistorico).length, 0);
  });

  await teste('C-029 / RN-013: severidade RUPTURA (5725, zerado), CRITICO (5720), ALTO (5726, 23 d com trânsito), MEDIO (5727, 43 d), nessa ordem; o filtro CRITICO traz só críticos', async () => {
    const rows = await linhas('sgcWintMovRuptura', { ...RUPTURA, codfilial: '1' });
    const sev = (codprod) => um(rows, codprod).SEVERIDADE;
    assert.equal(sev(P013.zerado), 'RUPTURA');
    assert.equal(sev(P013.ruptura), 'CRITICO');
    assert.equal(sev(P013.alto), 'ALTO');
    assert.equal(Number(um(rows, P013.alto).COBERTURA_COM_TRANSITO), 23);
    assert.equal(sev(P013.monitorar), 'MEDIO');
    const ordem = { RUPTURA: 0, CRITICO: 1, ALTO: 2, MEDIO: 3 };
    const sequencia = rows.map((r) => ordem[r.SEVERIDADE]);
    assert.deepEqual(sequencia, [...sequencia].sort((a, b) => a - b));
    const criticos = await linhas('sgcWintMovRuptura', { ...RUPTURA, codfilial: '1', severidade: 'CRITICO' });
    assert.ok(criticos.length > 0 && criticos.every((r) => r.SEVERIDADE === 'CRITICO'));
    assert.equal(Number(criticos[0].TOTAL_REGISTROS), criticos.length);
  });

  await teste('C-030: o resumo por filial traz a filial 1 e a 2 (5728) com as contagens da lista, ignorando a filial e a severidade escolhidas', async () => {
    const resumo = await linhas('sgcWintMovRupturaFiliais', RUPTURA);
    const f1 = resumo.find((r) => String(r.CODFILIAL) === '1');
    const f2 = resumo.find((r) => String(r.CODFILIAL) === '2');
    assert.ok(f1 && f2);
    const lista1 = await linhas('sgcWintMovRuptura', { ...RUPTURA, codfilial: '1' });
    assert.equal(Number(f1.ALERTAS), lista1.length);
    assert.equal(Number(f1.RUPTURA), lista1.filter((r) => r.SEVERIDADE === 'RUPTURA').length);
    assert.ok(porCodigo(await linhas('sgcWintMovRuptura', { ...RUPTURA, codfilial: '2' }), P013.filial2).length === 1);
  });

  await teste('C-031 (P-05): o 5724 recebeu 50 por transferência na janela — o estoque inicial desconta a transferência (40 + 60 − 50 = 50), 120 % consumido', async () => {
    const r = um(await linhas('sgcWintMovRuptura', RUPTURA), P013.transferencia);
    assert.equal(Number(r.QT_ENTRADA_JANELA), 50);
    assert.equal(Number(r.ESTOQUE_INICIAL), 50);
    assert.equal(Number(r.PERC_CONSUMIDO), 120);
  });

  /* ── Perdas ── */

  await teste('C-033 / RN-015: o lote que venceu ontem com saldo é perda; o que vence hoje e o vencido sem saldo não', async () => {
    const rows = await linhas('sgcWintMovPerdas', PERDAS);
    assert.equal(porCodigo(rows, P013.perdaP1).length, 1);
    assert.equal(porCodigo(rows, P013.venceHoje).length, 0);
    assert.equal(porCodigo(rows, P013.semSaldo).length, 0);
    const aVencer = await linhas('sgcWintMovAVencer', { ...A_VENCER, busca: String(P013.venceHoje) });
    assert.equal(Number(aVencer[0].DIAS_PARA_VENCER), 0, 'vence hoje fica em A vencer');
  });

  await teste('C-034 / RN-016 / RN-017: o P1 vale 12 × R$ 8,00 (custo da entrada do lote, não os R$ 10 da última entrada) = 96,00; entrou na filial 2, veio por transferência e ficou 40 dias parado (a remessa não é venda); o P2 nunca vendeu', async () => {
    const rows = await linhas('sgcWintMovPerdas', PERDAS);
    const p1 = um(rows, P013.perdaP1);
    assert.equal(Number(p1.CUSTO_UNITARIO), 8);
    assert.equal(Number(p1.VALOR_PERDA), 96);
    assert.equal(String(p1.FILIAL_ENTRADA), '2');
    assert.equal(p1.OPER_ENTRADA, 'E');
    assert.equal(Number(p1.QT_TRANSFERENCIAS), 1);
    assert.equal(String(p1.FILIAL_ULT_TRANSF_ORIGEM), '2');
    assert.equal(String(p1.FILIAL_ULT_TRANSF_DESTINO), '1');
    assert.equal(p1.DT_ULT_VENDA, haDias(41));
    assert.equal(Number(p1.DIAS_SEM_VENDA), 40);
    assert.equal(Number(p1.QT_VENDIDA_FILIAL), 8);
    assert.equal(Number(p1.DIAS_VENCIDO), 1);
    const p2 = um(rows, P013.nuncaVendidoP2);
    assert.equal(p2.DT_ULT_VENDA, null);
    assert.ok(Number(p1.TOTAL_COM_TRANSFERENCIA) >= 1 && Number(p1.TOTAL_NUNCA_VENDIDOS) >= 1);
    assert.equal(Number(p1.TOTAL_PRODUTOS), new Set(rows.map((r) => Number(r.CODPROD))).size);
  });

  await teste('RN-007: o mesmo lote vencido (5711 L-2025-09) tem o mesmo saldo em A vencer e em Perdas', async () => {
    const perda = (await linhas('sgcWintMovPerdas', PERDAS)).find((r) => r.NUMLOTE === 'L-2025-09');
    const vencido = (await linhas('sgcWintMovAVencer', { ...A_VENCER, situacao: 'VENCIDOS' })).find((r) => r.NUMLOTE === 'L-2025-09');
    assert.equal(Number(perda.QT_PERDIDA), Number(vencido.QT_LOTE));
  });

  await teste('C-035: o resumo das perdas por filial traz a 1 e a 3 com o valor de cada uma, e ignora a filial escolhida', async () => {
    const lista = await linhas('sgcWintMovPerdas', PERDAS);
    const resumo = await linhas('sgcWintMovPerdasFiliais', PERDAS);
    for (const filial of ['1', '3']) {
      const linha = resumo.find((r) => String(r.CODFILIAL) === filial);
      const soma = lista.filter((r) => String(r.CODFILIAL) === filial).reduce((s, r) => s + Number(r.VALOR_PERDA), 0);
      assert.equal(Number(linha.VALOR_PERDA), Math.round(soma * 100) / 100, `filial ${filial}`);
    }
    const so3 = await linhas('sgcWintMovPerdas', { ...PERDAS, codfilial: '3' });
    assert.ok(so3.length > 0 && so3.every((r) => String(r.CODFILIAL) === '3'));
  });

  await teste('C-036 / RN-001: o 5734 (departamento 4, bonificação) vencido com saldo fica fora do universo padrão e entra em "inclui bonificação e silenciados"', async () => {
    assert.equal(porCodigo(await linhas('sgcWintMovPerdas', PERDAS), P013.bonificacao).length, 0);
    assert.equal(porCodigo(await linhas('sgcWintMovPerdas', { ...PERDAS, incluirExcecoes: 1 }), P013.bonificacao).length, 1);
  });

  await teste('C-037 (P-02): a linha do tempo do P1, em ordem e em todas as filiais — entrada por compra, saída e entrada da transferência (origem 2, destino 1), vendas e a remessa marcada', async () => {
    const rows = await linhas('sgcWintMovLoteHistorico', { codprod: P013.perdaP1, numlote: 'P1', limite: 300 });
    assert.deepEqual(rows.map((r) => r.CODOPER), ['E', 'ST', 'ET', 'S', 'S', 'S', 'S']);
    assert.deepEqual(rows.map((r) => r.DTMOV), [...rows.map((r) => r.DTMOV)].sort());
    const et = rows.find((r) => r.CODOPER === 'ET');
    assert.equal(String(et.FILIAL_ORIGEM), '2');
    assert.equal(et.SENTIDO, 'ENTRADA');
    assert.equal(String(rows.find((r) => r.CODOPER === 'ST').FILIAL_DESTINO), '1');
    const remessas = rows.filter((r) => Number(r.REMESSA) === 1);
    assert.equal(remessas.length, 1);
    assert.equal(remessas[0].DTMOV, haDias(10));
  });

  /* ── WinThor real (regra 7 do CLAUDE.md) ── */

  const winthor = await abrirWinthor({ log: { log() {}, warn() {} } });
  if (!winthor) {
    console.log('  --  WinThor real: SIMULATOR_WINTHOR=oracle não está ligado — bloco das sgcWint* da 013 no Oracle pulado');
    return;
  }
  try {
    const rodar = (nome, input) => winthor.query(bindParams(definitions.find((d) => d.name === nome).code, input, 0));
    const [alvo] = await winthor.query(`SELECT * FROM (
      SELECT L.CODFILIAL, COUNT(*) AS LOTES FROM PCLOTE L
      WHERE NVL(L.QT, 0) > 0 AND L.DTEXCLUSAO IS NULL AND L.DTVALIDADE IS NOT NULL
      GROUP BY L.CODFILIAL ORDER BY COUNT(*) DESC) WHERE ROWNUM <= 1`);
    const real = { codfilial: String(alvo.CODFILIAL), codfornec: 0, codepto: 0, busca: '', incluirPublico: 0, limite: 50, offset: 0 };
    const medidas = [];
    const provar = async (titulo, nome, input) => {
      const inicio = Date.now();
      const rows = await rodar(nome, input);
      medidas.push(`${nome} ${rows.length} (${Date.now() - inicio} ms)`);
      assert.ok(rows.length > 0, `${nome} devolveu zero linha no WinThor real (${titulo})`);
      return rows;
    };
    await teste(`WinThor real: as nove sgcWint* da 013 devolvem contagem > 0 (filial ${real.codfilial}, a de mais lotes com saldo)`, async () => {
      await provar('departamentos', 'sgcWintDepartamentos', {});
      await provar('sem venda', 'sgcWintMovSemVenda', { ...real, diasSemVenda: 90, somenteComEstoque: 1, janelaDias: 720 });
      await provar('excedentes', 'sgcWintMovExcedentes', { ...real, diasPeriodo: 90, limite: 3000 });
      await provar('a vencer', 'sgcWintMovAVencer', { ...real, situacao: 'TODOS', diasHorizonte: 365, bloqueio: 'TODOS' });
      const ruptura = { ...real, codfilial: '', ...parametrosRuptura({ ...PADRAO_RUPTURA, diasJanela: 30, limiarPerc: 30, fatorMinimo: 1.2, vendaMinima: 1 }), severidade: '' };
      await provar('ruptura', 'sgcWintMovRuptura', ruptura);
      await provar('ruptura por filial', 'sgcWintMovRupturaFiliais', ruptura);
      const perdas = await provar('perdas', 'sgcWintMovPerdas', { ...real, codfilial: '', diasVencidos: 0, incluirExcecoes: 1 });
      await provar('perdas por filial', 'sgcWintMovPerdasFiliais', { ...real, codfilial: '', diasVencidos: 0, incluirExcecoes: 1 });
      const lote = perdas[0];
      await provar('linha do tempo', 'sgcWintMovLoteHistorico', { codprod: Number(lote.CODPROD), numlote: String(lote.NUMLOTE), limite: 300 });
      console.log(`          ${medidas.join(' · ')}`);
    });
  } finally {
    await winthor.fechar();
  }
}
