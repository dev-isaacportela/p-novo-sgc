// Seção Simulador do plan da 004 (agenda de análises): 6 agendamentos com
// datas relativas a hoje — dois atrasados e recorrentes (semanal, quinzenal),
// um pendente sem recorrência, um pendente com recorrência que passa do
// limite (DATA_LIMITE_RECORRENCIA), um cancelado e um já processado (com
// SGC_PEDIDO de ORIGEM='agenda') — e participantes no primeiro. Ver
// docs/specs/004-agenda-de-analises/plan.md §Simulador.
//
// B-06/B-07: o seed da 004 só insere agendamentos, participantes e a capa do
// pedido do agendamento 6 (para o RN-007) — fornecedores/filiais são da 001
// e personas são do seed/002-quadro.mjs (dono único de SGC_USUARIO_PERSONA);
// esta spec não cadastra nenhum dos dois.

function comDias(delta) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function seed004(db, cenario) {
  const agora = new Date().toISOString().slice(0, 19);
  const U = cenario.usuarios;

  const inserirAgenda = db.prepare(`INSERT INTO SGC_AGENDA
    (ID, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, DATA_ANALISE, PERIODO_INICIO, PERIODO_FIM,
     RECORRENCIA, DATA_LIMITE_RECORRENCIA, OBSERVACAO, ATIVO, PROCESSADO_EM, ID_CARD_GERADO,
     CANCELADO_EM, CANCELADO_POR, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (@ID, @CODFORNEC, @FORNECEDOR, @CODFILIAL, @FILIAL, @DATA_ANALISE, @PERIODO_INICIO, @PERIODO_FIM,
     @RECORRENCIA, @DATA_LIMITE_RECORRENCIA, @OBSERVACAO, @ATIVO, @PROCESSADO_EM, @ID_CARD_GERADO,
     @CANCELADO_EM, @CANCELADO_POR, @CRIADO_POR, @CRIADO_EM, @ATUALIZADO_EM)`);

  const linha = (campos) => ({
    ID: null, DATA_LIMITE_RECORRENCIA: null, OBSERVACAO: null, PROCESSADO_EM: null, ID_CARD_GERADO: null,
    CANCELADO_EM: null, CANCELADO_POR: null, ...campos,
  });

  const linhas = [
    // 1 — atrasado (hoje-1), semanal, sem limite. 2 participantes (gil, dora)
    // — a próxima ocorrência cai em hoje+6 (RF-009, C-006/C-017).
    linha({
      ID: 1, CODFORNEC: 1015, FORNECEDOR: 'Fresenius Kabi Brasil Ltda', CODFILIAL: '1', FILIAL: 'Benenutri Matriz',
      DATA_ANALISE: comDias(-1), PERIODO_INICIO: comDias(-46), PERIODO_FIM: comDias(-1),
      RECORRENCIA: 'semanal', ATIVO: 1, CRIADO_POR: U.ana, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    }),
    // 2 — atrasado (hoje-1), quinzenal, sem limite — a próxima cai em hoje+13.
    linha({
      ID: 2, CODFORNEC: 1042, FORNECEDOR: 'Nestle Brasil Ltda', CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte',
      DATA_ANALISE: comDias(-1), PERIODO_INICIO: comDias(-46), PERIODO_FIM: comDias(-1),
      RECORRENCIA: 'quinzenal', ATIVO: 1, CRIADO_POR: U.ana, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    }),
    // 3 — pendente (hoje+1), sem recorrência.
    linha({
      ID: 3, CODFORNEC: 1042, FORNECEDOR: 'Nestle Brasil Ltda', CODFILIAL: '3', FILIAL: 'Benenutri Filial Sul',
      DATA_ANALISE: comDias(1), PERIODO_INICIO: comDias(-44), PERIODO_FIM: comDias(1),
      RECORRENCIA: 'nenhuma', ATIVO: 1, CRIADO_POR: U.gil, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    }),
    // 4 — pendente (hoje+5), quinzenal com DATA_LIMITE_RECORRENCIA = hoje+10
    // (a próxima, hoje+19, passa do limite — C-005 no servidor); fornecedor
    // 1088 (Danone) INATIVO — é também o agendamento antigo do C-021/RN-015.
    linha({
      ID: 4, CODFORNEC: 1088, FORNECEDOR: 'Danone Ltda', CODFILIAL: '1', FILIAL: 'Benenutri Matriz',
      DATA_ANALISE: comDias(5), PERIODO_INICIO: comDias(-40), PERIODO_FIM: comDias(5),
      RECORRENCIA: 'quinzenal', DATA_LIMITE_RECORRENCIA: comDias(10), ATIVO: 1, CRIADO_POR: U.ana, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    }),
    // 5 — cancelado (ATIVO = FALSE, CANCELADO_EM), data hoje-2.
    linha({
      ID: 5, CODFORNEC: 1015, FORNECEDOR: 'Fresenius Kabi Brasil Ltda', CODFILIAL: '2', FILIAL: 'Benenutri Filial Norte',
      DATA_ANALISE: comDias(-2), PERIODO_INICIO: comDias(-47), PERIODO_FIM: comDias(-2),
      RECORRENCIA: 'nenhuma', ATIVO: 0, CANCELADO_EM: agora, CANCELADO_POR: U.gil, CRIADO_POR: U.ana, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    }),
    // 6 — processado (PROCESSADO_EM, ID_CARD_GERADO), data hoje-3, com
    // SGC_PEDIDO próprio (ORIGEM='agenda') logo abaixo — para o RN-007 provar
    // a segunda trava de idempotência (NOT EXISTS em SGC_PEDIDO) mesmo que
    // PROCESSADO_EM seja apagado à mão pelo teste.
    linha({
      ID: 6, CODFORNEC: 1042, FORNECEDOR: 'Nestle Brasil Ltda', CODFILIAL: '1', FILIAL: 'Benenutri Matriz',
      DATA_ANALISE: comDias(-3), PERIODO_INICIO: comDias(-48), PERIODO_FIM: comDias(-3),
      RECORRENCIA: 'nenhuma', ATIVO: 1, PROCESSADO_EM: agora, ID_CARD_GERADO: 9006, CRIADO_POR: U.ana, CRIADO_EM: agora, ATUALIZADO_EM: agora,
    }),
  ];
  for (const item of linhas) inserirAgenda.run(item);

  const inserirParticipante = db.prepare('INSERT INTO SGC_AGENDA_PARTICIPANTE (ID_AGENDA, USUARIO_ID, CRIADO_EM) VALUES (?, ?, ?)');
  inserirParticipante.run(1, U.gil, agora);
  inserirParticipante.run(1, U.dora, agora);

  // Capa do pedido do agendamento 6 — ID_CARD fora da faixa de autoincremento
  // de KB_CARD (que a onda 1 ainda não semeia), só para o NOT EXISTS de
  // sgcAgendaProcessar/RN-007 enxergar um SGC_PEDIDO de verdade.
  db.prepare(`INSERT INTO SGC_PEDIDO (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (9006, 1042, 'Nestle Brasil Ltda', '1', 'Benenutri Matriz', ?, ?, 'agenda', 6, ?, ?, ?)`)
    .run(comDias(-48), comDias(-3), U.ana, agora, agora);
}
