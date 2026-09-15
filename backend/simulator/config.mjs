// Configuracao do simulador local do Mitra — p-novo-sgc (SGC 2, Gestao de Compras).
//
// Unico arquivo do simulador que muda de projeto para projeto.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── identidade ── */

export const PROJECT_LABEL = 'SGC 2 — Gestão de Compras — Simulador local';
// SEED = id do SGC anterior (p-45547), herdado de proposito: o seed fica
// estavel e NAO muda quando o p-NNNNN deste projeto nascer na plataforma.
export const SEED = 45547;

/* ── rede ── */

export const PORT = Number(process.env.SIMULATOR_PORT || 3109);
export const PROJECT_ID = Number(process.env.SIMULATOR_PROJECT_ID || 1);
export const DEFAULT_PASSWORD = process.env.SIMULATOR_PASSWORD || 'mitra123';

/* ── banco ── */

export const DB_PATH = process.env.SIMULATOR_DB_PATH || join(HERE, 'data', 'mitra-sim.db');

// O schema e LIDO dos arquivos abaixo: o setup do projeto (hoje sem tabelas
// proprias) e o schema.mjs da lib, resolvido pelo pacote instalado em node_modules.
export const DDL_SOURCES = [
  join(HERE, '..', 'setup-backend.mjs'),
  fileURLToPath(import.meta.resolve('@benenutri/mitra-kanban/backend/schema')),
];

export const HEALTH_TABLE = 'KB_BOARD';

/* ── server functions ── */

// add-001-kanban.mjs reexporta as definitions da lib com os ids do mapa deste
// projeto. add-002-perfil-acesso.mjs NUNCA entra aqui (ver o cabecalho dele):
// executa no import, lanca sem MITRA_BASE_URL e so faz sentido no sandbox.
//
// Ordem futura da onda 1, por spec (adicionar conforme forem escritos):
//   add-003-jdbc-winthor.mjs, add-004-fornecedores.mjs, add-005-quadro-compras.mjs,
//   add-006-itens.mjs, add-007-agenda.mjs
export const PUBLISH_ORDER = ['add-001-kanban.mjs'];

export const FRONTEND_MAP = join(HERE, '..', '..', 'frontend', 'src', 'lib', 'server-functions.ts');
export const MAP_NAMES = 'SERVER_FUNCTION_NAMES';
export const MAP_IDS = 'SERVER_FUNCTIONS';

export const CHECK_INPUT = { busca: '', limite: '20', offset: '0' };
