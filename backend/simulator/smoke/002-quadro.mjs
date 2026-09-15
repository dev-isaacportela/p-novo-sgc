// Cenários C-001..C-044 e regras RN-001..RNF-005 da spec 002 (quadro de
// compras). Ver docs/specs/002-quadro-de-compras/plan.md §Testes.
//
// Tudo roda sobre as MESMAS definitions que o add-005-quadro-compras.mjs
// publica, num banco descartável, com os ganchos gravados em KB_META pelo
// seed — é a regra de verdade que responde, não um handler de mentira.
//
// RNF-005 (as 500 combinações) importa `motivoDeDestino` do frontend: é o
// único jeito de provar, no mesmo processo, que a tela e a SQL dão a mesma
// resposta. `transicoes.ts` é módulo puro (só `import type`), então o Node o
// carrega direto.

import { assert, CENARIO } from './base.mjs';
import { seed002Extras } from '../seed/002-quadro.mjs';
import { motivoDeDestino, FASES as CHAVES_FASE } from '../../../frontend/src/lib/transicoes.ts';

const AGORA = '2026-09-15T12:00:00';
const CAPA = {
  codfornec: 1015, fornecedor: 'Nutrilatina', codfilial: '1', filial: '1 — Matriz',
  periodoInicio: '2026-08-01', periodoFim: '2026-09-15',
};
const TITULO = '1 — MATRIZ · NUTRILATINA';

export async function suite(ctx) {
  const { db, chamar, teste, U, emails } = ctx;
  const boardId = CENARIO.boardCompras;
  const fases = CENARIO.fases;
  const usuarioSemPersona = 6;

  /* ── atalhos ── */

  const linhas = (resultado) => resultado.rows;
  const uma = (resultado) => resultado.rows[0];
  const pedidoDe = (cardId) => db.prepare('SELECT * FROM SGC_PEDIDO WHERE ID_CARD = ?').get(cardId);
  const cardDe = (cardId) => db.prepare('SELECT * FROM KB_CARD WHERE ID = ?').get(cardId);

  /** O gancho como o motor o chama: por id, com usuarioId, cardId, boardId e faseId. */
  const podeMover = async (usuarioId, cardId, chaveDestino) => uma(await chamar('sgcPodeMover', {
    usuarioId, cardId, boardId, faseId: fases[chaveDestino],
  }, usuarioId));
  const podeExcluir = async (usuarioId, cardId) => uma(await chamar('sgcPodeExcluir', {
    usuarioId, cardId, boardId, faseId: 0,
  }, usuarioId));

  /**
   * Coloca um card numa fase SEM passar pelo motor. É montagem de cenário, não
   * o que está sob teste: leva o pedido a uma etapa distante em uma linha, em
   * vez de encenar seis movimentos que outros testes já cobrem.
   */
  const emFase = (cardId, chave) => db.prepare('UPDATE KB_CARD SET FASE_ID = ? WHERE ID = ?').run(fases[chave], cardId);

  /** Cria um pedido como a tela cria: kbCardCriar + sgcEscPedidoCriar (D-007). */
  async function criarPedido(usuarioId = U.ana, responsaveis = [U.ana]) {
    const criado = await chamar('kbCardCriar', {
      boardId, titulo: TITULO, responsaveisIds: responsaveis.join(','), prazo: '',
      valoresJson: JSON.stringify({ fornecedor: CAPA.fornecedor, filial: CAPA.filial, prioridade: 'normal' }),
    }, usuarioId);
    assert.equal(criado.ok, true, criado.error);
    await chamar('sgcEscPedidoCriar', { cardId: criado.id, ...CAPA, agora: AGORA }, usuarioId);
    // Integração com a 003: o bloco PENDENCIAS real do gancho exige, para sair
    // da Análise, prazo padrão e acordado (iguais), ao menos um item com
    // quantidade e nenhum alerta por ler. O pedido "montado" desta suíte nasce
    // assim; o P1 do seed, com 2 alertas por ler, continua travado (C-025).
    db.prepare(`UPDATE SGC_PEDIDO SET PRAZO_PADRAO = '30/60', PRAZO_ACORDADO = '30/60' WHERE ID_CARD = ?`).run(criado.id);
    db.prepare(`INSERT INTO SGC_PEDIDO_ITEM (ID_CARD, CODPROD, DESCRICAO, QT_PEDIDA, PRECO_CUSTO, STATUS, COBERTURA_DIAS, COBERTURA_LIMITE, CRIADO_EM, ATUALIZADO_EM)
      VALUES (?, 1, 'ITEM DE TESTE', 1, 1, 'montagem', 0, 35, ?, ?)`).run(criado.id, AGORA, AGORA);
    return criado.id;
  }

  const nota = (cardId, texto, usuarioId) => chamar('kbNotaRegistrar', { cardId, texto, usuarioId: 0 }, usuarioId);

  const [P1, P2, P3, P4, P5, P6] = db.prepare('SELECT ID FROM KB_CARD ORDER BY ID LIMIT 6').all().map((l) => Number(l.ID));
  // C-025/RN-007 (2 alertas não lidos no P1) e C-033 (2 anexos no P5).
  seed002Extras(db, [P1, P2, P3, P4, P5, P6]);

  /* ─────────── T-080 — criação do pedido ─────────── */

  let NOVO = 0;
  await teste('C-001: kbCardCriar + sgcEscPedidoCriar (Ana) nascem na fase analise, com titulo gerado, criadora e responsavel, e 1 linha em SGC_PEDIDO com ORIGEM manual', async () => {
    NOVO = await criarPedido();
    const detalhe = await chamar('kbCardDetalhe', { cardId: NOVO }, U.ana);
    assert.equal(detalhe.card.faseId, fases.analise);
    assert.equal(detalhe.card.titulo, TITULO);
    assert.equal(detalhe.card.criadoPor, U.ana);
    assert.deepEqual(detalhe.card.responsaveisIds, [U.ana]);
    assert.equal(detalhe.card.valores.prioridade, 'normal', 'RN-018: o pedido nasce normal');

    const pedido = pedidoDe(NOVO);
    assert.ok(pedido, 'a capa deveria existir');
    assert.equal(pedido.ORIGEM, 'manual');
    assert.equal(pedido.ID_AGENDA, 0);
    assert.equal(pedido.CRIADO_POR, U.ana);
    assert.equal(pedido.FORNECEDOR, CAPA.fornecedor);
  });

  await teste('C-001 (R-010): sgcEscPedidoCapaInserir grava a capa do cron (origem agenda, idAgenda) sem sessao e, chamada duas vezes, continua 1 linha', async () => {
    const criado = await chamar('kbCardCriar', { boardId, titulo: TITULO, valoresJson: '{}', responsavelId: 0, prazo: '' }, U.ana);
    const entrada = { usuarioId: U.ana, cardId: criado.id, ...CAPA, origem: 'agenda', idAgenda: 7, agora: AGORA };
    await chamar('sgcEscPedidoCapaInserir', entrada, 0);
    await chamar('sgcEscPedidoCapaInserir', entrada, 0);
    const total = db.prepare('SELECT COUNT(*) AS N FROM SGC_PEDIDO WHERE ID_CARD = ?').get(criado.id);
    assert.equal(Number(total.N), 1, 'idempotente por ID_CARD');
    const pedido = pedidoDe(criado.id);
    assert.equal(pedido.ORIGEM, 'agenda');
    assert.equal(pedido.ID_AGENDA, 7);
    assert.equal(pedido.CRIADO_POR, U.ana);
  });

  /* ─────────── T-081 — movimentação ─────────── */

  await teste('C-004: analista move o pedido da Analise para a Aprovacao Tecnica e a passagem fica em KB_MOVIMENTO', async () => {
    const antes = db.prepare('SELECT COUNT(*) AS N FROM KB_MOVIMENTO WHERE CARD_ID = ?').get(NOVO);
    const movido = await chamar('kbCardMover', { cardId: NOVO, faseId: fases.tecnica, ordem: 0 }, U.ana);
    assert.equal(movido.ok, true, movido.error);
    assert.equal(cardDe(NOVO).FASE_ID, fases.tecnica);
    const depois = db.prepare('SELECT COUNT(*) AS N FROM KB_MOVIMENTO WHERE CARD_ID = ?').get(NOVO);
    assert.equal(Number(depois.N), Number(antes.N) + 1);
  });

  await teste('C-005 / RN-004: da Analise para a Diretoria nunca — o gancho recusa com a frase de F-04 e o kbCardMover devolve o mesmo motivo, sem sair da fase', async () => {
    const regra = await podeMover(U.ana, P1, 'diretoria');
    assert.equal(Number(regra.PODE), 0);
    assert.equal(regra.MOTIVO, 'O pedido precisa passar pela Aprovação Técnica antes de ir para a Aprovação da Diretoria.');
    const movido = await chamar('kbCardMover', { cardId: P1, faseId: fases.diretoria, ordem: 0 }, U.ana);
    assert.equal(movido.ok, false);
    assert.equal(movido.error, regra.MOTIVO);
    assert.equal(cardDe(P1).FASE_ID, fases.analise);
  });

  await teste('C-006: diretoria so movimenta na fase dela — recusa no pedido em Tecnica citando "Aprovação da Diretoria", aceita o que esta na fase 3', async () => {
    const movido = await chamar('kbCardMover', { cardId: P2, faseId: fases.diretoria, ordem: 0 }, U.dora);
    assert.equal(movido.ok, false);
    assert.match(movido.error, /Aprovação da Diretoria/);
    const permitido = await podeMover(U.dora, P3, 'envio');
    assert.equal(Number(permitido.PODE), 1);
    assert.equal(permitido.MOTIVO, '', 'R-020: MOTIVO vazio quando PODE = 1');
  });

  await teste('C-012 / C-007: gestor move em qualquer etapa — 5 para 6 sem nenhum dado de nota fiscal e 6 para 7', async () => {
    const paraTransito = await chamar('kbCardMover', { cardId: P5, faseId: fases.transito, ordem: 0 }, U.gil);
    assert.equal(paraTransito.ok, true, paraTransito.error);
    const paraFaturamento = await chamar('kbCardMover', { cardId: P5, faseId: fases.faturamento, ordem: 0 }, U.gil);
    assert.equal(paraFaturamento.ok, true, paraFaturamento.error);
    assert.equal(cardDe(P5).FASE_ID, fases.faturamento);
  });

  await teste('C-021 / RN-011: a Diretoria recebe da Tecnica e, como retorno, do Envio; da Analise continua recusada', async () => {
    assert.equal(Number((await podeMover(U.admin, P4, 'diretoria')).PODE), 1, 'envio -> diretoria e retorno');
    assert.equal(Number((await podeMover(U.admin, P2, 'diretoria')).PODE), 1, 'tecnica -> diretoria');
    assert.equal(Number((await podeMover(U.admin, P1, 'diretoria')).PODE), 0, 'analise -> diretoria nunca');
  });

  await teste('RN-020: nas fases 5 a 8 a unica recusa possivel e de persona (comercial e diretoria fora da fase dela)', async () => {
    const saidas = { enviado: 'transito', transito: 'faturamento', faturamento: 'concluido', bo: 'concluido' };
    const card = await criarPedido();
    for (const [origem, destino] of Object.entries(saidas)) {
      emFase(card, origem);
      for (const usuario of [U.admin, U.ana, U.gil]) {
        const regra = await podeMover(usuario, card, destino);
        assert.equal(Number(regra.PODE), 1, `${origem}>${destino} deveria liberar para ${usuario}`);
      }
      assert.equal(Number((await podeMover(U.leo, card, destino)).PODE), 0, 'comercial nunca');
      assert.equal(Number((await podeMover(U.dora, card, destino)).PODE), 0, 'diretoria so na fase dela');
    }
  });

  /* ─────────── T-082 — personas e acessos ─────────── */

  await teste('C-008 / RN-002: gestor com ACCESS_LEVEL READ_ONLY nao libera nenhum dos 10 destinos e a recusa cita "somente leitura"', async () => {
    db.prepare("UPDATE INT_USER SET ACCESS_LEVEL = 'READ_ONLY' WHERE ID = ?").run(U.gil);
    try {
      for (const destino of CHAVES_FASE) {
        const regra = await podeMover(U.gil, P2, destino);
        assert.equal(Number(regra.PODE), 0, `destino ${destino} deveria estar fechado`);
        assert.equal(regra.MOTIVO, 'Seu acesso é somente leitura.');
      }
      assert.equal(Number((await podeExcluir(U.gil, P2)).PODE), 0);
    } finally {
      db.prepare("UPDATE INT_USER SET ACCESS_LEVEL = 'MEMBER' WHERE ID = ?").run(U.gil);
    }
  });

  await teste('C-009: acesso RESTRICTED opera so os proprios pedidos — o de outra pessoa e recusado, o proprio continua movivel', async () => {
    const proprio = await criarPedido(U.gil, [U.gil]);
    db.prepare("UPDATE INT_USER SET ACCESS_LEVEL = 'RESTRICTED' WHERE ID = ?").run(U.gil);
    try {
      const deOutro = await podeMover(U.gil, P1, 'tecnica');
      assert.equal(Number(deOutro.PODE), 0);
      assert.equal(deOutro.MOTIVO, 'Seu acesso permite operar apenas os pedidos que você criou.');
      assert.equal(Number((await podeMover(U.gil, proprio, 'tecnica')).PODE), 1);
    } finally {
      db.prepare("UPDATE INT_USER SET ACCESS_LEVEL = 'MEMBER' WHERE ID = ?").run(U.gil);
    }
  });

  await teste('C-010 / RN-001: usuario sem linha de persona resolve para analista no sgcPersonaAtual e move da Analise para a Tecnica', async () => {
    const eu = uma(await chamar('sgcPersonaAtual', {}, usuarioSemPersona));
    assert.equal(eu.PERSONA, 'analista');
    assert.equal(eu.ACCESS_LEVEL, 'MEMBER');
    assert.equal(uma(await chamar('sgcPersonaAtual', {}, U.admin)).PERSONA, 'admin');

    const card = await criarPedido(usuarioSemPersona, [usuarioSemPersona]);
    const movido = await chamar('kbCardMover', { cardId: card, faseId: fases.tecnica, ordem: 0 }, usuarioSemPersona);
    assert.equal(movido.ok, true, movido.error);
  });

  await teste('C-011: a regra chamada direto (sem tela) devolve PODE 0 com o motivo de C-006, e KB_META tem os dois ganchos gravados', async () => {
    const regra = await podeMover(U.dora, P2, 'analise');
    assert.equal(Number(regra.PODE), 0);
    assert.equal(regra.MOTIVO, 'Você só movimenta pedidos na fase Aprovação da Diretoria.');
    const meta = db.prepare("SELECT CHAVE, VALOR FROM KB_META WHERE CHAVE LIKE 'gancho:%' ORDER BY CHAVE").all();
    assert.deepEqual(meta.map((l) => l.CHAVE), ['gancho:podeExcluir', 'gancho:podeMover']);
    assert.ok(meta.every((l) => Number(l.VALOR) > 0));
  });

  await teste('C-044 / RN-021: a persona comercial e recusada em mover e em excluir, com a frase do perfil', async () => {
    const mover = await podeMover(U.leo, P1, 'tecnica');
    assert.equal(Number(mover.PODE), 0);
    assert.equal(mover.MOTIVO, 'Seu perfil não tem acesso ao quadro de compras.');
    const excluir = await podeExcluir(U.leo, P1);
    assert.equal(Number(excluir.PODE), 0);
    assert.equal(excluir.MOTIVO, 'Seu perfil não tem acesso ao quadro de compras.');
    const movido = await chamar('kbCardMover', { cardId: P1, faseId: fases.tecnica, ordem: 0 }, U.leo);
    assert.equal(movido.ok, false);
    assert.equal(movido.error, mover.MOTIVO);
  });

  /* ─────────── T-083 — aprovação técnica e da diretoria ─────────── */

  await teste('C-013: sgcEscPedidoTecnicaAprovar (Gil) grava quem/quando, zera o motivo anterior e o historico ganha a nota', async () => {
    db.prepare("UPDATE SGC_PEDIDO SET TEC_MOTIVO = 'antigo' WHERE ID_CARD = ?").run(P2);
    await chamar('sgcEscPedidoTecnicaAprovar', { cardId: P2, agora: AGORA }, U.gil);
    const pedido = pedidoDe(P2);
    assert.equal(pedido.TEC_POR, U.gil);
    assert.equal(pedido.TEC_EM, AGORA);
    assert.equal(pedido.TEC_MOTIVO, '');
    const registro = await nota(P2, 'Aprovado tecnicamente por Gil Gestor', U.gil);
    assert.equal(registro.ok, true, registro.error);
    const notas = db.prepare("SELECT * FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota'").all(P2);
    assert.equal(notas.length, 1);
    assert.match(String(notas[0].DETALHE), /Aprovado tecnicamente/);
  });

  await teste('C-014 / RN-009: reprovacao tecnica sem motivo nao grava nada e o retorno para a Analise continua recusado', async () => {
    await chamar('sgcEscPedidoTecnicaReprovar', { cardId: P2, motivo: '', produtos: '', agora: AGORA }, U.gil);
    assert.equal(pedidoDe(P2).TEC_MOTIVO, '');
    const movido = await chamar('kbCardMover', { cardId: P2, faseId: fases.analise, ordem: 0 }, U.gil);
    assert.equal(movido.ok, false);
    assert.match(movido.error, /Reprovar/);
  });

  await teste('C-017: mover da Tecnica para a Analise sem reprovacao registrada e recusado citando a acao Reprovar', async () => {
    const regra = await podeMover(U.gil, P2, 'analise');
    assert.equal(Number(regra.PODE), 0);
    assert.equal(regra.MOTIVO, 'Para devolver o pedido para análise, use a ação Reprovar e informe o motivo.');
  });

  await teste('C-015: reprovar com motivo e 2 produtos grava as colunas e libera o retorno para a Analise', async () => {
    await chamar('sgcEscPedidoTecnicaReprovar', { cardId: P2, motivo: 'Preço acima do praticado', produtos: '1024,2088', agora: AGORA }, U.gil);
    const pedido = pedidoDe(P2);
    assert.equal(pedido.TEC_MOTIVO, 'Preço acima do praticado');
    assert.equal(pedido.TEC_PRODUTOS_REPROVADOS, '1024,2088');
    assert.equal(pedido.TEC_POR, null);
    const movido = await chamar('kbCardMover', { cardId: P2, faseId: fases.analise, ordem: 0 }, U.gil);
    assert.equal(movido.ok, true, movido.error);
  });

  await teste('C-016 / RN-010: sgcEscPedidoReprovacoesLimpar (chamada por id pelo sgcAnaliseSair da 003) zera os tres campos de reprovacao', async () => {
    db.prepare("UPDATE SGC_PEDIDO SET DIR_MOTIVO = 'Fluxo de caixa do mês' WHERE ID_CARD = ?").run(P2);
    await chamar('sgcEscPedidoReprovacoesLimpar', { usuarioId: U.ana, idCard: P2 }, 0);
    const pedido = pedidoDe(P2);
    assert.equal(pedido.TEC_MOTIVO, '');
    assert.equal(pedido.TEC_PRODUTOS_REPROVADOS, '');
    assert.equal(pedido.DIR_MOTIVO, '');
    emFase(P2, 'tecnica');
  });

  await teste('C-018: sgcEscPedidoDiretoriaAprovar (Dora) grava quem/quando e o pedido segue para o Envio', async () => {
    await chamar('sgcEscPedidoDiretoriaAprovar', { cardId: P3, agora: AGORA }, U.dora);
    const pedido = pedidoDe(P3);
    assert.equal(pedido.DIR_POR, U.dora);
    assert.equal(pedido.DIR_EM, AGORA);
    const movido = await chamar('kbCardMover', { cardId: P3, faseId: fases.envio, ordem: 0 }, U.dora);
    assert.equal(movido.ok, true, movido.error);
    emFase(P3, 'diretoria');
  });

  await teste('C-019: a reprovacao da diretoria fica em campo proprio e o motivo tecnico antigo continua legivel', async () => {
    db.prepare("UPDATE SGC_PEDIDO SET TEC_MOTIVO = 'Preço acima do praticado' WHERE ID_CARD = ?").run(P3);
    await chamar('sgcEscPedidoDiretoriaReprovar', { cardId: P3, motivo: 'Fluxo de caixa do mês', agora: AGORA }, U.dora);
    const pedido = pedidoDe(P3);
    assert.equal(pedido.DIR_MOTIVO, 'Fluxo de caixa do mês');
    assert.equal(pedido.TEC_MOTIVO, 'Preço acima do praticado');
    assert.equal(Number((await podeMover(U.dora, P3, 'analise')).PODE), 1);
  });

  await teste('C-020: a diretoria devolve para a Aprovacao Tecnica sem motivo, e a passagem fica registrada', async () => {
    const antes = db.prepare('SELECT COUNT(*) AS N FROM KB_MOVIMENTO WHERE CARD_ID = ?').get(P3);
    const movido = await chamar('kbCardMover', { cardId: P3, faseId: fases.tecnica, ordem: 0 }, U.dora);
    assert.equal(movido.ok, true, movido.error);
    const depois = db.prepare('SELECT COUNT(*) AS N FROM KB_MOVIMENTO WHERE CARD_ID = ?').get(P3);
    assert.equal(Number(depois.N), Number(antes.N) + 1);
    emFase(P3, 'diretoria');
  });

  /* ─────────── T-084 — cancelamento ─────────── */

  await teste('C-024 / RN-006: cancelar sem motivo nao grava nada e o destino Canceladas continua fechado', async () => {
    await chamar('sgcEscPedidoCancelar', { cardId: P4, motivo: '', agora: AGORA }, U.gil);
    assert.equal(pedidoDe(P4).CANC_MOTIVO, null);
    const regra = await podeMover(U.gil, P4, 'cancelado');
    assert.equal(Number(regra.PODE), 0);
    assert.equal(regra.MOTIVO, 'Use a ação "Cancelar compra" para informar o motivo.');
  });

  await teste('C-025 / RN-007: pedido na Analise com 2 alertas nao lidos nao avanca, mas cancela normalmente', async () => {
    const travado = await podeMover(U.ana, P1, 'tecnica');
    assert.equal(Number(travado.PODE), 0, 'o bloco PENDENCIAS (reserva da 003) segura a saida da Analise');
    assert.match(travado.MOTIVO, /Leia os 2 alertas/);

    await chamar('sgcEscPedidoCancelar', { cardId: P1, motivo: 'Indústria suspendeu a linha', agora: AGORA }, U.ana);
    assert.equal(pedidoDe(P1).CANC_MOTIVO, 'Indústria suspendeu a linha');
    const regra = await podeMover(U.ana, P1, 'cancelado');
    assert.equal(Number(regra.PODE), 1, 'cancelar nao cobra nada da etapa atual');
    const movido = await chamar('kbCardMover', { cardId: P1, faseId: fases.cancelado, ordem: 0 }, U.ana);
    assert.equal(movido.ok, true, movido.error);
  });

  let CANCELAR = 0;
  await teste('C-022: cancelar a partir de Faturamento grava motivo, quem e quando, e leva o pedido para Compras Canceladas', async () => {
    CANCELAR = await criarPedido();
    emFase(CANCELAR, 'faturamento');
    await chamar('sgcEscPedidoCancelar', { cardId: CANCELAR, motivo: 'Indústria cancelou a campanha', agora: AGORA }, U.gil);
    const pedido = pedidoDe(CANCELAR);
    assert.equal(pedido.CANC_MOTIVO, 'Indústria cancelou a campanha');
    assert.equal(pedido.CANC_POR, U.gil);
    assert.equal(pedido.CANC_EM, AGORA);
    const movido = await chamar('kbCardMover', { cardId: CANCELAR, faseId: fases.cancelado, ordem: 0 }, U.gil);
    assert.equal(movido.ok, true, movido.error);
    assert.equal(cardDe(CANCELAR).FASE_ID, fases.cancelado);
  });

  /* ─────────── T-085 — envio à indústria ─────────── */

  await teste('C-029 / RN-013: Envio para Enviado exige o envio registrado — recusado sem data e numero, liberado depois', async () => {
    const antes = await podeMover(U.ana, P4, 'enviado');
    assert.equal(Number(antes.PODE), 0);
    assert.equal(antes.MOTIVO, 'Registre o envio do pedido (plataforma ou e-mail) antes de mover para Enviado para Indústria.');
    db.prepare("UPDATE SGC_PEDIDO SET DT_ENVIO = '2026-09-15', NUMPED_WINTHOR = '998877' WHERE ID_CARD = ?").run(P4);
    assert.equal(Number((await podeMover(U.ana, P4, 'enviado')).PODE), 1);
    db.prepare("UPDATE SGC_PEDIDO SET DT_ENVIO = '', NUMPED_WINTHOR = '' WHERE ID_CARD = ?").run(P4);
  });

  await teste('C-028: envio sem o numero do pedido no ERP nao envia nem grava — 0 e-mails e 0 comunicacoes', async () => {
    const antesEmails = emails.length;
    const resultado = await chamar('sgcEnvioIndustriaRegistrar', {
      cardId: P4, canal: 'email', para: 'pedidos@nutrilatina.com.br', assunto: 'Pedido', corpo: '<p>Pedido</p>',
      dtEnvio: '2026-09-15', numped: '', obs: '',
    }, U.ana);
    assert.equal(resultado.ok, false);
    assert.match(resultado.error, /número do pedido/);
    assert.equal(emails.length, antesEmails, 'nenhum e-mail deveria sair');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COMUNICACAO WHERE ID_CARD = ?').get(P4).N), 0);
  });

  await teste('C-027: envio por e-mail sai para o contato + compras@benenutri.com, grava a comunicacao e a capa do envio; sem agenda de origem, agendaSincronizada false', async () => {
    const antesEmails = emails.length;
    const resultado = await chamar('sgcEnvioIndustriaRegistrar', {
      cardId: P4, canal: 'email', para: 'pedidos@nutrilatina.com.br',
      assunto: 'Pedido de compra 998877', corpo: '<p>Segue o pedido.</p>',
      dtEnvio: '2026-09-15', numped: '998877', obs: 'Entrega programada',
    }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.deepEqual(resultado.destinatarios, ['pedidos@nutrilatina.com.br', 'compras@benenutri.com']);
    assert.equal(resultado.agendaSincronizada, false, 'ID_AGENDA = 0: o passo da 004 e ignorado');
    assert.equal(emails.length, antesEmails + 1);
    assert.deepEqual(emails[emails.length - 1].to, resultado.destinatarios);

    const comunicacoes = linhas(await chamar('sgcComunicacoesListar', { cardId: P4, limite: 25, offset: 0 }, U.ana));
    assert.equal(comunicacoes.length, 1);
    assert.equal(comunicacoes[0].TIPO, 'email');
    assert.equal(comunicacoes[0].CC, 'compras@benenutri.com');
    assert.equal(comunicacoes[0].ENVIADO_NOME, 'Ana Analista');

    const pedido = pedidoDe(P4);
    assert.equal(pedido.DT_ENVIO, '2026-09-15');
    assert.equal(pedido.CANAL, 'email');
    assert.equal(pedido.NUMPED_WINTHOR, '998877');
    assert.equal(pedido.ENVIO_POR, U.ana);
  });

  await teste('C-030: canal plataforma nao dispara e-mail nenhum e grava 1 comunicacao do tipo plataforma', async () => {
    const card = await criarPedido();
    emFase(card, 'envio');
    const antesEmails = emails.length;
    const resultado = await chamar('sgcEnvioIndustriaRegistrar', {
      cardId: card, canal: 'plataforma', para: 'https://portal.nutrilatina.com.br/pedidos',
      assunto: 'Pedido de compra 112233', corpo: '', dtEnvio: '2026-09-15', numped: '112233', obs: '',
    }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.deepEqual(resultado.destinatarios, []);
    assert.equal(emails.length, antesEmails, 'plataforma nao manda e-mail');
    const comunicacoes = linhas(await chamar('sgcComunicacoesListar', { cardId: card, limite: 25, offset: 0 }, U.ana));
    assert.equal(comunicacoes.length, 1);
    assert.equal(comunicacoes[0].TIPO, 'plataforma');
    assert.match(comunicacoes[0].PARA, /portal\.nutrilatina/);
  });

  await teste('C-031 (EN-05 / R-012): envio de pedido nascido da agenda grava a data real e preserva a planejada em SGC_AGENDA — sgcEscAgendaEnvio por id recebe o usuarioId de quem enviou', async () => {
    const card = await criarPedido();
    emFase(card, 'envio');
    const agenda = db.prepare(`INSERT INTO SGC_AGENDA (CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM,
      ATIVO, PROCESSADO_EM, ID_CARD_GERADO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
      VALUES (?, ?, ?, ?, '2026-09-10', '2026-07-27', '2026-09-10', 1, ?, ?, ?, ?, ?)`)
      .run(CAPA.codfornec, CAPA.fornecedor, CAPA.codfilial, CAPA.filial, AGORA, card, U.ana, AGORA, AGORA);
    const idAgenda = Number(agenda.lastInsertRowid);
    db.prepare("UPDATE SGC_PEDIDO SET ID_AGENDA = ?, ORIGEM = 'agenda' WHERE ID_CARD = ?").run(idAgenda, card);

    const resultado = await chamar('sgcEnvioIndustriaRegistrar', {
      cardId: card, canal: 'plataforma', para: 'https://portal.nutrilatina.com.br/pedidos',
      assunto: '', corpo: '', dtEnvio: '2026-09-15', numped: '445566', obs: '',
    }, U.ana);
    assert.equal(resultado.ok, true, resultado.error);
    assert.equal(resultado.agendaSincronizada, true, 'a guarda da 004 exige o usuarioId de quem enviou');
    const linha = db.prepare('SELECT * FROM SGC_AGENDA WHERE ID = ?').get(idAgenda);
    assert.equal(linha.DATA_ENVIO_REAL, '2026-09-15');
    assert.equal(linha.DATA_ANALISE, '2026-09-15', 'a data da analise passa a ser a real');
    assert.equal(linha.DATA_PLANEJADA_ORIGINAL, '2026-09-10', 'a planejada fica guardada');
    db.prepare('DELETE FROM SGC_AGENDA WHERE ID = ?').run(idAgenda); // banco compartilhado: a 004 conta as agendas do seed
  });

  // A1 (revisão adversarial): o perfil business libera TODAS as server
  // functions, então quem quiser pode chamar a escrita "por id" direto, sem
  // passar pelo sgcEnvioIndustriaRegistrar. A guarda de persona sobre o
  // usuário recebido é o que impede isso.
  await teste('A1: comercial nao grava envio nem comunicacao por id — as tres escritas guardadas pelo usuario recebido nao mudam nada com o Leo', async () => {
    const card = await criarPedido();
    emFase(card, 'envio');
    db.prepare("UPDATE SGC_PEDIDO SET TEC_MOTIVO = 'Preço acima do praticado', DIR_MOTIVO = 'Fluxo de caixa' WHERE ID_CARD = ?").run(card);

    await chamar('sgcEscPedidoEnvio', {
      cardId: card, canal: 'plataforma', email: '', dtEnvio: '2026-09-15',
      numped: '000111', obs: '', enviadoPor: U.leo, agora: AGORA,
    }, U.leo);
    await chamar('sgcEscComunicacaoInserir', {
      cardId: card, tipo: 'email', para: 'leo@sgc.local', cc: '', assunto: 'Pedido',
      corpo: '<p>Pedido</p>', enviadoPor: U.leo, enviadoEm: AGORA,
    }, U.leo);
    await chamar('sgcEscPedidoReprovacoesLimpar', { usuarioId: U.leo, idCard: card }, U.leo);

    const pedido = pedidoDe(card);
    assert.ok(!pedido.DT_ENVIO, 'o comercial nao registra envio por id');
    assert.ok(!pedido.NUMPED_WINTHOR);
    assert.equal(pedido.ENVIO_POR, null);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COMUNICACAO WHERE ID_CARD = ?').get(card).N), 0);
    assert.equal(pedido.TEC_MOTIVO, 'Preço acima do praticado', 'o comercial nao apaga a reprovacao');
    assert.equal(pedido.DIR_MOTIVO, 'Fluxo de caixa');

    // A mesma chamada pela analista continua funcionando: a guarda barra a
    // persona errada, não a escrita.
    await chamar('sgcEscPedidoEnvio', {
      cardId: card, canal: 'plataforma', email: '', dtEnvio: '2026-09-15',
      numped: '000111', obs: '', enviadoPor: U.ana, agora: AGORA,
    }, U.ana);
    await chamar('sgcEscComunicacaoInserir', {
      cardId: card, tipo: 'plataforma', para: 'portal', cc: '', assunto: 'Pedido',
      corpo: '', enviadoPor: U.ana, enviadoEm: AGORA,
    }, U.ana);
    await chamar('sgcEscPedidoReprovacoesLimpar', { usuarioId: U.ana, idCard: card }, 0);
    const depois = pedidoDe(card);
    assert.equal(depois.NUMPED_WINTHOR, '000111');
    assert.equal(depois.TEC_MOTIVO, '');
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM SGC_COMUNICACAO WHERE ID_CARD = ?').get(card).N), 1);
  });

  /* ─────────── T-086 — e-mails e histórico ─────────── */

  await teste('C-032: entrar na Aprovacao Tecnica dispara a automacao da fase para os 2 responsaveis + a copia fixa', async () => {
    const card = await criarPedido(U.ana, [U.ana, U.gil]);
    const antes = emails.length;
    const movido = await chamar('kbCardMover', { cardId: card, faseId: fases.tecnica, ordem: 0 }, U.ana);
    assert.equal(movido.ok, true, movido.error);
    const automacao = movido.automacoes.find((a) => a.nome === 'E-mail: entrada em Aprovação Técnica');
    assert.ok(automacao, 'a automacao da fase deveria ter rodado');
    assert.equal(automacao.acoes[0].resultado, 'ok', automacao.acoes[0].erro);
    assert.deepEqual(automacao.acoes[0].para.sort(), ['ana@sgc.local', 'compras@benenutri.com', 'gil@sgc.local']);
    assert.equal(emails.length, antes + 1);
    assert.match(emails[emails.length - 1].subject, /Aprovação Técnica/);
  });

  await teste('C-033: entrar em Compras Concluidas manda os anexos ao criador — 2 linhas "nome — endereco"; sem anexos, "Nenhum anexo"', async () => {
    const antes = emails.length;
    const movido = await chamar('kbCardMover', { cardId: P5, faseId: fases.concluido, ordem: 0 }, U.gil);
    assert.equal(movido.ok, true, movido.error);
    const comAnexos = emails.slice(antes).find((e) => e.subject.includes('Anexos do pedido'));
    assert.ok(comAnexos, 'a automacao 11 deveria ter mandado o e-mail de anexos');
    assert.deepEqual(comAnexos.to, ['ana@sgc.local'], 'a 11 vai so ao criador');
    assert.match(comAnexos.body, /Pedido 998877\.pdf — https:\/\/arquivos\.local\/pedido-998877\.pdf/);
    assert.match(comAnexos.body, /Tabela de precos\.xlsx — https:\/\/arquivos\.local\/tabela-precos\.xlsx/);

    const semAnexo = await criarPedido();
    emFase(semAnexo, 'faturamento');
    const marca = emails.length;
    await chamar('kbCardMover', { cardId: semAnexo, faseId: fases.concluido, ordem: 0 }, U.gil);
    const vazio = emails.slice(marca).find((e) => e.subject.includes('Anexos do pedido'));
    assert.ok(vazio);
    assert.match(vazio.body, /Nenhum anexo/);
  });

  await teste('C-034: entrar em Compras Canceladas dispara a automacao propria — assunto de cancelado e o motivo no corpo', async () => {
    const card = await criarPedido();
    emFase(card, 'faturamento');
    await chamar('sgcEscPedidoCancelar', { cardId: card, motivo: 'Indústria cancelou a campanha', agora: AGORA }, U.gil);
    await chamar('kbCardAtualizar', {
      cardId: card, titulo: TITULO, responsaveisIds: String(U.ana), prazo: '',
      valoresJson: JSON.stringify({ motivo_cancelamento: 'Indústria cancelou a campanha' }),
    }, U.ana);
    const antes = emails.length;
    const movido = await chamar('kbCardMover', { cardId: card, faseId: fases.cancelado, ordem: 0 }, U.gil);
    assert.equal(movido.ok, true, movido.error);
    const email = emails.slice(antes).find((e) => e.subject.includes('cancelado'));
    assert.ok(email, 'a automacao 10 deveria ter rodado');
    assert.match(email.body, /Motivo do cancelamento: Indústria cancelou a campanha/);
  });

  await teste('C-043 / RN-019: as decisoes viram historico — 4 notas com autor e instante, e 7 registros com as passagens', async () => {
    const card = await criarPedido();
    emFase(card, 'tecnica');
    await chamar('sgcEscPedidoTecnicaAprovar', { cardId: card, agora: AGORA }, U.gil);
    await nota(card, 'Aprovado tecnicamente por Gil Gestor', U.gil);
    assert.equal((await chamar('kbCardMover', { cardId: card, faseId: fases.diretoria, ordem: 0 }, U.gil)).ok, true);

    await chamar('sgcEscPedidoDiretoriaReprovar', { cardId: card, motivo: 'Fluxo de caixa do mês', agora: AGORA }, U.dora);
    await nota(card, 'Reprovado pela diretoria por Dora Diretora', U.dora);
    assert.equal((await chamar('kbCardMover', { cardId: card, faseId: fases.analise, ordem: 0 }, U.dora)).ok, true);

    emFase(card, 'envio');
    const envio = await chamar('sgcEnvioIndustriaRegistrar', {
      cardId: card, canal: 'plataforma', para: 'https://portal.nutrilatina.com.br', assunto: 'Pedido 445566',
      corpo: '', dtEnvio: '2026-09-15', numped: '445566', obs: '',
    }, U.ana);
    assert.equal(envio.ok, true, envio.error);

    await chamar('sgcEscPedidoCancelar', { cardId: card, motivo: 'Pedido duplicado', agora: AGORA }, U.gil);
    await nota(card, 'Compra cancelada por Gil Gestor: Pedido duplicado', U.gil);

    const notas = db.prepare("SELECT * FROM KB_LOG WHERE CARD_ID = ? AND EVENTO = 'nota' ORDER BY ID").all(card);
    assert.equal(notas.length, 4, 'aprovacao tecnica, reprovacao da diretoria, envio e cancelamento');
    for (const linha of notas) {
      assert.ok(Number(linha.USUARIO_ID) > 0, 'toda nota tem autor');
      assert.match(String(linha.QUANDO), /^\d{4}-\d{2}-\d{2}T/, 'toda nota tem instante');
    }
    const movimentos = db.prepare('SELECT COUNT(*) AS N FROM KB_MOVIMENTO WHERE CARD_ID = ?').get(card);
    assert.equal(notas.length + Number(movimentos.N), 7, '4 decisoes + 3 passagens');
  });

  /* ─────────── T-087 — quadro, exclusão, notificações e segurança ─────────── */

  await teste('C-035 / RN-017: o cartao traz os 4 valores de capa, a fase Analise acrescenta alertas_pendentes e o quadro nasce com 0 campos obrigatorios', async () => {
    const lista = await chamar('kbCardsListar', {
      boardId, faseId: fases.cancelado, busca: '', responsavelId: 0, etiqueta: '', incluirConcluidos: 1, limite: 50, offset: 0,
    }, U.ana);
    assert.equal(lista.ok, true, lista.error);
    const cartao = lista.cards.find((c) => c.id === P6);
    assert.ok(cartao);
    for (const chave of ['fornecedor', 'filial', 'valor_total', 'prioridade']) {
      assert.ok(chave in cartao.valores, `a capa deveria trazer ${chave}`);
    }
    assert.equal(cartao.valores.motivo_cancelamento, 'Indústria cancelou a campanha');

    const capaAnalise = db.prepare('SELECT CAPA_JSON FROM KB_FASE WHERE ID = ?').get(fases.analise);
    assert.match(String(capaAnalise.CAPA_JSON), /alertas_pendentes/);
    const obrigatorios = db.prepare('SELECT COUNT(*) AS N FROM KB_CAMPO WHERE BOARD_ID = ? AND OBRIGATORIO = 1').get(boardId);
    assert.equal(Number(obrigatorios.N), 0);
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS N FROM KB_CAMPO WHERE BOARD_ID = ?').get(boardId).N), 6);
  });

  await teste('RN-018: a prioridade aceita alta e recusa altissima', async () => {
    const aceita = await chamar('kbCardAtualizar', {
      cardId: P6, titulo: TITULO, responsaveisIds: String(U.ana), prazo: '', valoresJson: JSON.stringify({ prioridade: 'alta' }),
    }, U.ana);
    assert.equal(aceita.ok, true, aceita.error);
    const recusa = await chamar('kbCardAtualizar', {
      cardId: P6, titulo: TITULO, responsaveisIds: String(U.ana), prazo: '', valoresJson: JSON.stringify({ prioridade: 'altíssima' }),
    }, U.ana);
    assert.equal(recusa.ok, false);
  });

  await teste('C-038: administrar o quadro e so do administrador — souAdmin falso para o gestor e kbFaseSalvar recusado', async () => {
    assert.equal((await chamar('kbBoardCarregar', { boardId: 0, slug: 'compras' }, U.gil)).souAdmin, false);
    assert.equal((await chamar('kbBoardCarregar', { boardId: 0, slug: 'compras' }, U.admin)).souAdmin, true);
    const recusado = await chamar('kbFaseSalvar', { id: fases.bo, boardId, nome: 'Pendências', capaJson: '' }, U.gil);
    assert.equal(recusado.ok, false);
  });

  await teste('C-039 / RN-015: excluir pedido e de admin, gestor e diretoria — analista e comercial recusados nos dois lados', async () => {
    const esperado = { [U.admin]: 1, [U.ana]: 0, [U.gil]: 1, [U.dora]: 1, [U.leo]: 0 };
    for (const [usuarioId, pode] of Object.entries(esperado)) {
      const regra = await podeExcluir(Number(usuarioId), P4);
      assert.equal(Number(regra.PODE), pode, `usuario ${usuarioId}`);
      if (!pode) assert.ok(regra.MOTIVO.length > 0);
    }
    assert.match((await podeExcluir(U.ana, P4)).MOTIVO, /Cancelar compra/);

    const comoAna = await chamar('kbCardExcluir', { cardId: P4 }, U.ana);
    assert.equal(comoAna.ok, false);
    assert.equal(cardDe(P4).EXCLUIDO_EM, null);
    const comoGil = await chamar('kbCardExcluir', { cardId: P4 }, U.gil);
    assert.equal(comoGil.ok, true, comoGil.error);
  });

  await teste('C-042: sgcEscPersonaSalvar muda a persona do Gil como admin e nao faz nada como analista', async () => {
    await chamar('sgcEscPersonaSalvar', { usuarioAlvo: U.gil, persona: 'diretoria', agora: AGORA }, U.admin);
    assert.equal(uma(await chamar('sgcPersonaAtual', {}, U.gil)).PERSONA, 'diretoria');
    await chamar('sgcEscPersonaSalvar', { usuarioAlvo: U.gil, persona: 'gestor', agora: AGORA }, U.ana);
    assert.equal(uma(await chamar('sgcPersonaAtual', {}, U.gil)).PERSONA, 'diretoria', 'analista nao atribui persona');
    await chamar('sgcEscPersonaSalvar', { usuarioAlvo: U.gil, persona: 'gestor', agora: AGORA }, U.admin);
    assert.equal(uma(await chamar('sgcPersonaAtual', {}, U.gil)).PERSONA, 'gestor');

    const listados = linhas(await chamar('sgcPersonasListar', { busca: 'Gil', limite: 25, offset: 0 }, U.admin));
    assert.equal(listados.length, 1);
    assert.equal(listados[0].PERSONA, 'gestor');
    assert.equal(Number(uma(await chamar('sgcPersonasListarTotal', { busca: '' }, U.admin)).TOTAL), 6);
  });

  // O feed é "o que aconteceu nos MEUS pedidos, por outra pessoa": quem olha é
  // a Paula, que até aqui não recebeu nada — assim o total do feed é o do
  // cenário, e não a soma do que os testes anteriores movimentaram.
  let CARD_FEED = 0;
  await teste('C-041: o feed devolve responsavel novo, pedido movido e mensagem nova dos meus pedidos, do mais recente para o mais antigo', async () => {
    assert.equal(Number(uma(await chamar('sgcNotificacoesListarTotal', {}, usuarioSemPersona)).TOTAL), 0);
    CARD_FEED = await criarPedido(U.gil, [usuarioSemPersona]);
    await chamar('kbCardAtualizar', {
      cardId: CARD_FEED, titulo: TITULO, responsaveisIds: `${usuarioSemPersona},${U.gil}`, prazo: '', valoresJson: '{}',
    }, U.gil);
    await chamar('kbCardMover', { cardId: CARD_FEED, faseId: fases.tecnica, ordem: 0 }, U.gil);
    await chamar('kbMensagemEnviar', { cardId: CARD_FEED, conteudo: 'Confere o preço do 1024, por favor.' }, U.gil);

    // Instantes distintos: o seed e as três ações cabem no mesmo segundo.
    db.prepare("UPDATE KB_LOG SET QUANDO = '2026-09-15T08:00:00' WHERE CARD_ID = ? AND EVENTO = 'campo_alterado'").run(CARD_FEED);
    db.prepare("UPDATE KB_MOVIMENTO SET QUANDO = '2026-09-15T09:00:00' WHERE CARD_ID = ? AND DE_FASE_ID IS NOT NULL").run(CARD_FEED);
    db.prepare("UPDATE KB_MENSAGEM SET CRIADO_EM = '2026-09-15T10:00:00' WHERE CARD_ID = ?").run(CARD_FEED);

    const feed = linhas(await chamar('sgcNotificacoesListar', { limite: 25, offset: 0 }, usuarioSemPersona));
    assert.equal(feed.length, 3);
    assert.deepEqual(feed.map((l) => l.TIPO), ['mensagem', 'movimento', 'responsavel']);
    assert.ok(feed.every((l) => l.QUEM === 'Gil Gestor' && Number(l.CARD_ID) === CARD_FEED));
    assert.equal(Number(uma(await chamar('sgcNotificacoesListarTotal', {}, usuarioSemPersona)).TOTAL), 3);
  });

  await teste('RNF-003: com 60 registros o feed devolve a pagina de 25 e o total 60', async () => {
    const inserir = db.prepare("INSERT INTO KB_MENSAGEM (CARD_ID, USUARIO_ID, AUTOR_NOME, CONTEUDO, CRIADO_EM) VALUES (?, ?, 'Gil Gestor', ?, ?)");
    for (let i = 1; i <= 57; i += 1) inserir.run(CARD_FEED, U.gil, `Recado ${i}`, `2026-09-14T${String(i % 24).padStart(2, '0')}:00:00`);

    const pagina = linhas(await chamar('sgcNotificacoesListar', { limite: 25, offset: 0 }, usuarioSemPersona));
    assert.equal(pagina.length, 25);
    assert.equal(Number(uma(await chamar('sgcNotificacoesListarTotal', {}, usuarioSemPersona)).TOTAL), 60);
    const ultima = linhas(await chamar('sgcNotificacoesListar', { limite: 25, offset: 50 }, usuarioSemPersona));
    assert.equal(ultima.length, 10);
  });

  /* ─────────── T-088 — orçamento e equivalência ─────────── */

  await teste('RNF-001: abrir um pedido custa 2 execucoes — kbCardDetalhe + sgcPedidoCarregar — e o carregar devolve capa, itens e alertas', async () => {
    let execucoes = 0;
    const contar = async (nome, entrada, usuarioId) => { execucoes += 1; return chamar(nome, entrada, usuarioId); };
    const detalhe = await contar('kbCardDetalhe', { cardId: P6 }, U.ana);
    const pedido = await contar('sgcPedidoCarregar', { cardId: P6 }, U.ana);
    assert.equal(execucoes, 2);
    assert.equal(detalhe.ok, true, detalhe.error);
    assert.equal(pedido.ok, true, pedido.error);
    assert.equal(pedido.pedido.ID_CARD, P6);
    assert.equal(pedido.pedido.CANC_MOTIVO, 'Indústria cancelou a campanha');
    assert.deepEqual(pedido.itens, [], 'os itens sao da 003, mas a consulta ja existe');
    assert.deepEqual(pedido.alertas, []);

    const semCapa = await chamar('sgcPedidoCarregar', { cardId: 999999 }, U.ana);
    assert.equal(semCapa.pedido, null, 'card sem capa nao quebra a tela');
  });

  await teste('RNF-004: o gancho devolve exatamente 1 linha, com PODE e MOTIVO', async () => {
    const { rows } = await chamar('sgcPodeMover', { usuarioId: U.ana, cardId: P2, boardId, faseId: fases.diretoria }, U.ana);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['MOTIVO', 'PODE']);
  });

  await teste('RNF-005 / D-001: 5 personas x 10 fases x 10 destinos — motivoDeDestino (tela) e sgcPodeMover (servidor) concordam nas 500 combinacoes', async () => {
    const card = await criarPedido();
    // Estado conhecido dos dois lados: sem motivo nenhum, sem envio registrado
    // e sem pendencia de Analise (o bloco reservado a 003 devolve 0 aqui).
    db.prepare(`UPDATE SGC_PEDIDO SET CANC_MOTIVO = '', TEC_MOTIVO = '', DIR_MOTIVO = '',
      DT_ENVIO = '', NUMPED_WINTHOR = '' WHERE ID_CARD = ?`).run(card);
    const estado = {
      souCriador: true, temMotivoCancelamento: false, temMotivoTecnico: false,
      temMotivoDiretoria: false, envioRegistrado: false,
    };
    const personas = [['admin', U.admin], ['analista', U.ana], ['gestor', U.gil], ['diretoria', U.dora], ['comercial', U.leo]];

    let comparadas = 0;
    for (const origem of CHAVES_FASE) {
      emFase(card, origem);
      for (const destino of CHAVES_FASE) {
        for (const [persona, usuarioId] of personas) {
          const tela = motivoDeDestino(persona, 'MEMBER', origem, destino, estado);
          const servidor = await podeMover(usuarioId, card, destino);
          const podeNaTela = tela === null;
          assert.equal(Number(servidor.PODE) === 1, podeNaTela, `${persona} ${origem}>${destino}: tela ${tela} x servidor ${servidor.PODE}`);
          assert.equal(servidor.MOTIVO, tela === null ? '' : tela, `${persona} ${origem}>${destino}`);
          comparadas += 1;
        }
      }
    }
    assert.equal(comparadas, 500);
  });
}
