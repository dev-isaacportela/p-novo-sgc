// Cenários C-001..C-023 e regras RN-001..RN-018 da spec 008 (solicitações do
// comercial). Ver docs/specs/008-solicitacoes-do-comercial/plan.md §Testes.
//
// Tudo roda sobre as MESMAS definitions que o add-011-solicitacoes.mjs publica,
// no banco compartilhado do smoke — R-045: nenhuma asserção de total absoluto,
// sempre COUNT ao vivo, recorte por CARDS_008/SOLICITACOES_008 ou diferença
// antes/depois.
//
// ORDEM IMPORTA (a suíte muda o estado do próprio seed): primeiro o que só lê
// (C-018, C-014, C-015, C-020, C-021, C-022, C-011 — que move o card e o
// devolve ao fim — e C-007, que conta as 4 do bloco); depois o que grava. Duas
// emendas à ordem do plan, pelo estado que cada teste consome:
//   - C-012 vem ANTES de C-005, que recusa a `pendenteOutroFornec`: recusada,
//     ela cairia na frase "já foi recusada ou cancelada" em vez da de
//     fornecedor e filial, e o cenário deixaria de provar o que promete;
//   - a solicitação registrada em C-001 (1042 / filial 1) entra no bloco da
//     montagem e sai dele em C-006, que a cancela — por isso C-006 vem antes de
//     C-008, como o plan já pedia.
//
// As duas consultas ao WinThor asserem CONTAGEM > 0 (vazio não é verde).

import { assert } from './base.mjs';
import { CARDS_008, SOLICITACOES_008 } from '../seed/008-solicitacoes.mjs';

const AGORA = '2026-09-16T10:00:00';
const JUSTIFICATIVA_C001 = 'Cliente 9201 pediu 24 unidades para o mes; estamos sem estoque desde a semana passada e ele cobra.';

const FILTROS_VAZIOS = {
  status: '', situacao: '', codfornec: 0, codfilial: '', vendedor: 0, minhas: 0,
  busca: '', limite: 200, offset: 0,
};

export async function suite(ctx) {
  const { db, chamar, teste, U } = ctx;

  /* ── atalhos ── */

  const linhas = (resultado) => resultado.rows;
  const uma = (resultado) => resultado.rows[0];
  const conta = (sql, ...params) => Number(db.prepare(sql).get(...params).N);
  const solicitacao = (id) => db.prepare('SELECT * FROM SGC_SOLICITACAO WHERE ID = ?').get(id);
  const historicoDe = (id) => db.prepare('SELECT * FROM SGC_SOLICITACAO_HISTORICO WHERE ID_SOLICITACAO = ? ORDER BY EM, ID').all(id);
  const itensDoCard = (cardId) => db.prepare("SELECT * FROM SGC_PEDIDO_ITEM WHERE ID_CARD = ? AND STATUS <> 'removido' ORDER BY CODPROD").all(cardId);
  const listar = async (filtros, quem) => linhas(await chamar('sgcSolicitacoesListar', { ...FILTROS_VAZIOS, ...filtros }, quem));
  const total = async (filtros, quem) => Number(uma(await chamar('sgcSolicitacoesListarTotal', { ...FILTROS_VAZIOS, ...filtros }, quem)).TOTAL);
  const bloco = async (cardId, quem = U.gil) => linhas(await chamar('sgcSolicitacoesDaMontagem', { cardId }, quem));
  const idsDoSeed = new Set(Object.values(SOLICITACOES_008));
  const soDoSeed = (rows) => rows.filter((l) => idsDoSeed.has(Number(l.ID)));
  const emFase = (cardId, chave) => db.prepare('UPDATE KB_CARD SET FASE_ID = (SELECT FASE_ID FROM SGC_FASE WHERE CHAVE = ?) WHERE ID = ?').run(chave, cardId);

  /* ═════════════ o que só lê ═════════════ */

  /* ─────────── T-087 — busca de cliente no WinThor ─────────── */

  await teste('C-018: sgcWintClienteBuscar acha o mesmo cliente por código, por parte do nome e por CNPJ — as três com contagem > 0, no máximo 20 linhas', async () => {
    const porCodigo = linhas(await chamar('sgcWintClienteBuscar', { codcli: 9201, busca: '' }, U.leo));
    assert.ok(porCodigo.length > 0, 'consulta ao WinThor vazia não é verde');
    assert.equal(Number(porCodigo[0].CODCLI), 9201);
    assert.equal(String(porCodigo[0].CLIENTE), 'Nutrivida Clinica Ltda');
    assert.equal(String(porCodigo[0].CNPJ), '12345678000190');

    const porNome = linhas(await chamar('sgcWintClienteBuscar', { codcli: 0, busca: 'nutrivida' }, U.leo));
    assert.ok(porNome.length > 0, 'busca por parte do nome não pode vir vazia');
    assert.ok(porNome.some((l) => Number(l.CODCLI) === 9201), 'o mesmo cliente pelo nome');

    const porCnpj = linhas(await chamar('sgcWintClienteBuscar', { codcli: 0, busca: '12345678000190' }, U.leo));
    assert.ok(porCnpj.length > 0, 'busca por CNPJ não pode vir vazia');
    assert.equal(Number(porCnpj[0].CODCLI), 9201);

    const tudo = linhas(await chamar('sgcWintClienteBuscar', { codcli: 0, busca: '' }, U.leo));
    assert.ok(tudo.length > 0 && tudo.length <= 20, `a busca devolve no máximo 20 (devolveu ${tudo.length})`);
  });

  await teste("C-018b (achado 1): cliente com apóstrofo no nome é encontrado — o texto digitado é CONCATENADO, nunca colado dentro de '%…%'", async () => {
    const achados = linhas(await chamar('sgcWintClienteBuscar', { codcli: 0, busca: "SANT'ANNA" }, U.leo));
    assert.equal(achados.length, 1, 'exatamente o cliente com apóstrofo — e a consulta não estoura por sintaxe');
    assert.equal(Number(achados[0].CODCLI), 9206);
    assert.equal(String(achados[0].CLIENTE), "SANT'ANNA NUTRICAO LTDA");
  });

  /* ─────────── T-086 — rastreio pós-aprovação (WinThor) ─────────── */

  const ALVOS_RASTREIO = ['rastComprou', 'rastOutraFilial', 'rastNaoComprou', 'rastExcesso', 'rastSemCliente', 'rastCarencia'];
  const parDe = (chave) => {
    const s = solicitacao(SOLICITACOES_008[chave]);
    return `${s.CODPROD}:${s.CODFILIAL}:${String(s.AVALIADO_EM).slice(0, 10)}:${s.CODCLI}`;
  };
  const rastrear = async () => {
    const pares = ALVOS_RASTREIO.map(parDe).join(',');
    const rows = linhas(await chamar('sgcWintRastreioSolicitacoes', { pares }, U.gil));
    const porChave = new Map(rows.map((l) => [`${Number(l.CODPROD)}:${l.CODFILIAL}:${l.DT_REFERENCIA}:${Number(l.CODCLI)}`, l]));
    return {
      rows,
      de: (chave) => {
        const s = solicitacao(SOLICITACOES_008[chave]);
        return porChave.get(`${Number(s.CODPROD)}:${s.CODFILIAL}:${String(s.AVALIADO_EM).slice(0, 10)}:${Number(s.CODCLI)}`);
      },
    };
  };

  await teste('C-014 / RN-013: o rastreio devolve 6 linhas (> 0) e os números do eixo do cliente — comprou 12 na filial, 8 em outra, 30 a terceiro como contexto', async () => {
    const rastreio = await rastrear();
    assert.ok(rastreio.rows.length > 0, 'consulta ao WinThor vazia não é verde');
    assert.equal(rastreio.rows.length, 6, 'um par por solicitação aprovada, sem repetição');

    assert.equal(Number(rastreio.de('rastComprou').QT_VENDIDA_CLIENTE), 12, 'o cliente comprou 12 na filial da solicitação');

    const outraFilial = rastreio.de('rastOutraFilial');
    assert.equal(Number(outraFilial.QT_VENDIDA_CLIENTE), 0, 'na filial da solicitação ele não comprou');
    assert.equal(Number(outraFilial.QT_VENDIDA_CLIENTE_GERAL), 8, 'mas comprou 8 em outra filial — o falso negativo mais caro do rastreio');

    assert.equal(Number(rastreio.de('rastNaoComprou').QT_VENDIDA_CLIENTE), 0);
    assert.equal(Number(rastreio.de('rastNaoComprou').QT_VENDIDA_CLIENTE_GERAL), 0);

    const excesso = rastreio.de('rastExcesso');
    assert.equal(Number(excesso.QT_VENDIDA_CLIENTE), 0, 'quem comprou foi outro cliente');
    assert.equal(Number(excesso.QT_VENDIDA_POS), 30, 'a venda a terceiro aparece como contexto, nunca como resposta');

    assert.equal(Number(rastreio.de('rastSemCliente').CODCLI), 0, 'sem cliente informado continua 0 no par');
    assert.equal(Number(rastreio.de('rastCarencia').QT_VENDIDA_CLIENTE), 0, 'dentro da carência ainda não há venda');
  });

  await teste('C-015: o rastreio devolve os números do eixo do estoque — 20 / 0 / 40 / 300 e o giro de 90 dias do 5304 em 90', async () => {
    const rastreio = await rastrear();
    assert.equal(Number(rastreio.de('rastComprou').QT_ESTOQUE), 20);
    assert.equal(Number(rastreio.de('rastOutraFilial').QT_ESTOQUE), 0);
    assert.equal(Number(rastreio.de('rastNaoComprou').QT_ESTOQUE), 40);
    assert.equal(Number(rastreio.de('rastExcesso').QT_ESTOQUE), 300);
    assert.equal(Number(rastreio.de('rastSemCliente').QT_ESTOQUE), 0);

    assert.equal(Number(rastreio.de('rastExcesso').QT_VENDA_90D), 90, 'QTVENDMES + MES1 + MES2 do 5304');
    assert.equal(Number(rastreio.de('rastNaoComprou').QT_VENDA_90D), 0, 'o 5303 não vendeu nos três meses fechados');
    assert.ok(rastreio.de('rastNaoComprou').DT_ULT_SAIDA, 'a última saída de PCEST vem preenchida (a janela consultada é menor)');
  });

  await teste('RN-015: a data de referência é a da APROVAÇÃO, e venda anterior a ela não entra em soma nenhuma (nem a entrada CODOPER = E)', async () => {
    const rastreio = await rastrear();
    const comprou = solicitacao(SOLICITACOES_008.rastComprou);
    assert.notEqual(String(comprou.AVALIADO_EM).slice(0, 10), String(comprou.CRIADO_EM).slice(0, 10), 'o seed separa criação de aprovação');
    assert.equal(rastreio.de('rastComprou').DT_REFERENCIA, String(comprou.AVALIADO_EM).slice(0, 10));
    assert.equal(Number(rastreio.de('rastComprou').QT_VENDIDA_POS), 12, 'a entrada de 100 unidades (CODOPER E) fica fora');
    assert.equal(Number(rastreio.de('rastNaoComprou').QT_VENDIDA_POS), 0, 'a venda de hoje-70 é anterior à referência e fica fora');
  });

  /* ─────────── T-089 — listagem, recorte por autoria e histórico ─────────── */

  await teste('C-020 / RF-018: a listagem recortada por SOLICITACOES_008 traz as 15, com 5 pendentes e 1 recusada; fornecedor e busca recortam; o total bate com o COUNT do próprio teste', async () => {
    const todas = soDoSeed(await listar({}, U.gil));
    assert.equal(todas.length, Object.keys(SOLICITACOES_008).length, 'as solicitações do seed desta spec');
    assert.equal(todas.length, 15);

    assert.equal(soDoSeed(await listar({ status: 'pendente' }, U.gil)).length, 5);
    assert.equal(soDoSeed(await listar({ status: 'recusada' }, U.gil)).length, 1);
    assert.equal(soDoSeed(await listar({ status: 'cancelada' }, U.gil)).length, 1);

    const nestle = soDoSeed(await listar({ codfornec: 1042 }, U.gil));
    assert.equal(nestle.length, 14, 'só a do fornecedor 1015 fica de fora');
    assert.ok(nestle.every((l) => Number(l.CODFORNEC) === 1042));

    const bebida = soDoSeed(await listar({ busca: 'BEBIDA LACTEA' }, U.gil));
    assert.ok(bebida.length > 0);
    assert.ok(bebida.every((l) => Number(l.CODPROD) === 5301), 'a busca livre recorta pela descrição');

    // R-045: o total vem do COUNT ao vivo, nunca de um literal.
    assert.equal(await total({}, U.gil), conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'));
    assert.equal(
      await total({ status: 'pendente' }, U.gil),
      conta("SELECT COUNT(*) AS N FROM SGC_SOLICITACAO WHERE STATUS = 'pendente'"),
    );

    const totalGeral = await total({}, U.gil);
    const pagina1 = await listar({ limite: 5, offset: 0 }, U.gil);
    assert.equal(pagina1.length, 5);
    let somaDasPaginas = 0;
    for (let offset = 0; offset < totalGeral; offset += 5) {
      somaDasPaginas += (await listar({ limite: 5, offset }, U.gil)).length;
    }
    assert.equal(somaDasPaginas, totalGeral, 'a soma das páginas é o total informado');
  });

  await teste('C-021 / RF-019: o comercial só enxerga o que registrou — a mesma listagem devolve as 4 de Leo para ele e todas para o gestor; "minhas" recorta as do gestor', async () => {
    const deLeo = new Set(['pendenteAlta', 'pendenteNormal', 'pendenteFilial2', 'filaUrgente'].map((c) => SOLICITACOES_008[c]));

    const comoLeo = await listar({}, U.leo);
    assert.ok(comoLeo.length > 0);
    assert.ok(comoLeo.every((l) => Number(l.CRIADO_POR) === U.leo), 'nenhuma linha de outro autor chega ao comercial');
    assert.deepEqual(new Set(comoLeo.map((l) => Number(l.ID))), deLeo, 'exatamente as dele (o conjunto do seed, R-045)');
    assert.equal(await total({}, U.leo), deLeo.size, 'o total também vem recortado');

    // Nem com "minhas" desligado, nem forçando o filtro de vendedor de outro.
    const forcado = await listar({ minhas: 0, vendedor: U.gil }, U.leo);
    assert.equal(forcado.length, 0, 'o recorte é do servidor: pedir as de outro vendedor não devolve nada');

    const comoGil = soDoSeed(await listar({}, U.gil));
    assert.ok(comoGil.some((l) => Number(l.CRIADO_POR) !== U.gil), 'o gestor vê as de todos');

    const minhasDoGil = soDoSeed(await listar({ minhas: 1 }, U.gil));
    assert.ok(minhasDoGil.length > 0);
    assert.ok(minhasDoGil.every((l) => Number(l.CRIADO_POR) === U.gil), 'o filtro "minhas" é recorte, não ordenação');
  });

  await teste('C-022 / RF-013: o detalhe devolve as 5 linhas do histórico em ordem — a `criada` derivada na frente e o título do pedido no detalhe do vínculo', async () => {
    const id = SOLICITACOES_008.vinculada;
    const detalhe = await chamar('sgcSolicitacaoCarregar', { id }, U.gil);
    assert.equal(detalhe.ok, true, detalhe.erro);
    assert.equal(Number(detalhe.solicitacao.ID), id);

    const eventos = detalhe.historico.map((h) => h.EVENTO);
    assert.deepEqual(eventos, ['criada', 'aprovada', 'vinculada', 'desvinculada', 'vinculada']);
    assert.ok(detalhe.historico.every((h) => h.EM), 'toda linha tem quando');
    assert.ok(detalhe.historico.every((h) => h.POR_NOME), 'toda linha tem quem');
    assert.equal(detalhe.historico[0].POR_NOME, 'Gil Gestor', 'a linha `criada` sai de CRIADO_POR/CRIADO_EM (R-067)');
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO_HISTORICO WHERE ID_SOLICITACAO = ?', id), 4, 'só 5 - 1: a `criada` não é gravada');
    assert.match(detalhe.historico[2].DETALHE, /NESTLE/, 'o vínculo cita o pedido');

    const alheia = await chamar('sgcSolicitacaoCarregar', { id: SOLICITACOES_008.recusada }, U.leo);
    assert.equal(alheia.ok, false, 'o comercial não lê a solicitação de outro nem por id');
  });

  /* ─────────── T-085 — a situação de atendimento derivada ─────────── */

  await teste('C-011 / RN-008: a situação acompanha a fase do pedido nas 10 etapas, vira nao_atendida com o item em B.O. e sem_pedido sem vínculo', async () => {
    const id = SOLICITACOES_008.vinculada;
    const card = CARDS_008.vinculado;
    const situacaoAgora = async () => {
      const [linha] = (await listar({}, U.gil)).filter((l) => Number(l.ID) === id);
      return linha.SITUACAO;
    };
    const esperado = {
      analise: 'em_analise', tecnica: 'em_aprovacao', diretoria: 'em_aprovacao',
      envio: 'em_envio', enviado: 'enviada', transito: 'em_transito',
      faturamento: 'em_faturamento', bo: 'em_faturamento',
      concluido: 'atendida', cancelado: 'nao_atendida',
    };
    try {
      for (const [chave, situacao] of Object.entries(esperado)) {
        emFase(card, chave);
        assert.equal(await situacaoAgora(), situacao, `fase ${chave}`);
      }

      // O item daquele produto em B.O. na fase B.O.: não atendida (RN-008).
      emFase(card, 'bo');
      db.prepare("UPDATE SGC_PEDIDO_ITEM SET STATUS = 'bo' WHERE ID_CARD = ? AND CODPROD = 5301").run(card);
      assert.equal(await situacaoAgora(), 'nao_atendida');
      db.prepare("UPDATE SGC_PEDIDO_ITEM SET STATUS = 'enviado' WHERE ID_CARD = ? AND CODPROD = 5301").run(card);

      // Sem vínculo: sem_pedido, qualquer que seja a fase do card.
      db.prepare('UPDATE SGC_SOLICITACAO SET ID_CARD = 0 WHERE ID = ?').run(id);
      assert.equal(await situacaoAgora(), 'sem_pedido');
      db.prepare('UPDATE SGC_SOLICITACAO SET ID_CARD = ? WHERE ID = ?').run(card, id);

      // O filtro por situação usa a MESMA régua da coluna.
      emFase(card, 'enviado');
      const enviadas = (await listar({ situacao: 'enviada' }, U.gil)).map((l) => Number(l.ID));
      assert.ok(enviadas.includes(id), 'o filtro de situação recorta pela régua, não por coluna gravada');
      assert.equal(
        await total({ situacao: 'sem_pedido' }, U.gil),
        (await listar({ situacao: 'sem_pedido' }, U.gil)).length,
        'listagem e total aplicam a mesma régua',
      );
    } finally {
      emFase(card, 'enviado');
      db.prepare("UPDATE SGC_PEDIDO_ITEM SET STATUS = 'enviado' WHERE ID_CARD = ? AND CODPROD = 5301").run(card);
      db.prepare('UPDATE SGC_SOLICITACAO SET ID_CARD = ? WHERE ID = ?').run(card, id);
    }
  });

  /* ─────────── T-082 — o bloco da montagem ─────────── */

  await teste('C-007 / RN-012 / RN-017 / RNF-001: o bloco da montagem devolve 4 linhas em UMA execução, na ordem urgente, alta, normal antiga, normal nova', async () => {
    const linhasBloco = await bloco(CARDS_008.montagem);
    assert.equal(linhasBloco.length, 4);
    assert.deepEqual(
      linhasBloco.map((l) => Number(l.ID)),
      ['filaUrgente', 'pendenteAlta', 'pendenteNormal', 'pendenteMesmoProduto'].map((c) => SOLICITACOES_008[c]),
      'prioridade primeiro e, dentro dela, a mais antiga antes da mais nova',
    );
    assert.deepEqual(linhasBloco.map((l) => l.PRIORIDADE), ['urgente', 'alta', 'normal', 'normal']);
    assert.ok(linhasBloco.every((l) => l.CRIADO_POR_NOME && l.JUSTIFICATIVA), 'vendedor e justificativa vêm na mesma chamada (RNF-001)');
    assert.ok(linhasBloco.slice(0, 3).every((l) => l.CLIENTE), 'o cliente vem com nome');
    assert.ok(linhasBloco.every((l) => Number(l.QT_NO_PEDIDO) === 0), 'nenhum desses produtos está no pedido ainda');

    const fora = new Set(['recusada', 'cancelada', 'vinculada', 'pendenteFilial2', 'pendenteOutroFornec'].map((c) => SOLICITACOES_008[c]));
    assert.ok(linhasBloco.every((l) => !fora.has(Number(l.ID))), 'recusada, cancelada, vinculada, outra filial e outro fornecedor ficam fora');

    // C-012, metade de leitura: o bloco do card da filial 2 não traz as da filial 1.
    const daFilial2 = await bloco(CARDS_008.montagemFilial2);
    assert.deepEqual(daFilial2.map((l) => Number(l.ID)), [SOLICITACOES_008.pendenteFilial2]);
  });

  /* ═════════════ o que grava ═════════════ */

  /* ─────────── T-080 — registro ─────────── */

  let idC001 = 0;

  await teste('C-001 / RN-002 / RN-004: Leo registra o 5301 com cliente 9201 — nasce pendente, com ele como vendedor, o fornecedor do produto e o cliente com CNPJ', async () => {
    const antes = conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO');
    await chamar('sgcEscSolicitacaoInserir', {
      codprod: 5301, descricao: 'BEBIDA LACTEA ZERO LACTOSE 200 ML', embalagem: 'CAIXA COM 24', unidade: 'UN',
      codfornec: 1042, fornecedor: 'NESTLE BRASIL LTDA', codfilial: '1', filial: 'Benenutri Matriz',
      quantidade: 24, justificativa: JUSTIFICATIVA_C001,
      codcli: 9201, cliente: 'Nutrivida Clinica Ltda', cnpjCliente: '12345678000190',
      prioridade: 'alta', criadoEm: AGORA,
    }, U.leo);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'), antes + 1);

    idC001 = Number(db.prepare('SELECT MAX(ID) AS ID FROM SGC_SOLICITACAO').get().ID);
    const nova = solicitacao(idC001);
    assert.equal(nova.STATUS, 'pendente');
    assert.equal(Number(nova.CRIADO_POR), U.leo, 'o autor é o vendedor (RN-002)');
    assert.equal(Number(nova.CODFORNEC), 1042);
    assert.equal(nova.FORNECEDOR, 'NESTLE BRASIL LTDA', 'o nome exato do cadastro do fornecedor (RN-004)');
    assert.equal(Number(nova.CODCLI), 9201);
    assert.equal(nova.CNPJ_CLIENTE, '12345678000190');
    assert.equal(Number(nova.QUANTIDADE), 24);
    assert.equal(nova.AVALIADO_EM, '', 'registro não é avaliação: sem data de referência ainda');
    assert.equal(nova.CRIADO_EM, AGORA);

    const detalhe = await chamar('sgcSolicitacaoCarregar', { id: idC001 }, U.leo);
    assert.equal(detalhe.ok, true, detalhe.erro);
    assert.equal(detalhe.historico[0].EVENTO, 'criada');
    assert.equal(detalhe.historico[0].POR_NOME, 'Leo Comercial');
    assert.equal(detalhe.historico.length, 1, 'só a linha derivada — nada gravado no registro (R-067)');
  });

  await teste('C-002: registrar sem cliente grava CODCLI 0 e cliente vazio — e o texto com apóstrofo entra inteiro (A-11)', async () => {
    const antes = conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO');
    await chamar('sgcEscSolicitacaoInserir', {
      codprod: 5305, descricao: "MANTEIGA SANT'ANNA EXTRA SEM SAL 200 G", embalagem: 'CX 12', unidade: 'UN',
      codfornec: 1042, fornecedor: 'NESTLE BRASIL LTDA', codfilial: '3', filial: 'Benenutri Filial Sul',
      quantidade: 10, justificativa: 'Giro que enxergamos na regiao, sem cliente fechado ainda.',
      codcli: 0, cliente: '', cnpjCliente: '', prioridade: 'normal', criadoEm: AGORA,
    }, U.leo);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'), antes + 1);

    const semCliente = solicitacao(Number(db.prepare('SELECT MAX(ID) AS ID FROM SGC_SOLICITACAO').get().ID));
    assert.equal(Number(semCliente.CODCLI), 0, 'sem cliente informado é 0, nunca "não comprou"');
    assert.equal(semCliente.CLIENTE, '');
    assert.equal(semCliente.DESCRICAO, "MANTEIGA SANT'ANNA EXTRA SEM SAL 200 G", 'o apóstrofo é escapado pelo runtime, uma vez só');
  });

  await teste('C-003: quantidade 0 e justificativa de 9 caracteres não gravam — a contagem antes e depois é a mesma', async () => {
    const base = {
      codprod: 5302, descricao: 'FARINHA LACTEA TRADICIONAL 380 G', embalagem: 'CX 12', unidade: 'UN',
      codfornec: 1042, fornecedor: 'NESTLE BRASIL LTDA', codfilial: '1', filial: 'Benenutri Matriz',
      quantidade: 12, justificativa: 'Justificativa suficiente para o registro.',
      codcli: 9202, cliente: 'Casa de Repouso Bem Viver Ltda', cnpjCliente: '22345678000181',
      prioridade: 'normal', criadoEm: AGORA,
    };
    const antes = conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO');
    await chamar('sgcEscSolicitacaoInserir', { ...base, quantidade: 0 }, U.leo);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'), antes, 'quantidade 0 não grava');
    await chamar('sgcEscSolicitacaoInserir', { ...base, justificativa: 'curta 123' }, U.leo);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'), antes, 'justificativa com 9 caracteres não grava');
  });

  await teste('RN-001: produto ausente, filial vazia e prioridade fora da lista também são recusadas pelo WHERE da escrita (0 linhas, D-03)', async () => {
    const base = {
      codprod: 5302, descricao: 'FARINHA LACTEA TRADICIONAL 380 G', embalagem: 'CX 12', unidade: 'UN',
      codfornec: 1042, fornecedor: 'NESTLE BRASIL LTDA', codfilial: '1', filial: 'Benenutri Matriz',
      quantidade: 12, justificativa: 'Justificativa suficiente para o registro.',
      codcli: 0, cliente: '', cnpjCliente: '', prioridade: 'normal', criadoEm: AGORA,
    };
    const antes = conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO');
    await chamar('sgcEscSolicitacaoInserir', { ...base, codprod: 0 }, U.leo);
    await chamar('sgcEscSolicitacaoInserir', { ...base, codfilial: '' }, U.leo);
    await chamar('sgcEscSolicitacaoInserir', { ...base, prioridade: 'urgentissima' }, U.leo);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'), antes);
  });

  /* ─────────── T-088 (parte) / C-012 — fornecedor e filial do bloco ─────────── */

  await teste('C-012: incluir no pedido uma solicitação de outra filial ou de outro fornecedor é recusado citando os dois, e o pedido não ganha item', async () => {
    const itensAntes = itensDoCard(CARDS_008.montagem).length;

    const outraFilial = await chamar('sgcSolicitacaoIncluirNoPedido', {
      cardId: CARDS_008.montagem, id: SOLICITACOES_008.pendenteFilial2,
    }, U.gil);
    assert.equal(outraFilial.ok, false);
    assert.match(outraFilial.erro, /filial/i);
    assert.match(outraFilial.erro, /fornecedor/i);

    const outroFornec = await chamar('sgcSolicitacaoIncluirNoPedido', {
      cardId: CARDS_008.montagem, id: SOLICITACOES_008.pendenteOutroFornec,
    }, U.gil);
    assert.equal(outroFornec.ok, false);
    assert.match(outroFornec.erro, /fornecedor/i);

    assert.equal(itensDoCard(CARDS_008.montagem).length, itensAntes, 'nenhuma das duas cria item');
    assert.equal(Number(solicitacao(SOLICITACOES_008.pendenteFilial2).ID_CARD), 0);
    assert.equal(Number(solicitacao(SOLICITACOES_008.pendenteOutroFornec).ID_CARD), 0);
  });

  /* ─────────── T-081 — avaliação e cancelamento ─────────── */

  await teste('C-006 / RN-007: Leo cancela a própria pendente; a de outro autor e a já aprovada não mudam', async () => {
    await chamar('sgcEscSolicitacaoCancelar', { id: idC001, canceladoEm: AGORA }, U.leo);
    assert.equal(solicitacao(idC001).STATUS, 'cancelada');

    await chamar('sgcEscSolicitacaoCancelar', { id: SOLICITACOES_008.pendenteOutroFornec, canceladoEm: AGORA }, U.leo);
    assert.equal(solicitacao(SOLICITACOES_008.pendenteOutroFornec).STATUS, 'pendente', 'cancelar a de outro vendedor é recusado');

    await chamar('sgcEscSolicitacaoCancelar', { id: SOLICITACOES_008.filaUrgente, canceladoEm: AGORA }, U.leo);
    assert.equal(solicitacao(SOLICITACOES_008.filaUrgente).STATUS, 'aprovada', 'depois de avaliada, quem desfaz é compras');
  });

  await teste('C-005 / RN-006: a recusa exige motivo de ao menos 10 caracteres; com o motivo, grava status, autor, data e a linha do histórico', async () => {
    const id = SOLICITACOES_008.pendenteOutroFornec;
    await chamar('sgcEscSolicitacaoAvaliar', { id, status: 'recusada', motivo: 'curto 123', avaliadoEm: AGORA }, U.ana);
    assert.equal(solicitacao(id).STATUS, 'pendente', 'motivo com 9 caracteres não grava');

    const motivo = 'Produto ja coberto pelo pedido 998877, chega em 12 dias.';
    await chamar('sgcEscSolicitacaoAvaliar', { id, status: 'recusada', motivo, avaliadoEm: AGORA }, U.ana);
    await chamar('sgcEscSolicitacaoHistoricoInserir', { id, idCard: 0, evento: 'recusada', detalhe: motivo, em: AGORA }, U.ana);

    const recusada = solicitacao(id);
    assert.equal(recusada.STATUS, 'recusada');
    assert.equal(recusada.MOTIVO, motivo);
    assert.equal(Number(recusada.AVALIADO_POR), U.ana);
    assert.equal(recusada.AVALIADO_EM, AGORA);
    const historico = historicoDe(id);
    assert.equal(historico.length, 1);
    assert.equal(historico[0].EVENTO, 'recusada');
    assert.equal(historico[0].DETALHE, motivo);
  });

  await teste('C-004 / RN-005: aprovar põe na fila e não cria pedido nem item — as contagens de KB_CARD e SGC_PEDIDO_ITEM não mudam', async () => {
    const id = SOLICITACOES_008.pendenteFilial2;
    const cardsAntes = conta('SELECT COUNT(*) AS N FROM KB_CARD');
    const itensAntes = conta('SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM');

    await chamar('sgcEscSolicitacaoAvaliar', { id, status: 'aprovada', motivo: '', avaliadoEm: AGORA }, U.ana);
    await chamar('sgcEscSolicitacaoHistoricoInserir', { id, idCard: 0, evento: 'aprovada', detalhe: 'Aprovada na fila de solicitações.', em: AGORA }, U.ana);

    const aprovada = solicitacao(id);
    assert.equal(aprovada.STATUS, 'aprovada');
    assert.equal(Number(aprovada.ID_CARD), 0, 'aprovar não é vincular (RN-005)');
    assert.equal(Number(aprovada.AVALIADO_POR), U.ana);
    assert.equal(aprovada.AVALIADO_EM, AGORA);
    assert.equal(conta('SELECT COUNT(*) AS N FROM KB_CARD'), cardsAntes);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_PEDIDO_ITEM'), itensAntes);
    assert.deepEqual(historicoDe(id).map((h) => h.EVENTO), ['aprovada']);
  });

  /* ─────────── T-083 — incluir no pedido ─────────── */

  await teste('C-008 / RNF-002: incluir a pendente cria o item com quantidade 24 e a origem, aprova, grava as duas linhas do histórico e a nota com "Leo"', async () => {
    const id = SOLICITACOES_008.pendenteAlta;
    const card = CARDS_008.montagem;
    const notasAntes = conta("SELECT COUNT(*) AS N FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota'", card);

    const saida = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id }, U.gil);
    assert.equal(saida.ok, true, saida.erro);
    assert.equal(saida.aprovouAgora, true, 'a solicitação estava pendente e foi aprovada na inclusão');
    assert.equal(Number(saida.quantidade), 24);

    const itens = itensDoCard(card);
    assert.equal(itens.length, 1);
    assert.equal(Number(itens[0].CODPROD), 5301);
    assert.equal(Number(itens[0].QT_PEDIDA), 24, 'o item nasce com a quantidade solicitada');
    assert.equal(Number(itens[0].ID_SOLICITACAO), id, 'a origem do item (RF-022)');
    assert.equal(itens[0].STATUS, 'montagem');

    const vinculada = solicitacao(id);
    assert.equal(vinculada.STATUS, 'aprovada');
    assert.equal(Number(vinculada.ID_CARD), card);
    assert.equal(Number(vinculada.ID_ITEM), Number(itens[0].ID));
    assert.ok(vinculada.AVALIADO_EM, 'a data de referência do rastreio é gravada no vínculo');

    assert.deepEqual(historicoDe(id).map((h) => h.EVENTO), ['aprovada', 'vinculada']);
    assert.match(historicoDe(id)[1].DETALHE, /NESTLE/);

    const notas = db.prepare("SELECT DETALHE FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota' ORDER BY ID").all(card);
    assert.equal(notas.length, notasAntes + 1, 'uma nota no histórico do pedido');
    assert.match(notas[notas.length - 1].DETALHE, /Leo/, 'a nota cita o vendedor');

    assert.equal((await bloco(card)).length, 3, 'a solicitação incluída some do bloco');
  });

  await teste('C-013 / RN-009 / RN-010: incluir a mesma de novo é recusado; a segunda do 5301 vincula ao item que já existe, sem sobrescrever a quantidade', async () => {
    const card = CARDS_008.montagem;
    const jaVinculada = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id: SOLICITACOES_008.pendenteAlta }, U.gil);
    assert.equal(jaVinculada.ok, false);
    assert.match(jaVinculada.erro, /já está vinculada/i);
    assert.match(jaVinculada.erro, /NESTLE/, 'a recusa cita o pedido que ganhou');
    assert.equal(itensDoCard(card).length, 1);

    const segunda = SOLICITACOES_008.pendenteMesmoProduto;
    const saida = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id: segunda }, U.gil);
    assert.equal(saida.ok, true, saida.erro);

    const itens = itensDoCard(card);
    assert.equal(itens.length, 1, 'duas solicitações do mesmo produto, UM item (RN-009)');
    assert.equal(Number(itens[0].QT_PEDIDA), 24, 'a quantidade já decidida pela montagem é preservada (RN-010)');
    assert.equal(Number(itens[0].ID_SOLICITACAO), segunda, 'a origem passa a ser a última incluída');
    assert.equal(Number(solicitacao(segunda).ID_CARD), card);
    assert.equal(Number(solicitacao(segunda).ID_ITEM), Number(itens[0].ID));
    assert.equal((await bloco(card)).length, 2);
  });

  /* ─────────── T-084 — desvínculo e recusa pelo bloco ─────────── */

  await teste('C-009 / RN-011: o par histórico + desvincular não mexe em solicitação de item vivo; com o item removido, devolve AS DUAS à fila', async () => {
    const card = CARDS_008.montagem;
    const ligadas = [SOLICITACOES_008.pendenteAlta, SOLICITACOES_008.pendenteMesmoProduto];

    // 1) item vivo: o par é idempotente e não desfaz nada.
    await chamar('sgcEscSolicitacaoHistoricoInserir', { id: 0, idCard: card, evento: 'desvinculada', detalhe: 'Item removido da lista do pedido.', em: AGORA }, U.gil);
    await chamar('sgcEscSolicitacaoDesvincular', { idCard: card, atualizadoEm: AGORA }, U.gil);
    for (const id of ligadas) assert.equal(Number(solicitacao(id).ID_CARD), card, 'item vivo mantém o vínculo');
    assert.equal(historicoDe(ligadas[0]).filter((h) => h.EVENTO === 'desvinculada').length, 0, 'nem a linha do histórico');

    // 2) item removido (o fluxo da tela: sgcEscItemRemover, depois o par).
    await chamar('sgcEscItemRemover', { idCard: card, codprod: 5301, atualizadoEm: AGORA }, U.gil);
    await chamar('sgcEscSolicitacaoHistoricoInserir', { id: 0, idCard: card, evento: 'desvinculada', detalhe: 'Item removido da lista do pedido.', em: AGORA }, U.gil);
    await chamar('sgcEscSolicitacaoDesvincular', { idCard: card, atualizadoEm: AGORA }, U.gil);

    for (const id of ligadas) {
      const devolvida = solicitacao(id);
      assert.equal(Number(devolvida.ID_CARD), 0, 'volta para a fila');
      assert.equal(Number(devolvida.ID_ITEM), 0);
      assert.equal(devolvida.STATUS, 'aprovada');
      assert.equal(historicoDe(id).filter((h) => h.EVENTO === 'desvinculada').length, 1);
    }
    assert.equal((await bloco(card)).length, 4, 'as duas reaparecem no bloco do próprio pedido');

    // 3) o mesmo par depois de ZERAR o item (o caminho do sgcAnaliseSair).
    const voltar = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id: ligadas[0] }, U.gil);
    assert.equal(voltar.ok, true, voltar.erro);
    db.prepare("UPDATE SGC_PEDIDO_ITEM SET QT_PEDIDA = 0, STATUS = 'removido' WHERE ID_CARD = ? AND CODPROD = 5301").run(card);
    await chamar('sgcEscSolicitacaoHistoricoInserir', { id: 0, idCard: card, evento: 'desvinculada', detalhe: 'Item zerado ao sair da Análise.', em: AGORA }, U.gil);
    await chamar('sgcEscSolicitacaoDesvincular', { idCard: card, atualizadoEm: AGORA }, U.gil);
    assert.equal(Number(solicitacao(ligadas[0]).ID_CARD), 0, 'item zerado e removido ao sair da montagem desfaz o vínculo');
    assert.equal(historicoDe(ligadas[0]).filter((h) => h.EVENTO === 'desvinculada').length, 2);
  });

  await teste('C-010: recusar pelo bloco usa as mesmas SFs da tela — a solicitação fica recusada e o bloco cai para 3', async () => {
    const card = CARDS_008.montagem;
    const id = SOLICITACOES_008.pendenteNormal;
    assert.equal((await bloco(card)).length, 4, 'as quatro ativas antes da recusa');

    const motivo = 'Coberto pelo pedido anterior, que chega na proxima semana.';
    await chamar('sgcEscSolicitacaoAvaliar', { id, status: 'recusada', motivo, avaliadoEm: AGORA }, U.gil);
    await chamar('sgcEscSolicitacaoHistoricoInserir', { id, idCard: 0, evento: 'recusada', detalhe: motivo, em: AGORA }, U.gil);

    assert.equal(solicitacao(id).STATUS, 'recusada');
    assert.equal(solicitacao(id).MOTIVO, motivo, 'o vendedor lê o motivo na tela dele');
    const restantes = await bloco(card);
    assert.equal(restantes.length, 3);
    assert.ok(!restantes.some((l) => Number(l.ID) === id));
  });

  /* ─────────── T-088 — personas, acesso restrito, fase e dono ─────────── */

  await teste('C-019 / RN-018: registrar é do comercial, avaliar é de compras, e incluir no pedido recusa comercial, diretoria, somente leitura e restrito de fora', async () => {
    const card = CARDS_008.montagem;
    const base = {
      codprod: 5303, descricao: 'LEITE CONDENSADO SEMIDESNATADO 395 G', embalagem: 'CX 24', unidade: 'UN',
      codfornec: 1042, fornecedor: 'NESTLE BRASIL LTDA', codfilial: '1', filial: 'Benenutri Matriz',
      quantidade: 6, justificativa: 'Registro que nao deveria ser aceito de um comprador.',
      codcli: 0, cliente: '', cnpjCliente: '', prioridade: 'normal', criadoEm: AGORA,
    };
    const antes = conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO');
    await chamar('sgcEscSolicitacaoInserir', base, U.ana);
    await chamar('sgcEscSolicitacaoInserir', base, U.gil);
    assert.equal(conta('SELECT COUNT(*) AS N FROM SGC_SOLICITACAO'), antes, 'o autor É o vendedor: comprador não registra (RN-002/D-009)');

    const idFila = SOLICITACOES_008.filaUrgente;
    const statusAntes = solicitacao(idFila).STATUS;
    await chamar('sgcEscSolicitacaoAvaliar', { id: idFila, status: 'recusada', motivo: 'Motivo suficiente para recusar isto aqui.', avaliadoEm: AGORA }, U.leo);
    await chamar('sgcEscSolicitacaoAvaliar', { id: idFila, status: 'recusada', motivo: 'Motivo suficiente para recusar isto aqui.', avaliadoEm: AGORA }, U.dora);
    assert.equal(solicitacao(idFila).STATUS, statusAntes, 'comercial e diretoria não avaliam');

    // RESTRICTED analista criado aqui, como a 007 faz (nenhum seed extra).
    db.prepare("INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES ('restrito.sol@sgc.local', 'Rita Solicitacoes Restrita', 'RESTRICTED', 1)").run();
    const rita = Number(db.prepare('SELECT MAX(ID) AS ID FROM INT_USER').get().ID);
    db.prepare('INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, ?)').run(rita, 'analista');
    db.prepare("INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES ('leitura.sol@sgc.local', 'Lia Somente Leitura', 'READ_ONLY', 1)").run();
    const lia = Number(db.prepare('SELECT MAX(ID) AS ID FROM INT_USER').get().ID);
    db.prepare('INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, ?)').run(lia, 'gestor');

    for (const quem of [U.leo, U.dora, lia]) {
      const recusado = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id: idFila }, quem);
      assert.equal(recusado.ok, false);
      assert.match(recusado.erro, /perfil/i, 'a recusa cita o perfil');
    }
    const restrito = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id: idFila }, rita);
    assert.equal(restrito.ok, false);
    assert.match(restrito.erro, /restrito|outra pessoa/i, 'RESTRICTED só opera o pedido que criou');
    assert.equal(Number(solicitacao(idFila).ID_CARD), 0, 'nenhuma das tentativas vinculou');

    const comoGil = await chamar('sgcSolicitacaoIncluirNoPedido', { cardId: card, id: idFila }, U.gil);
    assert.equal(comoGil.ok, true, comoGil.erro);
    assert.equal(Number(solicitacao(idFila).ID_CARD), card, 'o caminho legítimo continua passando');
  });

  await teste('C-019 (C-12 da revisão): a guarda de fase e dono vale nas duas escritas que recebem card — enviado não grava, RESTRICTED de fora não grava', async () => {
    const id = SOLICITACOES_008.recusada;
    const rita = Number(db.prepare("SELECT ID FROM INT_USER WHERE DESCR = 'restrito.sol@sgc.local'").get().ID);
    const linhasDe = () => historicoDe(id).length;

    // 1) fase errada: o card `vinculado` está em `enviado`, não em `analise`.
    const antesFase = linhasDe();
    await chamar('sgcEscSolicitacaoHistoricoInserir', {
      id, idCard: CARDS_008.vinculado, evento: 'desvinculada', detalhe: 'fora da montagem', em: AGORA,
    }, U.gil);
    assert.equal(linhasDe(), antesFase, 'card fora da Análise não recebe linha de histórico');

    // 2) dono: o card `montagem` foi criado por ana, e Rita é RESTRICTED.
    await chamar('sgcEscSolicitacaoHistoricoInserir', {
      id, idCard: CARDS_008.montagem, evento: 'desvinculada', detalhe: 'card alheio', em: AGORA,
    }, rita);
    assert.equal(linhasDe(), antesFase, 'RESTRICTED não escreve em card que não criou, mesmo na fase certa');

    // 3) o caminho legítimo grava — a guarda não é um "nunca".
    await chamar('sgcEscSolicitacaoHistoricoInserir', {
      id, idCard: CARDS_008.montagem, evento: 'desvinculada', detalhe: 'caminho legitimo', em: AGORA,
    }, U.gil);
    assert.equal(linhasDe(), antesFase + 1);

    // 4) o desvínculo do card `vinculado` (fase enviado, item vivo) não solta nada.
    const vinculada = SOLICITACOES_008.vinculada;
    await chamar('sgcEscSolicitacaoDesvincular', { idCard: CARDS_008.vinculado, atualizadoEm: AGORA }, U.gil);
    assert.equal(Number(solicitacao(vinculada).ID_CARD), CARDS_008.vinculado, 'o vínculo do pedido enviado continua de pé');
  });
}
