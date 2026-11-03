// Cenários e regras da spec 019 (projeção manual). Ver
// docs/specs/019-projecao-manual/plan.md §Testes.
//
// A conta (o fator na régua e nos modelos, a validade, o selo, o filtro) é
// regra pura e vive em frontend/tests/projecao-manual.test.mjs; aqui fica o
// que só a server function real responde: a validação e a guarda do servidor,
// o upsert de uma linha por produto e a remoção. Sem consulta ao WinThor.
//
// R-045: nenhuma asserção literal sobre listagem global — os produtos 5401-5403
// do fornecedor 1042 (seed da 011) e a filial 1 são desta suíte, e a tabela é
// limpa no começo.

import { assert } from './base.mjs';
import { FILIAL_011, FORNECEDOR_011 } from '../seed/011-compras-inteligentes.mjs';

const OUTRA_FILIAL = '2';

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;
  db.exec('DELETE FROM SGC_PROJECAO_MANUAL');

  const linhas = async (nome, input, userId) => (await chamar(nome, input, userId)).rows ?? [];
  const listar = (codfilial = FILIAL_011) => linhas('sgcProjecaoManualListar', {
    codfornec: FORNECEDOR_011, codfilial, limite: 600, offset: 0,
  });
  const doProduto = async (codprod, codfilial = FILIAL_011) => (await listar(codfilial)).find((r) => Number(r.CODPROD) === codprod);
  const salvar = (valores, userId = U.gil) => chamar('sgcEscProjecaoManualSalvar', {
    codfornec: FORNECEDOR_011, codfilial: FILIAL_011, codprod: 5401, percentual: 20,
    validaAte: '2026-12-03', motivo: 'campanha de novembro', atualizadoEm: '2026-11-03T09:00:00', ...valores,
  }, userId);
  const remover = (codprod, userId = U.gil) => chamar('sgcEscProjecaoManualRemover', {
    codfornec: FORNECEDOR_011, codfilial: FILIAL_011, codprod, atualizadoEm: '2026-11-03T10:00:00',
  }, userId);
  const linhasNaTabela = () => Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_PROJECAO_MANUAL').get().N);

  await teste('019 C-013 / RN-007: o gestor grava o ajuste de +20 % do 5401; analista, diretoria e comercial nao gravam (0 linhas)', async () => {
    await salvar({ motivo: 'tentativa do analista' }, U.ana);
    await salvar({ motivo: 'tentativa da diretoria' }, U.dora);
    await salvar({ motivo: 'tentativa do comercial' }, U.leo);
    assert.equal(linhasNaTabela(), 0, 'so admin e gestor ajustam a projecao');

    await salvar({});
    const gravado = await doProduto(5401);
    assert.ok(gravado, 'o gestor ajusta');
    assert.equal(Number(gravado.PERCENTUAL), 20);
    assert.equal(String(gravado.VALIDA_ATE), '2026-12-03');
    assert.equal(String(gravado.MOTIVO), 'campanha de novembro');
    assert.equal(Number(gravado.ATUALIZADO_POR), U.gil, ':VAR_USER e quem gravou');
  });

  await teste('019 C-005 / RN-004: o servidor recusa percentual zero, abaixo de -90, acima de +300, validade vazia e motivo com menos de 5 letras — nada muda no ajuste gravado', async () => {
    for (const recusado of [
      { codprod: 5402, percentual: 0 },
      { codprod: 5402, percentual: -95 },
      { codprod: 5402, percentual: 350 },
      { codprod: 5402, validaAte: '' },
      { codprod: 5402, motivo: 'abc' },
      { codprod: 0 },
    ]) {
      await salvar(recusado);
    }
    assert.equal(await doProduto(5402), undefined, 'nenhuma recusa grava');
    assert.equal(linhasNaTabela(), 1);
    // Os limites da faixa sao validos.
    await salvar({ codprod: 5402, percentual: -90 });
    await salvar({ codprod: 5403, percentual: 300 });
    assert.equal(Number((await doProduto(5402)).PERCENTUAL), -90);
    assert.equal(Number((await doProduto(5403)).PERCENTUAL), 300);
  });

  await teste('019 C-014 / RN-006: regravar o 5401 atualiza a MESMA linha (upsert por fornecedor + filial + produto) e o ajuste da filial 1 nao aparece na filial 2', async () => {
    const antes = linhasNaTabela();
    await salvar({ percentual: 12.5, validaAte: '2026-11-30', motivo: 'cliente novo a partir de dezembro' });
    assert.equal(linhasNaTabela(), antes, 'uma linha por produto, fornecedor e filial');
    const gravado = await doProduto(5401);
    assert.equal(Number(gravado.PERCENTUAL), 12.5, 'uma casa decimal');
    assert.equal(String(gravado.VALIDA_ATE), '2026-11-30');
    assert.equal(String(gravado.MOTIVO), 'cliente novo a partir de dezembro');
    assert.equal(await doProduto(5401, OUTRA_FILIAL), undefined, 'o ajuste e da filial');
    assert.equal((await listar(OUTRA_FILIAL)).length, 0);
  });

  await teste('019 C-006 / RN-005: remover como gestor zera percentual e validade e guarda quem removeu; a lista nao traz mais o 5401; o analista nao remove', async () => {
    await remover(5402, U.ana);
    assert.ok(await doProduto(5402), 'o analista nao remove');

    await remover(5401);
    assert.equal(await doProduto(5401), undefined, 'removido sai da lista');
    const linha = db.prepare('SELECT PERCENTUAL, VALIDA_ATE, ATUALIZADO_POR, ATUALIZADO_EM FROM SGC_PROJECAO_MANUAL WHERE CODPROD = 5401').get();
    assert.equal(Number(linha.PERCENTUAL), 0);
    assert.equal(String(linha.VALIDA_ATE), '');
    assert.equal(Number(linha.ATUALIZADO_POR), U.gil);
    assert.equal(String(linha.ATUALIZADO_EM), '2026-11-03T10:00:00');

    // Pode ser gravado de novo depois (a linha volta a valer).
    await salvar({ percentual: 20 });
    assert.equal(Number((await doProduto(5401)).PERCENTUAL), 20);
  });

  await teste('019 RN-001: a lista devolve o ajuste vencido tambem (a tela decide pela data), so os do fornecedor e com PERCENTUAL diferente de zero', async () => {
    await salvar({ codprod: 5403, percentual: 30, validaAte: '2026-01-01' });
    const rows = await listar();
    assert.ok(rows.length > 0);
    assert.equal(String(rows.find((r) => Number(r.CODPROD) === 5403).VALIDA_ATE), '2026-01-01');
    assert.ok(rows.every((r) => Number(r.CODFORNEC) === FORNECEDOR_011 && Number(r.PERCENTUAL) !== 0));
    assert.deepEqual(rows.map((r) => Number(r.CODPROD)), [5401, 5402, 5403], 'ordem por produto');
  });
}
