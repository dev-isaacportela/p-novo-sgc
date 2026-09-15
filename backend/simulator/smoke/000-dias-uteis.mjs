// S0-007..S0-009 — R-025/R-038 do 000: os fragmentos SQL de
// backend/lib/dias-uteis.mjs (somados aos shims FLOOR/MOD e à reescrita de
// DATE_ADD(col, INTERVAL <expressão> DAY) de mysql-dialect.mjs, R-043) dão o
// mesmo resultado da conferência do plan da 005 — a 006 importa este
// contrato sem reimplementar.

import { toSqlite } from '../mysql-dialect.mjs';
import { diasUteisEntre, somarDiasUteis, somarDiasCorridos } from '../../lib/dias-uteis.mjs';
import { assert } from './base.mjs';

export async function suite(ctx) {
  const { db, teste } = ctx;

  await teste('S0-007: somarDiasUteis(2026-08-24, 15) = 2026-09-14 (conferência do R-025, literal)', async () => {
    const linha = db.prepare(toSqlite(`SELECT ${somarDiasUteis("'2026-08-24'", 15)} AS X`)).get();
    assert.equal(linha.X, '2026-09-14');
  });

  await teste('S0-008: diasUteisEntre conta o dia de chegada cruzando fim de semana (sexta 2026-09-11 -> terça 2026-09-15 = 2) e o mesmo par por somarDiasUteis fecha em 2026-09-14', async () => {
    const entre = db.prepare(toSqlite(`SELECT ${diasUteisEntre("'2026-08-24'", "'2026-09-14'")} AS X`)).get();
    assert.equal(entre.X, 15, 'diasUteisEntre deveria bater com o somarDiasUteis acima (ida e volta)');
    const cruzandoFds = db.prepare(toSqlite(`SELECT ${diasUteisEntre("'2026-09-11'", "'2026-09-15'")} AS X`)).get();
    assert.equal(cruzandoFds.X, 2, 'sexta -> terça, pulando o fim de semana, são 2 dias úteis');
  });

  await teste('S0-009: `n` de somarDiasUteis vindo de COLUNA (não só literal) dá o mesmo resultado; somarDiasCorridos soma corrido, sem olhar dia da semana', async () => {
    db.exec('CREATE TABLE IF NOT EXISTS S0_009_TESTE (COL TEXT, N INTEGER)');
    db.prepare('INSERT INTO S0_009_TESTE (COL, N) VALUES (?, ?)').run('2026-08-24', 15);
    const daColuna = db.prepare(toSqlite(`SELECT ${somarDiasUteis('COL', 'N')} AS X FROM S0_009_TESTE`)).get();
    assert.equal(daColuna.X, '2026-09-14', 'n como nome de coluna deveria dar o mesmo resultado do literal');

    const corridos = db.prepare(toSqlite(`SELECT ${somarDiasCorridos("'2026-08-24'", 10)} AS X`)).get();
    assert.equal(corridos.X, '2026-09-03', '24/08 + 10 dias corridos = 03/09, sem pular fim de semana');
  });
}
