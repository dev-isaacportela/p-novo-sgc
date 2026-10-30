// G-001..G-004 — a INTEGRATION gestao-de-custos no simulador (gestao-custos.mjs),
// provada SEM rede: só a definition certa é aceita, os `event.<param>` entram
// por texto e só como número ou lista numérica, só SELECT/WITH passa, e o
// executor em SQLite devolve as unidades por caixa da CUSTO_PRODUTOS do seed.

import { createRunner } from '../runtime.mjs';
import {
  abrirGestaoCustos, codprodsDe, ehGestaoCustos, executorSqlite, montarSql, origemDe,
} from '../gestao-custos.mjs';
import { assert } from './base.mjs';

export async function suite(ctx) {
  const { db, byName, teste, U } = ctx;

  await teste('G-001: ehGestaoCustos aceita sgcCustoUnidadesPorCaixa (INTEGRATION com connection gestao-de-custos) e recusa toda outra definition carregada, uma INTEGRATION de outra conexão e JSON inválido', async () => {
    const aceitas = [...byName.values()].filter(ehGestaoCustos).map((d) => d.name);
    assert.deepEqual(aceitas, ['sgcCustoUnidadesPorCaixa']);
    assert.equal(ehGestaoCustos({ type: 'INTEGRATION', code: JSON.stringify({ connection: 'outra', body: { sql: 'SELECT 1' } }) }), false);
    assert.equal(ehGestaoCustos({ type: 'INTEGRATION', code: '{nao e json' }), false);
    assert.equal(ehGestaoCustos({ type: 'SQL', code: 'SELECT 1' }), false);
  });

  await teste('G-002: montarSql troca event.codprods pela lista numérica, vira NULL quando vazia, recusa letra na lista e recusa SQL que não é SELECT/WITH', async () => {
    const def = byName.get('sgcCustoUnidadesPorCaixa');
    const sql = montarSql(def, { codprods: '5001, 5002' });
    assert.ok(/IN \(5001, 5002\)/.test(sql), sql);
    assert.ok(!/event\./.test(sql));
    assert.ok(/IN \(NULL\)/.test(montarSql(def, { codprods: '' })));
    assert.throws(() => montarSql(def, { codprods: "5001) OR 1=1 --" }), /lista numérica/);
    assert.throws(() => montarSql(def, { codprods: 'abc' }), /lista numérica/);
    const escrita = { type: 'INTEGRATION', code: JSON.stringify({ connection: 'gestao-de-custos', body: { sql: 'DELETE FROM PRODUTOS WHERE CODPROD IN (event.codprods)' } }) };
    assert.throws(() => montarSql(escrita, { codprods: '1' }), /somente leitura/);
    assert.deepEqual(codprodsDe({ codprods: ' 5001,5002 , x, 0' }), [5001, 5002]);
  });

  await teste('G-003: pelo runner com o executor em SQLite, sgcCustoUnidadesPorCaixa devolve 12 para o 5001 e 24 para o 5002 (seed da 003), nada para o 5010, e lista vazia devolve 0 linhas sem erro', async () => {
    const execute = createRunner(db, { externos: [executorSqlite(db)] });
    const def = byName.get('sgcCustoUnidadesPorCaixa');
    const { rows } = await execute(def, { codprods: '5001,5002,5010' }, U.ana);
    const mapa = new Map(rows.map((r) => [Number(r.CODPROD), Number(r.UNIDADES_POR_CAIXA)]));
    assert.equal(mapa.get(5001), 12);
    assert.equal(mapa.get(5002), 24);
    assert.equal(mapa.has(5010), false, 'sem linha na gestão de custos cai na embalagem (RN-002 da 003)');
    assert.deepEqual((await execute(def, { codprods: '' }, U.ana)).rows, []);
  });

  await teste('G-004: sem SIMULATOR_GESTAO_CUSTOS=mitra, abrirGestaoCustos devolve o executor em SQLite (ou null sem banco); com a chave e SÓ as MITRA_* dos add-* preenchidas NÃO liga (recusa nomeando GESTAO_CUSTOS_TOKEN, sem rede); com GESTAO_CUSTOS_BASE_URL e GESTAO_CUSTOS_TOKEN liga, sem tocar em process.env', async () => {
    const silencioso = { log() {}, warn() {} };
    const local = await abrirGestaoCustos({ env: {}, log: silencioso, db });
    assert.equal(local.descricao, 'sqlite (CUSTO_PRODUTOS do seed)');
    assert.equal(await abrirGestaoCustos({ env: {}, log: silencioso }), null);
    await assert.rejects(
      abrirGestaoCustos({
        env: { SIMULATOR_GESTAO_CUSTOS: 'mitra', MITRA_BASE_URL: 'http://x', MITRA_TOKEN: 't', MITRA_BASE_URL_INTEGRATIONS: 'http://x', MITRA_PROJECT_ID: '1' },
        log: silencioso, db,
      }),
      /GESTAO_CUSTOS_BASE_URL, GESTAO_CUSTOS_TOKEN/,
    );
    const antes = JSON.stringify(process.env);
    const remoto = await abrirGestaoCustos({
      env: { SIMULATOR_GESTAO_CUSTOS: 'mitra', GESTAO_CUSTOS_BASE_URL: 'http://gestao.local', GESTAO_CUSTOS_TOKEN: 'segredo' },
      log: silencioso, db,
    });
    assert.equal(remoto.descricao, 'mitra projeto 46967 via runQuery');
    assert.equal(typeof remoto.executar, 'function');
    assert.equal(JSON.stringify(process.env), antes, 'o adaptador nao escreve em process.env');
    // A URL base e so a origem: caminho colado junto (como /interactions/records) e descartado.
    assert.equal(origemDe('https://newmitra.exemplo.com:8080/interactions/records', silencioso), 'https://newmitra.exemplo.com:8080');
    assert.equal(origemDe('https://api.exemplo.com', silencioso), 'https://api.exemplo.com');
    assert.equal(origemDe('nao-e-url', silencioso), 'nao-e-url');
  });
}
