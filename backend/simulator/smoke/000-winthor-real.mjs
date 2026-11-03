// W-001..W-004 — o desvio opcional das sgcWint* para o WinThor real
// (winthor-oracle.mjs), provado SEM rede, com um executor falso: so as
// sgcWint* `type: 'SQL'` saem do SQLite, o SQL chega ao executor com
// {{param}} e :VAR_USER ja ligados e literal (sem dialeto), o resto do
// simulador nao muda, e sem SIMULATOR_WINTHOR=oracle nada disso liga — e por
// isso check.mjs e este smoke continuam deterministicos.

import { createRunner } from '../runtime.mjs';
import { ehWinthor, abrirWinthor, normalizarLinha } from '../winthor-oracle.mjs';
import { assert } from './base.mjs';

export async function suite(ctx) {
  const { db, byName, byId, teste, U } = ctx;

  await teste('W-001: ehWinthor aceita toda sgcWint* type SQL carregada (e ha mais de uma), e recusa qualquer outra definition — JAVASCRIPT, INTEGRATION e as SQL do banco do projeto', async () => {
    const aceitas = [...byName.values()].filter(ehWinthor);
    assert.ok(aceitas.length > 1, 'nenhuma sgcWint* carregada');
    for (const definicao of aceitas) {
      assert.equal(definicao.type, 'SQL');
      assert.ok(definicao.name.startsWith('sgcWint'), `${definicao.name} nao e do WinThor`);
    }
    for (const definicao of byName.values()) {
      if (definicao.name.startsWith('sgcWint')) assert.ok(ehWinthor(definicao), `${definicao.name} ficaria no SQLite`);
      else assert.ok(!ehWinthor(definicao), `${definicao.name} iria ao Oracle`);
    }
    assert.ok(!ehWinthor({ name: 'sgcWintFake', type: 'JAVASCRIPT' }));
    assert.ok(!ehWinthor(null));
  });

  await teste('W-002: com executor externo, sgcWintBuscarProduto sai do SQLite com os {{param}} ligados (aspa dobrada, sem marcador) e devolve as linhas do executor; kbUsuarioSessao continua no SQLite e nao passa por ele', async () => {
    const recebidos = [];
    const externo = {
      aceita: ehWinthor,
      query: async (sql) => { recebidos.push(sql); return [{ CODPROD: 5401, DESCRICAO: 'DO EXECUTOR' }]; },
    };
    const execute = createRunner(db, { resolveById: (id) => byId.get(id) ?? null, externo });

    const { rows } = await execute(byName.get('sgcWintBuscarProduto'), { codprod: 0, busca: "O'BRIEN", codfilial: '1' }, U.admin);
    assert.equal(recebidos.length, 1);
    assert.deepEqual(rows, [{ CODPROD: 5401, DESCRICAO: 'DO EXECUTOR' }]);
    assert.ok(!recebidos[0].includes('{{'), 'ficou {{param}} sem ligar');
    assert.ok(recebidos[0].includes("'O''BRIEN'"), 'a aspa do valor nao foi dobrada');
    assert.ok(recebidos[0].includes("'1'"), 'codfilial nao entrou entre aspas');
    assert.ok(/\bPCPRODUT\b/.test(recebidos[0]), 'o SQL que vai ao Oracle e o da definition');

    const sessao = await execute(byName.get('kbUsuarioSessao'), {}, U.admin);
    assert.equal(sessao.rows.length, 1);
    assert.equal(recebidos.length, 1, 'uma SQL do banco do projeto foi parar no executor externo');
  });

  await teste('W-003: sem SIMULATOR_WINTHOR=oracle abrirWinthor devolve null (check e smoke ficam no SQLite); com a chave e sem as credenciais recusa nomeando o que falta, sem tentar rede', async () => {
    const silencioso = { log() {}, warn() {} };
    assert.equal(await abrirWinthor({ env: {}, log: silencioso }), null);
    assert.equal(await abrirWinthor({ env: { SIMULATOR_WINTHOR: 'sqlite' }, log: silencioso }), null);
    await assert.rejects(
      abrirWinthor({ env: { SIMULATOR_WINTHOR: 'oracle', WINTHOR_JDBC_URL: 'h:1521/X' }, log: silencioso }),
      /WINTHOR_USER, WINTHOR_PASSWORD/,
    );
  });

  await teste('W-004: normalizarLinha devolve DATE do Oracle como texto YYYY-MM-DD (meia-noite) ou YYYY-MM-DD HH:MM:SS, e deixa numero, texto e null como vieram', async () => {
    const linha = normalizarLinha({
      DTMOV: new Date(2026, 0, 5), DTULT: new Date(2026, 11, 31, 7, 8, 9), QT: 12.5, NOME: 'X', NADA: null,
    });
    assert.deepEqual(linha, { DTMOV: '2026-01-05', DTULT: '2026-12-31 07:08:09', QT: 12.5, NOME: 'X', NADA: null });
  });
}
