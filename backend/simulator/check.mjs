// Executa as server functions SQL de leitura contra o banco simulado e
// reporta o que quebra. Nao precisa do servidor no ar.
//
// E a unica forma, sem publicar no sandbox e abrir a tela, de responder
// "esse SQL roda?". Mutacoes (INSERT/UPDATE/DELETE e JAVASCRIPT) sao puladas
// aqui: a pergunta delas e "o fluxo faz a coisa certa?", e isso e o smoke.mjs
// (assert sobre banco descartavel).
//
// Uso: cd backend && npm run sim:check

import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { DB_PATH, CHECK_INPUT } from './config.mjs';
import { seedDatabase } from './seed.mjs';
import { registerMysqlFunctions } from './mysql-dialect.mjs';
import { loadDefinitions, createRunner } from './runtime.mjs';

if (!existsSync(DB_PATH)) seedDatabase(DB_PATH);

const db = new DatabaseSync(DB_PATH);
registerMysqlFunctions(db);
const { byName, overridden } = await loadDefinitions();
const execute = createRunner(db);

const resultados = [];
for (const [name, definition] of byName) {
  if (definition.type === 'JAVASCRIPT') {
    resultados.push({ name, status: 'pulado', detalhe: 'JAVASCRIPT' });
    continue;
  }
  if (!/^\s*(SELECT|WITH)/i.test(definition.code)) {
    resultados.push({ name, status: 'pulado', detalhe: 'escrita SQL' });
    continue;
  }
  try {
    const { rows } = await execute(definition, CHECK_INPUT, 1);
    resultados.push({ name, status: 'ok', detalhe: `${rows.length} linha(s)` });
  } catch (erro) {
    resultados.push({ name, status: 'FALHOU', detalhe: erro.message });
  }
}

const ok = resultados.filter((r) => r.status === 'ok');
const falhas = resultados.filter((r) => r.status === 'FALHOU');
const pulados = resultados.filter((r) => r.status === 'pulado');

for (const item of falhas) console.log(`  FALHOU  ${item.name}\n          ${item.detalhe}`);
console.log('');
console.log(`  ${ok.length} funcoes SQL executaram, ${falhas.length} falharam, ${pulados.length} puladas (escrita/JAVASCRIPT).`);
const vazias = ok.filter((r) => r.detalhe.startsWith('0 '));
if (vazias.length) console.log(`  ${vazias.length} rodaram sem devolver linha (seed cobre?): ${vazias.map((r) => r.name).join(', ')}`);
if (overridden.length) console.log(`  redefinidas entre scripts: ${overridden.map((o) => `${o.name} (${o.de} -> ${o.para})`).join(', ')}`);
db.close();
process.exitCode = falhas.length ? 1 : 0;
