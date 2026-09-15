// Compatibilidade MySQL -> SQLite, mais shims Oracle para o WinThor (spec 003).
//
// As server functions do projeto sao escritas em MySQL (JDBC 1, banco do
// projeto) e publicadas assim no Mitra. As da spec 003 falam com o WinThor
// por JDBC externo, em Oracle. O simulador executa ESSE MESMO SQL, sem
// reimplementar nada em JS: e a unica forma de o teste local dizer alguma
// coisa sobre o que roda em producao. Aqui ficam as pontas dessa traducao:
//
//   registerMysqlFunctions(db) -> funcoes que o SQLite nao tem, registradas
//                                 como funcao escalar (STR_TO_DATE, FIELD,
//                                 NVL, TO_DATE, TO_CHAR, TRUNC...)
//   toSqlite(sql)              -> reescrita sintatica do que nao cabe em funcao
//                                 escalar (INTERVAL, CAST AS UNSIGNED,
//                                 SYSDATE, FROM DUAL, ROWNUM...)
//
// Tudo que for traduzido tem que preservar o SIGNIFICADO, nunca so evitar o
// erro de sintaxe: um shim que devolve valor plausivel e errado transforma o
// simulador em fonte de falso positivo.
//
// Cobertura Oracle (WinThor):
//   NVL(a, b)                          igual IFNULL
//   TO_DATE(texto, formato)            so DD/MM/YYYY e YYYY-MM-DD; devolve YYYY-MM-DD
//   TO_CHAR(data, formato)             so DD/MM/YYYY e YYYY-MM-DD como formato de saida
//   TRUNC(data)                        data sem hora (YYYY-MM-DD); TRUNC(numero) e Math.trunc
//   SYSDATE                            -> datetime('now') (reescrita textual)
//   SYSDATE +/- N  e  TRUNC(SYSDATE) +/- N   -> N DIAS, nao N unidades numericas
//   <data> - SYSDATE / - TRUNC(SYSDATE)      -> diferenca em dias (JULIANDAY)
//   FROM DUAL                          -> removido (reescrita textual)
//   ON DUPLICATE KEY UPDATE / VALUES(COL)    -> ON CONFLICT DO UPDATE SET / excluded.COL
//   WHERE ROWNUM <= N / AND ROWNUM <= N -> remove a condicao, acrescenta LIMIT N no fim
// ponytail: ROWNUM so cobre a forma solta "<= numero" (sem parenteses, sem
// combinar com OFFSET/paginacao, sem ROWNUM > N); combinacao mais complexa
// nao e traduzida — se aparecer, semeie a tabela e reescreva a consulta, ou
// estenda toSqlite().

const MYSQL_TO_LUXON = [
  ['%Y', 'yyyy'],
  ['%m', 'MM'],
  ['%d', 'dd'],
  ['%H', 'HH'],
  ['%i', 'mm'],
  ['%s', 'ss'],
];

/** '%Y-%m-%dT%H:%i:%s' -> regex nomeada, para ler a data com o formato dado. */
function parseWithFormat(text, format) {
  if (text == null) return null;
  const value = String(text);
  let pattern = '';
  const order = [];
  for (let i = 0; i < format.length; i += 1) {
    if (format[i] === '%' && i + 1 < format.length) {
      const token = format.slice(i, i + 2);
      const known = MYSQL_TO_LUXON.find(([mysql]) => mysql === token);
      if (!known) return null;
      order.push(token);
      pattern += token === '%Y' ? '(\\d{4})' : '(\\d{2})';
      i += 1;
      continue;
    }
    pattern += format[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  const match = value.match(new RegExp(`^${pattern}`));
  if (!match) return null;
  const parts = { '%Y': 1970, '%m': 1, '%d': 1, '%H': 0, '%i': 0, '%s': 0 };
  order.forEach((token, index) => { parts[token] = Number(match[index + 1]); });
  const date = new Date(Date.UTC(parts['%Y'], parts['%m'] - 1, parts['%d'], parts['%H'], parts['%i'], parts['%s']));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date, format) {
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return format
    .replace(/%Y/g, String(date.getUTCFullYear()))
    .replace(/%m/g, pad(date.getUTCMonth() + 1))
    .replace(/%d/g, pad(date.getUTCDate()))
    .replace(/%H/g, pad(date.getUTCHours()))
    .replace(/%i/g, pad(date.getUTCMinutes()))
    .replace(/%s/g, pad(date.getUTCSeconds()));
}

const ISO = '%Y-%m-%dT%H:%i:%s';

/** Le uma data vinda do banco: as colunas do projeto guardam ISO sem timezone. */
function readDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const text = String(value);
  const direct = parseWithFormat(text, ISO);
  if (direct) return direct;
  const dateOnly = parseWithFormat(text, '%Y-%m-%d');
  if (dateOnly) return dateOnly;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const UNIT_MS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
};

/* ─────────────── Oracle (WinThor) ─────────────── */

// Tokens de formato Oracle, do mais longo para o mais curto (HH24 antes de nao
// colidir com nada de 2 letras). So o necessario para data (sem fuso).
const ORACLE_TOKENS = [['YYYY', 4], ['HH24', 2], ['MM', 2], ['DD', 2], ['MI', 2], ['SS', 2]];

/** 'DD/MM/YYYY' ou 'YYYY-MM-DD' (etc.) -> Date (UTC, meia-noite se so data). */
function parseOracleDate(text, format) {
  if (text == null) return null;
  const value = String(text);
  const fmt = String(format || 'YYYY-MM-DD').toUpperCase();
  let pattern = '';
  const order = [];
  let i = 0;
  while (i < fmt.length) {
    const token = ORACLE_TOKENS.find(([nome]) => fmt.startsWith(nome, i));
    if (token) {
      order.push(token[0]);
      pattern += `(\\d{${token[1]}})`;
      i += token[0].length;
      continue;
    }
    pattern += fmt[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  const match = value.match(new RegExp(`^${pattern}`));
  if (!match) return null;
  const partes = { YYYY: 1970, MM: 1, DD: 1, HH24: 0, MI: 0, SS: 0 };
  order.forEach((token, index) => { partes[token] = Number(match[index + 1]); });
  const date = new Date(Date.UTC(partes.YYYY, partes.MM - 1, partes.DD, partes.HH24, partes.MI, partes.SS));
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatOracle(date, format) {
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return String(format || 'YYYY-MM-DD').toUpperCase()
    .replace(/YYYY/g, String(date.getUTCFullYear()))
    .replace(/HH24/g, pad(date.getUTCHours()))
    .replace(/MM/g, pad(date.getUTCMonth() + 1))
    .replace(/DD/g, pad(date.getUTCDate()))
    .replace(/MI/g, pad(date.getUTCMinutes()))
    .replace(/SS/g, pad(date.getUTCSeconds()));
}

/** Le um valor de data que pode vir de TO_DATE ('YYYY-MM-DD') ou de
 * datetime('now') do SQLite ('YYYY-MM-DD HH:MM:SS'). */
function readOracleDate(value) {
  if (value == null) return null;
  const texto = String(value).trim().replace(' ', 'T');
  const somenteData = parseOracleDate(texto.slice(0, 10), 'YYYY-MM-DD');
  if (!somenteData) return null;
  const hora = texto.match(/T(\d{2}):(\d{2}):(\d{2})/);
  if (!hora) return somenteData;
  return new Date(Date.UTC(somenteData.getUTCFullYear(), somenteData.getUTCMonth(), somenteData.getUTCDate(),
    Number(hora[1]), Number(hora[2]), Number(hora[3])));
}

const NUMERO = /^-?\d+(\.\d+)?$/;

export function registerMysqlFunctions(db, { now = () => new Date() } = {}) {
  const def = (name, arity, fn) => db.function(name, { deterministic: false, varargs: arity == null }, fn);

  def('NOW', 0, () => formatDate(now(), ISO));
  def('CURDATE', 0, () => formatDate(now(), '%Y-%m-%d'));

  def('STR_TO_DATE', 2, (text, format) => {
    const date = parseWithFormat(text, String(format ?? ISO));
    // Devolve ISO: comparacao entre dois resultados de STR_TO_DATE continua
    // correta porque ISO e lexicograficamente ordenavel.
    return date ? formatDate(date, ISO) : null;
  });

  def('DATE_FORMAT', 2, (value, format) => {
    const date = readDate(value);
    return date ? formatDate(date, String(format ?? ISO)) : null;
  });

  // DATE_SUB/DATE_ADD chegam aqui ja normalizados por toSqlite(), que troca
  // `INTERVAL 30 DAY` por dois argumentos escalares.
  def('MITRA_DATE_ADD', 3, (value, amount, unit) => {
    const date = readDate(value);
    if (!date) return null;
    const step = UNIT_MS[String(unit).toUpperCase()];
    if (!step) return null;
    return formatDate(new Date(date.getTime() + Number(amount) * step), ISO);
  });

  // DATEDIFF(fim, inicio) -> dias inteiros. O CRM mede atraso com ele.
  def('DATEDIFF', 2, (fim, inicio) => {
    const a = readDate(fim);
    const b = readDate(inicio);
    if (!a || !b) return null;
    // So a parte de data importa: 'ontem 23h' para 'hoje 01h' e 1 dia.
    const dia = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.round((dia(a) - dia(b)) / UNIT_MS.DAY);
  });

  def('TIMESTAMPDIFF', 3, (unit, from, to) => {
    const start = readDate(from);
    const end = readDate(to);
    if (!start || !end) return null;
    const step = UNIT_MS[String(unit).toUpperCase()];
    if (!step) return null;
    return Math.trunc((end.getTime() - start.getTime()) / step);
  });

  // FIELD(x, a, b, c) -> posicao 1-based de x na lista, 0 se nao achar.
  def('FIELD', null, (...args) => {
    const [needle, ...list] = args;
    const target = needle == null ? null : String(needle);
    const index = list.findIndex((item) => (item == null ? null : String(item)) === target);
    return index === -1 ? 0 : index + 1;
  });

  def('CONCAT', null, (...args) => (args.some((a) => a == null) ? null : args.map(String).join('')));

  def('LEAST', null, (...args) => {
    const valid = args.filter((a) => a != null);
    if (valid.length !== args.length) return null;
    return valid.reduce((a, b) => (Number(b) < Number(a) ? b : a));
  });

  def('GREATEST', null, (...args) => {
    const valid = args.filter((a) => a != null);
    if (valid.length !== args.length) return null;
    return valid.reduce((a, b) => (Number(b) > Number(a) ? b : a));
  });

  def('CEIL', 1, (value) => (value == null ? null : Math.ceil(Number(value))));
  def('CEILING', 1, (value) => (value == null ? null : Math.ceil(Number(value))));
  def('IFNULL', 2, (a, b) => (a == null ? b : a));
  def('LCASE', 1, (value) => (value == null ? null : String(value).toLowerCase()));
  def('UCASE', 1, (value) => (value == null ? null : String(value).toUpperCase()));

  /* ── Oracle / WinThor (spec 003) ── */

  def('NVL', 2, (a, b) => (a == null ? b : a));

  def('TO_DATE', 2, (texto, formato) => {
    const date = parseOracleDate(texto, formato);
    return date ? formatOracle(date, 'YYYY-MM-DD') : null;
  });

  def('TO_CHAR', 2, (valor, formato) => {
    const date = readOracleDate(valor);
    return date ? formatOracle(date, formato) : null;
  });

  // TRUNC(data) -> data sem hora; TRUNC(numero) continua numerico (Oracle e
  // polimorfico nos dois sentidos, e o WinThor usa os dois).
  def('TRUNC', 1, (valor) => {
    if (typeof valor === 'number') return Math.trunc(valor);
    if (typeof valor === 'string' && NUMERO.test(valor.trim())) return Math.trunc(Number(valor));
    const date = readOracleDate(valor);
    return date ? formatOracle(date, 'YYYY-MM-DD') : null;
  });
}

/**
 * Reescreve o que nao cabe em funcao escalar. Trabalha so fora de literais de
 * string, para nunca alterar um dado que por acaso pareca SQL.
 */
export function toSqlite(sql) {
  let limiteRownum = null;

  const resultado = mapOutsideStrings(String(sql), (chunk) => {
    let out = chunk;

    // DATE_SUB(x, INTERVAL 30 DAY) -> MITRA_DATE_ADD(x, -30, 'DAY')
    out = out.replace(/\bDATE_SUB\s*\(([^,]+?),\s*INTERVAL\s+(-?\d+)\s+(SECOND|MINUTE|HOUR|DAY)\s*\)/gi,
      (_, value, amount, unit) => `MITRA_DATE_ADD(${value}, ${-Number(amount)}, '${unit.toUpperCase()}')`);
    out = out.replace(/\bDATE_ADD\s*\(([^,]+?),\s*INTERVAL\s+(-?\d+)\s+(SECOND|MINUTE|HOUR|DAY)\s*\)/gi,
      (_, value, amount, unit) => `MITRA_DATE_ADD(${value}, ${Number(amount)}, '${unit.toUpperCase()}')`);

    // TIMESTAMPDIFF(MINUTE, a, b): a unidade e palavra nua no MySQL.
    out = out.replace(/\bTIMESTAMPDIFF\s*\(\s*(SECOND|MINUTE|HOUR|DAY)\s*,/gi,
      (_, unit) => `TIMESTAMPDIFF('${unit.toUpperCase()}',`);

    // CAST(x AS UNSIGNED) -> CAST(x AS INTEGER)
    out = out.replace(/\bAS\s+UNSIGNED\s*\)/gi, 'AS INTEGER)');
    out = out.replace(/\bAS\s+SIGNED\s*\)/gi, 'AS INTEGER)');

    // GROUP_CONCAT(x SEPARATOR 's') -> group_concat(x, 's'). O SQLite tem a
    // mesma agregacao, com o separador como segundo argumento em vez de
    // palavra-chave. O literal do separador nao e tocado: ele fica fora deste
    // trecho, e e por isso que a troca e da palavra, nao da expressao inteira.
    out = out.replace(/\bSEPARATOR\b/gi, ',');

    // SUBSTRING(x, 1, 10) -> substr; SQLite aceita substr, nao SUBSTRING.
    out = out.replace(/\bSUBSTRING\s*\(/gi, 'substr(');

    // Upsert (spec 002, sgcEscPersonaSalvar): INSERT ... ON DUPLICATE KEY
    // UPDATE C = VALUES(C) -> ON CONFLICT DO UPDATE SET C = excluded.C. O alvo
    // do conflito e omitido de proposito: o SQLite o dispensa quando o INSERT
    // vem de um SELECT com WHERE, que e a forma de toda escrita guardada daqui.
    // O VALUES(x) so e trocado DEPOIS do marcador, para nao pegar o VALUES de
    // um INSERT comum.
    out = out.replace(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b([\s\S]*)$/i, (_, atribuicoes) => (
      ` ON CONFLICT DO UPDATE SET ${atribuicoes.replace(/\bVALUES\s*\(\s*([A-Za-z_][\w]*)\s*\)/gi, 'excluded.$1')}`
    ));

    // Booleanos: as colunas viram INTEGER no schema traduzido.
    out = out.replace(/\bIS\s+TRUE\b/gi, '= 1').replace(/\bIS\s+FALSE\b/gi, '= 0');
    out = out.replace(/(?<![.\w])TRUE(?![\w])/gi, '1').replace(/(?<![.\w])FALSE(?![\w])/gi, '0');

    /* ── Oracle / WinThor ── */

    // Aritmetica de data do Oracle, ANTES da troca de SYSDATE: `data + N` soma
    // N DIAS (no SQLite somaria numero), e `dataA - dataB` devolve a diferenca
    // em dias fracionarios. Cobre as duas formas que o WinThor usa nas
    // consultas de lote (spec 003); outra forma nao e traduzida.
    out = out.replace(/\bTRUNC\s*\(\s*SYSDATE\s*\)\s*([+-])\s*(\d+(?:\.\d+)?)/gi,
      (_, sinal, dias) => `date('now', '${sinal}${dias} days')`);
    out = out.replace(/\bSYSDATE\b\s*([+-])\s*(\d+(?:\.\d+)?)/gi,
      (_, sinal, dias) => `datetime('now', '${sinal}${dias} days')`);
    out = out.replace(/([A-Za-z_][\w.]*)\s*-\s*TRUNC\s*\(\s*SYSDATE\s*\)/gi,
      (_, coluna) => `(JULIANDAY(${coluna}) - JULIANDAY('now', 'start of day'))`);
    out = out.replace(/([A-Za-z_][\w.]*)\s*-\s*SYSDATE\b/gi,
      (_, coluna) => `(JULIANDAY(${coluna}) - JULIANDAY('now'))`);

    // SYSDATE -> datetime('now'); FROM DUAL -> nada (SELECT sem FROM e valido no SQLite).
    out = out.replace(/\bSYSDATE\b/gi, "datetime('now')");
    out = out.replace(/\bFROM\s+DUAL\b/gi, '');

    // WHERE ROWNUM <= n / AND ROWNUM <= n (forma simples, ver cabecalho) ->
    // remove a condicao aqui; o LIMIT e acrescentado no fim da query INTEIRA
    // depois que todos os trechos passarem por aqui (por isso o closure).
    out = out.replace(/\b(WHERE|AND)\s+ROWNUM\s*<=\s*(\d+)\b\s*/gi, (_, palavra, n) => {
      limiteRownum = n;
      return palavra.toUpperCase() === 'WHERE' ? '' : '';
    });

    return out;
  });

  return limiteRownum ? `${resultado.replace(/;\s*$/, '').trimEnd()} LIMIT ${limiteRownum}` : resultado;
}

/** Aplica `fn` apenas aos trechos fora de literais 'assim' e "assim". */
function mapOutsideStrings(sql, fn) {
  let out = '';
  let buffer = '';
  let quote = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      out += char;
      // '' e "" escapam a propria aspa dentro do literal.
      if (char === quote && sql[i + 1] === quote) { out += sql[i + 1]; i += 1; continue; }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      out += fn(buffer);
      buffer = '';
      out += char;
      quote = char;
      continue;
    }
    buffer += char;
  }
  return out + fn(buffer);
}
