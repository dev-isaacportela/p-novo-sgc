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
//   TRUNC(A.COL - B.COL)               -> diferenca em dias entre duas colunas
//                                         de data qualificadas (JULIANDAY)
//   FROM DUAL                          -> removido (reescrita textual)
//   REGEXP_SUBSTR(txt, '[^,]+'|'[^:]+', 1, n) -> n-esimo pedaco (R-064); outra
//                                         forma LANCA, nunca devolve valor
//   REGEXP_LIKE(txt, '^[0-9]+$')       -> 1/0 (R-130); outra forma LANCA
//   TO_CHAR(numero)                    -> texto (R-130)
//   SELECT <x(LEVEL)> FROM DUAL CONNECT BY <x(LEVEL)> IS NOT NULL
//                                      -> WITH RECURSIVE NIVEL(LVL) … (R-064)
//   JSON_UNQUOTE(JSON_EXTRACT(c, '$.k')) -> json_extract(c, '$.k')  (R-071)
//   ON DUPLICATE KEY UPDATE / VALUES(COL)    -> ON CONFLICT DO UPDATE SET / excluded.COL
//                                         (ate o fim da INSTRUCAO, R-079)
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
  if (Number.isNaN(date.getTime())) return null;
  // Date.UTC TRANSBORDA: mes 13 vira janeiro do ano seguinte e dia 45 anda
  // para o mes seguinte. Sem o round-trip dos componentes, '2026-13-45' viraria
  // uma data plausivel e o simulador mentiria (R-064). Componente que nao volta
  // igual = data inexistente.
  const volta = date.getUTCFullYear() === partes.YYYY
    && date.getUTCMonth() + 1 === partes.MM
    && date.getUTCDate() === partes.DD
    && date.getUTCHours() === partes.HH24
    && date.getUTCMinutes() === partes.MI
    && date.getUTCSeconds() === partes.SS;
  return volta ? date : null;
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

  // Lib 1.9.2 (ordem e responsáveis em lote): FIND_IN_SET(x, 'a,b,c') -> posição 1-based, 0 se não achar;
  // SUBSTRING_INDEX(s, sep, n): até a n-ésima ocorrência (n < 0: conta do fim). Iguais ao dialeto da lib.
  def('FIND_IN_SET', 2, (needle, list) => {
    if (needle == null || list == null) return null;
    return String(list).split(',').indexOf(String(needle)) + 1;
  });
  def('SUBSTRING_INDEX', 3, (text, sep, count) => {
    if (text == null || sep == null || count == null) return null;
    const parts = String(text).split(String(sep));
    const n = Math.trunc(Number(count));
    return (n >= 0 ? parts.slice(0, n) : parts.slice(n)).join(String(sep));
  });

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

  // FLOOR depende de flag de compilação do SQLite (SQLITE_ENABLE_MATH_FUNCTIONS),
  // por isso vira função registrada, como o CEIL já é (R-025/R-043).
  def('FLOOR', 1, (value) => (value == null ? null : Math.floor(Number(value))));
  // MOD(a, b) existe em MySQL; no SQLite é o operador `%` — função registrada
  // para os fragmentos de dias úteis (backend/lib/dias-uteis.mjs) poderem usar
  // a mesma sintaxe MySQL nos dois lados. Sinal do resultado segue o dividendo,
  // como o MOD do MySQL.
  def('MOD', 2, (a, b) => {
    if (a == null || b == null || Number(b) === 0) return null;
    return Number(a) % Number(b);
  });

  def('IFNULL', 2, (a, b) => (a == null ? b : a));
  def('LCASE', 1, (value) => (value == null ? null : String(value).toLowerCase()));
  def('UCASE', 1, (value) => (value == null ? null : String(value).toUpperCase()));

  // POWER/SQRT dependem da mesma flag de compilacao do FLOOR
  // (SQLITE_ENABLE_MATH_FUNCTIONS); registradas para o peso por recencia
  // (0,85^dias) e para a volatilidade SQRT(AVG(x²) - AVG(x)²) da spec 011
  // (R-096/R-100). STDDEV_POP e INSTR ficaram FORA de proposito (R-100).
  def('POWER', 2, (base, expoente) => (
    base == null || expoente == null ? null : Math.pow(Number(base), Number(expoente))
  ));
  def('SQRT', 1, (valor) => (valor == null ? null : Math.sqrt(Number(valor))));

  // ADD_MONTHS(data, n) do Oracle: mesmo dia, n meses depois (n negativo
  // volta). Dia que nao existe no mes de destino cai no ultimo dia do mes,
  // como no Oracle (31/03 -1 mes = 28/02).
  def('ADD_MONTHS', 2, (valor, meses) => {
    const texto = valor == null ? '' : String(valor).trim().slice(0, 10);
    const partes = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!partes) return null;
    const ano = Number(partes[1]);
    const mes = Number(partes[2]) - 1 + Number(meses);
    const dia = Number(partes[3]);
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    const data = new Date(Date.UTC(ano, mes, Math.min(dia, ultimo)));
    return data.toISOString().slice(0, 10);
  });

  /* ── Oracle / WinThor (spec 003) ── */

  def('NVL', 2, (a, b) => (a == null ? b : a));

  // TO_DATE(texto, formato) — NULL e '' (marcador de filtro desligado) viram
  // NULL, como o Oracle. Texto que nao casa com o formato, ou mes/dia que nao
  // existe, LANCA (ORA-01861/ORA-01839), como TO_NUMBER e REGEXP_SUBSTR ja
  // fazem (R-064): devolver 1970-01-01 para 'naoedata' ou 2027-02-14 para
  // '2026-13-45' e falso positivo, nao compatibilidade — o rastreio da 008
  // compararia vendas contra uma data que ninguem escreveu.
  def('TO_DATE', 2, (texto, formato) => {
    if (texto == null || String(texto) === '') return null;
    const date = parseOracleDate(texto, formato);
    if (!date) throw new Error(`TO_DATE recebeu um texto que nao e uma data no formato ${formato}: ${texto}`);
    return formatOracle(date, 'YYYY-MM-DD');
  });

  def('TO_CHAR', 2, (valor, formato) => {
    const date = readOracleDate(valor);
    return date ? formatOracle(date, formato) : null;
  });
  // TO_CHAR(numero) — o código de rotina do PCBLOQUEIOEST no COALESCE de texto
  // do sgcWintBloqueiosProduto (R-130): o número vira texto, null fica null.
  def('TO_CHAR', 1, (valor) => (valor == null ? null : String(valor)));

  // REGEXP_LIKE(texto, '^[0-9]+$') — a única forma que os plans usam (R-130:
  // a matrícula do OBSAPLICACAO do PCLOTELOG). Outra forma LANÇA, pelo mesmo
  // motivo do REGEXP_SUBSTR abaixo. Devolve 1/0 (verdadeiro/falso no CASE WHEN).
  def('REGEXP_LIKE', 2, (texto, padrao) => {
    if (String(padrao) !== '^[0-9]+$') {
      throw new Error(`REGEXP_LIKE do simulador so implementa '^[0-9]+$' (recebeu ${padrao}) — ver mysql-dialect.mjs`);
    }
    return texto != null && /^[0-9]+$/.test(String(texto)) ? 1 : 0;
  });

  // TO_NUMBER(texto) — o par de REGEXP_SUBSTR no rastreio da 008 (R-064): o
  // pedaco do par volta como texto e entra numa juncao por CODPROD/CODCLI.
  // Texto que nao e numero LANCA, como o Oracle (ORA-01722), em vez de virar 0:
  // 0 casaria com "sem cliente informado" e o rastreio mentiria.
  def('TO_NUMBER', 1, (valor) => {
    if (valor == null) return null;
    if (typeof valor === 'number') return valor;
    const texto = String(valor).trim();
    if (!NUMERO.test(texto)) throw new Error(`TO_NUMBER recebeu um texto que nao e numero: ${texto}`);
    return Number(texto);
  });

  // REGEXP_SUBSTR(texto, padrao, inicio, ocorrencia) — o explodidor de lista do
  // rastreio da 008 (R-064). So as duas formas que os plans usam ('[^,]+' e
  // '[^:]+', sempre a partir da posicao 1): o n-esimo pedaco separado por
  // virgula ou por dois-pontos, null quando a ocorrencia nao existe (e o que
  // encerra o CONNECT BY). Qualquer outra forma LANCA — shim que devolve valor
  // plausivel para um padrao que ele nao implementa e falso positivo, nao
  // compatibilidade.
  def('REGEXP_SUBSTR', 4, (texto, padrao, inicio, ocorrencia) => {
    const separador = { '[^,]+': ',', '[^:]+': ':' }[String(padrao)];
    if (!separador || Number(inicio) !== 1) {
      throw new Error(`REGEXP_SUBSTR do simulador so implementa '[^,]+' e '[^:]+' a partir da posicao 1 (recebeu ${padrao}, inicio ${inicio}) — ver mysql-dialect.mjs`);
    }
    if (texto == null) return null;
    // [^x]+ casa RUNS nao vazios, como o Oracle: 'a,,b' tem 2 pedacos, nao 3.
    const pedacos = String(texto).match(new RegExp(`[^${separador}]+`, 'g')) ?? [];
    const n = Number(ocorrencia);
    return n >= 1 && n <= pedacos.length ? pedacos[n - 1] : null;
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

/** Acha o `)` que fecha o `(` em `indiceAbre`, ignorando parenteses dentro de
 * aspas — precisa ser um scanner proprio (nao regex) porque o valor do
 * DATE_ADD desta spec costuma ser ele mesmo um literal entre aspas
 * (`DATE_ADD('1970-01-05', INTERVAL (...) DAY)`, R-025), e o
 * `mapOutsideStrings` usado no resto deste arquivo cortaria o texto bem no
 * meio dessa chamada. */
function acharFechamentoForaDeAspas(texto, indiceAbre) {
  let profundidade = 0;
  let aspa = null;
  for (let i = indiceAbre; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspa) {
      if (c === aspa && texto[i + 1] === aspa) { i += 1; continue; }
      if (c === aspa) aspa = null;
      continue;
    }
    if (c === "'" || c === '"') { aspa = c; continue; }
    if (c === '(') profundidade += 1;
    else if (c === ')') {
      profundidade -= 1;
      if (profundidade === 0) return i;
    }
  }
  return -1;
}

/**
 * DATE_ADD(valor, INTERVAL (<expressão>) DAY) -> MITRA_DATE_ADD(valor,
 * (<expressão>), 'DAY'). Só entra quando o intervalo é uma EXPRESSÃO entre
 * parênteses (R-025/R-043 do 000: `somarDiasUteis`/`somarDiasCorridos` de
 * backend/lib/dias-uteis.mjs somam uma coluna, não um literal) — o
 * `INTERVAL <literal> DAY` simples continua coberto pelo regex de
 * DATE_ADD/DATE_SUB de `toSqlite()`, mais abaixo. Roda sobre o SQL INTEIRO
 * (não por chunk) porque precisa achar o `)` que fecha a chamada mesmo quando
 * ela tem um literal de aspas no meio.
 */
function reescreverDateAddComExpressao(sql) {
  const ABERTURA = /\bDATE_(ADD|SUB)\s*\(/gi;
  let saida = '';
  let cursor = 0;
  let m;
  while ((m = ABERTURA.exec(sql))) {
    if (m.index < cursor) continue;
    const abreChamada = ABERTURA.lastIndex - 1;
    const fechaChamada = acharFechamentoForaDeAspas(sql, abreChamada);
    if (fechaChamada === -1) continue;
    const miolo = sql.slice(abreChamada + 1, fechaChamada);
    const casado = miolo.match(/^([\s\S]+?),\s*INTERVAL\s*\(([\s\S]+)\)\s*(DAY|HOUR|MINUTE|SECOND)\s*$/i);
    if (!casado) continue;
    const sinal = m[1].toUpperCase() === 'SUB' ? '-1 * ' : '';
    saida += sql.slice(cursor, m.index);
    saida += `MITRA_DATE_ADD(${casado[1]}, ${sinal}(${casado[2]}), '${casado[3].toUpperCase()}')`;
    cursor = fechaChamada + 1;
    ABERTURA.lastIndex = cursor;
  }
  saida += sql.slice(cursor);
  return saida;
}

/**
 * Upsert: `ON DUPLICATE KEY UPDATE C = VALUES(C)` -> `ON CONFLICT DO UPDATE SET
 * C = excluded.C`. O alvo do conflito e omitido de proposito: o SQLite o
 * dispensa quando o INSERT vem de um SELECT com WHERE, que e a forma de toda
 * escrita guardada daqui.
 *
 * R-079: roda sobre o SQL INTEIRO, e nao por chunk. A troca vale do marcador
 * ate o fim da INSTRUCAO — dentro da clausula so os literais ficam intactos
 * (por isso o `mapOutsideStrings` da cauda). Quando isto vivia dentro do
 * `mapOutsideStrings` de `toSqlite()`, um `'texto'` no meio da clausula (um
 * `CASE WHEN … THEN 'removido' ELSE VALUES(STATUS) END`, por exemplo) cortava o
 * trecho e deixava crus todos os `VALUES()` seguintes — SQL invalido no SQLite.
 */
function reescreverUpsert(sql) {
  const marcador = sql.match(/\bON\s+DUPLICATE\s+KEY\s+UPDATE\b/i);
  if (!marcador) return sql;
  const cabeca = sql.slice(0, marcador.index);
  const clausula = sql.slice(marcador.index + marcador[0].length);
  const trocado = mapOutsideStrings(clausula, (chunk) => (
    chunk.replace(/\bVALUES\s*\(\s*([A-Za-z_][\w]*)\s*\)/gi, 'excluded.$1')
  ));
  return `${cabeca} ON CONFLICT DO UPDATE SET ${trocado}`;
}

/**
 * O gerador de linhas do Oracle (R-064, rastreio da 008):
 * `SELECT <expr(LEVEL)> … FROM DUAL CONNECT BY <expr(LEVEL)> IS NOT NULL`
 * vira uma CTE recursiva de contagem. O teto de 200 cobre o lote de 120 pares
 * com folga e e o que impede a recursao infinita.
 *
 * Roda sobre o SQL INTEIRO e ANTES dos chunks, porque `FROM DUAL` sozinho ja e
 * apagado la embaixo — depois disso nao haveria mais o que reconhecer.
 */
function reescreverGeradorConnectBy(sql) {
  const gerador = sql.match(/\bFROM\s+DUAL\s+CONNECT\s+BY\s+([\s\S]+?)\s+IS\s+NOT\s+NULL/i);
  if (!gerador) return sql;
  const trocado = `${sql.slice(0, gerador.index)}FROM NIVEL WHERE ${gerador[1]} IS NOT NULL${sql.slice(gerador.index + gerador[0].length)}`
    .replace(/\bLEVEL\b/gi, 'LVL');
  const cte = 'WITH RECURSIVE NIVEL(LVL) AS (SELECT 1 UNION ALL SELECT LVL + 1 FROM NIVEL WHERE LVL < 200)';
  // O `WITH PARES AS (…)` que abre a consulta do rastreio e FUNDIDO com a CTE.
  return /^\s*WITH\b/i.test(trocado)
    ? trocado.replace(/^(\s*)WITH\s+(?:RECURSIVE\s+)?/i, `$1${cte}, `)
    : `${cte} ${trocado}`;
}

/**
 * `JSON_UNQUOTE(JSON_EXTRACT(col, '$.k'))` -> `json_extract(col, '$.k')`
 * (R-071): o SQLite ja devolve o escalar sem aspas. Sobre o SQL inteiro porque
 * o caminho `'$.k'` e um literal — por chunk, a chamada sairia partida ao meio.
 */
function reescreverJsonUnquote(sql) {
  return sql.replace(/\bJSON_UNQUOTE\s*\(\s*JSON_EXTRACT\s*\(([^()]*)\)\s*\)/gi, 'json_extract($1)');
}

/**
 * Gerador de calendario do Oracle (spec 011, R-096/R-100/R-113). A consulta de
 * ressuprimento precisa de UMA linha por dia do periodo, inclusive nos dias sem
 * venda — e o denominador do consumo ponderado. No Oracle:
 *
 *   SELECT TO_DATE('{{dataInicio}}', 'YYYY-MM-DD') + (LEVEL - 1) AS DIA,
 *          GREATEST({{diasPeriodo}}, 1) - LEVEL AS DIAS_ATE_FIM
 *   FROM DUAL
 *   CONNECT BY LEVEL <= GREATEST({{diasPeriodo}}, 1)
 *
 * No SQLite, uma CTE recursiva com a MESMA coluna LEVEL (1..N). `CALENDARIO`, e
 * nao `NIVEL`: o gerador de R-064 ja usa `NIVEL(LVL)` e as duas reescritas
 * convivem no mesmo arquivo. So esta forma (`CONNECT BY LEVEL <= …`) e
 * traduzida — a de R-064 (`CONNECT BY <expr> IS NOT NULL`) continua com o dono
 * dela, e qualquer outro `CONNECT BY` segue sem traducao: melhor quebrar alto
 * do que devolver linha plausivel e errada.
 *
 * Roda sobre o SQL INTEIRO, fora do `mapOutsideStrings` (a projecao tem
 * literais de aspas) e antes de `FROM DUAL` ser apagado la embaixo.
 */
function reescreverCalendarioOracle(sql) {
  // O `((?:(?!\bSELECT\b)[\s\S])*?)` impede o casamento de comecar num SELECT
  // anterior e atravessar outras CTEs ate chegar ao FROM DUAL do gerador — o
  // que apagaria meia consulta.
  const ABERTURA = /\bSELECT\b((?:(?!\bSELECT\b)[\s\S])*?)\bFROM\s+DUAL\s+CONNECT\s+BY\s+LEVEL\s*<=\s*/gi;
  let saida = '';
  let cursor = 0;
  let m;
  while ((m = ABERTURA.exec(sql))) {
    if (m.index < cursor) continue;
    const inicioLimite = ABERTURA.lastIndex;
    const fimLimite = fimDoBlocoForaDeAspas(sql, inicioLimite);
    const projecao = comDataDoNivel(m[1].trim().replace(/,\s*$/, ''));
    const limite = sql.slice(inicioLimite, fimLimite).trim();
    saida += sql.slice(cursor, m.index);
    saida += 'WITH RECURSIVE CALENDARIO(LEVEL) AS (\n'
      + `  SELECT 1 UNION ALL SELECT LEVEL + 1 FROM CALENDARIO WHERE LEVEL + 1 <= (${limite})\n`
      + `)\nSELECT ${projecao} FROM CALENDARIO`;
    cursor = fimLimite;
    ABERTURA.lastIndex = cursor;
  }
  return saida + sql.slice(cursor);
}

/**
 * Do inicio da expressao ate o `)` que fecha o bloco que a contem, ignorando
 * aspas. Sem parentese envolvente (o gerador solto, fora de uma CTE), o fim da
 * INSTRUCAO e o fim do bloco — devolver -1 e desistir deixaria o `CONNECT BY`
 * cru chegar ao SQLite, ja sem o `FROM DUAL` que e apagado depois. Nao existe
 * caminho de desistencia.
 */
function fimDoBlocoForaDeAspas(texto, inicio) {
  let profundidade = 0;
  let aspa = null;
  for (let i = inicio; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspa) {
      if (c === aspa && texto[i + 1] === aspa) { i += 1; continue; }
      if (c === aspa) aspa = null;
      continue;
    }
    if (c === "'" || c === '"') { aspa = c; continue; }
    if (c === '(') profundidade += 1;
    else if (c === ')') {
      if (profundidade === 0) return i;
      profundidade -= 1;
    } else if (c === ';' && profundidade === 0) return i;
  }
  return texto.length;
}

/** `TO_DATE(x, f) + (LEVEL - 1)` -> `date(TO_DATE(x, f), '+' || (LEVEL - 1) || ' days')`. */
function comDataDoNivel(projecao) {
  return projecao.replace(
    /\bTO_DATE\s*\(\s*('(?:[^']|'')*')\s*,\s*('(?:[^']|'')*')\s*\)\s*\+\s*\(\s*LEVEL\s*-\s*1\s*\)/gi,
    (_, valor, formato) => `date(TO_DATE(${valor}, ${formato}), '+' || (LEVEL - 1) || ' days')`,
  );
}

/**
 * Reescreve o que nao cabe em funcao escalar. Trabalha so fora de literais de
 * string, para nunca alterar um dado que por acaso pareca SQL — as quatro
 * reescritas acima sao a excecao: elas precisam do SQL inteiro e cuidam dos
 * literais por conta propria.
 */
export function toSqlite(sql) {
  let limiteRownum = null;

  const preparado = reescreverCalendarioOracle(
    reescreverGeradorConnectBy(
      reescreverUpsert(reescreverJsonUnquote(reescreverDateAddComExpressao(String(sql)))),
    ),
  );

  const resultado = mapOutsideStrings(preparado, (chunk) => {
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

    // (o upsert ON DUPLICATE KEY UPDATE virou reescrita de instrucao inteira,
    // em reescreverUpsert() — R-079.)

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

    // TRUNC(A.COL - B.COL) entre duas colunas QUALIFICADAS de data: no Oracle a
    // subtracao de datas ja da dias; no SQLite as duas sao TEXT e o `-` daria
    // zero (spec 005, sgcWintNfParcelas: dias entre emissao e vencimento da
    // duplicata). So a forma `alias.COLUNA - alias.COLUNA` dentro de TRUNC e
    // traduzida — coluna numerica raramente aparece assim, e `TRUNC(numero)`
    // solto continua indo para a funcao escalar registrada.
    out = out.replace(/\bTRUNC\s*\(\s*([A-Za-z_]\w*\.[A-Za-z_]\w*)\s*-\s*([A-Za-z_]\w*\.[A-Za-z_]\w*)\s*\)/gi,
      (_, fim, inicio) => `CAST(JULIANDAY(${fim}) - JULIANDAY(${inicio}) AS INTEGER)`);

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
