// Schema do simulador, derivado do DDL real dos scripts de backend.
//
// O DDL nao e copiado: e lido dos arquivos em DDL_SOURCES (config.mjs) e
// traduzido de MySQL para SQLite a cada geracao de banco. Assim o simulador
// nao vira uma segunda fonte de verdade que envelhece — mudou a tabela no
// setup, o proximo seed acompanha.

import { readFileSync } from 'node:fs';
import { DDL_SOURCES } from './config.mjs';

/** Tabelas do tenant Mitra, que o setup nao cria porque ja existem la. */
const TENANT_TABLES = [
  // INT_USER e a tabela de usuarios da plataforma: DESCR guarda o e-mail.
  `CREATE TABLE IF NOT EXISTS INT_USER (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    DESCR TEXT NOT NULL,
    NOME TEXT,
    ACCESS_LEVEL TEXT DEFAULT 'MEMBER',
    ATIVO INTEGER DEFAULT 1
  )`,
];

/** Extrai o corpo de cada `CREATE TABLE IF NOT EXISTS ...` em template literal. */
export function readSetupDdl(paths = DDL_SOURCES) {
  const source = paths.map((path) => readFileSync(path, 'utf8')).join('\n');
  const blocks = [];
  const marker = 'CREATE TABLE IF NOT EXISTS ';
  let cursor = 0;

  while (true) {
    const start = source.indexOf(marker, cursor);
    if (start === -1) break;
    // O template literal termina no primeiro backtick apos o CREATE.
    const end = source.indexOf('`', start);
    if (end === -1) break;
    const block = source.slice(start, end).trim().replace(/;\s*$/, '');
    // A frase pode aparecer num comentario: so e DDL se vier nome + parentese.
    if (/^CREATE TABLE IF NOT EXISTS\s+[A-Z0-9_]+\s*\(/i.test(block)) blocks.push(block);
    cursor = end;
  }
  return blocks;
}

/**
 * Traduz um CREATE TABLE do MySQL para SQLite.
 * Devolve { table, ddl, indexes } — indices viram CREATE INDEX separados,
 * porque SQLite nao aceita INDEX inline.
 */
export function translateCreateTable(mysqlDdl) {
  const table = mysqlDdl.match(/CREATE TABLE IF NOT EXISTS\s+([A-Z0-9_]+)/i)?.[1];
  if (!table) throw new Error(`DDL sem nome de tabela: ${mysqlDdl.slice(0, 60)}`);

  const open = mysqlDdl.indexOf('(');
  const close = mysqlDdl.lastIndexOf(')');
  const body = mysqlDdl.slice(open + 1, close);

  const indexes = [];
  const keep = [];

  for (const raw of splitTopLevel(body)) {
    const line = raw.trim().replace(/,$/, '');
    if (!line) continue;

    const indexMatch = line.match(/^(?:UNIQUE\s+)?(?:KEY|INDEX)\s+([A-Z0-9_]+)\s*\(([^)]*)\)$/i);
    if (indexMatch) {
      const unique = /^UNIQUE/i.test(line) ? 'UNIQUE ' : '';
      indexes.push(`CREATE ${unique}INDEX IF NOT EXISTS ${indexMatch[1]} ON ${table} (${indexMatch[2]})`);
      continue;
    }
    if (/^PRIMARY\s+KEY\s*\(/i.test(line) || /^FOREIGN\s+KEY/i.test(line) || /^UNIQUE\s*\(/i.test(line)) {
      keep.push(line);
      continue;
    }
    keep.push(translateColumn(line));
  }

  return { table, ddl: `CREATE TABLE IF NOT EXISTS ${table} (\n  ${keep.join(',\n  ')}\n)`, indexes };
}

function translateColumn(line) {
  let out = line;
  out = out.replace(/\bINT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY\b/i, 'INTEGER PRIMARY KEY AUTOINCREMENT');
  out = out.replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  out = out.replace(/\bLONGTEXT\b|\bMEDIUMTEXT\b/gi, 'TEXT');
  out = out.replace(/\bDECIMAL\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, 'REAL');
  out = out.replace(/\bDOUBLE\b|\bFLOAT\b/gi, 'REAL');
  out = out.replace(/\bBOOLEAN\b/gi, 'INTEGER');
  out = out.replace(/\bDATETIME\b|\bTIMESTAMP\b/gi, 'TEXT');
  out = out.replace(/\bDEFAULT\s+TRUE\b/gi, 'DEFAULT 1');
  out = out.replace(/\bDEFAULT\s+FALSE\b/gi, 'DEFAULT 0');
  out = out.replace(/\bDEFAULT\s+CURRENT_TIMESTAMP(\s*\(\s*\))?/gi, "DEFAULT ''");
  out = out.replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/gi, '');
  // INTEGER simples so depois dos casos compostos, para nao pegar INT de INTEGER.
  out = out.replace(/\bINT\b(?!EGER)/gi, 'INTEGER');
  return out.trim();
}

/** Divide por virgulas de primeiro nivel, ignorando as de dentro de parenteses. */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let buffer = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) { parts.push(buffer); buffer = ''; continue; }
    buffer += char;
  }
  parts.push(buffer);
  return parts;
}

export function createSchema(db) {
  const created = [];
  for (const statement of TENANT_TABLES) {
    db.exec(statement);
    created.push(statement.match(/EXISTS\s+([A-Z0-9_]+)/i)[1]);
  }
  for (const block of readSetupDdl()) {
    const { table, ddl, indexes } = translateCreateTable(block);
    db.exec(ddl);
    for (const index of indexes) {
      // Um indice mal traduzido nao pode impedir o banco de existir.
      try { db.exec(index); } catch { /* indice e otimizacao, nao contrato */ }
    }
    created.push(table);
  }
  return created;
}
