// Simulador local do Mitra.
//
// Fala o MESMO protocolo HTTP que o mitra-interactions-sdk usa em producao
// (/interactions/*), entao o frontend nao precisa de codigo especial: basta a
// sessao apontar o baseURL para http://localhost:<PORT>.
//
// O que ele executa NAO e uma reimplementacao: e o SQL e o JavaScript das
// `definitions` dos scripts add-*.mjs, os mesmos que sao publicados no Mitra.
//
// Uso: cd backend && npm run sim

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import {
  DB_PATH, PORT, PROJECT_ID, PROJECT_LABEL, DEFAULT_PASSWORD, HEALTH_TABLE,
  FRONTEND_MAP, MAP_NAMES, MAP_IDS,
} from './config.mjs';
import { seedDatabase } from './seed.mjs';
import { registerMysqlFunctions, toSqlite } from './mysql-dialect.mjs';
import { loadDefinitions, createRunner } from './runtime.mjs';

if (!existsSync(DB_PATH)) {
  console.log('[simulador] banco nao encontrado — gerando dados simulados...');
  seedDatabase(DB_PATH);
}

const db = new DatabaseSync(DB_PATH);
registerMysqlFunctions(db);

const { byName, overridden } = await loadDefinitions();

/* ─────────────── uploads (uploadFilePublicMitra) ─────────────── */

// Arquivos "publicos" do simulador: o envio (spec 007 da lib, anexos do card)
// grava aqui e /uploads/:nome serve de volta. Fora do git (.gitignore da raiz).
const UPLOADS = join(dirname(DB_PATH), '..', 'uploads');
// Sem SVG nem HTML: servidos com o proprio tipo, rodariam script na origem do simulador.
const TIPOS_DE_ARQUIVO = {
  '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
};

/* ─────────────── ids ─────────────── */

// O frontend chama por id. O mapa do frontend e a fonte: assim o simulador
// responde exatamente aos ids que a tela usa, antes e depois de o sync trazer
// os ids reais da plataforma. Sem mapa, os ids seguem a ordem das definicoes.
const byId = new Map();
const mapa = lerMapaDoFrontend();
if (mapa) {
  for (const [chave, id] of Object.entries(mapa.ids)) {
    const definition = byName.get(mapa.nomes[chave]);
    if (definition) byId.set(Number(id), { ...definition, id: Number(id), chave });
  }
} else {
  let proximo = 1;
  for (const definition of byName.values()) byId.set(proximo, { ...definition, id: proximo++ });
}

function lerMapaDoFrontend() {
  if (!existsSync(FRONTEND_MAP)) return null;
  const fonte = readFileSync(FRONTEND_MAP, 'utf8');
  const bloco = (marcador) => {
    // Ancorado no `export const`: o nome solto tambem aparece em comentarios.
    const inicio = fonte.indexOf(`export const ${marcador}`);
    if (inicio === -1) return null;
    const abre = fonte.indexOf('{', inicio);
    const fecha = fonte.indexOf('}', abre);
    return Object.fromEntries(fonte.slice(abre + 1, fecha).split('\n')
      .map((linha) => linha.trim().replace(/,$/, ''))
      .filter((linha) => linha && !linha.startsWith('//'))
      .map((linha) => {
        const [chave, bruto] = linha.split(':').map((parte) => parte.trim());
        return [chave, bruto.replace(/^'|'$/g, '')];
      }));
  };
  const nomes = bloco(MAP_NAMES);
  const ids = bloco(MAP_IDS);
  return nomes && ids ? { nomes, ids } : null;
}

const execute = createRunner(db, { resolveById: (id) => byId.get(id) ?? null });
const idsSemDefinicao = new Set();
const errosPorId = new Map();

/* ─────────────── sessao ─────────────── */

// JWT nao assinado. O SDK so precisa carregar o token; quem identifica o
// usuario aqui e o payload, que o simulador le para resolver :VAR_USER.
function criarToken(user) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = b64({ alg: 'none', typ: 'JWT' });
  const payload = b64({
    sub: user.DESCR, email: user.DESCR, name: user.NOME, userId: user.ID,
    accessLevel: user.ACCESS_LEVEL, projectId: PROJECT_ID,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  });
  return `${header}.${payload}.simulador`;
}

/** Le o userId de dentro do JWT; sem token valido, cai no primeiro usuario. */
function userIdFrom(req) {
  const auth = String(req.headers.authorization || '');
  const payload = auth.replace(/^Bearer\s+/i, '').trim().split('.')[1];
  if (!payload) return 1;
  try {
    return Number(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).userId) || 1;
  } catch {
    return 1;
  }
}

/* ─────────────── util HTTP ─────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-TenantID',
  'Access-Control-Max-Age': '86400',
};

function responder(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(body ?? null));
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    req.on('data', (parte) => partes.push(parte));
    req.on('end', () => {
      const texto = Buffer.concat(partes).toString('utf8');
      if (!texto) return resolve({});
      try { resolve(JSON.parse(texto)); } catch { reject(new Error('Corpo da requisicao nao e JSON valido.')); }
    });
    req.on('error', reject);
  });
}

/* ─────────────── execucao ─────────────── */

async function executarPorId(serverFunctionId, input, userId) {
  const id = Number(serverFunctionId);
  const definition = byId.get(id);

  if (!definition) {
    if (!idsSemDefinicao.has(id)) {
      idsSemDefinicao.add(id);
      console.warn(`[simulador] Server Function ${id} sem definicao — devolvendo lista vazia.`);
    }
    return { output: { rows: [] }, status: 'COMPLETED' };
  }

  try {
    return { output: await execute(definition, input, userId), status: 'COMPLETED' };
  } catch (erro) {
    // O erro real e o produto aqui: e ele que revela SQL quebrado antes de
    // publicar. Fica no log e na resposta, com o status que o SDK entende.
    const mensagem = erro?.message || String(erro);
    errosPorId.set(id, { name: definition.name, erro: mensagem });
    console.error(`[simulador] ${definition.name} (id ${id}) falhou: ${mensagem}`);
    return { output: null, status: 'FAILED', error: `${definition.name}: ${mensagem}` };
  }
}

const envelope = ({ output, status, error }, id) => ({
  result: { executionStatus: status, serverFunctionId: id, output, error },
});

/* ─────────────── rotas ─────────────── */

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const rota = url.pathname.replace(/\/+$/, '') || '/';

  try {
    if (rota === '/health') {
      return responder(res, 200, {
        status: 'ok',
        projeto: PROJECT_LABEL,
        db: DB_PATH,
        projectId: PROJECT_ID,
        [HEALTH_TABLE]: db.prepare(`SELECT COUNT(*) AS n FROM ${HEALTH_TABLE}`).get().n,
        serverFunctions: byId.size,
        definicoesCarregadas: byName.size,
        redefinidas: overridden,
        semDefinicao: [...idsSemDefinicao].sort((a, b) => a - b),
        erros: [...errosPorId.entries()].map(([id, info]) => ({ id, ...info })),
      });
    }

    if (rota === '/auth/login' && req.method === 'POST') {
      const body = await lerCorpo(req);
      const email = String(body?.email || '').trim().toLowerCase();
      const senha = String(body?.password || '');
      const user = db.prepare('SELECT * FROM INT_USER WHERE LOWER(DESCR) = ? AND ATIVO = 1').get(email);

      if (!user || (senha && senha !== DEFAULT_PASSWORD)) {
        return responder(res, 401, { success: false, error: { message: 'Usuario ou senha invalidos no simulador.' } });
      }
      return responder(res, 200, {
        success: true,
        token: criarToken(user),
        backURL: `http://localhost:${PORT}`,
        baseURL: `http://localhost:${PORT}`,
        integrationURL: `http://localhost:${PORT}`,
        user: { id: user.ID, name: user.NOME, email: user.DESCR, accessLevel: user.ACCESS_LEVEL },
        projects: [{ id: PROJECT_ID, name: PROJECT_LABEL }],
      });
    }

    if (rota === '/auth/users' && req.method === 'GET') {
      const users = db.prepare('SELECT ID, NOME, DESCR AS EMAIL, ACCESS_LEVEL FROM INT_USER WHERE ATIVO = 1 ORDER BY ID').all();
      return responder(res, 200, { rows: users.map((linha) => ({ ...linha })), senha: DEFAULT_PASSWORD });
    }

    if ((rota === '/interactions/executeServerFunction' || rota === '/interactions/executeServerFunctionAsync')
        && req.method === 'POST') {
      const body = await lerCorpo(req);
      const id = Number(body?.serverFunctionId);
      return responder(res, 200, envelope(await executarPorId(id, body?.input, userIdFrom(req)), id));
    }

    // Alias usado pelo fallback de mitra-api.ts quando o SDK nao esta configurado.
    if (rota === '/functions/execute' && req.method === 'POST') {
      const body = await lerCorpo(req);
      const id = Number(body?.serverFunctionId);
      const resultado = await executarPorId(id, body?.input, userIdFrom(req));
      return responder(res, 200, { success: resultado.status === 'COMPLETED', data: resultado.output, ...envelope(resultado, id) });
    }

    // uploadFilePublicMitra (anexos do card, spec 007 da lib): multipart com o
    // campo "file"; devolve o endereco servido em /uploads/:nome.
    if (rota === '/interactions/uploadFilePublic' && req.method === 'POST') {
      const partes = [];
      for await (const parte of req) partes.push(parte);
      const pedido = new Request(`http://localhost:${PORT}${rota}`, {
        method: 'POST', headers: { 'content-type': String(req.headers['content-type'] || '') }, body: Buffer.concat(partes),
      });
      const arquivo = (await pedido.formData()).get('file');
      if (!arquivo || typeof arquivo === 'string') return responder(res, 400, { status: 'error', message: 'Envie o arquivo no campo "file".' });
      const nome = `${Date.now()}-${String(arquivo.name || 'arquivo').replace(/[^\w.-]+/g, '_')}`;
      mkdirSync(UPLOADS, { recursive: true });
      writeFileSync(join(UPLOADS, nome), Buffer.from(await arquivo.arrayBuffer()));
      const publicUrl = `http://localhost:${PORT}/uploads/${encodeURIComponent(nome)}`;
      return responder(res, 200, { status: 'ok', result: { fileName: nome, currentPath: 'PUBLIC', publicUrl, message: 'simulado' } });
    }

    const arquivoEnviado = rota.match(/^\/uploads\/([^/]+)$/);
    if (arquivoEnviado && req.method === 'GET') {
      const nome = decodeURIComponent(arquivoEnviado[1]);
      const caminho = join(UPLOADS, nome);
      if (/[\\/]|\.\./.test(nome) || !existsSync(caminho)) return responder(res, 404, { message: 'Arquivo não encontrado no simulador.' });
      res.writeHead(200, { 'Content-Type': TIPOS_DE_ARQUIVO[extname(nome).toLowerCase()] || 'application/octet-stream', ...CORS });
      return res.end(readFileSync(caminho));
    }

    // runQueryMitra / callIntegrationMitra: SQL direto no SQLite, so leitura.
    if ((rota === '/interactions/runQuery' || rota === '/interactions/integrations/call') && req.method === 'POST') {
      const body = await lerCorpo(req);
      const sql = toSqlite(String(body?.sql || body?.query || ''));
      if (!/^\s*(SELECT|WITH)/i.test(sql)) return responder(res, 400, { message: 'Apenas leitura e aceita aqui.' });
      try {
        return responder(res, 200, { rows: db.prepare(sql).all().map((linha) => ({ ...linha })) });
      } catch (erro) {
        console.warn(`[simulador] SQL nao suportado pelo SQLite: ${erro.message}`);
        return responder(res, 200, { rows: [], simulatorSqlError: erro.message });
      }
    }

    // listRecordsMitra (CRUD REST). Em producao responde 403 para usuario
    // business — so existe aqui para telas administrativas de usuario dev.
    const registros = rota.match(/^\/interactions\/records\/([A-Za-z0-9_]+)$/);
    if (registros && req.method === 'GET') {
      const tabela = registros[1];
      const page = Number(url.searchParams.get('page') || 0);
      const size = Number(url.searchParams.get('size') || 50);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get().n;
      const content = db.prepare(`SELECT * FROM ${tabela} LIMIT ? OFFSET ?`).all(size, page * size)
        .map(({ PASSWORD, ...linha }) => ({ ...linha }));
      return responder(res, 200, { content, totalElements: total, page, size });
    }

    return responder(res, 404, {
      message: `Rota nao implementada no simulador: ${req.method} ${rota}`,
      hint: 'Se o app precisa dela, adicione o handler em backend/simulator/server.mjs.',
    });
  } catch (erro) {
    console.error('[simulador] erro:', erro);
    return responder(res, 500, { message: erro?.message || 'Erro interno do simulador.' });
  }
});

server.listen(PORT, () => {
  const users = db.prepare('SELECT DESCR AS EMAIL, ACCESS_LEVEL FROM INT_USER WHERE ATIVO = 1 ORDER BY ID').all();
  console.log('');
  console.log(`  ${PROJECT_LABEL}`);
  console.log(`  Simulador em                    http://localhost:${PORT}`);
  console.log(`  Banco                           ${DB_PATH}`);
  console.log(`  Server Functions por id         ${byId.size}${mapa ? ' (mapa do frontend)' : ' (ordem das definicoes — sem mapa)'}`);
  if (overridden.length) console.log(`  Redefinidas                     ${overridden.map((o) => o.name).join(', ')}`);
  console.log('');
  console.log(`  Logins (senha unica: ${DEFAULT_PASSWORD}):`);
  for (const user of users) console.log(`    ${String(user.EMAIL).padEnd(34)} ${user.ACCESS_LEVEL}`);
  console.log('');
});
