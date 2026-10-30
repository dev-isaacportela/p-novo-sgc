// Base compartilhada do smoke — banco temporario descartavel (sufixo
// process.pid), runner com resolveById pelos ids de SERVER_FUNCTIONS
// (frontend/src/lib/server-functions.ts), teste() com contagem e saida no
// primeiro erro. Cada backend/simulator/smoke/00N-*.mjs recebe o contexto
// pronto de abrirContexto() e so exporta `suite(ctx)` — nada de handler
// reimplementado (ver runtime.mjs): o que roda e a MESMA definicao SQL/JS que
// os add-*.mjs publicam.

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEED, FRONTEND_MAP } from '../config.mjs';
import { seedDatabase, USUARIOS, CENARIO, FASES } from '../seed.mjs';
import { registerMysqlFunctions } from '../mysql-dialect.mjs';
import { loadDefinitions, createRunner } from '../runtime.mjs';
import { executorSqlite } from '../gestao-custos.mjs';
import { idsDoMapa } from '../../ids-do-mapa.mjs';

export { assert, USUARIOS, CENARIO, FASES, FRONTEND_MAP };

/** Abre um banco novo, carrega as definitions publicadas e devolve o contexto que toda suite usa. */
export async function abrirContexto() {
  const DB = join(tmpdir(), `p-novo-sgc-${SEED}-${process.pid}-smoke.db`);
  rmSync(DB, { force: true });
  seedDatabase(DB, { reset: true });

  const db = new DatabaseSync(DB);
  registerMysqlFunctions(db);
  const { byName, overridden } = await loadDefinitions();

  // As JAVASCRIPT chamam por id (kbCardCriar sem sessao, os ganchos gravados
  // em KB_META, as sgcEsc* internas de cada spec): resolve qualquer nome
  // publicado por id local, pelo mapa INTEIRO deste projeto (ids-do-mapa.mjs
  // — nao so as kbEsc* da lib, que e tudo que lerIdsDoMapa da lib devolve).
  const byId = new Map();
  for (const [nome, id] of Object.entries(idsDoMapa(FRONTEND_MAP))) {
    const definicao = byName.get(nome);
    if (definicao) byId.set(id, definicao);
  }
  // Os e-mails que o codigo publicado mandaria ficam numa lista, em vez de
  // so no console: e assim que o smoke confere destinatario, assunto e corpo
  // das automacoes de fase (spec 002, C-032..C-034).
  const emails = [];
  const execute = createRunner(db, {
    resolveById: (id) => byId.get(id) ?? null,
    onEmail: (email) => emails.push(email),
    // A INTEGRATION gestao-de-custos (sgcCustoUnidadesPorCaixa) roda no SQLite.
    externos: [executorSqlite(db)],
  });

  const U = CENARIO.usuarios;
  const chamar = (nome, input = {}, userId = U.admin) => {
    const definicao = byName.get(nome);
    assert.ok(definicao, `server function ${nome} nao existe em PUBLISH_ORDER`);
    return execute(definicao, input, userId);
  };

  let feitos = 0;
  const teste = async (titulo, fn) => {
    try {
      await fn();
    } catch (erro) {
      console.log(`  FALHOU  ${titulo}\n          ${erro.stack || erro.message}`);
      db.close();
      process.exit(1);
    }
    feitos += 1;
    console.log(`  ok  ${titulo}`);
  };

  return {
    db, byName, overridden, byId, execute, chamar, teste, U, emails,
    contagem: () => feitos,
    fechar: () => db.close(),
  };
}
