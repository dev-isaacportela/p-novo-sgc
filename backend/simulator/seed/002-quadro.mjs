// Seção Simulador do plan da 002 (quadro de compras): SGC_FASE (as 10 chaves
// -> FASE_ID, o tradutor que toda regra usa), KB_CAMPO (os 6 campos do
// quadro, com a capa por fase), KB_AUTOMACAO (as 11 automações de e-mail),
// KB_META (os ganchos gancho:podeMover/gancho:podeExcluir) e 6 pedidos de
// exemplo, um por situação (analise, tecnica, diretoria, envio, enviado,
// cancelado). Ver docs/specs/002-quadro-de-compras/plan.md §Simulador.
//
// As personas (SGC_USUARIO_PERSONA) já nascem aqui: é dado simples que a 001
// também precisa (R-001), sem depender do resto desta spec.
//
// As listas de campos e automações NÃO são copiadas: vêm de
// backend/add-005-quadro-compras.mjs, o mesmo arquivo que as cria no sandbox.
// Assim o que o smoke testa é o que a plataforma recebe.
//
// Os ids dos ganchos saem de backend/ids-do-mapa.mjs (o mapa INTEIRO deste
// projeto, B-08) — o `lerIdsDoMapa` da lib só devolve as kbEsc*.

import { fileURLToPath } from 'node:url';
import { CAMPOS, CAPA_POR_FASE, automacoes } from '../../add-005-quadro-compras.mjs';
import { idsDoMapa } from '../../ids-do-mapa.mjs';

const MAPA = fileURLToPath(new URL('../../../frontend/src/lib/server-functions.ts', import.meta.url));

const PERSONA_POR_CHAVE = { admin: 'admin', ana: 'analista', gil: 'gestor', dora: 'diretoria', leo: 'comercial' };

/** C-010: uma pessoa sem linha de persona age como analista. */
export const USUARIO_SEM_PERSONA = { email: 'paula@sgc.local', nome: 'Paula Sem Persona', accessLevel: 'MEMBER' };

const FORNECEDOR = { codfornec: 1015, nome: 'Fresenius Kabi' }; // o mesmo cadastro do seed da 001 (R-017)
const FILIAL = { codfilial: '1', nome: 'Benenutri Matriz' };

/** RN-014 — "FILIAL · FORNECEDOR", em maiúsculas. Espelha `tituloDoPedido` da tela. */
const titulo = (filial, fornecedor) => `${filial.toUpperCase()} · ${fornecedor.toUpperCase()}`;

// Os 6 pedidos do seed, um por situação. `capa` completa SGC_PEDIDO.
const PEDIDOS = [
  { chave: 'analise', criador: 'ana', responsaveis: ['ana'] },
  { chave: 'tecnica', criador: 'ana', responsaveis: ['ana'] },
  { chave: 'diretoria', criador: 'ana', responsaveis: ['ana'] },
  { chave: 'envio', criador: 'ana', responsaveis: ['ana', 'gil'] },
  {
    chave: 'enviado',
    criador: 'ana',
    responsaveis: ['ana'],
    capa: { DT_ENVIO: '2026-09-10', CANAL: 'email', EMAIL_ENVIO: 'pedidos@nutrilatina.com.br', NUMPED_WINTHOR: '998877', ENVIO_POR: 2, ENVIO_EM: '2026-09-10T09:00:00' },
    comunicacao: { TIPO: 'email', PARA: 'pedidos@nutrilatina.com.br', CC: 'compras@benenutri.com', ASSUNTO: 'Pedido de compra 998877', ENVIADO_POR: 2, ENVIADO_EM: '2026-09-10T09:00:00' },
  },
  { chave: 'cancelado', criador: 'ana', responsaveis: ['ana'], capa: { CANC_MOTIVO: 'Indústria cancelou a campanha', CANC_POR: 3, CANC_EM: '2026-09-12T15:00:00' } },
];

export function seed002(db, cenario, { completo = false } = {}) {
  const boardId = cenario.boardCompras;
  const agora = new Date().toISOString().slice(0, 19);

  /* ── SGC_FASE: a chave estável de que TODA regra depende ── */
  const inserirFase = db.prepare('INSERT INTO SGC_FASE (BOARD_ID, CHAVE, FASE_ID, ORDEM) VALUES (?, ?, ?, ?)');
  Object.entries(cenario.fases).forEach(([chave, faseId], indice) => inserirFase.run(boardId, chave, faseId, indice + 1));

  /* ── personas (+ o 6º usuário, sem linha nenhuma: C-010) ── */
  const inserirPersona = db.prepare('INSERT INTO SGC_USUARIO_PERSONA (USUARIO_ID, PERSONA) VALUES (?, ?)');
  for (const [chave, persona] of Object.entries(PERSONA_POR_CHAVE)) {
    const usuarioId = cenario.usuarios[chave];
    if (usuarioId) inserirPersona.run(usuarioId, persona);
  }
  db.prepare('INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES (?, ?, ?, 1)')
    .run(USUARIO_SEM_PERSONA.email, USUARIO_SEM_PERSONA.nome, USUARIO_SEM_PERSONA.accessLevel);

  /* ── os 6 campos do quadro (RN-017: 0 obrigatórios, nenhum de fase) ── */
  const inserirCampo = db.prepare(`INSERT INTO KB_CAMPO
    (BOARD_ID, FASE_ID, CHAVE, LABEL, TIPO, OBRIGATORIO, NO_CARD, EDITAVEL_DEPOIS, ORDEM, CONFIG_JSON, CONDICAO_JSON, ATIVO)
    VALUES (?, NULL, ?, ?, ?, 0, ?, 0, ?, ?, NULL, 1)`);
  CAMPOS.forEach((campo, indice) => inserirCampo.run(
    boardId, campo.chave, campo.label, campo.tipo, campo.noCard ? 1 : 0, indice + 1, JSON.stringify(campo.config || {}),
  ));

  /* ── capa por fase (DS-01/C-06 e CA-04) ── */
  const capaDaFase = db.prepare('UPDATE KB_FASE SET CAPA_JSON = ? WHERE ID = ?');
  for (const [chave, capa] of Object.entries(CAPA_POR_FASE)) capaDaFase.run(JSON.stringify(capa), cenario.fases[chave]);

  /* ── as 11 automações de e-mail ── */
  const inserirAutomacao = db.prepare(`INSERT INTO KB_AUTOMACAO
    (BOARD_ID, NOME, GATILHO_JSON, CONDICAO_JSON, ACOES_JSON, ORDEM, ATIVO, CRIADO_EM)
    VALUES (?, ?, ?, NULL, ?, ?, 1, ?)`);
  automacoes(cenario.fases).forEach((auto, indice) => inserirAutomacao.run(
    boardId, auto.nome, JSON.stringify(auto.gatilho), JSON.stringify(auto.acoes), indice + 1, agora,
  ));

  /* ── as regras ligadas em KB_META (no sandbox quem grava é instalar({ ganchos })) ── */
  const ids = idsDoMapa(MAPA);
  const inserirMeta = db.prepare('INSERT INTO KB_META (CHAVE, VALOR) VALUES (?, ?)');
  inserirMeta.run('gancho:podeMover', String(ids.sgcPodeMover));
  inserirMeta.run('gancho:podeExcluir', String(ids.sgcPodeExcluir));

  /* ── os 6 pedidos, um por situação ── */
  const inserirCard = db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const inserirResponsavel = db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, ?)');
  const inserirMovimento = db.prepare('INSERT INTO KB_MOVIMENTO (CARD_ID, DE_FASE_ID, PARA_FASE_ID, USUARIO_ID, ORIGEM, QUANDO) VALUES (?, NULL, ?, ?, ?, ?)');
  const inserirPedido = db.prepare(`INSERT INTO SGC_PEDIDO
    (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, '2026-08-01', '2026-09-15', 'manual', 0, ?, ?, ?)`);
  const inserirComunicacao = db.prepare(`INSERT INTO SGC_COMUNICACAO
    (ID_CARD, TIPO, PARA, CC, ASSUNTO, CORPO, ENVIADO_POR, ENVIADO_EM) VALUES (?, ?, ?, ?, ?, '', ?, ?)`);

  const nomeDoTitulo = titulo(FILIAL.nome, FORNECEDOR.nome);
  const cards = [];
  PEDIDOS.forEach((pedido, indice) => {
    const criador = cenario.usuarios[pedido.criador];
    const responsaveis = pedido.responsaveis.map((chave) => cenario.usuarios[chave]);
    const valores = { fornecedor: FORNECEDOR.nome, filial: FILIAL.nome, valor_total: '0', prioridade: 'normal' };
    if (pedido.chave === 'cancelado' && pedido.capa) valores.motivo_cancelamento = pedido.capa.CANC_MOTIVO;
    inserirCard.run(
      boardId, cenario.fases[pedido.chave], nomeDoTitulo, (indice + 1) * 100, responsaveis[0], JSON.stringify(valores),
      `${nomeDoTitulo} ${FORNECEDOR.nome} ${FILIAL.nome}`.toLowerCase(), criador, agora, agora, agora,
    );
    const cardId = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
    cards.push(cardId);
    responsaveis.forEach((usuarioId, ordem) => inserirResponsavel.run(cardId, usuarioId, ordem + 1));
    inserirMovimento.run(cardId, cenario.fases[pedido.chave], criador, 'usuario', agora);
    inserirPedido.run(cardId, FORNECEDOR.codfornec, FORNECEDOR.nome, FILIAL.codfilial, FILIAL.nome, criador, agora, agora);
    for (const [coluna, valor] of Object.entries(pedido.capa || {})) {
      db.prepare(`UPDATE SGC_PEDIDO SET ${coluna} = ? WHERE ID_CARD = ?`).run(valor, cardId);
    }
    if (pedido.comunicacao) {
      const c = pedido.comunicacao;
      inserirComunicacao.run(cardId, c.TIPO, c.PARA, c.CC, c.ASSUNTO, c.ENVIADO_POR, c.ENVIADO_EM);
    }
  });

  if (completo) seed002Extras(db, cards);
  return cards;
}

/**
 * O que só o smoke precisa (o simulador de tela não nasce com lixo): 2 alertas
 * não lidos no P1 (C-025, RN-007) e 2 anexos no P5 (C-033).
 * `cards` = os ids devolvidos por `seed002`; sem eles, resolve pela ordem.
 */
export function seed002Extras(db, cards = null) {
  const ids = cards || db.prepare('SELECT ID FROM KB_CARD ORDER BY ID').all().map((linha) => Number(linha.ID));
  const [p1, , , , p5] = ids;
  const agora = new Date().toISOString().slice(0, 19);

  const inserirAlerta = db.prepare(`INSERT INTO SGC_ALERTA
    (ID_CARD, CODPROD, CHAVE, TIPO, MENSAGEM, LIDO, JUSTIFICATIVA, CRIADO_EM) VALUES (?, ?, ?, ?, ?, 0, '', ?)`);
  inserirAlerta.run(p1, 1024, 'vencimento:1024', 'vencimento', 'Lote do produto 1024 vence em 60 dias.', agora);
  inserirAlerta.run(p1, 2088, 'excesso:2088', 'excesso', 'Excesso de estoque do produto 2088 em outra filial.', agora);

  const inserirAnexo = db.prepare(`INSERT INTO KB_ANEXO
    (CARD_ID, TIPO, NOME, URL, TAMANHO, USUARIO_ID, AUTOR_NOME, CRIADO_EM) VALUES (?, 'link', ?, ?, 0, 2, 'Ana Analista', ?)`);
  inserirAnexo.run(p5, 'Pedido 998877.pdf', 'https://arquivos.local/pedido-998877.pdf', agora);
  inserirAnexo.run(p5, 'Tabela de precos.xlsx', 'https://arquivos.local/tabela-precos.xlsx', agora);
}
