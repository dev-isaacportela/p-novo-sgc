// Seção Simulador da spec 017 (solicitações: apoio à avaliação e visões
// agrupadas). Ver docs/specs/017-solicitacoes-apoio-e-visoes/plan.md §Simulador.
//
// Só WinThor: NADA no banco do projeto, para as contagens da 008 (C-007,
// C-020, C-021) não mudarem. As visões agrupadas são exercitadas no smoke sobre
// solicitações que a própria suíte insere; o apoio, sobre o produto daqui:
//
// - o produto 5311 do fornecedor 1042 (fora das faixas 5001–5104 da 003,
//   5201–5202 da 007, 5301–5305 da 008 e 5401+ da 011);
// - os clientes 9311–9318 — 9317 é órgão público (ramo 11) e 9318 é a própria
//   rede (ramo 20, R-131);
// - a posição da filial 3 (80 físico, 10 bloqueado, 5 reservado, 24 pedido e 12
//   em trânsito: disponível 65, a caminho 36 — C-05);
// - as vendas do C-01..C-03 em datas RELATIVAS a hoje (dia 15 dos meses
//   fechados, dia 1 do corrente) e os controles do C-02, que não entram em
//   soma nenhuma. NUMTRANSITEM a partir de 970001 (R-062).

export const PRODUTO_017 = { codprod: 5311, descricao: 'SUPLEMENTO PROTEICO SEM SABOR 400 G', codfornec: 1042, codfilial: '3' };

// CODCLI, CLIENTE, CODATV1.
const CLIENTES = [
  [9311, 'Clinica Nutrir Bem Ltda', 1],
  [9312, 'Hospital Santa Clara SA', 1],
  [9313, 'Farmacia Vida Plena Ltda', 1],
  [9314, 'Casa de Saude Esperanca Ltda', 1],
  [9315, 'Drogaria Bom Preco Ltda', 1],
  [9316, 'Consultorio Dra Marta Ltda', 1],
  [9317, 'PREFEITURA MUNICIPAL DE APOIO', 11],
  [9318, 'BENENUTRI FILIAL APOIO', 20],
];

// meses atrás (0 = corrente), CODCLI, QT, CODFILIAL, CODOPER, NUMTRANSVENDA.
// Barras sem público (C-01): m-6 20 · m-5 40 · m-4 10 · m-3 50 · m-2 35 · m-1 40 · m0 20.
// Cinco maiores (C-03): 9311 70 · 9312 50 · 9313 40 · 9314 30 · 9315 20; o 9316 (5) fica fora.
const MOVIMENTOS = [
  [6, 9313, 20, '3', 'S', null],
  [5, 9311, 40, '3', 'S', null],
  [4, 9315, 10, '3', 'S', null],
  [3, 9312, 50, '3', 'S', null],
  [3, 9317, 200, '3', 'S', null],    // controle: órgão público (fora sempre, P-03)
  [2, 9314, 30, '3', 'S', null],
  [2, 9316, 5, '3', 'S', null],
  [2, 9312, 100, '3', 'S', 970900],  // controle: remessa de entrega futura (CONDVENDA 8)
  [1, 9311, 30, '3', 'S', null],
  [1, 9315, 10, '3', 'S', null],
  [1, 9318, 300, '3', 'S', null],    // controle: venda para a própria rede
  [1, 9311, 500, '1', 'S', null],    // controle: outra filial
  [1, 0, 1000, '3', 'E', null],      // controle: entrada de compra
  [8, 9314, 60, '3', 'S', null],     // controle: fora da janela
  [0, 9313, 20, '3', 'S', null],
];

/** Dia `dia` do mês `meses` atrás de hoje (UTC), em AAAA-MM-DD. */
function noMes(meses, dia) {
  const hoje = new Date();
  const data = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - meses, dia));
  return data.toISOString().slice(0, 10);
}

export function seed017(db) {
  const { codprod, descricao, codfornec, codfilial } = PRODUTO_017;

  db.prepare(`INSERT INTO PCPRODUT
    (CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, CODFORNEC, CODEPTO, CODSEC, QTUNITCX, OBS2, PRAZOVAL)
    VALUES (?, ?, 'CX 12', 'UN', ?, 3, 31, 12, NULL, 180)`).run(codprod, descricao, codfornec);

  const inserirRamo = db.prepare('INSERT OR IGNORE INTO PCATIVI (CODATIV, RAMO) VALUES (?, ?)');
  inserirRamo.run(1, 'CLINICA');
  inserirRamo.run(11, 'ORGAO PUBLICO MUNICIPAL');
  inserirRamo.run(20, 'FILIAL');
  const inserirCliente = db.prepare('INSERT INTO PCCLIENT (CODCLI, CLIENTE, TIPOFJ, CODATV1) VALUES (?, ?, ?, ?)');
  for (const [codcli, cliente, ramo] of CLIENTES) inserirCliente.run(codcli, cliente, 'J', ramo);

  db.prepare(`INSERT INTO PCEST
    (CODPROD, CODFILIAL, QTEST, QTVENDMES, QTVENDMES1, QTVENDMES2, QTPEDIDA, QTBLOQUEADA, QTINDENIZ, QTRESERV,
     CUSTOULTENT, DTULTENT, DTULTSAIDA)
    VALUES (?, ?, 80, 20, 40, 35, 24, 10, 0, 5, 18.5, ?, ?)`).run(codprod, codfilial, noMes(1, 15), noMes(0, 1));
  db.prepare('INSERT INTO PCESTTRANSITO (CODPROD, CODFILIAL, QTTRANSITO, DTPREVISTA) VALUES (?, ?, 12, ?)')
    .run(codprod, codfilial, noMes(-1, 10));

  db.prepare('INSERT OR IGNORE INTO PCNFSAID (NUMTRANSVENDA, CONDVENDA) VALUES (970900, 8)').run();
  const inserirMov = db.prepare(`INSERT INTO PCMOV
    (NUMTRANSITEM, CODPROD, CODFILIAL, CODCLI, CODOPER, DTMOV, QT, PUNIT, NUMPED, NUMNOTA, NUMTRANSVENDA, DTCANCEL)
    VALUES (?, ?, ?, ?, ?, ?, ?, 25, 0, ?, ?, NULL)`);
  MOVIMENTOS.forEach(([meses, codcli, qt, filial, codoper, numtransvenda], i) => {
    const transitem = 970001 + i;
    inserirMov.run(transitem, codprod, filial, codcli, codoper, noMes(meses, meses === 0 ? 1 : 15), qt, transitem, numtransvenda);
  });
}
