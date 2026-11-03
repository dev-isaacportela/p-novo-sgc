// Dados simulados do SGC 2 — os 5 usuarios da equipe de compras, o quadro
// "Compras" e as 10 fases do motor (regra F-01: mesmos nomes e mesma ordem do
// SGC anterior), mais os dados de cada spec das ondas 1 e 2, um modulo por
// spec em seed/00N-*.mjs — ondas 1, 2 e 3 (personas em SGC_USUARIO_PERSONA so pela 002;
// fornecedores e filiais so pela 001 — R-017; as specs 005-007 so inserem
// linhas suas). Nenhum KB_CAMPO nem card
// aqui: sao dado da 002 (campos do quadro) em diante.
//
// O SCHEMA nao esta aqui (sai de setup-backend.mjs — as 16 tabelas SGC_* — mais
// o schema.mjs da lib e o schema-winthor.mjs das PC* — ver backend/simulator/
// schema.mjs). Geracao deterministica: SEED = 45547, o id do SGC anterior na
// plataforma, herdado de proposito para o seed ficar estavel — nao muda quando
// o p-NNNNN deste projeto nascer.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSchema } from './schema.mjs';
import { seed001 } from './seed/001-fornecedores.mjs';
import { seed002 } from './seed/002-quadro.mjs';
import { seed003 } from './seed/003-itens.mjs';
import { seed004 } from './seed/004-agenda.mjs';
import { seed005 } from './seed/005-notas-fiscais.mjs';
import { seed006 } from './seed/006-transito.mjs';
import { seed007 } from './seed/007-bo.mjs';
import { seed008 } from './seed/008-solicitacoes.mjs';
// A 009 não tem seed: os indicadores leem o que as ondas 1 e 2 e a 008 já
// semearam (R-062), e as quatro linhas de SGC_RELATORIO saíram com
// `/relatorios` (R-114). Os estados de SLA e agenda que os cenários precisam
// são arranjados dentro do próprio teste, em `smoke/009-indicadores.mjs`.
import { seed011 } from './seed/011-compras-inteligentes.mjs';
import { seed013 } from './seed/013-movimentacao.mjs';

const iso = (data) => data.toISOString().slice(0, 19);

// INT_USER na ordem dos ids (1..5).
export const USUARIOS = [
  { nome: 'Admin SGC', email: 'admin@sgc.local', accessLevel: 'ADMIN' },
  { nome: 'Ana Analista', email: 'ana@sgc.local', accessLevel: 'MEMBER' },
  { nome: 'Gil Gestor', email: 'gil@sgc.local', accessLevel: 'MEMBER' },
  { nome: 'Dora Diretora', email: 'dora@sgc.local', accessLevel: 'MEMBER' },
  { nome: 'Leo Comercial', email: 'leo@sgc.local', accessLevel: 'MEMBER' },
];
// Persona (analista/gestor/diretoria/comercial) e dado do SGC (SGC_USUARIO_PERSONA,
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

  /* ── dados de cada spec da onda 1 (stub até a feature chegar — ver backend/simulator/seed/README) ── */
  seed001(db, CENARIO);
  seed002(db, CENARIO);
  seed003(db, CENARIO);
  seed004(db, CENARIO);
  seed005(db, CENARIO);
  seed006(db, CENARIO);
  seed007(db, CENARIO);
  seed008(db, CENARIO);
  // Onda 4: a 012 não tem seed próprio — ela é dona das linhas de
  // SGC_COBERTURA do seed/003-itens.mjs nesta onda (R-096).
  seed011(db, CENARIO);
  // Onda 5 (R-133): movimentação de produtos.
  seed013(db, CENARIO);

  db.close();
  return counts;
}
