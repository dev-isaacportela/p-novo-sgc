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

  await teste('S0-014 (R-070/R-074/R-075): fragmento() carrega a régua de situacao-solicitacao.sql como expressão escalar, e ela COMPÕE com os aliases do contrato (S/C/SF/I)', async () => {
    const situacao = fragmento('situacao-solicitacao.sql');
    assert.ok(situacao.startsWith('CASE') && situacao.endsWith('END'), `a régua é uma expressão escalar, do CASE ao END:\n${situacao.slice(0, 80)}…`);
    assert.ok(!situacao.includes('--'), 'o cabeçalho de contrato não entra no SQL');

    // Só a COMPOSIÇÃO (aliases, junções, nomes de coluna): a semântica dos 9
    // valores é da 008 (S3), que semeia as solicitações. Sem linha semeada
    // ainda, o que se prova aqui é que a expressão colada roda.
    const sql = `SELECT ${situacao} AS SITUACAO
FROM SGC_SOLICITACAO S
LEFT JOIN KB_CARD C ON C.ID = S.ID_CARD AND C.EXCLUIDO_EM IS NULL
LEFT JOIN SGC_FASE SF ON SF.BOARD_ID = C.BOARD_ID AND SF.FASE_ID = C.FASE_ID
LEFT JOIN SGC_PEDIDO_ITEM I ON I.ID_CARD = S.ID_CARD AND I.CODPROD = S.CODPROD AND I.STATUS <> 'removido'`;
    assert.deepEqual(db.prepare(toSqlite(sql)).all(), [], 'a régua composta roda; sem seed da 008 não há linha');
  });
}
