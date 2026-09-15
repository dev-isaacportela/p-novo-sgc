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
import { ESCRITAS, lerIdsDoMapa } from '@benenutri/mitra-kanban/backend';

export { assert, USUARIOS, CENARIO, FASES, FRONTEND_MAP };

/** Abre um banco novo, carrega as definitions publicadas e devolve o contexto que toda suite usa. */
export async function abrirContexto() {
  const DB = join(tmpdir(), `p-novo-sgc-${SEED}-${process.pid}-smoke.db`);
  rmSync(DB, { force: true });
  seedDatabase(DB, { reset: true });

  const db = new DatabaseSync(DB);
  registerMysqlFunctions(db);
  const { byName, overridden } = await loadDefinitions();

  // As JAVASCRIPT chamam as escritas por id: o id vem do mapa DESTE projeto.
  const byId = new Map();
  for (const [chave, id] of Object.entries(lerIdsDoMapa(FRONTEND_MAP))) {
    const escrita = ESCRITAS.find((e) => e.chave === chave);
    if (escrita) byId.set(id, byName.get(escrita.name));
  }
  const execute = createRunner(db, { resolveById: (id) => byId.get(id) ?? null });

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
    db, byName, overridden, byId, execute, chamar, teste, U,
    contagem: () => feitos,
    fechar: () => db.close(),
  };
}
