// Dados simulados do SGC 2 — os 5 usuarios da equipe de compras, o quadro
// "Compras" e as 10 fases da onda 1 (regra F-01: mesmos nomes e mesma ordem
// do SGC anterior). Nenhum campo (KB_CAMPO) e nenhum card ainda: chegam com
// as specs 004+ (campos do pedido) e 005+ (onda de dados).
//
// O SCHEMA nao esta aqui (sai de setup-backend.mjs, hoje sem tabelas proprias,
// mais o schema.mjs da lib — ver backend/simulator/schema.mjs). Geracao
// deterministica: SEED = 45547, o id do SGC anterior na plataforma, herdado
// de proposito para o seed ficar estavel — nao muda quando o p-NNNNN deste
// projeto nascer.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSchema } from './schema.mjs';

const iso = (data) => data.toISOString().slice(0, 19);

// INT_USER na ordem dos ids (1..5).
export const USUARIOS = [
  { nome: 'Admin SGC', email: 'admin@sgc.local', accessLevel: 'ADMIN' },
  { nome: 'Ana Analista', email: 'ana@sgc.local', accessLevel: 'MEMBER' },
  { nome: 'Gil Gestor', email: 'gil@sgc.local', accessLevel: 'MEMBER' },
  { nome: 'Dora Diretora', email: 'dora@sgc.local', accessLevel: 'MEMBER' },
  { nome: 'Leo Leitura', email: 'leo@sgc.local', accessLevel: 'MEMBER' },
];
// Persona (analista/gestor/diretoria/leitura) e dado do SGC (SGC_USUARIO_PERSONA,
// spec 002); nao resolvida, o motor trata como analista. Aqui so o cadastro em INT_USER.

// As 10 fases do quadro de compras, na ordem do funil (onda 1; regra F-01:
// nomes e ordem herdados do SGC anterior). Cor = token da rampa de dados do
// motor (data-1..data-8, ver CORES em @benenutri/mitra-kanban/motor);
// sucesso/cancelado reaproveitam verde/vermelho das fases comuns.
export const FASES = [
  { chave: 'analise', nome: 'Análise/Montagem de Pedido', cor: 'data-1', tipo: 'comum' },
  { chave: 'tecnica', nome: 'Aprovação Técnica', cor: 'data-2', tipo: 'comum' },
  { chave: 'diretoria', nome: 'Aprovação da Diretoria', cor: 'data-3', tipo: 'comum' },
  { chave: 'envio', nome: 'Envio para Indústria', cor: 'data-4', tipo: 'comum' },
  { chave: 'enviado', nome: 'Enviado para Indústria', cor: 'data-5', tipo: 'comum' },
  { chave: 'transito', nome: 'Em Trânsito para BN', cor: 'data-6', tipo: 'comum' },
  { chave: 'faturamento', nome: 'Faturamento em Andamento', cor: 'data-7', tipo: 'comum' },
  { chave: 'bo', nome: 'Produtos em B.O.', cor: 'data-8', tipo: 'comum' },
  { chave: 'concluido', nome: 'Compras Concluídas', cor: 'data-6', tipo: 'sucesso' },
  { chave: 'cancelado', nome: 'Compras Canceladas', cor: 'data-8', tipo: 'cancelado' },
];

// Ids que o seed produz (ordem de insercao) — contrato com as specs 002+. As
// CHAVES de `fases` nao mudam; o `nome` exibido pode ser ajustado pela spec 002.
export const CENARIO = {
  usuarios: { admin: 1, ana: 2, gil: 3, dora: 4, leo: 5 },
  boardCompras: 1,
  fases: Object.fromEntries(FASES.map((fase, indice) => [fase.chave, indice + 1])),
};

export function seedDatabase(dbPath, { reset = false } = {}) {
  if (reset) for (const sufixo of ['', '-wal', '-shm']) rmSync(`${dbPath}${sufixo}`, { force: true });
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  createSchema(db);

  const agora = iso(new Date(`${new Date().toISOString().slice(0, 16)}:00Z`));
  const counts = {};

  /* ── INT_USER ── */
  const inserirUsuario = db.prepare('INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES (?, ?, ?, 1)');
  for (const usuario of USUARIOS) inserirUsuario.run(usuario.email, usuario.nome, usuario.accessLevel);
  counts.INT_USER = USUARIOS.length;

  /* ── KB_META ── */
  db.prepare("INSERT INTO KB_META (CHAVE, VALOR) VALUES ('versao', '0.0.0')").run();

  /* ── quadro Compras (RF onda 1: um quadro so, slug 'compras' — ver frontend/src/lib/quadro.ts) ── */
  db.prepare(`INSERT INTO KB_BOARD (NOME, SLUG, DESCRICAO, ADMINS_IDS, CONFIG_JSON, ATIVO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
    VALUES (?, ?, ?, ?, NULL, 1, ?, ?, ?)`)
    .run('Compras', 'compras', 'Solicitações de compra da Benenutri, da montagem do pedido à conclusão.', '1', CENARIO.usuarios.admin, agora, agora);
  counts.KB_BOARD = 1;

  /* ── fases — nenhum campo obrigatorio de fase (KB_CAMPO fica vazio: campos chegam com specs futuras) ── */
  const inserirFase = db.prepare(`INSERT INTO KB_FASE (BOARD_ID, NOME, COR, DESCRICAO, ORDEM, TIPO, SLA_HORAS, CONDICAO_JSON, CAPA_JSON, ATIVO)
    VALUES (?, ?, ?, NULL, ?, ?, 0, NULL, NULL, 1)`);
  FASES.forEach((fase, indice) => inserirFase.run(CENARIO.boardCompras, fase.nome, fase.cor, indice + 1, fase.tipo));
  counts.KB_FASE = FASES.length;

  db.close();
  return counts;
}
