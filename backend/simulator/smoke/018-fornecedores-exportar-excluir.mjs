// Cenários C-001..C-010 e regras RN-004..RN-008 da spec 018 (fornecedores:
// exportar a parametrização e excluí-la guardando uma cópia). Ver
// docs/specs/018-fornecedores-exportar-excluir/plan.md §Testes.
//
// Autossuficiente: o fornecedor excluído (1099, SANT'ANNA, do cadastro do ERP
// simulado) é parametrizado aqui e apagado aqui — as contagens de 1015/1042/1088
// que as outras suítes leem não mudam. As recusas (C-006, C-007) rodam sobre o
// 1015 e provam que ele fica intacto.
import { assert } from './base.mjs';

/** A ordem da tela (ESCRITAS_EXCLUSAO de frontend/src/lib/fornecedor-planilha.ts). */
const ESCRITAS_EXCLUSAO = [
  'sgcEscFornecedorExclusaoRegistrar',
  'sgcEscFornecedorExclusaoContatos',
  'sgcEscFornecedorExclusaoFaixas',
  'sgcEscFornecedorExclusaoLinhas',
  'sgcEscFornecedorExclusaoFiliais',
  'sgcEscFornecedorExclusaoDocumentos',
  'sgcEscFornecedorExclusaoFornecedor',
];

export async function suite(ctx) {
  const { chamar, teste, U, db } = ctx;
  const agora = '2026-11-03T10:00:00';

  function payload1099() {
    return {
      fornecedor: {
        codfornec: 1099, fornecedor: "SANT'ANNA NUTRICAO LTDA", cnpj: '33414711000161', cnpjFormatado: '33.414.711/0001-61',
        prazoEntregaDias: 5, prazoEntregaTipo: 'corridos', pedidoMinimo: 1500, fechamentoDiaInicio: 1, fechamentoDiaFim: 10,
        linkPlataforma: '', validadeMinimaDias: 90, slaAnaliseDias: 0, slaFaturamentoDias: 0, ativo: 1,
      },
      filiais: [{ codfilial: '1', filial: 'Benenutri Matriz' }],
      linhas: [{
        nome: 'Suplementos',
        contatos: [{ nome: 'Rita', email: 'rita@santanna.com.br' }],
        faixas: [
          { valorDe: 0, valorAte: 10000, rotulo: 'Opção única', parcelas: '28' },
          { valorDe: 10000, valorAte: 0, rotulo: 'Opção única', parcelas: '28/56' },
        ],
      }],
      documentos: [{ tipo: 'Documento', nome: 'Contrato 2026', endereco: 'https://arquivos.exemplo/contrato.pdf', vencimento: '2027-01-31' }],
    };
  }

  const contar = (sql, ...args) => Number(db.prepare(sql).get(...args).N);
  const idDe = (codfornec) => db.prepare('SELECT ID FROM SGC_FORNECEDOR WHERE CODFORNEC = ?').get(codfornec)?.ID ?? 0;
  /** Filhas de uma parametrização pelo ID (o que sobra depois de apagar o pai). */
  function filhas(id) {
    return {
      filiais: contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_FILIAL WHERE FORNECEDOR_ID = ?', id),
      linhas: contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_LINHA WHERE FORNECEDOR_ID = ?', id),
      contatos: contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_LINHA_CONTATO C JOIN SGC_FORNECEDOR_LINHA L ON L.ID = C.LINHA_ID WHERE L.FORNECEDOR_ID = ?', id),
      faixas: contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_FAIXA_PRAZO F JOIN SGC_FORNECEDOR_LINHA L ON L.ID = F.LINHA_ID WHERE L.FORNECEDOR_ID = ?', id),
      documentos: contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_DOCUMENTO WHERE FORNECEDOR_ID = ?', id),
    };
  }
  const copias = (codfornec) => db.prepare('SELECT * FROM SGC_FORNECEDOR_EXCLUSAO WHERE CODFORNEC = ? ORDER BY ID').all(codfornec);

  /** O que a tela faz (exportar-excluir.ts): relê, guarda a cópia sem o log e apaga na ordem. */
  async function excluir(codfornec, usuario, { ate = ESCRITAS_EXCLUSAO.length } = {}) {
    const dados = await chamar('sgcFornecedorCarregar', { codfornec }, usuario);
    const { log: _log, ...copia } = dados;
    for (const nome of ESCRITAS_EXCLUSAO.slice(0, ate)) {
      await chamar(nome, { codfornec, detalhe: JSON.stringify(copia), agora }, usuario);
    }
    return chamar('sgcFornecedorCarregar', { codfornec }, usuario);
  }

  async function parametrizar1099() {
    const salvo = await chamar('sgcFornecedorSalvar', { payload: payload1099() }, U.gil);
    assert.equal(salvo.ok, true, salvo.error);
    // Duas alterações no histórico (C-005): muda o pedido mínimo e a validade.
    const segunda = payload1099();
    segunda.fornecedor.pedidoMinimo = 2000;
    segunda.fornecedor.validadeMinimaDias = 120;
    const alterado = await chamar('sgcFornecedorSalvar', { payload: segunda }, U.gil);
    assert.equal(alterado.ok, true, alterado.error);
    return idDe(1099);
  }

  await teste('C-001/RNF-001: a exportação traz todos os parametrizados, na ordem do nome, com as filhas da abertura', async () => {
    const total = Number((await chamar('sgcFornecedorListarTotal', { busca: '', codfilial: '', ativo: 0 })).rows[0].TOTAL);
    assert.ok(total >= 3, 'vazio não é verde');

    const tudo = await chamar('sgcFornecedorExportar', { codfornec: 0, limite: 100, offset: 0 });
    assert.equal(tudo.fornecedores.length, total, 'ativos e inativos, sem filtro');
    const nomes = tudo.fornecedores.map((f) => String(f.FORNECEDOR));
    assert.deepEqual(nomes, [...nomes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), 'ordem do nome');
    assert.ok(tudo.fornecedores.some((f) => Number(f.ATIVO) === 0), 'o inativo (1088) entra');

    const aberto = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    const id1015 = Number(aberto.fornecedor.ID);
    const linhas1015 = tudo.linhas.filter((l) => Number(l.FORNECEDOR_ID) === id1015);
    const idsLinhas = new Set(linhas1015.map((l) => Number(l.ID)));
    assert.equal(tudo.filiais.filter((f) => Number(f.FORNECEDOR_ID) === id1015).length, aberto.filiais.length);
    assert.equal(linhas1015.length, aberto.linhas.length);
    assert.equal(tudo.contatos.filter((c) => idsLinhas.has(Number(c.LINHA_ID))).length, aberto.contatos.length);
    assert.equal(tudo.faixas.filter((f) => idsLinhas.has(Number(f.LINHA_ID))).length, aberto.faixas.length);
    assert.equal(tudo.documentos.filter((d) => Number(d.FORNECEDOR_ID) === id1015).length, aberto.documentos.length);
    assert.ok(aberto.linhas.length > 0 && aberto.faixas.length > 0, 'o 1015 tem linhas e faixas para comparar');

    // Blocos de 2: as páginas somam o total, sem repetir fornecedor.
    const vistos = [];
    for (let offset = 0; offset < total + 2; offset += 2) {
      const pagina = await chamar('sgcFornecedorExportar', { codfornec: 0, limite: 2, offset });
      assert.ok(pagina.fornecedores.length <= 2);
      vistos.push(...pagina.fornecedores.map((f) => Number(f.CODFORNEC)));
      if (pagina.fornecedores.length < 2) break;
    }
    assert.equal(vistos.length, total);
    assert.equal(new Set(vistos).size, total);
  });

  await teste('C-002: a exportação de um código traz só aquele fornecedor, com o que está gravado', async () => {
    const um = await chamar('sgcFornecedorExportar', { codfornec: 1015, limite: 100, offset: 0 });
    assert.deepEqual(um.fornecedores.map((f) => Number(f.CODFORNEC)), [1015]);
    const gravado = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    assert.equal(Number(um.fornecedores[0].PEDIDO_MINIMO), Number(gravado.fornecedor.PEDIDO_MINIMO));
    assert.equal(um.linhas.length, gravado.linhas.length);
    assert.ok(um.filiais.every((f) => Number(f.FORNECEDOR_ID) === Number(um.fornecedores[0].ID)));

    const nenhum = await chamar('sgcFornecedorExportar', { codfornec: 424242, limite: 100, offset: 0 });
    assert.equal(nenhum.fornecedores.length, 0);
    assert.equal(nenhum.linhas.length, 0);
  });

  await teste('C-006/RN-005: analista e somente leitura não excluem — nenhuma cópia, nada apagado', async () => {
    const id1015 = idDe(1015);
    const antes = filhas(id1015);
    assert.ok(antes.filiais > 0 && antes.linhas > 0, 'o 1015 tem o que apagar');

    const depoisAnalista = await excluir(1015, U.ana);
    assert.ok(depoisAnalista.fornecedor, 'a parametrização continua');
    assert.equal(copias(1015).length, 0, 'nenhuma cópia');
    assert.deepEqual(filhas(id1015), antes);

    // Somente leitura com persona de quem parametriza: o nível da plataforma vale além da persona.
    const leitor = db.prepare("INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES ('leitura.forn@sgc.local', 'Lia Leitura Forn', 'READ_ONLY', 1)").run();
    const leitorId = Number(leitor.lastInsertRowid);
    db.prepare("INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, 'gestor')").run(leitorId);
    const depoisLeitor = await excluir(1015, leitorId);
    assert.ok(depoisLeitor.fornecedor);
    assert.equal(copias(1015).length, 0);
    assert.deepEqual(filhas(id1015), antes);
  });

  await teste('C-007/RN-006: sem a cópia guardada, nenhuma exclusão apaga nada', async () => {
    const id1015 = idDe(1015);
    const antes = filhas(id1015);
    for (const nome of ESCRITAS_EXCLUSAO.slice(1)) await chamar(nome, { codfornec: 1015 }, U.gil);
    assert.ok(idDe(1015), 'o fornecedor continua');
    assert.deepEqual(filhas(id1015), antes);
    assert.equal(copias(1015).length, 0);
  });

  await teste('C-005/RN-004/RN-008: o gestor exclui o 1099 — cópia inteira, filhas apagadas, histórico e ERP intactos', async () => {
    const id = await parametrizar1099();
    assert.deepEqual(filhas(id), { filiais: 1, linhas: 1, contatos: 1, faixas: 2, documentos: 1 });
    const logAntes = contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_LOG WHERE FORNECEDOR_ID = ?', id);
    assert.ok(logAntes >= 2, 'há histórico para preservar');
    const id1015 = idDe(1015);
    const de1015 = filhas(id1015);
    const erpAntes = contar('SELECT COUNT(*) AS N FROM PCFORNEC WHERE CODFORNEC = 1099');

    const depois = await excluir(1099, U.gil);
    assert.equal(depois.fornecedor, null, 'a abertura diz que não há parametrização');
    assert.deepEqual(filhas(id), { filiais: 0, linhas: 0, contatos: 0, faixas: 0, documentos: 0 });

    const [copia] = copias(1099);
    assert.ok(copia, 'a cópia foi guardada');
    assert.equal(Number(copia.FORNECEDOR_ID), id);
    assert.equal(copia.FORNECEDOR, "SANT'ANNA NUTRICAO LTDA");
    assert.equal(copia.CNPJ, '33414711000161');
    assert.equal(Number(copia.EXCLUIDO_POR), U.gil);
    assert.equal(copia.EXCLUIDO_EM, agora);
    const detalhe = JSON.parse(copia.DETALHE);
    assert.equal(Number(detalhe.fornecedor.PEDIDO_MINIMO), 2000);
    assert.equal(detalhe.filiais.length, 1);
    assert.equal(detalhe.linhas.length, 1);
    assert.equal(detalhe.contatos.length, 1);
    assert.equal(detalhe.faixas.length, 2);
    assert.equal(detalhe.documentos.length, 1);
    assert.equal(detalhe.documentos[0].ENDERECO, 'https://arquivos.exemplo/contrato.pdf', 'P-07: a cópia guarda o endereço');
    assert.equal(detalhe.log, undefined, 'P-04: o histórico fica na tabela dele, não na cópia');

    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_FORNECEDOR_LOG WHERE FORNECEDOR_ID = ?', id), logAntes, 'P-04: o histórico fica');
    assert.equal(contar('SELECT COUNT(*) AS N FROM PCFORNEC WHERE CODFORNEC = 1099'), erpAntes, 'o ERP não muda');
    assert.deepEqual(filhas(id1015), de1015, 'os outros fornecedores não mudam');
    const lista = await chamar('sgcFornecedorListar', { busca: '1099', codfilial: '', ativo: 0, limite: 20, offset: 0 });
    assert.equal(lista.rows.length, 0, 'sai da lista de parametrizados');
  });

  await teste('C-009: parametrizar de novo depois de excluir começa do zero; excluir de novo guarda a segunda cópia', async () => {
    const salvo = await chamar('sgcFornecedorSalvar', { payload: { ...payload1099(), linhas: [], documentos: [] } }, U.gil);
    assert.equal(salvo.ok, true, salvo.error);
    const aberto = await chamar('sgcFornecedorCarregar', { codfornec: 1099 });
    assert.equal(aberto.linhas.length, 0, 'nada da parametrização excluída reaparece');
    assert.equal(aberto.documentos.length, 0);
    assert.equal(aberto.filiais.length, 1, 'só o que foi salvo agora');
    // Parametrização nova, id novo: o histórico da excluída (que mudou o mínimo para 2000) não volta.
    assert.notEqual(Number(aberto.fornecedor.ID), Number(copias(1099)[0].FORNECEDOR_ID));
    assert.ok(!aberto.log.some((l) => String(l.PARA) === '2000.00'), 'histórico novo');

    const depois = await excluir(1099, U.dora);
    assert.equal(depois.fornecedor, null, 'a diretoria também exclui');
    const todas = copias(1099);
    assert.equal(todas.length, 2, 'a primeira cópia continua');
    assert.equal(JSON.parse(todas[0].DETALHE).linhas.length, 1);
    assert.equal(JSON.parse(todas[1].DETALHE).linhas.length, 0);
    assert.equal(Number(todas[1].EXCLUIDO_POR), U.dora);
  });

  await teste('C-008: exclusão interrompida termina na segunda tentativa, com uma cópia só — a primeira', async () => {
    const id = await parametrizar1099();
    const anteriores = copias(1099).length;

    // Parou no meio: a cópia foi guardada e só as filiais foram apagadas.
    await excluir(1099, U.gil, { ate: 1 });
    await chamar('sgcEscFornecedorExclusaoFiliais', { codfornec: 1099 }, U.gil);
    assert.deepEqual(filhas(id), { filiais: 0, linhas: 1, contatos: 1, faixas: 2, documentos: 1 }, 'o resto ainda está lá');
    assert.ok(idDe(1099));

    const depois = await excluir(1099, U.gil);
    assert.equal(depois.fornecedor, null);
    assert.deepEqual(filhas(id), { filiais: 0, linhas: 0, contatos: 0, faixas: 0, documentos: 0 });
    const desta = copias(1099).filter((c) => Number(c.FORNECEDOR_ID) === id);
    assert.equal(copias(1099).length, anteriores + 1);
    assert.equal(desta.length, 1, 'uma cópia por parametrização');
    const detalhe = JSON.parse(desta[0].DETALHE);
    assert.equal(detalhe.filiais.length, 1, 'a cópia é a primeira, com a filial que já foi apagada');
    assert.equal(detalhe.linhas.length, 1);
  });

  await teste('C-010/RN-007: pedido e agendamento do fornecedor não bloqueiam a exclusão e continuam', async () => {
    await parametrizar1099();
    const pedido = db.prepare("INSERT INTO SGC_PEDIDO (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL) VALUES (990018, 1099, 'SANT''ANNA NUTRICAO LTDA', '1', 'Benenutri Matriz')").run();
    const agenda = db.prepare("INSERT INTO SGC_AGENDA (CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM) VALUES (1099, 'SANT''ANNA NUTRICAO LTDA', '1', 'Benenutri Matriz', '2026-11-20', '2026-10-01', '2026-10-31')").run();

    const depois = await excluir(1099, U.gil);
    assert.equal(depois.fornecedor, null, 'não bloqueia (como o legado)');
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_PEDIDO WHERE ID = ?', Number(pedido.lastInsertRowid)), 1, 'o pedido continua');
    assert.equal(contar('SELECT COUNT(*) AS N FROM SGC_AGENDA WHERE ID = ?', Number(agenda.lastInsertRowid)), 1, 'o agendamento continua');

    db.prepare('DELETE FROM SGC_PEDIDO WHERE ID = ?').run(Number(pedido.lastInsertRowid));
    db.prepare('DELETE FROM SGC_AGENDA WHERE ID = ?').run(Number(agenda.lastInsertRowid));
  });
}
