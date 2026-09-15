// Seção Simulador do plan da 006 (trânsito e recebimento): 7 pedidos (T1–T4 e
// T7 em `transito`, E5 em `enviado`, F6 em `faturamento`), 17 notas em SGC_NF
// na faixa reservada NUMNOTA 90001–90017 (R-036) e as entradas em PCNFENT das
// notas que já chegaram ao ERP. Ver
// docs/specs/006-transito-e-recebimento/plan.md §Simulador.
//
// Só INSERT: nenhuma tabela nasce aqui. Fornecedores (1015 Fresenius, 7 dias
// úteis; 1042 Nestlé, 10 corridos; o genérico 999999, que existe em PCFORNEC e
// NÃO em SGC_FORNECEDOR — é o "sem parametrização" de C-003), filiais e
// personas vêm dos seeds da 001 e da 002 (R-017); o quadro e as dez fases, do
// seed.mjs.
//
// Todo pedido daqui nasce com DT_ENVIO vazio: nenhum cenário desta spec
// depende do registro de envio, e assim eles ficam fora de
// sgcFaturamentoPendenteListar (005), que exige DT_ENVIO <> '' — o smoke roda
// tudo num banco só e as asserções da 005 não devem carregar carona (R-045).

const AGORA = '2026-09-15T08:00:00';

/** Hoje + `dias`, em AAAA-MM-DD. As notas de atraso são relativas ao dia do
 * teste, para as faixas (2, 5 e 9 dias) fecharem em qualquer data de execução. */
function emDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

const FORNECEDORES = {
  1015: 'FRESENIUS KABI BRASIL LTDA',
  1042: 'NESTLE BRASIL LTDA',
  999999: 'FORNECEDOR GENERICO',
};

const FILIAIS = { 1: 'Benenutri Matriz', 2: 'Benenutri Filial Norte', 3: 'Benenutri Filial Sul' };

/** Ids dos cards deste seed — o recorte de TODA asserção da suíte 006 (R-045:
 * o banco do smoke é um só, nenhum total absoluto de listagem vale). */
export const CARDS_006 = {};

export function seed006(db, cenario) {
  const U = cenario.usuarios;

  const inserirCard = db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?)`);
  const inserirResponsavel = db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, ?)');
  const inserirPedido = db.prepare(`INSERT INTO SGC_PEDIDO
    (ID_CARD, CODFORNEC, FORNECEDOR, CODFILIAL, FILIAL, PERIODO_INICIO, PERIODO_FIM, DT_ENVIO,
     NUMPED_WINTHOR, ORIGEM, ID_AGENDA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, ?, '2026-08-01', '2026-09-15', '', ?, 'manual', 0, ?, ?, ?)`);
  const inserirNf = db.prepare(`INSERT INTO SGC_NF
    (ID_CARD, NUMNOTA, SERIE, CHAVENFE, NUMTRANSENT, CODFORNEC, CODFILIAL, DT_EMISSAO, DT_ENTRADA,
     DT_RECEBIMENTO, VL_TOTAL, PRAZO_PARCELAS, ORIGEM, ALERTA_ATRASO_EM, VINCULADO_POR, VINCULADO_EM)
    VALUES (?, ?, '1', '', 0, ?, ?, ?, ?, ?, ?, '', 'manual', '', ?, ?)`);
  const inserirEntrada = db.prepare(`INSERT INTO PCNFENT
    (NUMTRANSENT, NUMNOTA, SERIE, CODFORNEC, CODFILIAL, DTEMISSAO, DTENT, DTCANCEL, VLTOTAL, CHAVENFE, PRAZO, ESPECIE)
    VALUES (?, ?, '1', ?, ?, ?, ?, ?, ?, '', 30, 'NF')`);

  /** Card + capa do pedido. `responsaveis` na ordem: o primeiro é quem assina o
   * movimento automático (RN-006). Devolve o ID_CARD. */
  function pedido({ chave, fase, codfornec, codfilial, responsaveis, criador, numped }) {
    const fornecedor = FORNECEDORES[codfornec];
    const filial = FILIAIS[codfilial];
    const titulo = `${String(filial).toUpperCase()} · ${String(fornecedor).toUpperCase()}`;
    inserirCard.run(
      cenario.boardCompras, cenario.fases[fase], titulo, 100, responsaveis[0] ?? null,
      JSON.stringify({ fornecedor, filial, prioridade: 'normal' }),
      `${titulo} ${fornecedor}`.toLowerCase(), criador, AGORA, AGORA, AGORA,
    );
    const idCard = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
    responsaveis.forEach((usuarioId, ordem) => inserirResponsavel.run(idCard, usuarioId, ordem + 1));
    inserirPedido.run(idCard, codfornec, fornecedor, String(codfilial), filial, numped || '', criador, AGORA, AGORA);
    CARDS_006[chave] = idCard;
    return idCard;
  }

  /** Uma nota do pedido. `recebimento` vazio = pendente. */
  function nota(idCard, { numnota, codfornec, codfilial, emissao, valor, entrada = '', recebimento = '' }) {
    inserirNf.run(idCard, numnota, codfornec, String(codfilial), emissao, entrada, recebimento, valor, U.ana, AGORA);
  }

  /* ── T1 — 2 notas recebidas e 1 vencida (C-001, C-010, C-012, C-021) ── */
  const T1 = pedido({ chave: 'T1', fase: 'transito', codfornec: 1015, codfilial: 1, responsaveis: [U.ana], criador: U.ana });
  nota(T1, { numnota: 90001, codfornec: 1015, codfilial: 1, emissao: '2026-08-24', valor: 12000, entrada: '2026-09-01', recebimento: '2026-09-01' });
  nota(T1, { numnota: 90002, codfornec: 1015, codfilial: 1, emissao: '2026-08-28', valor: 8000, entrada: '2026-09-09', recebimento: '2026-09-09' });
  nota(T1, { numnota: 90003, codfornec: 1015, codfilial: 1, emissao: emDias(-20), valor: 5000 });

  /* ── T2 — a última nota acabou de entrar no ERP: o pedido anda sozinho (C-009).
   *    O primeiro responsável é o gil: é o nome que fica no movimento. ── */
  const T2 = pedido({ chave: 'T2', fase: 'transito', codfornec: 1015, codfilial: 1, responsaveis: [U.gil, U.ana], criador: U.ana });
  nota(T2, { numnota: 90004, codfornec: 1015, codfilial: 1, emissao: emDias(-14), valor: 3000, entrada: emDias(-6), recebimento: emDias(-6) });
  nota(T2, { numnota: 90005, codfornec: 1015, codfilial: 1, emissao: emDias(-5), valor: 4500 });
  inserirEntrada.run(900005, 90005, 1015, '1', emDias(-5), emDias(-1), null, 4500);

  /* ── T3 — cancelada no ERP, duas filiais e nota sem entrada (C-002, C-007, C-008, C-013, C-022) ── */
  const T3 = pedido({ chave: 'T3', fase: 'transito', codfornec: 1042, codfilial: 2, responsaveis: [U.ana], criador: U.ana });
  nota(T3, { numnota: 90006, codfornec: 1042, codfilial: 2, emissao: '2026-08-28', valor: 7500 });
  nota(T3, { numnota: 90007, codfornec: 1042, codfilial: 2, emissao: emDias(-2), valor: 2500 });
  nota(T3, { numnota: 90008, codfornec: 1042, codfilial: 2, emissao: emDias(-4), valor: 6800 });
  // A entrada da 90007 existe, mas está cancelada: não é recebimento (RN-004).
  inserirEntrada.run(900007, 90007, 1042, '2', emDias(-2), emDias(-2), emDias(-1), 2500);
  // A 90008 deu entrada nas duas filiais; vale a do pedido (filial 2, hoje−1).
  inserirEntrada.run(900081, 90008, 1042, '1', emDias(-4), emDias(-3), null, 6800);
  inserirEntrada.run(900082, 90008, 1042, '2', emDias(-4), emDias(-1), null, 6800);

  /* ── T4 — sem prazo parametrizado e sem data de faturamento (C-003, C-004) ── */
  const T4 = pedido({ chave: 'T4', fase: 'transito', codfornec: 999999, codfilial: 1, responsaveis: [U.ana], criador: U.ana });
  nota(T4, { numnota: 90009, codfornec: 999999, codfilial: 1, emissao: '2026-08-24', valor: 1500 });
  nota(T4, { numnota: 90010, codfornec: 1015, codfilial: 1, emissao: '', valor: 900 });

  /* ── E5 — três notas vencidas em 2, 5 e 9 dias (C-005, C-011, C-015, C-016, C-017).
   *    Prazo do 1042 é em dias CORRIDOS (10): o atraso fecha exato em qualquer dia. ── */
  const E5 = pedido({ chave: 'E5', fase: 'enviado', codfornec: 1042, codfilial: 2, responsaveis: [U.ana], criador: U.ana, numped: '900500' });
  nota(E5, { numnota: 90011, codfornec: 1042, codfilial: 2, emissao: emDias(-12), valor: 4000 });
  nota(E5, { numnota: 90012, codfornec: 1042, codfilial: 2, emissao: emDias(-15), valor: 6000 });
  nota(E5, { numnota: 90013, codfornec: 1042, codfilial: 2, emissao: emDias(-19), valor: 10000 });

  /* ── F6 — já em Faturamento: fora do monitoramento e da lista (RN-011), com
   *    uma ocorrência de NF sem decisão que trava a conclusão (C-019, RN-013) ── */
  const F6 = pedido({ chave: 'F6', fase: 'faturamento', codfornec: 1015, codfilial: 1, responsaveis: [U.ana], criador: U.ana });
  nota(F6, { numnota: 90014, codfornec: 1015, codfilial: 1, emissao: emDias(-25), valor: 5500, entrada: emDias(-15), recebimento: emDias(-15) });
  nota(F6, { numnota: 90015, codfornec: 1015, codfilial: 1, emissao: emDias(-19), valor: 7200 });
  const idNf90014 = Number(db.prepare('SELECT ID FROM SGC_NF WHERE ID_CARD = ? AND NUMNOTA = 90014').get(F6).ID);
  db.prepare(`INSERT INTO SGC_NF_OCORRENCIA
    (ID_NF, ID_CARD, CODPROD, TIPO, RESULTADO, VALOR_ESPERADO, VALOR_ENCONTRADO, DELTA_PERC, DECISAO, JUSTIFICATIVA, CRIADO_EM)
    VALUES (?, ?, 5001, 'preco_divergente', 'divergente', '10.00', '12.50', 25.0, 'pendente', '', ?)`)
    .run(idNf90014, F6, AGORA);

  /* ── T7 — as duas notas já nasceram recebidas na vinculação (D-012 da 005) e
   *    não há NENHUMA linha em PCNFENT: o pedido só anda pela varredura do
   *    passo 6 do cron, que é o que C-023 prova ── */
  const T7 = pedido({ chave: 'T7', fase: 'transito', codfornec: 1015, codfilial: 1, responsaveis: [U.gil, U.ana], criador: U.ana });
  nota(T7, { numnota: 90016, codfornec: 1015, codfilial: 1, emissao: emDias(-10), valor: 3300, entrada: emDias(-3), recebimento: emDias(-3) });
  nota(T7, { numnota: 90017, codfornec: 1015, codfilial: 1, emissao: emDias(-9), valor: 2100, entrada: emDias(-2), recebimento: emDias(-2) });
}

export { emDias };
