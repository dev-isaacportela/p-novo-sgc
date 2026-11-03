// Seção Simulador da spec 013 (movimentação de produtos). Ver
// docs/specs/013-movimentacao-produtos/plan.md §Simulador.
//
// Só INSERT: nenhuma tabela nasce aqui. Fornecedores e filiais são do
// seed/001-fornecedores.mjs, PCDEPTO do seed/003-itens.mjs, SGC_USUARIO_PERSONA
// do seed/002-quadro.mjs (R-017). Faixas próprias, para não mexer em nenhuma
// listagem das outras specs (R-045): produtos 5701-5734 do fornecedor **1088**
// (o inativo do seed 001 — nenhuma outra spec lista produto dele), clientes
// 9401-9405, NUMTRANSITEM e NUMTRANSVENDA >= 985001, notas >= 41001,
// matrículas 777 e 888.
//
// As datas são RELATIVAS a hoje (UTC, como o `date('now')` do dialeto): o corte
// de dias sem venda, a janela da ruptura e a validade dos lotes contam a partir
// do dia em que o teste roda.

/** Data de hoje − `dias` (negativo = no futuro), em AAAA-MM-DD. */
function haDias(dias) {
  const data = new Date();
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

export const FORNECEDOR_013 = 1088;
export const MATRICULA_BLOQUEIO = 777;

/** Os produtos que o smoke da 013 cita, por cenário. */
export const P013 = {
  semVenda120: 5701, vendido10: 5702, nuncaVendido: 5703, dAlho: 5704, semEstoque: 5705, inativo: 5706,
  excedente: 5710,
  lotes: 5711, parcial: 5712, liberado: 5713, longe: 5714,
  ruptura: 5720, abaixoMinimo: 5721, ritmoBaixo: 5722, semHistorico: 5723, transferencia: 5724,
  zerado: 5725, alto: 5726, monitorar: 5727, filial2: 5728,
  perdaP1: 5730, nuncaVendidoP2: 5731, venceHoje: 5732, semSaldo: 5733, bonificacao: 5734,
};

// CODPROD, DESCRICAO, CODEPTO, OBS2. Embalagem e unidade iguais para todos.
const PRODUTOS = [
  [5701, 'LEITE DE COCO 200 ML', 2, null],
  [5702, 'AVEIA EM FLOCOS 500 G', 2, null],
  [5703, 'FARINHA DE ARROZ 1 KG', 2, null],
  [5704, "OLEO D'ALHO 50 ML", 2, null],
  [5705, 'ACUCAR DEMERARA 1 KG', 2, null],
  [5706, 'ADOCANTE LIQUIDO 100 ML', 2, 'FORA DE LINHA'],
  [5710, 'CASTANHA DO PARA 250 G', 2, null],
  [5711, 'GRANOLA TRADICIONAL 1 KG', 2, null],
  [5712, 'MEL PURO 300 G', 2, null],
  [5713, 'GELEIA DE MORANGO 320 G', 2, null],
  [5714, 'PASTA DE AMENDOIM 500 G', 2, null],
  [5720, 'BARRA DE CEREAL 25 G', 2, null],
  [5721, 'CHA VERDE 15 SACHES', 2, null],
  [5722, 'CAFE SOLUVEL 100 G', 2, null],
  [5723, 'COOKIE INTEGRAL 60 G', 2, null],
  [5724, 'SUCO DE UVA 1 L', 2, null],
  [5725, 'AGUA DE COCO 1 L', 2, null],
  [5726, 'KOMBUCHA 300 ML', 2, null],
  [5727, 'CHIPS DE BANANA 50 G', 2, null],
  [5728, 'PIPOCA DE MICROONDAS 100 G', 2, null],
  [5730, 'BISCOITO INTEGRAL 200 G', 2, null],
  [5731, 'TORRADA SEM GLUTEN 160 G', 2, null],
  [5732, 'IOGURTE GREGO 100 G', 2, null],
  [5733, 'QUEIJO MINAS 500 G', 2, null],
  [5734, 'COPO DESCARTAVEL 200 ML', 4, null],
];

// CODPROD, CODFILIAL, QTEST, QTPEDIDA, CUSTOULTENT, DTULTSAIDA (RN-003: nunca é a última venda).
const ESTOQUES = [
  [5701, '1', 40, 0, 12.5, haDias(5)],
  [5702, '1', 30, 0, 9, haDias(10)],
  [5703, '1', 20, 0, 7, null],
  [5704, '1', 15, 0, 18, haDias(1)],
  [5705, '1', 0, 0, 6, null],
  [5706, '1', 50, 0, 5, null],
  [5710, '1', 100, 0, 15, haDias(5)],
  [5711, '1', 40, 0, 11, haDias(30)],
  [5712, '1', 30, 0, 22, null],
  [5713, '1', 25, 0, 14, null],
  [5714, '1', 18, 0, 16, null],
  [5720, '1', 40, 0, 3, haDias(1)],
  [5721, '1', 2, 0, 8, haDias(1)],
  [5722, '1', 40, 0, 12, haDias(1)],
  [5723, '1', 30, 0, 4, haDias(1)],
  [5724, '1', 40, 0, 6, haDias(1)],
  [5725, '1', 0, 0, 5, haDias(1)],
  [5726, '1', 30, 200, 9, haDias(1)],
  [5727, '1', 30, 400, 7, haDias(1)],
  [5728, '2', 10, 0, 4, haDias(1)],
  [5730, '1', 12, 0, 10, haDias(41)],
  [5730, '2', 0, 0, 8, haDias(150)],
  [5731, '3', 5, 0, 4, null],
  [5732, '1', 5, 0, 6, null],
  [5733, '1', 0, 0, 30, null],
  [5734, '1', 40, 0, 0.5, null],
];

// CODCLI, CLIENTE, CODATV1 (11 = órgão público; 20 = a própria rede).
const CLIENTES = [
  [9401, 'MERCADO BOM PRECO', 1],
  [9402, 'EMPORIO NATURAL', 2],
  [9403, 'PREFEITURA MUNICIPAL DE TESTE', 11],
  [9404, 'BENENUTRI FILIAL NORTE', 20],
  [9405, 'DISTRIBUIDORA REMESSA', 1],
];

export function seed013(db) {
  const inserirProduto = db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2)
    VALUES (?, ?, 'CX 12', 'UN', ${FORNECEDOR_013}, ?, 21, 12, ?)`);
  for (const [codprod, descricao, codepto, obs2] of PRODUTOS) inserirProduto.run(codprod, descricao, codepto, obs2);

  const inserirEstoque = db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTPEDIDA, QTBLOQUEADA, QTINDENIZ, QTRESERV, CUSTOULTENT, DTULTENT, DTULTSAIDA)
    VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?)`);
  for (const [codprod, codfilial, qtest, qtpedida, custo, saida] of ESTOQUES) {
    inserirEstoque.run(codprod, codfilial, qtest, qtpedida, custo, haDias(300), saida);
  }

  const inserirCliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1) VALUES (?, ?, ?, ?)');
  for (const [codcli, cliente, ramo] of CLIENTES) inserirCliente.run(codcli, cliente, 'J', ramo);

  /* ── PCMOV ── */
  let numtransitem = 985001;
  let numtransvenda = 985001;
  const inserirMov = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMNOTA, NUMLOTE, CUSTOREAL, CODFORNEC, NUMTRANSVENDA)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const inserirNota = db.prepare('INSERT INTO PCNFSAID (NUMTRANSVENDA, CONDVENDA) VALUES (?, ?)');
  const mov = (codprod, codfilial, codoper, dias, qt, extra = {}) => {
    let transvenda = null;
    if (extra.remessa) {
      transvenda = numtransvenda;
      numtransvenda += 1;
      inserirNota.run(transvenda, 8);
    }
    inserirMov.run(numtransitem, codprod, codfilial, extra.codcli ?? (codoper === 'S' ? 9401 : null), codoper,
      haDias(dias), qt, extra.punit ?? 20, extra.numnota ?? null, extra.lote ?? null, extra.custo ?? null,
      codoper.startsWith('E') ? FORNECEDOR_013 : null, transvenda);
    numtransitem += 1;
  };

  // Sem venda (filial 1). C-006: 5701 vendeu há 120 dias; 5702 há 10. C-007: 5703 nunca.
  mov(5701, '1', 'S', 120, 3);
  mov(5701, '1', 'E', 300, 60);
  mov(5702, '1', 'S', 10, 2);
  // C-008: o 5704 vendeu válido há 200 dias; ontem só público, rede e remessa.
  mov(5704, '1', 'S', 200, 4);
  mov(5704, '1', 'S', 1, 5, { codcli: 9403 });
  mov(5704, '1', 'S', 1, 5, { codcli: 9404 });
  mov(5704, '1', 'S', 1, 5, { codcli: 9405, remessa: true });
  // RN-001: o 5706 (inativo) não vende há um ano e não aparece.

  // C-011: 5710 vende 90 un. válidas em 90 dias (10 a cada 10 dias), a R$ 1.000 — é
  // o maior faturamento do fornecedor 1088 (76 %), e por isso curva A.
  for (let dias = 5; dias <= 85; dias += 10) mov(5710, '1', 'S', dias, 10, { punit: 1000 });

  // Ruptura (filial 1; janela 7, base 90 = dias 8..97).
  const base = (codprod, porDia, filial = '1') => {
    for (let dias = 8; dias <= 97; dias += 1) mov(codprod, filial, 'S', dias, porDia);
  };
  // C-026: 5720 vendeu 60 nos dias 3, 2 e 1 (20 cada), 1/dia na base, 40 em estoque.
  for (const dias of [3, 2, 1]) mov(5720, '1', 'S', dias, 20, { codcli: dias === 2 ? 9402 : 9401 });
  base(5720, 1);
  // C-027: 5721 vendeu 4 (abaixo da venda mínima 5), base 0,1/dia (9 un. em 90 dias).
  mov(5721, '1', 'S', 2, 2);
  mov(5721, '1', 'S', 1, 2);
  for (let dias = 10; dias <= 90; dias += 10) mov(5721, '1', 'S', dias, 1);
  // C-027: 5722 vendeu 60 na janela num ritmo 1,22× a base (7/dia).
  for (const dias of [6, 5, 4, 3, 2, 1]) mov(5722, '1', 'S', dias, 10);
  base(5722, 7);
  // C-028: 5723 vendeu 70 na janela e nada na base.
  for (const dias of [5, 3, 1]) mov(5723, '1', 'S', dias, dias === 1 ? 30 : 20);
  // C-031: 5724 recebeu 50 por transferência na janela.
  for (const dias of [3, 2, 1]) mov(5724, '1', 'S', dias, 20);
  mov(5724, '1', 'ET', 5, 50, { numnota: 41090 });
  base(5724, 1);
  // C-029: 5725 zerado (RUPTURA), 5726 com trânsito 200 (ALTO), 5727 com 400 (MEDIO).
  mov(5725, '1', 'S', 2, 5);
  mov(5725, '1', 'S', 1, 5);
  for (let dias = 10; dias <= 90; dias += 10) mov(5725, '1', 'S', dias, 1);
  for (const codprod of [5726, 5727]) {
    for (let dias = 7; dias >= 1; dias -= 1) mov(codprod, '1', 'S', dias, 10);
    base(codprod, 1);
  }
  // C-030: 5728 em alerta na filial 2 (30 na janela, 0,5/dia na base).
  for (const dias of [3, 2, 1]) mov(5728, '2', 'S', dias, 10);
  for (let dias = 8; dias <= 96; dias += 2) mov(5728, '2', 'S', dias, 1);

  // Perdas. C-034: o lote P1 do 5730 entrou por compra na filial 2 a R$ 8, foi
  // transferido para a filial 1 (nota 42001), vendeu lá pela última vez há 41
  // dias e venceu ontem com 12. A remessa de 10 dias atrás não é venda (P-02).
  mov(5730, '2', 'E', 200, 50, { lote: 'P1', custo: 8, numnota: 41001 });
  mov(5730, '2', 'ST', 150, 20, { lote: 'P1', numnota: 42001 });
  mov(5730, '1', 'ET', 149, 20, { lote: 'P1', numnota: 42001, custo: 8 });
  mov(5730, '1', 'S', 60, 4, { lote: 'P1' });
  mov(5730, '1', 'S', 41, 4, { lote: 'P1' });
  mov(5730, '1', 'S', 10, 2, { lote: 'P1', codcli: 9405, remessa: true });
  mov(5730, '2', 'S', 120, 30, { lote: 'P1' });
  // C-034: o lote P2 do 5731 entrou na filial 3 e nunca vendeu.
  mov(5731, '3', 'E', 300, 5, { lote: 'P2', custo: 4, numnota: 41002 });

  /* ── PCESTTRANSITO — C-013: dois registros do 5710 na filial 1 ── */
  const inserirTransito = db.prepare('INSERT INTO PCESTTRANSITO (CODPROD, CODFILIAL, QTTRANSITO, DTPREVISTA) VALUES (?, ?, ?, ?)');
  inserirTransito.run(5710, '1', 10, haDias(-10));
  inserirTransito.run(5710, '1', 10, haDias(-20));

  /* ── PCLOTE ── */
  const inserirLote = db.prepare(`INSERT INTO PCLOTE
    (CODPROD, CODFILIAL, NUMLOTE, DTVALIDADE, QT, QTBLOQUEADA, QTRESERV, QTINDENIZ, DTEXCLUSAO)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`);
  // C-016/C-017/C-018: 5711 com um lote vencido há 5 dias, todo bloqueado, e um
  // que vence em 20 dias; os dois somam 50 contra 40 de estoque.
  inserirLote.run(5711, '1', 'L-2025-09', haDias(5), 30, 30, null);
  inserirLote.run(5711, '1', 'L-2025-10', haDias(-20), 20, 0, null);
  // C-017: parcial (10 de 30) e um lote liberado que guarda o bloqueio antigo no log.
  inserirLote.run(5712, '1', 'L-2026-01', haDias(-60), 30, 10, null);
  inserirLote.run(5713, '1', 'L-2026-02', haDias(-45), 25, 0, null);
  // C-016: fora do horizonte de 90; C-020: validade com ano errado; excluído.
  inserirLote.run(5714, '1', 'L-2026-09', haDias(-200), 10, 0, null);
  inserirLote.run(5714, '1', 'L-1900', '1900-01-01', 5, 0, null);
  inserirLote.run(5714, '1', 'L-EXCLUIDO', haDias(-30), 3, 0, haDias(15));
  // C-005: o produto com apóstrofo tem lote a vencer e lote vencido.
  inserirLote.run(5704, '1', 'L-ALHO', haDias(-40), 12, 0, null);
  inserirLote.run(5704, '1', 'L-ALHO-V', haDias(10), 3, 0, null);
  // Perdas: C-033 (venceu ontem / vence hoje / sem saldo), C-034 (P1, P2), C-036 (bonificação).
  inserirLote.run(5730, '1', 'P1', haDias(1), 12, 0, null);
  inserirLote.run(5731, '3', 'P2', haDias(30), 5, 0, null);
  inserirLote.run(5732, '1', 'L-HOJE', haDias(0), 5, 0, null);
  inserirLote.run(5733, '1', 'L-ZERO', haDias(3), 0, 0, null);
  inserirLote.run(5734, '1', 'L-COPO', haDias(15), 40, 0, null);

  /* ── PCLOTELOG + PCEMPR — RN-008: quem e quando, nunca o motivo ── */
  const inserirFuncionario = db.prepare('INSERT OR IGNORE INTO PCEMPR (MATRICULA, NOME) VALUES (?, ?)');
  inserirFuncionario.run(MATRICULA_BLOQUEIO, 'RITA ESTOQUE');
  inserirFuncionario.run(888, 'ROBO INTEGRACAO');
  const inserirLog = db.prepare(`INSERT INTO PCLOTELOG
    (CODFILIAL, CODPROD, NUMLOTE, DATA, PROGRAMA, USUARIO, OBSAPLICACAO, QTBLOQUEADA_ANT, QTBLOQUEADA)
    VALUES ('1', ?, ?, ?, ?, ?, ?, ?, ?)`);
  // O 5711 L-2025-09 foi bloqueado pela Rita há 20 dias; depois um robô reescreveu a
  // linha sem mexer no bloqueio (30 → 30) — não é ele quem bloqueou.
  inserirLog.run(5711, 'L-2025-09', `${haDias(20)} 10:00:00`, '6366', 'RITA', `6366:${MATRICULA_BLOQUEIO}`, 0, 30);
  inserirLog.run(5711, 'L-2025-09', `${haDias(2)} 03:00:00`, '1332', 'ROBO', '6366:888', 30, 30);
  inserirLog.run(5712, 'L-2026-01', `${haDias(8)} 09:30:00`, '6366', 'RITA', `6366:${MATRICULA_BLOQUEIO}`, 0, 10);
  // O 5713 foi bloqueado e liberado: o evento antigo não pode aparecer.
  inserirLog.run(5713, 'L-2026-02', `${haDias(40)} 14:00:00`, '6366', 'RITA', `6366:${MATRICULA_BLOQUEIO}`, 0, 25);
  inserirLog.run(5713, 'L-2026-02', `${haDias(30)} 14:00:00`, '6366', 'RITA', `6366:${MATRICULA_BLOQUEIO}`, 25, 0);

  /* ── SGC_MOV_PLANO — C-023: um aberto e um concluído, os dois com acompanhamento ontem ── */
  const inserirPlano = db.prepare(`INSERT INTO SGC_MOV_PLANO
    (ORIGEM, CODPROD, CODFILIAL, DESCRICAO, FATO, CAUSA, ACAO, RESPONSAVEL_ID, DATA_ACOMPANHAMENTO, STATUS,
     CRIADO_POR, CRIADO_EM, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES ('sem_venda', ?, '1', ?, ?, '', ?, 2, ?, ?, 2, ?, 2, ?)`);
  const ontem = haDias(1);
  inserirPlano.run(5701, 'LEITE DE COCO 200 ML', 'Parado há 4 meses', 'Oferecer ao comercial', ontem, 'aberto',
    `${haDias(30)}T09:00:00`, `${haDias(30)}T09:00:00`);
  inserirPlano.run(5703, 'FARINHA DE ARROZ 1 KG', 'Nunca vendeu', 'Devolver ao fornecedor', ontem, 'concluido',
    `${haDias(20)}T09:00:00`, `${haDias(3)}T09:00:00`);
}
