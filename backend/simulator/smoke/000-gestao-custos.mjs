// G-001..G-006 — a INTEGRATION gestao-de-custos no simulador (gestao-custos.mjs),
// provada SEM rede: só a definition certa é aceita, os `event.<param>` entram
// por texto e só como número ou lista numérica, só SELECT/WITH passa, o
// executor em SQLite devolve as unidades por caixa da CUSTO_PRODUTOS do seed, e
// o caminho REST `records` (com fetch falso) emula o SELECT da função, pagina,
// usa cache e assume quando o runQuery é recusado.

import { createRunner } from '../runtime.mjs';
import {
  abrirGestaoCustos, codprodsDe, ehGestaoCustos, executorSqlite, montarSql, origemDe, unidadesDeRegistros,
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

  /** Um fetch falso do REST records: PRODUTOS em 2 páginas, com a chamada registrada. */
  function fetchFalso(paginas, status = 200) {
    const chamadas = [];
    const fetch = async (url, opcoes) => {
      chamadas.push({ url: new URL(url), headers: opcoes.headers, method: opcoes.method });
      const pagina = Number(new URL(url).searchParams.get('page'));
      return {
        ok: status === 200,
        status,
        async json() { return { page: pagina, totalPages: paginas.length, content: paginas[pagina] ?? [] }; },
      };
    };
    return { fetch, chamadas };
  }
  const PAGINAS = [
    [{ CODPROD: 5001, UNIDADES_POR_CAIXA: 12, NOME: 'A', $type$: 'PRODUTOS' }, { CODPROD: 5002, NOME: 'sem a coluna', $type$: 'PRODUTOS' }],
    [{ CODPROD: 5003, UNIDADES_POR_CAIXA: 6, $type$: 'PRODUTOS' }, { CODPROD: 'x', UNIDADES_POR_CAIXA: 9 }],
  ];
  const silencioso = { log() {}, warn() {} };

  await teste('G-005: com GESTAO_CUSTOS_CAMINHO=records o adaptador lê GET /interactions/records/PRODUTOS na origem da URL, com Authorization Bearer e X-TenantID do projeto, página a página (size 200); emula o SELECT (COALESCE 1 para quem não tem a coluna, sem o $type$, só o CODPROD pedido), guarda a tabela em cache e repassa HTTP de erro', async () => {
    assert.deepEqual(unidadesDeRegistros(PAGINAS.flat()), [
      { CODPROD: 5001, UNIDADES_POR_CAIXA: 12 }, { CODPROD: 5002, UNIDADES_POR_CAIXA: 1 }, { CODPROD: 5003, UNIDADES_POR_CAIXA: 6 },
    ]);
    const { fetch, chamadas } = fetchFalso(PAGINAS);
    const remoto = await abrirGestaoCustos({
      env: { SIMULATOR_GESTAO_CUSTOS: 'mitra', GESTAO_CUSTOS_BASE_URL: 'http://gestao.local/interactions/records', GESTAO_CUSTOS_TOKEN: 'segredo', GESTAO_CUSTOS_PROJECT_ID: '46967', GESTAO_CUSTOS_CAMINHO: 'records' },
      log: silencioso, fetch,
    });
    assert.equal(remoto.descricao, 'mitra projeto 46967 via records');
    const execute = createRunner(db, { externos: [remoto] });
    const def = byName.get('sgcCustoUnidadesPorCaixa');
    const { rows } = await execute(def, { codprods: '5001,5002,5010' }, U.ana);
    assert.deepEqual(rows, [{ CODPROD: 5001, UNIDADES_POR_CAIXA: 12 }, { CODPROD: 5002, UNIDADES_POR_CAIXA: 1 }]);
    assert.equal(chamadas.length, 2, 'duas páginas, uma chamada cada');
    assert.equal(chamadas[0].url.origin, 'http://gestao.local');
    assert.equal(chamadas[0].url.pathname, '/interactions/records/PRODUTOS');
    assert.deepEqual(chamadas.map((c) => c.url.searchParams.get('page')), ['0', '1']);
    assert.equal(chamadas[0].url.searchParams.get('size'), '200');
    assert.equal(chamadas[0].method, 'GET');
    assert.equal(chamadas[0].headers.Authorization, 'Bearer segredo');
    assert.equal(chamadas[0].headers['X-TenantID'], '46967');
    // Cache: o 5003 ainda não pedido sai da tabela guardada, sem nova chamada.
    const segunda = await execute(def, { codprods: '5003,5001' }, U.ana);
    assert.deepEqual(segunda.rows, [{ CODPROD: 5001, UNIDADES_POR_CAIXA: 12 }, { CODPROD: 5003, UNIDADES_POR_CAIXA: 6 }]);
    assert.equal(chamadas.length, 2);
    assert.deepEqual((await execute(def, { codprods: '' }, U.ana)).rows, []);
    // produtos(): a tabela crua para a checagem, sem $type$ e sem COALESCE.
    const produtos = await remoto.produtos();
    assert.equal(produtos.length, 4);
    assert.deepEqual(produtos[1], { CODPROD: 5002, NOME: 'sem a coluna' });
    const negado = await abrirGestaoCustos({
      env: { SIMULATOR_GESTAO_CUSTOS: 'mitra', GESTAO_CUSTOS_BASE_URL: 'http://gestao.local', GESTAO_CUSTOS_TOKEN: 'segredo', GESTAO_CUSTOS_CAMINHO: 'records' },
      log: silencioso, fetch: fetchFalso(PAGINAS, 403).fetch,
    });
    await assert.rejects(negado.produtos(), /HTTP 403/);
  });

  await teste('G-006: sem GESTAO_CUSTOS_CAMINHO o adaptador tenta runQuery primeiro; recusado (ACCESS_DENIED), avisa uma vez, passa a records e responde pelo REST; com runQuery aceito nunca chama o REST', async () => {
    const avisos = [];
    const { fetch, chamadas } = fetchFalso(PAGINAS);
    const sdkNegado = { async runQuery() { throw new Error('ACCESS_DENIED: not a developer'); } };
    const remoto = await abrirGestaoCustos({
      env: { SIMULATOR_GESTAO_CUSTOS: 'mitra', GESTAO_CUSTOS_BASE_URL: 'http://gestao.local', GESTAO_CUSTOS_TOKEN: 'segredo' },
      log: { log() {}, warn: (m) => avisos.push(m) }, sdk: sdkNegado, fetch,
    });
    assert.equal(remoto.caminho, 'runQuery');
    const def = byName.get('sgcCustoUnidadesPorCaixa');
    const linhas = await remoto.executar(def, { codprods: '5003' });
    assert.deepEqual(linhas, [{ CODPROD: 5003, UNIDADES_POR_CAIXA: 6 }]);
    assert.equal(remoto.caminho, 'records');
    assert.equal(remoto.descricao, 'mitra projeto 46967 via records');
    assert.equal(avisos.length, 1);
    assert.ok(/ACCESS_DENIED/.test(avisos[0]) && /records/.test(avisos[0]), avisos[0]);
    assert.equal(chamadas.length, 2);
    await remoto.executar(def, { codprods: '5001' });
    assert.equal(avisos.length, 1, 'o aviso sai uma vez; depois o caminho ja e records');

    const consultas = [];
    const sdkAceito = { async runQuery({ projectId, sql }) { consultas.push({ projectId, sql }); return { result: { rows: [{ CODPROD: 5001, UNIDADES_POR_CAIXA: 12 }] } }; } };
    const direto = await abrirGestaoCustos({
      env: { SIMULATOR_GESTAO_CUSTOS: 'mitra', GESTAO_CUSTOS_BASE_URL: 'http://gestao.local', GESTAO_CUSTOS_TOKEN: 'segredo' },
      log: silencioso, sdk: sdkAceito, fetch: fetchFalso(PAGINAS).fetch,
    });
    assert.deepEqual(await direto.executar(def, { codprods: '5001' }), [{ CODPROD: 5001, UNIDADES_POR_CAIXA: 12 }]);
    assert.equal(direto.caminho, 'runQuery');
    assert.equal(consultas[0].projectId, 46967);
    assert.ok(/IN \(5001\)/.test(consultas[0].sql), consultas[0].sql);
    assert.equal((await direto.produtos()).length, 1);
    assert.equal(consultas.length, 2);
  });
}
