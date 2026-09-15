// Executor de server function do simulador.
//
// A ideia central esta aqui: NAO existe handler reimplementado em JS. O que
// roda e a MESMA definicao que os `add-*.mjs` publicam no Mitra — o SQL
// literal das funcoes `type: 'SQL'` e o corpo literal das `type: 'JAVASCRIPT'`.
// Um bug de SQL que existe em producao aparece aqui; uma correcao testada aqui
// e a correcao que vai publicada. Se o simulador tivesse handlers proprios,
// ele estaria testando a si mesmo.

import { PUBLISH_ORDER } from './config.mjs';
import { toSqlite } from './mysql-dialect.mjs';

/**
 * Carrega as definicoes reais dos scripts de publicacao.
 * Os scripts chamam configureSdkMitra no topo, entao precisam de env; nada de
 * rede acontece porque a publicacao so roda quando o script e o entrypoint.
 */
export async function loadDefinitions(order = PUBLISH_ORDER) {
  process.env.MITRA_BASE_URL ||= 'http://simulador.local';
  process.env.MITRA_TOKEN ||= 'simulador';
  process.env.MITRA_BASE_URL_INTEGRATIONS ||= 'http://simulador.local';
  process.env.MITRA_PROJECT_ID ||= '1';

  const byName = new Map();
  const overridden = [];
  for (const file of order) {
    const mod = await import(`../${file}`);
    for (const definition of mod.definitions ?? []) {
      if (byName.has(definition.name)) {
        overridden.push({ name: definition.name, de: byName.get(definition.name).file, para: file });
      }
      byName.set(definition.name, { ...definition, file });
    }
  }
  return { byName, overridden };
}

/** Aplica `{{param}}` e `:VAR_USER` como o runtime do Mitra faz: por texto. */
export function bindParams(sql, input, userId) {
  return String(sql)
    .replace(/:VAR_USER\b/g, String(Number(userId) || 0))
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = input?.[key];
      // Ausente vira string vazia: as funcoes testam `'{{x}}' = ''` para
      // decidir se o filtro esta ativo.
      if (value === undefined || value === null) return '';
      // A plataforma LIGA o parametro em vez de concatenar texto, entao aspas
      // no valor sao dado e nao sintaxe. Escapar aqui reproduz isso.
      return String(value).replace(/\\/g, '\\\\').replace(/'/g, "''");
    });
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/**
 * @param db            DatabaseSync (node:sqlite) com registerMysqlFunctions aplicado
 * @param resolveById   (id) => definition | null — usado quando uma funcao
 *                      JAVASCRIPT chama outra por `executeServerFunctionMitra`
 */
export function createRunner(db, { resolveById = () => null, onQuery } = {}) {
  const run = (sql) => {
    const translated = toSqlite(sql);
    if (onQuery) onQuery(translated, sql);
    const statement = db.prepare(translated);
    // SQLite distingue leitura de escrita; `all()` em INSERT lanca.
    return /^\s*(SELECT|WITH)/i.test(translated) ? statement.all() : (statement.run(), []);
  };

  function runSql(definition, input, userId) {
    const rows = run(bindParams(definition.code, input, userId));
    return { rows: rows.map(plain) };
  }

  async function runJavascript(definition, input, userId) {
    // O corpo publicado usa `require('mitra-sdk')`, `event` e `process.env`.
    // Os tres sao servidos por implementacoes locais sobre o SQLite.
    const sdk = {
      runQueryMitra: async ({ sql }) => ({ result: { rows: run(bindParams(sql, input, userId)).map(plain) } }),
      runDmlMitra: async ({ sql }) => { run(bindParams(sql, input, userId)); return { result: { rowsAffected: 1, message: 'ok' } }; },
      runDdlMitra: async ({ sql }) => { run(bindParams(sql, input, userId)); return { result: { message: 'ok' } }; },
      executeServerFunctionMitra: async ({ serverFunctionId, input: entrada }) => {
        const alvo = resolveById(Number(serverFunctionId));
        if (!alvo) throw new Error(`Server function ${serverFunctionId} nao existe no simulador.`);
        const output = await execute(alvo, entrada || {}, userId);
        return { result: { executionStatus: 'COMPLETED', serverFunctionId, output } };
      },
      sendEmailMitra: async ({ to, subject }) => {
        const destinatarios = [].concat(to ?? []);
        console.log(`[simulador] e-mail simulado -> ${destinatarios.join(', ')} | ${subject}`);
        return { result: { message: 'simulado', recipientCount: destinatarios.length } };
      },
    };
    const fake = (name) => {
      if (name === 'mitra-sdk') return sdk;
      throw new Error(`Modulo nao disponivel na server function: ${name}`);
    };
    const body = new AsyncFunction('event', 'require', 'process', definition.code);
    const output = await body(input || {}, fake, { env: { ...process.env } });
    return output ?? { ok: true };
  }

  async function execute(definition, input, userId) {
    if (!definition) return { rows: [], simulatorMissingFunction: true };
    return definition.type === 'JAVASCRIPT'
      ? runJavascript(definition, input, userId)
      : runSql(definition, input, userId);
  }

  return execute;
}

/** node:sqlite devolve objetos com prototipo nulo; JSON.stringify prefere planos. */
function plain(row) {
  return row && typeof row === 'object' ? { ...row } : row;
}
