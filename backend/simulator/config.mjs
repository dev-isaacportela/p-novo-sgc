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

// O schema e LIDO dos arquivos abaixo: o setup do projeto (as 16 tabelas
// SGC_* da onda 1), o schema.mjs da lib (resolvido pelo pacote instalado em
// node_modules) e as tabelas PC* do WinThor, imitadas so para o simulador
// (nunca no setup-backend.mjs — ver o cabecalho de schema-winthor.mjs).
export const DDL_SOURCES = [
  join(HERE, '..', 'setup-backend.mjs'),
  fileURLToPath(import.meta.resolve('@benenutri/mitra-kanban/backend/schema')),
  join(HERE, 'schema-winthor.mjs'),
];

export const HEALTH_TABLE = 'KB_BOARD';

/* ── server functions ── */

// add-001-kanban.mjs reexporta as definitions da lib com os ids do mapa deste
// projeto. add-002-perfil-acesso.mjs NUNCA entra aqui (ver o cabecalho dele):
// executa no import, lanca sem MITRA_BASE_URL e so faz sentido no sandbox.
//
// Ordem do sandbox (mesma do README da 000): a 001 lê fornecedor/filial do
// WinThor (precisa da conexão JDBC já criada), a 002 lê a 001, a 003 lê a 002
// e a 004 lê a 002 e a 003. add-004..007 ainda são stubs (definitions = []).
export const PUBLISH_ORDER = [
  'add-001-kanban.mjs',
  'add-003-jdbc-winthor.mjs',
  'add-004-fornecedores.mjs',
  'add-005-quadro-compras.mjs',
  'add-006-itens.mjs',
  'add-007-agenda.mjs',
];

export const FRONTEND_MAP = join(HERE, '..', '..', 'frontend', 'src', 'lib', 'server-functions.ts');
export const MAP_NAMES = 'SERVER_FUNCTION_NAMES';
export const MAP_IDS = 'SERVER_FUNCTIONS';

// Uma seção por spec, para o agente da feature preencher com os parâmetros
// que o sim:check precisa para exercitar as SFs SQL de leitura (valor
// desligado: '' no texto, '0' no número — ver CLAUDE.md). Vazia até lá: os
// add-004..007 ainda não publicam SF nenhuma.
export const CHECK_INPUT = {
  busca: '', limite: '20', offset: '0',
  // spec 001 (fornecedores):
  // spec 002 (quadro de compras):
  // spec 003 (itens do pedido):
  codfornec: '1015', codfilial: '1', dataInicio: '2026-08-01', dataFim: '2026-09-14',
  codprods: '5001,5002', codprod: '0', diasValidade: '90', diasEstoque: '80',
  nivel: '', cardId: '1',
  // spec 004 (agenda de análises):
};
