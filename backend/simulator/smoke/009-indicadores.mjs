// Cenários e regras da spec 009 (indicadores). Ver
// docs/specs/009-indicadores-e-relatorios/plan.md §Testes.
//
// Os cenários de `/relatorios` (C-018..C-023, C-025 na parte de gravação e
// RN-013) NÃO estão aqui: a tela de relatórios salvos foi adiada por decisão do
// usuário em 2026-09-16. O que sobrou de C-025 é o recorte RESTRICTED (RN-015).
//
// Tudo roda sobre as MESMAS definitions que o add-012-indicadores.mjs publica,
// no banco compartilhado do smoke — R-045: NENHUMA asserção literal sobre total
// global. Todo número esperado é contado no próprio teste, sobre as mesmas
// tabelas.
//
// Esta é a ÚLTIMA suíte do smoke.mjs de propósito: os cenários de SLA e de
// agenda arranjam o estado que precisam por `UPDATE`/`INSERT` direto e o
// desfazem no `finally` do próprio `teste()` (C-10 do plan — o seed da 009 não
// cria pedido nenhum, R-062), e nenhuma outra suíte depende do que ela toca.

import { assert, CENARIO } from './base.mjs';
import { diasUteisEntre } from '../../lib/dias-uteis.mjs';
import { somarDiasUteis } from '../../../frontend/src/lib/dias-uteis.ts';
import { classificarEtapa, notaDoPedido, marcosDaLinha } from '../../../frontend/src/lib/sla.ts';

const HOJE = new Date().toISOString().slice(0, 10);
/** Janela larga: o período é OBRIGATÓRIO (D-014), mas o recorte não é asserção. */
const PERIODO = { dataInicio: '2020-01-01', dataFim: HOJE };
/** Período do seed da 003 em PCMOV — o mesmo do CHECK_INPUT. */
const PERIODO_ERP = { dataInicio: '2026-08-01', dataFim: '2026-09-14' };

const BASE_SLA = {
  ...PERIODO, codfilial: '', codfornec: 0, busca: '', hoje: HOJE,
  fase: '', soVencidos: '', limite: 500, offset: 0,
};
const BASE_IND = { ...PERIODO, codfilial: '', hoje: HOJE, limite: 50 };

const somarCorridos = (iso, n) => {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + Number(n))).toISOString().slice(0, 10);
};

export async function suite(ctx) {
  const { db, chamar, teste, execute, U } = ctx;
  const fases = CENARIO.fases;

  const linhas = (resultado) => resultado.rows;
  const uma = (resultado) => resultado.rows[0];
  const conta = (sql, ...args) => Number(db.prepare(sql).get(...args).N);
  const sql1 = (sql, ...args) => db.prepare(sql).get(...args);
  /** Roda um SQL cru pelo MESMO tradutor das server functions (sim:check). */
  const rodar = (code, input = {}) => execute({ type: 'SQL', code }, input, U.admin);

  // Todo pedido VIVO do quadro (card não excluído) — a população de que toda
  // contagem deste arquivo parte.
  const DE_VIVOS = `FROM SGC_PEDIDO P
    JOIN KB_CARD C ON C.ID = P.ID_CARD AND C.EXCLUIDO_EM IS NULL
    LEFT JOIN SGC_FASE SF ON SF.FASE_ID = C.FASE_ID AND SF.BOARD_ID = C.BOARD_ID`;

  /** Aplica `mudancas` numa tabela, roda `fn` e devolve tudo ao que era. */
  async function arranjando(tabela, chaveColuna, chaveValor, mudancas, fn) {
    const colunas = Object.keys(mudancas);
    const antes = sql1(`SELECT ${colunas.join(', ')} FROM ${tabela} WHERE ${chaveColuna} = ?`, chaveValor);
    const aplicar = (valores) => db.prepare(
      `UPDATE ${tabela} SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE ${chaveColuna} = ?`,
    ).run(...colunas.map((c) => valores[c]), chaveValor);
    aplicar(mudancas);
    try {
      return await fn();
    } finally {
      aplicar(antes);
    }
  }

  /* ── os pedidos deste arquivo são ESCOLHIDOS pelo estado, nunca por id fixo:
     as suítes anteriores movem, concluem e cancelam cards do seed, e um id
     cravado aqui viraria falso negativo na primeira mudança delas (R-045). ── */

  const VIVA = "COALESCE(SF.CHAVE, '') NOT IN ('cancelado', 'concluido')";
  const SEM_NF = '(SELECT COUNT(*) FROM SGC_NF N WHERE N.ID_CARD = P.ID_CARD) = 0';
  const COM_NF = '(SELECT COUNT(*) FROM SGC_NF N WHERE N.ID_CARD = P.ID_CARD) > 0';
  const escolher = (condicao, quantos = 1) => db.prepare(
    `SELECT P.ID_CARD ${DE_VIVOS} WHERE ${condicao} ORDER BY P.ID_CARD LIMIT ${quantos}`,
  ).all().map((l) => Number(l.ID_CARD));
  const escolherUm = (condicao, rotulo) => {
    const [id] = escolher(condicao);
    assert.ok(id, `o seed precisa de um pedido ${rotulo}`);
    return id;
  };

  // Fornecedor 1015: SLA_ANALISE_DIAS e SLA_FATURAMENTO_DIAS zerados no seed da
  // 001, então as metas caem nos padrões 1 e 5 de RN-004 — é o que C-007..C-009
  // medem.
  const CARD_ABERTO = escolherUm(`${VIVA} AND ${SEM_NF} AND COALESCE(P.DT_ENVIO, '') = ''
    AND P.CODFORNEC = 1015 AND COALESCE(P.ID_AGENDA, 0) = 0`, 'sem envio e sem nota, do fornecedor 1015');
  const CARD_NF_SEM_ENVIO = escolherUm(`${VIVA} AND ${COM_NF} AND COALESCE(P.DT_ENVIO, '') = ''`,
    'com nota emitida e sem envio');
  const CARD_1042_COM_NF = escolherUm(`${VIVA} AND ${COM_NF} AND P.CODFORNEC = 1042`, 'do fornecedor 1042 com nota');
  const CARD_1042_SEM_NF = escolherUm(`${VIVA} AND ${SEM_NF} AND P.CODFORNEC = 1042`, 'do fornecedor 1042 sem nota');
  const CARD_SEM_CADASTRO = escolherUm(
    `${VIVA} AND P.CODFORNEC NOT IN (SELECT CODFORNEC FROM SGC_FORNECEDOR)`, 'de fornecedor sem cadastro');
  const CARD_ENVIADO = escolherUm(`${VIVA} AND ${SEM_NF} AND COALESCE(P.DT_ENVIO, '') <> ''
    AND COALESCE(P.ID_AGENDA, 0) = 0`, 'enviado, sem nota e sem agendamento');
  const DT_ENVIO_DO_CARD = String(sql1('SELECT DT_ENVIO FROM SGC_PEDIDO WHERE ID_CARD = ?', CARD_ENVIADO).DT_ENVIO);
  // Os dois cards que o arranjo das solicitações usa para provar a régua da
  // 008: fase `analise` -> `em_analise`, fase `cancelado` -> `nao_atendida`.
  const CARD_EM_ANALISE = escolherUm("COALESCE(SF.CHAVE, '') = 'analise'", 'na fase de análise');
  const CARD_CANCELADO = escolherUm("COALESCE(SF.CHAVE, '') = 'cancelado'", 'na fase de cancelados');

  /* ─────────── T-080 — C-001 e C-003 (o resumo e o filtro de filial) ─────────── */

  await teste('C-001: sgcIndResumo — os sete números batem com sete contagens feitas no próprio teste (R-045)', async () => {
    const resumo = uma(await chamar('sgcIndResumo', BASE_IND));

    const abertos = sql1(`SELECT COUNT(*) AS N, COALESCE(SUM(COALESCE(P.VL_TOTAL, 0)), 0) AS VL,
      COUNT(DISTINCT P.CODFORNEC) AS FORNECS ${DE_VIVOS}
      WHERE COALESCE(SF.CHAVE, '') NOT IN ('concluido', 'cancelado')`);
    assert.equal(Number(resumo.PEDIDOS_ABERTOS), Number(abertos.N));
    assert.ok(Number(abertos.N) > 0, 'o seed tem pedido aberto — contagem zero não prova nada');
    assert.equal(Number(resumo.VL_ABERTO), Number(abertos.VL));
    assert.equal(Number(resumo.FORNECEDORES_COM_PEDIDO), Number(abertos.FORNECS));

    const envios = conta(`SELECT COUNT(*) AS N FROM SGC_AGENDA A
      WHERE A.ATIVO = 1 AND A.DATA_ANALISE < ? AND COALESCE(A.DATA_ENVIO_REAL, '') = ''
        AND NOT EXISTS (SELECT 1 FROM SGC_PEDIDO PG WHERE PG.ID_AGENDA = A.ID AND COALESCE(PG.DT_ENVIO, '') <> '')`, HOJE);
    assert.equal(Number(resumo.ENVIOS_ATRASADOS), envios);
    assert.ok(envios > 0, 'o seed da 004 tem agendamento atrasado');

    const pendentes = conta(`SELECT COUNT(*) AS N ${DE_VIVOS}
      WHERE COALESCE(SF.CHAVE, '') IN ('enviado', 'transito', 'faturamento', 'bo')
        AND COALESCE(P.DT_ENVIO, '') <> '' AND COALESCE(P.PERC_FATURADO_VALOR, 0) < 100`);
    assert.equal(Number(resumo.FATURAMENTOS_PENDENTES), pendentes);
    assert.ok(pendentes > 0);

    // D-005: a previsão da nota é recalculada AQUI pelo gêmeo puro de
    // dias-uteis (frontend/src/lib/dias-uteis.ts) — não é cópia da SQL.
    const notas = db.prepare(`SELECT N.DT_EMISSAO, N.DT_RECEBIMENTO,
        COALESCE(F.PRAZO_ENTREGA_DIAS, 0) AS PRAZO, COALESCE(F.PRAZO_ENTREGA_TIPO, 'corridos') AS TIPO
      FROM SGC_NF N
      JOIN KB_CARD C ON C.ID = N.ID_CARD AND C.EXCLUIDO_EM IS NULL
      LEFT JOIN SGC_FORNECEDOR F ON F.CODFORNEC = N.CODFORNEC`).all();
    const atrasadas = notas.filter((n) => {
      if (String(n.DT_RECEBIMENTO || '').trim() !== '') return false;
      const emissao = String(n.DT_EMISSAO || '').trim();
      if (!emissao || Number(n.PRAZO) <= 0) return false;
      const previsao = n.TIPO === 'uteis' ? somarDiasUteis(emissao, Number(n.PRAZO)) : somarCorridos(emissao, Number(n.PRAZO));
      return previsao < HOJE;
    }).length;
    assert.equal(Number(resumo.NFS_ATRASADAS), atrasadas);
    assert.ok(atrasadas > 0, 'o seed da 006 tem nota vencida');

    const itensBo = conta(`SELECT COUNT(*) AS N FROM SGC_BO_ITEM B
      JOIN KB_CARD C ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
      WHERE B.STATUS = 'aberto'`);
    assert.equal(Number(resumo.ITENS_BO), itensBo);
    assert.ok(itensBo > 0);
  });

  await teste('C-001: sgcIndPedidosPorFase — as 10 fases, inclusive as vazias, e a soma igual à contagem de pedidos do período', async () => {
    const porFase = linhas(await chamar('sgcIndPedidosPorFase', BASE_IND));
    assert.equal(porFase.length, Object.keys(fases).length, 'uma linha por fase do quadro, inclusive as vazias');

    const total = conta(`SELECT COUNT(*) AS N ${DE_VIVOS}`);
    const soma = porFase.reduce((acc, l) => acc + Number(l.QTD), 0);
    assert.equal(soma, total);

    const cancelados = conta(`SELECT COUNT(*) AS N ${DE_VIVOS} WHERE COALESCE(SF.CHAVE, '') = 'cancelado'`);
    const linhaCancelado = porFase.find((l) => l.FASE_CHAVE === 'cancelado');
    assert.equal(Number(linhaCancelado.QTD), cancelados);
    // "as 10, inclusive as vazias": toda chave do quadro tem linha, mesmo as
    // que nenhum pedido ocupa num recorte estreito.
    assert.deepEqual(porFase.map((l) => l.FASE_CHAVE).sort(), Object.keys(fases).sort());
    const estreito = linhas(await chamar('sgcIndPedidosPorFase', { ...BASE_IND, dataInicio: '2020-01-01', dataFim: '2020-01-02' }));
    assert.equal(estreito.length, Object.keys(fases).length);
    assert.ok(estreito.every((l) => Number(l.QTD) === 0), 'fase sem pedido no período aparece com 0, não some');
  });

  await teste('C-003: o filtro de filial recorta a tela inteira — cada recorte bate com a contagem da própria filial', async () => {
    const porFilial = async (codfilial) => uma(await chamar('sgcIndResumo', { ...BASE_IND, codfilial }));
    const contaFilial = (codfilial) => conta(
      `SELECT COUNT(*) AS N ${DE_VIVOS} WHERE COALESCE(SF.CHAVE, '') NOT IN ('concluido', 'cancelado')
        AND P.CODFILIAL = ?`, codfilial,
    );

    const um = await porFilial('1');
    const dois = await porFilial('2');
    assert.equal(Number(um.PEDIDOS_ABERTOS), contaFilial('1'));
    assert.equal(Number(dois.PEDIDOS_ABERTOS), contaFilial('2'));
    assert.notEqual(Number(um.PEDIDOS_ABERTOS), Number(dois.PEDIDOS_ABERTOS));

    const todas = await porFilial('');
    assert.ok(Number(um.PEDIDOS_ABERTOS) + Number(dois.PEDIDOS_ABERTOS) <= Number(todas.PEDIDOS_ABERTOS));
  });

  /* ─────────── T-081 — C-006 e RN-012 (compras × vendas no WinThor) ─────────── */

  await teste('C-006: sgcWintComprasVsVendas — a consulta ao WinThor volta com CONTAGEM > 0, comprado e vendido por fornecedor e licitação em coluna própria', async () => {
    const rows = linhas(await chamar('sgcWintComprasVsVendas', { ...PERIODO_ERP, codfilial: '1', limite: 50 }));
    assert.ok(rows.length > 0, 'consulta ao ERP vazia não é verde');
    assert.ok(rows.some((l) => Number(l.QT_COMPRADA) > 0 && Number(l.QT_VENDIDA) > 0),
      'ao menos um fornecedor com entrada E saída no período');
    for (const chave of ['CODFORNEC', 'FORNECEDOR', 'VL_COMPRADO', 'VL_VENDIDO', 'QT_VENDIDA_LICITACAO', 'VL_VENDIDO_LICITACAO']) {
      assert.ok(chave in rows[0], `a coluna ${chave} existe`);
    }
    // D-004: a venda de licitação entra em coluna PRÓPRIA, nunca some da conta.
    assert.ok(rows.some((l) => Number(l.QT_VENDIDA_LICITACAO) > 0), 'o seed da 003 tem venda para órgão público');
    assert.ok(rows.every((l) => Number(l.QT_VENDIDA_LICITACAO) <= Number(l.QT_VENDIDA)));
  });

  await teste('RN-012: sgcWintComprasVsVendas sem filial devolve zero linhas — a comparação não existe consolidada', async () => {
    const rows = linhas(await chamar('sgcWintComprasVsVendas', { ...PERIODO_ERP, codfilial: '', limite: 50 }));
    assert.equal(rows.length, 0);
  });

  /* ─────────── T-082 — C-007, C-008, C-009 e C-011 (parte servidor) ─────────── */

  const doCard = async (cardId, extra = {}) => {
    const rows = linhas(await chamar('sgcSlaPedidosListar', { ...BASE_SLA, ...extra }));
    return rows.find((l) => Number(l.CARD_ID) === cardId);
  };

  await teste('C-007: etapa concluída dentro e fora da meta — 1 de 1 dia útil é no prazo, 3 de 1 é concluída com atraso', async () => {
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_ABERTO,
      { CRIADO_EM: '2026-09-08T08:00:00', DT_ENVIO: '2026-09-09' }, async () => {
        const linha = await doCard(CARD_ABERTO, { hoje: '2026-09-18' });
        assert.equal(Number(linha.META_ANALISE_DIAS), 1, 'fornecedor sem SLA cadastrado usa o padrão de 1 dia útil');
        assert.equal(Number(linha.DIAS_ANALISE), 1);
        assert.equal(linha.STATUS_ANALISE, 'ok');
      });
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_ABERTO,
      { CRIADO_EM: '2026-09-08T08:00:00', DT_ENVIO: '2026-09-11' }, async () => {
        const linha = await doCard(CARD_ABERTO, { hoje: '2026-09-18' });
        assert.equal(Number(linha.DIAS_ANALISE), 3);
        assert.equal(linha.STATUS_ANALISE, 'estourou');
      });
  });

  await teste('C-008: etapa aberta além da meta aponta o responsável — 7 de 5 dias úteis é prazo vencido e o pedido é atrasado (fornecedor)', async () => {
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_ABERTO,
      { CRIADO_EM: '2026-09-08T08:00:00', DT_ENVIO: '2026-09-09' }, async () => {
        const linha = await doCard(CARD_ABERTO, { hoje: '2026-09-18' });
        assert.equal(Number(linha.META_FATURAMENTO_DIAS), 5);
        assert.equal(Number(linha.DIAS_FATURAMENTO), 7);
        assert.equal(linha.STATUS_FATURAMENTO, 'vencida');
        assert.equal(linha.SLA_STATUS, 'atrasado_fornecedor');
      });
  });

  await teste('RN-005: com a Análise vencida junto, a precedência manda — o pedido é atrasado (compras)', async () => {
    // O card 24 tem nota emitida e nenhum envio: a Análise fica aberta (vencida)
    // ao mesmo tempo que a Entrega — a única combinação real em que as duas
    // vencem juntas (com envio, a Análise fecha em ok/estourou).
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_NF_SEM_ENVIO, { CRIADO_EM: '2026-09-08T08:00:00' }, async () => {
      const linha = await doCard(CARD_NF_SEM_ENVIO, { hoje: '2026-09-18' });
      assert.equal(linha.STATUS_ANALISE, 'vencida');
      assert.equal(linha.STATUS_ENTREGA, 'vencida');
      assert.equal(linha.SLA_STATUS, 'atrasado_compras');
    });
  });

  await teste('C-009: último dia da meta é aviso, não atraso — 5 de 5 dias úteis é "vence hoje" e o pedido fica em atenção', async () => {
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_ABERTO,
      { CRIADO_EM: '2026-09-08T08:00:00', DT_ENVIO: '2026-09-09' }, async () => {
        const linha = await doCard(CARD_ABERTO, { hoje: '2026-09-16' });
        assert.equal(Number(linha.DIAS_FATURAMENTO), 5);
        assert.equal(linha.STATUS_FATURAMENTO, 'atencao');
        assert.equal(linha.SLA_STATUS, 'atencao');
      });
  });

  await teste('C-011: a nota do pedido — 2/1 mais 5/5 com a entrega fora da conta dá 75', async () => {
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_ABERTO,
      { CRIADO_EM: '2026-09-08T08:00:00', DT_ENVIO: '2026-09-10' }, async () => {
        const linha = await doCard(CARD_ABERTO, { hoje: '2026-09-17' });
        assert.equal(Number(linha.DIAS_ANALISE), 2);
        assert.equal(Number(linha.DIAS_FATURAMENTO), 5);
        assert.equal(linha.STATUS_ENTREGA, 'nao_iniciada');
        assert.equal(Number(linha.SLA_SCORE), 75);
      });
  });

  await teste('C-011: com a entrega em 10 dias corridos contra meta de 7, a nota passa a 90', async () => {
    await arranjando('SGC_FORNECEDOR', 'CODFORNEC', 1042,
      { SLA_ANALISE_DIAS: 0, SLA_FATURAMENTO_DIAS: 0, PRAZO_ENTREGA_DIAS: 7, PRAZO_ENTREGA_TIPO: 'corridos' }, async () => {
        await arranjando('KB_CARD', 'ID', CARD_1042_SEM_NF,
          { FASE_ID: fases.concluido, CONCLUIDO_EM: '2026-09-26T10:00:00' }, async () => {
            await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_1042_SEM_NF,
              { CRIADO_EM: '2026-09-08T08:00:00', DT_ENVIO: '2026-09-09', DT_PRIMEIRO_FATURAMENTO: '2026-09-16' }, async () => {
                const linha = await doCard(CARD_1042_SEM_NF, { hoje: '2026-09-30' });
                assert.equal(Number(linha.DIAS_ANALISE), 1);
                assert.equal(Number(linha.DIAS_FATURAMENTO), 5);
                assert.equal(Number(linha.DIAS_ENTREGA), 10, 'entrega em dias CORRIDOS, até a conclusão (RN-001)');
                assert.equal(linha.STATUS_ENTREGA, 'estourou');
                assert.equal(Number(linha.SLA_SCORE), 90);
                assert.equal(linha.SLA_STATUS, 'concluido');
              });
          });
      });
  });

  /* ─────────── T-083 — C-010, RN-004 e RN-001 (parte servidor) ─────────── */

  await teste('C-010: fornecedor sem prazo de entrega cadastrado — a etapa fica "sem meta" e sai da média da nota', async () => {
    const antes = await doCard(CARD_1042_COM_NF);
    assert.equal(Number(antes.META_ENTREGA_DIAS), 10, 'o seed da 001 dá 10 dias corridos ao 1042');
    assert.notEqual(antes.STATUS_ENTREGA, 'sem_meta');

    // R-017: o seed da 001 é dono do cadastro e não se toca — o arranjo é feito
    // e DESFEITO dentro deste próprio teste (C-10 do plan).
    await arranjando('SGC_FORNECEDOR', 'CODFORNEC', 1042, { PRAZO_ENTREGA_DIAS: 0 }, async () => {
      const linha = await doCard(CARD_1042_COM_NF);
      assert.equal(Number(linha.META_ENTREGA_DIAS), 0);
      assert.equal(linha.STATUS_ENTREGA, 'sem_meta');
      const semEntrega = notaDoPedido([
        { dias: linha.DIAS_ANALISE, meta: Number(linha.META_ANALISE_DIAS) },
        { dias: linha.DIAS_FATURAMENTO, meta: Number(linha.META_FATURAMENTO_DIAS) },
      ]);
      assert.equal(Number(linha.SLA_SCORE), semEntrega, 'a etapa sem meta não entra na média');
    });
  });

  await teste('RN-004: sem SLA parametrizado valem 1 e 5 dias úteis; sem prazo de entrega, a Entrega fica sem meta', async () => {
    // O fornecedor 999999 do seed da 006 não tem linha em SGC_FORNECEDOR: é o
    // caso "sem parametrização nenhuma", sem arranjo nenhum.
    const linha = await doCard(CARD_SEM_CADASTRO);
    assert.ok(linha, 'o pedido do fornecedor sem cadastro entra na listagem');
    assert.equal(Number(linha.META_ANALISE_DIAS), 1);
    assert.equal(Number(linha.META_FATURAMENTO_DIAS), 5);
    assert.equal(Number(linha.META_ENTREGA_DIAS), 0);
    assert.ok(['sem_meta', 'nao_iniciada'].includes(linha.STATUS_ENTREGA));
  });

  await teste('RN-001: pedido sem envio mede a Análise até hoje; pedido concluído sem nota mede o Faturamento até a conclusão', async () => {
    const cedo = await doCard(CARD_ABERTO, { hoje: '2026-09-17' });
    const tarde = await doCard(CARD_ABERTO, { hoje: '2026-09-24' });
    assert.ok(Number(tarde.DIAS_ANALISE) > Number(cedo.DIAS_ANALISE), 'etapa aberta cresce com o dia de referência');

    await arranjando('KB_CARD', 'ID', CARD_ENVIADO,
      { FASE_ID: fases.concluido, CONCLUIDO_EM: '2026-09-14T10:00:00' }, async () => {
        const a = await doCard(CARD_ENVIADO, { hoje: '2026-09-20' });
        const b = await doCard(CARD_ENVIADO, { hoje: '2026-10-30' });
        assert.equal(a.DT_PRIMEIRA_NF, '', 'o pedido escolhido não tem nota');
        assert.equal(Number(a.DIAS_FATURAMENTO), Number(b.DIAS_FATURAMENTO),
          'medido até a conclusão, o número NÃO muda quando hoje avança');
        assert.equal(Number(a.DIAS_FATURAMENTO), diasUteisEntreJs(DT_ENVIO_DO_CARD, '2026-09-14'));
      });
  });

  /* ─────────── T-084 — C-012 e RN-007 (cancelado fora) ─────────── */

  await teste('C-012 / RN-007: o pedido cancelado não aparece na lista, nos KPIs, no total nem no perfil por fornecedor', async () => {
    const cancelados = db.prepare(`SELECT P.ID_CARD ${DE_VIVOS} WHERE COALESCE(SF.CHAVE, '') = 'cancelado'`).all()
      .map((l) => Number(l.ID_CARD));
    assert.ok(cancelados.length > 0, 'o seed da 002 tem um pedido cancelado');

    const lista = linhas(await chamar('sgcSlaPedidosListar', BASE_SLA));
    assert.ok(lista.every((l) => !cancelados.includes(Number(l.CARD_ID))));

    const vivos = conta(`SELECT COUNT(*) AS N ${DE_VIVOS} WHERE COALESCE(SF.CHAVE, '') <> 'cancelado'`);
    const kpis = uma(await chamar('sgcSlaPedidosKpis', BASE_SLA));
    assert.equal(Number(kpis.TOTAL), vivos);
    const total = uma(await chamar('sgcSlaPedidosListarTotal', BASE_SLA));
    assert.equal(Number(total.TOTAL), vivos);

    const perfil = linhas(await chamar('sgcIndPerfilFornecedor', { ...BASE_SLA, limite: 50 }));
    const somaPerfil = perfil.reduce((acc, l) => acc + Number(l.QTD_PEDIDOS), 0);
    assert.equal(somaPerfil, vivos);
  });

  /* ─────────── T-085 — C-013 (o topo e a lista contam a mesma coisa) ─────────── */

  await teste('C-013: o total do topo é igual ao total da listagem, e os atrasados batem com a lista filtrada — nos dois períodos', async () => {
    for (const periodo of [PERIODO, { dataInicio: '2026-09-16', dataFim: HOJE }]) {
      const params = { ...BASE_SLA, ...periodo };
      const kpis = uma(await chamar('sgcSlaPedidosKpis', params));
      const total = uma(await chamar('sgcSlaPedidosListarTotal', params));
      assert.equal(Number(kpis.TOTAL), Number(total.TOTAL));

      const vencidos = uma(await chamar('sgcSlaPedidosListarTotal', { ...params, soVencidos: '1' }));
      assert.equal(Number(kpis.ATRASADOS_COMPRAS) + Number(kpis.ATRASADOS_FORNECEDOR), Number(vencidos.TOTAL));
      assert.equal(
        Number(kpis.TOTAL),
        Number(kpis.NO_PRAZO) + Number(kpis.ATENCAO) + Number(kpis.ATRASADOS_COMPRAS)
        + Number(kpis.ATRASADOS_FORNECEDOR) + Number(kpis.CONCLUIDOS),
        'os cinco estados do pedido particionam o total',
      );
    }
  });

  /* ─────────── T-086 — C-014 e RN-008 (aderência à agenda) ─────────── */

  await teste('C-014 / RN-008: enviado 4 dias depois da data planejada é "enviada com atraso"; na data é "no planejado" com 0; sem agendamento é "sem agenda"', async () => {
    const semAgenda = await doCard(CARD_ENVIADO);
    assert.equal(semAgenda.STATUS_AGENDA, 'sem_agenda');
    assert.equal(semAgenda.DIAS_ATRASO_AGENDA, null);

    const agendaLivre = Number(sql1('SELECT MIN(ID) AS ID FROM SGC_AGENDA').ID);
    await arranjando('SGC_PEDIDO', 'ID_CARD', CARD_ENVIADO, { ID_AGENDA: agendaLivre }, async () => {
      await arranjando('SGC_AGENDA', 'ID', agendaLivre,
        { DATA_ANALISE: somarCorridos(DT_ENVIO_DO_CARD, -4), DATA_ENVIO_REAL: null }, async () => {
          const linha = await doCard(CARD_ENVIADO);
          assert.equal(linha.STATUS_AGENDA, 'enviada_com_atraso');
          assert.equal(Number(linha.DIAS_ATRASO_AGENDA), 4, 'dias CORRIDOS entre a data planejada e o envio');
        });
      await arranjando('SGC_AGENDA', 'ID', agendaLivre,
        { DATA_ANALISE: DT_ENVIO_DO_CARD, DATA_ENVIO_REAL: null }, async () => {
          const linha = await doCard(CARD_ENVIADO);
          assert.equal(linha.STATUS_AGENDA, 'no_planejado');
          assert.equal(Number(linha.DIAS_ATRASO_AGENDA), 0);
        });
      // Envio ANTES da data planejada: continua no planejado e NUNCA negativo.
      await arranjando('SGC_AGENDA', 'ID', agendaLivre,
        { DATA_ANALISE: somarCorridos(DT_ENVIO_DO_CARD, 9), DATA_ENVIO_REAL: null }, async () => {
          const linha = await doCard(CARD_ENVIADO);
          assert.equal(linha.STATUS_AGENDA, 'no_planejado');
          assert.equal(Number(linha.DIAS_ATRASO_AGENDA), 0);
        });
    });
  });

  await teste('C-001 / RF-013: sgcIndAgendaAtrasos lista os MESMOS agendamentos que o KPI conta', async () => {
    const resumo = uma(await chamar('sgcIndResumo', BASE_IND));
    const lista = linhas(await chamar('sgcIndAgendaAtrasos', BASE_IND));
    assert.equal(lista.length, Number(resumo.ENVIOS_ATRASADOS), 'topo e bloco saem da mesma condição');
    assert.ok(lista.every((l) => l.DATA_PLANEJADA < HOJE && Number(l.DIAS_ATRASO) > 0));
  });

  /* ─────────── T-087 — C-015 e C-027 (linha do tempo e tempo por fase) ─────────── */

  await teste('C-015: a linha do tempo de um pedido com N passagens devolve N linhas, na ordem, só a última sem saída', async () => {
    const inserir = db.prepare(`INSERT INTO KB_MOVIMENTO (CARD_ID, DE_FASE_ID, PARA_FASE_ID, USUARIO_ID, ORIGEM, QUANDO)
      VALUES (?, ?, ?, ?, 'usuario', ?)`);
    const novos = [
      inserir.run(CARD_ABERTO, fases.analise, fases.tecnica, U.ana, `${HOJE}T09:00:00`).lastInsertRowid,
      inserir.run(CARD_ABERTO, fases.tecnica, fases.diretoria, U.ana, `${HOJE}T10:00:00`).lastInsertRowid,
    ].map(Number);
    try {
      const passagens = linhas(await chamar('sgcSlaPedidoFases', { idCard: CARD_ABERTO, hoje: HOJE }));
      const esperado = conta('SELECT COUNT(*) AS N FROM KB_MOVIMENTO WHERE CARD_ID = ?', CARD_ABERTO);
      assert.equal(passagens.length, esperado);
      assert.ok(passagens.length >= 3, 'o arranjo deste teste garante pelo menos três passagens');
      assert.deepEqual(passagens.map((l) => Number(l.ID)), [...passagens.map((l) => Number(l.ID))].sort((a, b) => a - b));
      assert.ok(passagens.slice(0, -1).every((l) => l.DT_SAIDA !== ''), 'só a última passagem fica sem saída');
      assert.equal(passagens[passagens.length - 1].DT_SAIDA, '');
      assert.ok(passagens.every((l) => Number(l.DIAS_NA_FASE) >= 0));
      assert.ok(passagens.every((l) => l.FASE_CHAVE !== '' && l.FASE_NOME !== ''));
    } finally {
      for (const id of novos) db.prepare('DELETE FROM KB_MOVIMENTO WHERE ID = ?').run(id);
    }
  });

  await teste('C-027: sgcIndLeadTime — uma linha por fase com passagem no período, e a soma de PASSAGENS bate com a contagem do histórico', async () => {
    const rows = linhas(await chamar('sgcIndLeadTime', BASE_IND));
    const esperado = conta(`SELECT COUNT(*) AS N FROM KB_MOVIMENTO M
      JOIN KB_CARD C ON C.ID = M.CARD_ID AND C.EXCLUIDO_EM IS NULL
      JOIN SGC_PEDIDO P ON P.ID_CARD = C.ID
      WHERE SUBSTR(COALESCE(M.QUANDO, ''), 1, 10) BETWEEN ? AND ?`, PERIODO.dataInicio, PERIODO.dataFim);
    const soma = rows.reduce((acc, l) => acc + Number(l.PASSAGENS), 0);
    assert.equal(soma, esperado);
    assert.ok(esperado > 0, 'o seed da 002 movimenta cards');
    assert.ok(rows.every((l) => Number(l.DIAS_MEDIA) >= 0));
    assert.equal(new Set(rows.map((l) => l.FASE_CHAVE)).size, rows.length, 'uma linha por fase');
  });

  /* ─────────── T-088 — C-017 e RN-010 (funil e ranking das solicitações) ─────────── */

  await teste('C-016 / RN-010: o funil vem em DUAS dimensões, a soma bate com a contagem do período e cada situação sai da fase do card', async () => {
    // O seed da 009 não cria solicitação (R-062) e a suíte da 008 pode ainda
    // não estar integrada: o cenário é arranjado aqui e removido no finally.
    const inserir = db.prepare(`INSERT INTO SGC_SOLICITACAO
      (CODPROD, DESCRICAO, CODFORNEC, CODFILIAL, QUANTIDADE, STATUS, ID_CARD, CRIADO_POR, CRIADO_EM, AVALIADO_EM)
      VALUES (?, 'ARRANJO 009', 1015, '1', 10, ?, ?, ?, ?, ?)`);
    // [status, idCard, criadoPor, avaliadoEm, situação esperada pelo contrato
    //  R-075 do situacao-solicitacao.sql]
    const arranjo = [
      ['pendente', 0, U.leo, '', 'sem_pedido'],
      ['pendente', 0, U.leo, '', 'sem_pedido'],
      ['recusada', 0, U.leo, `${HOJE}T10:00:00`, 'sem_pedido'],
      ['aprovada', 0, U.gil, `${HOJE}T10:00:00`, 'sem_pedido'],
      ['aprovada', CARD_EM_ANALISE, U.gil, `${HOJE}T10:00:00`, 'em_analise'],
      ['aprovada', CARD_CANCELADO, U.gil, `${HOJE}T10:00:00`, 'nao_atendida'],
    ];
    const ids = arranjo.map(([status, idCard, criadoPor, avaliadoEm], i) => Number(
      inserir.run(7100 + i, status, idCard, criadoPor, `${HOJE}T08:00:00`, avaliadoEm).lastInsertRowid,
    ));
    try {
      const params = { ...PERIODO, codfilial: '' };
      const funil = linhas(await chamar('sgcSolicitacoesFunil', params));
      const totalPeriodo = conta(
        'SELECT COUNT(*) AS N FROM SGC_SOLICITACAO WHERE SUBSTR(COALESCE(CRIADO_EM, \'\'), 1, 10) BETWEEN ? AND ?',
        PERIODO.dataInicio, PERIODO.dataFim,
      );
      assert.equal(funil.reduce((acc, l) => acc + Number(l.QTD), 0), totalPeriodo);
      assert.ok(totalPeriodo >= arranjo.length);

      // A situação de cada arranjo, conferida contra o contrato R-075 do
      // fragmento (card ausente -> sem_pedido, fase cancelado -> nao_atendida,
      // fase analise -> em_analise) — e não contra uma cópia da SQL.
      for (const [status, , , , esperada] of arranjo) {
        const par = funil.find((l) => l.STATUS === status && l.SITUACAO === esperada);
        assert.ok(par, `o par ${status} x ${esperada} existe no funil`);
      }
      // R-076/B-3: pendente, recusada e aprovada-na-fila caem TODAS em
      // sem_pedido — a situação sozinha não separa a decisão. `cancelada` cai
      // lá também e entra na lista quando o seed da 008 está no banco (é o
      // caso desde a integração da onda 3): a asserção é sobre quem PRECISA
      // estar, não sobre uma lista fechada (R-045).
      const semPedido = funil.filter((l) => l.SITUACAO === 'sem_pedido').map((l) => l.STATUS).sort();
      for (const status of ['aprovada', 'pendente', 'recusada']) {
        assert.ok(semPedido.includes(status), `${status} sem pedido cai em sem_pedido`);
      }
      assert.ok(
        semPedido.every((s) => ['aprovada', 'pendente', 'recusada', 'cancelada'].includes(s)),
        'sem_pedido só recebe solicitação sem card vivo',
      );
      assert.ok(funil.every((l) => Number(l.QTD_AVALIADAS) <= Number(l.QTD)));

      // RN-010 (integração da onda 3): o funil e a fila da 008 contam a MESMA
      // população. Agora que SGC_SOLICITACAO tem o seed da 008, cada situação
      // do funil é conferida contra `sgcSolicitacoesListar` com os mesmos
      // filtros — a listagem não tem período, então o recorte é feito aqui,
      // pelo CRIADO_EM que ela devolve.
      const noPeriodo = (l) => {
        const dia = String(l.CRIADO_EM || '').slice(0, 10);
        return dia >= PERIODO.dataInicio && dia <= PERIODO.dataFim;
      };
      for (const situacao of [...new Set(funil.map((l) => l.SITUACAO))]) {
        const doFunil = funil
          .filter((l) => l.SITUACAO === situacao)
          .reduce((acc, l) => acc + Number(l.QTD), 0);
        const daFila = linhas(await chamar('sgcSolicitacoesListar', {
          status: '', situacao, codfornec: 0, codfilial: '', vendedor: 0, minhas: 0,
          busca: '', limite: 500, offset: 0,
        }, U.admin)).filter(noPeriodo);
        assert.equal(daFila.length, doFunil, `a situação ${situacao} tem a mesma contagem nos dois lados`);
        assert.ok(daFila.every((l) => l.SITUACAO === situacao), `sgcSolicitacoesListar filtra por ${situacao}`);
      }
    } finally {
      for (const id of ids) db.prepare('DELETE FROM SGC_SOLICITACAO WHERE ID = ?').run(id);
    }
  });

  await teste('C-017: sgcSolicitacoesPorVendedor — uma linha por vendedor do período, sem nenhuma coluna de valor', async () => {
    const inserir = db.prepare(`INSERT INTO SGC_SOLICITACAO
      (CODPROD, DESCRICAO, CODFORNEC, CODFILIAL, QUANTIDADE, STATUS, ID_CARD, CRIADO_POR, CRIADO_EM, AVALIADO_EM)
      VALUES (?, 'ARRANJO 009', 1015, '1', 10, ?, ?, ?, ?, ?)`);
    const arranjo = [
      ['pendente', 0, U.leo, ''],
      ['recusada', 0, U.leo, `${HOJE}T10:00:00`],
      ['aprovada', CARD_EM_ANALISE, U.leo, `${HOJE}T10:00:00`],
      ['aprovada', CARD_CANCELADO, U.gil, `${HOJE}T10:00:00`],
    ];
    const ids = arranjo.map(([status, idCard, criadoPor, avaliadoEm], i) => Number(
      inserir.run(7200 + i, status, idCard, criadoPor, `${HOJE}T08:00:00`, avaliadoEm).lastInsertRowid,
    ));
    try {
      const rows = linhas(await chamar('sgcSolicitacoesPorVendedor', { ...PERIODO, codfilial: '', limite: 50 }));
      const vendedores = db.prepare(
        `SELECT CRIADO_POR, COUNT(*) AS N FROM SGC_SOLICITACAO
         WHERE SUBSTR(COALESCE(CRIADO_EM, ''), 1, 10) BETWEEN ? AND ? GROUP BY CRIADO_POR`,
      ).all(PERIODO.dataInicio, PERIODO.dataFim);
      assert.equal(rows.length, vendedores.length);
      for (const esperado of vendedores) {
        const linha = rows.find((l) => Number(l.USUARIO_ID) === Number(esperado.CRIADO_POR));
        assert.ok(linha, `o vendedor ${esperado.CRIADO_POR} aparece no ranking`);
        assert.equal(Number(linha.TOTAL), Number(esperado.N));
      }
      // As três colunas são contadas no PRÓPRIO teste (R-045): desde a
      // integração da onda 3 o seed da 008 também tem solicitações do `leo`, e
      // um literal aqui só valeria enquanto esta suíte rodasse sozinha.
      const doLeo = rows.find((l) => Number(l.USUARIO_ID) === U.leo);
      const porStatus = (status) => conta(
        `SELECT COUNT(*) AS N FROM SGC_SOLICITACAO
         WHERE CRIADO_POR = ? AND STATUS = ?
           AND SUBSTR(COALESCE(CRIADO_EM, ''), 1, 10) BETWEEN ? AND ?`,
        U.leo, status, PERIODO.dataInicio, PERIODO.dataFim,
      );
      assert.equal(Number(doLeo.PENDENTES), porStatus('pendente'), 'PENDENTES sai do STATUS, não da situação');
      assert.equal(Number(doLeo.RECUSADAS), porStatus('recusada'), 'RECUSADAS sai do STATUS');
      // EM_FLUXO é da SITUACAO, não do STATUS: a régua é a mesma que a fila da
      // 008 devolve, então quem conta é `sgcSolicitacoesListar` do vendedor.
      const doLeoNaFila = linhas(await chamar('sgcSolicitacoesListar', {
        status: '', situacao: '', codfornec: 0, codfilial: '', vendedor: U.leo, minhas: 0,
        busca: '', limite: 500, offset: 0,
      }, U.admin)).filter((l) => {
        const dia = String(l.CRIADO_EM || '').slice(0, 10);
        return dia >= PERIODO.dataInicio && dia <= PERIODO.dataFim;
      });
      const emFluxo = doLeoNaFila.filter((l) => !['atendida', 'nao_atendida', 'sem_pedido'].includes(l.SITUACAO));
      assert.ok(emFluxo.length >= 1, 'a aprovada em análise do arranjo está em fluxo');
      assert.equal(Number(doLeo.EM_FLUXO), emFluxo.length, 'EM_FLUXO sai da SITUACAO');
      assert.ok(Number(doLeo.ADERENCIA_PCT) >= 0 && Number(doLeo.ADERENCIA_PCT) <= 100);
      assert.ok(Object.keys(rows[0]).every((coluna) => !/^VL_|VALOR/.test(coluna)), 'nenhuma coluna de valor em reais');
    } finally {
      for (const id of ids) db.prepare('DELETE FROM SGC_SOLICITACAO WHERE ID = ?').run(id);
    }
  });

  /* ─────────── T-090 — RN-014 (o limite dos blocos top-N) ─────────── */

  await teste('RN-014 / D-008: os blocos top-N respeitam o limite declarado', async () => {
    for (const nome of ['sgcIndAgendaAtrasos', 'sgcIndProdutosBo', 'sgcIndPerfilFornecedor', 'sgcSolicitacoesPorVendedor']) {
      const rows = linhas(await chamar(nome, { ...BASE_SLA, ...BASE_IND, limite: 1 }));
      assert.ok(rows.length <= 1, `${nome} respeita {{limite}}`);
    }
  });

  /* ─────────── T-091 — C-026 e RN-015 ─────────── */

  await teste('RN-015 / C-025: o acesso restrito conta SÓ os pedidos que criou — o mesmo usuário como MEMBER conta todos', async () => {
    const meusCards = escolher(`${VIVA} AND C.CRIADO_POR <> ${U.gil}`, 2);
    assert.equal(meusCards.length, 2);
    const restaurarCriador = db.prepare('UPDATE KB_CARD SET CRIADO_POR = ? WHERE ID = ?');
    const criadoresOriginais = meusCards.map((id) => [id, Number(sql1('SELECT CRIADO_POR FROM KB_CARD WHERE ID = ?', id).CRIADO_POR)]);
    for (const id of meusCards) restaurarCriador.run(U.gil, id);
    try {
      const comoMembro = uma(await chamar('sgcIndResumo', BASE_IND, U.gil));
      const listaMembro = linhas(await chamar('sgcSlaPedidosListar', BASE_SLA, U.gil));

      await arranjando('INT_USER', 'ID', U.gil, { ACCESS_LEVEL: 'RESTRICTED' }, async () => {
        const resumo = uma(await chamar('sgcIndResumo', BASE_IND, U.gil));
        const lista = linhas(await chamar('sgcSlaPedidosListar', BASE_SLA, U.gil));
        const dele = conta(`SELECT COUNT(*) AS N ${DE_VIVOS}
          WHERE COALESCE(SF.CHAVE, '') NOT IN ('concluido', 'cancelado') AND C.CRIADO_POR = ?`, U.gil);
        const naListaDele = db.prepare(`SELECT P.ID_CARD ${DE_VIVOS}
          WHERE COALESCE(SF.CHAVE, '') <> 'cancelado' AND C.CRIADO_POR = ? ORDER BY P.ID_CARD`)
          .all(U.gil).map((l) => Number(l.ID_CARD));

        assert.equal(Number(resumo.PEDIDOS_ABERTOS), dele);
        assert.ok(dele >= meusCards.length, 'os dois cards passados para o gil entram na conta dele');
        assert.ok(Number(comoMembro.PEDIDOS_ABERTOS) > dele, 'como MEMBER o mesmo usuário conta todos');
        assert.deepEqual(lista.map((l) => Number(l.CARD_ID)).sort((a, b) => a - b), naListaDele);
        assert.ok(meusCards.every((id) => naListaDele.includes(id)));
        assert.ok(listaMembro.length > lista.length);
      });
    } finally {
      for (const [id, criador] of criadoresOriginais) restaurarCriador.run(criador, id);
    }
  });

  await teste('C-026: sgcIndPerfilFornecedor — uma linha por fornecedor com pedido no período, com a contagem do teste e o percentual entre 0 e 100', async () => {
    const rows = linhas(await chamar('sgcIndPerfilFornecedor', { ...BASE_SLA, limite: 50 }));
    const esperado = db.prepare(`SELECT COALESCE(P.CODFORNEC, 0) AS CODFORNEC, COUNT(*) AS N ${DE_VIVOS}
      WHERE COALESCE(SF.CHAVE, '') <> 'cancelado' GROUP BY COALESCE(P.CODFORNEC, 0)`).all();
    assert.equal(rows.length, esperado.length);
    for (const item of esperado) {
      const linha = rows.find((l) => Number(l.CODFORNEC) === Number(item.CODFORNEC));
      assert.ok(linha, `o fornecedor ${item.CODFORNEC} aparece no perfil`);
      assert.equal(Number(linha.QTD_PEDIDOS), Number(item.N));
      assert.ok(Number(linha.PERC_NO_PRAZO) >= 0 && Number(linha.PERC_NO_PRAZO) <= 100);
      assert.ok(Number(linha.SCORE_MEDIO) >= 0 && Number(linha.SCORE_MEDIO) <= 100);
    }
  });

  await teste('C-001 / RF-025: sgcIndProdutosBo — itens em B.O. por fornecedor, com o pendente em reais pelo PRECO_CUSTO do item', async () => {
    const rows = linhas(await chamar('sgcIndProdutosBo', { codfilial: '', limite: 50 }));
    const esperado = conta(`SELECT COUNT(*) AS N FROM SGC_BO_ITEM B
      JOIN KB_CARD C ON C.ID = B.ID_CARD AND C.EXCLUIDO_EM IS NULL
      JOIN SGC_PEDIDO P ON P.ID_CARD = B.ID_CARD WHERE B.STATUS = 'aberto'`);
    assert.equal(rows.reduce((acc, l) => acc + Number(l.ITENS_ABERTOS), 0), esperado);
    assert.ok(rows.length > 0);
    assert.ok(rows.every((l) => Number(l.VL_PENDENTE) >= 0 && Number(l.QT_PENDENTE) > 0));
  });

  /* ─────────── T-092 — RN-003 e RN-016 (as duas réguas) ─────────── */

  await teste('RN-003: o fragmento de dias úteis dá 15 entre 24/08/2026 e 14/09/2026, e as bordas de fim de semana batem', async () => {
    const um = async (a, b) => Number(uma(await rodar(`SELECT ${diasUteisEntre(`'${a}'`, `'${b}'`)} AS D`)).D);
    assert.equal(await um('2026-08-24', '2026-09-14'), 15);
    assert.equal(await um('2026-09-11', '2026-09-14'), 1, 'sexta para segunda = 1');
    assert.equal(await um('2026-09-14', '2026-09-19'), 4, 'segunda para sábado = 4');
    assert.equal(await um('2026-09-14', '2026-09-14'), 0, 'mesmo dia = 0');
    assert.equal(somarDiasUteis('2026-08-24', 15), '2026-09-14', 'o gêmeo puro da tela dá a mesma conferência');
  });

  await teste('RN-016: para CADA linha da listagem, a régua de lib/sla.ts reproduz os três estados e a nota que o servidor calculou', async () => {
    const hoje = '2026-09-18';
    const lista = linhas(await chamar('sgcSlaPedidosListar', { ...BASE_SLA, hoje }));
    assert.ok(lista.length > 5, 'a listagem tem linhas suficientes para a comparação valer alguma coisa');
    for (const linha of lista) {
      const etapas = ['analise', 'faturamento', 'entrega'].map((etapa) => marcosDaLinha(linha, etapa, hoje));
      const [analise, faturamento, entrega] = etapas.map((m) => classificarEtapa(m));
      assert.equal(analise, linha.STATUS_ANALISE, `análise do card ${linha.CARD_ID}`);
      assert.equal(faturamento, linha.STATUS_FATURAMENTO, `faturamento do card ${linha.CARD_ID}`);
      assert.equal(entrega, linha.STATUS_ENTREGA, `entrega do card ${linha.CARD_ID}`);
      const nota = notaDoPedido([
        { dias: linha.DIAS_ANALISE, meta: Number(linha.META_ANALISE_DIAS) },
        { dias: linha.DIAS_FATURAMENTO, meta: Number(linha.META_FATURAMENTO_DIAS) },
        { dias: linha.DIAS_ENTREGA, meta: Number(linha.META_ENTREGA_DIAS) },
      ]);
      assert.equal(nota, Number(linha.SLA_SCORE), `nota do card ${linha.CARD_ID}`);
    }
  });
}

/** O gêmeo puro, para o teste conferir o número sem repetir a fórmula da SQL. */
function diasUteisEntreJs(inicio, fim) {
  const MS = 86400000;
  const base = Date.UTC(1970, 0, 5);
  const acumulado = (iso) => {
    const [a, m, d] = iso.split('-').map(Number);
    const n = Math.round((Date.UTC(a, m - 1, d) - base) / MS) + 1;
    return 5 * Math.floor(n / 7) + Math.min(((n % 7) + 7) % 7, 5);
  };
  return acumulado(fim) - acumulado(inicio);
}
