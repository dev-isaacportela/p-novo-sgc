// S0-010..S0-013 — os shims que a onda 3 acrescentou a
// backend/simulator/mysql-dialect.mjs, provados um a um antes de a suíte 008
// depender deles (R-064, R-071, R-079 do 000).
//
// A regra do arquivo traduzido é preservar o SIGNIFICADO: shim que devolve
// linha plausível transforma o simulador em fábrica de falso positivo. Por
// isso `REGEXP_SUBSTR` só aceita as duas formas que os plans usam e LANÇA em
// qualquer outra, em vez de devolver um pedaço qualquer.

// S0-014 mora aqui pelo mesmo motivo: é contrato de BASE do SQL (o carregador
// de backend/sql/ e a régua que 008 e 009 compõem), não regra de nenhuma spec.
//
// S0-015 e S0-016 — os shims da base da onda 4 (R-096/R-100/R-113): POWER,
// SQRT e ADD_MONTHS escalares, e a reescrita do gerador de calendário
// `FROM DUAL CONNECT BY LEVEL <= n`, provados antes de a suíte 011 depender
// deles. As reescritas da onda 3 continuam na cadeia e continuam verdes acima.

import { toSqlite } from '../mysql-dialect.mjs';
import { fragmento } from '../../lib/fragmentos.mjs';
import { assert } from './base.mjs';

export async function suite(ctx) {
  const { db, teste } = ctx;

  await teste("S0-010 (R-064): REGEXP_SUBSTR('5301:3:2026-08-01:9201', '[^:]+', 1, 3) = 2026-08-01; ocorrência inexistente é NULL; forma não prevista lança", async () => {
    const um = db.prepare(toSqlite("SELECT REGEXP_SUBSTR('5301:3:2026-08-01:9201', '[^:]+', 1, 3) AS X")).get();
    assert.equal(um.X, '2026-08-01', 'o 3º pedaço separado por dois-pontos é a data de referência do par');

    const quatro = db.prepare(toSqlite("SELECT REGEXP_SUBSTR('5301:3:2026-08-01:9201', '[^:]+', 1, 4) AS X")).get();
    assert.equal(quatro.X, '9201', 'o 4º pedaço é o cliente');

    const alem = db.prepare(toSqlite("SELECT REGEXP_SUBSTR('5301:3:2026-08-01:9201', '[^:]+', 1, 5) AS X")).get();
    assert.equal(alem.X, null, 'ocorrência além do fim é NULL — é o que encerra o CONNECT BY');

    // Forma fora do contrato: melhor falhar alto do que devolver um pedaço qualquer.
    assert.throws(
      () => db.prepare(toSqlite("SELECT REGEXP_SUBSTR('a1b2', '[0-9]+', 1, 1) AS X")).get(),
      /REGEXP_SUBSTR/,
      'padrão fora de [^,]+ / [^:]+ tem de lançar, nunca devolver valor plausível',
    );
    assert.throws(
      () => db.prepare(toSqlite("SELECT REGEXP_SUBSTR('a,b', '[^,]+', 2, 1) AS X")).get(),
      /REGEXP_SUBSTR/,
      'início diferente de 1 tem de lançar',
    );
  });

  await teste("S0-011 (R-064): o gerador FROM DUAL CONNECT BY vira WITH RECURSIVE — 'a,b,c' explode em 3 linhas, na ordem, e o WITH que já abria a consulta é fundido", async () => {
    const sql = `WITH PARES AS (
  SELECT REGEXP_SUBSTR('a,b,c', '[^,]+', 1, LEVEL) AS ITEM
  FROM DUAL
  CONNECT BY REGEXP_SUBSTR('a,b,c', '[^,]+', 1, LEVEL) IS NOT NULL
)
SELECT ITEM FROM PARES`;
    const traduzido = toSqlite(sql);
    assert.ok(/^WITH RECURSIVE NIVEL\(LVL\) AS \(/.test(traduzido.trim()), `a CTE do gerador deveria abrir a instrução:\n${traduzido}`);
    assert.ok(!/\bCONNECT\s+BY\b/i.test(traduzido), 'nenhum CONNECT BY deveria sobrar');
    assert.ok(!/\bLEVEL\b/i.test(traduzido), 'LEVEL vira LVL');

    const linhas = db.prepare(traduzido).all();
    assert.deepEqual(linhas.map((l) => l.ITEM), ['a', 'b', 'c'], 'três pedaços, na ordem da lista');
  });

  await teste("S0-012 (R-071): JSON_UNQUOTE(JSON_EXTRACT(col, '$.k')) vira json_extract — a prioridade sai de KB_CARD.VALORES_JSON sem aspas sobrando", async () => {
    const sql = `SELECT JSON_UNQUOTE(JSON_EXTRACT('{"prioridade":"alta"}', '$.prioridade')) AS PRIORIDADE`;
    const traduzido = toSqlite(sql);
    assert.ok(!/JSON_UNQUOTE/i.test(traduzido), `JSON_UNQUOTE deveria sumir:\n${traduzido}`);
    assert.equal(db.prepare(traduzido).get().PRIORIDADE, 'alta', 'o SQLite já devolve o escalar sem aspas');
  });

  await teste('S0-013 (R-079): VALUES(col) vira excluded.col até o FIM DA INSTRUÇÃO — literal de texto no meio da cláusula não interrompe mais a troca', async () => {
    db.exec(`CREATE TABLE IF NOT EXISTS D0_DIALETO_UPSERT (
      ID_CARD INTEGER, CODPROD INTEGER, STATUS TEXT, QT REAL, UNIQUE (ID_CARD, CODPROD))`);

    // Mesma forma do upsert do add-006 (SELECT … WHERE guarda), com um literal
    // ANTES do último VALUES() — era aqui que a tradução parava (o
    // mapOutsideStrings corta o texto na aspa e o marcador fica no trecho anterior).
    const upsert = (status, qt) => `INSERT INTO D0_DIALETO_UPSERT (ID_CARD, CODPROD, STATUS, QT)
SELECT * FROM (SELECT 91 AS ID_CARD, 5301 AS CODPROD, '${status}' AS STATUS, ${qt} AS QT) LOTE
WHERE 1 = 1
ON DUPLICATE KEY UPDATE STATUS = CASE WHEN VALUES(QT) = 0 THEN 'removido' ELSE VALUES(STATUS) END, QT = VALUES(QT)`;

    const traduzido = toSqlite(upsert('montagem', 12));
    const clausula = traduzido.slice(traduzido.search(/ON CONFLICT/i));
    assert.ok(!/\bVALUES\s*\(/i.test(clausula), `nenhum VALUES() deveria sobrar depois do marcador:\n${clausula}`);

    db.prepare(traduzido).run();
    db.prepare(toSqlite(upsert('enviado', 0))).run();
    const zerado = db.prepare('SELECT STATUS, QT FROM D0_DIALETO_UPSERT WHERE ID_CARD = 91 AND CODPROD = 5301').get();
    assert.equal(zerado.STATUS, 'removido', 'o CASE com literal decide o STATUS');
    assert.equal(zerado.QT, 0, 'e o VALUES(QT) DEPOIS do literal também foi traduzido');

    db.prepare(toSqlite(upsert('enviado', 7))).run();
    const voltou = db.prepare('SELECT STATUS, QT FROM D0_DIALETO_UPSERT WHERE ID_CARD = 91 AND CODPROD = 5301').get();
    assert.equal(voltou.STATUS, 'enviado', 'com quantidade > 0 o ELSE VALUES(STATUS) vale');
    assert.equal(voltou.QT, 7);
  });

  await teste("S0-017 (R-064): TO_DATE devolve NULL para NULL e para '' (filtro desligado) e LANÇA para texto que não é data ou para mês/dia inexistente — nunca inventa um dia", async () => {
    const um = (sql) => db.prepare(toSqlite(sql)).get().X;

    assert.equal(um("SELECT TO_DATE('2026-02-14', 'YYYY-MM-DD') AS X"), '2026-02-14', 'data válida volta o MESMO dia');
    assert.equal(um("SELECT TO_DATE('14/02/2026', 'DD/MM/YYYY') AS X"), '2026-02-14', 'o outro formato usado nos plans');
    assert.equal(um("SELECT TO_DATE('2026-02-14 09:30:00', 'YYYY-MM-DD HH24:MI:SS') AS X"), '2026-02-14', 'com hora, o dia é o mesmo');
    assert.equal(um('SELECT TO_DATE(NULL, \'YYYY-MM-DD\') AS X'), null, 'NULL continua NULL');
    assert.equal(um("SELECT TO_DATE('', 'YYYY-MM-DD') AS X"), null, "filtro desligado ('') é NULL, não 1970");

    assert.throws(
      () => um("SELECT TO_DATE('2026-13-45', 'YYYY-MM-DD') AS X"),
      /TO_DATE/,
      'mês 13 e dia 45 não existem: Date.UTC transbordaria e o simulador devolveria uma data plausível',
    );
    assert.throws(
      () => um("SELECT TO_DATE('2026-02-30', 'YYYY-MM-DD') AS X"),
      /TO_DATE/,
      '30 de fevereiro também é inexistente',
    );
    assert.throws(
      () => um("SELECT TO_DATE('naoedata', 'YYYY-MM-DD') AS X"),
      /TO_DATE/,
      'texto que não casa com o formato lança, como TO_NUMBER já faz',
    );
  });

  await teste('S0-014 (R-070/R-074/R-075): fragmento() carrega a régua de situacao-solicitacao.sql como expressão escalar, e ela COMPÕE com os aliases do contrato (S/C/SF/I)', async () => {
    const situacao = fragmento('situacao-solicitacao.sql');
    assert.ok(situacao.startsWith('CASE') && situacao.endsWith('END'), `a régua é uma expressão escalar, do CASE ao END:\n${situacao.slice(0, 80)}…`);
    assert.ok(!situacao.includes('--'), 'o cabeçalho de contrato não entra no SQL');

    // Só a COMPOSIÇÃO (aliases, junções, nomes de coluna): a semântica de cada
    // um dos 9 valores é da 008 (C-011/RN-008, sobre o seed dela). Aqui se
    // prova que a expressão colada roda e que não devolve valor fora do
    // contrato — sem literal de total (R-045).
    const sql = `SELECT ${situacao} AS SITUACAO
FROM SGC_SOLICITACAO S
LEFT JOIN KB_CARD C ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_FASE SF ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD AND I.STATUS <> 'removido'`;
    const VALORES = ['sem_pedido', 'em_analise', 'em_aprovacao', 'em_envio', 'enviada',
      'em_transito', 'em_faturamento', 'atendida', 'nao_atendida'];
    const linhas = db.prepare(toSqlite(sql)).all();
    assert.ok(linhas.length > 0, 'laço sobre zero linha não prova nada: o seed precisa ter solicitação (R-045)');
    for (const linha of linhas) {
      assert.ok(VALORES.includes(linha.SITUACAO), `valor fora do contrato da régua: ${linha.SITUACAO}`);
    }
  });

  await teste('S0-015 (R-096/R-100): POWER, SQRT e ADD_MONTHS — o peso por recência, a volatilidade e a janela de 12 meses do lead time medido', async () => {
    const um = db.prepare(toSqlite("SELECT POWER(0.85, 2) AS P, SQRT(9) AS R, ADD_MONTHS('2026-09-16', -12) AS A")).get();
    // Ponto flutuante: 0,85² sai 0,7224999999999999 em IEEE 754 — a consulta
    // arredonda, o shim não.
    assert.ok(Math.abs(um.P - 0.7225) < 1e-9, `peso por recência de 2 dias atrás (0,85^2): ${um.P}`);
    assert.equal(um.R, 3, 'SQRT(9) = 3 — a volatilidade é SQRT(AVG(x²) - AVG(x)²), sem STDDEV_POP');
    assert.equal(um.A, '2025-09-16', 'ADD_MONTHS volta 12 meses no mesmo dia');

    // Dia que não existe no mês de destino cai no último dia do mês, como o Oracle.
    const borda = db.prepare(toSqlite("SELECT ADD_MONTHS('2026-03-31', -1) AS A, ADD_MONTHS('2026-01-31', 1) AS B")).get();
    assert.equal(borda.A, '2026-02-28', '31/03 menos 1 mês é 28/02, não 03/03');
    assert.equal(borda.B, '2026-02-28', '31/01 mais 1 mês é 28/02');

    const nulo = db.prepare(toSqlite("SELECT ADD_MONTHS('sem data', 1) AS A, POWER(NULL, 2) AS P, SQRT(NULL) AS R")).get();
    assert.equal(nulo.A, null, 'texto que não é data volta NULL, nunca uma data plausível');
    assert.equal(nulo.P, null);
    assert.equal(nulo.R, null);
  });

  await teste('S0-016 (R-096/R-100/R-113): FROM DUAL CONNECT BY LEVEL <= n vira WITH RECURSIVE CALENDARIO — 153 dias nas duas formas (dentro de uma CTE precedida de outras duas, e solto), sem destruir as CTEs anteriores', async () => {
    const PROJECAO = `SELECT TO_DATE('2026-04-17', 'YYYY-MM-DD') + (LEVEL - 1) AS DIA,
         GREATEST(153, 1) - LEVEL AS DIAS_ATE_FIM
  FROM DUAL
  CONNECT BY LEVEL <= GREATEST(153, 1)`;

    // Forma 1: o gerador dentro de `WITH DIAS AS (…)`, com DUAS CTEs antes — é
    // o caso em que um regex guloso começaria no SELECT de PRODUTOS_BASE e
    // apagaria meia consulta até o FROM DUAL.
    const naCte = `WITH PRODUTOS_BASE AS (
  SELECT 5401 AS CODPROD
),
RESSUPRIMENTO_PRODUTO AS (
  SELECT CODPROD, 12 AS CUSTO FROM PRODUTOS_BASE
),
DIAS AS (
  ${PROJECAO}
)
SELECT P.CODPROD, P.CUSTO, D.DIA, D.DIAS_ATE_FIM
FROM DIAS D
CROSS JOIN RESSUPRIMENTO_PRODUTO P
ORDER BY D.DIA`;

    const traduzidoCte = toSqlite(naCte);
    assert.ok(!/\bCONNECT\s+BY\b/i.test(traduzidoCte), `nenhum CONNECT BY deveria sobrar:\n${traduzidoCte}`);
    assert.ok(/WITH RECURSIVE CALENDARIO\(LEVEL\) AS \(/.test(traduzidoCte), 'a CTE recursiva do calendário deveria aparecer');
    assert.ok(/PRODUTOS_BASE AS \(/.test(traduzidoCte) && /RESSUPRIMENTO_PRODUTO AS \(/.test(traduzidoCte),
      `as CTEs anteriores continuam inteiras:\n${traduzidoCte}`);

    const linhas = db.prepare(traduzidoCte).all();
    assert.equal(linhas.length, 153, 'uma linha por dia do período, inclusive nos dias sem venda');
    assert.equal(linhas[0].DIA, '2026-04-17', 'a primeira linha é dataInicio');
    assert.equal(linhas[0].DIAS_ATE_FIM, 152, 'e está a 152 dias do fim');
    assert.equal(linhas[152].DIA, '2026-09-16', 'a última linha é dataFim (dataInicio + 152)');
    assert.equal(linhas[152].DIAS_ATE_FIM, 0);
    assert.equal(linhas[0].CODPROD, 5401, 'a CTE de produtos sobreviveu à reescrita');
    assert.equal(linhas[0].CUSTO, 12, 'a segunda CTE também');

    // Forma 2: o gerador solto, sem parêntese envolvente — o fim da INSTRUÇÃO
    // conta como fim de bloco, senão o CONNECT BY cru chegaria ao SQLite.
    const solto = `${PROJECAO}`;
    const traduzidoSolto = toSqlite(solto);
    assert.ok(!/\bCONNECT\s+BY\b/i.test(traduzidoSolto), `nenhum CONNECT BY deveria sobrar:\n${traduzidoSolto}`);
    const soltas = db.prepare(traduzidoSolto).all();
    assert.equal(soltas.length, 153, 'mesmas 153 linhas sem a CTE em volta');
    assert.equal(soltas[0].DIA, '2026-04-17');
    assert.equal(soltas[0].DIAS_ATE_FIM, 152);
    assert.equal(soltas[152].DIA, '2026-09-16');
    assert.equal(soltas[152].DIAS_ATE_FIM, 0);
  });
}
