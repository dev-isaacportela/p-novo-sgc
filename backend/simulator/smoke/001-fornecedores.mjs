// Cenários C-001..C-008 e regras RN-001..RN-014 da spec 001 (fornecedores).
// Ver docs/specs/001-fornecedores/plan.md §Testes.
//
// Ordem de execução (não é a ordem numérica dos cenários): C-002/C-008 são
// leitura pura sobre o seed pristino e precisam rodar ANTES de qualquer save
// bem-sucedido que mude contagem de filial/linha do 1015 ou do 1088 — senão
// as próprias contagens que C-002 verifica mudariam. C-001 (parametriza o
// 1088 do zero, com filiais 1 e 2) roda por último porque a seção Simulador
// do plan diz que o 1088 do seed atende só a filial 1 (fixture de C-002); as
// mutações em 1015 (C-003 sem alteração real, C-004 recusado, C-005, C-006,
// C-007) seguem a ordem em que uma depende do resultado da anterior.
import { assert } from './base.mjs';

export async function suite(ctx) {
  const { chamar, teste, U } = ctx;

  function payload1015() {
    return {
      fornecedor: {
        codfornec: 1015, fornecedor: 'FRESENIUS KABI BRASIL LTDA', cnpj: '49324221000104', cnpjFormatado: '49.324.221/0001-04',
        prazoEntregaDias: 7, prazoEntregaTipo: 'uteis', pedidoMinimo: 5000, fechamentoDiaInicio: 7, fechamentoDiaFim: 15,
        linkPlataforma: '', validadeMinimaDias: 120, slaAnaliseDias: 0, slaFaturamentoDias: 0, ativo: 1,
      },
      filiais: [{ codfilial: '1', filial: 'Benenutri Matriz' }, { codfilial: '2', filial: 'Benenutri Filial Norte' }],
      linhas: [
        {
          nome: 'Nutrição Enteral',
          contatos: [
            { nome: 'Mônica', email: 'captacao.pedidos@fresenius-kabi.com' },
            { nome: 'Elaine', email: 'elaine.santos@fresenius-kabi.com' },
          ],
          faixas: [{ valorDe: 0, valorAte: 0, rotulo: 'Opção única', parcelas: '30/60/90' }],
        },
        {
          nome: 'Nutrição Parenteral',
          contatos: [{ nome: 'Lauanda', email: 'lauanda.oliveira@fresenius-kabi.com' }],
          faixas: [
            { valorDe: 0, valorAte: 20000, rotulo: 'Opção única', parcelas: '30' },
            { valorDe: 20000, valorAte: 45000, rotulo: 'Opção única', parcelas: '30/45' },
            { valorDe: 45000, valorAte: 0, rotulo: 'Opção A', parcelas: '30/45/60' },
            { valorDe: 45000, valorAte: 0, rotulo: 'Opção B', parcelas: '30/60' },
          ],
        },
      ],
      documentos: [],
    };
  }

  await teste('C-008: consultas do ERP (WinThor) devolvem contagem > 0 e descartam os registros genéricos', async () => {
    const fornecedores = await chamar('sgcWintFornecedores', { busca: '' });
    assert.ok(fornecedores.rows.length > 0, 'vazio não é verde');
    assert.ok(!fornecedores.rows.some((r) => Number(r.CODFORNEC) === 999999));

    const nestle = await chamar('sgcWintFornecedores', { busca: 'nestle' });
    assert.equal(nestle.rows.length, 1);

    // Achado 1 da onda 3: o texto digitado é CONCATENADO, nunca colado dentro
    // de `'%…%'` — com o literal antigo o apóstrofo fechava a aspa e a consulta
    // estourava por sintaxe (ou devolvia o que o atacante escrevesse).
    const apostrofo = await chamar('sgcWintFornecedores', { busca: "SANT'ANNA" });
    assert.equal(apostrofo.rows.length, 1, 'o fornecedor com apóstrofo é encontrado, e a consulta não quebra');
    assert.equal(Number(apostrofo.rows[0].CODFORNEC), 1099);

    const filiais = await chamar('sgcWintFiliais', {});
    assert.ok(filiais.rows.length > 0, 'vazio não é verde');
    assert.ok(!filiais.rows.some((r) => String(r.CODFILIAL) === '99'));
  });

  await teste('C-002: listagem com busca, filtro de filial e situação (RN-013)', async () => {
    const semFiltro = await chamar('sgcFornecedorListar', { busca: '', codfilial: '', ativo: 0, limite: 20, offset: 0 });
    assert.equal(semFiltro.rows.length, 3);
    const totalSemFiltro = await chamar('sgcFornecedorListarTotal', { busca: '', codfilial: '', ativo: 0 });
    assert.equal(Number(totalSemFiltro.rows[0].TOTAL), 3);

    const porFilial = await chamar('sgcFornecedorListar', { busca: '', codfilial: '2', ativo: 0, limite: 20, offset: 0 });
    assert.deepEqual(porFilial.rows.map((r) => Number(r.CODFORNEC)).sort((a, b) => a - b), [1015, 1042]);
    const totalPorFilial = await chamar('sgcFornecedorListarTotal', { busca: '', codfilial: '2', ativo: 0 });
    assert.equal(Number(totalPorFilial.rows[0].TOTAL), 2);

    const ativos = await chamar('sgcFornecedorListar', { busca: '', codfilial: '', ativo: 1, limite: 20, offset: 0 });
    assert.equal(ativos.rows.length, 2);
    assert.ok(!ativos.rows.some((r) => Number(r.CODFORNEC) === 1088));

    const inativos = await chamar('sgcFornecedorListar', { busca: '', codfilial: '', ativo: 2, limite: 20, offset: 0 });
    assert.equal(inativos.rows.length, 1);
    assert.equal(Number(inativos.rows[0].CODFORNEC), 1088);

    const busca = await chamar('sgcFornecedorListar', { busca: 'fresenius', codfilial: '', ativo: 0, limite: 20, offset: 0 });
    assert.equal(busca.rows.length, 1);
    assert.equal(Number(busca.rows[0].QT_FILIAIS), 2);
    assert.equal(Number(busca.rows[0].QT_LINHAS), 2);

    const paginado = await chamar('sgcFornecedorListar', { busca: '', codfilial: '', ativo: 0, limite: 2, offset: 2 });
    assert.equal(paginado.rows.length, 1);
  });

  await teste('C-003: analista não parametriza; gestor parametriza (RN-012)', async () => {
    const payload = payload1015();

    const comoAnalista = await chamar('sgcFornecedorSalvar', { payload }, U.ana);
    assert.equal(comoAnalista.ok, false);
    assert.match(comoAnalista.error ?? '', /gestor/i);

    const depoisAnalista = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    assert.equal(Number(depoisAnalista.fornecedor.PEDIDO_MINIMO), 5000);
    assert.equal(depoisAnalista.log.length, 0, 'a tentativa recusada não cria log');

    const comoGestor = await chamar('sgcFornecedorSalvar', { payload }, U.gil);
    assert.equal(comoGestor.ok, true, comoGestor.error);
    assert.equal(comoGestor.alteracoes, 0, 'reenvio idêntico não altera nenhum campo');

    // Chamada direta da escrita interna (não pela tela) com usuarioId de quem
    // não pode: nada muda, mesmo passando por cima do sgcFornecedorSalvar.
    const antes = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    await chamar('sgcEscFornecedorAtualizar', {
      usuarioId: U.ana, id: Number(antes.fornecedor.ID), fornecedor: antes.fornecedor.FORNECEDOR, cnpj: antes.fornecedor.CNPJ,
      cnpjFormatado: antes.fornecedor.CNPJ_FORMATADO, prazoEntregaDias: antes.fornecedor.PRAZO_ENTREGA_DIAS,
      prazoEntregaTipo: antes.fornecedor.PRAZO_ENTREGA_TIPO, pedidoMinimo: 999999,
      fechamentoDiaInicio: antes.fornecedor.FECHAMENTO_DIA_INICIO, fechamentoDiaFim: antes.fornecedor.FECHAMENTO_DIA_FIM,
      linkPlataforma: '', validadeMinimaDias: antes.fornecedor.VALIDADE_MINIMA_DIAS, slaAnaliseDias: antes.fornecedor.SLA_ANALISE_DIAS,
      slaFaturamentoDias: antes.fornecedor.SLA_FATURAMENTO_DIAS, ativo: antes.fornecedor.ATIVO, agora: '2026-09-15T00:00:00',
    }, U.ana);
    const depois = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    assert.equal(Number(depois.fornecedor.PEDIDO_MINIMO), 5000, 'chamada direta sem persona não altera linha nenhuma');
  });

  await teste('C-004: pedido mínimo zero é recusado e nada é gravado (RN-003)', async () => {
    const payload = payload1015();
    payload.fornecedor.pedidoMinimo = 0;
    const resultado = await chamar('sgcFornecedorSalvar', { payload }, U.gil);
    assert.equal(resultado.ok, false);
    assert.match(resultado.error ?? '', /pedido mínimo/i);

    const depois = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    assert.equal(Number(depois.fornecedor.PEDIDO_MINIMO), 5000);
    assert.equal(depois.filiais.length, 2);
    assert.equal(depois.linhas.length, 2);
  });

  await teste('C-005: salvar substitui a parametrização inteira', async () => {
    const payload = payload1015();
    payload.linhas = payload.linhas.filter((l) => l.nome !== 'Nutrição Parenteral');
    const resultado = await chamar('sgcFornecedorSalvar', { payload }, U.gil);
    assert.equal(resultado.ok, true, resultado.error);

    const depois = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    assert.equal(depois.linhas.length, 1);
    assert.equal(depois.contatos.length, 2);
    assert.equal(depois.faixas.length, 1);
    assert.ok(!depois.contatos.some((c) => String(c.EMAIL).startsWith('lauanda')));
  });

  await teste('C-006: log campo a campo (FO-06 B)', async () => {
    const payload = payload1015();
    payload.linhas = payload.linhas.filter((l) => l.nome !== 'Nutrição Parenteral'); // mesmo recorte deixado por C-005
    payload.fornecedor.pedidoMinimo = 8000;
    payload.fornecedor.validadeMinimaDias = 90;
    const resultado = await chamar('sgcFornecedorSalvar', { payload }, U.dora);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.alteracoes, 2);

    const depois = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    const porCampo = Object.fromEntries(depois.log.slice(0, 2).map((l) => [l.CAMPO, l]));
    assert.equal(porCampo['Pedido mínimo'].DE, '5000.00');
    assert.equal(porCampo['Pedido mínimo'].PARA, '8000.00');
    assert.equal(Number(porCampo['Pedido mínimo'].POR), U.dora);
    assert.equal(porCampo['Validade mínima'].DE, '120');
    assert.equal(porCampo['Validade mínima'].PARA, '90');

    const semMudanca = await chamar('sgcFornecedorSalvar', { payload }, U.dora);
    assert.equal(semMudanca.ok, true, semMudanca.error);
    assert.equal(semMudanca.alteracoes, 0, 'segundo salvamento sem mudança não acrescenta linha de log');
  });

  await teste('C-007: documento com endereço, tipo e vencimento (RN-011)', async () => {
    const payload = payload1015();
    payload.linhas = payload.linhas.filter((l) => l.nome !== 'Nutrição Parenteral');
    payload.fornecedor.pedidoMinimo = 8000;
    payload.fornecedor.validadeMinimaDias = 90;
    payload.documentos = [{
      tipo: 'Planilha', nome: 'Contrato comercial 2026', endereco: 'https://arquivos.mitra.local/sgc/contrato.pdf', vencimento: '2027-03-31',
    }];
    const resultado = await chamar('sgcFornecedorSalvar', { payload }, U.gil);
    assert.equal(resultado.ok, true, resultado.error);

    const depois = await chamar('sgcFornecedorCarregar', { codfornec: 1015 });
    assert.equal(depois.documentos.length, 1);
    assert.equal(depois.documentos[0].TIPO, 'Documento', 'tipo fora dos dois aceitos é normalizado para Documento');
    assert.equal(depois.documentos[0].NOME, 'Contrato comercial 2026');
    assert.equal(depois.documentos[0].VENCIMENTO, '2027-03-31');
    assert.equal(depois.documentos[0].ENDERECO, 'https://arquivos.mitra.local/sgc/contrato.pdf');
  });

  await teste('C-001: parametrização nova do fornecedor do ERP é gravada inteira (RN-001)', async () => {
    const payload = {
      fornecedor: {
        codfornec: 1088, fornecedor: 'DANONE NUTRICAO ESPECIALIZADA LTDA', cnpj: '49324221000104', cnpjFormatado: '49.324.221/0001-04',
        prazoEntregaDias: 7, prazoEntregaTipo: 'uteis', pedidoMinimo: 5000, fechamentoDiaInicio: 7, fechamentoDiaFim: 15,
        linkPlataforma: '', validadeMinimaDias: 120, slaAnaliseDias: 0, slaFaturamentoDias: 0, ativo: 0,
      },
      filiais: [{ codfilial: '1', filial: 'Benenutri Matriz' }, { codfilial: '2', filial: 'Benenutri Filial Norte' }],
      linhas: [{
        nome: 'Nutrição Enteral',
        contatos: [{ nome: 'Captação', email: 'captacao.pedidos@fresenius-kabi.com' }],
        faixas: [{ valorDe: 0, valorAte: 0, rotulo: 'Opção única', parcelas: '30/60/90' }],
      }],
      documentos: [],
    };
    const resultado = await chamar('sgcFornecedorSalvar', { payload }, U.gil);
    assert.equal(resultado.ok, true, resultado.error);

    const depois = await chamar('sgcFornecedorCarregar', { codfornec: 1088 });
    assert.equal(Number(depois.fornecedor.PEDIDO_MINIMO), 5000);
    assert.equal(depois.filiais.length, 2);
    assert.equal(depois.linhas.length, 1);
    assert.equal(depois.contatos.length, 1);
    assert.equal(depois.faixas.length, 1);
    assert.equal(depois.faixas[0].PARCELAS, '30/60/90');
    assert.ok(depois.log.length >= 1);
    assert.ok(depois.log.some((l) => Number(l.POR) === U.gil));
  });
}
