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

/**
 * Aplica `{{param}}` e `:VAR_USER` como o runtime do Mitra faz: por texto.
 *
 * A convencao do projeto (CLAUDE.md) e "string com aspas manuais": o SQL
 * escreve `'{{nome}}'` e o valor entra DENTRO das aspas — e dado, entao aspa
 * no valor e escapada aqui, reproduzindo a ligacao de parametro.
 *
 * `{{x}}` SEM aspas ao redor e outra coisa: numero (`WHERE ID = {{id}}`) ou
 * FRAGMENTO de SQL montado por uma server function JAVASCRIPT — as tuplas de
 * `VALUES {{linhas}}` e as listas de `IN ({{codprods}})`. Esse texto e
 * sintaxe, nao dado: escapa-lo quebraria o fragmento. Quem monta o fragmento e
 * quem escapa (o `texto()` do add-006-itens.mjs dobra a aspa simples).
 */
export function bindParams(sql, input, userId) {
  return String(sql)
    .replace(/:VAR_USER\b/g, String(Number(userId) || 0))
    .replace(/'?\{\{(\w+)\}\}'?/g, (marcador, key) => {
      const entreAspas = marcador.startsWith("'") && marcador.endsWith("'");
      const value = input?.[key];
      // Ausente vira string vazia: as funcoes testam `'{{x}}' = ''` para
      // decidir se o filtro esta ativo.
      const texto = value === undefined || value === null ? '' : String(value);
      if (!entreAspas) return texto;
      return `'${texto.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
    });
}

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

/**
 * @param db            DatabaseSync (node:sqlite) com registerMysqlFunctions aplicado
 * @param resolveById   (id) => definition | null — usado quando uma funcao
 *                      JAVASCRIPT chama outra por `executeServerFunctionMitra`
 * @param onEmail       ({ to, subject, body }) => void — recebe cada e-mail que
 *                      o codigo publicado mandaria. Sem ele, o e-mail so aparece
 *                      no console; com ele, o smoke confere destinatario,
 *                      assunto e CORPO (spec 002, C-032..C-034).
 * @param externo       { aceita(definition), query(sql) } opcional — banco
 *                      EXTERNO para as definitions que `aceita`: o SQL sai
 *                      ligado (bindParams) e literal, sem passar pelo dialeto
 *                      SQLite. E assim que winthor-oracle.mjs leva as sgcWint*
 *                      ao WinThor real; sem ele, tudo roda no SQLite.
 */
export function createRunner(db, { resolveById = () => null, onQuery, onEmail, externo = null } = {}) {
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
      // Chamada aninhada (SF chamando outra SF por id) NAO propaga :VAR_USER
      // com garantia na plataforma real (000/README.md, R-013) — e por isso
      // as "escritas por id" (kbCardCriar em nome de alguem via criadoPor,
      // sgcEsc* internas) recebem o id de quem grava por PARAMETRO explicito,
      // nunca via sessao. userId = 0 aqui reproduz essa perda de sessao: sem
      // isso, uma SF com sessao (ex.: sgcAgendaProcessarManual chamada pela
      // tela) faria kbCardCriar enxergar sessao propria e nunca cair no ramo
      // "origem: sistema" que RF-008 da lib e R-010/R-018 do 000 dependem.
      executeServerFunctionMitra: async ({ serverFunctionId, input: entrada }) => {
        const alvo = resolveById(Number(serverFunctionId));
        if (!alvo) throw new Error(`Server function ${serverFunctionId} nao existe no simulador.`);
        const output = await execute(alvo, entrada || {}, 0);
        return { result: { executionStatus: 'COMPLETED', serverFunctionId, output } };
      },
      sendEmailMitra: async ({ to, subject, body }) => {
        const destinatarios = [].concat(to ?? []);
        if (onEmail) onEmail({ to: destinatarios, subject: String(subject ?? ''), body: String(body ?? '') });
        else console.log(`[simulador] e-mail simulado -> ${destinatarios.join(', ')} | ${subject}`);
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
    if (externo && externo.aceita(definition)) {
      const sql = bindParams(definition.code, input, userId);
      if (onQuery) onQuery(sql, definition.code);
      return { rows: await externo.query(sql) };
    }
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
