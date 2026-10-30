// WinThor REAL no simulador — opcional, so numa maquina com acesso ao Oracle
// do ERP (a VPS liberada no firewall; a maquina local nao chega la).
//
// Por padrao as sgcWint* rodam sobre as PC* imitadas em SQLite
// (schema-winthor.mjs), e e assim que check.mjs e smoke.mjs continuam
// rodando: deterministico e sem rede. Com `SIMULATOR_WINTHOR=oracle` no
// backend/.env, o server.mjs entrega este executor ao createRunner e TODA
// definition `type: 'SQL'` de nome sgcWint* roda o seu SQL Oracle, literal
// (o mesmo que o add-NNN publica com jdbcId), no WinThor real — com as mesmas
// credenciais que add-003-jdbc-winthor.mjs le (WINTHOR_JDBC_URL/USER/PASSWORD).
// As demais definitions (banco do projeto, JAVASCRIPT, INTEGRATION) seguem no
// SQLite; uma JAVASCRIPT que chama uma sgcWint* por id cai aqui tambem.
//
// Nada e escrito no ERP: o executor so aceita SELECT/WITH.
//
// Driver: `oracledb` (devDependency). O usuario do WinThor so tem verificador
// de senha 10G, que o modo thin (JS puro) recusa com NJS-116; por isso o modo
// thick, com o Oracle Instant Client na maquina (registrado no ldconfig ou em
// ORACLE_CLIENT_LIB_DIR). Se o cliente nao carregar, segue em thin e o erro de
// login aparece no console ao subir.

import 'dotenv/config';
import { parseWinthorUrl } from '../add-003-jdbc-winthor.mjs';

export const PREFIXO_WINTHOR = 'sgcWint';

/** So as leituras SQL do ERP saem do SQLite — pelo NOME, como o jdbcId e atribuido na publicacao. */
export function ehWinthor(definition) {
  return definition?.type === 'SQL' && String(definition.name).startsWith(PREFIXO_WINTHOR);
}

/** DATE do Oracle chega como Date; o projeto trafega datas em VARCHAR(10)/(19). */
export function normalizarLinha(row) {
  const saida = {};
  for (const [coluna, valor] of Object.entries(row)) saida[coluna] = valor instanceof Date ? textoDeData(valor) : valor;
  return saida;
}

function textoDeData(d) {
  const p = (n) => String(n).padStart(2, '0');
  const data = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return hora === '00:00:00' ? data : `${data} ${hora}`;
}

/**
 * Abre o pool do WinThor se SIMULATOR_WINTHOR=oracle; senao devolve null e o
 * simulador fica no SQLite. Devolve { descricao, aceita, query, fechar }.
 */
export async function abrirWinthor({ env = process.env, log = console } = {}) {
  if (env.SIMULATOR_WINTHOR !== 'oracle') return null;

  const faltam = ['WINTHOR_JDBC_URL', 'WINTHOR_USER', 'WINTHOR_PASSWORD'].filter((chave) => !env[chave]);
  if (faltam.length) throw new Error(`SIMULATOR_WINTHOR=oracle exige ${faltam.join(', ')} no backend/.env (nunca commitado).`);

  const { host, port, database } = parseWinthorUrl(env.WINTHOR_JDBC_URL);
  const connectString = `${host}:${port}/${database}`;

  const { default: oracledb } = await import('oracledb');
  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];
  try {
    oracledb.initOracleClient(env.ORACLE_CLIENT_LIB_DIR ? { libDir: env.ORACLE_CLIENT_LIB_DIR } : {});
  } catch (erro) {
    log.warn(`[winthor] Instant Client nao carregou (${String(erro.message).split('\n')[0]}); seguindo em modo thin.`);
  }

  const pool = await oracledb.createPool({
    connectString, user: env.WINTHOR_USER, password: env.WINTHOR_PASSWORD,
    poolMin: 0, poolMax: 4, poolIncrement: 1, queueTimeout: 15000,
  });
  // Falha de login ou de rede aparece AQUI, ao subir, e nao na primeira tela.
  const prova = await pool.getConnection();
  const versao = prova.oracleServerVersionString;
  await prova.close();

  const modo = oracledb.thin ? 'thin' : `thick ${oracledb.oracleClientVersionString}`;
  const descricao = `oracle ${versao} em ${connectString} (${modo})`;
  log.log(`[winthor] sgcWint* no WinThor REAL: ${descricao}`);

  return {
    descricao,
    aceita: ehWinthor,
    async query(sql) {
      if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error('O WinThor e somente leitura: o simulador so manda SELECT/WITH ao Oracle.');
      const conexao = await pool.getConnection();
      try {
        const { rows } = await conexao.execute(sql);
        return rows.map(normalizarLinha);
      } finally {
        await conexao.close();
      }
    },
    fechar: () => pool.close(0),
  };
}
