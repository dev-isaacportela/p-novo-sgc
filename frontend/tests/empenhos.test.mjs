// Regra pura da spec 015 (quadro de empenhos): src/lib/empenhos.ts. O que só o
// servidor responde (gancho, gravação, WinThor) está em
// backend/simulator/smoke/015-empenhos.mjs — lá também a paridade da regra de
// movimento com a SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alertaDoEmpenho, cmvAcimaDaReferencia, cmvItem, comprarTudo, custoEfetivo, custoEspecialDoOrgao, dataLimite,
  destinoAoAbrirPendencia, destinoAoFecharPendencia, destinoDoReagrupamento, diasAte, ESTADO_VAZIO, estadoDaCarga,
  filiaisDoItem, MENSAGENS_EMPENHO as M, motivoDeDestinoEmpenho, motivoDeExcluirEmpenho, nivelDoPrazo, origemPrincipal,
  outrosEmpenhos, planoDeDesmembramento, prazoEmDias, prontidaoDaAnalise, resumoDaFilial, textoCurto, textoSituacao,
  tituloDoEmpenho, totaisEmpenho, validarDecisao, validarNovoEmpenho,
} from '../src/lib/empenhos.ts';
import { menuParaPersona, permissoesDe } from '../src/lib/permissoes.ts';

const quase = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≉ ${b}`);
const item = (extra = {}) => ({
  codprod: 1, descricao: 'P1', embalagem: '', unidade: 'UN', codfab: '', codfornec: 10, fornecedor: 'Ind A',
  qtEmpenho: 100, precoVenda: 10, custoNegociado: 0, custoEspecial: 0, custoPadrao: 6, tipoCustoPedido: '',
  qtCompra: 100, qtTransferencia: 0, qtEstoque: 0, codfilialOrigem: '', observacao: '', ...extra,
});
const estado = (extra = {}) => ({ ...ESTADO_VAZIO, papel: 'EMPENHO', souCriador: true, itens: 1, ...extra });

test('C-001: verEmpenhos falso só para o comercial; o menu do comercial não tem os itens de empenho', () => {
  for (const persona of ['admin', 'analista', 'gestor', 'diretoria']) assert.equal(permissoesDe(persona, 'MEMBER').verEmpenhos, true, persona);
  assert.equal(permissoesDe('comercial', 'MEMBER').verEmpenhos, false);
  assert.equal(permissoesDe('analista', 'READ_ONLY').verEmpenhos, true, 'ver atravessa READ_ONLY');
  assert.equal(permissoesDe('analista', 'READ_ONLY').operarEmpenhos, false, 'operar zera');
  assert.equal(permissoesDe('diretoria', 'MEMBER').operarEmpenhos, false, 'a diretoria não cria empenho');
  const rotas = (persona) => menuParaPersona(permissoesDe(persona, 'MEMBER')).map((i) => i.to);
  assert.ok(!rotas('comercial').some((to) => to.startsWith('/empenhos')));
  assert.deepEqual(rotas('analista').filter((to) => to.startsWith('/empenhos')), ['/empenhos', '/empenhos/pregoes', '/empenhos/indicadores']);
});

test('C-007: outrosEmpenhos tira o deste card; nivelDaVigencia (vencida, em N dias)', () => {
  const lista = [{ ID_CARD: 1 }, { ID_CARD: 2 }, { ID_CARD: '3' }];
  assert.deepEqual(outrosEmpenhos(lista, 2).map((l) => Number(l.ID_CARD)), [1, 3]);
  assert.equal(nivelDoPrazo(-1, 'vigencia').texto, 'vigência vencida');
  assert.deepEqual(nivelDoPrazo(20, 'vigencia'), { nivel: 'atencao', texto: 'vigência em 20 d' });
  assert.equal(nivelDoPrazo(31, 'vigencia'), null);
});

test('C-009: validarNovoEmpenho lista o que falta', () => {
  assert.deepEqual(validarNovoEmpenho({ idPregao: 0, codfilial: '', dtRecebimento: '', itens: [] }),
    ['o pregão', 'a filial do contrato', 'a data de recebimento', 'ao menos um item']);
  assert.deepEqual(validarNovoEmpenho({ idPregao: 1, codfilial: '1', dtRecebimento: '2026-09-08', itens: [{}], prazoInvalido: true }), ['um prazo válido']);
  assert.deepEqual(validarNovoEmpenho({ idPregao: 1, codfilial: '1', dtRecebimento: '2026-09-08', itens: [{}] }), []);
  assert.equal(tituloDoEmpenho('PE 12/2026', ''), 'PE 12/2026 · sem número');
  assert.equal(tituloDoEmpenho('PE 12/2026', ' 2026NE1 '), 'PE 12/2026 · 2026NE1');
});

test('C-010 / RN-004: 08/09/2026 + 15 corridos = 23/09; úteis = 29/09; o inverso; negativo inválido', () => {
  assert.equal(dataLimite('2026-09-08', 15, 'CORRIDOS'), '2026-09-23');
  assert.equal(dataLimite('2026-09-08', 15, 'UTEIS'), '2026-09-29');
  assert.equal(prazoEmDias('2026-09-08', '2026-09-23', 'CORRIDOS'), 15);
  assert.equal(prazoEmDias('2026-09-08', '2026-09-29', 'UTEIS'), 15);
  assert.equal(dataLimite('2026-09-08', -1, 'CORRIDOS'), '');
  assert.equal(prazoEmDias('2026-09-08', '2026-09-01', 'CORRIDOS'), null);
  assert.equal(dataLimite('', 15, 'CORRIDOS'), '');
});

test('C-013 / RN-001 / RN-002: custo efetivo nas quatro pontas; 35 × 96,28 / 35 × 132,52 = 72,65 %; aviso acima de 70 %', () => {
  assert.equal(custoEfetivo({ tipoCustoPedido: '', custoNegociado: 5, custoEspecial: 7, custoPadrao: 9 }), 5, 'negociado vence');
  assert.equal(custoEfetivo({ tipoCustoPedido: '', custoNegociado: 0, custoEspecial: 7, custoPadrao: 9 }), 7, 'zero = não negociei');
  assert.equal(custoEfetivo({ tipoCustoPedido: '', custoNegociado: 0, custoEspecial: 0, custoPadrao: 9 }), 9);
  assert.equal(custoEfetivo({ tipoCustoPedido: 'PADRAO', custoNegociado: 5, custoEspecial: 7, custoPadrao: 9 }), 7, 'C-016: pedir pelo padrão ignora o negociado');
  assert.equal(custoEfetivo({ tipoCustoPedido: 'PADRAO', custoNegociado: 5, custoEspecial: 0, custoPadrao: 9 }), 9);
  const t = totaisEmpenho([item({ qtEmpenho: 35, precoVenda: 132.52, custoPadrao: 96.28 })]);
  quase(t.valor, 4638.2);
  quase(t.custo, 3369.8);
  assert.equal((t.cmv * 100).toFixed(2), '72.65');
  assert.equal(cmvAcimaDaReferencia(t.cmv), true);
  assert.equal(cmvAcimaDaReferencia(0.7), false);
  assert.equal(cmvAcimaDaReferencia(null), false);
  assert.equal(cmvItem(item({ precoVenda: 0 })), null, 'sem preço: traço');
  // Razão das somas, nunca média dos CMVs: 10 × (6/10) e 1 × (9/10) = 69/110, não 75 %.
  quase(totaisEmpenho([item({ qtEmpenho: 10 }), item({ qtEmpenho: 1, custoPadrao: 9 })]).cmv, 69 / 110);
});

test('C-012: o especial vigente do órgão — política do cliente ou de qualquer cliente, o menor', () => {
  const linhas = [
    { CODPROD: 1, CODCLI: 0, CUSTO_ESPECIAL: 8 }, { CODPROD: 1, CODCLI: 77, CUSTO_ESPECIAL: 7.5 },
    { CODPROD: 1, CODCLI: 99, CUSTO_ESPECIAL: 1 }, { CODPROD: 2, CODCLI: 77, CUSTO_ESPECIAL: 3 },
  ];
  assert.equal(custoEspecialDoOrgao(linhas, 1, 77), 7.5);
  assert.equal(custoEspecialDoOrgao(linhas, 1, 55), 8);
  assert.equal(custoEspecialDoOrgao(linhas, 3, 77), 0);
});

test('C-014 / RN-005: resumoDaFilial (cobertura arredondada, sem venda, relevância) e a filial do contrato primeiro', () => {
  assert.deepEqual(resumoDaFilial({ QT_DISPONIVEL: 90, QT_VENDA_45D: 45 }), { disponivel: 90, cobertura: 90, texto: '90 d', relevante: true });
  assert.deepEqual(resumoDaFilial({ QT_DISPONIVEL: 10, QT_VENDA_45D: 0 }), { disponivel: 10, cobertura: null, texto: 'sem venda', relevante: true });
  assert.equal(resumoDaFilial({ QT_DISPONIVEL: -5, QT_VENDA_45D: 0 }).relevante, false, 'negativo vira 0, sem venda: fora');
  const linhas = [
    { CODPROD: 1, CODFILIAL: '2', QT_DISPONIVEL: 5, QT_VENDA_45D: 0 },
    { CODPROD: 1, CODFILIAL: '3', QT_DISPONIVEL: 0, QT_VENDA_45D: 0 },
    { CODPROD: 1, CODFILIAL: '1', QT_DISPONIVEL: 0, QT_VENDA_45D: 0 },
    { CODPROD: 2, CODFILIAL: '1', QT_DISPONIVEL: 9, QT_VENDA_45D: 9 },
  ];
  assert.deepEqual(filiaisDoItem(linhas, 1, '1').map((l) => l.CODFILIAL), ['1', '2'], 'contrato sempre, as outras só relevantes');
});

test('C-015 / RN-006: validarDecisao nas quatro mensagens; origemPrincipal com empate; Comprar tudo', () => {
  assert.equal(validarDecisao(item({ qtCompra: 60, qtTransferencia: 30, qtEstoque: 10, codfilialOrigem: '2' })), '');
  assert.equal(validarDecisao(item({ qtCompra: 60, qtTransferencia: 30, qtEstoque: 0, codfilialOrigem: '2' })), 'Faltam 10 un. para fechar');
  assert.equal(validarDecisao(item({ qtCompra: 60, qtTransferencia: 30, qtEstoque: 20, codfilialOrigem: '2' })), 'A soma passou 10 un.');
  assert.equal(validarDecisao(item({ qtCompra: 0 })), 'Distribua a quantidade entre as decisões');
  assert.equal(validarDecisao(item({ qtCompra: 70, qtTransferencia: 30 })), 'Escolha a filial de origem da transferência');
  assert.equal(validarDecisao(item({ qtEmpenho: 1, qtCompra: 1.0004 })), '', 'tolerância de 0,0005');
  assert.equal(origemPrincipal({ qtCompra: 50, qtTransferencia: 50, qtEstoque: 0 }), 'compra', 'compra vence o empate');
  assert.equal(origemPrincipal({ qtCompra: 10, qtTransferencia: 50, qtEstoque: 40 }), 'transferencia');
  assert.equal(origemPrincipal({ qtCompra: 0, qtTransferencia: 0, qtEstoque: 5 }), 'estoque');
  const tudo = comprarTudo(item({ qtCompra: 0, qtTransferencia: 40, qtEstoque: 60, codfilialOrigem: '2' }));
  assert.deepEqual([tudo.qtCompra, tudo.qtTransferencia, tudo.qtEstoque, tudo.codfilialOrigem], [100, 0, 0, '']);
});

test('C-018 / RN-007: prontidaoDaAnalise — sem item, item aberto (até três citados), sem preço; pronto', () => {
  assert.equal(prontidaoDaAnalise([]), 'Acrescente ao menos um item ao empenho.');
  assert.equal(prontidaoDaAnalise([item()]), '');
  const abertos = [1, 2, 3, 4].map((codprod) => item({ codprod, descricao: `P${codprod}`, qtCompra: 0 }));
  const frase = prontidaoDaAnalise(abertos);
  assert.ok(frase.startsWith(M.analise));
  assert.ok(frase.includes('1 P1; 2 P2; 3 P3 e mais 1'));
  assert.ok(prontidaoDaAnalise([item({ precoVenda: 0 })]).includes('1 P1'), 'sem preço do contrato não sai');
});

test('C-020 / C-024 / RN-008 / RN-009: a regra de movimento na ordem do gancho', () => {
  const pode = (persona, origem, destino, e = estado(), acesso = 'MEMBER') => motivoDeDestinoEmpenho(persona, acesso, origem, destino, e);
  assert.equal(pode('comercial', 'emp_analise', 'emp_tecnica'), M.comercial);
  assert.equal(pode('analista', 'emp_analise', 'emp_tecnica', estado(), 'READ_ONLY'), M.leitura);
  assert.equal(pode('analista', 'emp_analise', 'emp_tecnica', estado({ souCriador: false }), 'RESTRICTED'), M.restrito);
  assert.equal(pode('diretoria', 'emp_analise', 'emp_tecnica'), M.diretoria, 'C-024');
  assert.equal(pode('diretoria', 'emp_analise', 'emp_envio', estado({ papel: 'FORNECEDOR' })), null,
    'a diretoria leva o pedido recém-gerado à entrada');
  assert.equal(pode('analista', 'emp_analise', 'emp_envio'), M.semTransicao, 'o empenho não vai a Envio');
  assert.equal(pode('analista', 'emp_analise', 'emp_tecnica', estado({ itensAbertos: 1 })), M.analise);
  assert.equal(pode('analista', 'emp_analise', 'emp_tecnica', estado({ itens: 0 })), M.analise);
  assert.equal(pode('analista', 'emp_analise', 'emp_tecnica'), null);
  assert.equal(pode('gestor', 'emp_tecnica', 'emp_diretoria'), M.tecnica);
  assert.equal(pode('gestor', 'emp_tecnica', 'emp_diretoria', estado({ tecEm: '2026-11-03' })), null);
  assert.equal(pode('gestor', 'emp_tecnica', 'emp_analise'), M.reprovar);
  assert.equal(pode('gestor', 'emp_tecnica', 'emp_analise', estado({ reprovFase: 'tecnica' })), null);
});

test('C-021 / C-022 / RN-010: planoDeDesmembramento — duas indústrias, uma transferência, item dividido; vazio quando tudo é estoque', () => {
  const itens = [
    item({ codprod: 1, codfornec: 10, fornecedor: 'Ind B', qtEmpenho: 100, qtCompra: 60, qtTransferencia: 30, qtEstoque: 10, codfilialOrigem: '2', precoVenda: 45.5, custoNegociado: 25 }),
    item({ codprod: 2, codfornec: 20, fornecedor: 'Ind A', qtEmpenho: 35, qtCompra: 35, precoVenda: 132.52, custoPadrao: 96.28 }),
    item({ codprod: 3, codfornec: 10, fornecedor: 'Ind B', qtEmpenho: 10, qtCompra: 0, qtEstoque: 10 }),
  ];
  const plano = planoDeDesmembramento(itens);
  assert.deepEqual(plano.fornecedores.map((p) => [p.fornecedor, p.itens.map((i) => i.codprod)]), [['Ind A', [2]], ['Ind B', [1]]]);
  quase(plano.fornecedores[1].valor, 60 * 45.5);
  quase(plano.fornecedores[1].custo, 60 * 25);
  assert.deepEqual(plano.transferencia.map((i) => i.codprod), [1], 'o dividido também vai à transferência pela parte transferida');
  const estoque = planoDeDesmembramento(itens.map((i) => ({ ...i, qtCompra: 0, qtTransferencia: 0, qtEstoque: i.qtEmpenho })));
  assert.deepEqual(estoque, { fornecedores: [], transferencia: [] });
  const e = estado({ dirEm: '2026-11-03', itensAPedir: 2 });
  assert.equal(motivoDeDestinoEmpenho('diretoria', 'MEMBER', 'emp_diretoria', 'emp_pedidos', e), M.diretoriaAprov, 'sem desmembrar não vai');
  assert.equal(motivoDeDestinoEmpenho('diretoria', 'MEMBER', 'emp_diretoria', 'emp_pedidos', { ...e, desmembradoEm: 'x' }), null);
  assert.equal(motivoDeDestinoEmpenho('diretoria', 'MEMBER', 'emp_diretoria', 'emp_concluido', e), M.nadaAPedir);
  assert.equal(motivoDeDestinoEmpenho('diretoria', 'MEMBER', 'emp_diretoria', 'emp_concluido', { ...e, itensAPedir: 0 }), null, 'C-022');
});

test('C-025..C-031 / RN-008 / RN-011: travas do pedido e destino ao abrir e fechar pendência', () => {
  const p = (extra) => estado({ papel: 'FORNECEDOR', ...extra });
  const pode = (origem, destino, e) => motivoDeDestinoEmpenho('analista', 'MEMBER', origem, destino, e);
  assert.equal(pode('emp_envio', 'emp_aguardando', p({ numPedido: 'PC-1' })), M.envio);
  assert.equal(pode('emp_envio', 'emp_aguardando', p({ numPedido: 'PC-1', dtPedido: '2026-11-04' })), null);
  assert.equal(pode('emp_aguardando', 'emp_transito', p()), M.previsao);
  assert.equal(pode('emp_transito', 'emp_concluido', p()), M.recebido);
  assert.equal(pode('emp_transito', 'emp_concluido', p({ dtRecebido: 'x', pendAbertas: 1 })), M.pendenciaAberta, 'C-028');
  assert.equal(pode('emp_transito', 'emp_pendencia', p()), M.semPendencia);
  assert.equal(pode('emp_transito', 'emp_pendencia', p({ pendAbertas: 1 })), null);
  assert.equal(pode('emp_pendencia', 'emp_concluido', p()), M.semTransicao, 'C-030: nunca direto a Concluídos');
  assert.equal(pode('emp_pendencia', 'emp_envio', estado({ papel: 'TRANSFERENCIA' })), M.semTransicao, 'C-031: transferência não tem envio');
  assert.equal(pode('emp_transito', 'emp_cancelado', p()), M.cancelar);
  assert.equal(pode('emp_transito', 'emp_cancelado', p({ cancMotivo: 'Órgão anulou' })), null, 'C-033: com o motivo do empenho');
  assert.equal(destinoAoAbrirPendencia('emp_envio'), 'emp_pendencia');
  assert.equal(destinoAoAbrirPendencia('emp_pendencia'), null);
  assert.equal(destinoAoFecharPendencia('emp_pendencia', 0), 'emp_transito');
  assert.equal(destinoAoFecharPendencia('emp_pendencia', 1), null);
  assert.equal(destinoAoFecharPendencia('emp_transito', 0), null);
  assert.equal(textoCurto('curta'), true);
  assert.equal(textoCurto('Indústria sem o lote'), false);
});

test('C-032 / RN-012: destinoDoReagrupamento e a capa "faltam N de M" / "pedido K de M"', () => {
  assert.equal(destinoDoReagrupamento(['emp_concluido', 'emp_cancelado']), 'emp_concluido');
  assert.equal(destinoDoReagrupamento(['emp_cancelado', 'emp_cancelado']), 'emp_cancelado');
  assert.equal(destinoDoReagrupamento(['emp_concluido', 'emp_transito']), null);
  assert.equal(destinoDoReagrupamento([]), null);
  const pedidos = [{ ID_CARD: 7, FASE: 'emp_concluido' }, { ID_CARD: 8, FASE: 'emp_envio' }, { ID_CARD: 9, FASE: 'emp_pendencia' }];
  assert.equal(textoSituacao('EMPENHO', pedidos, 1), 'faltam 2 de 3');
  assert.equal(textoSituacao('FORNECEDOR', pedidos, 8), 'pedido 2 de 3');
  const e = estado({ pedidos: 3, pedidosFinais: 2, pedidosCancelados: 0 });
  assert.equal(motivoDeDestinoEmpenho('analista', 'MEMBER', 'emp_pedidos', 'emp_concluido', e), M.reagrupar);
  assert.equal(motivoDeDestinoEmpenho('analista', 'MEMBER', 'emp_pedidos', 'emp_concluido', { ...e, pedidosFinais: 3 }), null);
  assert.equal(motivoDeDestinoEmpenho('analista', 'MEMBER', 'emp_pedidos', 'emp_cancelado', { ...e, pedidosFinais: 3, pedidosCancelados: 3 }), null);
});

test('C-034: excluir só o rascunho, por admin, gestor ou diretoria', () => {
  assert.equal(motivoDeExcluirEmpenho('gestor', 'MEMBER', 'emp_analise', estado()), null);
  assert.equal(motivoDeExcluirEmpenho('analista', 'MEMBER', 'emp_analise', estado()), M.excluir);
  assert.equal(motivoDeExcluirEmpenho('gestor', 'MEMBER', 'emp_tecnica', estado()), M.excluir);
  assert.equal(motivoDeExcluirEmpenho('gestor', 'MEMBER', 'emp_analise', estado({ pedidos: 1 })), M.excluir);
  assert.equal(motivoDeExcluirEmpenho('gestor', 'MEMBER', 'emp_envio', estado({ papel: 'FORNECEDOR' })), M.excluir);
  assert.equal(motivoDeExcluirEmpenho('analista', 'MEMBER', 'emp_analise', estado({ papel: '' })), null, 'card sem empenho: quem criou');
});

test('C-035 / RN-013: nivelDoPrazo e alertaDoEmpenho (o pior, empate da vigência)', () => {
  assert.deepEqual(nivelDoPrazo(2, 'entrega'), { nivel: 'critico', texto: 'entrega em 2 d' });
  assert.deepEqual(nivelDoPrazo(0, 'entrega'), { nivel: 'critico', texto: 'entrega vence hoje' });
  assert.deepEqual(nivelDoPrazo(-3, 'entrega'), { nivel: 'vencido', texto: 'entrega atrasada' });
  assert.equal(nivelDoPrazo(7, 'entrega').nivel, 'atencao');
  assert.equal(nivelDoPrazo(8, 'entrega'), null);
  assert.equal(nivelDoPrazo(null, 'entrega'), null, 'sem data não há alerta');
  assert.equal(alertaDoEmpenho(2, 20).texto, 'entrega em 2 d', 'crítico vence atenção');
  assert.equal(alertaDoEmpenho(5, 20).texto, 'vigência em 20 d', 'empate: a vigência');
  assert.equal(alertaDoEmpenho(null, null), null);
  assert.equal(diasAte('2026-11-03', '2026-11-05'), 2);
  assert.equal(diasAte('2026-11-03', '2026-11-01'), -2);
  assert.equal(diasAte('2026-11-03', ''), null);
});

test('RN-007 / C-032: estadoDaCarga conta como o gancho (itens abertos, a pedir, pendências do card, pedidos)', () => {
  const carga = {
    ok: true, papel: 'FORNECEDOR',
    empenho: { TEC_EM: '2026-11-01', DIR_EM: null, CANC_MOTIVO: null },
    itens: [{ CODPROD: 1, QT_EMPENHO: 10, QT_COMPRA: 10, PRECO_VENDA: 5 }, { CODPROD: 2, QT_EMPENHO: 10, QT_ESTOQUE: 10, PRECO_VENDA: 0 }],
    pedidos: [{ ID_CARD: 5, FASE: 'emp_envio' }, { ID_CARD: 6, FASE: 'emp_cancelado' }],
    pendencias: [{ ID_CARD: 5, STATUS: 'ABERTA' }, { ID_CARD: 5, STATUS: 'RESOLVIDA' }, { ID_CARD: 6, STATUS: 'ABERTA' }],
    pedido: { NUM_PEDIDO: 'PC-1', DT_PEDIDO: null },
  };
  const e = estadoDaCarga(carga, 5, false);
  assert.deepEqual(
    [e.papel, e.tecEm, e.dirEm, e.numPedido, e.dtPedido, e.itens, e.itensAbertos, e.itensAPedir, e.pendAbertas, e.pedidos, e.pedidosFinais, e.pedidosCancelados],
    ['FORNECEDOR', '2026-11-01', '', 'PC-1', '', 2, 1, 1, 1, 2, 1, 1],
  );
  assert.deepEqual(estadoDaCarga({ ok: false }, 5, true), { ...ESTADO_VAZIO, souCriador: true });
});
