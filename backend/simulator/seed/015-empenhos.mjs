// Seção Simulador do plan da 015 (quadro de empenhos): o quadro `empenhos`
// (10 fases com chave em SGC_EMP_FASE, 6 campos), um pregão de órgão público e um
// empenho na Análise com dois itens de duas indústrias, para a tela nascer com o
// que mostrar; e as linhas PC* próprias (produtos 6601-6603, órgão 9661, cliente
// privado 9662, venda à rede e remessa de entrega futura) para as sgcWintEmp* no
// SQLite. As listas de fases e campos vêm de backend/add-017-empenhos.mjs — o
// mesmo arquivo que as cria no sandbox.
//
// Devolve os ids que o smoke usa (`cenario.empenhos`).

import { CAMPOS_EMPENHO, DESCRICAO_EMPENHOS, FASES_EMPENHO, NOME_EMPENHOS, SLUG_EMPENHOS } from '../../add-017-empenhos.mjs';

const ORGAO = { codcli: 9661, nome: 'PREFEITURA MUNICIPAL DE TESTE', ramo: 12 };
const PRIVADO = { codcli: 9662, nome: 'CLINICA PARTICULAR TESTE', ramo: 1 };
const PRODUTOS = [
  { codprod: 6601, descricao: 'DIETA ENTERAL TESTE 1L', codfornec: 1661, codfab: 'FK-6601' },
  { codprod: 6602, descricao: 'SUPLEMENTO PROTEICO TESTE 400G', codfornec: 1662, codfab: 'NL-6602' },
  { codprod: 6603, descricao: 'MODULO DE FIBRAS TESTE 200G', codfornec: 1661, codfab: 'FK-6603' },
];

const dia = (deslocamento) => new Date(Date.now() + deslocamento * 86400000).toISOString().slice(0, 10);

export function seed015(db, cenario) {
  const agora = new Date().toISOString().slice(0, 19);
  const U = cenario.usuarios;

  /* ── o quadro e as fases (as chaves `emp_*` são o contrato) ── */
  db.prepare(`INSERT INTO KB_BOARD (NOME, SLUG, DESCRICAO, ADMINS_IDS, CONFIG_JSON, ATIVO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, NULL, 1, ?, ?, ?)`).run(NOME_EMPENHOS, SLUG_EMPENHOS, DESCRICAO_EMPENHOS, String(U.admin), U.admin, agora, agora);
  const boardId = Number(db.prepare('SELECT ID FROM KB_BOARD WHERE SLUG = ?').get(SLUG_EMPENHOS).ID);

  const inserirFase = db.prepare(`INSERT INTO KB_FASE (BOARD_ID, NOME, COR, DESCRICAO, ORDEM, TIPO, SLA_HORAS, CONDICAO_JSON, CAPA_JSON, ATIVO)
    VALUES (?, ?, ?, NULL, ?, ?, 0, NULL, NULL, 1)`);
  const inserirChave = db.prepare('INSERT INTO SGC_EMP_FASE (BOARD_ID, CHAVE, FASE_ID, ORDEM) VALUES (?, ?, ?, ?)');
  const fases = {};
  FASES_EMPENHO.forEach((fase, indice) => {
    inserirFase.run(boardId, fase.nome, fase.cor, indice + 1, fase.tipo);
    fases[fase.chave] = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_FASE').get().ID);
    inserirChave.run(boardId, fase.chave, fases[fase.chave], indice + 1);
  });

  const inserirCampo = db.prepare(`INSERT INTO KB_CAMPO
    (BOARD_ID, FASE_ID, CHAVE, LABEL, TIPO, OBRIGATORIO, NO_CARD, EDITAVEL_DEPOIS, ORDEM, CONFIG_JSON, CONDICAO_JSON, ATIVO)
    VALUES (?, NULL, ?, ?, ?, 0, ?, 0, ?, '{}', NULL, 1)`);
  CAMPOS_EMPENHO.forEach((campo, indice) => inserirCampo.run(boardId, campo.chave, campo.label, campo.tipo, campo.noCard ? 1 : 0, indice + 1));

  /* ── o WinThor imitado ── */
  const cliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1, CGCENT) VALUES (?, ?, ?, ?, ?)');
  cliente.run(ORGAO.codcli, ORGAO.nome, 'J', ORGAO.ramo, '00.000.000/0001-01');
  cliente.run(PRIVADO.codcli, PRIVADO.nome, 'J', PRIVADO.ramo, '00.000.000/0001-02');
  const fornecedor = db.prepare('INSERT INTO PCFORNEC (CODFORNEC, FORNECEDOR, FANTASIA) VALUES (?, ?, ?)');
  fornecedor.run(1661, 'INDUSTRIA TESTE A', 'TESTE A');
  fornecedor.run(1662, 'INDUSTRIA TESTE B', 'TESTE B');
  const produto = db.prepare(`INSERT INTO PCPRODUT (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL, CODFAB, CODAUXILIAR)
    VALUES (?, ?, 'CX 12', 'UN', ?, 1, 1, 12, NULL, 365, ?, NULL)`);
  for (const p of PRODUTOS) produto.run(p.codprod, p.descricao, p.codfornec, p.codfab);
  // 6601: 40 na filial 1 (5 bloqueadas, 5 reservadas), 120 na 2; 6602: 0 na 1, 30 na 3; 99 sempre fora.
  const estoque = db.prepare(`INSERT INTO PCEST (CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, QTPEDIDA, QTBLOQUEADA, QTINDENIZ, QTRESERV, CUSTOULTENT, DTULTSAIDA)
    VALUES (?, ?, ?, 0, 0, 0, 0, ?, 0, ?, 10, NULL)`);
  [[6601, '1', 40, 5, 5], [6601, '2', 120, 0, 0], [6601, '99', 500, 0, 0], [6602, '1', 0, 0, 0], [6602, '3', 30, 0, 0], [6603, '1', 10, 0, 0]]
    .forEach((linha) => estoque.run(...linha));
  // Vendas de 6601 na filial 1: 30 ao órgão e 15 ao privado (contam), 20 à rede e 7 de remessa (não contam).
  const filialRede = db.prepare("SELECT CODCLI FROM PCFILIAL WHERE CODCLI IS NOT NULL AND CODCLI > 0 LIMIT 1").get();
  const mov = db.prepare(`INSERT INTO PCMOV (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMTRANSVENDA)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  db.prepare('INSERT INTO PCNFSAID (NUMTRANSVENDA, CONDVENDA) VALUES (?, ?)').run(966108, 8);
  mov.run(966101, 6601, '1', ORGAO.codcli, 'S', dia(-10), 30, 50, 966101);
  mov.run(966102, 6601, '1', PRIVADO.codcli, 'S', dia(-20), 15, 60, 966102);
  if (filialRede) mov.run(966103, 6601, '1', Number(filialRede.CODCLI), 'S', dia(-5), 20, 40, 966103);
  mov.run(966108, 6601, '1', ORGAO.codcli, 'S', dia(-3), 7, 50, 966108);
  mov.run(966104, 6602, '3', PRIVADO.codcli, 'S', dia(-60), 4, 80, 966104);
  mov.run(966105, 6601, '1', 0, 'E', dia(-30), 100, 30, null);

  /* ── um pregão e um empenho na Análise (a tela nasce com o que mostrar) ── */
  db.prepare(`INSERT INTO SGC_EMP_PREGAO (CODIGO_EDITAL, ORGAO, CODCLI, DT_VIGENCIA_FIM, ATIVO, CRIADO_POR, CRIADO_EM)
    VALUES ('PE 90/2026', ?, ?, ?, 1, ?, ?)`).run(ORGAO.nome, ORGAO.codcli, dia(20), U.ana, agora);
  const idPregao = Number(db.prepare("SELECT ID FROM SGC_EMP_PREGAO WHERE CODIGO_EDITAL = 'PE 90/2026'").get().ID);

  const titulo = 'PE 90/2026 · 2026NE000123';
  db.prepare(`INSERT INTO KB_CARD
    (BOARD_ID, FASE_ID, TITULO, ORDEM, RESPONSAVEL_ID, PRAZO, VALORES_JSON, TEXTO_BUSCA, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM, FASE_DESDE)
    VALUES (?, ?, ?, 100, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    boardId, fases.emp_analise, titulo, U.ana, dia(2),
    JSON.stringify({ orgao: ORGAO.nome, filial: 'Benenutri Matriz', valor_contrato: '6836.2', cmv: '57%' }),
    `${titulo} ${ORGAO.nome}`.toLowerCase(), U.ana, agora, agora, agora,
  );
  const cardId = Number(db.prepare('SELECT MAX(ID) AS ID FROM KB_CARD').get().ID);
  db.prepare('INSERT INTO KB_CARD_RESPONSAVEL (CARD_ID, USUARIO_ID, ORDEM) VALUES (?, ?, 1)').run(cardId, U.ana);
  db.prepare("INSERT INTO KB_MOVIMENTO (CARD_ID, DE_FASE_ID, PARA_FASE_ID, USUARIO_ID, ORIGEM, QUANDO) VALUES (?, NULL, ?, ?, 'usuario', ?)")
    .run(cardId, fases.emp_analise, U.ana, agora);
  db.prepare(`INSERT INTO SGC_EMP_EMPENHO (ID_CARD, ID_PREGAO, NUM_EMPENHO, CODFILIAL, FILIAL, CODFILIAL_PEDIDO, DT_RECEBIMENTO,
      PRAZO_DIAS, PRAZO_UNIDADE, DT_LIMITE, ACEITA_PARCIAL, OBSERVACAO, VL_TOTAL, VL_CUSTO, CMV_PERC, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, '2026NE000123', '1', 'Benenutri Matriz', '1', ?, 15, 'CORRIDOS', ?, 1, '', 6836.2, 3914, 0.5725, ?, ?, ?)`)
    .run(cardId, idPregao, dia(-13), dia(2), U.ana, agora, agora);
  const idEmpenho = Number(db.prepare('SELECT ID FROM SGC_EMP_EMPENHO WHERE ID_CARD = ?').get(cardId).ID);
  const item = db.prepare(`INSERT INTO SGC_EMP_ITEM (ID_EMPENHO, CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFAB, CODFORNEC, FORNECEDOR,
      QT_EMPENHO, PRECO_VENDA, CUSTO_NEGOCIADO, CUSTO_ESPECIAL, CUSTO_PADRAO, TIPO_CUSTO_PEDIDO, QT_COMPRA, QT_TRANSFERENCIA, QT_ESTOQUE,
      CODFILIAL_ORIGEM, OBSERVACAO, ATUALIZADO_POR, ATUALIZADO_EM)
    VALUES (?, ?, ?, 'CX 12', 'UN', ?, ?, ?, ?, ?, ?, 0, ?, '', 0, 0, 0, '', '', ?, ?)`);
  item.run(idEmpenho, 6601, PRODUTOS[0].descricao, PRODUTOS[0].codfab, 1661, 'Industria Teste A', 100, 45.5, 25, 28, U.ana, agora);
  item.run(idEmpenho, 6602, PRODUTOS[1].descricao, PRODUTOS[1].codfab, 1662, 'Industria Teste B', 35, 65.32, 0, 40.4, U.ana, agora);

  cenario.empenhos = { boardId, fases, idPregao, cardId, idEmpenho, orgao: ORGAO, privado: PRIVADO };
  return cenario.empenhos;
}
